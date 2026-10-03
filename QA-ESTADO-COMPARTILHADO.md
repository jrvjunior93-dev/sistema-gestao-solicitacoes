# Varredura: o que as suítes de QA escrevem em estado compartilhado

Data: 20/08/2026. Feita depois de **duas** ocorrências reais no mesmo dia, em que a limpeza de uma
suíte corrompeu dados que o cliente estava usando.

## Por que esta varredura existe

| # | O que aconteceu | Efeito na tela |
|---|---|---|
| 1 | Suítes zeravam `contrato_codigo_sequencias` | `Duplicate entry 'CT-0001-15'` — 500 ao criar contrato |
| 2 | Uma linha de `PERMISSOES_AREAS_USUARIOS` ficou para trás | **26 usuários** com zero permissões granulares |

As duas têm a mesma causa: **a limpeza impunha um estado em vez de devolver o que havia.**

E as duas ficaram invisíveis pelo mesmo motivo: o `finally` só imprimia um aviso, e a suíte seguia
dizendo `PASSOU`.

---

## Regras que passaram a valer

1. **Limpeza devolve o estado; não impõe um.** Nada de `SET x = 0`, nada de `DELETE ... WHERE NOT
   (<uma linha>)`. Capturar antes, restaurar depois.
2. **Restaurar pelo id que a suíte inseriu**, nunca por `id > (máximo de antes)`. Com uma linha já
   vazada, o "máximo de antes" **é** a linha vazada: a suíte apaga a sua e a errada fica mandando.
3. **Conferir que voltou.** Restaurar sem verificar é torcer.
4. **Limpeza que falha reprova a suíte** (`process.exitCode = 1`).

Helpers: `qa/lib/sequenciaContrato.js` e `qa/lib/permissoesConfig.js`.

---

## Achados, por risco

### 🔴 ALTO — `obra_tipo_apropriacao_padrao`

`qa/obra-tipo-apropriacao/04-visual.js`, `06-apropriacao-inativa.js`, `07-reauditoria.js`:

```sql
DELETE FROM obra_tipo_apropriacao_padrao WHERE NOT (obra_id=21 AND tipo_solicitacao_id=1)
```

**Apaga a configuração inteira menos uma linha.** É o padrão exato que causou os dois incidentes.

**Estado hoje:** a tabela tem **1 linha, 1 obra**.

Não afirmo que essas suítes causaram isso — não há registro do estado anterior, e é possível que só
uma obra tenha sido configurada. **Vale conferir com o cliente se é esperado.** O que é certo é que
o padrão de limpeza pode destruir a configuração e ninguém perceberia.

### 🟠 MÉDIO — `PERMISSOES_AREAS_USUARIOS` nas suítes antigas

`qa/contratos-aprovacao/lib/comum.js` e as versões `-v2` a `-v5` usam

```js
DELETE FROM configuracoes_sistema WHERE chave='PERMISSOES_AREAS_USUARIOS' AND id > CONFIG_BASE_ID
```

Mesmo defeito já corrigido nas suítes de `medicao`. `CONFIG_BASE_ID` é capturado no carregamento do
módulo — se uma linha já tiver vazado, ela vira a base e sobrevive.

**Estado hoje:** só a linha `37` (a real, 26 usuários). Limpo.

### 🟠 MÉDIO — cadastros ligados e desligados durante o teste

| Suíte | Mexe em | Restaura? |
|---|---|---|
| `contratos-aprovacao-v2/05`, `/12` | `categorias_financeiras.ativo` (ids 48 e outra) | sim, no `finally` |
| `contratos-aprovacao-v2/05` | `financeiro_formas_pagamento.ativo` | sim |
| `contratos-aprovacao-v3/01b`, `-v4/01` | `apropriacoes.ativo` (somadora) | sim |
| `medicao/23` | `apropriacoes.ativo` (1661) | sim |
| `auditoria-d38/04` | `tipo_solicitacao.comportamento` do tipo **8** | sim |

Restauram — mas **se a suíte morrer antes do `finally`**, o cadastro fica no estado do teste. Com
`tipo_solicitacao` isso muda o comportamento de uma tela inteira.

**Estado hoje:** categorias 46/48/49 ativas, nenhuma forma de pagamento inativa, apropriação 1661
inativa (original), tipo 8 com comportamento preenchido. Tudo no lugar.

### 🟡 BAIXO

- `titulo_financeiro_sequencias` (`contratos-aprovacao*/lib/db.js`): restaura o valor capturado —
  padrão correto.
- `schema_migrations` (`contratos-estrutura/06-migration-temp.js`): apaga uma linha nominal, de uma
  migration temporária do próprio teste.
- `users`, `parceiros`: as suítes criam e apagam os seus.

---

## Estado conferido em 20/08

| Tabela | Estado |
|---|---|
| `contrato_codigo_sequencias` | alinhado com o maior código existente |
| `PERMISSOES_AREAS_USUARIOS` | só a linha real (37), 26 usuários |
| `categorias_financeiras` 46/48/49 | ativas |
| `financeiro_formas_pagamento` | nenhuma inativa |
| `apropriacoes` 1661 | inativa (original) |
| `tipo_solicitacao` 8 | comportamento preenchido |
| `obra_tipo_apropriacao_padrao` | **1 linha — conferir se é o esperado** |

---

## Pendências

1. **Conferir com o cliente** se `obra_tipo_apropriacao_padrao` com uma linha é o esperado.
2. Trocar o `DELETE ... WHERE NOT (...)` das suítes de `obra-tipo-apropriacao` por captura e
   restauração.
3. Migrar as suítes `contratos-aprovacao*` para `qa/lib/permissoesConfig.js`.
4. Levar a regra de "limpeza que falha reprova" para as pastas fora de `medicao` que ainda não têm.
