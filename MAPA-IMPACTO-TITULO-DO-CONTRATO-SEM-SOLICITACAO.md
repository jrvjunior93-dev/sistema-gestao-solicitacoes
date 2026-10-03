# Mapa de impacto — o título do contrato não guarda a solicitação dele

Data: 24/08/2026. **Levantamento pedido pelo cliente**, a partir do achado da suíte 48 (Fase 6).

Este documento **não propõe uma entrega**: ele mede o buraco, mede o estrago de fechá-lo, e termina
com uma recomendação. Nenhuma linha foi alterada por causa dele.

---

## 1. O achado

Os títulos financeiros de um contrato do fluxo novo nascem em `aprovarContrato`, por
`criarTituloManual` (`contratoFluxoNovoService` :1361). Essa chamada monta o título com obra,
parceiro, valor, vencimento, categoria, forma de pagamento e rateio — **e nunca passou
`solicitacao_id`**.

Resultado: `titulos_financeiros.solicitacao_id` fica **nulo** nesses títulos, embora o contrato viva
dentro de uma solicitação desde a PI-16 e a solicitação esteja em `contratos.solicitacao_id`.

Foi encontrado ao construir o item 22, quando a rota dos arquivos respondeu *"este título não veio de
uma solicitação"* para o título de um contrato — o caso central do lote inteiro.

---

## 2. A escala, medida no banco

| | |
|---|---|
| Títulos no total | **2.851** |
| Com `solicitacao_id` | 2.377 |
| Sem `solicitacao_id` | 474 |
| Que são parcela de contrato | **8** |
| Parcela de contrato **e** sem `solicitacao_id` | **8** (todos) |
| Parcela de contrato do fluxo novo | 8 |

**Este número é o dado mais importante deste levantamento.** São **oito** linhas — e são oito porque
o fluxo novo de contratos é recente. Cada contrato aprovado daqui em diante acrescenta uma linha por
parcela: um contrato de 24 parcelas sozinho triplica o total de hoje.

Ou seja: **o custo de corrigir isso só cresce.** Hoje é uma migration que toca 8 registros; daqui a
um ano é uma que toca milhares, com muito mais coisa dependendo do estado errado.

---

## 3. O que mudaria se a coluna passasse a ser preenchida

Varredura de tudo que lê `titulos_financeiros.solicitacao_id`.

### 3.1 Onde o efeito seria uma CORREÇÃO

| Onde | Hoje | Passaria a ser |
|---|---|---|
| `obraGestaoService` :153 | título de contrato aparece como **"TITULO MANUAL"** nos custos da obra | "TITULO DA SOLICITACAO" |
| `relatorioFinanceiroService` :1193 e :1233 | `origem: 'MANUAL'` nos relatórios | `origem: 'SOLICITACAO'` |
| `relatorioFinanceiroService` :1363 | a linha do Financeiro de Obras leva `solicitacao_id` nulo | levaria a solicitação real |
| `arquivosDoTituloService` | precisa do desvio pela parcela do contrato | leria direto |

Nos três primeiros o sistema **hoje classifica errado**: chama de "manual" um título que nasceu de
uma solicitação aprovada. Quem lê o relatório de custos da obra vê "manual" e conclui que alguém
lançou à mão.

### 3.2 Onde o efeito seria uma MUDANÇA DE COMPORTAMENTO

| Onde | O que acontece hoje | O que passaria a acontecer |
|---|---|---|
| `SolicitacaoController` :3776 | apropriações da solicitação podem ser editadas (a contagem de títulos dá zero) | a edição seria **bloqueada** — "não é possível alterar apropriações depois que a solicitação possui título" |
| `SolicitacaoController` :5341 | a exclusão lógica registra `titulos_vinculados: 0` | registraria o número real |
| `tituloFinanceiroService` :2184 | o filtro `?solicitacao_id=` não devolve título de contrato | devolveria |

O primeiro é o único que **muda o que uma pessoa consegue fazer**. E, olhando de perto, o
bloqueio seria **coerente**: o rateio do contrato tem a sua própria trava depois dos títulos
(`PATCH /contratos/:id/apropriacoes`, provada na suíte 23), e a rota da solicitação hoje escapa dela
por acidente — não por decisão.

### 3.3 Onde NÃO mudaria nada

| Onde | Por quê |
|---|---|
| `solicitacaoFinanceiroStatusService` :74 | carrega os títulos, mas o desvio do contrato do fluxo novo (:92) **retorna antes** de usá-los |
| Os oito caminhos de baixa | leem `titulo.solicitacao_id` para sincronizar o status — que para contrato já é feito pelo desvio |
| `PrevisoesContrato` / card do contrato | lê `contrato_parcelas`, não `titulos_financeiros.solicitacao_id` |
| Contrato **legado** | não tem `contrato_parcelas`; nada a preencher |

---

## 4. O que seria preciso fazer

1. **`criarTituloManual` na aprovação passa `solicitacao_id: contrato.solicitacao_id`** — uma linha
   em `contratoFluxoNovoService` :1361. Vale para os contratos novos;
2. **Migration de retificação** para os 8 títulos existentes, preenchendo pela parcela:
   `contrato_parcelas.titulo_financeiro_id` → `contratos.solicitacao_id`. Faixa `0050+`, conforme
   `CONVENCAO-MIGRATIONS.md`;
3. **A rota do item 22 perde o desvio** — ou melhor: o desvio fica, como rede para qualquer título
   que ainda escape, e deixa de ser o caminho principal;
4. **Decidir sobre a trava de apropriações** (§3.2): mantê-la (coerente, mas é comportamento novo
   para o contrato) ou excluir contrato daquela contagem;
5. **Suíte própria**, e a **48 muda de lado**: hoje ela prova que a coluna nasce nula; passaria a
   provar que nasce preenchida.

**Estimativa:** pequeno. O código é uma linha, a migration é curta, e o teste já existe quase todo.
O que custa é a **conferência** dos pontos de §3.2 — e é por isso que isto é uma fase, e não um
remendo dentro de outro item.

---

## 5. Recomendação

**Fazer, e fazer agora.**

O argumento é o número: **8 registros**. É a menor janela que este problema vai ter. Cada contrato
aprovado daqui em diante torna a correção mais cara e o dado errado mais espalhado — e "título de
contrato aparece como lançamento manual no custo da obra" é o tipo de erro que alguém acaba
descobrindo lendo um relatório, e desconfiando do relatório inteiro.

A alternativa — deixar como está — significa manter o desvio pela parcela para sempre, e conviver com
a classificação errada em dois relatórios.

**O que eu recomendo NÃO fazer:** juntar isso ao item 22. Foi a decisão tomada na Fase 6 e ela
continua certa — item sobre abrir arquivo não é lugar para mexer em como o título nasce.

---

## 6. O que este levantamento não cobriu

- **Produção.** Os números são do banco local (`fluxy_main_copia`, cópia de produção). A ordem de
  grandeza deve valer, mas a migration de retificação precisa ser contada de novo lá antes de rodar;
- **Integrações.** `integracaoSiengeService` também escreve título; não foi verificado se o caminho
  dele passa por contrato;
- **A trava de apropriações (§3.2)** merece a palavra do cliente, e não uma decisão minha: é a única
  mudança que tira uma ação de alguém.

---

## 7. Executado em 24/08

O cliente aprovou (*"pode executar o trabalho"*), com duas correções ao levantamento:

> **SIENGE** — *"não existe mais essa integração na operação real da empresa, apenas o código
> legado."* A verificação que ficou em aberto no §6 sai da lista: não há caminho vivo por ali.

> **Migrations** — *"preciso que elas não apliquem mudança de dados no banco de produção, apenas nas
> tabelas."* Isso mudou a forma da entrega, e virou regra do projeto. Ver §7.2.

### 7.1 A correção

| Onde | O quê |
|---|---|
| `contratoFluxoNovoService` :1361 | a aprovação passa `solicitacao_id: contrato.solicitacao_id` |
| `tituloFinanceiroService` :2883 | **`solicitacao_id` era fixo em `null`** e o payload era descartado em silêncio |
| `backend/scripts/dados/backfillSolicitacaoDoTituloDeContrato.js` | os 8 títulos que já existiam |
| `arquivosDoTituloService` | o desvio pela parcela fica, como **rede** — deixou de ser o caminho principal |
| Suíte 48 | a prova **inverteu**: provava que a coluna nascia nula, agora prova que nasce preenchida |

**O achado dentro do achado:** `criarTituloManual` tinha `solicitacao_id: null` **fixo**. Passar o
campo no payload não dava erro — era descartado sem aviso. Uma linha do serviço explicava o `null`
original: aquele caminho era o de "título lançado à mão", e não havia quem chamasse com uma
solicitação. A aprovação do contrato passou a chamar (PI-16) e ninguém voltou lá.

### 7.2 A regra nova, e a auditoria que ela obrigou

Migration altera **estrutura**, nunca dados. Está em `CONVENCAO-MIGRATIONS.md` (Regra 5) e em
`MIGRACAO-PARA-PRODUCAO.md`.

A auditoria de toda a faixa V4 encontrou **três migrations minhas que gravavam dados** — e que
rodariam sozinhas no deploy, contra dados reais:

| Migration | Gravava | Regra atual |
|---|---|---|
| `202608180050` | `contrato_parcelas.valor_previsto` | registros antigos permanecem nulos |
| `202608180052` | `contratos.favorecido_id` | registros antigos permanecem nulos |
| `202608210050` | `contrato_aditivos.tipo` | registros antigos permanecem nulos |

As colunas continuam sendo criadas pelas migrations. Só o `UPDATE` saiu; nenhum backfill integra
o deploy. A faixa V4 está limpa.

As migrations do `dev-v2` (abaixo de `0050`) **não** foram tocadas: muitas gravam dados e já rodaram
em produção — reescrevê-las agora é que seria o risco.

### 7.3 A trava de apropriações

O §3.2 apontava a única mudança que tira uma ação de alguém: com a coluna preenchida,
`SolicitacaoController` :3776 passa a bloquear a edição de apropriações da solicitação do contrato.

Na prática o rateio do contrato é editado pela rota própria (`PATCH /contratos/:id/apropriacoes`,
suíte 23), que tem a sua própria trava depois dos títulos. A rota da solicitação escapava por
acidente. **A regressão é quem diz se alguma tela dependia do acidente.**

### 7.4 A regressão respondeu a pergunta do §3.2

**46 suítes, todas passando.** Nenhuma tela dependia do acidente: a trava de apropriações da
solicitação passou a valer para o contrato e não quebrou nada, porque o rateio do contrato já é
editado pela rota própria, que tem a sua própria trava.

O `origem: 'MANUAL'` dos relatórios e o `"TITULO MANUAL"` do custo da obra deixaram de mentir sobre
os títulos de contrato.

---

## 8. Um efeito colateral que o levantamento não previu

**A chave estrangeira passou a morder.**

`titulos_financeiros.solicitacao_id` tem `FOREIGN KEY ... ON DELETE RESTRICT`. Enquanto a coluna
nascia nula nos títulos de contrato, essa restrição **nunca disparava nesse caminho**. Preenchendo-a,
passou a disparar:

> Excluir uma solicitação de contrato é agora **bloqueado pelo banco** enquanto houver título
> financeiro apontando para ela.

Isso é **proteção correta** — não se apaga uma solicitação que já gerou título, e
`SolicitacaoController` :5341 já contava os títulos vinculados na exclusão lógica. Mas é
comportamento **novo**, e o §3 deste levantamento não o previu: a varredura olhou quem **lê** a
coluna e não quem **apaga** a linha do outro lado da chave.

**Como apareceu:** quatro suítes (06, 07, 08 e 09) apagavam a solicitação **antes** dos títulos na
limpeza. Funcionava só porque a coluna era nula. Todas passaram a apagar na ordem certa.

**Lição de método:** ao preencher uma coluna que participa de uma chave estrangeira, a pergunta não
é só "quem lê isto?" — é também "o que a chave passa a impedir?".
