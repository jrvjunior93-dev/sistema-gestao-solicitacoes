# Correcao isolada: criacao de compras sem vinculo com a obra

Data: 01/10/2026. Base: `main` em `e2b8d3db`.
Branch de preparo: `codex/compras-criacao-isolada-main`.

## Pedido e isolamento

Levar somente a correcao de criacao em todas as obras para `main`, sem incorporar
as demais alteracoes de `refactor/frontend`. Preparado em worktree limpo da main;
nenhum merge da refactor e nenhuma copia integral de arquivos de runtime.

O Comercial ja esta habilitado na configuracao, mas o POST de Compras exigia
vinculo de visualizacao com a obra. A guarda agora respeita a autorizacao de
criacao na compra normal/direta e na importacao de itens normal. O modelo XLSX
normal tambem usa escopo de criacao. A permissao funcional de criar continua
obrigatoria, assim como validacoes de obra, itens e regras do controller.

## Escopo do commit

- `backend/src/services/authorizationService.js`: helper exclusivo de criacao,
  usando `SETORES_CRIACAO_TODAS_OBRAS`, sem modificar acesso global.
- `backend/src/middlewares/resourceAccess.js`: aplicar helper somente nas guardas
  de criacao/preparacao; preservar listas, detalhes e recursos existentes.
- `backend/src/routes.js`: modelo XLSX normal passa pela guarda de criacao.
- `backend/scripts/validarCompraCriacaoTodasObras.js` e `backend/package.json`:
  teste de regressao independente com models em memoria.
- Este handoff e registro local de ownership.

Nao cria UsuarioObra nem amplia leitura de compras de terceiros. Nao inclui
frontend, PWA/push, aprovacao de pagamentos, auditoria de tempos, migrations,
dependencias novas ou outras mudancas da refactor.

## Validacoes na base main

- 14 cenarios especificos de criacao, negacao, revogacao, permissoes funcionais,
  isolamento de leitura, obra invalida, modelos e rotas: aprovados.
- Importacao de itens da compra normal e compra direta com frete: aprovados.
- Sintaxe Node e `git diff --check`: aprovados.
- Validador documental global: bloqueado por link preexistente na main em
  `docs/modulos/solicitacoes/README.md` para `./FLUXOS_INICIAIS_OBRA.md`, ausente
  nessa base. Confirmado no Git de origem; esses arquivos nao foram alterados.
- Dependencias de testes de planilha reutilizadas via NODE_PATH apenas no processo
  local; nenhum arquivo de dependencias, instalacao ou versao foi alterado.

## Publicacao e limite operacional

Usuario autorizou levar somente esta correcao a main. O envio Git deve ser
fast-forward a partir da base acima, sem force push. Confirmar o SHA remoto apos
o envio. Esta publicacao Git nao confirma deploy do backend.

Nenhum acesso a banco, EC2 dev/producao ou SSH e permitido nesta sessao. Nao houve
migration ou reinicio. O deploy operacional e a validacao real pela usuaria
permanecem para o operador autorizado. O checkout da refactor e seus arquivos
nao commitados devem permanecer preservados.
