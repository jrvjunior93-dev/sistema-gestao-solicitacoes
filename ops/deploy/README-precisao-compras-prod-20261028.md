# Precisão decimal de compras — somente produção

Promoção isolada do pacote DEV a35a2139 sobre a main d6e3cc1e. Sem merge geral de refactor/frontend. Regras de quantidade/reabertura já existentes na main preservadas; correções independentes da dev não foram promovidas.

## Escopo

- Unitários com até10casas decimais, como na resposta do fornecedor; API/edição/modelos/PDF alinhados. Cálculo decimal exato, HALF_UP do total e rateio determinístico dos centavos residuais.
- Migration única `202610270010_compras_precisao_unitarios.js`: amplia `preco_unitario` em pedido_compra_itens e solicitacao_compra_alocacoes, de DECIMAL(14,2) para DECIMAL(22,10). Mantém a capacidade inteira e os valores históricos. Não recupera preços antigos ou recalcula pedidos.
- Nenhum ajuste PC-00299, criação/alteração de títulos ou baixas; nenhuma gravação de negócio. Somente DDL nomeado e registro técnico no ledger de migrations.

## Operação exclusiva do usuário

Já conectado à EC2, no diretório `/home/ubuntu/sistema-gestao-solicitacoes-main`, usar o commit completo fornecido no chat:

1. Conferir backup PROD recente, timer fluxy-prod-db-backup.timer ativo e janela de manutenção.
2. Fetch origin main. Executar o operador do commit por stdin com `preparar COMMIT`. Essa fase confere a versão, processos, flags, fontes e planos e cria backup privado de código; não altera schema nem reinicia.
3. Executar o mesmo operador por stdin com `aplicar COMMIT`, informando `CONFIRM_PROD_BACKUP=SIM`, `CONFIRM_PROD_BACKUP_TIMER=SIM`, `CONFIRM_PROD_MAINTENANCE=SIM`, `CONFIRM_COMPRAS_PRECISAO_PROD_SCHEMA=SIM`.
4. Rodar o operador instalado `ops/deploy/precisao-compras-prod-20261028.cjs conferir COMMIT`.

Node exclusivo: `/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node`. Resultado esperado: `COMPRAS_PRECISAO_BACKEND_PROD_PRONTO`, fase aplicado, heap4096, somente_ampliacao_precisao e DEV/Experience/daemon/ambientes/dumps preservados, business_data_writes0 e financial_data_writes0.

## Proteções e retomada

Checksum e inventário por bytes Git; main/caminho/Node24.22.1/porta8000/endpoint/UUID PROD/TLS conferidos. Backend das bases anteriores revisadas deve ser idêntico; alterações tracked, outras migrations pendentes, schema inesperado ou ambiente divergente bloqueiam.

Somente um merge fast-forward para a revisão fixada e um restart backend-solicitacoes. Sem PM2 save/update/resurrect/update-env, alteração do heap, processos DEV/Experience ou .env. Planos/histórico/XMLs e automático NSDOCS OFF preservados; captura ativa bloqueia em vez de matar executor.

DDL MySQL tem commit implícito. Ampliação parcial exige retomada validada; não existe rollback automático que reduza precisão. Estado fica em `.git/fluxy-precisao-compras-prod-20261028`. Falha/resposta perdida de restart exige conferir, não reenviar restart manualmente nem apagar estado/locks.

O agente não acessou EC2/banco/S3 ou executou estes comandos. QAs e schema foram testados com fixtures/adaptadores locais e rede bloqueada; o MySQL real será conferido pelo operador antes da ampliação. Frontend usa o pipeline normal da main; homologar após backend pronto, com dados próprios de teste.
