import { test } from "node:test"
import assert from "node:assert/strict"
import { buildRecall, estimateTokens } from "../src/recall.ts"

const turno = (ts: string, text: string) => ({ ts, kind: "turno" as const, text })
const nota = (ts: string, text: string) => ({ ts, kind: "nota" as const, text })

test("recall inclui notas antes das atividades", () => {
  const out = buildRecall({
    project: "proj",
    path: "/w/proj",
    entries: [nota("2026-10-25T10:00:00Z", "decidimos usar plugin"), turno("2026-10-25T11:00:00Z", "arrumei o login")],
    context: "Node 22",
    maxInject: 15,
  })
  assert.ok(out.indexOf("decidimos usar plugin") < out.indexOf("arrumei o login"))
})

test("recall respeita maxInject", () => {
  const entries = Array.from({ length: 50 }, (_, i) => turno(`t${i}`, `e${i}`))
  const out = buildRecall({ project: "p", path: "/p", entries, context: "", maxInject: 5 })
  assert.ok((out.match(/^- /gm) || []).length <= 20)
  assert.ok(out.includes("e49"))
  assert.ok(!out.includes("e0\n"))
})

test("recall nunca ultrapassa o orçamento", () => {
  const entries = Array.from({ length: 500 }, (_, i) => turno(`t${i}`, "x".repeat(400)))
  const out = buildRecall({ project: "p", path: "/p", entries, context: "c".repeat(2000), maxInject: 15 })
  assert.ok(estimateTokens(out) <= 800)
})

test("recall traz o cabeçalho com projeto e caminho", () => {
  const out = buildRecall({ project: "proj", path: "/w/proj", entries: [], context: "", maxInject: 15 })
  assert.ok(out.startsWith('<project-memory project="proj" path="/w/proj">'))
  assert.ok(out.includes("</project-memory>"))
})

test("recall inclui o contexto do sistema quando existe", () => {
  const out = buildRecall({ project: "p", path: "/p", entries: [], context: "Node 22 instalado", maxInject: 15 })
  assert.ok(out.includes("Node 22 instalado"))
})

test("recall sem memória nenhuma ainda é um bloco válido", () => {
  const out = buildRecall({ project: "p", path: "/p", entries: [], context: "", maxInject: 15 })
  assert.ok(out.includes("memory_note"))
})

test("estimateTokens estima 4 caracteres por token", () => {
  assert.equal(estimateTokens("abcd"), 1)
  assert.equal(estimateTokens("abcde"), 2)
  assert.equal(estimateTokens(""), 0)
})
