# Etapa B — Levantamento do módulo RH/DP (02/09)

Levantamento ANTES de qualquer código, como definido na Parte 6. Nada foi
alterado nas telas. O que está aqui é o estado real do módulo hoje, lido no
código-fonte e conferido contra o menu e as rotas.

**Ponto de partida honesto:** nenhuma das 11 telas do RH/DP está no
manifesto do harness (`scripts/qa-preview/telas.mjs`). Ou seja: **nenhuma
delas foi medida contra a DoD até agora.** A matriz de 22 telas que fechou
100% não cobre este módulo. Os números abaixo são diagnóstico estático — a
medida de verdade só sai quando as telas entrarem no manifesto e rodarem no
preview.

---

## 1. As telas — o que é cada uma

| # | Tela | Rota | No menu? | Tipo | Linhas |
|---|------|------|----------|------|--------|
| 1 | RhDpInicio | `/rh-dp` | sim | Hub de cards (sem números) | 104 |
| 2 | RhDpEmpresas | `/rh-dp/empresas` | **não** | Lista + formulário lado a lado | 278 |
| 3 | RhDpColaboradores | `/rh-dp/colaboradores` | sim | Lista + formulário ABAIXO da tabela | 1331 |
| 4 | RhDpPessoal | `/rh-dp/pessoal` | sim | Tela de trabalho com 4 abas | 1663 |
| 5 | RhDpPessoalSolicitacoes | — (só aba) | — | Fragmento embutido no nº 4 | 574 |
| 6 | RhDpJornada | `/rh-dp/jornada` | sim | Lançamento em massa (tabela editável) | 459 |
| 7 | RhDpDocumentos | `/rh-dp/documentos` | sim | Lista paginada com ações | 425 |
| 8 | RhDpImportacoes | `/rh-dp/importacoes` | sim | Fluxo em etapas + histórico | 639 |
| 9 | RhDpApuracao | `/rh-dp/apuracao` | sim | Fluxo (gerar) + lista + detalhe embutido | 1019 |
| 10 | RhDpFechamentos | `/rh-dp/fechamentos` | sim | Lista + detalhe embutido | 481 |
| 11 | RhDpRelatorioOperacional | `/rh-dp/relatorios/operacional` | **não** | Painel de métricas + distribuições | 368 |

Total: **7.580 linhas**. Duas telas (Empresas e Relatório Operacional) só
são alcançáveis por card ou link de outra tela — não estão no menu.

As tabelas **já estão todas no `TabelaPadrao`** (migração da Etapa A). O
trabalho desta leva é cabeçalho, filtros, blocos e medidas — não tabela.

---

## 2. O que está fora do padrão (diagnóstico estático)

| Tela | Faixa via `PageHeader` | Faixa na mão | Título fora do token | `alert()` do navegador | `confirm()` do navegador |
|------|------------------------|--------------|----------------------|------------------------|--------------------------|
| RhDpInicio | não | não tem faixa | `text-3xl` | 0 | 0 |
| RhDpEmpresas | não | sim | `text-xl md:text-2xl` | 2 | 0 |
| RhDpColaboradores | não | sim | `text-xl md:text-2xl` | 13 | 2 |
| RhDpPessoal | não | sim | `text-xl md:text-2xl` | 0 | 1 |
| RhDpPessoalSolicitacoes | — | — | — | 0 | 1 |
| RhDpJornada | não | sim | `text-xl md:text-2xl` | 0 | 1 |
| RhDpDocumentos | não | sim | `text-xl md:text-2xl` | 5 | 1 |
| RhDpImportacoes | não | sim | `text-xl md:text-2xl` | 6 | 1 |
| RhDpApuracao | não | sim | `text-xl md:text-2xl` | 11 | 2 |
| RhDpFechamentos | não | sim | `text-xl md:text-2xl` | 5 | 0 |
| RhDpRelatorioOperacional | não | sim | `page-title` (ok) | 0 | 0 |

**Leitura:**

1. **Zero telas usam o componente `PageHeader`.** Dez copiam o markup
   `.app-page-header` na mão. É exatamente a R16 (um dono por
   responsabilidade) sendo violada onze vezes: quando a faixa mudar, muda
   em um lugar e não pega em nenhum destes dez. Foi por isso que a faixa
   fixa do RH/DP quebrou e ninguém viu — a tela não herda correção nenhuma.
2. **Nenhum título usa o degrau de 22px da DoD (C1).** Nove usam
   `text-xl md:text-2xl` (20px/24px conforme a largura), um usa `text-3xl`
   (30px). Só o Relatório Operacional usa `page-title`.
3. **Três padrões de filtro convivem no mesmo módulo**: `app-toolbar-card`
   com grade crua (Empresas, Colaboradores, Documentos, Pessoal, Jornada,
   Importações), `app-filters-card` com `sol-filtros-*` (Fechamentos), e
   grade solta dentro de `card` (Relatório Operacional). **Nenhuma usa o
   `BarraFiltros`.** As classes de campo também divergem: `form-control`
   (140 usos), `input w-full` (9), `input input-sm` (6).
4. **42 `alert()` e 9 `confirm()` do navegador.** Erro e confirmação saem
   em caixa cinza do Chrome, fora do sistema — enquanto Pessoal e Jornada,
   nas mesmas situações, usam faixa `alert-danger`/`alert-success` dentro
   da página. Duas linguagens de resposta no mesmo módulo.
5. **Cor fixa fora do token**: 81 ocorrências de `text-slate-*`,
   `bg-slate-*`, `border-slate-*` — mais pesado em Colaboradores (33),
   Importações (16) e Apuração (13). O `RhDpInicio` ainda carrega um
   gradiente inteiro escrito à mão no `className`.

---

## 3. Repetição de informação

**a) Três camadas de "hub de cards" antes de chegar na tela.**
Menu lateral (9 itens) → `RhDpInicio` (7 cards, os mesmos destinos) →
`/rh-dp/relatorios` (mais 4 cards: Operacional, Apuração, Fechamentos,
Importações — três deles já no menu). O usuário atravessa até três telas de
atalho para chegar a uma tela de trabalho.

**b) O mesmo recorte redigitado em 8 telas.** Empresa do grupo, obra,
tipo de vínculo, competência e status aparecem, cada um, em 6 a 9 telas
diferentes — sempre montados na mão, sempre esquecidos ao trocar de tela.

| Filtro | Em quantas telas |
|--------|------------------|
| obra | 9 |
| status | 9 |
| empresa do grupo | 8 |
| tipo de vínculo | 8 |
| competência | 6 |
| busca por nome/CPF/matrícula | 4 |

**c) `RhDpPessoal` × `RhDpColaboradores` — duas listas da mesma base.**
Colunas em comum: nome, obra, vínculo, situação. Pessoal acrescenta
"solicitação em curso" e destaque de linha; Colaboradores acrescenta
matrícula, CPF, empresa e o formulário de cadastro. São a mesma base de
colaboradores com dois recortes e dois lugares de entrada.

**d) Jornada e Apuração existem duas vezes.** São itens próprios do menu
**e** abas dentro do Pessoal (o mesmo componente, com `comoAba` tirando só
o cabeçalho). Quem entra pelo menu não sabe que existe a versão em aba, e
quem entra pelo Pessoal não sabe que existe a rota.

**e) Empresas do grupo existe duas vezes no sistema.**
`/rh-dp/empresas` (RhDpEmpresas, 278 linhas) e `/empresas-grupo`
(EmpresasGrupo, no menu Cadastros) — mesmo cadastro, duas telas, duas
manutenções. A do RH/DP nem está no menu.

**f) "RH/DP" repetido no título de 9 telas** ("RH/DP • Colaboradores",
"RH/DP - Documentos"), sendo que o módulo já está indicado na navegação.
E com dois separadores diferentes: `•` em três telas, `-` em cinco.

**g) Sete telas trazem "Voltar ao RH/DP" no cabeçalho**, mais links
cruzados para Colaboradores, Documentos, Apuração, Importações, Empresas e
Pessoal — todos destinos que o menu lateral já oferece.

---

## 4. Candidatos a recolhimento

Recolher e reorganizar, sem remover nada (Parte 5, item 2):

1. **Filtros → `BarraFiltros` recolhida**, com o resumo do que está
   aplicado na linha fechada. Colaboradores tem 5 campos, Documentos 8,
   Importações 6, Apuração 6, Relatório Operacional 6 — todos hoje abertos
   permanentemente, ocupando de 1/4 a 1/3 da primeira tela antes da tabela.
2. **Formulário abaixo da tabela → gaveta ou rota de detalhe.**
   Colaboradores põe "Detalhe do colaborador" depois de uma tabela que pode
   ter centenas de linhas. É o mesmo defeito que já foi corrigido no
   Pessoal, e o comentário do próprio código registra o motivo: *"O card
   abria ABAIXO da tabela. Quem clicava não via nada acontecer e concluía
   que o sistema tinha ignorado o clique."* Vale para Empresas também.
3. **Botões de modelo → um menu só.** Importações tem três botões
   ("Modelo Jornada", "Modelo Eventos", "Modelo Descontos") lado a lado com
   "Selecionar planilha"; Colaboradores tem "Baixar modelo" + "Importar
   massa" junto de "Novo colaborador". Cabem num `MenuMais`, deixando na
   faixa só a ação primária.
4. **Importações: dois cartões grandes viram um.** Hoje o cartão do lote
   (tipo, competência, obra, vínculo, observações + 4 botões) e o cartão de
   filtros do histórico (6 campos) empilham antes da primeira linha de dado.
5. **Detalhe embutido de Apuração e Fechamentos** — hoje abre como bloco
   solto no fim da página; cabe como linha expansível ou gaveta, usando a
   capacidade que o `TabelaPadrao` ganhou na leva anterior.
6. **`RhDpInicio`: o parágrafo de roadmap.** O texto atual diz *"A fundação
   modular do RH/DP já está habilitada no produto. As próximas entregas vão
   entrar por blocos..."* — é texto de plano de obra, visível para quem só
   quer trabalhar.

---

## 5. O que precisa de decisão sua

**D1 — A duplicação do `RhDpPessoal`** (a que você citou).
O Pessoal já é a tela de trabalho completa: Solicitações, Colaboradores,
Jornada e Apuração em abas. Mas Jornada e Apuração continuam como itens
próprios do menu, e Colaboradores também. Três caminhos:

- **(a) Pessoal vira a porta única do dia a dia.** Jornada e Apuração saem
  do menu (as rotas continuam existindo como link direto), e Colaboradores
  fica no menu como o cadastro (base + formulário), não como lista de
  trabalho. Menu cai de 9 para 7 itens.
- **(b) O menu manda.** Jornada e Apuração viram só rota, e as abas saem do
  Pessoal — que fica com Solicitações + Colaboradores.
- **(c) Fica como está**, e eu só igualo o padrão visual das três.

Minha recomendação é **(a)**: o comentário no código já explica que
jornada e apuração são o mesmo trabalho em sequência, e obrigar a trocar de
página no meio é o que faz perder o fio. O custo é ninguém achar a Jornada
sozinha no menu — mitigável com o card no Início.

**D2 — Empresas do grupo em dois lugares.** `/rh-dp/empresas` e
`/empresas-grupo` mantêm o mesmo cadastro. Mantenho as duas telas
(sincronizando o padrão), ou o RH/DP passa a apontar para a de Cadastros e
eu removo a duplicada? *Remover é decisão sua — não faço por regra.*

**D3 — `RhDpInicio`.** Hoje é um mural de 7 cards que repete o menu, com
texto de roadmap. Vira painel de verdade (headcount, documentos vencidos,
apurações em aberto, fechamentos do mês — os números que o Relatório
Operacional já calcula), ou continua como mural só ajustado ao padrão?

**D4 — Duas telas fora do menu.** Empresas e Relatório Operacional só são
alcançáveis por card/link. Entram no menu, ou é intencional que fiquem
escondidas?

**D5 — Formulário abaixo da tabela** (Colaboradores e Empresas). Passar
para gaveta/modal muda o comportamento da tela, não só a aparência. Autorizo
a mudança, ou mantenho o formulário onde está e só arrumo o espaçamento?

**D6 — "Voltar ao RH/DP" e os links cruzados no cabeçalho.** São 7
botões "Voltar ao RH/DP" mais uma dúzia de atalhos que o menu já tem. Pela
R11 sairiam; pela Parte 5 eu não removo elemento visível sem seu ok.
Removo, ou recolho para dentro de um `MenuMais` na faixa?

**D7 — O prefixo "RH/DP" nos títulos.** Tiro dos 9 títulos (fica
"Colaboradores", "Documentos", "Apuração"), ou mantenho e só padronizo o
separador?

**D8 — `alert()`/`confirm()` do navegador.** São 42 + 9 ocorrências. A DoD
hoje não cobre resposta de erro e confirmação. Pela Parte 5, isso vira item
novo da DoD ANTES da correção, e a matriz roda de novo em todas as telas.
Confirma que eu abra esse item (proposta: erro e sucesso em faixa dentro da
página; confirmação destrutiva em modal do sistema), ou fica fora do escopo
desta leva?

---

## 6. O que eu faço sem perguntar (se você aprovar a leva)

- Trocar os dez cabeçalhos na mão pelo `PageHeader`, com título no degrau
  de 22px, apoio em uma linha e ações à direita (C1–C6).
- Colocar as 11 telas no manifesto do harness e rodar a matriz — inclusive
  o R18 e o A1, que nunca foram medidos aqui.
- Unificar os três padrões de filtro no `BarraFiltros`.
- Trocar `text-slate-*` e o gradiente escrito à mão pelos tokens (R10/M1).
- Padronizar a classe de campo (`form-control` × `input`).
- Recolher o que está listado no item 4 (recolher, não remover).

**Parado aguardando seu ok.** Nenhuma linha de código de tela foi escrita.
