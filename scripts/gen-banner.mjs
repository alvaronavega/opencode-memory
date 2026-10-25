// Gera o banner do projeto localmente, em dois formatos:
//   docs/banner.svg  -> imagem vetorial (estilo terminal), usada no README
//   docs/banner.txt  -> a mesma arte em ASCII, para o <details> do README
//
// A arte e desenhada em vetor (cada caractere vira um <rect>), entao nao
// depende de fonte no navegador: o banner nunca "desanda".
//
// Uso: node scripts/gen-banner.mjs [pasta-de-saida]
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// Fonte de blocos 5x5 (5 colunas x 5 linhas), desenhada letra por letra.
const FONT = {
  O: [" ### ", "#   #", "#   #", "#   #", " ### "],
  P: ["#### ", "#   #", "#### ", "#    ", "#    "],
  E: ["#### ", "#    ", "###  ", "#    ", "#### "],
  N: ["#   #", "##  #", "# # #", "#  ##", "#   #"],
  C: [" ####", "#    ", "#    ", "#    ", " ####"],
  D: ["###  ", "#  # ", "#  # ", "#  # ", "###  "],
  M: ["#   #", "## ##", "# # #", "#   #", "#   #"],
  R: ["#### ", "#   #", "#### ", "#  # ", "#   #"],
  Y: ["#   #", "#   #", " ### ", "  #  ", "  #  "],
  "-": ["     ", "     ", " ### ", "     ", "     "],
  " ": ["     ", "     ", "     ", "     ", "     "],
}

const WORD = "opencode-memory"
const TAGLINES = [
  "memória por pasta para o OpenCode",
  "MEMORY.md no projeto · recall no prompt · captura de cada turno",
]

// Arte: 5 linhas, colunas = 15 caracteres * 6 (5 + 1 de espaco)
const rows = []
for (let r = 0; r < 5; r++) {
  let line = ""
  for (const ch of WORD) line += FONT[ch.toUpperCase()][r] + " "
  rows.push(line.replace(/\s+$/, ""))
}

// ---------------------------------------------------------------- ASCII ----
const asciiRows = rows.map((row) => row.replace(/#/g, "█"))
const asciiWidth = Math.max(...asciiRows.map((r) => r.length))
const asciiBox = [
  "╭" + "─".repeat(asciiWidth + 4) + "╮",
  ...asciiRows.map((r) => "│ " + r.padEnd(asciiWidth) + " │"),
  "│" + " ".repeat(asciiWidth + 4) + "│",
  ...TAGLINES.map((t) => "│ " + t.padEnd(asciiWidth) + " │"),
  "╰" + "─".repeat(asciiWidth + 4) + "╯",
].join("\n")

// ------------------------------------------------------------------ SVG ----
const COLS = Math.max(...rows.map((r) => r.length))
const CELL_W = 11
const CELL_H = 14
const GAP = 1.2
const PAD_X = 26
const PAD_Y = 26
const LINE_H = 26
const SUBTITLES = [
  { text: TAGLINES[0], color: "#e6edf3", size: 17 },
  { text: TAGLINES[1], color: "#7d8590", size: 14 },
]

const gridW = COLS * CELL_W
const gridH = rows.length * CELL_H
const W = gridW + PAD_X * 2
const H = gridH + PAD_Y * 2 + SUBTITLES.length * LINE_H + 16

const blocks = []
rows.forEach((row, ry) => {
  for (let cx = 0; cx < row.length; cx++) {
    if (row[cx] !== "#") continue
    blocks.push(
      `<rect x="${(PAD_X + cx * CELL_W + GAP / 2).toFixed(2)}" y="${(PAD_Y + ry * CELL_H + GAP / 2).toFixed(2)}" width="${(CELL_W - GAP).toFixed(2)}" height="${(CELL_H - GAP).toFixed(2)}" rx="1.4"/>`,
    )
  }
})

const sub = SUBTITLES.map((s, i) => {
  const y = PAD_Y + gridH + 22 + i * LINE_H + s.size
  return `<text x="${(W / 2).toFixed(2)}" y="${y.toFixed(2)}" fill="${s.color}" font-family="'DejaVu Sans Mono','Menlo','Consolas','Courier New',monospace" font-size="${s.size}" text-anchor="middle" letter-spacing="0.3">${s.text}</text>`
}).join("\n  ")

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="opencode-memory — memória por pasta para o OpenCode">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d1117"/>
      <stop offset="1" stop-color="#010409"/>
    </linearGradient>
    <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7CFFB2"/>
      <stop offset="1" stop-color="#25D366"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="url(#bg)"/>
  <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="12.5" fill="none" stroke="#1f6f43" stroke-width="1.5" opacity="0.9"/>

  <g opacity="0.85">
    <circle cx="${PAD_X}" cy="${PAD_Y - 12}" r="4" fill="#ff5f57"/>
    <circle cx="${PAD_X + 14}" cy="${PAD_Y - 12}" r="4" fill="#febc2e"/>
    <circle cx="${PAD_X + 28}" cy="${PAD_Y - 12}" r="4" fill="#28c840"/>
  </g>

  <g fill="url(#green)" filter="url(#glow)">
    ${blocks.join("\n    ")}
  </g>

  ${sub}
</svg>
`

const dir = process.argv[2] || "docs"
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "banner.svg"), svg, "utf8")
writeFileSync(join(dir, "banner.txt"), asciiBox + "\n", "utf8")
console.log(asciiBox)
console.log(`\nbanner.svg (${W}x${H}, ${blocks.length} blocos) e banner.txt gerados em ${dir}/`)
