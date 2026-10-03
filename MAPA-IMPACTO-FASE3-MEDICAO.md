# Mapa de impacto — Fase 3: medição

Data: 23/08/2026. Escrito antes da primeira linha de código (regra §6).

Itens do plano: **5** (favorecido sai do contrato e entra na medição), **8** (contrato não aprovado
não é listado), **9** (dados de pagamento obrigatórios + tela de configuração das formas),
**20** (corrigir o vínculo do anexo com a medição) e **25** (botão de aprovar → `LIBERADO`).

---

## 1. Item 20 — o defeito já apurado

`anexos.medicao_id` existe na tabela e no model, e **nada o preenche**: `AnexoController` grava
`solicitacao_id`, `tipo`, `nome`, `caminho` e `uploaded_by`. Medido: dos 30 anexos da obra 23,
**zero** têm medição.

Consequência: o modal "Medicao N" filtra anexos por `medicao_id` e **nunca mostra nenhum**, por
construção — o card foi feito para separar os documentos de cada medição num contrato com muitas.

**Correção:** a rota de anexo passa a aceitar `medicao_id` e a gravá-lo, validando que a medição
pertence à solicitação. Sem essa validação, um id de outra solicitação penduraria o documento no
lugar errado.

## 2. Itens 5 e 9 — os dados de pagamento passam para a medição

### 2.1 Colunas novas em `contrato_medicoes`

| Coluna | Para quê |
|---|---|
| `favorecido_id` | quem recebe **esta** medição |
| `favorecido_chave_pix` | a chave usada, **copiada** no momento |
| `favorecido_contato` | campo livre |
| `forma_pagamento_id` | escolhida entre as formas liberadas |
| `dados_confirmados_em` / `dados_confirmados_por` | o aceite do checkbox |

A chave PIX é **copiada**, não referenciada: a chave do cadastro pode mudar depois, e a medição tem
de dizer para onde o dinheiro foi **naquele** pagamento. É a mesma razão de `valor_previsto` existir
ao lado de `valor`.

O aceite grava **quem e quando**, não um booleano: "confirmei que os dados estão corretos" é uma
declaração de responsabilidade, e um `1` não diz de quem.

### 2.2 O que a tela pede

No card de medição da Nova Solicitação, abaixo das parcelas:

- **checkbox "o favorecido é o próprio credor do contrato"**, marcado por padrão. Desmarcado, abre a
  busca de favorecido;
- **chave PIX** — vem preenchida do cadastro do favorecido quando existir, e é editável;
- **forma de pagamento** — só as liberadas na configuração;
- **contato do favorecido** — texto livre;
- **checkbox de confirmação** de que os dados estão corretos.

Sem os obrigatórios e sem o aceite, a medição não é enviada — na tela e no servidor.

### 2.3 A configuração das formas (item 9)

Chave nova em `configuracoes_sistema`: `FORMAS_PAGAMENTO_MEDICAO`, com a lista de ids liberados.

**Configuração cura, nunca substitui o cadastro** — a regra que já custou um defeito nesta
implantação (a categoria financeira lendo a lista curada em vez de `categorias_financeiras`). As
formas continuam vindo de `financeiro_formas_pagamento`; a configuração só diz **quais aparecem**.
Lista vazia = todas, para o sistema não nascer travado.

A tela entra nas **configurações do superadmin**.

## 3. Item 8 — contrato não aprovado nem é listado

`GET /contratos?modo=CRIACAO` filtra por `ativo: true` e não olha `status_contrato`. O contrato do
fluxo novo aparece na lista desde que é criado, e o erro só vem no envio.

No modo `CRIACAO`, contrato do fluxo novo passa a aparecer **só quando `ATIVO`**. O contrato
**legado** não tem `status_contrato` (é nulo nos 335) e continua aparecendo — filtrar por ele
esconderia todos.

## 4. Item 25 — aprovar a medição

Botão no modal "Medicao N": **aprovar e enviar ao Financeiro**.

- permissão: `contratos.aprovacao.aprovar` (é a Gerência de Processos que aprova);
- só quando a medição tem título em aberto e ainda não foi aprovada;
- grava `aprovada_em` / `aprovada_por` em `contrato_medicoes`;
- a solicitação vai para **`LIBERADO`** e para o setor **FINANCEIRO**;
- registra no histórico.

### 4.1 `LIBERADO` substitui `APROVADA` na regra de status

A regra de 21/08 dizia `NEC. DE MEDIÇÃO` → `APROVADA` (na baixa) → `PAGA`. O cliente corrigiu:

| Momento | Status |
|---|---|
| Medição pedida, esperando a Gerência | `NEC. DE MEDIÇÃO` |
| Medição **aprovada**, título em aberto | **`LIBERADO`** |
| Tudo quitado e nada por medir | `PAGA` |

`APROVADA` sai do fluxo de contrato. E `LIBERADO` passa a nascer de uma **aprovação** — hoje é posto
à mão (o histórico da SOL-5116 mostra isso).

O cálculo automático precisa saber se a medição foi aprovada, e é `aprovada_em` que responde:
medição não aprovada mantém `NEC. DE MEDIÇÃO`; aprovada com título em aberto vira `LIBERADO`.

## 5. O que pode quebrar

| Risco | Verificação |
|---|---|
| Medição existente sem os dados novos | Colunas anuláveis; suíte confere que a leitura não quebra |
| Contrato legado sumir da lista | Suíte lista com contrato legado e exige presença |
| Contrato do fluxo novo aprovado sumir | Suíte exige o ATIVO na lista |
| Anexo de outra solicitação ser vinculado | Suíte tenta e exige recusa |
| Status parar em `APROVADA` | Suíte aprova a medição e exige `LIBERADO` |
| `PAGA` deixar de acontecer | Suítes 33 e 35 seguem passando |
| Forma de pagamento sumir sem configuração | Lista vazia = todas; suíte confere |

## 6. Suíte

`qa/medicao/42-medicao-pagamento-e-aprovacao.js` — **21 provas**, todas passando: os dados de
pagamento cobrados **um a um**, `LIBERADO | FINANCEIRO` depois da aprovação, 403 para quem não
aprova, 409 na segunda aprovação, o filtro da lista do item 8 e a configuração das formas.

---

## 7. Resultado da regressão — 23/08

### Bateria completa: 03 a 42, todas passando

Desta vez a bateria rodou **inteira**, e não por amostragem. Três coisas apareceram.

### 7.1 A fixture que faltava

Exigir os dados de pagamento quebrou **8 suítes** de uma vez — as que criam medição para provar
outra coisa (a máquina de estados, a redistribuição, o saldo, o prazo). O dado virou fixture nelas
(`qa/lib/pagamentoMedicao.js`), como a negociação já era na Fase 2. O favorecido sai do próprio
`contrato_credores` do contrato, que é o caso comum na tela — assim a fixture não inventa um
parceiro nem depende de um id fixo que pode não existir no banco de quem rodar.

A **42** deliberadamente **não** usa a fixture: lá o dado de pagamento é o objeto do teste.

### 7.2 Um defeito de tela que a suíte 09 achou

O comentário do bloco de pagamento dizia que o aceite cai sempre que um dado de pagamento muda — e
o campo **contato** não derrubava. Dava para confirmar *"os dados acima estão corretos"* e depois
trocar o contato, deixando uma confirmação que não se referia ao que seria pago. Corrigido; a suíte
09 agora **força esse erro** antes de enviar, e também confere que o favorecido já nasce marcado
como o credor do contrato.

### 7.3 Duas suítes paradas nas fases anteriores

| Suíte | Estava parada em |
|---|---|
| **10** | aprovava contrato **abaixo** do limite sem o documento de negociação — a Fase 2 estendeu a exigência a **todo** contrato |
| **24** | cadastrava credor PJ sem nome fantasia nem representante legal — exigência da **Fase 1** |

A **24** constava da lista de regressão da Fase 2. Constava sem ter sido de fato reexecutada depois
da Fase 1 — a lista estava mais otimista que a realidade, e só a bateria completa expôs isso.

### 7.4 O estrago de QA que estava mudo

A bateria anterior estourou o timeout e foi **morta** no meio da suíte 29, deixando para trás uma
linha de `PERMISSOES_AREAS_USUARIOS` com **1 usuário** no lugar da real com **27**. Configuração
versionada: a linha de maior `id` vale para o sistema inteiro.

O sintoma não foi um erro claro. Foi a suíte **24** reprovando por um motivo que não tinha nada a
ver com ela — um usuário sem permissão nenhuma **passou** numa checagem que devia recusá-lo, porque
*"nenhuma permissão configurada"* é tratado como liberado.

Restaurado publicando a última configuração real como **versão nova**, e não apagando a linha ruim:
configuração versionada se corrige acrescentando.

E `qa/lib/sessao.js` passou a conferir isso no `require`, antes de qualquer SQL da suíte, recusando
começar com a configuração contaminada. A conferência mora no carregamento do módulo e não em
`abrirSessao` porque várias suítes abrem uma segunda sessão **depois** de conceder as permissões
delas — ali a configuração pequena é legítima, e o guarda acusaria a própria suíte. Registrado
também em `PROTOCOLO-QA.md` §6.

### 7.5 Um ponto em aberto para o cliente

Com `APROVADA` fora do fluxo de contrato, sobrou uma situação sem regra escrita: **título pago, mas
ainda com parcela por medir**. Está voltando para `NEC. DE MEDIÇÃO`, que é literalmente o que a
solicitação passa a esperar. A prova da suíte 33 foi ajustada para isso — antes ela exigia
`APROVADA`. Se o cliente quiser outro status aí, é uma linha.
