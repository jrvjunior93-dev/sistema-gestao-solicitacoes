# Promocao isolada do aviso de entregas para main

## Autorizacao e bases

Usuario autorizou migrar para main sem Pessoal/DP e confirmou nesta janela
backup recente conferido no Drive cifrado e timer ativo.

- Main congelada: 17be46092a48a2a94b2ba01e2d99555355b3d8f3.
- Refactor/frontend: abcfe89b65a88d647298ccbc8de264fd7759e5a3.
- Integracao: codex/promocao-aviso-entregas-main-20261009, criada da main.
- Apenas abcfe89b selecionado e incorporado com cherry-pick -x como
  7059c880ffc66c8191d44fea9e18746f8fa1cee8. Demais ajustes de medicao/recarga
  ja estavam publicados na main e nao foram reaplicados.
- Pessoal/DP 118209c080f53b1b3ddef246bcf83f334a85e9b8 permanece excluido.

Conflito somente no OWNERSHIP_ATIVO, resolvido preservando os registros da
main e da implementacao DEV. Nenhum conflito em codigo funcional.
Todos os arquivos do pacote DP (exceto o registro compartilhado de ownership)
continuam identicos a main anterior, inclusive testes, docs e scripts npm.
Diff funcional da integracao contra refactor/frontend tem apenas os 11
arquivos de RH/DP excluidos. Nao ha alteracao de migrations, dependencias,
lockfiles, exemplos de env ou configuracao de autorizacao de pagamentos.

## Snapshot anterior

Tag anotada publicada: backup/main-pre-aviso-entregas-20261009-17be4609,
apontando ao SHA da main congelada. Bundle completo com historico recuperavel
verificado por git bundle verify, fora da EC2:
outputs/main-pre-aviso-entregas-20261009-17be4609.bundle.
SHA256: 8FD0666731457392DC17636F0B66B4C073FE68DD371B7C09B9E24237C383B989.
Bundle e screenshots fora do Git. Segredos/configuracoes nao incluidos.
Confirmacao de backup MySQL foi fornecida pelo usuario; agente nao acessou EC2.

## Escopo e compatibilidade

Aviso de bloqueio de compra identifica solicitacao principal SOL, pedidos
e itens pendentes agrupados em uma lista no mesmo card. Guard legado e ciclos
operacionais continuam com mesmas regras, escopo por obra e codigos HTTP.
Sem mudanca de permissoes, idempotencia, criacao de compra ou regularizacao.
Detalhes tipados sao aditivos. Frontend antigo ignora a lista sem falhar;
backend antigo continua produzindo o aviso anterior no frontend novo.
Lista longa rolavel em desktop/mobile sem multiplicar cards ou cortar dados.

## Validacoes aprovadas na integracao

- Backend: test:pedido-entregas, test:prazos-operacionais,
  test:relatorio-titulos-selecao, test:docs.
- Frontend: node scripts/validarAvisoPendenciasEntrega.mjs,
  test:pedido-entregas, test:prazos-operacionais e npm run build.
- Aviso testado com transportes HTTP reais e APIs simuladas para compra direta,
  compra e solicitacao normal; 1/2/30 solicitacoes, legado, fechamento,
  lista completa/rolagem, desktop/mobile. Capturas em outputs/.
- Sintaxe dos cinco arquivos JS backend alterados e git diff --check.
- Exclusao DP verificada por comparacao dos caminhos do commit 118209c0
  contra a base main; migrations/package/lock/env conferidos sem delta.
- Testes isolados nao conectam a banco real. Mensagens de falha e migration
  em teste de prazos sao cenarios simulados, nao operacoes em producao.
- Build tem avisos preexistentes de Browserslist e chunk maior que 500KB.

## Publicacao e proximo passo

Promover main por fast-forward ate a ponta validada e publicar sem force push.
Verificar SHA remoto apos push, preservando refactor/frontend abcfe89b.
Nao executar deploy, restart, migration, reconciliacao ou operacao de banco
nesta promocao. Frontend Vercel pode ter deploy automatico por push; conferir
o artefato/domino, pois push nao confirma que o build chegou a producao.

Para atualizar EC2 quando solicitado: SHA exato, checkout main limpo,
PM2 backend-solicitacoes/caminho de producao, RDS de producao por HOST+PORT+
DB_NAME e overrides PM2. Config exporta { env }: usar destructuring correto.
Backup manual fresco com copia externa antes da janela; npm ci, preflight
somente leitura e testes offline; reiniciar somente backend-solicitacoes.
Se houver migration pendente, parar e revisar sem aplicar automaticamente.

Homologar aviso com entrega vencida real na obra, mais de uma solicitacao e
regularizacao. Rollback de codigo para SHA/tag anterior; nao alterar dados,
aplicar down ou reenviar compras existentes como parte de rollback.
