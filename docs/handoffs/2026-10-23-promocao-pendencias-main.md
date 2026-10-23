# Promocao integral das pendencias DEV para main - 23/10/2026

## Autoridade e bases

Usuario autorizou promover todas as alteracoes pendentes e fornecer comandos
de atualizacao da EC2 de producao. Backup recente conferido no Drive cifrado
e timer ativo reconfirmados nesta conversa. Agente unico, sem delegacao/PR.
Base MAINfe66315160468b02651a0e6abddfea76050a9ea5; origem DEVd64137c7c30451576d4456bd8ae271e8604909a2.
Branch codex/promocao-pendencias-20261023 criada de MAIN, integrando historico
DEV por merge, sem squash/reset/substituicao da arvore produtiva pelo snapshot.
DEV remoto nao sera alterado. Outputs privados fora do commit.

Sem EC2/SSH/SQL/DDL/estorno/baixa/S3/push bancario real pelo agente.
O push MAIN pode disparar o deploy frontend da Vercel; backend/schema devem
ser atualizados em seguida pelo operador antes de usar os novos recursos.

## Pacotes integrados

- 28670b81: credor conforme configuracao na nova Compra Direta e backend,
  rascunhos/ACL preservados; forma/dados de pagamento na negociacao e edicao
  restrita desses dados nos titulos gerados, inclusive legado sem instrucao.
- c44b1add: devolucao seletiva de um/varios cheques da mesma baixa composta,
  previsao/aceite, locks/idempotencia, reabertura somente dos saldos vinculados,
  demais fontes/historico preservados e estorno restante sem duplicidade.
- 5123de39: rotulos/origens de prestacoes pendentes e aviso de recarga nao
  paga, sem alterar o motor/calculo de saldo ou efetuar ajuste financeiro.
- d64137c7: credor/favorecido separados e PIX da medicao exata na fila;
  favorecido, forma, PIX e instrucoes no detalhe do titulo a pagar. Dados
  previstos nao comprovam o destino efetivamente usado na baixa historica.

Os conflitos do merge foram apenas nos README Compras/Financeiro e ownership;
ambos os lados preservados. Runtime backend/src e frontend/src permanece
identico ao DEVd641, incluindo hotfixes anteriores ja integrados em main.
Guardas/roteiros/scripts exclusivos MAIN, handoffs e scripts npm existentes
preservados. Dependencias/lockfiles/configuracoes/flags/memoria nao mudam.

## Schema e roteiro PROD exclusivo

Somente duas migrations aditivas/idempotentes, sem backfill:

- 202610220001_titulo_negociacao_pagamento.js: titulos_financeiros.pagamento_negociacao, JSON nullable.
- 202610220002_baixa_composta_estornos_cheques.js: baixas_financeiras_grupos.estornos_cheques, JSON nullable.

Down automatico bloqueado para preservar instrucoes/recibos. Nao estorna
cheques nem edita os titulos reais TIT-007520/TIT-009886/TIT-011543 no deploy.

Novo aplicarMigrationsPendenciasProducao20261023.js reutiliza as guardas
conferirProducao da MAIN sem modifica-las: caminho, host/UUID/banco, TLS/CA,
PM28000, configuracao persistida/terminal, sessao12h e flags preservadas.
Exige online/timer; admite somente001/002 pendentes, tipos JSON nullable
consistentes e schema_migrations existente. Aplicar exige backup/timer SIM.
Autoriza DDL somente dentro do processo e restaura a flag mesmo na falha.
Reexecucao aceita nenhuma ou uma das duas pendente; schema errado interrompe.

ops/deploy/atualizar-producao-pendencias-20261023.sh recebe SHA MAIN exato,
confere backup/timer, checkout MAIN limpo, lock e fast-forward desdefe663151.
Inventario Git exato de001/002, runtime/migrations iguais DEVd641, pacotes
somente o QA novo e nenhum arquivo MAIN removido. Preflight readonly antes
do merge admite retomada deste pacote; QAs offline precedem DDL. Depois,
aplicador --verificar/--aplicar/--concluido, verificadores financeiros/reenvio,
hash .env/timer, restart SOMENTE backend-solicitacoes sem --update-env e sem
propagar flag DDL, health8000 e verificacoes finais. Nao executar roteiro DEV.

Nao rodar migrate geral, editar .env, desabilitar TLS/guardas ou reiniciar todos
os processos. Se interromper, preservar estado e enviar saida sem segredos.
Se parar depois do ff-only/DDL parcial, reexecutar o mesmo SHA somente apos
diagnosticar; aplicador e migrations toleram as colunas ja criadas. Nao usar
down/reset como recuperacao. Restauracao exige plano proprio com backup e
operacoes realizadas desde o deploy, nao um estorno financeiro automatico.

## Validacao e limites

Backend dos quatro pacotes e novas guardas aprovados em memoria/VM/ORM SQL
interceptado: Compra Direta, negociacao/edicao, devolucao multiplos/rateados/
replay/concorrencia simulada/rollback/ACL, saldo/origens, fila/detalhe.
Regressoes preservam medicao, DP, cheques/contratos, baixas multiplas/centavos,
comprovantes, filtros/paginacao, cancelamento, OFX e forma prevista RECEBER.
Seguranca:2304comparacoes e48rotas HTTP locais. Guardas antigas MAIN de
retomada/preflight/OFX tambem repetidas sem banco/EC2.
Novas guardas PROD cobrem verificacao sem DDL, retomada parcial, idempotencia,
erro/restauracao de flag, backup/timer, ambiente/UUID/TLS/PM2 e schema negados.
Nenhum teste em memoria substitui concorrencia MySQL ou homologacao real.
Usuario confirmou deploy DEV dos dois ultimos pacotes ate d641/health200;
nao houve confirmacao completa de teste funcional real de todas as novidades.
Promocao de todos os pendentes foi autorizada explicitamente mesmo assim.

UI dos quatro pacotes aprovada em navegador local isolado, desktop1366 e
mobile390: Compra Direta, negociacao/edicao, devolucao seletiva, saldo/origens,
fila com preferencias de colunas e detalhe/copia dos dados de pagamento.
Build frontend aprovado:637modulos/13,30s; avisos preexistentes de bundle e
Browserslist, sem alteracao de dependencias. Documentacao:619Markdown e19
canonicos aprovados; Node/Bash/diff e igualdade runtime DEV conferidos.
QA do inventario por stdin simula a versao antiga sem os novos arquivos locais,
garantindo que a verificacao anterior ao checkout dependa somente de Node/Git.

## Proximo passo

Concluir inventario do commit e publicar merge na MAIN sem
force push, conferir ancestralidade dos quatro commits e DEV remoto inalterado.
Fornecer SHA completo e bloco PROD com CONFIRM_PROD_BACKUP=SIM e
CONFIRM_PROD_BACKUP_TIMER=SIM. Somente operador executa EC2/DDL/restart.
Depois: consultas em fila/detalhe/recarga, checar novas colunas e instrucao da
negociacao; nao repetir baixas/estornos reais apenas para smoke test produtivo.
