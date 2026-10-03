# Mapa de impacto — ajustes finais da medição do contrato do fluxo novo

Data: 20/08/2026. Escrito antes da primeira linha de código (regra §6).

Cinco pedidos, na ordem em que você mandou:

1. na solicitação de medição, sumir **Valor**, **Data de vencimento** e **Descrição** — e deixar de
   exigi-los;
2. **Data inicial / Data final da medição** sobem para o topo do card *Medição — títulos do contrato*;
3. o botão **Medicao N** no card do Financeiro passa a permitir **editar valor e vencimento**, e o
   valor alterado recalcula as outras parcelas pela regra da última para a penúltima;
4. a solicitação do contrato precisa ir para **NEC. DE MEDIÇÃO** — ficou `APROVADA`;
5. baixado o título da medição, volta para **APROVADA**; quitados todos, vira **PAGA**.

---

## 1. Por que os três campos não fazem sentido ali

Não é só arrumação de tela. No fluxo novo, **a medição não cria solicitação** (PI-16): ela é um
evento da solicitação única do contrato — `SolicitacaoController` intercepta e chama
`registrarMedicaoDoContrato`. Ou seja, `valor`, `descricao` e `data_vencimento` do formulário são
coletados, validados... e **descartados**. O valor real vem da soma das parcelas marcadas, e o
vencimento vem de cada parcela.

Então o ajuste tem duas metades, e a segunda é a que importa:

- **tela**: esconder os três campos quando a medição é de contrato do fluxo novo;
- **backend**: parar de EXIGIR os três nesse caso. As validações de `campoObrigatorio('valor')`,
  `('descricao')` e `('data_vencimento')` rodam **antes** da interceptação da medição — se só a tela
  parasse de mandar, a criação passaria a responder 400 e a medição ficaria impossível.

> É o mesmo erro que já cometi na abertura de contrato acima do limite: movi a exigência para o
> documento e deixei a checagem antiga do texto no lugar, tornando impossível criar contrato.
> Registrado nas armadilhas.

Contrato **legado** não muda: ele continua criando solicitação própria para a medição, e lá os três
campos continuam valendo.

## 2. O período da medição sobe para o card

`Data inicial (Medição)` e `Data final (Medição)` são hoje um par solto no meio do formulário,
longe da tabela de parcelas que eles datam. Passam para o topo do `BlocoMedicaoContrato`, antes da
linha de saldo.

Só no fluxo novo. Fora dele o par continua onde está, porque o card não existe.

O estado continua sendo o mesmo (`form.data_inicio_medicao` / `data_fim_medicao`) — o card recebe
valor e `onChange`, e não passa a ter estado próprio. Duplicar o estado faria a validação de período
(`validarPeriodoMedicao`, MD-8) conferir um valor e o envio mandar outro.

## 3. Editar a medição

Rota nova: `PUT /contratos/medicoes/:id`, com `itens: [{ contrato_parcela_id, valor_medido, vencimento }]`.

**Quem pode:** `contratos.medicao.editar_valor` (estrita). A chave já existe no cadastro de
permissões, e a descrição dela é exatamente este caso: *"Permite alterar o valor da parcela depois
que a solicitação de medição foi criada."* Hoje ela não é usada em lugar nenhum.

**O que impede:** parcela cujo título já tem baixa (`valor_baixado > 0`) ou está quitado. Alterar o
valor de um título já pago reescreveria o passado do financeiro. Nesse caso, 409 com o motivo.

### A regra da redistribuição — última para penúltima

Hoje, em `aplicarMedicaoNasParcelas`, a diferença vai para **a última parcela editável** e, se ela
não comporta, o sistema **recusa**:

```
if (destino.cent + diferencaCent < 0) throw erro('...excede o saldo disponivel na parcela N');
```

Você pediu o contrário: consumindo toda a última, **continua na penúltima**. Passa a ser uma cascata
de trás para frente, e só recusa quando acabam as parcelas.

Os destinos são as parcelas **ainda não medidas** (sem vínculo de medição ativo), da última para a
primeira. Parcela de outra medição não pode receber nem ceder: ela já tem trabalho pedido, e mexer
nela mudaria o valor de uma medição que ninguém pediu para mudar.

Invariante mantida (MD-7): a soma das parcelas do contrato continua igual ao valor contratado, e a
transação inteira volta se não fechar.

Em cadeia, cada mudança arrasta o título junto (`sincronizarTituloDaParcela`) — parcela e financeiro
não podem divergir.

## 4 e 5. O status da solicitação do contrato

Hoje o contrato vira `ATIVO`, a solicitação vira `APROVADA` e **fica lá**: medir não muda nada, e a
baixa cai na regra genérica do sistema, que diria `PARCIALMENTE PAGO`.

Passa a valer, **só para a solicitação de contrato do fluxo novo**:

| Evento | Status |
|---|---|
| Medição registrada (ou editada) com título em aberto | `NEC. DE MEDIÇÃO` |
| Título da medição baixado, e ainda há contrato por medir/pagar | `APROVADA` |
| Todos os títulos quitados **e** nenhuma parcela por medir | `PAGA` |

`NEC. DE MEDIÇÃO` é um texto novo em `status_global` (varchar livre, como `NEC. DE ASSINATURA`, que
já é usado pelo mesmo fluxo). Não há enum para alterar.

### Onde entra, e por que não no serviço genérico

`sincronizarStatusSolicitacaoPorBaixaTitulos` é usado por **cinco** caminhos de baixa (pagamento,
cheque, boleto, fatura de cartão, conciliação) e vale para o sistema inteiro. Mudar o cálculo lá
mudaria o status de solicitação de compra, de reembolso, de tudo.

A regra do contrato entra como um **desvio explícito no início** dessa função: se a solicitação é a
de um contrato do fluxo novo, calcula pela tabela acima; senão, segue exatamente como sempre. Um
caminho, uma bifurcação nomeada — e não uma segunda função que alguém esquece de chamar em um dos
cinco pontos.

### O que fica pendente de decisão sua

**"Quitados todos os títulos" com contrato parcialmente medido.**

Um contrato de 5 parcelas com 1 medida: existe **um** título. Quitado ele, "todos os títulos estão
quitados" — mas faltam 4 parcelas para medir, e o contrato está longe de acabar. Marcar `PAGA` ali
diria que o contrato acabou.

Assumi: **`PAGA` só quando não há mais parcela por medir e nenhum título em aberto.** Enquanto
houver saldo do contrato por medir, o status volta para `APROVADA` depois da baixa — que é o que
você descreveu para o meio do caminho. Se a sua regra for o contrário (PAGA assim que os títulos
existentes forem quitados, mesmo com contrato por medir), é uma linha.

## 5.1 Achado durante o teste: o rateio de apropriação também não era da medição

Tirando o campo Valor, a criação passou a parar em *"Informe o valor total da solicitação para
validar o rateio das apropriações."* — o bloco **Apropriações do contrato** usa o Valor como base
para conferir a divisão.

Olhando de perto, ele estava na mesma situação dos outros três: o que é enviado ali é **descartado**
na medição do fluxo novo, e os títulos já nasceram com o rateio do **contrato**, na aprovação. O
bloco pedia de novo, com base num valor que não existe mais, uma divisão que já está feita. Ele só
continuava de pé porque o campo Valor existia para sustentá-lo.

Some junto, e deixa de ser exigido. Fora da medição do fluxo novo — inclusive na abertura de
contrato — ele continua exatamente como era.

## 6. O que pode quebrar

| Risco | Verificação |
|---|---|
| Medição do fluxo novo virar impossível (400 por campo obrigatório) | Suíte cria medição sem valor/descrição/vencimento, pela tela |
| Medição de contrato **legado** perder os campos | Suíte cria medição de contrato legado e exige os três campos |
| Redistribuição furar a invariante MD-7 | Suíte soma as parcelas antes e depois de cada edição |
| Cascata parar na penúltima quando devia continuar | Suíte edita valor que consome a última inteira e sobra |
| Editar medição com título já baixado | Suíte tenta e exige 409 |
| Editar sem permissão | Suíte tenta e exige 403 |
| Status de outras solicitações mudar | Suíte baixa título de solicitação comum e exige `PARCIALMENTE PAGO` como antes |
| `PAGA` cedo demais | Suíte quita a única medição de um contrato com parcelas por medir e exige `APROVADA` |

## 7. Suíte

`qa/medicao/33-medicao-edicao-e-status.js`

---

## 8. Resultado

`qa/medicao/33-medicao-edicao-e-status.js` — **19 provas, passou.**

| Prova | Resultado |
|---|---|
| Criar medição pela rota, sem valor/descrição/vencimento | 201, e sem criar solicitação (PI-16) |
| Contrato **legado** sem os três campos | 400 — continua exigindo |
| Depois de medir | `NEC. DE MEDIÇÃO` |
| Editar sem `contratos.medicao.editar_valor` | 403 |
| Editar para menos (2.500 → 1.500) | a última subiu de 2.500 para 3.500 |
| Editar para mais (1.500 → 5.500) | última zerou e a **penúltima cedeu R$ 500** — a cascata |
| Total do contrato depois de cada edição | R$ 10.000, inalterado (MD-7) |
| Vencimento alterado | chegou ao título |
| Editar parcela com título baixado | 409 |
| Baixa do título | volta a `APROVADA` |
| Segunda medição aberta | `NEC. DE MEDIÇÃO` de novo |
| Tudo quitado, nada por medir | `PAGA` |
| Solicitação comum com baixa parcial | `PARCIALMENTE PAGO`, como sempre |

Regressão: **04, 06, 07, 08, 09, 11, 12, 15, 16, 17, 18, 19, 21, 22 e 26** seguem passando.

### Duas correções que a suíte forçou

**1. "Título em aberto" não é a pergunta certa.** A primeira versão marcava `NEC. DE MEDIÇÃO`
enquanto existisse título com saldo. Só que no fluxo novo **todas** as parcelas viram título na
aprovação do contrato, não na medição — a solicitação ficaria em `NEC. DE MEDIÇÃO` desde a aprovação
e para sempre. A pergunta certa é sobre as parcelas **já medidas**: medição pedida esperando
pagamento.

**2. Parcela zerada não é "por medir".** Depois de uma cascata, a última parcela fica valendo R$
0,00 — ela existe como linha, mas o valor dela já foi para outra. Contá-la como pendente travaria o
contrato em `APROVADA` para sempre, porque ela nunca vai ser medida.

### A suíte 09 também mudou

Ela preenchia Valor, Descrição e Data de vencimento — e por isso nunca teria percebido que os três
não serviam para nada. Agora ela exige a **ausência** deles, confere que o período está dentro do
card e que o rateio não é pedido de novo. É a armadilha "suíte que monta o payload no lugar da tela",
do outro lado: preencher um campo é atestar que ele precisa existir.
