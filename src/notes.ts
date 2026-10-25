/**
 * Marcadores que indicam uma decisão do usuário.
 * "porque" ficou de fora de propósito: aparece em qualquer frase de erro e geraria
 * memória ruidosa. Para registrar um motivo, use a tool `memory_note`.
 */
export const DECISION_MARKERS: readonly string[] = [
  "decidimos",
  "decidido",
  "decidi",
  "vamos usar",
  "vou usar",
  "passa a usar",
  "escolhi",
  "escolhido",
  "adotar",
  "adotado",
  "em vez de",
  "passa a ser",
]

const MIN_LENGTH = 8
const MAX_NOTE = 300

function sentences(text: string): string[] {
  return String(text ?? "")
    .split(/(?<=[.!?;\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** O texto parece conter uma decisão? */
export function looksLikeDecision(text: string): boolean {
  const value = String(text ?? "").trim().toLowerCase()
  if (value.length < MIN_LENGTH) return false
  return DECISION_MARKERS.some((marker) => value.includes(marker))
}

/** A primeira frase com marcador de decisão, ou undefined. */
export function extractNote(text: string): string | undefined {
  if (!looksLikeDecision(text)) return undefined
  for (const sentence of sentences(text)) {
    const lower = sentence.toLowerCase()
    if (DECISION_MARKERS.some((marker) => lower.includes(marker))) {
      return sentence.length > MAX_NOTE ? sentence.slice(0, MAX_NOTE - 1) + "…" : sentence
    }
  }
  return undefined
}
