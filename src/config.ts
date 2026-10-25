import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export interface ProjectConfig {
  version: 1
  project: string
  enabled: boolean
  inject: boolean
  maxEntries: number
  maxInject: number
}

export interface GlobalConfig {
  version: 1
  auto: boolean
  enabled: boolean
}

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  version: 1,
  project: "",
  enabled: true,
  inject: true,
  maxEntries: 100,
  maxInject: 15,
}

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  version: 1,
  auto: true,
  enabled: true,
}

/** Lê um JSON. Devolve undefined se o arquivo não existir ou for inválido. */
export function readJsonFile<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch {
    return undefined
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8")
}

/** Config do projeto. Arquivo ausente, quebrado ou parcial vira defaults; chaves desconhecidas são ignoradas. */
export function readProjectConfig(path: string): ProjectConfig {
  const raw = readJsonFile<Record<string, unknown>>(path)
  const num = (value: unknown, fallback: number, min: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= min ? Math.floor(value) : fallback
  return {
    version: 1,
    project: typeof raw?.project === "string" ? raw.project : DEFAULT_PROJECT_CONFIG.project,
    enabled: typeof raw?.enabled === "boolean" ? raw.enabled : DEFAULT_PROJECT_CONFIG.enabled,
    inject: typeof raw?.inject === "boolean" ? raw.inject : DEFAULT_PROJECT_CONFIG.inject,
    maxEntries: num(raw?.maxEntries, DEFAULT_PROJECT_CONFIG.maxEntries, 1),
    maxInject: num(raw?.maxInject, DEFAULT_PROJECT_CONFIG.maxInject, 0),
  }
}

export function writeProjectConfig(path: string, config: ProjectConfig): void {
  writeJson(path, config)
}

/** Config global (o kill switch e o auto-bootstrap). */
export function readGlobalConfig(path: string): GlobalConfig {
  const raw = readJsonFile<Record<string, unknown>>(path)
  return {
    version: 1,
    auto: typeof raw?.auto === "boolean" ? raw.auto : DEFAULT_GLOBAL_CONFIG.auto,
    enabled: typeof raw?.enabled === "boolean" ? raw.enabled : DEFAULT_GLOBAL_CONFIG.enabled,
  }
}

export function writeGlobalConfig(path: string, config: GlobalConfig): void {
  writeJson(path, config)
}
