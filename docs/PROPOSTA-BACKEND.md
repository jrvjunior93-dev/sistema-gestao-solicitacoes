# Proposta de backend para a reforma do frontend

Documento de alinhamento para o responsável do projeto
(`jrvjunior93-dev/sistema-gestao-solicitacoes`).

**Resumo em uma frase:** a reforma visual funciona quase toda só com frontend, mas cinco
funcionalidades precisam de apoio do backend — todas **aditivas** (nenhum endpoint,
permissão ou regra de negócio existente muda), num total de **6 tabelas novas, 1 coluna em
tabela nova e 3 índices**, mais **duas correções de bug** que interessam mesmo sem a
reforma.

Data: 2026-09-01 · Autor: Sávio (savioleal12@gmail.com)

---

## Resumo executivo

| # | Funcionalidade | O que precisa no backend | Sem isso, o usuário perde |
|---|---|---|---|
| 1 | Correção de bug | 1 ajuste pontual (sem tabela, sem endpoint) | Estabilidade: o servidor cai com erro assíncrono não tratado |
| 2 | Preferências de usuário | 2 tabelas + 5 rotas CRUD (só do próprio usuário) | Toda personalização (colunas, filtros salvos, layout da Home/detalhe, atalhos, tela inicial) — ou ela fica presa ao navegador/máquina |
| 3 | Pendências da Home | 1 endpoint de leitura + 1 parâmetro novo nas listas | A Home vira só um menu: sem "Para resolver agora", sem cartões com números que abrem exatamente o que contam |
| 4 | Busca universal (Ctrl+K) | 1 endpoint de leitura + 3 índices | Ctrl+K só navega para telas; não encontra solicitações, contratos, títulos, obras nem parceiros |
| 5 | Blocos opcionais da Home | 1 endpoint de leitura | O catálogo "Adicionar bloco" fica só com os blocos básicos |
| 6 | Configuração por setor (admin) | 3 tabelas + 3 CRUDs gateados pela config existente | Admin não define padrão por setor (atalhos, layout, ação principal); cada usuário configura tudo do zero |
| 7 | Tela inicial do usuário | 2 rotas + validação server-side | Usuário não escolhe onde o login cai — ou a validação fica só no cliente (risco) |

Princípios seguidos em tudo:

- **Nenhuma permissão nova.** Cada consulta reusa o gate da tela correspondente
  (quem não vê a tela, não vê o dado — nem pela busca, nem por bloco, nem por cartão).
- **Nenhuma alteração de contrato existente.** Só adição de rotas e de parâmetros
  opcionais; o frontend atual continua funcionando durante a transição.
- **Migrations no padrão do projeto**: aditivas, idempotentes (guardas
  `tableExists`/`columnExists`/`indexExists` do `schemaUtils`), colunas sempre nullable.
  Sei que a regra é "nenhuma migration" — este documento existe exatamente para alinhar
  essa exceção; sem ela, os itens 2, 6 e parte do 4 não existem.

---

## 1. Correção de bug (independente da reforma)

Interessa ao projeto mesmo que nada da reforma visual seja aprovado.

> **Item 1a retirado da proposta (02/09/2026).** A proposta original incluía
> `tableName` explícito nos models `Comprovante` e `Obra`. A verificação no
> repositório oficial mostrou que **não era bug do sistema, e sim adaptação ao
> ambiente local onde a reforma foi desenvolvida** (tabelas minúsculas): no
> servidor oficial a tabela física é `Obras`, com maiúscula, a pluralização
> padrão do Sequelize já casa com o banco real, e o fix teria **quebrado as
> telas de obras no deploy**. O oficial trata a variação de nome físico nas
> migrations, via `resolveTableName`. Registro completo no aviso da seção C3
> de `docs/MIGRACAO-PARA-OFICIAL.md`.

### 1b. Handlers globais de processo (`server.js`) — ajustado pelo responsável (02/09)

**Bug:** erros que escapam do tratamento normal podem encerrar o processo sem um log
claro ou deixá-lo em estado indefinido.

**Correção final:** `unhandledRejection` e `uncaughtException` registram a stack e
encerram com `process.exit(1)`, permitindo que o PM2 suba uma instância limpa. Uma
rejeição esperada de tela deve ser capturada pelo controller/middleware; ao alcançar o
handler global, ela já não pode ser classificada com segurança como falha isolada.

Falha durante o **boot** continua encerrando o processo (comportamento correto).
**Impacto de não ter:** quedas intermitentes do backend em produção com causa difícil de
rastrear — ou, pior, um processo corrompido de pé respondendo errado.

---

## 2. Preferências de usuário (a fundação de toda a personalização)

**O que entrega:** tudo o que o usuário personaliza fica no banco, por usuário —
colunas e larguras das listas, modo tabela/cards, paginação ou rolagem, agrupamento,
filtros nomeados salvos, layout da Home e do detalhe (ordem, blocos ocultos, larguras),
atalhos fixados e a tela inicial. Sobrevive a troca de máquina e limpeza de cache.

**O que precisa existir:**

- Tabelas `usuario_lista_preferencias` (JSON de preferências por usuário+chave) e
  `usuario_lista_filtros` (filtros nomeados por usuário+lista).
- Rotas `GET/PUT /listas/:lista/preferencias` e `GET/POST/DELETE /listas/:lista/filtros`
  — **sempre e somente do usuário autenticado**; não há como ler ou escrever preferência
  de outra pessoa.

**Impacto de não ter:** ou a personalização morre, ou cai para `localStorage` — preso ao
navegador, some ao limpar cache, não acompanha o usuário. É o pacote mais barato e o que
mais recursos destrava (itens 6 e 7 reusam a mesma tabela).

---

## 3. Pendências da Home ("Para resolver agora" e cartões com números reais)

**O que entrega:** ao entrar, o usuário vê exatamente o que espera por ele — solicitações
paradas no setor, aprovações pendentes, devoluções recebidas, títulos vencendo/vencidos —
com contadores reais, e **clicar num cartão abre exatamente o conjunto contado**, nem um
registro a mais ou a menos.

**Como é garantido:** contador e lista usam **o mesmo recorte SQL**, num serviço único
(`pendenciasVisoes`). A lista aceita `?visao=nome-da-visao`, que só **restringe** o escopo
que o usuário já tem (nunca amplia; visão desconhecida responde 400). Validado com script
de conferência contra banco real: 7 de 7 cartões batem com as listas, incluindo cenário
com 70 aprovações.

**O que precisa existir:**

- `GET /dashboard/pendencias` (só leitura; cada contador gateado pela permissão da tela
  de destino).
- Parâmetro opcional `visao` na lista de Solicitações (e o equivalente nos títulos:
  aceitar o status composto `EM_ABERTO` = PREVISAO+ABERTO+PARCIAL, os mesmos três status
  que o contador soma).
- Nenhuma tabela nova.

**Impacto de não ter:** a Home vira apenas navegação; a promessa central da reforma — "o
sistema te mostra o que fazer, em vez de você caçar" — não existe. Pior alternativa seria
o frontend reconstruir os filtros por conta própria: foi exatamente assim que surgiu o bug
que encontramos ("61 aprovações" abrindo uma lista de 3.590 registros); o desenho por
visão nomeada elimina essa classe de erro por construção.

---

## 4. Busca universal (Ctrl+K)

**O que entrega:** um único campo (Ctrl+K) que encontra solicitações, contratos, títulos
financeiros, obras e parceiros por código, descrição ou nome — além das telas e ações, que
já vêm do frontend.

**Regras de segurança e desempenho já embutidas:**

- Grupo sem permissão **nem é consultado**; cada grupo reusa literalmente a regra de
  visibilidade da tela correspondente. O usuário só encontra o que já poderia ver na
  lista — qualquer divergência entre busca e lista é tratada como bug.
- Toda consulta tem LIMIT (6 por grupo) e mínimo de 2 caracteres; nenhuma varredura sem
  teto. Para Solicitações (que têm filtro pós-SQL), leitura em janelas com teto de 120
  linhas — desenho que evita perder registros antigos.

**O que precisa existir:** `GET /busca` (só leitura) + 3 índices
(`obras.nome`, `parceiros.nome`, `parceiros.cpf_cnpj`) para a busca por texto não pesar.

**Impacto de não ter:** Ctrl+K continua útil para navegar, mas não localiza registros —
na prática o usuário volta a abrir a lista certa e filtrar na mão.

---

## 5. Blocos opcionais da Home

**O que entrega:** catálogo de 12 blocos que o usuário pode adicionar à Home (minhas
solicitações recentes, títulos a vencer, resumo por obra, pedidos em aberto etc.), com
carga sob demanda — só busca dado de bloco que o usuário ativou.

**O que precisa existir:** `GET /home/blocos/:bloco` (só leitura). Cada bloco reusa a
consulta e o gate de permissão da tela de origem via `authorizationService` — nenhuma
consulta inventa regra de visibilidade própria.

**Impacto de não ter:** a Home personalizável continua existindo, mas só com os blocos
básicos; o catálogo perde a maior parte do valor.

---

## 6. Configuração por setor (camada do administrador)

**O que entrega:** o admin define o **padrão por setor** — quais atalhos aparecem para
quem entra pela primeira vez, o layout padrão da Home e do detalhe da solicitação, e qual
é a ação principal do detalhe por setor+estado. O usuário sempre pode personalizar por
cima (camadas: usuário → setor → padrão do sistema).

**O que precisa existir:**

- Tabelas `setor_atalhos_padrao`, `setor_detalhe_layout` (com coluna `tela`, para servir
  Home e detalhe com o mesmo mecanismo) e `acoes_principais_setor`.
- CRUDs em `/configuracoes/atalhos-setor`, `/configuracoes/detalhe-layout` e
  `/configuracoes/acoes-principais` — leitura para autenticados (é metadado de
  interface), **escrita gateada pelo mesmo gate de configuração que o sistema já usa**
  (`allowConfiguracoesStatusVinculos`); nenhuma permissão nova.

**Impacto de não ter:** cada usuário novo recebe o padrão genérico e configura tudo
manualmente; o ganho de onboarding por setor se perde. É o item mais adiável dos sete.

---

## 7. Tela inicial escolhida pelo usuário

**O que entrega:** o usuário escolhe em que tela o login cai (ex.: direto em
Solicitações). Com segurança: a validação acontece **no backend**, contra a mesma fonte
única de navegação do frontend (compilada no build); se o usuário perder a permissão ou a
rota deixar de existir, o login cai na Home silenciosamente e a preferência é limpa
(fail-closed).

**O que precisa existir:** rotas `GET/PUT/DELETE /me/tela-inicial` + o catálogo compilado
da navegação (artefato gerado no build do frontend, sem dependência nova). Armazena na
tabela do item 2 — **nenhuma coluna em `users`**.

**Impacto de não ter:** recurso indisponível; a alternativa de validar só no cliente
permitiria gravar destino inválido ou sem permissão, o que rejeitamos.

---

## O que NÃO está sendo proposto

- **Nenhuma mudança em regra de negócio, fluxo de aprovação, permissão ou endpoint
  existente.** Os dois únicos toques em código existente de produto são o parâmetro
  opcional `visao`/`EM_ABERTO` (item 3) e as correções de bug (item 1).
- **Nada de ferramentas de desenvolvimento**: o login rápido por perfil
  (`DEV_QUICK_LOGIN`) e o CORS de rede local usados no ambiente de desenvolvimento deste
  trabalho **ficam de fora** do repositório oficial.

## Ordem sugerida de aprovação

1. **Item 1** (correção 1b) — pode ir já, risco baixíssimo.
2. **Item 2** (preferências) — destrava a personalização inteira e os itens 6 e 7.
3. **Itens 3 e 4** (pendências e busca) — o coração da experiência nova; só leitura.
4. **Itens 5, 6 e 7** — complementos, na ordem que convier.

Evidências disponíveis: capturas de todas as entregas (`outputs/capturas-*/`), script de
conferência cartão×lista (`backend/scripts/valida-pendencias.js`) e o inventário completo
com plano de porte em `docs/MIGRACAO-PARA-OFICIAL.md`.
