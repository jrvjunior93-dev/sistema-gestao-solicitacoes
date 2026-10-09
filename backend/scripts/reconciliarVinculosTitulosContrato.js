'use strict';

// Somente leitura por padrao. Nunca executado pelo startup ou migrations.
async function main() {
  const valores = new Map();
  const modos = ['--somente-leitura', '--aplicar'];
  const permitidos = new Set([...modos, '--titulo-ids', '--apos', '--limite', '--confirmacao', '--usuario-id']);
  for (const arg of process.argv.slice(2)) {
    const partes = arg.split('='), [nome, valor] = partes;
    if (!permitidos.has(nome) || valores.has(nome) || (modos.includes(nome) ? partes.length !== 1 : partes.length !== 2 || !valor)) {
      throw new Error(`Argumento invalido: ${nome}`);
    }
    valores.set(nome, valor ?? true);
  }
  if (modos.every(m => valores.has(m))) throw new Error('Escolha apenas um modo.');
  if (!valores.has('--aplicar') && (valores.has('--confirmacao') || valores.has('--usuario-id'))) throw new Error('Parametros de escrita exigem --aplicar.');
  if (valores.has('--aplicar') && (valores.has('--apos') || valores.has('--limite'))) throw new Error('Aplicacao exige IDs explicitos, sem paginacao.');
  const tituloIds = valores.has('--titulo-ids') ? String(valores.get('--titulo-ids')).split(',').map(Number) : [];
  const { conferirVinculosTitulosContrato, aplicarVinculosTitulosContrato } = require('../src/services/tituloContratoReconService');
  if (valores.has('--aplicar')) {
    console.log('Reconciliacao aplicada:', await aplicarVinculosTitulosContrato({ tituloIds,
      confirmacao: valores.get('--confirmacao'), usuarioId: Number(valores.get('--usuario-id')),
      habilitado: process.env.ALLOW_CONTRACT_TITLE_LINK_RECONCILIATION === 'true' }));
  } else {
    const resultado = await conferirVinculosTitulosContrato({ tituloIds,
      apos: Number(valores.get('--apos') || 0), limite: Number(valores.get('--limite') || 100) });
    console.table(resultado.resumo);
    console.log('IDs conferidos:', resultado.titulos.join(','));
    console.log('Assinatura da conferencia:', resultado.confirmacao);
    console.log('Proximo cursor:', resultado.proximo_cursor);
    console.log('Somente leitura: nenhum vinculo, status, fila, autorizacao ou pagamento foi alterado.');
  }
}
main().catch(error => { console.error('Reconciliacao interrompida:', error.message); process.exitCode = 1; })
  .finally(async () => {
    const filename = require.resolve('../src/database');
    if (require.cache[filename]) await require.cache[filename].exports.close();
  });
