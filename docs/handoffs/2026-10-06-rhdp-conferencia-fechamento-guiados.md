# RH/DP — conferência e fechamento guiados — 06/10/2026

## Escopo e estado

Implementação autorizada pelo proprietário para simplificar Pessoal: entrada
contextual pela jornada, checkbox persistente, ajustes com salvamento por linha,
progresso fixo e revisão/geração de títulos sem navegar para outra tela.
Worktree `promocao-main-20261003/Fluxy`, branch main; proprietário autorizou
commit/push em main em 06/10/2026. Publicação identificada no histórico Git
deste handoff e na conversa. Não houve banco real, EC2, migration, deploy ou reinício.
Não exige nova variável de ambiente ou migration. As flags já existentes das
jornadas em etapas continuam obrigatórias, sem ativação automática.

## Arquivos e dependências

- Frontend: RhDpApuracao, RhDpPessoal, RhDpPessoalSolicitacoes, RhDpJornada e
  services/rhDp; novos hook useConferenciaRh, helper rhApuracaoConferencia e CSS
  rh-apuracao-conferencia. Componentes padrão, tema e cálculos existentes reutilizados.
- Backend: rhApuracaoService, rhFechamentoService, RhApuracaoController, routes,
  rhValidators e novo rhApuracaoConferenciaDomain.
- Testes: scripts validarRhConferenciaGuiada no backend/frontend, respectivos
  comandos npm `test:rhdp-conferencia-guiada`.
- Documentação: guia operacional de Pessoal e registro de ownership.

## Regras preservadas e proteções

- Leitura, edição e fechamento continuam separados. Novos GET/POST
  `/rh/apuracoes/jornada/:id` usam respectivamente as permissões existentes de
  leitura/edição; POST também tem limitador crítico. Não modifica permissões.
- GET só consulta fonte/recorte e apurações correspondentes. POST prepara
  explicitamente ou retoma; não sobrescreve apuração de outra versão de jornada.
  A origem é a importação confirmada, não recorte inventado pelo navegador.
- 40/60, diária independente, multiobra, PIX indicado na jornada, categoria,
  rateio, conversão de regime, retorno pendente e estorno de título baixado
  mantêm validações e cálculos existentes. A geração não é baixa/pagamento.
- Checkbox só indica gravado após resposta. Ajustes efetivos invalidam
  conferência também no backend. Limpar observação/PIX passa null explicitamente.
- Respostas integrais são enfileiradas e preservam rascunhos das outras linhas.
  Revisão SHA-256 da linha detecta mudanças concorrentes sem coluna nova.
  Campos limpos acompanham o servidor; campos alterados mantêm revisão original.
- Edição, conclusão e fechamento obtêm lock da apuração em transação.
  Preparação serializa por obra/origem; reabertura serializa lote e apuração.
  Backend recusa novo fechamento quando já existe lote. Frontend impede
  duplo acionamento. Erro de conexão não prova que uma ação financeira falhou:
  consultar/recarregar antes de repetir e não tentar corrigir diretamente no banco.
- Aviso ao sair com alterações pendentes, bloqueio de links/abas e ações internas
  durante gravação. Rascunhos ainda não gravados não são persistência offline;
  aguardar **Salvo** antes de abandonar a tela.

## Validações locais

- Backend: modelos em memória, VM dos serviços reais, sem .env/conexão Sequelize;
  persistência, invalidação, revisão conflitante, retorno, recorte, retomada,
  permissões das rotas e recusa de fechamento já existente.
- Frontend: componentes/hook/permissões reais em Playwright + Vite com serviços
  simulados. Checkbox/reload, preservação de outro rascunho, conflito de sessão,
  falha de rede/retry, observação vazia, invalidação, consulta/edição sem fechamento,
  confirmação/cancelamento/resultado inline, preparação explícita e largura
  1366/390 nos temas claro/escuro. Requisições externas bloqueadas nas fixtures.
- Build de produção e `git diff --check`; capturas locais em outputs/rh-conferencia
  não devem ser incluídas na publicação.
- Validador global tokensExistem tem falhas preexistentes fora deste fluxo
  (tokens em GestaoApropriacoes/PedidoCompraFinanceiro e contagem de classes).
  Não alteradas nesta tarefa. Não usar esse resultado como aprovação global do UI.

## Próximo passo

Após a publicação autorizada, no deploy atualizar backend de produção e frontend
Vercel juntos; nenhum SQL/seed necessário para este ajuste.
Homologação integrada em ambiente de teste: jornada real 40%, 60%, diária e
multiobra; retorno autorizado; ajustes/conferência por dois usuários; fechamento
com rateio e categoria válidos; estorno antes de baixa e recusa após baixa.
Não executar geração/estorno como teste em registros de produção.
