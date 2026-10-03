# Mapa de impacto — wireframe 2 (Medição)

Escrito **antes de codar**, como manda a regra do projeto. Levantado no código e no banco
reais; nada aqui é presumido. Âncoras em `arquivo:linha` para cada afirmação verificável.

Requisitos do cliente: MD-1 a MD-5, em `ALTERACOES-POR-PAGINA.md`.

---

## 1. O que a Medição é hoje

A Medição **não é uma tela nova**: é a mesma Nova Solicitação com o tipo 4 (`MEDICAO`), que
**consome** um contrato existente em vez de criar um. O comportamento do tipo já liga o que
precisa, sem nome de tipo no código:

```
mostrar_contrato: true    exige_contrato: true
mostrar_periodo_medicao: true   exige_periodo_medicao: true
mostrar_valor: true   mostrar_apropriacao_principal: true   mostrar_subtipo: false
```

### Volume real (o que uma regressão atinge)

| Métrica | Valor |
|---|---|
| Solicitações de medição | **665** |
| Com contrato vinculado | 656 |
| Contratos distintos já medidos | **227** |
| Contratos no banco | 335 — **todos `fluxo_novo = 0`** |
| Medições já pagas | 494 · com título cadastrado 67 · parcialmente pagas 6 |

Ou seja: **100% do tráfego de medição hoje é fluxo legado**, e quase 500 medições já
movimentaram dinheiro. É o ponto de maior risco de regressão da etapa.

---

## 2. Os cinco requisitos, conferidos um a um

| # | Requisito | Situação verificada |
|---|---|---|
| **MD-1** | O marcador de fluxo precisa chegar no payload de `getContratos` | ✅ **já chega** — o `Contrato.findAll` do `index` não tem `attributes:` explícito, então serializa o modelo inteiro. Sonda na API logada: 35 chaves, entre elas `fluxo_novo` e `status_contrato`. **Não é preciso mexer no serviço nem no controller.** Falta só consumir: `fluxo_novo` não aparece em lugar nenhum de `frontend/src` |
| **MD-2** | Contrato sem marcador = fluxo antigo | ✅ seguro por construção — a coluna é booleana com default falso e os 335 contratos estão em `0`. A bifurcação será `Boolean(contrato.fluxo_novo)`, então ausente/nulo cai no legado |
| **MD-3** | A tela renderiza conforme o marcador | 🔨 a fazer — duas trilhas na mesma tela |
| **MD-4** | Contrato não muda de fluxo depois de criado | ✅ **já garantido** — `fluxo_novo` só é escrito na criação (`contratoFluxoNovoService.js:312,359`); o update do contrato desestrutura campos nomeados (`ContratoController.js:1818-1833`) e o validador de update não aceita o campo. Nada a fazer, mas **entra como teste de invariante** |
| **MD-5** | Medições antigas continuam abrindo e editando no formato antigo | ✅ risco menor do que parecia: **não existe tela de edição de medição**. O detalhe (`SolicitacaoDetalhe/Header.jsx:152-153`) só **exibe** início/fim, sem condicional de tipo. O risco real está na criação, não na leitura |

---

## 3. O que existe para reaproveitar

- **Endpoint de parcelas do contrato: não existe.** `contrato_parcelas` só é lida dentro do
  serviço do fluxo novo (criação, aprovação, rejeição). Nenhuma rota HTTP a expõe, e
  `GET /contratos` não a inclui. **O wireframe 2 precisa de rota nova.**
- **Tabela de parcelas na tela**: `BlocoContratoFluxoNovo.jsx:172-198` já tem o desenho
  (#, valor editável, vencimento, status), mas é **prévia em memória** da criação — sem
  checkbox e sem ler nada persistido. Serve de referência visual, não de código pronto.
- **Padrão de lista com seleção**: `FinanceiroTitulos.jsx` tem checkbox por linha, seleção
  em massa, regra de elegibilidade por linha e resumo do total selecionado (`:2812-2819`,
  `:2897-2904`, `:1176-1181`). É o padrão de interação a seguir.

---

## 4. Os riscos que o levantamento revelou

Estes **não estavam na lista do cliente** e são o motivo de mapear antes de codar.

### R1 — o seletor de contrato não filtra estado (ALTO)

`GET /contratos` filtra apenas `ativo: true` + escopo de obra; **não filtra `status_contrato`**
(`ContratoController.js:702,753-763`). Hoje é invisível porque nenhum contrato é do fluxo novo.
No momento em que existir um, um contrato **`AGUARDANDO_APROVACAO` ou `REJEITADO` aparecerá no
seletor de medição** — e ele ainda não tem títulos, logo não pode ser medido.

**Correção prevista:** contrato do fluxo novo só é oferecido para medição quando
`status_contrato = ATIVO` (aprovado). Contrato legado segue exatamente como hoje — a regra
não pode alterar o que os 335 contratos existentes oferecem.

### R2 — a criação não checa o estado do contrato (ALTO)

A validação do rateio confere só `id + obra_id` (`SolicitacaoController.js:2600-2611`) e a do
contrato, só a presença do `contrato_id` (`:2515-2519`). Nada impede medir contrato rejeitado
ou aguardando aprovação **pela borda HTTP**, mesmo que a tela não ofereça. Precisa de guarda no
backend, não só no frontend.

### R3 — dupla contagem no financeiro (CRÍTICO — decisão do cliente)

É o ponto que decide o desenho e **não pode ser inventado por mim**:

- Contrato do fluxo novo, ao ser aprovado, transforma cada parcela em **título financeiro**
  (`contratoFluxoNovoService.js:485-538`, `origem_titulo: 'CONTRATO'`).
- Medição, hoje, gera **outro** título por um caminho independente
  (`tituloFinanceiroService.js:2415`, `origem_titulo: 'SOLICITACAO'`), sem nenhuma relação com
  as parcelas — `titulos_financeiros` não tem coluna de contrato.

Se as duas coisas acontecerem no mesmo contrato, **o valor do contrato entra duas vezes no
financeiro**. Não existe hoje nenhuma trava para isso.

O wireframe 2 aponta o caminho — a medição **seleciona títulos já existentes do contrato**, com
checkbox, e o saldo recalcula. Isto é, a medição **consome** o que a aprovação criou, em vez de
criar título novo. **Recomendo confirmar com o cliente** antes de implementar, porque muda a
semântica do dinheiro:

> Ao medir um contrato do fluxo novo, a medição deve **vincular-se aos títulos de previsão já
> existentes** (sem criar título novo), certo? E o que a medição altera neles — valor,
> vencimento, status?

### R4 — o saldo do contrato hoje é cego às parcelas (ALTO)

Não existe saldo persistido nem endpoint de saldo. O cálculo em memória
(`ContratoController.js:600-625` e a cópia em `:1561-1585`) considera pago **apenas**
solicitações com `status_global = 'PAGA'` — ignora `contrato_parcelas`, ignora títulos e ignora
`valor_aditivos`. Para um contrato do fluxo novo aprovado (títulos já criados, talvez já pagos),
o resumo mostrará `total_pago` ≈ 0 e `total_a_pagar` = valor cheio: **número errado na tela de
contratos**. O wireframe 2 precisa de saldo correto, então o cálculo tem de enxergar parcelas —
e a regra nova precisa valer **nos dois pontos**, senão relatório e resumo divergem.

### R5 — validações de período inexistentes (MÉDIA)

Não há `data_fim >= data_inicio` (nem no frontend, `NovaSolicitacao.jsx:808-811`, nem no
backend, `SolicitacaoController.js:2475-2479`), nem checagem de sobreposição com outra medição
do mesmo contrato. Hoje é inofensivo; **se o saldo passar a ser debitado por período, vira
inconsistência de dinheiro**.

### R6 — título pode nascer de medição não aprovada (MÉDIA, herdada)

`criarTituloPorSolicitacao` valida só existência e escopo de obra
(`tituloFinanceiroService.js:2415-2417`, `:1205-1239`) — não checa `status_global`. Uma medição
`PENDENTE` já vira título hoje. Fora do escopo do wireframe 2, mas registrado porque a porta
continua aberta se a medição passar a consumir parcelas.

---

## 5. O que muda, por camada

### Backend

| O quê | Onde | Observação |
|---|---|---|
| Rota nova `GET /contratos/:id/parcelas` | `routes.js` (bloco CONTRATOS) + controller do fluxo novo | Leitura das parcelas com status e título vinculado; permissão igual às demais rotas de contrato (`requireContratoAccess`) |
| Guarda de estado do contrato na criação de solicitação | `SolicitacaoController` | Contrato do fluxo novo só aceita medição se `ATIVO`; legado inalterado (R2) |
| Saldo que enxerga parcelas | `ContratoController` (os **dois** pontos, R4/R6) | Só depois da decisão do cliente sobre R3 |

### Frontend

| O quê | Onde | Observação |
|---|---|---|
| Bifurcação por `fluxo_novo` do contrato selecionado | `NovaSolicitacao.jsx` (após `aplicarContratoSelecionado`, `:594-632`) | `Boolean(contrato.fluxo_novo)`; **falso = trilha legada, byte a byte como hoje** |
| Bloco novo de títulos do contrato (checkbox, valor, vencimento, status, saldo) | componente isolado em `components/contratos/` | Mesmo padrão do bloco do wireframe 1: componente próprio, diff mínimo no monólito |
| Filtro do seletor de contrato | `NovaSolicitacao.jsx:1781-1807` / `contratosDisponiveis:1062` | Não oferecer contrato do fluxo novo não-aprovado (R1) |

### O que NÃO muda

- Trilha legada da medição: seleção de contrato, rateio de apropriações, período, payload e
  submit padrão — **nada** pode mudar para contrato `fluxo_novo = 0`
- `getContratos` e `ContratoController.index` — o marcador já vem (MD-1)
- Detalhe da solicitação — só exibe medição, não edita (MD-5)
- Serviço de aprovação/rejeição do contrato e regras de centavos — auditados

---

## 6. Como isto será provado

1. **Baseline antes/depois da medição legada** (critério obrigatório do cliente): criar medição
   em contrato legado pela tela real, comparar payload gravado e telas, antes e depois da
   mudança. O comparador de `qa/baseline` cobre; medição entra como caso dedicado
2. **Invariante MD-4**: tentar mudar o fluxo de um contrato pela API de update e provar que o
   campo não se altera
3. **R1/R2**: contrato do fluxo novo em `AGUARDANDO_APROVACAO` e em `REJEITADO` não pode ser
   medido — nem pela tela, nem pela borda HTTP
4. **Bifurcação**: mesmo formulário, dois contratos (um legado, um do fluxo novo) → duas trilhas
5. **Auditoria independente** ao final, com erros forçados (quem escreve não aprova)

---

## 7. Decisões do cliente (17/08/2026) — MD-6 a MD-8

As três perguntas que travavam o núcleo foram respondidas:

| # | Decisão |
|---|---|
| **MD-6** | A medição **vincula-se aos títulos/parcelas existentes** do contrato — não cria título novo. O status exibido depende do momento do fluxo: **Previsão** (inicial), **Aberto** ou **Quitado**. A medição pode **editar valor e vencimento** |
| **MD-7** | Medição parcial **reduz o valor do título** e **acrescenta a diferença na última parcela** — o total do contrato não muda |
| **MD-8** | Período: exigir **fim ≥ início** e **impedir períodos sobrepostos** no mesmo contrato |

### O que MD-6/MD-7 significam no código

O MD-7 é a mesma aritmética já auditada no wireframe 1 (a diferença vai para a última parcela,
conversão por dígitos em centavos), agora aplicada sobre parcelas **persistidas** em vez da
prévia em memória. O total do contrato é invariante: `soma(parcelas)` antes = depois.

**Status efetivo de uma linha** — o que a tela mostra e o que decide se dá para medir: a parcela
tem status próprio (`PREVISAO`/`APROVADA`/`REJEITADA`) e, depois da aprovação do contrato, um
título vinculado com status próprio (`ABERTO`/`PARCIAL`/`QUITADO`/`EXCLUIDO`). A linha exibe o
título quando ele existe e a parcela quando ainda não existe título — é exatamente o
"vai depender do fluxo" do MD-6.

### Consequências que decorrem das decisões e precisam de regra explícita

Estas **não foram perguntadas** e derivam do que foi decidido. Registro a regra que vou adotar
e o motivo; qualquer uma pode ser revista.

1. **Título quitado não pode ser reduzido.** Reduzir o valor de um título já pago mexeria em
   dinheiro que já saiu. Regra: `QUITADO` e `EXCLUIDO` aparecem na lista **somente para
   leitura**; `PREVISAO`, `ABERTO` e `PARCIAL` são selecionáveis.
2. **A "última parcela" que recebe a diferença precisa ser editável.** Se a última já estiver
   quitada, jogar a diferença nela é impossível. Regra: a diferença vai para a **última parcela
   ainda editável**; não havendo nenhuma, a redução é recusada com mensagem clara — em vez de o
   dinheiro sumir.
3. **Medir a própria última parcela.** Reduzir a última e devolver a diferença a ela mesma é um
   nada. Regra: a diferença vai para a última parcela editável **diferente da que está sendo
   medida**; não havendo outra, a redução é recusada.
4. **⚠️ Tensão com a guarda R2 — a confirmar.** O MD-6 diz que o status "provavelmente" será
   *Previsão*, que é o estado da parcela de um contrato **ainda não aprovado**. A guarda R2 que
   entreguei bloqueia solicitação em contrato do fluxo novo não aprovado. Para respeitar o MD-6,
   **afrouxei a guarda**: bloqueia apenas contrato **rejeitado ou inativo** e passa a permitir
   contrato aguardando aprovação. **Confirmar:** faz sentido medir um contrato que ainda pode
   ser rejeitado?

### Modelo de dados do vínculo (MD-6)

A medição precisa registrar **quais** parcelas consumiu e **quanto** — senão não há como auditar
depois. Tabela nova `medicao_parcelas`:

| Coluna | Por quê |
|---|---|
| `solicitacao_id` | a medição |
| `contrato_parcela_id` | a parcela consumida |
| `valor_medido` | quanto desta medição saiu desta parcela |
| `valor_anterior` · `vencimento_anterior` | o que a parcela era antes — sem isso não há trilha de auditoria |
| `vencimento_aplicado` | o vencimento que a medição definiu |

Guardar o "antes" na própria linha do vínculo evita depender de log externo para explicar por que
a parcela mudou de valor.

### Correção de rumo (17/08, após esclarecimento do cliente)

A minha leitura do MD-6 estava errada. O "status Previsão" fala do **título**, que pode ter sido
alterado por quem tem permissão — **não** de contrato pendente. A regra é:

> **Contrato não aprovado não pode ser medido.** Contratos criados dentro da regra **abaixo de
> R$ 50 mil já nascem aprovados**, e por isso podem ser criados e medidos na sequência.

A guarda R2 voltou a exigir contrato **ATIVO**, e o `medivel` da rota acompanha (as duas
precisam contar a mesma história, senão a tela oferece o que a API recusa).

### MD-9 (CORRIGIDO) — nenhum contrato nasce aprovado

Registro do meu erro, para não se repetir: implementei aprovação automática abaixo de R$ 50 mil
a partir de uma leitura errada, e ela **criava títulos financeiros no ato da criação**. O cliente
corrigiu:

> **Nenhum contrato nasce aprovado.** Todo contrato passa pela aprovação da **Gerência de
> Processos**. O limite de R$ 50 mil é outra política: **abaixo dele o contrato dispensa a etapa
> seguinte no JURÍDICO**.

Revertido por inteiro (aprovação automática, mensagem da tela e o `req` extra no controller).
Ficou no lugar uma **guarda de regressão**: `qa/medicao/05-nenhum-contrato-nasce-aprovado.js`
prova, nas três faixas (R$ 40 mil, R$ 50 mil exatos e R$ 60 mil), que o contrato nasce
`AGUARDANDO_APROVACAO`, sem título, e que nenhum deles aceita medição antes de aprovado.

**O que sobrou de útil da tentativa:** o corpo da aprovação (parcela → título) ficou separado
em `aplicarAprovacaoNaTransacao`, o que deixa explícito o que é regra de acesso (permissão
estrita, de quem chama) e o que é efeito. Comportamento idêntico ao auditado.

### MD-10 — etapa do JURÍDICO acima do limite (respondido em 17/08)

Política em `POLITICA-INTERNA-CSC.md` (PI-1). Respostas do cliente:

1. O Jurídico vem **depois** da Gerência de Processos — ela revisa a documentação antes de
   encaminhar
2. O Jurídico **avalia a documentação e monta a minuta**, que vai às partes para **assinatura**;
   o cliente quer **status** que digam em que ponto o processo está
3. **Não se mede** antes da aprovação do Jurídico

#### O que isso quebra no que existe hoje

Hoje a aprovação da Gerência de Processos faz **duas coisas ao mesmo tempo**: marca o contrato
`ATIVO` **e cria os títulos financeiros** das parcelas. Com o Jurídico no meio, para contrato
acima do limite isso passa a estar errado: o contrato ficaria apto a ser medido e com títulos no
financeiro **antes de existir minuta e assinatura**.

#### Máquina de estados proposta (a confirmar antes de implementar)

Nomes seguindo a convenção do próprio `status_contrato` (maiúsculas com underscore):

```
                        ┌─ abaixo de R$ 50 mil ─────────────────────────────┐
                        │                                                   ▼
AGUARDANDO_APROVACAO ───┤                                                 ATIVO ──► pode medir
   (Gerência de         │                                                   ▲
    Processos)          └─ a partir de R$ 50 mil ─►  EM_ANALISE_JURIDICA    │
                                                            │               │
                                                            ▼               │
                                                   AGUARDANDO_ASSINATURA ───┘
```

| Status | Significado | Pode medir? |
|---|---|---|
| `AGUARDANDO_APROVACAO` | Criado; Gerência de Processos revisa a documentação | não |
| `EM_ANALISE_JURIDICA` | GP aprovou e encaminhou; Jurídico avalia e monta a minuta | não |
| `AGUARDANDO_ASSINATURA` | Minuta pronta, enviada às partes | não |
| `ATIVO` | Apto: abaixo do limite após GP; acima do limite após assinatura | **sim** |
| `REJEITADO` | Recusado em qualquer etapa (volta para correção, D7) | não |

#### A pergunta que decide dinheiro

**Em que momento as parcelas viram títulos financeiros?** Proposta: **ao entrar em `ATIVO`** —
isto é, na aprovação da GP para contrato abaixo do limite, e **só depois da assinatura** para
contrato acima. Assim vale o invariante: *existe título ⇔ o contrato está apto a ser medido e
pago*. A alternativa (criar títulos já na aprovação da GP) colocaria no financeiro compromisso de
contrato ainda não assinado.

#### Impacto por camada, quando confirmado

| O quê | Onde |
|---|---|
| Transição GP: `ATIVO` (abaixo) ou `EM_ANALISE_JURIDICA` (acima) | `contratoFluxoNovoService.aprovarContrato` — a criação de títulos sai de lá e passa a acontecer na entrada em `ATIVO` (a função de efeito já está separada) |
| Ações do Jurídico (minuta pronta → assinatura → assinado) | endpoints novos + permissão própria do setor JURIDICO (id 6) |
| Guarda de medição | já exige `ATIVO`; passa a valer para a cadeia inteira sem mudança |
| Tela | mostrar o status do processo e por onde ele anda |

**Nada disso foi implementado**: a máquina de estados precisa da sua confirmação, porque muda
quando o dinheiro entra no financeiro.

### PI-5 — o compromisso nasce com o contrato ATIVO (confirmado em 18/08)

> Contrato ativo = compromisso assumido, entra nas previsões de custo mesmo que no fim não seja
> pago; cancelar fica a cargo da Gerência de Processos. Vale igual acima de R$ 50 mil, contando
> a partir da assinatura. O usuário da obra pode editar o valor do título ao pedir medição — a
> conferência é de auditoria: **valor previsto na criação × valor solicitado por parcela**.

#### Três lacunas que essa confirmação expôs no que já está implementado

**L1 — a medição altera a parcela e não altera o título (grave).**
`aplicarMedicaoNasParcelas` atualiza só `contrato_parcelas` (valor e vencimento). Enquanto os
títulos não existiam, isso passava. Agora: título existe sempre que o contrato está `ATIVO`, e
medição só ocorre com contrato `ATIVO` — então **toda** medição deixaria parcela e título
divergentes, com o financeiro cobrando o valor antigo.

Correção: na mesma transação, o título vinculado acompanha a parcela — valor, vencimento e,
quando houver, os **rateios reescalados** (título de contrato com mais de uma apropriação nasce
rateado por VALOR; sem reescalar, a soma dos rateios deixa de fechar com o título).

**L2 — falta o valor imutável que a auditoria pede.**
`contrato_parcelas.valor` é sobrescrito a cada medição, então "o previsto na criação" se perde.
Coluna nova `valor_previsto`, gravada na criação e **nunca** alterada. Com `medicao_parcelas`
guardando o "antes" de cada medição, a trilha fica completa: previsto → cada alteração → atual.

**L3 — título parcialmente pago pode ser reduzido abaixo do que já saiu.**
`PARCIAL` é tratado como editável sem olhar `valor_baixado`. Reduzir um título de R$ 5.000 com
R$ 3.000 já pagos para R$ 1.000 criaria título menor que o valor quitado. Trava: o novo valor
não pode ficar abaixo do já baixado.

#### Acesso — registrado por ser decisão, não detalhe

Quem edita o título nesse fluxo é o **usuário da obra**, que não tem acesso ao módulo financeiro.
O sistema já tem o precedente: a aprovação de contrato cria títulos com `pularAcessoFinanceiro`,
porque quem aprova também não é do financeiro. A medição segue o mesmo caminho, de forma
explícita — a permissão que vale é a do fluxo de solicitação, não a do financeiro.

### PI-6 — saldo do contrato governa a medição (18/08) — **divergência a resolver**

A regra nova mostra que eu modelei o valor da medição de um jeito e o cliente pensa de outro.
Registro a divergência com números antes de mexer, porque ela muda o núcleo.

**Como está implementado hoje (substitutivo):** `valor_medido` é o **novo valor da parcela**. Ao
medir R$ 1.000 numa parcela de R$ 3.000, a parcela passa a valer R$ 1.000 e os R$ 2.000 vão para
a última parcela.

**Como o exemplo do cliente se lê (incremental):** `valor_medido` é **o quanto se está pedindo
agora** contra aquele título. Um título de R$ 5.000 com R$ 3.000 já pagos aceita uma solicitação
de R$ 1.000 — o que, no modelo substitutivo, seria "colocar a parcela em R$ 1.000", abaixo do que
já foi pago (e foi exatamente o que a minha trava L3 barrou).

**A trava L3 está errada e sai.** Ela nasceu do modelo substitutivo; o cliente foi explícito de
que essa solicitação é legítima. O que limita é o **saldo do contrato**, não o pago no título.

#### O que falta, independente da resposta

| # | Item |
|---|---|
| S1 | **Saldo do contrato** = valor total − o já comprometido (medições não canceladas). Hoje não existe: `GET /contratos/:id/parcelas` devolve totais de parcela, não comprometimento |
| S2 | **Guarda**: recusar medição cujo valor ultrapasse o saldo do contrato |
| S3 | **Exibição do comprometido**, com o status de cada medição mesmo não paga |
| S4 | **Título CANCELADO/EXCLUÍDO devolve o valor à parcela final** do contrato |
| S5 | **Encerrar contrato** (Gestão de Contratos): zera o saldo restante e marca os títulos em aberto como EXCLUÍDO — quebra de contrato |

#### Respondido: leitura A (18/08)

O cliente escolheu a **leitura A**: o não medido volta para as últimas parcelas/títulos. Quando o
pagamento acontece e o valor da parcela é acertado para o que foi realmente pago, aquela parcela
**fecha** e a diferença vai para o fim do contrato.

Implementado nesta rodada: **S1** (saldo do contrato), **S2** (guarda de saldo), **S3** (a rota
devolve saldo, comprometido, status real do título e o previsto de cada parcela) e **PI-7**
(quitado e parcial não são editáveis; a trava L3 saiu, era do modelo errado).

Continuam pendentes: **S4** (título cancelado/excluído devolve o valor à parcela final),
**S5** (encerrar contrato na Gestão de Contratos) e a **permissão granular** para editar o valor
depois que a medição já foi criada.

#### A pergunta que travava o núcleo (respondida acima)

Contrato de R$ 10.000 em 10 parcelas de R$ 1.000. A parcela 3 tem título de R$ 1.000, ainda sem
pagamento. O usuário mede **R$ 400** nessa parcela:

- **Leitura A (substitutivo, como está hoje):** a parcela 3 passa a valer R$ 400, e os R$ 600
  voltam para a última parcela. Saldo do contrato: R$ 9.600
- **Leitura B (incremental):** foi solicitado R$ 400 dos R$ 1.000 daquela parcela; restam R$ 600
  **na própria parcela 3**, que pode receber outra medição depois. Saldo do contrato: R$ 9.600

Nos dois casos o saldo do contrato dá o mesmo. A diferença é **onde sobra o não medido**: volta
para o fim do contrato (A) ou fica na parcela para uma medição seguinte (B). E, na leitura B, uma
mesma parcela aceita várias medições até se esgotar — o que hoje não é permitido.

### S4, S5 e a permissão — mapa desta rodada (18/08)

**S4 · título cancelado/excluído devolve saldo à parcela final.**
Hoje a exclusão acontece em `tituloFinanceiroService.excluirTitulosEmMassa` (tela de títulos):
marca `EXCLUIDO` e preenche `deleted_at`. Ela não sabe que o título pode pertencer a um contrato.

Regra: ao excluir um título ligado a uma parcela de contrato, o valor da parcela **volta para a
última parcela editável** e a parcela zera. Para o saldo do contrato **de fato voltar**, o
comprometimento daquela parcela precisa ser anulado — senão `saldo = total − comprometido` não
muda e o dinheiro fica preso. Por isso `medicao_parcelas` ganha `devolvido_em`/`devolvido_motivo`:
a linha continua existindo (é trilha de auditoria) mas deixa de contar como comprometido.

**S5 · encerrar contrato (quebra de contrato).**
Ação nova em Gestão de Contratos: zera o saldo restante e marca os títulos **em aberto** como
`EXCLUIDO`. Diferente do S4 — aqui o valor **não volta** para lugar nenhum: o contrato acabou.
Status novo `ENCERRADO`, que não aceita mais medição.

> **Resolvido (PI-8):** no encerramento, o título parcialmente pago **fecha pelo valor já pago**,
> que passa a ser o valor oficial. Não é excluído (apagaria um pagamento real) nem fica em aberto
> (o contrato acabou). Só um estorno da baixa reabre.

**Permissão granular.** Duas entradas novas no catálogo (`constants/moduloPermissoes.js`):
`contratos.geral.encerrar` (encerrar contrato) e `contratos.medicao.editar_valor` (editar o valor
depois que a medição já foi criada). A segunda é a que o cliente pediu — o serviço passa a exigi-la
quando a alteração vem de uma medição **já existente**, e não da criação.

### O que NÃO entra nesta rodada

O R4 (saldo do contrato cego às parcelas, duplicado em dois pontos do `ContratoController`)
continua aberto: mexer nele muda número que a tela de contratos já mostra hoje para 335 contratos
legados, e merece rodada própria com baseline dedicado.
