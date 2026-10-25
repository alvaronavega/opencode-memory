import { test } from "node:test"
import assert from "node:assert/strict"
import { DECISION_MARKERS, looksLikeDecision, extractNote } from "../src/notes.ts"

test("looksLikeDecision detecta marcadores de decisão", () => {
  assert.equal(looksLikeDecision("vamos usar o plugin em vez do MCP"), true)
  assert.equal(looksLikeDecision("Decidimos migrar para o SQLite"), true)
  assert.equal(looksLikeDecision("escolhi a variante low"), true)
})

test("looksLikeDecision ignora perguntas e texto curto", () => {
  assert.equal(looksLikeDecision("o que é isso?"), false)
  assert.equal(looksLikeDecision("oi"), false)
})

test("looksLikeDecision não confunde 'porque' isolado", () => {
  assert.equal(looksLikeDecision("falhou porque faltava o arquivo"), false)
})

test("extractNote devolve a frase com o marcador", () => {
  const note = extractNote("Primeiro, vamos usar o plugin local. Depois ajustamos.")
  assert.ok(note)
  assert.ok(note!.includes("vamos usar o plugin local"))
  assert.ok(note!.length <= 300)
})

test("extractNote devolve undefined sem marcador", () => {
  assert.equal(extractNote("apenas um texto qualquer"), undefined)
})

test("DECISION_MARKERS é uma lista não vazia e em minúsculas", () => {
  assert.ok(DECISION_MARKERS.length > 0)
  for (const marker of DECISION_MARKERS) assert.equal(marker, marker.toLowerCase())
})
