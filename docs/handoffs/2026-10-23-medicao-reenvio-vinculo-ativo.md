# Medicao: reenvio da parcela apos rejeicao

## Pedido e estado

- Usuario confirmou o erro400/Validation error ao reenviar a mesma parcela
  depois de rejeitar a medicao e autorizou corrigir/testar na base da
  refactor/frontend. Base be303667; agente unico; sem commit/push/deploy.
- Preservar historico, permissoes e financeiro. Nao admitir duas medicoes
  ativas da mesma parcela. Nenhuma alteracao em main/producao, EC2 ou banco real.
- Arquivos: nova migration202610230002_medicao_vinculos_ativos.js, QA
  validarMedicaoVinculoSchema.js, QA anterior de rejeicao, backend/package.json,
  medicaoRegistroErroService.js e catch do registro no SolicitacaoController;
  README Contratos/ownership/este handoff. Filtros locais preservados.

## Causa e correcao

- O indice unico legado (solicitacao_id, contrato_parcela_id) continuava
  instalado. Rejeitar preserva MedicaoParcela com devolvido_em, entao o novo
  evento tentava inserir a mesma chave e recebia SequelizeUniqueConstraintError.
  O catch retornava somente error.message, reduzindo o diagnostico a
  Validation error. O mock anterior nao representava essa restricao do banco.
- Migration troca o indice legado por dois UNIQUEs com colunas virtuais:
  (contrato_parcela_id, vinculo_ativo) usa1 se devolvido_em e nulo; vinculos
  devolvidos usamNULL e nao impedem o novo evento. A restricao e GLOBAL por
  parcela, nao somente por solicitacao. Aprovadas tambem continuam ativas.
- Identidade (contrato_parcela_id, evento_chave) usa M+medicao_id no fluxo
  novo e S+solicitacao_id no legado. Impede duplicar evento historico ou
  transformar a rejeicao em reutilizacao/sobrescrita do mesmo vinculo.
- Mantidos FKs, IDs, datas, valores e linhas antigas. Indice nao unico de
  solicitacao_id e adicionado se necessario para sustentar a FK apos a troca.
- Preflight le schema/engine/versao/indices/expressoes geradas e duplicidades.
  MySQL8/InnoDB exigido. Dados ativos/eventos duplicados interrompem; nunca
  apagar linhas nem devolver comprometimento automaticamente para fazer passar.
- Novas protecoes e remocao da antiga em UM ALTER TABLE, ALGORITHM=COPY,
  sem janela de ausencia de UNIQUE. O down bloqueia reversao destrutiva.
  A execucao pode bloquear escritas: planejar janela de DEV e backup.
- Calculos e transacoes/lock do contrato, guardas de ativa, sequencial MAX e
  permissoes permanecem sem alteracao. Consultas de saldo/parcelas, divisao
  de favorecidos, vencimento e fila ja recortam devolvido_em IS NULL.
- Catch do fluxo novo passa a responder conflito409 com mensagem operacional.
  Mantem403 e demais erros operacionais. Logs so guardam operacao/IDs/indice
  conhecido/codigo de banco permitido, sem SQL, PIX, payload ou valor rejeitado.

## Validacoes

- npm run test:medicao-reenvio: reproduz indice antigo no servico real com
  rollback; depois mede de novo preservando evento/vinculos antigos e novo
  numero. Dois envios simultaneos sob lock: somente um passa, outro409,
  uma ativa e nenhum movimento financeiro. Mock agora verifica os UNIQUEs.
- SQL real SQLite em memoria: executa as MESMAS expressoes e chaves da
  migration MySQL, adaptando apenas envelope ALTER/INDEX. Reproducao antiga,
  reenvios repetidos, ativa global inclusive outra solicitacao, evento/legado,
  reativacao indevida, snapshot de historico intacto e FKs verificados.
- Corrida preflight/DDL: conflito novo faz falhar criacao do UNIQUE, preserva
  indice anterior/linhas e nao deixa colunas pela metade no adaptador atomico.
- Metadata negativo/retomada, normalizacao MySQL, engine/versao divergentes,
  preflight de duplicadas e mensagens/logs sem segredos. Runner REAL de
  migrations em VM, com guardas schema-only, autorizacao e replay executados.
- Regressoes: valor/pagamento, ciclo medicao/recarga, reprogramacao parcial,
  divisao de favorecidos, encerramento, contratos operacional/aprovacao/retorno,
  destinatarios/detalhe TIT-009886, motor e autorizacao do proprietario.
  Auditoria399/80rotas aprovada. UI real de rejeicao/favorecido e valor/pagamento
  aprovada1366/390/320, sem novas mudancas de frontend nesta tarefa.
- Nenhum acesso ao RDS. Docker local sem daemon disponivel; DDL NAO executado
  em MySQL nativo. SQL SQLite/adaptador e metadados nao substituem homologacao
  no MySQL DEV. Sem build novo, pois nenhum runtime de frontend mudou.

## Proximo passo exato e riscos

- Mediante pedido explicito de publicacao: staging seletivo apenas destes
  arquivos/docs, preservando o arranjo local dos filtros; preparar runner e
  roteiro DEV dedicados com allowlist SOMENTE migration202610230002, identidade
  RDS/UUID/PM2/porta e backup, sem flags persistentes nem uso do runner anterior
  que permite somente202610230001. Commit/push exclusivo refactor/frontend.
- Conferir no DEV schema, duplicidades, copia/backup e janela de escrita;
  aplicar migration estrutural antes de reiniciar exclusivamente backend-dev.
  Nao usar npm migrate irrestrito nem alterar versoes antigas de migrations.
- Homologar MySQL nativo: contrato de teste, rejeitar medicao, reenviar mesma
  parcela/periodo; conferir novo numero, anexos/eventos antigos intactos,
  titulos cancelados originais, previsao substituta e saldo comprometido uma
  unica vez. Tentar segundo envio e validar409 sem titulos/baixas extras.
- Se preflight detectar duplicadas ou schema inesperado, parar e revisar pela
  interface/fluxo autorizado; nao contornar indices, apagar historico ou
  executar backfill para liberar a migration. Nao promover producao sem DEV.

## Publicacao DEV autorizada

- Usuario autorizou commit/push e roteiro EC2 DEV. Acrescentados
  `backend/scripts/aplicarMigrationMedicaoReenvioDev.js`,
  `backend/scripts/validarDeployMedicaoReenvioDev.js` e
  `ops/deploy/atualizar-dev-medicao-reenvio-20261023.sh`.
- Runner permite somente202610230002 pendente, exige host/UUID/banco DEV,
  cwd exclusivo, PM2 backend-dev/8001 online e sem watch, flags equivalentes
  e DDL automatico desligado. Backup CONFIRM_DEV_BACKUP=SIM para aplicar.
- --verificar executa o preflight REAL da migration em modo leitura,
  interceptando o ALTER sem executa-lo. Conferencia de metadata/duplicadas
  ocorre antes e depois da aplicacao. Migration ja registrada com plano
  incompleto interrompe, sem tentar reparar schema silenciosamente.
- Script exige SHA publicado/fast-forward/inventario fechado de dois runtimes,
  migration unica e manifestos/lockfiles sem novas dependencias. .env e sessao
  preservados; nenhum npm install ou mudanca de configuracao. QAs isolados
  antes do ALTER, restart exclusivo backend-dev e health8001 depois.
- Pode ser retomado no MESMO SHA apos falha: preflight dedicado aceita apenas
  002 pendente ou ja aplicada, sem repetir DDL/historico. No checkout anterior
  exige preflight de sessao/schema completo. Nao contornar bloqueios.
- Executar em janela DEV sem outros testes, apos backup conferido: COPY pode
  bloquear escritas por alguns instantes. Nao confundir o --sem-sqlite do QA
  no host (compatibilidade Node) com o ALTER real que sera executado no RDS.
- Ainda nao houve execucao de migration/EC2 ou teste nativo MySQL nesta sessao.
  Homologacao real continua necessaria antes de considerar promover main.
- Staging seletivo conferido:12arquivos, dois runtimes e migration002; sem
  frontend/filtros locais. Copia isolada do index aprovada nos QAs de
  deploy/runner, SQL/reenvio/rejeicao, modo semSQLite e documentacao611/19.
  Regressoes financeiras13 e auditoria399/80rotas repetidas/aprovadas.
  Sintaxe Bash/Node e diffcheck sem falhas; ownership liberado para publicar.

## Referencias primarias para a estrategia estrutural

- [MySQL8: colunas geradas e limitacoes](https://dev.mysql.com/doc/refman/8.0/en/create-table-generated-columns.html).
- [MySQL8: indices secundarios UNIQUE em colunas virtuais](https://dev.mysql.com/doc/refman/8.0/en/create-table-secondary-indexes.html).
- [MySQL8/InnoDB: DDL atomico](https://dev.mysql.com/doc/refman/8.0/en/atomic-ddl.html).
