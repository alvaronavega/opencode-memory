# opencode-memory

Memória por pasta para o [OpenCode](https://opencode.ai) — local, determinística e portátil.

Quando você abre o OpenCode num projeto, o agente já sabe o que foi feito ali, o que ficou
pendente e quais decisões foram tomadas. Sem repetir contexto, sem depender de qual modelo de
IA está em uso e sem gastar token com isso.

```
┌──────────────────────────────────────────────────────────────┐
│  C:\AI\meu-projeto\                                          │
│                                                              │
│  MEMORY.md            ← a memória (texto puro, versionável)  │
│  .opencode\                                                 │
│    memory.json        ← config do projeto                    │
│    plugins\opencode-memory\   ← o plugin (a pasta viaja)    │
└──────────────────────────────────────────────────────────────┘
```

## Por que

Agentes de coding perdem o contexto entre sessões. Você volta numa pasta e o modelo pergunta
de novo o que você já respondeu ontem. As soluções existentes (claude-mem, mem0, codex-agent-mem)
resolvem isso com hooks pesados, bancos, embeddings ou serviços em background.

Este plugin faz o mínimo útil, do jeito mais auditável possível:

| | opencode-memory |
|---|---|
| Onde os dados ficam | **num arquivo de texto dentro da pasta** |
| Servidor / daemon / porta | **nenhum** |
| Chave de API / conta | **nenhuma** |
| Chamadas a LLM para funcionar | **nenhuma** |
| Dependências | **nenhuma** (só Node ≥ 24) |
| Funciona com qualquer modelo | **sim** (a injeção é do host, não do prompt) |
| Custo de token | **~300–600 por sessão** (o bloco de recall, orçado) |

## Como funciona

O plugin tem dois papéis no mesmo código:

- **supervisor** (instalado em `~/.config/opencode/plugins/opencode-memory/`): quando você abre
  uma pasta que ainda não tem memória, ele cria o `MEMORY.md`, a config e **copia o plugin para
  dentro da pasta**. A partir daí aquela pasta é autossuficiente.
- **worker** (a cópia dentro de `<projeto>/.opencode/plugins/opencode-memory/`): injeta o
  contexto anterior no system prompt e grava cada turno no `MEMORY.md`.

```
abrir pasta de projeto
        │
        ▼
  existe .opencode/plugins/opencode-memory/ ?
        │                    │
       não                  sim
        │                    │
        ▼                    ▼
  supervisor: cria      worker: injeta o recall
  MEMORY.md + config    no system prompt e grava
  + copia o kit         cada turno no MEMORY.md
        │                    │
        └────────┬───────────┘
                 ▼
      sessão nova já começa com o contexto
```

### O que é gravado

Cada turno vira **uma linha** no `MEMORY.md`:

```markdown
# Memória do projeto: meu-projeto

<!-- opencode-memory:v1 -->

## Registro
- [2026-10-25T14:32:00Z] turno — "criar o plugin de memória" | arquivos: src/memory.ts | comandos: npm test (ok)
- [2026-10-25T14:40:00Z] nota — "vamos usar o plugin local em vez de servidor MCP"

## Contexto do sistema
- Node 24 e uv instalados
```

O modelo também pode registrar decisões pela tool `memoria.memory_note` — o texto volta nas
sessões seguintes.

### O que entra no prompt

O bloco injetado é curto e orçado (máx. ~800 tokens estimados):

```xml
<project-memory project="meu-projeto" path="C:\AI\meu-projeto">
Memória do projeto (12 entradas, última em 2026-10-25 14:40).

Notas e decisões:
- 2026-10-25 — vamos usar o plugin local em vez de servidor MCP

Atividades recentes:
- 2026-10-25 14:32 — "criar o plugin de memória" (arquivos: src/memory.ts)

Contexto do sistema:
- Node 24 e uv instalados

Se algo novo e não-óbvio for decidido, registre com a tool memory_note.
Para o histórico completo, leia MEMORY.md.
</project-memory>
```

## Instalação

### Opção 1 — copiar o kit (funciona em qualquer máquina)

```bash
git clone https://github.com/alvaronavega/opencode-memory.git
cd opencode-memory
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar.ps1
```

Linux/macOS:

```bash
./instalar.sh
```

### Opção 2 — instalar direto do GitHub

```bash
opencode plugin add git+https://github.com/alvaronavega/opencode-memory.git
```

### Opção 3 — deixar um agente instalar

Peça para o próprio OpenCode (ou Claude Code, Codex, qualquer agente):

```
Leia https://raw.githubusercontent.com/alvaronavega/opencode-memory/main/INSTALL_FOR_AGENTS.md e siga os passos.
```

Depois de instalado, **reinicie o OpenCode** (ou rode `/reload`).

## Uso

Abra o OpenCode numa pasta de projeto. O `MEMORY.md` aparece sozinho na raiz.

Comandos (digite `/mem` no TUI):

| Comando | O que faz |
|---|---|
| `/mem` | estado da memória da pasta (padrão) |
| `/mem help` | a ajuda completa |
| `/mem init` | ativa a memória nesta pasta à mão |
| `/mem on` / `/mem off` | liga / desliga a injeção no prompt |
| `/mem show` | imprime o `MEMORY.md` |
| `/mem archive` | move as entradas antigas para `MEMORY-arquivo.md` |
| `/mem forget` | remove os arquivos de memória (`--yes` confirma) |
| `/mem doctor` | diagnostica a instalação |

Tool disponível para o modelo: `memoria.memory_note`.

## Configuração

Global (`~/.config/opencode/memory.json`):

```jsonc
{
  "version": 1,
  "auto": true,     // cria a memória automaticamente em pastas de projeto
  "enabled": true   // kill switch
}
```

Por projeto (`<projeto>/.opencode/memory.json`):

```jsonc
{
  "version": 1,
  "project": "meu-projeto",
  "enabled": true,
  "inject": true,     // injeta o recall no system prompt
  "maxEntries": 100,  // entradas mantidas no MEMORY.md
  "maxInject": 15     // entradas injetadas no prompt
}
```

Detalhes em [docs/config.md](docs/config.md).

## Portabilidade

Tudo que é **dado** mora dentro da pasta. Nada de banco global, nada de caminho absoluto
gravado, nada de estado na máquina.

- Copiar a pasta para outro PC = a memória vai junto.
- O plugin global é conveniência: numa pasta que já tem `.opencode/plugins/opencode-memory/`,
  ela funciona sem nenhuma instalação.
- O `MEMORY.md` é texto puro: dá para commitar, revisar com `git diff`, editar à mão.

## Privacidade

- Nada sai da sua máquina. Não há telemetria, não há servidor remoto, não há chave de API.
- O `MEMORY.md` é **texto puro** — não é cofre de segredos. Não guarde credenciais nele.
- O conteúdo da memória é injetado no prompt do modelo que você estiver usando. Se você usa
  um provedor na nuvem, o bloco de memória vai para ele junto com o resto da conversa.

## Limitações (honestas)

- **Registra o que aconteceu, não o porquê.** Sem LLM, a memória não destila. Use
  `memoria.memory_note` (ou escreva no `MEMORY.md` à mão) para decisões.
- **Sem busca entre projetos.** Cada pasta é uma memória isolada. A busca cross-project é v2.
- **Sem embeddings.** A busca é por linha e por leitura do arquivo.
- **O arquivo cresce.** Por padrão ficam as 100 entradas mais recentes; `/mem archive` move o
  resto para `MEMORY-arquivo.md`.
- **Uma pasta é uma memória.** Monorepos com vários pacotes independentes compartilham a memória
  da raiz (é o comportamento padrão).

## Requisitos

- OpenCode 2.x
- Node.js ≥ 24 (o plugin roda no runtime do OpenCode; o Node é só para rodar os testes)

## Desenvolvimento

```bash
git clone https://github.com/alvaronavega/opencode-memory.git
cd opencode-memory
npm test
```

A suíte roda com `node --test` (sem dependências). Detalhes da arquitetura em
[docs/architecture.md](docs/architecture.md).

## Licença

MIT.
