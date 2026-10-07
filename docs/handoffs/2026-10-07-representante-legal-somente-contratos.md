# Representante legal opcional fora da solicitacao de contrato

## Pedido e estado

Usuario esclareceu que nome e CPF do representante legal sao opcionais no
cadastro geral, e pediu sua retirada dos modais de fornecedor/credor e
favorecido da Nova Solicitacao. Qualificacao obrigatoria somente no contrato
acima do limite juridico configurado. Implementado no checkout
`C:/Fluxy-refactor-frontend`, branch `refactor/frontend`, sobre
`38c771fb19a93b5ccea0b44aaf05e625a6760b97`. Sem commit, push ou deploy.

## Mudancas e dependencias

- `backend/src/services/parceiroService.js`: cadastro completo nao exige
  representante; CPF preenchido continua validado, inclusive na edicao.
  Nome fantasia continua obrigatorio para nova PJ no cadastro completo.
- `backend/src/services/comprasFornecedorService.js`: usa regra geral, sem
  excecao interna exclusiva de Compras. `ParceiroController.js` apenas
  corrige comentario obsoleto; regras do cadastro rapido preservadas.
- Helper e componente `DadosEmpresaParceiro`: representante opcional;
  nova prop de visibilidade sem apagar campos existentes.
- `NovaSolicitacao.jsx` e `NovaSolicitacaoCompra.jsx`: ocultam nome, CPF e
  cargo do representante no modal. Nome fantasia permanece editavel. O
  modal rapido de favorecido ja nao possuia esses campos.
- `GestaoFornecedores.jsx`: usa regra geral opcional, preserva contato
  comercial, permissoes e protecao contra multiplos envios.
- `SolicitacaoDetalhe/FinanceiroCard.jsx`: retira validacao de CPF obrigatorio
  e marcadores de obrigatoriedade do representante; dados preenchidos
  continuam enviados.
- Fluxo contratual e limite nao foram alterados: compara centavos com `>` e
  exige sua propria qualificacao acima do limite vigente. Legado preservado.
- Endpoints, permissoes, primeira PIX e endereco mantidos. Nenhuma migration,
  variavel nova, consulta/escrita de producao ou reinicio.

## Validacoes executadas

- `frontend/scripts/validarDadosEmpresaCredor.mjs`: handlers reais de Pessoas,
  Compra Direta e detalhes com persistencia simulada; representante vazio
  aceito, CPF preenchido invalido rejeitado, compatibilidade legada.
- `frontend/scripts/validarCredorNovaSolicitacao.mjs --ui --capturas`: handler
  e controller reais com dependencias simuladas; nome fantasia obrigatorio,
  representante oculto, endereco unico, primeira PIX, permissoes e bloqueio
  de clique preservados. Edge local em 1280/390px, claro/escuro.
- `frontend/scripts/validarEmpresaFornecedorCompra.mjs`: tela real com APIs
  simuladas, nome fantasia habilitado, representante opcional, salvar/editar,
  duplo clique, permissoes e responsividade. Sem acesso a API externa.
- `backend/scripts/validarEmpresaFornecedorCompra.js`: fornecedor, leitura,
  edicao parcial, PF/PJ, rollback, ID e permissoes, sem banco.
- `backend/scripts/validarRhColaboradoresPlanilha.js`: cadastro compartilhado
  cria/edita sem representante, rejeita CPF invalido; regressao da planilha
  RH anterior, sem banco/rede.
- Novo `backend/scripts/validarRepresentanteLegalLimite.js`: executa inicio
  real da criacao contratual e normalizador, interrompendo antes da
  persistencia. Limites de teste 50/75 mil; abaixo/igual dispensa, acima
  exige nome, CPF valido e qualificacao completa. Condicao do frontend
  conferida. Sem models, .env ou banco.
- Build frontend aprovado; avisos preexistentes de Browserslist e bundle.
- `npm run test:docs` aprovado (423 Markdown, 19 documentos canonicos);
  `git diff --check` aprovado.

## Riscos e proximo passo

Publicar backend e frontend juntos mediante autorizacao. A exportacao XLSX
de colaboradores da tarefa anterior permanece pendente de publicacao e foi
preservada; detalhes em `2026-10-07-fornecedor-opcional-planilha-colaboradores.md`.
Arquivos de QA contem somente fixtures sinteticas.

Preservar auditorias, outputs e ownership de tarefas anteriores. Nao incluir
indiscriminadamente o arquivo inteiro de ownership no commit. A regra
contratual nao deve ser removida nem substituida por um valor fixo de R$ 50 mil.
