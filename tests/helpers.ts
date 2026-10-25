import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export interface FakeCtxOptions {
  hooks?: { name: string; handler: (...args: any[]) => any }[]
  toolHandlers?: any[]
}

/**
 * ctx falso: registra o que o plugin registra, sem precisar do OpenCode.
 * `calls` recebe strings ("command", "tool") e as definições registradas.
 */
export function fakeCtx(dir: string, calls: any[], opts: FakeCtxOptions = {}): any {
  return {
    location: { directory: dir, project: { id: "proj", directory: dir, canonical: dir } },
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
      get: async () => ({}),
    },
    event: {
      subscribe: () => ({
        async *[Symbol.asyncIterator]() {},
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
