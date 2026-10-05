# Compra Direta: acesso aos itens na fila GEO

## Evidencia e autorizacao

O proprietario autorizou aplicar a correcao de acesso; ajustara as permissoes
financeiras da Liz separadamente. Resultados SELECT fornecidos pelo usuario:
Liz Jabor id 2, ADMIN, setor GEO id 2; SOL-6240 id 6275, obra 51, atualmente GEO;
compra 584, COMPRA_DIRETA/ENVIADO, solicitante id 6, comprador responsavel NULL,
dois itens manuais. Liz tem leitura de compras, catalogacao e apropriacoes de
Compra Direta, mas escopo apenas atribuidas e nenhum bloqueio individual.
O bypass de revisao GEO existente excluia Compra Direta. Nenhuma consulta ou
escrita em producao foi executada pelo agente.

## Alteracoes

- `backend/src/controllers/SolicitacaoCompraController.js`: excecao opt-in de
  acesso para Compra Direta nos dois GETs por solicitacao principal e nas acoes
  granulares de apropriacoes/cadastro de unidade. Exige leitura de compras,
  capacidade GEO, solicitacao principal existente atualmente em GEO e a mesma
  regra de visibilidade/setor principal usada no detalhe. Rele a solicitacao
  principal e trava o setor em transacoes de escrita. Aceita aliases legados
  de GEO. Permissoes especificas e bloqueio de apropriacoes quando ja existe
  titulo permanecem. Escopo geral, listas, pedidos, cotacoes e demais acoes
  NAO optam pela excecao. Catalogacao permanece com suas guardas existentes,
  sem alteracao de rota, servico, idempotencia ou criacao de insumos.
- `frontend/src/pages/SolicitacaoDetalhe/index.jsx` e
  `frontend/src/pages/SolicitacaoDetalhe/estadoItensCompraDireta.js`: descricao
  distingue carregamento, erro, dados ainda nao carregados e lista realmente
  vazia. Limpa dados antigos ao trocar solicitacao e limpa erro apos uma
  recuperacao bem-sucedida do gerenciamento/catalogacao.
- Testes: `backend/scripts/validarCompraDiretaGeoAcesso.js` executa funcoes de
  escopo e handlers reais em VM com dados simulados, sem models/env/banco;
  `frontend/scripts/validarEstadoItensCompraDireta.mjs` testa os estados e, com
  `--ui`, o componente BlocoConteudo real no Edge headless em fixture local.
- Registro de ownership atualizado. Nenhuma permissao financeira alterada.

## Validacoes

PASSOU:

- `node backend/scripts/validarCompraDiretaGeoAcesso.js`: dois itens presentes,
  escopo geral preservado, GEO atual, visibilidade, setor principal versus
  vinculo secundario, ausencia de leitura, principal inexistente, alias GEO,
  compra normal, acoes sem permissao, trava transacional e titulo existente.
- `node frontend/scripts/validarEstadoItensCompraDireta.mjs --ui`: erro visivel
  inclusive recolhido, expansao, carregamento/botao desabilitado, recuperacao
  com dois itens, vazio real e ausencia de erros JS no navegador.
- `node backend/scripts/validarAcessoPedidosEscopo.js`.
- `node backend/scripts/validarUnidadeItemCompra.js`.
- `node --check backend/src/controllers/SolicitacaoCompraController.js`.
- `npm run build` no frontend (avisos ja existentes de Browserslist e chunks).
- `git diff --check`.

LIMITACAO PREEXISTENTE: `validarCatalogacaoItensManuais.js` interrompe na etapa
estatica com ENOENT para `ItemCompraExpansivel.jsx`, componente que nao existe
neste checkout. Nao alterado nesta tarefa. Testes focados novos, regressao de
unidades/pedidos e build passaram; nao houve ensaio no banco ou conta real.

## Proximo passo

No pedido seguinte, o proprietario autorizou commit, push e promocao para main.
O worktree ja esta em main, sincronizado com origin/main antes do commit;
nao ha merge adicional. O proximo passo operacional e o deploy. A correcao exige
frontend na Vercel e backend atualizado/reiniciado na EC2 (backend-solicitacoes
para producao); sem migrations, variaveis novas ou alteracoes de dados.
Nao reiniciar backend-dev. Apos deploy, Liz deve entrar com sessao atualizada,
abrir SOL-6240/id 6275 e verificar os dois itens e catalogacao. Apropriacoes
permanecem indisponiveis se ja houver titulo financeiro. Validar tambem conta
sem leitura/permissao de acao e solicitacao fora de GEO. Nao ampliar escopo para
TODAS/SETOR como contorno, nem alterar permissoes financeiras da Liz.
