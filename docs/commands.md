# Comandos

Um único comando: `/mem`. Todos os subcomandos são executados **pelo host**, sem passar pelo
modelo — a resposta aparece na hora, sem gasto de token.

A saída do comando entra na conversa como **mensagem sintética** (`ctx.session.synthetic`,
com `resume: false`): ela aparece no transcript e **não** agenda uma chamada ao modelo, ou
seja, custa zero token. O `execute` de um comando de plugin retorna `void` — o valor de
retorno é descartado pelo host, então a saída **tem** de ir por esse canal.

> Slash commands são despachados pelo **TUI**. Em `opencode run "/mem"` (headless) o texto
> vira prompt comum e o comando não é executado — use o TUI para os subcomandos.

## `/mem` (padrão)

Estado da memória da pasta atual.

```
Memória do projeto: meu-projeto
Pasta: C:\AI\meu-projeto
Arquivo: C:\AI\meu-projeto\MEMORY.md
Entradas: 12 | última: 2026-10-25T14:40:00Z | tamanho: 3841 bytes
Injeção no prompt: ligada
Limite de entradas: 100

Use /mem help para ver os subcomandos.
```

## `/mem help`

Lista os subcomandos. Também aceita `/mem --help`.

```
/mem — memória do projeto

Uso: /mem [subcomando]

Subcomandos:
  /mem status    estado da memória desta pasta (é o padrão)
  /mem help      esta ajuda
  /mem init      ativa a memória nesta pasta (cria MEMORY.md e a configuração)
  /mem on        liga a injeção da memória no system prompt
  /mem off       desliga a injeção (mantém o arquivo)
  /mem show      imprime o MEMORY.md
  /mem archive   move as entradas antigas para MEMORY-arquivo.md
  /mem forget    remove os arquivos de memória (use --yes para confirmar)
  /mem doctor    diagnostica a instalação
```

## `/mem init`

Ativa a memória na pasta atual: cria o `MEMORY.md`, o `.opencode/memory.json` e copia o plugin
para dentro da pasta (para ela ficar autossuficiente).

- **Não** sobrescreve um `MEMORY.md` existente.
- Em uma pasta que não parece projeto, funciona do mesmo jeito (é uma ação explícita).

## `/mem on` / `/mem off`

Liga ou desliga a **injeção** do bloco de memória no system prompt. O arquivo continua existindo
e as entradas continuam sendo gravadas com `/mem off`.

Para desligar a memória de verdade (parar de gravar também), use `/mem forget`.

## `/mem show`

Imprime o `MEMORY.md` atual (truncado em 4000 caracteres).

## `/mem archive`

Move as entradas que passaram do limite (`maxEntries`, padrão 100) para `MEMORY-arquivo.md` e
mantém as mais recentes no `MEMORY.md`.

## `/mem forget`

Remove os arquivos de memória da pasta: `MEMORY.md`, `.opencode/memory.json` e a cópia local do
plugin.

Sem `--yes`, o comando só mostra o que será apagado e pede confirmação:

```
Isso apaga a memória desta pasta:
- C:\AI\meu-projeto\MEMORY.md
- C:\AI\meu-projeto\.opencode\memory.json
- C:\AI\meu-projeto\.opencode\plugins\opencode-memory

Para confirmar: /mem forget --yes
```

## `/mem doctor`

Diagnóstico da instalação:

```
Diagnóstico da memória
Pasta do projeto: C:\AI\meu-projeto
- MEMORY.md: ok
- config: ok
- kit local: instalado (pasta autossuficiente)
- injeção: ligada
- limite de entradas: 100
- escrita na pasta: ok
```

## Tool `memoria.memory_note`

Disponível para o modelo (não para você digitar). Serve para o agente registrar algo que não
ficará óbvio pelo código.

```json
{
  "texto": "Vamos usar SQLite em vez de JSON porque o volume passou de 10k registros",
  "tipo": "decisao"
}
```

- `texto` (obrigatório): o que registrar.
- `tipo` (opcional): `nota` (padrão), `decisao` ou `pendencia`.

A tool resolve a pasta **pela sessão**, então ela sempre escreve no projeto certo — mesmo
quando o plugin está instalado em vários lugares.

O texto entra na memória e volta nas sessões seguintes, dentro do bloco `<project-memory>`.
