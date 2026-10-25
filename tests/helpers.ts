import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface FakeCtxOptions {  hooks?: { name: string; handler: (...args: any[]) => any }[]
  /** Eventos que o `ctx.event.subscribe()` vai entregar. */
  events?: any[]
  /** O que `ctx.session.get()` devolve para a sessão. */
  session?: any
  /** ID do projeto da location (o host resolve; o plugin compara). */
  projectID?: string
}

/**
 * ctx falso: registra o que o plugin registra, sem precisar do OpenCode.
 * `calls` recebe strings ("command", "tool"), as definições registradas e as
 * mensagens sintéticas ({ synthetic: input }).
 */
export function fakeCtx(dir: string, calls: any[], opts: FakeCtxOptions = {}): any {
  const projectID = opts.projectID ?? `proj-${dir}`
  const events = opts.events ?? []
  return {
    location: {
      directory: dir,
      project: { id: projectID, directory: dir, canonical: dir },
    },
    options: {},
    command: {
      transform: async (fn: any) => {
        calls.push("command")
        fn({
          add: (def: any) => calls.push(def),
          list: () => calls.filter((c) => c && c.name),
          get: (name: string) => calls.find((c) => c && c.name === name),
          remove: () => {},
        })
      },
      list: () => [],
      reload: async () => {},
    },
    tool: {
      transform: async (fn: any) => {
        calls.push("tool")
        fn({
          add: (def: any) => calls.push(def),
          namespace: () => {},
          list: () => calls.filter((c) => c && c.name),
          get: (name: string) => calls.find((c) => c && c.name === name),
          remove: () => {},
          update: () => {},
        })
      },
      list: () => [],
      reload: async () => {},
      hook: async () => ({ dispose: async () => {} }),
    },
    session: {
      hook: async (name: string, handler: any) => {
        opts.hooks?.push({ name, handler })
        return { dispose: async () => {} }
      },
      synthetic: async (input: any) => {
        calls.push({ synthetic: input })
        return { id: "msg_sintetico" }
      },
      list: async () => ({ data: [] }),
      context: async () => [],
      get: async () => opts.session ?? { projectID, location: { directory: dir } },
    },
    event: {
      subscribe: ({ signal }: any = {}) => ({
        async *[Symbol.asyncIterator]() {
          let i = 0
          let idle = 0
          while (!signal?.aborted) {
            if (i < events.length) {
              idle = 0
              yield events[i++]
              await sleep(5)
              continue
            }
            idle++
            // Para sozinho depois de ~1s sem evento: o teste não pode ficar preso.
            if (idle > 200) return
            await sleep(5)
          }
        },
      }),
    },
    storage: {
      get: async () => undefined,
      set: async () => {},
      remove: async () => {},
      scan: async () => ({}),
    },
  }
}

/** Cria um projeto temporário (com package.json, para ser reconhecido como projeto). */
export function tempProject(prefix = "oc-mem-proj-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  writeFileSync(join(dir, "package.json"), "{}\n")
  return dir
}

/** Cria um diretório temporário qualquer (sem marker de projeto). */
export function tempDir(prefix = "oc-mem-dir-"): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {}
}

export { mkdirSync, writeFileSync, existsSync, join, tmpdir }
