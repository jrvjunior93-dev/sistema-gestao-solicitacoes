# Handoff — guia operacional de Pessoal / RH-DP (02/10/2026)

## Escopo

Documentar o funcionamento atual das sete abas de `Pessoal` e sua ligação com cadastro, documentos, importações, apuração e Financeiro na `refactor/frontend` (`f82dc339`). Não há alteração de regra de negócio, banco ou interface.

## Arquivos alterados

- `docs/modulos/rh-dp/GUIA_OPERACIONAL_PESSOAL.md`: guia principal;
- `docs/modulos/rh-dp/README.md`: entrada para o guia;
- `docs/workspace/OWNERSHIP_ATIVO.md`: registro e liberação de ownership desta sessão;
- este handoff documental.

## Validação e limites

O texto foi confrontado com as sete páginas de Pessoal, os serviços RH/DP, as rotas e a matriz de testes. O fluxo de jornadas 40%/60% em etapas é descrito como **desligado por padrão** e pendente de homologação contábil/financeira, não como comportamento ativo. `npm run test:docs` passou (376 arquivos Markdown e 19 documentos canônicos); `git diff --check` não apontou erros. Esta sessão não acessou banco, EC2 ou aplicação em execução; configurações de permissões, flags e migrations de cada ambiente precisam ser conferidas separadamente. O próximo passo é revisar o guia com DP/Financeiro e executar a matriz de homologação em dev.
