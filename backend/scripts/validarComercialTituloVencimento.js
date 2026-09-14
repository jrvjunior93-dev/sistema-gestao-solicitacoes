const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

const comercialService = read('backend/src/services/comercialService.js');
const tituloService = read('backend/src/services/tituloFinanceiroService.js');
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
  comercialService.includes("{ data_vencimento: vencimentoAtualizado }"),
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
  contratosPage.includes('parcela.tituloFinanceiro?.data_vencimento || parcela.data_vencimento'),
  'A tabela do contrato precisa exibir primeiro o vencimento vigente no titulo.'
);
assert(
  contratosPage.includes("'comercial:contratos:novo-contrato'"),
  'O formulario extenso precisa permitir recolhimento persistente.'
);
assert(
  contratosPage.includes('Situação financeira'),
  'O detalhe responsivo precisa agrupar os indicadores em uma unica area financeira.'
);

console.log('Sincronizacao de vencimento e organizacao dos contratos comerciais validadas com sucesso.');
