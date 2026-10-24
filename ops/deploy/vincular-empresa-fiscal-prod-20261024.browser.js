// Executar SOMENTE no Console do navegador autenticado em csc.jrfluxy.com.br.
// Nao executar em CMD/SSH/Node. Usa o wrapper da sessao: sem copiar tokens.
(async () => {
  let stage = 'ORIGEM_PRODUCAO', httpStatus = null, locked = false;
  const lock = '__fluxyFiscalProdCompanyLinkBusy';
  const check = value => { if (!value) throw Error('CONFERENCIA_NAO_APROVADA'); };
  const digits = value => String(value || '').replace(/\D/g, '');
  const enabled = value => value === true || value === 1 || value === '1';
  try {
    check(location.origin === 'https://csc.jrfluxy.com.br'
      && window.__fluxyFetchSecurityInstalled === true && !window[lock]);
    window[lock] = true; locked = true;
    const api = 'https://api.jrfluxy.com.br/api';
    async function request(url, options = {}) {
      const response = await fetch(url, { ...options, credentials: 'include', redirect: 'error', cache: 'no-store' });
      httpStatus = response.status; check(response.ok); return response.json();
    }
    stage = 'CONFERIR_EMPRESA_OPERACIONAL';
    const companies = await request(api + '/empresas-grupo');
    check(Array.isArray(companies));
    const matches = companies.filter(c => digits(c.cnpj) === '27123008000100' && enabled(c.ativo));
    check(matches.length === 1 && Number(matches[0].id) === 1);
    stage = 'CONFERIR_EMPRESA_FISCAL';
    const read = async () => {
      const data = await request(api + '/fiscal/companies?q=27123008000100&limit=100');
      const rows = data.data?.filter(c => Number(c.id) === 1);
      check(rows?.length === 1); return rows[0];
    };
    const before = await read();
    check(digits(before.cnpj) === '27123008000100' && before.uf === 'ES' && enabled(before.ativo)
      && enabled(before.modulo_fiscal_habilitado) && [null, undefined, 1, '1'].includes(before.empresa_id));
    const already = Number(before.empresa_id) === 1;
    if (!already) {
      stage = 'VINCULAR_SOMENTE_EMPRESA_ID';
      await request(api + '/fiscal/companies/1', { method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa_id: 1 }) });
    }
    stage = 'CONFERIR_VINCULO_SALVO';
    const after = await read();
    check(Number(after.empresa_id) === 1 && Number(after.empresa?.id) === 1
      && digits(after.empresa.cnpj) === '27123008000100');
    for (const key of ['id','razao_social','nome_fantasia','cnpj','uf','inscricao_estadual',
      'ambiente_sefaz','ativo','modulo_fiscal_habilitado','observacoes','createdAt','created_by']) {
      check(JSON.stringify(before[key]) === JSON.stringify(after[key]));
    }
    console.log(JSON.stringify({ outcome: 'VINCULO_FISCAL_PROD_CONFERIDO', fiscal_company_id: 1,
      company_id: 1, company_cnpj: '27123008000100', ja_estava_vinculado: already,
      configuracao_fiscal_preservada: true, external_nsdocs_calls: 0 }));
  } catch {
    console.log(JSON.stringify({ outcome: 'VINCULO_FISCAL_PROD_INTERROMPIDO', etapa: stage,
      http_status: httpStatus }));
  } finally { if (locked) delete window[lock]; }
})();
