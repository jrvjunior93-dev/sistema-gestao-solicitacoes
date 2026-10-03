'use strict';

/**
 * Consulta de CNPJ em serviço externo — DESLIGADA por padrão (20/08).
 *
 * Preencher endereço à mão em 2.428 fornecedores é o que motivou isto. Mas o ambiente deste
 * projeto é offline por decisão do cliente, e ligar uma chamada de saída é decisão de produção,
 * não do código. Por isso:
 *
 * - `CNPJ_LOOKUP_URL` vazia (o padrão) => a rota responde 501 e a tela nem mostra o botão. O
 *   ambiente local segue sem tocar a internet.
 * - a chamada sai do SERVIDOR, nunca do navegador. O endereço do serviço externo fica de um lado
 *   só, e a saída para a internet tem um ponto único para auditar, cachear ou bloquear.
 * - o que sai daqui é apenas o CNPJ consultado. É dado público de empresa — mas é tráfego de
 *   saída, e por isso está escrito.
 *
 * Falha aqui NUNCA impede o cadastro: a consulta preenche o formulário, quem salva é a pessoa.
 * Serviço fora do ar vira aviso na tela, e a digitação manual continua sendo o caminho garantido.
 */

const somenteDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');

function configuracao() {
  const url = String(process.env.CNPJ_LOOKUP_URL || '').trim();
  const timeout = Number(process.env.CNPJ_LOOKUP_TIMEOUT_MS || 8000);
  return {
    url,
    habilitado: Boolean(url),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 8000
  };
}

function erro(mensagem, statusCode) {
  return Object.assign(new Error(mensagem), { statusCode });
}

/**
 * Nomes de campo variam entre provedores (BrasilAPI, ReceitaWS, etc.). Ler várias grafias evita
 * amarrar o sistema a um fornecedor — trocar a URL passa a ser suficiente na maioria dos casos.
 */
function primeiroPreenchido(objeto, chaves) {
  for (const chave of chaves) {
    const valor = objeto?.[chave];
    if (valor !== null && valor !== undefined && String(valor).trim() !== '') return String(valor).trim();
  }
  return '';
}

function normalizarResposta(dados) {
  return {
    nome: primeiroPreenchido(dados, ['razao_social', 'nome', 'nome_empresarial']),
    nome_fantasia: primeiroPreenchido(dados, ['nome_fantasia', 'fantasia']),
    endereco: primeiroPreenchido(dados, ['logradouro', 'descricao_tipo_de_logradouro_e_logradouro', 'street']),
    numero: primeiroPreenchido(dados, ['numero', 'number']),
    complemento: primeiroPreenchido(dados, ['complemento', 'complement']),
    bairro: primeiroPreenchido(dados, ['bairro', 'district', 'neighborhood']),
    cep: somenteDigitos(primeiroPreenchido(dados, ['cep', 'zip_code', 'zipCode'])),
    municipio: primeiroPreenchido(dados, ['municipio', 'cidade', 'city']),
    estado: primeiroPreenchido(dados, ['uf', 'estado', 'state']).toUpperCase().slice(0, 2),
    situacao: primeiroPreenchido(dados, ['descricao_situacao_cadastral', 'situacao', 'status'])
  };
}

async function consultarCnpj(cnpjBruto) {
  const { url, habilitado, timeoutMs } = configuracao();

  if (!habilitado) {
    throw erro(
      'Consulta de CNPJ nao esta habilitada neste ambiente. Preencha os dados manualmente.',
      501
    );
  }

  const cnpj = somenteDigitos(cnpjBruto);
  if (cnpj.length !== 14) {
    throw erro('Informe um CNPJ com 14 digitos.', 400);
  }

  // O `{cnpj}` do template e o unico ponto onde o valor entra na URL — nada de concatenar.
  const alvo = url.includes('{cnpj}') ? url.replace('{cnpj}', cnpj) : `${url.replace(/\/+$/, '')}/${cnpj}`;

  const controlador = new AbortController();
  const relogio = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    const resposta = await fetch(alvo, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controlador.signal
    });

    if (resposta.status === 404) {
      throw erro('CNPJ nao encontrado na base consultada.', 404);
    }
    if (!resposta.ok) {
      throw erro(`Servico de consulta respondeu ${resposta.status}. Preencha os dados manualmente.`, 502);
    }

    const dados = await resposta.json().catch(() => null);
    if (!dados || typeof dados !== 'object') {
      throw erro('Servico de consulta devolveu resposta invalida. Preencha os dados manualmente.', 502);
    }

    return { cnpj, ...normalizarResposta(dados) };
  } catch (falha) {
    if (falha?.statusCode) throw falha;
    if (falha?.name === 'AbortError') {
      throw erro('Servico de consulta nao respondeu a tempo. Preencha os dados manualmente.', 504);
    }
    throw erro('Nao foi possivel consultar o CNPJ. Preencha os dados manualmente.', 502);
  } finally {
    clearTimeout(relogio);
  }
}

module.exports = { consultarCnpj, configuracao, normalizarResposta };
