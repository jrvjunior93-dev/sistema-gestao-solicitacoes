# Mapa de impacto — prazo vencido bloqueia a medição, e o aditivo de prazo reabre

Data: 21/08/2026. Escrito antes da primeira linha de código (regra §6).

Pedido do cliente:

> "Quando na última parcela ainda tem saldo que não vai ser todo medido e o prazo do contrato acabou,
> o sistema deverá informar ao usuário que para medir novamente o contrato é preciso solicitar um
> aditivo de prazo, e o sistema abrir uma nova parcela — ou ele informar quantas parcelas ele precisa
> para esse mesmo saldo, o sistema gerar essas novas parcelas, permitindo ele editar o valor e o
> vencimento conforme a regra do sistema mesmo."

Dois pedidos numa frase: **avisar** quando o prazo acabou, e um aditivo que **só estende o prazo**,
redistribuindo o saldo que já existe.

---

## 1. Hoje a vigência não é olhada em lugar nenhum da medição

`contratos.vigencia_fim` é gravado na criação e usado só para exibição e para o aditivo estender.
`aplicarMedicaoNasParcelas` confere ordem de vencimento, status da parcela, parcela já medida e
saldo — **nunca o prazo**. Um contrato vencido em janeiro continua aceitando medição em dezembro, em
silêncio.

Alcance: os 335 contratos legados têm `vigencia_fim` nulo e não passam por este serviço. Os 4 do
fluxo novo têm vigência preenchida. A guarda só existe quando há data — contrato sem prazo definido
não é bloqueado por um prazo que ninguém informou.

## 2. O que muda

### 2.1 Prazo vencido bloqueia a medição, dizendo o caminho

Medir num contrato cuja `vigencia_fim` já passou é recusado com a data e a saída:

> A vigência do contrato terminou em 10/01/2027. Para medir de novo, solicite um termo aditivo de
> prazo.

A conferência entra junto da guarda de saldo, no mesmo ponto de `aplicarMedicaoNasParcelas` — as duas
respondem à mesma pergunta ("este contrato ainda pode receber medição?") e separá-las faria uma
esquecer o que a outra sabe.

**Editar uma medição já criada continua permitido.** Corrigir o valor de algo que já foi medido
dentro do prazo não é medir de novo — e travar isso deixaria um erro de digitação sem conserto.

### 2.2 Um terceiro tipo de aditivo: `PRAZO`

Os dois de ontem tratam de dinheiro novo. Este não: o dinheiro **já está no contrato**, parado nas
parcelas que ninguém mediu.

| Tipo | Dinheiro novo | Prazo | Parcelas |
|---|---|---|---|
| `VALOR` | sim | não muda | valor entra na última livre, ou nasce uma com o mesmo vencimento |
| `VALOR_E_VIGENCIA` | sim | estende | nascem N parcelas com o valor do aditivo |
| **`PRAZO`** | **não** | **estende** | o **saldo que já existe** é redistribuído em N parcelas |

`PRAZO` exige nova vigência e quantidade de parcelas; **não** exige valor — e recusa se algum valor
for informado, porque o aditivo de prazo não acrescenta dinheiro. Ele também não consome o teto de
25%, pelo mesmo motivo: não há valor a limitar.

### 2.3 O que a aprovação de um aditivo de PRAZO faz

1. estende `vigencia_fim` do contrato;
2. pega o **saldo livre** — a soma das parcelas ainda não medidas;
3. deixa esse saldo distribuído em **exatamente N parcelas**, com vencimentos entre o fim antigo e a
   nova vigência, a N-ésima caindo na nova vigência.

O passo 3 **reaproveita as parcelas livres que já existem** e cria só a diferença. Zerar as antigas e
criar N do zero deixaria linhas de R$ 0,00 com título aberto de R$ 0 — lixo que alguém teria de
limpar depois. Reaproveitando, o contrato termina com N parcelas livres somando o mesmo saldo, que é
o que você descreveu, e nenhum título órfão.

Se o usuário pedir **menos** parcelas do que as livres que existem, as que sobram **somem**: nunca
tiveram medição nem pagamento, e o saldo delas já foi para as que ficaram. O título é excluído antes,
com motivo, como o encerramento já faz.

Depois disso as parcelas são livres: valor e vencimento editáveis pelas regras normais, que é o
"conforme a regra do sistema mesmo".

### 2.4 Sem saldo livre, não há o que redistribuir

Contrato com tudo medido e prazo vencido: um aditivo de `PRAZO` não teria valor nenhum para colocar
nas parcelas novas. É recusado na solicitação, dizendo que nesse caso o aditivo precisa ser de valor.

## 3. O que NÃO muda

- **Teto de 25%**: `PRAZO` não tem valor, então não entra na conta. Os outros dois seguem iguais.
- **Teto de 24 parcelas**: vale para os três.
- **Contrato legado**: sem `vigencia_fim` e sem `contrato_parcelas` — nada aqui o alcança.
- **Encerramento**: continua sendo o caminho para desistir do saldo em vez de estender o prazo.

## 4. O que pode quebrar

| Risco | Verificação |
|---|---|
| Contrato sem vigência passar a ser bloqueado | Suíte mede contrato sem `vigencia_fim` e exige que passe |
| Contrato dentro do prazo ser bloqueado | Suítes 33–37 seguem passando (vigência em dez/2026) |
| Editar medição antiga travar por prazo vencido | Suíte vence o contrato e edita uma medição existente |
| `PRAZO` aceitar valor | Suíte informa valor e exige recusa |
| Saldo mudar na redistribuição | Suíte soma as parcelas livres antes e depois |
| Parcela órfã ou título de R$ 0 | Suíte confere que não há parcela zerada com título aberto |
| Aditivo de prazo sem saldo livre | Suíte tenta e exige recusa |
| Teto de 25% ser consumido pelo prazo | Suíte pede prazo e depois valor no teto cheio |

## 5. Suíte

`qa/medicao/38-prazo-vencido-e-aditivo-de-prazo.js`

---

## 6. Resultado

`qa/medicao/38-prazo-vencido-e-aditivo-de-prazo.js` — **17 provas, passou.**

| Prova | Resultado |
|---|---|
| Contrato **sem** vigência definida | mede normalmente — não se bloqueia por prazo que ninguém informou |
| Contrato dentro do prazo | mede normalmente |
| Prazo vencido | 400: *"A vigência do contrato CT-0006 terminou em 15/08/2026. Para medir de novo, solicite um termo aditivo de prazo."* |
| Editar medição já criada com o prazo vencido | permitido |
| Aditivo de `PRAZO` com valor informado | recusado, apontando o aditivo de valor |
| Aditivo de `PRAZO` sem quantidade de parcelas | recusado |
| Aprovado | vigência estendida para 10/06/2027 |
| Saldo livre | R$ 9.200 antes e depois — só redistribuído |
| Parcelas livres | exatamente 2, a última em **10/06/2027** |
| Parcela zerada com título aberto | nenhuma |
| Medição depois do aditivo | volta a funcionar |
| Sem saldo por medir | aditivo de prazo recusado, apontando o de valor |
| Teto de 25% | intocado: R$ 0 usado, R$ 3.000 disponíveis |

Regressão: **04, 06, 07, 08, 09, 14, 15, 16, 19, 21, 33, 34, 35, 36 e 37** seguem passando.

### Uma correção que o teste forçou

A primeira versão **zerava** as parcelas livres que sobravam quando o usuário pedia menos parcelas do
que existiam. Uma linha de R$ 0,00 continua contando como "parcela livre" em toda consulta que
pergunta o que falta medir — a suíte contou 3 parcelas livres onde deviam ser 2 — além de aparecer na
tela sem servir para nada. Agora elas são removidas, com o título excluído antes e com motivo.
