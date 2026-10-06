# Quantidades BR e pagamento da medicao legada - 06/10/2026

## Estado e escopo

Concluido localmente no worktree `promocao-main-20261003/Fluxy`, em `main`, sobre
`d2b602b64d72756396d7f676903bcc13a93dccbf`. Sem commit, push, deploy, banco real,
migration ou alteracao de variaveis de ambiente. Outros checkouts nao foram alterados.

Pedido seguinte em 06/10/2026 autorizou commit e push junto da estrutura de
prazos operacionais da Obra. Publicacao pelo commit que contem este registro;
worktree ja em main. Validacao em producao continua pendente.

## Correcoes

- Solicitação de Compra e Compra Direta usam o mesmo `QuantidadeInputBR` nos
  itens e no rateio. Entrada humana `2.000` corresponde a 2000 e `2,5` a 2.5.
  Ponto decimal de uma/duas casas, como `2.50`, permanece compativel. Entrada
  aceita duas casas decimais, conforme os itens DECIMAL(12,2) e o passo anterior.
  Texto incompleto/invalido nao deixa um numero anterior ser enviado. Quantidade
  nao positiva e recusada antes de preparar a revisao.
- O estado, os totais, o rateio, o rascunho e o payload permanecem canonicos.
  O parser de valores da API nao foi alterado: `"2.000"` recebido como DECIMAL
  continua sendo 2. O formato humano fica isolado no input. Nenhum registro
  existente foi reinterpretado/corrigido automaticamente.
- O bloco generico de pagamento estava inteiramente oculto para qualquer
  medicao, embora as flags de configuracao e obrigatoriedade continuassem
  ativas. Agora a medicao legada mostra forma/favorecido conforme a configuracao,
  sem duplicar contrato ou credor que ja aparecem no bloco Contrato.
- O contrato selecionado determina a trilha antiga/nova. Medicao do fluxo novo
  continua usando `BlocoMedicaoContrato` e `medicao_pagamento`, sem segundo
  pagamento generico. No controller, forma/favorecido genericos deixam de ser
  exigidos nessa trilha; o servico proprio continua validando seu pagamento.
- Preservados PIX, boleto, dados bancarios, documentos, permissoes,
  idempotencia/bloqueio de envio e endpoints existentes. Sem redesenho: componente
  reutilizavel usa as classes de input do Fluxy e apenas esclarece a digitacao.

## Arquivos

- `frontend/src/utils/quantidadeBR.js`
- `frontend/src/components/QuantidadeInputBR.jsx`
- `frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx`
- `frontend/src/pages/NovaSolicitacao.jsx`
- `backend/src/controllers/SolicitacaoController.js`
- `frontend/scripts/validarModalApropriacaoCompra.mjs`
- `frontend/scripts/validarPagamentoMedicaoLegada.mjs`
- `frontend/package.json`, este handoff e `docs/workspace/OWNERSHIP_ATIVO.md`

## Validacoes concluidas

Em `frontend/`:

- `npm run test:apropriacao-compra`: parser BR, digitacao progressiva de 2.000
  nas duas modalidades reais, rateio 2000, rascunho canonico, fracao 2,5,
  erro invalido, cancelar sem alterar rateio, total de Compra Direta 20.000,00
  para 2000 x 10 e payload numerico de revisao de Solicitacao de Compra.
- `npm run test:pagamento-medicao-legada`: pagina real com servicos simulados;
  configuracao visivel/oculta, obrigatoriedade, PIX, transferencia, boleto sem
  PIX/favorecido separado, troca entre contrato legado e novo sem duplicacao,
  envio legado de boleto e regra real do controller isolada via VM.
  O componente de pagamento novo e simulado para testar a selecao da trilha,
  nao a persistencia do servico. Nenhuma API externa ou banco foi acessado.
- `node scripts/validarReaproveitamentoCompra.mjs`
- `node scripts/validarCredorNovaSolicitacao.mjs`
- `node scripts/provas/ordemDeDeclaracao.mjs`: zero achados.
- `npm run build`: aprovado (avisos existentes de Browserslist/chunk grande).

Em `backend/`:

- `node --check src/controllers/SolicitacaoController.js`
- `node scripts/validarFluxosPixApropriacoesSolicitacao.js`
- `node scripts/validarRetornoContratoAprovadoObra.js`

`git diff --check`: aprovado. Build nao alterou o catalogo de navegacao versionado.

## Proximo passo e riscos

1. Aguardar autorizacao para commit/push dos arquivos acima, sem incluir outros
   checkouts. Atualizacao exige frontend na Vercel e backend de producao na EC2
   (`backend-solicitacoes`), sem reiniciar `backend-dev`.
2. Em producao, conferir digitacao de 2.000 e 2,5 nas duas compras, rateio e PDF
   de revisao. Nao interpretar um valor ja salvo como 2 como se fosse 2000.
3. Habilitar Forma de pagamento no tipo/area efetivo de uma medicao legada e
   confirmar exibicao e criacao. Configuracao desabilitada continua ocultando o
   campo. Medicao de contrato novo deve continuar exibindo apenas pagamento proprio.
4. Antes de corrigir quantidades historicas, identificar registros e obter
   autorizacao especifica: esta tarefa nao faz saneamento de dados existentes.
