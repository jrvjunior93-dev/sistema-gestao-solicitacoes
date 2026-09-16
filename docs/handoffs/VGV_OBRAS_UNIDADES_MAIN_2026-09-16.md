# VGV privado pelo valor base das unidades — preparo isolado main

## Estado

Backport isolado preparado no worktree `C:\Fluxy\outputs\main-financeiro-obras-comprometido`, a partir da `main` em `0016964b`. Nao requer migration.

## Escopo

Mesma regra da `refactor/frontend`: VGV manual positivo prevalece; na falta dele, somar exclusivamente `valor_base_venda` de todas as unidades ativas e nao excluidas de empreendimentos ativos vinculados a obra privada. Sem gravar na obra e sem usar Valor tabela. Com alguma unidade sem base positiva, nao usar soma parcial. O resultado e a gestao de obras compartilham o calculo; as telas distinguem VGV cadastrado, calculado e incompleto, mantendo o formulario com o valor cadastrado original.

## Arquivos

- `backend/src/services/obraVgvService.js`
- `backend/src/controllers/ResultadoObrasController.js`
- `backend/src/services/obraGestaoService.js`
- `backend/scripts/validarVgvUnidadesObra.js`
- `frontend/src/pages/FinanceiroResultadoObras.jsx`
- `frontend/src/pages/Obras.jsx`
- `docs/workspace/OWNERSHIP_ATIVO.md`

## Validacoes

- `node backend/scripts/validarVgvUnidadesObra.js` — passou.
- `node backend/scripts/validarResultadoObrasHistorico.js` — passou.
- `npm run build` em `frontend/` — passou.
- `git diff --check` — passou.

## Risco e proximo passo

Conferir os valores base e os empreendimentos vinculados de obras reais antes do deploy. Se o VGV calculado for inferior ao ja recebido, a regra existente de `Falta receber = VGV - recebido` produz valor negativo. Depois da atualizacao do backend, confirmar o frontend publicado e os indicadores com dados reais. Nenhuma migration necessaria.
