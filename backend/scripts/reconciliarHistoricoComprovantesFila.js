'use strict';

// Padrao somente leitura. Nenhuma migration, baixa ou upload de arquivo.
// Aplicacao exige flag operacional + IDs + assinatura + superadmin ativo.
async function main() {
  const args = process.argv.slice(2);
  const valores = new Map();
  const permitidos = new Set(['--somente-leitura', '--aplicar', '--fila-ids', '--apos', '--limite', '--confirmacao', '--usuario-id']);
  for (const arg of args) {
    const [nome, valor] = arg.split('=');
    if (!permitidos.has(nome) || valores.has(nome)) throw new Error(`Argumento invalido: ${nome}`);
    if (['--somente-leitura', '--aplicar'].includes(nome) ? valor !== undefined : !valor || arg.split('=').length !== 2) {
      throw new Error(`Formato invalido: ${nome}`);
    }
    valores.set(nome, valor ?? true);
  }
  if (valores.has('--aplicar') && valores.has('--somente-leitura')) throw new Error('Escolha apenas um modo.');
  const filaIds = valores.has('--fila-ids') ? String(valores.get('--fila-ids')).split(',').map(Number) : [];
  const { conferirHistoricoComprovantesFila, aplicarHistoricoComprovantesFila } = require('../src/services/pagamentoFilaHistoricoReconService');
  if (valores.has('--aplicar')) {
    const resultado = await aplicarHistoricoComprovantesFila({ filaIds,
      confirmacao: valores.get('--confirmacao'), usuarioId: Number(valores.get('--usuario-id')),
      habilitado: process.env.ALLOW_PAYMENT_RECEIPT_HISTORY_RECONCILIATION === 'true' });
    console.log('Vinculos aplicados:', resultado);
  } else {
    const resultado = await conferirHistoricoComprovantesFila({ filaIds,
      apos: Number(valores.get('--apos') || 0), limite: Number(valores.get('--limite') || 100) });
    console.table(resultado.resumo);
    console.log('IDs conferidos:', resultado.filas.join(','));
    console.log('Assinatura da conferencia:', resultado.confirmacao);
    console.log('Proximo cursor:', resultado.proximo_cursor);
    console.log('Somente leitura: nenhum registro, baixa ou arquivo foi alterado.');
  }
}

main().catch(error => { console.error('Reconciliacao interrompida:', error.message); process.exitCode = 1; })
  .finally(async () => {
    // Models sao carregados apenas apos os argumentos; fechar somente se inicializado.
    const filename = require.resolve('../src/database');
    if (require.cache[filename]) await require.cache[filename].exports.close();
  });
