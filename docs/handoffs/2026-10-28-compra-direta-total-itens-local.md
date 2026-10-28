# Compra Direta: total junto dos itens - 28/10/2026

## Pedido e base

Usuario orientara a obra sobre o preenchimento dos itens e pediu retirar o
campo de valor calculado da forma de pagamento, levando total ao bloco de itens.
Base refactor/frontend6a1ebe6cfd52485ec1078975cd32274c9c95932b, branch
codex/compra-direta-total-itens-20261028. Sem commit/push/EC2/deploy/migration
ou alteracao de registros reais. RH e permissao de pagamentos nao alterados.

## Mapeamento e implementacao

- NovaCompraDireta monta NovaSolicitacaoCompra com modoCompraDireta. A forma
  unica usa valorTotalCredorCompraDireta no payload, derivado dos itens/desconto/
  frete. O campo antigo readOnly parecia uma entrada para digitacao.
- NovaSolicitacaoCompra.jsx: nao mostra mais esse campo para forma unica;
  mostra orientacao curta e conserva erro de validacao visivel. Cabecalho
  passa a Forma de pagamento nesse caso. Mensagem de total zerado aponta para
  quantidade/valor unitario dos itens, mantendo a mesma condicao de bloqueio.
- Varias formas mantem entradas editaveis, com nomes acessiveis individuais,
  e a soma obrigatoria igual ao total do credor. Regra de calculo/envio intacta.
- Total antigo abaixo das formas saiu. Nova faixa dl dentro do bloco Itens
  da solicitacao usa os mesmos valores calculados existentes: total bruto,
  desconto, frete, total do credor quando separado e total geral da compra.
  So aparece em Compra Direta, inclusive com itens vazios. Sem novo card ou
  alteracao de tabela/globalCSS. Campos e botoes anteriores permanecem.
- Arquivos: frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx,
  frontend/scripts/validarCompraDiretaCredorObrigatorio.mjs, README Compras,
  ownership e este handoff. Nenhuma alteracao backend.

## Validacoes

- QA UI real ampliado PASS em1366/390: ausencia de entrada monetaria na forma
  unica, total dentro da secao correta, recalculo por quantidade/preco/desconto,
  frete incluso e frete terceiro, soma do credor e total distintos corretos.
  Rateio50+30 recusado para total90;50+40 aprovado e payload revisado preservado.
  Casos existentes de credor obrigatorio/opcional, nome digitado, restauracao/
  autosave de rascunho, favorecido distinto, falha/espera e duplo envio passam.
  Revisao nao cria registros; unico POST do teste anterior e simulado/negativo.
- npm run build frontend PASS em12.72s. Avisos ja existentes de Browserslist
  e tamanho de chunk nao impediram build. Gerador de navegacao nao mudou Git.
- Capturas inspecionadas em outputs/compra-direta-credor-obrigatorio/
  total-itens-1366.png e total-itens-390.png; saidas locais nao versionadas.
- Sem API real/banco externo nos testes. Pagina de RH e regras financeiras
  nao alteradas. Nao repetir QA amplo sem nova alteracao/falha pertinente.

## Relato adicional de comparativo SC-00666

Usuario relatou resposta confirmada mas sem selecao em Cards/Mapa. Leitura
da aba autenticada ja aberta confirmou status RESPONDIDO, comparativo sem
ofertas, e editor com preco vazio/quantidade disponivel0. Somente consulta:
nenhum campo digitado, nenhum salvar, pedido ou encerramento executado.
Editor fechado por Cancelar e auditoria recolhida ao fim; sem SSH/EC2/SQL.
Sem leitura de credenciais ou uso do link publico do fornecedor.

Teste local validarComparativoCardsResponsivo.mjs PASS: com resposta valida,
seleciona em Cards/Mapa, conserva quantidade e chama callback simulado de
geracao uma vez. Nao prova que a carga real do servidor esteja completa.
O backend atual exclui do comparativo respostas sem preco/quantidade positivos;
ao salvar como nao disponivel, normaliza preco para null e quantidade para0.
Usuario verificara com o operador se ambos campos foram preenchidos. Nao
presumir causa confirmada nem habilitar pedidos sem oferta valida. Nenhuma
alteracao no comparativo/controlador nessa etapa. Se operador confirmar ambos
preenchidos, proximo passo e conferir resposta de API/carga e auditar vinculos
somente por leitura autorizada, mantendo JOINs separados/paginacao/ACL.

## Proximo passo

Publicacao conjunta DEV autorizada depois: seguir2026-10-28-publicacao-compras-totais-dev.md.

Alteracao visual pronta localmente para revisao; publicar em refactor/frontend
somente quando usuario pedir. Sem pacote EC2 necessario para esta alteracao
exclusiva frontend. Depois homologar DEV e promover apenas esse delta para
main quando autorizado. Manter extras DEV e commits produtivos anteriores.
