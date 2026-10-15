# Compra Direta quantidade/frete e catalogo de admissao

## Escopo e autorizacao

Usuario solicitou editar quantidade pelos dois caminhos da Compra Direta e
adicionar frete apos criacao, no mesmo modelo de pagamento do formulario novo.
Confirmou recalcular a compra sem modificar titulos existentes. Tambem pediu
que a Obra selecione todas as empresas do grupo na admissao, sem outras areas.
Trabalho local na branch `codex/compra-direta-admissao-20261015`, base
`b9ef16e4474833cb7f95ab285caf3708faf5a468`, worktree promocao-dp-main-20261014.
Sem delegacao, banco real, migration, commit/push, EC2, restart ou deploy.

## Implementacao

- `compraDiretaGestaoService.js`: transacao/locks, revisao de conteudo, validacao
  de quantidade normal/manual, preco unitario preservado, desconto/rateios e
  formas proporcionais; frete global/item, embutido/terceiro, ativo/PIX/boleto;
  anexo atomico e auditoria. Nao importa nem opera titulos/pagamentos.
- `SolicitacaoCompraController.js` e `routes.js`: leitura com revisao e
  associacoes de frete; PATCH proprio com permissao por acao, escopo e setor
  atual revalidados sob lock. Erros internos sanitizados.
- `moduloPermissoes.js`, `authorizationService.js`, `acessoProduto.js`:
  `compras.compra_direta.editar_quantidade` e `.gerenciar_frete`, sem herdar
  da permissao exclusiva de apropriacoes. Catalogo de formas/upload temporario
  aceitam frete autorizado sem liberar criacao/gestao. Navegacao gerada pelo build.
- `SolicitacaoDetalhe/index.jsx`, `CompraDiretaFreteForm.jsx`, `compras.js`:
  gestao pelos dois botoes, formulario compacto com componentes existentes,
  bloqueio de reenvio e aviso de preservacao financeira; erro preserva digitacao.
- `RhAdmissaoCatalogoController.js`, `routes.js`, `rhDp.js`, `RhDpPessoal.jsx`:
  catalogo minimo ativo com permissao de abrir pedido; nao amplia a API de
  gestao. Estados de carga/erro e retry no formulario.
- Testes novos backend gestao/catalogo e UI gestao; teste GEO atualizado para
  a quinta excecao especifica; fixture Pessoal recebe modo `--admissao` isolado.
- READMEs canonicos Compras/RH-DP e registros de ownership atualizados.

## Validacoes

- Backend gestao, catalogo de admissao, GEO e sintaxe aprovados; models em memoria.
- Auditoria granular `--check`: 393 permissoes, sem duplicadas/invalidas e sem
  permissao de risco apenas no frontend.
- UI gestao: ambos os caminhos, fracao, PIX, frete, duplo clique, negativas,
  preservacao de formulario e layout desktop/tablet aprovados, API em memoria.
- UI admissao `--admissao`: usuario OBRA sem gestao seleciona outra empresa.
- Build frontend aprovado; avisos preexistentes de Browserslist/chunk grande.
- `git diff --check` aprovado.

## Limitacoes e proximo passo

- Nao reescrever descricao ou PDF historico da criacao; valores atuais estao
  no total/dados estruturados/auditoria. Financeiro deve tratar diferencas por
  seu fluxo; titulos e pagamentos passados permanecem iguais.
- Catalogo de admissao entrega empresas ativas, nao inativas.
- Conceder nominalmente as duas novas permissoes para usuarios nao administrativos,
  mantendo leitura, modulo, escopo e setor atuais. Nao ha seed de permissao.
- Teste legado `validarCompraDiretaFrete.js` tem marcador desatualizado de selecao
  da grade financeira em `FinanceiroCard.jsx` (esse arquivo nao foi alterado).
  Fixture completa Pessoal tambem
  usa contrato antigo da preparacao de pagamento; modo admissao e independente.
- Homologar DEV com compra normal/manual, com e sem titulo existente, desconto
  e varias formas, quantidade fracionada, frete por item e boleto. Conferir que
  titulos/baixas anteriores nao mudam. Testar usuario com/sem cada nova permissao
  e Obra abrindo admissao sem permissao de gerenciar empresas.
- Commit/push/publicacao somente mediante solicitacao. Sem nova migration.
- Preservar `outputs/` nao rastreado e demais checkouts sujos. Nao incluir
  screenshots/cache/build ignorado em commit.

## Publicacao DEV autorizada - 2026-10-15

Usuario autorizou commit/push destes ajustes na `refactor/frontend` e comandos
para homologar EC2 dev. Nao autorizou main ou execucao remota pelo agente.
Remoto conferido na base b9ef16e4474833cb7f95ab285caf3708faf5a468.
Incluso `ops/deploy/atualizar-dev-compra-direta-admissao-20261015.sh`:
checkout/branch limpos, npm ci, testes especificos, preflight somente leitura
de processo/porta/env/banco/schema e health em 8001. Reinicia apenas backend-dev,
nao altera flags nem executa migrations/seeds/backfills. Frontend segue Vercel.
Teste do script com PM2/banco em memoria cobre negativas de producao, processo
duplicado/errado, porta, divergencia de flags/credenciais e schema pendente.
Contagem documental central atualizada para 393 permissoes (duas novas nominais).
Homologacao real e concessoes de permissoes permanecem com o operador.
