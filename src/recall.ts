import type { MemoryEntry } from "./memory-file.ts"

export interface RecallInput {
  project: string
  path: string
  entries: MemoryEntry[]
  context: string
  maxInject: number
}

/** Teto de tokens do bloco injetado no system prompt. */
export const RECALL_TOKEN_BUDGET = 800
/** Máximo de notas/decisões no bloco. */
export const MAX_NOTES = 10

/** Estimativa grosseira de tokens (4 caracteres por token). */
export function estimateTokens(text: string): number {
  return Math.ceil(String(text ?? "").length / 4)
}

function line(entry: MemoryEntry): string {
  return `- ${entry.ts} — ${entry.text}`
}

function render(input: RecallInput, notes: MemoryEntry[], activities: MemoryEntry[], context: string): string {
  const last = input.entries.length > 0 ? input.entries[input.entries.length - 1].ts : "nenhuma"
  const out: string[] = []
  out.push(`<project-memory project="${input.project}" path="${input.path}">`)
  out.push(`Memória do projeto (${input.entries.length} entradas, última em ${last}).`)
  if (notes.length > 0) {
    out.push("")
    out.push("Notas e decisões:")
    for (const note of notes) out.push(line(note))
  }
  if (activities.length > 0) {
    out.push("")
    out.push("Atividades recentes:")
    for (const activity of activities) out.push(line(activity))
  }
  if (context.trim()) {
    out.push("")
    out.push("Contexto do sistema:")
    out.push(context.trim())
  }
  out.push("")
  out.push("Se algo novo e não-óbvio for decidido, registre com a tool memoria.memory_note.")
  out.push("Para o histórico completo, leia MEMORY.md.")
  out.push("</project-memory>")
  return out.join("\n")
}

/**
 * Monta o bloco `<project-memory>` que vai para o system prompt.
 * Notas vêm antes das atividades; o bloco é sempre cortado para caber no orçamento.
 */
export function buildRecall(input: RecallInput): string {
  const notes = input.entries.filter((entry) => entry.kind !== "turno").slice(-MAX_NOTES)
  let activities = input.entries.filter((entry) => entry.kind === "turno").slice(-Math.max(0, input.maxInject))
  let context = input.context ?? ""

  let block = render(input, notes, activities, context)

  // Corta atividades (mais antigas primeiro) até caber no orçamento.
  while (estimateTokens(block) > RECALL_TOKEN_BUDGET && activities.length > 0) {
    activities = activities.slice(1)
    block = render(input, notes, activities, context)
  }
  // Ainda assim: corta o contexto.
  while (estimateTokens(block) > RECALL_TOKEN_BUDGET && context.length > 0) {
    context = context.slice(0, Math.floor(context.length / 2))
    block = render(input, notes, activities, context)
  }
  // Rede de segurança: corta o texto na fronteira de linha.
  if (estimateTokens(block) > RECALL_TOKEN_BUDGET) {
    const limit = RECALL_TOKEN_BUDGET * 4
    const cut = block.slice(0, limit)
    const lastNewline = cut.lastIndexOf("\n")
    block = (lastNewline > 0 ? cut.slice(0, lastNewline) : cut) + "\n</project-memory>"
  }
  return block
}
