# Mapa de impacto — o aditivo passa a gerar parcela

Data: 21/08/2026. Escrito antes da primeira linha de código (regra §6).

Decisão do cliente, fechando a lacuna de `MAPA-IMPACTO-SALDO-BLOQUEIA-MEDICAO.md` §7:

> "Na tela de solicitar o aditivo precisa ser obrigatório informar se o aditivo é só de valor ou de
> nova vigência também. Se for só de valor e a última parcela estiver comprometida cria-se uma nova
> parcela com o mesmo vencimento da última porque o prazo final do contrato não alterou. E se tiver
> aditivo de vigência ele precisa informar o número de novas parcelas que precisam ser criadas de
> acordo com o prazo, assim o sistema não fica perdido e ele pode depois editar a data de vencimento
> da parcela de acordo com a necessidade de medição."

Hoje o aditivo aprovado sobe `contratos.valor_aditivos` — o saldo abre — e **nenhuma parcela nasce**.
Como parcela é o que se mede, o dinheiro fica visível no saldo e inalcançável.

---

## 1. O que passa a existir

### 1.1 O tipo do aditivo, obrigatório

Duas opções, sem padrão silencioso:

| Tipo | O que o aditivo faz | O que a tela exige junto |
|---|---|---|
| `VALOR` | só acrescenta dinheiro; o prazo final não muda | nada além de valor e justificativa |
| `VALOR_E_VIGENCIA` | acrescenta dinheiro **e** estende o prazo | nova vigência final **e** quantas parcelas criar |

Sem escolha, o pedido não sai — nem pela tela, nem pela rota. O `tipo` é gravado no aditivo, e não
deduzido de "tem nova vigência preenchida?": deduzir transformaria um campo esquecido em decisão
tomada, e é o oposto do "obrigatório informar" que você pediu.

### 1.2 Colunas novas

`contrato_aditivos.tipo` (`VALOR` | `VALOR_E_VIGENCIA`) e `contrato_aditivos.qtde_parcelas`
(anulável — só o segundo tipo usa).

Migration na faixa `0050+` da convenção. Aditivos que já existem ficam com `tipo = 'VALOR'` quando
não têm nova vigência, e `VALOR_E_VIGENCIA` quando têm — é a leitura fiel do que foi pedido na época,
e nenhum deles gera parcela retroativamente (o gatilho é a **aprovação**, que já aconteceu).

## 2. O que a aprovação passa a fazer

### 2.1 Aditivo só de VALOR

O prazo não mudou, então nenhuma data nova aparece.

- **Última parcela ainda livre** (não medida): o valor **entra nela**. Não há razão para criar uma
  linha nova quando existe uma que ainda vai ser medida, e é o mesmo destino que a redistribuição já
  usa.
- **Última parcela comprometida**: nasce **uma parcela nova, com o mesmo vencimento da última** —
  literalmente o que você descreveu, e pela mesma razão: o prazo final do contrato não mudou.

### 2.2 Aditivo de VALOR E VIGÊNCIA

Nascem **N parcelas**, com N informado no pedido. O valor do aditivo é dividido entre elas em
centavos inteiros, com o resto na última — a mesma aritmética do rateio, para não sobrar centavo.

Os vencimentos são distribuídos entre o vencimento da última parcela existente e a nova vigência
final, com a N-ésima caindo **exatamente** na nova vigência. É um palpite razoável, não uma verdade:
você disse que a pessoa ajusta depois conforme a necessidade de medição, e a parcela nova nasce livre
justamente para isso.

O contrato também passa a valer até a nova vigência (`vigencia_fim`), o que a aprovação já fazia.

### 2.3 Título, quando o contrato já está ATIVO

Parcela sem título num contrato ATIVO seria uma linha que não dá para pagar. Então, se o contrato já
tem títulos, a parcela nova nasce com título, usando a **categoria financeira do contrato** — a mesma
que a aprovação aplicou a todas as outras.

Contrato ainda não aprovado: a parcela nova fica em previsão, como as demais, e ganha título junto na
aprovação.

### 2.4 O teto de 24 parcelas

O contrato tem teto de 24 parcelas (decisão de 17/08). O aditivo passa a respeitá-lo: pedir mais
parcelas do que cabem é recusado **na solicitação**, e não na aprovação — quem pede precisa saber na
hora, não depois de a Gerência analisar.

## 3. O que NÃO muda

- **Teto de 25% em valor** (PI-12/PI-13): intocado. Continua sendo o limite de quanto o contrato
  cresce, e é conferido na solicitação e de novo na aprovação.
- **Aditivo rejeitado**: não gera nada, como hoje.
- **Contrato legado**: continua abrindo solicitação própria para o aditivo. A geração de parcelas só
  vale para o fluxo novo — o legado não tem `contrato_parcelas`.
- **O bloqueio por saldo** da medição, de mais cedo hoje.

## 4. O que pode quebrar

| Risco | Verificação |
|---|---|
| Aditivo antigo quebrar por falta de `tipo` | Migration preenche os existentes; suíte confere a contagem por tipo |
| Aprovação duplicar parcela | Suíte aprova e conta as parcelas antes e depois |
| Valor do contrato divergir da soma das parcelas | Suíte confere `soma == contratado + aditivos` |
| Parcela nova nascer sem título em contrato ATIVO | Suíte confere o título e a categoria da parcela nova |
| Vencimento fora do prazo informado | Suíte confere que a última parcela cai na nova vigência |
| Teto de 24 parcelas ser furado | Suíte pede parcelas demais e exige recusa |
| Teto de 25% afrouxar | Suítes 14 e 16 seguem passando |
| Medição do valor do aditivo continuar impossível | Suíte mede a parcela nova depois de aprovada |

## 5. Suíte

`qa/medicao/37-aditivo-gera-parcela.js`

---

## 6. Resultado

`qa/medicao/37-aditivo-gera-parcela.js` — **18 provas, passou.**

Contrato de R$ 10.000 em 2 parcelas de R$ 5.000 (10/12/2026 e 10/01/2027).

| Prova | Resultado |
|---|---|
| Pedir aditivo sem informar o tipo | recusado |
| Aditivo de vigência sem a nova data final | recusado |
| Aditivo de vigência sem a quantidade de parcelas | recusado |
| `VALOR` com a última parcela **livre** | entra nela: parcela 2 vai a R$ 5.500, nenhuma linha nasce |
| O título da parcela 2 | acompanhou, R$ 5.500 |
| `VALOR` com a última **comprometida** | nasce a parcela 3, R$ 800, vencendo **10/01/2027** — junto com a última |
| A parcela nova | nasce com título `ABERTO`, na categoria 46 do contrato |
| **A lacuna** | fechada: a parcela nascida do aditivo foi medida |
| `VALOR_E_VIGENCIA` com 3 parcelas até 10/04/2027 | nascem 3, somando R$ 900, a última em **10/04/2027** |
| Soma das parcelas x contratado + aditivos | R$ 12.200 dos dois lados |
| Pedir 20 parcelas com 6 já existentes | recusado: *"o teto é 24… cabe em no máximo 18"* |

Regressão: **04, 07, 08, 09, 14, 15, 16, 17, 18, 21, 22, 33, 34, 35 e 36** seguem passando.

### As suítes 14, 15, 16 e 36 mudaram junto

Elas pediam aditivo sem `tipo`, que agora é obrigatório — e o teste de tela (15, 16) precisou
**clicar o rádio**, porque em `input[type=radio]` o React escuta o `click`, não o `value`. A 15 ganhou
uma prova nova: sem escolher o tipo, o envio fica bloqueado.

A **36** registrava a lacuna ("o aditivo abre saldo mas não cria parcela") como estado real de
então. Essa asserção foi substituída pelo comportamento novo: a parcela nasce, e a edição de medição
que ela provava ser recusada agora passa.
