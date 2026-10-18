# Remetente por ciclo da fila e filtros automaticos do PWA

## Autorizacao e isolamento

Usuario confirmou que o estorno deve voltar automaticamente a fila, sem nova
autorizacao. Autorizou corrigir remetente no estorno e registrar novo remetente
em novo envio apos rejeicao, na refactor/frontend, sem alterar producao. Adicionou
aplicacao automatica da Situacao atual combinada com demais filtros, retirando
Aplicar filtros e mantendo Limpar filtros.

Base origin/refactor/frontend957ebf85, branch local isolada
codex/remetente-fila-ciclo-20261018. Main, outro checkout refactor/frontend e
outputs/ preservados. Nenhum commit/push, EC2, SSH, banco real, Redis, PM2,
migration, configuracao ou deploy executado. O usuario executa comandos na EC2.

## Diagnostico comprovado

Saida fornecida pelo usuario mostrou MANUAL_PAYMENT_QUEUE_REVERSED e POST
/financeiro/fila-pagamentos/:id/estornar nos quatro retornos 92->184, 93->185,
91->186 e 312->496. O remetente original era usuario2 e os retornos usuario65.
Nao era envio direto pela aba Financeiro. A consulta do PWA usava o operador da
ultima entrada como remetente, embora o ciclo de envio nao tivesse mudado.
Nenhuma permissao foi removida ou ampliada; estorno/baixa permanecem intocados.

## Implementacao

- Novo backend/src/services/pagamentoFilaRemetenteService.js: projecao de leitura
  atraves apenas de elos explicitos de estorno, mesmo titulo, ordem crescente
  dos IDs e origem resolvida. JSON legado aceito, multiplos pais nao atribuem
  pessoa arbitraria. Cache iterativo evita recursao e custo quadratico em cadeia.
- pagamentoAutorizacaoConsultaService.js: uma consulta em lote por pagina para
  obter historico, depois consulta nomes dos remetentes corretos. Remetente/data
  do DTO mudam; fila_atual/IDs, snapshots, versoes/passkey, filtros, totais e CTE
  continuam iguais. Nenhuma gravacao nos registros antigos ou futuros.
- Novo envio direto/digital apos rejeicao nao tem elo de estorno com a fila
  anterior; sua origem nao herda a do ciclo rejeitado. A resolucao nao usa MIN(id).
- Pedido novo ainda pendente/autorizado e sem fila_item_id apresenta criador/data
  do novo lote e envio_destino=AUTORIZACAO. Lista/detalhe usam Enviado para
  autorizacao, sem apresentar a fila resolvida do ciclo anterior como remetente.
- AutorizacoesPorObra.jsx: situacao aplica com atraso zero; obra, datas e tipo
  de data com debounce de 600ms. Rascunho completo aplicado atomicamente, paginas
  voltam a 1, selecao mantida e decisoes revalidadas como antes. Respostas obsoletas
  continuam descartadas e polling serial preservado. Datas parciais/impossiveis
  nao consultam; periodo invertido pede ajuste sem enviar consulta invalida.
- Aplicar filtros removido; Limpar filtros preservado, com remontagem exclusiva
  dos dois campos de data para apagar texto parcial/validade nativa. Grade desktop
  perde somente a coluna do botao retirado. Skill frontend-design aplicada para
  preservar formulario compacto, labels e estados; nenhum redesenho visual.
- Adicao do usuario: responsividade WEB corrigida no mesmo CSS, sobrepondo apenas
  para esta pagina a largura global de cadastro (940px). Botoes de filtros e
  configuracao nao quebram letras; select administrativo nao cresce em coluna
  mobile. validarAutorizacaoPwa.mjs usa Pagina/Layout reais e prova largura total,
  ausencia de overflow e botoes legiveis em 320/390/768/1024/1366/1920.

## Arquivos e testes

- backend/scripts/validarFilaRemetente.js e npm run test:fila-remetente: fixtures
  dos quatro retornos auditados, cadeias de 5000, origem/data, novo envio direto
  e digital apos rejeicao, legado, isolamento e consulta em lote sem escrita.
- backend/scripts/validarPainelAutorizacoesSqlLocal.js: CTE real em SQLite em
  memoria e ORM simulado, cobrindo DTO direto/digital, estornos sucessivos,
  rejeicao/novo envio e origem correta no estorno do novo ciclo.
- frontend/scripts/validarAutorizacoesPorObra.mjs: navegador real com APIs e
  passkey simuladas. Filtro combinado, datas isoladas/parciais/invertidas,
  limpeza, selecao, pagina/cursor/historico, respostas lentas, ACL, motivos,
  confirmacoes/duplo clique e larguras 320/390/768/1366.

## Validacoes e proximo passo

Suites de remetente, painel PWA/SQL local, rejeicao direta, bloqueio proprietario,
permissoes de rotas e analise/convergencia aprovadas. Teste UI real aprovado;
captura mobile inspecionada, sem Aplicar filtros e sem corte horizontal.

Regressao preexistente encontrada ao executar validarAutorizacaoConsultaSql.js:
sandbox nao simula ./pagamentoAutorizacaoSituacao, import ja presente na base.
Script e pagamentoAutorizacaoService.js nao foram alterados nesta tarefa. Nao
confundir esta suite antiga com validarPainelAutorizacoesSqlLocal.js, aprovada.

Build619modulos, polling seguro, datas/observacoes e documentacao568/19 aprovados.
PWA do shell real aprovado usando Chrome instalado via PLAYWRIGHT_EXECUTABLE_PATH,
sem instalar navegador. Capturas mobile/WEB1920 inspecionadas. Nao houve ensaio
MySQL real nesta etapa. Proximo passo, mediante
pedido do usuario: commit/publicacao exclusiva em refactor/frontend e comandos
DEV; testar remetente em caso legado, dois estornos, rejeicao/novo envio e filtros.
Sem migration ou autorizacao para producao. Nao executar EC2 pelo agente.

## Indisponiveis dos prints: diagnostico confirmado e correcao autorizada

Usuario pediu entender/tratar TIT-009810 (SOL-6312), TIT-009718 (SOL-6240) e
TIT-010187 (SOL-6392). No codigo, INDISPONIVEL decorre de titulo_id/titulo ausente.
CTE exclui deleted_at preenchido e model tem defaultScope deleted_at=null:
exclusao logica pode explicar Pago/Saldo ausentes e Sem obra definida, mas so
consulta real pode confirmar esses casos. Mudanca de saldo sozinha nao produz
esse status. Nao remover/recriar/restaurar aprovacoes ou titulos automaticamente.

Fornecer bloco Node/mysql2 ao usuario com cwd/ambiente/porta/host/UUID/TLS
produtivos, transacao READ ONLY, SELECTs limitados por codigos/snapshots, campos
deleted_at/by/reason e historico da fila. Nenhum acesso EC2 pelo agente. Aguardar
saida para distinguir exclusao legitima (historico nao pagavel) de exclusao/vinculo
indevido que precise regularizacao posterior autorizada. A saida posterior
confirmou exclusao logica dos tres titulos; usuario autorizou a projecao Titulo
excluido, sem restauracao. Implementacao em
docs/handoffs/2026-10-18-pwa-titulos-excluidos-historico.md.
Nenhum dado desses titulos foi alterado. Implementacao local, nao publicada.

## Atualizacao: publicacao autorizada

Usuario solicitou commit/push de todos estes ajustes somente na refactor/frontend,
sem producao. Validacoes repetidas e roteiro DEV em
docs/handoffs/2026-10-18-publicacao-dev-pwa-historico.md; nenhuma migration nova.
