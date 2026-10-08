const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  historicoPertenceAoEscopoSetor
} = require('../src/services/fileAccessService');

const backendRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.resolve(backendRoot, relativePath), 'utf8');
}

function validateHistoricoPorTexto() {
  const historico = {
    acao: 'ENVIADA_SETOR',
    setor: 'OBRA',
    observacao: 'De GEO para OBRA'
  };

  assert.strictEqual(
    historicoPertenceAoEscopoSetor(historico, ['GERENCIA DE PROCESSOS']),
    true,
    'Alias GERENCIA DE PROCESSOS deve reconhecer passagem historica por GEO.'
  );
  assert.strictEqual(
    historicoPertenceAoEscopoSetor(historico, ['OBRA']),
    true,
    'Setor de destino deve reconhecer a passagem historica.'
  );
  assert.strictEqual(
    historicoPertenceAoEscopoSetor(historico, ['FINANCEIRO']),
    false,
    'Setor sem participacao nao pode acessar o anexo.'
  );
}

function validateHistoricoPorMetadata() {
  const historico = {
    acao: 'ENVIADA_SETOR',
    setor: 'OBRA',
    metadata: JSON.stringify({
      setor_origem: 'GERENCIA_PROCESSOS',
      setor_destino: 'OBRA'
    })
  };

  assert.strictEqual(
    historicoPertenceAoEscopoSetor(historico, ['GEO']),
    true,
    'Alias GEO deve reconhecer metadata historica da Gerencia de Processos.'
  );
}

function validateAcoesNaoRelacionadas() {
  assert.strictEqual(
    historicoPertenceAoEscopoSetor({
      acao: 'COMENTARIO',
      setor: 'GEO',
      observacao: 'De GEO para OBRA'
    }, ['GEO']),
    false,
    'Uma acao que nao seja ENVIADA_SETOR nao pode ampliar o acesso.'
  );
}

function validateIntegracaoComAutorizacao() {
  const source = read('src/services/fileAccessService.js');
  assert(
    source.includes('userSetorParticipatedInSolicitacao(req.user, solicitacao.id, userScopeTokens)'),
    'Autorizacao de anexos nao consulta a passagem historica do setor.'
  );
  assert(
    source.includes('acao: { [Op.in]: ACOES_ENCAMINHAMENTO_SETOR }'),
    'Consulta historica nao esta restrita a envios entre setores.'
  );
}

validateHistoricoPorTexto();
validateHistoricoPorMetadata();
validateAcoesNaoRelacionadas();
validateIntegracaoComAutorizacao();

console.log('Validacoes de acesso a anexos de solicitacoes concluidas com sucesso.');
