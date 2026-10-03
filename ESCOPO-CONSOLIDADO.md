# Escopo de Alterações Fluxy — Consolidado por Área do Sistema

Consolidação das três versões do escopo, organizada por área do sistema e cruzada com o
código e o banco reais do Fluxy.

**Fontes:**

| Documento | Papel |
|---|---|
| `FLUXY_Escopo_Solicitacoes__Original.docx` | Base — escopo original |
| `FLUXY_Escopo_Solicitacoes__1.docx` | **Suas anotações** (57 acréscimos sobre o original) |
| `FLUXY_Escopo_Solicitacoes_3.docx` | Versão reestruturada (109 acréscimos, alguns conflitantes com a 1) |

**Verificação:** cada item foi cruzado com o banco `fluxy_main_copia` (cópia de produção,
corte 14/08) e com o código em `backend/src` e `frontend/src`.

| Marca | Significado |
|---|---|
| 🔴 **NOVO** | Não existe no sistema. Exige estrutura nova (tabela/coluna/tela). |
| 🟡 **PARCIAL** | Existe base aproveitável, precisa evoluir. |
| 🟢 **AJUSTE** | Já existe; é mudança de regra, rótulo ou layout. |
| ⚠️ **CONFLITO** | Versões 1 e 3 divergem — **precisa da sua decisão**. |
| ❓ **DEFINIR** | Pendência de decisão que já estava marcada no escopo. |

---

## 1. Itens transversais da primeira folha

> Esta seção existe porque você levantou o ponto: há itens na primeira folha que **não estão
> cobertos** pelas seções seguintes do documento. São mudanças que atravessam o sistema
> inteiro, não pertencem a um tipo de solicitação específico, e por isso se perderiam.

### 1.1 Tela de solicitação — estrutura

| # | Item | Estado | Observação da verificação |
|---|---|---|---|
| T1 | Dividir a tela em **Informações da Solicitação** e **Informações para Pagamento**; na tabela de pagamento, formas de pagamento com campo para chave PIX ou anexo de boleto | 🔴 NOVO | Reestruturação de `frontend/src/pages/NovaSolicitacao.jsx`. Hoje não há separação nem campos de forma de pagamento na solicitação. |
| T2 | **Balão de orientação** em cada campo explicando o campo | 🔴 NOVO | Componente de tooltip/ajuda inexistente. Aplica-se a toda tela de solicitação. |
| T3 | Trocar o rótulo **"Anexos" → "Comprovantes da Despesa"** | 🟢 AJUSTE | Rótulo de UI. A tabela `anexos` continua com o mesmo nome no banco. |
| T4 | **Campo Favorecido** do pagamento, permitindo **mais de um favorecido** com divisão de valores — para todos os tipos com credor vinculado. A soma dos favorecidos tem de fechar com o valor total | 🔴 NOVO | Verificado: `favorecido` só existe em `rh_colaborador_pagamentos` (`favorecido_nome`, `favorecido_documento`). **Não existe** em solicitações nem em títulos. Exige tabela nova de rateio por favorecido + validação de soma. |
| T5 | Listar os tipos de solicitação conforme **o que a obra pode solicitar** e **o que cada setor pode solicitar**; **remover "Área Responsável"** porque tudo passa por Gerência de Processos | 🟡 PARCIAL | `solicitacoes.area_responsavel` existe e é usado em 5 telas do frontend (`SolicitacaoTable`, `SolicitacaoCard`, `Dashboard`, `NovaSolicitacao`, `NovaSolicitacaoCompra`). Remover exige revisar filtros e relatórios que dependem do campo. |
| T6 | Documentos em **pasta única**, com download de todos em **um único PDF** | 🔴 NOVO | Não há agrupamento nem merge de PDF na tela de anexos. O backend já tem `pdf-lib` e `pdfkit` disponíveis. |

### 1.2 Regras de negócio transversais

| # | Item | Estado | Observação |
|---|---|---|---|
| T7 | **Remover a opção de criar título manual sem solicitação** | 🟡 PARCIAL | Existe em `TituloFinanceiroController.js`. Também aparece em `tituloFinanceiroImportacaoService`, `conciliacaoBancariaService` e `boletoCaixaOperacaoService` — **verificar se a importação e a conciliação dependem desse caminho** antes de bloquear, para não quebrar esses fluxos. |
| T8 | **Verificar como a apropriação é feita**: por solicitação ou por títulos | ❓ DEFINIR | É uma investigação, não uma implementação. Hoje `solicitacoes.apropriacao_id` existe e há `apropriacoes` (6.497 registros). Precisa de decisão antes de mexer. |
| T9 | **Rateio proporcional** dos custos do centro de custo Administrativo/Escritório para todas as obras ativas | 🔴 NOVO | Decisão pendente no próprio item: entra no relatório financeiro da obra como rateio, **ou** apenas na apropriação "Administração Central" (que precisaria ser criada para todas as obras). |
| T10 | **Abertura e Fechamento de Caixa Físico** — registro sempre com comprovante; abertura e fechamento **obrigatórios diários** | 🔴 NOVO | Não há tabela nem tela de caixa físico. É um módulo novo, não é variação de solicitação. |
| T11 | Botão **NEC. REEMBOLSO** no detalhe da solicitação, alterando o status da solicitação e do título e exibindo em **vermelho**. Pode ficar junto ao botão "Informar Pagamento" | 🔴 NOVO | Novo status a ser criado, com reflexo no título financeiro e sinalização visual. |
| T12 | **Anexo na frente do título**, dentro da aba Financeiro da solicitação | 🟡 PARCIAL | Anexos existem por solicitação; a associação direta anexo↔título não existe. |
| T13 | **Mostrar Saldo do Contrato** na tela de solicitação, com cálculo automático e **bloqueio** para não solicitar acima do saldo | 🔴 NOVO | Ver área de Contratos (item C6) — a tabela `contratos` hoje não tem campo de saldo. |
| T14 | **Ajustar as informações do cheque** na tela de baixa | 🟡 PARCIAL | Existe `cheques_terceiros`. Falta detalhar **quais** informações ajustar. |

---

## 2. Solicitações — núcleo

Estado atual verificado: **28 tipos** cadastrados em `tipo_solicitacao`, sendo 24 ativos.
Volume real na base:

| Tipo | Solicitações |
|---|---|
| ADM LOCAL DE OBRA | 996 |
| SOLICITAÇÃO DE COMPRA | 706 |
| MEDIÇÃO | 665 |
| PAGAMENTO DE MÃO DE OBRA | 613 |
| COMPRA DIRETA | 494 |
| OUTROS ASSUNTOS | 341 |
| DESPESA ADMINISTRATIVA | 286 |
| LOCAÇÃO DE MAQ. EQ. | 247 |
| ABERTURA DE CONTRATO | 172 |

Cada tipo tem um JSON `comportamento` que controla quais campos aparecem e quais são exigidos
(`mostrar_valor`, `exige_contrato`, `mostrar_subtipo`, …). **Boa notícia:** grande parte das
mudanças de campo obrigatório por tipo pode ser feita por configuração, sem código.

### 2.1 ADM Local de Obra (seção 1)

| Item | Estado | Observação |
|---|---|---|
| Processo independente, sem contrato prévio | 🟢 AJUSTE | Hoje `exige_contrato: true`. É mudança no JSON `comportamento`. |
| Apropriação vinculada automaticamente ao tipo; apropriações padrão cadastradas na obra | 🔴 NOVO | Exige vínculo tipo↔apropriação no cadastro da obra. Vale também para Locação de Máq./Eq. e Despesas de Marketing. |
| Subtipo: **remover REEMBOLSO**, adicionar **CAIXA DE OBRA** | 🟢 AJUSTE | Confirmado: REEMBOLSO é o id 11 em `tipos_sub_contrato`. Ver achado A3 sobre duplicidades na tabela. |
| Descrição em MAIÚSCULO e renomeada para **Título** | 🟢 AJUSTE | Rótulo + normalização na gravação. |
| Campo **Finalidade**, levando a informação para o histórico | 🔴 NOVO | Coluna nova + registro em `historicos`. |
| Fim da obrigatoriedade do Documento de Dados para Pagamento | 🟢 AJUSTE | Regra de validação. |

### 2.2 Locação de Máquinas e Equipamentos (seção 2)

Mesmo padrão do ADM Local de Obra: processo independente e apropriação automática.
Hoje `exige_contrato: true` — mesma mudança de comportamento.

### 2.3 Recarga de Cartão (seção 5)

| Item | Estado | Observação |
|---|---|---|
| Cadastro de cartões corporativos, listado para todos | 🔴 NOVO | Existe apenas `financeiro_faturas_cartao`. **Não há cadastro de cartões.** |
| Média de recargas aprovadas pelo financeiro + histórico | 🔴 NOVO | Depende do cadastro acima. |
| **Não vincular obra ao título** quando for recarga | 🟢 AJUSTE | Regra de geração do título. |
| **Modal de prestação de contas**: distribuir valores gastos por obra, mostrando saldo da última prestação; bloquear valor superior ou inferior | 🔴 NOVO | Estrutura nova de prestação de contas com rateio por obra. |
| (v3) Exibir valor da última recarga; média da recarga para Gerência de Processos; exigir prestação de contas | 🔴 NOVO | Complementa o item acima. |

### 2.4 Outros Assuntos (seção 6) ⚠️

⚠️ **CONFLITO** — a versão 1 diz **"Inativar o tipo Outros Assuntos"**; o texto original
(mantido) descreve o tipo passando a ser geral, encaminhado após análise à área competente.

São caminhos opostos. Peso real: **341 solicitações** já usam o tipo. Precisa da sua decisão.

### 2.5 Despesa Eventual — pequenas despesas (seção 7)

| Item | Estado | Observação |
|---|---|---|
| Novo tipo, sugestão de nome **Despesa Eventual** | 🔴 NOVO | Tipo novo em `tipo_solicitacao`. |
| Limite **R$ 5.000,00 por solicitação** e **R$ 30.000,00 por obra**, exibindo saldo e bloqueando | 🔴 NOVO | Controle de saldo acumulado por obra. |
| Subtipos: Serviço Eventual, Apoio Operacional, Frete/Transporte, Serviço Técnico Especializado | 🔴 NOVO | |
| Restrições: sem serviços contínuos, sem vínculo contratual, **sem fracionamento** para caber no limite | 🔴 NOVO | A regra anti-fracionamento é a mais complexa — exige detecção de despesas relacionadas. |

---

## 3. Contratos

> Área de maior impacto. A tabela `contratos` hoje tem **apenas 14 colunas**:
> `id, obra_id, codigo, ref_contrato, descricao, valor_total, ajuste_solicitado, ajuste_pago,
> tipo_macro_id, tipo_sub_id, ativo, createdAt, updatedAt, itens_apropriacao`.
>
> **Não existem:** vigência inicial/final, credor, forma de pagamento, status, saldo,
> responsável, objeto. Praticamente tudo que o escopo pede é estrutura nova.

| # | Item | Estado | Observação |
|---|---|---|---|
| C1 | Fluxo de **criação automática de contrato via formulário**, com geração automática de código, passando por setores para aprovação antes de subir solicitação | 🔴 NOVO | Núcleo do novo módulo. |
| C2 | **Validar o novo fluxo preservando o fluxo legado** | 🔴 NOVO | *(Folha 1)* Requisito de convivência: 172 solicitações de Abertura de Contrato já existem. **Este é o item de maior risco de regressão de todo o escopo.** |
| C3 | Todas as medições geradas dentro do mesmo contrato | 🟡 PARCIAL | `solicitacoes.contrato_id` existe. |
| C4 | Solicitação volta a ficar visível com **alerta para Gerência de Processos** | 🔴 NOVO | |
| C5 | Campo **Detalhes da Contratação**, obrigatório acima de R$ 50 mil | 🔴 NOVO | |
| C6 | **Saldo do contrato visível**, com cálculo automático e bloqueio ao ultrapassar | 🔴 NOVO | Hoje só há `valor_total`, `ajuste_solicitado`, `ajuste_pago`. Saldo precisa ser derivado das medições. |
| C7 | Botão **criar contrato** a partir da solicitação de abertura | 🔴 NOVO | |
| C8 | **Títulos de previsão** no fluxo, com modal de edição e histórico da medição incluindo anexos | 🔴 NOVO | |
| C9 | **Termo Aditivo** como novo tipo de solicitação vinculado ao contrato: aprovado, aumenta o saldo, **recalcula parcelas**; se o prazo mudar, recalcula com base no novo saldo e prazo restante | 🔴 NOVO | |
| C10 | Limite de aditivo: **25%**. Abaixo de R$ 50 mil segue automático | 🟢 AJUSTE | *(Folha 1 e seção 3.3)* Substitui o ❓ DEFINIR original — **o percentual já está decidido: 25%**. |
| C11 | Botão para solicitar aditivo, abrindo modal com os campos dos dois tipos de aditivo | 🔴 NOVO | |
| C12 | Acima de R$ 50 mil: **não permitir múltiplos credores** | 🔴 NOVO | Inverte a regra original, que permitia múltiplos. |
| C13 | Acima de R$ 50 mil: campo **negociação detalhada** obrigatório, voltado apenas para arquivo | 🔴 NOVO | |

### 3.1 ⚠️ CONFLITO — estrutura de contratos

As versões divergem na organização:

| Versão 1 | Versão 3 |
|---|---|
| Mantém `3.1 Abertura de Contrato` com subdivisão por aprovador (Gestor da Obra × Diretoria/Jurídico) | Reorganiza em `3.1 Abertura de Contrato – abaixo de R$ 50.000` e `3.2 Solicitação de Contrato – acima de R$ 50.000` |
| Termo Aditivo é a seção 3.3, única | **Termo Aditivo aparece duas vezes** — 3.1.1 e 3.2.1, um para cada faixa |
| Documentação: "Contrato assinado" marcado como **"Não Considerar"** | "Setor jurídico anexa o contrato" |
| Usa **Credor** | Separa **Fornecedor** e **Favorecido**, e adiciona "Favorecido pagamento" |
| — | Acrescenta: nº de contrato gerado pelo sistema, campo "Negociação detalhada" como documento obrigatório, "Proposta Aditivo" |

A v3 é mais detalhada e coerente com o limite de R$ 50 mil que aparece nas suas anotações.
**Sugestão:** adotar a estrutura da v3 e trazer para ela as regras da v1 (recálculo de parcelas,
saldo visível, 25%). **Precisa da sua confirmação.**

### 3.2 Gestão contratual — renomeações e status

Da seção Observações Gerais, mantida nas três versões:

| De | Para | Estado |
|---|---|---|
| SOLICITADO (valor) | **CONTRATADO** | 🟢 AJUSTE |
| A PAGAR | **SALDO** | 🟢 AJUSTE |
| AJUSTE SOLICITADO | **ADITIVOS** | 🟢 AJUSTE — confirmado: a coluna real é `contratos.ajuste_solicitado` |

Mais: rescindir contrato (cancelando o saldo automaticamente), status do contrato
(ativo/parcialmente medido, totalmente medido, concluído, rescindido), histórico completo e
visualização de medições, solicitações vinculadas, valores movimentados e saldo. Todos 🔴 NOVO.

---

## 4. Compras

| # | Item | Estado | Observação |
|---|---|---|---|
| P1 | Fluxo para **cadastrar itens não cadastrados** com geração de código automático | 🟡 PARCIAL | Existe `insumos` e já existem `solicitacao_compra_itens_manuais` (**1.560 registros**) — a base está lá. |
| P2 | Tabela de itens não cadastrados, com opção de editar e salvar na tabela padrão ou selecionar existente | 🟡 PARCIAL | Evolução do item manual atual. |
| P3 | **Média de compras do item** nos modais de solicitação | 🟡 PARCIAL | Existe script `testarUltimoPrecoInsumo.js` — há lógica de preço por insumo a aproveitar. |
| P4 | **Card expansível dos itens** na tela de detalhes, abaixo do cabeçalho, com opção de editar/cadastrar o item na tabela oficial de insumos | 🔴 NOVO | Aparece em Compra Direta (4.1) **e** em Solicitação de Compra (4.2) — mesma funcionalidade nos dois. |
| P5 | Critérios e limites de valor para Compra Direta | ❓ DEFINIR | Continua em aberto. |

---

## 5. Financeiro

| # | Item | Estado | Observação |
|---|---|---|---|
| F1 | Remover criação de título manual sem solicitação | 🟡 PARCIAL | Ver T7 — verificar dependência de importação e conciliação. |
| F2 | Ajustar informações do cheque na tela de baixa | 🟡 PARCIAL | Ver T14 — falta detalhar. |
| F3 | Anexo na frente do título, na aba Financeiro | 🟡 PARCIAL | Ver T12. |
| F4 | Status/botão **NEC. REEMBOLSO** refletindo no título, em vermelho | 🔴 NOVO | Ver T11. |
| F5 | Campo Favorecido com múltiplos favorecidos e divisão de valores | 🔴 NOVO | Ver T4 — impacta a geração de títulos e o pagamento. |

---

## 6. Obras e Apropriações

| # | Item | Estado | Observação |
|---|---|---|---|
| O1 | Apropriações padrão vinculadas ao **cadastro da obra**, carregadas automaticamente por tipo de solicitação | 🔴 NOVO | Vale para ADM Local de Obra, Locação de Máq./Eq. e Despesas de Marketing. |
| O2 | Exibir **código + descrição** da apropriação (etapa, serviço ou natureza), não só o código | 🟢 AJUSTE | Observações Gerais — melhora de leitura em todas as telas. |
| O3 | Criar apropriação **Despesas de Marketing** quando a obra for privada | 🔴 NOVO | |
| O4 | Rateio proporcional do centro de custo Administrativo/Escritório para obras ativas | 🔴 NOVO | Ver T9 — decisão pendente sobre onde aparece. |
| O5 | Etapa **"Marketing"** no cadastro das obras | ⚠️ CONFLITO | O original pede criar a etapa; sua anotação na v1 diz **"Não adicionar mais"**. Precisa confirmar se foi descartado. |
| O6 | Etapa **"Despesa com Vendas"** no cadastro das obras pertinentes | ❓ DEFINIR | Segue em aberto (seção 16). |

---

## 7. RH e Departamento Pessoal

⚠️ **CONFLITO estrutural.** A versão 3 introduz: *"As solicitações referentes a admissão,
movimentação e demissão serão tratadas no **Módulo Departamento Pessoal**"* e *"cria carteira de
colaboradores por obra"*. A versão 1 mantém tudo como tipo de solicitação (seções 8, 9 e 10).

Peso real na base: **110 admissões, 129 demissões, 67 atestados** já registrados como
solicitação. O módulo `RH_DP` **existe e está habilitado**, com as tabelas `rh_colaboradores`,
`rh_apuracoes`, `rh_fechamentos`, `rh_importacoes`, `rh_colaborador_pagamentos`.

**Precisa da sua decisão:** migrar para o módulo DP ou manter como solicitações?

| # | Item | Estado | Observação |
|---|---|---|---|
| R1 | Botões de ação para admissão, demissão, movimentação e alteração salarial | 🔴 NOVO | |
| R2 | Alteração de salário cria uma solicitação normal | 🟡 PARCIAL | |
| R3 | Modal no painel de colaboradores mostrando as solicitações daquele colaborador | 🔴 NOVO | |
| R4 | Aba de colaboradores com dias e horas trabalhadas **via importação**, para solicitar pagamento de mão de obra | 🟡 PARCIAL | `rh_importacoes` e `rh_importacao_linhas` já existem. |
| R5 | Movimentação que vira pagamento **cria uma solicitação** | 🔴 NOVO | |
| R6 | **Notificações no menu** para essas movimentações | 🟡 PARCIAL | Sistema de notificações existe (`notificacoes`, 38 mil registros). |
| R7 | Botão para solicitar aumento | 🔴 NOVO | |
| R8 | Botão de solicitar admissão com **lista de cargos, funções e salários**, e documentação obrigatória por cargo | 🔴 NOVO | |
| R9 | **Lista de cargos** para seleção em alteração de cargo/função | 🟡 PARCIAL | `users.cargo_id` existe; confirmar se há tabela de cargos completa. |
| R10 | Transferência de obra **com aprovação do responsável pela obra de destino** | 🔴 NOVO | |
| R11 | Verificar necessidade de ASO na alteração de cargo/função | 🔴 NOVO | Integra com o módulo SST. |
| R12 | Prazo mínimo de antecedência para admissão | ❓ DEFINIR | |

---

## 8. Comercial

| # | Item | Estado | Observação |
|---|---|---|---|
| M1 | **Fluxo completo com D4Sign**: Comercial cria solicitação com formulário → gera contrato PDF → valida com Jurídico → Comercial envia ao cliente → assinatura → **sistema cria os títulos** e guarda o documento assinado | 🟡 PARCIAL | `d4signService.js` e `comercialContratoDocumentoService.js` já existem. **A integração D4Sign está desativada no ambiente local** (`D4SIGN_TOKEN_API` vazio). |
| M2 | Cadeia de aprovação: Corretor → Comercial → Jurídico → Comercial → Corretor → Cliente → Títulos | 🔴 NOVO | *(Folha 1)* Note que difere do fluxo descrito na seção 15: Comercial → Gerência de Processos → Jurídico → Gerência de Processos → Comercial. ⚠️ **Confirmar qual vale.** |
| M3 | Levar a tela de **contratos de venda** para a tela de nova solicitação; ao criar, listar os dados em tabela no detalhe da solicitação, com anexos em pasta | 🔴 NOVO | *(Folha 1)* |
| M4 | **Separar o centro de custo de Marketing** do Comercial | 🔴 NOVO | |
| M5 | Solicitação de Elaboração de Contrato de Compra e Venda (seção 15) — formulário estruturado com checklist dinâmico | 🔴 NOVO | A seção mais extensa do escopo: identificação do imóvel, tipo de comprador, estado civil, regime de bens, cônjuge, procurador, 6 formas de pagamento com campos próprios, corretagem, condições especiais e 13 blocos de validação. |
| M6 | Despesa Comercial (Comissão/Corretagem) alimentada pelo cadastro de corretagem do contrato | 🔴 NOVO | Só disponibilizar contratos com corretagem preenchida e responsável = "Construtora". |

---

## 9. Centros de Custo — Administrativo, Marketing e Comercial

⚠️ **A versão 3 reformula estas três seções** (13, 14 e 16) com o mesmo padrão, que **não
existe na versão 1**:

> Ao selecionar o centro de custo, o sistema exibe a **lista de tipos de solicitação vinculados
> àquele centro de custo**.

E define listas específicas:

**Marketing** (v3): Comunicação Visual e Sinalização de Obra · Produção de Conteúdo ·
Ferramentas, Softwares e Assinaturas · Brindes e Material Promocional · Eventos, Patrocínios e
Relacionamento · Prestação de Serviços de Marketing · Pesquisa e Inteligência de Mercado

**Comercial** (v3): Deslocamentos e Visitas Comerciais · Reuniões e Relacionamento com Clientes ·
Ferramentas, Softwares e Assinaturas Comerciais · Documentação e Formalização de Vendas ·
Prospecção Comercial · Estrutura e Material do Comercial · Treinamentos e Desenvolvimento
Comercial · Despesas de Negociação e Fechamento · Pós-venda e Atendimento Comercial · Outras
Despesas Comerciais

**Administrativo** (v1, seção 13): Água · Energia · Internet · Aluguel · Materiais de escritório ·
**Equipamentos de escritórios** *(seu acréscimo)* · Manutenção escritório · Despesa com veículos ·
Abastecimento · Materiais de consumo · Taxa/impostos — restrito aos escritórios Guaçuí, Iriri e Norte

A v3 também pede criar os centros de custo **"Marketing"** e **"Comercial"** (❓ DEFINIR).

**Precisa da sua decisão:** adotar o modelo da v3 (tipo de solicitação derivado do centro de
custo) ou manter subtipos como na v1?

---

## 10. Jurídico

Seção 12 sem alterações anotadas: campos Obra e Data para atendimento, anexos opcionais.

Participação relevante nos fluxos de Contratos (acima de R$ 50 mil) e Comercial (elaboração e
conferência do contrato de compra e venda).

---

## 11. Pendências de decisão

### 11.1 Já decididas nas suas anotações

| Pendência original | Decisão registrada |
|---|---|
| Percentual-limite de aditivo | **25%**, automático abaixo de R$ 50 mil |
| Valor-limite entre Gestor da Obra e Diretoria/Jurídico | **R$ 50.000,00** |
| Valor máximo para pequenas despesas | **R$ 5.000,00** por solicitação e **R$ 30.000,00** por obra |
| Etapa "Marketing" no cadastro das obras | **"Não adicionar mais"** — confirmar |

### 11.2 Ainda em aberto

| Pendência | Onde |
|---|---|
| Critérios e limites de valor para Compra Direta | Seção 4.1 |
| Etapa "Despesa com Vendas" no cadastro das obras | Seção 16 |
| Criar centros de custo "Marketing" e "Comercial" | v3, seções 14 e 16 |
| Prazo mínimo de antecedência para admissão | Seção 8 |
| Apropriação: por solicitação ou por títulos | Folha 1 |
| Rateio administrativo: relatório da obra ou apropriação própria | Folha 1 |

### 11.3 Conflitos entre versões — precisam da sua decisão

| # | Conflito | Impacto |
|---|---|---|
| X1 | **Outros Assuntos**: inativar (v1) × tornar geral (original) | 341 solicitações existentes |
| X2 | **Estrutura de Contratos**: por aprovador (v1) × por faixa de valor (v3) | Define a modelagem do módulo |
| ~~X3~~ | ~~**RH**: módulo Departamento Pessoal (v3) × tipos de solicitação (v1)~~ | ✅ **RESOLVIDO em 16/08:** RH e DP passam a ser áreas separadas, com o DP ganhando área própria de gestão de colaboradores. Detalhado em `ALTERACOES-POR-PAGINA.md` |
| X4 | **Centros de custo**: tipo derivado do centro de custo (v3) × subtipos (v1) | Afeta 3 seções |
| X5 | **Fluxo comercial**: Corretor→Comercial→Jurídico (Folha 1) × Comercial→Gerência de Processos→Jurídico (seção 15) | Define a cadeia de aprovação |
| X6 | **Etapa Marketing**: criar (original) × "não adicionar mais" (v1) | Confirmar descarte |

---

## 12. Achados do sistema atual que afetam este escopo

Levantados na verificação e no baseline. Não estão no escopo, mas atrapalham a execução dele.

| # | Achado | Por que importa aqui |
|---|---|---|
| A1 | `configuracoes_sistema` **não tem índice único em `chave`**: `TEMA_SISTEMA` tem **10 linhas duplicadas** com conteúdos diferentes e `AREAS_OBRA_VISIVEIS` tem 3. Qual vale depende da ordem do SELECT | A reforma visual mexe exatamente em tema e configuração. Precisa ser resolvido **antes**. |
| A2 | `GET /api/configuracoes/tema` falha e o front cai no tema padrão **sem avisar** (`ThemeContext.jsx:278-281`) | Falha silenciosa: o usuário vê cores erradas sem saber. |
| A3 | `tipos_sub_contrato` tem **duplicidades sujas**: "DESPESAS COM VEICULOS" aparece 3 vezes, duas com tabulação no início do nome | O escopo mexe em subtipos. Limpar antes evita propagar o problema. |
| A4 | O menu exibe **30 links de CRM, SST e Fiscal** com os módulos desligados; o bloqueio é só na rota | A reforma de navegação precisa decidir o comportamento. |
| A5 | Valores em reais **cortados na borda** dos cards do dashboard, em tema claro e escuro a 1440px | Defeito visual atual, a corrigir na reforma. |
| A6 | `porArea` do dashboard traz **chaves duplicadas por espaço sobrando** (`"GERENCIA DE PROCESSOS "`) | Dado sujo aparecendo na interface. |
| A7 | **Zero títulos a receber** na base | Contas a Receber é necessariamente vazia — vale pouco como prova de não-regressão. |

---

## 13. Como este documento foi montado

1. Os três `.docx` foram convertidos preservando cor de fonte e destaque, o que permitiu
   separar texto original de anotação.
2. Diff do **Original × versão 1** isolou **57 acréscimos** — suas anotações.
3. Diff do **Original × versão 3** isolou **109 acréscimos**, incluindo reestruturações que a
   versão 1 não tem.
4. Cada item foi cruzado com o banco `fluxy_main_copia` e com o código em `backend/src` e
   `frontend/src`. O que está marcado como verificado foi consultado, não presumido.

**Limite declarado:** a marcação 🔴/🟡/🟢 indica existência de estrutura, não estimativa de
esforço. Itens 🟢 podem exigir ajuste em várias telas, e itens 🟡 podem ter base aproveitável
mas insuficiente.
