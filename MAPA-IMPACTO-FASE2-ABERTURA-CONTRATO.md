# Mapa de impacto — Fase 2: abertura do contrato

Data: 23/08/2026. Escrito antes da primeira linha de código (regra §6).

Itens do plano: **1** (remover o subtipo), **2** (Valor antes da apropriação), **3+4** (remover a
tabela de contratados/favorecido), **6** (parcelas manuais com "+") e **7** (negociação detalhada em
todo contrato).

O **6 é o de maior risco do lote**: mexe na origem dos títulos financeiros.

---

## 1. Item 1 — o subtipo sai

O gatilho do fluxo novo **já é do tipo**: `comportamentoTipo.usa_fluxo_contrato_novo`. Removendo o
subtipo, nada fica órfão. O que muda:

- o campo Subtipo deixa de aparecer e de ser exigido quando o tipo usa o fluxo novo de contrato;
- `tipo_sub_id` deixa de ser enviado na criação.

**Consequência registrada:** a configuração de "campos por subtipo" (PI-13) deixa de valer para
CONTRATO — passa a valer a do tipo. Solicitações antigas com o subtipo gravado continuam legíveis:
nada é apagado.

O subtipo em si **não é excluído do cadastro**. Desativá-lo ou apagá-lo é decisão de dado, não de
código, e apagar quebraria a leitura das solicitações que já o referenciam.

## 2. Item 2 — Valor antes da apropriação

Hoje o campo Apropriação vem antes (linha ~2100) e o Valor depois (~2143). Trocar a ordem no JSX.
Sem mudança de regra.

## 3. Itens 3+4 — sai a tabela "Contratados e favorecido"

O bloco vive em `BlocoContratoFluxoNovo.jsx` (linha 274). Some inteiro, porque:

- o **contratado** já vem pelo campo **Credor** do formulário principal;
- o **favorecido** passa a ser informado **na medição** (Fase 3), com a chave PIX.

O `favorecido_id` do contrato deixa de ser preenchido na abertura. **A coluna fica** — os contratos
existentes têm favorecido gravado, e o cabeçalho ainda o exibe quando houver.

`contrato_credores` continua sendo alimentado com o credor principal: é dele que sai o Contratado do
cabeçalho e a conferência de cadastro acima do limite.

## 4. Item 7 — negociação detalhada em todo contrato

Hoje a exigência é `if (acimaDoLimite)`, na **aprovação**. Passa a valer para **todo** contrato do
fluxo novo, independentemente do valor.

A cobrança continua **na aprovação**, e não na criação, pelo motivo que já está escrito lá: a
criação é JSON e o arquivo sobe num segundo passo — no momento de criar, o servidor não tem o
documento em mãos. A tela cobra no envio para a pessoa não descobrir depois.

A validação contra arquivo malicioso (macro, objeto embutido, extensão) **não muda**.

## 5. Item 6 — parcelas manuais

### 5.1 O que existe hoje

`gerarPrevia(valorTotal, qtde, primeiroVencimento)` monta N parcelas mensais dividindo o valor em
centavos inteiros, com a sobra na última. Editar o valor de uma parcela redistribui a diferença nas
**últimas**, espelhando o backend.

### 5.2 O que passa a existir

- **Some** a geração automática por quantidade;
- entra um botão **"+"** que acrescenta uma parcela por vez;
- ao acrescentar, o valor é **redividido entre as parcelas não travadas**;
- cada parcela ganha uma **trava**. Travada, ela não é recalculada — nem ao adicionar, nem ao
  redistribuir;
- **editar o valor de uma parcela trava essa parcela automaticamente**. É o que a pessoa quer dizer
  ao digitar um número: "esta é assim". Sem isso, a próxima adição apagaria o que ela acabou de
  escrever.

O primeiro vencimento e a periodicidade deixam de ser campos: a parcela nova nasce **um mês depois
da última**, e o vencimento é editável linha a linha, como já era.

### 5.3 O backend NÃO muda — e isso é deliberado

`criarContrato` gera a lista por `qtde_parcelas` + `primeiro_vencimento` e **já aceita uma lista
editada** (`dados.parcelas`), desde que: mesma quantidade, soma exatamente igual ao valor do
contrato, numeração sequencial, valores positivos e datas válidas. Qualquer divergência é 400 — nunca
substituição silenciosa.

A tela passa a mandar `qtde_parcelas = parcelas.length` e `primeiro_vencimento` = vencimento da
primeira. A lista gerada no servidor vira apenas **conferência de forma**, e a lista real é a da
tela — que é exatamente o que já acontece hoje quando alguém edita um valor.

Não mexer no núcleo que cria títulos é a decisão de menor risco do lote. As validações que existem lá
(teto de 24, soma, datas, percentual que não rende centavo) continuam valendo sem uma linha nova.

## 6. O que pode quebrar

| Risco | Verificação |
|---|---|
| Contrato deixar de ser criado por falta de subtipo | Suíte cria pela tela sem subtipo e exige sucesso |
| Outros tipos perderem o subtipo | Suíte abre um tipo que não é contrato e exige o campo |
| Soma das parcelas divergir do contrato | Suíte soma antes de enviar e confere o gravado |
| Trava ser ignorada ao adicionar | Suíte trava uma parcela, adiciona outra e exige o valor intacto |
| Editar valor não travar | Suíte edita, adiciona e exige que o editado não mude |
| Contrato abaixo do limite aprovar sem negociação | Suíte tenta e exige recusa |
| Contrato acima do limite parar de exigir | Suítes 25, 26 e 27 seguem passando |
| Favorecido sumir do cabeçalho dos contratos antigos | Suíte 39 segue passando |
| Teto de 24 parcelas ser furado pelo "+" | Suíte adiciona até 25 e exige bloqueio |

## 7. Suíte

`qa/medicao/41-abertura-parcelas-manuais.js`

---

## 8. Resultado

`qa/medicao/41-abertura-parcelas-manuais.js` — **16 provas, passou**, tudo pela tela.

| Prova | Resultado |
|---|---|
| Campo Subtipo no contrato | não aparece |
| Valor x apropriação | Valor vem antes |
| Tabela "Contratados e favorecido" | saiu |
| Campos de quantidade e 1º vencimento | não existem mais |
| Primeira parcela pelo "+" | recebe o valor inteiro (R$ 9.000) |
| Três parcelas | R$ 3.000 cada, com vencimentos avançando um mês |
| Editar a parcela 1 para R$ 6.000 | **trava** e redivide: 6.000 / 1.500 / 1.500 |
| Adicionar a quarta | a travada **não muda**: 6.000 / 1.000 / 1.000 / 1.000 |
| Remover uma | renumera e redivide; soma segue R$ 9.000 |
| Teto de 24 | respeitado |
| Negociação **abaixo** do limite | cobrada, e o contrato não é criado sem ela |

### Regressão: 24 suítes rodadas, todas passando

**06, 07, 08, 09, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 33, 34, 35, 36,
37, 38, 39, 40 e 41.**

### O que a mudança do item 7 custou nas suítes

Exigir a negociação em **todo** contrato quebrou **18 suítes** de uma vez — todas as que aprovam um
contrato para provar outra coisa. O documento virou fixture nelas (`qa/lib/negociacao.js`), como já
era para os contratos acima do limite.

Duas ficaram **de fora da automação**, de propósito: a **25** e a **27** têm o anexo como *objeto do
teste*, e pôr o documento antes de aprovar falsearia exatamente o que elas medem. A primeira versão
da automação as quebrou e foi revertida nelas.

E a **25** teve uma prova **invertida**: ela afirmava *"abaixo do limite aprova SEM o documento —
nada mudou para o fluxo comum"*, o que era verdade em 20/08 e deixou de ser. Agora prova o
contrário, e que **com** o documento o contrato abaixo do limite aprova normalmente.

A **17** também teve uma prova invertida: exigia que a tela oferecesse *um* subtipo; agora exige que
o campo **não exista**.

### Três armadilhas que apareceram no caminho

1. **O backend HTTP ficou com o código antigo.** As suítes rodam o serviço em processos novos e
   viam a mudança; o servidor de longa duração, não. A suíte 26 falhava com *"Subtipo e obrigatorio"*
   de uma guarda que eu já tinha removido — e o alerta só apareceu depois que a prova passou a
   mostrar o último alerta no detalhe.
2. **Código de contrato é reaproveitado.** Ao limpar títulos órfãos da suíte 38 por `CT-XXXX`,
   quase levei junto os de um **CT-0006 real do cliente**, com sete parcelas. A limpeza agora exige
   também que o título esteja órfão.
3. **Prova que confere pelo texto da página quebra quando a página muda.** A 26 verificava a seleção
   do credor procurando o nome em `body.innerText` — o nome aparecia na tabela que a Fase 2 removeu.
   Passou a conferir o **estado do campo**.
