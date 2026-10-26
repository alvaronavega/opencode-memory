import { readFileSync, writeFileSync } from "node:fs"

// Troca o quadro ASCII da estrutura de pastas por uma arvore (sem moldura).
// No GitHub o bloco de codigo usa uma fonte monoespacada de fallback, e as
// molduras (┌ ─ │) saem levemente desalinhadas; a arvore usa so espaco e
// caracteres de galho, que nao dependem da largura da fonte.

const file = process.argv[2]
const text = readFileSync(file, "utf8")

const box = [
  "C:\\AI\\meu-projeto\\",
  "├── MEMORY.md                   ← a memória (texto puro, versionável)",
  "└── .opencode\\",
  "    ├── memory.json             ← config do projeto",
  "    └── plugins\\",
  "        └── opencode-memory\\    ← o plugin (a pasta viaja)",
].join("\n")

const start = text.indexOf("┌")
if (start === -1) {
  console.log("quadro nao encontrado")
  process.exit(0)
}
const end = text.indexOf("┘", start)
const endOfLine = text.indexOf("\n", end)
writeFileSync(file, text.slice(0, start) + box + text.slice(endOfLine === -1 ? text.length : endOfLine), "utf8")
console.log("README: arvore no lugar do quadro")
