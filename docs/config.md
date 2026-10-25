# Configuração

## Global — `~/.config/opencode/memory.json`

No Windows: `C:\Users\<seu-usuário>\.config\opencode\memory.json`.
Se `$XDG_CONFIG_HOME` estiver definido, ele tem precedência.

```jsonc
{
  "version": 1,
  "auto": true,     // cria a memória automaticamente em pastas de projeto
  "enabled": true   // kill switch: false desliga o plugin inteiro
}
```

| Chave | Padrão | O que faz |
|---|---|---|
| `version` | `1` | versão do formato do config |
| `auto` | `true` | quando `true`, o supervisor cria `MEMORY.md`, config e kit local nas pastas de projeto que ainda não têm |
| `enabled` | `true` | quando `false`, o plugin não faz nada (nem cria, nem injeta, nem grava) |

Com `"auto": false`, o plugin continua funcionando nas pastas que **já** têm memória (as que
têm `.opencode/plugins/opencode-memory/`), mas não cria memória nova em lugar nenhum. Para
ativar uma pasta à mão, use `/mem init`.

## Por projeto — `<projeto>/.opencode/memory.json`

```jsonc
{
  "version": 1,
  "project": "meu-projeto",
  "enabled": true,
  "inject": true,
  "maxEntries": 100,
  "maxInject": 15
}
```

| Chave | Padrão | O que faz |
|---|---|---|
| `version` | `1` | versão do formato do config |
| `project` | nome da pasta | nome exibido no `MEMORY.md` e no recall |
| `enabled` | `true` | quando `false`, a memória desta pasta para de ser gravada e injetada |
| `inject` | `true` | quando `false`, a memória continua sendo gravada mas não entra no prompt |
| `maxEntries` | `100` | quantas entradas ficam no `MEMORY.md` (as mais antigas saem) |
| `maxInject` | `15` | quantas entradas entram no bloco injetado no prompt |

Chaves desconhecidas são ignoradas. Um arquivo quebrado (JSON inválido) é tratado como config
padrão — nunca derruba a sessão.

## Ajustes rápidos

| Quero… | Como |
|---|---|
| Parar de criar memória em pastas novas | `~/.config/opencode/memory.json` → `"auto": false` |
| Desligar tudo | `~/.config/opencode/memory.json` → `"enabled": false` |
| Não injetar memória nesta pasta, mas continuar gravando | `/mem off` |
| Guardar mais histórico | `maxEntries` maior no config do projeto |
| Injetar mais contexto | `maxInject` maior (cada entrada custa ~30 tokens) |

## Onde ficam as coisas

```
~/.config/opencode/
├── memory.json                    ← config global
└── plugins/opencode-memory/       ← o plugin (supervisor global)

<projeto>/
├── MEMORY.md                      ← a memória
├── MEMORY-arquivo.md              ← entradas arquivadas (se você usou /mem archive)
└── .opencode/
    ├── memory.json                ← config do projeto
    └── plugins/opencode-memory/   ← cópia do plugin (a pasta fica autossuficiente)
```

## Limites de segurança

- O `MEMORY.md` só é criado em pastas com marker de projeto (`.git`, `package.json`,
  `pyproject.toml`, `Cargo.toml`, `go.mod`, `requirements.txt`, `pom.xml`, `build.gradle`,
  `composer.json`, `Gemfile`, `*.sln`, `*.csproj`).
- Nunca na home do usuário, nunca em `node_modules`, `.venv`, `dist`, `build`, `target` ou
  diretórios de sistema.
- Nada é sobrescrito. `MEMORY.md` existente só sofre append.
