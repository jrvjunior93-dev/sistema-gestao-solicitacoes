# Publicacao captura NSDOCS DEV

Usuario informou roleFluxyNsdocsFiscalDev/politicaemlinha criada e autorizou
explicitamente commit/push refactor/frontend. Nao autoriza deploy pelo agente.
Agente unico neste worktree, base0b9f209b13254d5da89499fc7cd91f3faef8c99f;
manter main,EC2,AWS,Node/PM2,env,credenciais e banco reais intactos.

Pacote: captura/IAM preparados e testados; agora setupCLI privado,migrationDEV
dedicada e operador de arquivos semrestart. Arquivos constam no CHANGESET do
operador atualizar-dev-nsdocs-captura-20261024.cjs; ownership misturado e scripts
Node/outputs/deltas antigos ficam fora do commit. Comparar stagedcommanifesto.

Setup grava apenas identificadores em capture-config.json privado600,sem.env.
Exige storage fiscal existente alinhado e empresaFiscalCompany ativa vinculada
a empresa2/CNPJ27123008000100. Primeira etapa somente confere e relata; nao
contornar divergencias. Role/S3 sao lidos em etapa separada, sem escrita deobjeto.
Migration executa somente202610240001,com confirmacoes backupDEV/schema,TLS/UUID
e lock, sem migrategeral/ALLOW_SCHEMA global. Nao reinicia apps. Novo schema
pendente no checkout pode bloquear futurorestart ate aplicar a etapa de migration.

Roteiro completo em ops/deploy/README-nsdocs-captura-dev-20261024.md, etapa1 com
SHApublicado e parada para enviar diagnostico antes de configurar/aplicarDDL.
Captura real exige homologar statusGETXMLNSDOCS, usar1nota e preservarUUID;
nao colocar comandos de captura real na mesma etapa do deploy/migration.

Testes locais aprovados: captura24,setup9,manual19,base11,operador9 (72), mais
10 do operador anterior e financeiroACL. DDLMySQL normalizado pelo dialect e
verificado no guard estrutural, incluindo clausulasON DELETE dasFKs; DML/DROP
continuam bloqueados. Sintaxe/inventario/package/lock conferidos antes do commit.
Sem npm install: saxes5.0.1 e nested-clients3.996.12 ja existiam no lock;
somente declaracoes diretas e scriptsQA adicionados. Sem frontend/flags novas.

Estado de publicacao sera registrado na conversa com SHA/verificacao remota;
nenhum SHAautorreferente inserido no arquivo deste commit.
