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
