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
- Transitorio ate a Fase 2: o contador "Prazos" do cabecalho e a tela de
  Obrigacoes ainda usam o prazo antigo (ultimo dia util do mes, 18h).
- A confirmar: 40 dias literais a partir do dia 1o (setembro -> 11/10,
  fevereiro -> 13/03).

## Proximo passo

Fase 2: configuracao por obra das duas janelas, trava da medicao aprovada pelo
prazo, custo realizado do Comparativo automatico e dilatacao de prazo.
