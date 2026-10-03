# Mapa de impacto — parcelas de contrato do fluxo novo

Levantamento feito **antes** de escrever código, para definir a rota de implementação sem
retrabalho. Motivado por duas auditorias reprovadas onde o impacto real só apareceu depois.

---

## 1. O problema, medido

Requisito: parcelas de um contrato **não aprovado** não podem aparecer em nenhuma tela ou
relatório financeiro.

A primeira tentativa criou as parcelas como títulos com status próprio (`PREVISAO_CONTRATO`),
partindo da premissa de que "os filtros usam lista positiva, então um status novo é invisível".
**A premissa é falsa.** Varredura completa das consultas a `TituloFinanceiro` em `backend/src`:

| Forma de consulta | Qtde | Captura status novo? |
|---|---|---|
| **Sem nenhum filtro de status** | **34** | **Sim** |
| Filtro negativo (`Op.notIn`, `Op.ne`) | 8 | **Sim** |
| Lista positiva restritiva (`Op.in [...]`) | 11 | Não |
| **Total** | **53** | **42 vazam (79%)** |

Distribuídas por **46 arquivos**, em `services` (25), `controllers` (6), `models` (5) e
módulos de custos, fiscal, banking e governança.

Efeito comprovado em auditoria: um contrato de R$ 168.000 alterou **9 de 27 rotas
financeiras** sem nenhuma aprovação — Contas a Pagar (2.810 → 2.816 títulos), Resultado de
Obras (R$ 1 → R$ 168.001), e o Diagnóstico da DRE saindo de `ATENÇÃO` para `CRÍTICO`.

### Por que remendar não resolve

Corrigir os 42 pontos exigiria acertar todos hoje **e** garantir que ninguém escreva consulta
nova sem o filtro. Como 34 deles sequer mencionam status, o padrão natural do código é
justamente o que vaza. É manutenção perpétua de uma exceção.

---

## 2. Decisão de desenho

**As parcelas de contrato não aprovado não são títulos financeiros.**

Ficam em tabela própria (`contrato_parcelas`) e **viram títulos no momento da aprovação**.

| Consequência | Efeito |
|---|---|
| Não existe título antes da aprovação | Não há o que vazar — nas 53 consultas atuais **e nas futuras** |
| Nenhuma consulta financeira é alterada | Zero risco de regressão em dashboard, DRE, contas a pagar, conciliação |
| A aprovação passa a ser o ponto de criação | Semanticamente correto: título é compromisso firmado |
| Rejeição não deixa resíduo | Sem título criado, nada a excluir |

Isso elimina a classe do problema em vez de tratar seus casos.

### O que muda em relação ao combinado

O cliente descreveu "títulos de previsão que mudam de status para Aberto após aprovação". O
comportamento visível é o mesmo — a parcela existe, é editável, tem status e vira título
aberto ao aprovar. O que muda é **onde** ela vive antes disso.

---

## 3. O que É afetado

| Item | Situação | Ação |
|---|---|---|
| `contrato_parcelas` | não existe | Criar (migration) |
| `contratoFluxoNovoService.criarContrato` | grava títulos | Passar a gravar parcelas |
| Status `PREVISAO_CONTRATO` em títulos | introduzido na tentativa anterior | **Remover** — deixa de existir |
| Aprovação do contrato | não existe | Criar: parcelas → títulos, em transação |
| Rejeição do contrato | não existe | Criar: marca parcelas, sem tocar em títulos |
| `contratoParcelasService` | regras puras, já corrigidas | Reaproveitar sem alteração |
| `contratoCodigoService` | já auditado | Sem alteração |

## 4. O que NÃO é afetado

Importante para dimensionar o risco:

- **Nenhuma das 53 consultas a `TituloFinanceiro`** — nenhuma linha alterada
- Dashboard, DRE, Contas a Pagar, Conciliação, Fluxo de Caixa, Endividamento
- Os 335 contratos existentes e as 656 medições do fluxo antigo
- `titulos_financeiros` — nenhuma coluna nova, nenhum status novo

---

## 5. Rota de codificação

Sequência escolhida para que cada etapa seja verificável isoladamente e nenhuma dependa de
retrabalho da anterior.

| # | Etapa | Entrega | Depende de |
|---|---|---|---|
| 1 | Migration `contrato_parcelas` | Tabela com FK para contrato, número, valor, vencimento, status da parcela, título gerado, travamento | — |
| 2 | Ajustar `criarContrato` | Grava parcelas em vez de títulos; remove `PREVISAO_CONTRATO` | 1 |
| 3 | Prova de isolamento | Criar contrato e comprovar que as 27 rotas financeiras não mudam | 2 |
| 4 | Permissão `contratos.aprovacao.aprovar` | Sem bypass (D3/D4) | — |
| 5 | Aprovação | Parcelas → títulos `ABERTO`, em transação; grava aprovador e data | 1, 2, 4 |
| 6 | Rejeição | Marca parcelas como rejeitadas, motivo obrigatório; contrato volta para correção (D7) | 1, 2, 4 |
| 7 | Endpoints HTTP | Criar, aprovar, rejeitar | 2, 5, 6 |
| 8 | Tela | Wireframe 1 | 7 |

Etapas 1–3 fecham o vazamento. Etapas 4–6 fecham o ciclo de vida. Só então HTTP e tela.

### Pontos de verificação obrigatórios

| Etapa | O que provar |
|---|---|
| 3 | As 27 rotas financeiras idênticas antes/depois de criar contrato |
| 5 | Títulos criados corretamente **entram** no financeiro; transação atômica (todas ou nenhuma) |
| 5 | **SUPERADMIN sem a permissão é barrado** — senão a exceção de D3/D4 não existe na prática |
| 6 | Rejeição não cria nem altera nenhum título |

---

## 6. Dívida registrada

`redistribuir`, `validarVencimentoNaSolicitacao` e `validarAditivo` estão implementados e
testados, mas **nenhuma rota os chama ainda**. O teto de 25% é calculado corretamente e não é
imposto por nada. Isso se resolve nas etapas 5 e 7 — até lá, são regras sem consumidor.
