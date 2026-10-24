# Handoff: credenciais da API e download da medicao

## Escopo e autorizacao

- Usuario autorizou implementar/testar em refactor/frontend, preservando
  permissoes e links assinados. Agente unico, sem delegacao. Base84b9aef4,
  checkout de trabalho codex/retirada-envios-dev-20261023 que acompanha a refactor.
- Implementacao inicial sem publicacao; depois usuario autorizou commit/push
  DEV em duas etapas, conforme registro abaixo. Sem promocao main, configuracao
  Vercel, SSH/EC2, AWS, dados reais ou migrations pelo agente. Roteiros Node24
  de tarefa anterior e outputs/ privados foram preservados.

## Alteracoes

- frontend services/api.js e utils/requestTarget.js: origem/path exatos, sem
  credenciais para destinos externos, CSRF/auditoria/eventos so na API e redirect
  error/manual para nao encaminhar headers sensiveis. Preservar Request/body/signal.
- services/anexosMedicao.js e ModalMedicao: presign/ACL em todos os anexos,
  download por navegacao S3 com attachment, fetch/Blob apenas em uploads locais,
  guarda de clique repetido, bloqueio/erro util sem alterar visual ou financeiro.
- Backend securityValidators, AnexoController, fileAccessService, s3 e fileName:
  opcional download=0/1, assinatura attachment segura com nome do registro,
  mesmo ACL, buckets e TTL300s; preview padrao e extensoes de risco preservados.
- Testes de transporte e navegador em frontend/scripts; testes de
  assinatura/controller/validador em backend/scripts; scripts npm e docs canonicas.

## Riscos e proximo passo

- Homologacao na AWS real ainda pendente; testes usam apenas mocks/servidores
  locais. Nao relaxar CORS, bucket ou ACL para corrigir este fluxo.
- Deploy requer backend atualizado ANTES da liberacao do frontend com download=1;
  backend antigo recusaria a nova query. Sem migration ou update de dependencias.
- Publicar apenas este delta na refactor, mantendo Node24/diagnostico de
  operacao anterior e outputs/ fora dos commits. Frontend aguarda evidencia DEV.

## Validacao concluida

- Frontend npm run test:download-medicao: 9 cenarios de transporte e Chrome real
  desktop1366/mobile390 com servidores locais. Download/nomeUTF8/assinatura,
  preview inline separado, storage sem CORS, guarda clique duplo,401/403/404,
  URL invalida, legado e redirect sem vazamento. Screenshots revisados nas duas
  larguras em outputs/download-medicao-credenciais, privados e fora do Git.
- Backend npm run test:download-anexo-medicao e validarAcessoAnexosSolicitacoes:
  controller/validador/SDK simulado + SDK real com credenciais ficticias e assinatura
  exclusivamente local (sem requisicao AWS), nome/header/TTL, negativas de ACL e
  remocao/historico preservados. 10 cenarios novos; testes legados aprovados.
- Frontend: rejeicao/favorecido, medicao-recarga-envio, remocao de anexos,
  boletos-pedido e navegacao/abas aprovados. A suite medicao-recarga foi repetida
  com PLAYWRIGHT_EXECUTABLE_PATH apontando para o Chrome instalado, pois faltava
  o Chromium headless bundled. Nao foi instalado navegador ou dependencia.
- npm run build aprovado; catalogo gerado nao teve delta. Avisos existentes de
  Browserslist antigo, chunks grandes e trinco de navegacao nao impedem o build.
- node --check e git diff --check aprovados. test:docs continua falhando SOMENTE
  pela metrica preexistente399/401 em docs/seguranca/autenticacao_autorizacao.md,
  confirmado sem diff nesse arquivo. Nao corrigido fora do escopo.
- Ownership de implementacao encerrado. Publicacao parcial e ponto de retomada
  registrados abaixo; homologacao real ainda depende do operador.

## Publicacao autorizada em duas etapas

- Usuario autorizou commit/push na refactor/frontend e comandos DEV, exigindo
  backend antes do frontend. Como um push pode disparar Vercel, o backend e
  commitado/publicado primeiro, SEM alterar nenhum arquivo frontend. A interface
  existente continua a mesma ate a etapaB; o download novo ainda nao esta liberado.
- O runner ops/deploy/atualizar-dev-download-medicao-backend-20261024.cjs e seu
  manifesto limitam o fast-forward ao backend autorizado, base84b9aef4, sem
  migrations/dependencias. Node24.22.1 isolado deve continuar configurado no PM2;
  preflight le ambiente real em filho SEM IPC herdado. Nao copia ambiente shell.
- Confere todos os processos fora do DEV, .env e binarios Node antes/depois,
  executa QAs isolados e reinicia apenas o ID validado como backend-dev. Apos
  health/PID estaveis, emite BACKEND_DOWNLOAD_MEDICAO_PRONTO com SHA e PIDs,
  sem segredos. Nao faz pm2 save/update ou muda o interpretador.
- Comando EC2: entrar no checkout DEV; conferir branch/limpeza; obter a etapaA
  via git fetch; travar o lock comum git fluxy-dev-deploy.lock por flock; executar
  git show SHA:ops/deploy/atualizar-dev-download-medicao-backend-20261024.cjs |
  /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node - SHA.
- A etapaB de frontend sera commitada localmente, mas NAO enviada enquanto o
  usuario nao trouxer a evidencia do runner da EC2. Depois enviar o mesmo commit
  frontend na refactor/frontend, aguardar Vercel DEV e homologar medicao/anexos.
  Nunca promover main ou mudar configuracao/producao para cumprir a ordem.
- Roteiros Node24 anteriores, seu handoff, outputs/ e registro local de ownership
  nao relacionados ficam fora dos commits. Nao excluir alteracoes do usuario.
- Validacoes repetidas para publicacao: 10 cenarios backend, remocao/ACL legadas,
  9 cenarios de transporte, Chrome desktop/mobile, build e 5 testes das guardas
  do deploy aprovados. O manifesto do commit backend sera conferido contra o
  index antes do commit e contra o delta real apos o commit. Sem operacao EC2.

## Ponto de retomada: backend publicado, frontend retido

- EtapaA publicada em origin/refactor/frontend:
  ed7df6de22800fc8a974ddf8e6218413ead495cf. Inventario real conferido com manifesto;
  nenhum arquivo frontend, migration ou lockfile incluido. Origin/main conferida
  intacta em 78fbf27749ca41f3ab01a25a968d05306c3bbb47.
- EtapaB contem somente frontend, testes e documentacao correspondente; commit
  local preparado para continuidade. NAO fazer push antes da evidencia do usuario
  com BACKEND_DOWNLOAD_MEDICAO_PRONTO e commit exato da etapaA. O backend remoto
  publicado no Git nao significa que a EC2 ja foi atualizada.
- Proximo passo exato: usuario executa o runner stageA na EC2 DEV e envia a saida.
  Conferir health/Node24.22.1/producao_preservada; entao conferir remoto ainda na
  etapaA e publicar apenas a etapaB na mesma refactor/frontend. Aguardar frontend
  DEV e testar preview/download/permissoes na medicao, inclusive clique repetido.
- Sem necessidade de migration, npm install, troca de runtime ou pm2 save.
  Nao promover main ou reiniciar producao. Reserva de edicao liberada ao concluir
  os commits; publicacao frontend deliberadamente pendente da prova da EC2.
