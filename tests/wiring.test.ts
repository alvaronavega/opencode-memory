import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { setup, decideRole } from "../src/wiring.ts"
import { registerMemCommand } from "../src/command.ts"
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

// --- C2: sessão em subpasta do projeto precisa receber a memória do projeto ---

test("sessão em subpasta recebe o recall do projeto", async () => {
  const base = tempProject()
  const sub = join(base, "src", "app")
  mkdirSync(sub, { recursive: true })
  const hooks: { name: string; handler: (...args: any[]) => any }[] = []
  const calls: any[] = []
  await setup(fakeCtx(sub, calls, { hooks, session: { location: { directory: sub } } }))
  const hook = hooks.find((h) => h.name === "context")!
  const event = contextEvent("ses_subpasta")
  await hook.handler(event)
  assert.equal(event.system.length, 1, "a sessão em subpasta ficou sem recall")
  assert.ok(event.system[0].text.includes("<project-memory"))
  cleanup(base)
})

test("sessão de outro projeto não recebe o recall", async () => {
  const dir = tempProject()
  const outro = tempProject()
  const hooks: { name: string; handler: (...args: any[]) => any }[] = []
  const calls: any[] = []
  await setup(fakeCtx(dir, calls, { hooks, session: { location: { directory: outro } } }))
  const hook = hooks.find((h) => h.name === "context")!
  const event = contextEvent("ses_outro")
  await hook.handler(event)
  assert.equal(event.system.length, 0, "uma sessão de outro projeto recebeu a memória")
  cleanup(dir)
  cleanup(outro)
})

// --- I1: duas instâncias do plugin não podem dobrar o recall ---

test("duas instâncias do plugin injetam um único bloco de recall", async () => {
  const dir = tempProject()
  const hooks: { name: string; handler: (...args: any[]) => any }[] = []
  await setup(fakeCtx(dir, [], { hooks }))
  await setup(fakeCtx(dir, [], { hooks }))
  const event = contextEvent("ses_duplicado")
  for (const hook of hooks.filter((h) => h.name === "context")) {
    await hook.handler(event)
  }
  assert.equal(event.system.length, 1, `injetou ${event.system.length} blocos de recall`)
  cleanup(dir)
})

// --- I7: o caminho de captura precisa ter teste ---

test("o fim de turno grava a entrada no MEMORY.md", async () => {
  const dir = tempProject()
  const hooks: { name: string; handler: (...args: any[]) => any }[] = []
  const events: any[] = []
  const calls: any[] = []
  const cleanupFn = await setup(fakeCtx(dir, calls, { hooks, events }))
  const hook = hooks.find((h) => h.name === "context")!
  await hook.handler(
    contextEvent("ses_captura", [
      { id: "m1", role: "user", content: [{ type: "text", text: "crie o arquivo x.txt" }] },
      { id: "m2", role: "assistant", content: [{ type: "tool-call", id: "c1", name: "write", input: { path: "x.txt" } }] },
    ]),
  )
  events.push({
    type: "session.step.ended",
    created: 1700000000000,
    data: { sessionID: "ses_captura", finish: "stop" },
  })
  await new Promise((resolve) => setTimeout(resolve, 120))
  const content = readFileSync(join(dir, "MEMORY.md"), "utf8")
  assert.ok(content.includes("crie o arquivo x.txt"), "a entrada do turno não foi gravada")
  assert.ok(content.includes("x.txt"), "os arquivos tocados não foram gravados")
  if (typeof cleanupFn === "function") await cleanupFn()
  cleanup(dir)
})

test("turno que continua (tool-calls) não é gravado", async () => {
  const dir = tempProject()
  const hooks: { name: string; handler: (...args: any[]) => any }[] = []
  const events: any[] = []
  const calls: any[] = []
  const cleanupFn = await setup(fakeCtx(dir, calls, { hooks, events }))
  const hook = hooks.find((h) => h.name === "context")!
  await hook.handler(
    contextEvent("ses_continua", [
      { id: "m1", role: "user", content: [{ type: "text", text: "meia tarefa" }] },
    ]),
  )
  events.push({
    type: "session.step.ended",
    created: 1700000000000,
    data: { sessionID: "ses_continua", finish: "tool-calls" },
  })
  await new Promise((resolve) => setTimeout(resolve, 120))
  const content = readFileSync(join(dir, "MEMORY.md"), "utf8")
  assert.ok(!content.includes("meia tarefa"), "um turno que continua não deveria ser gravado")
  if (typeof cleanupFn === "function") await cleanupFn()
  cleanup(dir)
})

// --- I3: /mem forget tem que realmente remover a memória ---

test("/mem forget --yes impede que a memória volte na sessão seguinte", async () => {
  const dir = tempProject()
  const calls: any[] = []
  await registerMemCommand(fakeCtx(dir, calls))
  const def = calls.find((c) => c && c.name === "mem")!
  await def.execute({ sessionID: "s", prompt: { text: "init" }, delivery: "steer" })
  await def.execute({ sessionID: "s", prompt: { text: "forget --yes" }, delivery: "steer" })

  const calls2: any[] = []
  await setup(fakeCtx(dir, calls2))
  assert.equal(existsSync(join(dir, "MEMORY.md")), false, "a memória voltou depois do /mem forget")
  cleanup(dir)
})
