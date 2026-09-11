'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  validateFinanceConciliacaoCriarTituloBody,
  validateFinanceTituloCreateBody,
  validateFinanceTituloCreateFromSolicitacaoBody
} = require('../src/validators/financialValidators');

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
  3,
  'Os tres fluxos interativos de criacao devem usar a competencia automatica.'
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

console.log('Competencia DRE automatica na criacao de titulos validada com sucesso.');
