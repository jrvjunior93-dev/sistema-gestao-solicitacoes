# Reforma do modulo Custos e Recebiveis (iniciada em 29/09/2026)

Branch: `refactor/frontend`. Trabalho em fases, cada uma entregue e aprovada pelo
proprietario antes da seguinte.

## Decisoes fechadas na Fase 0 (29/09/2026)

1. Corte da janela de planejamento: 23:59 do dia 5, horario de Brasilia, sem
   antecipar por fim de semana ou feriado.
2. Planejamento atrasado: o engenheiro registra sozinho, sem aprovacao; isso
   destrava a obra. O mes fica marcado como cumprido com atraso.
3. Medicao aprovada vencida TAMBEM trava a obra (Fase 3). Havera a opcao
   "Sem medicao aprovada neste mes" com justificativa obrigatoria, e o botao
   "Solicitar dilatacao de prazo" (2 a 5 dias por pedido, aprovacao do
   administrador, historico por mes e do periodo inteiro da obra).
4. "Novo mes": a competencia seguinte e liberada quando a janela dela abre (dia
   25); um clique cria o mes.
5. 5a - medicao so de itens da planilha contratual (servidor deixa de aceitar
   medicao ligada a linha de custo planejado; registros antigos continuam
   exibidos). 5b - o aprovado acumulado passa a ser somado pelo CODIGO do item
   atravessando versoes da planilha; quem importar/publicar nova versao recebe
   aviso de que item com codigo novo recomeca do zero.
6. Corrigir o mes reaberto nao editavel (feito na Fase 1) e travar a medicao
   aprovada junto com o prazo de 40 dias (Fase 2).
7. Os dois calculos de custo realizado (card/dashboard por titulos emitidos e
   Comparativo por baixas) passam a atualizar automaticamente.
8. Administrador: estrutura da planilha (versoes e "Publicar") vai para
   Importacoes; Importacoes e Exportacoes numa aba so, uma faixa para cada;
   Auditoria e fila de reaberturas ganham rotas de consulta (somente leitura).
9. "Administrador" = quem tem `custos_recebiveis.reabertura.aprovar` e
   `custos_recebiveis.configuracoes.gerenciar`.

## Fase 1 - entregue em 29/09/2026 (aguardando aprovacao)

- Backend: `services/prazoService.js` (janelas padrao, contadores, competencias
  liberadas); `prazos` em `GET /obras`; `planejamento_editavel` e
  `competencias_permitidas` em `GET /obras/:id/competencias`; `criarCompetencia`
  valida pela janela; `assertEditable` corrigido para REABERTA.
- Frontend: todo engenheiro (setor OBRA ou perfil operacional) entra pelos cards
  de obra (nome, codigo, situacao, dois avisos) com busca + lista de obras
  (`BarraFiltros`); aba "Planejamento mensal" oculta para ele; card de obra abre
  os meses; "Novo mes" em um clique; faixa de prazos da obra com "Registrar
  planejamento"/"Registrar medicao aprovada"; quatro acoes do card de mes em
  `CrIconAction` (44px, indisponivel tracejado e apagado, tooltip com motivo).
- Testes: `validarPrazos.js` novo; checagens estaticas antigas de
  `validarFase2.js`/`validarFase3.js` atualizadas (tres ja falhavam antes desta
  fase e o teste de imutabilidade dependia da data em que rodava).

### Validacoes executadas

- 8/8 scripts do modulo com sucesso.
- Frontend: `vite build` ok; `validarLayout`, `validarNavegacao`,
  `varreduraCancelamento`, `tokensExistem`, `erroNaoVazaCru` e
  `modalPortalNaoPropaga` com o MESMO resultado antes e depois (falhas antigas
  fora do modulo); demais provas ok.
- Navegador (Playwright, API simulada): cards, busca + lista, lapis desabilitado
  nao navega, "Novo mes" faz um unico POST, acoes sem sobreposicao em 1440,
  1100 e 390px.

### Correcoes do revisor separado (mesma fase)

- "Novo mes" repetido volta a ser idempotente (a janela so vale para criar).
- Decisao 2 aplicada na edicao: mes nao finalizado e editavel mesmo atrasado,
  sem reabertura; finalizado nunca e editavel; reabertura so para mes
  FINALIZADO ou REABERTO com janela expirada (antes ficava sem saida).
- Salvar/finalizar/medicao/reabertura nao criam mais mes fora da regra do
  "Novo mes" (antes criavam qualquer AAAA-MM, futuro inclusive).
- Obra sem planilha publicada nao cobra medicao; rotulo "Planejamento aberto"
  so pelo planejamento (obra publica voltou a poder ficar "Em dia").
- `GET /obras` deixou de calcular `resumo_competencia` (sem uso no frontend).
- CSS dos icones de 44px restrito as acoes novas; aba "Minhas obras" limpa a
  obra aberta; lista de obras mostra "codigo · nome".

### Riscos e pendencias

- O preview so mostra os prazos depois de o `backend-dev` subir com este codigo;
  sem isso o card de obra exibe "Prazos indisponiveis".
- Classes antigas `.cr-work-card*` e `.cr-planning-deadline` ficaram sem uso
  (limpeza na Fase 6).
- A confirmar: 40 dias literais a partir do dia 1o (setembro -> 11/10,
  fevereiro -> 13/03).

## Respostas de 29/09 sobre a dilatacao

1. Enquanto o pedido aguarda aprovacao, a obra continua travada.
2. Pode pedir depois do vencimento.
3. Sem limite de pedidos.

## Fase 2 - entregue (aguardando aprovacao)

- Migration `202609290001` (3 tabelas novas). O backend nao sobe com migration
  pendente: rodar no deploy do backend-dev antes do restart.
- Prazos por obra (Configuracoes > Prazos por obra); obrigacoes e contador do
  cabecalho pelos prazos novos; obrigacao da medicao aprovada; "cumprida com
  atraso" na tela de Obrigacoes.
- Medicao aprovada: trava apos o prazo, "Sem medicao neste mes", 5a e 5b (com
  aviso na importacao e na publicacao da planilha).
- Dilatacao: pedido do engenheiro (faixa de prazos da obra), decisao e
  historico por mes e periodo (aba Obrigacoes e prazos; fila no topo na Fase 4).
- Comparativo com custo realizado sincronizado ao consultar.

Definicoes adotadas nesta fase (a confirmar com o proprietario):
- Prazo dilatado conta do prazo vigente; se ja venceu, da aprovacao.
- Medicao registrada so muda depois do prazo com reabertura; nao registrada
  pode ser lancada atrasada.
- Mes reaberto volta a ser pendencia ate nova finalizacao (regra existente).

### Correcoes do revisor separado (Fase 2)

- Obrigacoes deixaram de ser regravadas a cada consulta (prazo com
  milissegundos x DATETIME do banco).
- "Registrada" = linhas de medicao ou "sem medicao" em todos os pontos (trava,
  obrigacao e tela); gravacao sem linhas nao trava mais o mes.
- Reabertura tambem para corrigir medicao encerrada pelo prazo com o
  planejamento ainda aberto; aprovar reabertura so muda para REABERTA mes
  finalizado.
- Dilatacao nao e aprovada se a medicao ja foi registrada; fila e historico
  consultados separados (sem corte em 500).
- Status "Vencida" do mes usa o prazo configurado da obra; mes seguinte nao e
  mais criado automaticamente pelas obrigacoes; mes corrente em Brasilia.
- Guard (modo observe) nao conta medicao vencida ate a Fase 3.
- Dashboard reconhece "sem medicao"; codigo do item comparado sem diferenca de
  caixa; confirmacao ao salvar/restaurar prazos (valem para todos os meses);
  mensagens de validacao legiveis.

## Decisoes da Fase 3 (29/09)

1. Obra travada fica fechada inclusive para consulta; para o engenheiro so fica
   o que regulariza (planejamento, medicao aprovada/sem medicao, dilatacao).
2. Mes reaberto nao trava a obra; reabertura aprovada dura 24 horas e depois o
   mes fecha de novo (vale para planejamento e medicao aprovada).
3. Liberacao temporaria (bypass) mantida, so para o administrador, ate 48 horas.

## Fase 3 - entregue (aguardando aprovacao)

- `services/bloqueioObraService.js`: obras travadas por usuario (cache 30s),
  resolucao da obra da requisicao e mensagem.
- `requireCustosRecebiveisCompletion` passa a bloquear por obra (mesmo ponto de
  montagem em `routes.js`).
- Fora do modulo: `AuthController` (obras travadas na sessao),
  `ObraController.minhas` (modo CRIACAO omite obra travada), `Layout.jsx`
  (faixa global `CrObrasTravadasAviso`).
- Frontend: card "Travada", meses da obra travada so com acoes de
  regularizacao, reabertura "vale por 24 horas", liberacao ate 48 horas.

Limitacoes conhecidas: listas amplas (sem obra no filtro) nao sao recortadas;
abrir um item da obra travada e bloqueado. Rotas de acao em lote de fila e
lotes de pagamento sem obra no corpo nao sao resolvidas.

Ativacao: seguir em `observe` no deploy, conferir quem "seria travado" e so
entao definir `CR_GUARD_MODE=enforce` no ambiente (decisao do proprietario).

## Proximo passo

Fase 4: tela do administrador (abas, fila de reaberturas e dilatacoes no topo,
Obrigacoes e prazos em faixas, remocao da tela orfa).
