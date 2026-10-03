'use strict';

// Fase 5 (29/09) — saldo provavel da medicao prevista, regra "A + B":
// A) previsto de meses anteriores sem medicao aprovada registrada vira
//    saldo_provavel (so aviso; saldo_disponivel continua o teto que bloqueia).
// B) ao registrar a medicao aprovada de M, a previsao de M+1 acima do novo
//    saldo disponivel aparece em ajuste_previsao e pode ser reduzida.
// Usa um banco em memoria que entende os filtros usados pelo servico.

const assert = require('assert');
const { Op } = require('sequelize');
const {
  ajustarPrevisaoAoSaldo,
  consolidarMedicao,
  obterPlanejamento,
  pesquisarItensPlano,
  salvarRecebiveis
} = require('../services/planejamentoService');

function matches(row, where) {
  if (!where) return true;
  return Reflect.ownKeys(where).every((key) => {
    const condition = where[key];
    if (key === Op.or) return condition.some((item) => matches(row, item));
    const value = row[key];
    if (condition && typeof condition === 'object' && !(condition instanceof Date) && !Array.isArray(condition)) {
      return Reflect.ownKeys(condition).every((operator) => {
        const target = condition[operator];
        if (operator === Op.in) return target.map(String).includes(String(value));
        if (operator === Op.ne) return target === null ? value != null : String(value) !== String(target);
        if (operator === Op.lt) return value < target;
        if (operator === Op.gt) return value > target;
        if (operator === Op.gte) return value >= target;
        if (operator === Op.like) return true;
        throw new Error(`Operador nao suportado no banco em memoria: ${String(operator)}`);
      });
    }
    if (condition === null) return value == null;
    return String(value) === String(condition);
  });
}

let clock = 0;

function fakeModel(initial = []) {
  const rows = [];
  let nextId = 5000;
  const wrap = (data) => {
    const row = { ...data };
    Object.defineProperty(row, 'update', {
      enumerable: false,
      value: async (values) => Object.assign(row, values)
    });
    Object.defineProperty(row, 'toJSON', {
      enumerable: false,
      value: () => ({ ...row })
    });
    return row;
  };
  const insert = (data) => {
    const row = wrap({ id: nextId++, criado_em: ++clock, ...data });
    rows.push(row);
    return row;
  };
  initial.forEach((item) => rows.push(wrap(item)));
  const select = ({ where, order } = {}) => {
    const found = rows.filter((row) => matches(row, where));
    const [field, direction] = Array.isArray(order?.[0]) ? order[0] : [];
    if (field) {
      found.sort((a, b) => {
        const diff = a[field] > b[field] ? 1 : (a[field] < b[field] ? -1 : 0);
        return String(direction).toUpperCase() === 'DESC' ? -diff : diff;
      });
    }
    return found;
  };
  return {
    rows,
    findAll: async (query = {}) => select(query),
    findOne: async (query = {}) => select(query)[0] || null,
    findByPk: async (id) => rows.find((row) => Number(row.id) === Number(id)) || null,
    findAndCountAll: async (query = {}) => {
      const found = select(query);
      const offset = query.offset || 0;
      return { rows: found.slice(offset, offset + (query.limit || found.length)), count: found.length };
    },
    create: async (data) => insert(data),
    bulkCreate: async (list) => list.map(insert),
    destroy: async ({ where } = {}) => {
      let removed = 0;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (matches(rows[index], where)) {
          rows.splice(index, 1);
          removed += 1;
        }
      }
      return removed;
    }
  };
}

/*
  Cenario base (obra publica 7, planilha v1 id 2 e v2 id 3):
  - 2026-05 (v1): previsto 1 do item 01.01 (id 51), SEM aprovada -> pendente.
  - 2026-06 (v1): aprovada 2 do item 01.01 (id 51) -> registrada.
  - 2026-07 (v2): previsto 3 do item 01.01 (id 101), SEM aprovada -> pendente.
  - 2026-08 (v2): previsto 4 do item 01.01, marcado "sem medicao" -> registrada.
  - 2026-09 (v2): mes em planejamento.
  01.01 orcado 10: aprovado 2, saldo disponivel 8, pendente 1 + 3 = 4
  (2026-05 e 2026-07, somado pelo codigo), saldo provavel 4.
*/
function cenario() {
  clock = 0;
  const models = {
    Obra: fakeModel([{ id: 7, codigo: 'OB-7', nome: 'Escola', classificacao: 'PUBLICA' }]),
    CrPlanoObra: fakeModel([
      { id: 2, obra_id: 7, versao: 1, situacao: 'SUBSTITUIDA', total_micro: 0 },
      { id: 3, obra_id: 7, versao: 2, situacao: 'PUBLICADA', total_micro: 0 }
    ]),
    CrPlanoItem: fakeModel([
      { id: 51, plano_id: 2, codigo: '01.01', descricao: 'Escavacao', unidade: 'm3', somadora: false, etapa_macro_codigo: '01', quantidade: 10, custo_unitario: 100, valor_total: 1000, ordem: 2 },
      { id: 100, plano_id: 3, codigo: '01', descricao: 'Terraplenagem', somadora: true, etapa_macro_codigo: null, quantidade: 0, custo_unitario: 0, valor_total: 0, ordem: 1 },
      { id: 101, plano_id: 3, codigo: '01.01', descricao: 'Escavacao', unidade: 'm3', somadora: false, etapa_macro_codigo: '01', quantidade: 10, custo_unitario: 100, valor_total: 1000, ordem: 2 },
      { id: 102, plano_id: 3, codigo: '01.02', descricao: 'Aterro', unidade: 'm3', somadora: false, etapa_macro_codigo: '01', quantidade: 20, custo_unitario: 50, valor_total: 1000, ordem: 3 },
      { id: 103, plano_id: 3, codigo: '01.03', descricao: 'Compactacao', unidade: 'm2', somadora: false, etapa_macro_codigo: '01', quantidade: 5, custo_unitario: 10, valor_total: 50, ordem: 4 }
    ]),
    CrCompetencia: fakeModel([
      { id: 50, obra_id: 7, competencia: '2026-05', estado: 'FINALIZADA', plano_versao_snapshot: 1, total_receita_prevista: 100 },
      { id: 60, obra_id: 7, competencia: '2026-06', estado: 'FINALIZADA', plano_versao_snapshot: 1, total_receita_prevista: 0 },
      { id: 70, obra_id: 7, competencia: '2026-07', estado: 'FINALIZADA', plano_versao_snapshot: 2, total_receita_prevista: 300 },
      { id: 80, obra_id: 7, competencia: '2026-08', estado: 'FINALIZADA', plano_versao_snapshot: 2, total_receita_prevista: 400 },
      { id: 90, obra_id: 7, competencia: '2026-09', estado: 'ABERTA', plano_versao_snapshot: 2, total_receita_prevista: 0 }
    ]),
    CrPrevisaoReceita: fakeModel([
      { id: 1, competencia_id: 50, origem: 'MEDICAO', plano_item_id: 51, quantidade_prevista: 1, valor_previsto: 100 },
      { id: 2, competencia_id: 70, origem: 'MEDICAO', plano_item_id: 101, quantidade_prevista: 3, valor_previsto: 300 },
      { id: 3, competencia_id: 80, origem: 'MEDICAO', plano_item_id: 101, quantidade_prevista: 4, valor_previsto: 400 }
    ]),
    CrMedicaoConsolidada: fakeModel([
      { id: 1, competencia_id: 60, plano_item_id: 51, quantidade_medida: 2, valor_medido: 200, valor_glosa: 0 }
    ]),
    CrMedicaoSemRegistro: fakeModel([
      { id: 1, competencia_id: 80, justificativa: 'Fiscal nao mediu neste mes.', registrado_por: 1, registrado_em: new Date() }
    ]),
    CrPrevisaoCusto: fakeModel([]),
    CrReabertura: fakeModel([]),
    CrAuditoria: fakeModel([]),
    User: fakeModel([])
  };
  const overrides = {
    ...models,
    sequelize: { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }) },
    resolverEscopoObras: async () => ({ todas: true, obraIds: null }),
    carregarContextoPrazos: async () => new Map(),
    competenciasLiberadasObra: async () => ['2026-09', '2026-10']
  };
  return { models, overrides };
}

async function validarPendenteEExposicao() {
  const { models, overrides } = cenario();
  const search = await pesquisarItensPlano({ id: 1 }, 7, { competencia: '2026-09' }, overrides);
  const escavacao = search.items.find((item) => item.codigo === '01.01');
  assert.strictEqual(escavacao.quantidade_aprovada_anterior, 2);
  // Pendente somado por codigo atravessando versoes (v1 em 2026-05, v2 em
  // 2026-07); 2026-08 marcado "sem medicao" conta como registrado.
  assert.strictEqual(escavacao.quantidade_prevista_pendente, 4);
  assert.deepStrictEqual(escavacao.competencias_pendentes, ['2026-05', '2026-07']);
  assert.strictEqual(escavacao.saldo_disponivel, 8);
  assert.strictEqual(escavacao.saldo_provavel, 4);
  const aterro = search.items.find((item) => item.codigo === '01.02');
  assert.strictEqual(aterro.quantidade_prevista_pendente, 0);
  assert.deepStrictEqual(aterro.competencias_pendentes, []);
  assert.strictEqual(aterro.saldo_provavel, 20);

  // Sem o "sem medicao", 2026-08 volta a ser pendente.
  models.CrMedicaoSemRegistro.rows.splice(0);
  const semRegistro = await pesquisarItensPlano({ id: 1 }, 7, { competencia: '2026-09' }, overrides);
  const pendenteMaior = semRegistro.items.find((item) => item.codigo === '01.01');
  assert.strictEqual(pendenteMaior.quantidade_prevista_pendente, 8);
  assert.deepStrictEqual(pendenteMaior.competencias_pendentes, ['2026-05', '2026-07', '2026-08']);
  assert.strictEqual(pendenteMaior.saldo_provavel, 0);
  assert.strictEqual(pendenteMaior.saldo_disponivel, 8);

  // Mes com medicao aprovada registrada nao entra no pendente.
  models.CrMedicaoConsolidada.rows.push({ id: 9, competencia_id: 70, plano_item_id: 101, quantidade_medida: 0, valor_medido: 0, valor_glosa: 0 });
  const comAprovada = await pesquisarItensPlano({ id: 1 }, 7, { competencia: '2026-09' }, overrides);
  assert.deepStrictEqual(
    comAprovada.items.find((item) => item.codigo === '01.01').competencias_pendentes,
    ['2026-05', '2026-08']
  );
}

async function validarAvisoETeto() {
  const { models, overrides } = cenario();
  // Acima do saldo provavel (4) e dentro do disponivel (8): salva e avisa.
  const salvo = await salvarRecebiveis({ id: 1 }, 7, '2026-09', {
    itens: [{ plano_item_id: 101, quantidade_prevista: 6 }, { plano_item_id: 102, quantidade_prevista: 2 }]
  }, overrides);
  assert.strictEqual(salvo.total, 700);
  assert.strictEqual(salvo.avisos.length, 1);
  const [aviso] = salvo.avisos;
  assert.deepStrictEqual(
    { ...aviso, mensagem: undefined },
    {
      plano_item_id: 101,
      codigo: '01.01',
      quantidade: 6,
      saldo_provavel: 4,
      competencias_pendentes: ['2026-05', '2026-07'],
      mensagem: undefined
    }
  );
  assert(aviso.mensagem.includes('saldo provavel 4'));
  assert.strictEqual(
    models.CrPrevisaoReceita.rows.filter((row) => row.competencia_id === 90).length,
    2,
    'Aviso nao pode bloquear a gravacao.'
  );
  // Dentro do saldo provavel: sem aviso.
  const semAviso = await salvarRecebiveis({ id: 1 }, 7, '2026-09', {
    itens: [{ plano_item_id: 101, quantidade_prevista: 4 }]
  }, overrides);
  assert.deepStrictEqual(semAviso.avisos, []);
  // Acima do saldo disponivel (8): continua bloqueado.
  await assert.rejects(
    () => salvarRecebiveis({ id: 1 }, 7, '2026-09', {
      itens: [{ plano_item_id: 101, quantidade_prevista: 9 }]
    }, overrides),
    (error) => error?.code === 'CR_MEDICAO_SUPERA_ORCAMENTO'
  );

  const planejamento = await obterPlanejamento({ id: 1 }, 7, '2026-09', overrides);
  const item = planejamento.recebiveis[0].item;
  assert.strictEqual(item.saldo_disponivel, 8);
  assert.strictEqual(item.quantidade_prevista_pendente, 4);
  assert.strictEqual(item.saldo_provavel, 4);
  assert.deepStrictEqual(item.competencias_pendentes, ['2026-05', '2026-07']);
  assert.strictEqual(planejamento.ajuste_previsao_pendente, null);
}

async function validarAjusteAposMedicaoAprovada() {
  const { models, overrides } = cenario();
  await salvarRecebiveis({ id: 1 }, 7, '2026-09', {
    itens: [{ plano_item_id: 101, quantidade_prevista: 6 }, { plano_item_id: 102, quantidade_prevista: 2 }]
  }, overrides);
  const setembro = models.CrCompetencia.rows.find((row) => row.id === 90);
  assert.strictEqual(setembro.total_receita_prevista, 700);

  // Aprovada de agosto = 1: aprovado 3, saldo de setembro 7 >= 6 -> sem ajuste.
  const cabe = await consolidarMedicao({ id: 1 }, 7, '2026-08', {
    idempotency_key: 'med-ago-1',
    justificativa_glosa_geral: 'Fiscal aprovou menos que o previsto.',
    itens: [{ plano_item_id: 101, quantidade_medida: 1 }]
  }, overrides);
  assert.strictEqual(cabe.ajuste_previsao, null);

  // Aprovada de agosto = 3: aprovado 5, saldo 5 < 6 previsto -> ajuste.
  const excede = await consolidarMedicao({ id: 1 }, 7, '2026-08', {
    idempotency_key: 'med-ago-2',
    justificativa_glosa_geral: 'Fiscal aprovou menos que o previsto.',
    itens: [{ plano_item_id: 101, quantidade_medida: 3 }]
  }, overrides);
  const esperado = {
    competencia: '2026-09',
    itens: [{
      plano_item_id: 101,
      codigo: '01.01',
      descricao: 'Escavacao',
      unidade: 'm3',
      quantidade_prevista: 6,
      saldo_disponivel: 5,
      quantidade_sugerida: 5
    }]
  };
  assert.deepStrictEqual(excede.ajuste_previsao, esperado);
  // Repeticao idempotente da medicao devolve o mesmo aviso.
  const repetida = await consolidarMedicao({ id: 1 }, 7, '2026-08', {
    idempotency_key: 'med-ago-2',
    itens: [{ plano_item_id: 101, quantidade_medida: 3 }]
  }, overrides);
  assert.strictEqual(repetida.idempotente, true);
  assert.deepStrictEqual(repetida.ajuste_previsao, esperado);

  const planejamento = await obterPlanejamento({ id: 1 }, 7, '2026-09', overrides);
  assert.deepStrictEqual(planejamento.ajuste_previsao_pendente, esperado);

  // Mes seguinte FINALIZADO continua ajustavel, sem reabertura.
  setembro.estado = 'FINALIZADA';
  await assert.rejects(
    () => ajustarPrevisaoAoSaldo({ id: 1 }, 7, '2026-09', { plano_item_ids: [101] }, '', overrides),
    (error) => error?.code === 'CR_IDEMPOTENCY_REQUIRED'
  );
  await assert.rejects(
    () => ajustarPrevisaoAoSaldo({ id: 1 }, 7, '2026-09', { plano_item_ids: [] }, 'aj-0', overrides),
    (error) => error?.code === 'CR_AJUSTE_ITENS_INVALIDOS'
  );
  const ajuste = await ajustarPrevisaoAoSaldo(
    { id: 9 }, 7, '2026-09', { plano_item_ids: [101, 102] }, 'aj-1', overrides
  );
  assert.strictEqual(ajuste.idempotente, false);
  assert.deepStrictEqual(ajuste.ignorados, [102]);
  assert.strictEqual(ajuste.ajustados.length, 1);
  assert.deepStrictEqual(ajuste.ajustados[0].antes, { quantidade_prevista: 6, valor_previsto: 600 });
  assert.deepStrictEqual(ajuste.ajustados[0].depois, { quantidade_prevista: 5, valor_previsto: 500 });
  const linha = models.CrPrevisaoReceita.rows.find((row) => row.competencia_id === 90 && row.plano_item_id === 101);
  assert.strictEqual(linha.quantidade_prevista, 5);
  assert.strictEqual(setembro.total_receita_prevista, 600, 'Totais da competencia recalculados.');
  assert.strictEqual(setembro.estado, 'FINALIZADA', 'Ajuste nao reabre nem muda o estado do mes.');
  const auditorias = models.CrAuditoria.rows.filter((row) => row.evento === 'CR_PREVISAO_AJUSTADA_SALDO');
  assert.strictEqual(auditorias.length, 1);
  assert.strictEqual(auditorias[0].usuario_id, 9);
  assert.strictEqual(auditorias[0].competencia_id, 90);
  assert.strictEqual(auditorias[0].payload_json.idempotency_key, 'aj-1');
  assert.deepStrictEqual(auditorias[0].payload_json.ajustados[0].antes.quantidade_prevista, 6);
  assert.deepStrictEqual(auditorias[0].payload_json.ajustados[0].depois.quantidade_prevista, 5);
  assert.deepStrictEqual(auditorias[0].payload_json.total_receita_prevista, { antes: 700, depois: 600 });

  // Mesma chave: idempotente, sem nova escrita.
  const repetido = await ajustarPrevisaoAoSaldo(
    { id: 9 }, 7, '2026-09', { plano_item_ids: [101, 102] }, 'aj-1', overrides
  );
  assert.strictEqual(repetido.idempotente, true);
  assert.deepStrictEqual(repetido.ajustados, ajuste.ajustados);
  assert.strictEqual(models.CrAuditoria.rows.filter((row) => row.evento === 'CR_PREVISAO_AJUSTADA_SALDO').length, 1);

  // Nunca aumenta: com o saldo maior que a previsao nada muda.
  models.CrMedicaoConsolidada.rows
    .filter((row) => row.competencia_id === 80)
    .forEach((row) => { row.quantidade_medida = 0; });
  const nada = await ajustarPrevisaoAoSaldo(
    { id: 9 }, 7, '2026-09', { plano_item_ids: [101] }, 'aj-2', overrides
  );
  assert.deepStrictEqual(nada.ajustados, []);
  assert.strictEqual(linha.quantidade_prevista, 5);
  const semPendencia = await obterPlanejamento({ id: 1 }, 7, '2026-09', overrides);
  assert.strictEqual(semPendencia.ajuste_previsao_pendente, null);
}

function validarContratoDaRota() {
  const fs = require('fs');
  const path = require('path');
  const routes = fs.readFileSync(path.resolve(__dirname, '../routes/index.js'), 'utf8');
  const controller = fs.readFileSync(path.resolve(__dirname, '../controllers/CustosRecebiveisController.js'), 'utf8');
  const bloco = routes.slice(routes.indexOf("'/obras/:obraId/competencias/:competencia/previsao/ajustar-saldo'"));
  assert.ok(routes.includes("'/obras/:obraId/competencias/:competencia/previsao/ajustar-saldo'"));
  assert.ok(bloco.slice(0, 400).includes('MEDICAO_CONSOLIDATE') && bloco.slice(0, 400).includes('PLANEJAMENTO_RECEIVABLES'));
  assert.ok(bloco.slice(0, 400).includes('requireCustosRecebiveisObraScope()'));
  assert.ok(controller.includes('static async ajustarPrevisaoAoSaldo'));
  assert.ok(controller.includes("req.get('Idempotency-Key')"));
}

async function run() {
  validarContratoDaRota();
  await validarPendenteEExposicao();
  await validarAvisoETeto();
  await validarAjusteAposMedicaoAprovada();
  console.log('Saldo provavel (Fase 5) de Custos e Recebiveis validado com sucesso.');
}

module.exports = { fakeModel, matches };

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
