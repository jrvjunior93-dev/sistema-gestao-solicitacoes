'use strict';

require('dotenv').config({ quiet: true });

const { Contrato, sequelize } = require('../src/models');
const { calcularResumosOperacionais } = require('../src/services/contratoResumoOperacionalService');

async function main() {
  const contratos = await Contrato.findAll({ order: [['id', 'ASC']] });
  const resumos = await calcularResumosOperacionais(contratos);
  const totais = {
    ATIVO: 0,
    TOTALMENTE_MEDIDO: 0,
    CONCLUIDO: 0,
    RESCINDIDO: 0,
    COM_ALERTA: 0
  };

  const linhas = contratos.map((contrato) => {
    const resumo = resumos.get(Number(contrato.id));
    totais[resumo.status_operacional] = (totais[resumo.status_operacional] || 0) + 1;
    if (resumo.alertas.length) totais.COM_ALERTA += 1;
    return {
      id: contrato.id,
      codigo: contrato.codigo,
      fluxo: resumo.fluxo,
      status: resumo.status_operacional,
      contratado: resumo.contratado.toFixed(2),
      medido: resumo.medido.toFixed(2),
      movimentado: resumo.movimentado.toFixed(2),
      saldo: resumo.saldo_contratual.toFixed(2),
      alertas: resumo.alertas.map(item => item.codigo).join(', ') || '-'
    };
  });

  console.table({
    host: process.env.DB_HOST,
    banco: process.env.DB_NAME,
    contratos: contratos.length,
    ...totais
  });
  console.table(linhas);
  console.log('AUDITORIA SOMENTE LEITURA: nenhum contrato foi alterado ou classificado no banco.');
}

main()
  .catch((error) => {
    console.error('Erro na auditoria operacional de contratos:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
