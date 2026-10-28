# Precisão de compras — atualização exclusiva DEV

Base de integração: refactor/frontend `15a8be97`. Publicar somente o delta de precisão, com quantidade disponível/ofertada, paginação, reabertura e RH atuais preservados. Sem promoção para main.

## O que o operador faz

`precisao-compras-dev-20261028.cjs --backend COMMIT` verifica a versão e o manifesto, instala apenas arquivos permitidos no checkout DEV existente, executa QA sem rede, aplica somente a migration `202610270010_compras_precisao_unitarios.js`, confere o resultado e reinicia somente `backend-dev`, uma vez. `--conferir COMMIT` verifica o resultado sem reaplicar ou reiniciar.

A estrutura muda em duas colunas: `pedido_compra_itens.preco_unitario` e `solicitacao_compra_alocacoes.preco_unitario`, de DECIMAL(14,2) para DECIMAL(22,10). Mesma capacidade inteira, mais precisão fracionária. Existe apenas o registro técnico nomeado em schema_migrations; nenhum UPDATE/INSERT/DELETE de negócio, backfill, recálculo de pedido, geração de título ou baixa. O PC-00299 e suas relações não são consultados nem ajustados por este operador.

Confirme backup recente do banco DEV antes de executar. DDL MySQL tem commit implícito: se apenas uma coluna for ampliada e houver falha, o estado é parcial; a retomada confere as colunas, não tenta desfazer descartando casas. Outras migrations pendentes ou tipos/defaults inesperados bloqueiam a execução. Não execute o runner geral de migrations.

## Guardas

- Caminho `/home/ubuntu/sistema-gestao-solicitacoes-dev`, branch refactor/frontend; Node DEV isolado24.22.1; porta8001, host/UUID do banco staging e TLS verificados.
- PROD, Experience, daemon PM2, limites de heap, ambientes, arquivos .env, dumps e unidade systemd preservados. Sem save/update/resurrect/update-env do PM2.
- Manifesto fecha os arquivos do backend; frontend não é copiado ao servidor. O frontend da branch segue o pipeline habitual da Vercel. Homologar o novo fluxo depois do backend pronto.
- HEAD/index Git e arquivos fora da lista são preservados. Não usar git pull/reset/clean para contornar diferenças: atualizações anteriores de DEV usam arquivos isolados.
- Backup privado de código e estado em `/home/ubuntu/.config/fluxy-precisao-compras-dev-20261028`. Repetição verifica o estado e não duplica o restart. Resultado incerto exige conferência; não remover locks nem reiniciar manualmente para forçar.

## Comandos (somente pelo operador)

O chat fornece o hash completo do commit publicado. Já conectado à EC2, entre no checkout DEV, confira o backup e use:

```bash
git fetch origin refactor/frontend
FLUXY_ALVO=HASH_COMPLETO_FORNECIDO_NO_CHAT
git show "$FLUXY_ALVO:ops/deploy/precisao-compras-dev-20261028.cjs" |
  CONFIRM_DEV_BACKUP=SIM CONFIRM_COMPRAS_PRECISAO_DEV_SCHEMA=SIM \
  /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node - --backend "$FLUXY_ALVO"

/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node \
  ops/deploy/precisao-compras-dev-20261028.cjs --conferir "$FLUXY_ALVO"
```

Esperado: `COMPRAS_PRECISAO_BACKEND_DEV_PRONTO`, `somente_ampliacao_precisao:true`, `business_data_writes:0`, `financial_data_writes:0`, processo de produção e heap preservados. Enviar apenas os JSONs e códigos sanitizados, não PM2 env/jlist ou chaves.

O agente não executou nenhum desses comandos na EC2. Testes locais do schema usam Sequelize/query generator e adaptadores simulados, sem conexão MySQL real. A migração real permanece uma ação do operador.
