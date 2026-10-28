# Promocao MAIN RH: privacidade e transferencias

## Pedido e base

Usuario autorizou migrar o pacote RH homologado para main e entregar comandos
manuais EC2 PROD. Sem acesso EC2 pelo agente. Origem DEV15a8be97, alteracoes
funcionais f5f47ecb/0b89f480. Base main2d6af625aff47f1592ae52d2448b9dc86a3c9c7e.
Integracao em codex/rh-privacidade-main-20261028, derivada da main, com patch
seletivo. Sem merge amplo/reset/force. Main hotfixes preservados.

## Escopo promovido

12 runtime RH, migration202610280001_rh_privacidade_obra.js, QAs pertinentes e
6 arquivos frontend RH/QA. Permissoes/auditoria e salario restrito projetado no
backend; obra informa percentuais/ajustes sem base/bruto/liquido/totais. DP ve
valores completos; acesso expressamente autorizado Financeiro continua intacto.
Obra edita apenas observacoes/documentos proprios, com escopo e upload idempotente.
Ativos podem transferir com datas divergentes, preservando historico e evidencia;
pagamento ja preparado permanece na obra da solicitacao. Sem mover valores antigos.

Routes.js integrado preservando diferencas fiscais da main; outros11 runtime RH
identicos aos homologados. Nao promover conectores/migration fiscal DEV, schemas
DEV, dependencias ou pendencias anteriores de Compras/favorecidos/totais.

## Estado EC2 incerto da atualizacao anterior

Usuario respondeu nao ter certeza se concluiu aplicar/conferir compras-query.
Pacote aceita apenas main2d6af625 ou ece109c9/ceaf8da7, cujos backends diferem
exclusivamente pelo validador paginado e QA ja revisados. Reconhece conteudo
original por hash a partir do HEAD revisado, sem presumir instalacao concluida.
Inclui esses2 arquivos no inventario, mesmo se ja atualizados; estados/backups
anteriores sao preservados. Base diferente ou tracked local alterado interrompe.
Git ff mantem a cadeia2d6af625 e suas correcoes OOM/paginacao.

## Pacote PROD

Novo runner/QA rhPrivacidadeObraProdSchema.js e novo aplicador/teste/manifesto/
README rh-privacidade-prod-20261028. Runtime13 incluindo validador Compras;
schema e somente3 colunas/2 indices aditivos, sem DML de negocio/backfill/down.
UUID/TLS/Node/cwd/branch/endpoint e timer PROD obrigatorios; banco DEV bloqueado.
Canal dedicado, lock, tipos/default/indices e ledger conferidos, repeticao idempotente.
DDL MySQL pode ter commit implicito; nao prometer rollback de estrutura parcial.

Aplicador preparar so verifica codigo/processos/flags/planos e faz backup privado.
Aplicar exige backup/timer/manutencao/schema confirmados, executa QA sem rede,
schema nomeado e um restart exclusivo backend-solicitacoes, preservando4096,
DEV/Experience/daemon/env/dumps/planos/XMLs/automatico OFF. Captura ativa bloqueia,
sem matar executor. Restart incerto nao e reenviado automaticamente.

## Validacao

18 suites RH/ACL/pagamentos/Compras/financeiro com rede bloqueada PASS, incluindo
transferencias --transferencias; schema com Sequelize MySQL real/DB simulado.
UI RH real1366/390 PASS e build frontend12.70s PASS (avisos preexistentes).
15 testes do aplicador e7 de schema PASS, incluindo snapshot PM2/proc completo,
heap4096 e ambas as bases revisadas de Compras. Inventario por bytes Git,
sintaxe/diff/documentacao PASS (655 Markdown e19 canonicos). Capturas da UI
inspecionadas. Nenhuma migration ou operacao real executada.

## Ordem e proximo passo

Backend/schema em primeiro commit publicado na main; frontend em commit local
posterior ate operador enviar RH_PRIVACIDADE_BACKEND_PROD_PRONTO de aplicar e
conferir. Publicacao frontend ja esta autorizada apos essa evidencia; nao pedir
nova autorizacao. Nao tocar DEV/refactor/frontend nem EC2. Homologar sigilo,
percentuais/ajustes, documentos, Financeiro autorizado e transferencias/pagamentos.
