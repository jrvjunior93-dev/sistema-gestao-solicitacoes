# Migração da reforma para o repositório oficial

> Documento historico de 01/09/2026. O porte descrito aqui ja ocorreu e as branches
> divergiram desde entao. Nao use estas instrucoes para promover o codigo atual. Consulte
> `docs/arquitetura/promocao_refactor_frontend_para_main.md`.

Inventário e plano de porte do trabalho feito neste repositório
(`savioleal12-debug/FLUXY`) para o repositório oficial do projeto
(`jrvjunior93-dev/sistema-gestao-solicitacoes`).

Última atualização: **2026-09-01**

---

## Contexto e regras

| Item | Valor |
|---|---|
| Origem | Este repositório nasceu de um commit inicial órfão (`fc5d84d`, snapshot do sistema). **Não compartilha histórico** com o oficial — o porte é por cópia de arquivos, nunca por merge/cherry-pick. |
| Destino | `jrvjunior93-dev/sistema-gestao-solicitacoes`, branch de trabalho `refactor/frontend` (criada de `dev-v2`) |
| PRs | Somente para `dev-v2` |
| Base do inventário | `git diff fc5d84d..ed7643f` (commit inicial → main atual): 22 commits, 12 entregas (PRs #1–#11 + commits diretos iniciais) |

**Regras do responsável (fonte de verdade — ver o guia oficial em
`docs/GUIA_REFATORACAO_FRONTEND_COLABORADOR_E_HOMOLOGACAO.md` quando anexado):**

1. Trabalhar **apenas em `frontend/`**.
2. **Não alterar** backend, permissões, endpoints ou regras de negócio sem alinhamento prévio.
3. **Nenhuma migration.**
4. Preservar o comportamento dos fluxos existentes.
5. Validar com `npm --prefix frontend run test:responsive` e
   `npm --prefix frontend run build` **antes de cada push**.

Consequência direta das regras 1–3: **tudo do grupo B e do grupo C abaixo só entra no
oficial depois de alinhamento explícito com o responsável** (é para isso que existe
`docs/PROPOSTA-BACKEND.md`). O que pode começar já é o grupo A.

---

## GRUPO A — Frontend puro

Arquivos em `frontend/` que funcionam contra o backend oficial **sem nenhuma mudança de
backend**. É o material da primeira leva de PRs para `dev-v2`.

### A1. Design system e base visual

| Arquivo | O que entrega |
|---|---|
| `frontend/src/styles/design-tokens.css` | Tokens de cor sóbrios (claro/escuro), tipografia, espaçamento, grid de módulos em no máximo 4 colunas (`.hub-grid`), contraste AA |
| `frontend/src/index.css` | Regra global de campos de texto rebaixada com `:where()` (um fundo, uma borda, raio 10px, foco discreto sem glow), largura útil 1520px, marca CSC+Fluxy no topo, acabamento geral |
| `frontend/src/components/StatusBadge.jsx` | Etiqueta de status padronizada com ícone e tom semântico, usada em todas as listas |
| `frontend/src/hooks/useFecharAoSair.js` | Hook compartilhado: qualquer menu suspenso fecha com clique fora e Esc |
| `frontend/src/utils/formatarTexto.js` | Helpers de formatação de texto |
| `docs/DESIGN-SYSTEM.md` | Documentação dos tokens e padrões |

### A2. Navegação por cards (casca)

| Arquivo | O que entrega |
|---|---|
| `frontend/src/navigation/navigationConfig.jsx` | **Fonte única de navegação**: todas as telas, hubs, permissões (`can`), ordem explícita e ações fixáveis num só lugar |
| `frontend/src/navigation/ModuleHub.jsx`, `NavCard.jsx` | Hubs por módulo com cards |
| `frontend/src/layout/Layout.jsx` | Layout sem sidebar: topo com marca, breadcrumb, barra de atalhos |
| `frontend/src/utils/navigation.js`, `App.jsx`, `main.jsx` | Roteamento a partir da fonte única |
| `frontend/scripts/validarNavegacao.mjs` | Validação de build: nenhum link morto na fonte única |
| `frontend/src/pages/Login/index.jsx` | Login revisado com a marca (a parte do redirect por tela inicial é grupo B) |

⚠️ **Condição de porte**: `HomeHub`, `ModuleHub` e `CommandPalette` consomem endpoints do
grupo C (`/dashboard/pendencias`, `/busca`, `/home/blocos/:bloco`). Para entrar na onda de
frontend puro, esses consumos precisam **degradar em silêncio** (sem contadores, Ctrl+K só
com telas e ações, Home só com módulos). Verificar/ajustar essa degradação é parte da onda 2
— hoje o código assume os endpoints presentes.

### A3. Barra da lista e apresentação do ListaAvancada

O visual do componente (barra em 3 níveis com hierarquia por forma, busca em camada única,
alternador Páginas ⇄ Rolagem, modo tabela⇄cards, agrupamento client-side) é frontend puro.
A **persistência** de preferências e os contadores por visão são grupo B.

| Arquivo | O que entrega |
|---|---|
| `frontend/src/components/lista-avancada/lista-avancada.css` | Barra em 3 níveis (busca → visões-pílula → filtros), estados, mobile com painéis |
| `frontend/src/components/lista-avancada/ListaAvancada.jsx` | Componente reutilizável de lista (ver dependências no grupo B) |
| `docs/LISTA-AVANCADA.md` | Contrato "dados controlados" para plugar novas listas |

### A4. Páginas ajustadas só na apresentação

Modificadas para breadcrumb, cabeçalho padronizado, etiquetas de status e alertas com ícone
— nenhuma mudança de dados:

`FiscalCompanies`, `FiscalDivergences`, `FiscalDocuments`, `FiscalLogs`,
`FiscalOperationalReport`, `PedidosCompra`, `FinanceiroConciliacao`,
`FinanceiroDiagnosticoDre`, `FinanceiroRelatorios`, `GestaoContratos`, `Obras`, `Parceiros`,
`RhDpApuracao`, `RhDpColaboradores`, `RhDpFechamentos`, `UsuariosPermissoesRhDp`,
`ConfiguracoesVisibilidadeUi`, `ThemeContext` (ajuste de tema).

### A5. Detalhe da solicitação — parte visual

| Arquivo | O que entrega |
|---|---|
| `SolicitacaoDetalhe/Conversa.jsx` | Conversa única (funde os antigos `Anexos.jsx` + `Comentarios.jsx`, removidos) |
| `SolicitacaoDetalhe/Header.jsx`, `Timeline.jsx`, `FinanceiroCard.jsx` | Cabeçalho com ação em destaque, campos vazios ocultos com alternador, auditoria colapsada, abas no mobile |
| `frontend/src/utils/layoutBlocos.js` | Motor de layout em blocos (usuário → setor → padrão) — puro em si; as camadas usuário e setor persistem via grupo B |
| `SolicitacaoDetalhe/blocosDetalhe.js`, `navigation/blocosHome.js` | Catálogos de blocos (definições e permissões `can` reusadas da fonte única) |

### A6. Detalhes que parecem B mas são A

- `SolicitacoesCompra.jsx`: o seed de filtro por `?status=` na URL usa o filtro que a tela
  já tinha — puro. (O cartão da Home que **gera** esse link é grupo B.)
- `Perfil.jsx`: os ajustes visuais são puros; o card "Tela inicial" é grupo B.

---

## GRUPO B — Frontend dependente de backend novo

Arquivos de frontend que **só funcionam por inteiro** com endpoints/tabelas do grupo C.
Portar sem o backend correspondente = tela quebrada ou recurso morto.

| Arquivo(s) | O que entrega | Depende exatamente de |
|---|---|---|
| `ListaAvancada.jsx` (persistência) + `services/listasPreferencias.js` | Colunas, larguras, modo, paginação, agrupamento e filtros nomeados salvos **por usuário e por lista, no banco** (sobrevive a troca de máquina) | `GET/PUT /listas/:lista/preferencias`, `GET/POST/DELETE /listas/:lista/filtros` → tabelas `usuario_lista_preferencias` e `usuario_lista_filtros` (migration `202608300050`) |
| `pages/Solicitacoes/index.jsx` + `services/solicitacoes.js` | Lista de Solicitações no ListaAvancada: busca única server-side, visões com contadores, ordenação, filtros combinados, banner "Mostrando: …" | Rework do `SolicitacaoController` (params `q`, `visao`, ordenação, filtros múltiplos; escopo compartilhado) + `GET /solicitacoes/contadores` + serviço `pendenciasVisoes` |
| `navigation/HomeHub.jsx` (pendências) + `services/pendencias.js` | Faixa "Para resolver agora" e cartões de pendência com números reais; cada cartão abre **exatamente o conjunto contado** (`?visao=`) | `GET /dashboard/pendencias` + `pendenciasVisoes.js` + param `visao` nas listas + status composto `EM_ABERTO` no `tituloFinanceiroService` |
| `navigation/BlocosHomeExtras.jsx` | 12 blocos opcionais da Home (Trabalho/Financeiro/Obras e Compras/Institucional) com carga sob demanda | `GET /home/blocos/:bloco` (`HomeBlocosController`, gates das telas de origem) |
| `HomeHub.jsx` / `SolicitacaoDetalhe/index.jsx` (personalização) | Reordenar/ocultar/recolher blocos, largura, módulos ocultáveis, "Adicionar bloco/módulo" — persistente | Os mesmos endpoints `/listas/:lista/preferencias` (camada usuário) + `/configuracoes/detalhe-layout` com coluna `tela` (camada setor; migrations `202608301400` e `202608312100`) |
| `navigation/CommandPalette.jsx` (grupos de registros) + `services/busca.js` | Ctrl+K encontra solicitações, contratos, títulos, obras e parceiros com as **mesmas permissões das telas** | `GET /busca` (`BuscaController` + `buscaFlexivel` + `normalizarTexto`) + índices da migration `202608311000` |
| `navigation/AtalhosContext.jsx`, `AtalhosTopbar.jsx`, `SeusAtalhos.jsx` | Atalhos fixáveis (estrela), barra do topo, padrão por setor | `/listas` (prefs do usuário) + `GET/POST/PUT/DELETE /configuracoes/atalhos-setor` (tabela `setor_atalhos_padrao`) |
| `Perfil.jsx` (card Tela inicial), `Login/index.jsx` (redirect), `AtalhosTopbar.jsx` (casinha) + `services/telaInicial.js`, `services/auth.js` | Usuário escolhe a tela em que o login cai; validação **no backend**; fallback silencioso para a Home | `GET/PUT/DELETE /me/tela-inicial` + `telaInicialService` + `tela_inicial` no session user (`AuthController`) + fonte única compilada (`backend/src/generated/navegacaoFonteUnica.cjs`, gerada por `frontend/scripts/gerarCatalogoNavegacaoBackend.mjs` no `prebuild`) |
| `SolicitacaoDetalhe` (ação principal) + `services/acoesPrincipais.js`, `pages/ConfiguracoesAcoesPrincipais.jsx` | Botão de ação principal por setor+estado no detalhe | `/configuracoes/acoes-principais` (tabela `acoes_principais_setor`) |
| `pages/ConfiguracoesAtalhosSetor.jsx`, `ConfiguracoesDetalheLayout.jsx` | Telas de admin dos padrões por setor | Os CRUDs correspondentes do grupo C |
| `FinanceiroTitulos.jsx` (efeito de URL) | Abrir a lista de títulos a partir dos cartões (status composto, obra, mês) sem herdar filtros salvos | `EM_ABERTO` no `tituloFinanceiroService` + links gerados pelo `DashboardPendenciasController` |
| `frontend/package.json` (`prebuild`/`gerar:navegacao`) | Compila a fonte única para o backend validar tela inicial | Só faz sentido junto com o pacote tela-inicial |

---

## GRUPO C — Backend e banco

Tudo aqui **fere as regras 1–3 do responsável** se for portado sem alinhamento. Nada de
regra de negócio existente foi alterado: são adições, mais as correções de bug marcadas.

### C1. Migrations (4 — todas aditivas, idempotentes, no padrão `schemaUtils` do projeto)

| Migration | Cria |
|---|---|
| `202608300050_lista_preferencias_filtros_acoes.js` | Tabelas `usuario_lista_preferencias`, `usuario_lista_filtros`, `acoes_principais_setor` |
| `202608301400_atalhos_setor_layout_detalhe.js` | Tabelas `setor_atalhos_padrao`, `setor_detalhe_layout` |
| `202608311000_indices_busca.js` | Índices `idx_obras_nome`, `idx_parceiros_nome`, `idx_parceiros_cpf_cnpj` |
| `202608312100_setor_layout_tela.js` | Coluna `setor_detalhe_layout.tela` + índice `(tela, setor)` |

Nenhuma tabela existente é alterada; nenhuma coluna existente muda de tipo ou semântica.
A preferência de tela inicial **não** criou coluna em `users` — reusa
`usuario_lista_preferencias` com a chave `tela-inicial`.

### C2. Endpoints, controllers e services novos

| Item | Rotas | O que entrega |
|---|---|---|
| `ListaPreferenciasController` | `GET/PUT /listas/:lista/preferencias`, `GET/POST/DELETE /listas/:lista/filtros` | Preferências e filtros nomeados, sempre do próprio usuário autenticado |
| `DashboardPendenciasController` + `services/pendenciasVisoes.js` | `GET /dashboard/pendencias` | Contadores de pendência com COUNT real e links `?visao=`; o serviço é o **recorte SQL único** usado por contador e lista |
| `BuscaController` + `utils/buscaFlexivel.js`, `utils/normalizarTexto.js` | `GET /busca` | Busca universal por grupos, cada grupo com a MESMA regra de visibilidade da tela correspondente; LIMIT em toda consulta |
| `HomeBlocosController` | `GET /home/blocos/:bloco` | Dados sob demanda dos blocos opcionais da Home, gateados pelo `authorizationService` das telas de origem |
| `TelaInicialController` + `services/telaInicialService.js` + `generated/navegacaoFonteUnica.cjs` | `GET/PUT/DELETE /me/tela-inicial` | Tela inicial validada no backend contra a fonte única compilada (fail-closed: sem permissão/rota → limpa e cai na Home) |
| `AcaoPrincipalSetorController` + model | `/configuracoes/acoes-principais` (CRUD) | Ação principal por setor+estado no detalhe (escrita gateada por `allowConfiguracoesStatusVinculos`) |
| `AtalhoSetorController` + model | `/configuracoes/atalhos-setor` (CRUD) | Atalhos padrão por setor |
| `DetalheLayoutController` + model | `/configuracoes/detalhe-layout` (CRUD, param `tela`) | Layout padrão do detalhe e da Home por setor |
| `SolicitacaoController` (rework grande) | `GET /solicitacoes` (params novos), `GET /solicitacoes/contadores` | Escopo de visibilidade compartilhado (`montarEscopoVisibilidadeLista`), busca única `q`, param `visao` (400 para visão desconhecida; **nunca amplia** o escopo), contadores por visão |
| `AuthController` (ajuste) | — | `buildSessionUser` + `tela_inicial` no payload da sessão |
| `models/index.js`, `routes.js` | — | Registro dos 5 models e das rotas novas |
| `backend/scripts/valida-pendencias.js` | — | QA: compara cartão×lista via controllers reais (última execução: 7/7 cartões batem, incluindo cenário com 70 aprovações) |

### C3. CORREÇÕES DE BUG — interessam ao responsável independentemente da reforma

> ⚠️ **CORREÇÃO 1 DESCARTADA NO PORTE (02/09/2026) — NÃO APLICAR.**
> A verificação prévia no repositório oficial mostrou que o fix teria **quebrado
> as telas de obras no deploy**: no MySQL Linux do servidor oficial a tabela
> física é **`Obras`, com O maiúsculo** (confirmado no handoff
> `docs/handoffs/TRANSFORMACAO_DEV_V2_PARA_V4_2026-08-29.md` — o deploy de 29/08
> parou exatamente nisso), então a pluralização padrão do Sequelize já casa com o
> banco real, e cravar `tableName: 'obras'` (minúsculo) apontaria para uma tabela
> que lá não existe. O "bug" era, na verdade, adaptação ao ambiente local do
> FLUXY, onde as tabelas eram minúsculas. O oficial já trata a variação de nome
> físico no lado certo: as migrations resolvem dinamicamente via
> `resolveTableName(['Obras','obras'])` (commit `f58e030`), e para comprovantes
> existe migration de compatibilidade cobrindo `Comprovantes` E `comprovantes`.
> Padronizar os nomes físicos, se um dia for desejado, é trabalho de renomeação
> no banco de produção com janela própria — fora do escopo deste porte.

| # | Correção | Arquivo | Bug |
|---|---|---|---|
| 1 | ~~`tableName` explícito em `Comprovante` e `Obra`~~ **DESCARTADA — ver aviso acima** | — | O diagnóstico original valia só para o ambiente local do FLUXY; no servidor oficial o fix inverteria o problema. |
| 2 | **Handlers globais de processo** | `backend/server.js` | Um `unhandledRejection` (ex.: falha de banco disparada por uma tela) **derrubava o servidor inteiro**. Agora loga com stack e segue; falha durante o boot continua encerrando o processo. |
| 3 | **Status composto `EM_ABERTO`** | `backend/src/services/tituloFinanceiroService.js` | Cartão somava PREVISAO+ABERTO+PARCIAL mas o link abria a lista só com ABERTO — números divergentes. Extensão aditiva do filtro `status` (`EM_ABERTO` → `Op.in` dos três). |
| 4 | **Contador com teto de 61 / links errados** | `DashboardPendenciasController` + `pendenciasVisoes.js` | Contador vinha de `findAll` com `limit 61` e acima disso caía num link genérico por área ("61 aprovações" abria lista com 3.590 registros). Corrigido com COUNT sem teto + visões nomeadas: **cartão e lista usam literalmente o mesmo recorte SQL**. (Bug e correção dentro da reforma — o padrão importa para qualquer porte das pendências.) |
| 5 | **Busca que perdia registros (janelas paginadas)** | `BuscaController` | A regra mista de visibilidade de Solicitações descarta linhas DEPOIS do SQL; uma amostra única das mais recentes escondia registros antigos visíveis. Corrigido lendo em janelas de 30 (teto 120). (Dentro da reforma — padrão relevante para qualquer busca com filtro pós-SQL.) |

### C4. Exclusivo de desenvolvimento — NÃO portar para o oficial (ou portar só com alinhamento explícito)

| Item | Motivo |
|---|---|
| `DevQuickLoginController` + rotas + `env.devQuickLogin` + tela "Entrar como" no Login | **Bypass de autenticação de teste.** Fail-closed (404 fora de `NODE_ENV=development` + `DEV_QUICK_LOGIN=true`), mas não há razão para existir no oficial sem decisão do responsável. Ver `docs/DEV-QUICK-LOGIN.md`. |
| CORS para IP privado (`isPrivateNetworkOrigin` em `app.js`) | Só age com `NODE_ENV=development` (teste em celular na rede local). Inofensivo, porém desnecessário no oficial. |
| `outputs/**` (capturas), `backend/scripts/valida-pendencias.js`, docs do ambiente local | Material de entrega/QA deste repositório. Levar só o que o responsável quiser como evidência. |

---

## PLANO DE PORTE — ondas

Princípios: começar pelo que não depende de nada; nunca portar tela cuja funcionalidade
morre sem backend; toda onda termina com `npm --prefix frontend run test:responsive` +
`npm --prefix frontend run build` limpos **antes do push** e um PR pequeno para `dev-v2`.

### Onda 0 — Preparação (sem código de produto)

- Criar/atualizar `refactor/frontend` a partir de `dev-v2` no oficial.
- Confirmar baseline: versões de React/Vite/Tailwind, scripts do `package.json`
  (`test:responsive` e `build` existem lá?), estrutura de `frontend/src`.
  O porte é **cópia arquivo a arquivo do diff**, nunca a pasta inteira por cima —
  o snapshot daqui pode estar defasado em relação ao oficial.
- Levar `docs/MIGRACAO-PARA-OFICIAL.md` (este) e `docs/PROPOSTA-BACKEND.md` para o
  alinhamento. **Nada de backend nesta onda.**

**Validação:** build e test:responsive do oficial intactos antes de qualquer mudança
(estabelece a régua).

### Onda 1 — Fundação visual (grupo A1 + A4)

- Entra: `design-tokens.css`, regra global de campos do `index.css`, `StatusBadge`,
  `useFecharAoSair`, `formatarTexto`, marca/topo/largura, login (visual), páginas do A4.
- Pré-requisito: nenhum.
- **Validação:** test:responsive + build; percorrer os fluxos críticos existentes
  (login, dashboard, lista e detalhe de solicitação, financeiro) confirmando que só o
  visual mudou; conferir tema claro/escuro.

### Onda 2 — Navegação por cards com degradação (A2 + A5 + parte de A3)

- Entra: fonte única, hubs, breadcrumb, Layout, Ctrl+K **só telas/ações**, Home **só
  módulos** (sem pendências/blocos), detalhe visual (Conversa, Header, Timeline, campos
  vazios), catálogos de blocos com os defaults.
- Pré-requisito: **ajustar a degradação** — consumo de `/dashboard/pendencias`, `/busca`
  e `/home/blocos/:bloco` precisa falhar em silêncio (esconder a seção) enquanto o
  backend não existir no oficial. Personalização persiste em memória/desligada nesta onda
  (sem `/listas`), ou fica atrás de flag.
- **Validação:** test:responsive + build + `validarNavegacao.mjs` (nenhum link morto);
  navegar todos os hubs com perfis de permissões diferentes; confirmar que nenhuma rota
  antiga sumiu.

### Onda 3 — ListaAvancada em Solicitações (A3 + parte de B, modo degradado)

- Entra: componente ListaAvancada + página Solicitações.
- Pré-requisito: decisão de alinhamento sobre preferências. Duas rotas:
  - **(recomendada)** aprovar antes o pacote backend B1 (preferências) — é o mais barato
    do grupo C: 1 migration de tabelas novas, CRUD restrito ao próprio usuário, zero
    regra de negócio;
  - ou fallback temporário em `localStorage` (perde-se ao trocar de máquina; trocar
    depois pelo banco).
  Busca única/ordenação server-side e contadores por visão exigem o rework do
  `SolicitacaoController` (pacote B3) — sem ele, operar com busca/ordenação client-side
  da página ou adiar esses recursos.
- **Validação:** test:responsive + build; conferir contra a lista antiga: mesmos
  registros, mesmas permissões, mesmas ações (qualquer divergência é bug); testar lote
  com 1 e com N selecionadas.

### Onda 4 — Pacotes de backend (após alinhamento, na ordem de risco crescente)

Cada pacote = 1 PR próprio para `dev-v2`, com o frontend correspondente junto ou logo
depois.

| Pacote | Conteúdo | Risco | Antes precisa de |
|---|---|---|---|
| **B0 — Correções de bug** | Handlers globais (C3.2) — **entregue em 02/09**; a C3.1 (`tableName`) foi **descartada** (ver aviso em C3) | Baixíssimo; independentes de tudo | Só o OK do responsável |
| **B1 — Preferências** | Migration `202608300050` (parcial: 2 tabelas de usuário) + `ListaPreferenciasController` + rotas | Baixo: tabelas novas, CRUD do próprio usuário | OK do responsável (fura a regra "nenhuma migration") |
| **B2 — Busca universal** | `BuscaController` + utils + migration de índices | Baixo/médio: só leitura, mas toca escopos de 4 telas — revisar com o responsável grupo a grupo | B0 recomendado |
| **B3 — Solicitações (params) + pendências** | Rework `SolicitacaoController`, `pendenciasVisoes`, `DashboardPendenciasController`, `EM_ABERTO` (C3.3), param `visao` | Médio: mexe no controller mais usado do sistema (aditivo, mas grande). Validar com `valida-pendencias.js` em staging | B1 (contadores de visão aparecem na lista) |
| **B4 — Configuração por setor** | Tabelas `setor_atalhos_padrao`, `setor_detalhe_layout` (+coluna `tela`), `acoes_principais_setor` + 3 CRUDs + telas de admin | Baixo: tabelas novas, escrita gateada pelo gate de config existente | B1 |
| **B5 — Tela inicial** | `TelaInicialController` + service + fonte única compilada + `prebuild` + ajuste `AuthController` | Baixo: valida e cai na Home em qualquer dúvida | B1 (usa a mesma tabela) e onda 2 (fonte única) |
| **B6 — Blocos da Home** | `HomeBlocosController` | Baixo/médio: só leitura, reusa gates existentes; revisar consulta a consulta | Onda 2; B3 para os blocos de pendência |

- **Validação por pacote:** subir em `dev-v2` (PM2 `backend-dev`), rodar migrations no
  boot e conferir idempotência (segunda subida não aplica nada), percorrer os fluxos
  críticos, e no B3 rodar `valida-pendencias.js` contra o banco de staging
  (cartão×lista tem de bater 100%).

### Onda 5 — Frontend completo por cima dos pacotes

À medida que cada pacote entra, ligar no frontend o que estava degradado: pendências e
"Para resolver agora", Ctrl+K com registros, personalização persistente da Home/detalhe,
atalhos com padrão por setor, tela inicial no Perfil, blocos opcionais. Cada ativação com
test:responsive + build + conferência funcional da tela afetada.

### O que NUNCA vai (sem decisão explícita do responsável)

`DevQuickLoginController` e rotas, `DEV_QUICK_LOGIN` em `env.js`, tela "Entrar como",
CORS de IP privado, `outputs/**`, docs do ambiente local deste repositório.

---

## MIGRATIONS DO PORTE — execução e verificação (para o responsável)

### A ordem exata (cada passo com a sua conferência)

1. **Atualizar o código do `backend-dev`** com a branch `refactor/frontend`
   (checkout/pull + `npm install` se o lockfile mudou), **sem reiniciar o
   processo ainda** — com migration pendente o boot recusa subir de propósito.
   *Conferir:* `git log -1` no servidor mostra o commit esperado da branch.
2. **Rodar as migrations** (comando abaixo). O runner aplica as três na ordem
   da tabela. *Conferir:* o log do runner lista as três aplicadas; rodar o
   comando **de novo** não aplica nada (idempotência); as verificações da
   coluna "Verificar depois" da tabela, migration a migration.
3. **Reiniciar o `backend-dev`.** *Conferir:* o boot passa pelo
   `assertMigrationsUpToDate` sem reclamar e a API responde
   (`/solicitacoes/contadores` devolve números em vez de 404).
4. **Rodar o `valida-pendencias.js`** (bloco do B3 abaixo) — **só DEPOIS das
   migrations do passo 2**: o script não roda migrations, ele confere e aborta
   se houver pendente. `ALLOW_DEV_TEST_WRITES=true` é **obrigatório** (ele
   grava dados de cenário no banco apontado; sem a variável, recusa rodar).
   O host e o nome do banco também precisam coincidir com o fingerprint
   `DEV_TEST_ALLOWED_DB_HOST` + `DEV_TEST_ALLOWED_DB_NAME` configurado somente
   no `.env` da EC2 dev.
   *Conferir:* 100% dos cartões batem com as listas — qualquer divergência é
   bug a corrigir no recorte da visão, nunca no escopo da lista.
5. **Testar o preview** (`refactor-dev.jrfluxy.com.br`) seguindo o
   `docs/ROTEIRO-DE-TESTE-PREVIEW.md`, pacote a pacote e perfil a perfil.
   *Conferir:* o checklist de encerramento do próprio roteiro.

O `server.js` do oficial **não roda migrations no boot**: ele apenas confere o
schema (`assertMigrationsUpToDate`) e **recusa subir** se houver migration
pendente. A aplicação é um passo explícito e autorizado:

```bash
cd backend
ALLOW_SCHEMA_MIGRATIONS=true npm run migrate
```

O runner só aplica migrations de estrutura (ele mesmo rejeita arquivo com
mutação de dados) e registra cada uma em `schema_migrations` pelo nome do
arquivo. Rodar duas vezes é seguro: a segunda execução não aplica nada — e essa
é exatamente a conferência de idempotência a fazer.

Migrations que este porte adiciona, **na ordem de execução** (o runner ordena
por nome):

| # | Migration | Pacote | Cria | Verificar depois |
|---|---|---|---|---|
| 1 | `202609020050_lista_preferencias_filtros.js` | B1 (entregue) | Tabelas `usuario_lista_preferencias` (única por usuário+lista, FK `fk_usr_lista_pref_user` → users) e `usuario_lista_filtros` (FK `fk_usr_lista_filtros_user`) | `npm run migrate` de novo não aplica nada; `SHOW CREATE TABLE usuario_lista_preferencias` mostra o índice único `uq_usr_lista_pref` e a FK; na tela de Solicitações, mudar colunas/larguras, recarregar e ver a escolha mantida |
| 2 | `202609020051_indices_busca.js` | B2 (entregue) | Índices `idx_obras_nome` (na tabela de obras, nome físico resolvido em runtime — `Obras` no servidor), `idx_parceiros_nome`, `idx_parceiros_cpf_cnpj` | segunda execução não aplica nada; `SHOW INDEX FROM Obras`/`parceiros` lista os três; Ctrl+K responde rápido com texto de 2+ caracteres |
| 3 | `202609020052_configuracao_por_setor.js` | B4 (entregue) | Tabelas `setor_atalhos_padrao`, `setor_detalhe_layout` (já com a coluna `tela`) e `acoes_principais_setor` — as três numa migration só | segunda execução não aplica nada; telas de admin (Ação Principal / Atalhos por Setor / Layout do Detalhe) gravam e relêem; mapeamento de ação principal aparece no detalhe |

> O B5 (tela inicial) não cria migration — reusa `usuario_lista_preferencias`.
> B3 e B6 também não criam tabela.
>
> **Validação obrigatória do B3 em staging — cartão × lista (roda o responsável):**
> com o backend-dev atualizado e **as migrations já aplicadas** (o script não
> roda migrations: ele só confere e **aborta** se houver pendente), executar
> no servidor:
>
> ```bash
> cd backend
> # Configurar uma única vez no .env da EC2 dev, usando os MESMOS valores
> # já existentes em DB_HOST e DB_NAME. Nunca cadastrar estas chaves em produção:
> # DEV_TEST_ALLOWED_DB_HOST=<host exato do banco dev>
> # DEV_TEST_ALLOWED_DB_NAME=<nome exato do banco dev>
>
> # A autorização de escrita é transitória e deve existir somente no comando.
> ALLOW_DEV_TEST_WRITES=true node scripts/valida-pendencias.js
> ```
>
> O script sobe os controllers REAIS contra o banco, monta o cenário (inclui 70
> aprovações — acima do antigo teto de 61) e compara o total de CADA cartão de
> /dashboard/pendencias com o meta.total da lista aberta pelo link do próprio
> cartão. Cada execução usa um namespace QA próprio para não colidir com os
> registros anteriores. Critério de aceite: **100% dos cartões batem**. Se algum divergir,
> ajusta-se o recorte da visão (pendenciasVisoes), nunca o escopo da lista.
>
> O script e as fixtures são exclusivos de desenvolvimento/homologação. As
> migrations estruturais podem seguir no processo de promoção depois da
> validação; o script não deve ser executado nem incluído no runtime de produção.
>
> **Artefato do B5 — atenção no deploy do frontend:** o build do frontend
> ganhou um `prebuild` (`npm run gerar:navegacao`) que compila a fonte única de
> navegação para `backend/src/generated/navegacaoFonteUnica.cjs` (arquivo
> COMMITADO — o backend não roda esbuild). O script foi blindado para NUNCA
> falhar o build: qualquer erro vira aviso no log e o processo sai com código
> 0, porque o frontend publica sozinho na Vercel a cada push e o backend já
> degrada em silêncio sem o catálogo (tela inicial cai na Home). Dependências:
> só o esbuild que o próprio Vite instala.

### Catálogo de blocos: um dado em dois lugares, com guarda

O catálogo de blocos configuráveis (detalhe da solicitação e Home) existe em
DOIS arquivos que precisam permanecer idênticos: o do frontend
(`frontend/src/pages/SolicitacaoDetalhe/blocosDetalhe.js` e
`frontend/src/navigation/blocosHome.js`, que renderizam) e a cópia no backend
(`BLOCOS_POR_TELA` em `backend/src/controllers/DetalheLayoutController.js`,
que valida a config do admin). Quem criar ou remover um bloco precisa mudar os
dois lados — e `frontend/scripts/validarNavegacao.mjs` **falha o check** se
divergirem (comentários cruzados nos três arquivos apontam um para o outro).

### O que o preview mostra ANTES de o backend-dev subir com este código

O frontend da branch publica sozinho no preview (`refactor-dev.jrfluxy.com.br`)
a cada push, mas ele conversa com a API dev **atual** — os pacotes de backend
só ficam ativos quando o responsável (1) subir o `backend-dev` com este código
e (2) rodar as migrations acima. Até lá, ao testar no preview, é esperado ver:

| Pacote | Sem o backend novo, o preview mostra | Com backend + migration, passa a |
|---|---|---|
| B1 — preferências | Personalização (colunas, larguras, modo, filtros salvos, arranjo da Home/detalhe, atalhos) funciona na sessão mas **volta ao padrão ao recarregar**; salvar filtro falha em silêncio | Persistir por usuário, sobrevivendo a troca de máquina e limpeza de cache |
| B0 — handlers | (efeito só no servidor) | Erro assíncrono de uma tela não derruba o backend; log `[unhandledRejection]` |
| B2 — busca | Ctrl+K encontra **só telas e ações** | Ctrl+K encontra contratos, títulos, obras, parceiros, colaboradores e usuários (o grupo Solicitações liga junto com o B3 — flag `GRUPO_SOLICITACOES_DISPONIVEL` no topo do `BuscaController`) |
| B3 — solicitações/pendências (**entregue 02/09**) | Home **sem números** (sem "Para resolver agora"/cartões); lista sem visões "Minhas"/"Fila do setor", sem contadores; busca e ordenação **só sobre os registros carregados** (com aviso sob o campo) | Números reais na Home, cartão abre exatamente o conjunto contado (mesmo recorte SQL), busca única `?q=`, ordenação por coluna e contadores no banco inteiro; Ctrl+K passa a encontrar solicitações (inclusive arquivadas/canceladas por código) |
| B4 — config. por setor | Telas de admin dão erro ao carregar/salvar (endpoints ausentes); sem ação principal em destaque no detalhe; sem atalhos/layout padrão por setor | Camada do administrador ativa (3 telas de admin + ação principal no detalhe) |
| B5 — tela inicial | A "casinha" aparece mas salvar falha com alerta de erro (endpoints ausentes); login cai sempre na Home | Usuário escolhe onde o login cai (casinha no topo e card no Perfil), validado no backend contra a fonte única compilada |
| B6 — blocos da Home (**entregue 02/09**) | "Adicionar bloco" só com os básicos | Catálogo completo de 12 blocos opcionais, cada um gateado pela permissão e pelo escopo da tela de origem (compras/pedidos usam o MESMO escopo de obras do middleware das listas) |

---

## ⚠️ O comentário que engoliu ~620 regras de CSS (bug de homologação, 02/09)

**O que aconteceu.** O merge de 3 vias da Onda 1 apagou as 20 linhas de
fechamento (`============================ */`) dos cabeçalhos de seção do
`frontend/src/index.css`. Linhas idênticas repetidas são exatamente o que
desalinha um merge — o algoritmo ancorou errado e descartou todas. Cada `/*`
aberto passou a comentar as regras seguintes até o próximo `*/` do arquivo:
10 regiões, ~620 blocos engolidos (cabeçalho do detalhe, as duas seções de
Login, badges de status, tabela responsiva de Solicitações, dashboard,
filtros, empty states, formulários, tooltips…).

**Por que NADA acusou.** Comentário gigante é CSS *válido*: o build passa sem
warning, o esbuild remove comentários na minificação (as regras somem do
bundle em silêncio), o navegador ignora o texto, e o `test:responsive` da
época checava shell e overflow, não os ladrilhos. Passou por build, teste e
uma homologação inteira até alguém abrir o detalhe de uma solicitação. Não
era diferença dev×produção: o arquivo estava igualmente quebrado nos dois —
no repositório de origem funcionava porque o arquivo de lá estava íntegro.

**O que previne agora.** Dois checks permanentes no
`frontend/scripts/validarResponsividadeFrontend.mjs` (rodam no
`test:responsive`, bloqueante antes de cada push):

1. **Comentário engolindo regra** — falha se qualquer comentário de qualquer
   `.css` do fonte contiver uma linha de abertura de regra em coluna 0
   (prosa que cita regra como exemplo é indentada e não dispara), apontando
   arquivo, linha e o trecho engolido.
2. **Fonte × bundle** — toda classe definida nos `.css` do fonte precisa
   existir no CSS de `dist/assets` (~1.875 classes conferidas); se o bundle
   tiver menos que o fonte, o check falha listando as classes sumidas —
   qualquer que seja o motivo do sumiço, não só comentário.

Regra de ouro que fica: **depois de qualquer merge de arquivo CSS grande,
rodar o build e comparar fonte×bundle** — merge silencioso + minificação
silenciosa é uma combinação que esconde estrago grande.

## Riscos e observações

1. **Snapshot defasado**: o commit inicial daqui é um retrato; o oficial pode ter andado.
   Todo arquivo "M" do inventário precisa de diff de 3 vias na hora do porte (base do
   snapshot × nosso × oficial atual), nunca cópia cega.
2. **A regra "nenhuma migration" é o único conflito estrutural** com o grupo B/C: 6
   tabelas novas, 1 coluna nova (em tabela nossa) e 3 índices. Tudo aditivo e idempotente,
   no padrão `schemaUtils` que o projeto já usa. É a decisão central do alinhamento —
   `docs/PROPOSTA-BACKEND.md` existe para essa conversa.
3. **Nenhuma permissão nova foi criada** em todo o trabalho: cada recurso reusa os gates
   existentes (`authorizationService`, `allowConfiguracoesStatusVinculos`, escopos das
   telas de origem).
4. As capturas de cada entrega estão em `outputs/capturas-*/` neste repositório e servem
   de evidência visual no alinhamento.
