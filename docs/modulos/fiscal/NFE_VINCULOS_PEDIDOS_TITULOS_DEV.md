# NF-e vinculada a pedidos e títulos — piloto DEV

Implementação local destinada a refactor/frontend. Não publicada/aplicada nesta
etapa. Produção, automático NSDOCS, dados financeiros e armazenamento XML intactos.

## Uso operacional

O painel **NF-e vinculadas a pedidos e títulos** aparece no pedido, no detalhe
fiscal e na consulta do título, respeitando as permissões existentes.

Compras pode selecionar uma NF-e já disponível no acervo e adicionar vários
pedidos da mesma solicitação ou de solicitações diferentes. A busca aceita PC e
código da solicitação. Para cada pedido, informar o valor da nota correspondente
e conferir as parcelas associadas. Uma confirmação registra o conjunto.

Uma nota também pode ser vinculada antes da geração dos títulos. Os títulos
futuros passam a consultar a referência do pedido. A interface diferencia essa
referência da associação explicitamente conferida para uma parcela. Não cria
títulos, baixa pagamentos, manifesta NF-e nem chama a NSDOCS.

O valor fiscal fica no vínculo com o pedido. Parcelas são referências: não
multiplicar o total da NF-e pelo número de títulos. Diferenças de valores ou
fornecedor geram avisos de acompanhamento. A empresa destinatária precisa
coincidir com a empresa devedora da obra do pedido e o cadastro fiscal vinculado;
conta pagadora não define a identidade fiscal. Dados de empresa ausentes ou
incoerentes impedem somente a associação incorreta, não o fluxo financeiro.

Títulos de frete a terceiro não são selecionados para a NF-e das mercadorias nem
herdam implicitamente suas referências. Títulos a receber/cancelados/estornados
não entram na associação nova. Títulos parciais/quitados podem receber evidência
sem alteração de saldos ou movimentos. Na renegociação, a leitura acompanha a
cadeia de títulos de origem, com indicação explícita, sem transferir vínculos.

**Encerrar vínculo** exige motivo e confirmação. Não exclui registros/XML nem
estorna valores. Uma revisão posterior fica identificada no histórico. Vínculos
legados compatíveis são reaproveitados, preservando autor original e registrando
o estado anterior. Duplicidades legadas ambíguas exigem conferência específica.
Vínculos antigos por item permanecem no histórico/área de outros vínculos.

## Criação dos títulos por Compras

Pedido aberto mostra a próxima ação: **Fechar com o fornecedor e preparar
títulos**, somente para quem já pode alterar o status e gerar títulos. Reutiliza
o endpoint e as validações de fechamento existentes, com confirmação explícita.
Depois, o formulário de criação fica disponível no mesmo contexto. O GEO não é
acionado nesta etapa; posteriormente faz o envio para autorização/fila.

Cada pedido usa seus próprios títulos e chave de idempotência. Frete já titulado
sozinho não oculta/bloqueia a criação dos títulos de mercadorias. Permanecem as
proteções contra recriar obrigação ativa do mesmo pedido e contra títulos avulsos
não revisados. Esta entrega não altera a política de reabertura ou baixa.

## Permissões e integridade

- Leitura fiscal: canViewFiscalDocuments; pedidos: permissões de pedidos e de
  consulta financeira, escopo de obras/visibilidade de Compras existentes.
- Escrita: fiscal.document.link mais a permissão existente de anexar documentos
  financeiros do pedido. Nenhuma concessão de perfil/permissão é automática.
- Consulta por título reutiliza carregarTituloPorId, incluindo escopo completo
  de títulos compartilhados/renegociados.
- Backend confere pedido, solicitação, empresa e pertencimento de cada título.
  Não infere associação por fornecedor, número de documento ou valor apenas.
- Transação, lock da NF-e/pedidos e índice único por documento/chave do vínculo.
  UUID idempotente é associado ao autor/conteúdo; confirmação desatualizada é
  recusada. Falha na auditoria reverte o conjunto, sem sucesso parcial.
- Eventos fiscais guardam autor, motivo e estados anteriores/posteriores. Não
  alteram status fiscal, assinatura do XML, vencimentos, baixas ou fila.
- Referências de arquivos continuam usando as rotas existentes de URL assinada.

## Contrato técnico

- GET /api/fiscal/purchase-links/orders?q=PC-00025 (ou pedido_id exato).
- GET /api/fiscal/purchase-links?document_id=... (ou pedido_id/titulo_id; um filtro).
- POST /api/fiscal/documents/:id/purchase-links, Idempotency-Key UUIDv4:
  revision da conferência, motivo e pedidos[{pedido_id,valor,titulo_ids}].
- POST /api/fiscal/documents/:id/purchase-links/:pedidoId/end: revision e motivo,
  com UUID próprio para a operação. Repetição deve manter corpo/chave.

Limites: 30 pedidos e 100 associações a títulos por confirmação. Consulta de
vínculos é limitada a 500 registros; conjuntos maiores exigem recorte por pedido.
Busca de pedidos retorna até 20 resultados, com has_more para refinar a busca.
Pedidos diferentes não são obrigados a pertencer à mesma solicitação, mas devem
ser autorizados e compatíveis com a mesma empresa destinatária da NF-e.

## Schema e liberação futura

Migration aditiva **202610240002_fiscal_vinculos_pedidos.js**: somente colunas
nullable purchase_link_key/allocated_value e índice único em fiscal_document_links.
Não reescreve vínculos antigos; down é bloqueado para preservar evidências.

A migration precisa ser conferida/aplicada no DEV antes de reiniciar o backend
com o model novo, pois as consultas fiscais passam a selecionar as colunas.
Preparar roteiro de deploy dedicado quando houver autorização de publicação;
não reutilizar operadores anteriores que possuem manifesto fechado de arquivos.
Backend/schema DEV devem estar prontos antes de publicar o frontend DEV. Nada
desta documentação autoriza deploy/migration/restart em produção.

## Validação local

- Backend: npm run test:fiscal-vinculos-pedidos — SQLite real em memória para
  transação/índice/histórico e fixtures para criação dos títulos/antirrepetição.
- Frontend: npm run test:fiscal-vinculos-pedidos — Chrome com componentes e
  controllers reais, API local e SQLite; layouts/autenticação são adaptadores QA.
- Regressão de datas: npm run test:fiscal-emissao; histórico e XML preservados.

Não equivalem a homologação real de concorrência MySQL, IAM/S3 ou perfis do DEV.
Testar esses comportamentos no piloto antes de qualquer promoção futura.
