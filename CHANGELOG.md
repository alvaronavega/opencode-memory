# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento
segue [SemVer](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Corrigido

- **O texto escrito à mão no `MEMORY.md` não é mais apagado.** O rewrite só substitui o corpo da
  seção `## Registro`; cabeçalho, seções desconhecidas e o conteúdo depois de
  `## Contexto do sistema` são preservados.
- **Sessão em subpasta do projeto passa a receber a memória** (antes, nem recebia recall nem
  era capturada). A pertenciação agora é comparada por identidade de projeto (`projectID` do
  host), com a raiz do projeto como alternativa.
- **Append concorrente não perde mais entradas.** A escrita usa um `.tmp` exclusivo por escritor
  (`<arquivo>.<pid>.<uuid>.tmp`) e um lock de arquivo: dois processos na mesma pasta não apagam
  um o turno do outro.
- **O recall não é mais duplicado** quando o plugin global e o local carregam juntos na mesma
  sessão (o bloco `<project-memory>` é injetado uma vez só).
- **Leitura do `MEMORY.md` limitada a 512 KB** (cabeçalho + cauda): um arquivo gigante não é
  carregado inteiro na memória.
- **`/mem forget --yes` agora desativa mesmo a memória** (grava `"enabled": false` no config do
  projeto) — antes o supervisor global recriava tudo na sessão seguinte.
- **`/mem init` recusa a home do usuário e pastas de dependência/sistema** (`--force` ignora).
- O `/mem doctor` escreve o arquivo de teste dentro de `.opencode/`, com nome único, em vez de
  poluir a raiz do projeto.
- A tool `memoria.memory_note` **rejeita um `tipo` inválido** (viraria lixo permanente no
  arquivo) e o recall cita o nome invocável da tool (`memoria.memory_note`).
- Caminhos absolutos gravados pela captura são relativizados à raiz do projeto.
- Bytes de controle literais no `src/detect.ts` viraram escapes (`[\x00-\x1f\x7f]`): o arquivo
  deixa de ser tratado como binário pelo git.
- A saída do comando `/mem` agora vai por `ctx.session.synthetic({ resume: false })`. O `execute`
  de um comando de plugin retorna `void` — o host descartava o valor de retorno, e o `/mem`
  ficava mudo no TUI.
- `instalar.ps1` remove o `src` de destino antes de copiar (o `Copy-Item -Recurse` aninhava a
  pasta e deixava uma cópia antiga do plugin em `src/src/`).
- `instalar.ps1` e `instalar.sh` copiam o `src` arquivo por arquivo: uma cópia fundida deixava
  arquivos antigos no lugar.

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
