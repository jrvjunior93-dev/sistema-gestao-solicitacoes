# Cadastro de credor na Nova Solicitacao: PIX e endereco

## Relato e causa

Usuario da obra relata exigencia de mais de uma chave PIX e endereco duplicado.
Em NovaSolicitacao, o tipo preselecionado da segunda chave e CNPJ. O helper
getPixDocumentError exige documento quando tipo CPF/CNPJ, mesmo se a chave
opcional estiver vazia. O modal renderizava duas entradas para as mesmas
chaves de endereco. A decisao do proprietario e primeira PIX obrigatoria,
demais opcionais, sem segunda entrada de endereco.

## Alteracoes e dependencias

- frontend/src/pages/NovaSolicitacao.jsx: valida explicitamente primeira PIX;
  so valida documentos PIX adicionais quando preenchidos. Rotulos explicam
  a obrigatoriedade. Remove apenas o bloco duplicado de endereco, preservando
  todos os campos, complemento opcional, mascara CEP e UF em maiusculas.
  Ref sincrona e botao desabilitado evitam cliques simultaneos neste modal.
- backend/src/controllers/ParceiroController.js: POST /solicitacoes/credores
  exige somente a primeira chave, alinhado ao formulario. Nao exige as demais.
  Mantem configuracao cadastro_credor, validacao de endereco/documento,
  vinculo a contrato, regras de credor avulso e normalizacao de parceiro.
- frontend/scripts/validarCredorNovaSolicitacao.mjs: handler de envio real em
  VM, controller real e normalizadores reais sem banco; opcao --ui renderiza
  o JSX real do modal com componentes OverlayModal, FormSecao e BlocoConteudo
  em fixture local no Edge, com API/preferencias substituidas.

Helpers gerais de PIX, demais telas de cadastro, permissoes, schema e dados
existentes nao foram alterados. Chaves extras preenchidas continuam sujeitas
a validacao de CPF/CNPJ existente no formulario. Nao foi ampliada a validacao
geral dos formatos EMAIL/TELEFONE/ALEATORIA nesta tarefa.

## Validacoes

- node frontend/scripts/validarCredorNovaSolicitacao.mjs --ui: passou. Inclui
  adicionais vazias em todos os tipos, primeira vazia, documentos invalidos,
  tres chaves preenchidas, endereco obrigatorio, payload/vinculo a contrato,
  permissao negada, erro recuperavel e clique simultaneo.
- node backend/scripts/validarFluxosPixApropriacoesSolicitacao.js: passou.
- node --check backend/src/controllers/ParceiroController.js: passou.
- npm run build no frontend: passou (520 modulos); avisos existentes de
  Browserslist e chunk grande. Fixture UI com aviso de content Tailwind vazio
  nao substitui auditoria visual completa; comportamento do modal validado.
- git diff --check: passou.

## Estado e proximo passo

Alteracoes locais ainda nao commitadas/publicadas. Sem banco remoto, criacao
de credor real, migration, reinicio ou deploy. Publicar apenas apos autorizacao.
Exige frontend atualizado e backend atualizado/reiniciado. Sem nova variavel
de ambiente. Depois, confirmar com usuario da obra que uma chave permite
salvar e que apenas um endereco aparece. Protecao implementada contra clique
simultaneo no formulario nao e garantia de idempotencia distribuida da API.

## Publicacao autorizada — 06/10/2026

Proprietario autorizou commit e push das alteracoes pendentes e retorno a main.
O worktree ja esta em main; publicar este ajuste junto com a reorganizacao de
Caixas e Contas. Testes locais reexecutados antes do commit. Sem autorizacao
de escrita em banco, ativacao de flags ou deploy/reinicio na EC2 nesta etapa.
