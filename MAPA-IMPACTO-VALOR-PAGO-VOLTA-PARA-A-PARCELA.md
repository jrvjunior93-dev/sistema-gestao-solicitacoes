# Mapa de impacto — o valor pago na baixa redefine a parcela do contrato

Data: 23/08/2026. Escrito **antes da primeira linha de código** (regra §6 do `PROTOCOLO-QA.md`).

Item **33** do lote (novo, pedido em 23/08, depois do plano fechado).

---

## 1. O pedido, na palavra do cliente

> "O Valor pago do titulo vai ser informado pelo financeiro então titulo pago vai receber o valor
> final que foi pago naquela parcela. Então se o titulo foi pago integralmente recebe status Quitado
> pela regra de baixa, se foi pago de forma parcial o titulo continua recebendo o status de pago e o
> valor vai para a ultima parcela conforme combinamos e esse status vem da baixa do titulo e se foi
> pago maior que o valor da parcela desconta da ultima parcela conforme combinamos. A informação do
> valor que foi pago no titulo vem da baixa do titulo."

Em uma frase: **quem dá a palavra final sobre quanto a parcela valeu é o Financeiro, na baixa** — e a
diferença entre o previsto e o pago some pela mesma cascata que já usamos na edição da medição
(da última para a penúltima).

---

## 2. O que foi verificado no código antes de propor

### 2.1 Existem **oito** lugares que mexem na baixa de um título

| Caminho | Onde |
|---|---|
| Baixa manual (a tela do Financeiro) | `tituloFinanceiroService.baixarTitulo` :3410 |
| Baixa agrupada de parcelados | `tituloFinanceiroService.baixarTitulosParceladosEmMassa` :3704 |
| Baixa por conciliação bancária | `tituloFinanceiroService.baixarTituloPorConciliacoes` :4042 |
| Cartão no ato | `tituloFinanceiroService.baixarTituloCartaoNoAto` :1339 |
| Pagamento bancário confirmado | `paymentBaixaService.confirmBaixaFromPaymentIntent` :253 |
| Retorno CAIXA (liquidação de boleto) | `boletoCaixaOperacaoService.aplicarBaixaFinanceiraPorLiquidacao` :792 |
| Cheque de terceiro | `chequeTerceiroService` :855 |
| Fatura de cartão | `faturaCartaoFinanceiroService.baixarFaturaCartao` :312 |
| **Estorno** (desfaz a baixa) | `tituloFinanceiroService.estornarMovimentoTitulo` :4170 |

Escrever a regra em cada um deles é garantia de divergência: um dia o contrato passaria a valer uma
coisa se pago por PIX e outra se pago por boleto.

### 2.2 Mas os oito passam por **um** ponto só

Todos chamam `solicitacaoFinanceiroStatusService.sincronizarStatusSolicitacaoPorBaixaTitulos` —
**inclusive o estorno**. E essa função já tem, desde 20/08, o desvio para a solicitação de contrato
do fluxo novo (:82), que despacha para `medicaoContratoService.sincronizarStatusDaSolicitacaoDoContrato`.

O comentário que está lá já dizia o porquê, e continua valendo palavra por palavra:

> "O desvio mora AQUI, e nao numa segunda funcao, porque esta e chamada por CINCO caminhos de baixa.
> Uma funcao paralela seria esquecida em pelo menos um deles."

**É nesse ponto que a regra nova entra.** Não em oito.

### 2.3 Pagar a mais está bloqueado hoje — no sistema inteiro

Dois pontos recusam com 400:

- `tituloFinanceiroService.baixarTitulo` :3444 — *"Valor da baixa nao pode ser maior que o saldo do titulo."*
- `paymentBaixaService` :196 — *"Valor do pagamento incompativel com saldo do titulo."*

### 2.4 O vocabulário de status do título

`ABERTO` → `PARCIAL` → `QUITADO`, calculado por `calcularStatusTitulo` (:3348). `PARCIAL` aparece na
tela como **"Parcialmente pago"** — que é o *"status de pago"* da fala do cliente.

### 2.5 A baixa já tinha juros, multa e desconto

`baixarTitulo` recebe os quatro campos separados e calcula `valor_quitacao = valor + juros + multa −
desconto`. Ou seja: o sistema **já** sabia registrar "paguei mais" e "paguei menos" — só que sem
nunca mexer na parcela do contrato. O que muda agora é o efeito, não o registro.

### 2.6 O título sabe qual parcela ele é

`contrato_parcelas.titulo_financeiro_id` (`ContratoParcela` :43). É por aí que se descobre, a partir
de um título qualquer do sistema, se ele é parcela de contrato — e todo o resto do Financeiro fica
intocado por não ter essa linha.

---

## 3. As três decisões do cliente (23/08)

| Pergunta | Resposta |
|---|---|
| Baixa **parcial**: o saldo do título continua cobrável? | **Não.** Fecha o título com o valor pago e a diferença vai para a última parcela |
| Que valor redefine a parcela? | **Só o principal** — sem juros, multa ou desconto |
| A trava de pagar a mais cai até onde? | **Só** para títulos de parcela de contrato do fluxo novo |

### Consequência da primeira resposta — precisa ser dita

Se a baixa parcial **fecha** o título, o Financeiro perde a possibilidade de **pagar um título de
contrato em duas vezes**. Hoje ele pode: baixa R$ 600 hoje, R$ 400 semana que vem, título fica
`PARCIAL` no meio do caminho.

Com a regra nova, a primeira baixa encerra o assunto e os R$ 400 viram saldo da última parcela — se
o Financeiro quisesse pagar o resto depois, teria de esperar a última parcela.

Está sendo implementado como o cliente decidiu. Se ele quiser as duas coisas, o caminho é uma
marcação **"este é o pagamento final desta parcela"** na tela de baixa: sem ela, comportamento de
hoje; com ela, a regra nova. Uma linha de decisão, não uma reescrita.

---

## 4. A regra, escrita como o sistema vai executar

### 4.1 Recomputação, não evento

A regra **não** é "ao baixar, aplique a diferença". É:

> **A parcela de contrato vale o que foi principal-baixado no título dela, quando esse título está
> encerrado.**

A diferença é decisiva. Uma regra de evento precisa acontecer **uma vez e exatamente uma vez** — e
com oito caminhos, mais estorno, mais reprocessamento de retorno bancário, isso não se sustenta:
executar duas vezes duplicaria o desconto na última parcela.

Uma **recomputação a partir do estado atual do título** é idempotente: rodar de novo dá o mesmo
resultado, e o estorno é só mais uma recomputação — o título volta a ter saldo, a parcela volta ao
que era, a cascata se desfaz sozinha. Nenhum código de "desfazer" precisa existir.

### 4.2 Quando a parcela é reescrita

| Estado do título | O que acontece com a parcela |
|---|---|
| `ABERTO`, nada baixado | nada |
| `PARCIAL` **com saldo em aberto** | nada — ainda não é o valor final |
| `PARCIAL` **fechado** (saldo zerado pela regra nova) | `parcela.valor = principal baixado` |
| `QUITADO` | `parcela.valor = principal baixado` |

### 4.3 A diferença e a cascata

`diferença = parcela.valor (antes) − principal pago`

| Sinal | Significado | Destino |
|---|---|---|
| Positiva | pagou **menos** | **soma** na última parcela (da última para a penúltima) |
| Negativa | pagou **mais** | **desconta** da última parcela, mesma ordem |
| Zero | pagou o previsto | nada |

É a mesma `redistribuirNasUltimas` da edição da medição — inclusive as duas exceções que já estão
provadas em suíte:

- **positiva sem destino** (esta *é* a última parcela): vira **saldo do contrato**, que o
  encerramento elimina. Regra de 21/08, suíte 35;
- **negativa sem destino**: **recusa**, porque consumiria mais do que o contrato tem. A porta é o
  **termo aditivo**. Regra de 21/08, suíte 36.

Destinos elegíveis excluem parcelas **já medidas** e **já pagas** — senão a redistribuição
corromperia medição alheia (regra de 20/08, suíte 34).

### 4.4 Onde a recusa acontece

Recusar no momento da sincronização seria tarde: a baixa já teria sido gravada.

Então a liberação de pagar a mais (§3, terceira decisão) precisa de uma **conferência prévia**, nos
dois pontos que hoje travam (§2.3):

1. o título é de parcela de contrato do fluxo novo? Se não → **trava continua valendo, como hoje**;
2. o excedente cabe na cascata? Se não → 400, dizendo que o caminho é o termo aditivo.

---

## 5. O que pode quebrar

| Risco | Por que é risco | Verificação |
|---|---|---|
| Título comum do Financeiro mudar de comportamento | A regra vive num ponto por onde passa **todo** título do sistema | Suíte baixa um título sem parcela de contrato e exige que nada mude — nem valor, nem trava de pagar a mais |
| Redistribuição aplicada duas vezes | Retorno bancário reprocessado, baixa em massa, estorno + nova baixa | A recomputação é idempotente; a suíte roda a sincronização **três vezes** e exige o mesmo resultado |
| Estorno deixar o contrato torto | O estorno passa pelo mesmo ponto, mas ninguém garantiu isso | Suíte baixa, confere a cascata, **estorna** e exige o contrato de volta ao estado anterior |
| Pagar a mais liberado onde não devia | A trava protege o Financeiro inteiro | Suíte tenta pagar a mais num título comum e exige o 400 de hoje |
| Excedente maior que o contrato | Abriria saldo do nada, furando o teto | Suíte tenta e exige recusa apontando o aditivo |
| Juros/multa entrarem no custo da obra | Encargo de atraso não é preço de serviço | Suíte baixa com juros e multa e exige que a parcela siga só o principal |
| Parcela já medida virar destino | Corromperia medição de terceiro | Suíte mede a última, baixa outra por menos, e exige que a sobra **não** entre na medida |
| Status da solicitação parar de andar | A regra roda **antes** do cálculo de status, no mesmo ponto | Suítes 33 e 42 seguem passando |

---

## 6. O que **não** muda

- Nenhum título fora de contrato do fluxo novo: nem valor, nem status, nem trava;
- `valor_previsto` da parcela — continua imutável, é a memória do que foi contratado;
- o registro de juros, multa e desconto na baixa — continua igual, só não vai para a parcela;
- as regras de medição, aprovação e aditivo;
- o contrato **legado**, que não tem `contrato_parcelas`.

---

## 7. Suíte

`qa/medicao/43-valor-pago-volta-para-a-parcela.js` — **21 provas, todas passando**: pagou menos,
pagou mais, pagou exato, título comum intocado, idempotência, estorno, excedente recusado apontando
o aditivo, e a absorção disponível conferida no número.

O que ela **não** cobre, e por quê: os oito caminhos de baixa montam payloads financeiros completos
(conta bancária, empresa pagadora, sessão de caixa). A regra não mora em nenhum deles — mora no
único ponto por onde todos passam, e é por esse ponto que a suíte entra. Cobrir os oito seria cobrir
oito montagens de payload, não oito regras.

---

## 8. O que a implementação revelou

### 8.1 O contrato contava o mesmo dinheiro duas vezes

`calcularSaldoDoContrato` soma o comprometido a partir de **`medicao_parcelas.valor_medido`**, e não
das parcelas. Reescrever só a parcela deixaria uma medição de R$ 2.500 comprometendo R$ 2.500 numa
parcela que custou R$ 2.000 — enquanto os R$ 500 já teriam ido para a última parcela, para serem
comprometidos **de novo** quando ela fosse medida.

O `valor_medido` da medição dona passou a acompanhar. `valor_anterior` não: é a referência de quanto
a parcela valia antes de ser medida pela primeira vez (PI-5).

### 8.2 O destino da cascata virava origem dela

Escrita como um laço único sobre as parcelas, a reconciliação se autodestruía: a cascata da parcela 1
subia a parcela 4 para R$ 3.000, o laço chegava na parcela 4, via que ela não batia com o
`valor_original` de R$ 2.500 do título dela e a "corrigia" de volta — jogando os R$ 500 na parcela 3.

O contrato fechava a soma certa **com a diferença no lugar errado**, que é o pior jeito de errar:
a invariante do MD-7 passava, e só uma prova que olhava *qual* parcela recebeu pegou.

A correção é fixar a lista de origens **antes** de qualquer cascata. No instante do retrato, toda
parcela que ninguém pagou vale exatamente o que o título dela cobra — `sincronizarTituloDaParcela`
mantém os dois iguais desde a criação —, então destino nunca vira origem.

### 8.3 O guarda de pagar a mais foi para junto da regra

A primeira versão duplicou o guarda nos dois serviços financeiros. Ele pergunta *"quanto as demais
parcelas têm para ceder"* — uma pergunta sobre o **contrato**. Duplicado lá, divergiria da cascata no
primeiro ajuste. Virou `liberarBaixaAcimaDoSaldo`, em `medicaoContratoService`, chamada pelos dois.


---

## 9. Regressão — 23/08

**Bateria 03 a 43 rodada inteira: todas passando.** O backend da 8100 foi reiniciado antes, para
não medir contra código velho — armadilha já registrada na Fase 2.

Uma ressalva honesta: na primeira passada a suíte **05** reprovou, e **não foi possível reproduzir**
— ela passou nas três execuções seguintes, e o detalhe da falha não ficou registrado porque o
coletor da bateria guardava só a primeira linha do veredito. O coletor passou a guardar a saída
inteira. Se voltar a acontecer, dessa vez haverá o que ler.
