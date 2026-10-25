import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseMemoryFile,
  formatEntry,
  buildMemoryFile,
  appendEntries,
  trimEntries,
  upsertContext,
  sliceTail,
  MEMORY_MARKER,
} from "../src/memory-file.ts"

const entrada = (ts: string, text: string, files?: string[], commands?: string[]) => ({
  ts,
  kind: "turno" as const,
  text,
  files,
  commands,
})

test("round-trip: build -> parse devolve as mesmas entradas", () => {
  const entries = [
    entrada("2026-10-25T14:32:00Z", "criar plugin", ["src/memory.ts"], ["npm test (ok)"]),
    entrada("2026-10-25T14:40:00Z", "vamos usar plugin"),
  ]
  const file = buildMemoryFile("proj", entries, "Node 22 instalado")
  const parsed = parseMemoryFile(file)
  assert.equal(parsed.entries.length, 2)
  assert.equal(parsed.entries[0].kind, "turno")
  assert.equal(parsed.entries[0].text, "criar plugin")
  assert.deepEqual(parsed.entries[0].files, ["src/memory.ts"])
  assert.deepEqual(parsed.entries[0].commands, ["npm test (ok)"])
  assert.equal(parsed.entries[1].kind, "turno")
  assert.equal(parsed.context.trim(), "Node 22 instalado")
})

test("o arquivo contém o marcador de versão", () => {
  assert.ok(buildMemoryFile("proj", [], "").includes(MEMORY_MARKER))
})

test("append é idempotente: mesmo arquivo, mesmo resultado", () => {
  const a = appendEntries(buildMemoryFile("proj", [], ""), [entrada("t1", "x")])
  const b = appendEntries(a, [])
  assert.equal(a, b)
})

test("append não duplica a mesma entrada", () => {
  const base = buildMemoryFile("proj", [], "")
  const once = appendEntries(base, [entrada("t1", "mesma")])
  const twice = appendEntries(once, [entrada("t1", "mesma")])
  assert.equal(parseMemoryFile(twice).entries.length, 1)
})

test("arquivo editado à mão não quebra o parse", () => {
  const bagunçado = "# Memória do projeto: proj\n\ntexto solto sem formato\n"
  const parsed = parseMemoryFile(bagunçado)
  assert.deepEqual(parsed.entries, [])
  assert.ok(parsed.header.includes("Memória do projeto"))
})

test("linha malformada no Registro é preservada no rewrite", () => {
  const base = buildMemoryFile("proj", [], "")
  const comLixo = base.replace("## Registro", "## Registro\n- isso nao tem timestamp")
  const comEntrada = appendEntries(comLixo, [entrada("t1", "x")])
  const parsed = parseMemoryFile(comEntrada)
  assert.ok(parsed.loose.some((l) => l.includes("isso nao tem timestamp")))
  assert.equal(parsed.entries.length, 1)
})

test("trim mantém as últimas N e devolve as removidas", () => {
  const many = Array.from({ length: 10 }, (_, i) => entrada(`t${i}`, `e${i}`))
  const r = trimEntries(buildMemoryFile("p", many, ""), 3)
  assert.equal(r.removed.length, 7)
  assert.equal(parseMemoryFile(r.content).entries.length, 3)
  assert.equal(parseMemoryFile(r.content).entries[2].text, "e9")
})

test("upsertContext substitui o bloco de contexto", () => {
  const base = buildMemoryFile("p", [], "antigo")
  const novo = upsertContext(base, "novo contexto")
  assert.equal(parseMemoryFile(novo).context.trim(), "novo contexto")
  assert.ok(!novo.includes("antigo"))
})

test("sliceTail corta o começo e devolve a cauda", () => {
  const grande = "x".repeat(1000) + "FIM"
  const tail = sliceTail(grande, 100)
  assert.ok(tail.endsWith("FIM"))
  assert.ok(tail.length <= 100)
})

test("sliceTail devolve tudo quando o arquivo é pequeno", () => {
  assert.equal(sliceTail("curto", 100), "curto")
})

test("formatEntry sanitiza texto com aspas e quebra de linha", () => {
  const line = formatEntry(entrada("t1", 'disse "oi"\nde novo', ["a.ts"]))
  assert.ok(line.startsWith("- [t1] turno — "))
  assert.ok(!line.includes("\n"))
  assert.ok(line.includes("arquivos: a.ts"))
})

// --- C1: nada do que o usuário escreveu à mão pode ser apagado no rewrite ---

const MANUALO = [
  "# Memória do projeto: proj",
  "",
  "<!-- opencode-memory:v1 -->",
  "",
  "NOTA MANUAL DO USUARIO: leia isto antes de mexer",
  "",
  "## Registro",
  "",
  "## Decisoes",
  "",
  "- 2026-10-01: usamos X em vez de Y",
  "",
  "## Contexto do sistema",
  "- Node 22",
  "",
  "## Rodape",
  "",
  "nota final do arquivo",
  "",
].join("\n")

test("append preserva o texto manual escrito acima do Registro", () => {
  const out = appendEntries(MANUALO, [entrada("t1", "novo turno")])
  assert.ok(out.includes("NOTA MANUAL DO USUARIO"), "o texto manual acima do Registro sumiu")
})

test("append preserva seções desconhecidas entre Registro e Contexto", () => {
  const out = appendEntries(MANUALO, [entrada("t1", "novo turno")])
  assert.ok(out.includes("## Decisoes"), "a seção extra sumiu")
  assert.ok(out.includes("usamos X em vez de Y"), "o conteúdo da seção extra sumiu")
})

test("append preserva o conteúdo depois da seção de contexto", () => {
  const out = appendEntries(MANUALO, [entrada("t1", "novo turno")])
  assert.ok(out.includes("## Rodape"), "o rodapé sumiu")
  assert.ok(out.includes("nota final do arquivo"))
})

test("append preserva o contexto do sistema", () => {
  const out = appendEntries(MANUALO, [entrada("t1", "novo turno")])
  assert.ok(out.includes("- Node 22"))
})

test("append ainda registra a entrada nova no meio do arquivo manual", () => {
  const out = appendEntries(MANUALO, [entrada("t1", "novo turno")])
  const parsed = parseMemoryFile(out)
  assert.equal(parsed.entries.length, 1)
  assert.equal(parsed.entries[0].text, "novo turno")
})

test("trimEntries preserva o texto manual e as seções extras", () => {
  const many = Array.from({ length: 10 }, (_, i) => entrada(`t${i}`, `e${i}`))
  const base = appendEntries(MANUALO, many)
  const r = trimEntries(base, 3)
  assert.ok(r.content.includes("NOTA MANUAL DO USUARIO"))
  assert.ok(r.content.includes("## Decisoes"))
  assert.ok(r.content.includes("## Rodape"))
  assert.equal(parseMemoryFile(r.content).entries.length, 3)
})

test("upsertContext preserva o texto manual e as seções extras", () => {
  const out = upsertContext(MANUALO, "novo contexto")
  assert.ok(out.includes("NOTA MANUAL DO USUARIO"))
  assert.ok(out.includes("## Decisoes"))
  assert.ok(out.includes("## Rodape"))
  assert.ok(out.includes("novo contexto"))
})
