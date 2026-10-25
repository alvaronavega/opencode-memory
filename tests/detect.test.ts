import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir, homedir } from "node:os"
import { join } from "node:path"
import { isProjectDir, isExcludedPath, findProjectRoot, detectProjectName, isForbiddenRoot } from "../src/detect.ts"

test("home do usuário nunca é projeto", () => {
  assert.equal(isProjectDir(homedir(), homedir()), false)
})

test("pasta com .git é projeto", () => {
  const dir = mkdtempSync(join(tmpdir(), "proj-"))
  mkdirSync(join(dir, ".git"))
  assert.equal(isProjectDir(dir, homedir()), true)
})

test("node_modules nunca é projeto", () => {
  assert.equal(isProjectDir(join("/w", "proj", "node_modules", "pkg"), "/home/u"), false)
})

test("venv e dist nunca são projeto", () => {
  assert.equal(isExcludedPath(join("/w", "proj", ".venv", "lib"), "/home/u"), true)
  assert.equal(isExcludedPath(join("/w", "proj", "dist"), "/home/u"), true)
})

test("pasta sem sinal não é projeto", () => {
  assert.equal(isProjectDir(join(tmpdir(), "random-xyz-sem-marker"), homedir()), false)
})

test("caminho com espaço e acento funciona", () => {
  const base = mkdtempSync(join(tmpdir(), "acent-"))
  const dir = join(base, "Meus Projetos", "ação")
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "package.json"), "{}")
  assert.equal(isProjectDir(dir, homedir()), true)
  assert.equal(detectProjectName(dir), "ação")
})

test("findProjectRoot sobe até a raiz do projeto", () => {
  const base = mkdtempSync(join(tmpdir(), "monorepo-"))
  const sub = join(base, "packages", "web")
  mkdirSync(sub, { recursive: true })
  writeFileSync(join(base, "package.json"), "{}")
  assert.equal(findProjectRoot(sub, homedir()), base)
})

test("findProjectRoot devolve a própria pasta quando ela é a raiz", () => {
  const base = mkdtempSync(join(tmpdir(), "solo-marker-"))
  writeFileSync(join(base, "pyproject.toml"), "")
  assert.equal(findProjectRoot(base, homedir()), base)
})

test("findProjectRoot devolve undefined fora de projeto", () => {
  const dir = mkdtempSync(join(tmpdir(), "solo-"))
  assert.equal(findProjectRoot(dir, homedir()), undefined)
})

test("detectProjectName usa o basename e nunca fica vazio", () => {
  assert.equal(detectProjectName(join("/w", "meu-projeto")), "meu-projeto")
  assert.equal(detectProjectName("/"), "projeto")
})

// --- I4: a home e as pastas de sistema nunca podem receber memória ---

test("isForbiddenRoot barra a home do usuário", () => {
  assert.equal(isForbiddenRoot("/home/u", "/home/u"), true)
})

test("isForbiddenRoot barra pastas de dependência e de sistema", () => {
  assert.equal(isForbiddenRoot(join("/w", "proj", "node_modules", "pkg"), "/home/u"), true)
  assert.equal(isForbiddenRoot(join("/w", "proj", ".venv"), "/home/u"), true)
  assert.equal(isForbiddenRoot(join("C:", "Windows"), "/home/u"), true)
})

test("isForbiddenRoot deixa passar um projeto normal", () => {
  assert.equal(isForbiddenRoot(join("/w", "proj"), "/home/u"), false)
})
