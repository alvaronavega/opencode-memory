export type MemoryKind = "turno" | "nota" | "decisao" | "pendencia"

export interface MemoryEntry {
  ts: string
  kind: MemoryKind
  text: string
  files?: string[]
  commands?: string[]
}

export interface ParsedMemory {
  /** Nome do projeto, lido do cabeçalho ("# Memória do projeto: X"). */
  project: string
  /** Texto antes da seção "## Registro" (título, marcador e texto livre do usuário). */
  header: string
  /** Entradas reconhecidas, na ordem em que aparecem. */
  entries: MemoryEntry[]
  /** Linhas da seção "## Registro" que não seguem o formato (preservadas no rewrite). */
  loose: string[]
  /** Corpo da seção "## Contexto do sistema". */
  context: string
}

export const MEMORY_MARKER = "<!-- opencode-memory:v1 -->"
export const REGISTRO_HEADING = "## Registro"
export const CONTEXT_HEADING = "## Contexto do sistema"

const ENTRY_PATTERN = /^-\s*\[([^\]]+)\]\s*(turno|nota|decisao|pendencia)\s*—\s*(.*)$/

/** Limpa um texto para caber em uma linha: sem quebras, sem aspas duplas, espaços colapsados. */
export function sanitizeText(text: string, maxLen = 300): string {
  const flat = String(text ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim()
  return flat.length > maxLen ? flat.slice(0, maxLen - 1) + "…" : flat
}

/** Uma entrada vira uma linha do log. */
export function formatEntry(entry: MemoryEntry): string {
  let line = `- [${entry.ts}] ${entry.kind} — "${sanitizeText(entry.text)}"`
  if (entry.files && entry.files.length > 0) {
    line += ` | arquivos: ${entry.files.map((f) => sanitizeText(f, 120)).join(", ")}`
  }
  if (entry.commands && entry.commands.length > 0) {
    line += ` | comandos: ${entry.commands.map((c) => sanitizeText(c, 120)).join(", ")}`
  }
  return line
}

function parseEntryLine(line: string): MemoryEntry | undefined {
  const match = ENTRY_PATTERN.exec(line.trim())
  if (!match) return undefined
  const [, ts, kind, rest] = match
  let text = rest
  let files: string[] | undefined
  let commands: string[] | undefined
  const filesMatch = /\s*\|\s*arquivos:\s*(.*?)(?=\s*\|\s*comandos:|$)/.exec(rest)
  if (filesMatch) {
    text = text.slice(0, filesMatch.index)
    files = filesMatch[1]
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean)
  }
  const commandsMatch = /\s*\|\s*comandos:\s*(.*)$/.exec(rest)
  if (commandsMatch) {
    text = text.slice(0, commandsMatch.index)
    commands = commandsMatch[1]
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
  }
  const entry: MemoryEntry = {
    ts: ts.trim(),
    kind: kind as MemoryKind,
    text: text.replace(/^"|"$/g, "").trim(),
  }
  if (files && files.length > 0) entry.files = files
  if (commands && commands.length > 0) entry.commands = commands
  return entry
}

function sectionBody(content: string, heading: string): { before: string; body: string } | undefined {
  const index = content.indexOf(heading)
  if (index === -1) return undefined
  const before = content.slice(0, index)
  const after = content.slice(index + heading.length)
  const nextHeading = after.search(/\n##\s/)
  const body = nextHeading === -1 ? after : after.slice(0, nextHeading)
  return { before, body }
}

/** Lê o arquivo de memória sem nunca lançar: texto fora do formato vira `loose`. */
export function parseMemoryFile(content: string): ParsedMemory {
  const text = String(content ?? "")
  const registro = sectionBody(text, REGISTRO_HEADING)
  const contexto = sectionBody(text, CONTEXT_HEADING)

  const header = registro ? registro.before : contexto ? contexto.before : text
  const entries: MemoryEntry[] = []
  const loose: string[] = []

  if (registro) {
    for (const line of registro.body.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const entry = parseEntryLine(trimmed)
      if (entry) entries.push(entry)
      else loose.push(trimmed)
    }
  }

  let context = ""
  if (contexto) {
    context = contexto.body
      .split("\n")
      .filter((line) => line.trim() !== "")
      .join("\n")
  }

  const projectMatch = /^#\s*Memória do projeto:\s*(.*)$/m.exec(header)
  const project = projectMatch ? projectMatch[1].trim() : "projeto"

  return { project, header, entries, loose, context }
}

/** Monta o arquivo completo a partir das partes. */
export function buildMemoryFile(project: string, entries: MemoryEntry[], context: string, loose: string[] = []): string {
  const lines: string[] = []
  lines.push(`# Memória do projeto: ${project}`)
  lines.push("")
  lines.push(MEMORY_MARKER)
  lines.push("")
  lines.push(REGISTRO_HEADING)
  for (const line of loose) lines.push(line)
  for (const entry of entries) lines.push(formatEntry(entry))
  lines.push("")
  lines.push(CONTEXT_HEADING)
  if (context.trim()) lines.push(context.trim())
  lines.push("")
  return lines.join("\n")
}

/** Acrescenta entradas ao final do log, sem duplicar e preservando o que o usuário escreveu à mão. */
export function appendEntries(content: string, entries: MemoryEntry[]): string {
  if (!entries || entries.length === 0) return content
  const parsed = parseMemoryFile(content)
  const existing = new Set(parsed.entries.map((entry) => formatEntry(entry)))
  const fresh = entries.filter((entry) => !existing.has(formatEntry(entry)))
  if (fresh.length === 0) return content
  return buildMemoryFile(
    parsed.project,
    [...parsed.entries, ...fresh],
    parsed.context,
    parsed.loose,
  )
}

/** Mantém no máximo `max` entradas; devolve as removidas. */
export function trimEntries(content: string, max: number): { content: string; removed: MemoryEntry[] } {
  const parsed = parseMemoryFile(content)
  if (parsed.entries.length <= max) return { content, removed: [] }
  const removed = parsed.entries.slice(0, parsed.entries.length - max)
  const kept = parsed.entries.slice(parsed.entries.length - max)
  return {
    content: buildMemoryFile(parsed.project, kept, parsed.context, parsed.loose),
    removed,
  }
}

/** Substitui o bloco "## Contexto do sistema". */
export function upsertContext(content: string, context: string): string {
  const parsed = parseMemoryFile(content)
  return buildMemoryFile(parsed.project, parsed.entries, context, parsed.loose)
}

/** Cauda do arquivo (evita ler megabytes em memória). */
export function sliceTail(content: string, maxChars: number): string {
  const text = String(content ?? "")
  if (text.length <= maxChars) return text
  const tail = text.slice(text.length - maxChars)
  const newline = tail.indexOf("\n")
  return newline === -1 ? tail : tail.slice(newline + 1)
}
