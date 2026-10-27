# Atualizacao da captura NSDOCS fiscal DEV

Pacote autorizado para refactor/frontend. Nao executar em main/producao.
Primeira etapa atualiza somente arquivos e faz conferencias locais, sem restart,
npm install, migration, IAM/S3/NSDOCS, configuracao de chave ou alteracao de.env.
As duas dependencias declaradas ja existiam no lock; operador confere isso e
seus exports instalados, sem baixar pacotes. Se faltar modulo, interromper.

## 1. Publicar arquivos e obter diagnostico somente leitura

No terminalSSHUbuntu, trocar SHA_PUBLICADO pelo SHA completo informado no chat:

```bash
(
  set -euo pipefail
  trap 'echo "Interrompido. Envie somente a saida segura; nao contorne protecoes." >&2' ERR
  cd /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(git branch --show-current)" = refactor/frontend
  test -z "$(git status --porcelain --untracked-files=no)"
  git fetch origin refactor/frontend
  VERSAO_NSDOCS_CAPTURA=SHA_PUBLICADO
  git merge-base --is-ancestor "$VERSAO_NSDOCS_CAPTURA" origin/refactor/frontend
  git show "$VERSAO_NSDOCS_CAPTURA:ops/deploy/atualizar-dev-nsdocs-captura-20261024.cjs" |
    /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node - "$VERSAO_NSDOCS_CAPTURA"
)
```

Aceita somente HEAD0b9f209b13254d5da89499fc7cd91f3faef8c99f ou o proprio alvo.
Valida inventario exato, package/lock, tres apps/Nodes/daemon/dumps/env,
CApublicaOhio/TLS/UUIDDEV, flagsOFF e health8000/8001. Fast-forward, QA offline e
`nsdocsDevSetup.js --conferir`. Nao publica frontend nem executa AWS real.
Esperado: NSDOCS_CAPTURA_DEV_ARQUIVOS_PRONTOS e NSDOCS_SETUP_DEV_CONFERIDO.

**Enviar esse diagnostico antes de seguir**. Os campos bucket/regiao/prefixo
devem estar true e fiscal_company_id deve existir. Se nao, nao editar.env para
contornar: conferir storage legado e cadastro fiscal pela interface autorizada.
Nao criar/alterar empresa automaticamente, mover objetos ou trocar bucket global.

Do momento em que esta migration passa a existir no checkout ate sua aplicacao,
o backend em execucao permanece intacto, mas seu guard de inicializacao pode
recusar restart por schema pendente. Este operador nao reinicia processos.

## 2. Configuracao privada exclusiva da captura

Apos conferir diagnostico alinhado e cadastro fiscal ativo:

```bash
(
  set -euo pipefail
  cd /home/ubuntu/sistema-gestao-solicitacoes-dev/backend
  /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node \
    scripts/nsdocsDevSetup.js --configurar-storage
  /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node \
    scripts/nsdocsDevSetup.js --preflight-infra
)
```

Grava somente /home/ubuntu/.config/fluxy-nsdocs-dev/capture-config.json,600/uid1000,
identificadores publicos fixos, sem chave nova e sem mudar.env/PM2. Repetir e
idempotente; configuracao existente divergente nao e sobrescrita. Usa mesmo lock
da consulta/captura. ChaveNSDOCS anterior fica preservada no arquivo separado.
O cliente da captura combina essa configuracao em memoria, sem exportar env.

Preflight assume roleFluxyNsdocsFiscalDev por15min e le cinco configuracoesS3 no
fluxy-fiscal-dev, sem gravar objetos. Exige owner992500432025,Ohio,quatro bloqueios
publicos,ownerEnforced,policyprivada,versionamento. Mostra gravacao_s3_testada=false.
Permissoes originais de admin-jose nao sao alteradas; nao associar role a EC2.
FalhaSTS/S3 interrompe, sem fallback para usuario amplo. AutomaticoOFF.

## 3. Aplicar somente a migration da captura no DEV

**Apos conferir backup recente do DEV e o resultado do preflight**:

```bash
(
  set -euo pipefail
  cd /home/ubuntu/sistema-gestao-solicitacoes-dev/backend
  CONFIRM_DEV_BACKUP=SIM CONFIRM_NSDOCS_DEV_SCHEMA=SIM \
    /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node \
    scripts/nsdocsDevSetup.js --migration
  /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node \
    scripts/nsdocsDevCapture.js --preflight --empresa-id 2 --cnpj 27123008000100
)
```

TLS e identidadeDEV conferidos tambem na conexaoDDL dedicada(poolmax1), lockSQL,
somente202610240001_fiscal_nsdocs_capturas.js e ledger correspondente. DML da
migration e DROP bloqueados; nao roda migrategeral/seeds/backfills. Nao mexe em
ALLOW_SCHEMA_MIGRATIONS global. Outra pendencia impede execucao. DDLMySQL pode
autocommitar parcialmente; retry valida/repara a propria estrutura sem apagar
dados. Down automatico bloqueado. Se ja aplicada, valida estrutura e nao reinsere
ledger. Fecha conexao e libera lock, sem restart/processos/env/Nodes/dumps.

## 4. Capturar uma NF-e e verificar idempotencia

Antes do primeiro GET XML, confirmar/homologar com NSDOCS a semantica do parametro
status(Pendente/Importado). Codigo usa exatamente o estado observado; nao envia
PUT de utilizacao ou manifestacao. Nao afirmar ausencia de efeitos remotos deGET.
Captura real consome uma consulta e ate um downloadXML neste exemplo, alem de
STS/S3. Faz escrita apenas no acervo fiscalDEV e no prefixo dessa empresa.

```bash
(
  set -euo pipefail
  cd /home/ubuntu/sistema-gestao-solicitacoes-dev/backend
  NODE_NSDOCS_DEV=/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node
  CAPTURA_NSDOCS_ID=$("$NODE_NSDOCS_DEV" -e 'console.log(require("node:crypto").randomUUID())')
  echo "Anote o ID para retomada: $CAPTURA_NSDOCS_ID"
  "$NODE_NSDOCS_DEV" scripts/nsdocsDevCapture.js --capturar \
    --empresa-id 2 --cnpj 27123008000100 --captura-id "$CAPTURA_NSDOCS_ID" \
    --inicio 2026-10-18 --fim 2026-10-24 --status Pendente --quantidade 1 \
    --confirmar-chamada-real --confirmar-persistencia
  "$NODE_NSDOCS_DEV" scripts/nsdocsDevCapture.js --historico \
    --empresa-id 2 --cnpj 27123008000100 --captura-id "$CAPTURA_NSDOCS_ID"
  "$NODE_NSDOCS_DEV" scripts/nsdocsDevCapture.js --capturar \
    --empresa-id 2 --cnpj 27123008000100 --captura-id "$CAPTURA_NSDOCS_ID" \
    --inicio 2026-10-18 --fim 2026-10-24 --status Pendente --quantidade 1 \
    --confirmar-chamada-real --confirmar-persistencia
)
```

Repeticao deve retornar replayed=true/external_nsdocs_calls=0. Ainda faz somente
leiturasSTSS3 e auditoria de retomada local. Se falhar, preservar UUID impresso e
mesmos filtros, aguardar60s antes de nova tentativa com chamadasNSDOCS. Nao gerar
outro UUID para retomar lote incompleto. Vazio nao comprova captura de uma nota;
ajustar periodo/status em lote novo apos conferir os dados no provedor.
XML confere identidade/estrutura, nao assinatura/XSD/situacaoSEFAZ. Preserva
notaexistente/vinculos/status/baixas. AutomaticoOFF e nenhum bloqueio financeiro.

## Retorno

Parar de usar a CLI restaura o comportamento operacional anterior: nao houve
restart, mudanca.env/PM2, migracao de dados financeiros ou ativacao automatica.
Preservar tabelas/XMLs/historico; nao executar down ou excluir arquivos privados.
Rollback de codigo, se necessario, deve ser por revisao/novo commit, sem reset
forcado do checkout e sem apagar evidencias ou politicas existentes.
