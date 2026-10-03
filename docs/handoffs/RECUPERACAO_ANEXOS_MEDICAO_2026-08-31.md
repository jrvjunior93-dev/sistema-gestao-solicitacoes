# Recuperacao de anexos de medicao — 2026-08-31

## Contexto

Ao criar uma medicao, a solicitacao do contrato era encaminhada de OBRA para GEO antes do POST
dos arquivos. O upload subsequente era entao tratado como uma nova interacao de OBRA em uma
solicitacao que ja estava em outro setor e recebia 403. A medicao permanecia criada, mas sem o
arquivo selecionado.

## Alteracoes

- O retorno da criacao da medicao agora inclui o mesmo token curto e restrito de upload usado na
  criacao comum de solicitacoes. Ele autoriza somente os tipos efetivamente selecionados e mantem
  a expiracao do servico existente.
- O endpoint de anexos aceita uma recuperacao estrita quando todas as condicoes forem atendidas:
  usuario com capacidade de setor OBRA, acesso base a solicitacao/obra, medicao pertencente a
  solicitacao, medicao ainda pendente e tipo `SOLICITACAO`.
- O historico do novo anexo passa a registrar tambem `medicao_id`, preservando a rastreabilidade.
- Na aba Financeiro, o usuario de OBRA pode abrir a medicao em modo somente leitura e anexar os
  arquivos ausentes. Edicao de parcela e aprovacao continuam indisponiveis.
- A aprovacao sem arquivo fica desabilitada e explicada no frontend; a validacao obrigatoria ja
  existente no backend foi preservada.
- O aviso de parcelas acima do valor do contrato usa vermelho fixo e peso maior.

## Arquivos alterados

- `backend/src/controllers/SolicitacaoController.js`
- `backend/src/controllers/AnexoController.js`
- `frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/PrevisoesContrato.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/ModalMedicao.jsx`
- `docs/workspace/OWNERSHIP_ATIVO.md`

## Validacoes executadas

- `node --check backend/src/controllers/SolicitacaoController.js`
- `node --check backend/src/controllers/AnexoController.js`
- `npm run test:anexos-acesso` em `backend/`
- `npm run build` em `frontend/`
- `npm run test:responsive` em `frontend/` — 204 rotas verificadas
- `git diff --check`

## Validacao funcional recomendada em dev

1. Criar uma medicao por um usuario de OBRA com um PDF selecionado e confirmar que o arquivo
   aparece na medicao depois do encaminhamento para GEO.
2. Em uma medicao pendente sem arquivo, entrar como OBRA, abrir Financeiro > Medicao e anexar um
   arquivo. Confirmar que nao aparecem botoes para editar, salvar ou aprovar.
3. Entrar como GEO e confirmar que a aprovacao fica bloqueada sem arquivo e habilitada depois do
   anexo.
4. Confirmar que uma medicao aprovada nao exibe o botao de anexar para OBRA.

## Deploy

Nao ha migration. O ajuste envolve backend e frontend: depois do push, atualizar `backend-dev` na
EC2 de desenvolvimento e aguardar/reexecutar o deploy da Vercel para `dev-v2`.
