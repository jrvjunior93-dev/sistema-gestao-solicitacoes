# Telas compartilhadas — as que não pertencem a leva de módulo nenhuma

Categoria criada em 03/09, por decisão do cliente, depois que a
`ModuloRelatorios` entrou por engano no manifesto do RH/DP e gerou cinco
células FALHOU que não pertenciam àquela leva.

**O ponto cego que isto corrige:** o inventário estava organizado por
MÓDULO, e a leva de cada módulo pega as telas do módulo. Tela servida por
vários módulos — ou por nenhum — não é reivindicada por leva alguma e
escapa de todas. Não é um caso isolado: a varredura abaixo achou **oito
telas** nessa condição.

Critério de varredura (`App.jsx`, 208 rotas): componente de tela servido sob
prefixo de mais de um módulo, ou fora de qualquer prefixo de módulo.

---

## A. Servidas por VÁRIOS módulos (2)

| Tela | Arquivo | Módulos que a servem |
|------|---------|----------------------|
| **ModuloRelatorios** | `src/pages/ModuloRelatorios.jsx` | **9** — comercial, compras, contratos, crm, fiscal, provisões financeiras, RH/DP, solicitações, SST |
| **RelatoriosAdministrativos** | `src/pages/RelatoriosAdministrativos.jsx` | 2 — compras (`/compras/relatorios/auditoria`) e raiz (`/relatorios/administrativos`) |

**`ModuloRelatorios` é o caso-testemunha.** Um arquivo, um bloco de
configuração por módulo, nove entradas. Reescrevê-la muda a cara dos
relatórios de nove módulos ao mesmo tempo — e por isso ela nunca coube em
leva de módulo nenhuma.

**Migrada em 03/09.** `Pagina` + `PageHeader`, cartões em `BlocoConteudo`,
etiqueta com ícone além de cor, e a **D7 aplicada nos nove títulos de uma
vez** — o prefixo do módulo saiu de todos. Está no manifesto.

**Nota para o Financeiro:** o Financeiro **NÃO** usa a `ModuloRelatorios` —
tem hub próprio (`FinanceiroRelatorios`) e 11 relatórios só dele. É a única
exceção entre os módulos com relatórios.

## B. Servidas por DUAS famílias de rota, com um só dono aparente (2)

| Tela | Arquivo | Rotas |
|------|---------|-------|
| **ComunicacaoInterna** | `src/pages/ComunicacaoInterna.jsx` | `/comunicacao-interna` (no menu) e `/conversas/entrada`, `/conversas/saida`, `/conversas/:id` (fora do menu) |
| **ConfiguracoesContratoAlertasEFormas** | `src/pages/ConfiguracoesContratoAlertasEFormas.jsx` | `/configuracoes-formas-pagamento-solicitacao` (no menu, Configurações) e `/configuracoes-contrato-alertas` (fora do menu) |

Não são cross-módulo no sentido estrito, mas **têm entrada que nenhuma leva
reivindicaria**: a segunda rota de cada uma está fora do menu, e a leva do
módulo dono olharia só a primeira. A `ConfiguracoesContratoAlertasEFormas`
serve dois assuntos diferentes (alertas de contrato e formas de pagamento de
solicitação) a partir de Configurações.

**As duas migradas em 03/09**, e a suspeita que justificou a categoria se
confirmou nas duas — em ambas a segunda rota estava quebrada, e o dono
aparente nunca teria olhado:

- A `ConfiguracoesContratoAlertasEFormas` tinha o `<h1>` **fixo** em "Formas
  de pagamento da Nova Solicitação". Quem entrava pela rota dos alertas de
  contrato lia o título da outra configuração, sem nenhum sinal de qual
  assunto estava aberto. E ela serve **quatro** assuntos, não dois: limite
  jurídico do contrato, alerta de saldo, limites da Despesa Eventual e formas
  de pagamento.
- A `ComunicacaoInterna` **ignora o `:id`** de `/conversas/:id` — não importa
  `useLocation`, `useParams` nem `useNavigate`. Abrir `/conversas/123` mostra
  a caixa vazia. Entrada e saída são idênticas entre si. Registrado como E3 e
  E4 em `docs/PENDENCIAS-REGISTRADAS.md`, junto com três telas de conversa
  órfãs que navegam para essa rota quebrada.

Nenhuma dessas duas quebras é de layout, e nenhuma delas apareceria numa leva
de módulo. É o argumento da categoria, provado.

## C. Fora do shell da aplicação — sem módulo nenhum (4)

| Tela | Arquivo | Rota |
|------|---------|------|
| **Login** | `src/pages/Login.jsx` | `/login` |
| **RecuperarSenha** | `src/pages/RecuperarSenha.jsx` | `/recuperar-senha` |
| **DefinirSenha** | `src/pages/DefinirSenha.jsx` | `/definir-senha` |
| **CotacaoFornecedorPublica** | `src/modules/solicitacao-compra/pages/CotacaoFornecedorPublica.jsx` | `/cotacao/:token` |

Renderizam FORA do `Layout` (sem topbar, sem menu, sem breadcrumb), então
boa parte da DoD não se aplica como está escrita: não há faixa fixa presa à
topbar (C1/C2/X2), não há breadcrumb para situar (o que muda o argumento da
D6/D7). **Precisam de uma DoD própria antes de entrar no manifesto** — medi-las
com a régua das telas internas produziria FALHOU que não significa nada.

A `CotacaoFornecedorPublica` é a mais séria das quatro: é a única tela que um
**terceiro fora da empresa** usa (o fornecedor, por link com token), e tem 14
chamadas de caixa do navegador no trinco da R19.

---

## O que fazer com esta categoria

1. **Não entra em leva de módulo.** Nenhuma delas.
2. **A e B ganham leva própria** ("telas compartilhadas"), depois dos
   módulos — reescrever a `ModuloRelatorios` toca nove módulos de uma vez e
   é melhor fazer quando o padrão estiver assentado.
3. **C precisa de DoD própria antes de manifesto**, porque a régua atual
   pressupõe o shell.
4. **Toda leva de módulo, a partir de agora, declara na abertura quais telas
   compartilhadas o módulo usa** — para a contagem fechar e ninguém supor
   que a leva as cobre.
