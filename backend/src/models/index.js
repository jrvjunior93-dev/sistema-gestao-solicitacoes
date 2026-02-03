const Sequelize = require('sequelize');
const sequelize = require('../database');

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

/* =====================
   MODELS
===================== */
db.User = require('./User')(sequelize, Sequelize);
db.Obra = require('./Obra')(sequelize, Sequelize);
db.UsuarioObra = require('./UsuarioObra')(sequelize, Sequelize);
db.Setor = require('./Setor')(sequelize, Sequelize);
db.Solicitacao = require('./Solicitacao')(sequelize, Sequelize);
db.StatusArea = require('./StatusArea')(sequelize, Sequelize);
db.Historico = require('./Historico')(sequelize, Sequelize);
db.Anexo = require('./Anexo')(sequelize, Sequelize);
db.MensagemSetor = require('./MensagemSetor')(sequelize, Sequelize);
db.TipoSolicitacao = require('./TipoSolicitacao')(sequelize, Sequelize);
db.EtapaSetor = require('./EtapaSetor')(sequelize, Sequelize);
db.Cargo = require('./Cargo')(sequelize, Sequelize);
db.Comprovante = require('./Comprovante')(sequelize, Sequelize);
db.Contrato = require('./Contrato')(sequelize, Sequelize);
db.ContratoAnexo = require('./ContratoAnexo')(sequelize, Sequelize);
db.TipoMacroContrato = require('./TipoMacroContrato')(sequelize, Sequelize);
db.TipoSubContrato = require('./TipoSubContrato')(sequelize, Sequelize);
db.SolicitacaoVisibilidadeUsuario =
  require('./SolicitacaoVisibilidadeUsuario')(sequelize, Sequelize);
db.SetorPermissao = require('./SetorPermissao')(sequelize, Sequelize);
db.Notificacao = require('./Notificacao')(sequelize, Sequelize);
db.NotificacaoDestinatario = require('./NotificacaoDestinatario')(sequelize, Sequelize);
db.ConfiguracaoSistema = require('./ConfiguracaoSistema')(sequelize, Sequelize);

  



/* =====================
   RELACIONAMENTOS
===================== */

/* ===== Solicitação x Comprovantes ===== */
db.Solicitacao.hasMany(db.Comprovante, {
  foreignKey: 'solicitacao_id',
  as: 'comprovantes'
});

db.Comprovante.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

db.Comprovante.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});
/* ===== Usuário x Obra (Vínculos) ===== */
db.User.hasMany(db.UsuarioObra, {
  foreignKey: 'user_id',
  as: 'vinculos'
});

db.UsuarioObra.belongsTo(db.User, {
  foreignKey: 'user_id',
  as: 'usuario'
});

db.Obra.hasMany(db.UsuarioObra, {
  foreignKey: 'obra_id',
  as: 'usuarios'
});

db.UsuarioObra.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

/* ===== Obra x Solicitação ===== */
db.Obra.hasMany(db.Solicitacao, {
  foreignKey: 'obra_id',
  as: 'solicitacoes'
});

db.Solicitacao.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

/* ===== Usuário x Solicitação ===== */
db.User.hasMany(db.Solicitacao, {
  foreignKey: 'criado_por',
  as: 'solicitacoes'
});

db.Solicitacao.belongsTo(db.User, {
  foreignKey: 'criado_por',
  as: 'criador'
});

/* ===== Solicitação x Status / Histórico / Anexos / Mensagens ===== */
db.Solicitacao.hasMany(db.StatusArea, {
  foreignKey: 'solicitacao_id',
  as: 'statusAreas'
});

db.StatusArea.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

db.Solicitacao.hasMany(db.Historico, {
  foreignKey: 'solicitacao_id',
  as: 'historicos'
});

db.Historico.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

db.Solicitacao.hasMany(db.Anexo, {
  foreignKey: 'solicitacao_id',
  as: 'anexos'
});

db.Anexo.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

db.Solicitacao.hasMany(db.MensagemSetor, {
  foreignKey: 'solicitacao_id',
  as: 'mensagens'
});

db.MensagemSetor.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao'
});

/* ===== Usuário x Cargo ===== */
db.Cargo.hasMany(db.User, {
  foreignKey: 'cargo_id',
  as: 'usuarios'
});

db.User.belongsTo(db.Cargo, {
  foreignKey: 'cargo_id',
  as: 'cargoInfo'
});

/**
 * Tipo Solicitação
 */
db.TipoSolicitacao.hasMany(db.Solicitacao, {
  foreignKey: 'tipo_solicitacao_id',
  as: 'solicitacoes'
});

db.Solicitacao.belongsTo(db.TipoSolicitacao, {
  foreignKey: 'tipo_solicitacao_id',
  as: 'tipo'
});

db.TipoSolicitacao.hasMany(db.Solicitacao, {
  foreignKey: 'tipo_macro_id',
  as: 'solicitacoesMacro'
});

db.Solicitacao.belongsTo(db.TipoSolicitacao, {
  foreignKey: 'tipo_macro_id',
  as: 'tipoMacroSolicitacao'
});

db.TipoSubContrato.hasMany(db.Solicitacao, {
  foreignKey: 'tipo_sub_id',
  as: 'solicitacoes'
});

db.Solicitacao.belongsTo(db.TipoSubContrato, {
  foreignKey: 'tipo_sub_id',
  as: 'tipoSubSolicitacao'
});

// =====================
// CONTRATOS
// =====================
db.Obra.hasMany(db.Contrato, {
  foreignKey: 'obra_id',
  as: 'contratos'
});

db.Contrato.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.TipoSolicitacao.hasMany(db.TipoSubContrato, {
  foreignKey: 'tipo_macro_id',
  as: 'subtipos'
});

db.TipoSubContrato.belongsTo(db.TipoSolicitacao, {
  foreignKey: 'tipo_macro_id',
  as: 'macro'
});

db.TipoSolicitacao.hasMany(db.Contrato, {
  foreignKey: 'tipo_macro_id',
  as: 'contratos'
});

db.Contrato.belongsTo(db.TipoSolicitacao, {
  foreignKey: 'tipo_macro_id',
  as: 'tipoMacro'
});

db.TipoSubContrato.hasMany(db.Contrato, {
  foreignKey: 'tipo_sub_id',
  as: 'contratos'
});

db.Contrato.belongsTo(db.TipoSubContrato, {
  foreignKey: 'tipo_sub_id',
  as: 'tipoSub'
});

db.Contrato.hasMany(db.Solicitacao, {
  foreignKey: 'contrato_id',
  as: 'solicitacoes'
});

db.Solicitacao.belongsTo(db.Contrato, {
  foreignKey: 'contrato_id',
  as: 'contrato'
});

db.Contrato.hasMany(db.ContratoAnexo, {
  foreignKey: 'contrato_id',
  as: 'anexos'
});

db.ContratoAnexo.belongsTo(db.Contrato, {
  foreignKey: 'contrato_id',
  as: 'contrato'
});


// =====================
// USUÁRIO x SETOR
// =====================
db.Setor.hasMany(db.User, {
  foreignKey: 'setor_id',
  as: 'usuarios'
});

db.User.belongsTo(db.Setor, {
  foreignKey: 'setor_id',
  as: 'setor' // ⚠️ ESTE alias será usado no include
});

// =====================
// HISTORICO x USUARIO
// =====================
db.User.hasMany(db.Historico, {
  foreignKey: 'usuario_responsavel_id',
  as: 'historicos'
});

db.Historico.belongsTo(db.User, {
  foreignKey: 'usuario_responsavel_id',
  as: 'usuario'
});

db.User.hasMany(db.Historico, {
  foreignKey: 'usuario_responsavel_id',
  as: 'historicosResponsavel'
});


// VISIBILIDADE DE SOLICITAÇÃO PARA USUÁRIOS

db.User.hasMany(db.SolicitacaoVisibilidadeUsuario, {
  foreignKey: 'usuario_id',
  as: 'visibilidades',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE'
});

db.SolicitacaoVisibilidadeUsuario.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'usuario',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE'
});

db.Solicitacao.hasMany(db.SolicitacaoVisibilidadeUsuario, {
  foreignKey: 'solicitacao_id',
  as: 'visibilidades',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE'
});

db.SolicitacaoVisibilidadeUsuario.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_id',
  as: 'solicitacao',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE'
});

// =====================
// NOTIFICACOES
// =====================
db.Notificacao.hasMany(db.NotificacaoDestinatario, {
  foreignKey: 'notificacao_id',
  as: 'destinatarios'
});

db.NotificacaoDestinatario.belongsTo(db.Notificacao, {
  foreignKey: 'notificacao_id',
  as: 'notificacao'
});

db.User.hasMany(db.NotificacaoDestinatario, {
  foreignKey: 'usuario_id',
  as: 'notificacoes'
});

db.NotificacaoDestinatario.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'usuario'
});



module.exports = db;
