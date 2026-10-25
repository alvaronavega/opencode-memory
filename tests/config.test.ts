import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readProjectConfig, writeProjectConfig, readGlobalConfig, writeGlobalConfig, DEFAULT_PROJECT_CONFIG } from "../src/config.ts"

test("config de projeto ausente vira defaults", () => {
  const c = readProjectConfig(join(tmpdir(), "nao-existe-opencode-mem", "memory.json"))
  assert.equal(c.version, 1)
  assert.equal(c.enabled, true)
  assert.equal(c.inject, true)
  assert.equal(c.maxEntries, 100)
  assert.equal(c.maxInject, 15)
})

test("config de projeto parcial preserva defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-mem-"))
  const file = join(dir, "memory.json")
  writeFileSync(file, JSON.stringify({ enabled: false }))
  const c = readProjectConfig(file)
  assert.equal(c.enabled, false)
  assert.equal(c.maxInject, 15)
  assert.equal(c.maxEntries, 100)
})

test("config de projeto invalido (JSON quebrado) vira defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-mem-"))
  const file = join(dir, "memory.json")
  writeFileSync(file, "{ isso nao e json")
  const c = readProjectConfig(file)
  assert.equal(c.maxInject, 15)
  assert.equal(c.enabled, true)
})

test("escreve e relê config de projeto preservando campos", () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-mem-"))
  const file = join(dir, "memory.json")
  writeProjectConfig(file, { ...DEFAULT_PROJECT_CONFIG, project: "meu-projeto", maxInject: 7 })
  const c = readProjectConfig(file)
  assert.equal(c.project, "meu-projeto")
  assert.equal(c.maxInject, 7)
})

test("writeProjectConfig cria diretorios que faltam", () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-mem-"))
  const file = join(dir, "sub", "dir", "memory.json")
  writeProjectConfig(file, { ...DEFAULT_PROJECT_CONFIG })
  const c = readProjectConfig(file)
  assert.equal(c.version, 1)
})

test("config global ausente vira defaults", () => {
  const g = readGlobalConfig(join(tmpdir(), "nao-existe-opencode-mem", "memory.json"))
  assert.equal(g.version, 1)
  assert.equal(g.auto, true)
  assert.equal(g.enabled, true)
})

test("config global escrito e relido", () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-mem-"))
  const file = join(dir, "memory.json")
  writeGlobalConfig(file, { version: 1, auto: false, enabled: true })
  const g = readGlobalConfig(file)
  assert.equal(g.auto, false)
})
