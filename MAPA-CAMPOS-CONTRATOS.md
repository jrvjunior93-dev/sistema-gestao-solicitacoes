# Mapa — campos por Tipo e Subtipo (escopo de contratos 3.1 a 3.3)

Escopo entregue pelo cliente em 18/08/2026, com os campos obrigatórios de cada subtipo de
contrato. Este documento cruza o que o cliente pediu com **o que o sistema tem hoje**, para não
codar no escuro.

---

## 1. O bloqueio estrutural — RESOLVIDO em 18/08

> A chave da regra passou a aceitar `tipo` **ou** `tipo:subtipo`, com o subtipo tendo
> precedência em **cada nível** da cascata (área → global → legado) e o tipo valendo como
> padrão quando não há regra própria. Backend e frontend resolvem igual — se divergissem, a
> tela mostraria campo que o servidor recusa. Provas em `qa/medicao/11-campos-por-subtipo.js`.
>
> **A tela também já edita por subtipo** (18/08): a página de configuração ganhou o seletor,
> com "Todos (regra do tipo)" como padrão. Provado pelo caminho real em
> `qa/medicao/12-tela-campos-por-subtipo.js`: escolher o subtipo, desligar um campo e salvar
> grava sob a chave `"33:26"`.

### O problema original (registro)

A configuração era por TIPO, não por SUBTIPO

A tela de campos grava em `NOVA_SOLICITACAO_CAMPOS_POR_TIPO`
(`backend/src/services/novaSolicitacaoCamposConfig.js:3`), e as regras são indexadas **por tipo
de solicitação** (`normalizarTipoKey`, `:175`). O escopo, porém, pede conjuntos **diferentes por
subtipo** — Abertura, Solicitação e os dois Termos Aditivos exigem campos distintos.

Sem mudar isso, qualquer configuração feita para "Contrato" vale igual para os quatro subtipos.

**Como resolver, mantendo o que existe:** a chave da regra passa a aceitar `tipo` **ou**
`tipo:subtipo`, e a resolução procura primeiro a regra do subtipo, caindo para a do tipo quando
não houver. Assim:

- nenhuma configuração existente quebra (as chaves só de tipo continuam valendo);
- a tela ganha um seletor de subtipo dentro do tipo, sem virar outra tela;
- tipos sem subtipo seguem exatamente como hoje.

## 2. Os campos pedidos × o que existe

Hoje a tela configura **16 campos** (`CAMPOS_NOVA_SOLICITACAO`): obra, área responsável, credor,
cadastro de credor, apropriação principal, subtipo, contrato, apropriações do contrato, valor,
data de vencimento, data de demissão, período de medição, ref. contrato abertura, itens de
apropriação, descrição e anexos.

| Campo do escopo | Situação |
|---|---|
| Obra | ✅ existe |
| Apropriação | ✅ existe |
| Valor contratado | ✅ existe (`valor`) |
| Previsões de pagamento | ✅ existe (bloco de parcelas do wireframe 1) |
| Nº do contrato (automático) | ✅ existe (sequencial `CT-0001`) |
| Período da medição · Data de vencimento | ✅ existem |
| **Justificativa da contratação** | ❌ **novo** |
| **Objeto** | ⚠️ coluna `contratos.objeto` existe, mas **não há campo na tela** |
| **Responsável pela contratação** | ⚠️ coluna `contratos.responsavel_id` existe, sem campo na tela |
| **Contratado (permitir múltiplos)** | ⚠️ `contrato_credores` suporta vários; a tela escolhe **um** |
| **Favorecido do pagamento** | ❌ **novo** (hoje o credor é quem recebe) |
| **Vigência inicial / final** | ⚠️ colunas existem (`vigencia_inicio/fim`), sem campo na tela |
| **Forma de pagamento com dados bancários** (PIX/Transferência/Boleto) | ⚠️ forma existe; **os dados bancários e o anexo do boleto, não** |
| **Documentos obrigatórios** (negociação detalhada, orçamento, NF, relatório…) | ❌ **novo** — hoje anexo é um campo só, sem exigir tipo de documento |
| **Dados do contratado** (nome/CNPJ/endereço) | ✅ existem no cadastro de parceiro — falta exibir/exigir |
| **Aditivo: valor, prazo, justificativa, responsável** | ❌ **novos** |
| **Aditivo: teto de 25% do contrato original** | ❌ **novo** — regra de bloqueio acumulada |
| **Medição: valor contratado, acumulado medido/pago, saldo** | ✅ **já implementado** (PI-6) |
| **Medição: bloquear acima do saldo** | ✅ **já implementado** — falta só usar a mensagem do escopo |
| **Medição: número da medição automático** | ❌ **novo** |

## 3. O que já foi feito desta rodada

**Limite do Jurídico agora é configuração, não constante** (pedido do cliente). Chave
`CONTRATO_LIMITE_JURIDICO`, endpoints `GET/PATCH /configuracoes/contrato-limite-juridico`.
Padrão continua R$ 50.000 — banco sem a chave se comporta como antes. O valor manda em duas
coisas ao mesmo tempo: o caminho do Jurídico na aprovação e a exigência de negociação detalhada.
Provado: com o limite em R$ 30.000, um contrato de R$ 40.000 passou a ir para
`EM_ANALISE_JURIDICA` — antes ia direto para `ATIVO`.

## 4. Respostas do cliente (18/08) — perguntas fechadas

| # | Resposta | Efeito |
|---|---|---|
| 1 | Favorecido **pode ser um terceiro** | campo próprio, não derivado do contratado |
| 2 | Todos os contratados **respondem pelo contrato**; o pagamento vai ao favorecido, **pré-carregado com o primeiro responsável** | sem rateio entre contratados |
| 3 | Documentação: **campo único** | ✅ nada a fazer — é o comportamento atual |
| 4 | Aditivo: 25% **sobre o valor original**, acumulando os aprovados; **rejeitado libera de volta** | regra de teto acumulado, com devolução |
| 5 | **Não existe número de medição** — pede-se pelas parcelas, **na ordem do vencimento** | ✅ **implementado (PI-11)** |
| 6 | **Não existe** aprovação separada de Gestor da Obra nem de Diretoria — vale a **permissão granular**, dada à Gerência de Processos | ✅ a máquina de estados entregue continua valendo |

### PI-11 — implementado nesta rodada

Parcela com vencimento posterior fica **bloqueada** enquanto houver parcela anterior ainda não
solicitada, no backend e na tela. Parcela **já solicitada não bloqueia** as seguintes: ela
continua `ABERTO` (o título só fecha no pagamento), mas o trabalho dela já foi pedido — sem essa
distinção a primeira medição travava todas as próximas.

## 5. Andamento dos campos

| Item | Estado |
|---|---|
| Regras por `tipo:subtipo` (motor + tela de configuração) | ✅ feito |
| Favorecido (pode ser terceiro, pré-carregado com o 1º contratado) | ✅ backend |
| Contratado múltiplo (grava `contrato_credores`, que o fluxo novo não gravava) | ✅ backend |
| **Objeto · Vigência inicial · Vigência final** | ✅ **backend + tela** |
| Escolher vários contratados e o favorecido **na tela** | ✅ feito — bloco do contrato, com busca de parceiro |
| Responsável pela contratação | ✅ campo no bloco (lista de usuários); a coluna já existia |
| Justificativa da contratação | ✅ coluna nova + campo, gravando pela tela |
| Termo Aditivo (valor, prazo, justificativa, responsável) + teto de 25% acumulado | ✅ backend + regra provada; falta a tela |


---

## 6. Termo Aditivo — mapa (18/08)

Regra do cliente (PI-12): teto de **25% sobre o valor original** do contrato, **acumulando os
aditivos já aprovados**; aditivo **rejeitado libera o valor de volta** para uma solicitação
futura. Campos: valor, prazo, justificativa e responsável.

### O que já existe

`contratos.valor_aditivos` existe e é somado ao total em dois lugares (o cálculo do saldo do
contrato e a rota de parcelas). Nunca foi alimentado por ninguém — é preenchido à mão hoje.

### Desenho

Tabela nova `contrato_aditivos`, uma linha por termo, com status próprio. Não altero
`valor_aditivos` na solicitação: só na **aprovação**, para que o saldo do contrato não cresça
por um aditivo que ainda pode ser recusado.

| Situação | Efeito |
|---|---|
| Solicitado | linha `PENDENTE`; **não** mexe no contrato |
| Aprovado | soma ao `valor_aditivos`; o saldo do contrato cresce |
| Rejeitado | linha `REJEITADO`; nada some do contrato, e o valor volta a caber no teto |

### O teto, exatamente

`soma(aditivos APROVADOS) + valor deste ≤ 25% do valor_total` — o **original**, sem os aditivos.
Usar o valor já inflado faria o teto crescer a cada aditivo, que é o oposto do pedido.

Pendente enquanto não aprovado **não** consome o teto: se consumisse, um aditivo esquecido em
análise bloquearia os demais para sempre. Consequência assumida: dois aditivos pendentes podem,
juntos, passar de 25% — e o segundo será recusado na aprovação, não na solicitação.
