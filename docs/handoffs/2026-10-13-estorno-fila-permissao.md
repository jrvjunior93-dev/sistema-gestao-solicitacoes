# Estorno da fila independente de resolver divergencias

## Pedido e escopo

Usuario pediu que estornar a baixa na Fila de Pagamentos exija somente
`financeiro.titulos.estornar` (Estornar movimento), sem precisar conceder
`financeiro.fila_pagamentos.resolver` (Autorizar e resolver divergencias).

## Alteracoes locais

- `backend/src/routes.js`: removido `allowFilaPagamentosResolver` somente da
  rota `POST /financeiro/fila-pagamentos/:id/estornar`. `allowFinanceiro` segue
  verificando a chave de estorno pelo mapa financeiro existente. Rate limit,
  autenticacao, validacao e controller permanecem.
- `frontend/src/pages/FinanceiroFilaPagamentos.jsx`: retirado `canResolve` do
  botao e da funcao de estorno. Permissao de estorno, somente consulta, estado
  da baixa e protecao contra duplo envio permanecem.
- `backend/scripts/validarFilaEstornoPermissao.js`: exercita autorizacao e
  middleware reais, com modelos/auditoria isolados, registrando as tres rotas
  reais de estorno, resolver e aprovar divergencias.
- `frontend/scripts/validarFilaInstrumentosUI.mjs`: casos desktop/mobile para
  estornar sem resolver; resolver sem estornar permanece negado; somente
  consulta continua sem estorno. Flags da fixture preservadas ao filtrar.

## Regras preservadas

- Acesso a fila/modulo e escopo de cada titulo nao foram ampliados.
- Resolver/devolver pendencias e aprovar divergencias mantem a permissao
  propria; conceder estorno nao libera essas acoes.
- Motivo obrigatorio, auditoria, transacao/locks, idempotencia, carteira,
  estorno integral de grupo e bloqueio de fatura processada nao foram alterados.
- Bypass administrativo e compatibilidade de permissoes legadas preservados.
- Sem migration, banco real, EC2 ou restart pelo agente.

## Validacoes

Aprovados:

- `node backend/scripts/validarFilaEstornoPermissao.js`
- `node backend/scripts/validarFilaBaixaEstorno.js`
- `node backend/scripts/validarFilaLiquidacaoRateada.js`
- `node backend/scripts/validarPermissoesFinanceiroRota.js`
- `node backend/scripts/validarFilaPagamentoSolicitacaoAcesso.js`
- `node backend/scripts/validarSegurancaAcessoDireto.js`
- Syntax checks de routes e testes; `git diff --check`.
- Build frontend (16,99 s); aviso preexistente de Browserslist.

- `node frontend/scripts/validarFilaInstrumentosUI.mjs`: aprovado, incluindo
  permissao independente desktop/mobile, cancelamento/duplo clique, filtros,
  colunas, anexos, dados completos e instrumentos. Uma primeira execucao falhou
  na fixture por perder flags de permissao ao filtrar; fixture corrigida e
  suite completa repetida com sucesso. Sem alteracao funcional adicional.
- Documentacao: 510 Markdown e 19 documentos canonicos aprovados.

## Estado e proximo passo

Usuario autorizou commit e push na `refactor/frontend`, com comandos de
atualizacao somente para EC2 dev. A publicacao usa branch local
`codex/estorno-fila-permissao-20261013` a partir de `origin/refactor/frontend`,
incluindo somente este ajuste e seus testes/documentacao. Nao promover main
nem carregar commits exclusivos da promocao de producao para homologacao.
`outputs/` contem artefatos locais de QA e permanece fora do commit.

Atualizacao dev: checkout `refactor/frontend` limpo, pull fast-forward,
teste de permissoes/estorno e preflight de schema somente leitura; nenhuma
migration nova. Reiniciar exclusivamente `backend-dev --update-env` e validar
`127.0.0.1:8001/health` e `https://api-dev.jrfluxy.com.br/health`. O frontend
depende do deploy Vercel da branch dev; publicar main nao foi autorizado.

Na homologacao: usuario com acesso a fila e Estornar movimento, sem Resolver,
deve conseguir estornar baixa valida com motivo; nao deve conseguir aprovar
divergencias ou devolver nao pagos. Apenas visualizar/resolver sem Estornar
nao deve exibir o botao nem permitir a chamada direta ao endpoint de estorno.
