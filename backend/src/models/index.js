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
db.LogExclusao = require('./LogExclusao')(sequelize, Sequelize);
db.ConversaInterna = require('./ConversaInterna')(sequelize, Sequelize);
db.ConversaInternaMensagem = require('./ConversaInternaMensagem')(sequelize, Sequelize);
db.ConversaInternaAnexo = require('./ConversaInternaAnexo')(sequelize, Sequelize);
db.ConversaInternaParticipante = require('./ConversaInternaParticipante')(sequelize, Sequelize);
db.ConversaInternaArquivoUsuario = require('./ConversaInternaArquivoUsuario')(sequelize, Sequelize);
db.ArquivoModelo = require('./ArquivoModelo')(sequelize, Sequelize);
db.Unidade = require('./Unidade')(sequelize, Sequelize);
db.Categoria = require('./Categoria')(sequelize, Sequelize);
db.Insumo = require('./Insumo')(sequelize, Sequelize);
db.Apropriacao = require('./Apropriacao')(sequelize, Sequelize);
db.SolicitacaoCompra = require('./SolicitacaoCompra')(sequelize, Sequelize);
db.SolicitacaoCompraItem = require('./SolicitacaoCompraItem')(sequelize, Sequelize);
db.SolicitacaoCompraItemManual = require('./SolicitacaoCompraItemManual')(sequelize, Sequelize);

  



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

db.User.hasMany(db.ArquivoModelo, {
  foreignKey: 'criado_por_id',
  as: 'arquivosModelos'
});

db.ArquivoModelo.belongsTo(db.User, {
  foreignKey: 'criado_por_id',
  as: 'criadoPor'
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

// =====================
// CONVERSAS INTERNAS
// =====================
db.User.hasMany(db.ConversaInterna, {
  foreignKey: 'criado_por_id',
  as: 'conversasCriadas'
});

db.ConversaInterna.belongsTo(db.User, {
  foreignKey: 'criado_por_id',
  as: 'criador'
});

db.User.hasMany(db.ConversaInterna, {
  foreignKey: 'destinatario_id',
  as: 'conversasRecebidas'
});

db.ConversaInterna.belongsTo(db.User, {
  foreignKey: 'destinatario_id',
  as: 'destinatario'
});

db.User.hasMany(db.ConversaInterna, {
  foreignKey: 'concluida_por_id',
  as: 'conversasConcluidas'
});

db.ConversaInterna.belongsTo(db.User, {
  foreignKey: 'concluida_por_id',
  as: 'concluidaPor'
});

db.ConversaInterna.hasMany(db.ConversaInternaMensagem, {
  foreignKey: 'conversa_id',
  as: 'mensagens'
});

db.ConversaInternaMensagem.belongsTo(db.ConversaInterna, {
  foreignKey: 'conversa_id',
  as: 'conversa'
});

db.User.hasMany(db.ConversaInternaMensagem, {
  foreignKey: 'usuario_id',
  as: 'mensagensConversaInterna'
});

db.ConversaInternaMensagem.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'autor'
});

db.ConversaInterna.hasMany(db.ConversaInternaAnexo, {
  foreignKey: 'conversa_id',
  as: 'anexos'
});

db.ConversaInternaAnexo.belongsTo(db.ConversaInterna, {
  foreignKey: 'conversa_id',
  as: 'conversa'
});

db.ConversaInternaMensagem.hasMany(db.ConversaInternaAnexo, {
  foreignKey: 'mensagem_id',
  as: 'anexos'
});

db.ConversaInternaAnexo.belongsTo(db.ConversaInternaMensagem, {
  foreignKey: 'mensagem_id',
  as: 'mensagem'
});

db.ConversaInterna.hasMany(db.ConversaInternaParticipante, {
  foreignKey: 'conversa_id',
  as: 'participantes'
});

db.ConversaInternaParticipante.belongsTo(db.ConversaInterna, {
  foreignKey: 'conversa_id',
  as: 'conversa'
});

db.User.hasMany(db.ConversaInternaParticipante, {
  foreignKey: 'usuario_id',
  as: 'participacoesConversaInterna'
});

db.ConversaInternaParticipante.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'usuario'
});

db.User.hasMany(db.ConversaInternaParticipante, {
  foreignKey: 'adicionado_por_id',
  as: 'participantesAdicionadosConversaInterna'
});

db.ConversaInternaParticipante.belongsTo(db.User, {
  foreignKey: 'adicionado_por_id',
  as: 'adicionadoPor'
});

db.ConversaInterna.hasMany(db.ConversaInternaArquivoUsuario, {
  foreignKey: 'conversa_id',
  as: 'arquivamentos'
});

db.ConversaInternaArquivoUsuario.belongsTo(db.ConversaInterna, {
  foreignKey: 'conversa_id',
  as: 'conversa'
});

db.User.hasMany(db.ConversaInternaArquivoUsuario, {
  foreignKey: 'usuario_id',
  as: 'conversasArquivadas'
});

db.ConversaInternaArquivoUsuario.belongsTo(db.User, {
  foreignKey: 'usuario_id',
  as: 'usuario'
});

// =====================
// MODULO DE COMPRAS
// =====================
db.Insumo.belongsTo(db.Unidade, {
  foreignKey: 'unidade_id',
  as: 'unidade'
});

db.Insumo.belongsTo(db.Categoria, {
  foreignKey: 'categoria_id',
  as: 'categoria'
});

db.Unidade.hasMany(db.Insumo, {
  foreignKey: 'unidade_id',
  as: 'insumos'
});

db.Categoria.hasMany(db.Insumo, {
  foreignKey: 'categoria_id',
  as: 'insumos'
});

db.Apropriacao.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.Obra.hasMany(db.Apropriacao, {
  foreignKey: 'obra_id',
  as: 'apropriacoes'
});

db.SolicitacaoCompra.belongsTo(db.Obra, {
  foreignKey: 'obra_id',
  as: 'obra'
});

db.SolicitacaoCompra.belongsTo(db.User, {
  foreignKey: 'solicitante_id',
  as: 'solicitante'
});

db.SolicitacaoCompra.belongsTo(db.Solicitacao, {
  foreignKey: 'solicitacao_principal_id',
  as: 'solicitacaoPrincipal'
});

db.SolicitacaoCompra.hasMany(db.SolicitacaoCompraItem, {
  foreignKey: 'solicitacao_compra_id',
  as: 'itens',
  onDelete: 'CASCADE'
});

db.SolicitacaoCompra.hasMany(db.SolicitacaoCompraItemManual, {
  foreignKey: 'solicitacao_compra_id',
  as: 'itensManuais',
  onDelete: 'CASCADE'
});

db.SolicitacaoCompraItem.belongsTo(db.SolicitacaoCompra, {
  foreignKey: 'solicitacao_compra_id',
  as: 'solicitacao'
});

db.SolicitacaoCompraItemManual.belongsTo(db.SolicitacaoCompra, {
  foreignKey: 'solicitacao_compra_id',
  as: 'solicitacao'
});

db.SolicitacaoCompraItem.belongsTo(db.Insumo, {
  foreignKey: 'insumo_id',
  as: 'insumo'
});

db.SolicitacaoCompraItem.belongsTo(db.Unidade, {
  foreignKey: 'unidade_id',
  as: 'unidade'
});

db.SolicitacaoCompraItem.belongsTo(db.Apropriacao, {
  foreignKey: 'apropriacao_id',
  as: 'apropriacao'
});

db.SolicitacaoCompraItemManual.belongsTo(db.Apropriacao, {
  foreignKey: 'apropriacao_id',
  as: 'apropriacao'
});



module.exports = db;
