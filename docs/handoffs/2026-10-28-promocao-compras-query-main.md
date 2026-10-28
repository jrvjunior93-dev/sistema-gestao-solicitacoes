# Promocao MAIN do validador de Compras - 28/10/2026

## Escopo e autorizacao

Usuario confirmou DEV funcionando e autorizou migrar para main e entregar
codigos EC2. Origem homologada6a1ebe6cfd52485ec1078975cd32274c9c95932b.
Branch de integracao codex/compras-query-main-20261028 criada sobre main
ece109c93f62268bb3f4108d658e9a817bff80f5, sem reset ou merge amplo de DEV.
Transpostos somente o patch validateCompraQuery e o novo teste da rota.
Alteracoes DEV de reabertura/PIX/fiscal nao incluidas nem removidas do DEV.
Nenhum acesso EC2, SQL externo, operacao financeira, migration ou reinicio
pelo agente. Pacotes antigos permanecem fechados e inalterados.

## Problema e preservacao

O middleware da rota rejeitava page/limit/q/status antes de index. Agora
valida e normaliza com parseQuery ja existente. Busca/status sem pagina
entram em consulta limitada; campos desconhecidos ou parametros invalidos
sao recusados400 antes do SQL. Delegacao e contrato legado preservados.
Controllers, servico SQL, paginas frontend e dependencias nao mudam.
Mantidos filtros/ACL antes de COUNT/LIMIT/OFFSET, pagina50/max100, contagens
dos IDs da pagina, colecoes separadas e detalhes sob demanda. Nenhum retorno
a consulta cartesiana ou carga completa como alternativa para erro.

## Operador de producao

Novos aplicador/teste/manifesto/README compras-query-prod-20261028.
Base/parent ece109c9; HEAD produtivo ceaf8da7 tambem aceito porque difere da
base apenas em frontend, ja publicado anteriormente na Vercel. O aplicador
confere igualdade do backend antes de preparar. Nova entrega sem alteracao
frontend; runtime unico operationalValidators.js e QA de paginacao.
Inventario fechado inclui docs e scripts, com hashes novos/antigos.

Prepara backup privado de codigo e fotografia de processos/planos; nao faz
dump ou restauracao de banco. Execucao depende de confirmacao de backup
recente conferido, timer ativo e janela de manutencao. Operador executa
preparar SHA, depois aplicar e conferir. Flags CONFIRM_PROD_BACKUP=SIM,
CONFIRM_PROD_BACKUP_TIMER=SIM, CONFIRM_PROD_MAINTENANCE=SIM e
CONFIRM_COMPRAS_QUERY_PROD=SIM. Um restart exclusivo backend-solicitacoes;
heap4096, DEV/Experience/Nodes/ambientes/daemon/dumps preservados.
Planos e historico fiscal verificados por hash; captura ativa bloqueia deploy.
Automatico NSDOCS continua OFF. Sem banco/S3/migration/install/update-env.

## Validacoes e proximo passo

Seis QAs backend PASS sob semRedeQa: paginacao (8casos), performance,
colecoes separadas, Compra Direta GEO, acesso entregas, envio cotacao.
Teste de rota captura registro real/validateRequest/validateCompraQuery e
controller real em SQLite :memory:, com auth/escopo de entrada por stubs;
comparacoes de ACL do controller e SQL MySQL gerado nos demais casos.
Treze testes do novo aplicador PASS: snapshots PM2/proc, heap4096/titulo
reescrito, inventario, parent, preservacao dos pares, retomada e proibicoes.
Sintaxe/diff, docs e manifesto pelos objetos Git conferidos antes do push.
Nao requer novo build frontend porque nenhum arquivo frontend mudou.

Publicar somente main; usuario executa manualmente a EC2 e envia
COMPRAS_QUERY_BACKEND_PROD_PRONTO. Depois recarregar lista de SC em producao
e conferir pagina2/busca/obra/status/detalhe sem escrita real. Se interromper,
preservar estado/locks e informar codigo; nao repetir reinicios ou restaurar
banco/env/dumps por conta propria. Estado privado em
.git/fluxy-compras-query-prod-20261028. Reversao exige roteiro especifico.
