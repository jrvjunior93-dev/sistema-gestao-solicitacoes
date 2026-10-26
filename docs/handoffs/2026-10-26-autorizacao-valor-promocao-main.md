# Promocao da autorizacao parcial para main

Pedido: promover pendencias da refactor/frontend e fornecer comandos EC2, preservando producao/DEV, permissoes, biometria, baixas parciais e captura NSDOCS pausada.

Worktree: `outputs/worktree-autorizacao-valor-main`, branch `codex/autorizacao-valor-main-20261026`, base main920f639c. Origem seletiva fc369151/ba7393ab/ed211fab. Nenhum merge amplo entre ambientes: preservados os arquivos de S3/NSDOCS e retirada SEFAZ especificos da main.

Backend: dominio de autorizacao parcial, limites da fila e estornos, filtro por solicitacao, dois campos JSON e testes. Novo doctor PROD limita DDL a duas colunas e ledger da propria migration, confere UUID/TLS e admite retomada de DDL parcial. Novo aplicador com manifesto exato, snapshots privados, verificacao de peers/Nodes/env/dumps e plano/historico/credencial NSDOCS, locks exclusivos, QA offline, schema antes de restart exclusivo PROD e contador para nao repetir restart.

Frontend: valor parcial com confirmacao, observacao na fila, filtro e MoedaInputBR. Mantido em commit separado local ate backend/migration conferidos pelo usuario. Nao publicar esse frontend antes da etapa backend.

Validacoes aprovadas: os 16 scripts backend listados no aplicador, cinco testes do doctor e seis do aplicador; UI com mocks (BRL/cursor, autorizacao individual/coletiva/obra, biometria simulada, fila) e build frontend. Preflight SSH somente leitura confirmou TLS1.3, nenhuma migration anterior pendente, nenhuma das novas colunas ainda presente e nenhum executor de complemento ativo. Nao houve escrita em banco remoto. Comandos e roteiro: `ops/deploy/README-autorizacao-valor-prod-20261026.md`.

Proximo passo operacional: usuario confere backup atual/timer/janela, executa preparar/aplicar/conferir com SHA backend publicado e envia saida. So depois publicar commit frontend e conferir build Vercel. Sem executar SQL direto financeiro, migrations gerais, restart DEV, resume captura ou habilitar automatico.

Riscos delimitados: DDL MySQL nao e transacional, por isso doctor retoma colunas parciais e so registra ledger ao final; nao oferece down destrutivo. Aplicador aborta se ambiente, plano, processo, origem Git, outro schema pendente ou dados de auditoria divergirem. Homologacao real de autorizacao por passkey permanece com o usuario.
