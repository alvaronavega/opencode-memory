import { readFileSync, writeFileSync } from "node:fs"

// Aplica o banner no README de forma idempotente:
//   - remove qualquer quadro ASCII solto (╭ ... ╯) que estiver no arquivo
//   - coloca a imagem no topo e a versao ASCII (docs/banner.txt) num <details>

const file = process.argv[2]
const asciiFile = process.argv[3]
const text = readFileSync(file, "utf8")
const ascii = readFileSync(asciiFile, "utf8").replace(/\n+$/, "")

// 1) remove quadros ASCII soltos (blocos que comecam em "╭" e terminam em "╯")
let cleaned = text
for (;;) {
  const start = cleaned.indexOf("╭")
  if (start === -1) break
  const end = cleaned.indexOf("╯", start)
  if (end === -1) break
  const endOfLine = cleaned.indexOf("\n", end)
  cleaned = cleaned.slice(0, start) + cleaned.slice(endOfLine === -1 ? cleaned.length : endOfLine + 1)
}

// 2) garante que a imagem + details estejam logo apos o titulo
const title = /^#\s+opencode-memory\s*$/m.exec(cleaned)
if (!title) {
  console.log("titulo nao encontrado")
  process.exit(1)
}

// remove uma versao anterior da imagem/details
const imgStart = cleaned.indexOf('<p align="center">', title.index)
if (imgStart !== -1) {
  const detailsEnd = cleaned.indexOf("</details>", imgStart)
  if (detailsEnd !== -1) {
    const after = cleaned.indexOf("\n", detailsEnd)
    cleaned = cleaned.slice(0, imgStart) + cleaned.slice(after + 1)
  }
}

const titleEnd = cleaned.indexOf("\n", title.index + title[0].length) + 1
const head = [
  '<p align="center">',
  '  <img src="docs/banner.svg" alt="opencode-memory — memória por pasta para o OpenCode" width="880">',
  "</p>",
  "",
  "<details>",
  "<summary>ver o banner em ASCII (terminal)</summary>",
  "",
  "```",
  ascii,
  "```",
  "",
  "</details>",
  "",
  "",
].join("\n")

writeFileSync(file, cleaned.slice(0, titleEnd) + head + cleaned.slice(titleEnd), "utf8")
console.log("README atualizado")
