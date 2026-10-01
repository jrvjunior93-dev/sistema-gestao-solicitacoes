# Transformacao historica para Fluxy-V4

> Processo concluido e mantido como evidencia. A promocao vigente usa
> `../arquitetura/promocao_refactor_frontend_para_main.md`; nao repita a substituicao
> de snapshots descrita aqui em `main`.

## Objetivo

Substituir o codigo da `dev-v2` pelo snapshot validado da Fluxy-V4, sem merge de historicos e sem transportar configuracoes, arquivos ou dados do ambiente local.

## Limites obrigatorios

- o `.env` existente de cada ambiente e a fonte de verdade e nao pode ser sobrescrito;
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`/`DB_PASS` e `DB_NAME` permanecem exatamente os do ambiente de destino;
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` e as configuracoes `FISCAL_S3_*` permanecem exatamente as do ambiente de destino;
- nao copiar `.env`, dumps, bancos, `backend/uploads/`, credenciais, chaves, certificados, caches ou arquivos locais da Fluxy-V4;
- aplicar somente migrations estruturais; nao executar seed, QA transacional, correcao de dados, importacao, limpeza, backfill ou script de carga;
- dados e arquivos dos ambientes somente podem ser criados ou alterados pelas operacoes normais autorizadas na interface do sistema;
- `backend-dev` e `backend-solicitacoes` continuam sendo processos distintos. Nunca reiniciar o processo do outro ambiente.

## Banco de dados

O bootstrap do backend executa `assertMigrationsUpToDate()`. Essa verificacao consulta `information_schema` e `schema_migrations`, mas nao cria tabela, nao aplica migration e nao grava resultado.

Se `schema_migrations` nao existir ou houver migration pendente, o bootstrap encerra antes de abrir a porta. A aplicacao e feita em etapa explicita do deploy:

1. `npm run preflight:schema` identifica a pendencia sem escrever;
2. o operador confere que os arquivos pendentes alteram somente estrutura;
3. `ALLOW_SCHEMA_MIGRATIONS=true npm run migrate` aplica as migrations estruturais;
4. o runner faz uma segunda verificacao estatica e em runtime e bloqueia `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `MERGE`, `TRUNCATE`, `LOAD DATA`, `CREATE TABLE AS SELECT` e metodos de mutacao de dados do Sequelize;
5. o preflight e repetido e deve retornar zero pendencias antes de iniciar o backend.

O registro do nome em `schema_migrations` e metadado tecnico indispensavel do executor e nao e cadastro de negocio. `ALLOW_SCHEMA_MIGRATIONS` deve ser fornecida somente ao processo do comando de migration; nao deve ser gravada no `.env` de `dev-v2` ou `main`.

Os dois cadastros que antes eram inseridos por migrations foram retirados delas. Depois de iniciar a aplicacao, o SUPERADMIN deve configurar pela interface:

- status `PED. ADITIVO`, setor `GEO`/Gerencia de Processos, ativo;
- tipo `Despesa Eventual`, codigo interno `DESPESA_EVENTUAL`, campos e declaracoes do fluxo;
- subtipos `Serviço Eventual`, `Apoio Operacional`, `Frete / Transporte` e `Serviço Técnico Especializado`.

## Variaveis de ambiente

A comparacao estatica entre a `dev-v2` e a Fluxy-V4 encontrou zero nova variavel obrigatoria para iniciar o sistema. As variaveis adicionais encontradas no codigo possuem fallback seguro:

- `CNPJ_LOOKUP_URL` e `CNPJ_LOOKUP_TIMEOUT_MS`: integracao opcional, desligada quando a URL esta vazia;
- `MFA_POLICY_ENABLED`: opcional, com MFA exigido por padrao;
- `UPLOAD_DOCUMENTACAO_JURIDICA_MAX_MB` e `UPLOAD_NEGOCIACAO_MAX_MB`: opcionais, com limite padrao de 20 MB;
- `ALLOW_SCHEMA_MIGRATIONS`: trava operacional transitoria; deve ficar ausente do `.env` e ser definida apenas no comando autorizado de migration.

Portanto, nao e necessario alterar o `.env` para receber o snapshot atual. Se futuramente uma funcionalidade exigir nova variavel, adicionar somente a chave necessaria ao `.env` ja existente, com valor especifico do ambiente, sem substituir ou copiar o arquivo inteiro.

## S3 e arquivos

O codigo usa as credenciais e buckets informados no `.env` do processo. A substituicao do codigo nao move objetos entre buckets, nao sincroniza uploads e nao altera chaves S3. Somente os arquivos publicos de `legal-pages/` podem integrar o snapshot; o diretorio local `legal-pages/.git/` deve ser excluido de qualquer pacote ou copia.

## Sequencia segura

1. gerar um inventario do estado atual de `dev-v2` sem exibir valores secretos;
2. preservar o `.env`, configuracao PM2, certificados e arquivos do ambiente fora da substituicao do codigo;
3. publicar o snapshot da Fluxy-V4 sem `.env`, dumps, uploads e artefatos ignorados;
4. instalar dependencias e compilar o frontend, operacoes que nao escrevem no banco;
5. executar `npm run preflight:schema` no backend; o comando e somente leitura;
6. se houver pendencias, revisar os arquivos e executar `ALLOW_SCHEMA_MIGRATIONS=true npm run migrate`; o runner bloqueia operacoes de dados;
7. repetir `npm run preflight:schema` e exigir zero pendencias;
8. iniciar somente `backend-dev`, concluir os cadastros funcionais pela interface e validar health check, login, leitura de anexos e presign no S3 da `dev-v2`;
9. promover o mesmo snapshot para `main` somente depois da homologacao, repetindo a preservacao do `.env` e usando somente `backend-solicitacoes`.

## Proibicoes de deploy

- nao executar migration que contenha DML, seed, backfill ou cadastro funcional;
- nao manter `ALLOW_SCHEMA_MIGRATIONS=true` no `.env` ou no processo PM2;
- nao executar comandos `test:*` que escrevam no banco compartilhado;
- nao executar scripts de `scripts/` para correcao, limpeza, importacao ou carga;
- nao copiar o banco local nem apontar `dev-v2`/`main` para ele;
- nao copiar bucket, prefixo ou credencial S3 de outro ambiente;
- nao usar `sequelize.sync`, `alter` ou bootstrap legado para contornar o preflight.

O snapshot deve ser gerado por `git archive`, que respeita os `export-ignore` de `.gitattributes`.
Assim, `qa/`, `.env`, uploads, `node_modules`, `dist`, modelos DOCX locais, scripts de dados e
copias `.orig` nao entram no pacote destinado a `dev-v2` ou `main`.
