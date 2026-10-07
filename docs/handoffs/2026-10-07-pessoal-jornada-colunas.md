# Simplificacao das colunas de envio da jornada

A grade Lancamento por colaborador na aba Enviar jornada de Pessoal nao
exibe mais a base salarial ou diaria, o seletor Pagamento com empreitada,
Servico executado ou Valor empreitada. As instrucoes e os rotulos dos anexos
passaram a se referir a jornada, sem orientar o preenchimento removido.

## Arquivos alterados

- `frontend/src/pages/RhDpJornada.jsx`
- `frontend/scripts/validarRhJornadaColunas.mjs`
- Registro proprio em `docs/workspace/OWNERSHIP_ATIVO.md` e este handoff.

## Regras preservadas

Novas linhas continuam usando o regime NORMAL. Hidratacao, validacoes e
payload mantem regime, servico e valor de empreitadas legadas para nao
converter ou apagar dados financeiros em reenvios autorizados. Historico de
jornadas enviadas, apuracao, calculos e geracao de titulos nao foram alterados.
O modelo Excel e a importacao permanecem inalterados; este ajuste se limita
ao formulario de envio. A interface gerencial V2 ja nao possui essas colunas.

A permissao `rh_dp.solicitacoes.abrir`, autorizacao do DP para correcao,
limites de dias, ajustes com observacao, PIX, anexos e endpoint POST
`/rh/jornada` permanecem iguais. Protecoes de envio simultaneo e
idempotencia das etapas 40/60 tambem permanecem iguais.

## Validacoes

`node frontend/scripts/validarRhJornadaColunas.mjs` passou: ausencia das
quatro colunas, envio NORMAL, preservacao de empreitada legada no reenvio,
limites, exigencia de observacao nos ajustes, permissao e duplo clique.
Navegador local com pagina e tabela reais e servicos simulados em temas
claro/escuro e largura de 390 px. Capturas em `outputs/rh-jornada-colunas/`.
`npm run build` em frontend passou com avisos anteriores de Browserslist
e chunks maiores que 500 kB. `git diff --check` passou.

## Publicacao e proximo passo

Somente frontend, sem migration, dependencia ou variavel nova. Nenhum
banco real, EC2, deploy, commit ou push foi executado nesta etapa.
Publicar apenas mediante autorizacao do usuario. Preservar a correcao
pendente de Novo mes, as auditorias locais e outputs; nao incluir auditorias
ou capturas no commit deste ajuste. Apos o deploy Vercel, conferir o envio
com usuario da Obra e a visualizacao de jornadas antigas pelo DP.
