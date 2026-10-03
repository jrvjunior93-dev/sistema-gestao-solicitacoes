# VGV privado pelo valor base das unidades — refactor/frontend

## Estado

Implementado em `C:\Fluxy-refactor-frontend` para a branch `refactor/frontend`. Nao requer migration. O documento preexistente `docs/GUIA_REFATORACAO_FRONTEND_COLABORADOR_E_HOMOLOGACAO.md` e `outputs/` nao fazem parte desta alteracao.

## Regra

Obras privadas com VGV manual positivo preservam o valor informado. Quando o VGV esta nulo ou zero, a consulta soma o `valor_base_venda` de todas as unidades ativas e nao excluidas dos empreendimentos ativos vinculados a obra, inclusive unidades vendidas. Nenhum valor e gravado na obra. Se nao houver unidades, ou se alguma unidade nao tiver base positiva, o VGV nao e calculado; a tela informa a pendencia e `Falta receber` permanece baseado no saldo dos titulos. O Valor tabela nao e utilizado.

O resultado financeiro e a gestao de obras usam o VGV efetivo para o valor de referencia e `Falta receber`. As telas exibem a origem do calculo e mantem o campo editavel da obra com o valor cadastrado original. A barra de recebimento declara e usa a mesma base do indicador (VGV, planilha geral ou titulos).

## Arquivos

- `backend/src/services/obraVgvService.js`
- `backend/src/controllers/ResultadoObrasController.js`
- `backend/src/services/obraGestaoService.js`
- `backend/scripts/validarVgvUnidadesObra.js`
- `frontend/src/pages/FinanceiroResultadoObras.jsx`
- `frontend/src/pages/Obras.jsx`
- `docs/workspace/OWNERSHIP_ATIVO.md`

## Validacoes

- `node backend/scripts/validarVgvUnidadesObra.js` — passou (manual, calculado, incompleto, publica).
- `node backend/scripts/validarResultadoObrasHistorico.js` — passou.
- `npm run build` em `frontend/` — passou.
- `git diff --check` — passou.

## Risco e proximo passo

Sem acesso ao banco da EC2 nesta etapa, a cobertura dos valores base das unidades de cada obra deve ser conferida antes de publicar. Se o VGV calculado for menor que o recebido, `Falta receber` sera negativo conforme a regra ja existente de VGV menos recebido. Confirmar o frontend publicado e os indicadores com dados reais apos a atualizacao da EC2.
