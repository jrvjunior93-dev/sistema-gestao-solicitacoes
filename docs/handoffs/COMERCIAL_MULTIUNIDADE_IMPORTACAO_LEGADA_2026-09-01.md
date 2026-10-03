# Handoff - contratos multiunidade e importacao legada

## Estado

Implementacao integrada sobre a `refactor/frontend`, preservando as alteracoes mais recentes dessa branch. Nenhuma migration, carga de dados, backfill, reinicio, deploy ou operacao em producao foi executada.

## Escopo implementado

- relacionamento normalizado entre contrato comercial e uma ou mais unidades, mantendo leitura compativel com o campo legado;
- valor cadastrado exibido como referencia e valor real obrigatorio por unidade;
- bloqueio inicial da marcacao manual `VENDIDA`, com configuracao administrativa booleana;
- modelo XLSX versionado, previa sem criar dados funcionais, validacoes de seguranca e confirmacao atomica/idempotente;
- criacao minima de cliente inexistente como cadastro incompleto, sem sobrescrever cadastro existente;
- criacao de titulos, parcelas e realizacoes historicas sem conta bancaria, conciliacao ou caixa atual;
- anexo posterior e protegido contra duplicidade do PDF de contrato assinado;
- consumidores de unidades atualizados em documentos, relatorio operacional e portal;
- permissao granular `comercial.vendas.importar`.

## Arquivos principais

- migration estrutural `202609030053` e novos modelos de importacao/multiunidade em `backend/src/models/`;
- `backend/src/services/comercialService.js`;
- `backend/src/services/comercialContratoImportacaoService.js`;
- `backend/src/services/comercialContratoDocumentoService.js`;
- controllers, rotas, validators, autorizacao e scripts comerciais relacionados;
- `frontend/src/pages/ComercialContratos.jsx`;
- `frontend/src/pages/ComercialUnidades.jsx`;
- `frontend/src/pages/Parceiros.jsx`;
- `frontend/src/components/comercial/ComercialContratoImportacaoPanel.jsx`;
- `frontend/src/services/comercial.js` e `frontend/src/utils/acessoProduto.js`;
- `docs/modulos/comercial/IMPORTACAO_CONTRATOS_LEGADOS.md`.

## Validacoes executadas

- validador dedicado da importacao comercial no backend;
- `npm run test:docs` no backend;
- `npm run test:cpf-cnpj` no backend;
- `npm run test:security-hardening` no backend;
- `npm run build` no frontend;
- verificacao de sintaxe dos JavaScript alterados;
- verificacao estrutural, de formulas e renderizacao visual do modelo XLSX.

## Riscos e pontos de homologacao

- a migration precisa anteceder o backend novo;
- o backfill de contratos existentes deve ser simulado e revisado antes da aplicacao;
- a primeira carga deve usar dados controlados e conferir contratos, unidades, clientes, titulos, parcelas, realizacoes, relatorios e portal;
- o arquivo inteiro e confirmado em uma unica transacao; qualquer inconsistencia bloqueante desfaz a carga;
- a integracao legada desabilitada do catalogo de modulos nao deve ser reativada por este fluxo.

## Proximo passo exato

Com autorizacao operacional separada para escrita no ambiente de desenvolvimento: aplicar a migration estrutural protegida, executar o backfill em modo de simulacao, revisar o resultado e somente entao decidir pela aplicacao do backfill e por uma importacao de homologacao. Producao permanece fora do escopo.
