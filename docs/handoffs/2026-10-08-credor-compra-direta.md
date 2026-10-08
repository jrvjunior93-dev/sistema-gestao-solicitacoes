# Cadastro de credor da Compra Direta

## Causa e correcao

O modal enviava nome fantasia e campos vazios de representante legal, mas a
rota `/compras/solicitacoes-diretas/credores` usava o validator de cadastro
financeiro, que aceita apenas nome, documento, telefone e email. A recusa
acontecia antes do controller e do servico de Parceiros.

A Compra Direta agora usa validator proprio. Nome fantasia e opcional;
campos de representante de telas antigas sao aceitos como opcionais, com
CPF valido quando informado. Limites de texto seguem o modelo de Parceiros.
Campos desconhecidos e flags de acesso/perfil do parceiro continuam recusados.

O frontend envia explicitamente os cinco campos do modal e nao inclui
representante legal oculto. Uma referencia sincrona impede dois envios antes
do React atualizar o botao; o bloqueio e liberado apos sucesso ou erro.

## Impacto preservado

- Cadastro financeiro nos detalhes continua usando seu validator original.
- Nova Solicitacao e contratos nao tiveram campos, configuracao ou regras alterados.
- Compra normal compartilha a pagina, mas nao utiliza esse cadastro exclusivo
  da Compra Direta. Criacao da compra, frete, itens e financeiro nao mudaram.
- Controller/servico de Parceiros, permissao de criar compras, rate limit,
  auditoria, verificacao de documento existente e indice unico foram preservados.
- Nome fantasia nao passa a ser obrigatorio no cadastro rapido. O cadastro
  completo de fornecedor e a qualificacao contratual mantem suas exigencias.

## Arquivos

- `backend/src/validators/operationalValidators.js` e `backend/src/routes.js`.
- `frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx`.
- `backend/scripts/validarCredorCompraDireta.js` e `backend/package.json`.
- README de Compras, ownership e este handoff.

## Validacoes

O teste `test:compra-direta-credor` passou com middleware, validator, controller,
servico e handler reais; modelos de persistencia em memoria. Abrange payload
antigo/novo, fantasia opcional, PF/PJ, obrigatoriedade de documento/telefone,
representante opcional, limites, campos desconhecidos, documento existente,
rota financeira preservada e clique duplo/retry. Sem banco ou rede.

Tambem aprovados:

- Cadastro de credor por tipo/subtipo (regressao de CONTRATO).
- Qualificacao do representante acima do limite juridico dinamico.
- Cadastro/edicao de fornecedores, legado e permissoes.
- Cadastro geral de Parceiros e planilha de colaboradores.
- Fluxos PIX/apropriacoes da solicitacao.
- Build frontend, sintaxe dos arquivos backend e `git diff --check`.
- Verificador de documentacao: 430 arquivos e 19 documentos canonicos.

O build mantem os avisos preexistentes de Browserslist antigo e chunks grandes.
Os testes foram locais e isolados, sem banco ou rede. O modal nao foi exercitado
contra a API real em dev/producao; esta homologacao permanece no proximo passo.

## Publicacao e proximo passo

Implementacao local sobre `c24ad010` na `refactor/frontend`. Nenhuma migration,
escrita em banco real, commit, push ou deploy foi realizada.

Homologar em dev o cadastro no modal de Compra Direta com PF e PJ, nome fantasia
presente/ausente e documento existente. Publicar somente mediante autorizacao.
Atualizar backend antes do frontend para aceitar tambem payloads de telas antigas.
Os testes em memoria nao substituem teste de concorrencia no MySQL; o indice
unico existente continua sendo a protecao de persistencia por documento.
