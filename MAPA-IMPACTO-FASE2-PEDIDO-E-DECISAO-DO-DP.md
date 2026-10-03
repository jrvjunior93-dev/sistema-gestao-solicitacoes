# Mapa de impacto — Fase 2 do módulo DP: pedido e decisão

Data: 25/08/2026. Escrito **antes da primeira linha de código**. Segunda versão: a primeira partia
de uma premissa minha que o levantamento derrubou, e de uma leitura do fluxo atual que o cliente
corrigiu.

---

## 1. O que o levantamento achou, e o que o cliente esclareceu

### 1.1 Admissão e demissão já existem como solicitação — mas não são o que eu supus

| Tipo | Existe? | Solicitações | Mais recente |
|---|---|---|---|
| ADMISSÃO (id 9) | sim, ativo | **110** | 13/08/2026 |
| DEMISSÃO (id 18) | sim, ativo | **129** | 12/08/2026 |
| ATESTADO (id 19) | sim, ativo | 67 | 05/08/2026 |
| PAGAMENTO DE MÃO DE OBRA (id 10) | sim, ativo | 613 | 14/08/2026 |
| TROCA DE OBRA | **não existe** | — | — |
| ALTERAÇÃO SALARIAL | **não existe** | — | — |

Eu tinha lido os status `APROVADA PELO DP` e `COM A CONTABILIDADE` como etapas de decisão de
pessoal. **Não são.** O cliente esclareceu em 25/08:

| Status | O que significa de verdade |
|---|---|
| `APROVADA PELO DP` | solicitação de **pagamento** aprovada |
| `COM A CONTABILIDADE` | precisa de ação do **escritório contábil externo** — alteração de registro e envio de documento |

> Ou seja: os tipos 9 e 18 de hoje são, na prática, **pedidos de pagamento e de providência
> contábil** que carregam um assunto de RH no nome. Não são o pedido de pessoal que o módulo
> precisa. Prova disso está no próprio cadastro do tipo: ADMISSÃO tem `exige_valor: true` e
> `exige_apropriacao_principal: true` — um pedido de admissão de pessoa não tem valor nem
> apropriação; um pedido de **pagamento** de admissão tem.

### 1.2 A decisão do cliente

> *"Estamos realmente criando esse fluxo para ser o novo modelo do DP trabalhar. Orientado pelo que
> acontece dentro do DP e não mais por solicitações do módulo principal. (...) a obra e o DP passam
> a operar as solicitações diárias dentro do módulo DP."*

E com um requisito de tela explícito:

> *"uma única página com avisos visuais de novas solicitações (...) de preferência que isso ocorra
> em uma lista de colaboradores que, quando tiver alguma solicitação para aquele colaborador, ele
> seja posicionado primeiro na lista e ganhe destaque visual e de status."*

---

## 2. A decisão de arquitetura, e por que ela mudou

O mapa do módulo dizia: *"não construir um segundo motor de workflow — declarar tipos de
solicitação novos sobre o motor que existe"*. **Isso deixa de valer para o pedido de pessoal**, e é
importante dizer por quê, porque contradiz o que eu mesmo escrevi ontem.

### 2.1 O pedido do DP não cabe na tabela `solicitacoes`

| Razão | Peso |
|---|---|
| O cliente decidiu que o DP não é mais operado pelo módulo principal | decisiva |
| Os tipos existentes exigem **valor e apropriação** — semântica de pagamento que um pedido de pessoal não tem | alta |
| Os status de lá (`PAGA`, `COM A CONTABILIDADE`, `TITULO_CADASTRADO`) descrevem dinheiro, não pessoal | alta |
| As 239 solicitações vivas ficam **intocadas** — risco zero num fluxo em uso | alta |
| O pedido de pessoal precisa de campos próprios (obra de destino, data de vigência, aviso prévio, salário pretendido) | média |

### 2.2 O que continua sendo reaproveitado

Não é motor novo do zero. O que o lote de contratos endureceu entre 23 e 24/08 vem junto **como
padrão**, não como tabela:

| Padrão | Origem |
|---|---|
| Permissão **estrita** por ação (`userHasStrictAreaPermission`) — sem atalho de SUPERADMIN, sem "não configurado = liberado" | item 31 |
| Devolução volta ao **setor de quem criou** | itens 24/30 |
| Histórico com ação, setor e status, e o setor gravado como **texto**, nunca o objeto | correção do `[object Object]` |
| Corrigir e reenviar, com a fila de decisão parqueada | item 30 |
| Visibilidade por setor que participou | regra `ENVIADA_SETOR` |

**O custo que aceito:** uma segunda máquina de estados. Ela é pequena — o pedido de pessoal tem um
ciclo curto (aberto → decidido → efeito) contra o do contrato, que tem seis etapas e jurídico.

---

## 3. O que a Fase 2 entrega

| # | Entrega |
|---|---|
| 2.1 | `rh_solicitacoes` — o pedido de pessoal, com colaborador, tipo, dados do pedido e situação |
| 2.2 | `rh_solicitacao_historicos` — o rastro, no padrão do contrato |
| 2.3 | Os três tipos da fase: **ADMISSAO**, **DEMISSAO** (com aviso prévio) e **TROCA_OBRA** |
| 2.4 | O **efeito da aprovação** sobre o cadastro e sobre o vínculo da Fase 1 |
| 2.5 | Permissões granulares novas |
| 2.6 | Fechar a porta dos fundos: `obra_id` deixa de ser editável direto no cadastro |

A alteração salarial fica na Fase 5, com a permissão da Diretoria — mas a tabela já nasce
preparada para ela.

### 3.1 O efeito da aprovação — o coração da fase

| Tipo | O que a aprovação produz |
|---|---|
| ADMISSAO | colaborador `ATIVO` + vínculo aberto na obra, motivo `ADMISSAO`, com `solicitacao_id` |
| TROCA_OBRA | fecha o vínculo anterior no **dia anterior**, abre o novo, motivo `TROCA_OBRA` |
| DEMISSAO | `data_demissao` + status `DEMITIDO` + vínculo encerrado no **próprio dia** |

Tudo por `rhVinculoObraService`, cuja aritmética a Fase 1 já provou em 13 conferências.

### 3.2 Aviso prévio — opção dentro do Pedir demissão

Decisão do cliente. Três campos no pedido de demissão: **se tem aviso**, o **tipo** (trabalhado ou
indenizado) e a **data prevista de desligamento**.

> Consequência que precisa ficar explícita: com aviso trabalhado, o colaborador **continua na obra
> e continua no custo** até a data final. O vínculo só encerra na data de desligamento, não na
> aprovação do pedido. Fechar antes tiraria do custo alguém que ainda está trabalhando.

### 3.3 Permissões novas

| Permissão | Quem |
|---|---|
| `rh_dp.solicitacoes.abrir` | Obra |
| `rh_dp.solicitacoes.decidir` | DP |
| `rh_dp.solicitacoes.ver_todas` | DP e Diretoria — sem ela, o usuário vê só a obra dele |
| `rh_dp.salario.aprovar` | Diretoria (declarada aqui, usada na Fase 5) |

---

## 4. A tela — o que o cliente pediu, e o que ela exige do backend

A tela é a Fase 6, mas o requisito dela **manda no desenho do backend agora**, então fica registrado:

> lista de colaboradores; quem tem pedido em aberto **sobe para o topo** e ganha destaque visual e
> de status.

Isso exige da listagem de colaboradores, desde já:

| Exigência | Consequência técnica |
|---|---|
| Ordenar por "tem pedido em aberto" primeiro | a consulta precisa do pedido aberto **junto**, não em chamada separada por linha |
| Mostrar o status do pedido na linha | o pedido aberto vem embutido no colaborador |
| Alerta de "novidade" para os dois lados | o pedido guarda **quem já viu**, ou pelo menos a data da última mudança e de quem foi |
| Obra vê só a obra dela | o filtro de visibilidade vale para o colaborador **e** para o pedido |

> **Por isso o índice `(colaborador_id, situacao)` entra na tabela desde o começo.** Sem ele, a
> ordenação "pendentes primeiro" faz varredura por colaborador, e a tela que existe para dar
> agilidade fica lenta justamente quando há muitos pedidos.

---

## 5. O que pode quebrar

| Risco | Verificação |
|---|---|
| Tocar nos tipos 9/18, em uso | **não são tocados** — a fase não escreve em `solicitacoes` |
| Aprovar duas vezes e duplicar efeito | suíte aprova duas vezes e exige idempotência |
| Demissão com aviso tirar do custo cedo demais | suíte demite com aviso trabalhado e exige que ele **continue** na obra até a data final |
| Troca de obra sem vínculo anterior | suíte troca colaborador sem vínculo e exige que não estoure |
| Obra ver pedido de outra obra | suíte com duas obras e dois usuários |
| Obra decidir o próprio pedido | suíte tenta e exige recusa |
| Fechar `obra_id` deixar o DP sem saída | fecha **por último**, depois de a troca funcionar |
| FK impedir exclusão | sem FK em `colaborador_id` de `solicitacoes`; em `rh_solicitacoes` a FK do colaborador é `CASCADE` |
| Regressão nas 49 suítes | bateria completa |

---

## 6. Ordem de execução

| Passo | Entrega | Depende |
|---|---|---|
| 1 | Tabelas `rh_solicitacoes` e `rh_solicitacao_historicos` | — |
| 2 | Serviço: abrir, decidir, devolver, reenviar, cancelar | 1 |
| 3 | Efeito da aprovação sobre cadastro e vínculo | 2 + Fase 1 |
| 4 | Aviso prévio na demissão | 3 |
| 5 | Permissões e visibilidade por obra | 2 |
| 6 | Listagem de colaboradores com pedido aberto embutido e pendentes primeiro | 2 |
| 7 | Fechar a edição direta de `obra_id` | 3 |

---

## 7. O que fica pendente de decisão sua

1. **A migration `202608250051`** (`solicitacoes.colaborador_id`) foi escrita na versão anterior
   deste mapa, quando eu ainda achava que estenderíamos os tipos 9/18. **Com a nova direção ela
   perde a razão de existir** — recomendo descartá-la, e é o que faço se você não disser o
   contrário. Ela não chegou a rodar.
2. **O que acontece com os tipos 9, 18 e 19 daqui em diante?** Eles continuam servindo pagamento e
   providência contábil, ou o DP para de usá-los quando o módulo entrar? Não mexo neles de qualquer
   forma — a pergunta é de operação, e a resposta pode virar uma orientação de uso.

**Nenhuma linha foi escrita além da migration do item 1.**
