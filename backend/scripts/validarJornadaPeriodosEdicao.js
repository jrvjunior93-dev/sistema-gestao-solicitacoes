'use strict';

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  normalizarPeriodo, __test
} = require('../src/services/rhJornadaFormularioService');
const { __test: planilhaTest } = require('../src/services/rhJornadaPlanilhaService');

const mensal = normalizarPeriodo({ periodicidade: 'MENSAL' }, '2026-09');
assert.deepStrictEqual(mensal, {
  periodicidade: 'MENSAL',
  inicio: '2026-09-01',
  fim: '2026-09-30',
  dias: 30
});

const semanal = normalizarPeriodo({
  periodicidade: 'SEMANAL',
  periodo_inicio: '2026-09-08',
  periodo_fim: '2026-09-14'
}, '2026-09');
assert.strictEqual(semanal.dias, 7);

assert.throws(() => normalizarPeriodo({
  periodicidade: 'SEMANAL',
  periodo_inicio: '2026-09-08',
  periodo_fim: '2026-09-15'
}, '2026-09'), /maximo 7 dias/);

assert.throws(() => normalizarPeriodo({
  periodicidade: 'QUINZENAL',
  periodo_inicio: '2026-09-20',
  periodo_fim: '2026-10-05'
}, '2026-09'), /dentro da competencia/);

assert.deepStrictEqual(normalizarPeriodo({}, '2026-10', 'ADIANTAMENTO_40'), {
  periodicidade: 'QUINZENAL', inicio: '2026-10-01', fim: '2026-10-15', dias: 15
});
assert.deepStrictEqual(normalizarPeriodo({}, '2026-10', 'SALDO_60'), {
  periodicidade: 'QUINZENAL', inicio: '2026-10-16', fim: '2026-10-31', dias: 16
});
assert.deepStrictEqual(normalizarPeriodo({}, '2026-10', 'DIARIA'), {
  periodicidade: 'MENSAL', inicio: '2026-10-01', fim: '2026-10-31', dias: 31
});
assert.throws(() => normalizarPeriodo({ periodo_inicio: '2026-10-05' }, '2026-10', 'DIARIA'),
  /etapa e a competencia determinam/);

const colaborador = { id: 1, forma_calculo_gerencial: 'MENSAL', pagamento_automatico_40_60: true };
const vinculos = [
  { colaborador_id: 1, vigencia_inicio: '2026-10-01', vigencia_fim: '2026-10-12' }
];
const historicos = [
  { colaborador_id: 1, forma_calculo: 'MENSAL', vigencia_inicio: '2026-10-01', vigencia_fim: '2026-10-06' },
  { colaborador_id: 1, forma_calculo: 'DIARIA', vigencia_inicio: '2026-10-07', vigencia_fim: null }
];
const elegiveis = __test.diasDiariaElegiveis(colaborador, vinculos, historicos,
  normalizarPeriodo({}, '2026-10', 'DIARIA'), '2026-10-12');
assert.deepStrictEqual(elegiveis, ['2026-10-07', '2026-10-08', '2026-10-09',
  '2026-10-10', '2026-10-11', '2026-10-12']);
assert.deepStrictEqual(__test.validarDiasDiaria(['2026-10-08', '2026-10-07'], elegiveis, [],
  'Colaborador', '2026-10'), ['2026-10-07', '2026-10-08']);
assert.throws(() => __test.validarDiasDiaria(['2026-10-08'], elegiveis, ['2026-10-08'],
  'Colaborador', '2026-10'), /ja foi enviado/);
assert.throws(() => __test.validarDiasDiaria(['2026-10-13'], elegiveis, [],
  'Colaborador', '2026-10'), /nao pertence ao vinculo/);
assert.throws(() => __test.validarDiasDiaria(['2026-10-07', '2026-10-07'], elegiveis, [],
  'Colaborador', '2026-10'), /selecione os dias/);

const pixPadrao = __test.pagamentoDoTituloDaJornada({}, { chave_pix: 'cpf-antigo' }, 'Colaborador');
assert.strictEqual(pixPadrao.chave_pix, 'cpf-antigo');
assert.strictEqual(pixPadrao.alterado_na_jornada, false);
assert.throws(() => __test.pagamentoDoTituloDaJornada({
  chave_pix_titulo: 'chave-nova', favorecido_pix_nome: 'Outro'
}, { chave_pix: 'cpf-antigo' }, 'Colaborador'), /CPF valido/);
const pixNovo = __test.pagamentoDoTituloDaJornada({
  chave_pix_titulo: 'chave-nova', favorecido_pix_nome: 'Outro', favorecido_pix_cpf: '529.982.247-25'
}, { chave_pix: 'cpf-antigo' }, 'Colaborador');
assert.deepStrictEqual(pixNovo, {
  chave_pix: 'chave-nova', favorecido_nome: 'Outro', favorecido_cpf: '52998224725',
  alterado_na_jornada: true
});

const raiz = path.resolve(__dirname, '..', '..');
const migration = fs.readFileSync(
  path.join(raiz, 'backend/migrations/202609070052_rh_jornada_periodos_edicao.js'),
  'utf8'
);
assert(!/\b(?:INSERT|UPDATE|DELETE)\s+/i.test(migration), 'A migration nao pode gravar dados funcionais.');

const tela = fs.readFileSync(path.join(raiz, 'frontend/src/pages/RhDpJornada.jsx'), 'utf8');
assert(tela.includes("rotulo: 'Obra *'"), 'O seletor de obra precisa permanecer visivel.');
assert(!tela.includes("rotulo: 'Periodicidade *'"), 'A periodicidade nao deve ser pedida ao usuario.');
assert(tela.includes('Selecionar dias'), 'A diaria precisa permitir selecionar datas por colaborador.');
assert(tela.includes('Solicitar retorno'), 'A obra precisa conseguir solicitar o retorno da jornada.');
assert(tela.includes('chave_pix_titulo') && tela.includes('favorecido_pix_cpf'),
  'A tela precisa permitir indicar PIX e beneficiario por titulo.');
const cabecalhos = planilhaTest.COLUNAS.map((coluna) => coluna.header);
for (const coluna of ['Pagamento', 'Servico_Executado', 'Valor_Empreitada', 'Acrescimos',
  'Decimo_Terceiro', 'Descontos', 'Chave_PIX_Titulo', 'Beneficiario_PIX', 'CPF_Beneficiario_PIX']) {
  assert(cabecalhos.includes(coluna), `A planilha nao contem ${coluna}.`);
}
assert(!cabecalhos.includes('Adicional_Noturno') && !cabecalhos.includes('Valor_Informado'),
  'A planilha nao deve expor colunas que nao estao no formulario.');

console.log('Validacao de periodos e autorizacao de edicao da jornada concluida com sucesso.');
