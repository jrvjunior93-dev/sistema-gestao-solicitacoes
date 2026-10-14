module.exports = (sequelize, D) => sequelize.define('TreinamentoVideoSessao', {
  id: { type: D.STRING(36), primaryKey: true }, progresso_id: { type: D.INTEGER, allowNull: false },
  sequencia: { type: D.INTEGER, allowNull: false, defaultValue: 0 }, ultimo_pacote_hash: D.STRING(64),
  segundos: { type: D.DOUBLE, allowNull: false, defaultValue: 0 },
  ultimo_evento_em: { type: D.DATE, allowNull: false }
}, { tableName: 'treinamento_video_sessoes', timestamps: true });
