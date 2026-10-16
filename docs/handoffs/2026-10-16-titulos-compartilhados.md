# Titulos compartilhados - 16/10/2026

## Autorizacao e isolamento

Usuario autorizou implementar consolidacao de solicitacoes/pedidos, incluindo obras
e CNPJs devedores diferentes. Confirmou **um titulo canonico por parcela**, com a
divida distribuida por empresa e origem. Nao criar titulos distintos por CNPJ.
Usuario autorizou agora commit/push em refactor/frontend e entrega de comandos
EC2 DEV incluindo a migration. Agente nao executa EC2/banco real/reinicio e nao
altera producao nem promove main. Sem delegacao.

Base `bed984fa8046c5b0996c6b0f1406c228a029771a` de refactor/frontend.
Worktree: `C:/Users/Ricardo/.codex/worktrees/performance-fila-dp-20261015/Fluxy`.
Branch de preparacao: `codex/titulos-compartilhados-20261016`, destino autorizado
de publicacao `refactor/frontend`. Delta isolado a partir da base acima.
Preservar `outputs/` e o trabalho de contratos do outro checkout.

## Implementacao local concluida

- Migration estrutural/idempotente `202610160001_titulos_compartilhados.js`:
  lotes, participacoes e FK opcional no titulo. Sem backfill/DML/down destrutivo.
- Domain/service/controller, modelos e endpoints autenticados de busca,
  previa, confirmacao e cancelamento integral. Mesmas permissoes de gerar titulo de pedido ou financeiro
  operacional, com visibilidade e autorizacao por origem revalidadas no backend.
- Valores em centavos; soma por origem/parcela exata; chave idempotente vinculada
  ao usuario e hash do payload; snapshot de conferencia; locks/rollback.
- UI compacta dentro da solicitacao e gestao financeira do pedido. Busca de
  SOL/PC/pedido/descricao/obra; selecao persiste entre buscas; CNPJs visiveis;
  conferencia invalida quando altera entradas; retry conserva chave.
- Titulo sem empresa/obra principal quando multiempresa/multiobra: identidade
  economica preservada nas participacoes. Nao atribuir tudo a primeira origem.
- Projecoes financeiras por origem/empresa, pedido, resultados de obras, fila
  unica; protecao contra edicao/cancelamento isolado; baixa/estorno preservam rateio.
- Leitura operacional da solicitacao usa DTO somente da propria participacao;
  nao encaminha o valor parcial como se fosse o titulo completo. Operacoes do
  titulo canonico exigem todas as obras no escopo financeiro.
- Fluxos proprios (contratos, adiantamentos, DP, recargas, cartoes na criacao)
  permanecem no fluxo atual. Pedidos usam total fechado; frete de terceiro
  pendente deve ser regularizado no fluxo proprio, nunca embutido no fornecedor.
- Cancelamento integral exige permissao financeira de excluir, motivo, acesso
  a todas as obras e lote sem baixa/fila/autorizacao/pagamento ativo. Falha de
  integracao bancaria ainda bloqueia cancelamento, pois nao comprova ausencia de
  processamento no banco. Mantem participacoes, historico e auditoria; retry nao
  duplica eventos. Cancelar por uma origem/editar/renegociar isoladamente bloqueado.
- Baixa direta em massa identifica todos os devedores, nao apenas empresa_id
  escalar. Comprovante valida escopo antes de S3 e revalida transacionalmente.
  Retorno de uma origem nao libera o bloqueio enquanto outra continua pendente.

## Arquivos / pontos de entrada

- backend/migrations/202610160001_titulos_compartilhados.js;
  models/TituloCompartilhadoLote, TituloCompartilhadoOrigem, TituloFinanceiro e index.
- backend/src/services/tituloCompartilhado*: domain, service, leitura, consulta,
  protecao, pagamento, sincronizacao, retorno e cancelamento; controller e routes.
- Integracoes: tituloFinanceiroService, tituloRenegociacaoLeitura/Protecao/Service,
  pedidoCompraFinanceiroService, solicitacaoFinanceiroStatusService,
  tituloBloqueioRetornoObraService, pagamentoManualFilaService,
  pagamentoFilaFiltrosDomain/LiquidacaoService, pagamentoAutorizacaoService,
  relatorioFinanceiroService, resultadoObrasService e obraGestaoService.
- frontend/src/components/financeiro/TitulosCompartilhadosModal,
  ParticipacoesTitulo, CancelarLoteCompartilhado; services/titulosCompartilhados,
  utils/tituloEmpresasDevedoras e envioTitulosPagamento. Integracoes nas paginas
  FinanceiroTitulos/Detalhe/Editar/FilaPagamentos/AutorizacoesPagamento,
  FinanceiroCard da solicitacao, PedidoCompraFinanceiro e TituloNegociacaoModal.
- Novos validadores backend validarTitulosCompartilhados, Migration e
  Sincronizacao; frontend validarTitulosCompartilhadosModal; scripts package.json.
  Mocks de regressoes ampliados sem retirar asserts; READMEs Compras/Financeiro.

## Validacoes executadas

- `backend/scripts/validarTitulosCompartilhados.js`: 100 origens x 120 parcelas
  (matematica), duas empresas/obras, previa somente leitura, simultaneidade/replay,
  payload divergente, perda de escopo, rollback, baixa parcial, estorno, projecoes
  por pedido/solicitacao/empresa, retorno multiplo, cancelamento integral e
  negativas de pagamento/fila/ACL, geracao SQL MySQL sem conexao: aprovado.
- `frontend/scripts/validarTitulosCompartilhadosModal.mjs`: navegador Chrome real
  local em 1366/390, selecao, conferencia, alteracao invalida previa, duplo clique,
  timeout/retry com mesma chave e cancelamento com motivo/duplo clique: aprovado.
  Imagens em outputs/titulos-compartilhados, mobile inspecionado visualmente.
- Migration: somente DDL, FKs RESTRICT, sete indices, rerun sem operacoes,
  down nao destrutivo. Sincronizacao real isolada: pedidos unicos, transacao,
  realizado/previsto e solicitacao cancelada intacta: aprovados.
- Build frontend, navegacao (222 rotas), docs (529 Markdown/19 canonicos),
  sintaxe de 39 arquivos backend e git diff --check aprovados. Avisos existentes:
  Browserslist desatualizado, chunk >500KB e aviso catalogo de ModuloRelatorios.
- Performance/fila/DP (inclui 530 itens +30 rejeicoes/12 paginas, filtro/count SQL
  MySQL gerado e 640 titulos DP), renegociacao domain/service/vinculos/sincronizacao,
  pedido financeiro GEO, comprometido/gestao/appropriacao/sem-limite obras,
  medicao/recarga, bloqueio retorno, baixa massa, fila manual, analise/proprietario,
  comprovantes/PDF, intercompany cartoes, periodo financeiro, competencia DRE,
  rotas granulares aprovados. Fixtures nao substituem teste de integracao MySQL.
- Ao ajustar um mock antigo, houve tentativa de conexao localhost recusada;
  isolamento corrigido para proibir conexao. Nenhuma conexao real a producao,
  migration aplicada, escrita de negocio ou operacao EC2/S3/bancaria realizada.

## Limites / riscos conhecidos

- Homologacao desta funcionalidade pela **fila manual**. Nao ampliado envio
  bancario automatico: modulo legado exige empresa unica no titulo; nao inventar
  CNPJ principal para contornar. Relatorio especializado Entre Empresas ainda
  usa contraparte escalar; consultar participacoes/relatorios economicos para
  distribuicao multiempresa. Nao afirmar que estes dois fluxos foram ampliados.
- Sem renegociar/editar valor ou cancelar parcela isolada; cancelar lote inteiro
  sem pagamentos e gerar novamente com nova chave quando necessario.
- Limite de 100 origens e 120 parcelas testado matematicamente, nao e benchmark
  de RDS. Busca pagina 20 solicitacoes e pede refinamento acima de 100 pedidos.
- Migration somente criada/testada em mocks. Necessario MySQL dev para validar
  DDL real, locks concorrentes, dados legados e reports completos antes de main.

## Publicacao DEV autorizada

- Novo script `ops/deploy/atualizar-dev-titulos-compartilhados-20261016.sh`:
  checkout/branch/limpeza de arquivos rastreados/ancestralidade/mutex; npm ci,
  validadores isolados e preflight em `aplicarMigrationTitulosCompartilhadosDev.js`.
- Preflight verifica development, host staging, UUID/banco DEV, PM2 backend-dev
  unico no checkout DEV/porta 8001 e compatibilidade de configuracao/flags sem
  expor segredos. So aplica 202610160001 se for a unica pendencia (ou nenhuma para
  retomada), restaura ALLOW_SCHEMA_MIGRATIONS no processo e confere schema final.
- Reinicia exclusivamente backend-dev apos sucesso, health local 8001 com retry.
  Nenhuma flag gravada em .env e nenhum comando de reinicio de producao.
- `validarDeployTitulosCompartilhadosDev.js`: negativas de producao, outro banco,
  processo/porta, PM2 divergente, flags, outras migrations, falha DDL, restauracao
  da flag, retomada e health aprovadas. Bash -n e node --check aprovados.
- Repetidos nesta publicacao: testes novos backend/UI desktop/mobile, regressao
  performance/fila/DP, docs e build frontend. Sem execucao EC2/banco real.
- Commit/push apenas do delta e docs/scripts desta tarefa; outputs/ e ajustes
  de contratos/checkout primario preservados. Confirmar hash remoto no encerramento.

## Proximo passo exato

1. Usuario executa comandos fornecidos na EC2 DEV, com backup DEV conferido antes
   da migration. Se houver pendencia diferente, nao forcar: enviar saida para revisao.
2. Homologar cenarios descritos nos READMEs: duas obras/CNPJs, duas parcelas,
   titulo unico, filtro por empresa, valores de cada origem, baixa parcial/estorno,
   comprovantes/autorizacao, escopo negativo, repeticao e cancelamento com motivo.
3. Promocao main/producao exige nova autorizacao/homologacao/backup. Ownership de
   edicao desta entrega liberado apos validacao; nenhuma migration real executada.
