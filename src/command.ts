import { existsSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { projectLayout } from "./layout.ts"
import { readProjectConfig, writeProjectConfig, type ProjectConfig } from "./config.ts"
import { detectProjectName, findProjectRoot } from "./detect.ts"
import { copyKit, hasLocalKit } from "./kit.ts"
import {
  ensureMemoryFile,
  memorySize,
  readEntries,
  readMemoryText,
  writeMemoryAtomic,
} from "./store.ts"
import { buildMemoryFile, parseMemoryFile, trimEntries } from "./memory-file.ts"

export const MEMORY_COMMAND = "mem"

export const HELP_TEXT = [
  "/mem — memória do projeto",
  "",
  "Uso: /mem [subcomando]",
  "",
  "Subcomandos:",
  "  /mem status    estado da memória desta pasta (é o padrão)",
  "  /mem help      esta ajuda",
  "  /mem init      ativa a memória nesta pasta (cria MEMORY.md e a configuração)",
  "  /mem on        liga a injeção da memória no system prompt",
  "  /mem off       desliga a injeção (mantém o arquivo)",
  "  /mem show      imprime o MEMORY.md",
  "  /mem archive   move as entradas antigas para MEMORY-arquivo.md",
  "  /mem forget    remove os arquivos de memória (use --yes para confirmar)",
  "  /mem doctor    diagnostica a instalação",
  "",
  "A memória vive no arquivo MEMORY.md dentro da pasta do projeto.",
].join("\n")

export type MemSubcommand =
  | "status"
  | "help"
  | "init"
  | "on"
  | "off"
  | "show"
  | "archive"
  | "forget"
  | "doctor"

function parseSubcommand(text: string): { sub: MemSubcommand; args: string } {
  const trimmed = String(text ?? "").trim()
  if (!trimmed) return { sub: "status", args: "" }
  const [raw, ...rest] = trimmed.split(/\s+/)
  const normalized = raw.replace(/^\/+|^-+/, "").toLowerCase()
  const known: MemSubcommand[] = [
    "status",
    "help",
    "init",
    "on",
    "off",
    "show",
    "archive",
    "forget",
    "doctor",
  ]
  const sub = (known.includes(normalized as MemSubcommand) ? normalized : "status") as MemSubcommand
  return { sub, args: rest.join(" ") }
}

function statusText(root: string, config: ProjectConfig): string {
  const layout = projectLayout(root)
  const exists = existsSync(layout.memoryFile)
  const entries = exists ? readEntries(layout.memoryFile) : []
  const last = entries.length > 0 ? entries[entries.length - 1].ts : "nenhuma"
  const size = memorySize(layout.memoryFile)
  return [
    `Memória do projeto: ${config.project || detectProjectName(root)}`,
    `Pasta: ${root}`,
    `Arquivo: ${exists ? layout.memoryFile : "(não existe)"}`,
    `Entradas: ${entries.length} | última: ${last} | tamanho: ${size} bytes`,
    `Injeção no prompt: ${config.inject ? "ligada" : "desligada"}`,
    `Limite de entradas: ${config.maxEntries}`,
  ].join("\n")
}

function initProject(root: string): string {
  const layout = projectLayout(root)
  const project = detectProjectName(root)
  const notes: string[] = []

  const created = ensureMemoryFile(layout.memoryFile, project)
  notes.push(created ? `MEMORY.md criado (${layout.memoryFile})` : `MEMORY.md já existia (não foi sobrescrito)`)

  const config = readProjectConfig(layout.configFile)
  const withProject: ProjectConfig = { ...config, project: config.project || project }
  writeProjectConfig(layout.configFile, withProject)
  notes.push(`config: ${layout.configFile}`)

  const kit = copyKit(layout.kitDir)
  notes.push(kit.copied ? "kit local instalado (a pasta agora é autossuficiente)" : "kit local já presente")

  return [`Memória ativada em ${root}`, ...notes.map((n) => `- ${n}`), "", "Abra uma sessão nova nesta pasta para o contexto ser injetado."].join("\n")
}

function toggleInject(root: string, on: boolean): string {
  const layout = projectLayout(root)
  const config = readProjectConfig(layout.configFile)
  const updated: ProjectConfig = { ...config, inject: on, enabled: true, project: config.project || detectProjectName(root) }
  writeProjectConfig(layout.configFile, updated)
  return on
    ? "Injeção da memória ligada nesta pasta."
    : "Injeção da memória desligada nesta pasta (o arquivo continua existindo)."
}

function showMemory(root: string): string {
  const layout = projectLayout(root)
  if (!existsSync(layout.memoryFile)) return "Ainda não existe MEMORY.md nesta pasta. Rode /mem init."
  const content = readMemoryText(layout.memoryFile)
  if (content.length > 4000) return content.slice(0, 4000) + "\n\n(… arquivo truncado para 4000 caracteres)"
  return content
}

function archiveMemory(root: string): string {
  const layout = projectLayout(root)
  if (!existsSync(layout.memoryFile)) return "Não há MEMORY.md para arquivar."
  const config = readProjectConfig(layout.configFile)
  const current = readMemoryText(layout.memoryFile)
  const { content, removed } = trimEntries(current, config.maxEntries)
  if (removed.length === 0) return `Nada a arquivar: o MEMORY.md já está dentro do limite (${config.maxEntries}).`
  const archiveFile = join(layout.dir, "MEMORY-arquivo.md")
  const archiveExisting = existsSync(archiveFile) ? readMemoryText(archiveFile) : ""
  const archiveEntries = removed.map((entry) => `- [${entry.ts}] ${entry.kind} — "${entry.text}"`)
  const header = archiveExisting ? archiveExisting.trimEnd() + "\n" : "# Arquivo da memória do projeto\n\n"
  writeFileSync(archiveFile, `${header}${archiveEntries.join("\n")}\n`, "utf8")
  writeMemoryAtomic(layout.memoryFile, content)
  return `${removed.length} entrada(s) movida(s) para ${archiveFile}.`
}

function forgetMemory(root: string, args: string): string {
  const layout = projectLayout(root)
  if (!args.includes("--yes")) {
    return [
      "Isso apaga a memória desta pasta:",
      `- ${layout.memoryFile}`,
      `- ${layout.configFile}`,
      `- ${layout.kitDir}`,
      "",
      "Para confirmar: /mem forget --yes",
    ].join("\n")
  }
  const removed: string[] = []
  for (const path of [layout.memoryFile, layout.configFile, layout.kitDir]) {
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true })
      removed.push(path)
    }
  }
  return removed.length > 0
    ? `Removido: ${removed.join(", ")}`
    : "Não havia nada de memória nesta pasta."
}

function doctorText(root: string): string {
  const layout = projectLayout(root)
  const config = readProjectConfig(layout.configFile)
  const lines = [
    "Diagnóstico da memória",
    `Pasta do projeto: ${root}`,
    `- MEMORY.md: ${existsSync(layout.memoryFile) ? "ok" : "ausente (use /mem init)"}`,
    `- config: ${existsSync(layout.configFile) ? "ok" : "ausente (será criado no primeiro uso)"}`,
    `- kit local: ${hasLocalKit(layout.kitDir) ? "instalado (pasta autossuficiente)" : "ausente (o global assume)"}`,
    `- injeção: ${config.inject ? "ligada" : "desligada"}`,
    `- limite de entradas: ${config.maxEntries}`,
  ]
  try {
    writeFileSync(join(layout.dir, ".opencode-memory-check.tmp"), "ok", "utf8")
    rmSync(join(layout.dir, ".opencode-memory-check.tmp"), { force: true })
    lines.push("- escrita na pasta: ok")
  } catch {
    lines.push("- escrita na pasta: FALHOU (sem permissão)")
  }
  return lines.join("\n")
}

/** Registra o comando `/mem` (com subcomandos). */
export function registerMemCommand(ctx: any): Promise<void> {
  const dir: string = ctx?.location?.directory ?? process.cwd()
  return ctx.command.transform((editor: any) => {
    editor.add({
      name: MEMORY_COMMAND,
      description: "Memória do projeto — /mem help para os subcomandos",
      // O `execute` de um comando de plugin retorna void: o host descarta o valor.
      // A saída vai para a sessão como mensagem sintética (sem agendar o modelo).
      // Ver docs/api-notes.md ("Spike 3").
      execute: async (input: any) => {
        const sessionID = input?.sessionID
        let text: string
        try {
          text = buildOutput(input, dir)
        } catch (error) {
          text = `Erro no comando /mem: ${String(error)}`
        }
        try {
          await ctx.session.synthetic({ sessionID, text, resume: false })
        } catch {
          // sem canal de saída: não quebra nada
        }
      },
    })
  })
}

/** Calcula o texto de saída do comando a partir do subcomando. */
export function buildOutput(input: any, dir: string): string {
  const { sub, args } = parseSubcommand(input?.prompt?.text ?? "")
  const root = findProjectRoot(dir) ?? dir
  const layout = projectLayout(root)
  const config = readProjectConfig(layout.configFile)

  switch (sub) {
    case "help":
      return HELP_TEXT
    case "init":
      return initProject(root)
    case "on":
      return toggleInject(root, true)
    case "off":
      return toggleInject(root, false)
    case "show":
      return showMemory(root)
    case "archive":
      return archiveMemory(root)
    case "forget":
      return forgetMemory(root, args)
    case "doctor":
      return doctorText(root)
    default:
      return `${statusText(root, config)}\n\nUse /mem help para ver os subcomandos.`
  }
}
