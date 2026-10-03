# PROPOSTA — Quais filtros cada tela mostra ao abrir

> **Aguardando aprovação do cliente. Nada aplicado.**
> Medido em 05/09/2026: 91 telas têm faixa de filtro; 3 têm seletor de filtros
> visíveis; 88 não têm.

## O CRITÉRIO

Cada tela nasce mostrando os filtros que respondem **a pergunta que ela existe
para responder**. O resto continua disponível — o usuário liga o que quiser, e a
escolha dele fica salva por usuário, valendo em qualquer máquina.

Três regras que valem para todas:

1. **Filtro com valor aplicado é sempre visível.** Esconder um filtro que está
   recortando a lista faz a tela mentir — e esse defeito existe hoje na tela de
   Solicitações, onde esconder não limpa o valor.
2. **Esconder limpa o valor.** É o que a tela de Provisionamentos já faz certo.
3. **A busca livre nunca é escondível.** É a porta de entrada de toda tela.

---

## PARTE 1 — OS 8 PADRÕES (60 telas)

Aprovar o padrão aprova todas as telas dele.

### P1 — Relatório de Compras · 10 telas
**Pergunta:** "quanto/quantos, nesta obra, neste período?"
**Filtros da tela:** Data inicial · Data final · Obra/Centro
**Iniciais: os 3.** A faixa é pequena; esconder qualquer um esvazia a pergunta.
→ `compras-rel-` categorias-insumos, ciclo, compras-fornecedor, demanda-pedidos,
economia-cotacoes, evolucao, fornecedores, pendencias-cotacoes, precos-insumos,
e compras-diretas (que tem 6 — iniciais: busca, criada de, criada até, obra, status).

### P2 — Painel operacional · 11 telas
**Pergunta:** "como está este fluxo, nesta obra, neste período?"
**Iniciais (4):** Data inicial · Data final · Obra/Centro · Status
**Escondidos:** Período (atalho que preenche as datas — vira botão, não filtro), Empresa.
→ relatórios operacionais de RH/DP, Solicitações, Contratos, Comercial,
Provisionamento, Fiscal, e 5 de Compras.

### P3 — Relatório financeiro gerencial · 5 telas
**Pergunta:** "qual o resultado, nesta empresa, nesta competência?"
**Iniciais (5):** Período · Data inicial · Data final · Empresa · Obra/Centro
**Escondido:** Holding — quem opera no dia a dia trabalha numa empresa, não no grupo.
→ DRE, Endividamento, Fluxo consolidado, Intercompany (+4 próprios), Executivo do grupo (só 2).

### P4 — RH/DP · 6 telas
**Pergunta:** "quem, nesta obra, nesta competência?"
**Iniciais (4):** Competência · Obra · Status · Empresa do grupo
**Escondido:** Vínculo (CLT/não CLT) — recorte de exceção, não do dia a dia.
→ Apuração, Colaboradores, Documentos, Fechamentos, Importações, Relatório operacional.

### P5 — Cadastro de busca única · 10 telas
**Pergunta:** "onde está este registro?"
**Filtro único: a busca. Estas telas NÃO recebem o seletor** — não há o que escolher.
→ Parceiros, Categorias de parceiro, Obras, Obra/tipo de apropriação, os 3 de
permissão de usuário, Permissões de área, Delegação de compras, Empreendimentos.

### P6 — Cadastro com estado · 12 telas
**Pergunta:** "este registro existe, e está ativo?"
**Iniciais: todos (2 a 3)** — busca + status/situação.
→ Empresas do grupo, Comunicação interna, Treinamento, Insumos, Fornecedores,
Cadastros financeiros, Financiamentos, Faturas de cartão, Caixas, Baixas
compostas, Contratos comerciais, Notificações do sistema.

### P7 — CRM · 7 telas
**Pergunta:** "que lead/conversa está neste ponto do funil?"
**Iniciais (4):** busca · Status · Temperatura (ou Tipo) · Origem (ou Canal)
**Escondido:** o quarto recorte de cada tela (Leitura, Gatilho, Risco).
→ Leads, Carteira, Tarefas, Inbox, Automações, Canais, Números.

### P8 — Comercial por empreendimento · 5 telas
**Pergunta:** "que unidade/contrato deste empreendimento?"
**Iniciais: todos (2 a 3)** — busca + Empreendimento (+ Status).
→ Unidades, Modelos de contrato, Tabelas de preço, Relatório comercial, Boletos.

---

## PARTE 2 — AS 12 TELAS DE FAIXA GRANDE (caso a caso)

São as que hoje mais castigam quem usa: de 8 a 15 filtros na cara, todos abertos.

| tela | filtros | **iniciais propostos** | escondidos | por quê |
|---|---|---|---|---|
| **Consulta de títulos** | 15 | Busca rápida · Status · Obra · **Vencimento início** · **Vencimento fim** | Título, N. documento, Cliente/Credor, Emissão de/até, Valor mín/máx, Categoria, Forma, Cartão | a pergunta é "o que vence e quanto soma". Hoje **Emissão** é básico e **Vencimento** é avançado — está invertido para quem paga contas |
| **Pagamentos (lote PIX)** | 15 | Vencimento início · Vencimento fim · Obra · Conta pagadora · Status | Parceiro ID, Origem, Data pagamento, e os 7 de evento técnico | os 7 técnicos (intent, lote, id do provedor) são de suporte, não de operação |
| **Documentos fiscais** | 12 | Busca · Empresa · Emissão de · Emissão até · Status | CNPJ, Valor mín/máx, Tipo, Origem, Manifestação, XML, PDF | manifestação e anexos são conferência, não recorte |
| **Solicitações** | 12 + 3 | Descrição · Status · Obra · Setor · Tipo | Código, N. do pedido, Valor mín/máx, Data de registro, Resposta de/até, Responsável | é a tela mais usada do sistema: recorte por onde a solicitação está |
| **Relatório analítico** | 12 | Tipo · Busca · Venc. inicial · Venc. final · Obra | Status título, Status baixa, Baixa de/até, Parceiro, Categoria, Conta | existe para conferir linha a linha; o recorte grosso vem primeiro |
| **Financeiro por obra** | 10 | Análise · Data inicial · Data final · Obra/Centro · Empresa | Tipo, Limite, Busca, Parceiro, Plano financeiro | "quanto esta obra custou" — obra e período mandam |
| **Baixas** | 9 | Tipo · Data inicial · Data final · Busca · Obra | Status baixa, Parceiro, Categoria, Conta bancária | "que baixa foi feita e posso estornar" |
| **Intercompany** | 9 | Período · Data inicial · Data final · Holding · Tipo | Empresa, Consolidado, Status, Teto de registros | única tela onde **Holding é essencial**: a pergunta é entre empresas |
| **Auditoria operacional** | 8 | De · Até · Usuário · Módulo · Resultado | Setor, Categoria, Evento | "quem fez o quê e deu certo" |
| **Boletos** | 8 | Busca · Vencimento de · Vencimento até · Status cobrança · Empreendimento | Título, N. documento, Origem | "para qual título falta boleto" |
| **Provisões** | 8 | Busca · Data inicial · Data final · Obra · Status | Credor, Item macro, Prioridade, Criador | "quanto vai sair, por obra" |
| **Documentos de RH** | 8 | Busca · Obra · Tipo de documento · Status · Validade | Empresa, Vínculo, Histórico | "que documento está vencido, e de quem" — **Validade é o ponto da tela** |

---

## PARTE 3 — O QUE EU MUDARIA ALÉM DE ESCONDER

Duas coisas que apareceram na medição e que não são "esconder filtro":

**1. "Período" não é filtro, é atalho.** Em 11 telas ele convive com Data
inicial e Data final e só serve para preenchê-las ("últimos 30 dias"). Ocupa
espaço de filtro sem ser um. Proponho virar botão ao lado das datas.

**2. Dois nomes para a mesma coisa.** `data_inicio`/`data_fim` em 15 telas e
`data_inicial`/`data_final` em 5. Mesmo filtro, nomes diferentes — o que impede
tratar as duas famílias como um padrão só. Proponho unificar.

---

## O QUE PRECISO DE VOCÊ

1. **Aprovar ou corrigir os 8 padrões** (60 telas de uma vez).
2. **Aprovar ou corrigir as 12 telas de faixa grande** — são as que você mais usa.
3. Dizer se concorda com **"Período vira botão"** e com a **unificação dos nomes de data**.

Onde você discordar de uma escolha, ela muda só ali — o mecanismo é o mesmo.
