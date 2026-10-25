import { test } from "node:test"
import assert from "node:assert/strict"
import { setup } from "../src/wiring.ts"

test("setup registra o comando /mem sem lançar", async () => {
  const calls: string[] = []
  const ctx = {
    location: { directory: process.cwd() },
    command: { transform: async (fn: any) => { calls.push("command") ; fn({ add: () => calls.push("add"), list: () => [], get: () => undefined, remove: () => {} }) } },
    tool: { transform: async () => { calls.push("tool") } },
    session: { hook: async () => ({ dispose: async () => {} }) },
    event: { subscribe: () => ({ async *[Symbol.asyncIterator]() {} }) },
  }
  await setup(ctx as any)
  assert.ok(calls.includes("command"))
})
