# Contribuindo

Obrigado por querer melhorar o `opencode-memory`.

## Ambiente

```bash
git clone https://github.com/alvaronavega/opencode-memory.git
cd opencode-memory
npm test
```

- Node.js ≥ 24 (o `node --test` executa TypeScript direto).
- Sem dependências de desenvolvimento, sem bundler, sem framework de teste.

## Fluxo

1. **TDD sempre.** Escreva o teste, veja falhar, implemente, veja passar.
   Um teste que passa antes da implementação não prova nada.
2. **Um commit por tarefa**, no formato `feat:`, `fix:`, `docs:`, `chore:`.
3. **Português na interface** (mensagens, comandos, docs). Código em inglês.
4. **Zero dependências de runtime.** Se precisa de uma biblioteca nova, discuta antes.
5. **Nada de rede, nada de LLM, nada de daemon.** O plugin é local e determinístico.

## O que mexer com cuidado

- `src/wiring.ts` — o coração. Leia `docs/api-notes.md` antes: o contrato da API do OpenCode
  foi **medido**, não suposto.
- `src/store.ts` — toda escrita em arquivo do usuário passa por aqui (escrita atômica).
- `src/memory-file.ts` — formato do `MEMORY.md`. Mudar o formato quebra arquivos já criados;
  Preserve a tolerância a edição manual (ver `ParsedMemory.loose`).

## Checklist antes de abrir um PR

- [ ] `npm test` passa (toda a suíte, não só o arquivo que você mexeu).
- [ ] Toda função nova tem teste.
- [ ] O `MEMORY.md` continua legível e editável à mão.
- [ ] Nada foi sobrescrito onde a regra é "append".
- [ ] O comportamento funciona com **qualquer** modelo (a parte determinística não pode
      depender de o modelo obedecer).
- [ ] Se mudou o formato ou o config, atualizou `docs/`, `README.md` e `CHANGELOG.md`.

## Commits e PRs

- Branch: `feat/`, `fix/`, `docs/`.
- Mensagem em inglês, Conventional Commits.
- Descreva **por que**, não só **o que**.
