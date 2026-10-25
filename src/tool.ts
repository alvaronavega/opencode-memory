import { projectLayout } from "./layout.ts"
import { readProjectConfig } from "./config.ts"
import { detectProjectName, findProjectRoot } from "./detect.ts"
import { appendToMemory } from "./store.ts"
import type { MemoryKind } from "./memory-file.ts"

export const MEMORY_NOTE_TOOL = "memory_note"

/** Registra a tool `memory_note`: o modelo escreve nota/decisão/pendência na memória do projeto. */
export function registerMemoryNote(ctx: any): Promise<void> {
  const dir: string = ctx?.location?.directory ?? process.cwd()
  return ctx.tool.transform((editor: any) => {
    editor.add({
      name: MEMORY_NOTE_TOOL,
      description:
        "Registra uma nota, decisão ou pendência na memória do projeto (arquivo MEMORY.md da pasta). " +
        "Use quando algo importante for decidido e isso não ficar óbvio pelo código — o texto volta em sessões futuras.",
      input: {
        type: "object",
        properties: {
          texto: { type: "string", description: "O que registrar (uma ou duas frases)." },
          tipo: {
            type: "string",
            enum: ["nota", "decisao", "pendencia"],
            description: "O tipo de registro. Padrão: nota.",
          },
        },
        required: ["texto"],
        additionalProperties: false,
      },
      options: { namespace: "memoria", codemode: true },
      execute: async (input: any, context: any) => {
        try {
          // A pasta do projeto vem da sessão (o tool é registrado por instância de
          // plugin, e várias instâncias podem registrar o mesmo nome).
          const sessionID = context?.sessionID
          let root = dir
          if (sessionID) {
            try {
              const session = await ctx.session.get({ sessionID })
              const sessionDir =
                (session as any)?.location?.directory ?? (session as any)?.directory ?? (session as any)?.cwd
              if (sessionDir) root = findProjectRoot(String(sessionDir)) ?? String(sessionDir)
            } catch {
              // sem sessão: usa a pasta da instância
            }
          }
          const layout = projectLayout(root)
          const config = readProjectConfig(layout.configFile)
          if (!config.enabled) return { content: "A memória está desativada nesta pasta (/mem on)." }

          const kind = (input?.tipo ?? "nota") as MemoryKind
          const text = String(input?.texto ?? "").trim()
          if (!text) return { content: "Nada registrado: o texto estava vazio." }

          const written = appendToMemory(
            layout.memoryFile,
            config.project || detectProjectName(root),
            [{ ts: new Date().toISOString(), kind, text }],
            config.maxEntries,
          )
          return {
            content:
              written > 0
                ? "Registrado no MEMORY.md. Vai aparecer nas próximas sessões deste projeto."
                : "Não registrado: o MEMORY.md já tinha essa entrada (ou está grande demais para reescrever com segurança).",
          }
        } catch (error) {
          return { content: `Erro ao registrar a nota: ${String(error)}` }
        }
      },
    })
  })
}
