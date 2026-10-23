# DEV: verificador de metadata e retomada da medicao

## Autorizacao e diagnostico

- Usuario autorizou corrigir/testar o verificador, commit/push na
  refactor/frontend e fornecer retomada EC2 DEV sem reaplicar migration002.
  Agente unico, base41bec992. Main/producao e filtros locais fora do escopo.
- Log do usuario confirma FF41bec992, migration202610230002 aplicada e
  registrada, nenhuma migration pendente, seguida de erro de metadata.
  O roteiro anterior parou antes de reiniciar backend-dev.
- Consulta somente leitura enviada pelo usuario mostrou ambas as colunas
  VIRTUAL GENERATED, nullable YES, tipos/tamanho corretos e os dois UNIQUEs.
  A expressao de evento_chave veio com literais _utf8mb4\'S\' e _utf8mb4\'M\'.
  O comparador historico reconhece o charset sem escape, mas nao essa
  representacao. QA reproduz a falha usando exatamente esse metadata.

## Mudancas

- Migration historica002 INTACTA. Nenhuma nova migration, DDL, DML, dependencia,
  permissao, calculo financeiro, frontend, .env ou flag persistente alterados.
- aplicarMigrationMedicaoReenvioDev.js adapta somente o resultado da leitura
  de information_schema.COLUMNS de medicao_parcelas, coluna evento_chave:
  literais S/M com charset conhecido e aspas escapadas viram a representacao
  ja reconhecida pelo comparador original. Sem mutar o objeto recebido.
- O preflight original continua validando expressao inteira, engine/versao,
  tipos, nullable, tamanho, virtual, indices/ordem/prefixos e duplicidades.
  Diferencas semanticas, schema incompleto ou duplicidades continuam bloqueadas.
- Modo --verificar-aplicada exige registro002 presente e NENHUMA migration
  pendente, recusa plano com ALTER e so executa consultas. Nao chama
  runMigrations nem habilita ALLOW_SCHEMA_MIGRATIONS, mesmo com backup informado.
- Roteiro retomar-dev-medicao-reenvio-20261023.sh exige HEAD41bec992 ou alvo
  exato (repeticao segura), SHA completo publicado, inventario fechado de seis
  arquivos, branch/cwd/lock, PM2 online sem watch/DDL automatico e preflight
  anterior de sessao/UUID/banco/flags. So entao FF, testes isolados, verificacao
  dedicada somente leitura, restart EXCLUSIVO backend-dev e health8001.
- .env conferido por hash antes/depois, flags/sessao preservadas. Nenhuma
  instalacao, npm migrate, aplicacao de migration ou operacao em producao.
  Roteiro antigo de aplicacao continua separado; nao usar nesta retomada.

## Validacoes e limites

- QA novo reproduz metadata real: migration original falha; verificador
  corrigido aceita com/sem escape e formato original. Retomadas repetidas
  nao escrevem no banco e mantem flags/metadata originais.
- Negativos: literal/identificador/operador/charset inesperado, expressao
  extra, tipo/tamanho/nullable/virtual, indices nao unicos/ordem/prefixo,
  colunas/indices ausentes, engine/versao, duplicidades, registro ausente e
  migrations pendentes. Nenhuma aplicacao e permitida nesses casos.
- QA de deploy exercita allowlist e bloqueios PM2/DDL anteriores ao FF em VM,
  alem de host/UUID/cwd/porta/flags nos dois modos do runner. Verifica roteiro
  somente leitura, restricao do HEAD, .env, restart unico e health do DEV.
- Sem acesso EC2/RDS, reinicio ou escrita real pelo agente. Metadata nativo
  e evidencia fornecida pelo usuario, nao nova execucao local de MySQL.
- QAs metadata nativo/retomada/deploy aprovados; SQL SQLite em memoria,
  servico real de rejeicao e dez regressoes financeiras aprovados. Modo
  sem-SQLite (compatibilidade do host) tambem aprovado. Documentacao613/19,
  sintaxe Bash/Node e diffcheck aprovados. Nenhum build de frontend necessario.
- Ownership liberado para publicacao seletiva de seis arquivos. Alteracoes
  independentes dos filtros nunca devem ser staged.

## Proximo passo exato

- Publicar somente estes seis arquivos na refactor/frontend. Usuario executa
  o roteiro NOVO a partir do SHA completo publicado com git show | bash.
  O roteiro exige migration JA aplicada; se houver qualquer pendencia, para
  sem aplicar. Nao executar o roteiro anterior nem contornar a verificacao.
- Aguardar mensagem de retomada concluida e Health DEV HTTP200; homologar
  reenvio da parcela rejeitada com novo evento/numero, preservacao do historico
  e bloqueio de segundo evento ativo. Nenhuma promocao main autorizada aqui.
