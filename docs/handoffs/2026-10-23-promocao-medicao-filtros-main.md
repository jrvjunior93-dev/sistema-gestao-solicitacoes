# Promocao MAIN: medicao, filtros e distribuicao gerencial

## Autorizacao, bases e integracao

- Usuario confirmou homologacao DEV e autorizou migrar TODAS as pendencias
  para main, com comandos EC2 PROD. Backup recente conferido no Drive cifrado
  e timer ativo reconfirmados nesta conversa. Agente unico, sem PR/delegacao.
- MAIN4922ebad648bb8532f4ea55fcbe6052bb004f2f4; DEVf598f25a46ef92ad85500dced976c384282d5b88.
  Branch codex/promocao-medicao-filtros-main-20261023 criada da MAIN, reserva
  documental14b804ea e merge completo dos seis commits DEV. Nao substituir a
  arvore MAIN por DEV nem apagar guardas/roteiros/hotfixes exclusivos MAIN.
- Seis commits:45513bfd (filtros digitaveis/distribuicao),93a38617 (rejeicao e
  favorecido),be303667 (botoes),41bec992 (reenvio/unicidade),ae9df9d3 (metadata
  MySQL/retomada) e f598f25a (placeholders/ordem/visibilidade dos filtros).
- Conflitos somente README Financeiro, README Solicitacoes e ownership:
  manter integralmente os registros de ambos os lados. Runtime backend/src,
  frontend/src e migrations iguais ao DEV homologado. Dependencias/lockfiles
  e guarda promoverSchemaProducao20261018.js da MAIN permanecem intactos.
- Sem EC2/SSH/RDS/S3/Redis/baixa/estorno/rejeicao/reprogramacao real pelo agente.
  Push main pode disparar frontend Vercel PROD; usuario atualizara backend.
  DEV remoto e processos nao recebem mudancas. Outputs privados fora do Git.

## Schema e preservacao

- Novas migrations exatamente202610230001_medicao_rejeicao_favorecido_titulo.js
  e202610230002_medicao_vinculos_ativos.js, SEM editar versoes historicas.
- `001` acrescenta JSON opcionais contrato_medicoes.rejeicao e
  titulos_financeiros.pagamento_favorecido; sem preencher dados antigos.
- `002` troca indice legado por unicidade ativa global da parcela e identidade
  por evento, usando colunas virtuais/UNIQUEs. Preserva FKs, linhas antigas,
  IDs, valores, datas, pagamentos, vinculos e historico; nao efetua DML/backfill.
- Duplicidades ativas/eventos ou metadata divergentes interrompem antes da
  aplicacao; nao apagar/devolver vinculos automaticamente para fazer passar.
  ALTER unico atomico MySQL8/InnoDB, ALGORITHM=COPY: pode bloquear escritas.
  Operador deve executar em janela sem gravacoes, com backup/timer conferidos.
- Migrations JA registradas nao sao reaplicadas. Retomada apos001/coluna parcial
  e conferida;002completa mas sem registro exige diagnostico, nunca inserir
  registro manual automaticamente. Down destrutivo continua bloqueado.
- Validador reutiliza SOMENTE conferirPlano puro do verificador homologado,
  incluindo representacao de literais S/M escapados do metadata nativo.
  Nenhuma guarda/CLI DEV e executada em producao. Expressao/tipo/nullability/
  tamanho/virtual/ordem/unicidade/prefixos/duplicidades continuam conferidos.

## Roteiro exclusivo PROD

ops/deploy/atualizar-producao-medicao-filtros-20261023.sh:

- SHA completo publicado, baseMAIN4922, ancestralidade DEVf598 e checkout
  main limpo/exato/ff-only/flock. Backup/timer/janela confirmados por variaveis
  do operador, timer systemd ativo, PM2 exclusivamente backend-solicitacoes8000
  online/sem watch/DDL automatico, Node com SQLite para os QAs isolados.
- Inventario portatil do alvo antes do FF: exatamente duas migrations novas,
  runtime/schema igual DEV, quatro scripts QA adicionais por manifesto,
  nenhuma dependencia/lock alterado e nenhum arquivo exclusivo MAIN removido.
- Guarda PROD anterior REAL confere host/UUID/TLS/JSON/sessao12h/CA/PM2/flags
  e .env antes do FF; aceita somente001/002pendentes. Nunca relaxar a guarda
  anterior ou mudar flags para encaixar o ambiente no roteiro.
- Testes isolados antes de aplicar. Novo aplicarMigrationsMedicaoFiltrosProducao20261023.js
  aceita somente001/002pendentes, valida colunas e plano original antes/depois,
  exige backup/timer/janela no --aplicar. ALLOW_SCHEMA_MIGRATIONS habilitada
  apenas dentro do processo e restaurada em finally; nunca no .env/PM2.
- --verificar somente leitura; --concluido exige schema completo. Verificadores
  financeiros/PWA antigos preservados e executados apos DDL e apos restart,
  com nenhuma notificacao/decisao/fila real. .env preservado por hash.
- Reinicia SOMENTE backend-solicitacoes, sem --update-env, e exige health8000.
  Nenhum backend-dev, npm install, build na EC2, migration irrestrita, mudanca
  de permissao, flags, dados ou configuracao de backup neste deploy.

## Validacoes e proximo passo

- QA novo exercita guardas PROD reais em fixtures: host/UUID/TLS/JSON/12h/CA/
  flags/PM2/porta/timer, somente duas migrations, duplicidades, schema parcial,
  metadata MySQL nativo, leitura/retomada/replay/falha/restauracao da flag.
  Testa blocos PM2 em VM e inventario/manifestos/roteiro/negativas sem rede.
-21 suites backend repetidas: rejeicao/favorecido/reenvio/schema/SQL SQLite,
  pagamento/recarga/saldo, filtros/sugestoes/paginacao, distribuicao/destinatarios,
  TIT-009886, seguranca2304comparacoes/48rotas e80rotas financeiras, guardas
  PROD anteriores, preferencias e motor. Tres QAs dos roteiros DEV preservados.
- UI real medicao/titulo, filtros/arranjo e distribuicao gerencial1366/390
  aprovadas; build643modulos/17,51s aprovado. Documentacao629/19, Node/Bash,
  diff e igualdade runtime/schema DEV conferidos. Avisos antigos Browserslist/chunk nao
  bloquearam build. Nenhum DDL MySQL PROD executado localmente.
- Finalizar merge/push main sem force, conferir SHA remoto e DEVf598 intocado;
  fornecer comando com SHA fixo/confirmacoes. Usuario deve atualizar em janela
  curta, aguardar health e Vercel main. Conferencia inicial PROD somente por
  leitura; nao rejeitar, baixar ou estornar casos reais apenas como smoke test.
- Se qualquer guarda parar, enviar saida sem segredos; nao usar reset/down,
  SQL de correcao de dados ou roteiro DEV como atalho. Nao garantir rollback
  financeiro por voltar codigo; schema/historico novo devem ser preservados.
