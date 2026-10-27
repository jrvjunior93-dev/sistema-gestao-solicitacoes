'use strict';

const BASE_URL = 'https://api.nsdocs.com.br/v2';
// Identidade exclusivamente sintetica; nao representa cadastro/autorizacao real.
const FIXTURE_COMPANY_CNPJ = '00000000000000';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function readBoolean(value, name) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  return fail(`NSDOCS_CONFIG_${name}_INVALIDO`);
}

function getConfig(env = process.env) {
  const enabled = readBoolean(env.NSDOCS_V2_ENABLED, 'ENABLED');
  if (!enabled) return Object.freeze({ enabled: false, mode: 'disabled', baseUrl: BASE_URL });
  // Nenhum transporte HTTP existe nesta etapa, nem mesmo com uma chave configurada.
  if (env.NSDOCS_V2_MODE !== 'fixture') fail('NSDOCS_TRANSPORTE_REAL_INDISPONIVEL');
  if (env.DEPLOYMENT_ENV !== 'development' || env.NODE_ENV === 'production') {
    fail('NSDOCS_FIXTURE_AMBIENTE_NEGADO');
  }
  if (!readBoolean(env.NSDOCS_V2_FIXTURES_ENABLED, 'FIXTURES_ENABLED')) {
    fail('NSDOCS_FIXTURE_NAO_AUTORIZADA');
  }
  if (!readBoolean(env.FISCAL_MODULE_ENABLED, 'FISCAL_MODULE_ENABLED')) {
    fail('NSDOCS_MODULO_FISCAL_DESLIGADO');
  }
  return Object.freeze({
    enabled: true, mode: 'fixture', baseUrl: BASE_URL,
    companyCnpj: FIXTURE_COMPANY_CNPJ
  });
}

function getDiagnostics(env = process.env) {
  const result = {
    provider: 'nsdocs', api_version: 'v2', mode: 'disabled', enabled: false,
    real_calls_available: false, credentials_used: false, persistence_available: false,
    financial_blocking: false, supported_models: ['NF-e']
  };
  try {
    const config = getConfig(env);
    return { ...result, enabled: config.enabled, mode: config.mode, configuration_valid: true };
  } catch (error) {
    // Somente erros fixos do nosso validador; nunca retornar ambiente/credenciais.
    return { ...result, configuration_valid: false, error_code: error.code };
  }
}

module.exports = { BASE_URL, FIXTURE_COMPANY_CNPJ, fail, getConfig, getDiagnostics };
