module.exports = (sequelize, D) => sequelize.define('TreinamentoVideoProgresso', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  conteudo_id: { type: D.INTEGER, allowNull: false }, usuario_id: { type: D.INTEGER, allowNull: false },
  ator_id: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  versao: { type: D.STRING(64), allowNull: false }, titulo: { type: D.STRING(180), allowNull: false },
  duracao: D.DOUBLE, segundos: { type: D.DOUBLE, allowNull: false, defaultValue: 0 },
  trechos_json: { type: D.TEXT('long'), allowNull: false }, saltos_json: { type: D.TEXT('long'), allowNull: false },
  saltos: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  pulou_final: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
  sessoes: { type: D.INTEGER, allowNull: false, defaultValue: 0 }, ultima_visualizacao: { type: D.DATE, allowNull: false }
}, { tableName: 'treinamento_video_progressos', timestamps: true });
