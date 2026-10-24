# Preparacao: NF-e nos pagamentos e Localizar pedidos em producao

Estado: candidato local sobre main `a860f94afc4de69499a169a8439a8e2297f507d5`,
homologacao de origem `2920e1f1ff17b681a77bd02128e67aee4021a955`.
Branch de preparacao: `codex/preparacao-nfe-pedidos-main-20261024`.
Nenhuma publicacao em main/Vercel, escrita AWS/RDS, configuracao real ou restart
foi executado nesta preparacao. O inventario PROD foi executado via SSH somente
em leitura; resultado abaixo. A configuracao do S3 PROD ainda esta pendente.

## Conteudo selecionado

- Consulta atual das NF-e vinculadas no dossie do proprietario, separada dos
  documentos da decisao assinada. Nao recalcula hashes, passkeys ou autorizacoes.
- NF-e como referencias virtuais nos arquivos da solicitacao na fila: nao copia
  XMLs/objetos, nao cria anexos duplicados e nao mistura comprovantes de baixa.
- URLs fiscais sob demanda, revalidando contexto, empresa/CNPJ, obra, titulo e
  vinculo ativo. XML como download; DANFE existente como visualizacao.
- Relatorio Localizar pedidos com filtros combinados, paginacao e CSV protegido
  contra formulas. Reutiliza permissoes de relatorios/pedidos e escopo de obras.
- Dependencia ausente em main: vinculos manuais NF-e/pedidos/titulos, com a mesma
  nota em varios pedidos/solicitacoes, revisao, idempotencia e historico.
- Migration exclusiva `202610240002_fiscal_vinculos_pedidos.js`: duas colunas
  nullable e indice unico composto em fiscal_document_links. Sem backfill.
- Correcao da data civil de emissao na consulta fiscal, preservando historico.
- Cliente S3 fiscal PROD com opt-in de AssumeRole dedicado, session policy
  limitada e falha sem fallback. Sem ativar essa configuracao no servidor.

Nao inclui captura/CLI NSDOCS do DEV, migration de capturas001, credenciais,
fixtures em runtime, ativacao automatica, bloqueios financeiros ou mudancas
na criacao/fechamento financeiro de pedidos. Os dados/XMLs do DEV nao sao copiados
para producao. A consulta exibira somente documentos efetivos de producao.

## Ordem de liberacao

1. Executar o inventario abaixo no estado atual, sem atualizar o checkout EC2.
2. Conferir storage anterior, empresa e identidade IAM efetiva de producao.
   Resolver pendencias do bucket/alvo e acesso fiscal dedicado antes da troca.
3. Confirmar backup recente conferido no Drive cifrado e timer ativo para esta
   promocao. Revisar o delta final e publicar SOMENTE o commit de backend em main.
   O commit de frontend e o catalogo gerado de navegacao permanecem retidos.
4. Na EC2, avancar por fast-forward para SHA de backend exato. Validar checkout,
   TLS/UUID, configuracao efetiva/arquivo, schemas anteriores e Nodes/dumps/peers.
   Rodar QA de backend; aplicar SOMENTE a migration002 pelo operador dedicado.
5. Reiniciar SOMENTE backend-solicitacoes pelo Node/CLI PM2 absolutos, com ambiente
   efetivo preservado. Nao usar --update-env. Conferir health e o Node24.22.1
   isolado, DEV/Experience/daemon/dumps/configuracoes e acesso S3 autorizado.
6. Receber a prova de backend/schema/storage pronto. So entao publicar o commit
   de frontend em main e liberar a Vercel, com testes funcionais de producao.

Os comandos finais de aplicacao/retorno e os SHAs remotos serao fechados depois
do inventario e da configuracao IAM/S3. Este roteiro nao autoriza um git pull
generico de toda refactor/frontend nem a publicacao simultanea das duas etapas.
Nao executar npm install, migrations genericas, pm2 save/update/resurrect/startup,
troca de Node global, reinicio do daemon, DEV ou Experience nesta promocao.

## S3 fiscal PROD: primeiro inventario, depois configuracao

### Retomada: role e HTTPS confirmados

Usuario informou role criada/HTTPS salvo e confirmou backup recente conferido no
Drive cifrado e timer ativo para esta implantacao. Nova conferencia SSH somente
leitura com `--conferir-role`: AssumeRole exato aprovado, GetBucketLocation e
ListObjectsV2 limitados a prod/ aprovados; sessao de auditoria permite somente
essas leituras, sem Put/GetObject. Politica HTTPS reconhecida, bucket nao publico,
BlockPublicAccess integral, BucketOwnerEnforced, versionamento e AES256 mantidos.
Sem alteracao de arquivos/DB/processos/dumps no servidor. Configuracao efetiva
ainda aponta fluxy-fiscal-dev. Zero referencias fiscais S3 nas colunas auditadas.
Teste de gravacao/leitura de objeto da nova role e corte de configuracao ainda
nao realizados. Nao confundir listagem aprovada com teste Get/Put concluido.

### Resultado real em24/10/2026 (leitura por SSH)

- `.env`/ambiente inicial sem divergencias nos campos verificados; PROD ainda
  aponta para `fluxy-fiscal-dev`, prefixo DEV. Nao foi alterado.
- Identidade AWS efetiva: `arn:aws:iam::992500432025:user/admin-jose`.
- `fluxy-fiscal-prod`: us-east-2, Block Public Access integral, BucketOwnerEnforced,
  versionamento Enabled e criptografia AES256. GetBucketPolicy/PolicyStatus
  retornam NoSuchBucketPolicy: falta a politica HTTPS.
- Zero referencias S3 em documentos, eventos, sync logs, lotes e certificados
  nas colunas verificadas. Nao foi realizada listagem/migracao de objetos.
- Cadastro fiscal1 do CNPJ27123008000100 esta ativo, empresa_id null. Empresa
  operacional correspondente em PROD: **id1**, ativa. Nao reutilizar id2 do DEV.
- Schema de vinculos002 ausente. Nenhuma migration aplicada.
- NSDOCS_V2_ENABLED desligado; FISCAL_SEFAZ_ENABLED ja estava true (nao mudar
  a flag nem executar sincronizacao como parte desta promocao).
- Processos/Nodes/ambientes/daemon/dumps iguais antes/depois, sem restart.

### Arquivos preparados para configuracao (ainda nao aplicados)

1. IAM > Funcoes > Criar funcao, nome **FluxyFiscalProd**, confianca personalizada
   com `ops/deploy/fiscal-prod-role-trust-20261024.json`. Nao criar instance
   profile nem anexar role a EC2. Se ja existir role com esse nome, inspecionar
   confianca/politicas antes de qualquer alteracao.
2. Adicionar na role uma politica em linha **FluxyFiscalProdS3Access**, usando
   `backend/src/modules/fiscal/services/fiscalProdS3Policy.json`. Escopo somente
   bucket PROD/prefixo prod, Get/Put/GetVersion, sem Delete/ACL.
3. S3 > fluxy-fiscal-prod > Permissoes > Politica do bucket: conferir novamente
   a ausencia de politica e aplicar `ops/deploy/fiscal-prod-bucket-https-20261024.json`.
   Caso outra politica ja exista, mesclar o Deny HTTPS preservando as regras;
   nunca substituir uma politica diferente sem revisao. Nao abrir CORS/publico.
4. A confianca nomeia diretamente o IAM user da mesma conta. Se for necessario
   um Allow de origem para AssumeRole, o arquivo
   `ops/deploy/fiscal-prod-source-assume-20261024.json` limita a role exata.
   Nao remover/alterar politicas usadas pelos outros modulos para isso.
5. Depois de publicar SOMENTE backend, configurar no arquivo privado do PROD
   apenas as quatro chaves abaixo, com snapshot privado e roteiro de retorno.
   Sao nomes/ARNs publicos; nao sao novas access keys. Nao configurar no DEV.

```dotenv
FISCAL_S3_BUCKET=fluxy-fiscal-prod
FISCAL_S3_REGION=us-east-2
FISCAL_S3_PREFIX=prod
FISCAL_S3_ROLE_ARN=arn:aws:iam::992500432025:role/FluxyFiscalProd
```

O codigo novo so usa a role quando FISCAL_S3_ROLE_ARN esta presente e exige
contexto/caminho PROD, porta8000, bucket/regiao/prefixo/role exatos. Credenciais
temporarias nao sao escritas em env/Git/dumps; falha STS nao usa credencial de
origem no S3. Session policy restringe a permissao mesmo se a role for ampliada.
AssumeRole tem sessao1h e refresh com minimo15min para URLs de ate900s.
Demais clientes AWS continuam com suas configuracoes existentes. Essa separacao
do cliente fiscal nao revoga a credencial administrativa original de outros
modulos; a reducao global dessas permissoes exige tarefa propria.

Declaracao direta de `@aws-sdk/nested-clients`3.996.12 usa a mesma versao ja
transitiva no lock principal; nenhum pacote foi instalado/atualizado. Conferir
essa versao instalada na EC2 antes da aplicacao; nao instalar automaticamente
se houver divergencia. API usada: AssumeRoleCommand, disponivel nessa versao.
Referencia oficial: [AssumeRole/SessionPolicy](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html),
[negar HTTP em S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-bucket-policies.html).

O vinculo de cadastro fiscal1 com empresa operacional1 precisa ser conferido e
feito pela interface/API fiscal com permissao, preservando os demais campos.
Nao fazer UPDATE/backfill embutido na migration estrutural.

Bucket informado pelo usuario: `fluxy-fiscal-prod`, regiao `us-east-2`, conta
esperada `992500432025`. Nunca apontar PROD para `fluxy-fiscal-dev`, nunca anexar
a role `FluxyNsdocsFiscalDev` a producao/EC2 e nunca substituir credenciais AWS
globais compartilhadas para resolver o fiscal.

O modelo atual guarda chaves, sem bucket por documento. Se houver referencias
em outro storage, a troca de FISCAL_S3_BUCKET pode quebrar XML/DANFE, eventos,
logs, lotes contabilistas e certificados. O inventario conta essas referencias
sem imprimir chaves/XMLs. Contagem diferente de zero exige reconciliacao por
origem e verificacao de integridade antes de qualquer corte. Nada sera copiado,
apagado ou sobrescrito automaticamente.

O inventario tambem consulta STS GetCallerIdentity e somente metadados de
seguranca do bucket: regiao, bloqueio publico, PolicyStatus, Object Ownership,
versionamento, criptografia e reconhecimento da politica padrao de negar HTTP.
AccessDenied significa **nao conferido**. Nao comprova Put/Get de objetos,
permissoes minimas efetivas, isolamento IAM ou conclusao da configuracao.

A AWS recomenda Block Public Access e ACLs desabilitadas:
[boas praticas S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html),
[Object Ownership](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html).
Para isolamento por role, a sessao e limitada pelas permissoes da role e pela
session policy; adicionar uma Allow estreita a um usuario administrador nao
reduz as outras permissoes desse usuario:
[limites da sessao AssumeRole](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_control-access_assumerole.html).

Depois da revisao: aplicar role/politica/trust preparados usando o principal PROD real,
restringir bucket/prefixo fiscal de producao, sem DeleteObject/ACL publica, e
configurar somente o cliente fiscal do backend PROD. Nao reutilizar uma chave
administrativa como solucao final. Configuracoes/segredos entram em arquivo
privado no servidor; nao em chat, Git, frontend, comando com segredo ou URL.
Uma gravacao de teste controlada, se necessaria, sera uma etapa explicita
posterior, com chave de teste exclusiva e verificacao de hash; nao esta neste
inventario. Com SSE-KMS, conferir tambem key policy/KMS antes de gravar.

## Inventario somente leitura (CMD do Windows)

Usar o arquivo local preparado; nao precisa pull, copia para EC2 ou AWS CLI.
Conferir primeiro seu SHA256 com o hash informado na resposta desta etapa.

```bat
cd /d "C:\Users\Ricardo\.codex\worktrees\retirada-envios-main-20261024\Fluxy"
certutil -hashfile "ops\deploy\conferir-fiscal-s3-producao-20261024.cjs" SHA256
ssh -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-main/backend && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node -" < "ops\deploy\conferir-fiscal-s3-producao-20261024.cjs"
echo Codigo de saida: %ERRORLEVEL%
```

Enviar somente a saida sanitizada. O script exige usuario ubuntu, caminho PROD,
Node/daemon24.22.1 e tres processos conhecidos; usa ambiente inicial da app e
.env sem exibir valores. Nao usa perfil/credential_process/IMDS/AssumeRole caso
nao haja origem estatica compativel com o cliente atual. Banco por TLS/CA e UUID
PROD, transacao de leitura com rollback. Nenhum script da app e carregado.

## Migration e retorno

### Operador da etapa de backend

`ops/deploy/atualizar-prod-nfe-pedidos-20261024.cjs` possui quatro comandos:

- `preparar SHA_COMPLETO_BACKEND`: exige origin/main no SHA informado, delta
  sem frontend/raiz, hashes dos33 arquivos de backend, unica migration002,
  apenas a declaracao direta do SDK ja transitivo, codigo limpo, Node/daemon
  absolutos e tres processos conferidos. Aceita HEAD PROD3f3c5e8f ou basea860f94a.
  Confere versao instalada do SDK3.996.12; nao instala nada. Guarda snapshot privado
  de fontes/ambiente em .git/fluxy-nfe-prod-20261024 (diretorio700/estado600).
  Nao avanca checkout, aplica schema ou reinicia. Enviar a saida antes de aplicar.
- `aplicar`: exige snapshot intacto e as quatro confirmacoes ja descritas;
  timer ativo, remoto/checkout exatos, ff-only, QA, schema/UUID/TLS e somente002,
  depois reinicia APENAS backend-solicitacoes pelo Node do daemon e CLI absolutos,
  sem --update-env. Confere cinco healths estaveis, ambiente e politica do processo,
  DEV/Experience/daemon/Nodes/env/dumps. Imprime NFE_PEDIDOS_BACKEND_PROD_PRONTO.
- `conferir`: nao reinicia; verifica a fase, HEAD/fontes quando pronto e estado
  protegido. Nao libera frontend nem declara storage configurado.
- `voltar`: retorno exclusivo do codigo desta etapa, ANTES do corte do storage.
  Exige as confirmacoes PROD_BACKUP/PROD_BACKUP_TIMER/PROD_MAINTENANCE e timer.
  Restaura somente as fontes anteriores capturadas, recusa arquivos editados por
  terceiros, mantem HEAD e deixa tracked alterado esperado. Reinicia so PROD.
  Nao faz reset/clean/revert generico, down, exclusao de dados/ledger ou troca de
  env/storage. Se002 nao foi registrada, guarda o arquivo pendente fora do runtime
  em .git para o codigo antigo iniciar, sem apagar DDL parcial. Se foi registrada,
  mantem migration e schema. Novos arquivos restantes ficam versionados/inertes.
  Depois do retorno, enviar a saida para reconciliar Git; nao rodar pull/reset.

Os comandos podem ser enviados por stdin via SSH com o Node PROD isolado,
partindo do diretorio raiz /home/ubuntu/sistema-gestao-solicitacoes-main. A resposta
de liberacao deve fornecer o SHA exato e o SHA256 do operador; nao usar HEAD ou
tip de refactor/frontend. O aplicar recebe confirmacoes apenas no ambiente do
operador/filho de schema; nenhuma confirmacao entra na app PM2.

Nao reutilizar o retorno de codigo depois de mudar .env/storage; a verificacao
de ambiente recusa essa mudanca. O corte S3 requer seu proprio snapshot/retorno
e teste privado autorizado. O frontend continua retido apos esta etapa.

`backend/scripts/fiscalVinculosProdSchema.js` esta preparado para `--conferir`
e `--aplicar`, sem runner generico ou dependencia NSDOCS. O aplicar exige as
confirmacoes PROD_BACKUP, PROD_BACKUP_TIMER, PROD_MAINTENANCE e
FISCAL_VINCULOS_PROD_SCHEMA, todas com prefixo CONFIRM_ e valor SIM, alem do timer
ativo e verificadores PROD anteriores. Nao executar ainda: integrar ao operador
de release depois da conferencia S3 e da publicacao do backend isolado.

Preserva schema/historico em retorno de codigo: nao executar down/drop002.
Se o DDL falhar parcialmente, manter frontend retido; o operador reconhece
somente forma parcial compativel e registra ledger so depois da forma completa.
O retorno de codigo/backend e o retorno de storage/configuracao precisam de
snapshots privados e verificacao dos arquivos ja gravados. Nao restaurar dump
PM2 inteiro nem configuracao do DEV para voltar somente o backend PROD.

## Homologacao e limites

QA funcional local com fixtures SQLite e rede externa bloqueada: dossie/fila/links
assinados sob demanda, permissoes negativas, compartilhamento/renegociacao,
baixas parciais/hashes intactos, retry/idempotencia e vinculos multi-pedidos,
filtros/paginacao/CSV/mobile, data de emissao/historico, auditoria de permissoes
e build frontend. QA do operador/inventario usa simuladores. Separadamente, o
inventario acima foi executado no PROD com AWS/RDS somente leitura.
Nao comprova locks ou DDL do MySQL real, acesso IAM/S3 real ou deploy na EC2.

Depois da liberacao: vincular NF-e real de PROD a pedidos apropriados; conferir
uma nota em varios pedidos/solicitacoes, dossie de autorizador nominal, fila e
XML/DANFE. Conferir usuario sem acesso/obra fora de escopo, historico, baixas
parciais e autorizacao biometrica habitual unica. No relatorio: descricao,
SOL/SC/PC/numero externo, fornecedor/CNPJ, item, obra, status, datas e valores.
