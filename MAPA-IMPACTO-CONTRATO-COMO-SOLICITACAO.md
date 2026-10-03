# Mapa de impacto — o contrato passa a viver dentro de uma solicitação

Escrito **antes** de codar, como manda a regra 1 do projeto.
Pedido do cliente: 19/08/2026. É o maior bloco desta fase — inverte a arquitetura do fluxo novo
de contratos, que hoje vive fora de Solicitações.

---

## 1. O fluxo que o cliente desenhou

Transcrito do pedido, sem interpretação:

### Abertura

1. A **Abertura de Contrato cria uma solicitação** — a **única** solicitação de todo o contrato.
2. As **previsões** de parcelas são listadas no **card do Financeiro**, dentro do detalhe da
   solicitação, **antes** da aprovação.
3. Um **botão Aprovar** no detalhe transforma as previsões em **títulos**.
4. **Acima da variável de volume** (hoje R$ 50.000), depois de aprovada a solicitação é
   **encaminhada automaticamente ao setor JURÍDICO** para análise.
5. O **JURÍDICO** tem botões de **aprovar e rejeitar**, gera a **minuta** e a **anexa ao
   histórico**.
6. Aprovado pelo Jurídico, volta ao **responsável pela criação** com status **`Nec. de
   Assinatura`**.
7. O responsável **anexa o contrato assinado** e aciona **Solicitar revisão**, que devolve a
   solicitação ao Jurídico **em destaque no topo** da lista.
8. O Jurídico aprova; então a solicitação **recebe os títulos** no card do Financeiro e volta ao
   responsável com status **`Aprovado`**.

### Medição

Todas as medições daquele contrato **alteram a solicitação inicial** — mudando o status dela, as
previsões e o status dos títulos quando necessário. **A medição não cria solicitação própria.**

### Termo aditivo

- Contrato do **fluxo novo**: o aditivo **nasce dentro da solicitação original** do contrato.
- Contrato do **fluxo antigo**: o aditivo **cria uma solicitação nova**.

### Decisões confirmadas (19/08)

| Pergunta | Resposta |
|---|---|
| A medição perde a solicitação própria? | **Sim** — o **título** vira a unidade de aprovação e pagamento |
| Quem é a fonte da verdade do estado? | **A solicitação manda**; `contratos.status_contrato` passa a **espelhar** |
| Entrega | **Tudo de uma vez** — abertura, jurídico, medição e aditivo no mesmo bloco |

---

## 2. A regra do cliente vai para a política antes do código

**PI-16 — O contrato é uma solicitação.** A abertura de contrato deixa de ser um registro à parte
e passa a nascer como **uma solicitação**, que acompanha o contrato por toda a vida dele. Medições
e aditivos do fluxo novo **não criam solicitações novas**: alteram essa. A unidade de aprovação e
pagamento passa a ser o **título**, não a solicitação. O estado vive na solicitação; o contrato o
espelha.

---

## 3. A maquinaria que já existe (e que o desenho aproveita)

Levantado no código e no banco, não presumido:

| O que o fluxo pede | O que já existe |
|---|---|
| Encaminhar ao JURÍDICO após aprovar | `AUTOMACAO_STATUS_SETOR` — regra **configurável** `tipo + status → setor_destino`. Já roteia 12+ tipos |
| Setor JURÍDICO | `setores` id **6**, ativo |
| Destaque no topo da lista | `solicitacoes.prioridade_diretoria_ativa` / `_em` / `_lote_id` + tela "Prioridades Diretoria" |
| Status livres por setor | `status_global` é texto; `SETORES_ALTERACAO_STATUS_LIVRE` e `SETORES_SEM_ALTERACAO_STATUS` governam quem muda |
| Trocar o status e rotear | `PATCH /solicitacoes/:id/status` → `SolicitacaoController.updateStatus` |
| Destino pós-aprovação | coluna `solicitacoes.setor_destino_pos_aprovacao`, já usada pelo fluxo de compras |
| Card do Financeiro com categoria | `SolicitacaoDetalhe/FinanceiroCard.jsx` — já tem `CategoriaFinanceiraAutocomplete` e exige a categoria ao gerar o título |
| Gerar título a partir da solicitação | `POST /solicitacoes/:id/gerar-conta` → `TituloFinanceiroController.criarPorSolicitacao` |
| Vínculo solicitação ↔ contrato | `solicitacoes.contrato_id` (656 das 665 medições já usam) e `codigo_contrato` |
| Anexos e histórico | tabela `anexos`, `Timeline.jsx`, `Comentarios.jsx` no detalhe |
| Aplicar medição nas parcelas | `medicaoContratoService.aplicarMedicaoNasParcelas({ contratoId, solicitacaoId, itens })` — **já recebe o id da solicitação** |
| Títulos em série a partir das parcelas | `contratoFluxoNovoService.aplicarAprovacaoNaTransacao` — cria via `criarTituloManual`, com auditoria |

**Conclusão do levantamento:** o desenho é, em grande parte, **montagem de peças existentes**.
O que não existe é o **encaixe** entre elas.

---

## 4. O que é genuinamente novo

| # | Novo | Por quê é novo |
|---|---|---|
| N1 | A abertura passar a **criar solicitação** | Hoje `contratoFluxoNovoService` não tem um único `Solicitacao.create` — nasce só o contrato |
| N2 | Card do Financeiro listar **previsões** (parcelas) antes de existir título | Hoje ele lista **títulos**; previsão de parcela não aparece ali |
| N3 | **Aprovar no detalhe** criar os títulos **em série** a partir das parcelas | Hoje `gerar-conta` cria **um** título por vez, à mão |
| N4 | A trilha do Jurídico como **estados da solicitação** + minuta anexada + `Nec. de Assinatura` + **Solicitar revisão** com destaque | Hoje é uma máquina de estados do **contrato**, sem tela nenhuma |
| N5 | A medição **sem solicitação própria** | Hoje toda medição é uma solicitação completa |
| N6 | O aditivo **dentro** da solicitação (fluxo novo) e **nova** solicitação (fluxo antigo) | Hoje o aditivo não cria nem altera solicitação |
| N7 | **Inversão da fonte da verdade**: `status_contrato` passa a espelhar `status_global` | Hoje o contrato é o dono do estado, e está **auditado assim** |
| N8 | **Categoria financeira sai da criação** e passa a ser exigida **na aprovação** | Hoje é obrigatória na criação (`contratoFluxoNovoService.js:129`) |
| N9 | A **medição ganha identidade própria** (número sequencial por contrato + período), sem voltar a ser solicitação | Decorre de 7.1: ela precisa segurar anexos e comentários. Resolve junto o "número automático" do escopo |
| N10 | **Modal por título** no card do Financeiro, com os anexos e comentários da medição daquele título | Pedido do cliente em 7.1 |
| N11 | **Rejeitar** (volta em `PENDENTE DE AJUSTE`) e **Cancelar** (terminal) na solicitação do contrato | Decidido em 7.2; o Cancelar é por **permissão granular**, não por setor |

---

## 5. As mudanças, por camada

### 5.1 Banco

| Mudança | Observação |
|---|---|
| `contratos.solicitacao_id` (nova coluna, anulável) | O elo do contrato com a sua solicitação única. Anulável porque os 335 legados não têm |
| `contrato_medicoes` (**tabela nova**) | Identidade da medição: `contrato_id`, `numero` sequencial por contrato, período, criado_por. Sem ela a medição não tem onde pendurar anexo, comentário nem número |
| `medicao_parcelas.medicao_id` (nova coluna) | Liga cada parcela medida ao evento de medição. Hoje só existe `solicitacao_id`, que passaria a ser sempre o mesmo |
| Vínculo do anexo/comentário com a medição | Para o modal do título achar os documentos daquela medição |
| `contratos.categoria_financeira_id` | **Já é anulável** — nada a migrar |
| Nenhuma coluna removida | O `status_contrato` continua existindo, agora como espelho |

**Sem migration destrutiva.** Existem **zero** contratos do fluxo novo hoje, então nenhuma linha
precisa ser convertida.

### 5.2 Backend

| # | Mudança | Onde |
|---|---|---|
| B1 | Criar o contrato passa a criar **também** a solicitação, na mesma transação | `contratoFluxoNovoService.criarContrato` |
| B2 | Categoria financeira deixa de ser exigida na criação | `contratoFluxoNovoService.js:129` |
| B3 | Categoria financeira passa a ser **obrigatória na aprovação**, nos **dois** caminhos | `aprovarContrato` e a etapa `assinado` do Jurídico — os dois pontos que chamam `aplicarAprovacaoNaTransacao` |
| B4 | Aprovar pela solicitação: nova rota que valida categoria, cria os títulos em série e move o status | `SolicitacaoController` + `contratoFluxoNovoService` |
| B5 | Roteamento ao Jurídico por **configuração**, não por código | regra em `AUTOMACAO_STATUS_SETOR` |
| B6 | `status_contrato` passa a ser **derivado** do `status_global` | um único ponto de sincronização, para os dois não divergirem |
| B7 | Medição deixa de criar solicitação: aplica na solicitação do contrato | `SolicitacaoController` (ramo da medição) + `aplicarMedicaoNasParcelas` |
| B8 | Aditivo: fluxo novo altera a solicitação do contrato; legado cria solicitação | `contratoAditivoService` |
| B9 | **Rejeitar** → `PENDENTE DE AJUSTE` de volta ao responsável, com motivo. **Cancelar** → `CANCELADA`, terminal | `SolicitacaoController` |
| B10 | Permissão nova **`contratos.solicitacao.cancelar`** para o botão Cancelar | Vale para Jurídico e Gerência de Processos — a permissão manda, não o setor |
| B11 | Medição passa a criar um registro em `contrato_medicoes` e numerá-lo por contrato | `medicaoContratoService` |

### 5.3 Frontend

| # | Mudança | Onde |
|---|---|---|
| F1 | Card do Financeiro lista **previsões** quando ainda não há título | `SolicitacaoDetalhe/FinanceiroCard.jsx` |
| F2 | Botão **Aprovar** no detalhe, exigindo a categoria financeira | `SolicitacaoDetalhe` |
| F3 | Botões do **Jurídico** (aprovar, rejeitar, anexar minuta) | `SolicitacaoDetalhe`, visíveis pelo setor |
| F4 | **Solicitar revisão** + destaque no topo | `SolicitacaoDetalhe` + mecanismo de prioridade |
| F5 | Nova Solicitação: **remover** a categoria financeira do subtipo Abertura | `BlocoContratoFluxoNovo.jsx` |
| F6 | Medição deixa de abrir solicitação nova quando o contrato é do fluxo novo | `NovaSolicitacao.jsx` |
| F7 | Botão no início de cada título abrindo o **modal de anexos e comentários** da medição daquele título | `SolicitacaoDetalhe/FinanceiroCard.jsx` |
| F8 | Botões **Rejeitar** e **Cancelar** (este por permissão) | `SolicitacaoDetalhe` |

---

## 6. Riscos — o que pode quebrar

| Risco | Alcance | Mitigação |
|---|---|---|
| **N7 — inverter a fonte da verdade** mexe na máquina de estados **auditada 5 vezes** | o coração do fluxo novo | Sincronização em **um ponto só**; suíte que confere os dois estados em cada transição |
| **N5 — medição sem solicitação** muda como o Financeiro trabalha | só contratos do **fluxo novo** | **Zero** contratos do fluxo novo hoje; as 665 medições históricas são todas de contratos legados e **não são tocadas** |
| Trilha da medição **legada** | 665 solicitações em produção | Não muda: contrato legado continua gerando solicitação de medição |
| Roteamento por configuração afetar outros tipos | 12+ tipos já roteados | A regra nova é por `tipo_solicitacao_id`; não altera as existentes |
| Categoria sair da criação e ninguém informar depois | contratos parados | B3 barra a aprovação sem categoria — o contrato não avança sem ela |
| Duas telas mostrando o mesmo contrato (Solicitações e Gestão de Contratos) | confusão | Gestão de Contratos passa a mostrar o status espelhado e apontar para a solicitação |

### O que **não** muda

- A trilha **legada** inteira: medição, ajuste manual, aprovação de solicitação comum
- O teto de 25% do aditivo, a devolução na rejeição, o saldo do contrato
- As regras de parcelas (centavos, redistribuição, teto de 24)
- O limite do Jurídico continuar sendo configuração de tela

---

## 7. Pontos do desenho — resolvidos com o cliente (19/08)

### 7.1 Anexos e comentários por medição — **decidido**

> *"Pensei no campo do título, no início de cada título no card do Financeiro, ter um botão para
> abrir um modal com todos os anexos e comentários da solicitação de medição daquele título."*

Isso decide mais do que o anexo: **a medição precisa de identidade própria**. Ela deixa de ser uma
solicitação, mas não vira nada — continua sendo um evento com documentos, comentários e período.

Cadeia resultante: **título → parcela → evento de medição → anexos e comentários**.

Consequência boa: isso resolve de graça o **"número automático da medição"** que o escopo do
cliente pedia (`MAPA-CAMPOS-CONTRATOS.md`) e que eu tinha marcado como pendência na versão anterior
deste mapa. A medição ganha número sequencial por contrato sem voltar a ser solicitação.

### 7.2 Rejeição e cancelamento pelo Jurídico — **decidido**

> *"Voltar para o responsável com o status PENDENTE DE AJUSTE, que já é usado no sistema hoje.
> Jurídico precisa ter o botão de Cancelar e nesse caso a solicitação não volta. Gerência de
> Processos também — então penso que esse botão pode ser por permissão granular."*

| Ação | Efeito | Quem |
|---|---|---|
| **Rejeitar** | volta ao responsável em **`PENDENTE DE AJUSTE`** (status já em uso: 37 registros hoje), com o motivo visível. Corrige e reenvia | Jurídico |
| **Cancelar** | **terminal** — a solicitação **não volta** (`CANCELADA`, status já em uso: 324 registros) | Jurídico **e** Gerência de Processos, por **permissão granular** |

Rejeitar devolve; cancelar encerra. São ações distintas, e o cancelar é o que precisa de permissão
própria — por isso não fica atrelado ao setor, e sim à permissão.

### 7.3 Cancelamento de medição — premissa registrada

Como o **título é a unidade** (decisão de 19/08), cancelar uma medição passa a ser uma ação sobre
o **título**, não sobre uma solicitação. Decorre direto da decisão; se estiver errado, é barato
corrigir cedo.

---

## 8. Como se prova

Suítes novas, com o número conferido no banco:

| Suíte | Prova |
|---|---|
| abertura cria solicitação | contrato e solicitação nascem juntos, vinculados, sem título |
| previsões no card | o detalhe lista as parcelas previstas antes da aprovação |
| aprovar exige categoria | sem categoria a aprovação é recusada, abaixo **e** acima do limite |
| aprovar abaixo do limite | títulos nascem, status espelhado nos dois lados |
| acima do limite | vai ao Jurídico por configuração, **sem** título |
| trilha do Jurídico | minuta, `Nec. de Assinatura`, revisão com destaque, aprovação final e títulos |
| medição sem solicitação | medir não cria solicitação e altera a do contrato |
| aditivo fluxo novo / legado | dentro da solicitação existente / nova solicitação |
| regressão | as 665 medições legadas e o fluxo padrão intactos |

---

## 9. Escala — leitura honesta

Este bloco toca: a criação do contrato, a aprovação (auditada 5 vezes), a máquina de estados do
Jurídico, o serviço de medição, o serviço de aditivo, a tela de detalhe da solicitação, o card do
Financeiro e a Nova Solicitação. **É o maior bloco desta fase** — maior que a medição inteira
(marco 14) e que a aprovação (marco 12), que sozinhos levaram várias rodadas de auditoria.

O cliente pediu entrega única. O risco assumido, registrado aqui: **um erro de premissa custa o
bloco inteiro**, porque não há ponto de conferência no meio. Por isso este mapa é longo — ele é o
único ponto de conferência antes do código.

---

## 10. Estado da implementação — 19/08/2026

### Feito e provado

| # | Entrega | Prova |
|---|---|---|
| Banco | `contratos.solicitacao_id`, tabela `contrato_medicoes`, `medicao_parcelas.medicao_id`, `medicao_id` em `anexos` e `historicos` | 3 migrations aplicadas e conferidas no schema |
| Models | `ContratoMedicao` + associações; `Contrato.solicitacao_id`; `MedicaoParcela.medicao_id` | backend sobe limpo |
| **B1** | A criação do contrato cria **também a solicitação**, na mesma transação, vinculada nos dois sentidos | suíte 18 |
| **B2** | Categoria financeira **saiu** da criação | suíte 18 (contrato criado sem categoria) |
| **B3** | Categoria **obrigatória na aprovação**, abaixo **e** acima do limite | suíte 18, com erro forçado nos dois |
| **B4** | Aprovar recebe e grava a categoria, com a curadoria valendo | suíte 18 (título herda a categoria de quem aprovou) |
| **B6** | Espelhamento de estado em **ponto único**, com roteamento ao JURÍDICO e volta à área de origem | suíte 18, trilha completa |
| **F5** | Categoria removida da Nova Solicitação; a tela passa a enviar `area_responsavel` | suítes 01 e 18 |

**Suíte nova:** `qa/medicao/18-contrato-como-solicitacao.js` — **20 provas**, incluindo a trilha do
Jurídico inteira (`EM ANALISE` no setor JURIDICO → `NEC. DE ASSINATURA` de volta na origem →
`APROVADA` com títulos).

**Regressão:** `medicao/03` a `17`, `integracao-d38/01` e `03` — **todas passam**.
Banco limpo ao fim: 0 contratos do fluxo novo, 0 solicitações de QA, 0 órfãs.

### Achado durante a execução

**A FK `solicitacoes.contrato_id` é `SET NULL`, não `CASCADE`.** Apagar o contrato **não** apaga a
solicitação: ela fica para trás com o vínculo nulo. Como o contrato passou a criar solicitação,
**toda suíte que cria contrato passou a deixar sujeira** — e três já tinham ficado no banco antes
de eu notar. Limpeza explícita acrescentada em 14 suítes (regra 8: limpeza cobre banco e disco).

### Falta fazer

| # | Falta | Observação |
|---|---|---|
| B7 / B11 | Medição **sem solicitação própria**, criando registro em `contrato_medicoes` com número por contrato | a peça de maior risco que resta |
| B8 | Aditivo **dentro** da solicitação (fluxo novo) / **nova** solicitação (fluxo antigo) | |
| B9 / B10 | **Rejeitar** (`PENDENTE DE AJUSTE`) e **Cancelar** (`CANCELADA`) + permissão `contratos.solicitacao.cancelar` | |
| F1 | Card do Financeiro listando **previsões** antes de haver título | |
| F2 | Botão **Aprovar** no detalhe, exigindo a categoria | o backend já aceita; falta a tela |
| F3 / F4 | Botões do Jurídico, anexo da minuta, **Solicitar revisão** com destaque no topo | o backend já tramita; falta a tela |
| F6 | Medição deixar de abrir solicitação nova | |
| F7 | Modal de anexos e comentários por título | |
| F8 | Botões Rejeitar e Cancelar | |

**O sistema está consistente neste ponto:** o que foi entregue funciona ponta a ponta pelo serviço
e está coberto por suíte. O que falta é, em boa parte, a **tela** dos fluxos que o backend já
executa — mais a refatoração da medição, que é o item de maior risco do que resta.

---

## 11. Estado — backend concluído (19/08/2026, 2ª rodada)

### O backend da PI-16 está inteiro

| # | Entrega | Prova |
|---|---|---|
| B7 / B11 | **Medição deixa de criar solicitação** e vira evento da solicitação do contrato, com registro próprio numerado por contrato | suíte 19 |
| B8 | **Aditivo** entra na solicitação existente (fluxo novo) e **abre uma nova** (fluxo antigo) | suíte 16 |
| B9 | **Rejeitar** devolve em `PENDENTE DE AJUSTE` pelo espelhamento de estado | suíte 18 |
| B10 | **Cancelar** terminal (`CANCELADA`), sob a permissão nova `contratos.solicitacao.cancelar` | rota e permissão declaradas |

**Suítes novas:** `18-contrato-como-solicitacao` (20 provas) e `19-medicao-sem-solicitacao`
(13 provas). `16-aditivo-contrato-legado` cresceu para **19 provas**.

**Regressão completa:** `medicao/03` a `19`, `integracao-d38/01` e `03` — **todas passam**.
Banco ao fim: 0 contratos do fluxo novo, 0 solicitações de QA, 0 medições órfãs, 0 solicitações
órfãs.

### Achados desta rodada

1. **`historicos.setor` é NOT NULL.** O serviço do aditivo também é chamado fora da tela, sem
   área. Recuo: a área da própria solicitação, que sempre existe.
2. **Os 335 contratos legados têm `tipo_macro_id` NULO**, e `solicitacoes.tipo_solicitacao_id` é
   NOT NULL. O aditivo de contrato legado precisa de um tipo para a solicitação que ele abre —
   e não existe um óbvio. **Não chutei:** virou a configuração
   `CONTRATO_ADITIVO_TIPO_SOLICITACAO`, com erro que diz exatamente o que configurar. **Qual tipo
   a empresa quer para esses pedidos continua em aberto** (ver seção 12).
3. **`solicitacao_visibilidade_usuario` tem FK RESTRICT** — a limpeza das suítes precisou cobrir
   visibilidade, notificações e rateio antes de apagar a solicitação.
4. A suíte 09 provava a medição achando "a solicitação da medição". Com a PI-16 isso deixou de
   existir; passou a provar a **medição do contrato** — e ganhou a guarda de que nenhuma
   solicitação foi criada.

### Falta — só a tela

| # | Falta |
|---|---|
| F1 | Card do Financeiro listando **previsões** antes de haver título |
| F2 | Botão **Aprovar** no detalhe, exigindo a categoria (o backend já aceita) |
| F3 / F4 | Botões do Jurídico, anexo da minuta, **Solicitar revisão** com destaque no topo |
| F6 | Medição deixar de abrir solicitação nova **na tela** (o backend já não abre) |
| F7 | **Modal de anexos e comentários por título** (o `medicao_id` já é gravado em anexos e históricos) |
| F8 | Botões **Rejeitar** e **Cancelar** |

---

## 12. Pergunta em aberto para o cliente

**Qual tipo de solicitação deve receber o aditivo de contrato do fluxo ANTIGO?**

Ele abre uma solicitação própria (decisão de 19/08), e ela precisa de um tipo. Os 335 contratos
legados não carregam tipo nenhum. Os candidatos hoje:

| Tipo | Observação |
|---|---|
| `2` — ABERTURA DE CONTRATO | é o tipo do contrato legado, mas **será desativado** na migração (PI-14) |
| `4` — MEDIÇÃO | é de onde o pedido parte na tela, mas o aditivo não é uma medição |
| `33` — CONTRATO | é sobre contrato, mas carrega `usa_fluxo_contrato_novo`, o que pode confundir a tela |

### Decidido pelo cliente (19/08)

**Criar um tipo próprio `ADITIVO DE CONTRATO`, marcado como de USO DO SISTEMA, e o setor que
recebe é a GERÊNCIA DE PROCESSOS.**

Não conflita com a PI-15. Ela tirou o aditivo como **porta de entrada** (ninguém o escolhe numa
lista para abrir solicitação); o tipo aqui é **classificação** do que o botão cria. São coisas
diferentes: sem tipo próprio, o aditivo legado teria de tomar emprestado MEDIÇÃO ou CONTRATO, e
mentiria em todo relatório.

**Por que "uso do sistema" e não a lista por setor.** O `TIPOS_SOLICITACAO_POR_SETOR` funciona por
lista de permissão, e o código diz: *setor sem lista mostra todos os tipos ativos*. Medido: dos
**19 setores ativos, 9 não têm lista** (COMERCIAL, SESMT, DIRETORIA, FISCAL, SUPORTE, COMPRAS-1 e
as três diretorias). Esconder por omissão vazaria para esses 9 — e voltaria a vazar a cada setor
novo criado. A marca vai no **próprio tipo** (`comportamento.somente_sistema`), que o filtro
respeita sempre, independentemente de setor.

**Cuidado registrado:** o normalizador de comportamento **descarta qualquer chave que não esteja
no default** — está comentado no próprio `tipoSolicitacaoBehaviorService.js:30`, onde a flag do
fluxo novo se perdeu antes por esse motivo. `somente_sistema` precisa entrar no default dos DOIS
lados (backend e frontend), senão some na serialização.

**Setor fixo:** o aditivo de contrato legado cai sempre na **Gerência de Processos**, e não na área
de quem estava na tela — o pedido é sobre contrato, e a fila é dela.

### Implementado e provado (19/08)

| Entrega | Prova |
|---|---|
| Tipo `ADITIVO DE CONTRATO` (id 34) com `somente_sistema: true` | suíte 17 |
| `somente_sistema` no default do comportamento, **backend e frontend** | sem ela a flag some na serialização |
| Tela não lista tipo de uso do sistema, **em setor nenhum** | suíte 17 |
| Rota `POST /solicitacoes` **recusa** o tipo com mensagem própria | suíte 17 — esconder só na tela seria cadeado com a janela aberta |
| Aditivo legado cai em **GEO**, fixo | suíte 16 |
| Sem a configuração, recusa dizendo o que configurar | suíte 16, erro forçado |

Regressão completa depois da mudança no comportamento dos tipos (`medicao/03` a `19`,
`integracao-d38/01` e `03`): **todas passam**. Registrado em `POLITICA-INTERNA-CSC.md` como
**PI-17** e em `MIGRACAO-PARA-PRODUCAO.md` seção **3.14**.

---

## 13. Estado — a tela (19/08/2026, 3ª rodada)

### Feito e provado

| # | Entrega | Prova |
|---|---|---|
| F1 | **Previsões no card do Financeiro**, antes de existir título; depois da aprovação a mesma tabela mostra as parcelas com título e a medição de cada uma | suíte 21 |
| F2 | Botão **Aprovar** no detalhe, com a categoria financeira obrigatória e barrada **na tela** antes de chamar o servidor | suíte 20 |
| F3 | Botões do **Jurídico**: minuta pronta e registrar contrato assinado | suíte 20 |
| F7 | **Modal por título** com os anexos e comentários **daquela** medição | suíte 21 |
| F8 | **Rejeitar** (devolve em `PENDENTE DE AJUSTE`, com motivo) e **Cancelar** (terminal, por permissão) | suíte 20 |

**Componentes novos:** `AcoesContrato.jsx`, `PrevisoesContrato.jsx`, `ModalMedicao.jsx`.

**Suítes novas:** `20-tela-fluxo-do-contrato` (10 provas) e `21-previsoes-e-modal-medicao`
(8 provas). Regressão completa: **todas passam**, banco limpo.

### Decisões de implementação que valem registro

**A barra lê o estado do CONTRATO, não o da solicitação.** O contrato é quem tem a máquina de
estados; a solicitação espelha. Ler o espelho para decidir o que oferecer seria inverter a fonte
da verdade — e bastaria uma dessincronia para a tela oferecer o que a API recusa.

**A suíte 20 precisa conceder permissão para si mesma.** As ações exigem permissão estrita e
**SUPERADMIN não tem bypass** (decisão do cliente, marco 11). A suíte concede, espera os 30s de
cache do servidor e devolve no `finally` — invalidar o cache no processo do teste não adiantaria,
porque quem tem o cache é o servidor.

**O modal lê do que a tela já carregou** (`solicitacao.historicos`), em vez de chamar o servidor:
a linha do tempo já traz comentários e anexos, e uma segunda fonte para o mesmo dado acabaria
mostrando coisas diferentes nas duas.

### O que ficou de fora — e não é detalhe

**A volta ao Jurídico para conferência final não existe.** O fluxo que o cliente descreveu tem um
salto a mais do que a máquina de estados tem hoje:

> o responsável anexa o contrato assinado → aciona **Solicitar revisão** → a solicitação volta ao
> **Jurídico em destaque no topo** → o Jurídico aprova → só então a solicitação recebe os títulos

A máquina de estados atual (auditada) tem **duas** etapas no Jurídico: `minuta` e `assinado` — e é
o `assinado` que cria os títulos. Ou seja, hoje o responsável registra a assinatura e os títulos
nascem **na hora**, sem a conferência final do Jurídico.

Para fazer como o cliente descreveu é preciso:

1. um **estado novo** entre a assinatura e o ATIVO (a conferência do Jurídico), na máquina de
   estados que já passou por auditoria
2. a ação **Solicitar revisão** separada de "registrar assinatura"
3. o **destaque no topo** — o mecanismo existe (`prioridade_diretoria_ativa`), mas hoje é do fluxo
   de Diretoria e precisaria ser generalizado

Não implementei porque **acrescentar estado a essa máquina não é ajuste de tela**: muda quando o
compromisso financeiro nasce, que é a regra mais sensível deste bloco (PI-1/PI-5). Fica registrado
para decisão.

---

## 14. Conferência do Jurídico, bug do usuário da obra e layout (19/08, 4ª rodada)

### PI-18 — o Jurídico confere antes de os títulos nascerem

A trilha tinha **duas** etapas; agora tem **três**. `assinado` deixou de criar título: devolve ao
Jurídico **em destaque**, e é `conferido` que leva a `ATIVO` e cria os títulos.

**O que muda de fato:** o compromisso financeiro deixa de nascer quando o responsável diz que
assinou e passa a nascer quando o Jurídico confere. Sem esse passo, quem colhia a assinatura era
quem liberava o dinheiro.

Provado nas suítes **10**, **18** e **20** — inclusive o destaque entrando na ida e **saindo** na
conclusão (destaque que não sai deixa de destacar).

### Bug do usuário da obra — dois campos vazios, em silêncio

Reportado pelo cliente: com usuário de obra, **Responsável pela contratação** e **Condição de
pagamento** não apareciam.

| Campo | Rota usada | Guarda | Usuário da obra |
|---|---|---|---|
| Responsável | `GET /usuarios` | `allowGestaoUsuarios` | **403** |
| Condição de pagamento | `GET /financeiro/formas-pagamento` | `allowFinanceiro` | **403** |

Os dois caíam em `.catch(() => [])`: o select ficava vazio **sem dizer nada**. É a mesma família
da falha que já reprovou este projeto — *"falha silenciosa apagando configuração sem avisar"*.

**Correção:** rota própria `GET /contratos/fluxo-novo/opcoes`, acessível a quem abre contrato,
devolvendo responsáveis e condições de pagamento. Exigir permissão **administrativa** para
*preencher um formulário* é que estava errado — os dados são nomes de usuários ativos (a mesma
lista que `/usuarios-lista` já expõe a qualquer autenticado) e formas de pagamento.

**E o erro passou a aparecer:** se as opções não carregarem, a tela avisa em vez de mostrar um
campo obrigatório sem opção nenhuma. O mesmo bug existia no modal do aditivo; corrigido junto.

### Layout — organização pedida na imagem

- **Contratados e favorecido:** a informação virou **tabela** (`#`, contratado com CPF/CNPJ,
  quem recebe o pagamento, remover), separada dos campos de busca, que ficaram embaixo. Era a
  instrução do quadro vermelho: *separar o que é informação do que é campo preenchível*
- **Subtipo ao lado da Apropriação**, em vez de uma faixa própria com metade da tela vazia

**Efeito colateral pego pela suíte:** a tabela nova de contratados quebrou o seletor da suíte 01,
que contava `tbody tr` sem escopo e passou a somar as duas tabelas. Corrigido mirando a tabela que
tem input de valor — a de contratados não tem. É a armadilha já registrada: *seletor amplo quebra
a cada mudança de layout*.

### Ainda em aberto

O campo **Valor** continua ocupando meia tela com a direita vazia. Não pareei com nada porque não
há campo natural para o lado nesse subtipo — emparelhar por emparelhar deixaria a tela pior.

---

## 15. Ordem dos campos e rateio da apropriação (19/08, 5ª rodada)

### O que o cliente pediu

1. **Subtipo** no lugar da Apropriação; **Credor** no lugar do Subtipo; **Apropriação** no lugar
   do Credor
2. **Título do contrato** logo abaixo de **Valor**
3. A **Apropriação da Solicitação na Obra** passa a permitir **ratear o valor do contrato entre
   várias apropriações**, por **%** ou por **valor em R$** (moeda brasileira)

### O que já existia — e o que não

**O backend já aceita N apropriações.** `criarContrato` recebe `apropriacoes: [{apropriacao_id,
percentual}]`, grava em `contrato_apropriacoes` e, na aprovação, `montarRateios` divide **cada
parcela** entre elas — em centavos inteiros, com a sobra na última. O comentário no código explica
por que é assim:

> *"Rateio por VALOR, nao por percentual: a validacao de percentual do servico arredonda a 2 casas
> antes de exigir soma 100, o que rejeita 33,333333 x 3."*

Ou seja: a aritmética delicada **já está feita e auditada**. O que faltava era a **tela**, que
mandava sempre uma só: `apropriacoes: [{ apropriacao_id, percentual: 100 }]`.

**Rateio por % ou por R$ também já existe** — mas no outro caminho, o das *Apropriações do
contrato* na medição (`apropriacoes_rateio`), com a regra de "todas por percentual **ou** todas por
valor, nunca misturado". A mesma regra vale aqui.

### Decisão: o que fica gravado é o PERCENTUAL

Quem digita R$ está descrevendo uma proporção do total do contrato — um rateio em reais **é** um
rateio percentual. E cada parcela precisa ser dividida proporcionalmente, não pelo valor absoluto
digitado (senão a soma das parcelas não fecharia com o contrato).

Então a tela converte R$ → % na hora de enviar, e o backend segue com a aritmética que já tem.
**Nenhuma coluna nova**, nenhuma migration: o cálculo em centavos com sobra na última apropriação
continua sendo quem garante o fechamento exato.

O que a tela mostra: os **dois** números lado a lado (o % e o R$ equivalente), para a pessoa
conferir o que digitou sem ter que calcular de cabeça.

### Risco

| Risco | Mitigação |
|---|---|
| Arredondamento no rateio — histórico ruim neste projeto | Não recalculo nada: reuso `montarRateios`, que já fecha por construção. A suíte confere a **soma dos rateios do título** contra o valor da parcela, no banco |
| Misturar % e R$ na mesma lista | Mesma regra do rateio da medição: ou todas em %, ou todas em R$ |
| Rateio de uma apropriação só | Continua valendo 100%, e o backend nem gera rateio (`apropriacoes.length <= 1` devolve `null`) |

### Implementado e provado (19/08)

**Ordem dos campos**, como pedido:

| Linha | Antes | Agora |
|---|---|---|
| 2 | Apropriação · Subtipo | **Subtipo · Credor** |
| 3 | Credor (faixa inteira) | **Apropriação da Solicitação na Obra** (faixa inteira, com rateio) |
| 4 | Valor | **Valor** |
| 5 | — | **Título do contrato** (faixa inteira, logo abaixo do Valor) |

O Título ficou em faixa inteira de propósito: numa grade de duas colunas ele cairia **ao lado** do
Valor, e o pedido foi **abaixo**.

**Rateio da apropriação** — suíte `22-rateio-apropriacao-contrato.js`, 9 provas:

```
+ contrato aceito com TRES apropriacoes a 33,3333%
+ em CADA parcela a soma dos rateios do titulo bate o valor da parcela
  — 1:3333.33x3333.33, 2:3333.33x3333.33, 3:3333.34x3333.34
+ cada uma das 3 parcelas foi rateada entre as 3 apropriacoes — 9
+ rateio que nao soma 100% e recusado — "Os percentuais das apropriacoes somam 80.0000; devem somar 100."
+ o rateio por valor divide a parcela na proporcao digitada — 3750.00,1250.00
```

O caso **33,3333 × 3** foi escolhido a dedo: é o que o próprio código diz ter quebrado a validação
por percentual antes. A sobra de um centavo cai na **última parcela** (3333,34), e a soma fecha
exata em cada uma — conferido no banco, não na tela.

### Efeitos colaterais pegos pelas suítes

1. A suíte 01 preenchia a apropriação por um autocomplete único, que virou tabela. Passou a mirar
   a **primeira linha do rateio**, com recuo para o campo único no fluxo padrão.
2. A validação da tela ainda exigia `apropriacao_id` (o campo único) no fluxo novo — o contrato era
   **barrado mesmo com o rateio preenchido**. Agora quem cumpre a exigência são as linhas do rateio.

### O que NÃO mudou

O **fluxo padrão** continua com uma apropriação só: o rateio aparece apenas quando o tipo usa o
fluxo novo de contrato. As 665 solicitações históricas não são tocadas, e `integracao-d38/03`
(regressão do fluxo padrão) segue passando.

---

## 16. Busca do credor, colunas do rateio e o bug do autocomplete (19/08, 6ª rodada)

### O bug do autocomplete — a causa não era a quantidade de apropriações

Relatado assim: *"só está funcionando quando tem mais de uma apropriação"*.

A lista de sugestões era `position: absolute` dentro do próprio campo, e eu havia colocado a tabela
de rateio dentro de um `overflow-x-auto`. Container com `overflow` **recorta** o que é absoluto:
com **uma** linha a tabela é baixa, a lista cai inteira fora da área visível e some; com mais
linhas há altura sobrando e ela aparece. Daí a impressão de depender da quantidade.

**Corrigido na raiz:** a lista passou a ir em **portal para o `body`**, com a posição medida a
partir do campo e reposicionada em `resize` e em rolagem de qualquer ancestral. Nenhum container
consegue recortá-la — nem aqui, nem em qualquer outro lugar que use o componente. É a mesma
correção que o modal do aditivo precisou, pelo mesmo motivo.

### Credor: busca ao digitar

Passou a buscar **enquanto se digita**, **sem mínimo de caracteres** — procura desde a primeira
letra. O atraso de 350 ms existe só para não disparar uma consulta por tecla, e é cancelado a cada
dígito novo. O botão *Buscar* continua lá.

Duas diferenças entre a busca automática e a do botão, de propósito:

- **não auto-seleciona** no resultado único: quem digita "JOAO" e cai num só teria o campo fechado
  antes de terminar de escrever
- **não abre alerta** em erro: quem está digitando não pediu essa busca, e um popup por tecla seria
  pior que o erro

O limite de resultados subiu de 8 para 20 (isso é limite de *resultados*, não de caracteres — o
campo nunca teve `maxLength`).

### Rateio: duas colunas, sem seletor de critério

Saiu o "Ratear por"; entraram **Rateio %** e **Rateio R$** na mesma linha, e digitar em uma
recalcula a outra. Escolher o critério antes de digitar era um passo a mais para dizer a mesma
coisa de dois jeitos.

O **Acrescentar apropriação** virou ícone (`+`), e o remover virou lixeira — os dois com `title` e
`aria-label`, porque ícone sem rótulo acessível é armadilha para quem usa leitor de tela.

**Detalhe pego no print:** o Valor do contrato é digitado **depois** do rateio (ele fica abaixo na
tela), então a coluna R$ ficava vazia enquanto o percentual já dizia 100% — duas colunas que
deveriam concordar, discordando. Agora o R$ é recalculado quando o Valor muda.

### Erro meu, pego pela suíte

Coloquei o efeito da busca do credor **antes** da declaração de `exibirCampoCredor` — zona morta
temporal, `ReferenceError` a cada render, página inteira quebrada. A suíte 01 falhou em
"campo nao encontrado para digitar" e me levou direto até lá. É o **segundo** erro desse tipo neste
bloco (o primeiro foi `STATUS_CONTRATO`); vale como lembrete de conferir a ordem de declaração ao
inserir efeito em componente grande.

---

## 17. Favorecido terceiro, moeda e a casca de modal (19/08, 7ª rodada)

### O bug do favorecido — a tela escondia uma regra da PI-12

Relatado: *"o favorecido não foi adicionado na listagem da tabela e a coluna de recebe o pagamento
ficou vazia"*.

A PI-12 diz que **o favorecido pode ser um terceiro** — não precisa ser um dos contratados. Minha
tabela listava só `contratados`. Quando o favorecido era terceiro, ele **não tinha linha**: a coluna
"recebe o pagamento" ficava `-` em todas, e não havia como ver quem receberia. A tela apagava
justamente a regra que o campo existe para exercer.

Agora o favorecido terceiro entra como linha própria, com ordem `—`, marcado **Favorecido** e com a
explicação *"Terceiro — recebe o pagamento sem responder pelo contrato (PI-12)"*. A frase solta
"O favorecido foi trocado a mão" saiu: a tabela conta a história inteira.

### Busca de parceiro ao digitar

O campo de parceiro do bloco de contrato passou a buscar **ao digitar**, sem mínimo de caracteres,
com o mesmo desenho do campo Credor: atraso de 350 ms cancelado a cada tecla, sem auto-selecionar
no resultado único, e o botão *Buscar* mantido.

### Moeda brasileira nos campos de valor

Parcelas e a coluna **Rateio R$** passaram a usar máscara por **dígitos** — cada tecla empurra os
centavos, como no campo Valor. É a mesma conversão que o backend usa; converter por `toFixed`
arredondaria o binário e já divergiu do `DECIMAL` do MySQL antes (F2 da auditoria). O valor
guardado continua sendo número cru: a máscara é só o que se vê.

### `OverlayModal` — a casca de modal do sistema

O cliente reportou no modal **Gerar conta** o mesmo defeito do modal do aditivo: descentralizado e
com o menu por cima. Como já era o **segundo** modal com o mesmo problema, virou componente:
`components/ui/OverlayModal.jsx`, com o portal, os tokens de largura e a centralização sobre a área
de conteúdo. Quem for criar o próximo modal herda o comportamento certo sem saber da armadilha.

### Dois tropeços meus nesta rodada

1. **Colisão de placeholder.** Dei ao Rateio R$ o placeholder `R$ 0,00` — igual ao do campo Valor.
   A suíte 01 seleciona o Valor por placeholder, pegou o campo errado e o contrato saiu com valor
   zero. Corrigido nos dois lados: placeholder próprio no rateio, e o campo Valor ganhou `name`,
   com **10 suítes** passando a mirá-lo por `name` em vez de por placeholder.
2. **`git checkout --` no arquivo errado.** Ao reverter uma substituição malfeita no
   `FinanceiroCard`, levei junto a integração das previsões e do modal de medição, feita antes na
   mesma sessão. Refiz. Reverter arquivo inteiro para desfazer uma edição pontual é caro quando o
   arquivo acumula trabalho não commitado.

### Não é sujeira de QA

Ficou **um** contrato do fluxo novo no banco: `CT-0002 — "Teste de titulo"`, criado às 19:39 pelo
próprio cliente durante os testes dele. Deixado intacto de propósito.

---

## 18. Busca de parceiro e o rótulo errado da permissão (19/08, 8ª rodada)

### A busca funcionava — só não filtrava

O bloco de contrato chamava `buscarParceiros({ search: termo })`. O backend
(`parceiroService`) lê **`q`** e ignora qualquer outro nome: o filtro nunca era aplicado e a lista
voltava inteira. Digitar "renan" devolvia LEANDRO, DIEGO, PAULO... — parecia busca quebrada, mas
era busca sem filtro.

Corrigido para `{ q: termo, ativo: 1 }`, igual ao campo Credor, que sempre usou `q` e por isso
funcionava. Os dois campos ficam com o mesmo comportamento.

### O rótulo da permissão de aprovação estava errado — e enganava para o lado perigoso

`contratos.aprovacao.aprovar` aparecia como **"Aprovar / rejeitar contratos acima do limite"**.

A checagem roda **antes de o limite ser sequer lido** (`aprovarContrato`): ela vale para **qualquer
valor**. Quem lesse o texto antigo concluiria que contrato abaixo do limite dispensa a permissão —
e deixaria a Gerência de Processos sem conseguir aprovar nada, sem entender por quê.

Rótulo e descrição corrigidos para dizer o que o código faz, e explicando o que o limite decide de
fato: **o caminho depois da aprovação**, não quem pode aprovar.

### Resposta à pergunta do cliente, agora provada por suíte

> *"Se a GEO usar essa permissão para aprovar contratos acima do limite, o contrato tramita para o
> jurídico ou fica liberado para subir medição?"*

**Tramita para o Jurídico, e não pode ser medido.** A permissão autoriza a aprovar; quem decide o
caminho é o **valor**. Acrescentado à suíte 18:

```
+ acima do limite a aprovacao encaminha ao JURIDICO — OK:EM_ANALISE_JURIDICA
+ NENHUM titulo nasce enquanto esta no Juridico — 0
+ acima do limite, aprovar NAO libera medicao — o contrato esta no Juridico
  — "O contrato CT-0002 ainda nao foi aprovado e nao pode receber solicitacao."
```

O payload da tentativa de medição vai **completo** de propósito: sem as datas, o 400 viria da
validação de período e o teste passaria pelo motivo errado — provando uma guarda que não é a que
interessa.

## 19. Onde as coisas aparecem na tela de detalhe (19/08, 9ª rodada)

Quatro perguntas do cliente sobre a tela de detalhe da solicitação de contrato.

### 19.1 "Botão aprovar fica visível onde?"

Dentro da própria solicitação, no card `acoes-contrato`, entre as apropriações e o Histórico. A barra
só existe quando o contrato é do fluxo novo E a solicitação aberta é a DONA dele — numa solicitação de
medição do fluxo antigo o mesmo contrato aparece, mas sem barra, porque a máquina de estados não é dela.

Verificado na SOL-5112 (contrato CT-0002, id 2326): barra presente com o seletor de categoria
financeira e os botões Aprovar / Rejeitar / Cancelar.

### 19.2 "Títulos de previsão não foram listados"

Estavam. A tela do print era anterior a esta rodada. Confirmado na mesma solicitação: as 4 parcelas
com situação PREVISAO, o rodapé de saldo e o aviso de que nenhum título existe antes da aprovação.

Não foram aprovados ainda porque a categoria financeira é obrigatória na aprovação (PI-16) e ela é
escolhida ali, no momento de aprovar — o contrato nasce sem categoria de propósito.

### 19.3 Favorecido e chave PIX no cabeçalho

Dois novos ladrilhos no card do cabeçalho (`Header.jsx`), ao lado de Subtipo. A chave segue a ordem
que o cliente definiu — fixa 1, senão fixa 2, senão a variável, senão vazio — e **a escolha é feita no
backend** (`listarParcelasDoContrato`), não na tela: uma segunda cópia dessa regra no frontend seria
uma segunda versão da verdade para divergir depois.

Duas coisas quebravam antes disso:

- `listarParcelasDoContrato` lia o contrato com uma lista explícita de `attributes` que **não incluía
  `favorecido_id`**. O Sequelize devolve o objeto sem reclamar, então a busca do favorecido nunca
  rodava e o campo chegava sempre nulo. É a terceira vez nesta implantação que uma lista de
  `attributes` engole uma coluna em silêncio — está anotado nas armadilhas do LEIA-PRIMEIRO.
- A sonda de verificação usava `document.body.innerText` para conferir se o rótulo apareceu, e isso
  deu **falso negativo**: os ladrilhos estavam renderizados, visíveis e com dimensão real
  (`w=505 h=17, display:block, visibility:visible`). Conferência de tela por `innerText` do body não
  serve como prova; o que vale é o nó e o retângulo dele.

### 19.4 Apropriações do contrato não carregavam no detalhe

O card "Apropriações da solicitação" lia `solicitacao_apropriacoes`. As apropriações de um contrato
rateado vivem em `contrato_apropriacoes` — tabela diferente, dona diferente. Por isso o card aparecia
vazio num contrato que tem rateio: não era falha de carregamento, era a fonte errada.

Passaram a ser listadas em `PrevisoesContrato`, logo abaixo das parcelas que elas dividem, com código,
descrição, percentual e o valor correspondente. Conferido: `01 — ALUGUEL DE EQUIPAMENTOS E MÁQUINAS ·
50% · R$ 15.000,00` e `00.003.002 — A- EQUIPAMENTOS, FERRAMENTAS E PROTEÇÃO COLETIVA · 50% ·
R$ 15.000,00`.

### 19.5 Bateria depois da rodada

`01` (baseline, exit 0), `13`, `17`, `18`, `20`, `21`, `22` — todas passaram, com a limpeza fechando em
zero contrato, zero solicitação e zero título órfão.

## 20. O caso Breno Lopes: não era permissão, era escopo de obra (20/08, 10ª rodada)

**Sintoma:** o usuário `breno.lopes@cscconstrutora.com` vê a aba do Financeiro, mas não vê os títulos
de previsão nem o botão Aprovar.

### 20.1 As permissões estão corretas

Breno (id 35, perfil `USUARIO`, setor **GEO**) tem 79 permissões granulares, entre elas todas as que
importam aqui: `contratos.aprovacao.aprovar`, `contratos.geral.visualizar`,
`contratos.solicitacao.cancelar` e `solicitacoes.acoes.ver_aba_financeiro`. Não falta nenhuma.

### 20.2 O que realmente barra

As previsões e a barra de ações vêm da mesma rota, `GET /contratos/:id/parcelas`, protegida por
`requireContratoAccess` — e essa guarda **não olha permissão nenhuma**: ela compara a obra do contrato
com o escopo de obras do usuário.

O escopo se monta assim (`getUserObraScopeIds`):

1. Setor do usuário na configuração `SETORES_ACESSO_TODAS_OBRAS` → vê tudo.
2. Senão, só as obras vinculadas em `usuarios_obras`.

Hoje a configuração é `["COMPRAS-1","FINANCEIRO","DP","JURIDICO","SESMT"]` — **GEO não está nela**.
E Breno tem exatamente duas obras vinculadas: 39 (ADMINISTRATIVO ESCRITORIO) e 54 (DESPESAS PEDRO).
O contrato CT-0002 (id 2326, SOL-5112) é da obra **15 (FÓRUM CARANGOLA)**. Resultado: 403.

Provado pelo log de auditoria do próprio sistema — seis `AUTHZ_DENIED` para o usuário 35 no recurso
CONTRATO 2326, com `obra_id: 15`, todos de 20/08.

**Detalhe que engana:** `canAccessContratosGlobal(breno)` é `true` e `eh_setor_geo` também. Mas em
`createResourceAccessMiddleware` o escape de acesso global só é consultado quando a lista de obras do
usuário está **vazia**. Com uma lista não-vazia a decisão é ela e mais nada. Ou seja, vincular obras a
um usuário GEO não *acrescenta* obras: **restringe** ele àquelas.

Isso não é defeito — é o desenho do escopo por obra. Mas é contraintuitivo o bastante para estar
escrito aqui.

### 20.3 O que dá para decidir (é decisão do cliente)

| Caminho | Efeito |
|---|---|
| Vincular a obra 15 (e as demais) ao Breno | Ele passa a ver só as obras listadas. Precisa manutenção a cada obra nova. |
| Acrescentar `GEO` a `SETORES_ACESSO_TODAS_OBRAS` | Todo o setor GEO passa a enxergar todas as obras — inclusive contratos de obras que hoje não vê. |
| Remover os vínculos de obra do Breno | Cai no escape de acesso global (GEO + `canAccessContratosGlobal`) e ele vê todos os contratos. |

Nenhum deles foi aplicado: os três mudam o que outras pessoas enxergam.

### 20.4 O que foi corrigido no código

O 403 estava sendo **engolido em dois lugares** — e era por isso que a tela sumia sem explicar:

- `index.jsx` fazia `catch { setContratoDoFluxo(null) }`, sem guardar o motivo;
- `PrevisoesContrato.jsx` guardava o erro em estado, mas o `return null` da guarda de dono vinha
  **antes** de renderizar o alerta, então ele nunca aparecia.

Agora os dois mostram o motivo no lugar do vazio (`falha-contrato` e `previsoes-contrato-erro`). É a
terceira ocorrência desta mesma classe nesta implantação (a primeira foi o `.catch(() => [])` que
apagava os campos do usuário da obra): **falha de carregamento que vira tela vazia não é diagnosticável
por quem usa nem por quem dá suporte.**

Suítes 20 e 21 seguem passando.
