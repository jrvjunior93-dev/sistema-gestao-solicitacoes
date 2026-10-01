# Auditoria: o que está em `C:\Fluxy` e não veio para `Fluxy-V4`

> Documento historico de 20/08/2026. A comparacao abaixo retrata repositorios e SHAs
> daquele dia; nao descreve o runtime nem a branch atual. Consulte `docs/README.md` e
> `docs/contexto/ESTADO_ATUAL_REFACTOR_FRONTEND.md` antes de qualquer decisao.

Data: 20/08/2026. Auditoria **somente leitura** — nada foi trazido, nada foi commitado.

---

## 0. O achado que muda o método

**Os dois repositórios não compartilham histórico git.**

| | `C:\Fluxy` | `Fluxy-V4` |
|---|---|---|
| Branch | `dev-v2` | `master` |
| Commits | 975 | 87 |
| Primeiro commit | histórico completo do produto | `657fe58` "Estado inicial do ambiente local Fluxy V4" (15/08 00:21) |
| Último | `fdc62c6f` (20/08 11:27) | `f167796` (18/08 16:37) + 137 arquivos não commitados |

O V4 nasceu de um **snapshot copiado**, não de um clone. `Fluxy-V4` não conhece o commit `fdc62c6f`
nem a branch `dev-v2`.

**Consequência prática:** não dá para fazer `git merge` nem `git cherry-pick` entre eles. Trazer as
correções será **arquivo a arquivo**, ou reconstruindo o V4 a partir do `dev-v2` atual e reaplicando
o trabalho de contratos por cima. É a decisão mais importante desta auditoria (seção 6).

---

## 1. O que existe só no Fluxy

### 1.1 Módulo DDA Banco do Brasil — **inteiro**

Nunca veio. 8 arquivos + 1 migration:

```
backend/migrations/202608160001_financeiro_dda_base.js
backend/src/controllers/FinanceiroDdaController.js
backend/src/models/FinanceiroDdaBoleto.js
backend/src/models/FinanceiroDdaEvento.js
backend/src/models/FinanceiroDdaSincronizacao.js
backend/src/services/financeiroDdaService.js
backend/src/validators/ddaValidators.js
backend/scripts/validarFinanceiroDda.js
frontend/src/pages/FinanceiroDda.jsx
```

⚠️ **Colisão de numeração:** a migration do DDA é `202608160001_financeiro_dda_base.js` e o V4 tem
`202608160001_obra_tipo_apropriacao_padrao.js` — **mesmo prefixo, arquivos diferentes**. Precisa ser
renumerada ao trazer.

### 1.2 `ModalPortal.jsx` — e aqui há um conflito de solução

`frontend/src/components/ui/ModalPortal.jsx` (commit `fb03d0ac`, "padroniza modais e
responsividade") faz portal + **bloqueio de rolagem do body com contagem de modais abertos** e
compensação da barra de rolagem.

**No V4 eu criei `OverlayModal.jsx`** para o mesmo problema, com outra abordagem: portal +
centralização sobre a área de conteúdo (medindo o recuo do menu).

São **duas soluções diferentes para o mesmo problema**, cada uma resolvendo uma parte que a outra
não resolve. Trazer as duas sem decidir deixaria o sistema com dois padrões de modal.

### 1.3 Scripts de validação

`validarCaixaFisico.js` · `validarLiveUpdates.js` · `validarFinanceiroDda.js` ·
`corrigirFreteGlobalPedido.js`

---

## 2. As correções pendentes, por área

30 commits no Fluxy desde 14/08. Agrupados:

### 2.1 Baixa em dinheiro / caixa físico — **12 commits, o maior bloco**

```
c78fe20c  valida baixas em dinheiro com caixa fisico
a2dcda76  consolida validacoes e atualizacao do caixa fisico
1ae7262b  exibe movimentos manuais no livro do caixa
e557e09e  corrige registro de movimentos do caixa fisico
188b6b0c  corrige confirmacao de movimentos do caixa fisico
12198d34  confirma movimentos no livro do caixa
e7fef537  atualiza caixa imediatamente apos movimentacoes
012a44bb  atualiza caixa automaticamente apos operacoes
19b41048  melhora layout e tabela de caixas
d823716d  melhora responsividade de caixas e contas
d0a5ac83  aprimora controle operacional do caixa fisico
4de4923a + f6fdfc44  estrutura operacional do DDA
```

Arquivos: `caixaFinanceiroService.js` (640 linhas de diferença), `CaixaFinanceiroController.js`,
`financeiroCaixaSessionHelper.js`, `chequeTerceiroService.js`, `tituloFinanceiroService.js`,
`financialValidators.js`, `FinanceiroCaixas.jsx` (1.145 linhas), `BaixaCompostaModal.jsx`.

### 2.2 Ações em massa das solicitações — 1 commit

`1ba19880` — `Solicitacoes/index.jsx` + `index.css`. Pequeno e isolado.

### 2.3 Modais e responsividade — 1 commit + arrasto

`fb03d0ac` — `ModalPortal.jsx` (novo), `index.css`, `responsive-system.css`,
`GerenciarCotacaoSolicitacao.jsx`, `FinanceiroCard.jsx`, e um script de validação.

### 2.4 Compras — 2 commits

- `82ce9663` frete global rateado acima da base dos itens (`pedidoCompraService.js`)
- `95b7f4ae` estabiliza atualizações e otimiza detalhe (`liveUpdatesBroker.js`,
  `SolicitacaoCompraController.js`)

### 2.5 Comercial — 8 commits

Comissão e corretor, categoria financeira da comissão em configuração global, contratos por torre,
sincronização de código com empreendimento/torre, carteira comercial reorganizada, busca de
clientes ampliada, recebimento em cheque, `INNER JOIN` implícito que ocultava contratos sem corretor.

Arquivos: `comercialService.js`, `comercialContratoDocumentoService.js`,
`commercialValidators.js`, `ComercialContratos.jsx` (693 linhas), `ComercialUnidades.jsx`,
`ConfiguracoesComercialCategorias.jsx`.

### 2.6 Além do que foi pedido — **3 blocos que você não citou**

1. **PIX no fluxo de geração de contas** (`c8f42101`): +360 linhas em `FinanceiroCard.jsx`, mais
   `Parceiros.jsx` e `services/parceiros.js`. **Toca a mesma tela que eu alterei** para as previsões
   do contrato — é a colisão mais séria da lista.
2. **Notificações** (`56ceaf24`): `NotificacoesBell.jsx`.
3. **Busca de parceiros**: `0255a8e2` normaliza pontuação de CPF/CNPJ no autocomplete
   (`ParceiroAutocomplete.jsx`), e `a214860f` amplia a busca de clientes. **Eu mexi na busca de
   parceiros** nesta semana, por outro caminho.

---

## 3. Os arquivos em que **os dois lados** mexeram

Este é o risco real. 13 arquivos:

| Arquivo | O Fluxy trouxe | O V4 trouxe |
|---|---|---|
| `backend/src/routes.js` | rotas de DDA, caixa, comercial | ~12 rotas de contrato/credor/minuta |
| `backend/src/models/index.js` | 3 modelos DDA | 8 modelos de contrato/medição/insumo |
| `backend/src/constants/moduloPermissoes.js` | permissões de DDA/caixa | `contratos.credor.completar_cadastro` e outras |
| `backend/src/services/tituloFinanceiroService.js` | baixa em dinheiro (9.624 linhas de diff) | uso pela aprovação de contrato |
| `backend/src/services/authorizationService.js` | permissões novas | leitura estrita, escopo |
| `backend/src/controllers/ConfiguracaoSistemaController.js` | config comercial global | categorias do contrato de obra |
| `backend/src/controllers/SolicitacaoCompraController.js` | live updates | catalogação de itens manuais |
| `frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx` | **PIX (+360)** e modais | previsões e modal de medição |
| `frontend/src/App.jsx` | rota do DDA | rotas de contrato |
| `frontend/src/layout/Layout.jsx` | responsividade | — |
| `frontend/src/utils/acessoProduto.js` | módulo DDA | — |
| `backend/package.json` | script de validação | script de validação |
| `docs/workspace/OWNERSHIP_ATIVO.md` | — | — |

**`FinanceiroCard.jsx` é o pior caso:** as duas equipes acrescentaram funcionalidade grande na mesma
tela, na mesma semana.

---

## 4. O que o V4 tem e o Fluxy não

Para a conversa não ser de mão única. 23 arquivos de backend e 12 de frontend, em três frentes:

1. **Contratos do fluxo novo** (PI-1 a PI-20): serviço, aditivo, medição, parcelas, código, limite,
   credor, consulta CNPJ, upload de negociação/minuta, 16 migrations, 30 suítes de QA.
2. **Catalogação de itens manuais de Compras** (do outro agente): `InsumoManualCatalogacao*`,
   `InsumoAlias`, 2 componentes.
3. **Apropriação padrão por obra e tipo** (`ObraTipoApropriacao*`).

Nada disso está no `dev-v2`.

---

## 5. Números

| | |
|---|---|
| Commits no Fluxy desde 14/08 | 30 |
| Arquivos tocados por eles | 74 |
| Backend: só no Fluxy | 6 |
| Backend: diferentes, com o Fluxy à frente | 17 |
| Frontend: só no Fluxy | 2 |
| Frontend: diferentes, com o Fluxy à frente | 20 |
| Migrations só no Fluxy | 1 (com colisão de número) |
| **Arquivos que os dois lados mexeram** | **13** |

---

## 6. A decisão que precisa ser tomada antes de trazer qualquer coisa

Não é "quais arquivos copiar". É **qual repositório é o tronco**.

### Caminho A — trazer as correções para o V4, arquivo a arquivo

- Preserva o ambiente atual, as 30 suítes e o trabalho de contratos em andamento.
- Os 13 arquivos em colisão precisam ser mesclados **à mão**, sem ajuda do git.
- `FinanceiroCard.jsx` e `tituloFinanceiroService.js` são trabalhosos.
- Risco: mesclagem manual sem histórico é onde se perde correção sem ninguém notar.

### Caminho B — partir do `dev-v2` atual e reaplicar o trabalho do V4

- O tronco passa a ser o repositório que **vai para produção**, com histórico real.
- As 30 correções vêm de graça, na versão testada por quem as escreveu.
- Custo: reaplicar 16 migrations, ~35 arquivos de contrato e 30 suítes sobre a base nova.
- A favor: o trabalho do V4 está em **arquivos majoritariamente novos** (23 backend + 12 frontend),
  e só 13 arquivos precisariam de reaplicação cuidadosa — os mesmos 13 do caminho A.

### Caminho C — não trazer agora

- Termina o bloco de contratos no V4, e a integração vira um passo único depois.
- Risco: quanto mais o `dev-v2` andar, maior a distância. Em 6 dias já são 30 commits.

**Recomendo o B**, com uma ressalva honesta: eu não sei o quanto o `dev-v2` mudou em áreas que não
auditei em profundidade (SST, CRM, RH, Fiscal — 100+ tabelas). O caminho B assume que o `dev-v2` é a
verdade, o que é verdade para produção, mas eu só validei isso para as áreas desta auditoria.

---

## 7. O que **não** foi verificado

Dito com todas as letras, para não passar por completo o que não é:

- **Não comparei `node_modules`, `uploads`, `dist`, `backups`, `tmp`, `outputs`** — excluídos de
  propósito.
- **Não comparei o banco de dados** dos dois ambientes, só o código.
- **Não abri o conteúdo** dos 37 arquivos de backend e 34 de frontend que diferem: classifiquei pela
  autoria (quem tocou desde 14/08), não lendo diferença por diferença.
- **Não avaliei** se as correções do Fluxy dependem de migrations além da do DDA — só conferi quais
  arquivos de migration existem de cada lado.
- **Não testei nada** do Fluxy neste ambiente.

Cada um desses vira trabalho próprio, se você quiser a auditoria mais fundo antes de decidir.

---

## 8. Consolidação executada (20/08)

Decisão do cliente: **`Fluxy-V4` passa a ser a fonte de verdade**, e o que mudou na `dev-v2` vem
para cá. Nada foi commitado.

### 8.1 Migrations — a regra veio antes do código

Documentada em `CONVENCAO-MIGRATIONS.md`. O fato que a determina: **`schema_migrations` registra
pelo nome do arquivo**, então renomear uma migration que já rodou em produção faz ela rodar de novo.

| Regra | |
|---|---|
| 1 | Migration vinda da `dev-v2` **nunca** é renomeada — pode já estar aplicada na `main` |
| 2 | Na colisão, cede a criada no V4 — ela nunca rodou fora daqui |
| 3 | Faixa reservada: `dev-v2` usa `0001`–`0049`, V4 usa **`0050`+** |
| 4 | Toda migration idempotente |
| 5 | FK com nome explícito em tabela de nome longo (limite de 64 do MySQL) |

Conferido antes de renomear: as **17** migrations do V4 têm guarda (`columnExists`/`tableExists`/
`indexExists`). Renomeadas para a faixa `0050+`, com o `schema_migrations` **atualizado junto** —
nada reexecutou e não sobrou registro apontando para arquivo inexistente (0 órfãos, 182 linhas antes
e depois).

Com `202608160001` livre, a migration do DDA entrou **com o nome original** e aplicou limpa.

### 8.2 O que foi trazido

| | |
|---|---|
| Arquivos copiados inteiros (só o Fluxy tocou) | **26** |
| Arquivos novos (DDA, ModalPortal, scripts) | **13** |
| Migration nova | 1 (`202608160001_financeiro_dda_base.js`) |
| Arquivos em colisão, resolvidos por patch | **12** |

Os patches vieram dos commits exatos (`4de4923a` DDA, `d0a5ac83` caixa, `c78fe20c` baixa em
dinheiro, `6cf647c6` comercial, `95b7f4ae` compras, `c8f42101` PIX), aplicados sobre as minhas
alterações. Todos os hunks entraram — **um** foi rejeitado, de propósito (8.4).

### 8.3 Notificações — o que faltava na primeira auditoria

Três mudanças pequenas, nenhuma estava aqui:

- `NotificacoesBell.jsx`: `<section>` → `<div>` no painel
- `index.css`: `.notification-shell { flex: 0 0 auto }`
- `index.css`: `.notification-overlay { z-index: 79 }`

### 8.4 Os dois modais viraram um

O hunk rejeitado era o `fb03d0ac` reestilizando o `<div>` cru do modal "Gerar conta" — que **não
existe mais aqui**: eu o substituí por `OverlayModal` numa rodada anterior.

Resolvido compondo, não escolhendo: `OverlayModal` passou a **usar** o `ModalPortal` por dentro.

> Primeiro eu copiei a trava de rolagem para dentro do `OverlayModal`. **Errado**, e vale registrar:
> a trava conta modais abertos numa variável de módulo, e duas cópias são **dois contadores**. Com
> a tela de Compras usando `ModalPortal` direto e um modal de contrato aberto ao mesmo tempo, cada
> um se acharia dono do `body.style` e o primeiro a fechar destravaria a rolagem com o outro ainda
> aberto — exatamente o caso que o contador existe para evitar. Agora há uma implementação só.

`ModalPortal` = base (portal, rolagem, `Escape`, foco). `OverlayModal` = casca (fundo,
centralização sobre a área de conteúdo, largura). A tela de Compras que veio da `dev-v2` usa o
`ModalPortal` em 5 lugares e continua funcionando sem alteração.

### 8.5 Verificação

- `npm run build` do frontend: limpo.
- Backend sobe, aplica a migration do DDA e responde.
- Suítes 18, 20, 26, 28 e 29: **passando**.
- Marcadores de cada correção conferidos um a um no V4 (DDA em models/routes/permissões/App/
  acessoProduto, caixa em routes, comissão em ConfiguracaoSistema, PIX no FinanceiroCard, live
  updates em Compras): **todos presentes, na mesma contagem do Fluxy**.

Restam 4 arquivos com diferenças, todas conferidas linha a linha e **nenhuma é correção perdida**:

| Arquivo | O que difere |
|---|---|
| `moduloPermissoes.js` | 1 linha — reformatei a permissão em múltiplas linhas ao acrescentar descrição |
| `tituloFinanceiroService.js` | assinaturas que eu estendi (`retornarTitulosCriados`, `pularAcessoFinanceiro`) |
| `FinanceiroCard.jsx` | o `<div>` cru do modal, substituído por `OverlayModal` |
| `SolicitacaoCompraController.js` | o V4 está à frente: `include` de `Unidade` com `attributes` |

### 8.6 O que continua valendo de olho

- A `dev-v2` segue recebendo commits até o corte. **Repetir esta comparação antes do deploy** —
  em 6 dias foram 30 commits.
- A faixa `0050+` precisa ser respeitada por quem criar migration aqui, inclusive o agente de
  Compras (`202608200051_catalogacao_itens_manuais.js` foi renumerada junto).
- **Não auditei em profundidade** SST, CRM, RH, Fiscal e eSocial — nenhum arquivo desses módulos
  apareceu nos 74 tocados desde 14/08, mas isso é ausência de evidência, não prova.
