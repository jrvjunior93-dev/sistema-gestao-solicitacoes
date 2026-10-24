# Corte isolado do S3 fiscal PROD

Precondicao recebida: backend/migration002 b5e34d7bb12fab45a81f5f2927c6bd15dfa0cbe2
prontos e conferidos na EC2. Usuario confirmou backup/Drive cifrado e timer ativo
nesta implantacao. Frontend ec948e5b ainda retido.

O operador `configurar-fiscal-s3-prod-20261024.cjs` roda por stdin a partir deste
checkout local; nao precisa push/pull ou copia para a EC2. O backend ja possui
o cliente de role necessario. Exige checkout EC2 main exatamente em b5e34d7b,
fontes do manifesto intactas, Node PROD24.22.1 e PM2 daemon24.22.1/6.0.14.

## Escopo e preservacao

Somente quatro variaveis fiscais do backend-solicitacoes:

```dotenv
FISCAL_S3_BUCKET=fluxy-fiscal-prod
FISCAL_S3_REGION=us-east-2
FISCAL_S3_PREFIX=prod
FISCAL_S3_ROLE_ARN=arn:aws:iam::992500432025:role/FluxyFiscalProd
```

Atualiza essas chaves no .env PROD, no ambiente PM2 vivo e na entrada PROD dos
dois dumps. Preserva demais variaveis/credenciais, entradas DEV/Experience,
interpretadores, Nodes globais/isolados, daemon, unidade/drop-in systemd e fontes.
Nao faz pm2 save/update/resurrect/startup/update-env, npm, migration, cadastro,
chamada NSDOCS/SEFAZ, alteracao de IAM/bucket policy, CORS/publico ou frontend.

RPC direto ao socket PM2 existente, sem importar/iniciar a API PM2. Somente
stopProcessId do id PROD e restartProcessId desse mesmo id, com current_conf.env
igual ao ambiente anterior e quatro chaves novas. Confere Node/politicas, demais
variaveis, peers e arquivos antes/depois; modo PID0 somente para recuperar PROD.
Startup conferido: unidade ativa/enabled, MainPID, Node24/resurrect e apenas o
drop-in autorizado 30-fluxy-node24.conf, root644 e conteudo exato. Nao modifica
essa unidade/drop-in ou reinicia o daemon.
Os modos com estado compartilham o lock do operador de backend, alem do lock
proprio; as fontes do manifesto sao reconferidas em cada snapshot. Um deploy ou
retorno de codigo nao pode correr em paralelo com o corte de storage.

## Etapas

1. `diagnosticar`: somente leitura; TLS/CA/UUID PROD, schema002, contagem de
   referencias fiscais e prefixos, AssumeRole, metadados de seguranca do bucket
   e List prod/. Simula candidatos de .env/dumps em memoria. Nao grava objeto,
   arquivo, estado ou lock. Ja executado com sucesso pelo agente.
2. `preparar`: mesma conferencia, exige zero referencias S3 antes do corte;
   salva originais e candidatos apenas em .git/fluxy-fiscal-s3-prod-20261024,
   diretorio700/estado600. .env, dumps ativos e processos ainda intactos.
   Nao enviar o estado privado; ele contem backups de ambiente/credenciais.
3. `aplicar`: exige CONFIRM_PROD_BACKUP, CONFIRM_PROD_BACKUP_TIMER,
   CONFIRM_PROD_MAINTENANCE e CONFIRM_FISCAL_S3_PROD, todos SIM; confere timer.
   Revalida role/storage, para apenas PROD, confirma parada, confere novamente
   zero referencias no banco e escreve dump primario, backup e .env candidatos
   atomicamente, todos600. Detecta alteracao concorrente antes do rename.
   Reinicia somente PROD com patch das quatro chaves, confere cinco healths
   estaveis e role/DB/storage. Em replay ativo nao reinicia novamente.
4. `testar-storage`: exige fase ativo e CONFIRM_FISCAL_S3_PROD_TEST_WRITE=SIM.
   Usa texto ficticio pequeno, sem nota/empresa/dado financeiro real, em
   prod/_homologacao/UUID/probe.txt. Get antes de Put; Put com IfNoneMatch=*,
   SSE-S3/metadatahash; Get versionado e URL assinada de180s pelo helper real do
   backend, download HTTPS sem redirect e SHA256 conferido. Nao exibe URL/token.
   Repeticao reaproveita o mesmo objeto, sem nova versao. Objeto fica para
   auditoria: role nao tem DeleteObject. Nenhum registro de negocio e criado.
5. `conferir`: somente leitura; fase/candidatos privados, .env/dumps600, quatro
   campos efetivos, startup/Nodes/peers e role/storage. Mostra teste de objeto
   realizado quando houver. Nao faz reboot; persistencia e verificada nos dumps
   e no resurrect enabled, sem simular uma reinicializacao do servidor.

Todos os comandos partem da raiz /home/ubuntu/sistema-gestao-solicitacoes-main
com /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - ACAO recebendo
o arquivo local por stdin. Os comandos exatos/SHA256 sao fornecidos por etapa;
nao fazer git pull para obter este operador. As confirmacoes do operador nao
entram no ambiente da app nem no .env.

Put condicional segue a [documentacao S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).
URLs assinadas sao credenciais temporarias e nao entram na saida/estado:
[orientacao AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/presigned-url-best-practices/logging-interactions.html).

## Retorno seguro

`voltar` exige as mesmas quatro confirmacoes/timer e estado/peers intactos.
Suspende somente o storage fiscal: FISCAL_S3_BUCKET fica vazio, regiao/prefixo/role
permanecem PROD. Atualiza apenas os mesmos quatro campos e reinicia so PROD.
Mantem documentos, XMLs, objetos/teste, banco, historico e demais funcionalidades.

NAO restaura o bucketDEV antigo em producao. Os originais ficam privados para
auditoria; nunca importar dump inteiro nem reativar acesso DEV como retorno.
Falha STS nao impede esta suspensao; nao ha fallback para credencial global.
Depois de suspender, envio/leitura de arquivos fiscais ficam indisponiveis ate
uma nova configuracao revisada. Nao existe bloqueio financeiro novo.

Nao usar o retorno/conferir do operador anterior de backend depois deste corte:
o .env/dumps mudaram intencionalmente e aquele snapshot deve recusar a mudanca.
Usar o novo conferir. Se algo falhar no meio, nao apagar lock/estado ou editar
arquivos para contornar: enviar a saida sanitizada e diagnosticar/reconciliar.

## Prova atual e pendencias

Diagnostico real somente leitura: role/bucket aprovados, referencias0,
schema conferido, candidatos validos, peers/Nodes/env/dumps preservados;
live_target_config=false e state_exists=false. Nenhum corte ou teste real de
objeto foi executado pelo agente. Evidencia em outputs/preflight-corte-s3-prod-20261024.txt.

QA local10 testes: patch .env/dumps, RPC restrito, preparo sem mutacoes de app,
aplicar/persistir/replay, conflitos/refencias/backup/STS, suspensao sem bucketDEV,
objeto condicional/versionado, URL/hash/host, segredo omitido. FS/PM2/AWS/DB/HTTP
simulados; apenas o diagnostico acima consultou infraestrutura real.

Depois da prova ativo+teste: conferir/vincular cadastro fiscalPROD1 a empresa
operacionalPROD1 pela API/interface fiscal com permissao (DEV era id2), preservando
os outros campos. Depois liberar o frontend e homologar NF-e/pedidos/titulos/
autorizacao/fila e Localizar pedidos. Nao promover capturas NSDOCS DEV nem copiar
documentos XML do DEV para producao nesta etapa.
