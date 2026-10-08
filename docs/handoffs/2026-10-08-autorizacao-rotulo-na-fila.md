# Rotulo NA FILA na autorizacao de pagamentos

## Ajuste

O status interno `CONCLUIDO` passa a ser exibido como `NA FILA` na lista e
no cabecalho do detalhe da tela de Autorizacoes de Pagamento. O componente
Status mantem as classes CSS e o rotulo dos itens `ENFILEIRADO`.

Nao altera enum, backend, registros, auditoria, permissoes, fila ou baixa.
O lote pode conter itens rejeitados: seus status individuais continuam
visiveis e nao mudam. NA FILA nao significa titulo quitado.

O reprocessamento existente encaminha itens ja autorizados; nao executa
nova decisao nem pede outra assinatura. Revalidacoes financeiras e
protecao de duplicidade permanecem no backend.

## Arquivos e verificacao

- FinanceiroAutorizacoesPagamento.jsx: somente apresentacao do status.
- validarFilaAutorizacaoConvergencia.mjs: teste da tela real com APIs simuladas,
  incluindo lista/detalhe, lote misto e reprocessamento sem botao de autorizar.
- Documentacao de autorizacao do proprietario, ownership e este handoff.

Validacoes locais aprovadas:

- Teste de tela `test:fila-autorizacao-convergencia-ui` em Chrome headless,
  com APIs simuladas: rotulos, lote misto e ausencia de nova decisao.
- `validarAnaliseProprietario.js`: regressao com models/biometria simulados,
  sem banco ou rede.
- Build de producao do frontend aprovado; avisos existentes de Browserslist
  e tamanho dos chunks, sem atualizacao de dependencias.

Sem escrita em banco real, commit, push ou deploy. O teste de tela nao
executa envio real de titulos nem comprova concorrencia em MySQL real.

## Proximo passo

Publicar apos autorizacao; entrega de frontend sem migration ou reinicio de
backend por causa deste rotulo. Homologar na interface com lote na fila,
lote misto e autorizados ainda nao encaminhados. Nao criar dados de teste
diretamente no banco de producao.
