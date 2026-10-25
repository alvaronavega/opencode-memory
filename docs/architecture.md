# Arquitetura

## Visão geral

O plugin é um pacote TypeScript sem dependências que roda dentro do processo do OpenCode.
Ele usa três APIs do host:

| API | Para quê |
|---|---|
| `ctx.session.hook("context", handler)` | injetar o recall no system prompt de cada sessão |
| `ctx.event.subscribe()` | observar `session.step.ended` para saber quando um turno terminou |
| `ctx.command.transform` / `ctx.tool.transform` | registrar o `/mem` e a `memory_note` |

## O problema do "plugin global é instanciado por location"

Medido em execução real (`docs/api-notes.md`): o OpenCode carrega o plugin **uma vez por
location** (diretório de trabalho). Com 5 locations ativos, existem 5 instâncias do plugin —
e **cada uma recebe os eventos de todas as sessões**, não só das suas.

Consequências e como o código lida com elas:

| Consequência | Solução no código |
|---|---|
| O recall pode ser injetado na sessão errada | `sessionBelongsHere()` compara a pasta da sessão com a da instância (`ctx.session.get`) |
| O mesmo turno pode ser gravado N vezes | O timestamp vem do **evento** (`event.created`), então todas as instâncias geram a mesma linha — e o dedupe por linha idêntica (`appendEntries`) colapsa |
| A tool `memory_note` é registrada N vezes | Ela resolve a pasta **pela sessão** (`context.sessionID`), não pela instância |
| `/mem` pode ser registrado N vezes | Idem: a última instância registrada vence, e todas apontam para a mesma pasta quando é a mesma location |

## Fluxo de uma sessão

```
setup(ctx)                              uma vez por location
  │
  ├─ descobre a raiz do projeto         findProjectRoot(location.directory)
  ├─ garante MEMORY.md + memory.json    ensureMemoryFile / writeProjectConfig
  ├─ se supervisor: copia o kit        copyKit(.opencode/plugins/opencode-memory)
  ├─ registra hook "context"            injeta o recall uma vez por sessão
  ├─ assina ctx.event.subscribe()       captura turnos em session.step.ended
  ├─ registra tool memoria.memory_note
  └─ registra comando /mem
```

### Injeção do recall

```
hook "context" (1ª vez da sessão)
  ├─ guarda o transcript da sessão      transcripts.set(sessionID, event.messages)
  ├─ se já injetou nessa sessão: sai
  ├─ se a sessão não é desta pasta: sai
  ├─ lê o MEMORY.md do disco
  ├─ monta o bloco <project-memory>     buildRecall (orçamento de 800 tokens)
  └─ event.system.push({ type: "text", text: recall })
```

O `system` é montado pelo host **antes** da chamada ao modelo — por isso funciona com
qualquer modelo, e não só com quem "entende" instruções.

### Captura do turno

```
evento session.step.ended
  ├─ finish === "tool-calls"? ignora    o modelo pediu mais ferramentas; o turno continua
  ├─ o transcript dessa sessão é conhecido? (senão, ignora — é de outra location)
  ├─ factsFromTranscript(transcript)    prompt, arquivos, comandos
  ├─ summarizeFacts(...)                uma linha de entrada
  ├─ extractNote(prompt)?               heurística de decisão → entrada "nota"
  └─ appendToMemory(...)                lê do disco, append, trim, escrita atômica
```

## Formato do `MEMORY.md`

```markdown
# Memória do projeto: meu-projeto

<!-- opencode-memory:v1 -->

## Registro
- [2026-10-25T14:32:00Z] turno — "criar o plugin de memória" | arquivos: src/memory.ts | comandos: npm test (ok)
- [2026-10-25T14:40:00Z] nota — "vamos usar o plugin local"

## Contexto do sistema
- Node 24 e uv instalados
```

O formato é **tolerante**: `parseMemoryFile` nunca lança. Linhas fora do formato são
preservadas em `ParsedMemory.loose` e voltam no próximo rewrite — quem edita o arquivo à mão
não perde texto.

## Escrita

- Toda escrita passa por `src/store.ts`.
- Escrita atômica: grava num `.tmp` **exclusivo por escritor** (`<arquivo>.<pid>.<uuid>.tmp`) e faz
  `rename`. O arquivo nunca fica pela metade.
- O read-modify-write é serializado por um lock de arquivo (`<arquivo>.lock`), para que duas
  instâncias do OpenCode na mesma pasta **não percam entradas** (o append de uma não apaga o da outra).
- O que sai do limite de entradas não some: vai para `MEMORY-arquivo.md`.
- O texto escrito à mão pelo usuário é preservado: o rewrite só substitui o corpo da seção
  `## Registro`; cabeçalho, seções extras e conteúdo depois do contexto continuam no arquivo.
- Arquivo acima de 512 KB **não** é reescrito: a memória é preservada, mas a automação para.
  (É um `MEMORY.md` escrito à mão e gigante — o caso raro.)

## Detecção de projeto

`findProjectRoot` sobe a partir do diretório da sessão até achar a pasta mais próxima com um
marker de projeto (`.git`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`,
`requirements.txt`, `pom.xml`, `build.gradle`, `composer.json`, `Gemfile`, `*.sln`, `*.csproj`).

Nunca considera projeto: a home do usuário, `node_modules`, `.git`, `venv`, `.venv`, `dist`,
`build`, `target`, `__pycache__`, `.cache`, `vendor`, o diretório de config do OpenCode e
pastas de sistema.

## Módulos

| Arquivo | Responsabilidade |
|---|---|
| `index.ts` | export default `{ id, setup }` |
| `src/wiring.ts` | setup: arquivos, hook, eventos, registros |
| `src/command.ts` | comando `/mem` e subcomandos |
| `src/tool.ts` | tool `memoria.memory_note` |
| `src/kit.ts` | localizar e copiar o kit |
| `src/store.ts` | leitura/escrita do `MEMORY.md` |
| `src/memory-file.ts` | formato do `MEMORY.md` |
| `src/recall.ts` | bloco injetado no prompt |
| `src/capture.ts` | fatos do turno |
| `src/notes.ts` | heurística de nota |
| `src/detect.ts` | detecção de pasta de projeto |
| `src/config.ts` | `memory.json` |
| `src/layout.ts` | caminhos |

Todos os módulos de `src/` são puros e testáveis sem o OpenCode — só `wiring.ts`, `command.ts`
e `tool.ts` tocam a API do host, e todos os três são testados com um `ctx` falso
(`tests/helpers.ts`).
