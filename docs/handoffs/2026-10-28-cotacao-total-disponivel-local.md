# Cotacao: total pela quantidade disponivel - 28/10/2026

## Autorizacao e escopo

Usuario pediu mudar a conta do total na resposta para quantidade disponivel x
preco e confirmou resposta/comparativo/PDFs. Em seguida perguntou quais PDFs;
analise do codigo confirmou que os PDFs atuais nao calculam esse total:
renderPdfCotacaoPublica desenha modelo com campos de preco/disponibilidade/total
vazios; PDF da SC mostra a demanda; pedido mostra a quantidade comprada e seus
valores persistidos. Esclarecimento enviado ao usuario, que respondeu ok.
Nao foi adicionado um novo documento nem alterados os existentes.

Base DEV6a1ebe6c, branch codex/compra-direta-total-itens-20261028. Preservada
alteracao local anterior de total da Compra Direta no bloco de itens.
Sem commit/push/EC2/deploy/migration, banco externo, operacao financeira ou
alteracao de registros reais. Nenhuma acao no navegador real nesta etapa.

## Mapeamento e implementacao

- GerenciarCotacaoSolicitacao.jsx: formulario interno passa a usar quantidade
  disponivel nas mercadorias e total por item (incluindo nova oferta para saldo).
  Quantidade solicitada permanece editavel pelo fluxo anterior e independente.
- CotacaoFornecedorPublica.jsx: mesma conta no portal do fornecedor; subtotal
  e total por item usam disponibilidade. Tooltips de ambos indicam a nova base.
- comprasCotacao.js: calcularValorMercadoriasCotacao passa a calcular apenas
  disponibilidade x preco. Nao usa nem altera obterQuantidadeBaseFinanceiraCotacao,
  helper separado que continua governando rateios de pedidos como antes.
- SolicitacaoCompraController.js: comparativo usa no calculo a quantidade
  efetiva ja exibida. Resposta legada disponivel sem quantidade explicita usa
  fallback anterior para demanda; zero explicito nao recebe esse fallback.
  Sem alterar consultas, JOINs, paginacao, escopo, elegibilidade ou selecao.
- IPI/ICMS/ST, DIFAL, desconto e frete continuam somados/subtraidos como antes;
  mudou somente o multiplicador das mercadorias. Pedidos continuam pela
  quantidade alocada, com rateios anteriores; nenhum pedido/titulo e recalculado.
- Totais de ofertas ja existentes passam a ser exibidos pela nova base apos
  publicacao; nao ha backfill/escrita para esse efeito de leitura.

## Validacoes

- validarCompraCotacaoEnvio.js PASS sob semRedeQa: helper puro com
  disponibilidade0/2,5/4/50 distinta da solicitada10; comparativo REAL extraido
  do controller, servicos reais com fixture sem DB, oferta identificada e
  tributos/frete preservados; zero excluido e null legado compatível.
  Base financeira ACUMULADA de pedido continua solicitada10; OFERTA_SALDO
  continua disponivel4. Casos anteriores de escopo/ACL/fechamento continuam.
- Novo validarCotacaoTotalDisponivel.mjs PASS: formularios reais interno e
  publico1366/390, API ficticia e rede externa bloqueada. Testa disponibilidade
  menor/fracionada/maior/zero/vazia, preco alterado e solicitada independente,
  total do item/mercadorias/resumo com tributos/frete/DIFAL/desconto conservados.
  Sem enviar resposta; contador de envio0. Fotos em outputs/cotacao-total-disponivel.
- Regressoes PASS sob semRedeQa: validarCompraRemanejamento.js,
  validarPrevisaoEntregaCotacao.js, validarPedidoEntregas.js e
  validarComprasCarregamentoSemProduto.js. Geracao real com persistencia em
  mocks; protecoes contra produto cartesiano preservadas, sem DB externo.
- Build frontend PASS14.20s. Avisos existentes de Browserslist/chunk grande.
  Teste inicial UI precisou localizar valor do item sem depender de tbody,
  pois celular apresenta os dados em cards; rerun dos quatro cenarios PASS.

## Limites e proximo passo

Publicacao DEV autorizada depois: seguir2026-10-28-publicacao-compras-totais-dev.md.

Implementacao local pronta. Publicar primeiro DEV somente quando usuario pedir,
com pacote backend novo incluindo os2 arquivos runtime e QA atualizado. Nao
alterar inventarios congelados anteriores nem publicar frontend antes de backend
compatível, para nao deixar total da tela e comparativo divergentes.
Depois homologar os valores e promover seletivamente quando autorizado.
Mudanca nao recupera preco/quantidade de oferta anterior marcada como nao
disponivel; relato SC666 permanece em verificacao pelo usuario com o operador.
Servico pedidoCompraService.js e PDFs permanecem byte a byte iguais ao HEAD.
