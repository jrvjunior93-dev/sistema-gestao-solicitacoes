# Estado atual da `refactor/frontend`

Fotografia geral revisada em 30/09/2026 contra `ca6ac22a`. Adendo de
03/10/2026: `refactor/frontend` em `8e2afc13` e `main` em `250b6520`,
conforme referencias remotas consultadas. Revalidar imediatamente antes da
integracao; a branch pode avancar.

## Finalidade da branch

`refactor/frontend` e a linha ampla de homologacao do Fluxy. Apesar do nome, contem
frontend, backend, migrations, testes e documentacao. Nao e uma branch exclusivamente
visual. A promocao para `main` precisa reconciliar os hotfixes exclusivos da producao.

Na fotografia:

- base comum: `6e620310`;
- `main`: `e2b8d3db`;
- `refactor/frontend`: `ca6ac22a`;
- divergencia: 49 commits exclusivos de `main` e 562 da refatoracao;
- intervalo base → refatoracao: 1.303 arquivos alterados.

Esses numeros devem ser recalculados antes de qualquer promocao.

Em 03/10/2026, a base comum ainda era `6e620310`, com **52** commits
exclusivos de `main` e **580** de `refactor/frontend`. Depois da fotografia
geral de 30/09, entraram autorizacao movel de pagamentos (homologada em
`PILOT` em dev, mas manter `OFF` na producao), correcoes de RH/DP, contatos
adicionais e a jornada gerencial v2 (flags desligadas, sem homologacao integrada).
O modulo RH/DP documenta o estado atual em `modulos/rh-dp/README.md`; os
detalhes de implantacao e os bloqueios estao no guia pos-deploy.

## Estrutura do repositorio

```text
backend/       API, dominio, migrations, scripts e testes
frontend/      aplicacao web React/Vite e empacotamento Capacitor
mobile/        aplicativo Expo/React Native
legal-pages/   paginas juridicas estaticas
docs/          documentacao canonica, historica e workspace
outputs/       artefatos locais nao versionados; preservar
```

Entrypoints e arquivos de alto risco:

- `backend/server.js`;
- `backend/src/app.js`;
- `backend/src/routes.js`;
- `backend/src/middlewares/auth.js`;
- `frontend/src/App.jsx`;
- `frontend/src/layout/Layout.jsx`;
- `frontend/src/contexts/AuthContext.jsx`;
- `frontend/src/pages/NovaSolicitacao.jsx`;
- `frontend/src/pages/Solicitacoes/index.jsx`.

Eles exigem ownership exclusivo quando houver mais de um agente.

## Runtime e schema

O backend carrega o ambiente, valida variaveis obrigatorias e verifica o schema em
modo somente leitura. Migration pendente impede o processo novo de iniciar; o processo
nao corrige o banco automaticamente.

Migrations:

- sao aplicadas por comando explicito com `ALLOW_SCHEMA_MIGRATIONS=true`;
- passam por bloqueio de DML antes e durante a execucao;
- devem ser idempotentes e exclusivamente estruturais;
- nao cadastram tipos, status, autorizadores ou dados funcionais;
- precisam resolver tipo de FK e nome fisico/case de tabela corretamente.

## Modulos de runtime

O catalogo possui 18 entradas. Dezessete possuem documento canonico e uma integracao
externa antiga permanece apenas como legado desabilitado. `SOLICITACOES` e a base;
dependencias incluem Cotacoes → Compras, Boletos → Financeiro e Provisionamento →
Financeiro + Obras.

Chave de modulo desconhecida ainda tem fallback permissivo por compatibilidade. Novo
modulo precisa ser registrado no catalogo, sessao, backend, frontend, permissoes e
documentacao; nunca deve usar o fallback como ativacao.

## Autenticacao e autorizacao

- autenticacao por JWT/cookie de sessao conforme o fluxo atual;
- CSRF e identificador de sessao de auditoria nas mutacoes aplicaveis;
- matriz central: 19 grupos, 105 areas e 367 permissoes;
- decisao efetiva combina modulo, perfil, permissao granular, capacidade do setor,
  escopo de obra e acesso ao recurso;
- `SUPERADMIN` e `BusinessAdmin` possuem compatibilidades amplas em fluxos existentes,
  mas novos atos sensiveis podem e devem desativar bypass explicitamente;
- a troca de usuario de desenvolvimento registra ator e usuario efetivo e deve estar
  desativada em producao.

## Solicitacoes

A solicitacao comum exige origem configurada e tipo permitido. O backend deriva o
destino inicial `GEO / PENDENTE`; o frontend nao escolhe a area responsavel inicial.

Catalogo:

- Obras usam tipos marcados como disponiveis para obras;
- Centros de Custo usam vinculos explicitos;
- alguns Centros de Custo possuem tipo automatico e distribuicao gerencial por obra;
- campos e formas de pagamento sao resolvidos por tipo/subtipo no backend e frontend.

### Cadastro de Obra

E uma excecao estrutural documentada: abre sem obra/centro de custo existente. Campos
atuais obrigatorios incluem nome resumido, tipo, fase, valor monetario, responsavel
tecnico em texto, endereco e ao menos um usuario ativo com acesso. Planilha e obrigatoria
na fase `OBRA_INICIADA`; em `PRE_OBRA`, a pendencia documental permanece registrada.

Depois da aprovacao, usuario com `obras.cadastro.gerenciar` pode abrir o modal definitivo
pre-preenchido. A criacao e transacional, idempotente e vincula os usuarios selecionados.

## Obras e Custos e Recebiveis

Obras e dona do cadastro, classificacao, acessos e apropriacoes. Custos e Recebiveis e
um modulo separado, com autorizacao fechada, que consome dados de Obras, Financeiro,
Compras, RH/DP e Contratos.

Os prazos documentais do modulo podem bloquear operacoes da obra. Consumidores devem
validar o bloqueio no backend; ocultar a acao na tela nao e suficiente. O README do
modulo registra exatamente quais fluxos sao bloqueados e quais usuarios veem cada recorte.

## Contratos

Contratos operacionais nao se confundem com contratos de venda do Comercial.

Dois fluxos coexistem:

- legado: medicao como solicitacao e possiveis titulos/pagamentos historicos;
- novo: contrato, parcelas, medicoes e titulos com vinculos explicitos.

A gestao operacional calcula status em consulta, exibe contratado, saldo, aditivos,
medicoes, solicitacoes e titulos. Rescisao cancela apenas saldo nao medido e preserva
titulo/parcela com medicao ou movimento.

Novo pedido de aditivo exige documento de Negociacao Detalhada `.pdf` ou `.docx`,
armazenado por aditivo. Historicos anteriores sem esse arquivo continuam validos.

## Compras, cotacoes e pedidos

Solicitacao de compra passa por revisao GEO e segue para Compras. Cotacao usa tokens
por fornecedor e escopo de itens. Fechamentos parciais sao permitidos sem justificativa
obrigatoria e preservam saldo. Cancelamento de pedido precisa liberar alocacoes e itens
para novo fechamento/remanejamento; o reparo historico possui script com simulacao.

Financeiro do pedido, frete, parcelas, apropriacoes e fiscal sao consumidores criticos.
Mudanca em cancelamento ou quantidade precisa validar todos eles.

## Financeiro

Financeiro e dono de titulos e movimentos. Origens operacionais nunca gravam realizado
diretamente.

Fluxos principais:

- contas a pagar/receber e baixas simples/compostas;
- fila manual de pagamentos com idempotencia e locks;
- comprovantes PDF assistidos;
- cheques de terceiros e cheques de contratos de venda;
- caixas, contas, conciliacao OFX e estornos;
- DRE, resultado de obras e fluxo de caixa.

No fluxo de caixa, previsto usa titulos e realizado usa movimentos ativos. Comparativo
usa a mesma data de corte. Periodos passados e futuros estao disponiveis.

A autorizacao do proprietario por PWA/passkey esta implementada localmente sob a flag
backend `PAYMENT_OWNER_APPROVAL_MODE`, cujo padrao seguro e `OFF`. Nesse modo a tela nao
aparece e a fila legada permanece inalterada. Migration, configuracao e homologacao
`PILOT` ainda nao foram executadas.

## RH/DP

O modulo controla colaboradores, lotacao, jornada, apuracao, eventos recorrentes e
pagamento de mao de obra. Usuario de Obra ve somente colaboradores/eventos das obras
vinculadas. DP decide solicitacoes e administra o cadastro completo.

Jornadas multiobra sao enviadas por cada obra e consolidadas pelo DP. Mensalistas e
diaristas usam regras diferentes; faltas sao informativas no calculo atual. Ticket e
empreitada possuem fluxos proprios documentados no README do modulo.

## Comercial

Comercial administra empreendimentos, unidades e contratos de venda. Titulos a receber
sao do Financeiro. Pagamento de contrato por cheque deve quitar o titulo na origem e
manter o cheque em carteira; devolucao reabre a obrigacao conforme o vinculo existente.

Importacoes de contratos/extratos possuem validacao previa e nao gravam parcialmente em
erro. Scripts de backfill/aplicacao exigem confirmacao explicita.

## Painel do Gestor

Consolida Resultado de Obras, Custos e Recebiveis e saldos. Possui preferencias por
usuario, Modo TV, ordenacao e olho de privacidade com PIN. Fechar o olho faz o backend
retornar valores nulos e bloqueia gravacao de saldo, mas nao substitui controle de acesso.

## Documentacao e testes

O backend possui scripts especificos por dominio. Antes de alterar, consulte
`backend/package.json`. O frontend executa build, provas de layout, navegacao,
responsividade e regressao de fluxos especificos.

Validacao documental:

```bash
cd backend
npm run test:docs
```

## Pendencia de homologacao

A autorizacao do proprietario antes da fila, por PWA, passkey e push, esta implementada
e desligada. O proximo passo e implantar schema/configuracao em dev com modo `OFF`, rodar
o preflight e somente depois homologar `PILOT`. Documento:
`../modulos/financeiro/AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md`.
