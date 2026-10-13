# Titulo na Solicitacao de Compra e Compra Direta

## Estado e autorizacao

Publicacao autorizada pelo usuario em 11/10/2026: commit e push das pendencias
desta conversa somente na refactor/frontend. Sem main, EC2 ou banco real.

Implementado localmente na refactor/frontend sobre 16f95735. Usuario solicitou
campo de titulo no cabecalho para pesquisar na lista geral de Solicitacoes.
Sem commit/push, main, EC2, banco real, migration ou deploy nesta tarefa.
Ownership liberado ao concluir a validacao. outputs/ permanece fora do Git.

## Mapa e contrato

- NovaSolicitacaoCompra atende os dois modos. Titulo da solicitacao no primeiro
  campo de Dados gerais, opcional e com maxLength 255; padrao corporativo
  existente mantido com a skill frontend-design, sem mensagem fixa adicional.
- Estado, limpar rascunho, autosave, recuperacao (inclusive somente titulo),
  payload de revisao e retorno para editar preservam o titulo. A compra comum
  continua removendo preco/frete do payload; agora conserva titulo na whitelist.
- RevisarSolicitacaoCompra mostra o titulo nos dados do cabecalho e na previa
  HTML, escapando caracteres especiais. Trava de duplo envio original intacta.
- POST /compras/solicitacoes e /compras/solicitacoes-diretas mantem os mesmos
  guards funcionais/de obra e controller. Ambos aceitam titulo opcional, texto
  de ate 255 caracteres, rejeitando objetos/arrays. Espacos externos removidos.
- SolicitacaoCompra.titulo ja existe no modelo e recebe o valor informado.
  Descricao da Solicitacao principal inclui o titulo na primeira linha, seguida
  do tipo e detalhes originais. GET /solicitacoes?q= e o filtro descricao ja
  pesquisam esse campo: sem nova coluna/endpoint ou ampliacao de visibilidade.
- Sem titulo, descricao e defaults antigos continuam iguais. Nenhum registro
  existente e reescrito. Status, dinheiro, aprovacao, itens e financeiro intactos.

## Validacoes

- frontend/scripts/validarTituloCompras.mjs: paginas/componentes/servicos reais
  em Chrome com transporte isolado; dois modos, campo opcional, limite, autosave,
  recarga, somente titulo, revisao/voltar, previa escapada, desktop/mobile,
  envio unico e remocao do draft apos sucesso. Modelos/servicos externos do
  controller isolados em memoria: persistencia, legado, valores, status,
  transaction commit/rollback, negativas, validators e contrato da busca.
- validarPayloadSolicitacaoCompra.mjs e validarReaproveitamentoCompra.mjs: OK.
- Backend: validarCompraDiretaGeoAcesso.js, validarCompraCriacaoTodasObras.js
  (14 cenarios), validarCredorCompraDireta.js e node --check: OK, sem banco/rede.
- npm run build e git diff --check: OK. Avisos preexistentes de Browserslist
  antigo e chunks grandes nao impedem build.
- Capturas outputs/titulo-compras conferidas: campo visivel e editavel em
  1366px e 390px. Fixture nao substitui QA na aplicacao completa/dispositivo.

## Pendencias preexistentes fora deste ajuste

- validarCompraDiretaFrete.js falha por marcador antigo de FinanceiroCard:
  espera selecao={podeEnviarParaFila, mas HEAD ja usa podeEnviarTitulos.
  Nenhum desses arquivos foi alterado nesta tarefa. Nao declarar esse teste OK.
- No fixture real, hidratacao de rascunho com obra preselecionada pode limpar
  as apropriacoes dos itens: efeito de obra consome hidratandoDraftRef no
  primeiro render e depois limpa os rateios. Mesma logica presente no HEAD.
  Teste reconfere distribuicao pelo modal real antes de enviar e nao afirma
  preservar rateios nesse caminho. Corrigir em tarefa separada com regressao
  de troca de obra, reaproveitamento e revisao; o titulo recupera normalmente.

## Proximo passo exato

Se autorizado, commit/push na refactor/frontend. Para homologacao, atualizar
backend dev e frontend em conjunto (backend primeiro quando possivel): API
antiga rejeita titulo preenchido. Sem titulo o envio novo omite o campo.
Sem migrations, consultas ou alteracoes retroativas no banco. Testar novas
compras com titulo, localizar pelo q da lista geral e validar acesso por obra.
