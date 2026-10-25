import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { globalLayout, projectLayout } from "./layout.ts"
import { readGlobalConfig, readProjectConfig, writeProjectConfig } from "./config.ts"
import { detectProjectName, findProjectRoot, isProjectDir } from "./detect.ts"
import { copyKit, hasLocalKit } from "./kit.ts"
import { appendToMemory, ensureMemoryFile, readMemoryText } from "./store.ts"
import { parseMemoryFile } from "./memory-file.ts"
import { buildRecall } from "./recall.ts"
import { factsFromTranscript, summarizeFacts } from "./capture.ts"
import { extractNote } from "./notes.ts"
import { registerMemCommand } from "./command.ts"
import { registerMemoryNote } from "./tool.ts"

export type WiringContext = any

/** O supervisor global cria a memória; o worker local (kit copiado) usa a memória. */
export function decideRole(dir: string, localKit: boolean): "supervisor" | "worker" {
  void dir
  return localKit ? "worker" : "supervisor"
}

/** Converte o timestamp do evento em ISO (número = epoch ms, string = ISO). */
function eventTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString()
  if (typeof value === "string" && value.trim()) return value
  return new Date().toISOString()
}

/** O system prompt já tem um bloco de memória? (duas instâncias do plugin, mesma sessão) */
function alreadyInjected(system: unknown): boolean {
  if (!Array.isArray(system)) return false
  return system.some((part: any) => typeof part?.text === "string" && part.text.includes("<project-memory"))
}

/**
 * Setup do plugin.
 *
 * Toda instância (uma por location) cuida da memória da raiz do projeto daquela
 * location: garante os arquivos, injeta o recall no system prompt e grava cada
 * turno. A diferença entre supervisor e worker é quem copia o kit para a pasta
 * (o supervisor, no primeiro uso) — o resto do comportamento é o mesmo.
 */
export async function setup(ctx: WiringContext): Promise<void> {
  let abort: AbortController | undefined
  try {
    const dir: string = ctx?.location?.directory ?? process.cwd()
    const root = findProjectRoot(dir) ?? dir
    const layout = projectLayout(root)
    const globalConfig = readGlobalConfig(globalLayout().configFile)
    const project = detectProjectName(root)
    const isProject = isProjectDir(root)
    const role = decideRole(root, hasLocalKit(layout.kitDir))
    const projectConfig = readProjectConfig(layout.configFile)

    // Uma pasta com "enabled": false (o /mem forget grava isso) não recebe nada.
    const enabled = projectConfig.enabled

    // Arquivos da memória (só em pastas de projeto e habilitadas).
    if (isProject && enabled) {
      ensureMemoryFile(layout.memoryFile, project)
      if (!projectConfig.project) {
        writeProjectConfig(layout.configFile, { ...projectConfig, project })
      }
      // Bootstrap: o supervisor copia o kit para a pasta (ela passa a ser autossuficiente).
      if (role === "supervisor" && globalConfig.enabled && globalConfig.auto && !hasLocalKit(layout.kitDir)) {
        copyKit(layout.kitDir)
      }
    }

    const injected = new Set<string>()
    const transcripts = new Map<string, any[]>()
    const sessionOwn = new Map<string, boolean>()

    /**
     * A sessão pertence a este projeto?
     * Compara a identidade do projeto (projectID do host) e, sem ela, a raiz do
     * projeto da sessão — uma sessão em `projeto/src/` é do projeto `projeto`.
     */
    const sessionBelongsHere = async (sessionID: string): Promise<boolean> => {
      const known = sessionOwn.get(sessionID)
      if (known !== undefined) return known
      let result = false
      try {
        const session = await ctx.session.get({ sessionID })
        const sessionProjectID = (session as any)?.projectID
        const instanceProjectID = ctx?.location?.project?.id
        if (sessionProjectID && instanceProjectID) {
          result = sessionProjectID === instanceProjectID
        } else {
          const sessionDir =
            (session as any)?.location?.directory ?? (session as any)?.directory ?? (session as any)?.cwd
          if (sessionDir) {
            const sessionRoot = findProjectRoot(String(sessionDir))
            result = sessionRoot
              ? resolve(sessionRoot) === resolve(root)
              : resolve(String(sessionDir)) === resolve(root)
          }
        }
      } catch {
        result = false
      }
      sessionOwn.set(sessionID, result)
      return result
    }

    await ctx.session.hook("context", async (event: any) => {
      try {
        const sessionID = event?.sessionID
        if (!sessionID) return
        if (Array.isArray(event?.messages)) transcripts.set(sessionID, event.messages)
        if (injected.has(sessionID)) return
        if (!isProject || !enabled) return
        if (!(await sessionBelongsHere(sessionID))) return

        const current = readProjectConfig(layout.configFile)
        if (!current.enabled || !current.inject) return
        if (!existsSync(layout.memoryFile)) return
        // Duas instâncias do plugin (global + local) injetariam o bloco duas vezes.
        if (alreadyInjected(event?.system)) {
          injected.add(sessionID)
          return
        }

        const parsed = parseMemoryFile(readMemoryText(layout.memoryFile))
        const recall = buildRecall({
          project: current.project || project,
          path: root,
          entries: parsed.entries,
          context: parsed.context,
          maxInject: current.maxInject,
        })
        if (Array.isArray(event?.system)) event.system.push({ type: "text", text: recall })
        injected.add(sessionID)
      } catch {
        // nunca derruba a sessão
      }
    })

    abort = new AbortController()
    const controller = abort
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          try {
            if (event?.type !== "session.step.ended") continue
            const data = event?.data ?? {}
            if (data.finish === "tool-calls") continue
            const sessionID = data.sessionID
            if (!sessionID) continue
            const messages = transcripts.get(sessionID)
            if (!messages) continue
            if (!isProject || !enabled) continue
            if (!(await sessionBelongsHere(sessionID))) continue

            const current = readProjectConfig(layout.configFile)
            if (!current.enabled) continue

            const facts = factsFromTranscript({ messages }, root)
            if (!facts.prompt && facts.files.length === 0 && facts.commands.length === 0) continue

            // O timestamp vem do evento: duas instâncias do plugin gravam a mesma
            // linha (o dedupe por linha idêntica evita entrada duplicada).
            const now = eventTimestamp((event as any)?.created ?? data.started)
            const entries = [summarizeFacts(facts, now)]
            const note = extractNote(facts.prompt)
            if (note) entries.push({ ts: now, kind: "nota", text: note })

            await appendToMemory(layout.memoryFile, current.project || project, entries, current.maxEntries)
          } catch {
            // ignora falhas de captura
          }
        }
      } catch {
        // stream encerrado
      }
    })()

    await registerMemoryNote(ctx)
    await registerMemCommand(ctx)

    return () => {
      try {
        abort?.abort()
      } catch {}
    }
  } catch (error) {
    // nunca derruba a sessão do OpenCode
    void error
  }
}
