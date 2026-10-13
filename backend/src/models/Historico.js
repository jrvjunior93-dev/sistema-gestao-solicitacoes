module.exports = (sequelize, DataTypes) => {
  const Historico = sequelize.define('Historico', {

    solicitacao_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // PI-16: a qual MEDICAO este registro pertence. Com uma solicitacao por contrato, sem isto
    // os documentos e comentarios de todas as medicoes viram uma pilha unica sem dono. Nulo
    // quando pertence a propria solicitacao (abertura, minuta, contrato assinado) e em toda a
    // trilha legada.
    medicao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    usuario_responsavel_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    setor: {
      type: DataTypes.STRING,
      allowNull: false
    },

    acao: {
      type: DataTypes.STRING,
      allowNull: false
    },

    status_anterior: {
      type: DataTypes.STRING,
      allowNull: true
    },

    status_novo: {
      type: DataTypes.STRING,
      allowNull: true
    },

    observacao: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    descricao: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.TEXT
    }    

  }, {
    tableName: 'historicos',
    timestamps: true
  });

  async function registrarInteracaoAposCommit(linha, options = {}) {
    const service = require('../services/solicitacaoInteracoesService');
    if (!service.tipoInteracao(linha) && linha.acao !== 'ANEXO_REMOVIDO') return;
    const registrar = async () => {
      try { await service.registrarInteracao(linha); }
      catch (error) { console.error('Historico salvo; falha ao registrar interacao pendente:', error); }
    };
    if (options.transaction) options.transaction.afterCommit(registrar);
    else await registrar();
  }
  Historico.addHook('afterCreate', 'interacoesPendentes', registrarInteracaoAposCommit);
  Historico.addHook('afterBulkCreate', 'interacoesPendentes', async (linhas, options) => {
    // individualHooks ja acionou afterCreate: nao duplicar fan-out.
    if (!options.individualHooks) for (const linha of linhas) await registrarInteracaoAposCommit(linha, options);
  });
  return Historico;
};
