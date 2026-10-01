# PROMPT DE CONSTRUÇÃO — Módulo Custos e Recebíveis por Obra (Fluxy)

> Documento historico de construcao. O modulo ja esta implementado e este prompt nao
> define mais branch, fases nem comportamento vigente. Para manutencao, use
> `docs/modulos/custos-recebiveis/README.md` e o codigo atual.

> **Este arquivo é o prompt de execução.** Entregue-o inteiro ao agente responsável pela
> construção. Ele foi escrito para ser autossuficiente: um agente que abra o repositório
> sem histórico de conversa deve conseguir executar apenas com este documento mais os
> arquivos que ele referencia.

---

## 0. Como conduzir esta construção

1. **Leia `AGENTS.md` antes de qualquer alteração.** As regras dele prevalecem sobre
   qualquer preferência sua de estilo. Em especial: sistema em produção, evitar mudanças
   destrutivas, padrão visual corporativo denso (não landing page), idempotência
   obrigatória em operações críticas.
2. **Instrucao historica:** a construcao original previa branch propria a partir de
   `dev-v2`; nao reproduza esse fluxo no estado atual.
3. **Uma fase = um PR.** As fases estão na seção 14. Não inicie a fase seguinte antes de a
   anterior estar validada.
4. **Pare e pergunte** nos pontos listados na seção 17. Não decida por conta própria
   naquilo que está explicitamente marcado como decisão do negócio.
5. **Ao pausar um fluxo sensível não commitado**, crie/atualize
   `docs/handoffs/HANDOFF_CUSTOS_RECEBIVEIS_IMPLEMENTACAO.md` com arquivos alterados,
   validações executadas, riscos e próximo passo exato.
6. **Não confie neste documento contra o código.** Se algo aqui divergir do que está no
   repositório, o código é a verdade — relate a divergência antes de prosseguir.

---

## 1. Missão

Construir, dentro do Fluxy, o módulo **Custos e Recebíveis por Obra**: o planejamento
financeiro mensal de cada obra, comparado em tempo real com o que de fato aconteceu.

O módulo responde, por obra e por mês:

- Quanto planejamos **gastar** (custo previsto) e quanto **gastamos de verdade** (custo realizado)?
- Quanto planejamos **receber** e quanto **recebemos**?
  - Obra **pública**: recebível = medição (prevista e consolidada).
  - Obra **privada**: recebível = contratos de venda → parcelas → títulos a receber.
- O responsável pela obra cumpriu a obrigação mensal de registro?

### Critério de pronto (definition of done)

O módulo só é considerado 100% entregue quando **todos** os itens abaixo forem verdadeiros:

- [ ] Um único item "Custos e Recebíveis" no menu lateral, com as páginas em abas internas.
- [ ] Dashboard exibe custo realizado × planejado **por etapa**, no padrão visual dos cards
      *Comparativo Orçado vs Executado por Categoria* e *Status dos Itens Macro* de
      `frontend/src/pages/ObraGestao.jsx`.
- [ ] Usuário com pendência mensal é redirecionado após o login para a tela de
      planejamento, com ponto de partida que impede bloqueio retroativo indevido.
- [ ] Permissões do módulo aparecem na tela de permissões granulares existente
      (`/permissoes-areas`), sem tela de permissões própria.
- [ ] Planilha micro em tabelas próprias, versionada, sem tocar em `apropriacoes`.
- [ ] Jornadas pública e privada separadas e corretas, sem dupla contagem de recebível.
- [ ] Todos os testes de regressão da seção 15 passam.
- [ ] Com a flag do módulo desligada, o Fluxy se comporta exatamente como antes.

---

## 2. Leitura obrigatória antes de codar

### Documentos de negócio (contexto, não contrato)

| Arquivo | O que extrair |
|---|---|
| `docs/modulos/custos_recebiveis_plano_implantacao_e_operacao.md` | Mapa do que já existe e como reusar (A.2), decisão da planilha micro (A.3), manual de operação (Parte B) |
| `docs/modulos/custos_recebiveis_totalbank_plano.md` | Princípios do bloqueio (§3.8), trilhas por classificação (§9) |
| `docs/modulos/custos_recebiveis_matriz_fontes_permissoes.md` | Matriz campo a campo (§5), catálogo granular (§7), **§10 — o que NÃO reutilizar** |
| `docs/handoffs/HANDOFF_CUSTOS_RECEBIVEIS_MOCKUP_FINAL.md` | Inventário de telas aprovado |

### Referências visuais

| Arquivo | Papel |
|---|---|
| `.codex-previews/custos-recebiveis-fluxy-final.html` | **Mockup canônico.** Shell nativo do Fluxy, tokens reais, tema claro/escuro, público×privado, versionamento micro |
| Protótipo do cliente (`index.html`, anexo do PDF do diretor) | **Referência funcional superior** para: comparativo previsto×realizado por etapa, bloqueio por competência com liberação pelo ADM, medição consolidada |

> ⚠️ **Os dois mockups são complementares, não alternativos.** O mockup do codex tem o
> shell certo mas perdeu funcionalidades que o protótipo do cliente já implementava. As
> seções 10 e 11 deste prompt trazem a lógica do protótipo do cliente já traduzida — siga
> este documento, não o HTML.

### Código do Fluxy que você vai tocar ou imitar

| Arquivo | Por quê |
|---|---|
| `frontend/src/pages/ObraGestao.jsx` | Padrão de abas por query string (`TAB_DEFINITIONS` + `?aba=`) e os dois cards do dashboard a replicar |
| `backend/src/services/obraGestaoService.js` | Referência conceitual de agregação — **não reutilizar como contrato** (ver §3) |
| `backend/src/constants/moduloPermissoes.js` | Catálogo de permissões, onde entra o grupo novo |
| `frontend/src/layout/Layout.jsx` | Montagem do menu (`addGroup`) |
| `frontend/src/components/PrivateRoute.jsx` | Padrão de redirect forçado (`mfa_setup_pending`) |
| `backend/src/middlewares/requireMfaCompletion.js` | Padrão de guard equivalente no backend |
| `backend/src/services/moduleConfigService.js` | `MODULE_CATALOG` — é a feature flag |
| `backend/src/modules/fiscal/` | Estrutura de módulo backend a imitar (controllers, models, routes, services, validators) |
| `frontend/src/modules/sst/` | Estrutura de módulo frontend a imitar (pages, services, constants) |
| `backend/src/controllers/ApropriacaoController.js` | `importarXlsx` + `utils/excelWorkbook.js` |
| `backend/src/models/FinanceiroTituloImportacao*.js` | Padrão de importação robusta: prévia → confirmação transacional → idempotência |

---

## 3. Invariantes inegociáveis

Violar qualquer item abaixo invalida a entrega.

### 3.1 Não alterar

- Tabela **`apropriacoes`** e a importação atual de Obras. Nem coluna nova obrigatória,
  nem mudança de tipo, nem escrita pelo módulo novo. É **somente leitura**.
- Modelos `Obra`, `ContratoComercial`, `ContratoComercialParcela`, `TituloFinanceiro`,
  `MovimentoFinanceiro`, `UsuarioObra`, `User`: nenhuma coluna removida ou tornada
  obrigatória.
- Mecânica da tela de permissões granulares. Ela só ganha itens novos no catálogo.
- Fluxo Banco do Brasil e a importação em massa de títulos existente.
- Provisionamento, DRE, Resultado de Obras e Compras: comportamento idêntico antes e depois.

### 3.2 Não reutilizar como contrato (matriz §10)

- **`obraGestaoService.summarizeTitulosByBuckets`** agrupa custo pela `apropriacao_id` da
  *solicitação*, ignorando rateio. O módulo novo deve usar
  `TituloFinanceiroRateio` (`obra_id` + `apropriacao_id` + `valor_rateio`).
- **`ResultadoObrasController`** lista obras ativas sem aplicar escopo por usuário.
- **`userHasAllObrasAccess` / `SETORES_ACESSO_TODAS_OBRAS`**
  (`backend/src/services/authorizationService.js`) concede todas as obras por setor. O
  módulo novo **não herda esse atalho** — ver seção 7.
- **Fallback permissivo de permissões**: o padrão dominante no Fluxy é
  `if (hasConfiguredAreaPermissions(user)) { ... } return true;`. Isso libera acesso a quem
  não tem permissões configuradas. **Proibido neste módulo.** Use
  `hasAnyExplicitPermissao` (`frontend/src/utils/acessoProduto.js`), que nega por padrão.

### 3.3 Regras de negócio que não admitem exceção

1. **Realizado = baixa ativa.** Somente `MovimentoFinanceiro` com `status = 'ATIVO'`
   comprova caixa. Pedido, solicitação e título **nunca** viram realizado sozinhos.
   (O PDF do diretor diz "pedidos pagos"; a tradução correta no Fluxy é a baixa.)
2. **Permissão de ação nunca amplia escopo de obra.** São eixos independentes.
3. **Competência finalizada é imutável.** Correção só via reabertura auditada.
4. **Reimportação cria versão nova.** Nunca sobrescreve versão anterior nem altera
   competência já fechada.
5. **Auditoria é append-only.** Correção gera novo evento; nada é editado ou apagado.
6. **Valor nunca é descartado.** Gasto sem item micro correspondente vai para fila de
   não mapeados, não some.
7. **Falha de integração nunca bloqueia usuário.**
8. **Sem dupla contagem de recebível privado.** Se a parcela já virou título
   (`ContratoComercialParcela.titulo_financeiro_id` preenchido), o título manda e a
   parcela não soma.
9. **Estorno de baixa corrige o realizado sem apagar histórico.**

---

## 4. Decisões já tomadas — não reabrir

| Tema | Decisão |
|---|---|
| Onde o módulo mora | Módulo novo e independente. Lê o que existe, grava só em tabelas `cr_*` |
| Feature flag | Entrada em `MODULE_CATALOG` com `enabled: false`. **Não criar mecanismo novo de flag** |
| Planilha micro | Tabelas próprias versionadas. Não estender `apropriacoes` |
| Classificação da obra | Lida de `Obra.classificacao` (`PUBLICA`/`PRIVADA`), **read-only**. O seletor manual do mockup era artifício de demonstração |
| Cadastro de obra | Permanece no módulo Obras. O módulo novo não cria nem edita obra |
| Permissões | Grupo novo no catálogo existente. **Sem tela de permissões própria** |
| Menu | Um único item, páginas em abas |
| Contas Bancárias / TotalBank | **Fora do escopo desta entrega.** Fase posterior, módulo próprio |

---

## 5. Modelo de dados

Todas as tabelas com prefixo `cr_`. Migration em `backend/migrations/` seguindo a
convenção `AAAAMMDDNNNN_descricao.js`, executada por `npm run migrate` no backend.
Models em `backend/src/modules/custosRecebiveis/models/`, registrados em
`backend/src/models/index.js` no bloco de módulos (padrão das linhas `db.Fiscal*`).

### 5.1 Estrutura orçamentária (micro)

| Tabela | Campos essenciais |
|---|---|
| `cr_planos_obra` | `obra_id`, `versao` (int), `situacao` (`RASCUNHO`/`PUBLICADA`/`SUBSTITUIDA`), `motivo_versao`, `total_micro`, `divergencia_macro_pct`, `publicado_por`, `publicado_em` |
| `cr_plano_itens` | `plano_id`, `codigo`, `descricao`, `unidade`, `quantidade`, `custo_unitario`, `valor_total`, `etapa_macro_codigo`, `item_pai_id`, `somadora` (bool), `ordem` |
| `cr_plano_macro_vinculos` | `plano_item_id`, `apropriacao_id` (FK lógica, **leitura**), `observacao` |
| `cr_importacoes` | `obra_id`, `plano_id`, `arquivo_nome`, `arquivo_hash`, `linhas_total`, `linhas_validas`, `linhas_rejeitadas`, `resultado_json`, `usuario_id` |

> `arquivo_hash` é a chave de idempotência da importação. Reenvio do mesmo arquivo para a
> mesma obra não pode gerar versão duplicada.

### 5.2 Ciclo mensal

| Tabela | Campos essenciais |
|---|---|
| `cr_competencias` | `obra_id`, `competencia` (`AAAA-MM`), `estado` (`ABERTA`/`EM_PREENCHIMENTO`/`FINALIZADA`/`REABERTA`), `plano_versao_snapshot`, `finalizado_por`, `finalizado_em`, `total_custo_previsto`, `total_receita_prevista` — **UNIQUE (`obra_id`, `competencia`)** |
| `cr_previsoes_custo` | `competencia_id`, `plano_item_id`, `etapa_macro_codigo`, `quantidade`, `custo_unitario`, `valor_previsto`, `parceiro_id` (opcional) |
| `cr_previsoes_receita` | `competencia_id`, `origem` (`MEDICAO`/`CONTRATO`), `plano_item_id` (público), `contrato_parcela_id` (privado), `titulo_financeiro_id` (privado), `quantidade_prevista`, `valor_previsto`, `data_prevista` |
| `cr_medicoes_consolidadas` | `competencia_id`, `plano_item_id`, `quantidade_medida`, `valor_medido`, `data_medicao`, `numero_medicao`, `registrado_por` — **só obra pública** |
| `cr_realizados` | `competencia_id`, `obra_id`, `etapa_macro_codigo`, `plano_item_id` (nullable), `titulo_financeiro_id`, `movimento_financeiro_id`, `valor`, `estado` (`COMPROMETIDO`/`INCORRIDO`/`BAIXA_ATIVA`/`NAO_MAPEADO`), `processado_em` — **UNIQUE (`movimento_financeiro_id`, `plano_item_id`)** para idempotência |

### 5.3 Governança

| Tabela | Campos essenciais |
|---|---|
| `cr_responsaveis_obra` | `obra_id`, `user_id`, `papel` (`RESPONSAVEL`/`SUBSTITUTO`), `competencia_inicial` (`AAAA-MM`), `vigencia_inicio`, `vigencia_fim`, `ativo` |
| `cr_obrigacoes_usuario` | `user_id`, `obra_id`, `competencia`, `tipo` (`CUSTO_PREVISTO`/`RECEITA_PREVISTA`/`MEDICAO_CONSOLIDADA`), `prazo_em`, `situacao` (`PENDENTE`/`CUMPRIDA`/`VENCIDA`/`DISPENSADA`), `cumprida_em` |
| `cr_reaberturas` | `competencia_id`, `solicitado_por`, `motivo`, `situacao` (`SOLICITADA`/`APROVADA`/`NEGADA`), `aprovado_por`, `aprovado_em`, `expira_em` |
| `cr_guard_bypass` | `user_id`, `obra_id` (nullable = todas as obras do usuário), `motivo`, `concedido_por`, `concedido_em`, `expira_em`, `revogado_por`, `revogado_em` |
| `cr_auditoria` | `obra_id`, `competencia_id`, `usuario_id`, `evento` (ex.: `planejamento.finalizar`), `descricao`, `payload_json`, `origem` (`web`/`job`), `criado_em` — **append-only, sem UPDATE nem DELETE** |

> **`cr_reaberturas` e `cr_guard_bypass` resolvem problemas diferentes e não se substituem.**
> A reabertura destrava **a competência** (o dado volta a aceitar edição). O bypass destrava
> **a pessoa** (o usuário entra no sistema sem ter cumprido a pendência, que continua
> pendente). Ver seções 11.5 e 11.6.

> `cr_responsaveis_obra.competencia_inicial` é o **ponto de partida** e é o campo que
> impede bloqueio retroativo. Ver seção 11.

---

## 6. Permissões granulares

Acrescente **um objeto** ao array `MODULO_PERMISSION_GROUPS` em
`backend/src/constants/moduloPermissoes.js`. O catálogo é data-driven: o grupo aparece
sozinho em `/permissoes-areas` (por usuário) e em `/permissoes-areas-padroes` (por
setor/perfil). **Nenhum código de UI de permissões deve ser escrito.**

```
modulo: 'CUSTOS_RECEBIVEIS'
label:  'Custos e Recebíveis'
```

| Área | Permissões |
|---|---|
| `custos_recebiveis.acesso` | `modulo.acessar`, `escopo.todas_obras` |
| `custos_recebiveis.visualizacao` | `dashboard.visualizar`, `comparativo.visualizar`, `obras.visualizar`, `estrutura_micro.visualizar`, `planejamento.visualizar`, `medicao.visualizar`, `realizados.visualizar`, `obrigacoes.visualizar`, `auditoria.visualizar` |
| `custos_recebiveis.estrutura` | `estrutura_micro.importar`, `estrutura_micro.publicar_versao` |
| `custos_recebiveis.planejamento` | `planejamento.preencher_custos`, `planejamento.preencher_recebiveis`, `planejamento.finalizar` |
| `custos_recebiveis.medicao` | `medicao.consolidar` |
| `custos_recebiveis.realizados` | `realizados.atualizar`, `realizados.reconciliar` |
| `custos_recebiveis.governanca` | `reabertura.solicitar`, `reabertura.aprovar`, `obrigacoes.conceder_bypass`, `configuracoes.gerenciar` |
| `custos_recebiveis.saida` | `relatorio.exportar` |

Regras:

- `escopo.todas_obras` é **permissão de escopo**, independente de qualquer permissão de
  ação. Pertencer ao setor Financeiro ou Diretoria não concede escopo amplo.
- Toda rota de backend valida **permissão de ação E escopo de obra**, nessa ordem, sempre
  no servidor. Validação de frontend é conveniência, nunca segurança.
- Helper de frontend: `hasAnyExplicitPermissao(user, [...])`. Nunca o fallback permissivo.

---

## 7. Escopo de obra — algoritmo obrigatório

Implemente um resolver **próprio** em
`backend/src/modules/custosRecebiveis/policies/obraScopePolicy.js`. Não chame
`getUserObraScopeIds` nem `userHasAllObrasAccess` do `authorizationService`.

```
resolverEscopo(user):
  1. se user.perfil === 'SUPERADMIN'         -> TODAS
  2. se tem 'custos_recebiveis.escopo.todas_obras' -> TODAS
  3. senão                                    -> UsuarioObra.findAll({ user_id })
     (nenhum fallback por setor, cargo, perfil ou configuração legada)
```

Comportamento esperado:

- Obra fora do escopo **não aparece** em listas, dashboards, exportações ou totalizadores.
- Acesso por URL direta a obra fora do escopo retorna **403**, com evento de segurança
  registrado (padrão `registrarEventoSeguranca`).
- Exportar **não amplia** visibilidade: o exportador usa o mesmo resolver.

---

## 8. Navegação

### 8.1 Menu

Em `frontend/src/layout/Layout.jsx`, **um único grupo com um único item**:

```js
if (custosRecebiveisAccess) {
  addGroup('Custos e Recebíveis', [
    item('/custos-recebiveis', 'Custos e Recebíveis', HiOutlineBanknotes)
  ]);
}
```

`custosRecebiveisAccess` = módulo habilitado **E** `custos_recebiveis.modulo.acessar`
explícito (ou SUPERADMIN).

### 8.2 Abas internas

Uma única rota, abas em query string, exatamente no padrão de
`frontend/src/pages/ObraGestao.jsx` (`TAB_DEFINITIONS` + `useSearchParams` + `?aba=`):

| Aba | `id` | Permissão |
|---|---|---|
| Dashboard | `dashboard` | `dashboard.visualizar` |
| Obras | `obras` | `obras.visualizar` |
| Planejamento | `planejamento` | `planejamento.visualizar` |
| Comparativo | `comparativo` | `comparativo.visualizar` |
| Custo realizado | `realizado` | `realizados.visualizar` |
| Obrigações | `obrigacoes` | `obrigacoes.visualizar` |
| Importações | `importacoes` | `estrutura_micro.visualizar` |
| Exportações | `exportacoes` | `relatorio.exportar` |

Regras:

- Aba sem permissão **não é renderizada** (não renderizar desabilitada).
- Deep-link (`/custos-recebiveis?aba=comparativo&obra=12&competencia=2026-07`) funciona e
  sobrevive a refresh.
- Aba inválida ou sem permissão cai na primeira aba permitida.
- Contexto (obra + competência) fica em barra fixa no topo, compartilhado por todas as abas.
- **Não criar sidebar própria do módulo.** O mockup do codex tem 10 itens de sidebar —
  isso está descartado.

### 8.3 Workspace da obra

Ao abrir uma obra a partir da aba Obras, use **sub-abas** dentro da mesma rota
(`?aba=obras&obra=12&sub=estrutura`): `Estrutura micro`, `Histórico mensal`,
`Medição consolidada` (só pública), `Auditoria`.

---

## 9. Telas e regras

### 9.1 Dashboard

**KPIs (linha superior, componente `app-summary-card` já existente):** obras no escopo,
obrigações pendentes, custo previsto da competência, receita prevista (rótulo muda por
classificação: "Medição prevista" / "Recebíveis previstos"), comprometido, incorrido,
realizado.

**Card 1 — Comparativo Previsto vs Realizado por Etapa.**
Replica o visual de `ObraGestao.jsx:311-343`: por etapa macro, duas barras empilhadas
(previsto esmaecido em cima, realizado em gradiente azul embaixo), normalizadas por
`max(previsto, realizado)`, com os valores em texto à direita.
**Diferença essencial:** o eixo é a **competência selecionada**, não o acumulado da obra.

**Card 2 — Status das Etapas.**
Replica `ObraGestao.jsx:345-370`: um bloco por etapa com `Prev:` / `Real:`, percentual de
execução (`realizado / previsto × 100`) e barra de progresso.

Ambos os cards usam a classificação de estado da seção 10.3 para colorir.

**Demais blocos:** alertas de prazo (D-7/D-3/D-1/vencido) e lista de obras pendentes no
escopo, com ação "Registrar agora".

> Densidade: siga `AGENTS.md` — corporativo, compacto, escaneável. Não transformar o
> dashboard em grid de cards decorativos.

### 9.2 Obras

Lista das obras **no escopo**, com código, nome, empresa, classificação (pill
Pública/Privada), cidade, responsável, estado da competência e ação "Abrir".
Cadastro e edição **não existem aqui** — botão "Nova obra" leva ao módulo Obras.
Obra fora do escopo simplesmente não aparece (não exibir esmaecida como no mockup: isso
vaza a existência da obra).

### 9.3 Planejamento mensal (assistente de 3 etapas)

**Etapa 1 — Recebimentos**, muda conforme `Obra.classificacao`:

- **PÚBLICA — Medição prevista:** linhas vindas da versão micro publicada. Usuário informa
  quantidade prevista; sistema calcula valor (`quantidade × custo_unitario`). Campo de
  data prevista.
- **PRIVADA — Recebíveis por contrato:** sistema traz as parcelas dos contratos de venda
  da obra com vencimento na competência. Usuário **confere e confirma**, não digita
  contrato. Exibir origem de cada linha: `Título a receber` ou `Parcela contratual`.
  **Anti-dupla contagem:** parcela com `titulo_financeiro_id` preenchido soma como
  título; a parcela não soma de novo.

**Etapa 2 — Custos** (comum às duas classificações): quantidade e custo unitário previstos
por item micro, agrupados por etapa macro. Permite adicionar subitem. Parceiro opcional.

**Etapa 3 — Revisão:** totais de receita prevista, custo previsto e margem. Botão
**Finalizar competência**.

Regras:

- **Salvar rascunho** a qualquer momento, sem validação de completude. Estado
  `EM_PREENCHIMENTO`.
- **Finalizar** grava snapshot imutável (versão do plano, códigos, quantidades e valores
  congelados), muda estado para `FINALIZADA` e registra auditoria.
- **Finalização é idempotente**: duplo clique ou reenvio não cria segunda competência.
  Botão bloqueado no frontend + chave de idempotência + transação no banco (`AGENTS.md`).
- Competência `FINALIZADA` é somente leitura. Edição exige reabertura aprovada.
- Não é possível planejar competência sem versão micro publicada — bloquear com mensagem
  clara e link para Importações.

### 9.4 Medição consolidada (somente obra pública)

Tela para o fiscal/engenheiro registrar **o que o órgão de fato mediu**: por item micro,
quantidade medida, valor medido, data e número da medição.
É isso que passa a contar como **recebível realizado** na obra pública.
Exige `medicao.consolidar`. Registrar em auditoria.

### 9.5 Comparativo

Tabela por etapa macro: previsto, realizado, desvio absoluto, desvio percentual e estado
com cor. Base selecionável: *Medição prevista* ou *Realizado consolidado*.
Totalizador com contagem de estouros. Exportável em CSV/XLSX.

### 9.6 Custo realizado

Lista a cadeia **solicitação → pedido → título → baixa**, com parceiro, valor, estado e
item micro vinculado.

- Estados: `Comprometido` (pedido), `Incorrido` (título sem baixa), `Baixa ativa`
  (realizado), `Não mapeado`.
- Botão **Atualizar realizações**: reprocessa de forma **idempotente**. Não cria baixa,
  não altera título, não altera pedido.
- **Não mapeado** abre fila de reconciliação: usuário liga o gasto ao item micro correto.
  O valor permanece visível e somado ao total da obra enquanto não for reconciliado —
  nunca é descartado nem escondido.

### 9.7 Obrigações e prazos

"Minhas pendências" (obra, obrigação, prazo, situação) + contagem regressiva.
Alertas D-7, D-3, D-1 e vencido. **Prazo usa horário do servidor, nunca do navegador.**
Clicar na pendência leva à tela que a resolve (normalmente Planejamento).

A tela expõe **dois mecanismos distintos**, que não podem ser apresentados como se fossem
o mesmo:

- **Solicitar abertura de mês vencido** — ação do responsável da obra. Destrava a
  competência para registro em atraso. É o fluxo normal, previsto no dia a dia.
- **Conceder bypass** — ação administrativa (`obrigacoes.conceder_bypass`), visível apenas
  para quem tem a permissão. Suspende o bloqueio de **um usuário**, sem dar a obrigação
  por cumprida. É exceção, não rotina.

Painel de bypass ativos, com usuário, motivo, quem concedeu, expiração e ação de revogar.

### 9.8 Importações

Versões da planilha micro da obra: versão, data, usuário, situação, linhas totais/válidas/rejeitadas.
Fluxo: baixar modelo `.xlsx` → preencher → **Validar** (prévia com erros por linha) →
**Importar** (cria versão em `RASCUNHO`) → **Publicar versão** (permissão separada).

- Reimportação exige **motivo da versão**.
- Totais, normalização de códigos e vínculo macro/micro são **recalculados no backend**.
  Nunca confiar em valor vindo do frontend.
- Publicar nova versão **não altera** competência já finalizada.
- Divergência macro↔micro é **exibida**, e acima da tolerância exige justificativa para
  publicar (tolerância: ver seção 16).

### 9.9 Exportações

Relatórios independentes: Medição/recebíveis, Custos previstos, Comparativo, Custo
realizado, Solicitações e títulos, Resumo executivo. CSV e XLSX (`utils/excelWorkbook.js`).
Todo exportador aplica o mesmo resolver de escopo da seção 7.

---

## 10. Motor de cálculo

### 10.1 Camadas de valor

| Camada | Fonte | Regra |
|---|---|---|
| **Previsto** | `cr_previsoes_custo` / `cr_previsoes_receita` | O que foi planejado na competência |
| **Comprometido** | `PedidoCompra` da obra | Pedido fechado, ainda não faturado |
| **Incorrido** | `TituloFinanceiro` (`tipo = PAGAR`) sem baixa total | Já virou conta |
| **Realizado** | `MovimentoFinanceiro` (`status = 'ATIVO'`) | **Única** prova de caixa |

### 10.2 Atribuição do realizado à etapa

Ordem de resolução, parando no primeiro que resolver:

```
1. TituloFinanceiroRateio (obra_id + apropriacao_id + valor_rateio)  ← preferencial, respeita rateio
2. TituloFinanceiro.apropriacao_id
3. SolicitacaoApropriacao (rateio da solicitação de origem)
4. Solicitacao.apropriacao_id
5. nenhum  -> estado NAO_MAPEADO (valor preservado, fila de reconciliação)
```

- Competência do realizado = **mês da data do movimento** (data do pagamento), não a do título.
- Idempotência: a chave é `(movimento_financeiro_id, plano_item_id)`. Reprocessar mil
  vezes produz o mesmo resultado.
- Estorno: movimento que sai de `ATIVO` reduz o realizado **gerando registro de correção**,
  sem apagar o anterior.

### 10.3 Classificação previsto × realizado por etapa

Cinco estados (traduzidos do protótipo do cliente, função `custoPrevVsReal`):

| Condição | Estado | Rótulo | Cor |
|---|---|---|---|
| previsto = 0 e realizado = 0 | `NEUTRO` | Sem custo no período | neutra |
| previsto = 0 e realizado > 0 | `SEM_PREVISAO` | Realizado sem previsão | vermelha |
| realizado = 0 e previsto > 0 | `A_REALIZAR` | Previsto ainda não realizado | atenção |
| realizado ≤ previsto | `DENTRO` | Dentro do previsto | azul/positiva |
| realizado > previsto | `ESTOURO` | Estouro do previsto | vermelha |

Cada linha retorna: `etapa`, `previsto`, `realizado`, `delta` (realizado − previsto),
`pct`, `estado`, `motivo`. O totalizador inclui a contagem de estouros.

> Use os tokens de cor já existentes em `frontend/src/index.css`
> (`--num-pos`, `--num-neg`, `--num-warn`, `--num-info`). Não introduzir paleta nova.

### 10.4 Recebível por classificação

| | Pública | Privada |
|---|---|---|
| Previsto | Medição prevista por item micro | Parcelas de contrato de venda com vencimento na competência |
| Realizado | `cr_medicoes_consolidadas` | Baixa de `TituloFinanceiro` (`tipo = RECEBER`) |
| Dupla contagem | n/a | Parcela com `titulo_financeiro_id` → conta o título, não a parcela |

---

## 11. Bloqueio pós-login

> Esta é a funcionalidade de maior risco operacional da entrega. Um erro aqui trava
> usuários legítimos fora do sistema. Implemente com kill-switch.

### 11.1 Ponto de partida (impede bloqueio retroativo)

Regra derivada do protótipo do cliente (`regInfoObra`), onde
`start = primeiro mês com registro, senão mês corrente`:

```
competenciaInicial(obra, user) =
  cr_responsaveis_obra.competencia_inicial
  ?? primeira competência registrada da obra em cr_competencias
  ?? mês corrente
```

Nenhuma competência anterior a `competenciaInicial` gera pendência, **em hipótese alguma**.
No cadastro do responsável, `competencia_inicial` tem como padrão o mês corrente.

### 11.2 Quando existe pendência

Percorra as competências de `competenciaInicial` até o mês corrente. Para cada uma:

| Situação | Resultado |
|---|---|
| Competência finalizada | sem pendência |
| Competência é o mês corrente e não finalizada | **pendência corrente** (dentro do prazo) |
| Competência vencida, com reabertura/liberação aprovada | **pendência liberada** (deve registrar) |
| Competência vencida, sem liberação | **bloqueada** — exige solicitação de abertura ao ADM |

Nunca gera pendência quando: obra inativa/encerrada, obra sem responsável, obra sem versão
micro publicada, ou usuário sem vínculo com a obra.

> ⚠️ **Bypass não entra nesta lista.** Bypass vigente **não apaga a pendência** — ela
> continua existindo, contada e visível no painel de obrigações. O bypass age apenas no
> guard (seção 11.3), liberando o acesso do usuário. Implementar bypass como supressão de
> pendência esconde o débito operacional e é considerado erro de implementação.

### 11.3 Mecânica do guard

Espelhe o padrão de `mfa_setup_pending`, que já está em produção:

1. **Backend calcula** a pendência e devolve no payload de autenticação
   (`backend/src/controllers/AuthController.js`, mesmo ponto onde entra
   `mfa_setup_pending`): `custos_recebiveis_pendencia: { bloqueado, obra_id, competencia, motivo }`.
2. **Frontend redireciona** em `frontend/src/components/PrivateRoute.jsx`, seguindo a
   forma existente:

```js
if (user?.custos_recebiveis_pendencia?.bloqueado && !ROTAS_LIBERADAS.includes(location.pathname)) {
  return <Navigate to="/custos-recebiveis?aba=planejamento&bloqueio=1" replace />;
}
```

3. **Backend reforça** com middleware equivalente a `requireMfaCompletion.js`, retornando
   **403** com código funcional `MONTHLY_REQUIREMENT_PENDING`. Guard de frontend sozinho
   é contornável e não é aceito como implementação.

**Rotas sempre liberadas mesmo bloqueado:** a própria tela de planejamento, `/perfil`,
logout, ajuda/suporte, e os endpoints necessários para cumprir a pendência.

**Nunca bloqueado:** SUPERADMIN; usuário sem obra sob responsabilidade; usuário com bypass
vigente e não expirado (seção 11.6).

Ordem de avaliação do guard, obrigatoriamente nesta sequência:

```
1. CR_GUARD_MODE === 'observe'        -> não bloqueia (calcula e alerta apenas)
2. perfil === 'SUPERADMIN'            -> não bloqueia
3. bypass vigente para o usuário      -> não bloqueia (pendência permanece registrada)
4. rota está na lista de liberadas    -> não bloqueia
5. existe pendência                   -> BLOQUEIA
```

### 11.4 Kill-switch obrigatório

Configuração `CR_GUARD_MODE` com dois valores:

- `observe` — pendências são calculadas, alertas aparecem, **ninguém é redirecionado**;
- `enforce` — redirecionamento ativo.

Entregue com `observe` como padrão e a virada para `enforce` como ato explícito do
administrador. Se o cálculo produzir falso positivo em produção, o administrador desliga
a trava sem derrubar o módulo.

### 11.5 Reabertura — destrava a COMPETÊNCIA

Fluxo do protótipo do cliente (`openReqs` → `admOpened`) e do PDF do diretor ("Abertura
pelo ADM"), persistido em `cr_reaberturas`. É o fluxo **normal** de correção.

1. Engenheiro **solicita abertura** do mês vencido ou finalizado, com motivo
   (`reabertura.solicitar`).
2. ADM **aprova ou nega** (`reabertura.aprovar`).
3. Aprovado: aquela competência sai do estado imutável e aceita registro/edição em atraso,
   até `expira_em`.
4. Tudo auditado: quem pediu, quando, motivo, quem aprovou, quando expira.

Características:

- Alvo é **uma competência de uma obra**, não uma pessoa. Qualquer usuário com permissão
  de preencher aquela obra passa a poder registrar.
- A pendência é **efetivamente cumprida** quando o registro é feito.
- Snapshot da versão anterior é preservado. Reabrir nunca apaga o que já estava gravado.

### 11.6 Bypass — destrava a PESSOA

Persistido em `cr_guard_bypass`. É **exceção administrativa**, não faz parte da rotina.

O bypass existe para o caso em que o bloqueio está **errado ou é injusto**, e a pessoa
precisa trabalhar no Fluxy enquanto a situação é resolvida. Situações previstas:

| Situação | Por que o bypass, e não a reabertura |
|---|---|
| Responsável de férias/licença, substituto ainda não cadastrado | Não há o que registrar; a pessoa só precisa acessar o sistema |
| Troca de responsável no meio do mês | O novo responsável herdou pendência que não é dele |
| Obra com dado inconsistente (tem responsável, não tem versão micro publicada) | O bloqueio é efeito de cadastro incompleto, não de omissão |
| **Falso positivo no cálculo de pendência** | Caso mais provável nas primeiras semanas de `enforce` |
| Diretoria/auditoria precisando acessar durante o período de bloqueio | Não são responsáveis por registro |

Regras:

- Exige `obrigacoes.conceder_bypass`. **Ninguém concede bypass para si mesmo** — validar no
  backend que `concedido_por !== user_id`.
- Justificativa **obrigatória** e `expira_em` **obrigatório**. Bypass sem expiração é
  proibido, mesmo que solicitado.
- **Não marca a obrigação como cumprida.** A pendência continua listada, contada e visível.
- Pode ser revogado antes da expiração.
- Concessão, expiração e revogação geram evento em `cr_auditoria`.

> **Sinal de alerta operacional:** se o mesmo usuário recebe bypass em meses consecutivos,
> o problema está na regra de bloqueio ou no cadastro da obra, não no usuário. O painel de
> obrigações deve tornar isso visível.

### 11.7 Qual mecanismo usar

| Pergunta | Resposta |
|---|---|
| O mês fechou e preciso lançar/corrigir os dados | **Reabertura** |
| Estou travado no login e não deveria estar | **Bypass** |
| Estou travado no login e realmente devo o registro | **Nem um nem outro** — registre a competência |
| O cálculo de pendência está errado para muita gente | **`CR_GUARD_MODE = observe`** (seção 11.4), não bypass em massa |

---

## 12. Importação da planilha micro

Reaproveite `utils/excelWorkbook.js` e o padrão de `FinanceiroTituloImportacao*`.

**Etapa 1 — Validação (não grava plano):** lê o arquivo, normaliza códigos, valida
obrigatórios, tipos numéricos, hierarquia (item filho referencia pai existente) e
duplicidade de código. Devolve prévia com total de linhas, válidas, rejeitadas e o erro
de cada linha rejeitada.

**Etapa 2 — Importação (transacional):** cria `cr_planos_obra` em `RASCUNHO` + itens +
vínculos macro, dentro de uma transação. Idempotente por `arquivo_hash` + `obra_id`.

**Etapa 3 — Publicação:** muda situação para `PUBLICADA` e a anterior para `SUBSTITUIDA`.
Permissão separada da importação. Não altera competência finalizada.

**Modelo `.xlsx`** gerado pelo backend, colunas: `codigo`, `descricao`, `unidade`,
`quantidade`, `custo_unitario`, `etapa_macro_codigo`, `codigo_pai`.

---

## 13. Contratos de API

Prefixo `/custos-recebiveis`, montado em `backend/src/routes.js` no padrão dos módulos
existentes (`router.use('/custos-recebiveis', custosRecebiveisRoutes)`).
**Toda rota** passa por: autenticação → `requireEnabledModule('CUSTOS_RECEBIVEIS')` →
permissão de ação → escopo de obra.

| Método | Rota | Permissão |
|---|---|---|
| GET | `/dashboard?competencia=` | `dashboard.visualizar` |
| GET | `/obras` | `obras.visualizar` |
| GET | `/obras/:obraId/plano` | `estrutura_micro.visualizar` |
| POST | `/obras/:obraId/plano/importar/validar` | `estrutura_micro.importar` |
| POST | `/obras/:obraId/plano/importar` | `estrutura_micro.importar` |
| POST | `/planos/:planoId/publicar` | `estrutura_micro.publicar_versao` |
| GET | `/obras/:obraId/competencias/:competencia` | `planejamento.visualizar` |
| PUT | `/obras/:obraId/competencias/:competencia/custos` | `planejamento.preencher_custos` |
| PUT | `/obras/:obraId/competencias/:competencia/receitas` | `planejamento.preencher_recebiveis` |
| POST | `/obras/:obraId/competencias/:competencia/finalizar` | `planejamento.finalizar` |
| POST | `/obras/:obraId/competencias/:competencia/medicao` | `medicao.consolidar` |
| GET | `/obras/:obraId/comparativo?competencia=&base=` | `comparativo.visualizar` |
| GET | `/obras/:obraId/realizados?competencia=` | `realizados.visualizar` |
| POST | `/obras/:obraId/realizados/reprocessar` | `realizados.atualizar` |
| POST | `/realizados/:id/reconciliar` | `realizados.reconciliar` |
| GET | `/obrigacoes/minhas` | `obrigacoes.visualizar` |
| POST | `/competencias/:id/reabertura` | `reabertura.solicitar` |
| POST | `/reaberturas/:id/aprovar` | `reabertura.aprovar` |
| GET | `/obrigacoes/bypass` | `obrigacoes.conceder_bypass` |
| POST | `/obrigacoes/bypass` | `obrigacoes.conceder_bypass` |
| DELETE | `/obrigacoes/bypass/:id` | `obrigacoes.conceder_bypass` |
| GET | `/exportacoes/:tipo` | `relatorio.exportar` |
| GET | `/obras/:obraId/auditoria` | `auditoria.visualizar` |

Padrões obrigatórios:

- Mutações relevantes aceitam **chave de idempotência** e são **transacionais**.
- Erros de negócio retornam código funcional (ex.: `MONTHLY_REQUIREMENT_PENDING`,
  `COMPETENCIA_FINALIZADA`, `PLANO_NAO_PUBLICADO`, `FORA_DE_ESCOPO`), não só mensagem.
- Toda mutação grava evento em `cr_auditoria`.

---

## 14. Fases e critérios de aceite

> Uma fase por PR. Não avance sem o aceite da anterior.

### Fase 0 — Fundação (invisível ao usuário)
Entrada em `MODULE_CATALOG` (`enabled: false`, `requiresAll: ['OBRAS','FINANCEIRO']`);
grupo de permissões; migrations `cr_*`; models registrados; esqueleto
`backend/src/modules/custosRecebiveis/`; policy de escopo.
**Aceite:** flag desligada → Fluxy idêntico. Nenhum item de menu. Migrations sobem e
descem sem perda. Permissões aparecem em `/permissoes-areas`.

### Fase 1 — Leitura e planilha micro
Aba Obras com escopo; workspace de estrutura micro; importação → validação → versão →
publicação; vínculo read-only ao macro.
**Aceite:** importar e publicar não altera uma linha de `apropriacoes`; reimportar cria
versão nova; obra fora do escopo dá 403 por URL direta.

### Fase 2 — Planejamento, medição e dashboard
Assistente de 3 etapas (pública e privada); medição consolidada; **os dois cards do
dashboard**; comparativo com os 5 estados; reabertura.
**Aceite:** os cards do dashboard são visualmente equivalentes aos de `ObraGestao.jsx`;
competência finalizada é imutável; duplo clique em Finalizar não duplica; obra privada não
pede medição; recebível privado não conta parcela e título ao mesmo tempo.

### Fase 3 — Realizado
Projetor idempotente com resolução de rateio; fila de não mapeados; reconciliação;
exportações.
**Aceite:** reprocessar N vezes não altera totais; pedido/solicitação não viram realizado;
estorno corrige sem apagar histórico; não mapeado nunca some.

### Fase 4 — Obrigações e bloqueio
Cálculo de pendências com ponto de partida; alertas D-7/D-3/D-1/vencido; guard
frontend + backend; `CR_GUARD_MODE`; **reabertura de competência (§11.5)** e
**bypass de usuário (§11.6)** como fluxos separados e auditados.
**Aceite:** em `observe` ninguém é redirecionado; em `enforce` só quem tem pendência
legítima é; obra nova não gera pendência retroativa; SUPERADMIN nunca preso; guard de
backend impede contorno por chamada direta à API; **bypass libera o acesso sem apagar a
pendência do painel**; **reabertura destrava a competência para qualquer usuário
autorizado daquela obra, não só para quem pediu**; ninguém concede bypass para si mesmo;
bypass sem `expira_em` é rejeitado pelo backend.

---

## 15. Testes de regressão obrigatórios

Executar **antes de cada PR**, não só no final:

- [ ] Provisionamento, Obras, DRE, Resultado de Obras e Compras: resultados idênticos antes/depois.
- [ ] `apropriacoes` sem alteração de schema ou de dados após importar/publicar plano micro.
- [ ] Relatórios macro (Resultado de Obras, DRE) com números idênticos.
- [ ] Usuário com permissão de editar **não** enxerga obra sem vínculo — testado por **URL direta**.
- [ ] Pedido e solicitação não viram realizado.
- [ ] Estorno de baixa corrige o realizado sem apagar histórico.
- [ ] Reimportação não altera competência fechada.
- [ ] Exportações respeitam empresa, obra e permissão.
- [ ] Flag desligada: Fluxy idêntico, sem menu, endpoints em 403.
- [ ] Fluxo Banco do Brasil e importação em massa de títulos intactos.
- [ ] Login de usuário sem obra sob responsabilidade não sofre redirecionamento.

---

## 16. Decisões do negócio — defaults assumidos

Estas decisões **não estão fechadas**. Implemente com o default abaixo, deixe
**parametrizável** e sinalize no PR. Não invente regra fora desta lista.

| # | Questão | Default a implementar |
|---|---|---|
| 1 | O que é obrigatório para liberar o acesso | Custo previsto **e** receita prevista da competência |
| 2 | Ciclo exigido | Mês corrente; mês seguinte quando configurado |
| 3 | Prazo | Último dia do mês, 18h, horário do servidor; fim de semana/feriado antecipa para o dia útil anterior |
| 4 | Quem é bloqueado | Apenas `RESPONSAVEL` e `SUBSTITUTO` de obra ativa |
| 5 | Obra sem movimento | Aceita declaração de ausência com justificativa obrigatória |
| 6 | Quem publica versão micro | `estrutura_micro.publicar_versao`, separado de importar |
| 7 | Tolerância macro↔micro | 5%; acima disso, publicar exige justificativa |
| 8 | Duração do bypass (§11.6 — exceção administrativa, **não** confundir com reabertura §11.5) | Máximo 30 dias, expiração obrigatória, sem autoconcessão |
| 9 | Realizado oficial | Baixa ativa (não negociável — ver §3.3) |
| 10 | Saldo bancário no módulo | Fora do escopo desta entrega |

---

## 17. Pontos de parada obrigatórios

Pare e peça confirmação explícita antes de:

1. Executar migrations em qualquer ambiente compartilhado.
2. Virar `CR_GUARD_MODE` para `enforce`.
3. Habilitar o módulo em `MODULE_CATALOG` para a instalação.
4. Qualquer alteração em arquivo fora de `modules/custosRecebiveis/` que não seja um dos
   pontos de integração previstos: `moduloPermissoes.js`, `moduleConfigService.js`,
   `models/index.js`, `routes.js`, `Layout.jsx`, `App.jsx`, `PrivateRoute.jsx`,
   `AuthController.js`.
5. Qualquer necessidade percebida de alterar `apropriacoes` ou os modelos listados em §3.1
   — nesse caso, **não altere**: relate e proponha alternativa.

---

## 18. Entregáveis de cada PR

1. Descrição do que mudou e por quê, em português.
2. Lista dos arquivos fora do módulo que foram tocados, com justificativa individual.
3. Resultado do checklist de regressão da seção 15.
4. Evidência visual das telas alteradas (claro e escuro).
5. Handoff atualizado em `docs/handoffs/HANDOFF_CUSTOS_RECEBIVEIS_IMPLEMENTACAO.md`.
6. Nenhum `console.log` de depuração, credencial, token ou dado real de cliente.
