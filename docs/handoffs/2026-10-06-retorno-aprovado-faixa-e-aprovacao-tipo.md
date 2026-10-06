# Retorno aprovado persistente e retirada da aprovacao generica

## Pedido e escopo

Manter a faixa de retorno aprovado para quem solicitou, com botao para devolver
ao setor em que a solicitacao estava antes do retorno. Remover do detalhe o botao
generico Aprovar Solicitacao (aprovacao por tipo), preservando fluxos especificos.
Implementacao local no worktree promocao-main-20261003, branch main.

## Alteracoes

- `backend/src/services/solicitacaoRetornoService.js`: contexto separa a faixa
  `retorno_aprovado` da acao autorizada `devolucao_retorno`. A faixa continua
  visivel ao autor ou SUPERADMIN mesmo com outro pedido pendente ou perda da
  permissao; nessas situacoes o botao fica indisponivel e informa o motivo.
  A acao exige a permissao existente `solicitacoes.retorno.solicitar`, acesso e
  setor atual, sem cancelamento ou pedido pendente nesse setor. Outros usuarios
  do mesmo setor nao concluem o pedido do autor.
- O destino continua obtido no servidor, pelo pedido aprovado e ultimo historico
  ENVIADA_SETOR, nunca por setor informado pelo cliente. Transferencia posterior
  ou devolucao concluida encerra a faixa; editar dados/status nao encerra.
- `SolicitacaoRetornoController.js` e `frontend/src/services/solicitacoes.js`:
  devolucao envia o ID do pedido confirmado. Pedido desatualizado recebe 409;
  clientes antigos sem ID seguem compativeis, com todas as verificacoes atuais.
- `RetornoSolicitacaoBar.jsx`: faixa compacta ancorada no topo, sem recolhimento,
  com titulo, instrucao e botao Devolver para [setor]. Pode coexistir com a faixa
  de pedidos aguardando decisao. Confirmacao e refs sincronas protegem cliques
  repetidos; erro mantem a faixa e permite tentar novamente.
- `SolicitacaoDetalhe/index.jsx`: retirados handler, estado e entradas da acao
  generica no cabecalho/catalogo, inclusive resolucao mobile. Mapeamento antigo
  `aprovar_solicitacao` nao recria o botao. Aprovar e enviar da diretoria,
  AcoesContrato, etapas de compras e autorizacoes de titulos foram preservados.

Devolucao altera somente o setor: preserva status e valores dos titulos, registra
historico e sincroniza o bloqueio financeiro do retorno na mesma transacao. Lock
da solicitacao impede duas devolucoes concorrentes. Notificacao posterior nao
transforma uma devolucao ja concluida em erro de negocio.

## Compatibilidade e limites

Sem nova permissao, variavel, configuracao, tabela ou migration. A API generica
de aprovacao por tipo e suas configuracoes foram mantidas; o pedido foi retirar
o botao do detalhe, nao eliminar endpoints ou regras automaticas.

Recarga de cartao tinha efeito financeiro na aprovacao por tipo: liberar titulo
em PREVISAO. Esse servico nao foi removido e a regra existente de sincronizacao
quando o status passa a LIBERADO/APROVADA permanece. Nao foi introduzida nenhuma
aprovacao automatica alternativa nem alterada a fila de pagamentos.

## Validacoes locais

- `node backend/scripts/validarDevolucaoRetornoSolicitacao.js`: ciclo completo,
  reconsulta persistente, autor/SUPERADMIN, permissao, pendencia, cancelamento,
  ID desatualizado, status preservado e chamadas concorrentes. Fixtures, sem DB.
- `node backend/scripts/validarBloqueioRetornoObra.js`: aprovado.
- `node backend/scripts/validarRetornoContratoAprovadoObra.js`: aprovado sem DB.
- `node backend/scripts/validarFluxosPixApropriacoesSolicitacao.js`: aprovado.
- `node backend/scripts/validarControleDiarioGeral.js`: regressao aprovada.
- `node frontend/scripts/validarDevolucaoRetornoSolicitacao.mjs`: componente real
  no Edge com API simulada, solicitar/aprovar/devolver, recarregar, cancelar a
  confirmacao, repeticao, falha/retry, pendencias, temas e viewport mobile.
  Catalogo real sem acao generica; aprovacoes especificas preservadas.
- `node frontend/scripts/validarNavegacao.mjs`, build frontend e diff-check:
  aprovados. Avisos existentes de Browserslist e tamanho dos chunks no build.
- Evidencias visuais inspecionadas em
  `qa/evidencias/retorno-aprovado-2026-10-06/` (ignoradas pelo Git).

## Estado e proximo passo

Sem escrita no banco real, commit, push, EC2 ou deploy nesta tarefa. Alteracoes
pendentes do controle diario de caixa da tarefa anterior preservadas.

Publicar backend e frontend juntos quando autorizado. Depois homologar com o
autor real: solicitar retorno, aprovar no setor atual, recarregar o detalhe,
ajustar informacoes e devolver. Confirmar setor anterior, status preservado,
historico unico e bloqueio financeiro sincronizado; outro usuario do setor nao
deve devolver esse pedido. Confirmar ausencia da aprovacao generica e manutencao
das aprovacoes especificas.

Em seguida, em 06/10/2026, o proprietario autorizou commit/push das alteracoes
pendentes desta conversa, incluindo o controle diario, e retorno a main.
Worktree ja em main. Banco real, EC2 e homologacao operacional nao foram incluidos.
