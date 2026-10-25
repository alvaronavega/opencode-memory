# Troubleshooting

## O plugin não aparece em `opencode plugin list`

**Sintoma:** a lista não mostra `opencode-memory`, ou mostra ID `-`.

**Causa provável:** o módulo não carregou (import quebrado, caminho errado).

1. Veja o motivo no log do servidor:

   ```powershell
   Select-String -Path "$HOME\.local\share\opencode\log\opencode.log" -Pattern "failed to load plugin" | Select-Object -Last 5
   ```

   No Linux/macOS: `~/.local/share/opencode/log/opencode.log`.

2. Confirme que a estrutura está certa:

   ```
   ~/.config/opencode/plugins/opencode-memory/
   ├── index.ts
   ├── package.json
   └── src/
   ```

   O `index.ts` precisa estar **na raiz** da pasta do plugin, e o `src/` junto dele.

3. Se você copiou com `Copy-Item -Recurse`, o `src/` pode ter sido achatado. Copie o
   **conteúdo** de cada item, ou rode o instalador:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Force
   ```

4. Reinicie: `opencode reload` ou reinicie o cliente.

## O `MEMORY.md` não é criado

Verifique, nesta ordem:

1. A pasta é um projeto? O plugin exige um marker: `.git`, `package.json`, `pyproject.toml`,
   `Cargo.toml`, `go.mod`, `requirements.txt`, `pom.xml`, `build.gradle`, `composer.json`,
   `Gemfile`, `*.sln` ou `*.csproj`.

   ```bash
   ls -a
   ```

2. A criação automática está desligada? Veja `~/.config/opencode/memory.json` → `"auto": true`
   e `"enabled": true`.

3. A pasta está dentro de `node_modules`, `.venv`, `dist`, `build` ou da sua home? Essas nunca
   recebem memória (por segurança).

4. A sessão foi aberta numa **subpasta**? A memória fica na raiz do projeto, não na subpasta.

5. Force manualmente: `/mem init`.

## O recall não aparece no prompt

1. `/mem status` — veja se **Injeção no prompt** está `ligada`. Se estiver `desligada`, rode
   `/mem on`.

2. A sessão precisa ser **nova** (ou o plugin precisa ser recarregado): o recall entra uma vez
   por sessão, na primeira chamada ao modelo.

3. O `MEMORY.md` precisa ter entradas. Um arquivo vazio produz um bloco mínimo — o modelo
   simplesmente não tem o que recalling.

4. Verifique se o `MEMORY.md` está legível:

   ```bash
   cat MEMORY.md
   ```

## O `MEMORY.md` tem duas linhas iguais

Cada turno é gravado uma vez: o timestamp vem do evento, e o append deduplica linhas idênticas.
A duplicata real vem de outro caminho — por exemplo, o mesmo prompt enviado duas vezes no mesmo
segundo. A linha duplicada pode ser apagada à mão; o formato é texto puro.

## Quero desligar a memória neste projeto

- `/mem off` — desliga só a injeção (continua gravando).
- `/mem forget --yes` — apaga `MEMORY.md` e o kit local, e **desativa** a memória nesta pasta
  (o `.opencode/memory.json` fica com `"enabled": false`), para que ela não volte sozinha na
  sessão seguinte. Para reativar: `/mem on`.
- `"enabled": false` no `.opencode/memory.json` do projeto — desliga gravar e injetar.

## Quero que a memória pare de ser criada em pastas novas

Edite `~/.config/opencode/memory.json`:

```json
{ "version": 1, "auto": false, "enabled": true }
```

## O `MEMORY.md` ficou enorme

- `/mem archive` move o que passou do limite para `MEMORY-arquivo.md`.
- Baixe `maxEntries` no `.opencode/memory.json` do projeto.
- Acima de 512 KB o plugin **não** reescreve o arquivo (protege o seu conteúdo): edite à mão.

## Paths com acento ou espaço dão erro

O plugin usa `path` do Node everywhere (nada de shell), então acentos e espaços funcionam.
Se você viu erro, provavelmente foi um comando manual seu. Confira com:

```bash
ls -la "C:/Meus Projetos/ação"
```

## No Windows, `Set-Content` estraga a acentuação do `MEMORY.md`

`Set-Content` do PowerShell 5.1 grava em ANSI por padrão. Para gravar UTF-8:

```powershell
Set-Content -Path .\nota.md -Value "conteúdo com acento" -Encoding UTF8
```

O próprio plugin grava sempre em UTF-8 (`writeFileSync(..., "utf8")`).

## A tool `memoria.memory_note` não aparece

A tool só é registrada quando o plugin carrega. See ["O plugin não aparece em
`opencode plugin list`"](#o-plugin-não-aparece-em-opencode-plugin-list).

Se ela aparece mas responde "A memória está desativada nesta pasta", o `enabled` do config do
projeto está `false`.

## Como ver o que a memória injectou

O bloco injetado tem a forma:

```xml
<project-memory project="..." path="...">
...
</project-memory>
```

Ele faz parte do system prompt. Para inspecionar, use `/mem show` (mostra o arquivo) e
`/mem status` (mostra quantas entradas existem).

## A API do OpenCode mudou e o plugin quebrou

O contrato usado pelo plugin está em [`docs/api-notes.md`](../api-notes.md), com os fatos
**medidos em execução real**. Se algo mudou, compare:

- `export default { id, setup }` — o shape do módulo.
- hook `context` — `{ sessionID, model, system, messages, options, agent, tools }`.
- evento `session.step.ended` — `{ sessionID, assistantMessageID, finish, ... }`.
- transcript — `messages[].content[]` com `text`, `tool-call` (com `name` e `input`) e
  `tool-result`.

Um erro de carregamento sempre aparece no log do servidor como `failed to load plugin`.
