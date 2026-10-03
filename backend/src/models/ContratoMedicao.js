module.exports = (sequelize, DataTypes) => {
  /**
   * A medicao como EVENTO proprio (PI-16).
   *
   * Depois que a medicao deixou de ser uma solicitacao, ela precisou de um lugar para existir:
   * o numero, o periodo, e o dono dos anexos e comentarios daquela medicao — que o cliente pediu
   * para abrir num modal a partir de cada titulo no card do Financeiro.
   *
   * Desde 23/08 ela GUARDA A APROVACAO (`aprovada_em`) e os DADOS DE PAGAMENTO — o favorecido
   * deixou de ser definido na abertura do contrato, porque quem recebe pode mudar de uma medicao
   * para outra. Continua nao tendo status proprio: quem tem status e a solicitacao, e e a aprovacao
   * daqui que a leva de NEC. DE MEDICAO para LIBERADO.
   */
  const ContratoMedicao = sequelize.define(
    'ContratoMedicao',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      contrato_id: { type: DataTypes.INTEGER, allowNull: false },
      // A solicitacao unica do contrato (PI-16). Repetida aqui para a tela do detalhe achar as
      // medicoes sem passar pelo contrato.
      solicitacao_id: { type: DataTypes.INTEGER, allowNull: true },
      // Sequencial POR CONTRATO — o "numero da medicao" do escopo. O indice unico
      // (contrato_id, numero) e quem garante isso sob concorrencia.
      numero: { type: DataTypes.INTEGER, allowNull: false },
      periodo_inicio: { type: DataTypes.DATEONLY, allowNull: true },
      periodo_fim: { type: DataTypes.DATEONLY, allowNull: true },
      valor_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

      // Quem recebe ESTA medicao. Saiu do contrato (item 5 do lote de 23/08).
      favorecido_id: { type: DataTypes.INTEGER, allowNull: true },
      // A chave COPIADA, e nao um apontamento: a do cadastro pode mudar depois, e a medicao tem de
      // dizer para onde o dinheiro foi naquele pagamento. Mesma razao de `valor_previsto` existir.
      favorecido_chave_pix: { type: DataTypes.STRING(180), allowNull: true },
      favorecido_contato: { type: DataTypes.STRING(180), allowNull: true },
      forma_pagamento_id: { type: DataTypes.INTEGER, allowNull: true },

      // O aceite guarda QUEM e QUANDO: "confirmei que os dados de pagamento estao corretos" e uma
      // declaracao de responsabilidade, e um booleano nao diz de quem.
      dados_confirmados_em: { type: DataTypes.DATE, allowNull: true },
      dados_confirmados_por: { type: DataTypes.INTEGER, allowNull: true },

      // A aprovacao da Gerencia de Processos. E ela que leva a solicitacao a LIBERADO.
      aprovada_em: { type: DataTypes.DATE, allowNull: true },
      aprovada_por: { type: DataTypes.INTEGER, allowNull: true },

      criado_por: { type: DataTypes.INTEGER, allowNull: true }
    },
    {
      tableName: 'contrato_medicoes',
      timestamps: true
    }
  );

  return ContratoMedicao;
};
