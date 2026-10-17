# Autorizacoes por obra/status financeiros - 2026-10-17

## Pedido e estado

- Usuario autorizou implementar na refactor/frontend o modelo do PWA por obra,
  filtros e status atuais, mantendo regras/permissoes. Acrescentou escala acima
  de 100 lotes e decisao de UM titulo agora e outros do MESMO lote depois.
- Agente unico, sem delegacao. Worktree performance-fila-dp-20261015, branch
  codex/autorizacoes-obras-status-20261017 baseada em origin/refactor/frontend
  fb9a0e89e944017dcaacafdefed4f66a88c87e34. Main remota 8f1b2c85 preservada.
- Sem execucao de EC2/RDS/PM2/.env/migrations reais, nenhuma exclusao ou reparo.
  Implementacao inicialmente entregue sem commit/push; usuario autorizou agora
  publicacao somente na refactor/frontend. Outputs/ preexistente fica fora do Git.
  Auditoria dos titulos deve usar main/PROD, exclusivamente leitura (ver abaixo).
- Producao: print informa negociacoes #3/#4/#5 e titulos TIT-010879/010885/010890
  quitados. Ainda nao consultamos o banco para relacionar origens da SOL-5419 e
  PC-00139. Nao afirmar que as parcelas antigas podem ser excluidas.

## Mapa do fluxo e arquivos

- backend/src/services/pagamentoAutorizacaoService.js: guards nominais e modos
  existentes antes de ler. Lista paginada30/max50 sem teto100, contagem e ordem
  estavel. Contrato atual de POST/passkey/segregacao/revalidacao intacto.
- pagamentoAutorizacaoSituacao.js: projecao atual de titulo/ultimo ciclo da fila,
  resumo por lote, sem escrever estado/material assinado. Consulta em lote da
  ultima fila tambem atende historico, sem N+1 ou mudar fila_item_id original.
- pagamentoAutorizacaoConsultaService.js: CTE de dossies atuais por titulo,
  filtros parametrizados antes dos limites, rateios/compartilhados/renegociados,
  participacoes por obra com residuos exatos, resumo global e paginas. Busca
  literal escapa !/%/_. Nao inclui titulos sem dossie. Obra usa tabela `Obras`,
  conforme model Sequelize (nao supor minusculas no Linux).
- Controller/routes: novos GET painel/obras e painel/titulos, Cache-Control
  private,no-store; mesmos direitos de leitura do dossie. Nao ampliar Financeiro.
- frontend/components/financeiro/AutorizacoesPorObra.jsx: filtros, obras, titulos,
  documentos, justificativas/motivos, selecao global por titulo, revalidacao serial
  inclusive fora da pagina, conferencia e confirmacoes por lote selecionado.
- Page FinanceiroAutorizacoesPagamento/CSS/services/util: alternancia por obra ou
  lote, status financeiros/contagens, paginacao de lotes e atualizacao serial.
  Por obra e padrao de quem pode decidir, por lote e padrao de leitores/preparadores.
- usePollingSeguro: opt-in revisao para resetar backoff somente por novo filtro
  ou retry manual. Chamadores existentes mantem comportamento padrao. Nenhuma
  consulta oculta, concorrente ou resposta velha sobrescreve recorte atual.
- Scripts/tests/npm, README financeiro, ownership e este handoff.

## Invariantes e escolhas

- Aprovacao e financeira sao eixos diferentes. Um titulo parcialmente pago pode
  aguardar aprovacao de seu saldo, se snapshot/material correspondem ao saldo.
  Filtros Aguardando/Nao pago/Na fila consultam a decisao/tentativa atual; badge
  financeiro conserva pagamentos efetivos. Lotes mistos mostram parcial/contagens.
- expira_em NAO cria vencimento operacional novo: regressao legada exige poder
  decidir dossie antigo com confirmacao nova. Snapshot/hash/eventos imutaveis.
- Compartilhado/renegociado de varias obras e contado uma vez no total unico;
  cards mostram sua participacao. Decisao sempre abrange o titulo inteiro, com
  aviso. Valores dos cards sao do dossie; pago/saldo atual aparecem separados.
- Selecionar pagina adiciona/remove apenas seus elegiveis, preservando outras
  paginas/obras. Limpar todas e global. Nenhuma selecao automatica da obra inteira.
- Decisao por lote envia somente os IDs explicitamente escolhidos. Multiplos
  lotes requerem confirmacoes seriais; falha preserva decisoes ja confirmadas,
  interrompe as seguintes e conserva restantes. HTTP200 com INVALIDADO nao vira
  sucesso falso. Invalidos confirmados pelo servidor saem da selecao pendente.
- Mantidos modo PILOT, ACL nominal/autorizador, passkey/challenge por lote,
  segregacao preparador/decisor, material revalidado, paid/partial protections,
  locks/transacao e historico. Nenhuma permissao ou POST novo.
- Sem migracao/dependencia nova ou mudanca em financeiro de negocio. Backend e
  frontend precisam do mesmo pacote para testar os GETs novos no DEV.

## Validacoes

- Backend painel: matriz de estados e fila posterior, copias imutaveis,
  mistos, filtros/negativas, OFF/PAUSED/ACL antes da leitura; 1001 lotes em34pg.
  Matriz VIEW/PREPARE/CONFIGURE e DECIDE com autorizador ativo preservada;
  leitura paginada nao executa contagens de passkeys/push. Agregacao JSON nativa
  evita truncamento por GROUP_CONCAT quando ha muitas participacoes.
- SQL real da CTE e consulta de ultimo ciclo executados com SQLite memoria
  Node24, apenas JSON_ARRAYAGG adaptado. 650 titulos/150 obras/13pg, filtros,
  datas, literal %, deduplicacao de dossie, centavos, multiplas origens por obra,
  parcelas renegociadas, quitacao/parcial/nao pago/estorno e pagina fora do total.
  Isto NAO e teste MySQL ou EXPLAIN real. Docker local indisponivel; nao iniciar
  servicos nem acessar banco externo para contornar sem autorizacao.
- Analise proprietario real sob models/biometria simulados: um titulo de lote
  aprovado/enfileirado e outro decidido depois, preservando pendencia/hash;
  demais negativas/concorrencia/revogacao/segregacao existentes preservadas.
- UI real/APIs isoladas: 130 selecionados entre paginas/obras, compartilhado sem
  repetir, limpar tudo, aprovar1 e voltar ao MESMO lote, resposta INVALIDADO,
  rejeicao/motivo, duplo clique, falha entre lotes, ACL/passkey, erro/retry,
  filtros rapidos com resposta lenta/foco coalescido, vazio e 1366/768/390.
- Regressao shell PWA Android/iOS, opcao/passkey/tema/saida, guardas e historico
  com151 lotes/pagina seguinte/volta. Fixture inicia na rota resolvida pelo
  resolver real, sem simular login/redirect global; navegacao/abas gerais separadas.
- Polling real React foco/backoff/aba oculta/cleanup/A-B-C aprovado.
- Regressao renegociacao/origens/sincronizadores, proprietario, performance fila
  e DP, seguranca direta2304/66escopos/48rotas, navegacao/abas aprovadas.
- Reexecucao final aprovada: painel/SQL local/auditoria/analise proprietario,
  UI por obra/PWA/polling, build612 modulos, docs538 Markdown/19 canonicos e
  diff sem erros. Avisos preexistentes Browserslist/chunk grande/trinco da
  navegacao nao foram alterados nesta tarefa.

## Diagnostico e proximo passo

- auditarNegociacoes20261017.js --verificar e exclusivamente SELECT. Confere
  ambiente/UUID e compara origens do snapshot e parcelas de resultado3/4/5
  com registros atuais, mais SOL-5419/PC139; inclui softdeleted e numero de
  movimentos ativos. Nao imprime snapshot inteiro, contas, CPF ou segredos.
  Teste isolado comprova tres SELECTs, negativas de banco e nenhuma mutacao.
  Duas consultas de negocio usam hint MAX_EXECUTION_TIME(10000) no MySQL.
- verificarPainelAutorizacoesDev.js --verificar bloqueia PRODUCAO antes de SQL.
  Operador no backend DEV pode conferir UUID/schema, executar EXPLAIN do agregado
  e consultas reais limitadas5. Revisar planos/duracao com volume representativo
  antes de promover para main. Agente nao executou esse teste real.
- Implementacao e validacoes locais concluidas. Publicacao autorizada neste
  retorno: conferir diff/fonte remota, publicar so na refactor/frontend e passar
  SHA DEV protegido. Registrar resultado da publicacao e SHA na entrega ao usuario.
  Nao incluir outputs/, arquivos main-only TLS ou edits de outros worktrees.
- Nao ha migration nova. Atualizar somente backend-dev/8001 apos guards/schema;
  nenhuma operacao em backend-solicitacoes/8000, .env ou flags de producao.
- Dados duplicados de producao continuam sem reparo: coletar SELECTs por operador
  e decidir procedimento auditado separado, sem apagar acordo/pagamento antigo.

## Execucao separada pelo operador

- Publicacao funcional confirmada na refactor/frontend:
  6d524adcd47178fd89238109ea7a098cb9ad3301, pai fb9a0e89 e tree
  beb1c718f77a320042504ae3db8a6221a6909466 identica ao commit local testado.
  Git push HTTPS local nao autenticou; integracao GitHub atualizou a ref com
  expected_sha e sem force. Fetch/ls-remote/diff confirmaram o resultado.
  Main segue 8f1b2c8530262b5536853262e95b15c11e8f24b3. Registro documental
  posterior nao altera codigo funcional; usar SHA final informado na entrega.
- DEV: checkout refactor/frontend limpo nos arquivos rastreados, fast-forward
  para SHA entregue, npm ci --omit=dev no backend, verificacao de identidade/
  schema/processo/flags/sessao12h com configurarSessao12hDev.js --verificar.
  Executar verificarPainelAutorizacoesDev.js --verificar (EXPLAIN/SELECT MySQL),
  testes backend isolados e somente entao reiniciar backend-dev. Health8001.
  Nao aplicar migrations automaticamente: este pacote nao inclui nenhuma nova.
- MAIN/PROD: apenas git fetch da refactor/frontend, SEM checkout/merge/pull.
  Conferir caminho main/backend e branch main. Carregar em memoria somente o
  arquivo auditarNegociacoes20261017.js do SHA entregue via git show; invocar
  export executar com db/env do checkout main, exigir deployment production.
  Codigo executado nao escreve arquivo na main, nao importa servidor/models,
  nao troca o pool do backend ativo e fecha sua propria conexao ao terminar.
  Sem npm ci, PM2, migration, .env, TLS, PILOT ou sessao alterados em producao.
- Retornar saidas SQL/EXPLAIN DEV e tabelas da auditoria MAIN. Origem divergente
  nao deve ser excluida/cancelada automaticamente. Pagar parcela nova e marcar
  origem renegociada sao fatos diferentes de quitar/excluir a origem.
