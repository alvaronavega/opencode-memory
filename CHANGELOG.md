# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento
segue [SemVer](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Corrigido

- A saída do comando `/mem` agora vai por `ctx.session.synthetic({ resume: false })`. O `execute`
  de um comando de plugin retorna `void` — o host descartava o valor de retorno, e o `/mem`
  ficava mudo no TUI.
- `instalar.ps1` remove o `src` de destino antes de copiar (o `Copy-Item -Recurse` aninhava a
  pasta e deixava uma cópia antiga do plugin em `src/src/`).

## [0.1.0] — 2026-10-25

Primeira versão pública.

### Adicionado

- **Plugin do OpenCode** que cria e usa uma memória por pasta (`MEMORY.md` na raiz do projeto).
- **Dois papéis no mesmo pacote**: supervisor global (cria a memória e copia o kit para a pasta
  no primeiro uso) e worker local (a cópia dentro de `.opencode/plugins/opencode-memory/`).
- **Recall automático**: o bloco `<project-memory>` é injetado no system prompt na primeira
  chamada ao modelo de cada sessão, com orçamento de ~800 tokens.
- **Captura determinística**: cada turno vira uma linha no `MEMORY.md` (pedido, arquivos
  tocados, comandos executados com status), sem gastar token e sem chamar LLM.
- **Heurística de nota**: prompts com marcadores de decisão ("vamos usar", "decidimos",
  "escolhi", …) viram uma entrada marcada como `nota`.
- **Tool `memoria.memory_note`**: o modelo registra decisões e pendências.
- **Comando `/mem`** com subcomandos `status`, `help`, `init`, `on`, `off`, `show`, `archive`,
  `forget` e `doctor` — saída determinística, sem passar pelo modelo.
- **Configuração** em `~/.config/opencode/memory.json` (global) e `<projeto>/.opencode/memory.json`
  (por projeto).
- **Instaladores** `instalar.ps1` (Windows, PowerShell 5.1) e `instalar.sh` (Linux/macOS),
  idempotentes e com `--uninstall`.
- **Documentação**: README, runbook `INSTALL_FOR_AGENTS.md` para agentes instalarem sozinhos,
  `AGENTS.md` com o mapa do repo e `docs/` com arquitetura, comandos, config e troubleshooting.
- **Suíte de testes** com `node --test`, sem dependências (84 testes na primeira versão).

[Não publicado]: https://github.com/alvaronavega/opencode-memory/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alvaronavega/opencode-memory/releases/tag/v0.1.0
