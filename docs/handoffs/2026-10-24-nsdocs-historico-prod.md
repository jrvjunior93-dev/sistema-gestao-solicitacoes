# Carga historica manual PROD e retirada SEFAZ da UI

Pedido: preparar/testar dados/XMLs NSDOCS, duplicidade/historico, automatico OFF,
sem bloqueios financeiros, DEV intacto; remover consulta SEFAZ do frontend.
Agente unico, branch codex/nsdocs-historico-prod-20261024, base0b20cc4d.

## Implementacao local

- Nova CLI nsdocsProdCapture, namespace nsdocsHistorical isolado da fonte DEV.
  BaseDEV2920e1f1 reutilizada via Git, sem modificar aquela branch/checkout.
- Runtime PROD/main/ubuntu1000/Node24.22.1/RDS+UUID+CA/TLS, empresa1/CNPJ27123.
  Flags automaticas OFF inclusive arquivo.env, sem NodeOptions/TLS inseguro.
- Credencial privada PROD600/diretorio700, prompt TTY oculto, sem argv/env/browser.
  Nao carregada em consulta de historico/plano. Chave nao foi configurada.
- NF-e modelo55, filtros emissao/recebimento, status explicito Pendente/Importado;
  GETs HTTPS fixos sem redirect/retry, XML observa mesmo status da lista e exige
  confirmacao da semantica remota. Documentacao oficialv2 conferida nesta tarefa.
- Unicidade por acesso, observacao por captura/chave, historico transacional,
  locks privado+MySQL, mesmo UUID/hash retoma/replay. Canonico existente intocado.
- Plano privado duravel, janelas31dias inclusivas+ambosstatus, max5docs/lote,
  1..10 lotes por comando e cooldown60s. Paginas ganham IDs antes da chamada;
  falha de progresso apos DBcommit retoma mesmo ID; particao2000 para/nao conclui.
- S3 somenteprod/nsdocs/CNPJ/nfe, FluxyFiscalProd existente/sessionName correto
  da trust ja aplicada. Session policy menor, sem fallback original ou Delete.
  Preparada politica SUPLEMENTAR de quatro leituras de seguranca do bucket,
  ainda nao aplicada. Nao substituir politica existente/trust/HTTPS.
- Migration202610240003_fiscal_nsdocs_historico cria3tabelas fiscais/indices/FKs,
  sem DML; verifica estrutura/InnoDB/unicidade antes do ledger, down bloqueado.
  saxes5.0.1 apenas declarado direto, ja transitivo/instalado local, sem npm install.
- FrontendLogs somente leitura; Diagnostics sem fixture/preflight/configSEFAZ,
  storage/crypto/dados/ultimo log mantidos. Empresas mostra ambiente legado
  somente leitura, Dashboard NSDOCSmanual, filtros incluemNSDOCS e SEFAZlegado.
  Removidos3exportsHTTP de consultaSEFAZ; rotas/ACL/backendSEFAZ preservados.
  Menu logs renomeadoHistóricoFiscal, mesmo id/rota/can; catalogo gerado atualizado.
- Validador fiscal permite origem nsdocs_v2_manual na lista/relatorio e recusa
  origem arbitraria. Exige restart controlado so PROD apos schema e antes da UI;
  a CLI administrativa em si nao precisa reiniciar o backend. Demais rotas/ACL
  e fontes financeiras permanecem iguais a base0b20cc4d.
- Roteiro detalhado ops/deploy/README-nsdocs-historico-prod-20261024.md.
- Inventario separado backend/frontend em nsdocs-historico-prod-20261024.manifest.json,
  QA de hashes/imutabilidade de ACL/vinculos/S3/trust/dependencias e retirada UI.

## Validacoes

- Captura24, guardas14 (inclui trust/filtro), plano6:44 testes finais aprovados,
  rede externa bloqueada,
  SQLite real e adaptadores MySQL/S3/NSDOCS. Reexecutar conjunto final via npm.
- UI real desktop/mobile aprovada: sem acoesSEFAZ, historico/payload assinado,
  probe storage e falha de permissao. Data fiscal/lista/detalhe/historico/XML em
  America/Sao_Paulo/UTC/Kiritimati aprovados. Build14s/654modulos; avisos usuais
  caniuse/chunk>500KB, sem atualizar dependencias.
- Backend regressao vinculos10 + documentosPagamento8, ACL estorno e auditoria
  granular --check (0chavesinvalidas/duplicadas). Baixas/hashes/biometria preservados.
- Inventario4 testes aprovados: backend/frontend disjuntos, hashes, dependencias
  sem upgrade e fontes de permissoes/vinculos/S3/trust/financeiro byte a byte iguais
  a base. UI sem exportsHTTP SEFAZ e historico legado disponivel.
- Limites: nao houve RDS/MySQL/S3/STS/NSDOCS reais nesta preparacao; assinatura/XSD
  XML nao sao validados. Revisar semantica statusXML, agendador SEFAZ preexistente
  e autenticacao/IAM efetivos antes de executar carga real.

## Estado e proximo passo

### Backend, schema, chave e preflight PROD conferidos; piloto pendente

- Usuario retornou NSDOCS_CREDENCIAL_PROD_GUARDADA/CONFERIDA, empresa1/CNPJ27123,
  pending[]/appliedtrue, automaticoOFF e external_nsdocs_calls0. Retornou tambem
  NSDOCS_CAPTURA_PROD_PREFLIGHT_OK, sem persistencia e sem NSDOCS.
- Conferencia SSH do agente SOMENTE leitura com aplicador: phasebackend_pronto,
  HEAD/backend0b1909293720731d99990bb3b55a96433b6cfd15, frontend_liberadofalse,
  storage_alteradofalse, processos_nodes_dumps_preservadostrue. Nenhum restart,
  configuracao, chamada API externa ou gravacao de documento nesta retomada.
- Frontend candidato996c9e691c2da67009bf70c04629061dc1770db0 ja commitado e testado,
  ainda local/retido. Mainremota0b190929 e DEV2920e1f1 conferidos iguais ao esperado.
- Preparar comando de piloto para o usuario: uma pagina/ate1NF-e emitida em
  2026-10-16, statusPendente, deslocamento0; mesma data da NF-e homologada no DEV,
  sem assumir qual nota vira primeiro na ordenacao do provedor.
- ID fixo exclusivo deste piloto:bfabb75c-71e6-4eea-94b8-8d74d114cc7d. Gerado
  localmente; ainda nao usado na NSDOCS/banco. Nao trocar ID/filtros na retomada.
  Primeiro comando faz ate2GETsNSDOCS e persiste NF-e/XML/historico se houverNF-e;
  historico nao chama provedor e replay concluido deve mostrar replayedtrue/0calls.
- Receber resultado com documents1/xmls1 e replaytrue antes de liberar UI. Se
  vier0documentos ou unsupported, diagnosticar sem anunciar captura homologada
  nem disparar Importado automaticamente. Nao iniciar plano historico inteiro.
- Proximo apos piloto: push frontend sobre mainbackend exato, conferir Vercel e
  artefatos/health; homologar lista/detalhe/XML/historico. Periodo historico real
  ainda precisa ser definido pelo usuario antes de salvar/executar plano.

### Publicacao backend concluida; aguardando execucao pelo usuario

- Push main confirmado:0b1909293720731d99990bb3b55a96433b6cfd15, apenas29 arquivos
  backend+8 metadados, sem frontend/catalogo no commit. Hashes do proprio objeto
  Git conferidos pelo validador real do aplicador antes do push. Sem force.
- SHA256 aplicador:daa72208c4f001e3330454c4f1dccfae532d757c733c981a3fe89e344cc4f577.
- Branch backend codex/nsdocs-historico-prod-20261024 fica no SHA publicado.
  Nova branch codex/nsdocs-historico-frontend-20261024 reserva commit separado
  dos11 arquivos frontend/catalogo, com fonte/build/UI ja aprovados. Nao publicar
  essa etapa antes da prova backend/schema/chave/preflight fornecida pelo usuario.
- Aplicador5QA + inventario4 aprovados; modoBackendOnly8pass/1skip (skip da UI
  retida esperado na EC2). O QA completo da UI/inventario foi aprovado localmente.
- Usuario executara preparar com SHAexato, depois aplicar+conferir, quatroflags
  e janela. Migra exclusivamente003 e reinicia somentePROD/Nodeisolado24.22.1.
  Nao aciona NSDOCS/S3/IAM/chave. Agente nao executou nenhuma mutacao na EC2.
- IAM: politica adicional de quatro leituras no bucketPROD, na roleFluxyFiscalProd,
  sem substituir as politicas/trust atuais. Nova chaveNSDOCS exclusivaPROD/CNPJ27
  configurada viaSSHinterativo/promptoculto, seguida conferir/preflight(0NSDOCS).
- Proximo: receber saidas sanitizadas antes de liberar frontend/piloto e carga.
  DEV2920e1f1 preservado; nenhum push nessa branch ou reinicio de seus processos.

Retomada: usuario autorizou commit/push main e comandos de atualizacao/migration/
chave, backend antes de frontend, DEV preservado. Backup recente cifrado/timer
confirmados explicitamente para esta implantacao. Remotos conferidos main0b20cc4d
e DEV2920e1f1. Nenhuma operacao real na EC2 pelo agente.

Novo aplicador atualizar-prod-nsdocs-historico-20261024.cjs/test5 aprovado.
Prepara snapshot privado, aplica SHA/backend29hashes e migration003 por canal
dedicado, QA e restartunico do PROD; confere peers/Nodes/env/dumps/unit/dropin.
Aceita HEADb5e34d7b ou0b20cc4d, exigindo backend anterior igual (exclui apenas
catalogo frontend ja publicado em0b). Nao muda env/storage/chave ou faz NSDOCS.
Retorno seletivo de codigo preserva ledger/dados; migration semledger fica fora
do runtime para nao ser aplicada por startup. Semforce/reset/clean/pull apos retorno.
Conferir aposbackend pronto tambem valida schema/flags/configstorage por leitura.

Commitar/publicar APENAS backend+ops/docs primeiro, frontend/catalago separado
localmente. BackendOnly do QA inventario deixa frontend retido sem falsofail.
Depois passar preparar/aplicar ao usuario com SHA/hash exatos e quatro flags;
explicar IAMpolitica suplementar, nova chavePROD em prompt oculto e preflight.
Receber provas antes do frontend/piloto/carga real. Nao publicar ambos de uma vez.

### Estado anterior da preparacao

Somente alteracoes locais, sem commit/push/deploy/restart/schema/chave/carga real.
Nao pedir backup para preparar codigo; para implantacao posterior exigir prova
atual backup/timer e etapas especificas. Nenhum novo bloqueio/endpoint/agenda.
DEV/Experience/PM2/Nodes preservados por ausencia de operacoes nestes ambientes.

Implementacao/QA/inventario concluidos localmente. Se autorizar publicacao: commitar
e separar backend antes do frontend. Preparar operador de arquivos e retorno
com hashes deste pacote; nao reutilizar antigos operadores de outros hashes.
Depois schema/IAM/leitura preflight/chave PROD/piloto1nota e replay; so depois
frontend, periodo historico real e plano. Nao executar exemplos do README ainda.
Nao incluir outputs/ (copia referenciaDEV e evidencias locais) no Git.
