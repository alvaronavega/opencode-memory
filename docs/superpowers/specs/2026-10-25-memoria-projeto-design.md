# Memória de projeto para OpenCode — design

Data: 2026-10-25
Status: aguardando aprovação

## Intenção e porquê

Trabalhar em várias pastas e perder o fio: ao voltar para um projeto, a sessão nova
começa do zero, e o agente repete contexto que já tinha sido pago uma vez.

Queremos uma memória **local, por pasta, portável e determinística**: ao abrir o
OpenCode num projeto, o agente já sabe o que foi feito ali, o que ficou pendente e
quais decisões foram tomadas — sem depender de qual modelo de IA está em uso e sem
gastar token para isso.

A memória é um arquivo de texto (`MEMORY.md`) que mora **dentro da pasta**. Consequência
direta: mudar de PC = copiar a pasta. Nada se perde, nada é recriado.

## Objetivos

- Abrir o OpenCode numa pasta de projeto e já receber o contexto anterior no system prompt.
- Registrar automaticamente o que aconteceu em cada turno, sem LLM, sem custo de token.
- Manter o comando de usuário único e autoexplicativo (`/mem` + `/mem help`).
- Ser agnóstico ao modelo: o mecanismo é do host (plugin), não do prompt.
- Ser portável: a pasta carrega tudo que precisa.

## Não-objetivos

- Memória compartilhada entre projetos (busca cross-project) — v2.
- Embeddings / busca semântica — v2.
- Substituir o `planning-with-files` (continuidade de plano ≠ memória de projeto).
- Sincronização entre máquinas — o git resolve, se o usuário quiser.
- Qualquer coisa que exija conta, chave de terceiros ou serviço em background.

## Anti-objetivos (o que seria fracasso)

- Criar arquivos em pastas que não são projeto (poluir a home do usuário).
- Escrever no disco sem o usuário pedir, em pasta não-marcada, ou sobrescrever
  `MEMORY.md` existente.
- Injetar um volume de memória que estoure o contexto. Recall é orçado e limitado.
- Depender do modelo para que a memória exista: se o modelo não fizer nada, a memória
  determinística continua funcionando.

## Restrições

- OpenCode 2.1.4 em Windows nativo. Sem Docker, sem daemon, sem porta extra.
- O plugin global fica em `~/.config/opencode/plugins/` e é carregado automaticamente.
- Pastas de projeto carregam uma cópia local do plugin (ver "Abordagens").
- APIs de plugin disponíveis em V2: `ctx.location`, `ctx.session.*`, `ctx.command.transform`,
  `ctx.tool.transform`, `ctx.session.hook("context", ...)`, `ctx.event.subscribe()`.
- Hooks são do host: rodam antes da chamada ao modelo, para qualquer modelo.

## Abordagens consideradas

**A. Plugin só global** — `~/.config/opencode/plugins/memory.ts` cuida de tudo;
`MEMORY.md` por pasta é só dado.
- Prós: uma instalação, funciona em qualquer pasta nova, zero passo de bootstrap.
- Contras: mover de PC exige reinstalar o global; a pasta não é autossuficiente.

**B. Plugin só dentro do projeto** — cada pasta tem `.opencode/plugins/opencode-memory/`.
- Prós: pasta 100% autossuficiente; mover de PC = copiar e pronto.
- Contras: projeto novo exige copiar o kit na mão (a fricção que o usuário quer
  eliminar).

**C. Híbrido com auto-bootstrap (escolhida)** — um pacote só com dois papéis,
segue o local se existir, senão atua como supervisor global.

Arquitetura de referência de `C`:

```
~/.config/opencode/plugins/opencode-memory/     <- kit (global, supervisor)
   role=supervisor: a pasta tem .opencode/plugins/opencode-memory/?
        sim -> stands down (o worker local age)
        nao -> a pasta parece projeto? -> copia o kit pra pasta + cria MEMORY.md + memory.json
   role=worker:    inicializa MEMORY.md, injeta recall, captura turnos, serve /mem
```

- Prós: satisfaz A e B. Pasta nova: zero ação (o supervisor cria). Pasta movida: só
  copiar (a cópia local assume). Global é conveniência, não dependência.
- Contras: dois papéis no mesmo pacote (mas o branch é determinístico e testável).

Escolhida: **C**.

## Desenho

### Arquivos

O plugin é um **pacote** (diretório), não um arquivo solto — assim ele é portável
entre máquinas por qualquer meio (cópia, git, sync).

| Caminho | Papel |
|---|---|
| `opencode-memory/` (kit) | pacote do plugin: `index.ts`, `package.json`, `README.md`, `instalar.ps1`, `instalar.sh` |
| `~/.config/opencode/plugins/opencode-memory/` | cópia do kit; supervisor global |
| `<projeto>/.opencode/plugins/opencode-memory/` | cópia do kit; worker da pasta |
| `<projeto>/MEMORY.md` | a memória (texto puro) |
| `<projeto>/.opencode/memory.json` | marcador + config da pasta |
| `~/.config/opencode/memory.json` | config global (kill switch, auto-bootstrap) |

### Portabilidade entre máquinas (kit)

O kit é a unidade que o usuário carrega. Três formas de levar para outro PC:

1. **Copiar a pasta** `opencode-memory/` para `~/.config/opencode/plugins/`.
   O OpenCode descobre "immediate plugin package directories" sob o diretório de
   plugins — nenhuma instalação, nenhum registro, funciona no reboot seguinte.
2. **`opencode plugin add <caminho>`** — instala o pacote local e registra em
   `opencode.json`.
3. **`opencode plugin add git+https://github.com/<user>/opencode-memory.git`** — se o
   kit for publicado (repo privado serve). Uma linha, sem copiar nada.

E o caminho mais curto para um **projeto que já existe**: a pasta do projeto já
contém `.opencode/plugins/opencode-memory/`, então ela funciona em qualquer PC
**sem instalar nada** — só o worker local age.

Fluxo de projeto novo em PC novo:

```
1. levar o kit (copiar pasta | plugin add git+...)
2. abrir o OpenCode na pasta nova
3. o supervisor auto-cria: .opencode/plugins/opencode-memory/ + MEMORY.md + memory.json
4. a partir daí a pasta é autossuficiente
```

O `instalar.ps1` / `instalar.sh` do kit é só um atalho de convenience para o passo 1.

### Config

Global (`~/.config/opencode/memory.json`):

```jsonc
{
  "version": 1,
  "auto": true,          // auto-bootstrap em pastas com sinal de projeto
  "enabled": true        // kill switch global
}
```

Projeto (`<projeto>/.opencode/memory.json`):

```jsonc
{
  "version": 1,
  "project": "meu-projeto",
  "enabled": true,       // liga/desliga a injeção nesta pasta
  "inject": true,
  "maxEntries": 100,     // entradas mantidas no MEMORY.md
  "maxInject": 15        // entradas injetadas no system prompt
}
```

### Detecção de "pasta de projeto"

Determinística, sem LLM. Sinais: `.git`, `package.json`, `pyproject.toml`,
`Cargo.toml`, `go.mod`, `requirements.txt`, `*.sln`, `*.csproj`, `pom.xml`,
`build.gradle`, `composer.json`, `Gemfile`.

Nunca considerar projeto:
- a home do usuário (`C:\Users\alvar` e equivalentes),
- `node_modules`, `.git`, `venv`, `.venv`, `dist`, `build`, `%TEMP%`, `%LOCALAPPDATA%`,
  `Program Files`, `Windows`.

### Formato do `MEMORY.md`

O plugin é dono do arquivo. O modelo **não** edita o arquivo: usa a tool
`memory_note`, que o plugin implementa (append controlado).

```markdown
# Memória do projeto: meu-projeto

<!-- opencode-memory:v1 -->

## Registro
- [2026-10-25T14:32] turno — "criar plugin de memória" | arquivos: src/memory.ts | comandos: npm test (ok)
- [2026-10-25T14:36] turno — "ajustar recall" | arquivos: src/memory.ts | comandos: (nenhum)
- [2026-10-25T14:40] nota — "vamos usar plugin em vez de MCP server porque o OpenCode já injeta no system prompt"

## Contexto do sistema
- Node 22 e uv instalados
- Este projeto usa o plugin local em .opencode/plugins/memory.ts
```

- `Registro`: log append-only, uma linha por turno/nota.-growing.
- `Contexto do sistema`: bloco livre, editável à mão, injetado no recall.
- Crescimento: mantém as `maxEntries` linhas mais recentes; o resto é arquivado em
  `MEMORY-arquivo.md` (ou removido, se `archive: false`).

### Captura (determinística, custo zero)

Fonte dos dados: metadados que o OpenCode já tem.
- último prompt do usuário (truncado em ~200 chars);
- arquivos lidos/editados/escritos no turno;
- comandos de shell executados (com sucesso/falha);
- título da sessão.

Gatilho: hook `context` (delta do transcript) e/ou evento de fim de turno — o
**spike** define qual evento existe no V2. Nenhum passo usa modelo.

Heurística de nota (sem LLM): se o prompt do usuário contiver marcadores de decisão
(`decidimos`, `vamos usar`, `escolhi`, `porque`, `em vez de`, `passa a usar`), a
linha entra marcada como `nota`. É verbatim, sem resumo.

### Recall (o que entra no system prompt)

No primeiro `context` de cada sessão, o plugin injeta (via `event.system.push`):

```
<project-memory project="meu-projeto" path="C:\AI\projetos\meu-projeto">
Memória do projeto (12 entradas, última em 2026-10-25 14:40).

Notas e decisões:
- 2026-10-25 — vamos usar plugin em vez de MCP server porque o OpenCode já injeta no system prompt

Atividades recentes:
- 2026-10-25 14:32 — "criar plugin de memória" (arquivos: src/memory.ts)
- 2026-10-25 14:36 — "ajustar recall" (arquivos: src/memory.ts)

Contexto do sistema:
- Node 22 e uv instalados

Se algo novo e não-óbvio for decidido, registre com a tool memory_note.
Para o histórico completo, leia MEMORY.md.
</project-memory>
```

Orçamento: `maxInject` entradas (15) + até 10 notas + bloco de contexto. ~300–600
tokens. Nunca mais que isso, mesmo com `MEMORY.md` grande.

### Comandos — um só

Um comando `/mem`, com subcomandos. Ajuda em `/mem help`.

| Subcomando | Efeito |
|---|---|
| `/mem` | status: entries, tamanho, última atividade, se está injetando |
| `/mem help` | lista os subcomandos (esta ajuda) |
| `/mem init` | ativa a memória nesta pasta (cria os 3 arquivos, à mão) |
| `/mem on` | liga a injeção nesta pasta |
| `/mem off` | desliga a injeção nesta pasta (mantém o arquivo) |
| `/mem show` | imprime o `MEMORY.md` atual |
| `/mem archive` | move entradas antigas para `MEMORY-arquivo.md` |
| `/mem forget` | remove os arquivos de memória desta pasta (com confirmação) |

Comportamento:
- `/mem` sem argumento = status.
- `/mem help` = ajuda; também disponível via `--help` e via `help` (alias).
- A saída é texto determinístico, enviado à sessão via `session.synthetic` (sem
  passar pelo modelo).
- Descrição do comando no palette: `Memória do projeto — /mem help para os subcomandos`.
- Ajuda também embutida na mensagem de status ("use /mem help").

### Tool

`memory_note` — registra uma nota na seção de notas do `MEMORY.md`.
Entrada: `{ texto: string, tipo?: "nota" | "decisao" | "pendencia" }`.
Sem escrita direta pelo modelo no arquivo (evita conflito com o append do plugin).

### Portabilidade

- Nenhum caminho absoluto é gravado. O `path` do projeto vai no arquivo, mas é
  reescrito no recall (o path da máquina atual).
- Nenhum estado fora da pasta (exceto o supervisor global, que é código, não dados).
- `MEMORY.md` é texto puro: versionável no git, editável na mão, legível no editor.

### Fases

0. **Kit + repo git** — criar o pacote em `C:\AI\opencode-memory`, `git init`, e
   publicar como `alvaronavega/opencode-memory` (repo público: o guia de instalação
   por agente precisa de uma URL estável e acessível de qualquer máquina).

   Estrutura do repo:

   ```
   opencode-memory/
   ├── index.ts                 <- o plugin (supervisor + worker)
   ├── package.json             <- { name, version, type, exports }
   ├── README.md                <- humano: o que é, instalar, usar, comandos, config
   ├── INSTALL_FOR_AGENTS.md    <- runbook para o próprio agente instalar e verificar
   ├── AGENTS.md                <- mapa do repo para quem trabalha Nele
   ├── CHANGELOG.md
   ├── LICENSE (MIT)
   ├── SECURITY.md
   ├── CONTRIBUTING.md
   ├── instalar.ps1             <- instalador manual Windows
   ├── instalar.sh              <- instalador manual Linux/macOS
   └── docs/
       ├── architecture.md
       ├── commands.md
       ├── config.md
       └── troubleshooting.md
   ```

   `INSTALL_FOR_AGENTS.md` é lido por um OpenCode (ou Claude Code, Codex, etc.) em
   uma máquina nova e o instrui a: baixar o kit, instalar em
   `~/.config/opencode/plugins/opencode-memory/`, escrever o `memory.json` global,
   verificar com `opencode plugin list` e um teste de recall. Endereço canônico:
   `https://raw.githubusercontent.com/alvaronavega/opencode-memory/main/INSTALL_FOR_AGENTS.md`

   `instalar.ps1` / `instalar.sh` fazem o mesmo passo 1 de forma interativa e
   idempotente (roda em qualquer PC, Windows ou Unix, sem depender do OpenCode
   instalado).

1. **Spike** (~20 min): plugin mínimo que (a) descobre os eventos disponíveis no V2,
   (b) injeta texto via hook `context`, (c) roda `ctx.command.transform` e
   `ctx.tool.transform`. Sem memória ainda. Valida a API antes de escrever o resto.
2. **Núcleo**: config, bootstrap/detecção, MEMORY.md, captura, recall, `/mem` + ajuda.
3. **Polimento**: archivamento, trim, messages de erro, `memory_note`, `/mem doctor`.
4. **Publicação**: tag `v0.1.0`, release no GitHub, README com as instruções
   definitivas de instalação.

### Riscos

| Risco | Mitigação |
|---|---|
| Plugin global e local rodando juntos → injeção duplicada | Branch determinístico: local existe → supervisor faz stands down |
| API de plugin do V2 mudar | Um arquivo só, APIs documentadas, `try/catch` em todo hook, spike antes |
| `MEMORY.md` crescer sem parar | `maxEntries` + `/mem archive` |
| Modelo reescrever o arquivo | Modelo não edita o arquivo; usa `memory_note` |
| Criar arquivo em pasta errada | Lista de exclusão + só pastas com sinal de projeto + `auto: false` global |
| Sessão nova não injetar recall | Injeção no primeiro `context` + fallback em evento de criação de sessão |

### Fora de escopo (v2, se fizer sentido)

- `memory_search` cross-project (grep nos `MEMORY.md` de todos os projetos).
- Sumário automático por LLM (camada opcional de distilação).
- Sincronização entre máquinas via git.
- Escopo de memória por subpasta (monorepo).
