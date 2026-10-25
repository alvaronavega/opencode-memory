import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readMemoryText, MAX_MEMORY_BYTES } from "../src/store.ts"
import { parseMemoryFile } from "../src/memory-file.ts"

test("readMemoryText lê o arquivo inteiro quando ele é pequeno", () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-mem-store-"))
  const file = join(dir, "MEMORY.md")
  writeFileSync(file, "# Memória do projeto: p\n\n## Registro\n- [t1] nota — \"x\"\n", "utf8")
  const content = readMemoryText(file)
  assert.ok(content.includes("Memória do projeto"))
  assert.equal(parseMemoryFile(content).entries.length, 1)
})

test("readMemoryText NÃO carrega um MEMORY.md gigante inteiro", () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-mem-store-"))
  const file = join(dir, "MEMORY.md")
  const head = "# Memória do projeto: p\n\n<!-- opencode-memory:v1 -->\n\n## Registro\n"
  const many = Array.from({ length: 60000 }, (_, i) => `- [t${i}] nota — "entrada numero ${i} ${"x".repeat(40)}"`).join("\n")
  writeFileSync(file, head + many + "\n\n## Contexto do sistema\n", "utf8")
  const size = statSync(file).size
  assert.ok(size > MAX_MEMORY_BYTES, "o arquivo de teste precisa ser maior que o limite")

  const content = readMemoryText(file)
  assert.ok(content.length <= MAX_MEMORY_BYTES + 1024, `leu ${content.length} chars, o limite é ${MAX_MEMORY_BYTES}`)
  assert.ok(content.includes("Memória do projeto"), "o cabeçalho continua acessível")
  assert.ok(content.includes("entrada numero 59999"), "as entradas mais recentes continuam acessíveis")
})

test("readMemoryText devolve string vazio se o arquivo não existir", () => {
  assert.equal(readMemoryText(join(tmpdir(), "nao-existe-opencode-mem", "MEMORY.md")), "")
})
