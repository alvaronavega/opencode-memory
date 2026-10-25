import { test } from "node:test"
import assert from "node:assert/strict"
import { join } from "node:path"
import { opencodeConfigDir, globalLayout, projectLayout } from "../src/layout.ts"

test("config dir respeita XDG_CONFIG_HOME", () => {
  const env = { XDG_CONFIG_HOME: join("/x", "cfg") } as NodeJS.ProcessEnv
  assert.equal(opencodeConfigDir(env, "/home/u"), join("/x", "cfg", "opencode"))
})

test("config dir usa ~/.config/opencode sem XDG", () => {
  const env = {} as NodeJS.ProcessEnv
  assert.equal(opencodeConfigDir(env, join("/home", "u")), join("/home", "u", ".config", "opencode"))
})

test("config dir ignora XDG vazio", () => {
  const env = { XDG_CONFIG_HOME: "" } as NodeJS.ProcessEnv
  assert.equal(opencodeConfigDir(env, join("/home", "u")), join("/home", "u", ".config", "opencode"))
})

test("global layout aponta kit dentro de plugins/", () => {
  const home = join("/home", "u")
  const g = globalLayout({} as NodeJS.ProcessEnv, home)
  assert.equal(g.configDir, join(home, ".config", "opencode"))
  assert.equal(g.configFile, join(home, ".config", "opencode", "memory.json"))
  assert.equal(g.pluginsDir, join(home, ".config", "opencode", "plugins"))
  assert.equal(g.kitDir, join(home, ".config", "opencode", "plugins", "opencode-memory"))
})

test("project layout monta MEMORY.md e .opencode/memory.json", () => {
  const p = projectLayout(join("/w", "proj"))
  assert.equal(p.dir, join("/w", "proj"))
  assert.equal(p.memoryFile, join("/w", "proj", "MEMORY.md"))
  assert.equal(p.opencodeDir, join("/w", "proj", ".opencode"))
  assert.equal(p.configFile, join("/w", "proj", ".opencode", "memory.json"))
  assert.equal(p.kitDir, join("/w", "proj", ".opencode", "plugins", "opencode-memory"))
})

test("project layout funciona em caminho com espaco e acento", () => {
  const p = projectLayout(join("/w", "Meus Projetos", "ação"))
  assert.equal(p.memoryFile, join("/w", "Meus Projetos", "ação", "MEMORY.md"))
})
