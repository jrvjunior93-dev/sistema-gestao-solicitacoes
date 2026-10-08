# Autorizacao sem prazo e resumo para o proprietario

## Escopo

Pedido de 08/10/2026: remover expiracao operacional do lote, destacar solicitacao,
separar MOTIVO apos STATUS e ocultar itens no resumo de titulos originados de
Solicitacao de Compra ou Compra Direta. Checkout C:/Fluxy-refactor-frontend,
branch refactor/frontend; sem delegacao.

## Implementacao

- pagamentoAutorizacaoService.js: remove prazo nas opcoes e na decisao bloqueada;
  preserva estado, permissoes, passkey, revalidacao, locks e enqueue idempotente.
- expira_em continua como metadado legado NOT NULL; nao limita novos ou antigos
  lotes e nao e renovado na revogacao. Sem migration ou reescrita de registros.
- FinanceiroAutorizacoesPagamento.jsx e CSS: SOL principal, TIT secundario/fallback,
  MOTIVO apos STATUS e data de criacao na lista. Acoes e callbacks preservados.
  Contencao da grade permite rolagem horizontal no mobile; superficies e textos
  do lote/tabela usam tokens do sistema no tema escuro para preservar legibilidade.
- autorizacaoPagamentoResumo.js: apresenta apenas tipo para compras a partir da
  descricao congelada da solicitacao ou prefixo legado do titulo. Outros tipos
  preservam descricao; nao altera snapshot/hash nem anexos.
- validarAnaliseProprietario.js e validarFilaAutorizacaoConvergencia.mjs: regressao
  dos lotes antigos, seguranca do challenge, revalidacao e apresentacao responsiva.
- validarAutorizacaoProprietarioPagamentos.js: contrato estatico atualizado para
  chamar o novo helper, sem remover os demais testes de seguranca.
- README e contrato documental do Financeiro atualizados.

## Validacao

- Backend test:fila-instrumentos aprovado: SQL/hidratacao, instrumentos, idempotencia,
  lotes legados sem prazo, challenge ausente/reutilizado bloqueado, alteracao material
  invalidada e negativa de permissao. Models/verificacao biometrica simulados.
- Backend test:autorizacao-proprietario aprovado: gates, hashes, schema e seguranca.
- Frontend test:fila-autorizacao-convergencia-ui aprovado: pagina real com APIs
  simuladas, SOL/TIT avulso, compras sem itens, MOTIVO separado, selecao/refresh,
  revogacao e rolagem mobile. QA visual em 1440 e 390 px, claro/escuro, capturas
  em outputs/autorizacao-resumo-20261008 (nao versionar).
- Frontend build, sintaxe backend/helper, diff-check e test:docs aprovados.
- Avisos de Browserslist desatualizado e bundles grandes ja existentes; sem
  alteracao de dependencias nesta tarefa.

## Limites e proximo passo

Usuario autorizou commit e push na refactor/frontend em 08/10/2026, seguidos
de comandos para atualizar somente a EC2 dev. Testes backend e UI, sintaxe,
diff-check e documentacao aprovados novamente antes do commit. Ownership liberado
para publicacao; conferir o commit que contem este handoff e seu push no Git.
Sem banco real, Redis/S3 real, migration, reinicio ou execucao de deploy.
Homologar posteriormente em dev: lote antigo pendente, autorizacao/rejeicao com
passkey, Compra Direta/Solicitacao de Compra e motivo no mobile. Main nao faz
parte deste pedido. Descricoes legadas sem prefixo reconhecivel mantem o
texto original; nao se presume tipo pela forma de pagamento. A copia documental
continua disponivel, pois o pedido remove itens do resumo da tabela, nao dos anexos.
