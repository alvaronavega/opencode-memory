# Notas da API de plugin do OpenCode V2

Fatos observados **em execução real** (OpenCode 2.1.4, Windows, 2026-10-25), não da documentação.
Método: plugin de sondagem instalado em `~/.config/opencode/plugins/spike-memory/index.ts`,
que logou `ctx.event.subscribe()` e o hook `context` durante uma sessão real.

## Contrato do plugin

- Export **default** com `id` e `setup(ctx)` funciona. **Não** precisa de `import { Plugin } from "@opencode/plugin"`.
  O loader rejeita com *"Plugin must export a default definition with an id and an effect or setup function."* quando falta o `default`.
- `setup` pode devolver uma função de cleanup (descarte no unload).
- `opencode plugin list` mostra `ID` = `plugin.id` e `SOURCE` = caminho do entrypoint (`index.ts`).
- **O `setup` roda uma vez por location** (não uma vez global): com 5 locations ativos, houve 5 instâncias
  do plugin — cada uma com seu próprio `setup` e seu próprio `event.subscribe`.
  Consequência: cada instância do plugin global **vê os eventos de todas as sessões**, não só da sua location.
  → Filtrar tudo por `sessionID` e por location.

## `ctx` (chaves observadas)

```
app, location, options, agent, aisdk, command, credential, event, experimental, generate, model,
provider, integration, mcp, permission, plugin, reference, rpc, skill, storage, tool, vcs,
websearch, worktree, session, shell
```

- `ctx.location` = `{ directory, project: { id, directory, canonical } }`.
- `ctx.session` = `hook, list, create, get, remove, switchAgent, switchModel, prompt, generate,
  command, compact, synthetic, interrupt, update, move, wait, context`.
- `ctx.command` = `list, transform, reload`.
- `ctx.tool` = `reload, list, transform, hook`.
- `ctx.event` = `subscribe`.
- `ctx.storage` = `get, set, remove, scan`.

## Hook `context` (usado para injetar o recall)

Evento recebido:

```ts
{
  sessionID: string
  model: { id, providerID, variant }
  system: [{ type: "text", text: string }]   // ← empurrar aqui
  messages: [ ...transcript... ]
  options: { maxTokens?: number }
  agent: string
  tools: { [nome]: { description, input } }
}
```

- Roda em **toda** chamada ao modelo (loop do agente + continuações por tool).
- `event.system.push({ type: "text", text })` injeta memória no system prompt de **qualquer modelo**.
- `event.sessionID` permite injetar **uma vez por sessão**.

## Transcript (`event.messages`)

Formato observado:

```ts
{ id: "msg_...", role: "user" | "assistant" | "tool", content: [ ...partes ], metadata?: {...} }
```

Partes:

| role | tipo de parte | campos |
|---|---|---|
| user | `text` | `{ type, text }` |
| assistant | `reasoning` | `{ type, text, providerMetadata }` |
| assistant | `tool-call` | `{ type, id, name, input, providerExecuted }` |
| assistant | `text` | `{ type, text }` (resposta final) |
| tool | `tool-result` | `{ type, id, name, result, providerExecuted }` |

**`name` da tool só existe no transcript** (partes `tool-call`/`tool-result`), não nos eventos.
`input` da tool-call carrega o payload real: `write` → `{ path, content }`; `shell` → `{ command, workdir }`.

## Eventos (`ctx.event.subscribe()`)

Envelope: `{ id, created, type, durable?, location?, data }`.

| evento | `data` |
|---|---|
| `session.inbox.enqueued` | `{ sessionID, inboxID, item: { type: "user", payload: { text, files[] }, delivery } }` |
| `session.step.started` | `{ sessionID, assistantMessageID, agent, model, started }` |
| `session.step.ended` | `{ sessionID, assistantMessageID, finish, rawFinish, cost, tokens }` |
| `session.execution.started` / `.succeeded` | `{ sessionID }` |
| `session.tool.called` | `{ sessionID, assistantMessageID, id, input, executed }` — **sem o nome da tool** |
| `session.tool.success` | `{ sessionID, assistantMessageID, id, content: [{type,text}], metadata, executed }` |
| `session.tool.progress` | `{ sessionID, assistantMessageID, id, metadata }` |
| `session.text.started/.delta/.ended` | streaming de texto |
| `session.reasoning.started/.delta/.ended` | streaming de raciocínio |
| `session.usage.updated` | uso de tokens |
| `session.renamed` | título da sessão |
| `session.instructions.updated` | AGENTS.md mudou |
| `mcp.status.changed`, `model.updated`, `agent.updated`, `plugin.updated`, `project.updated`, `provider.updated`, `skill.updated`, `command.updated`, `integration.updated`, `reference.updated`, `shell.created`, `shell.exited`, `websearch.updated` | metadados |

### `finish` — fim de turno

`session.step.ended` traz `finish`:

- `"tool-calls"` → o modelo pediu mais ferramentas, **o turno continua**;
- `"stop"` → **turno concluído**.

Valores observados: `tool-calls` (raw `tool_calls`) e `stop` (raw `stop`).

**Regra de captura:** gravar a entrada quando `finish !== "tool-calls"`.

## Armadilhas observadas

1. **Prompt chega com aspas duplas literais.** `payload.text` e a parte `text` do role `user` vieram como
   `"\"crie o arquivo...\""` — o texto real inclui as aspas. Parse com `JSON.parse` (fallback: remover
   aspas das pontas) antes de gravar.
2. **Um plugin global é instanciado por location** e cada instância recebe os eventos de **todas** as
   sessões. Sem filtro por `sessionID`, a mesma escrita acontece N vezes.
3. **`ctx.event.subscribe()` não tem `location` no envelope de todos os eventos** — filtrar pelo
   `sessionID` e comparar com a location da instância.
4. **`opencode plugin list` mostra ID `-`** quando o módulo falha ao carregar (ex.: import quebrado).
   O log do servidor mostra `failed to load plugin ... cause=Cause([Die(ResolveMessage: ...)]))`.
5. **`Copy-Item -Recurse -Force <dir> <dest>` achata o conteúdo** (copia `src/` como `dest/*.ts`).
   Copiar o *conteúdo* explicitamente ou usar `Copy-Item -Recurse <dir> <dest>` sem `dest` pré-existente.
6. **O `opencode run` no Windows pode repassar aspas do prompt** — não é bug do plugin, mas afeta o que
   é gravado na memória.

## Caminho do config dir no Windows

Efetivo: `C:\Users\alvar\.config\opencode\`
- `opencode.json` (config do servidor)
- `cli.json` (preferências do terminal)
- `plugins/` (plugins globais — arquivos `.js`/`.ts` avulsos **e** diretórios de pacote)
- `AGENTS.md` (instruções globais)

`$XDG_CONFIG_HOME` tem precedência quando definido.

## Como registrar comando e tool (confirmado)

```ts
await ctx.command.transform((editor) => {
  editor.add({
    name: "mem",
    description: "Memória do projeto — /mem help para os subcomandos",
    // ⚠️ devolve void: o valor de retorno é DESCARTADO pelo host.
    // A saída tem de ir por ctx.session.synthetic(...) (ver "Spike 3").
    execute: async ({ sessionID, prompt, delivery }) => {
      await ctx.session.synthetic({ sessionID, text: "…", resume: false })
    },
  })
})

await ctx.tool.transform((editor) => {
  editor.add({
    name: "memory_note",
    description: "…",
    input: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"], additionalProperties: false },
    options: { namespace: "memoria", codemode: true },
    execute: async (input) => ({ content: "ok" }),
  })
})
```

- O tool registrado aparece no catálogo como `tools.<namespace>.<name>` (Code Mode) — confirmado:
  a tool de sondagem apareceu como `spike.spike_tool`.
- O comando registrado não passa pelo modelo: o `execute` roda no host. **Mas o valor de retorno
  é ignorado** — ver "Spike 3" abaixo (correção do que se acreditava antes).

---

## Spike 3 — o comando de plugin roda no host? (verificado 2026-10-25, OpenCode 2.1.4)

**Resposta: sim, mas só quando o *cliente* despacha o slash command.** O `execute` roda no host,
sem passar pelo modelo — e o que ele devolve é **descartado**.

### Contrato real do `editor.add` (fonte: `packages/plugin/src/promise/command.ts`)

```ts
interface CommandDefinition {
  name: string
  description?: string
  execute: (input: CommandInvocation) => Promise<void>   // ← void
}
interface CommandInvocation {
  sessionID: string
  prompt: { text: string; files?; agents?; skills? }
  delivery: "steer" | …
}
```

- O chamador é `Command.execute({ name, invocation })` → `definition.execute(invocation)`; o
  resultado é descartado (`Effect<void, unknown>`).
- **`execute` NÃO devolve `{ content }`** — a nota anterior neste arquivo estava errada.
  A saída do `/mem` tem de ir por `ctx.session.synthetic(...)` (ou o comando escreve arquivo/log).

### Quem despacha o slash command (e quem não)

| cliente | o que acontece com "/mem" |
|---|---|
| TUI / app | confere se o nome existe na lista da location (`GET /api/command`) → chama `POST /api/session/{id}/command` → o host executa o callback. **Não passa pelo modelo.** |
| `opencode run "/mem"` (headless) | o texto vai como prompt (`POST /api/session/{id}/prompt`). **Não há dispatch**: o modelo recebe "/mem" literal. |

Evidência: `packages/tui/src/component/prompt/index.tsx` chama `client.api.session.command({...})`
quando `slashHead && isCommand`; `packages/cli/src/run/noninteractive.ts` não menciona `command`
nenhuma vez (medido: prompt "/spikeprobe" → modelo chamado, 8.925 tokens de input, callback nunca executou).

### Endpoints (OpenAPI do servidor)

- `GET /api/command` → `{ location, data: [{ name, description }] }` — **por location**.
- `POST /api/session/{sessionID}/command`
  - body: `{ name: string, text: string, files?, agents?, skills?, delivery? }` (`name` e `text` obrigatórios)
  - `204` = callback executado · `404` = `CommandNotFoundError` (nome não registrado **naquela location**) · `500` = `CommandExecutionError`
  - `text` vira `invocation.prompt.text`; `delivery` default `"steer"`.
- `POST /api/session/{sessionID}/synthetic`
  - body: `{ text: string, description?, metadata?, delivery?, resume? }`
  - "Durably admit synthetic session input and schedule execution unless resume is false".
  - Com `resume: false` a mensagem é admitida **sem** agendar o loop do modelo (tokens = 0) e fica
    na inbox (`GET /api/session/{id}/inbox`), com `type: "synthetic"`.

### Medições (pasta spikeproj, 2026-10-25)

| cenário | resultado |
|---|---|
| `POST /api/session/{id}/command {name:"spikeprobe", text:"…"}` | **204**; callback executou (`input={"sessionID":…,"prompt":{"text":"…"},"delivery":"steer"}`); tokens 0; custo 0; `GET /message` = `[]` |
| callback chamando `ctx.session.synthetic({sessionID, text, description, resume:false})` | retornou `{id:"msg_…", type:"synthetic", payload:{text,description}}`; tokens 0; item visível em `GET /api/session/{id}/inbox` |
| `POST /api/session/{id}/prompt {text:"/spikeprobe"}` | **modelo chamado** (8.925 in / 152 out); callback **não** executou; "/spikeprobe" literal no transcript |

### Armadilhas novas

7. **`execute` não devolve nada para o usuário.** Retornar `{ content }` é ignorado em silêncio —
   o comando aparece no palette, roda, e não mostra nada. A saída tem de ir por
   `ctx.session.synthetic({ sessionID, text, resume: false })`.
8. **O registro de comandos é por location.** O `setup` roda uma vez por location; `GET /api/command`
   responde pela location do cliente; `POST /api/session/{id}/command` resolve o callback na location
   da sessão. Comando registrado em uma location não existe em outra → `404 CommandNotFoundError`.
9. **`opencode run` não despacha slash commands** (só o TUI/app). Em headless, o comando precisa ser
   uma tool (o modelo chama) — não um slash command.
10. **A API do servidor exige autenticação**: Basic auth, usuário `opencode`, senha em
    `~/.config/opencode/service.json`. Sem isso → `{"_tag":"UnauthorizedError"}`.
11. **`opencode api -d` não envia JSON** (aspas se perdem → `Expected a valid JSON body`).
    Workaround: `curl -u opencode:<senha> --data-binary @arquivo.json`.
12. **A URL do servidor vem de `GET /api/info`** (`urls[0]`), não de uma porta fixa.
  **Confirmado em execução real**: via `POST /api/session/{id}/command`, o `execute` foi chamado com
  `input = { sessionID, prompt: { text }, delivery }` e **nenhuma requisição ao modelo foi feita**.
- O comando aparece em `GET /api/command` junto com os nativos (`init`, `review`, …).
- `opencode run "/spike"` **não** executa slash command: o `run` trata o texto como prompt comum.
  Para acionar um comando por script, use a API.

### Chamando a API pelo shell (Windows / PowerShell 5.1)

O PowerShell 5.1 remove as aspas duplas dos argumentos passados a executáveis nativos, o que
quebra JSON. Escapar com `\"` resolve:

```powershell
opencode api post /api/session --data '{\"title\":\"teste\"}'
opencode api post "/api/session/$sid/command" --data '{\"name\":\"spike\",\"text\":\"\"}'
```

