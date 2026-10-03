# Mapa de impacto — medir a última parcela por menos deixa sobra no contrato

Data: 21/08/2026. Escrito antes da primeira linha de código (regra §6).

Decisão do cliente, respondendo à pendência que deixei em `MAPA-IMPACTO-PARCELA-JA-MEDIDA.md`:

> "Se na última parcela o valor medido for menor do que o previsto não vai ter problema porque vamos
> saber que o contrato não usou tudo e podemos encerrar o contrato e eliminar esse saldo restante."

Ou seja: **a medição menor passa**, a diferença fica como saldo do contrato, e quem trata a sobra é
o **encerramento** — que é a operação que já existe para isso.

É a opção 2 das duas que apresentei. A 1 (erro explícito) está implementada agora e sai.

---

## 1. O que está no caminho hoje

Depois da correção de ontem, `redistribuirNasUltimas` **lança** quando não há parcela livre para
receber a diferença:

```js
if (destinos.length === 0) throw erro(`Nao ha outra parcela em aberto para receber a diferenca...`);
```

Medindo a última parcela livre por menos, todas as outras já foram medidas — não há destino, e a
medição é recusada. É exatamente o caso que você quer permitir.

## 2. O que muda

### 2.1 Diferença que sobra deixa de ser erro — quando ela é devolução

A distinção importa e não pode se perder:

| Sinal da diferença | O que significa | Sem destino |
|---|---|---|
| **positiva** (mediu MENOS que a parcela valia) | dinheiro voltando | vira **sobra do contrato** |
| **negativa** (mediu MAIS) | dinheiro sendo buscado nas outras parcelas | continua **erro** |

Medir mais do que existe não pode virar sobra ao contrário — isso inventaria dinheiro. A guarda de
saldo (`pedidoCent > saldo.saldo_cent`) já barra a maior parte desses casos antes; a recusa na
redistribuição fica como a segunda linha.

`redistribuirNasUltimas` passa a **devolver** quanto sobrou em vez de lançar, e só nesse sentido.

### 2.2 A invariante MD-7 passa a admitir a sobra — declarada, não implícita

Hoje a checagem é dura:

```js
if (totalDepoisCent !== totalAntesCent) throw erro('Falha interna na redistribuicao...', 500);
```

Ela existe para pegar **bug de cálculo**, e é boa. Passa a ser:

```
totalDepois === totalAntes - sobra
```

com `sobra` somada explicitamente a partir do que a redistribuição devolveu. Continua sendo erro 500
qualquer centavo que suma sem ter sido declarado como sobra — que é o que a checagem existe para
proteger.

### 2.3 O saldo do contrato já mostra a sobra sozinho

`calcularSaldoDoContrato` faz `valor_total + aditivos − comprometido`, e `comprometido` é a soma das
medições. **Não depende da soma das parcelas.** Então, medida a última por menos, o saldo já passa a
exibir a diferença — sem nenhuma mudança ali. É o "vamos saber que o contrato não usou tudo".

### 2.4 O histórico diz que sobrou

A medição que gera sobra registra o valor no histórico. Sem isso, a diferença aparece só como um
número no saldo, e ninguém saberia de qual medição ela veio.

### 2.5 Vale nos dois caminhos

Tanto ao **criar** a medição quanto ao **editar** uma existente (`atualizarMedicaoDoContrato`). A
regra é a mesma e a função de redistribuição é a mesma — não há como uma divergir da outra.

## 3. O que NÃO muda

- **Encerramento**: já zera o saldo, exclui título em aberto e fecha título parcial pelo valor pago.
  A sobra é exatamente o que ele trata. Nada a fazer ali.
- **`valor_previsto`**: continua imutável (PI-5). É por ele que a tela mostra "previsto R$ X" ao lado
  do valor menor — a leitura de que o contrato não usou tudo.
- **Parcela já medida** continua fora da fila e fora dos destinos (correção de ontem).

## 3.1 Dois achados durante o teste

### A edição da medição tinha o mesmo furo da criação, ainda aberto

`atualizarMedicaoDoContrato` protegia do destino só as parcelas **daquela** medição
(`excluir: idsDaMedicao`). As de **outras** medições continuavam elegíveis — e a suíte pegou: ao
editar a última medição para menos, a diferença foi parar na parcela 3, que pertencia à medição 3.
Valor da parcela muda, `valor_medido` da medição dona não muda junto.

É a mesma corrupção que corrigi na criação em 20/08, e eu tinha deixado metade do caminho feito.
Agora as duas rotas excluem **toda** parcela com vínculo ativo do contrato.

### Contrato encerrado continuava mostrando saldo

O saldo é `valor_total + aditivos − comprometido`, e `valor_total` não muda no encerramento. Então,
depois de encerrar, a tela seguia exibindo "Saldo: R$ 1.000" num contrato que não vai receber mais
nada — o oposto de "eliminar esse saldo restante".

Contratado e comprometido continuam reais, para o relatório. O que zera é **o que ainda se pode
gastar**: contrato `ENCERRADO` (ou inativo) passa a ter saldo `0`.

## 4. O que pode quebrar

| Risco | Verificação |
|---|---|
| Sobra virar buraco silencioso no total | Suíte confere `soma das parcelas == contratado − sobra`, com a sobra medida |
| Medir MAIS sem destino deixar de ser erro | Suíte tenta e exige recusa |
| Sobra não aparecer no saldo | Suíte confere o saldo do contrato depois da última medição |
| Redistribuição normal parar de redistribuir | Suítes 04, 07, 33 e 34 seguem passando |
| Encerramento não limpar a sobra | Suíte encerra o contrato e exige saldo zero |
| Sobra na EDIÇÃO da medição não funcionar | Suíte edita a última medição para menos e confere |

## 5. Suíte

`qa/medicao/35-sobra-na-ultima-parcela.js`

---

## 6. Resultado

`qa/medicao/35-sobra-na-ultima-parcela.js` — **13 provas, passou.**

Contrato de R$ 10.000 em 4 parcelas de R$ 2.500; três medidas pelo valor cheio, sobrando a última.

| Prova | Resultado |
|---|---|
| Medir a última livre por R$ 1.800 | aceito, com `sobra: 700` na resposta |
| Soma das parcelas | R$ 9.300 — encolheu exatamente pela sobra |
| Saldo do contrato | R$ 700 |
| Histórico | *"O contrato nao usou R$ 700.00, que ficam como saldo ate o encerramento"* |
| Medir MAIS do que o contrato tem | recusado |
| Editar a mesma medição para R$ 1.500 | aceito, sobra R$ 300; saldo vai a R$ 1.000 |
| A diferença da edição foi para outra medição | **não** — a 3 ficou intacta |
| Encerrar o contrato | saldo zera |

Regressão: **04, 06, 07, 08, 09, 14, 16, 19, 21, 22, 33 e 34** seguem passando.
