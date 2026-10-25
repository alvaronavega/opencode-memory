import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { dirname, join } from "node:path"
import {
  appendEntries,
  buildMemoryFile,
  formatEntry,
  parseMemoryFile,
  trimEntries,
  type MemoryEntry,
} from "./memory-file.ts"

/** Acima disso, o arquivo é considerado grande demais para ser reescrito com segurança. */
export const MAX_MEMORY_BYTES = 512 * 1024

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Lê o MEMORY.md (texto puro). Devolve "" se não existir. */
export function readMemoryText(memoryFile: string, maxBytes = MAX_MEMORY_BYTES): string {
  try {
    const stat = statSync(memoryFile)
    if (stat.size <= maxBytes) return readFileSync(memoryFile, "utf8")

    // Arquivo grande: lê só o começo (cabeçalho) e a cauda (entradas recentes).
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

/** Caminho temporário único por escritor (dois processos não disputam o mesmo .tmp). */
function tmpPath(memoryFile: string): string {
  return `${memoryFile}.${process.pid}.${randomUUID()}.tmp`
}

/** Escrita atômica: grava num .tmp exclusivo e renomeia. */
export function writeMemoryAtomic(memoryFile: string, content: string): void {
  mkdirSync(dirname(memoryFile), { recursive: true })
  const tmp = tmpPath(memoryFile)
  try {
    writeFileSync(tmp, content, "utf8")
    renameSync(tmp, memoryFile)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {}
    throw error
  }
}

/**
 * Serializa o read-modify-write com um arquivo de lock.
 * Sem ele, dois processos que abrem o mesmo MEMORY.md perdem a entrada um do outro.
 */
export async function withLock<T>(target: string, fn: () => T | Promise<T>): Promise<T> {
  const lock = `${target}.lock`
  let acquired = false
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      closeSync(openSync(lock, "wx"))
      acquired = true
      break
    } catch {
      await sleep(25)
    }
  }
  try {
    return await fn()
  } finally {
    if (acquired) {
      try {
        unlinkSync(lock)
      } catch {}
    }
  }
}

/** Garante que o MEMORY.md existe (sem sobrescrever o que já existe). */
export function ensureMemoryFile(memoryFile: string, project: string): boolean {
  if (existsSync(memoryFile)) return false
  writeMemoryAtomic(memoryFile, buildMemoryFile(project, [], ""))
  return true
}

/** Move as entradas que saíram do limite para o arquivo de arquivo do projeto. */
export function archiveEntries(memoryFile: string, removed: MemoryEntry[]): string | undefined {
  if (removed.length === 0) return undefined
  const archiveFile = join(dirname(memoryFile), "MEMORY-arquivo.md")
  const existing = existsSync(archiveFile) ? readMemoryText(archiveFile) : "# Arquivo da memória do projeto\n"
  const base = existing.trimEnd()
  const lines = removed.map((entry) => formatEntry(entry))
  writeFileSync(archiveFile, `${base}\n${lines.join("\n")}\n`, "utf8")
  return archiveFile
}

/**
 * Acrescenta entradas ao MEMORY.md e aplica o limite de entradas.
 * Devolve quantas entradas foram efetivamente gravadas (0 = nada gravado).
 */
export async function appendToMemory(
  memoryFile: string,
  project: string,
  entries: MemoryEntry[],
  maxEntries: number,
): Promise<number> {
  if (entries.length === 0) return 0
  return withLock(memoryFile, () => {
    const size = memorySize(memoryFile)
    if (size > MAX_MEMORY_BYTES) return 0
    const current = existsSync(memoryFile) ? readMemoryText(memoryFile) : buildMemoryFile(project, [], "")
    const withEntries = appendEntries(current, entries)
    if (withEntries === current) return 0
    const { content, removed } = trimEntries(withEntries, maxEntries)
    writeMemoryAtomic(memoryFile, content)
    archiveEntries(memoryFile, removed)
    return entries.length
  })
}

/** Lê as entradas do MEMORY.md. */
export function readEntries(memoryFile: string): MemoryEntry[] {
  return parseMemoryFile(readMemoryText(memoryFile)).entries
}
