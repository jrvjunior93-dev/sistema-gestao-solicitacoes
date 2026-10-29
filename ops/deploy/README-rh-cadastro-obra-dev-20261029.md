# Atualizacao DEV - cadastro limitado do colaborador

Base funcional:72c0cc4756b0841b89581a1771e1c27eb908b7b5.
Instala somente rhColaboradorObraService.js no runtime; alias tipoDocumento,
DTO tipo_nome. Copia QA/helper/aplicador/manifesto e package.json sem mudar
suas dependencias ou demais scripts da base. Nenhum frontend e instaladoEC2.
Frontend segue VercelDEV no push refactor/frontend.

Aplicador deriva das guardasDEV homologadas dos destaques. Confere processo
DEV Node24.22.1 porta8001 e identidade configurada staging sem abrirDB/S3.
Preserva PROD4096,Experience,Nodes,ambientes,dumps,systemd,flagsNSDOCSoff,
HEAD e indice sem pull/checkout/reset. Backup privado dos arquivos e fases
prepared/files_ready/restarting/done. Somente um restart backend-dev; retomada
incerta de restarting observa sem novo restart. Nao apagar estado/locks.
Modos dos arquivos existentes sao preservados explicitamente apos umask.

Comandos fornecidos no chat com commit pinado. Via stdin:
node - --backend COMMIT com CONFIRM_DEV_BACKUP=SIM e
CONFIRM_RH_CADASTRO_OBRA_DEV=SIM; conferencia via script instalado:
node ops/deploy/atualizar-dev-rh-cadastro-obra-20261029.cjs --conferir COMMIT.
Somente executar no checkoutDEV com NodeDEV isolado indicado no chat.
Nao usar PM2 save/update/resurrect/update-env. Sem install/migration/SQL/baixas.

Testes: associacao/modelos/SQL reais com query simulada; privacidade e escopo,
replay upload e campos extras negados; salario/ACL; estado/restart/inventario
no aplicador. TestesUIdesktop/mobile/retry/build do frontend executados localmente.
Nao acessado servidor/banco/S3 pelo agente. Confirmacao funcional apos deploy
pelo usuario: obra abre cadastro,altera apenasobservacoes,envia documento e
nao consegue editarCPF/salario/lotacao nem consultar arquivosprivadosDP.
