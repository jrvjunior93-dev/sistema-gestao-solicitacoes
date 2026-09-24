'use strict';

const path = require('path');
const { Op } = require('sequelize');

const BACKEND = path.resolve(__dirname, '..');
const MARCADOR_QA = '[QA_RHDP_DEV]';
const PREFIXO_MATRICULA = 'QA-RHDP-';

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D+/g, '');
}

function calcularDigitoCpf(base, pesoInicial) {
  const soma = base
    .split('')
    .reduce((total, digito, indice) => total + (Number(digito) * (pesoInicial - indice)), 0);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

function gerarCpf(baseNoveDigitos) {
  const base = somenteDigitos(baseNoveDigitos).padStart(9, '0').slice(-9);
  if (/^(\d)\1+$/.test(base)) {
    throw new Error('A base do CPF de teste nao pode repetir o mesmo digito.');
  }
  const primeiro = calcularDigitoCpf(base, 10);
  const segundo = calcularDigitoCpf(`${base}${primeiro}`, 11);
  return `${base}${primeiro}${segundo}`;
}

function dataBrasilia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function competenciaAtual() {
  return dataBrasilia().slice(0, 7);
}

function diaAnterior(dataIso) {
  const [ano, mes, dia] = String(dataIso).split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}

function construirFixtures(competencia) {
  const primeiroDia = `${competencia}-01`;
  const transferencia = `${competencia}-16`;
  const fimPrimeiroVinculo = `${competencia}-15`;
  const demissao = diaAnterior(primeiroDia);

  const base = {
    data_inicio: '2025-01-06',
    data_admissao: '2025-01-06',
    data_nascimento: '1990-05-15',
    carga_horaria_semanal: 44,
    rg: 'QA-RHDP',
    telefone: '27999990000',
    nome_pai: 'Pai de teste QA',
    nome_mae: 'Mae de teste QA',
    endereco: 'Rua de Homologacao',
    numero: '100',
    complemento: 'Ambiente dev',
    bairro: 'Testes',
    municipio: 'Vitoria',
    estado: 'ES',
    cep: '29000000',
    banco: '001 - Banco do Brasil',
    agencia: '1234-5',
    conta: '98765-0',
    conta_tipo: 'SALARIO',
    pix_chave_tipo: 'CPF'
  };

  return [
    {
      chave: 'MENSAL_4060',
      matricula: `${PREFIXO_MATRICULA}001`,
      nome: '[QA DP] Mensal 40/60',
      cpf: gerarCpf('910000001'),
      tipo_vinculo: 'CLT',
      status: 'ATIVO',
      salario_base: 5000,
      valor_contratual: 5000,
      forma_calculo_gerencial: 'MENSAL',
      valor_diaria: null,
      pagamento_automatico_40_60: true,
      obraIndice: 0,
      cargoIndice: 0,
      ...base
    },
    {
      chave: 'CLT_DIARIA',
      matricula: `${PREFIXO_MATRICULA}002`,
      nome: '[QA DP] CLT por diaria',
      cpf: gerarCpf('910000002'),
      tipo_vinculo: 'CLT',
      status: 'ATIVO',
      salario_base: 7200,
      valor_contratual: 7200,
      forma_calculo_gerencial: 'DIARIA',
      valor_diaria: 240,
      pagamento_automatico_40_60: false,
      obraIndice: 0,
      cargoIndice: 0,
      ...base
    },
    {
      chave: 'NAO_CLT_DIARIA',
      matricula: `${PREFIXO_MATRICULA}003`,
      nome: '[QA DP] Nao CLT por diaria',
      cpf: gerarCpf('910000003'),
      tipo_vinculo: 'NAO_CLT',
      status: 'ATIVO',
      salario_base: null,
      valor_contratual: 3960,
      forma_calculo_gerencial: 'DIARIA',
      valor_diaria: 180,
      pagamento_automatico_40_60: false,
      obraIndice: 1,
      cargoIndice: 1,
      ...base
    },
    {
      chave: 'TRANSFERENCIA',
      matricula: `${PREFIXO_MATRICULA}004`,
      nome: '[QA DP] Transferencia na competencia',
      cpf: gerarCpf('910000004'),
      tipo_vinculo: 'CLT',
      status: 'ATIVO',
      salario_base: 4200,
      valor_contratual: 4200,
      forma_calculo_gerencial: 'MENSAL',
      valor_diaria: null,
      pagamento_automatico_40_60: true,
      obraIndice: 1,
      cargoIndice: 0,
      vinculos: [
        { obraIndice: 0, inicio: primeiroDia, fim: fimPrimeiroVinculo, motivo: 'CARGA_INICIAL' },
        { obraIndice: 1, inicio: transferencia, fim: null, motivo: 'TROCA_OBRA' }
      ],
      ...base
    },
    {
      chave: 'AFASTADO',
      matricula: `${PREFIXO_MATRICULA}005`,
      nome: '[QA DP] Retorno de afastamento',
      cpf: gerarCpf('910000005'),
      tipo_vinculo: 'CLT',
      status: 'AFASTADO',
      salario_base: 3800,
      valor_contratual: 3800,
      forma_calculo_gerencial: 'MENSAL',
      valor_diaria: null,
      pagamento_automatico_40_60: true,
      obraIndice: 0,
      cargoIndice: 1,
      ...base
    },
    {
      chave: 'PENSAO',
      matricula: `${PREFIXO_MATRICULA}006`,
      nome: '[QA DP] Pensao alimenticia',
      cpf: gerarCpf('910000006'),
      tipo_vinculo: 'CLT',
      status: 'ATIVO',
      salario_base: 6000,
      valor_contratual: 6000,
      forma_calculo_gerencial: 'MENSAL',
      valor_diaria: null,
      pagamento_automatico_40_60: true,
      obraIndice: 0,
      cargoIndice: 0,
      eventos: [
        {
          codigo: 'PENSAO_ALIMENTICIA',
          descricao: 'Pensao alimenticia QA',
          natureza: 'DESCONTO',
          valor: 900,
          modo_valor: 'PARCELA',
          valor_total: null,
          valor_parcela: 900,
          entra_no_liquido: true,
          parcelas_total: null,
          parcelas_valores_json: null,
          beneficiario_nome: 'Beneficiaria QA DP',
          beneficiario_documento: gerarCpf('920000006'),
          beneficiario_banco: '001 - Banco do Brasil',
          beneficiario_agencia: '4321-0',
          beneficiario_conta: '12345-6',
          beneficiario_tipo_conta: 'CORRENTE',
          beneficiario_chave_pix: gerarCpf('920000006')
        }
      ],
      ...base
    },
    {
      chave: 'PARCELADO',
      matricula: `${PREFIXO_MATRICULA}007`,
      nome: '[QA DP] Evento parcelado editavel',
      cpf: gerarCpf('910000007'),
      tipo_vinculo: 'CLT',
      status: 'ATIVO',
      salario_base: 4500,
      valor_contratual: 4500,
      forma_calculo_gerencial: 'MENSAL',
      valor_diaria: null,
      pagamento_automatico_40_60: true,
      obraIndice: 1,
      cargoIndice: 1,
      eventos: [
        {
          codigo: 'DESCONTO_ADIANTAMENTO',
          descricao: 'Adiantamento parcelado QA',
          natureza: 'DESCONTO',
          valor: 333.33,
          modo_valor: 'TOTAL',
          valor_total: 1000,
          valor_parcela: 333.33,
          entra_no_liquido: true,
          parcelas_total: 3,
          parcelas_valores_json: [333.33, 333.33, 333.34]
        }
      ],
      ...base
    },
    {
      chave: 'INATIVO',
      matricula: `${PREFIXO_MATRICULA}008`,
      nome: '[QA DP] Colaborador desligado',
      cpf: gerarCpf('910000008'),
      tipo_vinculo: 'CLT',
      status: 'INATIVO',
      data_demissao: demissao,
      salario_base: 3500,
      valor_contratual: 3500,
      forma_calculo_gerencial: 'MENSAL',
      valor_diaria: null,
      pagamento_automatico_40_60: false,
      obraIndice: 1,
      cargoIndice: 1,
      vinculoFim: demissao,
      ...base
    }
  ].map((fixture, indice) => ({
    ...fixture,
    telefone: `2799999${String(1000 + indice).slice(-4)}`,
    email: `qa.rhdp.${String(indice + 1).padStart(3, '0')}@example.invalid`,
    conta: `9876${indice + 1}-0`,
    pix_chave: fixture.cpf,
    observacoes: `${MARCADOR_QA} Cenario ${fixture.chave}. Uso exclusivo em desenvolvimento.`
  }));
}

function abortar(mensagem) {
  const erro = new Error(mensagem);
  erro.name = 'ProtecaoDadosDevError';
  throw erro;
}

function carregarEAuditarAmbiente({ aplicar }) {
  const escritaAutorizadaNoComando =
    String(process.env.ALLOW_DEV_TEST_WRITES || '').trim().toLowerCase() === 'true';

  require('dotenv').config({ path: path.join(BACKEND, '.env'), quiet: true });

  const obrigatorias = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const ausentes = obrigatorias.filter((nome) => !String(process.env[nome] || '').trim());
  if (ausentes.length) abortar(`Variaveis obrigatorias ausentes: ${ausentes.join(', ')}.`);

  const hostPermitido = String(process.env.DEV_TEST_ALLOWED_DB_HOST || '').trim();
  const bancoPermitido = String(process.env.DEV_TEST_ALLOWED_DB_NAME || '').trim();
  if (!hostPermitido || !bancoPermitido) {
    abortar('Configure DEV_TEST_ALLOWED_DB_HOST e DEV_TEST_ALLOWED_DB_NAME somente na EC2 dev.');
  }
  if (String(process.env.DB_HOST).trim() !== hostPermitido
      || String(process.env.DB_NAME).trim() !== bancoPermitido) {
    abortar('DB_HOST/DB_NAME nao correspondem ao fingerprint autorizado do banco dev.');
  }

  if (aplicar && !escritaAutorizadaNoComando) {
    abortar('Para gravar, informe ALLOW_DEV_TEST_WRITES=true no mesmo comando da execucao.');
  }

  return {
    host: String(process.env.DB_HOST).trim(),
    banco: String(process.env.DB_NAME).trim()
  };
}

function idsConfigurados(nome) {
  return String(process.env[nome] || '')
    .split(',')
    .map((valor) => Number(valor.trim()))
    .filter((valor) => Number.isInteger(valor) && valor > 0);
}

async function localizarContexto(db, transaction = null) {
  const { Obra, RhEmpresaGrupo, Setor, User } = db;
  const obraIds = idsConfigurados('RHDP_TEST_OBRA_IDS');
  const empresaId = Number(process.env.RHDP_TEST_EMPRESA_ID || 0);
  const setorId = Number(process.env.RHDP_TEST_SETOR_ID || 0);
  const usuarioId = Number(process.env.RHDP_TEST_USUARIO_ID || 0);

  const obras = await Obra.findAll({
    where: {
      ativo: true,
      tipo_centro_custo: 'OBRA',
      ...(obraIds.length ? { id: { [Op.in]: obraIds } } : {})
    },
    order: [['id', 'ASC']],
    limit: obraIds.length || 50,
    transaction
  });

  let obrasSelecionadas = [];
  if (obraIds.length) {
    obrasSelecionadas = obraIds.map((id) => obras.find((obra) => Number(obra.id) === id)).filter(Boolean);
  } else {
    const porEmpresa = new Map();
    for (const obra of obras) {
      const chave = Number(obra.empresa_grupo_id || 0);
      const grupo = porEmpresa.get(chave) || [];
      grupo.push(obra);
      porEmpresa.set(chave, grupo);
    }
    obrasSelecionadas = Array.from(porEmpresa.values()).find((grupo) => grupo.length >= 2)?.slice(0, 2)
      || obras.slice(0, 2);
  }
  if (obrasSelecionadas.length < 2) {
    abortar('Sao necessarias ao menos duas obras ativas do tipo OBRA para os cenarios de teste.');
  }

  const empresaPreferida = empresaId || Number(obrasSelecionadas[0].empresa_grupo_id || 0);
  const empresa = empresaPreferida
    ? await RhEmpresaGrupo.findOne({ where: { id: empresaPreferida, ativo: true }, transaction })
    : await RhEmpresaGrupo.findOne({ where: { ativo: true }, order: [['id', 'ASC']], transaction });
  if (!empresa) abortar('Nenhuma empresa ativa foi localizada para vincular os colaboradores de QA.');

  const setor = setorId
    ? await Setor.findOne({ where: { id: setorId, ativo: true }, transaction })
    : (await Setor.findOne({ where: { ativo: true, eh_setor_obra: true }, order: [['id', 'ASC']], transaction })
      || await Setor.findOne({ where: { ativo: true }, order: [['id', 'ASC']], transaction }));
  if (!setor) abortar('Nenhum setor ativo foi localizado para os colaboradores de QA.');

  const usuario = usuarioId
    ? await User.findOne({ where: { id: usuarioId, ativo: true }, transaction })
    : (await User.findOne({ where: { ativo: true, perfil: 'SUPERADMIN' }, order: [['id', 'ASC']], transaction })
      || await User.findOne({ where: { ativo: true }, order: [['id', 'ASC']], transaction }));
  if (!usuario) abortar('Nenhum usuario ativo foi localizado como responsavel da carga de QA.');

  return { empresa, obras: obrasSelecionadas, setor, usuario };
}

async function garantirCargos(db, transaction) {
  const definicoes = [
    { codigo: 'QA-RHDP-ENG', nome: '[QA DP] Engenheiro de testes', cbo: null, ativo: true },
    { codigo: 'QA-RHDP-AUX', nome: '[QA DP] Auxiliar de testes', cbo: null, ativo: true }
  ];
  const cargos = [];
  for (const definicao of definicoes) {
    // eslint-disable-next-line no-await-in-loop
    const [cargo] = await db.RhCargo.findOrCreate({
      where: { codigo: definicao.codigo },
      defaults: definicao,
      transaction
    });
    // eslint-disable-next-line no-await-in-loop
    await cargo.update({ nome: definicao.nome, ativo: true }, { transaction });
    cargos.push(cargo);
  }
  return cargos;
}

async function garantirParceiro(db, fixture, transaction) {
  let parceiro = await db.Parceiro.findOne({
    where: { cpf_cnpj: fixture.cpf },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (parceiro && parceiro.origem_cadastro !== 'QA_RHDP_DEV'
      && !String(parceiro.nome || '').startsWith('[QA DP]')) {
    abortar(`O CPF ${fixture.cpf} ja pertence ao parceiro real #${parceiro.id}.`);
  }

  const payload = {
    cpf_cnpj: fixture.cpf,
    nome: fixture.nome,
    telefone: fixture.telefone,
    email: fixture.email,
    rg: fixture.rg,
    data_nascimento: fixture.data_nascimento,
    profissao: fixture.cargo,
    endereco: fixture.endereco,
    numero: fixture.numero,
    complemento: fixture.complemento,
    bairro: fixture.bairro,
    cep: fixture.cep,
    municipio: fixture.municipio,
    estado: fixture.estado,
    tipo_pessoa: 'F',
    cliente: false,
    fornecedor: true,
    corretor: false,
    testemunha: false,
    cadastro_incompleto: false,
    origem_cadastro: 'QA_RHDP_DEV',
    pix_chave_fixa_1_tipo: 'CPF',
    pix_chave_fixa_1: fixture.cpf,
    ativo: true
  };

  if (!parceiro) parceiro = await db.Parceiro.create(payload, { transaction });
  else await parceiro.update(payload, { transaction });
  return parceiro;
}

async function garantirVinculos(db, colaborador, fixture, contexto, transaction) {
  const vinculos = fixture.vinculos || [{
    obraIndice: fixture.obraIndice,
    inicio: fixture.data_admissao,
    fim: fixture.vinculoFim || null,
    motivo: fixture.vinculoFim ? 'DEMISSAO' : 'CARGA_INICIAL'
  }];

  for (let indice = 0; indice < vinculos.length; indice += 1) {
    const definicao = vinculos[indice];
    const observacoes = `${MARCADOR_QA} ${fixture.chave} vinculo ${indice + 1}.`;
    // eslint-disable-next-line no-await-in-loop
    let vinculo = await db.RhColaboradorVinculo.findOne({
      where: { colaborador_id: colaborador.id, observacoes },
      transaction
    });
    const payload = {
      colaborador_id: colaborador.id,
      obra_id: contexto.obras[definicao.obraIndice].id,
      setor_id: contexto.setor.id,
      vigencia_inicio: definicao.inicio,
      vigencia_fim: definicao.fim,
      motivo: definicao.motivo,
      solicitacao_id: null,
      observacoes,
      criado_por: contexto.usuario.id
    };
    // eslint-disable-next-line no-await-in-loop
    if (!vinculo) vinculo = await db.RhColaboradorVinculo.create(payload, { transaction });
    // eslint-disable-next-line no-await-in-loop
    else await vinculo.update(payload, { transaction });
  }
}

async function garantirSalario(db, colaborador, fixture, contexto, transaction) {
  if (!(Number(fixture.salario_base) > 0)) return;
  const observacoes = `${MARCADOR_QA} ${fixture.chave} salario inicial.`;
  let salario = await db.RhColaboradorSalario.findOne({
    where: { colaborador_id: colaborador.id, observacoes },
    transaction
  });
  const payload = {
    colaborador_id: colaborador.id,
    valor: fixture.salario_base,
    vigencia_inicio: fixture.data_admissao,
    vigencia_fim: null,
    motivo: 'CARGA_INICIAL',
    solicitacao_id: null,
    observacoes,
    criado_por: contexto.usuario.id
  };
  if (!salario) salario = await db.RhColaboradorSalario.create(payload, { transaction });
  else await salario.update(payload, { transaction });
}

async function garantirEventos(db, colaborador, fixture, contexto, competencia, transaction) {
  for (const eventoDefinicao of fixture.eventos || []) {
    const observacoes = `${MARCADOR_QA} ${fixture.chave} evento ${eventoDefinicao.codigo}.`;
    // eslint-disable-next-line no-await-in-loop
    let evento = await db.RhEventoRecorrente.findOne({
      where: { colaborador_id: colaborador.id, observacoes },
      transaction
    });
    const payload = {
      colaborador_id: colaborador.id,
      ...eventoDefinicao,
      forma: 'VALOR_FIXO',
      competencia_inicio: competencia,
      competencia_fim: null,
      ativo: true,
      solicitacao_id: null,
      observacoes,
      criado_por: contexto.usuario.id
    };
    // eslint-disable-next-line no-await-in-loop
    if (!evento) evento = await db.RhEventoRecorrente.create(payload, { transaction });
    // eslint-disable-next-line no-await-in-loop
    else await evento.update(payload, { transaction });
  }
}

async function garantirColaborador(db, fixture, contexto, cargos, competencia, transaction) {
  let colaborador = await db.RhColaborador.findOne({
    where: {
      [Op.or]: [{ matricula: fixture.matricula }, { cpf: fixture.cpf }]
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (colaborador && colaborador.matricula !== fixture.matricula) {
    abortar(`O CPF ${fixture.cpf} ja pertence ao colaborador #${colaborador.id}.`);
  }
  if (colaborador && !String(colaborador.observacoes || '').includes(MARCADOR_QA)) {
    abortar(`A matricula ${fixture.matricula} ja existe sem o marcador de QA.`);
  }

  const obra = contexto.obras[fixture.obraIndice];
  const cargo = cargos[fixture.cargoIndice];
  const parceiro = await garantirParceiro(db, { ...fixture, cargo: cargo.nome }, transaction);
  const payload = {
    empresa_grupo_id: contexto.empresa.id,
    obra_id: obra.id,
    setor_id: contexto.setor.id,
    nome: fixture.nome,
    cpf: fixture.cpf,
    parceiro_id: parceiro.id,
    matricula: fixture.matricula,
    rg: fixture.rg,
    telefone: fixture.telefone,
    email: fixture.email,
    cargo: cargo.nome,
    cargo_id: cargo.id,
    carga_horaria_semanal: fixture.carga_horaria_semanal,
    tipo_vinculo: fixture.tipo_vinculo,
    data_inicio: fixture.data_inicio,
    data_admissao: fixture.data_admissao,
    data_demissao: fixture.data_demissao || null,
    data_nascimento: fixture.data_nascimento,
    status: fixture.status,
    salario_base: fixture.salario_base,
    valor_contratual: fixture.valor_contratual,
    forma_calculo_gerencial: fixture.forma_calculo_gerencial,
    valor_diaria: fixture.valor_diaria,
    pagamento_automatico_40_60: fixture.pagamento_automatico_40_60,
    observacoes: fixture.observacoes,
    nome_pai: fixture.nome_pai,
    nome_mae: fixture.nome_mae,
    endereco: fixture.endereco,
    numero: fixture.numero,
    complemento: fixture.complemento,
    bairro: fixture.bairro,
    municipio: fixture.municipio,
    estado: fixture.estado,
    cep: fixture.cep,
    banco: fixture.banco,
    agencia: fixture.agencia,
    conta: fixture.conta,
    conta_tipo: fixture.conta_tipo,
    pix_chave_tipo: fixture.pix_chave_tipo,
    pix_chave: fixture.pix_chave,
    responsavel_contratacao_id: contexto.usuario.id,
    criado_por: contexto.usuario.id,
    atualizado_por: contexto.usuario.id
  };

  if (!colaborador) colaborador = await db.RhColaborador.create(payload, { transaction });
  else await colaborador.update(payload, { transaction });

  const pagamentoPayload = {
    colaborador_id: colaborador.id,
    favorecido_nome: fixture.nome,
    favorecido_documento: fixture.cpf,
    banco: fixture.banco,
    agencia: fixture.agencia,
    conta: fixture.conta,
    tipo_conta: fixture.conta_tipo,
    chave_pix: fixture.cpf,
    chave_pix_secundaria: fixture.email,
    chave_pix_variavel: `QA-${fixture.chave}-${competencia}`,
    observacoes: `${MARCADOR_QA} Dados de pagamento para homologacao.`
  };
  const pagamento = await db.RhColaboradorPagamento.findOne({
    where: { colaborador_id: colaborador.id },
    transaction
  });
  if (!pagamento) await db.RhColaboradorPagamento.create(pagamentoPayload, { transaction });
  else await pagamento.update(pagamentoPayload, { transaction });

  await garantirVinculos(db, colaborador, fixture, contexto, transaction);
  await garantirSalario(db, colaborador, fixture, contexto, transaction);
  await garantirEventos(db, colaborador, fixture, contexto, competencia, transaction);
  return colaborador;
}

async function main() {
  const aplicar = process.argv.includes('--apply');
  const ambiente = carregarEAuditarAmbiente({ aplicar });
  const competencia = String(process.env.RHDP_TEST_COMPETENCIA || competenciaAtual()).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) {
    abortar('RHDP_TEST_COMPETENCIA deve estar no formato AAAA-MM.');
  }

  const { assertMigrationsUpToDate } = require(path.join(BACKEND, 'src/database/runMigrations'));
  await assertMigrationsUpToDate();
  const db = require(path.join(BACKEND, 'src/models'));
  const fixtures = construirFixtures(competencia);

  try {
    const contexto = await localizarContexto(db);
    const existentes = await db.RhColaborador.findAll({
      where: { matricula: { [Op.like]: `${PREFIXO_MATRICULA}%` } },
      attributes: ['id', 'matricula', 'nome', 'status'],
      order: [['matricula', 'ASC']]
    });

    console.log(`Banco dev validado: ${ambiente.host}/${ambiente.banco}`);
    console.log(`Competencia dos cenarios: ${competencia}`);
    console.table({
      empresa: `${contexto.empresa.id} - ${contexto.empresa.nome}`,
      obra_1: `${contexto.obras[0].id} - ${contexto.obras[0].codigo || ''} ${contexto.obras[0].nome}`.trim(),
      obra_2: `${contexto.obras[1].id} - ${contexto.obras[1].codigo || ''} ${contexto.obras[1].nome}`.trim(),
      setor: `${contexto.setor.id} - ${contexto.setor.nome}`,
      responsavel: `${contexto.usuario.id} - ${contexto.usuario.nome}`
    });

    if (!aplicar) {
      console.log('SIMULACAO: nenhuma alteracao foi realizada.');
      console.table(fixtures.map((fixture) => ({
        matricula: fixture.matricula,
        cenario: fixture.chave,
        nome: fixture.nome,
        vinculo: fixture.tipo_vinculo,
        calculo: fixture.forma_calculo_gerencial,
        status: fixture.status,
        ja_existe: existentes.some((item) => item.matricula === fixture.matricula) ? 'SIM' : 'NAO'
      })));
      console.log('Para aplicar: ALLOW_DEV_TEST_WRITES=true npm run dados-dev:rhdp-pessoal:aplicar');
      return;
    }

    const resultado = await db.sequelize.transaction(async (transaction) => {
      const contextoBloqueado = await localizarContexto(db, transaction);
      const cargos = await garantirCargos(db, transaction);
      const colaboradores = [];
      for (const fixture of fixtures) {
        // eslint-disable-next-line no-await-in-loop
        const colaborador = await garantirColaborador(
          db,
          fixture,
          contextoBloqueado,
          cargos,
          competencia,
          transaction
        );
        colaboradores.push({ fixture, colaborador });
      }
      return colaboradores;
    });

    console.log('CARGA CONCLUIDA: cenarios criados/atualizados sem apagar dados existentes.');
    console.table(resultado.map(({ fixture, colaborador }) => ({
      id: colaborador.id,
      matricula: fixture.matricula,
      nome: fixture.nome,
      cenario: fixture.chave,
      obra_id: colaborador.obra_id,
      status: colaborador.status
    })));
  } finally {
    await db.sequelize.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`popularPessoalDev: ${error.name || 'Erro'}: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  MARCADOR_QA,
  PREFIXO_MATRICULA,
  construirFixtures,
  gerarCpf
};
