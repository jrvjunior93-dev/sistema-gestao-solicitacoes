'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  validateFinanceConciliacaoCriarTituloBody,
  validateFinanceTituloCreateBody,
  validateFinanceTituloCreateFromSolicitacaoBody
} = require('../src/validators/financialValidators');
const { resolverCompetenciaCriacaoSolicitacao } = require('../src/services/tituloFinanceiroService');

const backendRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(backendRoot, '..');
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
const readRepository = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const service = readBackend('src/services/tituloFinanceiroService.js');
const creationScreens = [
  'frontend/src/pages/FinanceiroConciliacao.jsx',
  'frontend/src/pages/FinanceiroTituloNovo.jsx',
  'frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx'
];

assert(
  service.includes('function resolverCompetenciaCriacaoTitulo()')
    && service.includes('return getHoje();'),
  'A competencia de novos titulos deve ser derivada da data de criacao.'
);
assert.strictEqual(
  (service.match(/competencia_data: resolverCompetenciaCriacaoTitulo\(\)/g) || []).length,
  2,
  'Os fluxos manuais e de conciliacao devem usar a data de criacao do titulo.'
);
assert(
  service.includes('competencia_data: competenciaSolicitacao'),
  'Titulos vinculados a solicitacao devem usar a data de criacao da solicitacao.'
);
assert.strictEqual(
  resolverCompetenciaCriacaoSolicitacao({ createdAt: new Date('2026-09-18T02:30:00.000Z') }),
  '2026-09-17',
  'A competencia deve respeitar a data da solicitacao no fuso de Sao Paulo.'
);
assert.throws(
  () => resolverCompetenciaCriacaoSolicitacao({ createdAt: null }),
  /data de criacao da solicitacao nao esta disponivel/i
);
assert(
  service.includes('const competenciaData = resolverCompetenciaTitulo(payload);'),
  'A edicao de titulos existentes deve preservar a validacao explicita de competencia.'
);

const validatorCases = [
  validateFinanceTituloCreateFromSolicitacaoBody({ categoria_financeira_id: 1 }),
  validateFinanceTituloCreateBody({
    tipo: 'PAGAR',
    obra_id: 1,
    parceiro_id: 1,
    valor: 100,
    descricao: 'Titulo de teste',
    categoria_financeira_id: 1
  }),
  validateFinanceConciliacaoCriarTituloBody({
    tipo: 'PAGAR',
    obra_id: 1,
    parceiro_id: 1,
    valor: 100,
    data_vencimento: '2026-09-11',
    descricao: 'Titulo de teste',
    empresa_id: 1,
    categoria_financeira_id: 1,
    conta_bancaria_id: 1,
    forma_recebimento: 'PIX',
    data_movimento: '2026-09-11'
  })
];

validatorCases.forEach((payload) => {
  assert.strictEqual(
    payload.competencia_data,
    undefined,
    'A criacao deve aceitar a competencia ausente para o backend preenche-la.'
  );
});

creationScreens.forEach((relativePath) => {
  const source = readRepository(relativePath);
  assert(
    !source.includes('competencia_data') && !source.includes('Competência DRE'),
    `A tela de criacao nao deve solicitar competencia manual: ${relativePath}`
  );
});

const financeiroCard = readRepository('frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx');
const envioTituloSolicitacao = financeiroCard.split('await gerarContaPorSolicitacao(solicitacao.id, {')[1]?.split('setModalOpen(false)')[0];
assert(envioTituloSolicitacao && !envioTituloSolicitacao.includes('considera_dre:'), 'A DRE nao deve ser enviada pela tela dentro dos pagamentos.');
const pagamentoValido = { forma_pagamento_id: 1, categoria_financeira_id: 1, payment_beneficiary_id: 2, valor: 100 };
assert.strictEqual(
  validateFinanceTituloCreateFromSolicitacaoBody({ categoria_financeira_id: 1, pagamentos: [pagamentoValido] }).pagamentos[0].payment_beneficiary_id,
  2
);
assert.throws(
  () => validateFinanceTituloCreateFromSolicitacaoBody({ categoria_financeira_id: 1, pagamentos: [{ ...pagamentoValido, considera_dre: true }] }),
  /campos nao permitidos: considera_dre/i
);

console.log('Competencia DRE automatica na criacao de titulos e nos pagamentos de solicitacao validada com sucesso.');
