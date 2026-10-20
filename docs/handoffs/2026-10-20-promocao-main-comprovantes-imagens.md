# Promocao MAIN dos comprovantes JPG/JPEG/PNG

## Autorizacao e referencias

- Usuario homologou anexos individuais/compartilhados no DEVf83567393bc96b70a4aaa593ddcc8a6459501060
  e autorizou promocao para main b31531d03ddcafd9b5a001f68da249aa70b1d231.
- Backup recente no Drive cifrado conferido e timer ativo confirmados para
  esta promocao. Agente unico; nao acessou EC2/SSH, banco/S3/antivirus reais.
- Branch de integracao criada da main, incorpora historico DEV sem reset,
  cherry-pick ou descarte de hotfixes. Cinco conflitos apenas documentais,
  resolvidos preservando historicos main/DEV. Script npm exclusivo main mantido.
- Tag de recuperacao backup/main-antes-imagens-20261020-b31531d0 no SHA anterior.
  Bundle completo privado verificado fora da EC2, nao publicado no repositorio:
  outputs/main-antes-imagens-b31531d0.bundle, SHA256
  13d330cf9020edc38286625769765f5f03fa88e9d6461b9ce3f559ce1f7f9520.
  A copia local do codigo nao substitui backup cifrado do banco confirmado.

## Escopo e deploy

- Runtime backend/src e frontend/src identico ao DEV homologado: manual
  PDF/JPG/JPEG/PNG ate12MB, importador exclusivamente PDF. Preservados ACL,
  binarios/scanner, replay/locks/historico e S3 por destino; nao cria outra baixa.
- Sem alteracao de migrations, dependencias/locks, .env, flags ou dados antigos.
  Sem nova permissao, conversao/OCR ou regularizacao financeira automatica.
- Roteiro existente ops/deploy/atualizar-producao-cheques-20261019.sh agora
  exige ancestralidade f835 e roda upload/manual/schema/parser antes do restart.
  Reutiliza guardas JA instaladas antes do merge: backup/timer, checkout main
  limpo, SHA pinado/ff-only, PM2/porta8000/watch, UUID/TLS/schema/12h/PILOT/push.
- Hash do .env preservado; qualquer migration pendente interrompe o roteiro
  sem DDL. npm ci --omit=dev, testes isolados, verificadores somente leitura,
  reinicio apenas backend-solicitacoes sem update-env e health8000. Nao toca DEV.
- Nome do roteiro continua historico (cheques), mas cobre tambem este pacote.
  Nao executar script novo do checkout antigo antes do merge/bootstrap.

## Evidencias locais

- Upload HTTP loopback com Multer/seguranca reais, scanner/log simulados:
  tipos/assinaturas/extensoes/MIME,12MB/quantidade, ACL e importador PDF aprovados.
- Servico/historico, escopo/destinos, replay/concorrencia, rollback e financeiros
  intactos; schema em memoria, parser PDF, datas/cheques/descontos/contrato,
  rateio1000, carteira/composta/cartao e bloqueio proprietario aprovados.
- Guardas produtivas de cheques/financeiro/reenvio e DEV aprovadas sem EC2.
- UI imagens real com APIs simuladas1366/390, invalidos sem envio, preview img,
  duplo clique/readonly/importador, e build aprovados apos integracao.
- Bash/Node, documentacao canonica e diff-check aprovados. Runtime conferido
  byte a byte contra DEV e migrations/dependencias contra main anterior.
  Avisos de Browserslist/chunks preexistentes no build, sem erro.

## Operador e recuperacao

Publicar via PR main com head esperado; comando entregue usa SHA final pinado.
Operador executa EC2 somente em checkout main limpo, com backup/timer conferidos.
Se falhar, parar e trazer log sem segredos. Nao contornar guardas nem executar
migrate automaticamente. Aguardar deployment Vercel da main e atualizar pagina.
Conferir imagem real individual/compartilhada em pagamentos pertinentes, preview
e historico; importacao continua PDF. Nao repetir pagamento para testar anexo.

Se houver regressao, preservar anexos/dados e registrar incidente. Reverter
frontend na Vercel ao artefato anterior; backend pode retornar ao SHA b315
compativel, somente mediante plano de recuperacao autorizado e restart exclusivo
de producao. Nao executar down, apagar anexos ou restaurar banco automaticamente.
PDF antigo permanece suportado; backend anterior nao aceita novos uploads de imagem.

Ownership liberado para commit/PR/merge autorizado; execucao EC2 e conferencia
real apos deploy ficam com o operador. Nenhum deploy EC2 foi executado pelo agente.
