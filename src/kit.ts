import { existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/** Pastas do pacote que não fazem parte do kit distribuível. */
const IGNORED_DIRS = new Set(["node_modules", ".git", "tests", "docs", ".superpowers", ".planning", "scripts"])

/** Arquivos do topo do pacote que fazem parte do kit. */
const KIT_FILES = ["index.ts", "package.json", "README.md"]

export interface CopyKitResult {
  copied: boolean
  files: string[]
}

/** Raiz do pacote (onde estão `index.ts` e `src/`). */
export function kitSourceDir(): string {
  return dirname(dirname(fileURLToPath(import.meta.url)))
}

function copyDir(source: string, dest: string, files: string[]): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue
    const from = join(source, entry.name)
    const to = join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to, files)
    else {
      copyFileSync(from, to)
      files.push(entry.name)
    }
  }
}

/**
 * Copia o kit para dentro de uma pasta de projeto.
 * Não sobrescreve um kit existente, a menos que `force` seja true.
 */
export function copyKit(dest: string, opts: { force?: boolean } = {}): CopyKitResult {
  const source = kitSourceDir()
  if (!opts.force && existsSync(join(dest, "index.ts"))) return { copied: false, files: [] }

  mkdirSync(dest, { recursive: true })
  const files: string[] = []

  for (const name of KIT_FILES) {
    const from = join(source, name)
    if (!existsSync(from)) continue
    copyFileSync(from, join(dest, name))
    files.push(name)
  }

  const srcDir = join(source, "src")
  if (existsSync(srcDir)) copyDir(srcDir, join(dest, "src"), files)

  return { copied: true, files }
}

/** O kit local está instalado nesta pasta? */
export function hasLocalKit(kitDir: string): boolean {
  return existsSync(join(kitDir, "index.ts"))
}
