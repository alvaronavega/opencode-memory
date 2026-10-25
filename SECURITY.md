# Segurança

## O que este plugin faz (e o que não faz)

O `opencode-memory` é um plugin **local** para o OpenCode.

- Não abre portas, não sobe daemon, não fala com nenhum servidor.
- Não pede conta, chave de API ou token.
- Não faz requisição de rede.
- Não usa modelo de linguagem em nenhum caminho.
- Não tem telemetria.

## O que ele escreve

| Onde | O quê |
|---|---|
| `<projeto>/MEMORY.md` | o histórico do projeto (texto puro) |
| `<projeto>/.opencode/memory.json` | config do projeto |
| `<projeto>/.opencode/plugins/opencode-memory/` | cópia do plugin |
| `<projeto>/MEMORY-arquivo.md` | entradas arquivadas (quando você roda `/mem archive`) |
| `~/.config/opencode/memory.json` | config global (só se não existir) |
| `~/.config/opencode/plugins/opencode-memory/` | o plugin |

O `MEMORY.md` é criado **apenas** em pastas que parecem projeto (têm `.git`, `package.json`,
`pyproject.toml`, `Cargo.toml`, `go.mod`, `requirements.txt`, `pom.xml`, `build.gradle`,
`composer.json`, `Gemfile`, `*.sln` ou `*.csproj`) e **nunca** dentro da sua home, de
`node_modules`, `.venv`, `dist`, `build` ou de diretórios de sistema.

Nada é sobrescrito: o `MEMORY.md` existente só sofre append, e a escrita é atômica.

## Avisos honestos

- **O `MEMORY.md` é texto puro.** Não é cofre de segredos. Não guarde credenciais, tokens ou
  chaves de API nele.
- **A memória entra no prompt.** O bloco `<project-memory>` é enviado ao provedor do modelo que
  você estiver usando. Se esse provedor for na nuvem, o conteúdo da memória vai para ele — junto
  com o resto da conversa. Use um modelo local se isso for sensível.
- **Prompt injection.** O `MEMORY.md` é texto que o usuário (ou o modelo, via `memory_note`)
  escreveu. Ele é injetado como contexto, não como instrução prioritária. Ainda assim, um
  `MEMORY.md` malicioso pode influenciar o agente. Revise o arquivo antes de confiar nele.
- **Permissões de escrita.** O plugin escreve na pasta do projeto. Em sistemas com permissão
  restrita, o `try/catch` impede que a sessão caia — mas a memória não será gravada.

## Versões

- [0.1.0](https://github.com/alvaronavega/opencode-memory/releases/tag/v0.1.0) — versão atual.

## Reportando um problema de segurança

Abra uma issue privada em
[github.com/alvaronavega/opencode-memory/security/advisories/new](https://github.com/alvaronavega/opencode-memory/security/advisories/new)
ou escreva para o autor. Descreva o que acontece, como reproduzir e o impacto.
