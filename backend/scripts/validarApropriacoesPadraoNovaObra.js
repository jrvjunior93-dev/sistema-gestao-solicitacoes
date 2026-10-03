'use strict';

const assert = require('assert');
const models = require('../src/models');
const {
  TIPOS_APROPRIACAO_AUTOMATICA,
  garantirApropriacoesPadraoNovaObra,
  listarPadroesNovaObra
} = require('../src/services/obraTipoApropriacaoPadraoService');
const { normalizeTipoSolicitacaoBehavior } = require('../src/services/tipoSolicitacaoBehaviorService');
const ObraTipoApropriacaoController = require('../src/controllers/ObraTipoApropriacaoController');

const metodosOriginais = {
  tiposFindAll: models.TipoSolicitacao.findAll,
  obraFindAll: models.Obra.findAll,
  vinculoFindOne: models.ObraTipoApropriacaoPadrao.findOne,
  vinculoFindAll: models.ObraTipoApropriacaoPadrao.findAll,
  vinculoCreate: models.ObraTipoApropriacaoPadrao.create,
  apropriacaoFindAll: models.Apropriacao.findAll,
  apropriacaoCreate: models.Apropriacao.create
};

async function main() {
  const padroes = listarPadroesNovaObra();
  assert.deepStrictEqual(
    padroes.map(({ codigo, descricao }) => ({ codigo, descricao })),
    [
      { codigo: '1', descricao: 'ADM LOCAL DE OBRA' },
      { codigo: '2', descricao: 'LOCAÇÃO DE MAQ. e EQ.' },
      { codigo: '3', descricao: 'PRÉ-OBRA' }
    ]
  );
  assert.deepStrictEqual(
    [...TIPOS_APROPRIACAO_AUTOMATICA],
    ['ADM_LOCAL_DE_OBRA', 'LOCACAO_DE_MAQ_EQ', 'PRE_OBRA']
  );
  assert.strictEqual(
    normalizeTipoSolicitacaoBehavior({
      codigo_interno: 'PRE_OBRA',
      nome: 'PRÉ-OBRA',
      comportamento: { usa_apropriacao_automatica_obra: false }
    }).usa_apropriacao_automatica_obra,
    true,
    'O comportamento configurado nao pode desligar o vinculo obrigatorio de PRE_OBRA.'
  );

  const apropriacoesCriadas = [];
  const vinculosCriados = [];

  models.TipoSolicitacao.findAll = async () => [
    { id: 101, nome: 'ADM LOCAL DE OBRA', codigo_interno: 'ADM_LOCAL_DE_OBRA' },
    { id: 102, nome: 'LOCAÇÃO DE MAQ. EQ.', codigo_interno: 'LOCACAO_DE_MAQ_EQ' },
    { id: 103, nome: 'PRÉ-OBRA', codigo_interno: 'PRE_OBRA' }
  ];
  models.ObraTipoApropriacaoPadrao.findOne = async () => null;
  models.ObraTipoApropriacaoPadrao.create = async (payload) => {
    vinculosCriados.push({ ...payload });
    return { id: vinculosCriados.length, ...payload };
  };
  models.Apropriacao.findAll = async () => [];
  models.Apropriacao.create = async (payload) => {
    const criada = { id: 200 + apropriacoesCriadas.length + 1, ...payload };
    apropriacoesCriadas.push(criada);
    return criada;
  };

  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const obra = { id: 55, codigo: 'OB-55', nome: 'Obra teste', tipo_centro_custo: 'OBRA' };
  const resultados = await garantirApropriacoesPadraoNovaObra({
    obra,
    usuarioId: 7,
    transaction
  });

  assert.deepStrictEqual(apropriacoesCriadas.map((item) => item.codigo), ['1', '2', '3']);
  assert.deepStrictEqual(
    apropriacoesCriadas.map((item) => item.descricao),
    ['ADM LOCAL DE OBRA', 'LOCAÇÃO DE MAQ. e EQ.', 'PRÉ-OBRA']
  );
  assert.ok(apropriacoesCriadas.every((item) => (
    item.obra_id === obra.id
      && item.valor_orcado === 0
      && item.somadora === false
      && item.apropriacao_pai_id === null
      && item.ativo === true
  )));
  assert.strictEqual(vinculosCriados.length, 3, 'As tres apropriacoes devem receber vinculo automatico.');
  assert.deepStrictEqual(vinculosCriados.map((item) => item.tipo_solicitacao_id), [101, 102, 103]);
  assert.strictEqual(resultados.length, 3);
  assert.strictEqual(resultados.find((item) => item.apropriacao.codigo === '3').tipo.codigo_interno, 'PRE_OBRA');

  models.Obra.findAll = async () => [obra];
  models.ObraTipoApropriacaoPadrao.findAll = async () => [{
    obra_id: obra.id,
    tipo_solicitacao_id: 103,
    apropriacao_id: apropriacoesCriadas[2].id,
    apropriacao: apropriacoesCriadas[2]
  }];

  let payloadConfiguracao = null;
  await ObraTipoApropriacaoController.index({}, {
    json(payload) {
      payloadConfiguracao = payload;
      return payload;
    },
    status(statusCode) {
      throw new Error(`A tela de configuracao respondeu com status ${statusCode}.`);
    }
  });
  const tipoPreObra = payloadConfiguracao.tipos.find((item) => item.codigo_interno === 'PRE_OBRA');
  assert.ok(tipoPreObra, 'PRE_OBRA precisa aparecer na configuracao de apropriacao por obra.');
  assert.strictEqual(tipoPreObra.apropriacao_automatica_obra, true);
  assert.strictEqual(
    payloadConfiguracao.obras[0].vinculos[String(tipoPreObra.id)].apropriacao_id,
    apropriacoesCriadas[2].id,
    'A configuracao precisa exibir a apropriacao vinculada a PRE_OBRA para cada obra.'
  );

  const centroCusto = await garantirApropriacoesPadraoNovaObra({
    obra: { id: 56, tipo_centro_custo: 'CENTRO_CUSTO' },
    usuarioId: 7,
    transaction
  });
  assert.deepStrictEqual(centroCusto, []);

  console.log('Apropriacoes padrao de nova obra validadas: 1, 2 e 3; tres vinculos de tipo criados.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    models.TipoSolicitacao.findAll = metodosOriginais.tiposFindAll;
    models.Obra.findAll = metodosOriginais.obraFindAll;
    models.ObraTipoApropriacaoPadrao.findOne = metodosOriginais.vinculoFindOne;
    models.ObraTipoApropriacaoPadrao.findAll = metodosOriginais.vinculoFindAll;
    models.ObraTipoApropriacaoPadrao.create = metodosOriginais.vinculoCreate;
    models.Apropriacao.findAll = metodosOriginais.apropriacaoFindAll;
    models.Apropriacao.create = metodosOriginais.apropriacaoCreate;
  });
