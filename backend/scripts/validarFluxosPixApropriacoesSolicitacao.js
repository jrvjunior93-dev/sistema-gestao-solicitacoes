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
  const novaCompra = read('frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx');
  const configBackend = read('backend/src/services/novaSolicitacaoCamposConfig.js');
  const configFrontend = read('frontend/src/utils/novaSolicitacaoCampos.js');
  const tituloFinanceiro = read('backend/src/services/tituloFinanceiroService.js');
  const lotePagamento = read('backend/src/services/paymentBatchService.js');

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
}

function run() {
  validarNomeDaApropriacao();
  validarCadastroCredorDoContrato();
  validarIntegracaoFrontendBackend();
  console.log('Fluxos de PIX e apropriacoes da solicitacao validados com sucesso.');
}

run();
