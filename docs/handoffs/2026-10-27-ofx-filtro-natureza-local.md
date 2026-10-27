# OFX: filtro credito/debito local - 27/10/2026

## Pedido, estado e limites

Adicionar seletor no card de filtros de Conferir manualmente. Implementado
localmente sobre dface9c2298f0bd5a3c105c4fba1ad89c5050a71, branch
codex/compras-paginacao-local-20261027. Sem commit/push, EC2, deploy, restart,
migration, registros reais, importacao ou conciliacao real. Nao ha autorizacao
para promover esta entrega nem as entregas anteriores a main neste pedido.

## Implementacao e dependencias

- frontend/src/pages/FinanceiroConciliacao.jsx: Movimentacao Todos/Credito
  (entradas)/Debito (saidas), rascunho versus aplicado, botao Atualizar,
  Limpar e reentrada manual. Mudanca aplicada retorna pagina 1. Conta/status/
  datas/paginacao permanecem. Confirmacao e payload de lote seguem o filtro
  aplicado, nao a escolha ainda em rascunho.
- backend/src/validators/financialValidators.js: natureza opcional, enum
  fechado na query da listagem e no corpo de conciliar-sugeridos. Ausencia
  preserva o comportamento anterior. Arrays/objetos e campos extras rejeitados.
- backend/src/services/conciliacaoBancariaService.js: somente
  buildConciliacaoWhere; valor > 0 ou < 0 antes do resumo/count/limit-offset.
  Mesmo predicado restringe o lote aos pendentes. Zero fica em Todos.
- Endpoints/ACL/escopo/matches/confirmacao/idempotencia e regras financeiras
  nao foram ampliados. Filtrar nao grava. O lote existente, quando confirmado
  de verdade pelo usuario, continua gravando conciliacoes/baixas normalmente.
- Contadores Lidos/Importados/Ignorados sao do historico de arquivos; os
  totais e a listagem do extrato seguem a natureza. Sem mudanca na importacao.

## Validacao aprovada

- backend/scripts/validarConciliacaoNaturezaFiltro.js: 3 testes; validadores,
  service real com models/transactions em memoria, 246 registros artificiais,
  credito na pagina 2 apos mais de 100 debitos, totais/sinais/conta/data/status,
  registro removido, zero, permissao negada, lote restrito sem sugestoes e
  imutabilidade. SQL MySQL gerado por Sequelize executado em SQLite :memory:.
  Escritas de fixtures somente nesse banco efemero, nunca no banco do sistema.
- backend/scripts/validarOfxMatchesExclusivos.js: harness exportado sob guarda
  require.main e suporte gt/lt, mantendo suite standalone aprovada. Regressao
  de matches exatos e rendimentos aprovada. Todos sob semRedeQa.js.
- frontend/scripts/validarConciliacaoNaturezaFiltro.mjs: pagina/services reais
  em Chrome headless 1366/390; todas as APIs interceptadas. Rascunho sem GET,
  aplicar, pagina 2, credito fora da pagina inicial, sinais, datas/conta,
  Limpar, lote/cancelamento com natureza aplicada e perfil somente leitura.
- frontend/scripts/validarOfxMatchesExclusivos.mjs: suite anterior desktop/
  mobile aprovada, inclusive duplo clique, conflitos, reservas e permissoes.
- Build frontend aprovado em 17,70s; avisos existentes de Browserslist/chunks.
  Capturas do novo filtro em outputs/ofx-natureza/filtro-1366.png e filtro-390.png
  inspecionadas. Sem medicao de desempenho real nem teste em MySQL real.

## Proximo passo

Somente se o usuario solicitar publicacao: preparar novo pacote com hashes,
QAs e aplicador especificos; publicar backend compativel antes do frontend,
preservando producao/heap e demais processos conforme ambiente autorizado.
Nao reutilizar nem regravar o manifesto fechado de compras-filtros c43c2d13:
financialValidators.js recebeu esta nova alteracao local. Nenhum comando EC2
ou SQL deve ser executado pelo agente. A promocao anterior continua pendente
de autorizacao explicita do usuario.

## Autorizacao de publicacao DEV recebida

Usuario autorizou commit/push refactor/frontend e comandos para atualizar
somente DEV, preservando producao/heap4096 e sem EC2 pelo agente ou registros.
Pacote novo ops/deploy/atualizar-dev-ofx-natureza-20261027.cjs, teste, manifesto
e README proprios. Manifesto anterior compras-filtros permanece fechado/intacto.
Dois arquivos runtime, quatro QAs backend offline e oito testes do aplicador.
Branch/main nao deve ser promovida nesta tarefa.

Para permitir publicar frontend antes da execucao manual do backend, o novo
backend anuncia meta.filtro_natureza_disponivel=true. A tela omite natureza
na consulta e lote ate receber suporte; nao exibe o seletor com backend antigo.
QA UI inclui backend anterior sem meta nem parametro novo, lote ficticio com
contrato anterior e backend atualizado com todos os testes originais.

O proximo passo do operador e executar o README dedicado com o SHA publicado
da entrega, retornar PRONTO e conferir o filtro no DEV sem conciliar/importar.
Nenhuma alteracao de producao, database/schema ou flag fiscal autorizada.
