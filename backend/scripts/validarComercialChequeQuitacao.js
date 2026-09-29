'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

const comercialService = read('src/services/comercialService.js');
const tituloService = read('src/services/tituloFinanceiroService.js');

assert(
  comercialService.includes('async function receberParcelaContratoEmCheque'),
  'O contrato comercial precisa possuir uma operacao atomica para receber a parcela em cheque.'
);
assert(
  comercialService.includes("forma_recebimento: 'CHEQUE'"),
  'A parcela em cheque precisa usar a rotina financeira oficial de baixa.'
);
assert(
  comercialService.includes('await baixarTitulo(req, titulo.id'),
  'O titulo do contrato precisa ser quitado pela rotina oficial de baixa.'
);
assert(
  comercialService.includes('autorizadoInternamente: true'),
  'A baixa criada pelo proprio fluxo comercial precisa ser explicitamente autorizada.'
);
assert(
  !comercialService.includes('ChequeTerceiroMovimento.create({'),
  'O Comercial nao deve duplicar a criacao do movimento de custodia do cheque.'
);
assert(
  tituloService.includes("status: 'EM_CARTEIRA'"),
  'O cheque recebido precisa permanecer em carteira depois da quitacao do cliente.'
);
assert(
  tituloService.includes('movimento_entrada_id: movimento.id'),
  'O cheque precisa apontar para o movimento que quitou o titulo.'
);
assert(
  tituloService.includes("tipo_movimento: 'BAIXA'"),
  'A quitacao precisa gerar movimento financeiro auditavel.'
);
assert(
  tituloService.includes("status: novoEstado.status"),
  'A baixa precisa atualizar o status e o saldo do titulo.'
);
assert(
  tituloService.includes('options.autorizadoInternamente === true'),
  'O bypass interno deve ser restrito a uma opcao explicita.'
);

console.log('Quitacao de contrato comercial recebido em cheque validada com sucesso.');
