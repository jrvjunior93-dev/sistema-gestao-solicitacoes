'use strict';

// Todos os dados sao sinteticos. Nao sao XMLs autorizados nem empresas reais.
const { FIXTURE_COMPANY_CNPJ } = require('../config');

function fixtureDocuments() {
  return [
    {
      id: '900001', empresa_cnpj: FIXTURE_COMPANY_CNPJ,
      emitente_nome: 'Fornecedor ficticio de materiais', emitente_cnpj: '11111111111111',
      destinatario_nome: 'Construtora ficticia DEV', destinatario_cnpj: FIXTURE_COMPANY_CNPJ,
      numero: 1001, chave_acesso: '1'.repeat(44), data_emissao: '20/10/2026',
      data_recebimento: '21/10/2026', valor: 'R$ 1.234,56', modelo: 'NF-e',
      situacao: 'Autorizado', status: 'Pendente'
    },
    {
      id: '900002', empresa_cnpj: FIXTURE_COMPANY_CNPJ,
      emitente_nome: 'Fornecedor ficticio de equipamentos', emitente_cnpj: '22222222222222',
      destinatario_nome: 'Construtora ficticia DEV', destinatario_cnpj: FIXTURE_COMPANY_CNPJ,
      numero: '1002', chave_acesso: '2'.repeat(44), data_emissao: '21/10/2026',
      data_recebimento: '22/10/2026', valor: 'R$ 9.500,00', modelo: 'NF-e',
      situacao: 'Cancelado', status: 'Importado'
    }
  ];
}

module.exports = { fixtureDocuments };
