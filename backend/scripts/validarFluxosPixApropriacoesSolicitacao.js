const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { construirResumoApropriacoes } = require('../src/services/compraApropriacao');
const { resolverCamposNovaSolicitacao } = require('../src/services/novaSolicitacaoCamposConfig');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function validarNomeDaApropriacao() {
  const resumo = construirResumoApropriacoes({
    quantidade: 2,
    apropriacoes: [{
      apropriacao_id: 7,
      quantidade_apropriada: 2,
      apropriacao: {
        id: 7,
        codigo: '00.007',
        descricao: 'Terraplanagem e fundação'
      }
    }]
  });

  assert.deepStrictEqual(resumo.linhas, ['Terraplanagem e fundação: 2']);
  assert(!resumo.texto.includes('00.007'));
}

function validarCadastroCredorDoContrato() {
  const comportamentoContrato = { usa_fluxo_contrato_novo: true };
  const campoPadrao = resolverCamposNovaSolicitacao(
    comportamentoContrato,
    { regras: {} },
    33,
    { areaResponsavel: 'GEO' }
  ).cadastro_credor;
  assert.strictEqual(campoPadrao.visivel, true);
  assert.strictEqual(campoPadrao.obrigatorio, false);

  const campoDesabilitadoPelaConfiguracao = resolverCamposNovaSolicitacao(
    comportamentoContrato,
    {
      regras: {
        GEO: {
          tipos: {
            33: {
              campos: { cadastro_credor: { visivel: false } }
            }
          }
        }
      }
    },
    33,
    { areaResponsavel: 'GEO' }
  ).cadastro_credor;
  assert.strictEqual(campoDesabilitadoPelaConfiguracao.visivel, false);
}

function validarIntegracaoFrontendBackend() {
  const financeiro = read('frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx');
  const detalhe = read('frontend/src/pages/SolicitacaoDetalhe/index.jsx');
  const novaSolicitacao = read('frontend/src/pages/NovaSolicitacao.jsx');
  const novaCompra = read('frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx');
  const revisarCompra = read('frontend/src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompra.jsx');
  const solicitacaoController = read('backend/src/controllers/SolicitacaoController.js');
  const solicitacaoCompraController = read('backend/src/controllers/SolicitacaoCompraController.js');
  const configBackend = read('backend/src/services/novaSolicitacaoCamposConfig.js');
  const configFrontend = read('frontend/src/utils/novaSolicitacaoCampos.js');
  const tituloFinanceiro = read('backend/src/services/tituloFinanceiroService.js');
  const lotePagamento = read('backend/src/services/paymentBatchService.js');
  const aprovacaoTipo = read('backend/src/services/solicitacao/aprovacaoTipoConfig.js');
  const telaAprovacaoTipo = read('frontend/src/pages/AprovacaoSolicitacaoPorTipo.jsx');

  assert(financeiro.includes('function buildPaymentDraftForTitle'));
  assert(financeiro.includes('Dados para pagamento deste título'));
  assert(financeiro.includes('Buscar entre as chaves cadastradas'));
  assert(financeiro.includes('payment_beneficiary_id: beneficiaryIds.get(pagamento.id)'));
  assert(tituloFinanceiro.includes('payment_beneficiary_id: pagamento.paymentBeneficiary?.id || null'));
  assert(lotePagamento.includes('titulo.payment_beneficiary_id'));

  assert(configBackend.includes('visivelPadrao: (behavior) => Boolean(behavior.usa_fluxo_contrato_novo)'));
  assert(configFrontend.includes('visivel: Boolean(behavior.usa_fluxo_contrato_novo), obrigatorio: false'));

  assert(detalhe.includes('const podeEditarApropriacoes = canEditarApropriacoesSolicitacao(user)'));
  assert(!detalhe.includes('const podeEditarApropriacoes = moduloComprasHabilitado && canEditarApropriacoesSolicitacao(user)'));
  assert(detalhe.includes('montarResumoApropriacoesSolicitacao'));

  assert(novaCompra.includes('const [rateiosItemManual, setRateiosItemManual]'));
  assert(novaCompra.includes('apropriacoes: rateiosItemManual'));
  assert(novaCompra.includes('const validacaoRateios = validarRateiosItem(itemNovo)'));
  assert(novaCompra.includes('titulo="Apropriação do item"'));

  // Todo tipo com Forma de pagamento, inclusive habilitada pela configuracao, ja exibe o anexo
  // geral como obrigatorio. Selecionar Boleto o torna opcional.
  assert(novaSolicitacao.includes('const usaRegraAnexoPorFormaPagamento = exibirFormaPagamento'));
  assert(novaSolicitacao.includes('const exigirAnexoPagamento = usaRegraAnexoPorFormaPagamento && !pagamentoViaBoleto'));
  assert(novaSolicitacao.includes('const exibirAnexos = usaRegraAnexoPorFormaPagamento'));
  assert(novaSolicitacao.includes('? true'));
  assert(!novaSolicitacao.includes('exibirAnexos && !(tipoEhDeMedicao'));
  assert(!novaSolicitacao.includes('tipoEhAdmLocalObra'));
  assert(!solicitacaoController.includes('tipoEhAdmLocalObra'));
  assert(solicitacaoController.includes("const exibeFormaPagamentoNaNovaSolicitacao = campoVisivel('forma_pagamento')"));
  assert(solicitacaoController.includes("!exibeFormaPagamentoNaNovaSolicitacao && campoObrigatorio('anexos')"));
  assert(solicitacaoController.includes('!formaPagamentoEhBoleto(formaPagamentoSelecionada)'));
  assert(solicitacaoController.includes('Anexe ao menos um comprovante para esta forma de pagamento.'));

  // Os dois PDFs usam o mesmo renderizador e devem receber a descricao carregada da apropriacao.
  assert(solicitacaoCompraController.includes('const compraDireta = isSolicitacaoCompraDireta(solicitacao)'));
  assert.strictEqual(
    (solicitacaoCompraController.match(/apropriacao: construirResumoApropriacoes\(item\)\.linhas\.join\('\\n'\)/g) || []).length,
    2
  );
  assert(revisarCompra.includes("modoCompraDireta ? 'Compra Direta' : 'Solicitacao de Compra'"));
  assert(revisarCompra.includes('montarLinhasResumoApropriacao(item)'));

  // O modal usa a casca responsiva comum, largura ampla e corpo rolante sem largura minima.
  assert(detalhe.includes('largura="var(--modal-max-w-xl, 1120px)"'));
  assert(detalhe.includes('data-testid="editar-apropriacoes-corpo"'));
  assert(detalhe.includes('className="min-w-0 space-y-4 p-4"'));

  assert(novaSolicitacao.includes('<BlocoConteudo titulo="Valor">'));
  assert(!novaSolicitacao.includes('titulo="Valor e apropriação"'));
  assert(!novaSolicitacao.includes('O valor é o número que a apropriação reparte'));

  // O fallback de Solicitacao de Compra so pode ser efetivado quando LIBERADO esta ativo em
  // Compras. Sem isso, a tela sugere o setor com status vazio e nao bloqueia outras regras.
  assert(aprovacaoTipo.includes('const statusPadraoAtivo = etapasCompras.some'));
  assert(aprovacaoTipo.includes('if (statusPadraoAtivo)'));
  assert(aprovacaoTipo.includes('porTipo.delete(chaveTipoCompra)'));
  assert(telaAprovacaoTipo.includes('function sugerirDestinoCompra'));
  assert(telaAprovacaoTipo.includes('tipoEhSolicitacaoCompra(tipo) && regra.setor_destino && !regra.status_destino'));

  // Aprovar pelo fluxo configurado deve acionar a mesma sincronizacao da troca manual de status;
  // para Recarga de Cartao isso transforma o titulo PREVISAO em ABERTO na mesma transacao.
  assert(solicitacaoController.includes(`await sincronizarTituloComStatusSolicitacao(
        solicitacao.id,
        contexto.statusDestino,
        req.user.id,
        transaction
      );`));
}

function run() {
  validarNomeDaApropriacao();
  validarCadastroCredorDoContrato();
  validarIntegracaoFrontendBackend();
  console.log('Fluxos de PIX e apropriacoes da solicitacao validados com sucesso.');
}

run();
