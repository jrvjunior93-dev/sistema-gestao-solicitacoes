# Pendências registradas — o que NÃO foi corrigido, e por quê

Achados que apareceram durante as levas e ficaram deliberadamente de fora do
escopo, por decisão do cliente. Este arquivo existe para que nenhum deles se
perca no meio de um relatório antigo.

---

## Para o responsável pela REGRA DE NEGÓCIO (não é decisão de layout)

Decisão do cliente em 02/09: registrar e levar ao responsável; **não
corrigir**, porque é regra dele.

### N1 — `data_admissao` sobrescreve `data_inicio` ao salvar colaborador
- **Onde**: `frontend/src/pages/RhDpColaboradores.jsx`, função `buildPayload`.
- **O que acontece**: o payload preenche `data_inicio` com
  `form.data_admissao`, ignorando `form.data_inicio`. O `toFormData` carrega
  os dois campos separadamente e o `onChange` da data de admissão escreve nos
  dois; então um registro que venha do banco com `data_inicio ≠
  data_admissao` **perde a data de início em silêncio** no primeiro salvar.
- **Desde quando**: anterior à leva do RH/DP. Nada nesta leva mudou o
  comportamento.
- **Por que não corrigimos**: qual das duas datas manda é regra de negócio.

### N2 — `codigo_ref` não existe no modelo de linha de importação
- **Onde**: `frontend/src/pages/RhDpImportacoes.jsx`, `getLinhaColaboradorCodigo`
  lê `linha?.codigo_ref`.
- **O que acontece**: `backend/src/models/RhImportacaoLinha.js` só tem
  `matricula_ref`, `cpf_ref` e `nome_ref`. Não quebra nada (há cadeia de
  fallback), mas é campo morto — ou o modelo deveria ter o campo, ou a
  leitura sobra.

### N3b — Status `SUBSTITUIDA` existe no banco e não pode ser filtrado
- **Onde**: `backend/src/services/rhJornadaFormularioService.js` grava
  `status: 'SUBSTITUIDA'` em `rh_importacoes`, mas `RH_STATUS_IMPORTACAO`
  (`backend/src/validators/rhValidators.js`) só aceita
  `PREVIEW | CONFIRMADA | CANCELADA` na consulta.
- **O que acontece**: existe lote que APARECE na lista e **não pode ser
  filtrado** — acrescentar a opção ao filtro faria o servidor recusar a
  consulta. A tela trata `SUBSTITUIDA` só na exibição.
- **Precisa de decisão**: ou o validador passa a aceitar `SUBSTITUIDA`, ou o
  formulário de jornada grava outro valor. É contrato de API, não layout.

### N3 — Líquido apurado maior que o bruto (a conferir)
- **Onde**: aba Apuração do Pessoal, ladrilhos de resumo. No preview de
  02/09: **BRUTO FILTRADO R$ 13.710,97** e **LÍQUIDO FILTRADO R$ 15.070,97**.
- **Status**: não sei dizer se é defeito ou se o "líquido" soma algo que o
  "bruto" não contém. Nada nesta leva tocou o cálculo. Precisa de quem
  conhece a regra da folha.

---

## Para uma LEVA PRÓPRIA de texto e consolidação

Decisão do cliente em 02/09: registrar; não tocar agora.

### T1 — Quatro textos diferentes para o mesmo evento
As telas de configuração de setores dizem, todas para o mesmo "salvou":
- "Configuracao salva com sucesso" (AreasObra, SetoresVisiveisUsuario)
- "Configuracao salva com sucesso." (TiposCompartilhadosSetor)
- "Configuração salva com sucesso." (SetoresCriacaoTodasObras)
- "Configuração salva." (TiposSolicitacaoPorSetor)

Com e sem acento, com e sem ponto. Padronizar o TEXTO vem antes de pensar em
componente compartilhado.

### T2 — Quatro telas de setores são quase o mesmo arquivo
`AreasObra`, `SetoresVisiveisUsuario`, `SetoresCriacaoTodasObras` e
`TiposCompartilhadosSetor` têm a mesma estrutura: `PageHeader` com ação
"Salvar" + `BlocoConteudo` com grade de caixas de setores, cada uma com sua
própria normalização `String(x).toUpperCase()`. Se sair um componente
compartilhado, é **"seleção de setores com salvar"** — não um invólucro só
de aviso.

### T3 — Acentuação ausente em textos visíveis, módulo RH/DP
Vários rótulos e mensagens do módulo estão sem acento ("Solicitacoes",
"Apuracao", "Matricula", "Observacoes"). A leva corrigiu apenas onde já
estava reescrevendo a linha; o resto ficou.

---

### T3b — CSS órfão deixado pelas migrações
Classes sem nenhum consumidor no JSX, sobradas da troca por
`BlocoConteudo`/`TabelaPadrao`/`StatGrid`. Não apagadas porque o `index.css`
não era escopo de nenhum agente da leva:
- `frontend/src/index.css` ~10327-10435: `.rhdp-importacoes-list-card`,
  `.rhdp-importacoes-detail-card`, `.rhdp-importacoes-lotes-wrapper`,
  `.rhdp-importacoes-lotes-table` (com cinco `nth-child` de largura),
  `.rhdp-importacoes-lote-file`, `.rhdp-importacao-summary-grid`,
  `.rhdp-importacao-preview-table`.
- `frontend/src/index.css` ~9966-10150: bloco `.rhdp-apuracao-*`.
- `frontend/src/index.css` ~11869-11899: `.rh-pessoal-alerta*`.
- `frontend/src/index.css`: `.rh-colaboradores-filter-card`,
  `.rh-colaboradores-actions`, `.rh-colaborador-form-card`,
  `.rh-colaboradores-table thead th`.
  **Atenção**: `.rh-colaboradores-filter-grid` continua VIVA (Jornada e
  Pessoal ainda a usam) — não apagar essa junto.

### T4 — `ModuloRelatorios.jsx` nunca foi migrada (hub de TODOS os módulos)
- **Rota que a expõe no RH/DP**: `/rh-dp/relatorios`.
- **O que é**: hub de cartões compartilhado por SEIS módulos (solicitações,
  financeiro, CRM, SST, comercial e RH/DP), cada um com seu bloco de
  configuração dentro do mesmo arquivo.
- **Estado**: fora do padrão — não usa `Pagina`, `PageHeader` nem
  `.app-bloco`; é Tailwind à mão. A faixa não gruda (X2), o cabeçalho não é
  `.app-page-header` (C1/C2/C5) e não há bloco padrão (B1).
- **Por que saiu do manifesto do harness em 02/09**: eu a coloquei lá por
  engano ao abrir a Etapa B — a rota começa com `/rh-dp`, mas o arquivo não
  é do RH/DP e ninguém o reescreveu nesta leva. As cinco células FALHOU que
  ela gerava não pertenciam à leva, e a matriz as apresentava como se
  pertencessem. Retirada com justificativa, por decisão do cliente.
- **Achado extra**: o título renderiza **"Relatorios de RH/DP"** — o prefixo
  que a D7 mandou tirar sobrevive aqui porque a tela está fora do escopo.
- **Quando volta**: na leva que reescrever o hub de relatórios. Aí ela
  volta ao manifesto e a D7 se aplica a todos os módulos de uma vez.
- **RESOLVIDO em 03/09**, na leva das telas compartilhadas. Ela entrou no
  manifesto, e a D7 caiu nos NOVE títulos de uma vez (eram nove módulos, não
  seis: a contagem original subestimava). Este achado foi o que expôs o ponto
  cego do inventário e deu origem à categoria `telas_compartilhadas`.

---

## Achado que a leva corrigiu e vale registrar: contraste nunca medido no escuro

Ao perseguir uma célula M3 marginal (4,4996:1 contra o mínimo de 4,5), o
que apareceu foi maior que o sintoma:

1. **Dois tokens para o mesmo papel, com valores diferentes.**
   `--app-muted-color` (#64748b, o slate-500 do Tailwind) e `--c-muted`
   (#5f6e83, o do sistema). O primeiro dava 4,51:1 — passava por 0,01 e
   reprovava assim que a superfície mudava um fio. Unificados no valor do
   sistema (4,92:1). É a R16 outra vez: um dono por responsabilidade.
2. **`--app-subtle-color` reprovava o AA nos DOIS temas, e é usado em
   texto.** Claro: 3,81:1. **Escuro: 3,02:1** — pior, e ninguém tinha
   medido o tema escuro até aqui. Corrigidos para 4,63 e 5,12.

**A lacuna de processo que isto expõe**: o harness roda só no tema claro.
Um token pode passar no claro e reprovar no escuro sem que a matriz saiba —
foi exatamente o caso do `--app-subtle-color`. Medir o M3 nos dois temas é
trabalho para a próxima leva do harness.

## Perdas declaradas nesta leva

### P1 — "Todas as obras que eu enxergo"
O select de obra do Pessoal tinha uma opção vazia com esse rótulo, que
explicava que a lista é limitada pela permissão do usuário. A `BarraFiltros`
não mostra etiqueta quando nada está marcado, então o texto não tem onde
morar sem inventar um bloco. **Informação perdida**, registrada aqui.

### P2 — Tamanho dos contadores do Pessoal
Os contadores de alerta usavam `1.6rem` escrito à mão no `index.css`. Ao
virarem `StatGrid`/`StatTile`, passaram ao degrau do padrão. Decisão do
cliente em 02/09: **mantém o padrão**; se sentir falta no uso, revê.

---

## Telas sem porta de entrada, e rotas que apontam para o lugar errado

Achados da leva das telas compartilhadas (03/09). Nenhum é de layout: são
rotas e caminhos de chegada. Precisam de decisão do cliente — ou a tela
ganha entrada, ou a rota sai, ou vira redirecionamento (R20).

### E1 — `usuarios-permissoes-rh-dp` não tem entrada nenhuma na interface
- **Onde**: a rota existe em `frontend/src/App.jsx`. Só isso.
- **O que acontece**: não está no menu lateral, não está no hub de
  Configurações, e nenhuma tela do sistema linka para ela. Pelo Ctrl+K é
  impossível achar, porque a paleta é alimentada pelo mesmo
  `getVisibleItems(user)` do menu. A única forma de chegar é digitar a URL.
- **Consequência**: a tela foi migrada e está no manifesto, mas nenhum
  usuário chega nela pela interface.
- **Decisão pendente**: ganha entrada no menu ou no hub de Configurações, ou
  é código morto e sai junto com a rota.

### E2 — `/configuracoes-contrato-alertas` também só existe por URL
- **Onde**: rota em `frontend/src/App.jsx`. O menu
  (`navigationConfig.jsx`) e o hub (`Configuracoes.jsx`) apontam **só** para
  `/configuracoes-formas-pagamento-solicitacao`.
- **O que acontece**: alcançável apenas por URL digitada ou favorito antigo.
  Até esta leva, quem chegava por ela lia o título da OUTRA configuração — o
  título do `<h1>` era fixo. Isso a leva corrigiu; a falta de entrada, não.
- **Decisão pendente**: ganha entrada, ou vira `<Navigate>` para a outra
  (R20).

### E3 — `/conversas/:id` ignora o `:id` e nunca abre a conversa
- **Onde**: `frontend/src/App.jsx` manda `/comunicacao-interna`,
  `/conversas/entrada`, `/conversas/saida` e `/conversas/:id` para o MESMO
  componente, sem prop nenhuma. `ComunicacaoInterna.jsx` não importa
  `useLocation`, `useParams` nem `useNavigate`.
- **O que acontece**: abrir `/conversas/123` mostra a caixa vazia com
  "Selecione uma conversa". **O link não abre conversa nenhuma.** Entrada e
  saída também são idênticas entre si.
- **Decisão pendente**: ou a tela lê a rota (abrir a conversa do `:id`,
  recortar entrada e saída), ou as três rotas de `/conversas/*` saem do
  `App.jsx`.

### E4 — Três telas de conversa órfãs, e uma navega para a rota quebrada
- **Onde**: `frontend/src/pages/ConversasEntrada.jsx`, `ConversasSaida.jsx` e
  `ConversaDetalhe.jsx`. Compilam, e não estão em rota nenhuma — zero
  referências no projeto inteiro.
- **O que acontece**: `ConversasEntrada.jsx` e `ConversasSaida.jsx` fazem
  `navigate('/conversas/' + id, { state: { origemConversa } })`, e o `state`
  que `ConversaDetalhe.jsx` espera nunca é lido por ninguém. É o par do E3:
  alguém trocou a implementação e deixou as rotas velhas apontando para a
  tela nova.
- **Decisão pendente**: são código morto (e saem junto com o E3), ou a
  implementação a manter é esta e a `ComunicacaoInterna` é que sobra.

### E5 — O "painel administrativo" exige o módulo Compras habilitado
- **Onde**: `frontend/src/App.jsx` — as duas rotas
  (`/relatorios/administrativos` e `/compras/relatorios/auditoria`) têm o
  MESMO par de guardas: `<ModuloComprasRoute><ComprasRelatoriosRoute>`.
- **O que acontece**: `/relatorios/administrativos`, que se apresenta como
  painel central do administrador, não abre para quem não tem Compras.
- **Decisão pendente**: é permissão, não layout. Precisa do responsável.

### E6 — Duas rotas sem nó de menu, logo sem breadcrumb
- **Onde**: `/relatorios/administrativos` e `/compras/relatorios/auditoria`
  não têm nó em `navigationConfig.jsx`, então `findActiveNode` devolve `null`
  e o breadcrumb para em "Início".
- **Por que importa**: o argumento da D7 (remover o prefixo do módulo do
  título porque "o breadcrumb já situa") **não vale nestas duas** — não há
  breadcrumb. Por isso o assunto ficou explícito no apoio da faixa.
- **Decisão pendente**: registrar os nós de menu, ou aceitar o apoio da faixa
  como o sinal permanente.

---

## Nomes e agrupamentos que a leva não quis decidir sozinha

### A1 — "Relatórios Administrativos" mostra só auditoria de compras
- **Onde**: `frontend/src/pages/RelatoriosAdministrativos.jsx`.
- **O que acontece**: quem chega pelo cartão "Auditoria de compras" lê
  "Relatórios Administrativos". O conteúdo é **só** auditoria de itens de
  pedido de compra, mas o texto original diz que esta é "a primeira entrega"
  de um painel maior — renomear fecharia esse escopo.
- **Decisão pendente**: (a) renomear para "Auditoria de compras" e criar
  depois o painel administrativo de verdade; ou (b) manter o nome e registrar
  os nós de menu do E6.

### A2 — Quatro assuntos numa tela de configuração só
- **Onde**: `frontend/src/pages/ConfiguracoesContratoAlertasEFormas.jsx`.
- **O que acontece**: a tela reúne limite jurídico do contrato, alerta de
  saldo do contrato, limites da Despesa Eventual e formas de pagamento. O
  comentário do arquivo justifica dois ("mesma natureza"), mas "Limites da
  Despesa Eventual" não é configuração de contrato nem forma de pagamento.
- **Decisão pendente**: separar ou manter. A leva só nomeou os assuntos.

### A3 — Ordem dos blocos por rota de entrada
- **Onde**: mesma tela do A2.
- **O que acontece**: chegando pela rota do menu ("Formas da Nova
  Solicitação"), o bloco de formas é o **4º de 4** — era justamente isso que
  o botão "Ir para formas de pagamento" contornava, e esse botão saiu por
  R11/D6. A barra de cor agora marca o bloco certo, mas ele continua embaixo.
- **Decisão pendente**: reordenar por rota é arranjo por tela, e a leva não
  inventa arranjo. É decisão do cliente.

### A4 — Eyebrow com o nome do módulo na `ModuloRelatorios`
- **Onde**: `frontend/src/pages/ModuloRelatorios.jsx`.
- **O que acontece**: era um `<p>` em caixa alta acima do `<h1>`. O
  `PageHeader` não tem slot de eyebrow, e `children` renderizariam uma
  segunda linha que a faixa compacta não comporta (C2). O texto foi para o
  apoio da faixa e continua visível, inclusive compactado.
- **Proposta da leva**: remover de vez — com a D7 aplicada, é literalmente a
  mesma informação do breadcrumb, e `modulo` viraria só chave interna.
- **Decisão pendente**: do cliente.

### A5 — Grupo "Próximas visões" de Compras nasce vazio
- **Onde**: `frontend/src/pages/ModuloRelatorios.jsx`, `itens: []`.
- **O que acontece**: antes renderizava um bloco em branco com "0 visoes".
  Agora mostra a razão dentro do bloco ("Nenhuma visão disponível para o seu
  acesso neste grupo."), o que também cobre o caso de perfil sem permissão.
- **Decisão pendente**: esconder grupo sem item, ou preencher com o que está
  planejado para Compras.

---

## Comportamentos que a leva encontrou e deixou como estavam

### C1 — Cor da etiqueta derivada da rota, não do status
- **Onde**: `frontend/src/pages/ModuloRelatorios.jsx`.
- **O que acontecia**: a cor era "verde se tem rota" (`item.to`), não
  `item.status`. Nos nove módulos os dois coincidem hoje, então não havia
  sintoma — mas o primeiro item com `status: 'Disponivel'` e rota ainda não
  publicada sairia errado. A leva tornou a derivação explícita e nomeada.
- **Decisão pendente**: trocar a fonte da verdade para `status` é mudança de
  comportamento, e não foi feita por conta própria.

### C2 — `carregarLista` engole todo erro em silêncio
- **Onde**: `frontend/src/pages/ComunicacaoInterna.jsx` — `catch {}` em
  `carregarLista`, `abrirConversa` e `carregarMais`.
- **O que acontece**: se a API cair, a tela mostra "Nenhuma conversa" —
  indistinguível de caixa vazia de verdade.
- **Decisão pendente**: avisar em falha de carga, ou seguir silencioso no
  polling e avisar só na carga inicial. Com `useAvisos` já na tela, é uma
  linha.

### C3 — Anexo enviado não aparece até recarregar
- **Onde**: `frontend/src/pages/ComunicacaoInterna.jsx`, `enviar()`.
- **O que acontece**: a mensagem otimista é montada com `anexos: []` fixo,
  mesmo tendo acabado de subir os arquivos. Quem anexa vê a própria mensagem
  sem o anexo até o polling ou o reload.
- **Por que não corrigimos**: é regra de serviço, não de layout.

---

## Lacunas do padrão que a leva relatou e não mexeu (R21)

### L1 — `BlocoConteudo` deixa corpo vazio e achata a hierarquia
- Com `titulo`/`descricao` e sem `children`, ainda renderiza um
  `div.app-bloco-corpo` vazio com `margin-top: var(--esp-3)` — 12px sobrando
  no rodapé de cada cartão. E o `titulo` do bloco é sempre `<h2>`, então
  cartão-dentro-de-seção fica com dois `<h2>` aninhados (hierarquia achatada
  para leitor de tela).

### L2 — `BarraFiltros.campos` não tem `placeholder`
- Custo já pago: os exemplos "Ex.: 12" e "Ex.: 381" dos campos Pedido e Item
  da `RelatoriosAdministrativos` sumiram. É acréscimo aditivo (não muda
  assinatura nem retorno), mas contrato de componente não muda no meio da
  leva.

### L3 — Não existe medida de layout de trabalho em duas colunas
- A coluna da lista da `ComunicacaoInterna` está escrita como
  `calc(var(--esp-4) * 20)` (= 320px, 20 degraus) e a altura útil é medida em
  JS. Nenhum componente padrão cobre "painel que ocupa a altura útil da
  janela": `BlocoConteudo` traz padding e não tem trilha de rolagem.
- **Proposta**: vira um `PainelTrabalho` numa leva própria, com o check
  nascendo junto.

---

## Defeitos de CSS de SISTEMA — afetam tela que nenhuma leva tocou

Achados de 03/09, nas telas fora do shell. Nenhum é do arquivo da tela: os
três estão no CSS de sistema e a correção vale para o produto inteiro. Não
foram corrigidos porque `src/index.css` não pertence a leva de tela nenhuma
e mexer nele no meio de uma leva quebra a R21 pelo mesmo motivo que mudar
contrato de componente quebra.

### S1 — `Avisos` e `Alert` não têm superfície fora do `Layout`
- **Onde**: `frontend/src/index.css`, blocos por volta de 6870–6960 e
  9010–9040.
- **O que acontece**: TODAS as regras de `.alert` (fundo, cor semântica,
  raio, respiro, ícone) existem apenas sob `.layout-shell` ou `.login-card`.
  **Não há regra `.alert` sem escopo.** Fora do `Layout`, `Avisos` renderiza
  texto e ícone soltos — sem faixa, sem cor, sem respiro. O aviso existe no
  DOM e quase não existe para o usuário, que é exatamente a R15.
- **Por que é grave**: a DoD das telas fora do shell **obriga** a usar
  `useAvisos`. O padrão manda usar uma peça que o CSS do padrão não veste.
  Os dois agentes da leva chegaram, independentemente, ao mesmo contorno.
- **Contorno em uso**: um `<div className="layout-shell">` envolvendo **só**
  a pilha de avisos, em `RecuperarSenha.jsx`, `DefinirSenha.jsx` e
  `CotacaoFornecedorPublica.jsx`, com comentário no código. **Efeito
  colateral que sobra**: `.layout-shell` também pinta
  `background: var(--ui-canvas)`, então os cantos arredondados da faixa
  deixam ver um fio de canvas.
- **Conserto certo**: desescopar `.alert*`, ou escopar para
  `:where(.layout-shell, .login-card, .app-avisos)`.

### S2 — Placeholder de campo reprova AA no sistema inteiro
- **Onde**: `frontend/src/index.css:640-643` —
  `:root:not(.dark) input::placeholder { color: #94a3b8 }`.
- **Medido**: **2,56:1** sobre superfície branca. O mínimo AA é 4,5:1.
- **Por que é a R24 ao contrário**: o sistema **já tem** o token certo
  (`--input-placeholder`, com piso garantido pelo `garantirContraste` do
  `ThemeContext`) aplicado em `.input::placeholder` na linha 619 — e essa
  regra crua, mais específica, o anula. O token existe, tem piso, e não
  chega à tela.
- **Consequência**: em monitor ruim ou sob luz forte (obra), "seu@email.com.br"
  e "Digite sua senha" somem. Vale para todo campo do sistema, não só as
  telas de senha.

### S3 — Placeholder do Login, mesmo defeito, mais escuro ainda
- **Onde**: `frontend/src/index.css:7000-7010` —
  `.login-input::placeholder { color: #8395b0 !important }`.
- **Medido**: **2,94:1** sobre `#f8fbff`. O `!important` fecha a porta para
  qualquer token.

### S4 — CSS morto com uma bomba R18 armada
- **Onde**: `frontend/src/index.css`, por volta de 4204–4400.
- **O que acontece**: `.cotacao-publica-table-input`, `-textarea`, `-check`,
  `-cell-ref`, `-table-shell`, `-context`, `-summary-*` e `-alert` ficaram
  sem consumidor depois da migração da Cotação Pública.
- **Por que registrar em vez de só apagar**: `.cotacao-publica-context` tem
  `overflow: hidden` — quem reusar a classe volta a sequestrar faixa fixa e
  coluna fixa sem saber por quê. É a R18 esperando a próxima vítima.

---

## Decisões do cliente sobre as telas fora do shell

### F1 — Título do Login em 30–37px, não no degrau de 22px
- **Onde**: `.login-heading` em `frontend/src/index.css:6851` —
  `clamp(1.85rem, 3vw, 2.3rem)`.
- **A DoD fora-do-shell diz** que o título continua no degrau de 22px. O
  Login não está.
- **Por que não corrigimos**: só dá para mexer no CSS de sistema ou
  desmontando a intro da tela de marca — e o Login é a única tela com
  identidade visual própria aprovada.
- **Decisão pendente**: o Login mantém o título de marca como exceção
  declarada, ou desce para 22px como as duas irmãs?

### F2 — "2 horas" escrito na interface
- **Onde**: constante `VALIDADE_DO_LINK` em `RecuperarSenha.jsx` e
  `DefinirSenha.jsx`.
- **O que acontece**: o prazo real vem de `DEFAULT_EXPIRES_HOURS`
  (`backend/src/services/passwordResetService.js:13`) e **a API não o
  devolve**. O número na tela está acoplado a uma constante do backend por
  cópia — se mudar lá, a tela mente.
- **Decisão pendente**: tirar o número da tela, ou o backend passar a
  devolvê-lo.

### F3 — Identidade visual da família de autenticação
- O Login tem fundo escuro com skyline e cartão próprio; Recuperar e Definir
  Senha ficaram no canvas claro do sistema, que é o que já eram.
- **Decisão pendente**: unificar as três é decisão de design, não de layout.
  A leva não fez por conta própria.

### F4 — Senha fraca não bloqueia o envio
- **Onde**: `frontend/src/pages/DefinirSenha.jsx`.
- **O que acontece**: o botão "Definir senha" continua habilitado com senha
  fraca; quem envia leva uma ida ao servidor para descobrir. As etiquetas já
  mostram ao vivo o que falta, e o erro do servidor agora aponta para elas.
- **Por que não corrigimos**: bloquear o envio é mudança de fluxo.

---

## Decisões do cliente sobre a Cotação Pública

### G1 — Confirmação nova no "Enviar resposta"
- **O que é**: acréscimo da leva, não substituiu diálogo nenhum. A ação é
  irreversível para o fornecedor: depois do envio o formulário inteiro trava
  e correção passa a depender da equipe de compras.
- **Decisão pendente**: se o cliente preferir envio sem fricção, são 8 linhas
  a remover.

### G2 — O fornecedor não tem canal de socorro na tela
- **O que acontece**: `serializarCotacaoPublica` **não traz nome, e-mail nem
  telefone do comprador**. Por isso todo texto de erro manda "responda o
  e-mail em que você recebeu este link" — é o único canal que o fornecedor
  comprovadamente tem.
- **Decisão pendente**: colocar telefone ou e-mail da equipe de compras
  nesses textos exige campo novo no backend.

### G3 — A tela estreitou de 1312px para 1100px
- **Por quê**: o `Pagina` traz `.page { max-width: 1100px }` (a R10 manda o
  ritmo vir do componente); o invólucro antigo dava `82rem`.
- **Impacto medido**: a tabela tem 12 colunas e já rolava na horizontal
  antes, então não há corte de dado — mas são 212px a menos.
- **Conserto**: uma linha em `compras-responsive.css`, mesmo padrão do
  `.rhdp-page { max-width: 1480px }`. É CSS de sistema, então é decisão.

### G4 — Sem faixa fixa, o "Enviar resposta" só existe no topo
- **O que acontece**: C1/C2 são N/A fora do shell, então não há cabeçalho
  grudado. Numa cotação de 40 itens o fornecedor rola até o fim e precisa
  voltar ao topo para enviar.
- **Por que não inventamos um segundo botão**: a B3 proíbe a mesma ação duas
  vezes na tela.

---

## Regra de negócio da Cotação Pública — para o responsável

### H1 — Item com preço e sem quantidade vira "não tenho" EM SILÊNCIO
- **Onde**: `CotacaoFornecedorPublica.jsx`, no monte do payload —
  `disponivel = quantidadeDisponivel > 0 && preco > 0`.
- **O que acontece**: o fornecedor que digita o preço e esquece a quantidade
  tem o item enviado como **indisponível**, sem nenhum alerta.
- **Por que é o mais grave da tela**: perde-se o item na concorrência e
  **ninguém percebe dos dois lados** — nem o fornecedor, que acha que
  cotou, nem o comprador, que acha que ele não tinha.

### H2 — Erro de CPF/CNPJ do transportador mente sobre a causa
- **O que acontece**: `getCpfCnpjError` lança de dentro do monte do payload.
  O `Error` sai sem `status`, cai no ramo de rede, e o fornecedor lê *"o
  navegador não conseguiu falar com o servidor"* quando o problema é o
  documento que ele digitou.
- **Por que não corrigimos**: a correção certa é validar o campo no
  formulário, o que é mudança de fluxo — maquiar o `catch` esconderia o
  defeito em vez de resolvê-lo.

### H3 — O payload ignora se é rascunho ou envio final
- **O que acontece**: `montarPayloadResposta` recebe `{ finalizar }` e nunca
  usa. Rascunho e envio final montam payload idêntico.
- **Consequência hoje**: nenhuma. Mas qualquer regra futura de "só valida no
  envio" nasce quebrada.

### H4 — `quantidade_minima_item` vai cru para o payload
- Ao contrário de todos os campos vizinhos, não passa por
  `sanitizarDecimalInput`.

### H5 — `respostaFinalizada` pode não cobrir todos os estados
- Olha só `RESPONDIDO` e `FINALIZADA`. O backend usa também `VISUALIZADO`, e
  reescreve o status no `show`. O conjunto completo de estados não foi
  auditado.

---

## Mais lacunas do padrão (R21: registradas, componente não estendido)

### L4 — Não existe componente de campo de senha
- Cada tela reinventa o par input + botão de olho. Falta um `CampoSenha` que
  carregue o recuo do campo, o alvo de clique e o `aria-pressed`.

### L5 — `Pagina` não serve tela fora do shell
- Traz `.page` com `max-width: 1100px` e mede `.fx-topbar`, que não existe
  ali. E como o degrau de 22px do título só sai de `.app-pagina > .page-title`,
  cada agente teve de aplicar a classe direto no cartão. Falta uma variante
  (`<Pagina foraDoShell>` ou um `MolduraPublica`).

### L6 — `CampoForm` não aceita `placeholder` nem slot de sufixo
- O botão do olho entra como filho dentro do `<label>`, o que não é o ideal
  em acessibilidade.

### L7 — Não existe etiqueta de "requisito atendido"
- A `DefinirSenha` usou `fx-badge--success/--neutral`, que são etiquetas de
  **status de registro**. Serve, mas o papel semântico é outro.

### L8 — `useConfirmacao` não tem tom para ação irreversível não-destrutiva
- O envio da cotação não é destruição, mas também não é rotina. Hoje só
  existem `primary` e `btn-perigo-suave`.

### L9 — `BlocoConteudo` não tem lugar para condição fixa
- As faixas de "cotação encerrada" e "resposta já enviada" não são aviso (não
  fecham) e não são `descricao`. A leva criou um `Condicao` local. Se
  aparecer numa terceira tela, é candidato a componente padrão.

### L10 — `TabelaPadrao` não tem coluna de formulário
- As 8 colunas editáveis da Cotação Pública usam `tipo: 'valor'`/`'numero'`
  com `<input>` dentro do `render`. Funciona, mas o tipo descreve o dado
  exibido, não um campo.

---

## Família "existia e ninguém sabia" — índices de navegação fora da fonte única

Terceiro achado da mesma família (os dois primeiros: as telas compartilhadas
órfãs e as rotas sem porta de entrada). O padrão se repete: **um pedaço da
interface existe, funciona, e nenhum processo o alcança porque ninguém sabe
que ele está ali.**

### V1 — 26 arquivos montam lista de destino à mão, sem passar pelo `navigationConfig`

Medido em 03/09 pelo `frontend/scripts/validarNavegacao.mjs`. São **176
destinos** escritos à mão fora da fonte única. Os maiores:

- `src/pages/ModuloRelatorios.jsx` — **54** destinos
- `src/pages/Configuracoes.jsx` — **43** destinos
- `src/pages/FinanceiroTitulos.jsx` — **7** destinos
- `src/modules/crm/pages/CrmDashboardGerencial.jsx` — **4** destinos
- `src/modules/crm/pages/CrmDashboardSla.jsx` — **4** destinos
- `src/pages/FinanceiroTituloDetalhe.jsx` — **4** destinos
- `src/modules/crm/pages/CrmCarteira.jsx` — **3** destinos
- `src/modules/crm/pages/CrmDashboardDistribuicao.jsx` — **3** destinos
- `src/modules/crm/pages/CrmKanban.jsx` — **3** destinos
- `src/modules/crm/pages/CrmLeads.jsx` — **3** destinos
- `src/modules/fiscal/pages/FiscalDashboard.jsx` — **3** destinos
- `src/modules/fiscal/pages/FiscalOperationalReport.jsx` — **3** destinos
- `src/modules/provisionamento-financeiro/pages/ProvisionamentoRelatorioOperacional.jsx` — **3** destinos
- `src/pages/ComercialRelatorioOperacional.jsx` — **3** destinos
- `src/pages/ComprasRelatorioComprasDiretas.jsx` — **3** destinos
- `src/pages/ComprasRelatorioComprasFornecedor.jsx` — **3** destinos
- `src/pages/ComprasRelatorioDemandaPedidos.jsx` — **3** destinos
- `src/pages/CrmRelatorioExecutivo.jsx` — **3** destinos
- `src/pages/Dashboard.jsx` — **3** destinos
- `src/pages/FinanceiroBaixas.jsx` — **3** destinos
- `src/pages/FinanceiroConciliacao.jsx` — **3** destinos
- `src/pages/FinanceiroFaturasCartao.jsx` — **3** destinos
- `src/pages/FinanceiroFinanciamentosBancarios.jsx` — **3** destinos
- `src/pages/FinanceiroPagamentos.jsx` — **3** destinos
- `src/pages/FinanceiroRelatorios.jsx` — **3** destinos
- `src/pages/SolicitacoesRelatorioOperacional.jsx` — **3** destinos

**Por que importa, com consequência já medida:**

- **A D7 não chegou lá.** Os nove títulos "Relatórios de X" da
  `ModuloRelatorios` sobreviveram à decisão do cliente por uma leva inteira,
  porque a lista estava dentro do arquivo e ninguém sabia que existia.
- **A permissão é reavaliada por conta própria.** Cada uma dessas listas
  refaz o cálculo de visibilidade com regra local. Duas fontes de verdade
  para "esta pessoa pode ver isto" divergem em silêncio, e o sintoma é a
  pessoa clicar e levar "acesso negado" — ou pior, ver o que não devia.
- **Renomeação não propaga.** Destino renomeado na fonte única continua
  velho na lista à mão. Ninguém vê até alguém clicar e cair em tela branca:
  a aplicação não tem rota curinga.

**O que foi feito**: um check no `validarNavegacao.mjs`, em forma de
**trinco** (`frontend/scripts/trinco-navegacao.json`). Ele reprova arquivo
NOVO que monte três ou mais destinos sem importar a fonte única, e reprova
contagem que SOBE num arquivo já congelado. O número só desce.

Três ou mais porque uma tela de detalhe legitimamente aponta para uma ou
duas rotas vizinhas; três já é um índice, e índice é papel da fonte única.
O roteador (`App.jsx`) e os guardas de rota ficam de fora — eles existem
para declarar rota e para mandar o usuário embora, não para oferecer
caminho.

**Decisão pendente**: os 26 não foram migrados. O trinco garante que o
problema não cresça; esvaziá-lo é trabalho de leva, módulo por módulo,
conforme cada um for reformado.

**Provado que morde** (03/09): um arquivo novo com três `<Link>` reprova; e
acrescentar dois destinos ao `Dashboard.jsx`, já congelado em 3, reprova com
"subiu de 3 para 5".

---

## Varredura do cancelamento — o que a medição disse, contra a suspeita

Pedido do cliente em 03/09: varrer todo o frontend atrás do idioma
`if (!confirm(...)) return;`, para listar **onde o cancelamento não
cancela**. A premissa era que o defeito ainda existisse nas telas não
migradas, já que restavam ~700 chamadas congeladas.

**A medição diz que não existe nenhum.** Ferramenta:
`frontend/scripts/varreduraCancelamento.mjs` (AST, não grep), rodando em
todo o `src/`.

O que explica a diferença entre a suspeita e o número:

- O passivo congelado de **726** chamadas é `alert` + `confirm` + `prompt`
  somados. A quebra real é **643 `alert`**, **64 `confirm`** e **19
  `prompt`**. `alert()` não tem cancelamento para quebrar.
- Os **64 `confirm()`** restantes são todos NATIVOS, e todos no idioma
  `if (!window.confirm(...)) return;` — que está **correto**: o `confirm`
  nativo devolve booleano de verdade. É feio (é caixa do navegador, R19),
  mas o "Cancelar" cancela.
- Os quatro casos quebrados que existiram eram do `confirmar()` do
  `useConfirmacao`, que devolve `{ ok, texto }` — e existiram porque a leva
  trocou o contrato de retorno no meio do caminho. Foi o que deu origem à
  R21.

**A varredura é CHECK BLOQUEANTE, sem trinco** (decisão do cliente, 03/09),
dentro do `npm run test:responsive`. Sem trinco de propósito: os outros
passivos herdados (R19, fonte única) são congelados porque ali o defeito é
de ESTILO — caixa do navegador é feia, índice à mão é frágil, e nenhum dos
dois faz o sistema mentir. Aqui o defeito é o código fazer o OPOSTO do que
promete, e não existe número aceitável disso. Qualquer ocorrência, em
arquivo novo ou antigo, reprova.

**Provado nos dois sentidos** (03/09): com o código como está, sai 0; com um
único `confirm('Apagar tudo?')` de retorno ignorado num arquivo de prova,
sai 1, e o `test:responsive` inteiro reprova junto. Ela distingue duas famílias e não mistura: (A) o
`confirmar()` do sistema lido como booleano; (B) `confirm()` nativo com o
retorno ignorado. O idioma nativo correto NÃO entra na lista — misturá-lo
faria o defeito real se perder no meio de setenta linhas certas.

### Duas lacunas da própria varredura, achadas ao revisitá-la

1. **Ela não cobria `prompt()`.** Só `confirm`. São 19 chamadas que nunca
   tinham sido examinadas — e `prompt` é a mesma classe de defeito com um
   agravante: devolve `null` no "Cancelar" e a string no "OK", então quem
   não testa manda `null` para o serviço. Cobertas agora, em duas famílias
   próprias (retorno ignorado; guardado e nunca testado).
2. **Ela dava falso positivo em `if (!motivo?.trim()) return;`** — o pai
   imediato da referência ali é um `OptionalMemberExpression`, não o `!`.
   Falso positivo numa lista de defeito destrutivo é caro: manda o leitor
   conferir código que está certo e corrói a confiança no resto da lista.
   Passou a subir pela cadeia de acesso e chamada antes de julgar.

Verificação extra, para o zero não depender de uma ferramenta só: as **82**
chamadas nativas de `confirm`/`prompt` foram varridas atrás de guarda dentro
de callback de iteração (`forEach`, `map`, `some`…), onde o `return` do
guarda interrompe o callback e NÃO a ação de fora. **Nenhuma.**

**Provada contra caso conhecido** antes de se acreditar no zero: uma
fixture com cinco formas ruins e quatro corretas. A primeira versão da
varredura pegou três das quatro e **deixou passar justamente a que causou o
estorno** — `const ok = await confirmar(...)` seguido de `if (!ok) return;`
duas linhas abaixo — porque olhava só o pai imediato da chamada. Passou a
seguir a ligação da variável. Um scanner que só olha o pai pega as formas
espalhafatosas e deixa passar a discreta, que é a que aparece no código de
verdade.

---

## A classe de defeito mais grave: consentimento obtido sob informação falsa

Registro próprio, a pedido do cliente (03/09), porque **não é a mesma coisa
que cancelamento ignorado** e merece nome separado.

### O que é

A confirmação e a ação operam sobre **coleções diferentes**. O sistema
pergunta "Descartar 3 rascunhos?", a pessoa lê, entende, clica em
Confirmar — e o sistema apaga 47, porque a mensagem cita
`selecionados.length` e a ação percorre `todos`.

**Aqui o cancelamento FUNCIONA.** Clicar em "Cancelar" cancela. O defeito é
outro e é pior: o sistema **mente sobre o que vai fazer**, e a pessoa
autoriza uma coisa enquanto outra acontece. Ela não tem como perceber — a
confirmação apareceu, ela leu, ela consentiu. A trilha de auditoria vai
registrar um consentimento válido para um estrago que ninguém autorizou.

### O check (família D da varredura)

`frontend/scripts/varreduraCancelamento.mjs`, bloqueante como o resto.
Numa função que contém confirmação cuja mensagem cita `ALGO.length`, a ação
depois do guarda tem de percorrer ou receber essa **mesma** coleção. Se ela
toca outra do escopo e não toca a citada, reprova.

**Provado nos dois sentidos** (03/09): pega uma fixture que pergunta sobre
`selecionados` e apaga `todos`; e libera as duas formas corretas — a que
percorre a coleção citada diretamente, e a que a passa por uma chamada
(`apagarLote(montarLote(selecionados))`).

Ele segue **um nível de chamada** dentro do arquivo. Sem isso ele acusava a
Cotação Pública, onde a mensagem cita `itens.length` e a ação chama
`montarPayloadResposta()`, que percorre `itens` lá dentro — falso positivo.
Numa lista de defeito destrutivo, falso positivo é caro: manda conferir
código correto e corrói a confiança no resto da lista.

### O LIMITE do check, declarado — e o que fica com o revisor

Isto é análise estática de **nome**, não de **valor**. Ela pega o caso em
que os identificadores diferem, que é o caso real e o que dá para provar.

**Ela NÃO pega**, e nenhuma análise estática razoável pegaria:

1. **Mesmo nome, conteúdo diferente.** A coleção foi refiltrada, reordenada
   ou recarregada entre a pergunta e a ação. Os dois lados se chamam
   `selecionados`; o conteúdo mudou.
2. **Mensagem sem número.** "Descartar os rascunhos desta obra?" seguido de
   uma ação que apaga os de todas as obras. Não há `.length` para o check
   ancorar.
3. **A coleção certa, o critério errado.** A ação percorre a coleção citada
   e aplica um filtro diferente do que a mensagem descreve.

**Item de leitura obrigatória do revisor** — entra na DoD:

> Em toda confirmação de ação destrutiva, ler os dois lados juntos e
> responder: **o que a mensagem promete é exatamente o que a ação faz?**
> Não basta a coleção ter o mesmo nome — é preciso ser o mesmo conjunto, no
> mesmo momento, com o mesmo critério. Um número na mensagem que não venha
> da coleção que a ação percorre é reprovação imediata.

### O que a varredura encontrou hoje

**Nada.** As duas telas suspeitas foram lidas linha a linha:

- **`ObraTipoApropriacao.jsx`** — a confirmação nomeia um tipo e uma obra, e
  a ação chama `salvarObraTipoApropriacao({ obra_id, tipo_solicitacao_id })`
  com exatamente esses dois. É um vínculo, não uma lista. **Correto.**
- **`CrPlanejamentoView.discardLocalDraft`** — a confirmação fala "desta obra
  e competência" e a ação percorre `allDraftKeys`. O nome assusta, mas
  `allDraftKeys` é `Object.values(draftKeys)`, e `draftKeys` é construído com
  `(userId, obra.id, competencia)`: são as **três seções** desta obra e
  competência, e nenhuma outra. **Correto.**

O texto dessa confirmação **foi ajustado** pela regra do cliente: passou a
nomear as três seções e a dizer que a ação não pode ser desfeita. "Descartar"
sozinho deixa a pessoa supor que dá para recuperar.

**Regra do cliente que vale para todo lote destrutivo, registrada aqui**: se
a pessoa cancelar no meio de um lote, o que já foi descartado **fica
descartado** — não se tenta desfazer. E o texto da confirmação declara a
irreversibilidade antes, não depois.

---

## Quarto caso de "existia e ninguém sabia": o passo que só existia no hábito

Os três primeiros foram telas: as compartilhadas órfãs, as rotas sem porta de
entrada, os índices de navegação fora da fonte única. **Este é um passo do
PROCESSO**, e por isso é o mais incômodo dos quatro.

### O que aconteceu

Durante todas as levas eu conferia cor crua por `grep`, agente por agente:
`grep -E "text-slate-|bg-slate-|border-slate-"` entrava na lista de gates de
cada agente e no meu relatório. Funcionou — enquanto eu lembrei.

A `FinanceiroTituloDetalhe` entrou no manifesto, fechou matriz de cobertura,
foi entregue — e carrega **64 cores cruas**. Entre elas 29 `text-slate-500`,
que é `#64748b`: **4,34:1** de contraste sobre fundo claro, contra o mínimo
AA de 4,5:1. **A mesma cor que a leva das telas fora do shell mediu e
reprovou na `DefinirSenha`** — corrigida lá, intacta aqui.

Nada falhou. O `validarLayout` passou, o harness passou, a matriz fechou. O
passo que teria pegado isso **não estava em lugar nenhum a não ser no meu
hábito de rodar um grep**.

### A regra

> **O que não é conferido por check não é conferido.** Passo de verificação
> que existe só no hábito de alguém não existe: ele funciona até a primeira
> vez que a pessoa está cansada, com pressa, ou delegando — e falha em
> silêncio, porque não há nada para ficar vermelho.

E o corolário, que vale para a leitura do revisor tanto quanto para o grep:
**se um passo é obrigatório, ele é escrito e é executável.** Se não puder ser
executável, é escrito como item explícito da DoD, com nome, para poder ser
cobrado. Um passo que depende de alguém lembrar é uma promessa, não um
processo.

### O que foi feito

- **R25** no `validarLayout.mjs`, sem trinco: paleta crua, hexadecimal,
  `rgb()`/`hsl()` e cor arbitrária reprovam em qualquer tela do manifesto.
  Fecha a família inteira, não só o `slate` — decisão do cliente.
- **Provado nos dois sentidos**: com o código limpo passa; com um
  `text-slate-500` e um `#ff0000` plantados numa tela do manifesto, reprova
  as duas coisas e o validador sai com código 1.
- As três telas devedoras: `Parceiros` (3, faixa de atenção em amber cru →
  família semântica `--sem-warning`), `ObraGestao` (1, fundo de modal em
  `bg-slate-950/45` → `--modal-overlay`, o mesmo do `OverlayModal` e da
  paleta de comandos) e `FinanceiroTituloDetalhe` (64).

### Dois defeitos do próprio check, achados antes de confiar nele

1. **Ele nunca rodou.** A primeira versão usava `manifesto` e `RAIZ`, nomes
   que não existem naquele escopo — e devolveu **zero achados** num arquivo
   com 35 classes cruas. Foi pego porque o resultado foi conferido contra
   dado conhecido antes de ser aceito. Sozinho, o zero parecia aprovação.
2. **O comentário que explicava a regra reprovava o arquivo.** A remoção de
   comentários era linha a linha, e o comentário da R25 numa tela é um bloco
   JSX de várias linhas que cita as classes proibidas. Passou a cortar
   comentários no arquivo inteiro, trocando-os por espaço para o número da
   linha continuar batendo.

   E a primeira tentativa desse conserto **quebrou o validador**: o
   comentário que explicava o problema dos comentários escrevia o
   delimitador de fechamento de bloco como exemplo, e fechou a si mesmo.

### O que a R25 destravou: um defeito de contraste no tema escuro, no SISTEMA

Assim que a `FinanceiroTituloDetalhe` saiu da paleta crua e passou a usar as
famílias semânticas, apareceu um defeito que estava atrás dela: **três pares
do tema escuro reprovavam AA**.

O cabeçalho do `frontend/src/styles/design-tokens.css` afirmava que "todos os
pares texto/fundo foram validados WCAG AA nos dois temas". Medido em 03/09:

| Par (escuro) | Medido | |
|---|---|---|
| `--sem-danger` sobre `--sem-danger-bg` | **4,42:1** | reprova |
| `--sem-success` sobre `--sem-success-bg` | **4,46:1** | reprova |
| `--sem-info` sobre `--sem-info-bg` | **4,49:1** | reprova por 0,01 |

Atinge o sistema inteiro — o `StatusBadge`, as `.fx-badge--*`, toda etiqueta
de estado no tema escuro — não só a tela que expôs.

**A afirmação estava no comentário; a verificação não estava em lugar
nenhum.** É a mesma família, de novo, e desta vez num arquivo que se
declarava validado.

**Corrigido**: os três clareados um passo, com folga deliberada até 4,6:1
para não voltarem a raspar o limite — `danger` 4,42→**4,65**, `success`
4,46→**4,62**, `info` 4,49→**4,66**. O comentário do arquivo também estava
errado no MÉTODO: dizia medir contra a superfície escura da página, quando o
texto aparece sobre o fundo da própria família.

**E virou prova executável**: `frontend/scripts/provas/contrasteDosTokens.mjs`,
dentro do `test:responsive`. Mede os 10 pares nos dois temas e reprova
qualquer um abaixo de 4,5:1. Provada nos dois sentidos — com os valores
corrigidos passa; devolvendo `--sem-info` ao valor antigo, reprova com o
número na tela e sai com código 1.

### Pendências que a leva do Financeiro herda desta tela

1. **`StatusBadge` seria o destino certo em três selos** da
   `FinanceiroTituloDetalhe` (status da intenção de pagamento, do lote e do
   evento de auditoria). Ficaram com token porque a troca mexeria na
   marcação além de cor, e num deles o texto é `Lote {status}` — prefixo que
   o `StatusBadge` não aceita sem mudança de contrato (R21). **Consequência
   aceita e registrada: nesses três a cor continua sozinha, sem ícone — não
   comunicam para daltônico.**
2. **`bg-white` cru dentro de painéis semânticos** (9 campos e uma faixa a
   70% na mesma tela). A R25 permite `-white` por não ser degrau de paleta,
   mas no tema escuro esses campos ficam brancos dentro de painel escuro, e
   a faixa a 70% combina fundo branco com `--c-muted`, que no escuro é
   claro — contraste desprezível. É defeito de tema, não de paleta crua.
3. **`garantirContraste()` do `ThemeContext` NÃO cobre os `--sem-*`.** Ele
   aplica piso em `--c-muted`, `--input-placeholder`, `--card-muted` e
   afins, mas as famílias semânticas passam direto. Hoje elas estão certas
   no arquivo e a prova nova as segura; mas um tema customizado por setor
   que sobrescreva um `--sem-*` não passa por piso nenhum.

---

## SEXTA família: CAPACIDADE ÓRFÃ — viva, funcional e inalcançável

Distinta das cinco anteriores, e vale nome próprio:

- **não é código morto** — a tela existe, compila e funciona;
- **não é capacidade sem sinal** (R15) — o sinal existiria, o *caminho* é que
  não existe;
- é **capacidade órfã**: código completo, condicionado a uma rota ou a um
  ponto de entrada que sumiu do sistema.

Apagar uma dessas é destruir capacidade por acidente de histórico. Mantê-las
sem decidir é carregar código que ninguém sabe se deve existir.

### A varredura (04/09)

Critério: tela em `pages/` que exporta componente, **não é importada pelo
`App.jsx`** (logo não tem rota própria) e **não é importada por nenhuma
outra tela** (logo não é subcomponente).

**30 telas não têm rota própria**; dessas, **20 são subcomponentes
legítimos** (`SolicitacaoDetalhe/*`, `Solicitacoes/*`, `RhDpApuracao`…),
importados por uma tela que tem rota. Sobram **10 verdadeiramente órfãs**:

| Linhas | Arquivo |
|---|---|
| 573 | `modules/provisionamento-financeiro/pages/ConfiguracaoProvisionamentoFinanceiro.jsx` |
| 487 | `pages/ConversasEntrada.jsx` |
| 484 | `pages/ConversaDetalhe.jsx` |
| 261 | `pages/ConversasSaida.jsx` |
| 128 | `pages/SetoresSemAlteracaoStatus.jsx` |
| 118 | `pages/AprovacaoDiretoria.jsx` |
| 80 | `pages/SolicitacaoDetalhe/InfoCard.jsx` |
| 55 | `pages/SolicitacaoDetalhe/Pedido.jsx` |
| 16 | `pages/SolicitacaoDetalhe/StatusArea.jsx` |
| 1 | `pages/EtapasSetor.jsx` (arquivo de 1 linha) |

**2.203 linhas** nas seis maiores.

As três de conversa já estavam registradas como E4 — e ali o diagnóstico
ficou mais completo: elas navegam para `/conversas/:id`, que é a **rota
quebrada** do E3. São capacidade órfã *e* apontam para caminho quebrado.

**Decisão pendente, uma a uma**: cada arquivo desta lista ou **ganha rota e
ponto de entrada**, ou é **removido com aprovação explícita**. Nenhum dos
dois é decisão de leva de layout. O que a leva faz é não deixar a lista
implícita.

**O que este check ainda NÃO cobre**: tela que tem rota em `App.jsx` mas
cuja rota não é alcançável por menu, hub ou link — essa é a família E1/E2
(porta de entrada ausente), já registrada. As duas juntas descrevem o
caminho inteiro: existe rota? existe caminho até a rota?

---

## O MAPA DO QUE É DE FATO ALCANÇÁVEL

Duas perguntas, e só as duas juntas descrevem o caminho inteiro até uma
tela. Cada uma tem a sua varredura, e cada uma pega uma família diferente:

| | Pergunta | Quem responde | O que pega quando falha |
|---|---|---|---|
| **1** | **Existe rota?** | varredura de órfãs (04/09) | **capacidade órfã** — a tela existe, funciona, e nenhuma rota a alcança. 10 encontradas, 2.203 linhas nas seis maiores. |
| **2** | **Existe caminho até a rota?** | inventário de portas de entrada (E1/E2) | **porta de entrada ausente** — a rota existe e nada no sistema linka para ela. `usuarios-permissoes-rh-dp` e `/configuracoes-contrato-alertas`: só por URL digitada. |

**Passar numa e falhar na outra é o caso comum, e cada combinação é um
defeito diferente:**

- rota **sim**, caminho **não** → a tela está publicada e ninguém chega
  (E1/E2). Parece entregue e não está.
- rota **não**, caminho **não** → capacidade órfã. Parece código morto e
  não é: é código bom, desligado.
- rota **não**, caminho **sim** → o pior dos três: existe link, menu ou
  atalho apontando para lugar nenhum. Tela branca silenciosa, porque a
  aplicação não tem rota curinga. É o caso do `/conversas/:id` (E3) e das
  três telas que navegam para ele (E4).

**Por isso o E3 e o E4 são UMA decisão, não duas** (decisão do cliente,
04/09): consertar a rota `/conversas/:id` ou remover o conjunto inteiro —
as três telas órfãs e a rota quebrada juntas. Decidir só um lado deixa o
outro pendurado: consertar a rota sem as telas mantém três órfãs; remover
as telas sem a rota mantém uma rota que mostra caixa vazia.

**Nenhuma das 10 órfãs foi removida** (decisão do cliente, 04/09). Elas
voltam no fechamento da leva com o que cada uma FAZ e o que se PERDE ao
apagá-la — porque a pergunta não é "está sendo usada?", é "esta capacidade
deve existir?", e essa não é decisão de leva de layout.

---

## Para o responsável — Financeiro, fatia 2 (04/09)

Todos verificados no código antes de virarem item, nenhum corrigido.

### P1 — Falha de rede na consulta de saúde rebaixa o envio para MOCK, em silêncio
- **Onde**: `frontend/src/pages/FinanceiroPagamentos.jsx`, por volta de 365 e 393.
- **O que acontece**: `getBbPaymentsHealth().catch(() => null)` **engole o
  erro**. Sem resposta, a flag de provedor real fica `false`.
- **Consequência**: a pastilha passa a dizer **"MOCK"**, o botão vira "Enviar
  mock", e ele chama **outro endpoint de envio**. Uma falha de rede na
  verificação de saúde **muda o caminho de envio de um lote de pagamento**,
  sem nenhuma mensagem.
- **Por que é a pior classe**: o operador lê "MOCK", acredita que está
  testando — e nem ele nem a trilha registram que aquela informação era um
  erro de rede, não um estado do sistema.

### P2 — `isBbSandbox` significa o OPOSTO do nome
- Ela é `true` quando o **provedor real** está habilitado. Governa
  exatamente a fronteira entre "sai dinheiro de verdade" e "não sai": o
  rótulo, o botão de envio e a habilitação do "Sincronizar BB". Renomear
  mexe em 12 pontos numa tela de dinheiro.

### P3 — Os totais do resumo de baixas mentem acima de 200 registros
- **Onde**: `FinanceiroBaixas.jsx` — o filtro nasce com `limit: 200` e
  **não há controle na tela para elevá-lo** (o "Por página" só fatia no
  cliente). O resumo (Valor base, Valor quitação, Estornadas) é reduzido
  sobre as **primeiras 200** e apresentado como total do recorte.
- Um recorte com 260 baixas mostra um "Valor quitação" **silenciosamente
  menor que o real**. O CSV exportado tem o mesmo teto. A leva qualificou os
  rótulos com "do recorte"; o número certo pede paginação de servidor.

### P4 — Três ações que movimentam caixa não confirmam nada
- **"Enviar ao BB"** é o passo em que o dinheiro sai. A única barreira é o
  campo de MFA — que é preenchimento de campo, **não consentimento sobre um
  valor**: no momento do clique o operador não vê o código do lote, nem a
  quantidade de itens, nem o total.
- **"Confirmar baixa"** grava movimento financeiro num clique; desfazer
  exige estorno.
- **"Gerar boletos em lote"** não declara que, interrompido no meio, o que
  já foi gerado fica gerado.
- Acrescentar guarda em ação de caixa é decisão de negócio, não de layout.

### P5 — Justificativa obrigatória?
- Em três das quatro confirmações a leva manteve `obrigatorio: false`,
  porque o `prompt` aceitava vazio e o payload caía numa justificativa
  padrão — exigir agora **mudaria o payload possível**. Numa tela que
  movimenta caixa, a resposta provavelmente é "sim, obrigatória". É decisão
  do responsável.

---

## O DEFEITO MAIS CARO DA LEVA: total que soma só a página, em tela de decisão

**Quatro ocorrências independentes**, todas em `backend/src/services/relatorioFinanceiroService.js`,
todas com a mesma forma: `findAll({ limit })` e **depois** somar o resumo
sobre o que voltou. Verificadas no código, nenhuma corrigida — é agregação
de dinheiro em backend.

### T1 — `FinanceiroIntercompany`: o usuário acha que pagina e está mudando o total
- **O pior dos quatro**, porque o teto é um **select visível** rotulado
  "Limite" com "100 / 500 / 1000 registros". Trocar 1000 por 100 **muda o
  valor previsto na manchete**. O rótulo faz parecer paginação de exibição;
  é escolha de quanto do universo será somado.
- A leva reescreveu o rótulo para "Teto de registros lidos" e avisa quando a
  lista volta no teto. **O número continua parcial.**

### T2 — `FinanceiroEndividamento`: a manchete subestima a dívida
- O frontend pedia `limit: 500`, **metade do teto do backend**, e mostrava o
  resultado sob o rótulo **"Endividamento aberto"**. Acima de 500 títulos em
  aberto, a manchete subestima a dívida do grupo — e a abertura por empresa
  **some com empresas inteiras**.

### T3 — `FinanceiroRelatorioAnalitico`: total das 500 mais antigas
- `limit: 500` na consulta ordenada por vencimento, e os totais somados
  sobre esse recorte. Acima de 500 linhas, o total é o das 500 de vencimento
  mais antigo.

### T4 — `FinanceiroExecutivoGrupo`: herda T2 e T3, e vira RISCO
- O painel executivo chama endividamento e entre-empresas sem `limit`
  (default 1000 cada) e publica os resumos truncados. Pior: um deles vira
  **cartão de risco executivo**.
- **Consequência**: quem decide vê a dívida dos 1000 vencimentos mais
  antigos como dívida do grupo, e um risco calculado sobre leitura parcial.

### Mais duas, fora do serviço de relatórios
- **`FinanceiroObras`** — limite padrão de **1000** movimentos, e os três
  cartões de topo somam sobre as linhas truncadas. O acumulado da coluna
  "Saldo" começa em zero na primeira linha **sobrevivente**, e o CSV exporta
  só o truncado.
- **`FinanceiroFinanciamentosBancarios`** — "Total contratado" soma no
  máximo **200** contratos.

### O que a leva fez, e o que ela NÃO fez
Nenhuma fórmula, agregação ou payload mudou. O que mudou foi o **rótulo
parar de afirmar o que o número não sustenta**: cada tela detecta em runtime
se a lista voltou no teto e, só nesse caso, troca o título ("Total das linhas
trazidas", "Endividamento aberto (lido)") e avisa no apoio.

**Isso é mitigação, não conserto.** Um número marcado como parcial ainda é
um número parcial em tela de decisão. O conserto é agregar no banco (`SUM`
sobre o recorte) em vez de somar o que a página trouxe.

---

## Achados de sistema da fatia 3

### S5 — `.app-input`, `.app-button`, `.app-card`: a `FinanceiroBancos` inteira era crua
Três classes fantasma, 26 usos. O que a tela **parecia** ter e o que tinha:

| Classe | Parecia | Era |
|---|---|---|
| `.app-card` | superfície branca com contorno e sombra | `<div>` **transparente** — título, métricas e as 7 seções eram **texto solto sobre o canvas** |
| `.app-button` | alvo de 32/44px, tom por token, foco visível | `<button>` **cru**, ~21px de altura — incluindo o que **gera a remessa CNAB240** |
| `.app-input` | altura, borda, raio, anel de foco | `<input>` **cru**, 15 campos sem nada |

**O denominador**: classe fantasma **parece intenção**. Não há nada errado
para ver — só uma coisa ausente que o olho preenche. Por isso atravessou
todas as revisões.

### S6 — `.link` e `.link-primary` numa tela JÁ ENTREGUE
Fantasmas em `FinanceiroDda` (manifesto, matriz fechada) e em
`ComprasRelatorioComprasDiretas`. Escapavam porque `link-` não estava na
lista de prefixos do check — **a lição do rótulo, aplicada a prefixo**.
Prefixo acrescentado; o limite continua existindo.

### S7 — `overflow: hidden` no `index.css`, 39 seletores
A R18 varria só `componentes-padrao.css` e os CSS de módulo. O `index.css`
tem 11.800 linhas de CSS **de tela** — e é lá que o mecanismo mais mora.
Entre os 39: `.financeiro-report-card` (ancestral de duas tabelas),
`.app-dense-table-card`, `.financeiro-relatorios-page` (ancestral da faixa
fixa) e `.modal-dialog`.
**A regra nasceu de nove telas com a faixa fixa quebrada e não cobria o
arquivo onde o defeito mais aparece.** Agora cobre, com trinco.


---

## D19 / D20 — DONO DECLARADO: o que NÃO é órfão, e por que não volta na varredura

Decisão do cliente, 04/09, ao fechar a fatia 4. Três conjuntos apareceram
nas varreduras deste ciclo como se fossem candidatos do Financeiro. Não
são — têm dono, e o dono está registrado aqui e em
`frontend/scripts/telas-reformadas.json` (bloco `donos_declarados`), para
que a próxima varredura os leia como **atribuídos**, não como achados.

| Conjunto | Onde vive | Dono declarado |
|---|---|---|
| **D19a — Provisionamento Financeiro** | `src/modules/provisionamento-financeiro/**` | leva do módulo Provisões |
| **D19b — Custos e Recebíveis** | `src/modules/custosRecebiveis/**`, `pages/CustosRecebiveis.jsx` | leva do módulo Custos e Recebíveis |
| **D20 — Painel de Solicitações** | `pages/Solicitacoes/**`, `pages/SolicitacaoDetalhe/**` | leva do módulo Solicitações |

**Por que eles apareciam.** Cada um tem parentesco de vocabulário com o
Financeiro — provisão é dinheiro, recebível é dinheiro, e o
`SolicitacaoDetalhe/FinanceiroCard.jsx` tem 3.051 linhas com "Financeiro"
no nome. Parentesco de nome não é pertencimento de módulo: o card financeiro
é um bloco DENTRO do detalhe da solicitação, importado só por
`SolicitacaoDetalhe/index.jsx`, e some junto com aquela tela.

**O que a declaração de dono NÃO faz**: não os declara prontos, não os
tira de nenhuma regra e não os isenta de leva. Ela só responde à pergunta
"de quem é isto?" — que era a pergunta que fazia a mesma tela reaparecer
como achado a cada varredura nova.

**Regra que fica**: toda varredura que produza lista de candidatos precisa
cruzar com `donos_declarados` antes de reportar. Achado com dono declarado
é ruído; o valor da varredura está no que ainda não tem dono.

---

## FATIA 4 — cadastros e comprovantes: o que a medição encontrou

A fatia nasceu com uma lista candidata pequena e terminou menor ainda,
porque a medição desmontou a lista:

| Destino do menu Financeiro | Arquivo | Situação em 04/09 |
|---|---|---|
| Cadastros Financeiros | `FinanceiroCadastros.jsx` | já no manifesto (fatia 3) |
| Comprovantes Pendentes | `ComprovantesPendentes.jsx` | já no manifesto (fatia 1) |
| **Upload Comprovantes** | **`UploadComprovantes.jsx`** | **única tela nova da fatia** |

As 17 rotas do módulo Financeiro e as 32 rotas de `/financeiro/*` +
`/comprovantes/*` do `App.jsx` foram conferidas uma a uma contra o
manifesto: **restava exatamente uma**. O manifesto fecha a leva em **68
telas**.

### Dois arquivos que a varredura devolveu e não entram

- **`SolicitacaoDetalhe/FinanceiroCard.jsx`** (3.051 linhas) — importado
  por `SolicitacaoDetalhe/index.jsx`. D20: módulo de Solicitações.
- **`SolicitacaoDetalhe/Comprovantes.jsx`** — **arquivo de 0 bytes, sem
  nenhum import em todo o `src/`**. Não é órfã (órfã tem código); é resto.
  Registrado para remoção junto com o `EtapasSetor.jsx` na decisão das dez.

### O que mudou na `UploadComprovantes.jsx`

Antes: `<h1>` solto num card, texto de apoio miúdo, e as duas mensagens de
retorno pintadas **à mão, em hexadecimal, nos dois tons de azul**.

| Achado | Regra | O que era | O que é |
|---|---|---|---|
| Título solto no card | R5/R13/C1 | `<h1 class="page-title">` + `<p class="page-subtitle">` dentro de um `.card` | `Pagina` + `PageHeader` com contagem e apoio na faixa fixa |
| `#1d4ed8` / `#1e40af` | R25 | cor de mensagem em hexadecimal | `Avisos`/`Alert` do sistema, tom semântico |
| `text-blue-600` | R25 | classe de paleta crua no botão Remover | corrigida **no padrão do componente** (abaixo) |

### O achado de semântica: o erro estava pintado de sucesso

Duas linhas, lado a lado:

```jsx
{message && <p className="text-sm" style={{ color: '#1d4ed8' }}>{message}</p>}
{error   && <p className="text-sm" style={{ color: '#1e40af' }}>{error}</p>}
```

`#1d4ed8` e `#1e40af` são dois azuis quase iguais. Erro e confirmação
saíam com a **mesma leitura visual** — e nenhuma delas com a cor de erro
do sistema.

Pior que a cor, o caminho: o retorno de recusa do servidor não ia para o
`error`, ia para o `message`.

```jsx
if (result.message)      setMessage(result.message);
else if (result.error)   setMessage(result.error);   // recusa entrando pelo canal do sucesso
```

Recusa do servidor chegava ao usuário pelo canal do sucesso, com a cor do
sucesso. É a **classe SIGNIFICADO** já registrada nesta ficha: nenhum
check de forma pega isso — as duas linhas têm elemento, texto e cor. Só a
leitura pega.

Agora `result.error` vai para `avisar.erro` e os arquivos **ficam na tela**,
porque não há o que confirmar.

### R25 tem um ponto cego estrutural: o PADRÃO do componente compartilhado

`PendingAttachmentsList` trazia isto na assinatura:

```js
removeButtonClassName = 'text-blue-600 font-semibold px-2'
```

Paleta crua morando no **valor padrão** de um componente compartilhado. Uma
tela que só usa o padrão herda a dívida **sem uma linha de paleta crua no
próprio arquivo** — e a R25 lê os arquivos das telas. O check passa, a cor
não acompanha o tema escuro.

Corrigido no padrão (`var(--c-primary)`), que é onde a correção vale para
todos. **Seis chamadas ainda passam a classe crua explicitamente** —
`GestaoContratos` (2), `SolicitacaoDetalhe/Conversa`, `ConversaDetalhe`,
`ConversasEntrada`, `NovaSolicitacao` —, todas fora do manifesto. Serão
pegas pela R25 quando as levas dos módulos delas chegarem; ficam
registradas aqui para não dependerem de alguém lembrar.

**A lição, generalizada**: um check que lê o arquivo da tela não enxerga o
que a tela herda. Todo componente compartilhado que aceita classe por prop
carrega, no seu valor padrão, uma decisão de estilo que nenhuma leva
inspeciona.

---

## DOIS DEFEITOS DOS MEUS PRÓPRIOS INSTRUMENTOS, ACHADOS NO FECHAMENTO

### I1 — `tokensExistem` lia PROSA como lista de classe

A varredura de fantasmas lê qualquer literal de string com cara de lista
de classes, e frase em português também é literal de string. Uma mensagem
de erro que diz `toque em "Enviar link" de novo` virou o fantasma
**`.link"`** — com a aspa dentro do nome.

Nome com aspa ou ponto não é identificador CSS: **nunca poderia existir no
CSS**, logo nunca sairia do trinco por correção nenhuma. Ficaria lá para
sempre inflando o número, e um número que não pode descer é um trinco que
não trava nada.

Dois cortes: o candidato tem de ser identificador CSS válido, e o prefixo
`link` passou a valer só exato ou seguido de hífen (antes, `linkado` e
`links` entravam). Trinco: **39 → 36**. Provado nos dois sentidos —
`.app-fantasma-plantado` continua reprovando.

Junto saiu o fantasma real que motivou tudo: `.link link-primary` na
`FinanceiroDda.jsx`, **tela já entregue com matriz fechada**. Nenhuma das
duas classes existe: o único caminho da linha do DDA até o título
renderizava como texto preto comum, sem parecer clicável.

### I2 — exceção registrada que não cobre nada é licença em branco

`FinanceiroDre.jsx` tinha exceção de R10 registrada — "geometria de
gráfico de barras" — e o validador **não emitia um aviso sequer** para ela.
A medida à mão saiu do arquivo numa fatia anterior; a exceção ficou.

Exceção nessas condições não é inofensiva. No dia em que alguém puser uma
medida à mão nessa tela, a violação **nasce rebaixada a aviso** e o gate
passa verde. É o inverso exato do trinco: em vez de congelar o passivo,
abre crédito para o futuro.

O validador agora exige que toda exceção registrada **prove que cobre
algo**; se não cobre, reprova pedindo a remoção da linha. Provado nos dois
sentidos na mesma execução: a exceção vazia da `FinanceiroDre` reprovou, e
as duas da `ObraTipoApropriacao` — que cobrem violações reais — passaram.

**A regra**: exceção é dívida declarada, e dívida quitada se dá baixa.
Exceção que sobrevive ao motivo vira permissão.

---

## AS DEZ ÓRFÃS — o que cada uma FAZ e o que se PERDE ao apagá-la

Trazidas ao fechamento da leva conforme a decisão do cliente de 04/09.
Nenhuma foi removida. A pergunta não é "está sendo usada?" — nenhuma está,
é a definição de órfã — é **"esta capacidade deve existir?"**.

### Antes da lista: duas delas nem funcionariam se alguém chegasse lá

Conferindo os imports nomeados de cada uma contra os exports reais dos
módulos que elas importam:

| Órfã | Import quebrado |
|---|---|
| `ConfiguracaoProvisionamentoFinanceiro.jsx` | `getProvisionamentoFinanceiroPermissoes`, `salvarProvisionamentoFinanceiroPermissoes` — **não existem** em `services/provisoesFinanceiras.js` |
| `SetoresSemAlteracaoStatus.jsx` | `getSetoresSemAlteracaoStatus`, `salvarSetoresSemAlteracaoStatus` — **não existem** em `services/configuracoesSistema.js` |

**Por que o build passa**: as duas não são importadas pelo `App.jsx`. O
Vite nunca as inclui no bundle, então nunca resolve os imports delas. É a
consequência escondida da capacidade órfã: **código inalcançável é código
não construído**, e portanto código onde a quebra se acumula sem sinal. As
duas voltariam a existir quebradas no dia em que alguém lhes desse rota.

Isso muda a natureza da decisão nas duas: não é "religar capacidade que
funciona", é "terminar o que nunca chegou a ser ligado ponta a ponta".

### A lista

| # | Órfã | O que FAZ | O que se PERDE ao apagar |
|---|---|---|---|
| 1 | `ConfiguracaoProvisionamentoFinanceiro.jsx` (572) | Editor de regras de permissão do provisionamento, por escopo (usuário/setor/obra) e perfil | **Nada em operação** — o serviço que ela chama não existe. Perde-se o desenho da tela de permissões do módulo Provisões |
| 2 | `ConversasEntrada.jsx` (486) | Caixa de entrada de conversas internas: lista, filtro por setor, nova conversa com anexos | A entrada da comunicação interna por conversa. **Ver E3/E4** |
| 3 | `ConversaDetalhe.jsx` (483) | Thread de uma conversa: mensagens, anexos com preview, adicionar participantes | O detalhe da conversa. **Navega para `/conversas/:id`, rota que não existe** |
| 4 | `ConversasSaida.jsx` (260) | Caixa de saída das conversas enviadas | O outro lado da caixa de entrada |
| 5 | `SetoresSemAlteracaoStatus.jsx` (127) | Marca setores que **não exibem** o botão "Alterar status" no detalhe da solicitação | **Nada em operação** — sem serviço no front e **sem rota no backend**, apesar de existir `services/solicitacao/setoresSemAlteracaoStatus.js` lá, também sem consumidor. Perde-se o único desenho dessa regra |
| 6 | `AprovacaoDiretoria.jsx` (117) | Define **qual diretoria recebe a solicitação primeiro** conforme obra pública ou privada | **O caso mais grave da lista — ver abaixo** |
| 7 | `SolicitacaoDetalhe/InfoCard.jsx` (79) | Card "Dados da Solicitação" (obra, setor, tipo, valores) | Nada: o detalhe vivo monta esses dados por outro caminho |
| 8 | `SolicitacaoDetalhe/Pedido.jsx` (54) | Grava o **número do pedido** da solicitação (`PATCH /solicitacoes/:id/pedido`) | **A única forma de preencher um campo que as listas exibem — ver abaixo** |
| 9 | `SolicitacaoDetalhe/StatusArea.jsx` (15) | Caixa com status e área responsável, fundo `#f5f5f5` fixo | Nada. Ignora tema e tokens; o detalhe vivo já mostra os dois |
| 10 | `EtapasSetor.jsx` (1) | `return <div>EtapasSetor</div>` | Nada. É um esqueleto que nunca ganhou corpo |

### #6 `AprovacaoDiretoria` — a configuração que o sistema OBEDECE e ninguém pode mudar

O endpoint está vivo nos dois verbos:

```
GET   /configuracoes/aprovacao-diretoria
PATCH /configuracoes/aprovacao-diretoria   (allowConfiguracoesStatusVinculos)
```

E o valor é **consumido em produção**: `SolicitacaoController.js:802` e
`PrioridadeDiretoriaController.js:565` decidem o roteamento por
`fluxo_aprovacao_diretoria`; o `SolicitacaoDetalhe` tem bloco próprio
`aprovacao_diretoria`; o `blocosDetalhe.js` o lista como "Aprovação por
diretoria".

`AprovacaoDiretoria.jsx` é a **única** tela do frontend que chama
`salvarAprovacaoDiretoria`.

Ou seja: **o sistema roteia solicitações por uma regra que ninguém consegue
alterar pela interface.** O que está no banco hoje é o que vale, para
sempre, até alguém mexer por fora. Apagar a tela transforma um problema de
caminho em decisão permanente e invisível.

### #8 `Pedido` — a coluna que mostra o que nada preenche

`PATCH /solicitacoes/:id/pedido` existe, valida corpo
(`validateSolicitacaoPedidoBody`) e **grava auditoria**
(`SOLICITACAO_PEDIDO_UPDATED`). Nenhum `service` do frontend chama essa
rota; a busca por quem escreve `numero_pedido` no frontend inteiro devolve
**só esta órfã**.

Enquanto isso, `Solicitacoes/index.jsx` e `LinhaSolicitacao.jsx` **exibem**
`numero_pedido` em coluna e em tooltip. A coluna existe, a auditoria
existe, a validação existe — e o campo só se preenche por integração
externa ou banco.

### Agrupando para decidir

| Grupo | Órfãs | Decisão que faz sentido |
|---|---|---|
| **Restos** | 7, 9, 10 (e o `SolicitacaoDetalhe/Comprovantes.jsx` de 0 bytes) | Remover. Nada se perde; a #9 ainda ignora o tema |
| **Capacidade viva sem porta** | 6, 8 | **Dar rota e ponto de entrada.** Nos dois o backend está em uso e a interface é o único elo faltando |
| **Nunca ligado ponta a ponta** | 1, 5 | Terminar (front + rota) **ou** remover as duas pontas juntas — a tela e o serviço backend sem consumidor |
| **Conjunto das conversas** | 2, 3, 4 | **E3 + E4, uma decisão só** (ver abaixo) |

### E3 e E4 continuam sendo UMA decisão

Reafirmado com a medição desta fatia. As três telas de conversa navegam
para `/conversas/:id`, que **não tem rota** — e a aplicação não tem rota
curinga, então o destino é tela branca silenciosa.

- Consertar a rota sem as telas → uma rota que abre caixa vazia.
- Remover as telas sem a rota → uma rota quebrada a menos e três telas a
  menos, mas o módulo de Comunicação Interna fica só com a
  `ComunicacaoInterna.jsx`, que é outra coisa.

A pergunta única: **o sistema deve ter conversa por thread com caixa de
entrada e saída, ou a comunicação interna é só a tela que já existe?** As
três telas e a rota seguem juntas a resposta, qualquer que seja.


---

## Para o responsável — Financeiro, fatia 4: o upload de comprovantes (04/09)

Achados de **backend**, medidos no fechamento da leva. Nenhum foi
corrigido: são regra e dado, não layout. `ComprovanteController.uploadMassa`
e a rota `POST /comprovantes/upload-massa`.

### U1 — O VALOR do comprovante é inventado a partir do nome do arquivo

```js
const valor = nome.match(/\d+([.,]\d{2})?/);
if (valor) result.valor = valor[0].replace(',', '.');
```

**O primeiro número que aparecer no nome do arquivo vira o valor monetário
do comprovante.** Rodado sobre nomes reais:

| Nome do arquivo | Solicitação achada | **Valor gravado** |
|---|---|---|
| `SOL-12.pdf` — *o exemplo da própria tela* | SOL-12 | **12** |
| `SOL-000123.pdf` | SOL-000123 | **000123** |
| `comprovante 1.234,56 SOL-45.pdf` | SOL-45 | **1.23** |
| `NF 8899 OBRA-A1.pdf` | — | **8899** |

Duas coisas ao mesmo tempo:

1. **A convenção que a tela ensina fabrica dinheiro.** Quem seguir a
   instrução `SOL-12.pdf` grava um comprovante de valor 12 que ninguém
   digitou.
2. **Quando o valor está mesmo no nome, ele sai errado.** `1.234,56` vira
   `1.23` — a expressão pára no primeiro `.` e o `,56` é descartado. Erro
   de três ordens de grandeza, para menos.

O campo é `Comprovante.valor` e alimenta a conferência de comprovantes.

**Sugestão, para decisão de quem manda**: não inferir valor de nome de
arquivo. Um valor inventado é pior que valor ausente — ausente se vê,
inventado se confere.

### U2 — "Upload realizado com sucesso" para dois desfechos diferentes

O controlador termina sempre igual:

```js
return res.json({ message: 'Upload concluido' });
```

Arquivo com `SOL-nn` no nome → `status: 'VINCULADO'`, com histórico na
solicitação. Arquivo sem → `status: 'PENDENTE'`, esperando vínculo manual.
**Os dois recebiam a mesma frase.**

Mitigado no front nesta fatia — a tela agora conta antes do envio quantos
arquivos não têm o código, e depois do envio diz quantos ficaram pendentes.
**É mitigação, não conserto**: quem conhece o desfecho de cada arquivo é o
servidor, e a resposta continua não dizendo.

### U3 — Falha no meio do lote grava metade e responde erro total

O laço não tem proteção por arquivo. Se o sétimo de dez falhar no envio ao
S3, os seis primeiros **já estão gravados** e a resposta é `500 Erro no
upload`. A pessoa reenvia os dez, e **`Comprovante.create` não tem nenhuma
chave de idempotência** — os seis primeiros duplicam.

Combinado com U1, cada duplicata carrega o mesmo valor inventado.

### U4 — Nome com `OBRA-<n>` cai em `findByPk` do id interno

```js
obra = await Obra.findOne({ where: { codigo: String(info.obra).toUpperCase() } });
if (!obra && String(info.obra).match(/^\d+$/)) obra = await Obra.findByPk(info.obra);
```

Não achando pelo código, procura pelo **id interno** da tabela. Um arquivo
chamado `OBRA-3 comprovante.pdf`, numa base onde não exista obra de código
"3", é vinculado à obra **cujo id é 3** — que pode ser qualquer uma.
Convenção de nome de arquivo alcançando a chave primária do banco.

---

## A TERCEIRA CATEGORIA QUE A REGRA DE NAVEGAÇÃO NÃO COBRE (04/09)

A regra registrada hoje em `REGRAS-LAYOUT.md` separa duas coisas:

| Isto é… | Mora em |
|---|---|
| Ação sobre esta tela | barra de ações; as raras, no menu "⋯" |
| Caminho para outra tela | hub do módulo, breadcrumb, Ctrl+K |

A varredura que a regra pediu (toda `secundarias`/`acaoPrincipal`/
`destrutiva`/`mais` do `PageHeader` com `to:`) devolveu **dois** destinos no
sistema inteiro:

1. **`FinanceiroTitulos` · "Novo título" → `/financeiro/titulos/novo`** —
   não é defeito. Sub-rota da própria listagem: criar registro é AÇÃO,
   mesmo abrindo outra rota. A C6 já sabe disso e tem prova de que não
   acusa `/usuarios/12/editar` na barra de ações.

2. **`FinanceiroTituloDetalhe` · "Abrir solicitação" →
   `/solicitacoes/:id`** — o item 5 das decisões pendentes, hoje tolerado
   por exceção declarada no `telas.mjs`.

### Por que o segundo não se resolve com a regra nova

Ele não é atalho de módulo. É **link para o REGISTRO RELACIONADO**, seguindo
uma relação do dado — e nenhum dos três lugares da regra consegue hospedá-lo:

- o **hub** não sabe a qual solicitação *este* título pertence;
- o **breadcrumb** devolve à hierarquia do próprio módulo, não à de outro;
- o **Ctrl+K** acha telas por nome, não o registro ligado ao que está aberto.

É uma terceira categoria, e ela precisa de lugar declarado:

| Categoria | Mora em |
|---|---|
| Ação sobre esta tela | barra de ações / menu "⋯" |
| Caminho para outra tela | hub, breadcrumb, Ctrl+K |
| **Link para o registro relacionado** | **em aberto** |

### As duas saídas honestas

**(a) No corpo da tela, junto do campo que o origina** — "Solicitação:
SOL-1957" com o código clicável, onde o vínculo é lido. Recomendada: o link
ao lado do dado explica POR QUE ele existe; na barra de ações ele fica sem
contexto, e é justamente essa falta de contexto que a C6 chama de
"navegação vestida de ação".

**(b) Declarar a categoria como pertencente à barra de ações por natureza**,
e ensinar a C6 a distinguir "outra rota do módulo" de "registro relacionado
a este".

**Decisão do cliente, pendente.** Enquanto ela não vem, a exceção segue
declarada no `telas.mjs` — declarada, nunca silenciosa.

### O que este caso ensina sobre regras

A regra de hoje nasceu de um conflito real e resolveu-o. Na primeira
varredura que ela mesma pediu, apareceu um caso que ela não prevê. **Isso
não a invalida: mostra que ela tem alcance conhecido.** Regra que parece
cobrir tudo é regra que ninguém testou contra o sistema inteiro.

## DECISÃO DE ESCOPO: `GestaoContratos` sai da rodada 2 e vai para a de Contratos (04/09)

**Decidido por mim**, pelas regras de ritmo: é escolha de onde a tela é
medida, reversível e sem mudar comportamento.

`/gestao-contratos` aparece no hub de Configurações, seção "Cadastros", e por
isso entrou no escopo da rodada 2. O levantamento mostrou por que ela não
cabe ali:

- **1.900+ linhas**, duas instâncias de `TabelaPadrao` em ramos exclusivos;
- **38 caixas do navegador** — 33 `alert`, 4 `confirm`, 1 `prompt`. É o maior
  passivo isolado do sistema, e o número bate exatamente com o congelado no
  trinco;
- um modal de anexos feito à mão, com o rodapé saindo da vista quando o
  conteúdo passa do teto — o defeito que a R27 fecha;
- `overflow: hidden` em `.contratos-table-card`, que é regra de `index.css` e
  não da tela.

**Por assunto ela é de Contratos, não de Configurações** — o hub apenas a
alcança. Uma tela desse tamanho medida de raspão no fim de uma rodada de 33 é
o tipo de coisa que passa verde por cansaço.

Vai para a **rodada 3 (CRM + Comercial + Contratos)**, onde tem espaço para
ser uma fatia própria. Rodada 2 fecha em **33 telas**.

**O critério que fica**: hub que alcança não define dono. Dono é o assunto.

## I3 — O RESUMO DO VALIDADOR CHAMAVA AVISO DE "EXCEÇÃO REGISTRADA" (04/09)

Terceiro defeito dos meus próprios instrumentos, e o mais silencioso dos três.

A última linha do `validarLayout.mjs` dizia:

```
[layout] ok — 68 tela(s) do manifesto dentro das regras (24 exceção(ões) registrada(s)).
```

`24` era `avisos.length`. E aviso ali é coisa de **três naturezas
diferentes**: exceção de regra de fato registrada, trinco que apertou e pede
limpeza, e alerta de cobertura. Chamar as três de "exceção registrada" fazia
o rodapé mentir **na direção mais cara**: quem lê "24 exceções registradas"
entende que 24 regras foram dispensadas.

### Como apareceu

Durante a onda de correção da rodada 2 o número saltou de **6 para 24**. Fui
atrás de quem tinha criado 18 licenças novas — exceção é licença para escapar
de regra, e 18 de uma vez seria grave.

**Ninguém tinha criado nenhuma.** Os agentes zeraram dezenas de `alert()`, e
cada zeragem gera um aviso pedindo para remover a linha do
`trinco-dialogos.json`. O número subiu **porque o sistema melhorou**, e o
texto dizia o contrário.

### O conserto

O resumo agora separa por natureza:

```
[layout] ok — 68 tela(s) do manifesto dentro das regras
              (26 aviso(s): 5 exceção(ões) de regra · 20 trinco(s) a limpar · 1 outro(s)).
```

### A lição, que é a mesma de sempre com outra roupa

Resumo que nomeia errado o que conta é da **mesma família do check que
aparece verde sem medir**: os dois entregam confiança que a medição não
sustenta. A diferença é que o check verde erra para menos e este errava para
mais — mas os dois erram no mesmo lugar, que é a distância entre o que o
número mede e o que a frase promete.

**Todo agregado precisa dizer de que é feito.** Um total sem composição é um
número pedindo para ser lido errado.

## DECISÃO DE ESCOPO: Solicitações sai da rodada 2 e vira rodada própria (04/09)

Decisão do responsável, com o mesmo critério aplicado à `GestaoContratos`
horas antes: **hub que alcança não define dono, e tela pesada não entra de
carona no fim de uma rodada.**

A rodada 2 nasceu como "Solicitações + Configurações". O levantamento mostrou
que os dois lados não têm o mesmo peso:

| Configurações | Solicitações |
|---|---|
| 27 telas, a maioria de uma tela por assunto | 6 telas, três delas enormes |
| já reformadas e no manifesto | nenhuma tocada, nenhuma no manifesto |
| — | `NovaSolicitacao`: 3.710 linhas, **74 `alert()`** |
| — | `SolicitacaoDetalhe`: 20 arquivos, ~47 caixas do navegador |
| — | pasta `Solicitacoes`: 4 defeitos em CSS **compartilhado** |

**A rodada 2 fecha com as 27 de Configurações.** Solicitações vira rodada
própria, com espaço para o CSS compartilhado — que é o que mais assusta ali,
porque `--sol-font-base: 13px` e `.solicitacoes-filtros .input { min-height:
40px }` afetam telas de outros módulos.

O que fica registrado como critério, e já vale para as duas vezes que foi
usado hoje: **rodada é unidade de medição, não de calendário.** Emendar uma
tela grande no fim de uma rodada para "não sobrar" é como o número que soma
só a página — parece completo e não é.

## DÍVIDA ABERTA HOJE, DE PROPÓSITO: a `NovaSolicitacao` ganhou seta de voltar e não tem guarda de saída (04/09)

A C3 exige seta de voltar em tela de registro, e a `NovaSolicitacao` não
tinha. Ela ganhou uma agora, junto com o subtítulo dinâmico. **A tela tem
zero guardas de saída** — nenhum `beforeunload`, nenhum estado "sujo",
nenhuma confirmação. Conferido por varredura, não por suposição.

Ou seja: quem preencher trinta campos e clicar na seta perde tudo, calado.

### Por que a seta ficou mesmo assim

O risco **não é novo e não é dela**. A tela já tinha três saídas sem guarda —
o menu, o breadcrumb e o Ctrl+K —, e todas perdem o formulário do mesmo
jeito. A seta não cria um mecanismo novo: cria uma **porta mais convidativa**
para um mecanismo que já existia sem proteção.

Tirar a seta trocaria um item obrigatório da DoD por uma proteção que não
existe de qualquer forma. Seria fechar a porta da frente deixando as três
laterais abertas, e ainda ficar devendo a C3.

### O que fica devendo, e onde se paga

**Guarda de alterações não salvas, para a tela inteira** — não para a seta.
É trabalho da rodada de Solicitações, onde a `NovaSolicitacao` é reformada de
verdade, e precisa cobrir as quatro saídas de uma vez.

**Registro honesto de quem achou**: não fui eu. Foi o agente que fez a
mudança, no relatório dele, oferecendo remover a linha que tinha acabado de
escrever. Achado que aparece contra o próprio trabalho é o mais barato de
ignorar e o mais caro de perder.

## OS TOKENS DE FONTE DO MÓDULO DE SOLICITAÇÕES — são TRÊS, e o problema é maior que a escala (04/09)

Decisão do responsável: padronizar nos degraus da escala, na rodada de
Solicitações, junto dos outros defeitos de CSS compartilhado. **A decisão
vale; dois fatos precisam ir junto com ela.**

### Fato 1: são três, declarados duas vezes

```css
.solicitacoes-page {              @media (max-width: 1023px) {
  --sol-font-base:   13px;          .solicitacoes-page {
  --sol-font-small:  12px;            --sol-font-base:   12px;
  --sol-font-header: 11px;            --sol-font-small:  11px;
}                                     --sol-font-header: 10px;   }  }
```

Os degraus são 12/14/18/22. Fora deles: 13, 11 no desktop; 12 passa; e no
mobile **11 e 10 ficam ABAIXO do piso de 12px**, que a R10 proíbe em
conteúdo. O caso mais grave é o `--sol-font-header`, aplicado com
`!important` em `index.css:2731`.

### Fato 2, que muda de quem é o conserto: um componente GENÉRICO lê um token de ESCOPO

```css
.solicitacoes-page { --sol-font-base: 13px; }   /* declarado SÓ aqui */

.app-table-shell .table          { font-size: var(--sol-font-base); }
.app-table-shell .table thead th { font-size: var(--sol-font-header); }
.app-table-shell .table tbody td { font-size: var(--sol-font-base); }
```

`.app-table-shell` é a casca de tabela **do sistema**, usada por **11
telas**. Os três tokens são declarados **exclusivamente** em
`.solicitacoes-page`. Fora dela, `var(--sol-font-base)` não resolve para
nada: a declaração inteira fica inválida e o `font-size` cai no herdado.

É a **terceira aparição da mesma família num só dia** — `app-alert--success`,
`--c-card`/`--c-surface-alt`, e agora esta. Só que aqui com uma variação
pior: o token **existe**, e existe no lugar errado. Quem lê o CSS vê uma
declaração completa e correta; ela só não vale onde é lida.

### O que isso implica para a rodada

O arquivo é o mesmo, e a classe do problema é a mesma — a decisão de fazer na
rodada de Solicitações continua válida. **Mas o alcance não é o do módulo**:
mexer nesses três tokens toca a casca de tabela de 11 telas, várias já
aprovadas. A rodada de Solicitações precisa levar regressão além das próprias
telas, ou o conserto muda a fonte de tabelas que ninguém pediu para mexer.

**A pergunta que fica para quando a rodada abrir**: `.app-table-shell` deve
ter tokens PRÓPRIOS, nos degraus, em vez de tomar emprestado os de um módulo?
Componente do sistema que depende de variável declarada por uma página é
dependência invertida — e é ela que produziu o defeito.

## DEFEITO DE PROCESSO MEU: `git add -A` com agente ainda escrevendo (04/09)

O commit `d6b081d` tem a mensagem *"Registra os tokens de fonte do
Solicitações"* e carrega, além disso, a correção inteira de duas telas
(`ConfiguracoesNotificacoesSistema` e `ConfiguracoesComercialCategorias`) —
o alcance mentido do "Desativar todos" e a exclusão sem confirmação.

**O código está certo e nada se perdeu.** O que ficou errado é o registro: um
commit que carrega trabalho que a mensagem dele não menciona torna o
histórico não confiável. Quem procurar depois "quando o alcance do botão foi
consertado" vai achar um commit sobre tokens de fonte.

### A causa

Rodei `git add -A` enquanto um agente ainda editava os arquivos dele. O `-A`
não sabe de quem é o trabalho: ele varre a árvore.

**Quem achou foi o próprio agente**, no fim do relatório: *"durante a sessão
um processo automático criou o commit `d6b081d` (autor 'Claude') que já
incorporou minhas alterações"*. Ele não tinha como saber que o processo
automático era eu.

### A regra que fica

Com agente em voo, **commit é por caminho explícito**, nunca `git add -A`. O
`-A` só depois que a onda inteira pousou e eu conferi o `git status`.

Não reescrevi o histórico: `d6b081d` já estava empurrado, e reescrever branch
publicada troca um registro impreciso por um registro quebrado. Fica esta
anotação, que é o que o commit deveria ter dito.

## O MESMO DEFEITO DE REGISTRO, DUAS VEZES EM DUAS HORAS — e a regra que eu tinha escrito não pegou (05/09)

O commit `ac71f68` diz *"Rodada 3: as 7 telas de Comercial e Contratos
migradas"* e carrega também, sem mencionar: o conserto do `index.css`, o
check R1 do harness realinhado com a R9, o contra-sinal estrutural da R12, as
três declarações de `cadastroInline` e a matriz regravada.

**É o mesmo defeito de `d6b081d`, registrado duas horas antes, com a regra
"com agente em voo, commit é por caminho explícito" escrita logo abaixo.**

### E eu usei caminho explícito. A regra não bastou.

O que aconteceu foi outro mecanismo:

```
git add <7 caminhos de infra> && git commit ...    ← o add ERROU num arquivo ignorado
                                                     e o && cancelou o commit
                                                     MAS os outros 6 ficaram STAGED
git add <7 telas> && git commit ...                ← este commit levou os 13
```

O `git add` **falha e mesmo assim estaga o que conseguiu**. O `&&` protege
contra o commit errado acontecer, não contra o índice ficar sujo — e o commit
seguinte varre o índice inteiro, não os caminhos que eu escrevi nele.

### A lição, que é maior que git

**Eu tratei "usei caminho explícito" como garantia, quando era só intenção.**
A intenção estava no comando; a garantia teria que estar na CONFERÊNCIA do
que ficou de fato no índice. É exatamente a distância entre o que o número
mede e o que a frase promete, que este projeto já registrou três vezes em
outras roupas — e desta vez o número era o meu próprio `git add`.

### A regra, agora mecânica

Antes de todo `git commit`: **`git diff --cached --name-only`, e comparar com
a lista que eu pretendia**. Se divergir, `git reset` e recomeçar. Verificar o
índice, não confiar no comando que o montou.

Não reescrevi o histórico: `ac71f68` já estava empurrado, e reescrever branch
publicada troca um registro impreciso por um registro quebrado. Fica esta
anotação, que é o que os dois commits deveriam ter dito.

## LEVA DE COMPONENTE: o hub de Configurações precisa renderizar a partir da FONTE ÚNICA (05/09)

Entra na fila junto das outras duas de componente — `TabelaPadrao` e a R28
(aviso de sucesso persistente).

### O problema, no argumento do responsável

O `Configuracoes.jsx` monta seus **45 destinos à mão**, sem passar pelo
`navigationConfig`. Enquanto for assim:

> **Toda porta nova aumenta a dívida da fonte única — e cada uma delas é uma
> decisão do responsável sendo punida por uma limitação de arquitetura.**

Foi exatamente o que aconteceu. Na rodada 1 ele mandou abrir porta para duas
telas que existiam, tinham rota, tinham guarda de permissão e **não tinham
link em lugar nenhum**. A decisão estava certa; abrir as portas subiu o
trinco de 43 para 45 e deixou um portão vermelho por dois dias.

### O que o trinco existe para evitar, e por que ele estava certo

Lista de destino escrita à mão é a família "existia e ninguém sabia": a
permissão é reavaliada com regra própria, destino renomeado na fonte única
continua velho ali, e ninguém sabe que a lista existe. O trinco só desce.

**Ele subiu uma vez, em 05/09, por decisão registrada.** É a única exceção, e
está anotada no próprio `scripts/trinco-navegacao.json`.

### O conserto de raiz

O hub passa a renderizar suas seções **a partir do `navigationConfig`**, com
o agrupamento por seção declarado lá. Resolve os 45 de uma vez, e porta nova
deixa de custar dívida.

Não é emenda de rodada: muda a fonte da navegação de uma tela que 45 destinos
atravessam, e precisa de regressão própria — a mesma razão pela qual a R28 e
a leva do `TabelaPadrao` esperam.

---

## O QUE NÃO É CONFERIDO POR ROTINA NÃO É CONFERIDO — a lição aplicada a mim (05/09)

Em um só dia, **dois portões diferentes ficaram vermelhos por dias sem que eu
visse**:

1. `validarResponsividadeFrontend.mjs` — quebrado por um commit meu, três
   commits atrás;
2. `validarNavegacao.mjs` — vermelho desde a rodada 1, quando abri duas
   portas.

**Quem achou os dois foram agentes**, em arquivos que não eram deles,
rodando checks que eu não estava rodando.

### A causa não foi distração

Eu rodava `validarLayout.mjs` e `npm run build`. Os dois passavam. E
`validarLayout` **não está** dentro do `test:responsive` — são dois conjuntos
disjuntos, e eu só conhecia um. O `test:responsive` roda outros quatro
verificadores (responsividade, navegação, cancelamento e as sete provas).

Confiar em "rodar os checks" quando os checks são duas listas separadas é o
mesmo defeito que este projeto registra desde o começo: **o check existia e
não estava ligado a nada que alguém executasse** (é a segunda lição da R20,
com outro sujeito — antes era o repositório, agora era eu).

### O conserto, que não é lembrar melhor

`npm run verificar` — um comando só:

```
node scripts/validarLayout.mjs && npm run test:responsive && npm run build
```

Hábito que depende de memória para incluir uma lista falha do mesmo jeito que
regra sem check. O ciclo de verificação passa a ser **um** comando, e o que
ele não cobrir precisa entrar nele, não na minha lembrança.

## A PROVA DE MORDIDA ME PEGOU AFROUXANDO UM CHECK (05/09)

O melhor caso do dia para o mecanismo de provas, porque a vítima fui eu.

### O que eu ia fazer

A matriz reprovou `comercial-unidades · F3` — "filtro abriu sem opções de
MARCAÇÃO". O filtro está certo: as opções vêm de `empreendimentos.map(...)` e
a base do preview não devolveu nenhum empreendimento. O painel abriu vazio
por falta de dado, não por defeito.

Escrevi um conserto que me pareceu óbvio: **painel vazio vira SEM DADO**.
Argumentei até bem — vermelho sem defeito mente igual a verde sem medir.

### Por que estava errado

`npm run verificar` reprovou na hora, e a reprovação veio da prova
`itensDoRunnerMordem.mjs`, que planta defeitos e exige que o check morda:

```
FALHA  F3 ← filtro que abre sem nenhuma opção de marcação
       :: SEM DADO — ... capacidade NÃO PROVADA
```

A fixture planta uma tela que **genuinamente não tem marcação nenhuma**. O
painel dela também abre vazio. Ou seja: **a minha distinção não distingue
nada** — os dois casos renderizam a mesma coisa, e o meu conserto abria
exatamente o buraco que a prova existe para achar.

### O que isso ensina, e é diferente das outras lições do dia

As outras foram sobre check que não via defeito. **Esta foi sobre eu quase
apagar um check que via**, com um argumento que soava certo — inclusive
citando a regra do projeto sobre vermelho falso.

Argumento bom não é prova. O que separou os dois foi a fixture: ela mostra
que o sinal que eu ia usar (painel vazio) é o MESMO nos dois casos, e nenhum
raciocínio conserta um sinal que não discrimina.

### O conserto de verdade, que fica pendente

Para separar os dois casos o **componente** precisa dizer qual é: a
`BarraFiltros` renderiza um estado vazio explícito quando uma dimensão tem
zero opções. Aí:

| O painel mostra | Veredito |
|---|---|
| controles de marcação | PASSOU |
| o estado vazio do componente | SEM DADO |
| qualquer outra coisa, ou nada | FALHOU |

É mudança em componente compartilhado, então vai para a leva de componente,
junto da R28 e do `TabelaPadrao`. **Até lá a célula fica FALHOU** — e é
melhor assim: célula vermelha que eu sei explicar é mais honesta que verde
que eu não consigo defender.

---

# 05/09 — Rodada 4 (CRM) e três portões que mediam menos do que prometiam

## A F3 me mordeu DUAS vezes, e a segunda foi mais sutil que a primeira

O registro acima termina dizendo que o conserto certo era o **componente**
declarar a ausência. Fiz isso: a `BarraFiltros` passou a renderizar
`data-vazio="sem-opcoes"` com um texto que nomeia a dimensão, e ensinei a F3
a ler essa marca como SEM DADO.

**A prova reprovou de novo.** E o motivo é humilhante de tão simples: o
componente emite a marca SOZINHO. A tela plantada usa o mesmo componente,
então ganhou a declaração de graça. Eu tinha trocado um sinal que não
discrimina por outro sinal que não discrimina.

O que distingue de verdade é o formato que a **R1 já usa e o cliente já
aprovou**: DECLARAÇÃO DO AUTOR no manifesto (`filtroSemOpcoesNaBase`) MAIS
verificação de que a tela diz isso à pessoa. As duas condições, nunca uma:

| Manifesto declara | Tela diz à pessoa | Veredito |
|---|---|---|
| — | — | FALHOU |
| — | sim | FALHOU (a marca é do componente, não é declaração) |
| sim | não | FALHOU (declarou e deixou a pessoa no vazio) |
| sim | sim | SEM DADO |

Prova rodada depois: 20 defeitos plantados, 7 controles negativos, 0
não-prováveis.

**A lição que vale além da F3**: marca emitida por componente compartilhado
NUNCA serve como declaração de intenção da tela. Ela prova que o componente
foi usado, não que alguém decidiu alguma coisa. Declaração precisa de autor.

## O portão da R18 conhecia UM módulo

A varredura de `overflow: hidden` em CSS olhava `src/index.css`,
`componentes-padrao.css` e módulo com **"governanca" no caminho** — o módulo
onde a regra nasceu. Todo o resto de `src/modules/**` e de `src/styles/**`
passava batido.

O custo apareceu inteiro num levantamento de Compras:
`solicitacao-compra/compras-responsive.css` sobrescreve `.app-table-shell`
— que o `index.css` declara `overflow: clip` **justamente como defesa escrita
da R18** — com `overflow: hidden` e especificidade maior (0,2,0 contra
0,1,0), em 13 rotas. **O CSS de um módulo desfazia a defesa criada para
impedir esse defeito, e o verificador não olhava o arquivo.**

Varredura alargada para todo CSS de `modules/`, `styles/` e `components/`:
**26 falhas expostas de uma vez**, em quatro arquivos que nunca tinham sido
medidos. Todas corrigidas para `clip`.

É a pergunta permanente outra vez, agora aplicada ao próprio verificador:
não "quantos casos existem?", e sim "de quantos jeitos isso é feito aqui?".

## O meu próprio comando de verificação estava na ordem errada

`npm run verificar` rodava `test:responsive` **antes** do `build`. O
`validarResponsividadeFrontend.mjs` compara as classes do FONTE com as do
`dist/` — então ele comparava o fonte novo com um bundle velho.

Isso não é só alarme falso. É pior na outra direção: **uma classe removida do
fonte continua no bundle antigo e o portão passa verde.** O check existe
exatamente para pegar regra que some entre o fonte e o bundle, e a ordem
errada o cegava para o caso que ele foi feito para achar.

Ordem corrigida: `build` antes de `test:responsive`.

## O token de fonte declarado numa página e lido por onze telas — consertado

Registrado em 04/09, executado agora. O tamanho real era maior do que eu
tinha medido: **não eram só as fontes**. Nove seletores compartilhados
(`.app-table-shell`, `.app-list-card`, `.app-filter-field`,
`.app-summary-card`, `.app-empty-card`, três `.finance-*` e quatro de
`.solicitacao-nova-page`) liam `--sol-border-color`, que só existe dentro de
`.solicitacoes-page`.

E propriedade customizada indefinida **invalida a declaração inteira**, não
só a cor. Ou seja: `border-bottom: 1px solid var(--sol-border-color)` numa
tela fora da página não ficava com borda de outra cor — ficava **sem borda
nenhuma**. Linha de tabela sem separador, em silêncio, em toda tela que usa
a casca padrão fora do módulo de Solicitações.

Corrigido: os seletores compartilhados passam a ler os tokens do sistema
(`--ui-border`, `--fonte-corpo`, `--fonte-detalhe`). As classes `.sol-*`
entraram junto porque também são usadas fora da página (o CRM usava
`sol-surface-card`) — apontá-las para o token do sistema faz a classe
funcionar onde quer que seja montada, que era o defeito de origem.

Efeito visível e deliberado, dentro da ordem do cliente de 04/09: corpo da
tabela vai de 13px para o degrau `--fonte-corpo` (14px) e o cabeçalho de 11px
para `--fonte-detalhe` (12px), respeitando o piso de 12px.

## R28 executada: aviso de sucesso é persistente por padrão

Decidida em 04/09, executada agora, na leva do componente. Sucesso deixa de
sumir em 6s e passa a esperar a pessoa fechar. `opcoes.efemero` devolve o
sumiço automático para o caso raro em que o sucesso é ruído.

Duas verificações feitas ANTES de inverter, porque aviso persistente sem
botão de fechar seria armadilha e não melhoria:
1. Os **117** arquivos que renderizam `<Avisos>` passam `aoFechar` — o "x"
   sempre existe.
2. O "x" só virou alvo clicável de verdade nesta mesma leva. Ver M1 abaixo.

## M1: o "x" do Alert tinha 16px porque nunca teve medida própria

A célula que sobrou da matriz das 103. O botão de fechar do `Alert` não tinha
nenhuma regra de tamanho — encolhia até o tamanho do ícone. Como o `Alert` é
componente compartilhado, o defeito valia para **toda tela em que um aviso
aparecesse**; só apareceu na matriz numa célula porque só ali um aviso
renderizou durante a medição.

O mecanismo (`--alvo-clique`, 32px desktop / 44px toque) já existia desde a
leva 0. Faltava aplicar. Corrigido também no login, que estava em 24,8px.

**Defeito de componente compartilhado aparece na matriz como uma célula e é
lido como problema de uma tela.** Vale desconfiar de célula solitária.

## Duas confirmações que os agentes acrescentaram e eu tirei

Os briefings pediram para revisar o consentimento das ações que mudam estado,
e dois agentes leram isso como "acrescente confirmação": arrastar cartão no
Kanban e concluir tarefa passaram a abrir modal.

Tirei as duas. Arrastar é o gesto principal do quadro e se desfaz pelo gesto
inverso; concluir tarefa é a ação de rotina pela qual a tela existe.
Confirmação existe para o que **não se desfaz** — pergunta que vira ruído
deixa de ser lida, e "Sim" no automático é o contrário de consentir. Ficou a
de cancelar tarefa, que é a destrutiva.

O que NÃO saiu foi a outra metade da R26 — alvo fixado em `const` antes do
`await` — porque ali era **conserto, não zelo**: o `onDrop` do Kanban movia o
lead vindo do `dataTransfer` e conferia a etapa do `draggedLead`. Divergindo
os dois, movia um lead cuja etapa nunca foi conferida.

## Os 11 validadores de regra de negócio do backend: medidos

A premissa que eu tinha levado ao cliente ("6 de 26 ligados, provadores entre
os desligados") estava errada e já foi corrigida. O número real: **todos os 7
provadores ESTÃO ligados**; os desligados eram 11 validadores de regra de
negócio do backend.

Medidos agora, um a um. E a razão de estarem desligados é mais simples do que
parecia: **não existe diretório `.github/` no repositório** — não há workflow
nenhum, para esses 11 nem para os outros 50.

| Resultado | Quantos |
|---|---|
| Passam | 8 |
| Falham | 1 |
| Não executáveis (falta MySQL) | 2 |

Os 8 ligados em `npm run verificar:regras` no `backend/package.json`.

O único vermelho **não é defeito de regra de negócio**: o
`validarCaixaFisico` procura a string `Caixas e Contas` num `<h1>` que a
reforma trocou por `<PageHeader titulo="Caixas e contas" />` (com "contas"
minúsculo), e procura `overflow-x-auto` numa tabela crua que virou o
componente compartilhado. **O teste envelheceu, a funcionalidade está lá.**
As 9 âncoras de regra de verdade (trava de OFX, lock em transação, bloqueio
de fechamento retroativo, rotas, controller) passam inteiras.

Fica pendente: 2 linhas em `backend/scripts/validarCaixaFisico.js` para ele
entrar no `verificar:regras` e virar 9 ligados.

## Pergunta em aberto para o cliente — CrmLeads: ListaAvancada ou TabelaPadrao?

A regra registrada manda a listagem PRINCIPAL de um módulo usar
`ListaAvancada`. A `CrmLeads` ficou em `TabelaPadrao`, e o motivo é um
conflito entre duas regras registradas, não preferência:

A `ListaAvancada` **deliberadamente não tem ação por linha**. A `CrmLeads`
tem "Arquivar" por linha — que não é navegação (essa é o clique na linha),
é ação de ciclo de vida sobre um registro só. Migrar a obrigaria a sumir, ou
a virar ação de lote, **que só aparece com 2+ selecionados** — arquivar um
lead sozinho deixaria de existir. E remover capacidade exige a sua palavra.

As duas saídas:
- **(a)** `CrmLeads` fica em `TabelaPadrao`, e a regra do módulo principal
  ganha escopo declarado: *"salvo quando a listagem tem ação de ciclo de vida
  por linha"*.
- **(b)** O "Arquivar" por linha sai (com sua aprovação) e a tela migra para
  `ListaAvancada`, ganhando visões e filtros salvos.

Está em (a) hoje, que é a opção que não remove nada.

## O CSS de Compras restila o SHELL do sistema — meio corrigido, de propósito

`modules/solicitacao-compra/compras-responsive.css` (1.365 linhas) entra
**global** pelo `main.jsx` e vale onde a classe `.compras-responsive-scope`
estiver: 13 rotas pelo `Layout.jsx`, mais uma aplicação à mão dentro da
`SolicitacaoDetalhe`. Dentro desse escopo ele redefine **12 classes da
topbar** e **15 classes genéricas `app-*`** — que são do sistema de design,
não do módulo.

E duas telas **já reformadas e aprovadas** estão nesse escopo
(`configuracoes-status-pedidos-compra` e `configuracoes-cotacao`): usam o
padrão e recebem, por cima, o dialeto de um módulo.

### O que foi corrigido agora

As **24 declarações de fonte abaixo do piso de 12px** — a menor era 9,28px —
subiram para o degrau `--fonte-detalhe`. É regra, não estrutura, e o critério
vigente desde 02/09 é explícito: entre "cabe mais" e "lê-se melhor", vence a
leitura.

### O que NÃO foi corrigido, e por quê

As sobrescritas de `topbar-*` e `app-*`. Desfazê-las muda o arranjo das 13
rotas — e essas rotas são justamente as que a rodada de Compras vai reformar.
**Consertar a folha antes de reformar as telas quebraria as telas que estão
para ser refeitas.** Vai junto com a rodada de Compras.

## O tamanho real de Compras, medido (o cliente pediu cedo)

Três levantamentos paralelos, 27 arquivos. O número que importa:

| Classe | Telas | Linhas |
|---|---|---:|
| Wrappers (não fazer nada) | 2 | 10 |
| Leves | 9 | ~2.400 |
| Médias | 8 | ~4.100 |
| **Pesadas** | **4** | **~11.000** |

E as quatro pesadas são o projeto: `GerenciarCotacaoSolicitacao` (3.764
linhas, **7 componentes num arquivo**, 42 `useState` só na página, 60 caixas
do navegador), `PedidoCompraDetalhe` (2.746, 58 caixas), `NovaSolicitacaoCompra`
(2.356, 46 `useState`) e `GestaoFornecedores`.

**Três descobertas que mudam o plano:**

1. **Duas das "telas" não existem**: `NovaCompraDireta` e `RevisarCompraDireta`
   são wrappers de 5 linhas que renderizam o pai com uma flag. Reformar o pai
   reforma as duas rotas de graça.
2. **Não há economia de escala entre as telas de Revisar.** Medi de dois
   jeitos independentes: o par mais parecido do conjunto tem 0,17 de
   sobreposição de classes e 16 linhas idênticas. A intuição de "são a mesma
   tela três vezes" é falsa — são markup próprio, uma a uma.
3. **A duplicação real está em outro lugar, e é a mais cara**: o
   `ModalRespostaInternaCotacao` (449 linhas, dentro do `Gerenciar`) é o MESMO
   formulário da `CotacaoFornecedorPublica` — mesmos campos, mesma regra,
   **zero linha em comum**. E a `CotacaoFornecedorPublica` já está reformada,
   com `FormSecao`/`CampoForm`/`TabelaPadrao`, enquanto o interno tem 39
   `<input>` crus. É trabalho já feito e não reaproveitado.

**Onde o prazo pode estourar**: o comparativo de preços do `Gerenciar` tem
duas tabelas cruas com coluna fixa e **colunas geradas dinamicamente, uma por
fornecedor**. O `TabelaPadrao` não faz coluna dinâmica por dado. Ou o
componente cresce (R16b), ou vira exceção registrada — é **decisão de
produto**, e é o item de maior risco de prazo do módulo inteiro.

**Também medido**: os dez relatórios de Compras não são "parecidos", são
COPIADOS — `buildSearchParams` com o mesmo md5 nos dez. Ali a economia de
escala existe de verdade: a primeira custa, as nove seguintes são aplicação.

---

# 05/09 — O achado mais caro do dia: migrei 12 telas que ninguém consegue abrir

A matriz da rodada 5 voltou com **428 células vermelhas**. Não são 428 defeitos:
**408 são uma causa só.** As 12 telas de SST que acabei de migrar redirecionam
todas para `/sst/pgr`.

## Por que, e por que isso é pior do que parece

```js
export const SST_SIMPLIFIED_MODE = import.meta.env.VITE_SST_SIMPLIFIED_MODE !== 'false';
```

O modo simplificado é **verdadeiro por padrão** — só é falso quando a variável
vale exatamente a string `'false'`. **Não existe arquivo `.env` no repositório**
e a variável não aparece em nenhuma configuração.

E a guarda redireciona ANTES de olhar permissão:

```js
function SstDashboardRoute({ children }) {
  if (!canAccessSst(user)) return <Navigate to="/" replace />;
  if (SST_SIMPLIFIED_MODE) return <Navigate to={getSstSimplifiedEntry(user)} replace />;
  ...
```

Ou seja: **não é o usuário de QA que não pode. É todo mundo, sempre.** O
dashboard do SST, as duas telas de observabilidade, o executivo, o mapa de
calor, a linha do tempo, o eSocial e a configuração do módulo não abrem para
ninguém nesta configuração.

Eu gastei uma rodada migrando telas que ninguém consegue abrir. As telas estão
corretas e o trabalho serve no dia em que o modo mudar — mas **não são PRONTO**,
e a matriz está certa em recusá-las.

## Três consertos, e o primeiro é sobre mim

### 1. A varredura de alcance media a porta, não a abertura

Ela responde "existe caminho do menu até esta rota?" e nunca perguntou "a rota,
ao abrir, mostra a tela?". São coisas diferentes — e é a lição de 04/09 pelo
outro lado: *não precisar de porta e não ser porta são coisas diferentes*;
agora, **ter porta e a porta abrir são coisas diferentes**.

Ganhou a terceira pergunta. E o critério que separa o legítimo do defeito é o
mesmo dos dois lados: **redirecionamento por PERMISSÃO é correto** (a tela
existe, aquele usuário é que não pode); **redirecionamento por CONFIGURAÇÃO é
porta fechada** — vale igual para todo mundo. Neste repositório toda checagem
de permissão recebe `user`; condição que não menciona `user` não está
perguntando quem é a pessoa.

**E o detector conhecia UMA forma.** Achou 12 de 13. A décima terceira é a
`SstCrudPage`, que redireciona **de dentro da própria tela**
(`if (!isSstResourceVisible(resource)) return <Navigate to="/sst" />`),
encadeando dois saltos. Escrevi o detector e caí na minha própria armadilha
minutos depois: a pergunta permanente não é "quantos casos existem?", é **"de
quantos jeitos isso é feito aqui?"**.

Teve ainda um falso positivo que valeu a peneira: o `ModuleHub` faz
`if (!mod) return <Navigate to="/" />`. Isso é 404 — id de módulo que não
existe —, não porta fechada. O que separa os dois é a ORIGEM da condição:
porta fechada é decidida por configuração (helper vindo de `constants/`), que
responde igual para todo mundo.

Passivo congelado em `scripts/trinco-portas-fechadas.json`: **13 rotas, e o
número só desce**. Porta nova que não abre reprova na hora.

### 2. Tela que não abre tem UM defeito, não trinta e quatro

O harness escrevia FALHOU nos 34 itens da DoD. O comentário dele defendia
isso: "erro de carga é defeito da tela, e é o que se quer ver". A premissa está
certa; a contabilidade estava errada. Existe **um** defeito — a tela não abriu
— e 33 itens que **nunca foram medidos**. Afirmar 34 é fabricar 33.

Estado novo: **`NAO ABRIU`** (🚫), com a lista das telas no **topo** da matriz,
antes das falhas. Não é afrouxamento: a tela continua com FALHOU, e rodada com
tela que não abre não fecha. O que muda é parar de enterrar 20 defeitos reais
sob 408 afirmações que ninguém verificou.

### 3. Eu tinha apontado o harness para um recurso escondido

`/sst/colaboradores` não está entre os 9 recursos que o modo simplificado
mostra. Não é defeito da tela — é escolha minha de rota. Trocado por
`/sst/pgr`, que está na lista visível e exercita a MESMA tela.

## A decisão que é sua

**O modo simplificado deve mesmo esconder essas 12 telas?**

- Se **sim**: elas saem do menu e do manifesto. Hoje o menu mostra portas que
  não abrem, o que é pior do que não ter a porta.
- Se **não**: a constante muda (ou entra um `.env` com
  `VITE_SST_SIMPLIFIED_MODE=false`), e as 12 passam a valer com a matriz.

Não as duas coisas. Enquanto você não decide, a rodada do SST fica **aberta**.

## 05/09 — Componente compartilhado que não repassa o que a tela precisa não padroniza: apaga

Três agentes, em migrações diferentes do mesmo dia, relataram a mesma coisa
por caminhos independentes: **perderam capacidade porque o componente padrão
não tinha por onde passar.**

| O que se perdeu | Onde |
|---|---|
| Datalist de responsáveis (a única sugestão de um campo de nome livre) | filtros de Solicitações |
| `step="0.01"` nos campos de valor | filtros de Compras |
| Placeholders de exemplo ("Ex: SOL-12345") | filtros de Compras |
| "Selecionar todas" por dimensão | filtros de Solicitações |
| Slot de ícone no ladrilho | painéis do SST |
| Busca dentro do menu de marcação (500 colaboradores em caixa) | SstTimeline |

Nenhuma delas era enfeite, e o padrão de erro é o mesmo: **quem migra fica
entre perder a capacidade ou não usar o padrão, e as duas saídas são ruins.**
Um componente compartilhado que engole capacidade não está padronizando — está
apagando, e vai apagando um pouco a cada tela que adota.

Todos os seis foram para o componente:
- `BarraFiltros.campos` repassa `step`, `placeholder` e `sugestoes` (datalist);
- `FiltroRapido` ganhou "Marcar todas"/"Desmarcar" (só com mais de uma opção,
  nunca em dimensão `unico`, e respeitando a busca: com texto digitado ele diz
  **"Marcar as visíveis"**, porque agir sobre o que não está à vista é o mesmo
  defeito do "pergunta sobre 3, apaga 47");
- `FiltroRapido` ganhou busca acima de 12 opções;
- `StatTile` ganhou `icone` (era fragmento enfiado no rótulo, que o leitor de
  tela lia junto do texto);
- `.app-stat--info` passou a existir (o ladrilho aceitava `tom="info"` e
  renderizava neutro, engolindo a distinção em silêncio);
- `.app-alert--warning` passou a existir (era fantasma usada em telas já
  aprovadas, funcionando por acidente de a base ser âmbar).

**A regra que fica**: quando um agente relatar "precisei disso e o componente
não tem", isso é dívida do componente, não da tela — e cobrar dele é mais
barato do que deixar cada tela resolver por fora, que é como nasce dialeto.

## 05/09 — Zero de varredura que não varreu não é zero

A matriz reprovou a auditoria operacional na M1: botão de 30px. Ao abrir a
folha, achei mais do que o botão — **23 declarações de fonte abaixo de 12px, a
menor com 9px**. E o CSS de Compras tinha outras 24, a menor com 9,28px, na
**topbar que 13 rotas veem**.

O piso de 12px é critério do cliente desde 02/09 e é conferido pela R10 — que
lê **JSX**. Folha de CSS passava batido. Quem pegou foi a matriz no preview, no
item M1, e **só porque um dos elementos era clicável**: as fontes de 9px
teriam passado inteiras.

### O erro que quase entrou junto com o conserto

Escrevi o check e fui medir o passivo para decidir entre trinco e regra dura.
A medição devolveu **zero**, e eu ia ligar o check duro afirmando que não havia
dívida.

A medição rodou num diretório que não existia. `os.walk` sobre caminho
inexistente devolve **vazio, sem erro** — varredura que não varre devolve zero
igualzinho a varredura limpa. O check real, quando rodou, achou **196
declarações em quatro folhas**.

É a mesma família de "concordância não é cobertura", que este projeto já
registrou: **ausência de achado não é ausência de defeito quando o instrumento
não olhou.** E é a segunda vez no mesmo dia que eu escrevo um detector e caio
na armadilha dele — a primeira foi o detector de porta fechada, que conhecia
uma forma e achou 12 de 13.

**A regra que fica**: toda varredura que puder devolver vazio por não ter
olhado precisa **abortar em vez de reportar zero**. O script de medição agora
sai com erro se o diretório não existir; e o número que vale é o do check, que
roda de dentro do próprio validador.

Passivo congelado em `scripts/trinco-fonte-minima.json`, por arquivo, em 196.
Só desce. Declaração nova abaixo do piso reprova na hora.

---

# 05/09 — Quatro decisões do cliente, executadas

## 1. SST: as 12 telas saem do menu enquanto o modo simplificado estiver ligado

**Decisão do cliente, palavras dele:** *"Menu que mostra porta que não abre é
pior que ausência: a pessoa clica, não acontece nada, e ela não sabe se é
permissão, erro ou bug. Ligue a visibilidade do item de menu à mesma constante
que decide o redirecionamento — assim os dois nunca divergem de novo."*

### Onde estava o vazamento — e não era onde eu disse

O **menu** sempre esteve certo: `navigationConfig.jsx:487` já monta os filhos
do SST com `SST_SIMPLIFIED_MODE ? sstChildrenSimplified() : sstChildrenFull()`,
e as 12 telas não estão entre os 9 recursos do modo simplificado.

Quem vazava era o **catálogo de destinos** (`getAllDestinations`), que somava
deliberadamente a variante **OPOSTA**:

```js
const sstVariante = (SST_SIMPLIFIED_MODE ? sstChildrenFull() : sstChildrenSimplified())
```

Com o modo ligado, ele acrescentava exatamente as 12 telas que o próprio modo
redireciona. E é desse catálogo que saem os **atalhos fixáveis** e o **Ctrl+K**
— ou seja, a porta que não abre estava nos dois lugares onde a pessoa procura
quando não acha pelo menu.

**Corrigido**: o catálogo passa a usar a MESMA variante do menu, pela MESMA
constante. Não é possível divergirem de novo, porque agora é uma leitura só.
Atalho salvo apontando para destino escondido simplesmente deixa de aparecer —
o mesmo tratamento já dado a destino sem permissão.

### O que continua imperfeito, e é honesto dizer

A varredura de alcance é **estática**: ela lê as formas de link no código-fonte
e não sabe qual ramo do ternário executa. Por isso `sstChildrenFull()` continua
fazendo as 12 contarem como "nível 1 (destino do menu)" na varredura, embora em
runtime elas não apareçam. Quem cobre isso é o check de **porta que não abre**,
que roda pelo trinco e nomeia as 13 rotas uma a uma.

### A pergunta de fundo, para o responsável

**O modo simplificado deve continuar ligado por padrão?** Hoje ele é
`import.meta.env.VITE_SST_SIMPLIFIED_MODE !== 'false'` — verdadeiro salvo se a
variável valer exatamente a string `'false'` — e **não existe `.env` no
repositório**. Ou seja: ligado em todo ambiente, por omissão, e não por
escolha registrada. Doze telas migradas e funcionais estão desligadas por um
padrão que ninguém decidiu explicitamente.

## 2. Painel "quais filtros aparecem" do provisionamento: REPOSTO

**Decisão do cliente:** *"Capacidade não sai sem minha palavra, e o argumento
do agente pode estar certo sem que eu tenha visto o efeito."*

Reposto como bloco secundário recolhível, com as 8 caixas de marcação
originais. **Uma única diferença**: esconder um filtro agora **limpa** o valor
dele.

Isso não é capricho. Na `BarraFiltros`, a etiqueta de filtro ativo nasce da
lista `filtros` — esconder a dimensão esconde a etiqueta junto. Sem a limpeza,
o defeito original voltaria idêntico: desmarcar "Credor" com um credor digitado
deixaria a lista recortada por um critério que não está em lugar nenhum da
tela.

**O argumento do agente, registrado para o cliente decidir vendo a tela:** o
painel existia para administrar espaço numa grade de oito campos e inputs; com
a marcação da `BarraFiltros`, os controles são compactos e as etiquetas já
mostram o estado do recorte, então a razão de ser dele teria desaparecido.

## 3. Os cinco componentes que ninguém renderiza

`Comprovantes.jsx` **removido** (0 bytes desde um commit anterior a esta
sessão — arquivo vazio não é capacidade; autorizado pelo cliente).

Os outros quatro, com o que cada um faz:

### `Pedido.jsx` (108 linhas) — **este é o único que carrega capacidade perdida**

Formulário de um campo, "Número do pedido", com o botão "Gravar número". Grava
em `PATCH /solicitacoes/:id/pedido`.

**O endpoint existe, é validado e é AUDITADO** (`routes.js:1565`, evento
`SOLICITACAO_PEDIDO_UPDATED`, com resolvedor de recurso). E **nada no sistema
o alcança** — o campo `numero_pedido` é lido na busca e na ordenação da
listagem, mas não há tela que o escreva.

Ou seja: existe um caminho de gravação com trilha de auditoria montada, e
ninguém consegue usá-lo. **Recomendo repor**, e é o único dos quatro em que
recomendo.

### `InfoCard.jsx` (64 linhas) — superseded

Bloco "Dados da Solicitação" com 9 campos: Obra, Setor, Tipo, Parceiro,
Apropriação, Contrato, Ref. do Contrato, Valor, Descrição.

Todos os 9 estão no `Header.jsx` que a tela renderiza hoje, que mostra 20
campos pelo `CamposComVazios`. É subconjunto — não há dado a recuperar.

### `StatusArea.jsx` (37 linhas) — superseded

Dois campos: Status e Área responsável. Os dois estão no `StatGrid` do topo do
detalhe, junto de Data Resposta/Pagamento e Atualizado em. Subconjunto.

### `Pagamentos.jsx` (577 linhas) — superseded, e o maior dos quatro

Bloco "Pagamentos" completo: lista de títulos, resumo (total/pago/saldo),
modal de baixa com conta bancária, data e forma de pagamento.

O `index.jsx` registra em comentário que *"o card Pagamentos saiu do detalhe (a
função vive no card Financeiro)"*, e o atalho `informar_pagamento` rola até o
`FinanceiroCard`. Foi migrado nesta rodada mesmo assim (estava na lista de um
agente) e **teve dois defeitos de significado corrigidos** no caminho — o
resumo que somava 8 títulos sobre uma lista de 4, e o que trocava de fonte em
silêncio quando a consulta falhava. Se ele voltar um dia, volta consertado.

## 4. O achado do Jurídico subiu para o topo do ACHADOS-DE-NEGÓCIO

**Decisão do cliente:** não tocar (é regra do responsável), mas destacar
separado dos demais — *"é o único que pode estar deixando contrato passar sem
análise jurídica em produção agora"*.

Feito: seção própria antes da Parte 1, com o aviso de que é o único do
documento nessa condição.

---

## 05/09 — As duas telas de revisão de compra ficam FORA da matriz automática, e a decisão é sua

`/solicitacoes-compra/revisar` e `/solicitacoes-compra-direta/revisar` voltaram
da matriz como "a tela NÃO ABRIU: redirecionada — acesso/política bloqueando o
usuário de QA". **Esse diagnóstico era falso**, e a tela levou a culpa.

O que essas telas são: etapas de um fluxo. Os dados delas não vêm do servidor —
vêm do rascunho que a tela "nova" grava no NAVEGADOR enquanto a pessoa
preenche o formulário. Sem rascunho na sessão, a tela devolve a pessoa para a
"nova". Isso é o comportamento **certo**: revisar um formulário que não foi
preenchido não significa nada.

### Por que eu não mandei o robô preencher o formulário e medir

Porque o botão seguinte, na própria tela de revisão, **cria a solicitação de
compra de verdade** — e os checks desta bateria clicam em botões (é assim que
eles provam R1, F1, C6). Levar o harness até essa tela é aceitar que um clique
errado abra pedido de compra no ambiente de desenvolvimento, que é
compartilhado. A regra desta sessão é explícita: somente navegação e leitura.

Escolhi a lacuna declarada em vez do risco de escrever no ambiente de todos.

### O que fica no lugar

As duas telas agora são declaradas no manifesto (`soPeloFluxo`) e aparecem na
matriz como **SEM DADO**, com o motivo por extenso — não como reprovação e não
como aprovação. Capacidade sem evidência continua visível, que é o ponto.

### O que eu preciso de você

Uma de três:

1. **Deixar como está** — duas telas de 186 sem medição automática, o resto da
   matriz honesta.
2. **Um ambiente de QA descartável** (ou um usuário de QA que não possa
   confirmar compra): aí o robô dirige o fluxo inteiro e as duas telas entram
   na matriz como todas as outras.
3. **Medição manual assistida**: eu preparo o roteiro, alguém preenche o
   formulário no preview e eu meço a tela com o rascunho já na sessão.

Minha recomendação é a (2), porque é a única que vira cobertura permanente. A
(1) é aceitável hoje; a (3) resolve uma vez e não se repete.

---

## 05/09 — Dois erros de mira do harness, do mesmo tipo, na mesma corrida

Registro porque é o mesmo defeito de raciocínio aparecendo duas vezes, e ele já
tinha sido registrado antes com outro nome.

**1. O T3 acusava quatro telas de não redimensionar coluna.** O motivo era
"coluna arrastada mudou 0px". Não era a tela: o harness pegava a posição da
alça e mandava o mouse para aquele ponto **sem rolar a página e sem conferir
quem estava por cima**. Nas telas de painel a primeira tabela vive depois dos
cartões de resumo — o ponto caía fora da janela, o navegador não entregava o
clique a ninguém, e o arrasto simplesmente não acontecia. Rolar também não
bastava: `scrollIntoView` encosta o elemento no topo, que é exatamente onde
mora a faixa fixa.

O T2, ao lado, **já tinha aprendido isso em 03/09** ("o check media o próprio
erro de mira") e ganhado duas tentativas com confirmação de que o ponteiro
pousou no alvo. A lição ficou no check onde ela nasceu, e não virou regra do
harness. Agora o T3 confere quem recebe o ponteiro antes de arrastar e, quando
não consegue mirar, diz **quem estava por cima** em vez de acusar a tela.

**2. O resolvedor conhecia duas formas de abrir um registro; existem três.**
`solicitacao-compra-detalhe` e `gerenciar-cotacao` voltaram como "não abriu"
por estouro de 30s. A listagem de Compras abre o registro por um **botão na
célula de ações** (o olho), que não é âncora e não faz a linha inteira navegar.
É a pergunta permanente ("de quantos jeitos isso é feito aqui?") caindo no
mesmo resolvedor pela segunda vez em dois dias — antes tinham sido duas
tabelas onde ele supunha uma.

**A regra que fica:** todo passo do harness que dispara ponteiro em coordenada
confirma antes que a coordenada é do alvo; e todo passo que supõe UMA forma de
fazer alguma coisa nesta base tenta as formas que existem e, se nenhuma
funcionar, **diz o que encontrou** — em vez de devolver a falha como defeito da
tela.

**Bônus do mesmo lote:** a lista mais grave da matriz ("TELAS QUE NÃO
ABRIRAM") imprimia `undefined` no lugar do nome da tela — lia `r.id` num objeto
cujo campo é `r.tela`. O aviso mais importante do relatório era o único que não
dizia de quem estava falando.

---

## 05/09 — O M2 dependia do estado de OUTRA tela (e eu só descobri por acidente)

O M2 lê a saída do validador estático e reprova a tela quando ela é citada.
A primeira linha da função era: **se o validador saiu com 0, todo mundo passa,
sem olhar linha nenhuma.**

Enquanto o validador esteve verde, isso pareceu certo. Bastou eu colocar uma
tela nova fora do manifesto (o HomeHub) para o validador reprovar — e aí, de
repente, 200 telas passaram a ser julgadas por linhas de AVISO que sempre
estiveram na saída. A `gerenciar-cotacao` reprovou por uma **exceção
registrada**, isto é, por uma decisão que eu mesmo tinha mandado manter, com
justificativa escrita no manifesto.

Dois defeitos no mesmo lugar:

1. **Exceção registrada contando como defeito.** O validador escreve, com
   todas as letras, "tolerado por exceção registrada". O M2 lia a linha e
   reprovava assim mesmo.
2. **O resultado de uma tela dependia de outra.** Um check cujo veredito muda
   porque uma tela vizinha entrou ou saiu do manifesto não mede a tela que ele
   diz medir.

Agora o M2 lê **só o que o próprio validador chamou de FALHA no arquivo desta
tela**. AVISO não reprova ali de propósito: quem escolhe a palavra é o
validador, e ele usa AVISO para duas coisas que não são defeito da tela —
passivo já congelado num trinco (que segura o build inteiro) e "não consegui
provar" (que é lacuna de evidência). A R3, que tem motivo próprio para reprovar
em AVISO, faz isso na função dela, lendo o trinco.

**A regra que fica:** o veredito de um item da matriz depende só da tela que
ele mede. Se depender do estado global, ele mede o global, não a tela.

---

## 05/09 — Risco residual registrado pelo conserto do T6 em contratos

As pílulas de pendência (`fx-badge`) do relatório operacional de contratos são
`nowrap` dentro de um `flex-wrap`. Os rótulos de hoje são curtos ("sem anexo",
"sem referência", "valor zerado") e cabem. Se o backend passar a devolver um
rótulo mais largo que ~156px, a célula pode cortar sem tooltip. Não foi
consertado porque envolver pílula em `CelulaDupla` seria usar o componente
fora do que ele é — fica registrado para quando (e se) o rótulo mudar.

---

## 05/09 — O cliente perguntou se havia uma terceira forma. Havia quatro.

Consertei de manhã uma cegueira do inventário de rotas (pasta com
`index.jsx`) e reportei o passivo como "4 rotas sem medição". O cliente
respondeu com a pergunta certa: *"isso é uma forma que o detector não
conhecia — confirme que não há uma terceira, e me diga quantas rotas
existem hoje que nenhuma das duas listas enxerga. Prefiro o número medido a
supor que fechou."*

Medi com um leitor independente, escrito do zero, e comparei com o detector
que estava no repositório. **O detector era o problema.**

Ele lia **uma linha por rota**: casava `path="..."` e procurava, naquela
mesma linha, o primeiro componente importado. Resultado medido:

| | |
|---|---|
| telas de rota que ele enxergava | **181** |
| telas de rota que existem | **187** |
| telas a que ele era CEGO | **8** |
| arquivos que ele apontava e não existem | **2** |

As quatro formas que ele não conhecia:

- **A — pasta com `index.jsx`.** `import './Solicitacoes'` não é
  `src/pages/Solicitacoes.jsx`. Perdia `Solicitacoes`, `SolicitacaoDetalhe`
  e `Login`, e ainda **inventava dois arquivos fantasmas** com o nome
  errado, que inflavam o passivo. (Esta eu já tinha consertado de manhã.)
- **B — `<Route index element={...} />`, rota sem `path`.** É a rota `/` do
  shell: a **TELA INICIAL do sistema**. Ela não ficou fora do manifesto por
  descuido de quem listou — ficou porque o detector não tinha como vê-la. A
  minha explicação anterior ("a varredura filtrava por padrão de nome de
  arquivo") estava incompleta: o filtro de nome foi o segundo motivo, não o
  primeiro.
- **C — guarda LOCAL que renderiza a tela.**
  `element={<DashboardRoute />}`, com `function DashboardRoute()` no próprio
  `App.jsx` devolvendo `<Dashboard />`. O nome da tela não aparece na linha
  da rota. O Dashboard executivo estava coberto por sorte, não por medição.
- **D — `<Route>` quebrado em várias linhas**, com `path=` numa e
  `element=` na seguinte. São as quatro telas **públicas**: Login,
  Recuperar Senha, Definir Senha e Cotação do Fornecedor — justamente as
  que qualquer pessoa alcança sem estar logada.

### O que mudou

O inventário passou a ler o `<Route>` **inteiro** (contando chaves e
parênteses), aceitar `index`, resolver guarda local pelo que ela renderiza,
preferir o componente **mais interno** (a tela dentro dos guardas) e
resolver pasta com `index.jsx`. Rota-mãe (a que tem rotas filhas) é casca e
fica de fora, como `<Navigate>`.

**Número medido hoje: 187 telas de rota, ZERO que nenhuma das duas listas
enxergue.**

### E duas travas sobre o próprio inventário, porque zero é o número em que eu já me enganei

Em 04/09 eu quase entreguei um "zero" que vinha de uma varredura que não
varreu. Então o zero agora tem de se provar:

1. **Arquivo que não existe é defeito DO INVENTÁRIO**, não tela faltando —
   reprova nomeando os arquivos. (Foi o que produziu os dois fantasmas.)
2. **Piso de 180 rotas lidas.** Se o `App.jsx` mudar de forma e a leitura
   parar de casar, o resultado não é "nenhuma rota sem medição": é "não li
   rota nenhuma". As duas coisas são verdes para quem não pergunta.

As duas foram testadas com controle negativo: quebrei o resolvedor e a
leitura, uma de cada vez, e as duas reprovaram com o motivo certo.

**A regra que fica:** quando um detector acha um caso que ele não conhecia,
a pergunta seguinte nunca é "consertei?" — é "**quantas formas existem, e
qual é o número medido agora?**". Detector que acerta o caso que você
mostrou e erra os outros três continua parecendo certo.

---

## 05/09 — Espera em segundo plano sem prazo e sem dono (o cliente pegou)

Deixei três esperas rodando em segundo plano. O cliente perguntou se elas
tinham função. Duas não tinham: escrevi laços cuja condição **nunca se
satisfaz** (um esperava um arquivo que ninguém ia criar; o outro, um
processo com nome que não existe). Uma girou 73 minutos.

A terceira é a que importa. Ela tinha função real — publicar assim que a
matriz terminasse, para o preview não trocar de build no meio da corrida.
Só que a matriz terminou, eu publiquei à mão, **e ela continuou armada**.
Pior: o padrão que ela vigiava (`qa-preview/verificar.mjs`) volta a aparecer
toda vez que as PROVAS rodam, porque elas carregam o mesmo arquivo. Ou seja,
havia um `git push` automático solto, capaz de disparar no meio de qualquer
edição — exatamente o descontrole que eu estava tentando evitar ao segurar o
push.

Segurar a publicação com a mão e deixar um gatilho automático ao lado é ter
os dois problemas: a espera manual e o disparo imprevisível.

**A regra que fica:** espera em segundo plano tem de ter **prazo e dono** —
o que a encerra, e quem a cancela. Se eu não consigo dizer as duas coisas na
hora de criar, ela não deve existir. E gatilho que faz coisa irreversível
(publicar, escrever, apagar) é cancelado assim que a razão dele acaba, não
quando alguém repara nele.

---

## PROPOSTA AGUARDANDO DECISÃO — 05/09

### Deixar visível que a alçada usa o valor original do contrato (N40)

**Contexto.** Ver `ACHADOS-DE-NEGOCIO.md`, seção "COMPORTAMENTOS CONFIRMADOS
— NÃO SÃO DEFEITOS", item N40. Em 05/09 o cliente confirmou que a alçada do
Jurídico usa o **valor original** do contrato, e que o cabeçalho da tela
mostra o **total com aditivos** — os dois números serem diferentes é
esperado, não é defeito. O próprio cliente pediu esta proposta: *"se houver
como deixar explícito na tela que o cabeçalho mostra o total com aditivos e
a alçada usa o original, me traga a proposta"*.

**Esta seção é só proposta. Nenhum código foi alterado.**

#### Onde isso aparece hoje

A tela de ações do contrato — a mesma onde se aprova, devolve ou cancela um
contrato do fluxo novo — mostra, logo abaixo do título, uma linha assim:

> **Contrato CT-000123 — Aguardando aprovação**
> **Valor R$ 180.000,00** · Ao aprovar, as previsões de parcela viram
> títulos financeiros com a categoria informada aqui.

O número em negrito é o **total com aditivos**. Em nenhum ponto dessa tela
aparece o valor original, nem qual dos dois números decide se o contrato
precisa passar pelo Jurídico.

- Arquivo: `frontend/src/pages/SolicitacaoDetalhe/AcoesContrato.jsx`.
- O número mostrado vem da variável `valorComAditivos` (linha 197:
  `Number(contrato.valor_total) + Number(contrato.valor_aditivos || 0)`) e é
  exibido no cabeçalho do card na linha 553.
- O número que decide a alçada é só `contrato.valor_total` (o original),
  comparado no backend em `backend/src/services/contratoFluxoNovoService.js`
  (variável `acimaDoLimite`, linha ~1513). Esse valor **não aparece em tela
  em lugar nenhum** hoje — só o total com aditivos aparece.

#### Opções

**Opção 1 — Mostrar os dois números no cabeçalho, cada um com seu rótulo.**
Trocar "Valor R$ 180.000,00" por "Valor original R$ 150.000,00 · Com
aditivos R$ 180.000,00". Em contrato sem aditivo os dois números são iguais
e pode-se mostrar só um, sem mudar o visual de hoje.
- **Custo:** baixo. É trocar o texto que a linha 553 já monta — não cria
  tela nova nem componente novo.
- **O que resolve:** o número que decide a alçada fica visível toda vez que
  alguém abre essa tela, sem precisar clicar em nada. É a opção mais difícil
  de passar despercebida.
- **Limite:** em contrato com muitos aditivos o texto fica um pouco mais
  longo — não chega a quebrar o layout do card, mas é a opção com o texto
  mais extenso das três.

**Opção 2 — Explicar a regra por escrito, sem mudar o número mostrado.**
Manter "Valor R$ 180.000,00" como está e completar a frase de apoio que já
aparece ao lado (hoje: "Ao aprovar, as previsões de parcela viram títulos
financeiros...") com algo como: "A análise do Jurídico considera o valor
original do contrato, sem os aditivos."
- **Custo:** mínimo. Muda só o texto de ajuda de cada estado do contrato — a
  lista `ESTADOS`, no início do arquivo. Nenhum cálculo novo.
- **O que resolve:** avisa que existe uma regra, sem obrigar a pessoa a
  comparar dois números — suficiente para quem só quer saber que o sistema
  não errou.
- **Limite:** não mostra o valor original do contrato. Quem quiser conferir
  se aquele contrato específico está perto do limite ainda precisa ir a
  outra tela ou perguntar.

**Opção 3 — Ícone de informação ao lado do valor, com o detalhamento.**
Manter o número único no cabeçalho e acrescentar um ícone "i" que, ao passar
o mouse ou tocar, mostra: "Valor original: R$ 150.000,00 · Aditivos: R$
30.000,00 · Total: R$ 180.000,00. A alçada do Jurídico usa o valor
original."
- **Custo:** médio. É a única das três que precisa de um componente novo
  (um tooltip/balão de informação) — hoje essa tela não tem nenhum.
- **O que resolve:** mantém o cabeçalho curto como está e concentra todo o
  detalhamento — inclusive o valor do aditivo isolado, que nenhuma das
  outras duas opções mostra separadamente — num só lugar.
- **Limite:** tooltip por toque, no celular, é menos confiável do que texto
  fixo na tela — quem usa o sistema pelo celular pode não notar que o ícone
  existe.

#### Recomendação

**Opção 1, com o texto da Opção 2 mantido como está** — as duas não são
excludentes e podem ser feitas juntas sem custo adicional relevante.

Motivo: a Opção 1 é a única que resolve o problema em qualquer forma que a
pessoa use a tela — mouse, toque ou leitor de tela — sem depender de alguém
reparar num ícone ou de ler até o fim uma frase de apoio. É também a mudança
mais barata: não cria componente novo, só troca o texto que a tela já
monta. A Opção 3 fica como reforço possível mais adiante, se o Jurídico
pedir também o valor do aditivo isolado em destaque — hoje nem a Opção 1 nem
a Opção 2 mostram esse valor separado, só o original e o total.

**Status: proposta aguardando decisão do cliente. Nada foi implementado.**

---

## 05/09 — `process.exit()` truncava a saída do validador, e o M2 lia o pedaço

O defeito mais silencioso que este validador já teve, e ele só apareceu
porque uma prova começou a oscilar.

### O sintoma

A prova de mordida das regras (`regrasMordem.mjs`) passou a acusar uma regra
DIFERENTE a cada corrida, sem nenhuma mudança de código no meio: R1, depois
R17 e R19, depois R19 e R18, depois nenhuma. Prova que oscila é pior que
prova vermelha — ela ensina a ignorar o resultado.

### O que eu fiz de errado antes de achar

Duas vezes atribuí a causa antes de medir. Primeiro culpei a corrida com o
agente que rodava provas em paralelo (era verdade em parte, e consertei: a
prova escrevia no manifesto compartilhado, e passou a usar `--extra`, que
existe exatamente para isso e que eu tinha consertado horas antes sem
usar). Depois culpei o `maxBuffer`. Só na terceira tentativa instrumentei a
prova para DIZER o que ela mediu — e a resposta veio na primeira corrida.

### A causa

`process.exit(1)` no fim do validador. Quando a saída vai para um
**terminal**, o Node escreve de forma síncrona e não se perde nada. Quando
vai para um **pipe** — que é como todo mundo aqui consome o validador — a
escrita é **assíncrona**, e `process.exit()` derruba o processo com bytes
ainda na fila.

Medido: a corrida completa emite **95.977 bytes**, sempre o mesmo número. As
corridas que falhavam recebiam **51.444, 52.443, 55.796, 60.842 e 88.746
bytes** — cortadas em pontos diferentes. Não era a regra que não mordia: era
a mordida que não chegava ao papel.

### Por que isso é maior que a prova

O pior consumidor não era a prova. É o **item M2 da matriz**, que roda o
validador por `execSync` e lê a saída **para cada uma das 189 telas**. Com a
saída truncada, uma tela com FALHA de verdade podia ser lida como limpa — o
check dizendo "passou" porque não recebeu a linha que a reprovava.

**Silêncio por truncamento é indistinguível de aprovação.** É a mesma
família do zero que veio de varredura que não varreu, e da concordância que
não é cobertura: o resultado parece bom porque a medição não aconteceu.

O conserto é `process.exitCode = 1` em vez de `process.exit(1)` — marca o
código de saída e deixa o Node terminar naturalmente, depois de esvaziar a
fila. Depois dele: 8 corridas seguidas da prova, todas verdes, e o tamanho
da saída constante.

**Consequência que assumo:** as células M2 da matriz de hoje foram medidas
com o defeito ativo. A matriz final roda depois deste conserto — e é ela que
vale.

**A regra que fica:** processo que escreve em pipe nunca termina com
`process.exit()`. E quando uma prova oscila, a primeira coisa a fazer é
mandá-la dizer o que mediu — não adivinhar de que lado está o defeito.

---

## 05/09 — Duas capacidades anunciadas e inexistentes nas tabelas, e o check que dormia em cima de uma

O cliente achou as duas no preview, olhando a tela. Nenhuma das duas
aparecia em matriz nenhuma.

### 1. O menu de alinhamento abria e ninguém via

O ícone aparecia no cabeçalho, o tooltip "Alinhar / redimensionar"
aparecia, e clicar não fazia nada. **O menu abria** — o estado mudava, o nó
entrava no DOM. Ele era RECORTADO: `.resizable-table th { overflow: hidden }`
existe para dar reticências ao título, e o menu é posicionado ABAIXO da
caixa do `th`. Recorte total.

É a R18 num lugar que a regra não tinha previsto. Ela estava escrita em
termos de `position: sticky` — faixa fixa, coluna fixa. O mecanismo é maior
que os dois exemplos: `overflow: hidden` recorta qualquer coisa posicionada
para fora da caixa, e um menu suspenso é exatamente isso.

Conserto: o menu sai por `createPortal` para o `body` e se posiciona por
coordenada medida, como o autocomplete de apropriação já fazia.

**No caminho eu introduzi um defeito novo e a prova nova o pegou**: ao
trocar `absolute` por `fixed` perdi o `right: auto`, e como o
`.app-mais-menu` traz `right: 0`, o menu nascia com **1403px de largura**
para quatro opções.

### 2. O item T2 media presença, não efeito — e por isso passou verde em 189 telas

O T2 passava o ponteiro sobre o cabeçalho e media a **opacidade do ícone**.
Nunca clicava. Com a capacidade quebrada em todas as tabelas do sistema, ele
reportou PASSOU em 189 telas.

Agora é prova de comportamento em 8 passos, cada um com veredito próprio:
o ponteiro pousa, a affordance aparece, o ícone RECEBE o clique, o menu
abre, o menu está **visível** (área, dentro da janela, e o centro dele
devolve o próprio menu — porque o defeito real era "existe no DOM e está
recortado"), escolhe outra opção, o `text-align` muda **no `th` e no `td`**,
e persiste depois de recarregar.

**A regra que fica:** check que mede a affordance não prova a capacidade.
Ícone, tooltip e rótulo são o ANÚNCIO; o check tem de exercitar o que foi
anunciado. Onde o projeto media presença, ele estava medindo a promessa.

### 3. E um item novo, T8, do segundo achado do cliente

"AÇÕES" assentava numa linha de base diferente das outras colunas. Causa: é
a única coluna cujo título era **texto cru**; as demais embrulham em
`.app-th-alinhavel`/`.app-th-botao`.

Consertar o "Ações" expôs a causa maior, que a prova mediu: a coluna
ordenável desenha o título num `<button>` e a estática num `<span>`, os dois
com altura mínima (o alvo de clique da ordenação). O navegador **centraliza
o conteúdo do botão** e **encosta o do span no topo** — 9,5px de desvio, em
toda tabela que misture os dois tipos.

O conserto foi escolhido por MEDIÇÃO, e ainda bem: `flex + align-items:
center` zerava a linha de base **e quebrava o `text-align` herdado** — a
coluna alinhada à direita ficou 217px fora do lugar. `display: grid` +
`align-content: center` zera a linha de base e preserva o alinhamento
horizontal. Pelo hábito eu teria escolhido o flex e desalinhado toda coluna
monetária do sistema.

---

## 05/09 — O M2 mede a ÁRVORE LOCAL; o resto da matriz mede o BUILD PUBLICADO

Percebido ao planejar o que fazer enquanto a matriz roda, e vale registrar
porque muda como se trabalha durante uma corrida.

Trinta e quatro dos trinta e cinco itens da matriz são medidos no navegador,
contra o preview publicado — o SHA que o harness confere antes de começar. O
**M2 é a exceção**: ele roda `node scripts/validarLayout.mjs` na máquina, ou
seja, lê o **código-fonte local**.

Duas consequências práticas:

1. **Editar `frontend/src/**` durante uma corrida contamina a matriz.** As
   telas medidas antes da edição leem uma árvore; as depois, outra. A matriz
   sai dizendo que mediu um SHA e terá misturado dois estados — o mesmo
   defeito que eu evito segurando o push, só que por dentro.
2. É por isso que a árvore local e o SHA publicado precisam estar iguais
   quando a matriz começa. Hoje isso acontece por disciplina (só disparo
   depois de publicar), não por trava.

**Enquanto uma corrida está em pé, o que dá para avançar sem contaminar** é
o que o validador estático não lê: documentação, e trabalho de levantamento
que não escreve em `src/`. Qualquer conserto de tela espera a corrida
terminar.

**Melhoria possível, não feita:** o harness poderia comparar o SHA publicado
com o `git rev-parse HEAD` local no começo e recusar a corrida quando
diferem — hoje ele confere só o publicado. Fica registrado como proposta.

---

## 05/09 — Os "75 TODO/FIXME" que eu reportei ao cliente não existem

No levantamento de estado que o cliente pediu — e ele pediu explicitamente
*"não estime de cabeça: confira no repositório"* — eu listei como pendência
técnica: **"75 TODO/FIXME no `frontend/src`. Nunca varridos nem
classificados."**

Eu rodei o comando. O comando é que estava errado:

```
grep -rn "TODO\|FIXME" frontend/src --include=*.jsx --include=*.js | wc -l   → 75
```

`grep` casa **substring**, e a palavra portuguesa **"TODOS"** contém "TODO".
Das 75 ocorrências, **69** são o valor de enum `'TODOS'` / `'TODOS_VISIVEIS'`
usado como filtro em tela (status, escopo de obra, modo de recebimento), e as
outras 6 são o adjetivo em comentários em português — *"TODO contrato exige
a negociação detalhada"*, *"TODO campo de dinheiro…"* — todos descrevendo
regra **já implementada**.

Medido com o marcador de verdade:

| busca | resultado |
|---|---|
| `// TODO`, `/* TODO` ou `TODO:` | **1** — e é a frase "TODO contrato exige…" |
| `FIXME`, sem diferenciar maiúscula | **0** |
| `@todo` | **0** |

**Não existe nenhum marcador real de dívida técnica no código.** O número que
eu entreguei era ruído de medição apresentado como fato.

### Por que isto entra no registro

É a mesma família que já me pegou outras vezes hoje, e esta dói mais porque
foi num documento de prestação de contas: **eu rodei a medição e não olhei o
que ela tinha medido**. Zero de varredura que não varreu, concordância que
não é cobertura, e agora contagem que casa substring — as três dizem a mesma
coisa. Rodar o comando não é conferir; conferir é olhar a amostra do que ele
devolveu.

**A regra que fica:** antes de reportar um número, olhe as primeiras linhas
do que o comando casou. Uma amostra de duas linhas teria mostrado
`TODOS: 'Todos',` na primeira.

**Achado lateral, para depois:** o projeto registra dívida e decisão em
comentários com código de regra (R6, R19/R3, R21), não com `TODO`. Se um dia
quisermos mapear dívida de verdade, é esse o padrão a varrer — e aí o
levantamento tem matéria-prima real. Fica como proposta, não como pendência.

---

## 05/09 — Trinta minutos esperando um deploy que estava certo em não acontecer

Duas corridas da matriz morreram por prazo, 15 minutos cada, esperando o
preview servir o commit `fbaca9c`. O deploy não estava travado. Ele estava
**certo em não existir**.

O `fbaca9c` mexeu em três arquivos, todos em `frontend/scripts/` — provas e
checks. Nada em `frontend/src`. A Vercel não republica quando o que muda não
entra no build, então a marca do build ficaria no commit anterior para
sempre, e a minha espera nunca terminaria.

Medido, e é o ponto inteiro:

```
git diff --stat 445479e HEAD -- frontend/src frontend/index.html \
    frontend/package.json frontend/vite.config.js
(vazio)
```

**O preview já estava servindo, byte a byte, o aplicativo que eu queria
medir.** Eu recusei a corrida porque o NÚMERO não batia.

### O defeito de raciocínio, e ele é do mesmo dia inteiro

A regra que eu tinha escrito — *"verificar build velho é o mesmo que não
verificar"* — está certa. O que eu errei foi o que ela mede: **eu amarrei
"mesmo aplicativo" a "mesmo commit"**, e as duas coisas não são a mesma. Todo
commit de script, de prova ou de documentação quebra a igualdade de SHA sem
mudar uma linha do que a pessoa vê.

É a mesma família de tudo que me pegou hoje: o check que media a opacidade do
ícone em vez do efeito do clique, o grep que contou "TODOS" como "TODO", a
concordância entre duas listas lida como cobertura. **O indicador no lugar da
coisa.**

### O conserto

A espera passou a perguntar a coisa certa antes de desistir: quando a marca
não bate, ela compara o CÓDIGO DO APLICATIVO (`src`, `index.html`,
`package.json`, `vite.config`) entre o commit servido e o pedido. Sem
diferença, a corrida segue — e o cabeçalho da matriz registra os dois SHAs e
o motivo, para ninguém ler depois achando que se mediu build velho.

Com QUALQUER diferença de aplicativo, a espera continua exatamente como
antes, e a mensagem de bloqueio agora diz **quais arquivos** diferem, em vez
de mandar "verificar o deploy".

---

## 05/09 — As treze decisões do cliente, e o que cada uma mudou

Respondidas em lote. Registro o que foi feito em cada uma, para o próximo a
ler não ter de reconstruir.

| # | Decisão | O que foi feito |
|---|---|---|
| D1 | **Desligar o modo simplificado do SST**, devolvendo as 12 telas ao menu | O padrão da constante foi INVERTIDO (`=== 'true'` no lugar de `!== 'false'`): o modo continua existindo, só não é mais o comportamento de quem não escolheu nada. Menu e redirecionamento saem da mesma constante, então voltaram juntos |
| D2 | Painel de filtros do provisionamento fica reposto | Já estava; nada a fazer |
| D3 | `Pedido.jsx` fica como está — sem rota e sem remoção | Registrado como achado (N49), com o endpoint auditado e o motivo |
| D4 | Remover os três componentes mortos | `InfoCard.jsx`, `StatusArea.jsx` e `Pagamentos.jsx` removidos — os três eram subconjunto do que a tela já mostra |
| D5 | Serviço de backend sem consumidor fica onde está | É o N10; a decisão foi anexada ao achado |
| D6 | As duas tabelas do comparativo continuam exceção declarada | Nada a fazer |
| D7 | As duas telas de revisão continuam SEM DADO declarado | Nada a fazer |
| D8 | Manter a exceção declarada | Nada a fazer |
| D9/D10 | Trincos congelados, só descem | Nada a fazer |
| D11 | Documento Word com os achados | `docs/ACHADOS-DE-NEGOCIO.docx` |
| D12 | Matriz atual aceita como válida | O M2 não será re-rodado |
| D13 | Roteiro de teste fica para depois | Já está escrito e commitado, parado |

### O que a D1 revelou no meu próprio instrumento

Ao desligar o modo, a varredura de alcance continuou acusando **13 portas
que não abrem**. Ela encontrava a guarda `if (SST_SIMPLIFIED_MODE) return
<Navigate/>` no código e concluía que a porta estava fechada — **sem nunca
perguntar quanto vale a constante**.

Enquanto o modo nasceu ligado, dava no mesmo. Com ele desligado, o passivo
ficaria mentindo para sempre. É o mesmo erro do dia inteiro, agora na
varredura: **o indicador no lugar da coisa**.

Agora ela lê o valor padrão da constante no código-fonte e separa o que
está fechado HOJE do que só fecharia com o modo ligado — estas aparecem
nomeadas, com o motivo, mas não contam como passivo.

E uma cegueira dentro da cegueira, do mesmo tipo que já me pegou três vezes:
depois do conserto sobrou **uma** porta, `/sst/:resource`, porque a guarda
dela não cita a constante — chama `isSstResourceVisible(resource)`, que é
`(!SST_SIMPLIFIED_MODE || …)` e é sempre verdadeira com o modo desligado. Eu
conhecia uma forma; o código tinha duas. A varredura passou a reconhecer o
auxiliar, com regra estreita de propósito: só o idioma `!CONSTANTE ||`, que
é o "sem o modo, tudo é visível". Qualquer outra forma continua sendo
acusada — melhor acusar demais que absolver de menos.

**Passivo de portas que não abrem: 13 → 0.**

### As declarações do SST saíram do manifesto

As 11 telas estavam declaradas como "não alcançáveis" no harness, com o
destino do desvio nomeado. Com o modo desligado elas passam a abrir, e a
declaração vira **porta para falso negativo**: se um dia um bloqueio de
acesso REAL mandasse essas telas para `/sst/pgr`, a declaração o
desculparia. Removidas. As duas de fluxo (revisão de compra) continuam.

---

## 05/09 — Duas frentes identificadas e NÃO abertas, por decisão do cliente

Registradas para depois do teste dele. Nenhuma das duas foi tocada.

### 1. `ModuloRelatorios.jsx` monta 54 destinos à mão

É o maior item que sobrou no trinco de navegação, e virou o maior depois que
o hub de Configurações foi resolvido (45 → 0). O problema é o mesmo, com o
mesmo custo: **toda porta nova que o responsável mandar abrir aumenta a
dívida**, porque a lista de destinos não passa pela fonte única. Foi
exatamente isso que aconteceu na rodada 1 — abrir duas portas subiu o trinco
e deixou um portão vermelho por dois dias.

O conserto tem molde pronto: o hub de Configurações recebeu `SECOES_*` na
fonte única mais dois campos declarados no próprio destino (`secaoConfig`,
`ordemConfig`) e um helper único de leitura. O `ModuloRelatorios` tem a
mesma moldura, então o mesmo desenho deve servir quase igual.

**Custo estimado:** meio dia, mais regressão própria — muda a fonte da
navegação de uma tela que 54 destinos atravessam.

**Achado que veio junto e ainda não foi tratado:** no hub de Configurações,
a lista à mão divergia da rota em **7 permissões**, e num dos casos o card
aparecia para quem a rota redirecionava. Uma lista de 54 escrita à mão tem a
mesma chance de ter divergido — só se sabe medindo.

### 2. Os dois valores do contrato, explícitos na tela

O cliente confirmou que a alçada do Jurídico usa o **valor original** e o
cabeçalho mostra o **total com aditivos**, e que isso é regra correta (N40).
Pediu a proposta de deixar a diferença legível para quem olha os dois
números e pode achar que o sistema errou.

Três opções levantadas, com o custo de cada uma, estão na seção "PROPOSTA
AGUARDANDO DECISÃO" deste documento. A recomendação é rotular os dois
números no cabeçalho ("Valor original R$ X · Com aditivos R$ Y") somada à
explicação na frase de apoio — custo baixo, sem componente novo, e funciona
no mouse, no toque e no leitor de tela.

**Não é urgente e não foi feita.** Espera a decisão dele.

## A TELA QUE DIZ "NENHUM" ANTES DE PERGUNTAR (05/09)

**Medido, não suposto.** A matriz final reprovou a T3 da `rhdp-pessoal` com
"a tabela não voltou a aparecer em 15s". Eu levantei duas hipóteses — base
vazia e lentidão — e **as duas estavam erradas**. A medição no preview:

- a aba de colaboradores devolve **200 com 99 colaboradores**, na primeira
  visita E depois de recarregar, e a tabela volta com 50 linhas;
- mas, no instante seguinte ao recarregamento, a tela mostra
  **"Nenhum colaborador nesta obra."**

**A causa.** Em `RhDpPessoal.jsx`, `carregando` nascia `false` e o
carregamento só dispara depois dos **350ms** de espera da busca. Nessa
janela a `TabelaPadrao` recebe `carregando=false` com lista vazia e faz o
que foi mandada fazer: mostra o estado vazio — que nesta tela diz que a
obra não tem colaborador.

A tela **afirma ausência antes de ter perguntado**. É a mesma família do
N52 (mapa limpo lido como "nenhuma obra em risco") e do erro que eu mesmo
cometi ao chamar de "base vazia" uma resposta com 110 registros. Vazio e
não-perguntado são estados diferentes, e a tela só pode dizer o primeiro
depois de descartar o segundo.

**Corrigido onde foi medido:** `RhDpPessoal.jsx` nasce `carregando=true`, e
o primeiro quadro passa a ser "Carregando…", que é verdade.

### As outras 11 — lista para conferir, NÃO para mudar em lote

Outros 11 arquivos começam com `carregando = useState(false)`. **Não os
alterei**, e o motivo importa: o indicador que eu tinha para separar "busca
ao montar" de "espera a pessoa consultar" é um grep de duas linhas depois do
`useEffect` — indicador grosseiro. Mexer em 11 arquivos com base nele
repetiria exatamente o erro que este documento registra.

Há telas em que começar `false` está **certo**: a `financeiro-titulos` diz
"Nenhum filtro aplicado — a tabela fica vazia até você consultar os títulos",
e ali a lista vazia é verdade, porque ninguém pediu nada ainda.

Para conferir uma a uma, com medição:

| arquivo | passa `carregando` à tabela | frase do estado vazio |
|---|---|---|
| `src/pages/RhDpJornada.jsx` | não | "Nenhum colaborador nesta obra e competencia." |
| `src/pages/RhDpDocumentos.jsx` | sim | "Nenhum documento localizado" |
| `src/pages/RhDpPessoalSolicitacoes.jsx` | sim | "Nenhuma solicitacao neste filtro." |
| `src/pages/RhDpColaboradores.jsx` | sim | "Nenhum colaborador cadastrado" |
| `src/pages/EmpresasGrupo.jsx` | sim | (sem `vazio` declarado) |
| `src/components/NotificacoesBell.jsx` | — | componente |
| `src/components/ParceiroBuscaRemota.jsx` | — | componente |
| `src/components/RecargaCartaoFields.jsx` | — | componente |
| `src/components/contratos/BlocoMedicaoContrato.jsx` | — | componente |
| `src/components/ModalConferenciaCredores.jsx` | — | componente |
| `src/components/ModalAditivoContrato.jsx` | — | componente |

**O critério para a passada:** a tela que busca sozinha ao montar nasce
`carregando=true`; a que espera a pessoa consultar nasce `false` E diz isso
na frase do vazio. As duas são corretas — o que não pode existir é a
terceira, que busca sozinha e afirma "nenhum" no caminho.

---

## A faixa fixa ainda vale 15, e é uma linha em arquivo de outro agente (06/09)

Medido na conversão da R32, e registrado aqui porque **não pude consertar**:
`src/styles/componentes-padrao.css` estava em escrita por outro agente
nesta leva, e é lá que mora a única camada do sistema que continua com
número solto.

```
.layout-main .app-page-header { … z-index: 15; }
```

A escala inteira subiu acima da faixa que o Tailwind ocupa (`z-0`…`z-50`):
a barra do topo vale **200**, painel **210**, modal **1000**. A faixa fixa
ficou para trás, em 15 — e 15 perde para qualquer `z-50` escrito à mão.

**Medido no navegador, não afirmado.** Com o CSS compilado do build e a
casca real (`.layout-shell > .fx-topbar + .app-page-header`), rolando até
um bloco com `z-index: 50` cruzar cada barra, `elementFromPoint` devolve:

| cruzamento | antes | depois |
|---|---|---|
| barra do topo × bloco `z-index: 50` | bloco por cima | **barra por cima** |
| faixa fixa × bloco `z-index: 50` | bloco por cima | **bloco por cima** ← este |

A correção é uma linha, e o token já está declarado:

```
-  z-index: 15;
+  z-index: var(--z-faixa-presa);   /* 180: acima do conteúdo, abaixo da barra */
```

Quem fizer, roda `node scripts/validarLayout.mjs` e regrava o trinco por
medição — `scripts/trinco-camadas.json` cai de 4 para 3.

As outras três de `componentes-padrao.css` (`z-index: 2` no botão de
limpar, `3` e `4` na célula fixa da tabela) são empilhamento **local** e
seguem corretas onde estão: `--z-conteudo-acima`, `--z-celula-fixa` e
`--z-celula-fixa-cabecalho` existem para elas.

---

## O título da tela quebra no meio da palavra na faixa COMPACTA, a 390px (07/09)

**Achado novo, não é da minha leva, e é ANTERIOR à correção do apoio (A9) —
medido nos dois estados.**

**Onde**: `frontend/src/styles/componentes-padrao.css`, na regra
`.layout-main .app-page-header--compacto .app-page-header-row > div:first-of-type`,
que é `display: flex; align-items: baseline` — título e apoio lado a lado,
numa linha só.

**O que acontece**: a 390px essa linha não tem largura para os dois. O `h1`
não tem `flex-shrink: 0` (só ganha isso dentro do escopo
`.apoio-linha-unica`, em `compras-relatorio-apoio.css`), então quem é
espremido é o TÍTULO. Medido na fixture `fixtureApoioDaFaixa.jsx`, tela
`solicitacoes`, depois de rolar 400px:

    "Solicitações"  →  "Solici / tações / s"   (três linhas, quebra dentro
                                                da palavra)

E acontece **assim que a pessoa rola**, que é o estado normal de uso de uma
listagem no celular.

**Por que não corrigi aqui**: está fora dos dois achados que me foram
passados (A6 e A9), e mexer na faixa compacta encosta na banda morta medida
do `PageHeader` (`saltoRef`, a correção do laço de 60fps de 06/09) — a
altura dos dois estados é insumo daquele cálculo. Correção às cegas ali
troca um defeito visível por um laço que volta calado.

**O que já se sabe do conserto**: `flex-wrap: wrap` (ou
`flex-direction: column`) nessa caixa dentro de `@media (max-width: 767px)`
resolve sem tocar no `h1`; a conta a refazer é a da banda morta.

**Medido antes e depois da correção do A9**, para não confundir causa: a
altura da faixa compacta a 390px é **133px nos dois casos** — o título já
quebrava assim com o apoio em `nowrap`. A quebra do apoio não criou isto e
não piorou a altura.
