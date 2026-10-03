# Handoff - transformacao de dev-v2 para Fluxy-V4

Data: 2026-08-29

## Objetivo

Preparar a Fluxy-V4 para substituir o codigo da `dev-v2`, preservando correcoes especificas da base atual e sem transportar ou alterar `.env`, banco, S3 ou arquivos dos ambientes.

## Resultado

- a Fluxy-V4 permanece como snapshot fonte; nenhum merge de historicos foi feito;
- nenhuma conexao com GitHub, EC2, banco de `dev-v2`/`main` ou S3 remoto foi realizada;
- nenhum `.env` foi criado, alterado ou copiado;
- o bootstrap deixou de aplicar migrations automaticamente;
- o bootstrap agora reprova schema incompatível usando somente consultas;
- `npm run migrate` exige dupla autorizacao e aceita somente migrations estruturais;
- foi criado `npm run preflight:schema`, que apenas le `information_schema` e `schema_migrations`;
- a comparacao estatica encontrou zero nova variavel obrigatoria para o snapshot atual;
- o procedimento completo e as proibicoes estao em `docs/deploy/TRANSFORMACAO_DEV_V2_PARA_V4.md`.

## Correcoes preservadas da dev-v2

- commit fonte `147ce7b4`: frete da Compra Direta somado ao valor total e atribuido corretamente ao fornecedor principal quando embutido;
- utilitario de auditoria de apropriacoes e documentacao do DDA;
- paginas legais estaticas preparadas para publicacao; o metadado Git aninhado que ja existe localmente permanece fora do escopo do repositorio pai e nao pode ser transportado no pacote;
- `.gitignore` e `.gitattributes` conciliados preservando exclusoes de segredo, certificado, uploads e evidencias.

## Arquivos desta sessao

- `.gitignore`
- `backend/package.json`
- `backend/server.js`
- `backend/src/database/runMigrations.js`
- `backend/migrations/202608260056_status_pedido_aditivo_geo.js`
- `backend/migrations/202608270053_despesa_eventual.js`
- `backend/scripts/verificarSchemaSomenteLeitura.js`
- `backend/scripts/validarCompraDiretaFrete.js`
- `backend/scripts/exportarAuditoriaApropriacoes.js`
- `backend/src/controllers/SolicitacaoCompraController.js`
- `frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx`
- `frontend/src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompra.jsx`
- `docs/arquitetura/backend.md`
- `docs/arquitetura/visao_geral.md`
- `docs/contexto/estado-producao.md`
- `docs/deploy/TRANSFORMACAO_DEV_V2_PARA_V4.md`
- `docs/modulos/compras/README.md`
- `docs/modulos/financeiro_dda_bb.md`
- `legal-pages/`

O worktree ja continha muitas alteracoes de outras sessoes. Nenhuma delas foi descartada, reordenada ou commitada por este trabalho.
O diretorio local `legal-pages/.git/` ja existia e nao foi removido por ser metadado potencialmente recuperavel; ele esta ignorado e deve ser excluido de qualquer copia ou pacote de deploy.

## Validacoes executadas

- `node --check` nos arquivos backend alterados: aprovado;
- `npm run test:compra-direta-frete`: aprovado e sem escrita em banco;
- delta do commit `147ce7b4` conferido por reverse apply: aprovado;
- `npm run preflight:schema` no banco local: aprovado, 0 pendencias, somente leitura;
- `npm run migrate` sem flag: bloqueado com `SCHEMA_MIGRATIONS_NOT_AUTHORIZED` antes de escrever;
- as 38 migrations exclusivas da V4 foram auditadas; as duas que continham cadastro funcional foram convertidas para estrutura/no-op e ficaram sem DML;
- guarda testada com DDL permitido e `INSERT`, `UPDATE`, `DELETE` e `TRUNCATE` bloqueados;
- `npm run migrate` com autorizacao transitoria e zero pendencias: aprovado, sem alteracao de dados;
- `npm run build` no frontend: aprovado, 372 modulos transformados;
- `git diff --check` no escopo: aprovado.

## Banco e S3

Os valores `DB_*`, `AWS_*` e `FISCAL_S3_*` nao foram lidos nem alterados neste trabalho. A verificacao de nomes mostrou que os recursos novos funcionam com fallback seguro e nao exigem inclusao de variavel no `.env` atual.

O codigo preserva as automacoes e integracoes normais que ja existiam na `dev-v2` (por exemplo CRM, retencao de eventos, snapshots e webhooks). A barreira criada aqui permite DDL estrutural e impede seed, backfill ou correcao automatica de dados; ela nao redefine regras normais do produto acionadas pela interface ou por integracoes ja habilitadas no proprio ambiente.

## Bloqueio operacional

O schema real de `dev-v2` e de `main` nao foi consultado. O snapshot so pode ser iniciado depois que as migrations estruturais pendentes forem aplicadas pelo runner protegido e o preflight retornar zero. Seed, backfill e cadastro funcional permanecem proibidos em migrations.

## Revisao final antes do push

- o commit local `07dda5ae` da `dev-v2` nao foi enviado ao remoto e deve ser substituido pelo
  snapshot revisado;
- removido `backend/scripts/seedContratoFluxoNovo.js`, que inseria e atualizava cadastros;
- removido `backend/scripts/limparContratosDuplicados.js`, que possuia modo de exclusao;
- criado `backend/scripts/auditarContratosDuplicados.js`, estritamente de leitura;
- a migration do indice unico agora orienta auditoria de leitura e correcao pela interface de
  Gestao de Contratos;
- `Tipos (Macro)` passou a expor a opcao `Usar fluxo novo de contratos`, permitindo configurar
  o cadastro funcional pela interface;
- removido o temporario Word `docs/modulos/solicitacoes/~$UXOS_INICIAIS_OBRA.docx` e adicionada
  protecao `~$*.docx` ao `.gitignore`;
- removidas da documentacao as instrucoes de seed, limpeza e backfill por script;
- os registros legados das novas colunas anulaveis permanecem nulos ate uma operacao futura
  confirmada pelo usuario na interface.

Validacoes desta revisao: documentacao aprovada, build do frontend aprovado com 372 modulos,
responsividade aprovada, zero referencias aos scripts removidos e zero padroes de mutacao de
dados no auditor de duplicados.

## Correcao durante o deploy da dev-v2

- o snapshot `0a0f6e51` foi publicado em `dev-v2`, preservando o `.env` do servidor byte a byte;
- o preflight encontrou 38 migrations estruturais pendentes e a auditoria encontrou zero contratos
  duplicados;
- antes das migrations foi criado um dump `--no-data` privado da estrutura do banco de
  desenvolvimento;
- a primeira migration parou sem ser registrada porque o MySQL Linux possui a tabela fisica
  `Obras`, enquanto a migration referenciava `obras`;
- `202608160050_obra_tipo_apropriacao_padrao.js` e
  `202608270055_recarga_cartao_fluxo.js` passaram a resolver `Obras`/`obras` dinamicamente pelo
  `information_schema`, como as migrations historicas do projeto;
- o processo `backend-dev` permanece parado ate a publicacao da correcao, nova auditoria e conclusao
  das migrations; `backend-solicitacoes` nao foi interrompido.

## Proximo passo exato

1. publicar em `dev-v2` a correcao de capitalizacao das duas migrations;
2. atualizar o clone da EC2 sem iniciar o processo;
3. repetir a auditoria estatica das 38 migrations;
4. aplicar somente as pendencias estruturais com `ALLOW_SCHEMA_MIGRATIONS=true npm run migrate`;
5. repetir o preflight e exigir zero pendencias;
6. iniciar apenas `backend-dev`, configurar `PED. ADITIVO` e `Despesa Eventual` pela interface e homologar;
7. repetir em `main` preservando o `.env` de producao e reiniciando apenas `backend-solicitacoes`.
