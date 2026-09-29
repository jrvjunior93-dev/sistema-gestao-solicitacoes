'use strict';

const assert = require('assert');
const {
  competenciaAlvoPlanejamento,
  competenciasLiberadas,
  janelaPlanejamento,
  prazoMedicaoAprovada,
  resumirPrazosObra
} = require('../services/prazoService');
const { assertEditable } = require('../services/planejamentoService');

const at = (value) => new Date(value);

function validateWindows() {
  const janela = janelaPlanejamento('2026-10');
  assert.strictEqual(janela.abre_em.toISOString(), '2026-09-25T03:00:00.000Z');
  assert.strictEqual(janela.fecha_em.toISOString(), '2026-10-06T02:59:59.999Z');
  // Janeiro abre em 25 de dezembro do ano anterior.
  assert.strictEqual(janelaPlanejamento('2027-01').abre_em.toISOString(), '2026-12-25T03:00:00.000Z');
  // Marco: 1o/03 + 40 dias = 10/04, ate 23:59:59 de Brasilia.
  assert.strictEqual(prazoMedicaoAprovada('2026-03').toISOString(), '2026-04-11T02:59:59.999Z');

  assert.strictEqual(competenciaAlvoPlanejamento(at('2026-09-24T23:59:00-03:00')), '2026-09');
  assert.strictEqual(competenciaAlvoPlanejamento(at('2026-09-25T00:00:00-03:00')), '2026-10');
  assert.strictEqual(competenciaAlvoPlanejamento(at('2026-12-26T10:00:00-03:00')), '2027-01');
}

function validateSummaries() {
  const base = {
    classificacao: 'PUBLICA',
    temPlanoPublicado: true,
    inicio: '2026-09',
    competencias: [
      { competencia: '2026-09', estado: 'FINALIZADA', finalizado_em: '2026-09-03', tem_medicao_aprovada: false }
    ]
  };

  const aberto = resumirPrazosObra({ ...base, now: at('2026-09-29T12:00:00-03:00') });
  assert.strictEqual(aberto.planejamento.situacao, 'ABERTO');
  assert.strictEqual(aberto.planejamento.competencia, '2026-10');
  assert.strictEqual(aberto.planejamento.dias, 6);
  assert.strictEqual(aberto.medicao.situacao, 'ABERTO');
  assert.strictEqual(aberto.medicao.competencia, '2026-09');
  assert.strictEqual(aberto.medicao.dias, 12);
  assert.strictEqual(aberto.travada, false);

  const ultimoInstante = resumirPrazosObra({ ...base, now: at('2026-10-05T23:59:59-03:00') });
  assert.strictEqual(ultimoInstante.planejamento.situacao, 'ABERTO');
  assert.strictEqual(ultimoInstante.planejamento.dias, 0);

  const vencido = resumirPrazosObra({ ...base, now: at('2026-10-07T12:00:00-03:00') });
  assert.strictEqual(vencido.planejamento.situacao, 'VENCIDO');
  assert.strictEqual(vencido.planejamento.dias, 2);

  const emDia = resumirPrazosObra({
    ...base,
    competencias: [
      { competencia: '2026-09', estado: 'FINALIZADA', finalizado_em: 'x', tem_medicao_aprovada: true },
      { competencia: '2026-10', estado: 'REABERTA', finalizado_em: 'x', tem_medicao_aprovada: true }
    ],
    now: at('2026-10-10T12:00:00-03:00')
  });
  assert.strictEqual(emDia.planejamento.situacao, 'AGUARDANDO_JANELA');
  assert.strictEqual(emDia.planejamento.competencia, '2026-11');
  assert.strictEqual(emDia.planejamento.dias, 15);
  assert.strictEqual(emDia.medicao.situacao, 'EM_DIA');
  assert.strictEqual(emDia.medicao.competencia, '2026-11');

  const semEstrutura = resumirPrazosObra({ ...base, temPlanoPublicado: false });
  assert.strictEqual(semEstrutura.planejamento.situacao, 'SEM_ESTRUTURA');

  const privada = resumirPrazosObra({ ...base, classificacao: 'PRIVADA', now: at('2026-09-29T12:00:00-03:00') });
  assert.strictEqual(privada.medicao, null);

  const futura = resumirPrazosObra({ ...base, inicio: '2026-12', competencias: [], now: at('2026-09-29T12:00:00-03:00') });
  assert.strictEqual(futura.planejamento.situacao, 'AGUARDANDO_JANELA');
  assert.strictEqual(futura.planejamento.competencia, '2026-12');
}

function validateReleasedMonths() {
  const now = at('2026-09-29T12:00:00-03:00');
  assert.deepStrictEqual(competenciasLiberadas({
    temPlanoPublicado: true,
    inicio: '2026-08',
    competencias: [{ competencia: '2026-09' }],
    now
  }), ['2026-08', '2026-10']);
  assert.deepStrictEqual(competenciasLiberadas({
    temPlanoPublicado: true,
    competencias: [],
    now: at('2026-09-10T12:00:00-03:00')
  }), ['2026-09']);
  assert.deepStrictEqual(competenciasLiberadas({ temPlanoPublicado: false, now }), []);
  assert.deepStrictEqual(competenciasLiberadas({ temPlanoPublicado: true, inicio: '2026-12', now }), []);
}

async function validateReopenedEditable() {
  const competencia = { id: 7, competencia: '2999-01', estado: 'REABERTA' };
  const withReopening = { CrReabertura: { findOne: async () => ({ id: 1 }) } };
  const withoutReopening = { CrReabertura: { findOne: async () => null } };
  // Reaberta dentro do prazo com reabertura vigente: editavel.
  await assertEditable(competencia, withReopening);
  await assert.rejects(() => assertEditable(competencia, withoutReopening), (error) => error.code === 'CR_REABERTURA_EXPIRADA');
  await assert.rejects(
    () => assertEditable({ ...competencia, estado: 'FINALIZADA' }, withoutReopening),
    (error) => error.code === 'CR_COMPETENCIA_IMUTAVEL'
  );
  await assertEditable({ ...competencia, estado: 'EM_PREENCHIMENTO' }, withoutReopening);
}

async function run() {
  validateWindows();
  validateSummaries();
  validateReleasedMonths();
  await validateReopenedEditable();
  console.log('Prazos de Custos e Recebiveis validados com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
