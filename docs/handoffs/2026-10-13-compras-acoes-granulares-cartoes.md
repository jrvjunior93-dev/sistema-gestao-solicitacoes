# Compras: acoes granulares e cartoes do pedido - 13/10/2026

## Entrega local

Rodape do comparativo compartilhado, inclusive sem respostas comparaveis.
Exibicao independente por permissao de encerrar/encerrar sem pedido/gerar
pedidos; acao impedida permanece desabilitada com motivo de contexto/status.
Nao foram removidos bloqueios do backend nem concedidas permissoes.

Titulos do pedido e frete de terceiro aceitam cartao ativo compativel e data
da compra. A projecao minima de instrumentos ocorre somente no detalhe
financeiro do pedido ja autorizado, nao nas listas/resumos leves. O servico
financeiro canonico cria movimentos e vincula credito parcelado a faturas;
debito usa a conta vinculada. Curadoria das formas apenas expoe gera_fatura,
sem alterar elegibilidade. Boleto de pedido continua opcional.

## Arquivos

GerenciarCotacaoSolicitacao.jsx, PedidoCompraFinanceiro.jsx,
pedidoCompraFinanceiroService.js, formasPagamentoMedicaoService.js,
operationalValidators.js (somente payload do pedido), validarPedidoBoletoOpcional.js,
validarCartaoOpcionalSolicitacao.js, validarPedidoBoletoOpcionalUI.mjs,
validarWorkspacePiloto.mjs e README Compras.

## Validacoes executadas

UI real desktop/mobile: cartoes ativos por tipo, campos condicionais, frete,
parcelas e data, Boleto opcional/multiplo, Pix e modo somente leitura.
Cotacao com Compras comum: permissao exclusiva de encerrar sem pedido nao
habilita gerar, falta de permissao, contexto bloqueado, terminal e comparativo
vazio. Regressoes piloto/ACL e build passaram.

Backend isolado: projecao minima, resumo leve sem instrumentos, payloads
validos/invalidos, card inativo/incompativel, datas impossiveis, idempotencia;
servicos reais de criacao manual e de faturas com fronteiras ORM simuladas,
credito em duas parcelas/faturas e debito com conta vinculada. Regressoes de
GEO, escopo pedidos e acesso direto aprovadas. Nenhum banco/EC2 operado.

## Riscos e proximo passo

- O usuario informado foi Luiz Afonso Pirovani Barradas. Seus dados/permissoes
  reais nao foram consultados; homologar em dev usando sua configuracao real.
  Se houver bloqueio de contexto/status, o motivo deve aparecer no rodape.
- Cartao precisa da conta ativa/empresa conforme regras financeiras existentes;
  escolha de cartao nao substitui essas validacoes. Vencimentos de credito
  seguem fechamento/vencimento da fatura, como descrito no formulario.
- Sem migration de Compras. Deploy conjunto backend/frontend ainda nao feito.
- Foram executadas suites focadas, nao a suite global inteira. Avisos de build
  existentes: Browserslist antigo e chunk maior que 500kB.
- Alteracoes nao commitadas/publicadas; outputs/ fora do commit.
