# Alterações por Página — Fluxy V4

Documento de trabalho da implementação. Cada alteração aponta para a página real do sistema e
traz o que foi **verificado no código e no banco**, não presumido.

**Etapa 1 (foco atual):** Solicitante Obra — tela Nova Solicitação e novo fluxo de Contratos.

Legenda: 🔴 NOVO · 🟡 PARCIAL (existe base) · 🟢 AJUSTE (existe, muda regra/rótulo)

---

# ETAPA 1 — SOLICITANTE OBRA

---

## Fluxo desenhado pelo cliente (wireframes de 16/08)

Dois wireframes definiram o comportamento-alvo da tela de Nova Solicitação no contexto de
contratos. Registro aqui a leitura do fluxo antes das alterações por campo.

### Wireframe 1 — criação da solicitação de contrato

Layout em blocos:

```
Obra/Centro de Custo            Tipo Solicitação (ex: Contratos)
SubTipos (Abertura de Contrato / Solicitação de Contrato / Aditivo Contrato)   Contrato
Credor [buscar ou cadastrar]    Favorecido
Valor        Saldo        Data Vencimento
Condição de Pagamento [caixa de seleção]     Qtde Parcelas

[ ] Título 1 | Valor | Vencimento | Status (ex: Previsão) | [Editar valor e vencimento]
[ ] Título 2 | Valor | Vencimento | Status (ex: Previsão) | [Editar valor e vencimento]

Comprovantes da despesa [anexo]                    [Criar Solicitação]
```

### Wireframe 2 — mesma tela usada para MEDIÇÃO de um contrato existente

Exemplo preenchido (Tipo Solicitação: Medição, contrato CT-0001):

- **Subtipo** não habilitado para esse tipo
- **Valor** e **Vencimento** do topo **não aparecem** — porque serão definidos no título
- Lista de títulos do contrato aparece com checkbox; o Título 1 marcado (5.000,00 / 20/08/2026)
- O valor do meio (10.000,00) é o **saldo**, que recalcula ao editar o título

### O que cada wireframe cobre (esclarecido em 16/08)

Os dois prints tratam de **tipos de solicitação diferentes**, não de duas versões da mesma tela.

| Print | Tipo | Subtipos |
|---|---|---|
| 1 | **Contrato** | Abertura de Contrato · Solicitação de Contrato · Aditivo de Contrato |
| 2 | **Medição** | Não habilita subtipo |

**Print 1 — Contrato.** Cria o contrato e suas parcelas de previsão. Os três subtipos
correspondem às faixas já definidas: abertura abaixo de R$ 50 mil, solicitação acima de
R$ 50 mil, e aditivo (até 25%).

**Print 2 — Medição.** Não cria contrato: **consome** um contrato existente. Precisa carregar
a lista de contratos e, para cada um, **saber a qual fluxo ele pertence**.

### A bifurcação da tela de Medição

> Este é o ponto de maior risco de regressão da Etapa 1.

Ao selecionar um contrato, a tela precisa decidir entre dois comportamentos:

| Contrato | Comportamento |
|---|---|
| **Fluxo novo** | Lista os títulos de previsão com checkbox, status e edição de valor/vencimento; saldo recalcula em tempo real |
| **Fluxo antigo (legado)** | Mantém exatamente o formulário de medição atual, sem lista de títulos |

#### Volume em jogo

| Métrica | Valor |
|---|---|
| Contratos cadastrados | 339 (337 ativos) |
| Contratos que já têm medição | **227** |
| Medições registradas | **656** |

Ou seja: 227 contratos em uso real precisam continuar medindo exatamente como hoje.

#### Requisitos técnicos desta bifurcação

| # | Requisito | Observação |
|---|---|---|
| MD-1 | O marcador de fluxo (M7) precisa vir no payload de `getContratos` | Hoje o service devolve `{ obra_id, ref, modo }`; a tela não tem como saber o fluxo |
| MD-2 | **Padrão seguro: contrato sem marcador = fluxo antigo** | Os 339 contratos existentes não terão o campo. Se o padrão fosse "novo", todos quebrariam de uma vez |
| MD-3 | A tela renderiza condicionalmente conforme o marcador | Duas trilhas na mesma tela |
| MD-4 | Um contrato **não muda de fluxo** depois de criado | Evita contrato meio-antigo, meio-novo |
| MD-5 | Medições antigas continuam abrindo e editando no formato antigo | Regressão aqui atinge 656 registros |

> **Critério de teste obrigatório:** abrir uma medição existente de contrato legado, antes e
> depois da mudança, e comparar. É candidato natural a entrar no baseline de comparação.

### Próximos tipos a detalhar

Os wireframes cobrem Contrato e Medição. O escopo consolidado tem mais tipos a percorrer, um a
um: ADM Local de Obra, Locação de Máq./Eq., Compra Direta, Solicitação de Compra, Recarga de
Cartão, Despesa Eventual, Outros Assuntos, e os tipos de RH, Administrativo, Marketing e
Comercial. Cada um entra neste documento conforme for detalhado.

### O fluxo, em texto

1. **Uma única solicitação por contrato concentra todas as parcelas.** Ao selecionar um
   contrato, o sistema **relista os títulos já criados** para ele, com o status atual de cada um.
2. O solicitante **marca (checkbox)** o título cuja parcela quer pagar.
3. Ao marcar, o sistema **já desconta o valor do saldo**. Ao editar valor/vencimento do título,
   **recalcula o saldo em tempo real** — sem o usuário fazer conta.
4. Ao criar a solicitação para o título marcado, o status da solicitação vira **NEC. DE
   MEDIÇÃO** e ela **volta ao topo** da lista dos usuários do setor **GERÊNCIA DE PROCESSOS**,
   que precisam tratá-la.

### Pontos confirmados no sistema

| Ponto | Verificação |
|---|---|
| Setor GERÊNCIA DE PROCESSOS | ✅ Existe — `setores` id **2**, código **GEO**. Nome cadastrado com espaço no fim: `"GERENCIA DE PROCESSOS "` (ver achado A6 do escopo). |
| Status de solicitação livres | ✅ `status_global` é texto livre — criar **NEC. DE MEDIÇÃO** não exige migration. Já existem 25+ status distintos. |
| Volta ao topo | 🟡 Ordenação da lista precisa de critério: por status prioritário ou por data de atualização. A decidir. |
| Saldo em tempo real | 🔴 Cálculo no front + confirmação no back ao gravar. Não existe hoje. |

### Decisões que o fluxo já fecha

- **Código automático `CT-0001`, sequencial simples** (D1 resolvido). Não é mais o padrão
  antigo `CT/<SIGLA><NNN>-<SEQ>`.
- **Novos contratos deste fluxo ficam separados dos antigos** (CT-11 esclarecido): os
  contratos legados mantêm o fluxo de solicitação anterior; só os novos entram no fluxo novo.
- **Previsões nascem na criação do contrato** (D6 resolvido): o contrato é criado com seus
  títulos de previsão, e a solicitação de medição depois seleciona qual título pagar.

### Ponto de atenção técnico — código sem conflito com múltiplos solicitantes

O cliente pediu explicitamente: `CT-0001` em diante **sem gerar conflito com múltiplos
solicitantes ao mesmo tempo**.

Gerar por `MAX(numero)+1` em código de aplicação **não é seguro** sob concorrência: dois
solicitantes simultâneos leem o mesmo máximo e geram o mesmo código. A geração precisa ser
**atômica no banco**. O projeto já tem o modelo `TituloFinanceiroSequencia` como referência
de sequencial seguro — usar o mesmo padrão (linha reservada com bloqueio, ou tabela de
sequência dedicada), nunca `MAX()+1` solto.

---

## Página: `nova-solicitacao`

`frontend/src/pages/NovaSolicitacao.jsx` — **2.260 linhas, tela monolítica**

### Estado atual verificado

O formulário tem **16 campos**:

```
obra_id · parceiro_id · apropriacao_id · tipo_solicitacao_id · tipo_sub_id
contrato_id · codigo_contrato · area_responsavel · descricao · itens_apropriacao
ref_contrato_abertura · valor · data_vencimento · data_demissao
data_inicio_medicao · data_fim_medicao
```

A tela **já carrega quatro configurações dinâmicas** do backend, o que é a maior alavanca
desta etapa:

| Configuração | Página que a controla | O que permite |
|---|---|---|
| `getCamposNovaSolicitacao()` | `nova-solicitacao-campos` | Regras de exibição/obrigatoriedade por campo |
| `getTiposSolicitacaoPorSetor()` | `tipos-solicitacao-por-setor` | Quais tipos cada setor pode abrir |
| `getAreasPorSetorOrigem()` | `areas-por-setor-origem` | Áreas por setor de origem |
| `getAutomacaoDestinoNovaSolicitacao()` | `nova-solicitacao-automacao-destino` | Destino automático da solicitação |

Além disso, cada tipo em `tipo_solicitacao` guarda um JSON `comportamento` com 16 flags
(`mostrar_valor`, `exige_contrato`, `mostrar_subtipo`, `exige_periodo_medicao`, …).

> **Consequência prática:** boa parte das mudanças de campo por tipo é **configuração, não
> código**. Antes de programar qualquer regra nova de campo obrigatório, verificar se ela já
> não sai por `nova-solicitacao-campos` ou pelo JSON `comportamento`.

### Alterações

| # | Alteração | Tipo | Observação |
|---|---|---|---|
| NS-1 | **Dividir a tela em dois blocos**: *Informações da Solicitação* e *Informações para Pagamento* | 🔴 | Reestruturação visual. Base para NS-2 e NS-3. |
| NS-2 | Bloco de pagamento com **forma de pagamento**: PIX / Transferência / Boleto | 🔴 | Ao escolher PIX → campo de chave. Boleto → anexo obrigatório do boleto. Não existe hoje na solicitação. |
| NS-3 | **Favorecido do pagamento**, permitindo **múltiplos** com divisão de valores | 🔴 | Verificado: `favorecido` só existe em `rh_colaborador_pagamentos`. Exige tabela nova. A soma tem de fechar com o valor total — validação no backend, não só no front. |
| NS-4 | **Balão de orientação** por campo | 🔴 | Componente reutilizável. O texto de cada campo deveria ser configurável junto com `nova-solicitacao-campos`, para não virar texto fixo no código. |
| NS-5 | Listar tipos conforme **o que a obra pode solicitar** e **o que o setor pode solicitar** | 🟡 | `tipos-solicitacao-por-setor` já resolve a metade "setor". Falta a dimensão "obra". |
| NS-6 | **Remover "Área Responsável"** (tudo passa por Gerência de Processos) | 🟡 | `area_responsavel` está em 5 telas: `SolicitacaoTable`, `SolicitacaoCard`, `Dashboard`, `NovaSolicitacao`, `NovaSolicitacaoCompra`. **Não remover a coluna do banco** — só parar de exibir/exigir, senão quebra histórico e relatórios. |
| NS-7 | **Descrição → "Título"**, gravando em maiúsculo | 🟢 | Rótulo + normalização na gravação. |
| NS-8 | Campo **Finalidade**, indo para o histórico da solicitação | 🔴 | Coluna nova + registro em `historicos`. |
| NS-9 | **Saldo do Contrato** visível, com bloqueio ao ultrapassar | 🔴 | Depende de CT-6. Ver seção de Contratos. |
| NS-10 | ADM Local de Obra e Locação Máq./Eq.: **deixar de exigir contrato** | 🟢 | Só alterar `exige_contrato` no JSON `comportamento` dos tipos 1 e 3. **Não requer código.** |
| NS-11 | Apropriação **automática** por tipo, a partir do cadastro da obra | 🔴 | Exige vínculo tipo↔apropriação no cadastro da obra. |
| NS-12 | Subtipo: remover **REEMBOLSO**, criar **CAIXA DE OBRA** | 🟢 | REEMBOLSO é o id 11 em `tipos_sub_contrato`. Inativar, não apagar — há solicitações usando. |
| NS-13 | **"Anexos" → "Comprovantes da Despesa"** | 🟢 | Rótulo. A tabela `anexos` mantém o nome. |

---

## Novo fluxo de Contratos

Páginas envolvidas: `gestao-contratos` · `nova-solicitacao` · `solicitacoes/:id` ·
`aprovacao-diretoria` · `financeiro/contas-a-pagar`

### Estado atual verificado

**A tabela `contratos` tem 14 colunas:**

```
id · obra_id · codigo · ref_contrato · descricao · valor_total
ajuste_solicitado · ajuste_pago · tipo_macro_id · tipo_sub_id
ativo · createdAt · updatedAt · itens_apropriacao
```

**Não existem:** vigência inicial/final, credor, forma de pagamento, status, saldo,
responsável, objeto, data de aprovação, aprovador.

**O código do contrato é digitado pelo usuário e obrigatório.** Em
`ContratoController.create` (linha 796):

```js
if (!obra_id || !codigo || !refContratoFinal || valor_total === undefined) {
  return res.status(400).json({ error: 'Obra, codigo, ref do contrato e valor total sao obrigatorios' });
}
```

**Padrão observado nos códigos existentes:** `CT/<SIGLA><NNN>-<SEQ>` —
`CT/ADML001-105`, `CT/MO001-102`, `CT/SE005-24`, `CT/TE003-7`. O padrão **não é consistente**:
há `CT/SE013` sem sequencial e convivem `CT/ADM001` e `CT/ADML001`.

### ⚠️ Bloqueio a resolver antes da geração automática

> `contratos.codigo` **não tem índice único**. Índices existentes: apenas `PRIMARY (id)`,
> `obra_id`, `tipo_macro_id`, `tipo_sub_id`.
>
> Há **6 contratos com código duplicado** hoje:
>
> | Código | Vezes | IDs |
> |---|---|---|
> | `CT/ADM001-33` | 5 | 717, 719, 718, 715, 716 |
> | `GEN` | 3 | 558, 551, 426 |
>
> Gerar código automático sem unicidade garantida reproduz o problema. **Estes 6 registros
> precisam ser tratados antes** — e a decisão sobre o que fazer com eles é sua.

### Alterações

| # | Alteração | Tipo | Observação |
|---|---|---|---|
| CT-1 | **Geração automática do código** do contrato | 🔴 | Requer: definição do padrão, tabela/coluna de sequencial por obra ou por tipo, e índice único. Existe `TituloFinanceiroSequencia` como modelo de referência para sequencial. |
| CT-2 | **Índice único** em `contratos.codigo` | 🔴 | Migration. Só depois de tratar os 6 duplicados. |
| CT-3 | Criação do contrato **via formulário**, a partir da solicitação de abertura | 🔴 | Botão na solicitação → cria o contrato já vinculado. |
| CT-4 | **Status do contrato**: ativo/parcialmente medido · totalmente medido · concluído · rescindido | 🔴 | Coluna nova. Hoje só existe `ativo` (booleano). |
| CT-5 | Campos de contrato: vigência inicial/final, objeto, responsável, forma de pagamento, credor | 🔴 | Todos ausentes hoje. |
| CT-6 | **Saldo do contrato** calculado e visível | 🔴 | Derivar de `valor_total` + aditivos − medições. Base para NS-9 e para o bloqueio. |
| CT-7 | **Rescisão** cancelando o saldo automaticamente | 🔴 | Depende de CT-4 e CT-6. |
| CT-8 | Renomear na interface: SOLICITADO→**CONTRATADO**, A PAGAR→**SALDO**, AJUSTE SOLICITADO→**ADITIVOS** | 🟢 | Só rótulo. A coluna real é `ajuste_solicitado`. |
| CT-9 | **Detalhes da Contratação** obrigatório acima de R$ 50 mil | 🔴 | |
| CT-10 | Acima de R$ 50 mil: **não permitir múltiplos credores** | 🔴 | Inverte a regra atual. |
| CT-11 | **Preservar o fluxo legado** durante a transição | 🔴 | **Item de maior risco de regressão.** 172 solicitações de Abertura de Contrato e 339 contratos existentes. |

### Aprovação de contratos acima de R$ 50 mil

#### Estado atual verificado — há base sólida para reaproveitar

**1. O mecanismo de aprovação de diretoria já existe e é usado.** Em `solicitacoes`:

```
fluxo_aprovacao_diretoria · diretoria_fluxo_codigo
aprovada_diretoria_por · aprovada_diretoria_em
```

**2.633 solicitações** já passaram por esse fluxo. Há página dedicada (`aprovacao-diretoria`)
e lógica em `SolicitacaoController` (linhas 702, 999, 1197, 1247, 4308, 4347).

**2. O sistema de permissão granular existe.** `constants/moduloPermissoes.js` define chaves
no formato `modulo.area.acao`, com regras explícitas:

- SUPERADMIN e ADMINISTRADOR têm **bypass total**
- Usuário **sem** entradas → acesso completo ao que o perfil já permite (retrocompatível)
- Usuário **com** entradas → somente o que está listado

As permissões são entregues no login como `areas_permissoes` e verificadas nos controllers.

Permissões de contrato existentes hoje:

```
contratos.geral.criar · contratos.geral.editar · contratos.geral.visualizar
contratos.relatorios.visualizar
```

**Não existe permissão de aprovação de contrato** — é o que precisa ser criado.

#### Alterações

| # | Alteração | Tipo | Observação |
|---|---|---|---|
| AP-1 | Nova permissão **`contratos.aprovacao.aprovar`** | 🔴 | Acrescentar em `moduloPermissoes.js`, grupo CONTRATOS. Aparece automaticamente na tela `permissoes-areas`. |
| AP-2 | Considerar permissão separada para **acima do limite** (ex.: `contratos.aprovacao.aprovar_acima_limite`) | ❓ | **Decisão sua:** uma permissão só, ou duas faixas distintas? |
| AP-3 | **Botão Aprovar / Rejeitar** no contrato acima de R$ 50 mil | 🔴 | Visível apenas para quem tem a permissão. |
| AP-4 | Registrar **quem aprovou e quando** | 🔴 | Espelhar `aprovada_diretoria_por` / `aprovada_diretoria_em`. |
| AP-5 | Rejeição com **motivo obrigatório** | 🔴 | |
| AP-6 | Registrar aprovação e rejeição em `security_event_logs` | 🟡 | O `permit()` já grava `AUTHZ_DENIED` automaticamente nas negativas. |

> **Atenção ao bypass.** SUPERADMIN e ADMINISTRADOR ignoram permissões por desenho. Na base
> há **4 SUPERADMIN e 16 ADMIN** — ou seja, 20 pessoas aprovariam qualquer contrato
> independentemente da permissão granular. Se a aprovação acima de R$ 50 mil precisa ser
> restrita de verdade, **o bypass precisa de exceção para esta ação**. Decisão sua.

### Títulos de previsão

#### Estado atual verificado

`titulos_financeiros.status` é **`STRING(20)`, não ENUM**, com default `'ABERTO'`
(`models/TituloFinanceiro.js:128`).

> **Boa notícia:** adicionar status novos **não exige migration de tipo de coluna** — é regra
> de aplicação. Reduz bastante o risco.

Status em uso hoje:

| Status | Títulos |
|---|---|
| QUITADO | 1.917 |
| ABERTO | 891 |
| EXCLUIDO | 33 |
| PARCIAL | 2 |

**Não existe `PREVISAO` nem `CANCELADO`.** Os dois precisam ser criados.

#### ⚠️ Achado de 16/08 — `PREVISAO` já existe no código

Ao mapear onde o status poderia vazar (TP-5), descobri que **`PREVISAO` já está previsto em
7 pontos do backend**, embora **nenhum título use esse status hoje**:

| Arquivo | Uso |
|---|---|
| `controllers/DashboardController.js:230` | `whereAbertos` — **saldo aberto projetado e títulos vencidos** |
| `services/relatorioFinanceiroService.js` | 4 pontos, entre eles linhas 313, 638, 1284, 3127 |
| `services/relatorioFinanceiroService.js:3826` | lista de status conhecidos: `PREVISAO, ABERTO, PARCIAL, QUITADO, CANCELADO, ESTORNADO` |
| `modules/custosRecebiveis/services/realizadoService.js` | agrupa por `PREVISAO` |

**Consequência direta:** se os títulos de previsão forem criados com esse status, eles entram
**imediatamente** no saldo aberto do dashboard e nos relatórios financeiros — inclusive como
**vencidos**, se a data passar. É exatamente o vazamento que TP-5 pretendia evitar.

Ou seja: o comportamento atual do código é o **oposto** de TP-6 (previsões fora do fluxo de
caixa até a aprovação).

Também vale notar que o código já conhece `CANCELADO` e `ESTORNADO` como status de título,
embora nenhum registro os utilize — o que reabre a discussão de D5 (usar `EXCLUIDO` para
rejeição), já decidida, mas agora com mais contexto disponível.

> **Isto precisa de decisão antes de implementar** (D31). Alterar os 7 pontos significa mexer
> em dashboard e relatórios financeiros — área de alto risco de regressão, que o baseline
> cobre parcialmente.

#### Alterações

| # | Alteração | Tipo | Observação |
|---|---|---|---|
| TP-1 | Criar status **`PREVISAO`** | 🔴 | Título nasce assim quando gerado pelo contrato ainda não aprovado. **Ver achado acima.** |
| TP-2 | Criar status **`CANCELADO`** | 🔴 | Note que já existe `EXCLUIDO` (33 títulos). **Decisão sua:** criar `CANCELADO` novo ou reutilizar `EXCLUIDO`? São conceitos diferentes — recomendo separar, porque exclusão e rejeição têm significados distintos no histórico. |
| TP-3 | Aprovação do contrato → títulos de previsão viram **ABERTO** | 🔴 | Transição em lote, dentro de transação: ou todos mudam, ou nenhum. |
| TP-4 | Rejeição do contrato → títulos de previsão viram **CANCELADO** | 🔴 | Idem. |
| TP-5 | Títulos em PREVISAO **não podem** ser baixados, conciliados ou pagos | 🔴 | **Ponto crítico.** Verificar todos os pontos que filtram por status: `financeiro/contas-a-pagar`, `financeiro/baixas`, `financeiro/baixas-compostas`, `financeiro/conciliacao`, DRE e relatórios. Se algum consultar "tudo que não é QUITADO", passará a incluir previsões indevidamente. |
| TP-6 | Previsões **fora** do fluxo de caixa e do DRE até serem aprovadas | 🔴 | Decorre de TP-5. Afeta `financeiro/dre` e `financeiro/endividamento`. |
| TP-7 | Modal para editar título de previsão, com histórico da medição e anexos | 🔴 | |
| TP-8 | Indicação visual distinta para previsões | 🔴 | |

---

## RH e Departamento Pessoal — separação (registrado em 16/08)

> Desenho do modelo virá do cliente. Registro aqui a visão e o que a verificação já mostrou.

### Decisão

**RH e Departamento Pessoal passam a ser áreas separadas.** O Departamento Pessoal ganha
**área própria de gestão de colaboradores**, com:

- **Notificação de solicitações** relacionadas ao colaborador
- **Botões de ação** para os eventos:
  - Admissão
  - Demissão
  - **Movimentação de colaborador para outra obra**, com **aprovação do responsável pela obra
    de destino**

Isso resolve o conflito **X3** do escopo consolidado (módulo DP na v3 × tipos de solicitação
na v1): a direção é o módulo próprio.

### Estado atual verificado

| Item | Situação |
|---|---|
| Setores | ✅ **Já separados**: `RH` (id 5) e `DEPARTAMENTO PESSOAL` (id 10), ambos ativos |
| Módulo de permissão | ⚠️ **Unificado** — existe apenas `RH_DP`, não há `RH` e `DP` distintos |
| Colaboradores cadastrados | 137 em `rh_colaboradores` |
| Tabelas | `rh_colaboradores`, `rh_apuracoes`, `rh_fechamentos`, `rh_importacoes`, `rh_documentos`, `rh_colaborador_pagamentos`, `rh_empresas_grupo` |
| Rotas | 9 sob `rh/*` |

Volume de solicitações dos tipos envolvidos:

| Tipo | Solicitações |
|---|---|
| Pagamento de Mão de Obra | 613 |
| Demissão | 129 |
| Admissão | 110 |
| Atestado | 67 |
| **Total** | **919** |

### ⚠️ Peça que falta para a aprovação por obra de destino

A movimentação exige aprovação do **responsável pela obra de destino**. Verificação:

> **Não existe campo de responsável na tabela `obras`.** As colunas são: `id, codigo, cidade,
> classificacao_obra, nome, ativo, classificacao, vgv, planilha_geral,
> margem_custo_esperada, tipo_centro_custo, empresa_grupo_id, cno` + endereço.

O que existe é `usuarios_obras` (`user_id`, `obra_id`, `perfil`), com 59 obras vinculadas e
perfis apenas genéricos:

| Perfil | Vínculos |
|---|---|
| USUARIO | 173 |
| ADMIN | 57 |
| SUPERADMIN | 50 |

Ou seja: dá para saber **quem tem acesso** a uma obra, mas **não quem responde por ela**. Uma
obra pode ter vários ADMIN vinculados, e nenhum deles é "o responsável".

**Sem definir isso, a aprovação da movimentação não tem destinatário.**

### Alterações previstas

| # | Alteração | Tipo | Observação |
|---|---|---|---|
| DP-1 | Separar o módulo `RH_DP` em `RH` e `DP` | 🔴 | Afeta permissões de quem já tem `RH_DP`. Precisa de migração de permissões para não tirar acesso de ninguém |
| DP-2 | Área de gestão de colaboradores no DP | 🔴 | Base: `rh_colaboradores` (137 registros) |
| DP-3 | Notificação de solicitações por colaborador | 🟡 | Sistema de notificações existe (30+ eventos) |
| DP-4 | Botões de ação: admissão, demissão, movimentação | 🔴 | Cada um gera solicitação do tipo correspondente |
| DP-5 | **Responsável pela obra** | 🔴 | **Pré-requisito de DP-6.** Ver pendência D28 |
| DP-6 | Aprovação da movimentação pelo responsável da obra de destino | 🔴 | Depende de DP-5 |

### Pendências

| # | Pergunta |
|---|---|
| **D28** | Como identificar o **responsável pela obra**? Campo novo em `obras`, novo perfil em `usuarios_obras` (ex.: `RESPONSAVEL`), ou outro critério? E quem preenche isso para as 59 obras existentes? |
| **D29** | Ao separar `RH_DP` em dois módulos, quem hoje tem `RH_DP` recebe **os dois**, ou a divisão será feita manualmente usuário a usuário? |
| **D30** | Os tipos de solicitação (Admissão, Demissão, Atestado) **continuam existindo** como solicitação, ou passam a ser gerados apenas pelos botões do DP? As 919 solicitações existentes precisam continuar abrindo. |

---

## Alertas de vencimento — item novo (16/08)

Surgiu de D20 e **extrapola o fluxo de contratos**: vale para todo o sistema. Objetivo é o
financeiro não depender de alguém lembrar de olhar.

### Duas partes

**1. Sinalização visual das parcelas vencidas em todo o sistema** — marca de vencido nas
listas e telas onde títulos aparecem.

**2. Disparo diário por e-mail**, com três blocos:

- todos os títulos **vencidos** no sistema
- os que **venceram no dia**
- os que **vencem nos próximos 7 dias**

### Estado atual verificado

Existe um sistema de notificações com **30+ tipos de evento** (`constants/notificacaoEventos.js`),
incluindo `DATA_VENCIMENTO_ATUALIZADA` e `COMPRAS_ATRASO_DELEGACAO`. Há tabelas `notificacoes`
(38 mil registros) e `notificacao_destinatarios` (289 mil).

**Não existe** evento de título vencido nem job de alerta de vencimento.

### ⚠️ O volume muda o desenho

Consulta na base hoje:

| Bloco | Quantidade |
|---|---|
| Vencidos em aberto | **734** |
| Mais antigo | **10/03/2026** (cinco meses) |
| Vencem nos próximos 7 dias | 40 |

Um e-mail diário listando 734 títulos vira ruído e passa a ser ignorado — o oposto do
objetivo. Precisa de decisão sobre o formato (ver D23).

### Alterações

| # | Alteração | Tipo | Observação |
|---|---|---|---|
| AV-1 | Marca visual de vencido nas telas de título | 🔴 | Contas a pagar/receber, detalhe da solicitação, dashboard |
| AV-2 | Job diário de apuração de vencimentos | 🔴 | **Novo job em background** — precisa de flag própria, como os demais |
| AV-3 | E-mail com os três blocos | 🔴 | Depende de SMTP configurado (ver alerta abaixo) |
| AV-4 | Sinalização de atraso na solicitação (de D20) | 🔴 | Marca para a Gerência de Processos quando a solicitação sobe com parcela já vencida |
| AV-5 | Configuração de destinatários | 🔴 | Preferir cadastro no banco a variável de ambiente — permite mudar sem deploy |

### 🔴 Impacto no ambiente local e em produção

> **E-mail está desativado no ambiente local por decisão de projeto** (`AMBIENTE-LOCAL.md`).
> Da mesma forma, todos os jobs em background estão desligados.
>
> Consequência: AV-2 e AV-3 podem ser **construídos e testados** aqui, mas **não dispararão**
> localmente. A prova de QA terá de ser feita sobre o conteúdo gerado (o que *seria* enviado),
> não sobre o envio em si.
>
> **Em produção, isto exige configuração nova no `.env` — ver `MIGRACAO-PARA-PRODUCAO.md`,
> seção 1.**

### Pendências

| # | Pergunta |
|---|---|
| **D23** | Com 734 vencidos, o e-mail traz a **lista completa** todo dia, ou um **resumo** (totais por obra/setor) com link para a tela? Recomendo resumo — lista longa vira ruído e deixa de ser lida. |
| **D24** | **Quem recebe?** Um grupo fixo, os responsáveis por obra, ou configurável por usuário? |
| **D25** | Qual o **horário** do disparo? |
| **D26** | O e-mail cobre **contas a pagar e a receber**, ou só a pagar? (a base tem 0 títulos a receber hoje) |
| **D27** | **SMTP já está configurado em produção hoje?** O sistema usa e-mail em recuperação de senha, então provavelmente sim — mas preciso confirmar, porque sem isso o alerta não sai. |

---

## Apropriação automática — ADM Local de Obra e Locação de Máq./Eq.

Objetivo: ao escolher o tipo de solicitação, a apropriação já vem preenchida, sem o solicitante
precisar procurar. Vale para **ADM Local de Obra**, **Locação de Máq. e Eq.** e
**Despesas de Marketing**.

### Estado atual verificado

`apropriacoes` tem: `id · obra_id · codigo · descricao · ativo · valor_orcado · somadora ·
apropriacao_pai_id`. São **por obra** — cada obra tem a sua árvore.

**60 obras** cadastradas. O volume por obra varia muito: a obra 23 tem **4.789** apropriações,
a 21 tem 354, a 18 tem 249.

### ⚠️ Achado que muda o plano

As apropriações de administração local **não seguem código nem descrição padronizados** entre
as obras. Amostra real:

| Código | Descrição |
|---|---|
| `00.001` | ADMINISTRAÇÃO LOCAL |
| `00.001.001` | ADMINISTRAÇÃO LOCAL |
| `00.006` | ADMINISTRAÇÃO LOCAL COM ENCARGOS |
| `1` | ADMINISTRAÇÃO LOCAL OBRA |
| `01` | ADM LOCAL |
| `7.0` | ADMINISTRAÇÃO LOCAL |
| `30` | ADMINISTRAÇÃO LOCAL |
| `01` | ADMINISTRAÇÃO LOCAL DE OBRA |
| `2` | LOCAÇÃO DE MÁQUINAS E EQUIPAMENTOS |

**Não dá para inferir automaticamente qual é a apropriação certa de cada obra** — nem por
código, nem por texto da descrição. Confirma o que você já previu: o mapeamento das obras
existentes precisa ser **direcionado manualmente**.

### Alterações

| # | Alteração | Tipo | Observação |
|---|---|---|---|
| AA-1 | Vínculo **tipo de solicitação → apropriação**, por obra | 🔴 | Tabela nova: `obra_id` + `tipo_solicitacao_id` + `apropriacao_id`. |
| AA-2 | Tela para **mapear as 60 obras existentes** | 🔴 | Você indica, por obra, qual apropriação corresponde a cada tipo. Sem isso o vínculo não existe para o legado. |
| AA-3 | Preenchimento automático da apropriação em `nova-solicitacao` | 🔴 | Ao escolher obra + tipo, a apropriação vem preenchida. Definir se fica **travada** ou editável. |
| AA-4 | **Criação automática dessas apropriações ao cadastrar nova obra** | 🔴 | Exige um **conjunto padrão** de apropriações — código e descrição — a ser definido por você. É o que resolve o problema daqui para a frente. |
| AA-5 | Apropriação **Despesas de Marketing** criada quando a obra for privada | 🔴 | Depende do padrão de AA-4 e de um campo que identifique obra privada. |

### Pendências desta parte

| # | Pergunta |
|---|---|
| **D16** | Qual o **conjunto padrão** de apropriações a criar em toda obra nova (códigos e descrições)? |
| **D17** | No mapeamento das 60 obras: você fornece a lista, ou construo uma tela para você preencher? |
| **D18** | A apropriação preenchida automaticamente fica **travada** ou o solicitante pode trocar? |
| **D19** | Como o sistema identifica que uma obra é **privada** (para criar a apropriação de Marketing)? |

---

## Migrations previstas nesta etapa

Todas seguindo o padrão do projeto: guardas de existência via `schemaUtils`, colunas
`allowNull: true`, nada destrutivo. Ver `MIGRACAO-PARA-PRODUCAO.md`, seção 4.5.

| # | Migration | Depende de |
|---|---|---|
| M1 | Colunas novas em `contratos`: status, vigências, objeto, responsável, aprovação | — |
| M2 | Índice único em `contratos.codigo` | D2 (os 6 duplicados) |
| M3 | Sequencial atômico para o código `CT-0001` | — |
| M4 | Tabela de favorecidos por solicitação/título | D15 |
| M5 | Coluna `finalidade` em `solicitacoes` | — |
| M6 | Vínculo tipo de solicitação ↔ apropriação por obra (AA-1) | — |
| M7 | Marcador de **fluxo novo × legado** em `contratos` | — |
| M8 | Condição de pagamento e qtde de parcelas no contrato | D10, D11 |

> **M7 é a migration que protege o legado.** Sem um marcador explícito separando contrato do
> fluxo novo do contrato antigo, as duas lógicas se misturam — e são 339 contratos e 172
> solicitações de abertura já existentes.

> Nenhuma migration nova pode ser escrita antes de confirmar o baseline de schema — que já
> está fechado: **produção e local têm as mesmas 165 migrations**.

---

## Pendências de decisão desta etapa

### Resolvidas pelos wireframes de 16/08

| # | Pergunta | Decisão |
|---|---|---|
| D1 | Padrão do código automático | **`CT-0001`** sequencial simples, geração atômica no banco |
| D6 | Quando nascem os títulos de previsão | **Na criação do contrato** |
| — | Convivência com contratos antigos | Contratos novos entram no fluxo novo; **legados mantêm o fluxo anterior** |

### Resolvidas em 16/08 — regras de parcelas, saldo e aditivo

#### D11 — Geração das parcelas

As parcelas **são geradas automaticamente**, dividindo o valor pela quantidade informada, com
**periodicidade fixa** de vencimento. Depois de geradas, ficam **editáveis na tela**.

> **Regra de data — controle de prazo (não é só validação de formulário)**
>
> A data de vencimento informada na solicitação de pagamento **nunca pode ser anterior à data
> da solicitação**.
>
> Exemplo dado pelo cliente: contrato criado em 10/08, parcela vencendo em 13/08. Se o
> solicitante só abre a solicitação de pagamento em 16/08, **não pode** usar a data 13/08.
>
> **Motivo:** o financeiro precisa enxergar que o solicitante perdeu o prazo. Permitir a data
> retroativa deixaria o atraso invisível — o solicitante burlaria o sistema para fazer parecer
> que cumpriu o prazo. A regra existe para **preservar o rastro do atraso**, não para impedir
> o pagamento.
>
> Implicação: a validação tem de ser feita **no backend**, não só no front. Uma validação
> apenas de interface seria contornável — e o objetivo aqui é justamente impedir o contorno.

#### D13 — Saldo e redistribuição

**O valor total do contrato não muda.** Quando o solicitante altera o valor de um título:

| Situação | Efeito |
|---|---|
| Solicita **menos** que o previsto | A diferença **aumenta** as últimas parcelas |
| Solicita **mais** que o previsto | A diferença **diminui** as últimas parcelas |

**Os vencimentos não mudam** nessa operação.

Única exceção: **termo aditivo que aumenta o prazo**. Aí sim o saldo é recalculado e
**redistribuído** entre as parcelas.

#### D14 — Aditivo automático (até 25%, abaixo de R$ 50 mil)

Aplicado **automaticamente** pelo sistema, para dar liberdade ao processo de solicitação.

> ⚠️ **A regra não pode ficar explícita para o usuário.** Nada de mensagem do tipo "aditivo
> automático aplicado" ou aviso de percentual na tela do solicitante. O sistema aplica e segue.

#### D5 / D8 / D10 / D12 — regras de aditivo, pagamento e títulos

**D8 — o limite de R$ 50 mil é sobre o VALOR DO CONTRATO.**

Sobre aditivos: cada aditivo aumenta o valor do contrato, **podendo haver mais de um**, e a
**soma de todos os aditivos não pode ultrapassar 25% do valor original do contrato**.

> Consequência para a implementação: o teto de 25% é **acumulado**, não por aditivo. O sistema
> precisa somar os aditivos já aplicados antes de aceitar um novo. Um contrato de R$ 100 mil
> aceita aditivos até somarem R$ 25 mil — três de R$ 8 mil passam; um quarto de R$ 5 mil é
> recusado por estourar o acumulado.

**D5 — no contexto de contrato rejeitado, os títulos de previsão viram `EXCLUIDO`.**
Não será criado status `CANCELADO`. Reaproveita o status existente (33 títulos hoje).
Continua sendo necessário criar apenas o `PREVISAO`.

**D10 — condições de pagamento vêm do cadastro financeiro existente.**

Verificado: a tabela é `financeiro_formas_pagamento`, com **9 formas ativas**:

| Forma | Código | Permite parcelamento |
|---|---|---|
| Boleto | BOLETO | Sim |
| Pix | PIX | Não |
| Transferência bancária | TRANSFERENCIA | Não |
| Cartão de crédito | CARTAO_CREDITO | Sim |
| Cartão de débito | CARTAO_DEBITO | Não |
| Cheque | CHEQUE | Sim |
| Dinheiro | DINHEIRO | Não |
| Outros | OUTROS | Sim |
| FOPAG | FOPAG | Não |

A tabela já traz as flags `permite_parcelamento`, `gera_boleto`, `gera_fatura`,
`exige_cartao` e `exige_cheque` — aproveitáveis para as regras do formulário.

**Alteração:** criar tela/card para **escolher quais dessas formas aparecem** no campo do
contrato. É uma seleção sobre o cadastro existente, não um cadastro novo.

> Observação útil: `permite_parcelamento` já resolve parte da regra de parcelas. Pix é `não`,
> coerente com o wireframe 2, que mostra Pix com 1 parcela.

**D12 — pode marcar mais de um título** na mesma solicitação.

Se o valor editado ultrapassar o saldo do contrato, desconta da **última parcela**; se
consumi-la por inteiro, desconta da **penúltima**, e assim por diante. Confirma a leitura
registrada em D21.

#### D20 / D21 / D22 — complementos

**D21 — redistribuição:** o ajuste vai para a **última parcela** e, se consumi-la por
inteiro, **continua na penúltima**, retrocedendo até absorver a diferença.

> *Assunção registrada:* a resposta foi "Sim" a uma pergunta com duas partes. Estou
> assumindo esta leitura — concentra na última e retrocede. Se a intenção era **distribuir
> igualmente entre todas as parcelas restantes**, a matemática muda e preciso saber antes de
> implementar o cálculo.

**D20 — atraso também é sinalizado.** Além de bloquear a data retroativa, o sistema marca o
atraso para a Gerência de Processos. Gerou o item novo AV (abaixo).

**D22 — visibilidade do aditivo automático por perfil:**

| Quem | Vê o aditivo automático? |
|---|---|
| Gerência de Processos | **Sim** |
| Financeiro | **Sim** |
| Usuário da Obra (solicitante) | **Não** — acompanha apenas pelo saldo do contrato |

Ou seja, não é "invisível para todos": é **visibilidade por setor**. O registro existe e é
auditável; só não aparece para quem abre a solicitação.

#### D16 / D17 — Apropriações padrão

Conjunto padrão para toda obra nova:

| Código | Descrição |
|---|---|
| `01` | ADM LOCAL DE OBRA |
| `02` | LOCAÇÃO DE MAQ. E EQ. |

Para as 60 obras existentes: **construir a tela de mapeamento** para o cliente preencher.

### Resolvidas em 16/08 — segunda rodada

#### D2 — Códigos de contrato duplicados

**Diagnóstico: são dois casos distintos.**

`GEN` (3 contratos) é **legítimo** — um por obra, em obras diferentes (25, 31, 24), com
**36 solicitações vinculadas**. Dentro de cada obra é único.

`CT/ADM001-33` (5 contratos) é **acidente** — todos na obra 23, mesmo valor e referência,
criados em **2 minutos** (17:31:52 → 17:33:53). **Quatro não têm nenhuma solicitação**; só o
id 719 tem uma.

**Decisão:** índice único em **`(codigo, obra_id)`**, não global — o que valida o `GEN` sem
tocá-lo. Os **4 órfãos** (ids 715, 716, 717, 718) serão **apagados**; o 719 fica.

> Antes de apagar, reconfirmar por consulta que os 4 seguem com zero solicitações — o estado
> pode ter mudado desde o levantamento.

#### D3 / D4 — Aprovação acima de R$ 50 mil

**Permissão exclusiva, sem bypass.** `contratos.aprovacao.aprovar` vale **inclusive para
SUPERADMIN e ADMINISTRADOR**: só aprova quem a tiver marcada.

> ⚠️ Isso **contraria o padrão do sistema**, onde esses perfis ignoram permissões por desenho
> (documentado no topo de `moduloPermissoes.js`). É exceção deliberada, restrita a esta ação.
> O teste de QA precisa provar que **um SUPERADMIN sem a permissão é barrado** — senão a
> exceção não existe na prática.

#### D7 — Contrato rejeitado

**Corrige e reenvia o mesmo contrato**, mantendo código e histórico da rejeição. Os títulos de
previsão vão para `EXCLUIDO` e são **regerados** na reaprovação.

#### D9 — Ordenação para a Gerência de Processos

**Status prioritário no topo:** solicitações em `NEC. DE MEDIÇÃO` sobem para o topo; dentro
delas, ordena por data. Não exige coluna nova.

#### D15 — Favorecido

**Reaproveita `parceiros`**, a mesma base do Credor. São 2.663 cadastros que já trazem
CPF/CNPJ, endereço e até três chaves PIX (`pix_chave_fixa_1`, `pix_chave_fixa_2`,
`pix_chave_variavel`) — exatamente o que um favorecido de pagamento precisa.

Consequência: o botão "buscar ou cadastrar" do wireframe é o mesmo componente do Credor, e não
haverá dois lugares para manter o mesmo CNPJ atualizado.

A tabela nova (M4) guarda apenas o **rateio**: solicitação/título → parceiro → valor, com a
validação de que a soma fecha com o total.

### Em aberto

Nenhuma decisão pendente bloqueando o fluxo de contratos.

Seguem em aberto, mas em outras frentes: D23–D27 (alertas de vencimento) e D28–D30 (RH/DP).

---

## Ordem sugerida de execução

1. **Tratar os bloqueios de dados** — os 6 códigos duplicados e, do escopo consolidado, as 10 linhas duplicadas de `TEMA_SISTEMA` (achado A1)
2. **Configuração antes de código** — NS-10 e NS-12 saem por configuração; entregam valor sem risco
3. **Estrutura de contratos** — M1, CT-4, CT-5, CT-6 (base para todo o resto)
4. **Geração de código** — D1, D2, M2, M3, CT-1
5. **Aprovação** — AP-1 a AP-6
6. **Títulos de previsão** — TP-1 a TP-8, com atenção especial a TP-5
7. **Reestruturação da tela Nova Solicitação** — NS-1 a NS-4

Cada etapa fecha com auditoria independente (`PROTOCOLO-QA.md`) e comparação contra o
baseline antes de seguir.

---

## Direção de perfis em produção (informado em 16/08)

O cliente vai **reduzir os perfis ADMIN a USUARIO** em produção, mantendo o controle por
**permissões granulares**. Alguns perfis específicos seguem como **SUPERADMIN**.

### Por que isso importa para o fluxo de contratos

O bypass de permissão (`isBusinessAdmin`) alcança SUPERADMIN e ADMINISTRADOR. Com a mudança:

- menos gente terá acesso amplo por perfil — o controle passa a ser a permissão granular
- **mas o SUPERADMIN mantém o bypass**, e alguns perfis continuarão nesse nível

Ou seja: a verificação **estrita** criada na etapa 4 (`userHasStrictAreaPermission`) não deixa
de ser necessária — ao contrário. É ela que garante que a aprovação de contrato acima de
R$ 50.000 exija a permissão marcada **inclusive de quem for SUPERADMIN**.

### A confirmar na etapa 5

O teste da etapa 4 mostrou que o perfil `ADMIN` **não** passa pelo bypass (só `SUPERADMIN`
passou), sugerindo que `isBusinessAdmin` reconhece `ADMINISTRADOR` e não `ADMIN`. Há **14
usuários ativos com perfil ADMIN**. Confirmar isso diz quem de fato tem acesso amplo hoje —
informação útil para a migração de perfis descrita acima.

---

## D38 (17/08) — CORREÇÃO DE DIREÇÃO: o fluxo novo vive DENTRO da Nova Solicitação

O cliente corrigiu meu desenho da etapa 8: os wireframes 1 e 2 **são a tela de Nova
Solicitação** com tipos diferentes (Contrato, Medição) — não telas separadas. A página
avulsa `/contratos/novo` e o link de menu foram **direção errada**; o link foi removido.

### O que muda

| Item | Situação |
|---|---|
| Link "Novo Contrato" no menu | **Removido** |
| Página `ContratoFluxoNovo.jsx` | Vira **fonte de lógica** para a integração (prévia, redistribuição, busca de credor, ações) — não é destino final |
| Backend (etapas 1–7, auditadas) | **Intacto** — nada muda; a integração consome os mesmos endpoints |

### Rota da integração (mapear ANTES de codar — regra do projeto)

1. **Mapear o padrão da Nova Solicitação**: como o `tipo_solicitacao` selecionado ativa campos
   (JSON `comportamento` com 16 flags), como `nova-solicitacao-campos` define
   exibição/obrigatoriedade, e como `automacao-destino` funciona — a tela já é dirigida por
   configuração, e a integração deve seguir esse padrão, não criar um paralelo
2. Criar os tipos do wireframe em `tipo_solicitacao` (CONTRATO com os 3 subtipos; ajustar
   MEDIÇÃO) com o `comportamento` adequado
3. Integrar os blocos do wireframe 1 na tela, condicionados ao tipo: parcelas com prévia e
   redistribuição, saldo em tempo real, categoria curada, apropriação
4. Wireframe 2 (Medição): bifurcação antigo/novo pelo `fluxo_novo` do contrato (MD-1..MD-5)
5. Auditoria cobrindo o caminho real do usuário na tela integrada

> Lição registrada: o mapa da etapa 8 justificou a tela separada como "zero risco ao
> legado" — mas otimizou contra o requisito. O wireframe mostrava a tela de Nova Solicitação;
> a pergunta certa era como integrar com segurança, não como evitar a integração.

### D38-a — Subtipos pelo padrão existente, NUNCA hardcode (orientação do cliente, 17/08)

Verificado no banco: o mecanismo já existe e está em uso.

| Peça | Como funciona |
|---|---|
| `tipo_solicitacao.comportamento` | `mostrar_subtipo`/`exige_subtipo` ligam o campo na tela (hoje só ADM LOCAL DE OBRA usa) |
| `tipos_sub_contrato` | Cadastro dos subtipos, com **`tipo_macro_id`** vinculando ao tipo macro |
| Tela `tipos-sub-contrato` | Onde o usuário cadastra/edita os subtipos |

**Aplicação ao wireframe 1:** o tipo CONTRATO liga `mostrar_subtipo`/`exige_subtipo` no
`comportamento`, e os três subtipos (Abertura de Contrato, Solicitação de Contrato, Aditivo
de Contrato) são **cadastrados** em `tipos_sub_contrato` vinculados ao macro — pela tela,
como qualquer outro. Nada de lista fixa no código: o comportamento do fluxo (abaixo/acima de
50 mil, aditivo) deriva do subtipo **selecionado**, identificado por vínculo, não por nome
hardcoded. Assim edições futuras de nome não quebram o fluxo, e a configuração fica
compatível com o que produção já pratica.

> Atenção herdada do achado A3 do escopo: `tipos_sub_contrato` tem duplicidades sujas
> ("DESPESAS COM VEICULOS" 3×, duas com tabulação). Limpar antes de cadastrar os novos.
