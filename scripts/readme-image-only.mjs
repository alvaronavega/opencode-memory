import { readFileSync, writeFileSync } from "node:fs"

// Deixa o README com SO a imagem do banner.
// O ASCII fica em docs/banner.txt (no GitHub a fonte de fallback do bloco
// quebra o desenho da moldura, entao nao vale a pena no README).

const file = process.argv[2]
const text = readFileSync(file, "utf8")

const detailsStart = text.indexOf("<details>")
if (detailsStart === -1) {
  console.log("nenhum <details> no README")
  process.exit(0)
}
const detailsEnd = text.indexOf("</details>", detailsStart)
if (detailsEnd === -1) {
  console.log("<details> sem fechamento")
  process.exit(1)
}

const after = text.indexOf("\n", detailsEnd) + 1
const note = "A versão em ASCII do banner (para o terminal) está em [`docs/banner.txt`](docs/banner.txt).\n\n"
const next = text.slice(after).replace(/^\n+/, "")

writeFileSync(file, text.slice(0, detailsStart) + note + next, "utf8")
console.log("README: banner em imagem apenas; ASCII movido para docs/banner.txt")
