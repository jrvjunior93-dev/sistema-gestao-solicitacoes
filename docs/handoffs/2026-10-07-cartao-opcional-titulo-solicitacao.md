# Cartao opcional na criacao de titulo pela solicitacao

Na aba Financeiro dos detalhes da solicitacao, as formas de credito e debito
aceitam cartao ausente. A criacao normal resulta em ABERTO, sem movimento,
quitacao ou fatura. Se o cartao for informado, o comportamento de baixa
automatica existente continua. PREVISAO permanece previsao.

## Implementacao

- `backend/src/services/tituloFinanceiroService.js`: opcao interna
  `permitirCartaoPendente`, ativada somente em `criarTituloPorSolicitacao`.
  Sem alteracao no payload permitido ou nas regras do lancamento manual.
- `frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx`: rotulo opcional,
  alternativa de informar na baixa e orientacao contextual. Datas,
  parcelas, pagamento, categoria, permissoes e bloqueio durante envio preservados.
- `backend/scripts/validarCartaoOpcionalSolicitacao.js`: servico completo
  executado em VM com banco, faturas e integracoes substituidos por mocks.
- `frontend/scripts/validarCartaoOpcionalSolicitacaoUI.mjs` e fixtures
  `cartaoOpcionalSolicitacao.html`/`.jsx`: formulario real, APIs simuladas,
  chamadas nao previstas bloqueadas e capturas claro/escuro.
- Comandos de validacao adicionados aos dois `package.json`;
  regra registrada no README canonico do Financeiro e no changelog.

## Validacoes

- Backend: credito/debito com e sem cartao, saldo, status, datas, parcelas,
  pagamentos mistos, cartao inativo/incompativel, previsao e rejeicao de
  flag HTTP. Criar sem cartao e baixar depois usando `baixarTitulo` real;
  ausencia de cartao na baixa rejeitada; segunda baixa de titulo quitado
  rejeitada sem duplicar movimento.
- Frontend: quatro envios (credito/debito com e sem cartao), selecao,
  ajuda, ausencia de required, payload e fechamento do formulario.
- `npm run test:intercompany-cartoes`, `npm run test:docs`, build do frontend,
  `node --check` do servico e `git diff --check`.
- Nenhum teste carrega models reais ou grava em banco. Capturas em
  `outputs/qa-cartao-opcional/`. Build possui aviso preexistente de Browserslist
  desatualizado; nao foram atualizadas dependencias.

## Limites e proximo passo

As alteracoes de recarga e auditorias ja pendentes foram preservadas. Esta
correcao nao requer migration, variavel ou nova permissao. Nao houve commit,
push, deploy ou restart. Falta publicacao autorizada e homologacao integrada
no ambiente de destino com o operador financeiro; mocks nao substituem
conferencia da conta/cartao configurados nesse ambiente.
