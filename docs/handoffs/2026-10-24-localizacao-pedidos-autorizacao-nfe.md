# Conferencia da NF-e na autorizacao e localizacao de pedidos - 2026-10-24

Publicacao autorizada posteriormente junto com a consulta fiscal nos pagamentos.
Roteiro atual: ops/deploy/README-nfe-pagamentos-pedidos-dev-20261024.md.
Backend publicado primeiro; frontend preparado para aguardar conferencia EC2.
Operador exclusivo DEV com QA/Node/env/processos/dumps e schema somente leitura.

Atualizacao: a consulta contextual de NF-e foi implementada localmente na tarefa
seguinte, separada do material assinado. Ver
[handoff atual](2026-10-24-nfe-dossie-arquivos-fila.md). O diagnostico abaixo
registra o estado observado no DEV antes dessa publicacao (ainda nao realizada).

## Escopo e estado

Pedido do usuario: conferir no DEV se o proprietario abre a nota vinculada ao
titulo e montar relatorio que localize pedidos por dados da compra.
Agente unico. Base100620bf (refactor/frontend publicado), checkout local
codex/retirada-envios-dev-20261023. Codigo novo somente local: nao commitado,
publicado ou instalado. Main, EC2, banco DEV/PROD, PM2 e Nodes intactos.

## Conferencia real no DEV

Tela autenticada https://refactor-dev.jrfluxy.com.br/financeiro/autorizacoes-pagamento,
obra EDIFICIO ITALIA, SOL-35/id2153, LOTE-10, TIT-003834/id3790.
TIT-003832/3833 tambem permanecem no lote; os tres aguardam aprovacao.
Na lista e no detalhe do titulo, Documentos enviados para autorizacao oferece
somente `solicitacao-compra-SOL-35.pdf`. A NF-e38539/doc556 nao aparece como
documento abrivel, embora seu vinculo nos pedidos/titulos ja tenha sido
homologado. Nome da NF no texto demonstrativo do titulo nao e arquivo fiscal.

Leitura feita pela sessao Suporte, usando o dossie da autorizacao. Nao foi
efetuado login/impersonacao do proprietario, mudanca de autorizadores ou
decisao financeira. O mesmo componente do dossie lista `item.documentos`;
pagamentoAutorizacaoService atualmente monta a colecao a partir dos Anexo
da solicitacao principal/participacoes, sem consultar os vinculos fiscais.
Nao se conclui por este teste que outras permissoes do proprietario estejam
funcionando: o achado concreto e a ausencia do arquivo fiscal nesse dossie.

Evidencia local: outputs/conferencia-autorizacao-nfe-20261024/dossie-sem-nfe.jpg.
A aba foi deixada na lista da obra, sem selecao e sem alterar o lote.

## Pendencia fiscal diagnosticada, nao implementada

Incluir NF-e/XML/DANFE no dossie exige uma etapa especifica: construir o snapshot
com vinculos fiscais efetivos, tratar mesma nota em varios pedidos/solicitacoes,
assinar arquivos privados com permissao propria do dossie e preservar o hash e
revalidacao antes da aprovacao biometrica. Nao ampliar `fiscal.document.view`
nem alterar silenciosamente snapshots de lotes existentes. Definir tambem como
notas vinculadas apos o envio exigirao atualizacao/reenvio do dossie.

## Relatorio implementado localmente

- Nova pagina `/compras/relatorios/localizar-pedidos` e GET correspondente.
- Filtros combinados AND: q, descricao da solicitacao, codigo SOL/SC/Sienge,
  pedido PC/ID/externo, fornecedor/CNPJ sem pontuacao, item ativo, valor minimo/
  maximo da aquisicao, obra, status e data de criacao no dia operacional do ES.
- Busca geral separa palavras e as combina entre campos da compra e itens.
- Mesmas permissoes e escopos da listagem de pedidos, com exigencia adicional
  da permissao existente de relatorios. Nao concede consulta global por omissao.
- COUNT/SUM de pedidos sem JOIN multiplicador de itens; busca por EXISTS.
  Itens carregados somente para a pagina retornada, em transacao de leitura.
- Uma linha por pedido, resumo do recorte, paginas25/50/100, links existentes,
  CSV da pagina com aspas/UTF8/protecao contra formulas. Sem ordenacao enganosa
  somente da pagina; ordem fixa por criacao desc/ID desc. URL guarda filtros.
- Nao altera estados, financeiro, historico, baixas, NSDOCS ou permissoes.

Arquivos: PedidoLocalizacaoController, pedidoLocalizacaoQuery/Service,
routes/uiVisibilityRegistry, ComprasRelatorioLocalizarPedidos,
pedidoLocalizacaoCsv, compras.js, App/navigation/ModuloRelatorios,
catalogo de navegacao gerado, scripts QA/fixture, scripts package.json e docs.
Ownership do repositorio contem alteracoes antigas: nao adicionar o arquivo
inteiro num futuro commit desta tarefa. Ops/Node/handoffs anteriores intactos.

## Validacoes concluidas

- backend `npm run test:pedido-localizacao`:8 testes aprovados; escopo
  obra/comprador/solicitante, negativas, paginas, somas, SQL parametrizado,
  curingas literais, seis digitos no PC, valores/datas/limites invalidos.
- frontend `npm run test:pedido-localizacao`: pagina, filtros e tabela reais,
  cliente HTTP e controller reais com SQLite local e sessao/tema QA.
  Filtros aplicados explicitamente, pagina/limite, links, CSV, resposta atrasada,
  retirada de resultados antigos em403 e celular390px sem transbordamento.
  Datas DATETIME do fixture reproduzem serializacao UTC do parser MySQL;
  criacao20hUTC exibida17hES. Nenhuma requisicao externa permitida.
- `auditarPermissoesGranulares.js --check`, `validarCompraEtapasResumoPedido.js`
  e `validarPedidoCompraFinanceiroGeo.js` aprovados.
- frontend `npm run test:navegacao` e build aprovados; catalogo regenerado.
- `git diff --check` aprovado. Avisos preexistentes de Browserslist/chunk e
  trinco de navegacao nao impediram QA/build; nenhuma dependencia atualizada.
- Evidencias: outputs/localizar-pedidos-20261024/desktop.png e mobile.png.

## Proximo passo exato

1. Usuario revisar diagnostico/relatorio. Se autorizar publicacao, commitar
   somente os arquivos desta tarefa e publicar em refactor/frontend.
2. Preparar operador DEV com commit fixo: backend antes do frontend, QA e
   verificacao de identidade/Nodes/processos/dumps. Sem migration ou npm install
   necessarios. Validar consultas reais em DEV (nao executadas nesta etapa).
3. Publicar frontend somente apos backend conferido. Testar pedidos26/27 por
   SOL-35, PC, Pedreira, Areia/Brita e valores600/566,44; validar usuario com
   escopo restrito e historico/baixas inalterados. Sem producao.
4. Tratar inclusao fiscal no dossie em implementacao separada, considerando os
   snapshots/assinatura acima; esta entrega apenas registra essa pendencia.
