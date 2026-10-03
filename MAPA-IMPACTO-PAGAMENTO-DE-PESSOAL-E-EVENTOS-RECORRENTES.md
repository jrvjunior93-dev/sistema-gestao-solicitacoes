# Mapa de impacto — pagamento de pessoal e eventos recorrentes

Data: 25/08/2026. Escrito **antes da primeira linha de código**.

Origem: pedido do cliente em 25/08, durante a Fase 2.

> *"A solicitação de pagamento de pessoal pode ser de forma individual direto no colaborador ou
> através de um formulário onde a obra vai ter listados todos os colaboradores e poderá informar a
> jornada trabalhada, acréscimos e descontos, e o sistema faz os cálculos para pagamento. E o
> sistema precisa estar preparado para controle de coisas como vale alimentação, descontos
> programados de vale, pensão alimentícia e outros que podem acontecer de forma recorrente sem que
> o usuário precise ficar lembrando de cada um ou fazendo controles paralelos."*

---

## 1. Metade disto já está construída

### 1.1 O formulário coletivo já tem estrutura e cálculo

`rh_apuracoes` é a folha de uma **obra numa competência** (`competencia` no formato `YYYY-MM`,
`obra_id`, `dias_base` = 30, totais, status `RASCUNHO`). `rh_apuracao_eventos` é **uma linha por
colaborador** dentro dela:

`dias_trabalhados` · `faltas` · `horas_extras` · `valor_base_calculo` · `valor_bruto` ·
`valor_descontos` · `ajuste_credito_manual` · `ajuste_debito_manual` · `valor_liquido`

> É exatamente *"um formulário onde a obra tem listados todos os colaboradores e informa a jornada,
> acréscimos e descontos"*. **A tabela é o formulário.**

E o cálculo existe em `rhApuracaoService`:

```
CLT:      proporcional aos dias + (horas extras × valor-hora × 1,5) + adicionais + créditos
NÃO CLT:  valor informado, ou proporcional aos dias, + adicionais + créditos
líquido:  bruto − descontos
```

### 1.2 Para onde o dinheiro vai também existe

`rh_colaborador_pagamentos` guarda banco, agência, conta, tipo de conta, **chave PIX** (com
secundária e variável) e nome/documento do favorecido.

### 1.3 E o fechamento já vira título financeiro

`rhFechamentoService` cria `TituloFinanceiro` a partir da apuração, com categoria e obra.

> **Nada disso nunca foi usado**: zero apurações, zero fechamentos. A estrutura está de pé e fria.

---

## 2. O que falta — e é aqui que está o pedido

| Falta | Hoje |
|---|---|
| **A tela do formulário** | a entrada só existe por **planilha** (`rhImportacaoService`, tipo `JORNADA`). Não há tela onde a obra digite |
| **O pedido individual** | não existe pagamento avulso de um colaborador só |
| **Os eventos recorrentes** | **não existe nada.** `ajuste_credito_manual` e `ajuste_debito_manual` são dois números digitados à mão, todo mês |

### 2.1 O controle paralelo que o cliente quer eliminar

Hoje, para pagar corretamente um colaborador, alguém precisa lembrar, **de cabeça ou numa planilha
à parte**:

- que ele recebe vale alimentação todo mês;
- que ele pegou adiantamento e está na **4ª de 6 parcelas**;
- que ele tem pensão alimentícia;
- que o plano de saúde dele desconta tanto.

E digitar a soma de tudo isso em `ajuste_debito_manual`. **Um número só, sem memória do que o
compõe.** Se a pessoa errar, ninguém descobre; se ela sair de férias, o substituto não tem como
saber. É exatamente o *"controle paralelo"* citado.

---

## 3. O que proponho construir

### 3.1 `rh_eventos_recorrentes` — a regra, não o lançamento

Uma linha por acordo permanente com o colaborador:

| Campo | Para quê |
|---|---|
| `colaborador_id` | de quem |
| `codigo` | `VALE_ALIMENTACAO`, `VALE_TRANSPORTE`, `PLANO_SAUDE`, `DESCONTO_ADIANTAMENTO`, `PENSAO_ALIMENTICIA`, `OUTRO` |
| `descricao` | o nome que aparece no holerite e na tela |
| `natureza` | `CREDITO` ou `DESCONTO` |
| `forma` | `VALOR_FIXO` ou `PERCENTUAL` |
| `valor` / `percentual` | quanto |
| `base_percentual` | sobre o quê incide (ver §4.2) |
| `competencia_inicio` / `competencia_fim` | de quando até quando (`fim` nulo = enquanto durar) |
| `parcelas_total` | quantas vezes ao todo — **nulo = indefinido** |
| `ativo` | desligar sem apagar o histórico |

> **O adiantamento parcelado é o caso que justifica a tabela inteira.** `parcelas_total = 6` e o
> sistema para sozinho na sexta. Ninguém precisa lembrar de desligar — que é o pedido literal.

### 3.2 `rh_apuracao_evento_itens` — o lançamento, não a regra

Cada linha da folha passa a ter os itens que a compõem, em vez de dois números cegos:

`apuracao_evento_id` · `evento_recorrente_id` (nulo se for avulso) · `codigo` · `descricao` ·
`natureza` · `valor` · `parcela_numero` · `origem` (`RECORRENTE` / `MANUAL` / `PLANILHA`)

Com isso, `ajuste_credito_manual` e `ajuste_debito_manual` deixam de ser digitados e passam a ser
**a soma dos itens** — e a tela pode abrir a soma e mostrar de onde cada centavo veio.

### 3.3 As três entradas do pagamento

| Entrada | Como |
|---|---|
| **Coletiva** | a obra abre a competência e a tela lista os colaboradores **da obra dela** (usando o vínculo da Fase 1), com os recorrentes **já aplicados**; ela informa jornada e o que for avulso |
| **Individual** | pedido de pagamento direto no colaborador, que gera uma apuração de um só |
| **Planilha** | continua funcionando — `rhImportacaoService` já entende `JORNADA` |

---

## 4. Onde isto pode errar dinheiro

Esta seção é a razão de o mapa existir antes do código.

### 4.1 Recalcular a folha não pode consumir a parcela duas vezes

A apuração nasce `RASCUNHO` e **vai ser recalculada** — a obra corrige um dia de falta e manda
apurar de novo. Se a contagem de parcelas for um contador que incrementa a cada cálculo, o
adiantamento de 6 parcelas acaba em 3 recálculos.

> É o mesmo defeito que apareceu em 24/08 na cascata da medição: **o que é recomputação não pode
> ser tratado como evento.** Lá o valor da parcela virou fonte de si mesmo e o dinheiro foi parar
> na parcela errada, com a soma certa.

**Como evita:** `parcela_numero` é **derivado**, não incrementado — conta quantas competências
**distintas e não canceladas** já receberam aquele evento. Recalcular a mesma competência devolve o
mesmo número. A suíte apura, recalcula três vezes e exige que continue na mesma parcela.

### 4.2 Percentual precisa dizer sobre o quê incide

`PENSAO_ALIMENTICIA` quase nunca é valor fixo — é percentual. E percentual **de quê** muda o
resultado e tem peso legal: do bruto, do líquido, ou de uma base específica definida na sentença.

Pior: se a pensão é percentual do líquido e existe também um desconto de vale, **a ordem dos
descontos muda o valor da pensão**.

**Como evita:** `base_percentual` é explícito (`BRUTO`, `LIQUIDO_ANTES_DESCONTOS_VARIAVEIS`, ...) e
os descontos são aplicados em **ordem declarada**, não na ordem em que foram cadastrados. E a
resposta de qual base usar **é do cliente** — está no §6.

### 4.3 Quem saiu no meio do mês não pode receber o recorrente inteiro

Colaborador demitido dia 10 não recebe vale alimentação do mês inteiro — e, dependendo do acordo,
não recebe nada.

**Como evita:** o vínculo da Fase 1 já responde "ele estava na obra em que parte do período".
A suíte demite no meio da competência e exige que o recorrente **não seja aplicado cheio**. A regra
de proporcionalidade por evento precisa da resposta do §6.

### 4.4 O desconto não pode deixar o líquido negativo

Vale + pensão + plano podem superar o salário de um mês com muitas faltas.

**Como evita:** o cálculo trava e **avisa**, em vez de gerar título negativo. Um título negativo
vira crédito no financeiro e não é o que ninguém quis. A suíte monta esse cenário e exige a recusa
com mensagem clara.

### 4.5 Mudar a regra não pode reescrever o passado

Se o valor do vale mudar de R$ 300 para R$ 350, as folhas já fechadas **continuam com R$ 300**.

**Como evita:** o item lançado (`rh_apuracao_evento_itens`) guarda o **valor aplicado**, copiado, e
não um apontamento vivo para a regra — mesma razão de `contrato_parcelas.valor_previsto` e de
`favorecido_chave_pix` existirem no fluxo de contratos.

---

## 5. Onde isto entra no plano

O pedido atravessa duas fases já previstas e acrescenta uma:

| Fase | Situação |
|---|---|
| 1 — Vínculo com vigência | **pronta** — e é o que responde "quem estava na obra no período" |
| 2 — Pedido e decisão | **em andamento** — admissão, demissão, troca de obra |
| **4 — Jornada e pagamento** | **cresce**: ganha a tela do formulário, o pedido individual e os **eventos recorrentes** |
| 7 — Custo por obra | passa a ter de onde sair |

> Recomendo **não** interromper a Fase 2 para fazer isto. O pagamento depende do vínculo (pronto) e
> se beneficia do fluxo de pedido (Fase 2, em andamento) — fazer na ordem custa menos do que
> intercalar. Se a urgência do pagamento for maior que a da admissão/demissão, é decisão sua e eu
> troco a ordem.

---

## 6. Respostas do cliente — 25/08

| # | Pergunta | Resposta | O que muda |
|---|---|---|---|
| 1 | Base da pensão alimentícia | **Standby.** É valor **informado**, que reduz o valor final. Normalmente já vem da contabilidade no contracheque | **§4.2 deixa de existir por ora** |
| 2 | Vale alimentação | **Crédito pago à parte** — recarga no cartão ou pago direto ao colaborador | não entra no líquido do salário |
| 3 | Recorrente é proporcional? | **Não. Recorrente desconta todos os meses**, valor cheio | some a regra de proporcionalidade |
| 4 | Quem cadastra | **Obra solicita, DP valida e confirma** | vira mais um tipo de pedido |

### 6.1 A nº 1 corta a parte mais perigosa do desenho

O §4.2 existia porque percentual sobre líquido cria dependência de ordem entre descontos, com peso
legal. **Com a pensão sendo valor informado, esse risco sai inteiro do escopo.**

Consequência prática: `forma` nasce só com `VALOR_FIXO`. O campo `percentual` e o `base_percentual`
**não entram agora** — entram no dia em que aparecer um evento que realmente precise deles, com o
mapa próprio. Adiantar estrutura para um caso que o cliente colocou em standby é construir
complexidade sem cliente.

### 6.2 A nº 2 exige uma distinção que eu não tinha previsto

*"Pago à parte"* significa que o vale alimentação **não reduz nem aumenta o líquido do salário** —
ele é um pagamento próprio, por cartão ou direto.

Mas ele **é custo da obra** e precisa aparecer no custo por obra (Fase 7). Se eu o somasse ao
líquido, o colaborador receberia o vale dentro do salário e a recarga do cartão pagaria de novo:
**pagamento em dobro**.

Por isso o evento recorrente ganha um campo que eu não tinha desenhado:

| Campo | Significado |
|---|---|
| `entra_no_liquido` | `true` = mexe no valor a pagar do salário; `false` = pagamento próprio, à parte |

| Evento | `natureza` | `entra_no_liquido` |
|---|---|---|
| Vale alimentação | `CREDITO` | **`false`** — pago à parte |
| Desconto de adiantamento | `DESCONTO` | `true` |
| Pensão alimentícia | `DESCONTO` | `true` |
| Plano de saúde | `DESCONTO` | `true` |

### 6.3 A nº 3 simplifica o cálculo

Recorrente é valor cheio todo mês, independente de faltas. Some o `§4.3` como regra de cálculo —
**mas continua valendo como regra de vínculo**: quem foi demitido não recebe mais, porque o vínculo
está encerrado. A suíte continua provando isso.

### 6.4 A nº 4 encaixa o recorrente no fluxo da Fase 2

*"Obra solicita e DP valida e confirma"* é exatamente o pedido → decisão que a Fase 2 está
construindo. Então **cadastrar um evento recorrente é mais um tipo de pedido**, e não uma tela de
cadastro à parte:

`ADMISSAO` · `DEMISSAO` · `TROCA_OBRA` · **`EVENTO_RECORRENTE`** · `ALTERACAO_SALARIAL` (Fase 5)

> Isso confirma a decisão de arquitetura da Fase 2 de um jeito que eu não esperava: o motor de
> pedido do DP nasce servindo quatro coisas, não três. Se eu tivesse forçado tudo na tabela
> `solicitacoes`, o evento recorrente — que não tem valor nem apropriação — seria o caso mais
> desconfortável de todos.

**Nenhuma linha do pagamento foi escrita.** O que segue agora é a Fase 2.
