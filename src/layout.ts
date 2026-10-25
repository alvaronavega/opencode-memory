import { homedir } from "node:os"
import { join } from "node:path"

export interface GlobalLayout {
  /** ~/.config/opencode (ou $XDG_CONFIG_HOME/opencode) */
  configDir: string
  /** ~/.config/opencode/memory.json */
  configFile: string
  /** ~/.config/opencode/plugins */
  pluginsDir: string
  /** ~/.config/opencode/plugins/opencode-memory */
  kitDir: string
}

export interface ProjectLayout {
  /** raiz do projeto */
  dir: string
  /** <projeto>/MEMORY.md */
  memoryFile: string
  /** <projeto>/.opencode */
  opencodeDir: string
  /** <projeto>/.opencode/memory.json */
  configFile: string
  /** <projeto>/.opencode/plugins/opencode-memory */
  kitDir: string
}

/** Diretório de configuração do OpenCode. `$XDG_CONFIG_HOME` tem precedência quando definido e não-vazio. */
export function opencodeConfigDir(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const xdg = env.XDG_CONFIG_HOME
  const base = xdg && xdg.trim() !== "" ? xdg : join(home, ".config")
  return join(base, "opencode")
}

/** Caminhos do ambiente global (fora de qualquer projeto). */
export function globalLayout(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): GlobalLayout {
  const configDir = opencodeConfigDir(env, home)
  const pluginsDir = join(configDir, "plugins")
  return {
    configDir,
    configFile: join(configDir, "memory.json"),
    pluginsDir,
    kitDir: join(pluginsDir, "opencode-memory"),
  }
}

/** Caminhos da memória dentro de um projeto. */
export function projectLayout(dir: string): ProjectLayout {
  const opencodeDir = join(dir, ".opencode")
  return {
    dir,
    memoryFile: join(dir, "MEMORY.md"),
    opencodeDir,
    configFile: join(opencodeDir, "memory.json"),
    kitDir: join(opencodeDir, "plugins", "opencode-memory"),
  }
}
