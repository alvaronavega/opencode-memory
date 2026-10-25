import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { registerMemCommand, HELP_TEXT } from "../src/command.ts"
import { fakeCtx, tempProject, cleanup } from "./helpers.ts"

const findCommand = (calls: any[]) => calls.find((c) => c && c.name === "mem")

const run = async (text: string, dir: string) => {
  const calls: any[] = []
  await registerMemCommand(fakeCtx(dir, calls))
  const def = findCommand(calls)
  return await def.execute({ sessionID: "ses_teste", prompt: { text }, delivery: "steer" })
}

test("/mem sem argumento devolve status", async () => {
  const dir = tempProject()
  const out = await run("", dir)
  assert.ok(out.content.includes("memória") || out.content.includes("Memória"))
  assert.ok(out.content.includes("/mem help"))
  cleanup(dir)
})

test("/mem help devolve a ajuda com todos os subcomandos", async () => {
  const dir = tempProject()
  const out = await run("help", dir)
  for (const sub of ["init", "on", "off", "show", "archive", "forget", "doctor", "status"]) {
    assert.ok(out.content.includes(`/mem ${sub}`), `falta /mem ${sub}`)
  }
  assert.equal(out.content, HELP_TEXT)
  cleanup(dir)
})

test("/mem --help também mostra a ajuda", async () => {
  const dir = tempProject()
  const out = await run("--help", dir)
  assert.equal(out.content, HELP_TEXT)
  cleanup(dir)
})

test("/mem init cria os arquivos do projeto", async () => {
  const dir = tempProject()
  const out = await run("init", dir)
  assert.ok(existsSync(join(dir, "MEMORY.md")))
  assert.ok(existsSync(join(dir, ".opencode", "memory.json")))
  assert.ok(out.content.toLowerCase().includes("memória"))
  cleanup(dir)
})

test("/mem init não sobrescreve MEMORY.md existente", async () => {
  const dir = tempProject()
  await run("init", dir)
  writeFileSync(join(dir, "MEMORY.md"), "# Memória do projeto: x\n\nminha nota precious\n")
  await run("init", dir)
  const content = readFileSync(join(dir, "MEMORY.md"), "utf8")
  assert.ok(content.includes("minha nota precious"))
  cleanup(dir)
})

test("/mem status conta as entradas", async () => {
  const dir = tempProject()
  await run("init", dir)
  const out = await run("status", dir)
  assert.ok(/\d+/.test(out.content))
  cleanup(dir)
})

test("/mem show imprime o MEMORY.md", async () => {
  const dir = tempProject()
  await run("init", dir)
  const out = await run("show", dir)
  assert.ok(out.content.includes("Memória do projeto"))
  cleanup(dir)
})

test("/mem off desliga a injeção e on religa", async () => {
  const dir = tempProject()
  await run("init", dir)
  await run("off", dir)
  let config = JSON.parse(readFileSync(join(dir, ".opencode", "memory.json"), "utf8"))
  assert.equal(config.inject, false)
  await run("on", dir)
  config = JSON.parse(readFileSync(join(dir, ".opencode", "memory.json"), "utf8"))
  assert.equal(config.inject, true)
  cleanup(dir)
})

test("/mem forget sem --yes pede confirmação", async () => {
  const dir = tempProject()
  await run("init", dir)
  const out = await run("forget", dir)
  assert.ok(out.content.includes("--yes"))
  assert.ok(existsSync(join(dir, "MEMORY.md")))
  cleanup(dir)
})

test("/mem forget --yes remove os arquivos", async () => {
  const dir = tempProject()
  await run("init", dir)
  const out = await run("forget --yes", dir)
  assert.equal(existsSync(join(dir, "MEMORY.md")), false)
  assert.ok(out.content.length > 0)
  cleanup(dir)
})

test("/mem doctor relata o estado do projeto", async () => {
  const dir = tempProject()
  const out = await run("doctor", dir)
  assert.ok(out.content.includes("MEMORY.md"))
  cleanup(dir)
})
