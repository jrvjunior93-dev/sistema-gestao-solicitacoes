# PWA: titulos excluidos separados das pendencias

## Autorizacao e contexto

Usuario autorizou incluir na base refactor/frontend a identificacao Titulo
excluido, com data/conta/motivo e consulta historica separada. Nao restaurar
titulos nem alterar producao. A analise usa somente saida fornecida pelo usuario:
nenhum acesso EC2, SSH ou banco pelo agente nesta tarefa.

Codigo local em codex/remetente-fila-ciclo-20261018, baseado em
origin/refactor/frontend957ebf85. Preservados delta anterior de remetente,
filtros automaticos/WEB e outputs/. Nenhum commit/push, main, deploy, .env,
PM2, Redis, migration ou mutacao em banco real. EC2 sempre por comandos ao usuario.

## Evidencia recebida

- TIT-009718/id10943, SOL-6240: deleted_at2026-10-09 16:57:15UTC, conta2;
  item7 ENFILEIRADO e fila33 PENDENTE, snapshot10982.88.
- TIT-009810/id10993, SOL-6312: deleted_at2026-10-09 16:20:53UTC, conta2;
  item32 ENFILEIRADO e fila12 PENDENTE. Snapshot2480, ultimo titulo/fila1240.
- TIT-010187/id11222, SOL-6392: deleted_at2026-10-14 18:00:22UTC, conta1;
  item71 PENDENTE, sem fila. Os tres eram exclusoes logicas em massa.
- Exclusao legitima ou indevida e uma decisao de negocio ainda nao inferida.
  Esta tarefa nao recupera registros, altera valores ou encerra filas antigas.

## Implementacao / arquivos

- pagamentoAutorizacaoConsultaService.js: mantem join operacional t com
  deleted_at IS NULL e adiciona join separado h somente para excluidos. Le
  metadados, obra e identificacao historicos, sem devolver titulo como ativo.
  Situacao EXCLUIDO tem precedencia sobre fila antiga e decisao armazenada.
  Hidrata responsaveis em lote com nomes ja autorizados pelo painel.
- Fila direta excluida tem DTO somente leitura: titulo=null, status EXCLUIDO,
  snapshot_hash/versao_painel=null. Nenhum item/lote/decisao digital fabricado.
- pagamentoAutorizacaoSituacao.js: projecao de exclusao e leitura por PK em
  lote para itens sem titulo no historico. Registro ausente sem prova de exclusao
  permanece INDISPONIVEL. Decisao/status original e hashes continuam intocados.
- Helper frontend de situacao adiciona EXCLUIDO e trava selecao/decisao mesmo
  diante de um DTO antigo que ainda carregue um objeto titulo ABERTO/PARCIAL.
- TituloExcluidoAviso.jsx reutilizado na lista, detalhe e tabela por lote,
  indicando data/conta/motivo e que valores/documentos sao historicos, nao saldo
  disponivel. Fallback explicito para responsavel/motivo nao registrado.
- FinanceiroAutorizacoesPagamento.jsx exclui esses itens de pendingItems,
  selecao persistida, revogacao individual/em lote e botao de reenvio de lote
  exclusivamente excluido. Rotas e servicos de decisao/baixa nao foram alterados.
- AutorizacoesPorObra/AutorizacaoTituloDetalhe: filtro historico EXCLUIDO,
  rotulo de valor historico, sem aviso enganoso de saldo/vinculo pendente.
- CSS apenas texto compacto da nota, sem nova navegacao ou redesenho. Skill
  frontend-design orientou reutilizacao, legibilidade e estados desabilitados.

## Testes e limites

- npm run test:pwa-titulos-excluidos no backend: projecao pura e CTE real em
  SQLite memoria. Pendente/enfileirado excluidos, fila antiga PENDENTE, direto
  sem lote, obra historica, nome/data/motivo, snapshot2480 preservado, registro
  ausente distinto e ausencia nos filtros operacionais. Consultas sem escrita.
- npm run test:pwa-periodo-fila-direta e validarAnaliseProprietario.js aprovados:
  ACL, flags, passkey/challenges, bloqueio, revalidacao, transacoes/idempotencia
  e convergencia direta/digital preservadas com modelos/servicos simulados.
- npm run test:pwa-titulos-excluidos no frontend: helpers, navegador com APIs
  simuladas e shell/Pagina reais. Lista/detalhe/historico por lote, selecao
  desabilitada, sem POST financeiro, snapshot original, filtros automaticos,
  cursores e navegacao anterior/proxima, larguras mobile/WEB sem overflow.
- Suite antiga validarAutorizacaoConsultaSql.js tinha falha preexistente de
  sandbox na base, ja documentada no handoff anterior; nao alterada nesta tarefa.
- Build frontend e documentacao569/19 aprovados, diff --check limpo. Captura
  mobile390 do detalhe inspecionada: data em Brasilia, conta/motivo, valor
  historico2480 e acoes desabilitadas legiveis, sem corte horizontal.
  Nenhuma validacao MySQL/EXPLAIN real executada pelo agente nesta etapa.

## Proximo passo

Implementacao local, sem publicacao. Se solicitado, commitar/publicar o pacote
autorizado somente em refactor/frontend e fornecer roteiro EC2 DEV. Nao promover
main nem executar EC2 automaticamente. Homologar no DEV registros excluidos e
ativos no mesmo lote, campos de auditoria, filtros, valores e ausencia de acoes.

## Atualizacao: publicacao autorizada

Usuario solicitou commit/push do pacote completo somente na refactor/frontend.
QA local repetido; roteiro exclusivo DEV preparado, sem migration ou alteracao
de configuracao. Publicacao e homologacao em
docs/handoffs/2026-10-18-publicacao-dev-pwa-historico.md. Nao acessar EC2 pelo agente.
