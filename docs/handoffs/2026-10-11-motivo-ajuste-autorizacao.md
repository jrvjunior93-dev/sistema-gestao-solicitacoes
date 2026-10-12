# Motivo de ajuste informado pelo proprietario

## Pedido, mapa e causa

Exibir motivo de Aguardando ajuste no historico da solicitacao e na tela que
lista lotes de autorizacao. Implementacao local em refactor/frontend; sem
commit/push, main, banco real, migration ou EC2. Pendencias Pix/consulta da
fila e auditoria financeira de outra conversa preservadas.

Fluxo mapeado: decisao digital salva PagamentoAutorizacaoItem.motivo_decisao,
evento ITEM_REJEITADO e chama registrarAnaliseRecusada na mesma transacao.
Esta grava Historico.observacao e StatusArea quando troca a solicitacao para
AGUARDANDO AJUSTE. Timeline exibia observacao somente de ENVIADA_SETOR;
por isso o print mostrava status sem motivo. A listagem dos lotes ja entrega
motivo_decisao; coluna Motivo existia, mas resumo da lista nao tinha motivo.

Segunda lacuna: apos o primeiro titulo rejeitado mudar o status, recusas dos
demais titulos da mesma solicitacao nao gravavam motivo no historico. A regra
da medicao atual tambem precisava preservar status sem perder o motivo antigo.

## Alteracoes

- Timeline.jsx: exibe observacao para STATUS_ALTERADO e novo evento
  AUTORIZACAO_PAGAMENTO_REJEITADA, sem repetir descricao igual. Texto escapado
  pelo React; quebras de linha mantidas. Anexos, remocao e ordem preservados.
- analiseProprietarioService.js: toda recusa elegivel registra historico;
  somente solicitacao em analise e medicao atual alteram status global.
  Quando nao muda status, evento proprio sem falsa transicao; setor/saldo e
  status financeiro nao mudam. Guard do titulo/transacao mantem replay seguro.
- autorizacaoPagamentoResumo.js: resumo de motivos REJEITADO/INVALIDADO com
  codigo SOL/TIT do snapshot; nao modifica dossie, hash ou dados assinados.
- FinanceiroAutorizacoesPagamento.jsx/CSS: resumo compacto no proprio lote;
  coluna Motivo com leitura integral em modal (query motivo/item). Mesmo
  padrao de justificativa, fora/Escape/Fechar/voltar e link direto seguros;
  parametros mutuamente exclusivos, filtros e lote preservados. Sem endpoints
  ou permissoes novos, sem editar textos/decisoes e sem baixa automatica.
- Skill frontend-design usada para manter leitura compacta e reutilizar os
  componentes/padroes existentes, sem redesenhar o modulo.

## Validacoes

- Backend validarAnaliseProprietario: modelos/passkey isolados; dois motivos
  na mesma solicitacao, antiga/atual medicao, replay, rollback de falha do
  historico, permissao nominal, locks, auditoria, rejeicao/invalidacao,
  revogacao/baixa parcial e convergencia existentes. Sem banco/rede.
- Frontend validarFilaAutorizacaoConvergencia: tela real com APIs simuladas;
  resumo SOL/TIT, motivo longo/HTML literal, modal desktop/mobile, quatro
  fechamentos, link direto, nao sobrepor justificativa, nao enviar decisao;
  testes existentes de atualizacao/concorrencia/revogacao mantidos.
- Frontend validarRemocaoAnexosHistorico: Timeline real; observacao legada,
  novo evento, ator/status/texto integral, HTML literal e deduplicacao visual;
  remocao/cancelamento/erro/retry/permissao de anexos mantidos.
- Build, docs, sintaxe e diff aprovados; avisos preexistentes de Browserslist
  e chunk acima de 500 kB mantidos, sem atualizacao de dependencias.

## Limites e proximo passo

Motivos antigos JA GRAVADOS em Historico.observacao passam a aparecer sem
reconciliacao. Motivos antigos que nao foram registrados no historico nao
sao reconstruidos aqui; seu motivo_decisao continua visivel no lote original.
Nao acessar banco/producao nem executar backfill sem pedido especifico.
Commit/push autorizado pelo usuario em 2026-10-11 na refactor/frontend,
junto de Pix/dados da fila e interacoes. Backend/UI, build/docs/diff
revalidados antes da publicacao. Auditoria financeira e outputs excluidos.
Proximo passo: homologar rejeicao de um e varios titulos em dev e leitura
do motivo em historico/autorizacoes. Sem banco, deploy ou promocao para main.
