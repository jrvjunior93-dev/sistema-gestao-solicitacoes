# Pix Copia e Cola - 2026-10-09

## Estado e escopo

Implementado localmente em `refactor/frontend`, base `abcfe89b65a88d647298ccbc8de264fd7759e5a3`.
Sem commit/push, promocao para main, banco real, migration executada ou deploy.
`outputs/` preexistente preservado; evidencias novas em `outputs/qa-pix-copia-cola/`.

Pedido: localizar todos os seletores de tipo de chave Pix e adicionar Copia e Cola
com texto livre, principalmente Preparar Pix ao criar titulo no detalhe da solicitacao.

## Impacto mapeado e alteracoes

- Catalogo frontend comum: `frontend/src/utils/pix.js`; tipo persistido `COPIA_COLA`,
  rotulo Copia e Cola. Seletores em FinanceiroCard (ambos os trechos),
  FinanceiroTituloNovo/Editar, FinanceiroCadastros, Parceiros (tres chaves),
  NovaSolicitacao (tres chaves), RhDpPessoal e PedidoCompraDetalhe (frete).
- Inputs existentes preservados, sem explicacao fixa nova ou alteracao de layout.
  Mascaras/documentos so para tipos antigos; frete nao corta ou formata Copia e Cola.
  CadastroRapidoFavorecidoButton nao corta mais a chave colada em 255 caracteres;
  o backend infere COPIA_COLA para payloads 000201 quando nao ha tipo informado.
- `backend/src/utils/pix.js`, paymentValidators, paymentBeneficiaryService,
  parceiroService: aceitar tipo e texto livre ate 8192 caracteres; preservar caixa,
  simbolos e espacos internos. Remover somente espacos nas extremidades, como antes.
  Nao validar EMV/CRC nem tratar texto como CPF, CNPJ, telefone, email ou UUID.
- Cadastro simplificado: SHA-256 do texto no identificador canonico do novo tipo,
  para manter indice unico curto e protecao contra concorrencia. A chave em si e
  salva integralmente. Busca por SHA2 e tipo impede comparacao case-insensitive
  de codigos distintos. Tipos/canonicos antigos mantidos.
- FinanceiroCard preserva tipo/texto no preenchimento a partir de parceiro e na
  deduplicacao de favorecidos por titulo; colons dentro do texto nao sao separados.
- operationalValidators e rhValidators aceitam texto longo nas rotas de origem;
  medicaoContratoService deixa de cortar chave em 180 caracteres. rhService e
  rhFechamentoService reconhecem payload 000201 antes de inferir documento/email.
  rhJornadaFormularioService aceita chave ate 8192 no pagamento da jornada.
- Modelos ampliados: PaymentBeneficiary, Parceiro, RhColaborador,
  RhColaboradorPagamento, RhEventoRecorrente, Solicitacao, SolicitacaoCompra,
  ContratoMedicao. Auditoria/snapshots ja usam TEXT/JSON.
- Nao alterar permissoes, status, baixas, valores, faturas ou envio para autorizacao.
  A fila manual continua usando os dados cadastrados. A API bancaria BB atual
  gera PIX por chave (tipoPagamento 126), nao pagamento QR/Copia e Cola. Guardas em
  paymentEligibilityService e bancoDoBrasilPayloadMapper impedem envio como UUID
  ou criacao de intents de lote automatico para esse novo tipo. Nao implementada
  nova integracao bancaria nem executado qualquer pagamento.

## Migration preparada, NAO executada

`backend/migrations/202610090001_pix_copia_cola_texto.js` amplia 12 colunas VARCHAR
para TEXT, mantendo nulabilidade/dados; nao altera registros, status ou valores.
O indice `idx_payment_beneficiaries_pix` recebe prefixo de 255 na coluna TEXT,
necessario no MySQL. O identificador canonico unico continua VARCHAR(300).
Migration repetivel, inclusive recriacao do indice se uma execucao anterior parou
apos removeIndex/changeColumn. Down bloqueado para nao cortar codigos existentes.

Nao testada em MySQL real nesta tarefa: descricao de schema/modelos e SQL do indice
testados com Sequelize e queryInterface em memoria. Aplicar em DEV com backup e
conferencia antes de usar codigos longos; depois validar com usuario real. Promocao
e execucao de migration em producao exigem autorizacao e gates de backup do projeto.

## Validacoes aprovadas

- `npm run test:pix-copia-cola` (backend): validadores create/update, texto arbitrario,
  mais de 255 caracteres, caixa/simbolos/quebra interna, vazio, limite superior,
  tipos invalidos, CPF antigo, parceiro e favorecido simplificado, frete e RH,
  12 colunas TEXT, nulabilidade, SQL de prefixo e repeticao da migration;
  guardas do motor BB e UUID antigo. Sem banco/rede.
- `npm run test:pix-copia-cola` (frontend): catalogo nas oito telas, mascara real
  de frete, componente real FinanceiroCard e transporte HTTP simulado;
  Preparar Pix, cadastro e vinculacao do favorecido no titulo em 1366 e 375px;
  multiplos titulos com codigos que diferem por caixa recebem favorecidos distintos.
  Screenshots inspecionados; nenhum erro de pagina ou acesso externo.
- `validarCartaoOpcionalSolicitacaoUI.mjs`: credito/debito com e sem cartao;
  criar titulo continua funcionando. Chrome local, APIs simuladas.
- Backend: test:cpf-cnpj, test:permissoes-financeiro-rotas (73 rotas),
  validarCredorCompraDireta, validarRhColaboradoresPlanilha,
  validarRhPessoalPorSolicitacao, validarRhConferenciaGuiada,
  validarRhDpRegrasPagamento, validarPagamentosEngine, validarFilaInstrumentos,
  validarBaixaMassaFormasPagamento, validarMedicaoRecargaFluxoPagamento.
- Stubs de testes que carregam os servicos em VM passaram a permitir o utilitario
  Pix real (sem banco). Sem alterar expectativas de negocio.
- Build Vite aprovado; sintaxe JS backend e git diff --check aprovados.

## Falhas preexistentes, nao corrigidas nesta tarefa

Confirmadas tambem usando fontes de HEAD, sem gravar arquivos ou mudar o checkout:

1. validarFluxosPixApropriacoesSolicitacao: espera texto antigo `'Boleto / arquivos'`.
2. validarCompraDiretaFrete: espera marcador antigo `selecao={podeEnviarParaFila ? {`.
3. validarRhPessoalFluxo: falta stub `./notificacoes` no carregamento da transferencia.

Novos testes exercitam efetivamente os dados Pix/frete, nao essas strings legadas.

## Proximo passo exato

Revisar diff e, se autorizado, commitar/publicar apenas esta tarefa. Nao incluir
outputs/. Gerar comandos DEV com commit fixado e migration explicita apos verificar
que host dev difere de producao; nao executar deploy pelo agente nesta autorizacao.
Se houver promocao sem pacote Pessoal/DP, preservar main e levar apenas hunks Pix
de RhDpPessoal/rhJornadaFormularioService (nao copiar arquivos completos da branch
refactor). O pacote DP anterior continua pendente e fora da main.

## Publicacao DEV autorizada - 2026-10-10

Usuario autorizou commit/push de todas as pendencias desta conversa somente na
refactor/frontend. Pix backend/UI revalidados e aprovados; incluir migration,
utilitarios, modelos, seletores, validadores e testes/documentacao. outputs/
excluido. Nenhuma migration executada ou banco/EC2/main alterado neste passo.
