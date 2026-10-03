# Mapa de impacto — medição acima do saldo continua bloqueada, inclusive na última parcela

Data: 21/08/2026. Escrito antes da primeira linha de código (regra §6).

Pedido do cliente:

> "Medição com valor acima do saldo precisa continuar bloqueando mesmo que na última parcela. Para
> isso temos a solicitação de termo aditivo."

O ajuste de ontem (sobra na última parcela) afrouxou a redistribuição **para menos**. Isto aqui é a
contrapartida: **para mais** nada afrouxou, e o caminho para aumentar o contrato é o aditivo.

---

## 1. Onde a regra está hoje

### 1.1 Criar medição — guarda existe e está de pé

`aplicarMedicaoNasParcelas`:

```js
const saldo = await calcularSaldoDoContrato(contratoId, transaction);
const pedidoCent = lista.reduce((acc, i) => acc + paraCentavos(i.valor_medido), 0);
if (pedidoCent > saldo.saldo_cent) throw erro('O valor solicitado ... passa do saldo do contrato ...');
```

A suíte 35 já mediu isso na última parcela: pedir R$ 4.000 com saldo de R$ 2.500 responde 400. **Não
é o que está furado.**

### 1.2 Editar medição — não tem guarda de saldo

`atualizarMedicaoDoContrato` não consulta o saldo. Ele hoje se segura por construção: aumentar uma
medição tira das parcelas ainda não medidas, e a soma das medições nunca passa da soma das parcelas,
que nunca passa do contratado. Sem parcela de onde tirar, a cascata recusa.

Ou seja: o resultado está certo, mas **por consequência, não por regra escrita**. Uma mudança futura
na redistribuição derruba a garantia em silêncio, e não há nada no código dizendo qual era a
intenção.

Isso não é aceitável para a regra que o cliente acabou de nomear. A guarda passa a ser **explícita
nos dois caminhos**, com a mesma conta e a mesma mensagem.

## 2. O que muda

### 2.1 A edição confere o saldo, como a criação

Antes de aplicar, `atualizarMedicaoDoContrato` calcula quanto a medição passaria a comprometer e
compara com o saldo do contrato **desconsiderando a própria medição** — senão ela concorreria consigo
mesma: o valor que já está comprometido por ela seria contado duas vezes e qualquer edição para mais
seria recusada.

```
comprometidoPelasOutras = comprometido total − o que ESTA medição já compromete
disponível = contratado + aditivos − comprometidoPelasOutras
```

Recusa quando o novo total da medição passa do disponível.

### 2.2 As duas mensagens dizem o caminho

Hoje a recusa termina em "passa do saldo do contrato (R$ X). Ja comprometido: R$ Y." — informa, mas
não diz o que fazer. Passa a apontar o **termo aditivo**, que é a resposta do cliente para o caso.

É o mesmo princípio das outras telas desta implantação: a recusa que não diz o caminho vira chamado
de suporte.

## 3. O que NÃO muda

- **A sobra** (medir a última por menos) segue como ficou ontem: passa e vira saldo.
- **O teto do aditivo** — 25% acumulado sobre o valor original (PI-12/PI-13) — não é tocado. Ele
  continua sendo o limite de quanto o contrato pode crescer.
- **`calcularSaldoDoContrato`** já soma `valor_aditivos`, então aditivo aprovado abre saldo sozinho.
  Nada a fazer ali.

## 4. O que pode quebrar

| Risco | Verificação |
|---|---|
| Edição legítima passar a ser recusada | Suíte edita uma medição para mais, dentro do saldo, e exige que passe |
| A medição concorrer consigo mesma no cálculo | Suíte edita mantendo o mesmo valor e exige que passe |
| Criação acima do saldo deixar de bloquear | Suíte pede acima do saldo na última parcela e exige 400 |
| Edição acima do saldo passar | Suíte edita acima do saldo e exige recusa |
| Aditivo não abrir espaço | Suíte aprova aditivo e exige que a mesma medição passe depois |
| Teto do aditivo afrouxar | Suítes 14 e 16 seguem passando |

## 5. Suíte

`qa/medicao/36-saldo-bloqueia-medicao.js`

---

## 6. Resultado

`qa/medicao/36-saldo-bloqueia-medicao.js` — **14 provas, passou.**

Contrato de R$ 10.000 em 4 parcelas; três medidas cheias, sobrando a última com saldo de R$ 2.500.

| Prova | Resultado |
|---|---|
| Medir a última parcela por R$ 3.000 (saldo R$ 2.500) | 400, apontando o termo aditivo |
| A recusa mexeu nas parcelas | não |
| Medir exatamente R$ 2.500 | passa — a guarda barra o que passa, não o que encosta |
| Editar a medição mantendo o valor | passa — ela não concorre consigo mesma |
| Editar a medição para R$ 4.000 | 400, apontando o termo aditivo |
| Aditivo de R$ 3.000 (30%) | recusado pelo teto de 25% |
| Aditivo de R$ 1.500 (15%) | aceito e aprovado |
| Saldo depois do aditivo | R$ 1.500 |

Regressão: **04, 07, 09, 14, 16, 19, 33, 34 e 35** seguem passando.

## 7. A lacuna que a suíte encontrou — e que precisa da sua decisão

**Aprovar o aditivo abre saldo, mas não cria parcela.** E parcela é o que se mede.

`decidirAditivo` soma o valor em `contratos.valor_aditivos` — o saldo passa de R$ 0 para R$ 1.500 —
e para por aí. Nenhuma linha nova aparece na tabela de parcelas. Resultado medido:

- **medição nova**: não há parcela medível, então não há o que marcar;
- **editar uma medição para mais**: não há parcela de onde tirar a diferença, e a redistribuição
  recusa.

Ou seja: o dinheiro do aditivo fica **visível no saldo e inalcançável na prática**. A porta que você
apontou existe, mas não chega do outro lado.

Não implementei sozinho porque a forma de materializar esse valor é regra de negócio, e são pelo
menos três caminhos com consequências diferentes:

1. **O aditivo aprovado cria uma parcela nova** com o valor dele. É o que combina com o modelo — a
   parcela vira título e é medida como qualquer outra. Precisa decidir o **vencimento**: a nova
   vigência informada no aditivo? O vencimento da última parcela mais um período?
2. **O valor entra na última parcela em aberto**, aumentando-a. Não cria linha, mas mistura o
   contratado original com o aditivo numa parcela só — e some do relatório qual valor veio de onde.
3. **Várias parcelas**, se o aditivo tiver cronograma próprio. Mais fiel a aditivo grande, e o mais
   trabalhoso.

Minha recomendação é a **1**, com o vencimento vindo do aditivo (e, na falta dele, o da última
parcela mais um período). Ela mantém a rastreabilidade que o resto do fluxo já tem e não mexe em
nada que existe.

A suíte registra o estado real de hoje, com a lacuna nomeada — e a asserção muda junto quando você
decidir.
