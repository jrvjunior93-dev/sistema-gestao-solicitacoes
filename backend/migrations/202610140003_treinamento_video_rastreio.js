'use strict';
const { tableExists, indexExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ queryInterface: qi, sequelize, DataTypes: D }) {
    const timestamps = { createdAt: { type: D.DATE, allowNull: false, defaultValue: D.NOW }, updatedAt: { type: D.DATE, allowNull: false, defaultValue: D.NOW } };
    if (!(await tableExists(sequelize, 'treinamento_video_progressos'))) {
      await qi.createTable('treinamento_video_progressos', {
        id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
        conteudo_id: { type: D.INTEGER, allowNull: false }, usuario_id: { type: D.INTEGER, allowNull: false },
        // Zero = sessao propria; positivo = SUPERADMIN assumindo este usuario.
        ator_id: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
        versao: { type: D.STRING(64), allowNull: false }, titulo: { type: D.STRING(180), allowNull: false },
        duracao: { type: D.DOUBLE, allowNull: true }, segundos: { type: D.DOUBLE, allowNull: false, defaultValue: 0 },
        trechos_json: { type: D.TEXT('long'), allowNull: false }, saltos_json: { type: D.TEXT('long'), allowNull: false },
        saltos: { type: D.INTEGER, allowNull: false, defaultValue: 0 }, pulou_final: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
        sessoes: { type: D.INTEGER, allowNull: false, defaultValue: 0 }, ultima_visualizacao: { type: D.DATE, allowNull: false }, ...timestamps
      });
    }
    if (!(await indexExists(sequelize, 'treinamento_video_progressos', 'uq_treinamento_video_progresso'))) {
      await qi.addIndex('treinamento_video_progressos', ['conteudo_id', 'usuario_id', 'ator_id', 'versao'], { unique: true, name: 'uq_treinamento_video_progresso' });
    }
    if (!(await tableExists(sequelize, 'treinamento_video_sessoes'))) {
      await qi.createTable('treinamento_video_sessoes', {
        id: { type: D.STRING(36), primaryKey: true }, progresso_id: { type: D.INTEGER, allowNull: false },
        sequencia: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
        segundos: { type: D.DOUBLE, allowNull: false, defaultValue: 0 },
        ultimo_pacote_hash: { type: D.STRING(64), allowNull: true },
        ultimo_evento_em: { type: D.DATE, allowNull: false }, ...timestamps
      });
    }
    if (!(await indexExists(sequelize, 'treinamento_video_progressos', 'idx_treinamento_video_ultima'))) {
      await qi.addIndex('treinamento_video_progressos', ['ultima_visualizacao', 'id'], { name: 'idx_treinamento_video_ultima' });
    }
  },
  // Rollback destrutivo apenas com autorizacao explicita e backup do rastreio.
  async down({ queryInterface: qi }) {
    await qi.dropTable('treinamento_video_sessoes');
    await qi.dropTable('treinamento_video_progressos');
  }
};
