'use strict';
const { check, companyCnpj } = require('./policy');
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const MIGRATION = '202610240001_fiscal_nsdocs_capturas.js';
const LOCK = 'fluxy_nsdocs_manual_dev';

// SQL restrito ao acervo fiscal. Nao importa models globais, app ou servicos
// financeiros. Todas as chamadas recebem a conexao DEV com TLS/UUID conferidos.
function createRepository(db) {
  const exec = async (sql, args = []) => (await db.execute(sql, args))[0];
  const transaction = async action => {
    await db.beginTransaction();
    try { const result = await action(); await db.commit(); return result; }
    catch (error) { await db.rollback(); throw error; }
  };
  const event = (id, outcome) => {
    check(/^NSDOCS_[A-Z0-9_]{1,100}$/.test(outcome), 'NSDOCS_EVENTO_INVALIDO');
    return exec('INSERT INTO fiscal_nsdocs_capture_events (capture_id, outcome, createdAt, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', [id, outcome]);
  };
  async function fiscalCompany(company) {
    const companies = await exec('SELECT id, empresa_id, cnpj, ativo FROM fiscal_companies WHERE empresa_id = ?', [company.id]);
    const matches = companies.filter(row => companyCnpj(row.cnpj) === company.cnpj && Number(row.ativo) === 1);
    check(matches.length === 1, 'NSDOCS_EMPRESA_FISCAL_DEV_NAO_VINCULADA');
    const local = await exec('SELECT cnpj, ativo FROM empresas_grupo WHERE id = ?', [company.id]);
    check(local.length === 1 && Number(local[0].ativo) === 1 && companyCnpj(local[0].cnpj) === company.cnpj,
      'NSDOCS_EMPRESA_LOCAL_DIVERGENTE');
    return Number(matches[0].id);
  }
  return {
    fiscalCompany,
    async history(id, company) {
      const [row] = await exec('SELECT id, state, error_code, result_json, createdAt, updatedAt FROM fiscal_nsdocs_captures WHERE id = ? AND empresa_id = ? AND company_cnpj = ?', [id, company.id, company.cnpj]);
      check(row, 'NSDOCS_CAPTURA_NAO_ENCONTRADA');
      const events = await exec('SELECT id, outcome, createdAt FROM fiscal_nsdocs_capture_events WHERE capture_id = ? ORDER BY id DESC LIMIT 500', [id]);
      const [count] = await exec('SELECT COUNT(*) AS total FROM fiscal_nsdocs_capture_events WHERE capture_id = ?', [id]);
      return { capture_id: row.id, state: row.state, error_code: row.error_code, result: json(row.result_json),
        created_at: row.createdAt, updated_at: row.updatedAt, events: events.reverse(), events_limit: 500,
        events_total: Number(count.total), events_truncated: Number(count.total) > events.length };
    },
    async lock() {
      const rows = await exec('SELECT GET_LOCK(?, 0) AS acquired', [LOCK]);
      check(Number(rows[0]?.acquired) === 1, 'NSDOCS_CAPTURA_OCUPADA');
    },
    async unlock() { await exec('SELECT RELEASE_LOCK(?) AS released', [LOCK]); },
    async preflight(company) {
      const ledger = await exec('SELECT name FROM schema_migrations WHERE name = ?', [MIGRATION]);
      check(ledger.length === 1, 'NSDOCS_SCHEMA_CAPTURA_PENDENTE');
      // Queries de zero linhas validam colunas sem ler documentos reais.
      await exec('SELECT id, empresa_id, fiscal_company_id, company_cnpj, request_hash, request_json, page_json, state, result_json, error_code, createdAt, updatedAt FROM fiscal_nsdocs_captures WHERE 1 = 0');
      await exec('SELECT id, capture_id, fiscal_dfe_document_id, access_key, provider_id, snapshot_json, xml_bucket, xml_key, xml_hash, createdAt, updatedAt FROM fiscal_nsdocs_observations WHERE 1 = 0');
      await exec('SELECT id, capture_id, outcome, createdAt, updatedAt FROM fiscal_nsdocs_capture_events WHERE 1 = 0');
      const engines = await exec("SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('fiscal_nsdocs_captures','fiscal_nsdocs_observations','fiscal_nsdocs_capture_events','fiscal_dfe_documents','fiscal_dfe_events','fiscal_companies')");
      check(engines.length === 6 && engines.every(row => row.ENGINE === 'InnoDB'), 'NSDOCS_SCHEMA_SEM_TRANSACAO');
      const indices = await exec("SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('fiscal_nsdocs_captures','fiscal_nsdocs_observations','fiscal_dfe_documents') ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX");
      const groups = new Map();
      for (const row of indices) if (Number(row.NON_UNIQUE) === 0) {
        const key = `${row.TABLE_NAME}:${row.INDEX_NAME}`;
        groups.set(key, [...(groups.get(key) || []), row.SUB_PART == null ? row.COLUMN_NAME : '[prefix]']);
      }
      const unique = (table, columns) => [...groups].some(([key, cols]) => key.startsWith(`${table}:`) && cols.join(',') === columns);
      check(unique('fiscal_nsdocs_captures', 'id') && unique('fiscal_nsdocs_observations', 'capture_id,access_key') &&
        unique('fiscal_dfe_documents', 'access_key'), 'NSDOCS_SCHEMA_SEM_UNICIDADE');
      return fiscalCompany(company);
    },
    async begin({ id, company, fiscalCompanyId, hash, input }) {
      return transaction(async () => {
        const rows = await exec('SELECT * FROM fiscal_nsdocs_captures WHERE id = ? FOR UPDATE', [id]);
        if (rows.length) {
          const row = rows[0];
          check(row.request_hash === hash && Number(row.empresa_id) === company.id &&
            Number(row.fiscal_company_id) === fiscalCompanyId && row.company_cnpj === company.cnpj, 'NSDOCS_IDEMPOTENCIA_DIVERGENTE');
          await event(id, 'NSDOCS_CAPTURA_RETOMADA');
          return { page: json(row.page_json), result: row.state === 'completed' ? json(row.result_json) : null };
        }
        await exec('INSERT INTO fiscal_nsdocs_captures (id, empresa_id, fiscal_company_id, company_cnpj, request_hash, request_json, state, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [id, company.id, fiscalCompanyId, company.cnpj, hash, JSON.stringify(input), 'started']);
        await event(id, 'NSDOCS_CAPTURA_INICIADA');
        return { page: null, result: null };
      });
    },
    event,
    async savePage(id, page) {
      await transaction(async () => {
        await exec('UPDATE fiscal_nsdocs_captures SET page_json = ?, state = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND page_json IS NULL', [JSON.stringify(page), 'capturing', id]);
        await event(id, 'NSDOCS_PAGINA_PERSISTIDA');
      });
    },
    async observed(id, key) {
      const rows = await exec('SELECT id FROM fiscal_nsdocs_observations WHERE capture_id = ? AND access_key = ?', [id, key]);
      return rows.length === 1;
    },
    async saveDocument({ id, company, fiscalCompanyId, doc, xml }) {
      return transaction(async () => {
        check(await fiscalCompany(company) === fiscalCompanyId, 'NSDOCS_EMPRESA_FISCAL_DEV_NAO_VINCULADA');
        const previous = await exec('SELECT id FROM fiscal_nsdocs_observations WHERE capture_id = ? AND access_key = ? FOR UPDATE', [id, doc.access_key]);
        if (previous.length) return;
        let [existing] = await exec('SELECT * FROM fiscal_dfe_documents WHERE access_key = ? FOR UPDATE', [doc.access_key]);
        if (existing) {
          check(Number(existing.fiscal_company_id) === fiscalCompanyId && existing.document_type === 'nfe', 'NSDOCS_NOTA_EXISTENTE_OUTRA_EMPRESA');
          // Nao altera dados/status/manifestacao/XML/vinculos do cadastro existente.
        } else {
          const result = await exec('INSERT INTO fiscal_dfe_documents (fiscal_company_id, document_type, access_key, issuer_cnpj, issuer_name, recipient_cnpj, recipient_name, emission_date, received_at, total_value, currency, document_number, document_status, manifestation_status, xml_storage_key, hash_xml, raw_summary_json, source, is_duplicate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            [fiscalCompanyId, 'nfe', doc.access_key, doc.issuer_cnpj, doc.issuer_name, doc.recipient_cnpj, doc.recipient_name,
              `${doc.issued_on} 00:00:00`, `${doc.received_on} 00:00:00`, (doc.total_cents / 100).toFixed(2), 'BRL', doc.number,
              'xml_downloaded', 'pending', xml.key, xml.hash, JSON.stringify(doc), 'nsdocs_v2_manual', 0]);
          existing = { id: result.insertId };
        }
        await exec('INSERT INTO fiscal_nsdocs_observations (capture_id, fiscal_dfe_document_id, access_key, provider_id, snapshot_json, xml_bucket, xml_key, xml_hash, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [id, existing.id, doc.access_key, doc.provider_id, JSON.stringify({ ...doc, xml_validation: 'identity_checked_signature_unverified' }), xml.bucket, xml.key, xml.hash]);
        await exec('INSERT INTO fiscal_dfe_events (fiscal_dfe_document_id, event_type, event_description, raw_event_json, createdAt, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [existing.id, 'nsdocs_manual_capture', 'Captura manual DEV; identidade conferida, assinatura nao validada.', JSON.stringify({ capture_id: id, xml_bucket: xml.bucket, xml_key: xml.key, xml_hash: xml.hash })]);
        await event(id, 'NSDOCS_NOTA_PERSISTIDA');
      });
    },
    async complete(id, result) {
      await transaction(async () => {
        await exec('UPDATE fiscal_nsdocs_captures SET state = ?, result_json = ?, error_code = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', ['completed', JSON.stringify(result), id]);
        await event(id, 'NSDOCS_CAPTURA_CONCLUIDA');
      });
    },
    async fail(id, code) {
      await transaction(async () => {
        await exec('UPDATE fiscal_nsdocs_captures SET state = ?, error_code = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND state <> ?', ['failed', code, id, 'completed']);
        await event(id, code);
      });
    }
  };
}
module.exports = { createRepository, MIGRATION };
