import type { MemoryEntry } from "./memory-file.ts"

export interface TurnFacts {
  /** Último prompt do usuário (sem aspas extras do OpenCode). */
  prompt: string
  /** Arquivos tocados (read/write/edit/patch), deduplicados. */
  files: string[]
  /** Comandos executados, com status: "cmd (ok)" / "cmd (erro)". */
  commands: string[]
  /** Título da sessão, se conhecido. */
  title?: string
}

interface RawPart {
  type?: string
  text?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
  result?: unknown
}

interface RawMessage {
  role?: string
  content?: RawPart[]
}

const FILE_TOOLS = new Set(["read", "write", "edit", "patch", "multiedit"])
const COMMAND_TOOLS = new Set(["shell", "bash", "execute", "run", "powershell"])

/** Remove as aspas duplas que o OpenCode às vezes coloca em volta do texto do prompt. */
export function unquote(text: string): string {
  const trimmed = String(text ?? "").trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed === "string") return parsed
    } catch {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

function partText(result: unknown): string {
  if (typeof result === "string") return result
  if (result && typeof result === "object") {
    const value = (result as any).value
    if (typeof value === "string") return value
    if (Array.isArray(value)) {
      return value
        .map((item: any) => (typeof item === "string" ? item : (item?.text ?? "")))
        .join("\n")
    }
    if (typeof (result as any).text === "string") return (result as any).text
  }
  return ""
}

function looksLikeError(text: string): boolean {
  return /exited with code [1-9]|error|erro|failed|exception/i.test(text)
}

/**
 * Torna o caminho relativo à raiz do projeto quando ele está dentro dela.
 * A memória não deve carregar caminhos absolutos da máquina (a pasta é portátil).
 */
export function relativizePath(path: string, root?: string): string {
  const raw = String(path ?? "")
  if (!root || !raw) return raw
  const normalizedRoot = root.replace(/[\\/]+$/, "")
  if (!normalizedRoot) return raw
  const lowerRoot = normalizedRoot.toLowerCase()
  const lowerRaw = raw.toLowerCase()
  if (lowerRaw === lowerRoot) return raw
  if (!lowerRaw.startsWith(lowerRoot + "\\") && !lowerRaw.startsWith(lowerRoot + "/")) return raw
  return raw.slice(normalizedRoot.length).replace(/^[\\/]+/, "")
}

/**
 * Extrai os fatos de um turno a partir do transcript do OpenCode.
 * Formato do transcript: `{ messages: [{ role, content: [partes] }] }`.
 *
 * `root` (opcional) é a raiz do projeto: caminhos de arquivo dentro dela são
 * gravados relativos ao projeto.
 */
export function factsFromTranscript(transcript: unknown, root?: string): TurnFacts {
  const facts: TurnFacts = { prompt: "", files: [], commands: [] }
  const messages = (transcript as { messages?: RawMessage[] })?.messages
  if (!Array.isArray(messages)) return facts

  const files: string[] = []
  const commands: string[] = []
  const resultsByCall = new Map<string, string>()

  for (const message of messages) {
    const parts = Array.isArray(message?.content) ? message.content : []
    for (const part of parts) {
      if (!part) continue
      if (part.type === "tool-result" && part.id) {
        resultsByCall.set(part.id, partText(part.result))
      }
    }
  }

  for (const message of messages) {
    const parts = Array.isArray(message?.content) ? message.content : []
    for (const part of parts) {
      if (!part) continue
      if (part.type === "text" && message.role === "user") {
        const text = unquote(part.text ?? "")
        if (text) facts.prompt = text
      }
      if (part.type !== "tool-call") continue
      const input = part.input ?? {}
      const name = (part.name ?? "").toLowerCase()
      if (FILE_TOOLS.has(name)) {
        const path = (input.path ?? input.filePath ?? input.file) as string | undefined
        if (typeof path === "string" && path) files.push(relativizePath(path, root))
      }
      if (COMMAND_TOOLS.has(name)) {
        const command = (input.command ?? input.cmd ?? input.script) as string | undefined
        if (typeof command === "string" && command) {
          const result = part.id ? resultsByCall.get(part.id) ?? "" : ""
          commands.push(`${command} (${looksLikeError(result) ? "erro" : "ok"})`)
        }
      }
    }
  }

  facts.files = [...new Set(files)]
  facts.commands = [...new Set(commands)]
  return facts
}

/** Transforma os fatos do turno em uma entrada de memória. */
export function summarizeFacts(facts: TurnFacts, now: string, maxLen = 200): MemoryEntry {
  const text = String(facts.prompt ?? "").trim()
  const entry: MemoryEntry = {
    ts: now,
    kind: "turno",
    text: text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text,
  }
  if (facts.files.length > 0) entry.files = [...facts.files].sort()
  if (facts.commands.length > 0) entry.commands = facts.commands
  return entry
}
