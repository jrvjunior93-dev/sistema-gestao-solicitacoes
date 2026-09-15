# Handoff - contratos multiunidade e importacao legada

## Estado

Backport isolado preparado sobre `origin/main` na branch `codex/release-comercial-main`. Nenhuma migration, carga de dados, backfill, reinicio, deploy ou operacao em producao foi executada.

## Escopo implementado

- relacionamento normalizado entre contrato comercial e uma ou mais unidades, mantendo leitura compativel com o campo legado;
- `Valor da Unidade` sugerido a partir do cadastro, editavel, com total do contrato calculado pela soma das unidades;
- bloqueio inicial da marcacao manual `VENDIDA`, com configuracao administrativa booleana;
- modelo XLSX versionado, previa sem criar dados funcionais, validacoes de seguranca e confirmacao atomica/idempotente;
- criacao minima de cliente inexistente como cadastro incompleto, sem sobrescrever cadastro existente;
- criacao de titulos, parcelas e realizacoes historicas sem conta bancaria, conciliacao ou caixa atual;
- anexo posterior e protegido contra duplicidade do PDF de contrato assinado;
- consumidores de unidades atualizados em documentos, relatorio operacional e portal;
- vencimento editado no titulo financeiro refletido na parcela, nos indicadores e na sugestao de inadimplencia do contrato;
- permissao granular `comercial.vendas.importar`.

## Arquivos principais

- migration estrutural `202609030053` e novos modelos de importacao/multiunidade em `backend/src/models/`;
- `backend/src/services/comercialService.js`;
- `backend/src/services/comercialContratoImportacaoService.js`;
- `backend/src/services/comercialContratoDocumentoService.js`;
- `backend/src/services/tituloFinanceiroService.js`, limitado ao acionamento da sincronizacao comercial;
- controllers, rotas, validators, autorizacao e scripts comerciais relacionados;
- `frontend/src/pages/ComercialContratos.jsx`;
- `frontend/src/pages/ComercialUnidades.jsx`;
- `frontend/src/pages/Parceiros.jsx`;
- `frontend/src/components/comercial/ComercialContratoImportacaoPanel.jsx`;
- `frontend/src/services/comercial.js` e `frontend/src/utils/acessoProduto.js`;
- `docs/modulos/comercial/IMPORTACAO_CONTRATOS_LEGADOS.md`.

## Validacoes executadas

- validador dedicado da importacao comercial no backend;
- `npm run test:comercial-titulo-vencimento` no backend;
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

Revisar o commit isolado desta branch. Com autorizacao separada para producao: criar backup, publicar o codigo, aplicar a migration protegida, simular o backfill, revisar o resultado e somente entao decidir pela aplicacao do backfill. A primeira importacao do sistema legado deve ser controlada e acompanhada.
