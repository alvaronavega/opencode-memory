import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
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

/** Lê o MEMORY.md (texto puro). Devolve "" se não existir. */
export function readMemoryText(memoryFile: string): string {
  try {
    return readFileSync(memoryFile, "utf8")
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
