import { test } from "node:test"
import assert from "node:assert/strict"
import { factsFromTranscript, summarizeFacts, unquote } from "../src/capture.ts"

const transcript = {
  messages: [
    { id: "m1", role: "user", content: [{ type: "text", text: '"arrume o login"' }] },
    {
      id: "m2",
      role: "assistant",
      content: [
        { type: "reasoning", text: "o modelo pensou" },
        { type: "tool-call", id: "c1", name: "edit", input: { path: "src/auth.ts" } },
        { type: "tool-call", id: "c2", name: "shell", input: { command: "npm test" } },
      ],
    },
    {
      id: "m3",
      role: "tool",
      content: [
        { type: "tool-result", id: "c1", name: "edit", result: { type: "text", value: "ok" } },
        {
          type: "tool-result",
          id: "c2",
          name: "shell",
          result: { type: "content", value: [{ type: "text", text: "Exited with code 1" }] },
        },
      ],
    },
  ],
}

test("unquote remove as aspas que o OpenCode coloca no prompt", () => {
  assert.equal(unquote('"arrume o login"'), "arrume o login")
  assert.equal(unquote("sem aspas"), "sem aspas")
})

test("factsFromTranscript extrai prompt, arquivos e comandos", () => {
  const facts = factsFromTranscript(transcript)
  assert.equal(facts.prompt, "arrume o login")
  assert.deepEqual(facts.files, ["src/auth.ts"])
  assert.deepEqual(facts.commands, ["npm test (erro)"])
})

test("factsFromTranscript marca comando bem-sucedido como ok", () => {
  const facts = factsFromTranscript({
    messages: [
      { id: "m1", role: "user", content: [{ type: "text", text: "roda" }] },
      { id: "m2", role: "assistant", content: [{ type: "tool-call", id: "c1", name: "shell", input: { command: "git status" } }] },
      { id: "m3", role: "tool", content: [{ type: "tool-result", id: "c1", name: "shell", result: { type: "text", value: "On branch main" } }] },
    ],
  })
  assert.deepEqual(facts.commands, ["git status (ok)"])
})

test("factsFromTranscript deduplica arquivos", () => {
  const facts = factsFromTranscript({
    messages: [
      { id: "m1", role: "user", content: [{ type: "text", text: "x" }] },
      { id: "m2", role: "assistant", content: [{ type: "tool-call", id: "c1", name: "write", input: { path: "a.ts" } }] },
      { id: "m3", role: "assistant", content: [{ type: "tool-call", id: "c2", name: "edit", input: { path: "a.ts" } }] },
    ],
  })
  assert.deepEqual(facts.files, ["a.ts"])
})

test("factsFromTranscript ignora transcript vazio", () => {
  const facts = factsFromTranscript({ messages: [] })
  assert.equal(facts.prompt, "")
  assert.deepEqual(facts.files, [])
  assert.deepEqual(facts.commands, [])
})

test("summarizeFacts trunca o prompt e ordena os arquivos", () => {
  const entry = summarizeFacts({ prompt: "x".repeat(500), files: ["b.ts", "a.ts"], commands: [] }, "2026-10-25T00:00:00Z", 50)
  assert.equal(entry.text.length, 50)
  assert.deepEqual(entry.files, ["a.ts", "b.ts"])
  assert.equal(entry.ts, "2026-10-25T00:00:00Z")
  assert.equal(entry.kind, "turno")
})

test("summarizeFacts sem prompt devolve entrada vazia", () => {
  const entry = summarizeFacts({ prompt: "", files: [], commands: [] }, "2026-10-25T00:00:00Z")
  assert.equal(entry.text, "")
})

test("factsFromTranscript relativiza caminho absoluto dentro do projeto", () => {
  const facts = factsFromTranscript(
    {
      messages: [
        { id: "m1", role: "user", content: [{ type: "text", text: "x" }] },
        {
          id: "m2",
          role: "assistant",
          content: [{ type: "tool-call", id: "c1", name: "write", input: { path: "C:\\AI\\proj\\src\\auth.ts" } }],
        },
      ],
    },
    "C:\\AI\\proj",
  )
  assert.deepEqual(facts.files, ["src\\auth.ts"])
})

test("factsFromTranscript mantém caminho de fora do projeto", () => {
  const facts = factsFromTranscript(
    {
      messages: [
        { id: "m1", role: "user", content: [{ type: "text", text: "x" }] },
        {
          id: "m2",
          role: "assistant",
          content: [{ type: "tool-call", id: "c1", name: "write", input: { path: "C:\\outro\\arquivo.ts" } }],
        },
      ],
    },
    "C:\\AI\\proj",
  )
  assert.deepEqual(facts.files, ["C:\\outro\\arquivo.ts"])
})
