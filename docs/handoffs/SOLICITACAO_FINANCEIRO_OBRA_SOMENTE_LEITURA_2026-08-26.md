# Solicitacao — Financeiro para Obra em modo somente leitura

## Objetivo

Permitir que usuarios de setores marcados com `eh_setor_obra` acompanhem o Financeiro dentro da
tela de detalhes das solicitacoes pertencentes as suas obras, sem receber acesso ao modulo
Financeiro e sem executar operacoes financeiras.

## Regra entregue

- A aba/card Financeiro passa a ser exibida para o setor Obra.
- A visibilidade continua limitada pelos vinculos existentes em `usuarios_obras` (ou pela regra
  administrativa ja existente de todas as obras).
- O frontend identifica a Obra como `somenteLeitura` e remove as acoes de gerar conta, cadastrar
  ou editar credor, abrir titulo financeiro e editar ou aprovar medicao.
- Parcelas, medicoes, pagamentos e o resumo dos titulos permanecem visiveis para acompanhamento.
- O endpoint de titulos entrega ao usuario somente leitura apenas identificacao, tipo, status,
  descricao, valores, vencimento e nome do parceiro.
- Dados bancarios, PIX, documentos, impostos, rateios, integracoes e beneficiarios nao sao
  carregados nesse modo.
- Endpoints de criacao, edicao, baixa e demais mutacoes continuam exigindo as permissoes
  financeiras anteriores.

## Arquivos alterados

- `backend/src/services/authorizationService.js`
- `backend/src/services/tituloFinanceiroService.js`
- `frontend/src/utils/acessoProduto.js`
- `frontend/src/pages/SolicitacaoDetalhe/index.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/PrevisoesContrato.jsx`

Os arquivos ja continham alteracoes nao commitadas de outros fluxos. A implementacao foi aditiva
e nao reformatou nem removeu trabalho concorrente.

## Validacoes

- `node --check` nos dois servicos backend alterados: aprovado.
- `git diff --check` no escopo: aprovado.
- `npm run build` no frontend: aprovado, 366 modulos transformados.
- Verificacao somente de leitura no banco local com usuario real do setor Obra sem acesso
  financeiro completo:
  - obra vinculada pela regra de visibilidade;
  - solicitacao com tres titulos consultada com sucesso;
  - somente as dez chaves permitidas foram retornadas;
  - parceiro limitado a `id` e `nome`;
  - nenhum dado sensivel detectado.
- Backend local reiniciado na porta 8100 e `/health` respondeu `{"ok":true}`.

## Banco e deploy

- Nenhuma migration foi criada ou aplicada.
- Nenhum dado foi alterado pelo teste.
- Nenhum acesso a GitHub, EC2 ou producao foi realizado.

## Risco residual

O backend e a barreira definitiva do escopo de obra. Mesmo que um cliente altere manualmente o
frontend, a consulta financeira da solicitacao continua passando por `assertObraScope`.
