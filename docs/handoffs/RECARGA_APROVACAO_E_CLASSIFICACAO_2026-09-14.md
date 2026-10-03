# Handoff — Recarga, aprovação e classificação financeira

## Escopo concluído

- Aprovação por Tipo passou a listar e validar o status de chegada contra o catálogo ativo
  do GEO, mantendo o setor de destino apenas como destino do encaminhamento.
- A aprovação de uma Recarga de Cartão passou a abrir o título por causa do evento de
  aprovação, sem depender do nome do status escolhido.
- O cadastro de cartões recebeu Empresa responsável e Categoria financeira obrigatórias.
- Novos títulos de recarga recebem automaticamente empresa e categoria do cartão.
- Obra e apropriação continuam sendo determinadas pelos rateios da prestação de contas.
- Uma prestação legada pode completar empresa e categoria a partir do cadastro atual do
  cartão antes de liberar o custo para relatórios.

## Migration

- `backend/migrations/202609140001_cartao_recarga_classificacao_financeira.js`
- Adiciona, sem backfill e sem remoção destrutiva, `empresa_id` e
  `categoria_financeira_id` em `cartoes_recarga`, com índices e chaves estrangeiras.

## Validações executadas

- Sintaxe dos serviços, controllers, migration e script de Recarga: aprovada.
- `node backend/scripts/validarFluxosPixApropriacoesSolicitacao.js`: aprovado.
- `npm run build` no frontend: aprovado.

## Validação pendente após aplicar a migration no ambiente de homologação

1. Completar empresa e categoria dos cartões existentes.
2. Configurar um tipo com destino diferente do GEO e status `LIBERADO` do GEO.
3. Criar uma Recarga e confirmar título em `PREVISAO`.
4. Aprovar a solicitação e confirmar título em `ABERTO`, mesmo que o status escolhido tenha
   outro nome.
5. Baixar o título, enviar e validar a prestação; confirmar rateios, empresa e categoria.
6. Executar `npm run test:recarga-cartao` com rollback transacional.

## Risco operacional conhecido

Cartões legados sem Empresa e Categoria não podem originar uma nova recarga até que o
cadastro seja completado. A mensagem apresentada orienta essa correção e nenhum registro
existente é alterado automaticamente.
