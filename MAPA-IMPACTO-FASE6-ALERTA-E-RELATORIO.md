# Mapa de impacto — Fase 6: alerta de saldo e arquivos no relatório

Data: 24/08/2026. Escrito **antes da primeira linha de código** (regra §6 do `PROTOCOLO-QA.md`).

Itens: **21** (alerta de cor no saldo do contrato, em três níveis, com tela de configuração) e
**22** (no relatório Financeiro de Obras, ver os arquivos da linha).

E uma **pendência da Fase 3** que este mapa assume: a tela de configuração das formas de pagamento
da medição (item 9) **nunca foi construída** — só o backend. Ver §4.

---

## 1. O que foi verificado antes de propor

### 1.1 O saldo do contrato aparece em **um** lugar

`PrevisoesContrato.jsx` :139 — `Saldo do contrato: <strong>{moeda(...)}</strong>`, embaixo da tabela
de parcelas. É o único lugar da tela onde ele existe, e é exatamente o texto que o cliente descreveu:

> *"o alerta é só a cor do texto do saldo do contrato. Não é tela nova para exibir alerta."*

### 1.2 A configuração de cores já tem um padrão a seguir

`configuracoes_sistema` guarda `TEMA_SISTEMA` — a configuração de cores do sistema que o plano cita
como modelo. É a mesma mecânica das outras chaves: **versionada**, a linha de maior `id` vale.

### 1.3 A linha do relatório já sabe qual é o título — e não sabe qual é a solicitação

`buildFinanceiroObrasLinhaBase` (:1357) devolve `titulo_id`, mas não `solicitacao_id`. E é pela
solicitação que se chega aos arquivos:

| Tabela | Aponta para |
|---|---|
| `anexos` | `solicitacao_id` (e `medicao_id`, desde a Fase 3) |
| `comprovantes` | `solicitacao_id`, `obra_id` |

**Nenhuma das duas aponta para o título.** Então "os arquivos daquele título" são, na prática, os
arquivos da **solicitação vinculada a ele** — que é a segunda metade da frase do cliente:

> *"ver os arquivos vinculados àquele título e/ou à solicitação vinculada a ele."*

Consequência que precisa ficar visível na tela: **título sem solicitação** (importado do histórico,
lançado à mão) **não tem arquivo nenhum**, e a tela tem de dizer isso — não abrir uma janela vazia.

---

## 2. Item 21 — o alerta de cor

### 2.1 Três níveis, nomeados pelo cliente

| Nível | Quando | Cor padrão |
|---|---|---|
| **Saudável** | saldo ≥ 50% do valor do contrato | verde |
| **Normal** | saldo ≥ 20% | âmbar |
| **Crítico** | abaixo de 20% | vermelho |

O percentual é do **saldo sobre o valor do contrato** (valor original + aditivos), que é o que
`calcularSaldoDoContrato` já devolve. Contrato encerrado tem saldo zero por regra — cai em Crítico,
que é honesto: não há mais o que gastar.

### 2.2 A configuração

Chave nova `ALERTA_SALDO_CONTRATO` em `configuracoes_sistema`, versionada, guardando os dois
percentuais de corte e as três cores.

**Padrão embutido quando não há configuração.** Sem isso o sistema nasceria sem cor nenhuma até
alguém abrir a tela — a mesma armadilha que a lista de formas de pagamento evitou na Fase 3 com
"lista vazia = todas". Configuração **cura**, não é pré-requisito.

**Validação:** o corte de Saudável tem de ser maior que o de Normal, e os dois entre 0 e 100. Sem
isso dá para configurar uma faixa que nunca acontece, e o alerta some sem ninguém entender por quê.

### 2.3 Onde a cor é decidida

**No backend**, junto do saldo. A tela recebe o nível já resolvido (`saldo_alerta: { nivel, cor }`),
em vez de baixar os percentuais e refazer a conta.

A razão é a regra que este projeto já pagou para aprender: **duas versões da mesma regra divergem**.
Foi o que aconteceu com a chave PIX (a escolha ficou no backend de propósito) e é o que o comentário
do cabeçalho registra. Se amanhã o alerta aparecer também no relatório, os dois lugares lerão a
mesma resposta.

---

## 3. Item 22 — os arquivos da linha do relatório

### 3.1 O que muda

1. `solicitacao_id` entra na linha do relatório (`buildFinanceiroObrasLinhaBase`);
2. rota nova `GET /financeiro/relatorios/financeiro-obras/titulos/:id/arquivos`, com **a mesma
   permissão do relatório** (`financeiro.relatorios.financeiro_obras`). Devolve os anexos e os
   comprovantes da solicitação vinculada;
3. a linha da tabela vira clicável e abre um modal com a lista.

### 3.2 Por que rota própria, e não reaproveitar `/solicitacoes/:id/anexos`

A rota existente é do módulo de solicitações e cobra a permissão **de lá**. Quem lê o relatório
financeiro é o Financeiro, que pode não ter acesso à solicitação — e receberia 403 clicando numa
linha do próprio relatório.

A rota nova é estreita de propósito: **só lê**, recebe o **título** (não a solicitação), confere que
o título está no escopo de obras do usuário, e devolve nome e link. Sem isso, ela viraria um caminho
lateral para ler anexo de qualquer solicitação passando um id qualquer.

---

## 4. A pendência da Fase 3 que aparece aqui

O item 9 pedia escolher **quais** formas de pagamento aparecem na medição, e que a tela de
configuração ficasse nas configurações do superadmin.

A Fase 3 entregou o serviço (`formasPagamentoMedicaoService`), as rotas
(`GET`/`PATCH /configuracoes/formas-pagamento-medicao`) e a suíte — **e não entregou a tela**. Hoje a
configuração só é alcançável por chamada direta à API.

Está sendo construída junto com a do item 21, no mesmo lugar (menu Configurações), porque são a mesma
natureza de tela e seria estranho entregar uma e deixar a outra pela metade. **Isso é correção de
uma entrega minha incompleta, não escopo novo.**

---

## 5. O que pode quebrar

| Risco | Verificação |
|---|---|
| Saldo perder a cor por falta de configuração | Padrão embutido; suíte apaga a configuração e exige as três cores funcionando |
| Faixa impossível ser aceita | Suíte tenta gravar Saudável < Normal e exige recusa |
| Percentual fora de 0–100 | Suíte tenta e exige recusa |
| A cor divergir entre backend e tela | O nível vem resolvido do backend; a tela não recalcula |
| Contrato encerrado mostrar cor errada | Saldo é zero por regra: suíte encerra e exige Crítico |
| A rota nova virar caminho lateral para anexos | Suíte pede o título de outra obra e exige recusa |
| Título sem solicitação abrir modal vazio | Suíte clica e exige a mensagem, não uma lista vazia |
| O relatório mudar de comportamento | Suíte confere que as linhas continuam iguais, com o campo novo a mais |
| A tela de formas quebrar a medição | A medição continua lendo do mesmo serviço; suíte 42 segue passando |

---

## 6. O que **não** muda

- o cálculo do saldo (`calcularSaldoDoContrato`);
- as linhas e os totais do relatório Financeiro de Obras;
- as rotas de anexo existentes;
- a regra "lista vazia = todas" das formas de pagamento da medição.

---

## 7. Suítes

- `qa/medicao/47-alerta-de-saldo-do-contrato.js` — item 21, **16 provas**;
- `qa/medicao/48-arquivos-no-financeiro-de-obras.js` — item 22, **12 provas**.

---

## 8. O que a implementação revelou

### 8.1 O título do contrato não guarda a solicitação dele

**Achado pela suíte 48, e é o mais relevante da fase.**

Os títulos do contrato do fluxo novo nascem por `criarTituloManual` na aprovação, e essa chamada
**nunca passou `solicitacao_id`**. A coluna fica nula. Ou seja: o título de um contrato — justamente
o caso central deste lote — respondia *"este título não veio de uma solicitação"*, o que é falso.

O elo existe por outro caminho: `contrato_parcelas.titulo_financeiro_id` → `contratos.solicitacao_id`.
A rota do item 22 passou a usá-lo.

**Preencher a coluna na aprovação seria o dado mais correto — e não foi feito, de propósito.**
`titulos_financeiros.solicitacao_id` é consultada por várias telas do Financeiro, e mudar quais
títulos elas passam a enxergar é uma alteração de alcance desconhecido. Grande demais para entrar de
carona num item sobre abrir arquivo, num sistema em produção, no fim de um lote longo.

Fica registrado como **pendência com mapa próprio**. A suíte 48 grava o estado atual numa prova: se
um dia a coluna passar a ser preenchida, é ela que avisa.

### 8.2 Duas armadilhas de coluna obrigatória

`titulos_financeiros.parceiro_id` é `NOT NULL` sem default — o `INSERT` da fixture falhava. É o mesmo
tipo de armadilha do `anexos.area_origem`, já registrada. Ambas agora estão comentadas na suíte.

---

## 9. Regressão

**46 suítes, todas passando** (`node qa/rodar-bateria.js`, backend reiniciado antes).

Duas execuções anteriores foram descartadas: rodaram **sobrepostas** — uma iniciada antes de a outra
terminar — e o guarda de permissões recusou as suítes em massa, no `require`. Nenhuma reprovação
daquelas duas era defeito de produto, e nenhuma era aprovação também. Ver `PROTOCOLO-QA.md` §6.8 e a
trava em `qa/rodar-bateria.js`.
