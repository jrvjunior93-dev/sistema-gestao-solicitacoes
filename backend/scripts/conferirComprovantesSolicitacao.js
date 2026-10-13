'use strict';

// Diagnostico opt-in. Somente SELECTs; nao gera URLs, nao baixa/upload nem reconcilia.
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== '--somente-leitura'
    || !/^--solicitacao=SOL-\d+$/i.test(args[1]) || !/^--arquivo=.+\.pdf$/i.test(args[2])) {
    throw new Error('Use: node scripts/conferirComprovantesSolicitacao.js --somente-leitura --solicitacao=SOL-6278 --arquivo=SOL-6278.pdf');
  }
  const codigo = args[1].slice('--solicitacao='.length).toUpperCase();
  const nome = args[2].slice('--arquivo='.length);
  const { Op } = require('sequelize');
  const { Solicitacao, TituloFinanceiro, PagamentoManualFilaItem, PagamentoManualFilaComprovante,
    Comprovante, Historico } = require('../src/models');
  const solicitacao = await Solicitacao.findOne({ where: { codigo }, attributes: ['id', 'codigo'] });
  if (!solicitacao) throw new Error('Solicitacao nao encontrada.');
  const titulos = await TituloFinanceiro.findAll({ where: { solicitacao_id: solicitacao.id },
    attributes: ['id', 'codigo', 'status', 'valor_saldo'] });
  console.log('Solicitacao:', solicitacao.codigo, 'ID:', solicitacao.id);
  console.table(titulos.map(t => t.toJSON()));
  const filas = titulos.length ? await PagamentoManualFilaItem.findAll({
    where: { titulo_financeiro_id: { [Op.in]: titulos.map(t => t.id) } },
    attributes: ['id', 'titulo_financeiro_id', 'status', 'comprovante_nome', 'comprovante_hash',
      'comprovante_vinculado_em', 'comprovante_tipo', 'comprovante_dados_json', 'processado_em']
  }) : [];
  const extras = filas.length ? await PagamentoManualFilaComprovante.findAll({
    where: { fila_id: { [Op.in]: filas.map(f => f.id) } },
    attributes: ['id', 'fila_id', 'nome', 'hash', 'tipo', 'dados_json', 'vinculado_em']
  }) : [];
  const documentos = await Comprovante.findAll({ where: { solicitacao_id: solicitacao.id },
    attributes: ['id', 'nome_original', 'status', 'deleted_at', 'createdAt'] });
  const igual = value => String(value || '').toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR');
  const tituloCodigo = id => titulos.find(t => Number(t.id) === Number(id))?.codigo;
  const registros = [];
  for (const f of filas) if (igual(f.comprovante_nome)) registros.push({
    origem: 'FILA - PRINCIPAL', fila_id: f.id, titulo: tituloCodigo(f.titulo_financeiro_id),
    arquivo: f.comprovante_nome, status: f.status, vinculado_em: f.comprovante_vinculado_em,
    leitura_pdf_armazenada: Boolean(f.comprovante_dados_json) ? 'SIM' : 'NAO',
    baixa_em: f.processado_em
  });
  for (const c of extras) if (igual(c.nome)) registros.push({
    origem: 'FILA - ADICIONAL', fila_id: c.fila_id,
    titulo: tituloCodigo(filas.find(f => Number(f.id) === Number(c.fila_id))?.titulo_financeiro_id),
    arquivo: c.nome, tipo: c.tipo, vinculado_em: c.vinculado_em,
    leitura_pdf_armazenada: Boolean(c.dados_json) ? 'SIM' : 'NAO'
  });
  for (const c of documentos) if (igual(c.nome_original)) registros.push({
    origem: 'IMPORTACAO COMPROVANTES - SOLICITACAO', arquivo: c.nome_original,
    id: c.id, status: c.status, excluido: Boolean(c.deleted_at), criado_em: c.createdAt,
    titulo: 'Sem vinculo individual ao titulo'
  });
  console.log('Vinculos do arquivo exato:', nome); console.table(registros);
  if (!registros.length) console.log('Nome exato nao localizado nestes vinculos; nenhuma associacao foi presumida.');
  const historicos = await Historico.findAll({
    where: { solicitacao_id: solicitacao.id, acao: 'COMPROVANTE_ADICIONADO' },
    attributes: ['id', 'descricao', 'metadata', 'createdAt'], order: [['id', 'ASC']]
  });
  console.log('Auditoria do arquivo na solicitacao:');
  console.table(historicos.filter(h => igual(h.descricao)).map(h => {
    let meta = {}; try { meta = typeof h.metadata === 'string' ? JSON.parse(h.metadata) : h.metadata || {}; } catch {}
    return { id: h.id, arquivo: h.descricao, registrado_em: h.createdAt,
      origem: meta.origem || (meta.comprovante_id ? 'COMPROVANTES - SOLICITACAO' : 'Nao registrada'),
      fila_id: meta.fila_id || null, titulo_id: meta.titulo_financeiro_id || null,
      vinculo: meta.vinculo || 'Nao registrado' };
  }));
  console.log('Somente leitura. Nenhuma baixa, arquivo ou vinculo alterado. Sem URLs/credenciais no resultado.');
}
main().catch(error => { console.error('Conferencia interrompida:', error.code || error.message); process.exitCode = 1; })
  .finally(async () => {
    const database = require.resolve('../src/database');
    if (require.cache[database]) await require.cache[database].exports.close();
  });
