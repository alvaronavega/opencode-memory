# AGENTS.md — mapa do repo para agentes

Este repo é o plugin `opencode-memory` para o OpenCode. Ele cria e usa uma memória por pasta
(`MEMORY.md`) de forma local e determinística.

## Estrutura

```
index.ts            # entry do plugin: export default { id, setup }
src/
  wiring.ts         # setup(ctx): cria arquivos, injeta recall, captura turnos, registra tool/comando
  command.ts        # comando /mem (subcomandos + ajuda)
  tool.ts           # tool memoria.memory_note
  kit.ts            # localizar e copiar o kit para a pasta do projeto
  store.ts          # leitura/escrita do MEMORY.md (escrita atômica)
  memory-file.ts    # formato do MEMORY.md (parse/append/trim)
  recall.ts         # bloco <project-memory> injetado no prompt (com orçamento)
  capture.ts        # fatos do turno a partir do transcript
  notes.ts          # heurística de nota de decisão (sem LLM)
  detect.ts         # detecção de pasta de projeto
  config.ts         # memory.json (global e por projeto)
  layout.ts         # caminhos
tests/              # node --test, sem dependências
docs/               # documentação
instalar.ps1/.sh    # instaladores manuais
```

## Regras do projeto

- **Zero dependências de runtime.** Só módulos nativos do Node e a API de plugin do OpenCode.
- **Zero chamadas a LLM, rede ou serviço externo.** O plugin é determinístico.
- **Nada de estado fora da pasta do projeto.** O único global é o supervisor (código, não dados).
- **Nunca sobrescrever `MEMORY.md`.** Append apenas; escrita atômica (`.tmp` + rename).
- **Toda escrita em arquivo do usuário passa por `src/store.ts`.**
- **Falha nunca derruba a sessão.** Todo handler fica dentro de `try/catch`.
- **Português no texto de interface** (comandos, mensagens, docs). Código e identificadores em inglês.

## Testes

```bash
npm test          # node --test "tests/*.test.ts"
```

- Não existe dependência de teste: usa `node:test` + `node:assert`.
- Todo módulo puro tem teste. Módulo que depende da API do OpenCode usa um `ctx` falso
  (`tests/helpers.ts`).
- TDD: o teste vem antes da implementação e precisa ser visto falhar.

## Fatos da API do OpenCode (medidos, não documentados)

`docs/api-notes.md` tem o contrato real, medido com um plugin de sondagem em execução:

- `export default { id, setup }` funciona; `setup` roda **uma vez por location**.
- Hook `context`: `{ sessionID, model, system, messages, options, agent, tools }` — o recall é
  injetado com `event.system.push({ type: "text", text })`.
- Eventos úteis: `session.step.ended` (tem `finish`: `"tool-calls"` = turno continua,
  `"stop"` = turno terminou) e `session.tool.called`.
- O transcript (`event.messages`) traz `content[]` com partes `text`, `tool-call` (com `name` e
  `input`) e `tool-result`. **O nome da tool só existe no transcript**, não nos eventos.
- Comandos registrados por plugin rodam no host, sem passar pelo modelo:
  `editor.add({ name, description, execute })`.

## Ao mexer no capture

O `session.step.ended` chega **duas vezes** para a mesma sessão quando o plugin é instanciado
por location (cada instância vê todas as sessões). Por isso:

- a captura filtra por `sessionID` e compara a pasta da sessão com a da instância;
- o timestamp vem do **evento** (`event.created`), não de `Date.now()` — assim duas instâncias
  geram a mesma linha e o dedupe (por linha idêntica) evita entrada duplicada.

## Ao mexer no wiring

- O recall entra **uma vez por sessão** (conjunto `injected`).
- A tool `memory_note` resolve a pasta **pela sessão** (`context.sessionID`), não pela instância:
  todas as instâncias registram a mesma tool e a vencedora pode ser de outro projeto.
- `findProjectRoot` sobe até a raiz do projeto: uma sessão em `projeto/src/` usa a memória de
  `projeto/`.

## Publicação

```bash
npm test
git tag v0.1.0
git push origin main --tags
gh release create v0.1.0 --title "v0.1.0" --notes "..."
```
