import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { registerMemoryNote, MEMORY_NOTE_TOOL } from "../src/tool.ts"
import { fakeCtx, tempProject, cleanup } from "./helpers.ts"
import { writeProjectConfig, readProjectConfig } from "../src/config.ts"

const findTool = (calls: any[]) => calls.find((c) => c && c.name === MEMORY_NOTE_TOOL)

test("registerMemoryNote registra a tool memory_note", async () => {
  const calls: any[] = []
  await registerMemoryNote(fakeCtx(tempProject(), calls))
  const tool = findTool(calls)
  assert.ok(tool, "a tool deve ser registrada")
  assert.equal(tool.input.required[0], "texto")
})

test("a tool grava a nota no MEMORY.md", async () => {
  const dir = tempProject()
  const calls: any[] = []
  await registerMemoryNote(fakeCtx(dir, calls))
  const tool = findTool(calls)
  const out = await tool.execute({ texto: "decidimos usar o plugin local" }, {})
  assert.ok(out.content.toLowerCase().includes("registrado"))
  assert.ok(existsSync(join(dir, "MEMORY.md")))
  const content = readFileSync(join(dir, "MEMORY.md"), "utf8")
  assert.ok(content.includes("decidimos usar o plugin local"))
  assert.ok(content.includes("nota"))
  cleanup(dir)
})

test("a tool aceita o tipo decisao", async () => {
  const dir = tempProject()
  const calls: any[] = []
  await registerMemoryNote(fakeCtx(dir, calls))
  const tool = findTool(calls)
  await tool.execute({ texto: "trocar para SQLite", tipo: "decisao" }, {})
  const content = readFileSync(join(dir, "MEMORY.md"), "utf8")
  assert.ok(content.includes("decisao"))
  cleanup(dir)
})

test("a tool não grava texto vazio", async () => {
  const dir = tempProject()
  const calls: any[] = []
  await registerMemoryNote(fakeCtx(dir, calls))
  const tool = findTool(calls)
  const out = await tool.execute({ texto: "   " }, {})
  assert.ok(out.content.toLowerCase().includes("vazio"))
  cleanup(dir)
})

test("a tool não grava quando a memória está desativada", async () => {
  const dir = tempProject()
  const calls: any[] = []
  await registerMemoryNote(fakeCtx(dir, calls))
  const tool = findTool(calls)
  await tool.execute({ texto: "qualquer coisa" }, {})
  writeProjectConfig(join(dir, ".opencode", "memory.json"), { ...readProjectConfig(join(dir, ".opencode", "memory.json")), enabled: false })
  const out = await tool.execute({ texto: "não deveria gravar" }, {})
  assert.ok(out.content.toLowerCase().includes("desativada"))
  const content = readFileSync(join(dir, "MEMORY.md"), "utf8")
  assert.ok(!content.includes("não deveria gravar"))
  cleanup(dir)
})
