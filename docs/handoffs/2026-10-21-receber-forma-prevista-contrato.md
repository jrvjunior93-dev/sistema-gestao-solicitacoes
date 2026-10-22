# Forma prevista dos contratos em Contas a Receber

## Autorizacao, base e diagnostico

Usuario autorizou implementar/testar em refactor/frontend, preservando dados e
regras financeiras, sem producao. Base a00a15f6fdd573fcff18e87c3d1e7d411dcb181a;
branch local codex/receber-forma-prevista-contrato-20261021, agente unico.
Sem commit/push/deploy autorizado nesta implementacao. Main b6546229 intocada.

ComercialContratos/comercialService ja persistem forma_recebimento_prevista na
ContratoComercialParcela. O titulo COMERCIAL RECEBER nao necessariamente possui
forma_pagamento_id; a coluna da listagem usava somente formaPagamento.nome.
Nao corrigir preenchendo FK, mudando a forma de cobranca ou reinterpretando
movimentos financeiros. A forma prevista nao e a forma efetiva da baixa.

## Mapa de impacto e implementacao

- GET /financeiro/titulos continua com allowFinanceiro, validateFinanceTituloQuery,
  assertFinanceAccess e mesmo escopo completo de obras/compartilhamento.
- listarTitulos executa consulta/filtros/order/distinct/paginacao existentes;
  somente depois anexa a projecao de leitura do novo tituloFormaPrevistaLeitura.
- Elegivel: RECEBER + origem COMERCIAL sem forma explicita (ID ou associacao
  nome/codigo). Leitura de ContratoComercialParcela pelos IDs ja retornados,
  atributos minimos titulo_financeiro_id e forma_recebimento_prevista, rawtrue,
  lotes de no maximo500 IDs. Sem join hasMany, N+1 ou ampliar a carteira consultada.
- DTO adicional formas_recebimento_previstas_contrato: codigos normalizados,
  unicos e ordenados. Multiplas parcelas do mesmo titulo nao duplicam linhas,
  somas ou contadores. Ausencia/legado sem vinculo deixa vazio; nao inferir pelo
  numero do documento, descricao, cobranca ou pagamento realizado. Falha de
  leitura nao e ocultada como sucesso sem forma.
- FinanceiroTitulos e helper formaPagamentoTitulo: mesma coluna/CelulaDupla,
  nome legivel e subtexto Prevista no contrato somente para fallback comercial.
  Forma explicita tem prioridade; codigo/nome anterior mantidos. Customizados
  preservam o texto; varios codigos aparecem separados por barra sem escolher
  arbitrariamente um. Sem redesign, nova acao ou permissao.
- CSV usa a mesma apresentacao, identificando a previsao no nome com
  (prevista no contrato). Chaves/ordem/colunas selecionadas permanecem.
- Filtros e ordenacao seguem o cadastro explicito forma_pagamento_id/nome como
  antes: nao criar mapeamento automatico entre codigos comerciais e cadastros
  financeiros. Este ajuste e exibicao, nao novo filtro ou regra de baixa.
- Relatorio PDF usa o mesmo listarTitulos em leitura, mas nao possui coluna
  forma por linha; nenhum layout, filtro ou comportamento PDF foi alterado.
- Nao alterar detalhe/criacao/edicao/cobranca/baixa/estorno/renegociacao/importacao,
  status/valores/saldos/datas/historico/parcelas/empresa/conta/forma efetiva.
  Nenhuma migration, backfill, dependencia, lockfile, .env ou configuracao nova.

## Testes e evidencias

- Novo backend/scripts/validarFormaPrevistaContratoReceber.js: funcao real de
  listagem em VM, projecao real e modelo Sequelize real gerando SELECT MySQL
  offline; serializacao no TituloFinanceiro real. Pagina/selecao/array legado,
  escopo403/vazio/global, prioridade explicita, PAGAR/manual sem consulta,
  formas unicas/multiplas/ausentes, parcial/quitado, IDs invalidos, erro de leitura,
  1001 titulos em3 consultas500/500/1. Snapshots de persistencia intocados.
- Novo frontend/scripts/validarFormaPrevistaContratoReceber.mjs: helper puro e
  pagina/HTTP/CSS reais com API interceptada. Formas comerciais padrao/custom,
  explicita/prioridade/sem forma/multiplas, parcial/quitado sem derivar da baixa,
  CSV identificado sem nova consulta, somente leitura/sem exportar,403/retry,
  PAGAR preservado.1366/390 sem overflow; imagens privadas em outputs.
- Comandos npm test:receber-forma-prevista em backend/frontend. Packages so
  adicionam esse QA, sem dependencias/lockfiles/scripts anteriores alterados.
- validarRelatorioTitulosSelecao.js tinha dependencias readonly ausentes no
  harness, causando500 tambem na source DEVa00 anterior (reproduzido sem editar
  a base). Atualizado somente require das leituras e predicado SQL neutro para
  fixture sem compartilhados; negativas/escopo/selecoes/nao fallback preservados.
- Regressoes backend aprovadas: RelatorioTitulosSelecao, CartaoOpcionalSolicitacao,
  CartaoParcelamentoBaixa, FilaBaixaComposta, RelatorioTitulosSolicitacao,
  ComercialTituloVencimento, ComercialChequeQuitacao e
  ComercialContratosMultiunidadeImportacao. Modelos/bancos simulados/offline.
- Build632 modulos/13,93s aprovado, apenas avisos preexistentes Browserslist e
  chunk grande. Sem delta no catalogo gerado. Sintaxe/diff aprovados; docs598
  Markdown/19 canonicos aprovados. UI RelatorioTitulosSelecao tambem aprovada;
  capturas desktop/mobile revisadas. Preferencias preexistentes da consulta
  simuladas na API local; nenhuma escrita financeira ou rede externa nos QAs.
- Skill frontend-design usada para CelulaDupla/rotulo compacto/mesmo padrao
  responsivo e sem alterar acoes, fontes, paleta, filtros ou layout da tela.

## Limites e proximo passo

Entrega local: nenhuma EC2, DB/S3/Redis reais, escrita financeira, memoria,
main ou producao alterada. Sem commit/push/deploy nesta etapa.
Nao afirmar teste com contratos reais ou MySQL em rede executado pelo agente.

Se usuario autorizar publicacao, commitar/push somente esse delta no DEV e
preparar roteiro proprio de backend+frontend, sem reutilizar allowlists de
deploy anteriores que nao contemplam estes arquivos. Identidade/schema readonly,
sem DDL/dependencias, restart apenas backend-dev e frontend preview/DEV.

Homologar contrato existente e novo de teste no DEV: consultar Contas a Receber,
conferir cada parcela (Cheque/Boleto/PIX/etc), subtexto de previsao, prioridade
da forma explicitamente vinculada, titulo parcial/quitado e CSV. Comparar
valores/saldo/status/historico/baixas; nao editar forma real ou repetir baixa
para fazer a previsao aparecer. Promocao main exige autorizacao separada.

## Publicacao DEV autorizada em 22/10/2026

Usuario autorizou commitar/push refactor/frontend e receber comandos EC2 DEV,
sem producao. Remotos conferidos: DEVa00a15f6 e main b6546229. Publicar somente
o pacote de exibicao/QA/docs; outputs privados fora do commit. Nenhuma operacao
real na EC2, banco, storage ou memoria pelo agente.

Novo roteiro ops/deploy/atualizar-dev-receber-forma-prevista-20261022.sh e guarda
backend/scripts/validarDeployReceberFormaPrevistaDev.js. Recebe SHA completo,
exige checkout DEV no caminho exato/branch/limpo, lock, PM2 backend-dev online
na8001/sem watch/migration automatica, instalado minimoa00 e alvo publicado
descendente por ff-only. Nao usar o roteiro anterior de pedidos nesta publicacao.

Antes do merge compara migrations/lockfiles intactos, packages semanticamente
com apenas o comando test:receber-forma-prevista EXATO de cada runtime, e
allowlist de dois arquivos backend e dois frontend. Guarda negativa tambem
rejeita dependencia/script antigo/postinstall ou comando QA inesperado.

Identidade/configuracao/schema somente leitura via configurarSessao12hDev
--verificar antes e depois do merge e apos restart. Sintaxe e QAs isolados
financeiros/comerciais antes de reiniciar somente backend-dev, health8001,
.env por hash tres vezes. Sem npm install/ci, migrations, update-env, .env/flags,
heap/swap ou backend de producao. Nao buildar frontend nem abrir browser na EC2;
frontend DEV deve receber o SHA pela Vercel.

UI repetida localmente para publicacao; timeout de navegacao do harness passa
a45s para compilacao fria, sem alterar prazos de interacao ou runtime da tela.
Nao contornar erro de identidade/schema/ancestralidade; parar e enviar saida
sem segredos. Operador homologa em DEV consultando contrato existente/novo,
prevista/explicita, parcial/quitado e CSV, sem repetir baixa ou regravar formas.

Fechamento local da publicacao: backend/SQL/ACL/regressoes financeiros/comerciais,
UI1366/390/CSV/403/retry/PAGAR e relatorio repetidos e aprovados; build632 modulos
em14,60s, sem delta no catalogo; guardas/pacotes exatos/Node/Bash/docs598/19/diff
aprovados. Ownership liberado para commit/push DEV sem force. Homologacao real
na EC2 somente pelo operador, nenhuma producao ou memoria alterada pelo agente.
