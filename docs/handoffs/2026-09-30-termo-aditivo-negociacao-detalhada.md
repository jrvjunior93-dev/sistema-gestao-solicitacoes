# Termo aditivo — Negociacao Detalhada obrigatoria

## Objetivo

Exigir um documento de Negociacao Detalhada em cada nova solicitacao de termo aditivo, sem
substituir a negociacao original do contrato e sem invalidar aditivos historicos.

## Regras implementadas

- O modal exige um arquivo `.pdf` ou `.docx` antes de liberar `Solicitar aditivo`.
- O endpoint recebe `multipart/form-data` e o backend recusa o pedido quando o arquivo nao existe.
- O perfil seguro ja usado pela negociacao do contrato limita extensao, MIME, tamanho e aplica as
  validacoes de conteudo/antivirus configuradas no ambiente.
- Cada documento e gravado em `contrato_anexos` com tipo
  `NEGOCIACAO_DETALHADA_ADITIVO` e `aditivo_id`; ele nao substitui o documento original do contrato.
- A lista de aditivos mostra `Abrir documento`, usando a rota segura de presign e o mesmo controle
  de acesso por contrato.
- A criacao recebeu chave de idempotencia para evitar aditivos duplicados por duplo envio/retry.
- Aditivos antigos permanecem validos e aparecem sem documento, pois a nova coluna e anulavel e
  nao existe backfill artificial.

## Migration

`backend/migrations/202609300001_contrato_aditivo_negociacao.js`

Migration somente estrutural: adiciona `contrato_anexos.aditivo_id`, chave estrangeira com
`ON DELETE SET NULL` e indice por aditivo/tipo. Nao insere nem atualiza dados existentes.

## Arquivos principais

- `frontend/src/components/contratos/ModalAditivoContrato.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/AditivosDoContrato.jsx`
- `frontend/src/services/contratos.js`
- `backend/src/controllers/ContratoFluxoNovoController.js`
- `backend/src/services/contratoAditivoService.js`
- `backend/src/models/ContratoAnexo.js`
- `backend/src/models/index.js`
- `backend/src/routes.js`
- `backend/migrations/202609300001_contrato_aditivo_negociacao.js`

## Validacoes executadas

- `npm run test:contrato-aditivo-negociacao`
- `npm run test:contrato-aditivo-vigencia`
- `npm run test:roteamento-aditivo-juridico`
- `node --check` nos arquivos backend alterados
- migration validada por `assertMigrationSourceIsSchemaOnly`
- `cd frontend && npm run build`
- `git diff --check`

## Implantacao

Aplicar a migration antes de reiniciar o backend. Sem a coluna, o novo model nao consegue listar
nem gravar a negociacao do aditivo. Nao houve escrita em banco nem deploy nesta etapa; commit e
push da implementacao foram autorizados pelo usuario em 2026-09-30.
