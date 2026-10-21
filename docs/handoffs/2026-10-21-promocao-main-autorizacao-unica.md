# Promocao isolada: autorizacao unica - 2026-10-21

## Autorizacao e integracao

Usuario homologou no DEV titulos de lotes diferentes com uma unica passkey,
autorizou migrar este ajuste para main e pediu comandos EC2 PROD. Confirmou
novamente backup recente no Drive cifrado e timer ativo para esta promocao.
Agente unico; nao acessa EC2, banco, Redis, S3 ou dispositivos reais.

Congelados: main60f327d7d7dc7f68d8e2eb8b3e232d6d649edc85 e
DEV828ed2ecd6478df54ff859c306b2ffac1a9ea9c9. Integracao criada da main na
branch codex/promocao-passkey-unica-main-20261021. Aplicado somente delta828,
nao toda a branch DEV. Cinco conflitos exclusivamente documentais resolvidos
mantendo os registros main e a especificacao da selecao; nenhum conflito runtime.
Nao promover lista unica fatura, saldo/cartao, Obras/permutas ou periodo registro.

Runtime: novo pagamentoAutorizacaoSelecaoService, adaptador/exportacoes/log seguro
em pagamentoAutorizacaoService, wrapper interno da fila com transaction opcional,
duas rotas/controlador e componente/services da selecao. Modulos novos e UI
identicos ao DEV; pagamentoManualFilaService conserva todas as regras main,
recebendo SOMENTE os dois ajustes de assinatura/argumento do wrapper. Nenhuma
alteracao de schema/dependencias/flags/permissoes, saldo/pagamento ou backfill.
Nenhum envio/reenvio/autorizacao/baixa de producao e executado pelo deploy.

## Snapshot preventivo e recuperacao

Tag anotada backup/main-pre-passkey-unica-20261021-60f327d7 no SHA anterior;
bundle completo privado outputs/promocao-passkey-unica-main-20261021/
main-60f327d7.bundle validado por git bundle verify, fora da EC2. Outputs nao
entram no Git. Isso conserva codigo, nao substitui backup cifrado do banco.

Em incidente, parar novas autorizacoes e conferir se houve commit antes de
repetir: timeout do HTTP nao significa rollback. Nova UI consulta estado, sem
repetir POST automaticamente. Nao apagar filas/historico ou restaurar DB para
resolver divergencia visual. Retorno de codigo deve usar reversao Git aprovada
a base60f327d7, coordenar frontend Vercel e reiniciar somente processo PROD;
sem migration down ou restauracao automatica. Preservar autorizacoes existentes.

## Roteiro para o operador

ops/deploy/atualizar-producao-autorizacao-unica-20261021.sh recebe SHA completo
publicado na main e exige CONFIRM_PROD_BACKUP=SIM/CONFIRM_PROD_BACKUP_TIMER=SIM.
Confere caminho main, worktree limpo, lock, timer backup ativo, PM2 PROD online/
8000/sem watch/migration automatica. Base60f327d7 instalada e ancestral ao alvo,
alvo na main remota e ff-only, migrations/dependencias identicas e runtime
limitado aos cinco arquivos autorizados.

Antes do merge chama verificadores JA instalados verificarFinanceiroProducao
20261019 e verificarReenvioAutorizacaoProducao --verificar: UUID/TLS/schema/12h/
flags/push em leitura, sem importar o novo modulo antes de existir. Depois do
merge, sintaxe e suites isoladas e mesmos verificadores. Sem npm install/ci,
DDL ou mudanca .env/flags. Restart exclusivo backend-solicitacoes, health8000,
pos-check readonly e .env por hash. DEV nao e reiniciado ou modificado.

Frontend chama duas rotas novas. Ordem preferencial: backend/health, frontend
main na Vercel, atualizar PWA. Push/merge da main pode disparar Vercel antes de
o operador atualizar EC2: durante essa janela nao usar a nova autorizacao.
Backend novo permanece compativel com frontend antigo. Nao enviar titulos
reais so para teste; proxima operacao legitima permite conferencia de historico/
fila e ausencia de duplicados, com a passkey e as permissoes usuais.

## Validacao

QA validarDeployAutorizacaoUnicaProducao: guardas SHA/base/backup/timer/PM2,
prechecks antes do merge, testes antes do restart e pos-check, sem escrita de
banco/DDL/env/instalacao/DEV. Sintaxe Bash/Node e diffs de escopo/dependencias.
Backend/UI/regressoes/build/docs repetidos na integracao antes da publicacao;
resultados finais registrados nos controles workspace. Aprovados na integracao:
validarAutorizacaoSelecao, FilaDiretaProprietario, BloqueioProprietario,
PainelAutorizacoes, TitulosExcluidosAutorizacao, ReenvioAutorizacaoPush,
CartaoParcelamentoBaixa, EncerramentoSemPedidoHistorico, UploadComprovantesFila,
ComprovantesPdfFila e ChequesLoteContrato; UI130 titulos320/390/1366; build
12,99s/630 modulos (avisos preexistentes Browserslist/chunk grande); Node/Bash/
guardas/docs598/19/diff/escopo. Nenhum runtime fora dos cinco arquivos backend
e dois frontend; wrapper tem apenas transaction opcional; schema/deps identicos.
Ownership liberado para commit/PR/merge autorizado. Nenhuma prova local
substitui os prechecks de producao que o operador executara na EC2.

Proximo passo: PR/merge main autorizado, entregar SHA final e comando pinado
para o operador. Se qualquer guarda falhar, parar e enviar saida sem segredos;
nao forcar checkout, marcar migration ou editar .env para contornar a guarda.
