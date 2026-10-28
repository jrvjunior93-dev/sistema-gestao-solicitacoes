# Favorecido explicito na criacao de titulos - 27/10/2026

## Pedido e limites

Usuario quer o bloco PIX ativo, mas vazio ao criar titulo; dados do credor
somente ao marcar Usar o proprio credor como favorecido. Resposta explicita:
preservar dados da propria solicitacao/medicao/instrucao daquele pagamento.
Implementacao local sobre main/frontend ece109c9, sem EC2, backend, registros
reais, migrations, commit/push ou deploy. Edicao de titulos ja salvos intacta.

## Causa e alteracoes

- FinanceiroCard.buildPaymentDraftForTitle selecionava primeiro favorecido
  ativo do cadastro, ou PIX principal do credor, mesmo sem escolha no titulo.
  FinanceiroTituloNovo tambem selecionava o primeiro favorecido na consulta.
  Ambas as selecoes automaticas foram removidas. Cadastros continuam disponiveis
  para selecao explicita; nenhum cadastro bancario foi apagado ou alterado.
- Rascunhos novos abrem Preparar PIX ativo com nome/documento/chave/ID vazios.
  A opcao do credor fica desmarcada. Marca-la carrega seu cadastro. Desmarca-la
  ou selecionar Novo favorecido limpa o bloco. Trocar credor no titulo avulso
  limpa o favorecido anterior e exige nova escolha.
- Marcar Preparar PIX nao puxa mais dados do credor no card por titulo. Suas
  chaves so entram no seletor de chaves apos escolha Usar o proprio credor.
- Consulta atrasada do contexto nao substitui dados ja digitados no titulo:
  updateDadosPagamento registra o ID do credor ao qual o rascunho pertence.
- Dados expressos na solicitacao (inclusive frete/Compra Direta) continuam
  prevalecendo sobre o cadastro; instrucoes por parte/medicao continuam em seus
  caminhos existentes. Instrucoes de origem e Compra Direta nao PIX nao exigem
  preencher um bloco PIX oculto nem criam favorecido bancario adicional.
- Validacao do PIX ativo continua antes de gravar. Usuario pode desmarcar
  Preparar PIX se ainda nao tem os dados. Rascunho atual do workspace do titulo
  avulso continua preservado; este ajuste nao apaga preenchimento em andamento.
  Nenhuma permissao, endpoint, valor, baixa, lote PIX ou historico foi alterado.

## Arquivos

- frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx
- frontend/src/pages/FinanceiroTituloNovo.jsx
- frontend/scripts/validarFavorecidoCriacaoExplicita.mjs (novo)
- frontend/scripts/validarPixCopiaCola.mjs: roteiro agora marca explicitamente
  Usar o proprio credor antes de conferir Copia e Cola; mesmos payloads/chaves.
- README financeiro e ownership.

## Validacao local

QA novo usa paginas Card/Novo reais1366/390, services ficticios e rede externa
bloqueada. Confere PIX ativo vazio mesmo com favorecido antigo e chave do credor,
carregamento por clique, limpar/reabrir/trocar credor, consulta atrasada,
validacao sem gravacao, origem preservada, instrucao da origem e Compra Direta
nao PIX com submit ficticio sem criar favorecido extra, e perfil somente leitura.
Nao houve operacao real. Fixtures gravam apenas arrays em memoria do navegador.

Regressoes aprovadas: validarPixCopiaCola, validarTituloSolicitacaoAtualizacao
normal e --frete, validarValoresFormasTituloSolicitacao (inclui instrucao/medicao).
Build16.15s aprovado com avisos existentes de Browserslist/chunks.
Capturas locais em outputs/favorecido-explicito/card-1366.png e card-390.png.

## Proximo passo

Entrega permanece local, nao publicada. Se o usuario solicitar, preparar
commit seletivo primeiro na refactor/frontend e homologacao visual. Alteracao
funcional apenas frontend: nao exige atualizador EC2, migration ou restart.
Preservar recursos exclusivos DEV se transportar a partir desta base main.
Nao alterar manifestos fechados das publicacoes anteriores.
