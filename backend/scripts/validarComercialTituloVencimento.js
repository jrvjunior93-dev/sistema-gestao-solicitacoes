const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

const comercialService = read('backend/src/services/comercialService.js');
const tituloService = read('backend/src/services/tituloFinanceiroService.js');
const paymentBaixaService = read('backend/src/services/paymentBaixaService.js');
const boletoCaixaOperacaoService = read('backend/src/services/boletoCaixaOperacaoService.js');
const chequeTerceiroService = read('backend/src/services/chequeTerceiroService.js');
const faturaCartaoService = read('backend/src/services/faturaCartaoFinanceiroService.js');
const contratosPage = read('frontend/src/pages/ComercialContratos.jsx');

assert(
  comercialService.includes('const vencimento = titulo?.data_vencimento || parcela?.data_vencimento || null;'),
  'Os indicadores comerciais precisam priorizar o vencimento operacional do titulo.'
);
assert(
  comercialService.includes('async function sincronizarContratoComercialPorTituloEditado'),
  'O Comercial precisa expor a sincronizacao executada depois da edicao do titulo.'
);
assert(
  comercialService.includes('{ data_vencimento: vencimentoAtualizado }'),
  'A data espelhada da parcela comercial precisa acompanhar o titulo editado.'
);
assert(
  comercialService.includes('STATUS_CONTRATO_SINCRONIZAVEIS_FINANCEIRO.includes(statusAnterior)'),
  'A sincronizacao automatica nao pode sobrescrever estados comerciais terminais.'
);
assert(
  tituloService.includes('await sincronizarContratoComercialPorTituloEditado({'),
  'A edicao financeira precisa acionar a sincronizacao do contrato vinculado.'
);
assert(
  comercialService.includes('async function sincronizarContratoComercialPorTituloFinanceiro')
    && comercialService.includes('transaction: externalTransaction = null')
    && comercialService.includes('return executar(externalTransaction);'),
  'A sincronizacao comercial precisa participar da mesma transacao da alteracao financeira.'
);
assert(
  tituloService.includes("motivo: 'BAIXA_TITULO'")
    && tituloService.includes("motivo: 'BAIXA_AGRUPADA_TITULO'")
    && tituloService.includes("motivo: 'ESTORNO_BAIXA_TITULO'"),
  'Baixas comuns, agrupadas e estornos precisam sincronizar o contrato comercial.'
);
assert(
  paymentBaixaService.includes("motivo: 'CONFIRMACAO_PAGAMENTO_BANCARIO'"),
  'A confirmacao bancaria precisa sincronizar o contrato comercial.'
);
assert(
  boletoCaixaOperacaoService.includes("motivo: 'LIQUIDACAO_RETORNO_BANCARIO'"),
  'A liquidacao por retorno bancario precisa sincronizar o contrato comercial.'
);
assert(
  chequeTerceiroService.includes("motivo: 'ESTORNO_BAIXA_COMPOSTA'"),
  'O estorno de baixa composta precisa sincronizar o contrato comercial.'
);
assert(
  faturaCartaoService.includes("motivo: 'BAIXA_FATURA_CARTAO'"),
  'A baixa por fatura de cartao precisa sincronizar o contrato comercial.'
);
assert(
  contratosPage.includes('parcela.tituloFinanceiro?.data_vencimento || parcela.data_vencimento'),
  'A tabela do contrato precisa exibir primeiro o vencimento vigente no titulo.'
);

console.log('Sincronizacao de vencimento dos contratos comerciais validada com sucesso.');
