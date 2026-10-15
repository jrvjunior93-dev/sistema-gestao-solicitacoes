# DP: cancelamento, remocao e comprovante compartilhado

## Autorizacao e limites

- Usuario autorizou remover colaborador, cancelar pedido completo com motivo,
  preservando historico e bloqueando se houver pagamento ativo; estorno e uma
  operacao financeira separada. Confirmou manter permissoes/visibilidade atuais.
- Autorizou o mesmo PDF em varios titulos e anexo em lote para pendentes/pendentes
  de comprovante, sem duplicar no mesmo titulo e sem registrar baixa automatica.
- Durante a tarefa pediu Codigo antes de Tipo e relatou erro ao somente abrir/
  fechar RH-000179 como Natalia. Esses ajustes tambem estao incluidos.
- Branch local codex/dp-cancelamento-comprovante-lote-20261015, baseada em
  origin/refactor/frontend 0d73e7fee9be9372679634066d70bae2765a1658.
- Implementacao inicial sem publicacao. Posteriormente o usuario autorizou
  commit/push em refactor/frontend e comandos DEV incluindo a migration.
  Agente nao executa EC2, banco real, migration ou reinicio.

## Implementacao

- rhPagamentoSolicitacaoService/Controller/routes: endpoints proprios remover-
  colaborador e cancelar, com ehDp, buscar/escopo/privacidade existentes; financeiro
  exige mesmos direitos da revisao. Revisao e motivo, locks da solicitacao e
  revisaoService.travar antes de qualquer cancelamento, uma transacao e auditoria.
- Removida permanece em dados_json.linhas, CANCELADO, removido_em/por/motivo;
  UI separa da tabela ativa. Salvar/selecionar todos conservam snapshot e backend
  nao permite ressuscitar. rhSolicitacaoConsultaDomain exclui vinculo removido.
- Cancelamento total valida todo o financeiro antes, cancela todos os refs/filas
  sem baixa e marca CANCELADA. Nao e editor livre de status e nao reabre pedido.
- RevisaoService.travar aceita opcao exclusiva da nova acao para estorno concluido
  (movimento ESTORNADO e fila com marcador estorno); esses historicos nao mudam.
  Revisao/edicao anterior conserva sua guarda mais restrita. Banco ativo bloqueia.
- Modal mostra situacao/acao cancelar e motivo, mutex, sem sucesso otimista. Consulta
  da Obra nao recebe sujo por cadastro atualizado; salvar/fechar revalidam que a
  resposta e editavel. Corrige PUT indevido que gerava erro ao fechar modo leitura.
- Lista inclui codigo existente antes do tipo no padrao e contagem sem removidos.
  Preferencias de colunas personalizadas sao preservadas, sem resetar usuario.
- pagamentoManualFilaService: individual usa engine por destino; lote guardado
  pela mesma permissao da rota individual, validacao de todos antes de S3, locks
  ordenados e revalidacao, idempotencia fila/hash e SecurityEventLog transacional.
  Sem baixas, alteracao de valores/data/conta ou integracoes de pagamento.
- pagamentoComprovantePdfService: sem rejeicao global de hash; replay no mesmo
  destino nao cria vinculo nem faz novo upload; reutilizado nao recebe sugestao
  automatica de destino. Preview nao expõe o titulo de outro vinculo.
- FinanceiroFilaPagamentos/servico: modal PDF12MB, confirmar destinos1..100,
  mutex e acao em PENDENTE, PENDENTE_COMPROVANTE e TODOS. Selecao de baixa separa
  apenas pendentes sem movimento. Arquivo nao e persistido em localStorage.
- S3 gera objeto por fila (mesmo conteudo, URLs distintas) para nao cruzar ACLs.
  Upload anterior ao commit pode deixar objeto orfao em falha, sem registro parcial.

## Migration

- Nova 202610150002_comprovante_compartilhado_fila.js; NAO aplicada pelo agente.
- Cria indice unico fila_id/hash antes de retirar indices globais do hash nas
  tabelas pagamentos_manuais_fila e pagamentos_manuais_fila_comprovantes; mantem
  indices de busca, cobre nomes gerados e explicitos. Models alinhados.
- Sem DML, seed, backfill ou alteracao de pagamentos. Down nao tenta excluir
  vinculos legitimos para reintroduzir a unicidade antiga.

## Validacoes

- Backend: pagamento por solicitacao/cadastro/previa e envio parcial aprovados.
  Remocao pendente/enviada, vale compartilhado, cancelamento total atomico, motivo,
  ACL, rascunho privado, baixa/banco bloqueados, estorno concluido, revisao stale,
  repeticao concorrente e falha de auditoria/rollback aprovados em memoria.
- Fila: arquivo em dois destinos no individual/importador/lote, idempotencia,
  validacao antes de upload, status alterado em voo, sem baixa/alteracao financeira,
  auditoria atomica, chaves S3 distintas e falha/replay concorrente aprovados.
- Migration/model testados sem banco: ordem dos indices, nomes legados, repeticao,
  tabela ausente, indice divergente e down nao destrutivo.
- UI real via Playwright/local: motivo/voltar/duplo clique, remocao/historico,
  edicao posterior preserva snapshot, cancelamento/negativa financeira/permissao;
  consulta ABERTA/APROVADA/CANCELADA fecha sem gravacao apesar do cadastro atualizado.
- Fila desktop/mobile: selecao pendente de comprovante, misto nao repete baixa,
  upload comum, duplo clique e negativa de permissao. Regressoes de colunas,
  cheques/instrumentos/estorno/dados bancarios/previews tambem aprovadas.
- Codigo na tabela antes de Tipo e cards mobile verificados por teste real.
  Capturas de comprovante mobile, cancelamento desktop e tabela inspecionadas.
  outputs/ nao deve entrar no commit.
- Regressao completa do modal de pagamento, previa/50%, workspace/importador
  e editor de cheque aprovadas. Fixture do cheque passou a selecionar a origem
  PROPRIO explicitamente, como exige o componente atual (sem mudar runtime).
- Build frontend aprovado com avisos preexistentes de Browserslist/chunk500KB;
  navegacao/catalogos aprovados. Seguranca (2304 comparacoes/48 rotas), escopo
  RH/Obra, anexos, acesso da fila e regularizacao GEO anteriores aprovados.
  Validacao documental e git diff --check aprovados.

## Proximo passo

- Regressoes/build/documentacao concluidos. Publicacao agora autorizada apenas
  em refactor/frontend; main fora do escopo. outputs/ preservado fora do commit.
- Novo ops/deploy/atualizar-dev-dp-comprovante-compartilhado-20261015.sh: checkout
  DEV limpo/refactor, mutex, npm ci, testes isolados, PM2 backend-dev no caminho
  exato e porta8001, flags equivalentes sem sobrescrita e identidade staging.
  Aceita somente a migration nova pendente (ou nenhuma). Outras pendencias/
  tabela de controle ausente bloqueiam antes de escrita. Autoriza o runner
  canonico apenas no processo Node e restaura a flag; depois confere schema,
  reinicia somente backend-dev e verifica health8001. Sem seeds/backfills.
- validarDeployDpComprovanteCompartilhadoDev.js executa os blocos reais com
  PM2/banco/migration/health falsos. Negativas de ambiente, processo, porta,
  banco, flags, migrations extras, erro de migration e reexecucao aprovadas.
  Testes funcionais de backend repetidos nesta publicacao; sem banco/rede real.
- Homologacao real exige aplicar SOMENTE a migration estrutural nova, apos conferir
  identidade/schema do DEV, e atualizar backend-dev8001 + frontend de homologacao.
  Nao executar migrations pendentes desconhecidas/antigas junto desta tarefa.
- Casos reais relatados nao foram alterados. Testar Natalia lendo/fechando, DP
  removendo/cancelando pedido sem baixa e Financeiro anexando um PDF a varios
  pendentes/ja pagos sem comprovante; conferir ausencia de baixa adicional.
