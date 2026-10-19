# Compras nos Centros de Custo sem liberar o tipo fixo

## Pedido e escopo

Usuario esclareceu que nao quer editar/liberar o campo Tipo. Solicitacao de
Compra e Compra Direta precisam aceitar Centros de Custo pelas telas proprias,
que podem ser abertas diretamente. Sem producao. Base local derivada de
refactor/frontend (branch codex/fila-multiplas-fontes-20261018); preservar pacote
pendente de multiplas fontes e auditoria. Sem commit/push/deploy nesta tarefa.

## Causa e alteracao

- Controller de compras reutilizava assertTipoDisponivelNoDestino, que aplica
  o catalogo restrito da Nova Solicitacao aos Centros de Custo automaticos.
- Novo assertTipoCompraDisponivelNoDestino, usado somente no create do controller
  de compras (as duas rotas compartilham esse fluxo). Nos Centros de Custo permite
  tipos ativos/manuais SOLICITACAO_DE_COMPRA, COMPRAS (legado) e COMPRA_DIRETA sem
  exigir vinculo no catalogo. Obras/tipos personalizados delegam a regra anterior.
- Destino inativo/tipo interno continuam negados. Permissoes funcionais, escopo
  por usuario, bloqueios de entrega/custos, validacao, fluxo GEO, transacao,
  historico e protecoes de envio nao foram alterados. Nenhum novo bypass de usuario.
- Catalogo, tipo automatico, campos e configuracao da Nova Solicitacao intactos.
  Telas proprias ja usam getMinhasObras({ modo: 'CRIACAO' }), que lista obras e
  centros autorizados. Nao houve mudanca de UI nem necessidade de migration.

## Arquivos

- backend/src/services/tipoSolicitacaoDisponibilidadeService.js
- backend/src/controllers/SolicitacaoCompraController.js
- backend/scripts/validarCompraCentroCusto.js (novo; modelos em memoria)
- backend/scripts/validarTiposSolicitacaoPorDestino.js (marcador da chamada)
- frontend/scripts/validarTituloCompras.mjs (mock da nova chamada)

## Validacoes locais

- validarCompraCentroCusto.js: services/controller reais com persistencia em
  memoria; compras normal/direta em Administrativo Escritorio, Marketing,
  Comercial e centro configuravel; origem/tipo/obra/fluxo/historico/transacao.
  Catalogo/configuracao fixos, tipos arbitrarios, inativos/internos, obras sem
  tipo disponivel, falta de acesso, entrega pendente e rollback conferidos.
- validarCompraCriacaoTodasObras.js: 14 cenarios de permissoes, revogacao,
  acesso/listagem, rotas e ausencia de bypass funcional aprovados.
- validarCredorCompraDireta.js aprovado.
- validarTituloCompras.mjs aprovado: controller isolado e UI real desktop/mobile
  dos dois modos, revisao, datas, rascunho, recarga e envio unico; transporte
  simulado sem contato com servicos reais.
- node --check dos arquivos backend e git diff --check aprovados.
- validarCompraDiretaFrete.js falha em marcador textual antigo do FinanceiroCard:
  `selecao={podeEnviarParaFila ? {`. Confirmado via git show HEAD que tanto
  esse teste quanto FinanceiroCard estao identicos ao HEAD e marcador ja estava
  ausente antes da correcao. Nao reparar outra funcionalidade nesta tarefa.

Nenhum acesso EC2/MySQL/Redis/S3 real, .env, migration ou processo alterado.

## Proximo passo

Mediante pedido de publicacao, commitar/push para refactor/frontend sem incluir
acidentalmente outros pacotes pendentes. Testar no DEV com usuario autorizado
na Solicitacao de Compra e Compra Direta escolhendo Administrativo Escritorio;
verificar aprovacao GEO, itens/anexos e historico habituais. Conferir que Nova
Solicitacao ainda usa somente Despesa Administrativa e que usuario sem permissao
ou sem acesso ao destino nao consegue criar. Nao publicar em producao sem pedido.
