# Roteiro de teste do preview — reforma do frontend + pacotes de backend

Como testar a branch `refactor/frontend` no preview
(`refactor-dev.jrfluxy.com.br`), pacote a pacote e perfil a perfil.

**Pré-condição que muda tudo:** o frontend publica sozinho a cada push, mas os
pacotes de backend (B0–B6) só ficam ativos depois que o responsável subir o
`backend-dev` com este código e rodar as migrations (roteiro em
`docs/MIGRACAO-PARA-OFICIAL.md`, seção "MIGRATIONS DO PORTE"). **Antes disso**,
a tabela "O que o preview mostra ANTES…" daquele documento descreve o
comportamento esperado — degradações são esperadas, não bugs.

Perfis usados abaixo (contas de teste, nunca dados reais desnecessários):

| Sigla | Perfil |
|---|---|
| SA | SUPERADMIN |
| ADM | Usuário de setor administrativo |
| USR | Usuário comum de setor (regra mista por tipo) |
| GEO | Usuário do GEO ou da Gerência de Processos |
| OBR | Usuário de setor de obra (obras vinculadas) |
| FIN | Usuário do financeiro |
| CMP | Usuário do setor de compras (escopo global de obras) |

---

## 0. Fumaça geral (qualquer perfil) — Ondas 1–2

1. Login → cai na **Home por cards** (hub). Tema claro/escuro alterna e persiste.
2. Navegar 3+ hubs de módulo; breadcrumb correto; **nenhuma tela antiga sumiu**
   (amostra: Solicitações, Financeiro → Contas a Pagar, Fiscal → Documentos,
   RH/DP → Colaboradores, Configurações).
3. Telas novas do oficial acessíveis pelos cards: RH/DP → Pessoal e Jornada;
   Configurações → Formas da Nova Solicitação; SA vê Cartões de Recarga.
4. Detalhe de uma solicitação: blocos na ordem padrão; no celular vira abas
   (Detalhes/Conversa/Financeiro/Histórico); "Personalizar layout" arrasta e
   oculta blocos.
5. Card **Conversa**: enviar só texto, só arquivo e os dois juntos; menção a
   usuário; fora do próprio setor o card vira somente leitura com o motivo.
6. Cabeçalho do detalhe: "Ver todos os campos (N vazios)" revela e oculta;
   campos de contrato não aparecem numa compra nem com o alternador ligado.
7. DevTools: todas as chamadas vão para `api-dev.jrfluxy.com.br`; nenhum erro
   de CORS; nenhuma credencial em variáveis `VITE_*`.

## B0 — Handlers de processo (efeito no servidor; conferido pelo responsável)

- Provocar um erro de consulta numa tela → log `[unhandledRejection]` com stack
  e o backend segue de pé (antes: caía para todos).

## B1 — Preferências por usuário (a base da personalização)

Com qualquer perfil (repetir com um segundo usuário para provar o isolamento):

1. Solicitações: mudar colunas, larguras, modo tabela⇄cards, paginação⇄rolagem
   e agrupamento → **recarregar a página** → tudo mantido.
2. Salvar um filtro nomeado; recarregar; aplicar; excluir. Limite: 31º filtro é
   recusado com mensagem.
3. Personalizar Home e detalhe (ordem/ocultar/largura) → recarregar → mantido.
4. Fixar atalhos (estrela) na barra do topo → recarregar → mantidos.
5. Entrar com o SEGUNDO usuário → nada disso o afeta (preferências são por
   usuário).

## B2 — Busca universal (Ctrl+K)

| Perfil | O que conferir |
|---|---|
| SA | Encontra obras, parceiros, contratos, títulos, colaboradores, usuários e solicitações |
| USR | NÃO recebe grupos das telas que não vê (ex.: sem financeiro → sem grupo Títulos); só encontra solicitações que a própria lista mostraria |
| OBR | Grupo Obras traz só as obras vinculadas |
| FIN | Títulos apenas das obras do escopo financeiro |

- 1 caractere → nada; 2+ → resultados; termo com cara de código ("SOL 5109",
  "sol5109", "5109") acha o mesmo registro e sobe grupos com código.
- Por código, acha solicitação **arquivada/cancelada** com o selo correto.

## B3 — Lista de Solicitações e pendências da Home

**Lista** (USR, ADM, GEO, OBR):

1. Visões: Minhas pendências / Fila do setor / Vencendo / Atrasadas / Todas —
   **o contador de cada aba bate com as linhas exibidas** (é o critério do
   `valida-pendencias.js`; qualquer divergência é bug, não ajuste).
2. Busca única no campo (código, descrição, obra, fornecedor) — sem o aviso
   "só registros carregados", que sumiu com o B3.
3. Ordenar por coluna (valor, vencimento, código) asc/desc; sem clicar em
   nada, GEO continua vendo a fila por última movimentação (updatedAt).
4. USR: a lista respeita a regra mista por tipo; GEO×Gerência: usuário da
   Gerência vê demandas persistidas como GEO e vice-versa.
5. Filtros avançados continuam funcionando como antes (datas, valores, setor).

**Home** (cada perfil vê o seu recorte):

6. Cartões com números reais; **clicar num cartão abre exatamente o conjunto
   contado** (?visao=...). Conferir pelo menos: aprovações aguardando,
   paradas no setor, devoluções recebidas.
7. "Para resolver agora": até 8 itens, danger antes de warning.
8. FIN: cartões de títulos vencidos/vencendo e resumo "A pagar no mês, por
   obra" — o link abre a lista com o MESMO recorte (status EM_ABERTO,
   obra, período).
9. Compras: CMP vê a fila global de liberadas; OBR vê **apenas** as das suas
   obras — e o link abre a lista mostrando o mesmo conjunto.

## B4 — Configuração por setor (ADM/SA com área status_vinculos)

1. Configurações → Ação Principal por Setor: mapear setor+estado → botão em
   destaque aparece no cabeçalho do detalhe daquele setor/estado; secundárias
   ficam visíveis na mesma barra (R36); sem mapeamento, botões de sempre.
2. Atalhos por Setor: definir sugeridos + 2 obrigatórios (o 3º obrigatório é
   recusado); usuário novo do setor recebe os padrões; obrigatório não pode
   ser removido pelo usuário; a personalização própria continua por cima.
3. Layout do Detalhe por Setor (telas detalhe e home): definir ordem/ocultos →
   usuário do setor SEM camada própria herda; usuário COM camada própria não
   é afetado.

## B5 — Tela inicial

1. Na tela desejada, clicar na "casinha" do topo → sair e logar de novo → o
   login cai lá. Clicar de novo → volta a cair na Home.
2. Perfil → card "Tela inicial" mostra e altera a mesma escolha.
3. Fail-closed (com ADM): remover do usuário a permissão da tela escolhida →
   próximo login cai na Home em silêncio e a preferência é limpa.

## B6 — Blocos opcionais da Home

1. Personalizar → "Adicionar bloco": catálogo completo (Trabalho, Financeiro,
   Obras e Compras, Institucional) — cada perfil só vê blocos das telas que
   pode ver (FIN vê os financeiros; OBR não vê "Saldo dos caixas").
2. Ativar "Últimas que você tocou", "Aguardando resposta" e "Mudou hoje" →
   dados coerentes com o próprio histórico; recarregar → blocos persistem (B1).
3. FIN: gráfico de contas a pagar, calendário de vencimentos, saldo de caixas
   e gasto do mês — os links abrem as telas com o mesmo recorte.
4. OBR: "Compras pendentes" mostra só as das obras vinculadas.

---

## Checklist de encerramento

- [ ] Nenhuma chamada para `api.jrfluxy.com.br` (produção) no DevTools
- [ ] Nenhum erro de CORS/403 por origem
- [ ] Anexos abrem pelo ambiente dev
- [ ] `valida-pendencias.js` rodado exclusivamente no banco dev autorizado,
      com `ALLOW_DEV_TEST_WRITES=true` e 100% dos cartões batendo
- [ ] Segunda execução de `npm run migrate` não aplica nada
