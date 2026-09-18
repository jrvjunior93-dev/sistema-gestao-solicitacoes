const { tableExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ sequelize }) {
    if (!(await tableExists(sequelize, 'titulo_renegociacoes'))) await sequelize.query(`CREATE TABLE titulo_renegociacoes (
      id INT AUTO_INCREMENT PRIMARY KEY, chave VARCHAR(100) NOT NULL UNIQUE,
      payload_hash CHAR(64) NOT NULL, usuario_id INT NOT NULL, motivo VARCHAR(1000) NOT NULL,
      principal DECIMAL(14,2) NOT NULL, juros DECIMAL(14,2) NOT NULL, multa DECIMAL(14,2) NOT NULL,
      snapshot JSON NOT NULL, resultado JSON NULL,
      createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL
    ) ENGINE=InnoDB`);
    if (!(await tableExists(sequelize, 'titulo_renegociacao_alocacoes'))) await sequelize.query(`CREATE TABLE titulo_renegociacao_alocacoes (
      id INT AUTO_INCREMENT PRIMARY KEY, negociacao_id INT NOT NULL,
      titulo_origem_id INT NOT NULL, titulo_destino_id INT NOT NULL,
      obra_id INT NOT NULL, apropriacao_id INT NULL, categoria_financeira_id INT NULL,
      solicitacao_id INT NULL, considera_dre BOOLEAN NOT NULL DEFAULT TRUE, valor DECIMAL(14,2) NOT NULL,
      principal DECIMAL(14,2) NOT NULL, juros DECIMAL(14,2) NOT NULL, multa DECIMAL(14,2) NOT NULL,
      createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL,
      INDEX idx_reneg_origem (titulo_origem_id), INDEX idx_reneg_destino (titulo_destino_id),
      INDEX idx_reneg_obra (obra_id), INDEX idx_reneg_sol (solicitacao_id),
      CONSTRAINT fk_reneg_neg FOREIGN KEY (negociacao_id) REFERENCES titulo_renegociacoes(id),
      CONSTRAINT fk_reneg_ori FOREIGN KEY (titulo_origem_id) REFERENCES titulos_financeiros(id),
      CONSTRAINT fk_reneg_dest FOREIGN KEY (titulo_destino_id) REFERENCES titulos_financeiros(id)
    ) ENGINE=InnoDB`);
    const columns = await sequelize.getQueryInterface().describeTable('titulos_financeiros');
    for (const [name, sql] of Object.entries({
      renegociacao_id: 'INT NULL', renegociado_por_id: 'INT NULL',
      juros_renegociacao: 'DECIMAL(14,2) NOT NULL DEFAULT 0', multa_renegociacao: 'DECIMAL(14,2) NOT NULL DEFAULT 0'
    })) if (!columns[name]) await sequelize.query(`ALTER TABLE titulos_financeiros ADD COLUMN ${name} ${sql}`);
    // A guarda no banco cobre escritores legados/SQL e a corrida entre uma
    // edição sem lock e a confirmação da negociação em outra transação.
    const cobranca = ['forma_cobranca','status_cobranca','nosso_numero','linha_digitavel','codigo_barras','boleto_emitido_em'];
    const origem = ['status','valor_original','valor_bruto','valor_liquido','valor_saldo','valor_baixado',
      'obra_id','apropriacao_id','categoria_financeira_id','empresa_id','parceiro_id','deleted_at',
      'solicitacao_id','considera_dre','data_vencimento','competencia_data','renegociado_por_id','renegociacao_id',
      'tipo','origem_titulo','valor_impostos','possui_rateio','juros_renegociacao','multa_renegociacao',...cobranca];
    const destino = origem.filter(k => !['status','valor_saldo','valor_baixado',...cobranca].includes(k));
    const mudou = campos => campos.map(k => `NOT (NEW.${k} <=> OLD.${k})`).join(' OR ');
    const triggers = {
      trg_titulo_negociacao_update: `BEFORE UPDATE ON titulos_financeiros FOR EACH ROW BEGIN
        IF (OLD.renegociado_por_id IS NOT NULL AND (${mudou(origem)}))
          OR (OLD.renegociacao_id IS NOT NULL AND ((${mudou(destino)}) OR NEW.status IN ('CANCELADO','ESTORNADO','PREVISAO'))) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Titulo protegido por negociacao financeira';
        END IF;
      END`,
      trg_titulo_negociacao_delete: `BEFORE DELETE ON titulos_financeiros FOR EACH ROW BEGIN
        IF OLD.renegociado_por_id IS NOT NULL OR OLD.renegociacao_id IS NOT NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Titulo protegido por negociacao financeira';
        END IF;
      END`
    };
    for (const [name, definition] of Object.entries(triggers)) {
      const [existentes] = await sequelize.query('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?', { replacements: [name] });
      if (!existentes.length) await sequelize.query(`CREATE TRIGGER ${name} ${definition}`);
    }
  }
};
