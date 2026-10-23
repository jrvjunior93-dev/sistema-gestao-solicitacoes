'use strict';

const TABELA = 'medicao_parcelas';
const ANTIGO = 'medicao_parcelas_unico';
const ATIVO = 'medicao_parcelas_ativa_unica';
const EVENTO = 'medicao_parcelas_evento_unico';
const COLUNAS = {
  vinculo_ativo: { tipo: 'tinyint', expressao: 'CASE WHEN devolvido_em IS NULL THEN 1 ELSE NULL END' },
  evento_chave: { tipo: 'varchar', expressao: "CASE WHEN medicao_id IS NULL THEN CONCAT('S', solicitacao_id) ELSE CONCAT('M', medicao_id) END" }
};
const normalizar = v => String(v || '').toLowerCase().replace(/_(?:utf8mb4|utf8mb3|utf8|latin1|ascii)(?=')/g, '').replace(/[`\s()]/g, '');
const falhar = codigo => { throw Object.assign(new Error(codigo + '. Nenhum dado corrigido automaticamente.'), { code: codigo }); };
function conferirIndice(indices, nome, campos, unico) {
  const index = indices.find(i => i.name === nome);
  if (index && (Boolean(index.unique) !== unico || index.fields.length !== campos.length
    || index.fields.some((f, i) => f.attribute !== campos[i] || f.length != null))) falhar('MEDICAO_INDICE_DIVERGENTE');
  return index;
}

module.exports = {
  // Exportado somente para QA da mesma expressao/DDL em banco efemero.
  COLUNAS,
  async up({ queryInterface, sequelize }) {
    const [[servidor]] = await sequelize.query('SELECT VERSION() AS versao');
    // A troca acontece em um ALTER atomico, suportado em MySQL8/InnoDB.
    if (!/^8\./.test(String(servidor?.versao || '')) || /mariadb/i.test(servidor.versao)) falhar('MEDICAO_MYSQL_NAO_SUPORTADO');
    const [[tabela]] = await sequelize.query('SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', { replacements: [TABELA] });
    if (tabela?.engine !== 'InnoDB') falhar('MEDICAO_ENGINE_DIVERGENTE');
    const [metadata] = await sequelize.query(`SELECT COLUMN_NAME AS nome, DATA_TYPE AS tipo, EXTRA AS extra,
      GENERATION_EXPRESSION AS expressao, CHARACTER_MAXIMUM_LENGTH AS tamanho, IS_NULLABLE AS anulavel
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, { replacements: [TABELA] });
    const cols = new Map(metadata.map(c => [c.nome, c]));
    if (['solicitacao_id', 'medicao_id', 'contrato_parcela_id', 'devolvido_em'].some(c => !cols.has(c))) falhar('MEDICAO_COLUNAS_BASE_AUSENTES');
    const indices = await queryInterface.showIndex(TABELA);
    const antigo = conferirIndice(indices, ANTIGO, ['solicitacao_id', 'contrato_parcela_id'], true);
    const ativo = conferirIndice(indices, ATIVO, ['contrato_parcela_id', 'vinculo_ativo'], true);
    const evento = conferirIndice(indices, EVENTO, ['contrato_parcela_id', 'evento_chave'], true);
    if (!antigo && !ativo) falhar('MEDICAO_SCHEMA_SEM_PROTECAO');
    for (const [nome, esperado] of Object.entries(COLUNAS)) {
      const coluna = cols.get(nome);
      if (coluna && (coluna.tipo !== esperado.tipo || coluna.anulavel !== 'YES' || !/VIRTUAL GENERATED/i.test(coluna.extra)
        || normalizar(coluna.expressao) !== normalizar(esperado.expressao)
        || (nome === 'evento_chave' && Number(coluna.tamanho) !== 64))) falhar('MEDICAO_COLUNA_GERADA_DIVERGENTE');
    }
    if ((ativo && !cols.has('vinculo_ativo')) || (evento && !cols.has('evento_chave'))) falhar('MEDICAO_INDICE_SEM_COLUNA');

    // Somente leitura: conflitos preexistentes interrompem, nao apagam nem
    // marcam medicoes como devolvidas para fazer a migration passar.
    const [duplicadas] = await sequelize.query(`SELECT contrato_parcela_id FROM medicao_parcelas
      WHERE devolvido_em IS NULL GROUP BY contrato_parcela_id HAVING COUNT(*) > 1 LIMIT 1`);
    if (duplicadas.length) falhar('MEDICAO_VINCULOS_ATIVOS_DUPLICADOS');
    const [eventos] = await sequelize.query(`SELECT contrato_parcela_id FROM medicao_parcelas
      GROUP BY contrato_parcela_id, ${COLUNAS.evento_chave.expressao} HAVING COUNT(*) > 1 LIMIT 1`);
    if (eventos.length) falhar('MEDICAO_VINCULOS_EVENTO_DUPLICADOS');

    const acoes = [];
    if (!cols.has('vinculo_ativo')) acoes.push(`ADD COLUMN vinculo_ativo TINYINT GENERATED ALWAYS AS (${COLUNAS.vinculo_ativo.expressao}) VIRTUAL`);
    if (!cols.has('evento_chave')) acoes.push(`ADD COLUMN evento_chave VARCHAR(64) GENERATED ALWAYS AS (${COLUNAS.evento_chave.expressao}) VIRTUAL`);
    if (!ativo) acoes.push(`ADD UNIQUE INDEX ${ATIVO} (contrato_parcela_id, vinculo_ativo)`);
    if (!evento) acoes.push(`ADD UNIQUE INDEX ${EVENTO} (contrato_parcela_id, evento_chave)`);
    // O indice antigo pode ser o suporte da FK de solicitacao. Manter esse
    // suporte explicito antes de troca-lo, sem remover/relaxar qualquer FK.
    if (!indices.some(i => i.name !== ANTIGO && i.fields[0]?.attribute === 'solicitacao_id')) {
      if (indices.some(i => i.name === 'medicao_parcelas_solicitacao')) falhar('MEDICAO_INDICE_DIVERGENTE');
      acoes.push('ADD INDEX medicao_parcelas_solicitacao (solicitacao_id)');
    }
    if (antigo) acoes.push(`DROP INDEX ${ANTIGO}`);
    // Sem janela entre DROP e novas protecoes. Uma falha preserva o schema
    // anterior. COPY evita depender de suporte INPLACE para operacoes mistas.
    if (acoes.length) await sequelize.query(`ALTER TABLE medicao_parcelas ${acoes.join(', ')}, ALGORITHM=COPY`);
  },
  async down() { falhar('MEDICAO_ROLLBACK_DESTRUTIVO_BLOQUEADO'); }
};
