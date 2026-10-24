# Handoff: captura manual persistente NSDOCS DEV

## Autorizacao e estado

Usuario autorizou preparar/testar captura manual DEV com NF-e, historico e XML,
duplicidade protegida, automaticoOFF, sem bloqueios financeiros/producao. Deseja
separar buckets fiscais DEV/PROD; confirmou fluxy-fiscal-dev (antigo) e
fluxy-fiscal-prod (novo), ambos us-east-2. Relatou feita etapaHTTPS/versionamento
DEV, ainda sem conferencia remota pelo agente.
Agente unico, sem delegacao. Nenhuma chamada real/EC2/DB/S3/chave real acessada.
Nenhuma migration/instalacao/reinicio/commit/push executado nesta etapa.

Worktree atual: promocao-financeiro-20261019/Fluxy; branch local
codex/retirada-envios-dev-20261023, base0b9f209b13254d5da89499fc7cd91f3faef8c99f.
Destino de futura publicacao autorizada pelo usuario sera refactor/frontend;
main e producao nao foram alteradas. Nao trocar para checkout antigo.

## Arquivos deste delta

- Nova migration202610240001_fiscal_nsdocs_capturas.js: capturas, eventos e
  observacoes/FKs/unique, sem seed/backfill, down destrutivo bloqueado.
- nsdocs/manual/capture.js, repository.js, storage.js, xml.js: guardas DEV,
  retomada, transacoes, canonicalizacao conservadora, XML privado/hash e preflight.
- nsdocs/manual/runtime.js: canal de escrita manual separado, liberado somente
  apos conferirTLS/UUID no modoREAD ONLY. Consulta anterior continua readonly.
- nsdocs/manual/query.js: extracao de normalizacao compartilhada, sem persistir
  a consulta original. transport.js: GET XML de destino fixo/limitado, sem PUT.
- backend/scripts/nsdocsDevCapture.js: preflight/capturar/historico separados,
  UUID explicito e confirmacao de chamada/gravar. Max5documentos,31dias.
- backend/scripts/validarNsdocsCapturaDev.js:24 casos ficticios comSQLite real,
  isolamentoIAM e serializacao real doSDKSTS com transporte simulado.
- nsdocs/manual/iam.js e iam-dev-policy/trust.json: role dedicada15min com
  session policy restrita ao bucket/prefixoCNPJDEV; sem fallback para origem.
- validarNsdocsManualDev.js: mocks atualizados, verifica tambem que escrita fica
  inacessivel comTLS/UUIDerrados; construtor mysql2 real continua coberto semsocket.
- package/lock: QA e declaracao direta saxes5.0.1, ja presente no lock transitivo.
  ComplementoIAM declara tambem @aws-sdk/nested-clients3.996.12 ja instalado e
  no lock, subpathSTS validado com cliente real/transporte simulado. Sem nova
  resolucao ou download de dependencia. Role/policies em roteiroIAM dedicado.
  Nao houve npm install ou resolucao de novas versoes.
- fiscalValidators: origem nsdocs_v2_manual aceita como filtro de consulta.
  Sem novas permissoes, rotas, UI ou alteracoes financeiras.
- docs/modulos/fiscal/README.md e NSDOCS_V2_CAPTURA_MANUAL_DEV.md: roteiro e limites.
- Ownership: apenas secao desta tarefa. Preservar deltas misturados anteriores.

## Validacoes executadas

-24 testes capturaDEV: schema criado pelo up emSQLite real em memoria,
  DDLMySQL pelo geradorSequelize semsocket, FKs/unique/rollback, retomada parcial,
  commitACK perdido, lote concluido semAPI, conflito deempresa/filtros, XMLvalido/
  hostil/DV/dados, segredos/UTF8/compactacao, bucketprivado e conditionalPut.
-19 testes consulta manualDEV,11 baseNSDOCS,10 operador manual anterior aprovados.
- validarFilaEstornoPermissao.js, validarFiscalDfeProcessor.js e auditoria de
  permissoes --check aprovados; zero chavesinvalidas/duplicadas/frontend-only.
- SintaxeJS e git diff --check aprovados. Total64 testes nas quatro baterias,
  mais as verificacoes complementares. Rede bloqueada nos testesNSDOCS.
- SQLite adapta GET_LOCK/INFORMATION_SCHEMA/FOR UPDATE; nao equivale a teste de
  concorrencia real MySQL. S3/NSDOCS sao doubles, nao homologacao do servico.

## Proximo passo exato e riscos

Complemento apos revisao IAM: usuario forneceu politica FluxyFiscalDevS3Access
anexada a admin-jose (ListBucket/GetObject/PutObject/GetObjectVersion noDEV todo).
Preservar documento/vinculo; faltam5 leituras do preflight. Roteiro atualizado
para roleFluxyNsdocsFiscalDev com mesma politica restrita testada, mas em linha,
sem criar outra politica gerenciada ou herdar a abrangencia da antiga. Somente
documentacao mudou nesta revisao; nao repetir QA de implementacao sem necessidade.

1. Quando usuario solicitar, revisar delta e preparar commit/push exclusivo em
   refactor/frontend. Nao incluir scriptsNode/outputs/handoffs antigos nem o
   ownership inteiro, que ja estava sujo antes desta tarefa.
2. Criar e conferir bucket fiscalDEV privado/us-east-2 separado dePROD, conta
   esperada/IAMprefixoDEV,4PublicAccessBlocks, policy privadaTLS, ownershipEnforced,
   versionamento. Nao mudar bucket/config deproducao. Nomes ja informados;
   criar roleFluxyNsdocsFiscalDev conforme NSDOCS_V2_IAM_DEV.md. Usuario confirmou
   STS da credencial do arquivoDEV como admin-jose/992500432025; nao inferir
   privilegios ou alterar seus acessos/keys/instanceprofile. Provider exige role,
   sem credencial original nos pedidosS3 da captura. Nao gerar nova accesskey.
3. Verificar documentos fiscais ja existentes antes de trocar FISCAL_S3_BUCKET
   noDEV: referencias anteriores usam o bucket global do modulo. Nao migrar/
   apagar objetos implicitamente. A captura exige alinhamento explicito do bucket.
4. Confirmar comNSDOCS/homologar num documento de teste a semantica do status em
   GET XML. O codigo envia estado observado(Pendente/Importado), nao usaPUT nem
   marca tudoImportado; a documentacao v2 nao esclarece concorrencia desseindicador.
5. Preparar operadorDEV novo para este inventario e a nova migration comTLS
   dedicado; nao reutilizar operador antigo nem executar migrategeral/PM2global.
   Conferir cadastroFiscalCompany ativo,mesmoCNPJ eempresa_id2 antes daAPI.
6. RodarQA/preflight, capturar1nota comUUIDanotado e repetiromesmoID, conferindo
   snapshot/XML/hash/historico e ausencia de mudancas financeiras/automaticas.
   Chave existente nao precisa ser colada novamente; nunca requisitar seu valor.

XML tem identidade/estrutura conferidas, nao assinatura/XSD/estadoSEFAZ. Nao
marca documento como validado nem habilita modulo. Nota existente nao e alterada;
nova observacao preserva o XML novo sem substituir cadastro/vinculos anteriores.
S3 eDBnao sao transacao unica: objeto privado pode sobrar apos falhaSQL; a
retomada reutiliza hash, sem excluir evidencia automaticamente. Cada item
concluido fica duravel; lote interrompido deve retomar mesmoUUID/filtros/destino.
ConsultaCLI anterior e automaticoOFF preservados. Deploy/realcapture pendentes.
