# Instalar o opencode-memory (runbook para agentes)

Este arquivo é um guia para **um agente de IA** instalar o `opencode-memory` numa máquina.
Siga os passos na ordem. Se um passo falhar, pare, reporte o comando exato e a saída de erro.

URL canônica deste arquivo:
`https://raw.githubusercontent.com/alvaronavega/opencode-memory/main/INSTALL_FOR_AGENTS.md`

## O que você vai instalar

Um plugin do OpenCode que cria e usa uma memória por pasta (`MEMORY.md`). Ele é local: sem
servidor, sem conta, sem chave de API, sem chamadas a modelo.

Depois de instalado, toda pasta de projeto que for aberta no OpenCode ganha um `MEMORY.md` na
raiz, e as sessões seguintes recebem o contexto anterior no system prompt.

## 1. Pré-requisitos

- OpenCode 2.x instalado (verifique com `opencode --version`)
- Node.js 24 ou mais novo, se você for rodar os testes (`node --version`)

```bash
opencode --version
node --version
```

Se `opencode` não existir: https://opencode.ai/docs/ (ou `npm i -g opencode-ai`).

## 2. Instalar

Escolha **um** caminho.

### 2a. Script (Windows)

```powershell
git clone https://github.com/alvaronavega/opencode-memory.git
cd opencode-memory
powershell -ExecutionPolicy Bypass -File .\instalar.ps1
```

### 2b. Script (Linux/macOS)

```bash
git clone https://github.com/alvaronavega/opencode-memory.git
cd opencode-memory
chmod +x instalar.sh
./instalar.sh
```

### 2c. Pelo próprio OpenCode

```bash
opencode plugin add git+https://github.com/alvaronavega/opencode-memory.git
```

### 2d. Copiando o kit manualmente

Copie `index.ts`, `package.json` e a pasta `src/` para
`~/.config/opencode/plugins/opencode-memory/` (no Windows: `%USERPROFILE%\.config\opencode\plugins\opencode-memory\`).

Esperado: o script imprime "Pronto." e informa o destino.

## 3. Verificar a instalação

```bash
opencode plugin list
```

Esperado: uma linha com o ID `opencode-memory` e o caminho do `index.ts`.

Se aparecer ID `-`, o módulo não carregou. Veja
[docs/troubleshooting.md](https://github.com/alvaronavega/opencode-memory/blob/main/docs/troubleshooting.md).

## 4. Reiniciar o OpenCode

O plugin é carregado no start do servidor. Rode `/reload` dentro do OpenCode ou reinicie o
cliente.

## 5. Teste de ponta a ponta

1. Crie uma pasta de teste com um `package.json` (é isso que marca a pasta como projeto):

   ```bash
   mkdir -p /tmp/teste-memoria && cd /tmp/teste-memoria && echo '{}' > package.json
   ```

2. Abra o OpenCode nessa pasta e peça algo simples, por exemplo:
   `crie um arquivo nota.txt com o texto ola`.

3. Verifique se a memória foi criada:

   ```bash
   cat MEMORY.md
   ```

   Esperado: o arquivo existe, tem o cabeçalho `# Memória do projeto: teste-memoria` e uma
   linha de registro com o seu pedido.

4. Abra **uma nova sessão** na mesma pasta e pergunte, sem permitir leitura de arquivos:
   `o que já foi feito neste projeto? responda só com o que está no seu contexto`.

   Esperado: a resposta cita o passo anterior — isso prova que o bloco de memória foi
   injetado no system prompt.

5. Teste o comando: digite `/mem help` no OpenCode.

   Esperado: a lista de subcomandos (`/mem status`, `/mem init`, `/mem on`, `/mem off`,
   `/mem show`, `/mem archive`, `/mem forget`, `/mem doctor`).

## 6. Reportar sucesso

Reporte:

- versão do plugin instalada e o caminho;
- se `opencode plugin list` mostrou `opencode-memory`;
- se o `MEMORY.md` foi criado na pasta de teste e o que tinha dentro;
- se a sessão nova enxergou a memória sem ler arquivos;
- qualquer erro, com o comando exato e a saída.

## Desinstalar

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Uninstall   # Windows
```

```bash
./instalar.sh --uninstall                                          # Linux/macOS
```

Isso remove o plugin, **não** o `MEMORY.md` dos projetos. Para remover a memória de um projeto,
use `/mem forget --yes` dentro dele.

## Notas para o agente

- O plugin **não** precisa de nenhuma configuração sua para funcionar: ele detecta a pasta de
  projeto (`.git`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, …) e age sozinho.
- Se o usuário preferir controlar manualmente, rode `/mem init` na pasta desejada.
- Para desligar a criação automática de memória em todas as pastas, edite
  `~/.config/opencode/memory.json` e ponha `"auto": false`.
