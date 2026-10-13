# Forma de pagamento nos titulos e data obrigatoria de compra

## Estado e escopo

Publicacao autorizada pelo usuario em 11/10/2026: commit e push das pendencias
desta conversa somente na refactor/frontend. Sem main, EC2 ou banco real.

Implementado localmente na refactor/frontend sobre 16f95735, preservando o
ajuste pendente do titulo das compras. Usuario autorizou a implementacao,
nao commit/push, main ou deploy. Sem banco real, migration ou alteracao de
registros existentes. Ownership liberado; outputs/ fora do Git.

## Mapa e mudancas

- FinanceiroCard/TabelaPadrao no detalhe: nova coluna Forma de pagamento,
  apos Parceiro. Usa formaPagamento.nome do proprio titulo, com fallback
  pelo ID no catalogo existente; sem forma exibe travessao. Nao usa a forma
  da solicitacao, que pode conter mais de um pagamento. Colunas, links,
  selecao, comprovantes, envio e permissoes permanecem no componente padrao.
  Skill frontend-design utilizada para preservar a tabela compacta e os
  cards responsivos existentes, sem novos elementos decorativos.
- GET /solicitacoes/:id/titulos-financeiros ja inclui formaPagamento na
  leitura financeira completa. Na leitura resumida autorizada para Obra,
  inclui agora forma_pagamento_id e somente id/nome da associacao, sem dados
  bancarios, cartoes ou beneficiarios. Guards funcionais e escopo intactos.
- Fila ja possui Forma / instrumento, visivel por padrao e configuravel pelo
  usuario. Inicializa pela forma do titulo e permite informar a efetivamente
  utilizada na baixa. Conferida sem duplicar coluna ou mudar a fila.
- NovaSolicitacaoCompra: Necessario para no cabecalho passa a obrigatorio
  para compra comum, tanto no campo quanto na validacao de revisar. Compra
  Direta continua exigindo Data de vencimento. Datas individuais dos itens
  e seus defaults existentes nao foram alterados.
- RevisarSolicitacaoCompra bloqueia criacao de rascunho antigo sem data e
  orienta voltar/editar, sem apagar o rascunho. Autosave incompleto permitido.
- POST /compras/solicitacoes: validateCompraCreateBody exige necessario_para
  usando parser existente. POST de Compra Direta ja exigia a data e segue
  igual. Nao altera status, aprovacao, rateios, idempotencia ou schema.

## Validacoes executadas

- validarTituloCompras.mjs: paginas, componentes, HTTP e controller reais
  com transporte/modelos isolados. Dois modos, required, bloqueio sem data
  mesmo com datas nos itens, revisao antiga bloqueada sem perder draft,
  data valida/ano bissexto/formato invalido, autosave, voltar, titulo,
  previa HTML escapada, desktop/mobile e somente um POST em duplo clique.
- validarPayloadSolicitacaoCompra.mjs e validarReaproveitamentoCompra.mjs: OK.
- validarMedicaoRecargaEnvioUI.mjs: forma do titulo mesmo com catalogo vazio,
  titulo sem forma, tabela desktop e cards mobile; aprovacao, permissoes,
  autorizacao/fila, cancelamento, retry idempotente e dupla acao: OK.
- validarFilaInstrumentosUI.mjs (inclui filaColunasQA/filaArquivosPreviewQA):
  instrumentos existentes, arrasto/visibilidade por usuario, persistencia,
  selecao parcial/todos, baixa em massa com juros/multa, rolagem/modais: OK.
- validarComprovantesTitulosSolicitacao.js: consulta real isolada em VM,
  forma no resumo com somente id/nome, sem ampliacao de dados bancarios,
  comprovantes de baixas/importacoes e negativas de acesso/escopo: OK.
- validarCompraDiretaGeoAcesso.js, validarCompraCriacaoTodasObras.js
  (14 cenarios), validarCredorCompraDireta.js: OK, sem banco/rede.
- node --check dos arquivos backend alterados, npm run build (559 modulos)
  e git diff --check: OK. Avisos antigos Browserslist/chunk grande mantidos.
- Capturas em outputs/qa-medicao-recarga-envio e outputs/titulo-compras
  conferidas visualmente em 1366 e 390px; nao substituem aparelho fisico.

## Riscos e proximo passo

Sem homologacao em EC2/banco real. Pendencias antigas de hidratacao de rateios
e marcador do teste de frete seguem documentadas no handoff do titulo das
compras; nenhuma delas foi corrigida ou declarada aprovada neste ajuste.

Se autorizado, publicar as pendencias na refactor/frontend e atualizar backend
e frontend dev juntos. Homologar leitura Financeiro como Obra/Financeiro,
forma dos titulos, fila e criacao comum sem/com data. Rascunhos antigos sem
data precisam ser completados; nenhuma solicitacao existente e reescrita.
