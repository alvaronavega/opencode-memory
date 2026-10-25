import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import {
  appendEntries,
  buildMemoryFile,
  parseMemoryFile,
  trimEntries,
  type MemoryEntry,
} from "./memory-file.ts"

/** Acima disso, o arquivo é considerado grande demais para ser reescrito com segurança. */
export const MAX_MEMORY_BYTES = 512 * 1024

/**
 * Lê o MEMORY.md (texto puro). Devolve "" se não existir.
 * Arquivos maiores que `maxBytes` são lidos só em parte: o começo (cabeçalho) e a
 * cauda (entradas mais recentes). Um MEMORY.md de 50 MB não entra inteiro na memória.
 */
export function readMemoryText(memoryFile: string, maxBytes = MAX_MEMORY_BYTES): string {
  try {
    const stat = statSync(memoryFile)
    if (stat.size <= maxBytes) return readFileSync(memoryFile, "utf8")

    const headBytes = Math.min(8192, maxBytes)
    const tailBytes = Math.max(0, maxBytes - headBytes)
    const fd = openSync(memoryFile, "r")
    try {
      const head = Buffer.alloc(headBytes)
      readSync(fd, head, 0, headBytes, 0)
      const tail = Buffer.alloc(tailBytes)
      if (tailBytes > 0) readSync(fd, tail, 0, tailBytes, stat.size - tailBytes)
      return `${head.toString("utf8")}\n${tail.toString("utf8")}`
    } finally {
      closeSync(fd)
    }
  } catch {
    return ""
  }
}

/** Tamanho do arquivo em bytes (0 se não existir). */
export function memorySize(memoryFile: string): number {
  try {
    return statSync(memoryFile).size
  } catch {
    return 0
  }
}

/** Escrita atômica: grava num .tmp e renomeia (duas instâncias não corrompem o arquivo). */
export function writeMemoryAtomic(memoryFile: string, content: string): void {
  mkdirSync(dirname(memoryFile), { recursive: true })
  const tmp = `${memoryFile}.tmp`
  writeFileSync(tmp, content, "utf8")
  renameSync(tmp, memoryFile)
}

/** Garante que o MEMORY.md existe (sem sobrescrever o que já existe). */
export function ensureMemoryFile(memoryFile: string, project: string): boolean {
  if (existsSync(memoryFile)) return false
  writeMemoryAtomic(memoryFile, buildMemoryFile(project, [], ""))
  return true
}

/**
 * Acrescenta entradas ao MEMORY.md e aplica o limite de entradas.
 * Devolve quantas entradas foram efetivamente gravadas (0 = nada gravado).
 */
export function appendToMemory(
  memoryFile: string,
  project: string,
  entries: MemoryEntry[],
  maxEntries: number,
): number {
  if (entries.length === 0) return 0
  const size = memorySize(memoryFile)
  if (size > MAX_MEMORY_BYTES) return 0
  const current = existsSync(memoryFile) ? readMemoryText(memoryFile) : buildMemoryFile(project, [], "")
  const withEntries = appendEntries(current, entries)
  if (withEntries === current) return 0
  const { content } = trimEntries(withEntries, maxEntries)
  writeMemoryAtomic(memoryFile, content)
  return entries.length
}

/** Lê as entradas do MEMORY.md. */
export function readEntries(memoryFile: string): MemoryEntry[] {
  return parseMemoryFile(readMemoryText(memoryFile)).entries
}
