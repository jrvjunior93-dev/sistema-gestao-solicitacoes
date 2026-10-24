# Captura manual de NF-e NSDOCS v2 no DEV

Preparacao local de 24/10/2026. Nao publicada, nao executada na EC2 e sem
chamadas reais nesta etapa. A consulta anterior foi homologada pelo operador:
empresa local2/CNPJ27123008000100,5 documentos; ainda sem persistencia.
O usuario confirmou que o nome local diferente identifica a mesma empresa.

## Escopo

- CLI administrativa `backend/scripts/nsdocsDevCapture.js`; nao cria rota,
  listener, job, permissao web, novo bloqueio financeiro ou vinculo automatico.
- Conector automatico e fixtures da aplicacao permanecem OFF. A CLI de consulta
  anterior continua somente leitura; gravacao exige outro comando e confirmacoes.
- Ubuntu1000, checkoutDEV/refactor/frontend, Node24.22.1 isolado, stagingRDS,
  UUID/database/TLS/CA conferidos antes de permitir escrita. Nao usa a conexao
  global da aplicacao, nem altera `.env`, PM2 ou Nodes durante a preparacao.
- A chave existente continua em arquivo privado600, fora de Git/argv/env/PM2.
- NF-e modelo55, uma pagina de ate5 documentos/31dias por execucao. Sem paginacao
  automatica. Um GET de lista e ate5 GETs de XML; retomada pode dispensar ambos.
  O historico informa proximo offset e necessidade de particionar o periodo.

## Persistencia e retomada

Migration estrutural `202610240001_fiscal_nsdocs_capturas.js`, ainda nao aplicada:

- `fiscal_nsdocs_captures`: UUIDv4 explicito, empresa fiscal/local, hash dos
  filtros/destino, pagina normalizada duravel, estado e resultado do lote.
- `fiscal_nsdocs_capture_events`: eventos anexados sem remover tentativas ou
  falhas anteriores; codigos seguros, nunca chave, erro bruto ou XML.
- `fiscal_nsdocs_observations`: unico `(capture_id,access_key)`, snapshot dos
  dados/estado informado pela NSDOCS, bucket/chave/hash do XML e FK da NF-e.
- Registro canonico em `fiscal_dfe_documents`, unico pela chave de acesso;
  evento `nsdocs_manual_capture` na linha do tempo fiscal existente.

Exige uma `FiscalCompany` ativa ja cadastrada, com CNPJ correspondente e
`empresa_id` vinculado a EmpresaGrupo. ID fiscal nao e o ID da empresa local.
Nao cria esse cadastro nem habilita modulo/SEFAZ automaticamente. Se faltar,
interrompe antes da NSDOCS; conferir/cadastrar pela interface fiscal autorizada.
Exige tabelas InnoDB, colunas e indices unicos completos, alem da migration no
ledger. Migration nao faz seed/backfill; reversao destrutiva automatica bloqueada.

O mesmo UUID com os mesmos filtros/destino retoma ou devolve resultado concluido;
com outros dados e recusado. Outro UUID pode observar a mesma NF-e e registra
novo historico, sem criar outra nota. Registro fiscal preexistente nao e atualizado:
preserva empresa, XML, campos conferidos, manifestacao, status e vinculos. O XML
da nova observacao fica no historico sem substituir o anterior. Chave ja vinculada
a outra empresa interrompe; nao e reatribuida silenciosamente.

Lock privado compartilhado com a consulta + GET_LOCK na conexao DEV. Indices
unicos e transacoes protegem tambem o banco. Cada documento/observacao/evento
e gravado numa unica transacao apos armazenar o XML. Lote e parcialmente
retomavel: se um item falha, anteriores permanecem e nao sao rebaixados/baixados
novamente na retomada. Perda de ACK de COMMIT e coberta pelos mesmos IDs.
Espera de60segundos entre tentativas que fazem NSDOCS, inclusive retomadas XML.

## XML e contrato do provedor

GET HTTPS fixo `/v2/documentos/:id/xml`, Bearer apenas para `api.nsdocs.com.br`,
sem redirect, PUT, POST, marcacao automatica como Importado, retry HTTP ou URL
recebida de documento. Envia `status` explicitamente igual ao observado na lista.

A [documentacao oficial v2](https://developer.nsdocs.com.br/) descreve `status`
como status de utilizacao no GET de XML, mas nao esclarece plenamente seu efeito
quando outro sistema altera esse indicador entre lista e download. Nao afirmar
que GET implica ausencia de efeitos remotos. Antes da captura real, confirmar com
a NSDOCS/homologar esse comportamento numa nota de teste; nao usar esta primeira
etapa para manifestacao fiscal nem alterar o utilizado de todas as notas.

Limites de2MiB por XML comprimido/descomprimido, UTF-8 estrito, timeout15s por
GET e180s por tentativa. Parser XML estrutural `saxes`5.0.1, declarado diretamente
(ja existia no lock por outra dependencia): recusa DTD/entidades externas, XML
malformado, documentos multiplos e campos ambiguos; confere namespace, modelo55,
DV/componentes da chave, emitente/destinatario, numero, data e valor em centavos.
Nao valida assinatura digital, XSD, autenticidade do emitente nem situacao atual
na SEFAZ. Guarda `identity_checked_signature_unverified` no snapshot; nao transforma
essa verificacao em aprovacao fiscal/financeira ou `validated`.

## Buckets fiscais separados

Usuario confirmou `fluxy-fiscal-dev` (preexistente) e `fluxy-fiscal-prod` (novo),
ambos em **us-east-2 (Ohio)**. Informou feita a etapa HTTPS/versionamentoDEV,
ainda nao conferida remotamente pelo agente. Nenhum bucket e alterado pela CLI.
Nao renomear/mover objetos existentes nem trocar storage de producao nesta etapa.

Configuracao publica exigida pela captura (referencia, nao colar no.env):

```dotenv
# Identificadores publicos; nao sao credenciais.
NSDOCS_DEV_S3_BUCKET=fluxy-fiscal-dev
NSDOCS_PROD_S3_BUCKET=fluxy-fiscal-prod
NSDOCS_DEV_S3_OWNER=992500432025
NSDOCS_DEV_S3_ROLE_ARN=arn:aws:iam::992500432025:role/FluxyNsdocsFiscalDev
FISCAL_S3_BUCKET=fluxy-fiscal-dev
FISCAL_S3_REGION=us-east-2
FISCAL_S3_PREFIX=dev
NSDOCS_V2_ENABLED=false
NSDOCS_V2_FIXTURES_ENABLED=false
```

O setup publica os quatro campos NSDOCS em capture-config.json privado, somente
para a CLI, usando `nsdocsDevSetup.js --configurar-storage`. Nao edita.env ouPM2.
Os campos FISCAL_S3_* da aplicacao precisam ja estar alinhados e sao conferidos
em modo leitura; divergencia interrompe antes de configurar/capturar. Seguir
[roteiro de atualizacao e setup](../../../ops/deploy/README-nsdocs-captura-dev-20261024.md).

Nomes/conta/role fixados para esta homologacao; bucket fiscalDEV deve coincidir
com o alvo. Sem fallback para bucket geral/producao. Dono esperado em todas as chamadas
S3, endpointHTTPS regional fixo, sem endpoint alternativo. Preflight confere:
regiao, quatro protecoes de acesso publico ativas, policy nao publica, ownership
BucketOwnerEnforced/ACLs desabilitadas e versionamentoEnabled. Novo bucket sem
policy pode retornar NoSuchBucketPolicy: preparar policy privada que negue HTTP
antes de homologar; nao remover o preflight para contornar essa falha.

STS executado pelo operador confirmou usuario `admin-jose` na conta992500432025
para as credenciais do arquivoDEV; nao comprova privilegios administrativos ou
uso pelos outros apps/processoPM2. A captura exige role `FluxyNsdocsFiscalDev`,
assumida por15min com politica de sessao restrita. Nao edita politicas/chaves
atuais do usuario, role da EC2 ou ambiente dos apps. FalhaSTS interrompe sem fallback
para a credencial original no S3. [Roteiro IAM dedicado](NSDOCS_V2_IAM_DEV.md).

IAM da role permite somente no DEV: `s3:GetBucketLocation`,
`s3:GetBucketPublicAccessBlock`, `s3:GetBucketPolicyStatus`,
`s3:GetBucketOwnershipControls`, `s3:GetBucketVersioning`; para objetos,
`s3:PutObject` e `s3:GetObject` em `dev/nsdocs/27123008000100/nfe/*`. Nao conceder escrita no bucket
fiscal de producao para o executorDEV. Nomes/guardas de aplicacao nao substituem IAM.
Sem permissao de DeleteObject ou alteracao de politica pela CLI. XML nao precisa
de acesso publico nem CORS de navegador nesta etapa administrativa.

Objetos `dev/nsdocs/<cnpj>/nfe/<chave>/<sha256>.xml`, AES256, checksumSHA256,
If-None-Match:* conforme [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).
Se ja existe, os bytes sao lidos e o hash conferido. Nunca sobrescreve; em caso
de falha DB apos PutObject, pode sobrar objeto privado sem referencia. A retomada
reutiliza o mesmo conteudo; nao ha limpeza automatica nem exclusao de evidencia.
Se XML mudar, novo hash preserva a versao anterior. Migração de bucket legado do
DEV tambem e uma etapa separada: mudar FISCAL_S3_BUCKET pode afetar anexos fiscais
ja existentes. Conferir antes de configurar, sem copiar/apagar nada implicitamente.

## Roteiro de homologacao posterior (nao executado)

1. Publicar somente na refactor/frontend quando solicitado e preparar operador
   DEV especifico. Nao reutilizar operador antigo: ele valida outro inventario.
2. Conferir buckets e criar/conferir role IAM fiscalDEV; confirmar semantica do statusXML com
   NSDOCS. Configurar os nomes/conta, sem colar chave no terminal/chat.
3. Conferir empresa fiscal/local por CNPJ; preparar/aplicar somente a nova
   migration no DEV em etapa propria com TLS dedicado. Nao executar migrate geral
   ou reiniciar backend antes de revisar pendencias e dependencias.
4. Executar QA ficticio e preflight da captura; nenhum GET NSDOCS no preflight.
5. Gerar um UUIDv4, guardar o identificador, capturar primeiro uma nota e conferir
   snapshot/XML/hash/historico/ACL; repetir o mesmo UUID, esperando zero NSDOCS.
6. Testar falha/retomada, outro UUID mesma nota, nota existente e outra empresa.
   Conferir que pedidos, titulos, baixas e autorizacoes nao mudaram.

Exemplos para depois da publicacao e preparacao, no backendDEV:

```bash
NODE_DEV=/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node
"$NODE_DEV" scripts/nsdocsDevCapture.js --preflight --empresa-id 2 --cnpj 27123008000100

# Criar uma vez e anotar; na retomada reutilizar EXATAMENTE o mesmo ID/filtros.
CAPTURA_NSDOCS_ID=$("$NODE_DEV" -e 'console.log(require("node:crypto").randomUUID())')
"$NODE_DEV" scripts/nsdocsDevCapture.js --capturar \
  --empresa-id 2 --cnpj 27123008000100 --captura-id "$CAPTURA_NSDOCS_ID" \
  --inicio 2026-10-18 --fim 2026-10-24 --status Pendente --quantidade 1 \
  --confirmar-chamada-real --confirmar-persistencia

"$NODE_DEV" scripts/nsdocsDevCapture.js --historico \
  --empresa-id 2 --cnpj 27123008000100 --captura-id "$CAPTURA_NSDOCS_ID"
```

Nao usar novo UUID para retomar item interrompido. `--historico` nao chama S3/NSDOCS
nem precisa carregar a chave. A CLI e administrativa por SSH; nao concede acesso
web nem altera as permissoes existentes. Vinculo com pedidos/titulos sera outra
etapa, sempre de acompanhamento, apos homologar esta captura.

## Validacao local

`npm run test:nsdocs-captura-dev`, `npm run test:nsdocs-manual-dev`,
`npm run test:nsdocs-v2`, QA do operador manual anterior e ACL financeira.
Banco SQLite real em memoria criado com a migration para testar unicidade,
FKs, transacoes/rollback e retomada. GET_LOCK, INFORMATION_SCHEMA e FOR UPDATE
adaptados no harness; nao equivalem a homologacao concorrente em MySQL/RDS.
S3/NSDOCS/segredos/processos sao ficticios; rede real bloqueada nos testes.
Nenhuma migration/aplicacao/instalacao externa foi executada nesta preparacao.
ComplementoIAM:24 testes captura,19 manuais,11 base e10 do operador anterior.
Inclui SDKSTS serializado com transporte simulado, sem rede/AWS reais.
Publicacao/setup adicionam9 casos de configuracao/migration e9 do novo operador.
