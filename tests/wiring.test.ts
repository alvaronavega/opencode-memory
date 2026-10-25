import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { setup, decideRole } from "../src/wiring.ts"
import { fakeCtx, tempProject, tempDir, cleanup } from "./helpers.ts"

const contextEvent = (sessionID: string, messages: any[] = []) => ({
  sessionID,
  model: { id: "m", providerID: "p", variant: "default" },
  system: [] as { type: string; text: string }[],
  messages,
  options: {},
  agent: "build",
  tools: {},
})

test("pasta com kit local = worker, sem kit = supervisor", () => {
  assert.equal(decideRole("/w/p", true), "worker")
  assert.equal(decideRole("/w/p", false), "supervisor")
})

test("setup como supervisor cria os arquivos da memória em pasta de projeto", async () => {
  const dir = tempProject()
  const calls: any[] = []
  await setup(fakeCtx(dir, calls))
  assert.ok(existsSync(join(dir, "MEMORY.md")))
  assert.ok(existsSync(join(dir, ".opencode", "memory.json")))
  cleanup(dir)
})

test("setup como supervisor instala o kit local na pasta", async () => {
  const dir = tempProject()
  const calls: any[] = []
  await setup(fakeCtx(dir, calls))
  assert.ok(existsSync(join(dir, ".opencode", "plugins", "opencode-memory", "index.ts")))
  cleanup(dir)
})

test("setup injeta o recall uma vez por sessão", async () => {
  const dir = tempProject()
  const hooks: { name: string; handler: (...args: any[]) => any }[] = []
  const calls: any[] = []
  await setup(fakeCtx(dir, calls, { hooks }))
  const hook = hooks.find((h) => h.name === "context")
  assert.ok(hook, "o hook context deve ser registrado")

  const first = contextEvent("ses_1")
  await hook!.handler(first)
  assert.equal(first.system.length, 1)
  assert.ok(first.system[0].text.includes("<project-memory"))

  const second = contextEvent("ses_1")
  await hook!.handler(second)
  assert.equal(second.system.length, 0, "a segunda chamada da mesma sessão não injeta de novo")
})

test("uma sessão nova injeta de novo", async () => {
  const dir = tempProject()
  const hooks: { name: string; handler: (...args: any[]) => any }[] = []
  const calls: any[] = []
  await setup(fakeCtx(dir, calls, { hooks }))
  const hook = hooks.find((h) => h.name === "context")!
  const a = contextEvent("ses_1")
  await hook.handler(a)
  const b = contextEvent("ses_2")
  await hook.handler(b)
  assert.equal(b.system.length, 1)
  cleanup(dir)
})

test("setup nunca cria memória na home", async () => {
  const dir = join(homedir(), "..", "..")
  const calls: any[] = []
  await setup(fakeCtx(dir, calls))
  assert.equal(existsSync(join(dir, "MEMORY.md")), false)
})

test("sessão em subpasta usa a memória da raiz do projeto", async () => {
  const base = tempProject()
  const sub = join(base, "src", "app")
  mkdirSync(sub, { recursive: true })
  const calls: any[] = []
  await setup(fakeCtx(sub, calls))
  assert.ok(existsSync(join(base, "MEMORY.md")))
  assert.equal(existsSync(join(sub, "MEMORY.md")), false)
  cleanup(base)
})

test("pasta sem sinal de projeto não recebe memória", async () => {
  const dir = tempDir()
  const calls: any[] = []
  await setup(fakeCtx(dir, calls))
  assert.equal(existsSync(join(dir, "MEMORY.md")), false)
  cleanup(dir)
})

test("setup registra o comando /mem e a tool memory_note", async () => {
  const dir = tempProject()
  const calls: any[] = []
  await setup(fakeCtx(dir, calls))
  assert.ok(calls.find((c) => c && c.name === "mem"))
  assert.ok(calls.find((c) => c && c.name === "memory_note"))
  cleanup(dir)
})

test("o recall injetado mostra o MEMORY.md da pasta", async () => {
  const dir = tempProject()
  const hooks: { name: string; handler: (...args: any[]) => any }[] = []
  const calls: any[] = []
  await setup(fakeCtx(dir, calls, { hooks }))
  writeFileSync(join(dir, "MEMORY.md"), "# Memória do projeto: p\n\n<!-- opencode-memory:v1 -->\n\n## Registro\n- [2026-10-25T10:00:00Z] nota — \"decidimos usar o plugin\"\n\n## Contexto do sistema\n", "utf8")
  const hook = hooks.find((h) => h.name === "context")!
  const event = contextEvent("ses_recall")
  await hook.handler(event)
  assert.ok(event.system[0].text.includes("decidimos usar o plugin"))
  cleanup(dir)
})
