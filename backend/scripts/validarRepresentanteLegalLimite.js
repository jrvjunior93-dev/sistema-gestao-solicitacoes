'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { onlyDigits: normalizarCpfCnpj, isValidCpfCnpj } = require('../src/utils/cpfCnpj');
const { paraCentavos } = require('../src/services/contratoParcelasService');

// Executa a validacao real e o inicio real da criacao; interrompe antes da
// persistencia. Nao importa models, .env nem conecta ao banco.
const fonte = fs.readFileSync(path.resolve(__dirname, '../src/services/contratoFluxoNovoService.js'), 'utf8');
const normalizadores = fonte.slice(fonte.indexOf('const ESTADOS_CIVIS_REPRESENTANTE ='), fonte.indexOf('const ACAO_HISTORICO_JURIDICO ='));
const inicio = fonte.slice(fonte.indexOf('async function criarContrato('), fonte.indexOf('// A negociacao detalhada NAO e mais cobrada aqui'));
const frontend = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx'), 'utf8');
assert.match(frontend, /paraCentavosContrato\(valorTotal\) > paraCentavosContrato\(limiteAplicado\)/);
assert.match(frontend, /\{exigeDocumentacaoJuridica && \(/);

const qualificacao = {
  nome: 'Representante teste', cpf: '529.982.247-25', rg: '123456', cargo: 'Diretor',
  nacionalidade: 'Brasileira', estado_civil: 'SOLTEIRO', profissao: 'Administrador'
};
let limite = 50000;
const criar = vm.runInNewContext(`${normalizadores}\n${inicio}\nreturn qualificacaoRepresentante; }\ncriarContrato`, {
  normalizarCpfCnpj, isValidCpfCnpj, paraCentavos,
  resolverDestinoInicialNovaSolicitacao: async () => ({ areaResponsavel: 'GEO' }),
  Obra: { findOne: async () => ({ id: 51 }) },
  obterLimiteJuridico: async () => ({ limite_cent: paraCentavos(limite) })
});

async function executar() {
  for (const valorLimite of [50000, 75000]) {
    limite = valorLimite;
    const dados = { obra_id: 51, parceiro_id: 22 };
    for (const valor of [limite - 0.01, limite]) {
      assert.equal(await criar({ ...dados, valor_total: valor }), null, 'Ate o limite nao exige representante.');
    }
    await assert.rejects(() => criar({ ...dados, valor_total: limite + 0.01 }), /qualificacao do representante legal/);
    for (const campo of ['nome', 'cpf']) {
      await assert.rejects(() => criar({ ...dados, valor_total: limite + 0.01,
        representante_legal_qualificacao: { ...qualificacao, [campo]: '' } }), /qualificacao do representante legal/);
    }
    await assert.rejects(() => criar({ ...dados, valor_total: limite + 0.01,
      representante_legal_qualificacao: { ...qualificacao, cpf: '00000000000' } }), /CPF valido/);
    const resultado = await criar({ ...dados, valor_total: limite + 0.01, representante_legal_qualificacao: qualificacao });
    assert.equal(resultado.nome, qualificacao.nome);
    assert.equal(resultado.cpf, '52998224725');
  }
  console.log('Representante contratual: limite dinamico, abaixo/igual/acima e nome/CPF obrigatorios acima do limite validados. Sem banco.');
}
executar().catch(error => { console.error(error); process.exitCode = 1; });
