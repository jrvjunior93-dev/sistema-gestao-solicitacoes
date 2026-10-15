# Regularizacao global GEO sem ampliar visibilidade

## Pedido / evidencia

- Usuario confirmou que SUPERADMIN via a recarga excluida e GEO nao. Autorizou
  regularizacao GEO global, expressamente SEM acesso adicional as solicitacoes
  fora da regra normal de visibilidade. Nao autorizou commit/push/deploy nesta etapa.
- Saida somente leitura fornecida pelo usuario no DEV: recarga7/cartao1 Joao,
  solicitacao2150/SOL-32, excluida, obra43, titulo3775 ABERTO e baixa0, sem
  prestacao; anteriores quitadas/validadas. Nao e solicitacao fisicamente ausente.
- Causa: listar e carregar da regularizacao usavam escopo/vinculo de obra,
  distinto da capacidade funcional de GEO. Nao alterar authorizationService,
  vinculos ou configuracoes para solucionar uma excecao desta funcionalidade.

## Implementacao

- Base publicada03309c50; arquivos em worktree promocao-dp-main-20261014/Fluxy.
- recargaCartaoRegularizacaoService: listar/consultar/regularizar exigem GEO/
  SUPERADMIN e permitem qualquer obra SOMENTE para recargas excluidas. Listagem
  continua restrita a solicitacoes com recarga, filtravel/cursor30, sem expor
  formulario, documentos, dados bancarios ou outras solicitacoes.
- Sem baixa: cancelamento/encerramento anterior intacto. Pagos: recuperar
  somente cancelada=false, sem trocar setor/status, criador ou responsavel.
  Nao resetar prestacao existente, rateios, pagamentos ou valores de titulos.
- Auditoria transferida para LogExclusao, entidade REGULARIZACAO_RECARGA, na
  MESMA transacao. Motivo completo no payload_json (coluna motivo limitada255),
  autor/perfil/setor, antes/resultado, fingerprint e chave de idempotencia.
  Nao criar Historico: a regra normal pode conceder visibilidade por autoria,
  interacao ou historico do setor GEO. Trilha separada evita essa concessao.
- Replay novo usa essa trilha; replay de versao anterior ainda le Historico
  por ACAO. Nao altera/apaga auditorias legadas. Preserva locks, revisao stale,
  bloqueios financeiros, falha fechada e rollback se auditoria falhar.
- Controller revalida assertPodeVisualizarSolicitacao apos recuperacao e em
  todos os replays. Retorna pode_abrir_solicitacao verdadeiro somente por ACL
  normal; 403/404 ou falha de verificacao nao liberam link. Falha apos commit
  nao esconde o sucesso da regularizacao; link permanece fechado.
- UI preservada, com aviso do escopo global restrito a regularizacao; link
  Abrir prestacao so com flag explicita true e mensagem quando nao houver
  acesso ao detalhe. Prestacao continua com usuarios ja autorizados.

## Validacoes

- validarRecargaRegularizacao ampliado: GEO sem vinculo lista/consulta/opera,
  OBRA/DP/Financeiro negados antes de DB, consulta sem escrita, pagamentos e
  prestacoes preservados, atomico/replay concorrente e rollback auditado.
- Regra REAL verificarAcessoDetalheSolicitacao e canAccessSolicitacaoFile sobre
  os mesmos registros da regularizacao: GEO sem leitura continua negado apos
  cancelar sem baixa ou recuperar pago; setor/status e Historico permanecem
  intactos. Controle positivo comprova que Historico comum concederia leitura.
  Acesso normal preexistente permanece permitido. Replay legado preservado.
- Controller valida flag por ACL em sucesso/replay e falha de verificacao.
- validarSegurancaAcessoDireto: 2304 comparacoes de visibilidade, regras ativas,
  exclusao, auth/token e HTTP operacional isolado aprovados. Regressoes anexos,
  multicartoes/saldo, SUPERADMIN/exclusao e deploy-dev isolado aprovadas.
- UI Playwright/API ficticia: link autorizado mantido, link oculto quando
  visibilidade normal nega e mensagem explicita; loading/retry/clique duplo,
  motivo/conferencia, filtro e mobile390/desktop1366 aprovados.
  Capturas outputs/qa-recarga-regularizacao inspecionadas, fora do Git.
- Build frontend, validarNavegacao, validarDocumentacao e git diff --check
  aprovados; somente avisos preexistentes de Browserslist/tamanho de chunks.

## Proximo passo / limites

- Sem migration nova, banco real, EC2 ou reinicio pelo agente. Commit/push
  em refactor/frontend autorizado posteriormente pelo usuario; main fora do escopo.
- Publicar e homologar em DEV quando autorizado, usando o script de deploy
  da regularizacao (ja chama o teste ampliado), schema read-only, backend-dev8001.
- Publicacao autorizada: testes de regularizacao, ACL real/anexos, multicartoes,
  exclusao, deploy isolado e documentacao repetidos com sucesso antes do commit.
  Usar git pull --ff-only origin refactor/frontend e o script existente
  ops/deploy/atualizar-dev-recarga-regularizacao-20261015.sh na EC2 dev.
- Caso real SOL-32: GEO consegue encerrar a recarga sem baixa pela tela global,
  sem obter acesso ao detalhe excluido ou aos anexos. Nao usar SQL manual.
- Em caso pago sem leitura: a recuperacao nao permite que GEO conclua a
  prestacao fora da regra normal. Usuário ja autorizado deve prosseguir no
  detalhe; nao foi criado novo bypass de documentos/operacao financeira.
- Nao houve mudanca nas regras genericas de listagem/detalhe, anexos, usuarios,
  configuracoes de setor, vinculos de obra ou permissoes financeiras.
