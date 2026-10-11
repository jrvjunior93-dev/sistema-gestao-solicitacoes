# DP - 100%, dados para pagamento e reembolso de vales

## Autorizacao e estado

Usuario pediu ajustes no modal de pagamento ja publicado em refactor/frontend
(base 5453352d). Usuario autorizou commit e push das pendencias na
refactor/frontend em 10/10/2026. Sem banco real, migration, main ou deploy.
Pessoal/DP continua fora da producao sem nova autorizacao.

## Regras e implementacao

- Coluna 100% exibe o percentual efetivo; marcar 100% limpa 40/60. Compatibilidade
  preservada: ambos/nenhum 40/60 equivale a 100%. Os tres ficam inativos para diaria.
- Coluna DADOS PARA PAGAMENTO mostra a chave ou banco/agencia/conta e conserva
  o editor de pagamento. Dados continuam snapshots da solicitacao; titulo aponta
  para PaymentBeneficiary. Nao altera o cadastro global do colaborador.
- Fila canonica ja inclui PaymentBeneficiary. Corrigida a exibicao de
  DADOS_BANCARIOS/CONTA_BANCARIA: a chave tecnica banco:agencia:conta nao e Pix.
- Desconto positivo abre pergunta de vale apos 650ms sem novas teclas ou ao sair
  do campo, identificando colaborador e valor. Nao espera o envio. Cada linha pode
  ter reembolso ou a decisao sem reembolso, revisavel pelo link sob o desconto.
- Voltar/Escape adia a decisao, nao a transforma em negativa. O envio exige
  identificar todos os descontos selecionados, tanto no frontend quanto backend.
- Selecionar responsavel reutiliza dados dele ja informados nesta solicitacao,
  mantendo-os editaveis. Dados divergentes no mesmo grupo causam erro antes de
  gerar titulos; nenhuma conta e escolhida silenciosamente.
- Um titulo de reembolso por responsavel E empresa dentro da solicitacao. Empresas
  diferentes permanecem separadas para preservar DRE/contabilidade. Salarios
  individuais continuam distintos e o vale reduz o liquido normalmente.
- Discriminacao de colaboradores/valores persistida no JSON da solicitacao e nas
  observacoes TEXT do titulo. Consulta por details no modal (antes/depois do envio)
  e na coluna de dados para pagamento da fila, sem endpoint/permissao adicional.
- Titulos ja gerados nao sao reagrupados nem editados. Replay da solicitacao
  aprovada conserva a resposta; geracao/fila seguem na mesma transacao com lock.

## Arquivos

- backend/src/services/rhPagamentoSolicitacaoDomain.js e Service.js
- backend/scripts/validarRhPagamentoSolicitacao.js
- frontend/src/components/rh/RhDpPagamentoModal.jsx
- frontend/src/styles/rh-pagamento-solicitacao.css
- frontend/src/pages/FinanceiroFilaPagamentos.jsx
- frontend/scripts/validarRhPagamentoSolicitacaoUI.mjs e validarFilaInstrumentosUI.mjs
- docs/workspace/OWNERSHIP_ATIVO.md

## Validacoes

- Dominio/servico real com modelos em memoria: classificacao exigida, 2 salarios
  e 1 vale agrupado, origens/valores, empresas separadas, dados diferentes com
  rollback, beneficiarios Pix/conta salario/outra conta, replay simultaneo.
- UI real do modal, Chrome/Playwright, API isolada: 100% individual/coletivo,
  diaria, pergunta sem blur/envio, duas classificacoes independentes, reutilizacao
  de dados, agrupamento/discriminacao, salvamento/retomada, conferencia e envio;
  Escape conserva desconto pendente e o envio exige identifica-lo novamente.
- Fila real/API isolada: conta bancaria nao exibida como Pix, Pix correto e
  consulta da discriminacao; regressao de instrumentos, comprovantes e encargos.
- Backend pessoal-solicitacao, conferencia guiada, fila/instrumentos/governanca
  e fila-pagamentos aprovados; Pessoal por local/legado aprovado.
- Build aprovado, avisos existentes Browserslist/chunk >500k. Capturas desktop
  e mobile inspecionadas em outputs/rh-pagamento-solicitacao, fora do commit.

## Proximo passo

Commit/push DEV autorizados; validar em EC2 somente apos pedido separado.
Apos atualizar DEV frontend/backend juntos,
homologar com dados reais: desconto nao vale, vale sem reembolso, varios vales
ao mesmo responsavel, dados bancarios divergentes, empresas diferentes e fila.
Nenhuma migration nova. Nao executar reconciliacao retroativa de titulos.
