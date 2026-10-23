# Medicao pendente: rejeicao e edicao do favorecido - 23/10/2026

## Escopo e estado

Usuario autorizou implementar/testar na base refactor/frontend, sem producao.
Checkout de trabalho: branch codex/solicitacao-distribuicao-gerencial-20261023,
base45513bfd. Agente unico; nenhum commit/push, EC2, banco real, .env ou
migration aplicada. Preservado o delta local anterior dos filtros/arranjo.
Outputs privados de QA continuam fora do commit.

## Implementacao e impactos

- Novos medicaoOperacaoContextoService, medicaoRejeicaoService,
  favorecidoEdicaoService/Auditoria e MedicaoOperacoesController. Rotas
  autenticadas/validadas e rate limit em POST/PATCH; contexto resolve ID da
  medicao para o contrato correto, nunca usa guarda de contrato com ID errado.
- Rejeicao exclusiva de evento pendente do fluxo novo: previsoes CONTRATO sem
  baixa nem operacao externa, valores/parcelas coerentes. Lock contrato,
  medicao, solicitacao, vinculos, parcelas e titulos; mesma transacao para
  cancelar, recibos, novas previsoes, devolucao dos vinculos e historico.
  Aprovar/editar valor tambem usam contrato antes de medicao para evitar
  inversao de locks com rejeicao/criacao; leitura apos o lock confere rejeicao.
- Manter parcelas e valor_previsto, trocar apenas titulo para nova PREVISAO
  pelo criador canonico, com transacao externa, sem baixa/cartao, forma ainda
  pendente e rateios copiados. Titulos antigos ficam CANCELADO/saldo0 com
  valor_original e snapshot preservados. Nao aumenta contrato nem numero de
  parcelas. Outra medicao pode usar a previsao nova; sequencial nao reutiliza
  a medicao rejeitada. Nao apagar/reativar titulos ou anexos.
- ContratoMedicao.rejeicao guarda motivo, autor, data, chave/hash e resultado.
  MedicaoParcela.devolvido_em/motivo libera comprometimento no calculo existente.
  obterMedicaoAtual ignora rejeitadas; atualizar/aprovar recusam rejeicao.
  Devolve a OBRA apenas se nao existe outra pendencia; preserva outros ciclos.
- Favorecido da medicao usa permissao propria GEO/SUPERADMIN, ACL/interacao
  da solicitacao e bloqueios financeiros. Partes mantem valores/forma/anexos;
  primeira instrucao acompanha os campos principais. Nova conferencia/motivo.
- Titulo pendente delega para medicao; titulo vigente altera so seu recebedor
  e snapshot JSON pagamento_favorecido. Credor, valores/saldo/status, datas,
  medicao aprovada, outros titulos e cadastro global ficam intactos.
  Instrucao antiga de conta nao pode virar pagamento bancario automaticamente.
- Snapshot novo e prioridade na consulta/SQL da fila, detalhe e hash do
  dossie. Diferencas futuras de medicao copiam o snapshot. Detalhe PREVISAO
  tambem mostra a medicao pendente; a fila conserva aprovacao como portao.
- LogExclusao permanente e SecurityEventLog auditam antes/depois; correcao
  exclusiva financeira nao cria autoria/passagem por setor na solicitacao.
  Rejeicao e correcao da medicao registram Historico da etapa autorizada.
  Logs de falha inesperada no controller nao imprimem payload, PIX ou banco.
- Novas permissoes contratos.medicao.rejeitar e editar_pagamento, sem grants
  automaticos. Interface le os mesmos booleans do backend. Titulos exigem
  permissao nominal editar e escopo financeiro de todas as obras do rateio.
  Corrigido mapa faltante GET/PATCH pagamento da negociacao com a mesma chave
  editar ja exigida pelo servico; nao relaxar ACL.
- UI: FavorecidoEditor reutilizado no modal, detalhe e edicao do titulo;
  RejeitarMedicao no modal pendente. Busca de parceiro existente, limpa dados
  antigos ao trocar, motivo/aceite/confirmacao e guarda contra clique duplo/
  alvo trocado. Modal bloqueia aprovar/salvar enquanto o editor estiver aberto.
  Pagina de edicao protege rascunho generico, separado do editor do recebedor.

## Migration e homologacao

Migration202610230001_medicao_rejeicao_favorecido_titulo.js cria somente duas
colunas JSON nullable (rejeicao e pagamento_favorecido), idempotente por coluna.
Sem backfill ou mudanca de dados existentes; down bloqueado para nao apagar
trilhas. Nao foi aplicada. Requer executar em DEV ANTES de reiniciar backend
com este codigo. Nao usar os roteiros de deploy anteriores com inventario
fechado para um SHA novo; preparar roteiro proprio quando houver autorizacao
de commit/push. Nao reiniciar producao ou alterar flags de autorizacao.

1. Em DEV, medicao pendente com duas parcelas/sem baixa: rejeitar com motivo,
   conferir titulos antigos cancelados, novas previsoes, saldo e historico.
2. Pedir nova medicao na mesma parcela, conferir novo numero/dados e aprovar.
3. Corrigir favorecido da medicao (e de cada parte quando houver divisao),
   confirmar PIX limpo/reinformado e dados exibidos antes de aprovar.
4. Abrir edicao do titulo PREVISAO medido: conferir que altera a medicao,
   nao uma instrucao divergente. Em titulo aberto sem baixa, editar somente
   esse titulo e conferir detalhe/fila/filtro e auditoria permanente.
5. Negativas: medicao aprovada, usuario sem grant/obra/setor, fila/autorizacao,
   pagamento parcial/quitado, boleto/remessa/cartao/cheque/conciliacao ativos.
   Nenhum cancelamento parcial nem mudanca de pagamento deve ser gravado.

## Validacoes

- Backend novo QA: servicos reais em VM, models transacionais em memoria;
  rejeicao multiparcelas/24limite, replay/concorrencia/rollback de cada etapa,
  ACL/obra/setor, medicao antiga/aprovada/operacoes vinculadas e criacao REAL
  de nova medicao pelo servico existente. Testa alteracao via titulo/medicao,
  partes independentes, PIX/aceite, referencias obsoletas, pago intacto,
  trilha permanente sem logs e protecao de remessa com dados divergentes.
- UI novo QA real1366/390: modal original e editor, busca/limpeza de PIX,
  confirmar/cancelar/retry409, aprovar/salvar bloqueados, readonly/aprovada,
  troca de alvo e Content-Type JSON. Pagina original de edicao integrada.
- Regressao: saldo reprogramacao, valor medido/pagamento e divisao favorecidos,
  ciclo atual medicao/recarga, encerramento, contratos operacional/aprovacao/
  retorno, pagamentos, autorizacao proprietario, titulos cancelamento e
  desvinculacao, negociacao, destinatarios/PIX/paidTIT-009886, SQL SQLite/lookup,
  detalhe real e modal pagamento, arranjo/filtros anteriores.
- UI original de edicao tambem validou bloqueio do formulario durante correcao,
  cancelamento do editor com rascunho generico alterado e preservacao desse
  rascunho sem enviar o financeiro. Screenshots1366/390 inspecionados.
- Auditoria granular399 sem chaves invalidas/duplicadas;80rotas financeiras
  mapeadas. Build643modulos/12,28s aprovado (avisos anteriores de Browserslist e
  chunks grandes). Documentacao610Markdown/19canonicos, sintaxe Node e diffcheck
  aprovados. Nenhum teste dependeu de API/DB reais para esta implementacao.
- Trabalho local concluido; ownership liberado. Proximo passo: mediante pedido
  explicito de publicacao, revisar delta junto ao arranjo de filtros anterior,
  preparar inventario/script de deploy DEV com migration, repetir testes,
  commitar/push somente refactor/frontend. A homologacao real em DEV ainda
  sera feita pelo usuario; sem permissao de alterar main/producao nesta tarefa.

## Publicacao DEV autorizada

- Usuario autorizou commit/push somente da medicao/favorecido na
  refactor/frontend. O arranjo pessoal dos filtros permanece local e fora
  deste commit, inclusive suas partes em package.json e documentacao.
- Roteiro: `ops/deploy/atualizar-dev-medicao-rejeicao-favorecido-20261023.sh`.
  Recebe SHA completo publicado e exige backup DEV confirmado; checkout
  exclusivo DEV limpo, ancestral45513bfd e fast-forward. Inventario fechado
  de29arquivos runtime, manifestos sem novas dependencias e uma unica migration.
- Runner `backend/scripts/aplicarMigrationMedicaoRejeicaoFavorecidoDev.js`:
  --verificar somente leitura; --aplicar exige CONFIRM_DEV_BACKUP=SIM. Confere
  ambiente development/8001, host e UUID do RDS staging, banco, processo PM2,
  flags e configuracoes equivalentes. Recusa qualquer outra migration pendente.
  DDL permitido somente durante o runner, sem persistir flag ou alterar .env.
  Confere duas colunas JSON opcionais e schema atualizado antes do reinicio.
- QAs locais novamente aprovados: rejeicao/favorecido/migration idempotente,
  simulacoes negativas do runner/roteiro,18regressoes de backend incluindo
  SQL SQLite, auditoria399/80rotas, UI real1366/390, detalhe/negociacao e
  compilacao643modulos. Avisos anteriores de Browserslist/chunks permanecem.
- Roteiro executa QAs isolados antes da migration, preserva hash do .env e
  reinicia exclusivamente backend-dev, sem --update-env; health8001 e schema/
  sessao sao verificados depois. Nao instala pacotes nem altera permissoes.
- Testar no DEV: GEO explicitamente autorizado ou SUPERADMIN; rejeitar medicao
  pendente com motivo, conferir originais cancelados, saldo liberado, historico
  e possibilidade de nova medicao. Nenhum titulo pago pode ser rejeitado.
  Editar favorecido/PIX de medicao pendente e titulo aberto elegivel; conferir
  fila/detalhe, manter credor/valor/vencimento e recusar baixa/operacao ativa.
- Migration preparada, mas nao aplicada nesta sessao. Nenhuma alteracao de
  producao/main, EC2 ou dados reais. Homologacao/deploy DEV ficam com o usuario.
- Conferencia do index real:29runtimes exatos e uma migration. Copia isolada
  sem arranjo local dos filtros aprovada: servicos/runner, UI1366/390,
  documentacao609/19 e build643/13,61s. Ownership de publicacao encerrado.
