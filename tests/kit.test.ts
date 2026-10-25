import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { copyKit, hasLocalKit, kitSourceDir } from "../src/kit.ts"

test("kitSourceDir aponta para a raiz do pacote", () => {
  const dir = kitSourceDir()
  assert.ok(existsSync(join(dir, "index.ts")), "index.ts deve estar na raiz do pacote")
  assert.ok(existsSync(join(dir, "src")))
})

test("copyKit copia o pacote e não sobrescreve sem force", () => {
  const dest = mkdtempSync(join(tmpdir(), "kit-"))
  const first = copyKit(dest)
  assert.equal(first.copied, true)
  assert.ok(existsSync(join(dest, "index.ts")))
  assert.ok(existsSync(join(dest, "src", "wiring.ts")))

  const second = copyKit(dest)
  assert.equal(second.copied, false)
  assert.deepEqual(second.files, [])
})

test("copyKit com force sobrescreve", () => {
  const dest = mkdtempSync(join(tmpdir(), "kit-"))
  copyKit(dest)
  writeFileSync(join(dest, "index.ts"), "// adulterado")
  const forced = copyKit(dest, { force: true })
  assert.equal(forced.copied, true)
  assert.notEqual(forced.files.length, 0)
})

test("hasLocalKit detecta o kit local", () => {
  const dest = mkdtempSync(join(tmpdir(), "kit-"))
  assert.equal(hasLocalKit(dest), false)
  copyKit(dest)
  assert.equal(hasLocalKit(dest), true)
})
