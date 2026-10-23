# Compra Direta - credor obrigatorio conforme configuracao

## Publicacao autorizada

Usuario autorizou agora commit/push deste ajuste e dos pagamentos negociados
na refactor/frontend, com comandos EC2 DEV e migration. Nenhum deploy ou banco
real pelo agente. Estado historico abaixo e anterior a publicacao;
seguir [roteiro conjunto DEV](2026-10-22-publicacao-compra-negociacao-dev.md).

## Escopo e estado

Usuario autorizou implementar/testar sobre refactor/frontend, sem producao.
Base origin/refactor/frontend41219c3a; trabalho local na branch
codex/compra-direta-credor-20261022 no worktree desta conversa. Sem commit,
push, deploy, EC2, banco/S3/Redis reais, migrations, dependencias ou flags.
Nao alterou main nem arquivos/dados existentes de solicitacoes.

## Alteracoes

- backend/src/services/compraDiretaCredorRegraService.js: consulta configuracao
  real e resolver existente por tipo/area de destino, com aliases do GEO.
- backend/src/controllers/SolicitacaoCompraController.js: referencia GET
  somente leitura; resolucao de tipo sem create/update nesse GET. POST consulta
  regra atual e bloqueia falta do parceiro_id com400/rollback antes de criar
  registros. Validacao existente de ativo/fornecedor permanece.
- backend/src/routes.js: GET sob permissao e escopo de obra da criacao;
  guardas dos POSTs direto/generico, autenticacao e demais rotas inalterados.
- frontend/src/services/compras.js: leitura HTTP da regra, signal e validacao
  do formato. Nenhuma resposta invalida e tratada como campo opcional.
- NovaSolicitacaoCompra.jsx: indicador/ARIA, erro junto ao campo, exige ID
  selecionado, bloqueia revisao durante falha/pendencia; timeout15s, retry
  explicito e descarte/cancelamento de leitura obsoleta. Sem alterar autosave,
  TTL, dados de rascunho ou logica de pagamentos/itens/importacao/revisao.
- Dois QAs dedicados, canonico Compras e ownership.

## Validacao

- QA backend dedicado executa resolver/config reais e create/GET reais em VM,
  com persistencia em memoria. Obrigatorio/opcional/oculto, global/area/tipo,
  ausencia/null/vazio, cadastro inexistente/inativo/nao fornecedor, favorecido
  distinto, desconto/frete/historico, compra normal, negativa de acesso,
  falha da configuracao/rollback e GET sem create/reativacao aprovados.
- QA UI dedicado executa paginas/CSS/servicos HTTP reais com interceptacao
  local, Chrome1366/390: nome digitado nao basta, selecao aceita, campo
  opcional, rascunho incompleto restaurado/salvo, regra pendente/falha/retry,
  favorecido diferente e desconto preservados. Revisao antiga sem credor
  rejeitada por POST HTTP simulado: mantem rascunho e clique duplo envia
  uma vez. Nenhuma criacao real.
- Regressoes backend validarCredorCompraDireta, validarCompraDiretaGestao,
  validarCompraDiretaFreteFinanceiro e validarCompraDiretaGeoAcesso aprovadas.
- Regressao UI validarCompraDiretaGestao aprovada: itens, frete/PIX,
  negativos/ACL, formulario preservado e duplo envio.
- Build final aprovado633modulos/17,60s. Avisos antigos de chunks e
  Browserslist. Navegacao gerada sem delta. Node syntax/diff-check aprovados.
- Documentacao validada600arquivos/19canonicos.
- validarCompraDiretaFrete.js falha em marcador estatico antigo de
  FinanceiroCard: espera selecao por podeEnviarParaFila; base41219c3a ja usa
  podeEnviarTitulos. Arquivo financeiro e esse QA nao foram alterados. Nao
  enfraquecer teste nem modificar fluxo de autorizacao para satisfazer marcador.
- Screenshots privados em outputs/compra-direta-credor-obrigatorio; fora de
  eventual commit. Sem teste contra API/DB ou contas reais.

## Proximo passo e riscos

Implementacao/testes/documentacao concluidos localmente. Publicar somente
mediante pedido de commit/push do usuario. Depois atualizar ambos frontend e
backend DEV: frontend novo depende do GET novo; backend antigo resulta em
bloqueio seguro com retry na tela, nao em dispensa silenciosa do credor.
Homologar opcao obrigatoria com rascunho antigo/novo, sem credor/nome apenas,
cadastro valido, favorecido diferente e opcional, usando registros de teste.
POST protege revisoes antigas e alteracao de configuracao depois da revisao.
Nao corrige retroativamente solicitacoes ja criadas sem credor nem investiga
travamento/erro da Home nesta tarefa. Nao executa operacao em producao.
