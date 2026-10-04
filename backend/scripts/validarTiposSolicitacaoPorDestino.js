const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  resolverCamposNovaSolicitacao
} = require('../src/services/novaSolicitacaoCamposConfig');
const {
  obterAreasConfiguracaoCamposDestino
} = require('../src/services/tipoSolicitacaoDisponibilidadeService');
const {
  obterAreasConfiguracaoCamposDestinoInicial
} = require('../src/services/novaSolicitacaoDestinoService');

function ler(...partes) {
  return fs.readFileSync(path.join(__dirname, '..', ...partes), 'utf8');
}

const migration = ler('migrations', '202609070051_tipos_solicitacao_por_destino.js');
const disponibilidade = ler('src', 'services', 'tipoSolicitacaoDisponibilidadeService.js');
const destinoInicial = ler('src', 'services', 'novaSolicitacaoDestinoService.js');
const solicitacoes = ler('src', 'controllers', 'SolicitacaoController.js');
const compras = ler('src', 'controllers', 'SolicitacaoCompraController.js');
const contratos = ler('src', 'services', 'contratoFluxoNovoService.js');
const subtipos = ler('src', 'controllers', 'TipoSubContratoController.js');
const subtipoMigration = ler('migrations', '202609240004_subtipos_multiplos_tipos_solicitacao.js');
const telaDestino = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'TiposSolicitacaoPorDestino.jsx'),
  'utf8'
);
const telaSubtipos = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'TiposSubContrato.jsx'),
  'utf8'
);
const novaSolicitacao = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'NovaSolicitacao.jsx'),
  'utf8'
);

assert(
  !/\b(?:bulkInsert|bulkUpdate|INSERT\s+INTO|UPDATE\s+tipo_solicitacao)\b/i.test(migration),
  'A migration deve ser exclusivamente estrutural.'
);
assert(migration.includes("addColumn('tipo_solicitacao', 'disponivel_para_obras'"));
assert(migration.includes("createTable('centro_custo_tipos_solicitacao'"));
assert(disponibilidade.includes('isObraCentroCusto(destino.tipo_centro_custo)'));
assert(disponibilidade.includes('CentroCustoTipoSolicitacao.findOne'));
assert(
  disponibilidade.includes("codigosAlternativos: ['DESPESAS_DE_MARKETING']"),
  'O tipo automatico de Marketing deve reutilizar o cadastro legado no plural.'
);
assert(destinoInicial.includes("findSetorByCapability('eh_setor_geo'"));
assert(solicitacoes.includes('resolverDestinoInicialNovaSolicitacao()'));
assert(solicitacoes.includes('assertTipoDisponivelNoDestino(obraSelecionada, tipoSelecionado)'));
assert(contratos.includes('resolverDestinoInicialNovaSolicitacao()'));
assert(contratos.includes('assertTipoDisponivelNoDestino(obraSelecionada, tipoMacro)'));
assert(compras.includes('assertTipoDisponivelNoDestino(obra, tipoSolicitacao, { transaction })'));
assert(!novaSolicitacao.includes('name="area_responsavel"'), 'A tela nao deve permitir escolher o setor inicial.');
assert(novaSolicitacao.includes('getTiposSolicitacaoDisponiveis(form.obra_id)'));
assert(novaSolicitacao.includes('area_responsavel: undefined'));
assert(
  novaSolicitacao.includes('areasConfiguracaoCampos'),
  'A Nova Solicitacao deve resolver campos pelo Centro de Custo automatico antes do destino operacional.'
);
assert(telaDestino.includes("rotulo: 'Criar tipo'"), 'A configuração por destino deve oferecer cadastro rápido de tipo.');
assert(telaDestino.includes('criarTipoSolicitacao({'), 'O atalho deve criar um tipo global reutilizável.');
assert(subtipoMigration.includes('tipos_sub_contrato_tipos_solicitacao'), 'A relação muitos-para-muitos de subtipos deve possuir migration.');
assert(subtipos.includes('setTiposSolicitacao'), 'O backend deve sincronizar todos os Tipos de Solicitação do subtipo.');
assert(telaSubtipos.includes('tipo_solicitacao_ids'), 'A tela deve enviar múltiplos Tipos de Solicitação por subtipo.');

const tipoAutomaticoId = 999;
const configCampos = {
  regras: {
    GERENCIA_PROCESSOS: {
      tipos: {
        [tipoAutomaticoId]: {
          campos: {
            forma_pagamento: { visivel: true, obrigatorio: true }
          }
        }
      }
    },
    GEO: {
      tipos: {
        [tipoAutomaticoId]: {
          campos: {
            forma_pagamento: { visivel: false, obrigatorio: false }
          }
        }
      }
    }
  }
};
const camposMarketing = resolverCamposNovaSolicitacao({}, configCampos, tipoAutomaticoId, {
  areaResponsavel: ['MARKETING', 'GERENCIA_PROCESSOS', 'GERENCIA DE PROCESSOS', 'GEO']
});
assert.strictEqual(camposMarketing.forma_pagamento.visivel, true);
assert.strictEqual(camposMarketing.forma_pagamento.obrigatorio, true);
assert.deepStrictEqual(
  obterAreasConfiguracaoCamposDestino({ codigo: '111', nome: 'MARKETING', tipo_centro_custo: 'CENTRO_CUSTO' }),
  ['MARKETING']
);
const centroAdministrativo = {
  codigo: '1', nome: 'ADMINISTRATIVO ESCRITORIO', tipo_centro_custo: 'CENTRO_CUSTO'
};
assert.deepStrictEqual(
  obterAreasConfiguracaoCamposDestino(centroAdministrativo),
  [],
  'Despesa Administrativa nao deve herdar uma regra de campos do nome do Centro de Custo.'
);
assert.deepStrictEqual(
  obterAreasConfiguracaoCamposDestino({
    codigo: '42', nome: 'DIRETORIA', tipo_centro_custo: 'CENTRO_CUSTO'
  }),
  [],
  'Um outro Centro de Custo vinculado ao tipo tambem usa a regra do setor de destino.'
);
const configAdministrativa = {
  regras: {
    ADMINISTRATIVO: {
      tipos: {
        [tipoAutomaticoId]: { campos: { forma_pagamento: { visivel: false, obrigatorio: false } } }
      }
    },
    GEO: {
      tipos: {
        [tipoAutomaticoId]: { campos: { forma_pagamento: { visivel: true, obrigatorio: true } } },
        [`${tipoAutomaticoId}:23`]: { campos: { forma_pagamento: { visivel: false, obrigatorio: false } } }
      }
    }
  }
};
const areasAdministrativas = [
  ...obterAreasConfiguracaoCamposDestino(centroAdministrativo),
  ...obterAreasConfiguracaoCamposDestinoInicial({
    setor: { codigo: 'GEO', nome: 'GERENCIA DE PROCESSOS' },
    areaResponsavel: 'GEO'
  })
];
assert.strictEqual(
  resolverCamposNovaSolicitacao({}, configAdministrativa, tipoAutomaticoId, {
    areaResponsavel: areasAdministrativas
  }).forma_pagamento.obrigatorio,
  true,
  'A regra do tipo em GEO deve valer mesmo para o Centro de Custo Administrativo.'
);
assert.strictEqual(
  resolverCamposNovaSolicitacao({}, configAdministrativa, tipoAutomaticoId, {
    areaResponsavel: areasAdministrativas, tipoSubId: 23
  }).forma_pagamento.visivel,
  false,
  'A regra do subtipo em GEO deve prevalecer em qualquer Centro de Custo.'
);
assert.deepStrictEqual(
  obterAreasConfiguracaoCamposDestinoInicial({
    setor: { codigo: 'GERENCIA_PROCESSOS', nome: 'GERENCIA DE PROCESSOS' },
    areaResponsavel: 'GEO'
  }),
  ['GERENCIA_PROCESSOS', 'GERENCIA DE PROCESSOS', 'GEO']
);

console.log('Catalogo de tipos por Obra/Centro de Custo validado com sucesso.');
