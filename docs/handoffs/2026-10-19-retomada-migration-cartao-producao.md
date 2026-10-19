# Retomada do deploy financeiro: migration de cartao

## Evidencia e causa

Operador atualizou main de ff459840 para a67e3de9, instalou npm ci e passou as
suites isoladas. O roteiro sem DDL parou no verificador ANTES do restart. Nova
consulta somente leitura com promoverSchemaProducao20261018 --concluido mostrou
exatamente 202610190001_cartao_parcelamento_baixa.js pendente.

Erro do preflight anterior: ls-tree chamado de backend com pathspec
backend/migrations retornava zero arquivos. Lista vazia virava zero pendencias.
Usar --full-tree, recusar inventario vazio/incompleto/duplicado e testar Git real
na raiz e em backend corrige a causa. O inventario real contem 275 migrations.
Nao implica invalidar a simulacao financeira em memoria, que nao fez escrita.

## Alteracoes e limites

- preflightFinanceiroProducao20261019/teste: inventario independente do cwd,
  exige migration esperada; guardas de identidade separadas do schema corrente,
  para reportar corretamente a unica pendencia estrutural permitida no alvo.
- promoverSchemaProducao20261018: apenas extracao de conferirProducao; conserva
  integralmente guardas e allowlist das duas migrations antigas.
- aplicarMigrationCartaoParcelamentoProducao/teste: identidade/PM2/watch/TLS/
  JSON/PILOT/12h/env, schema com migration unica permitida, backup/timer,
  autorizacao em processo Node restaurada no finally, runner canonico estrutural,
  repeticao sem reaplicar quando ledger concluido. Outra pendencia bloqueia.
- verificarFinanceiroProducao20261019: mensagem reconhecida de migrations sem
  esconder nomes; nao ecoa mensagem arbitraria de driver com SQL/credenciais.
- concluir-producao-financeiro-20261019.sh: exige checkout main a67 ou descendente,
  limpo, flock/timer, SHA remoto e fast-forward. Delta contra a67 restrito a
  backend/scripts, ops/deploy e docs; runtime/dependencias/migrations intactos.
  Guardas completas antes de DDL; schema/SELECT/EXPLAIN antes do restart e apos
  health200. Reinicia somente backend-solicitacoes, sem --update-env.

Nenhum backend/src, frontend, server.js, migration, lockfile, permissao ou regra
funcional alterado. Sem backfill ou regularizacao financeira. .env nao editado,
hash conferido tres vezes. DEV e trabalho de outro agente intactos.

## Validacoes locais

validarDeployProducao20261018, validarPreflightFinanceiroProducao20261019,
validarRetomadaCartaoProducao, validarDeployFinanceiroProducao20261019 e
test:cartao-parcelamento-baixa aprovados com E/S injetada e Git local real.
Cobrem migration estranha, tabela ledger ausente, UUID DEV, modo/porta/PM2/watch,
flags divergentes, confirmacoes ausentes, falha DDL e restauracao da flag,
idempotencia, erro seguro, rollback das leituras e processo exclusivo.
validarDeployCartaoParcelamentoDev tambem aprovado: guardas DEV continuam
recusando producao. Sintaxe Node/Bash, test:docs (584 Markdown/19 canonicos),
git diff --check e delta operacional restrito aprovados. Ownership liberado.

## Proximo passo e riscos

Publicar correcao operacional por PR na main, validar SHA final e entregar comando
fixado ao operador. Somente ele executa EC2. Backup cifrado/timer e DEV aprovados
ja confirmados nesta promocao. Sem EC2, MySQL, migration ou restart pelo agente.

Migration aditiva/idempotente, sem conversao de dados antigos. MySQL DDL pode
aguardar locks/ter commits implicitos: se falhar/expirar, nao reiniciar, nao
inserir ledger manualmente e nao executar down. Conferir erro e estrutura antes
de retomar. O verificador SQL final bloqueia restart se tabela/colunas/indices/
FKs/consistencia faltarem. Nenhuma regularizacao dos titulos e automatica.
