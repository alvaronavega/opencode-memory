# opencode-memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um plugin OpenCode local-first que cria e usa uma memória por pasta (`MEMORY.md`), injetando o contexto anterior no system prompt de qualquer modelo e capturando cada turno sem gastar token.

**Architecture:** Um pacote Node/TypeScript (`opencode-memory`) com dois papéis no mesmo código: *supervisor* (instalado globalmente em `~/.config/opencode/plugins/opencode-memory/`, cria a memória em pastas que ainda não têm) e *worker* (cópia dentro de `<projeto>/.opencode/plugins/opencode-memory/`, que gerencia a memória daquela pasta). A lógica pura (paths, config, detecção de projeto, parse/formatação do MEMORY.md, captura, heurística de nota, orçamento de recall) fica em módulos isolados em `src/`, testáveis com `node --test` sem depender da API do OpenCode; a camada de plugin (`src/wiring.ts` + `index.ts`) só amarra a API.

**Tech Stack:** TypeScript (Node >= 24, type stripping nativo), zero dependências de runtime, `node --test`, API de plugin do OpenCode V2 (`Plugin.define`/`setup(ctx)`, `ctx.session.hook("context")`, `ctx.command.transform`, `ctx.tool.transform`, `ctx.event.subscribe()`), PowerShell 5.1 para `instalar.ps1`, bash POSIX para `instalar.sh`.

**Spec:** `docs/superpowers/specs/2026-10-25-memoria-projeto-design.md`

## Global Constraints

- Alvo: OpenCode V2 (`opencode --version` = 2.1.4). API de plugin documentada em `https://opencode.ai/v2/docs/build/plugins/`.
- Zero dependências de runtime. Nenhum daemon, nenhuma porta, nenhum serviço externo, nenhuma chave de API.
- Nada de estado (dados) fora da pasta do projeto. Única exceção: o supervisor global, que é código, não dados.
- Zero chamadas a LLM. Captura e recall são determinísticos.
- O plugin nunca escreve em: home do usuário, `node_modules`, `.git`, `venv`, `.venv`, `dist`, `build`, `target`, `__pycache__`, `%TEMP%`, `%LOCALAPPDATA%`, `Program Files`, `Windows`.
- O plugin nunca sobrescreve `MEMORY.md` existente: append apenas.
- Recall no máximo ~800 tokens estimados; nunca despeja o `MEMORY.md` inteiro no system prompt.
- Compatível com PowerShell 5.1 (sem operador ternário `? :`, sem `??`).
- Repo: `C:\AI\opencode-memory`, branch `main`, remote `alvaronavega/opencode-memory` (público).
- Um único comando de usuário: `/mem`, com subcomandos e `/mem help`.

## Review Focus

1. **`MEMORY.md` editado à mão pelo usuário** (formato desconhecido, seção removida) — o plugin não deve sobrescrever, duplicar cabeçalho nem travar o recall; deve reescrever o arquivo de forma idempotente.
2. **Duas instâncias do OpenCode na mesma pasta** (TUI + `opencode run` em paralelo) — append simultâneo no mesmo arquivo não pode corromper o `MEMORY.md`.
3. **Caminho com espaço, acento ou caractere especial** (`C:\AI\Meus Projetos\ação`) — todo acesso a arquivo e toda menção em log/prompt usa o caminho literal, sem interpolação de shell.
4. **Sessão aberta numa subpasta de um projeto** (ex.: `projeto/src/`) — a memória deve ser a do projeto (diretório canônico do projeto), não uma memória nova por subpasta.
5. **`MEMORY.md` gigante** (arquivo manual de 50 MB) — o recall respeita o orçamento e o plugin não faz leitura completa em memória sem limite.

---

## File Structure

```
C:\AI\opencode-memory\
├── index.ts                    # entry do plugin: export default { id, setup } -> src/wiring.ts
├── src/
│   ├── layout.ts               # caminhos: config global, config de projeto, MEMORY.md, kit
│   ├── config.ts               # tipos + leitura/escrita de memory.json (global e projeto)
│   ├── detect.ts               # heurística "é projeto?" + exclusões
│   ├── memory-file.ts          # parse/append/trim do MEMORY.md
│   ├── capture.ts              # fatos do turno -> entrada de memória
│   ├── notes.ts                # heurística de nota de decisão (regex, sem LLM)
│   ├── recall.ts               # construção do bloco <project-memory> com orçamento
│   ├── kit.ts                  # localizar e copiar o kit para a pasta
│   ├── command.ts              # registro do comando /mem (+ subcomandos + ajuda)
│   ├── tool.ts                 # registro da tool memory_note
│   └── wiring.ts               # setup(ctx): branch supervisor/worker, hooks, eventos
├── tests/
│   ├── helpers.ts             # fakeCtx: registra hooks/comandos/tools e devolve o ctx
│   ├── layout.test.ts
│   ├── config.test.ts
│   ├── detect.test.ts
│   ├── memory-file.test.ts
│   ├── capture.test.ts
│   ├── notes.test.ts
│   ├── recall.test.ts
│   ├── kit.test.ts
│   └── wiring.test.ts          # ctx falso: registra hooks/comandos/tools
├── package.json                # { name, version, type: module, exports, scripts.test }
├── README.md                   # humano: o que é, instalar (3 caminhos), usar, comandos, config
├── INSTALL_FOR_AGENTS.md       # runbook para o próprio agente instalar e verificar
├── AGENTS.md                   # mapa do repo para agentes que trabalharem Nele
├── CHANGELOG.md
├── LICENSE                     # MIT
├── SECURITY.md
├── CONTRIBUTING.md
├── instalar.ps1                # instalador manual Windows (PS 5.1)
├── instalar.sh                 # instalador manual Linux/macOS
└── docs/
    ├── architecture.md
    ├── commands.md
    ├── config.md
    └── troubleshooting.md
```

---

### Task 1: Repo, esqueleto do pacote e spike da API do OpenCode V2

**Files:**
- Create: `package.json`, `index.ts`, `src/wiring.ts`, `LICENSE`, `.gitignore`, `docs/api-notes.md`
- Create: `C:\AI\opencode-memory\tests\wiring.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces:
  - `src/wiring.ts` exporta `export async function setup(ctx: WiringContext): Promise<void>`.
  - `src/wiring.ts` exporta `export type WiringContext = any` (placeholder até o spike fechar o contrato real).
  - `index.ts` faz `export default { id: "opencode-memory", setup }` (sem import de `@opencode/plugin`; o spike decide se isso é aceito).
  - `docs/api-notes.md` registra os fatos observados no spike (nomes de evento, formato do transcript, forma de registrar comando/tool, caminho do config dir).

- [ ] **Step 1: Criar o esqueleto do pacote**

`package.json`:
```json
{
  "name": "opencode-memory",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./index.ts" },
  "scripts": { "test": "node --test tests/" },
  "license": "MIT"
}
```
`.gitignore`: `node_modules/`, `*.log`, `.DS_Store`, `dist/`.
`LICENSE`: MIT,Copyright (c) 2026 Alvaro Navega.

- [ ] **Step 2: Escrever o teste do esqueleto (falha esperada)**

`tests/wiring.test.ts`:
```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { setup } from "../src/wiring.ts"

test("setup registra o comando /mem sem lançar", async () => {
  const calls: string[] = []
  const ctx = {
    location: { directory: process.cwd() },
    command: { transform: async (fn: any) => { calls.push("command") ; fn({ add: () => calls.push("add"), list: () => [], get: () => undefined, remove: () => {} }) } },
    tool: { transform: async () => { calls.push("tool") } },
    session: { hook: async () => ({ dispose: async () => {} }) },
    event: { subscribe: () => ({ async *[Symbol.asyncIterator]() {} }) },
  }
  await setup(ctx as any)
  assert.ok(calls.includes("command"))
})
```
Rodar: `node --test tests/` → esperado: FAIL (`Cannot find module '../src/wiring.ts'`).

- [ ] **Step 3: Implementar o esqueleto mínimo**

`src/wiring.ts` (mínimo, vira o esqueleto do Task 7):
```ts
export type WiringContext = any

export async function setup(ctx: WiringContext): Promise<void> {
  await ctx.command.transform((editor: any) => {
    editor.add({ name: "mem", description: "memoria", execute: async () => {} })
  })
}
```
`index.ts`:
```ts
import { setup } from "./src/wiring.ts"
export default { id: "opencode-memory", setup }
```
Rodar: `node --test tests/` → esperado: PASS.

- [ ] **Step 4: Instalar o pacote no OpenCode e verificar o spike**

```powershell
Copy-Item -Recurse -Force C:\AI\opencode-memory "$HOME\.config\opencode\plugins\opencode-memory"
opencode plugin list
```
Esperado: `opencode-memory` listado, sem erro de carga.

- [ ] **Step 5: Spike de verdade — descobrir o contrato real da API**

Escrever `C:\AI\opencode-memory\scripts\spike.ts` (temporário, não entra no repo) que, num `setup(ctx)`:
1. imprime `Object.keys(ctx)` e `Object.keys(ctx.session)` / `ctx.command` / `ctx.tool`;
2. assina `ctx.event.subscribe()` e imprime `event.type` de cada evento por 20 segundos;
3. registra um hook `ctx.session.hook("context", ...)` que imprime as chaves de `event` (sem imprimir conteúdo de mensagens);
4. registra um tool via `ctx.tool.transform` e um comando via `ctx.command.transform`.

Rodar em duas sessões:
```powershell
opencode run --model minimax/MiniMax-M3.1-Flash-Preview "diga oi e depois rode: git --version"
```
Esperado: o log mostra os nomes reais de evento (procurar `session.idle` ou `session.step.ended`), o shape do evento de transcript e o shape do `event` do hook `context`.

- [ ] **Step 6: Registrar os fatos em `docs/api-notes.md`**

`docs/api-notes.md` deve conter, de forma literal:
- a lista de `event.type` observados no stream (copiar do output do spike);
- o nome exato do evento de fim de turno utilizável para captura;
- a forma do transcript acessível (quais campos existem em cada mensagem/parte);
- a assinatura observada do hook `context` (quais campos pode ser lidos/mutados);
- a confirmação de que `export default { id, setup }` (sem `@opencode/plugin`) é aceito;
- a confirmação de que `editor.add({ name, description, execute })` registra comando executado pelo host sem passar pelo modelo;
- o path efetivo do config dir do OpenCode no Windows.

- [ ] **Step 7: Ajustar `src/wiring.ts` e `index.ts` ao contrato observado**

Se o spike mostrar que o export precisa de `Plugin.define`, trocar `index.ts` para:
```ts
import { Plugin } from "@opencode/plugin"
import { setup } from "./src/wiring.ts"
export default Plugin.define({ id: "opencode-memory", setup })
```
e adicionar `@opencode/plugin` em `devDependencies`. Se mostrar que o export simples funciona, manter como está e registrar o fato em `docs/api-notes.md`.

- [ ] **Step 8: Commit**

```powershell
git add package.json index.ts src/wiring.ts tests/wiring.test.ts LICENSE .gitignore docs/api-notes.md
git commit -m "feat: esqueleto do pacote opencode-memory e spike da API do plugin"
```

---

### Task 2: Paths e configuração (`layout.ts`, `config.ts`)

**Files:**
- Create: `src/layout.ts`, `src/config.ts`, `tests/layout.test.ts`, `tests/config.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `layout.ts`: `export function opencodeConfigDir(env?: NodeJS.ProcessEnv, home?: string): string`
  - `layout.ts`: `export function globalLayout(env?, home?): GlobalLayout` com `{ configDir, configFile, pluginsDir, kitDir }`
  - `layout.ts`: `export function projectLayout(dir: string): ProjectLayout` com `{ dir, memoryFile, opencodeDir, configFile, kitDir }`
  - `config.ts`: `export interface ProjectConfig { version: 1; project: string; enabled: boolean; inject: boolean; maxEntries: number; maxInject: number }`
  - `config.ts`: `export interface GlobalConfig { version: 1; auto: boolean; enabled: boolean }`
  - `config.ts`: `export const DEFAULT_PROJECT_CONFIG: ProjectConfig`, `export const DEFAULT_GLOBAL_CONFIG: GlobalConfig`
  - `config.ts`: `export function readJsonFile<T>(path: string): T | undefined`
  - `config.ts`: `export function readProjectConfig(path: string): ProjectConfig`
  - `config.ts`: `export function writeProjectConfig(path: string, cfg: ProjectConfig): void`
  - `config.ts`: `export function readGlobalConfig(path: string): GlobalConfig`
  - `config.ts`: `export function writeGlobalConfig(path: string, cfg: GlobalConfig): void`

- [ ] **Step 1: Testes falhando**

`tests/layout.test.ts`:
```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { opencodeConfigDir, globalLayout, projectLayout } from "../src/layout.ts"

test("config dir respeita XDG_CONFIG_HOME", () => {
  assert.equal(opencodeConfigDir({ XDG_CONFIG_HOME: "/x/cfg" } as any, "/home/u"), "/x/cfg/opencode")
})

test("config dir usa ~/.config/opencode sem XDG", () => {
  assert.equal(opencodeConfigDir({} as any, "/home/u"), "/home/u/.config/opencode")
})

test("global layout aponta kit dentro de plugins/", () => {
  const g = globalLayout({} as any, "/home/u")
  assert.equal(g.kitDir, "/home/u/.config/opencode/plugins/opencode-memory")
  assert.equal(g.configFile, "/home/u/.config/opencode/memory.json")
})

test("project layout monta MEMORY.md e .opencode/memory.json", () => {
  const p = projectLayout("/w/proj")
  assert.equal(p.memoryFile, "/w/proj/MEMORY.md")
  assert.equal(p.configFile, "/w/proj/.opencode/memory.json")
  assert.equal(p.kitDir, "/w/proj/.opencode/plugins/opencode-memory")
})
```
`tests/config.test.ts`:
```ts
test("config ausente vira defaults", () => {
  const c = readProjectConfig("/nao/existe/memory.json")
  assert.equal(c.version, 1); assert.equal(c.enabled, true); assert.equal(c.maxInject, 15)
})

test("config parcial preserva defaults", () => {
  writeFileSync(join(tmpdir(), "oc-mem-test", "memory.json"), JSON.stringify({ enabled: false }))
  const c = readProjectConfig(join(tmpdir(), "oc-mem-test", "memory.json"))
  assert.equal(c.enabled, false); assert.equal(c.maxInject, 15)
})
```
Rodar: `node --test tests/` → FAIL (módulos inexistentes).

- [ ] **Step 2: Implementar `src/layout.ts` e `src/config.ts`**

`layout.ts` usa `path.join`/`path.resolve` (nunca concatenar string), resolve `~` com `os.homedir()`, e usa `path.sep` do host — nada de `/` hardcoded.

`config.ts`: `readJsonFile` devolve `undefined` em erro de parse ou arquivo ausente; `readProjectConfig` faz merge `{...DEFAULT_PROJECT_CONFIG, ...raw}` ignorando chaves desconhecidas; `writeProjectConfig` grava JSON com 2 espaços + `\n`.

- [ ] **Step 3: Rodar os testes**

`node --test tests/` → PASS (todos).

- [ ] **Step 4: Commit**

```bash
git add src/layout.ts src/config.ts tests/layout.test.ts tests/config.test.ts
git commit -m "feat: paths de layout e leitura/escrita de configuracao"
```

---

### Task 3: Detecção de projeto (`detect.ts`)

**Files:**
- Create: `src/detect.ts`, `tests/detect.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `detect.ts`: `export const PROJECT_MARKERS: readonly string[]`
  - `detect.ts`: `export const EXCLUDED_DIR_NAMES: readonly string[]`
  - `detect.ts`: `export function isExcludedPath(dir: string, home: string): boolean`
  - `detect.ts`: `export function isProjectDir(dir: string, home?: string): boolean`
  - `detect.ts`: `export function findProjectRoot(dir: string, home?: string): string | undefined` — sobe a partir de `dir` até achar a pasta mais próxima que tenha um marker; `undefined` se não achar nenhuma (inclusive quando a subpasta É o projeto, devolve `dir`).
  - `detect.ts`: `export function detectProjectName(dir: string): string`

- [ ] **Step 1: Testes falhando**

`tests/detect.test.ts`:
```ts
test("home do usuário nunca é projeto", () => {
  assert.equal(isProjectDir("/home/u", "/home/u"), false)
})

test("pasta com .git é projeto", () => {
  const dir = mkdtempSync(join(tmpdir(), "proj-"))
  mkdirSync(join(dir, ".git"))
  assert.equal(isProjectDir(dir, homedir()), true)
})

test("node_modules nunca é projeto", () => {
  assert.equal(isProjectDir("/w/proj/node_modules/pkg", "/home/u"), false)
})

test("pasta sem sinal não é projeto", () => {
  assert.equal(isProjectDir(join(tmpdir(), "random-xyz"), homedir()), false)
})

test("caminho com espaço e acento funciona", () => {
  const base = mkdtempSync(join(tmpdir(), "acent-"))
  const dir = join(base, "Meus Projetos", "ação")
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "package.json"), "{}")
  assert.equal(isProjectDir(dir, homedir()), true)
  assert.equal(detectProjectName(dir), "ação")
})

test("findProjectRoot sobe até a raiz do projeto", () => {
  const base = mkdtempSync(join(tmpdir(), "monorepo-"))
  const sub = join(base, "packages", "web")
  mkdirSync(sub, { recursive: true })
  writeFileSync(join(base, "package.json"), "{}")
  assert.equal(findProjectRoot(sub, homedir()), base)
})

test("findProjectRoot devolve undefined fora de projeto", () => {
  const dir = mkdtempSync(join(tmpdir(), "solo-"))
  assert.equal(findProjectRoot(dir, homedir()), undefined)
})
```
Os testes usam diretórios reais criados em `os.tmpdir()` (marker `.git` pode ser arquivo ou diretório).

- [ ] **Step 2: Implementar `src/detect.ts`**

- `PROJECT_MARKERS`: `.git`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `requirements.txt`, `pom.xml`, `build.gradle`, `composer.json`, `Gemfile`, `*.sln`, `*.csproj`.
- `isExcludedPath`: true se algum segmento do caminho for `EXCLUDED_DIR_NAMES`, ou se o caminho está dentro de `home/.config/opencode`, `%TEMP%`, `%LOCALAPPDATA%`, `Program Files`, `Windows`.
- `isProjectDir`: `!isExcludedPath` && `dir !== home` && existe ao menos um marker (arquivo `.git` conta mesmo sendo diretório).
- `findProjectRoot`: sobe a partir de `dir` (inclusive o próprio `dir`) até encontrar a primeira pasta com marker; para na home ou na raiz do sistema; devolve `undefined` se nada encontrado. É essa função que garante que uma sessão aberta em `projeto/src/` use a memória de `projeto/`.
- `detectProjectName`: `path.basename(dir)`, sanitizado para `[A-Za-z0-9._-]`, fallback `"projeto"`.

- [ ] **Step 3: Rodar os testes** → `node --test tests/` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/detect.ts tests/detect.test.ts
git commit -m "feat: deteccao de pastas de projeto"
```

---

### Task 4: Formato do `MEMORY.md` (`memory-file.ts`)

**Files:**
- Create: `src/memory-file.ts`, `tests/memory-file.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `memory-file.ts`: `export type MemoryKind = "turno" | "nota" | "decisao" | "pendencia"`
  - `memory-file.ts`: `export interface MemoryEntry { ts: string; kind: MemoryKind; text: string; files?: string[]; commands?: string[] }`
  - `memory-file.ts`: `export const MEMORY_MARKER = "<!-- opencode-memory:v1 -->"`
  - `memory-file.ts`: `export function parseMemoryFile(content: string): { header: string; entries: MemoryEntry[]; context: string }`
  - `memory-file.ts`: `export function formatEntry(entry: MemoryEntry): string`
  - `memory-file.ts`: `export function buildMemoryFile(project: string, entries: MemoryEntry[], context: string): string`
  - `memory-file.ts`: `export function appendEntries(content: string, entries: MemoryEntry[]): string`
  - `memory-file.ts`: `export function trimEntries(content: string, max: number): { content: string; removed: MemoryEntry[] }`
  - `memory-file.ts`: `export function upsertContext(content: string, context: string): string`
  - `memory-file.ts`: `export function sliceTail(content: string, maxChars: number): string` — devolve só a cauda do arquivo (para não ler 50 MB na memória).

- [ ] **Step 1: Testes falhando**

```ts
test("round-trip: build -> parse devolve as mesmas entradas", () => {
  const entries = [
    { ts: "2026-10-25T14:32:00Z", kind: "turno", text: "criar plugin", files: ["src/memory.ts"], commands: ["npm test (ok)"] },
    { ts: "2026-10-25T14:40:00Z", kind: "nota", text: "vamos usar plugin" },
  ]
  const file = buildMemoryFile("proj", entries, "Node 22 instalado")
  const parsed = parseMemoryFile(file)
  assert.equal(parsed.entries.length, 2)
  assert.equal(parsed.entries[0].files[0], "src/memory.ts")
  assert.equal(parsed.context, "Node 22 instalado")
})

test("append é idempotente: mesmo arquivo, mesmo resultado", () => {
  const a = appendEntries(buildMemoryFile("proj", [], ""), [{ ts: "t", kind: "nota", text: "x" }])
  const b = appendEntries(a, [])
  assert.equal(a, b)
})

test("arquivo editado à mão não quebra o parse", () => {
  const bagunçado = "# Memória do projeto: proj\n\ntexto solto sem formato\n"
  const parsed = parseMemoryFile(bagunçado)
  assert.deepEqual(parsed.entries, [])
  assert.ok(parsed.header.includes("Memória do projeto"))
})

test("trim mantém as últimas N e devolve as removidas", () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ ts: `t${i}`, kind: "turno" as const, text: `e${i}` }))
  const r = trimEntries(buildMemoryFile("p", many, ""), 3)
  assert.equal(r.removed.length, 7)
  assert.equal(parseMemoryFile(r.content).entries.length, 3)
})

test("append não perde entrada quando duas instâncias leem antes de escrever", () => {
  const base = buildMemoryFile("p", [], "")
  const lido1 = base, lido2 = base
  const com1 = appendEntries(lido1, [{ ts: "t1", kind: "turno", text: "a" }])
  const com2 = appendEntries(lido2, [{ ts: "t2", kind: "turno", text: "b" }])
  assert.ok(com1.includes("a")); assert.ok(com2.includes("b"))
  // quem escreve por último relê o disco antes de escrever (garantia do wiring, ver Task 8)
})

test("sliceTail corta o começo e devolve a cauda", () => {
  const grande = "x".repeat(1000) + "FIM"
  assert.ok(sliceTail(grande, 100).endsWith("FIM"))
  assert.ok(sliceTail(grande, 100).length <= 100)
})
```

- [ ] **Step 2: Implementar `src/memory-file.ts`**

Formato de linha (uma por entrada):
`- [2026-10-25T14:32:00Z] turno — "criar plugin" | arquivos: src/memory.ts | comandos: npm test (ok)`

Regras:
- `parseMemoryFile` é tolerante: linhas que não casam o formato são preservadas em `header` (texto livre), nunca lançam.
- `appendEntries` reconstrói a partir do parse: mantém header + contexto, remove a seção `## Registro` anterior e reescreve — idempotente.
- Escrita em disco (no wiring) é atômica: grava em `<arquivo>.tmp` e faz `rename` — duas instâncias do OpenCode nunca deixam o `MEMORY.md` pela metade.
- `upsertContext` substitui o bloco entre `## Contexto do sistema` e o fim da seção.
- Nenhum `Date.now()` dentro das funções puras: o `ts` entra pelo chamador.

- [ ] **Step 3: Rodar os testes** → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/memory-file.ts tests/memory-file.test.ts
git commit -m "feat: formato do arquivo MEMORY.md"
```

---

### Task 5: Captura de turno e heurística de nota (`capture.ts`, `notes.ts`)

**Files:**
- Create: `src/capture.ts`, `src/notes.ts`, `tests/capture.test.ts`, `tests/notes.test.ts`

**Interfaces:**
- Consumes: `MemoryEntry`, `MemoryKind` de `src/memory-file.ts`.
- Produces:
  - `capture.ts`: `export interface TurnFacts { prompt: string; files: string[]; commands: string[]; title?: string }`
  - `capture.ts`: `export function factsFromTranscript(transcript: unknown): TurnFacts`
  - `capture.ts`: `export function summarizeFacts(facts: TurnFacts, now: string, maxLen?: number): MemoryEntry`
  - `notes.ts`: `export const DECISION_MARKERS: readonly string[]`
  - `notes.ts`: `export function looksLikeDecision(text: string): boolean`
  - `notes.ts`: `export function extractNote(text: string): string | undefined`

- [ ] **Step 1: Testes falhando**

```ts
test("factsFromTranscript extrai prompt, arquivos e comandos", () => {
  const facts = factsFromTranscript({
    messages: [
      { role: "user", text: "arrume o login" },
      { role: "assistant", parts: [
        { type: "tool", name: "edit", path: "src/auth.ts" },
        { type: "tool", name: "bash", command: "npm test", status: "ok" },
      ]},
    ],
  })
  assert.equal(facts.prompt, "arrume o login")
  assert.deepEqual(facts.files, ["src/auth.ts"])
  assert.deepEqual(facts.commands, ["npm test (ok)"])
})

test("summarizeFacts trunca o prompt e ordena os arquivos", () => {
  const e = summarizeFacts({ prompt: "x".repeat(500), files: ["b.ts", "a.ts"], commands: [] }, "2026-10-25T00:00:00Z", 50)
  assert.equal(e.text.length, 50)
  assert.deepEqual(e.files, ["a.ts", "b.ts"])
})

test("looksLikeDecision detecta 'vamos usar' e ignora pergunta", () => {
  assert.equal(looksLikeDecision("vamos usar o plugin em vez do MCP"), true)
  assert.equal(looksLikeDecision("o que é isso?"), false)
})

test("extractNote devolve undefined sem marcador", () => {
  assert.equal(extractNote("apenas um texto"), undefined)
})
```
> Nota de implementação: `factsFromTranscript` recebe uma **estrutura normalizada** (`{ messages: [...] }`), não o shape cru do OpenCode. O adaptador para o shape real fica em `src/wiring.ts` (Task 7) e é ajustado conforme `docs/api-notes.md`.

- [ ] **Step 2: Implementar `src/capture.ts` e `src/notes.ts`**

- `DECISION_MARKERS`: `decidimos`, `decidido`, `vamos usar`, `vou usar`, `passa a usar`, `escolhi`, `adotar`, `em vez de`, `porque`.
- `looksLikeDecision`: busca case-insensitive por qualquer marcador; require ao menos 8 caracteres na frase.
- `extractNote`: devolve a primeira frase do usuário que contém marcador, trimmed, máximo 300 chars; `undefined` se nenhuma.
- `summarizeFacts`: `text` = prompt truncado com `…`; `files` deduplicado e ordenado; `commands` como `"<cmd> (<status>)"`.

- [ ] **Step 3: Rodar os testes** → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/capture.ts src/notes.ts tests/capture.test.ts tests/notes.test.ts
git commit -m "feat: captura de turno e heuristica de nota"
```

---

### Task 6: Orçamento de recall (`recall.ts`)

**Files:**
- Create: `src/recall.ts`, `tests/recall.test.ts`

**Interfaces:**
- Consumes: `MemoryEntry` de `src/memory-file.ts`.
- Produces:
  - `recall.ts`: `export interface RecallInput { project: string; path: string; entries: MemoryEntry[]; context: string; maxInject: number }`
  - `recall.ts`: `export function buildRecall(input: RecallInput): string`
  - `recall.ts`: `export function estimateTokens(text: string): number` (`Math.ceil(text.length / 4)`)

- [ ] **Step 1: Testes falhando**

```ts
test("recall inclui notas antes das atividades", () => {
  const out = buildRecall({
    project: "proj", path: "/w/proj",
    entries: [
      { ts: "2026-10-25T10:00:00Z", kind: "nota", text: "decidimos usar plugin" },
      { ts: "2026-10-25T11:00:00Z", kind: "turno", text: "arrumei o login" },
    ],
    context: "Node 22", maxInject: 15,
  })
  assert.ok(out.indexOf("decidimos usar plugin") < out.indexOf("arrumei o login"))
})

test("recall respeita maxInject", () => {
  const entries = Array.from({ length: 50 }, (_, i) => ({ ts: `t${i}`, kind: "turno" as const, text: `e${i}` }))
  const out = buildRecall({ project: "p", path: "/p", entries, context: "", maxInject: 5 })
  assert.equal((out.match(/^- /gm) || []).length <= 20, true)
})

test("recall nunca ultrapassa o orçamento", () => {
  const entries = Array.from({ length: 500 }, (_, i) => ({ ts: `t${i}`, kind: "turno" as const, text: "x".repeat(400) }))
  const out = buildRecall({ project: "p", path: "/p", entries, context: "c".repeat(2000), maxInject: 15 })
  assert.ok(estimateTokens(out) <= 800)
})
```

- [ ] **Step 2: Implementar `src/recall.ts`**

Formato do bloco:
```
<project-memory project="proj" path="/w/proj">
Memória do projeto (N entradas, última em <ts>).

Notas e decisões:
- <ts> — <texto>

Atividades recentes:
- <ts> — <texto>

Contexto do sistema:
<contexto>

Se algo novo e não-óbvio for decidido, registre com a tool memory_note.
Para o histórico completo, leia MEMORY.md.
</project-memory>
```
Regras de orçamento: notas primeiro (máx. 10), depois atividades (máx. `maxInject`), e o bloco final **sempre** é truncado para 800 tokens estimados, cortando pelo final das atividades.

- [ ] **Step 3: Rodar os testes** → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/recall.ts tests/recall.test.ts
git commit -m "feat: bloco de recall com orcamento de tokens"
```

---

### Task 7: Kit, tool e comando `/mem` (`kit.ts`, `tool.ts`, `command.ts`)

**Files:**
- Create: `src/kit.ts`, `src/tool.ts`, `src/command.ts`, `tests/helpers.ts`, `tests/kit.test.ts`, `tests/command.test.ts`

**Interfaces:**
- Consumes: `projectLayout`, `readProjectConfig`, `writeProjectConfig` (Task 2), `isProjectDir`, `detectProjectName` (Task 3), `buildMemoryFile`, `appendEntries`, `parseMemoryFile` (Task 4), `MemoryEntry` (Task 4).
- Produces:
  - `kit.ts`: `export function kitSourceDir(): string` — diretório do próprio pacote (via `import.meta.url`).
  - `kit.ts`: `export function copyKit(dest: string): { copied: boolean; files: string[] }` — copia recursivamente ignorando `node_modules`, `.git`, `tests`; nunca sobrescreve `index.ts` existente sem `--force`.
  - `kit.ts`: `export function hasLocalKit(kitDir: string): boolean`
  - `tool.ts`: `export function registerMemoryNote(ctx: any): Promise<void>` — registra a tool `memory_note` com input `{ texto: string; tipo?: "nota" | "decisao" | "pendencia" }`, que faz append no `MEMORY.md` do projeto da sessão.
  - `command.ts`: `export const HELP_TEXT: string`
  - `command.ts`: `export function registerMemCommand(ctx: any): Promise<void>` — registra o comando `mem` com `description: "Memória do projeto — /mem help para os subcomandos"`.
  - `command.ts`: `export type MemSubcommand = "status" | "help" | "init" | "on" | "off" | "show" | "archive" | "forget" | "doctor"`
  - `tests/helpers.ts`: `export function fakeCtx(dir: string, calls: any[], opts?: { hooks?: any[] }): any` — ctx falso que registra `ctx.command.transform`, `ctx.tool.transform`, `ctx.session.hook` e `ctx.event.subscribe`.

- [ ] **Step 1: Testes falhando**

`tests/kit.test.ts`:
```ts
test("copyKit copia o pacote e não sobrescreve sem force", () => {
  const dest = mkdtempSync(join(tmpdir(), "kit-"))
  const r = copyKit(dest)
  assert.equal(r.copied, true)
  assert.ok(existsSync(join(dest, "index.ts")))
  const r2 = copyKit(dest)
  assert.equal(r2.copied, false)
})
```
`tests/command.test.ts`:
```ts
test("/mem sem argumento devolve status", async () => {
  const calls: any[] = []
  await registerMemCommand(fakeCtx(process.cwd(), calls))
  const def = calls.find(c => c.name === "mem")
  assert.ok(def)
  assert.ok(def.description.includes("/mem help"))
})

test("/mem help devolve a ajuda com todos os subcomandos", async () => {
  const calls: any[] = []
  await registerMemCommand(fakeCtx(process.cwd(), calls))
  const def = calls.find(c => c.name === "mem")
  const out = await def.execute({ sessionID: "s", prompt: { text: "help" }, delivery: "steer" })
  for (const sub of ["init", "on", "off", "show", "archive", "forget", "doctor"]) {
    assert.ok(out.text.includes(`/${sub}`), `falta ${sub}`)
  }
})
```
O `fakeCtx` (em `tests/helpers.ts`) registra o que foi passado a `ctx.command.transform`.

- [ ] **Step 2: Implementar `kit.ts`**

- `kitSourceDir()`: `path.dirname(fileURLToPath(import.meta.url))` → subir um nível até a raiz do pacote.
- `copyKit(dest)`: copia `index.ts`, `src/`, `package.json`, `README.md` (se existirem); ignora `node_modules`, `.git`, `tests`, `docs`; devolve `{ copied: false }` se `dest/index.ts` já existir.

- [ ] **Step 3: Implementar `tool.ts`**

`memory_note` executa: lê config do projeto da sessão, localiza `MEMORY.md`, faz `appendEntries` com `{ ts: new Date().toISOString(), kind: tipo ?? "nota", text: texto }`, responde `{"content": "nota registrada"}`. Nunca lança: em erro, retorna `content` com a mensagem de erro.

- [ ] **Step 4: Implementar `command.ts`**

- `HELP_TEXT` lista: `status` (padrão), `help`, `init`, `on`, `off`, `show`, `archive`, `forget`, `doctor`, com uma linha de descrição cada.
- `execute({ sessionID, prompt })`:
  - parse do primeiro token de `prompt.text` (lowercase, sem `$`) como subcomando; default `status`.
  - `help` → devolve `HELP_TEXT`.
  - `status` → devolve estado: existe `MEMORY.md`? quantas entradas? última data? injetando (sim/não)?
  - `init` → cria `MEMORY.md` (via `buildMemoryFile`), `.opencode/memory.json` e copia o kit; **não** sobrescreve `MEMORY.md` existente (avisa).
  - `on`/`off` → alterna `enabled`/`inject` no config do projeto.
  - `show` → devolve o conteúdo do `MEMORY.md`.
  - `archive` → move entradas além de `maxEntries` para `MEMORY-arquivo.md`.
  - `forget` → se o texto tiver `--yes`, apaga `MEMORY.md`, `.opencode/memory.json` e o kit local; senão devolve o texto de confirmação com o comando exato.
  - `doctor` → verifica config, existência do MEMORY.md, kit local vs global, permissões de escrita, e diz o que está errado.
- Toda saída é texto puro (string), devolvida ao host; **nenhum** prompt é enviado ao modelo.

- [ ] **Step 5: Rodar os testes** → `node --test tests/` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/kit.ts src/tool.ts src/command.ts tests/kit.test.ts tests/command.test.ts
git commit -m "feat: copia do kit, tool memory_note e comando /mem"
```

---

### Task 8: Wiring do plugin (`src/wiring.ts`, `index.ts`) e comportamento automático

**Files:**
- Modify: `src/wiring.ts`, `index.ts`
- Create: `tests/wiring.test.ts` (reescrever), `docs/api-notes.md` (ajustes)

**Interfaces:**
- Consumes: tudo das Tasks 2–7 + `docs/api-notes.md` (contrato real da API).
- Produces:
  - `src/wiring.ts`: `export async function setup(ctx: WiringContext): Promise<void>` — branch supervisor/worker, hook de recall, captura, registro de command/tool.
  - `src/wiring.ts`: `export function decideRole(dir: string, hasLocalKit: boolean): "supervisor" | "worker"`

- [ ] **Step 1: Reescrever o teste do wiring (falha esperada)**

```ts
test("pasta com kit local = worker, sem kit = supervisor", () => {
  assert.equal(decideRole("/w/p", true), "worker")
  assert.equal(decideRole("/w/p", false), "supervisor")
})

test("setup como supervisor cria os arquivos da memória em pasta de projeto", async () => {
  const dir = mkdtempSync(join(tmpdir(), "proj-"))
  writeFileSync(join(dir, "package.json"), "{}")
  const calls: any[] = []
  await setup(fakeCtx(dir, calls))
  assert.ok(existsSync(join(dir, "MEMORY.md")))
  assert.ok(existsSync(join(dir, ".opencode", "memory.json")))
})

test("setup injeta o recall uma vez por sessão", async () => {
  const hooks: any[] = []
  const ctx = fakeCtx(dir, [], { hooks })
  await setup(ctx)
  hooks[0].handler({ system: [], messages: [] })
  hooks[0].handler({ system: [], messages: [] })
  assert.equal(hooks[0].handler.mock.calls.filter((c: any[]) => c[0].system.length > 0).length, 1)
})

test("setup nunca cria memória na home", async () => {
  const dir = join(homedir(), "..", "..")
  const calls: any[] = []
  await setup(fakeCtx(dir, calls))
  assert.equal(existsSync(join(dir, "MEMORY.md")), false)
})

test("sessão em subpasta usa a memória da raiz do projeto", async () => {
  const base = mkdtempSync(join(tmpdir(), "mono-"))
  const sub = join(base, "src", "app")
  mkdirSync(sub, { recursive: true })
  writeFileSync(join(base, "package.json"), "{}")
  const calls: any[] = []
  await setup(fakeCtx(sub, calls))
  assert.ok(existsSync(join(base, "MEMORY.md")))
  assert.equal(existsSync(join(sub, "MEMORY.md")), false)
})
```

- [ ] **Step 2: Implementar `src/wiring.ts`**

Fluxo do `setup(ctx)`:
1. `const dir = ctx.location.directory`.
2. `const root = findProjectRoot(dir, homedir())` — a memória é a da **raiz do projeto**, não a da subpasta. `root` pode ser `undefined`: nesse caso o plugin não cria nada e apenas registra `/mem` (que sugere `/mem init`).
3. `const layout = projectLayout(root ?? dir)`.
4. `const role = decideRole(root ?? dir, hasLocalKit(layout.kitDir))`.
5. Se `supervisor`: se `enabled` global e `auto` global e `isProjectDir(root)` e não existe `MEMORY.md` → cria `MEMORY.md` + `.opencode/memory.json` + copia o kit. **Não** registra hook de recall (o worker local faz isso a partir da próxima sessão), mas registra o comando `/mem` para o usuário poder usar já.
6. Se `worker`: garante `MEMORY.md` e config existem; registra o hook `context` (injeta recall **uma vez por sessão**, usando um `Set` de sessionIDs); registra o handler de captura; registra `memory_note`; registra `/mem`.
7. Todos os handlers dentro de `try/catch`: exceção vira uma linha no log, nunca derruba a sessão.

Leitura e escrita do `MEMORY.md` (usado pela captura e pela tool):
- ler com `fs.statSync`; se o arquivo passar de 512 KB, ler só a cauda (`sliceTail`, 512 KB) — nunca carregar 50 MB na memória;
- antes de escrever, **reler o disco** (outra instância pode ter escrito) e só então aplicar `appendEntries`;
- escrever em `<arquivo>.tmp` e fazer `rename` (escrita atômica).

Captura (usando os nomes de evento confirmados no spike):
- no evento de fim de turno (`session.idle` ou `session.step.ended`, conforme `docs/api-notes.md`), montar `TurnFacts` a partir do transcript e anexar a entrada em `MEMORY.md` (append), aplicando `trimEntries` com `maxEntries`.
- Se a checagem de decisão (`looksLikeDecision`) for verdadeira no prompt do usuário, anexar **duas** entradas: uma `turno` e uma `nota`.

- [ ] **Step 3: Rodar os testes** → `node --test tests/` → PASS.

- [ ] **Step 4: Verificação manual ponta a ponta**

```powershell
# projeto de teste
$p = "$env:TEMP\memproj"; New-Item -ItemType Directory -Force $p | Out-Null; Set-Content "$p\package.json" "{}"
cd $p; opencode
```
Esperado: `MEMORY.md` e `.opencode/memory.json` criados; `/mem` responde status; `/mem help` mostra os subcomandos; após um turno, `MEMORY.md` tem uma linha `turno`; numa sessão nova, o system prompt contém `<project-memory`.

- [ ] **Step 5: Commit**

```bash
git add src/wiring.ts index.ts tests/wiring.test.ts docs/api-notes.md
git commit -m "feat: wiring do plugin com recall, captura e bootstrap automatico"
```

---

### Task 9: Documentação, instaladores e publicação

**Files:**
- Create: `README.md`, `INSTALL_FOR_AGENTS.md`, `AGENTS.md`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, `instalar.ps1`, `instalar.sh`, `docs/architecture.md`, `docs/commands.md`, `docs/config.md`, `docs/troubleshooting.md`
- Modify: `package.json` (versão para `0.1.0`)

**Interfaces:**
- Consumes: o comportamento final das Tasks 1–8.
- Produces: os três caminhos de instalação e o guia para agentes.

- [ ] **Step 1: Escrever `instalar.ps1` (PowerShell 5.1, idempotente)**

Conteúdo obrigatório: detectar `$HOME\.config\opencode\plugins`; copiar o pacote do próprio diretório do script; escrever `memory.json` global com `auto: true`; imprimir o que fez; `-Force` para reinstalar; `-Uninstall` para remover. Sem operador ternário, sem `??`.

```powershell
param([switch]$Force, [switch]$Uninstall)
```
Usar `Join-Path`, `Test-Path`, `Copy-Item -Recurse`, `New-Item -ItemType Directory -Force`.

- [ ] **Step 2: Escrever `instalar.sh` (bash POSIX)**

Mesma semântica: `--force`, `--uninstall`, instalar em `${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins/opencode-memory`.

- [ ] **Step 3: Escrever `README.md`**

Seções: o que é (problema e solução), como funciona (supervisor + worker, diagrama ASCII do fluxo), **três formas de instalar** (copiar o kit; `opencode plugin add git+https://github.com/alvaronavega/opencode-memory.git`; rodar `instalar.ps1` / `instalar.sh`), uso (o que acontece ao abrir uma pasta), comandos (`/mem` + subcomandos), config (`memory.json` global e de projeto), privacidade (tudo local, nada sai da máquina, plaintext), limitações (sem LLM, sem busca cross-project), troubleshooting (link para `docs/troubleshooting.md`).

- [ ] **Step 4: Escrever `INSTALL_FOR_AGENTS.md`**

Runbook para um agente instalar sozinho: pré-requisitos (Node >= 24, git), passos numerados com comando exato, como verificar (`opencode plugin list`, criar pasta de teste, `/mem status`), como reportar sucesso/falha, e a URL canônica do próprio arquivo. Endereço:
`https://raw.githubusercontent.com/alvaronavega/opencode-memory/main/INSTALL_FOR_AGENTS.md`

- [ ] **Step 5: Escrever `AGENTS.md`, `docs/*.md`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`**

`docs/architecture.md`: fluxo supervisor/worker, hook de recall, captura, formato do arquivo, onde ficam os dados.
`docs/commands.md`: referência completa do `/mem`.
`docs/config.md`: `memory.json` global e de projeto, cada chave, valores padrão.
`docs/troubleshooting.md`: sintoma → causa → solução (plugin não carrega, MEMORY.md não criado, recall não aparece, permissão negada, pasta com acento/espaço, duas instâncias simultâneas).

- [ ] **Step 6: Validar os scripts**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\instalar.ps1 -Uninstall
powershell -NoProfile -ExecutionPolicy Bypass -File .\instalar.ps1
opencode plugin list
```
Esperado: instalar, listar o plugin, e o `instalar.ps1 -Uninstall` remover sem erro. Rodar `bash -n instalar.sh` se houver bash disponível; senão, revisar sintaxe manualmente e registrar a limitação no PR.

- [ ] **Step 7: Rodar a suíte completa e o lint básico**

```bash
node --test tests/
```
Esperado: todos PASS.

- [ ] **Step 8: Publicar**

```powershell
git add -A
git commit -m "docs: documentacao completa e instaladores"
gh repo create alvaronavega/opencode-memory --public --source . --remote origin --push
git tag v0.1.0
git push origin main --tags
gh release create v0.1.0 --title "v0.1.0" --notes "Primeira versão: memória por pasta para OpenCode."
```
Esperado: repo público acessível em `https://github.com/alvaronavega/opencode-memory` e a URL raw do `INSTALL_FOR_AGENTS.md` respondendo 200.

- [ ] **Step 9: Verificação final do fluxo agente-instala**

Em uma pasta limpa, pedir a um OpenCode:
```
Leia https://raw.githubusercontent.com/alvaronavega/opencode-memory/main/INSTALL_FOR_AGENTS.md e siga os passos.
```
Esperado: o agente instala o plugin e cria a memória na pasta.

- [ ] **Step 10: Commit final**

```bash
git add -A
git commit -m "chore: release v0.1.0" --allow-empty
```

---

## Notas de execução

- **Ordem obrigatória.** Task 1 (spike) antes de tudo: o contrato real da API é a maior incerteza do projeto, e as Tasks 7–8 dependem dele.
- **Testes sem OpenCode.** As Tasks 2–7 são 100% testáveis com `node --test` (Node >= 24 faz type stripping nativo). A Task 8 usa um `ctx` falso; a verificação real é manual.
- **Nada de LLM em código de produção.** Nenhuma task pode chamar modelo, API externa ou usar `fetch`.
- **Commits frequentes.** Um commit por task, mensagem no formato `feat:`/`docs:`/`chore:`.
