'use strict';

const assert = require('node:assert/strict');
const { Obra, Setor, Solicitacao, User } = require('../src/models');
const {
  STATUS_CONTRATO,
  sincronizarSolicitacaoDoContrato
} = require('../src/services/contratoFluxoNovoService');

async function executar() {
  const originais = {
    obra: Obra.findByPk,
    setor: Setor.findByPk,
    solicitacao: Solicitacao.findByPk,
    usuario: User.findByPk
  };
  let tipoCentroCusto = 'OBRA';
  let setorAutor = 'GEO';
  let solicitacao;
  try {
    Obra.findByPk = async () => ({ id: 9, tipo_centro_custo: tipoCentroCusto });
    Setor.findByPk = async () => ({ id: 4, codigo: setorAutor });
    User.findByPk = async () => setorAutor ? { id: 3, setor_id: 4 } : null;
    Solicitacao.findByPk = async () => solicitacao;

    const contrato = { id: 7, obra_id: 9, solicitacao_id: 42, status_contrato: STATUS_CONTRATO.ATIVO };
    const transaction = {};
    const novaSolicitacao = (status = 'PENDENTE') => ({
      id: 42,
      criado_por: 3,
      area_responsavel: 'GEO',
      status_global: status,
      setor_destino_pos_aprovacao: null,
      async update(campos) { Object.assign(this, campos); }
    });

    // Aprovacao direta, inclusive depois da aprovacao generica anterior.
    solicitacao = novaSolicitacao('LIBERADO');
    await sincronizarSolicitacaoDoContrato(contrato, transaction);
    assert.equal(solicitacao.area_responsavel, 'OBRA');
    assert.equal(solicitacao.status_global, 'APROVADA');
    assert.equal(solicitacao.transicao.mudouDeSetor, true);
    await sincronizarSolicitacaoDoContrato(contrato, transaction);
    assert.equal(solicitacao.transicao.mudouDeSetor, false);

    // Acima do limite continua indo ao Juridico e, ao tornar-se ativo, volta a OBRA.
    solicitacao = novaSolicitacao();
    contrato.status_contrato = STATUS_CONTRATO.EM_ANALISE_JURIDICA;
    await sincronizarSolicitacaoDoContrato(contrato, transaction);
    assert.equal(solicitacao.area_responsavel, 'JURIDICO');
    assert.equal(solicitacao.setor_destino_pos_aprovacao, 'GEO');
    contrato.status_contrato = STATUS_CONTRATO.ATIVO;
    await sincronizarSolicitacaoDoContrato(contrato, transaction);
    assert.equal(solicitacao.area_responsavel, 'OBRA');
    assert.equal(solicitacao.setor_destino_pos_aprovacao, null);

    // Mesmo sem o autor cadastrado, a obra nao fica parada no GEO.
    setorAutor = null;
    solicitacao = novaSolicitacao();
    await sincronizarSolicitacaoDoContrato(contrato, transaction);
    assert.equal(solicitacao.area_responsavel, 'OBRA');

    // Centros de custo nao recebem a regra nova.
    tipoCentroCusto = 'CENTRO_CUSTO';
    setorAutor = 'GEO';
    solicitacao = novaSolicitacao();
    await sincronizarSolicitacaoDoContrato(contrato, transaction);
    assert.equal(solicitacao.area_responsavel, 'GEO');
  } finally {
    Obra.findByPk = originais.obra;
    Setor.findByPk = originais.setor;
    Solicitacao.findByPk = originais.solicitacao;
    User.findByPk = originais.usuario;
  }

  console.log('Retorno do contrato aprovado a OBRA validado sem acesso ao banco.');
}

executar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
