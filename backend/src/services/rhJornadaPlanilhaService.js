'use strict';

const ExcelJS = require('exceljs');
const { ValidationError } = require('../middlewares/validation');
const { sheetToJsonRows } = require('../utils/excelWorkbook');
const {
  colaboradoresParaJornada,
  registrarJornada
} = require('./rhJornadaFormularioService');

const COLUNAS = [
  { header: 'Matricula', key: 'matricula', width: 18, protegida: true },
  { header: 'CPF', key: 'cpf', width: 18, protegida: true },
  { header: 'Nome', key: 'nome', width: 36, protegida: true },
  { header: 'Dias_Trabalhados', key: 'dias_trabalhados', width: 20 },
  { header: 'Datas_Trabalhadas', key: 'datas_trabalhadas', width: 48 },
  { header: 'Faltas', key: 'faltas', width: 12 },
  { header: 'Pagamento', key: 'regime_pagamento', width: 18 },
  { header: 'Servico_Executado', key: 'servico_executado', width: 32 },
  { header: 'Valor_Empreitada', key: 'valor_empreitada', width: 20 },
  { header: 'Acrescimos', key: 'adicionais', width: 18 },
  { header: 'Decimo_Terceiro', key: 'decimo_terceiro', width: 20 },
  { header: 'Descontos', key: 'descontos', width: 18 },
  { header: 'Observacoes', key: 'observacoes', width: 36 },
  { header: 'Chave_PIX_Titulo', key: 'chave_pix_titulo', width: 38 },
  { header: 'Beneficiario_PIX', key: 'favorecido_pix_nome', width: 36 },
  { header: 'CPF_Beneficiario_PIX', key: 'favorecido_pix_cpf', width: 24 }
];

const CAMPOS_EDITAVEIS = COLUNAS.filter((coluna) => !coluna.protegida).map((coluna) => coluna.key);
const CAMPOS_NUMERICOS = CAMPOS_EDITAVEIS.filter((campo) => [
  'dias_trabalhados', 'faltas', 'valor_empreitada', 'adicionais', 'decimo_terceiro', 'descontos'
].includes(campo));

function datasDaPlanilha(valor, nome) {
  if (!temValor(valor)) return [];
  const datas = String(valor).split(/[;,]/).map((item) => item.trim()).filter(Boolean).map((item) => {
    const brasileira = item.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return brasileira ? `${brasileira[3]}-${brasileira[2]}-${brasileira[1]}` : item;
  });
  if (datas.length > 31 || datas.some((item) => !/^\d{4}-\d{2}-\d{2}$/.test(item))) {
    throw new ValidationError(`Datas trabalhadas de ${nome} devem estar em AAAA-MM-DD ou DD/MM/AAAA, separadas por ponto e virgula.`);
  }
  return datas;
}

function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function normalizarDocumento(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

function normalizarCabecalho(valor) {
  return normalizarTexto(valor).replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function mapaDaLinha(linha = {}) {
  return Object.entries(linha).reduce((acc, [chave, valor]) => {
    acc[normalizarCabecalho(chave)] = valor;
    return acc;
  }, {});
}

function valorDaLinha(linha, chave) {
  const coluna = COLUNAS.find((item) => item.key === chave);
  return linha[normalizarCabecalho(coluna?.header || chave)];
}

function temValor(valor) {
  return valor !== null && valor !== undefined && String(valor).trim() !== '';
}

function numeroDaPlanilha(valor, campo, nome) {
  if (!temValor(valor)) return 0;
  let texto = String(valor).trim().replace(/\s/g, '');
  if (texto.includes(',') && texto.includes('.')) texto = texto.replace(/\./g, '').replace(',', '.');
  else texto = texto.replace(',', '.');
  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero < 0) {
    throw new ValidationError(`${campo} de ${nome} precisa ser um numero maior ou igual a zero.`);
  }
  return numero;
}

async function colaboradoresAtivosDoPeriodo(dados) {
  const lista = await colaboradoresParaJornada(
    Number(dados.obra_id),
    String(dados.competencia || ''),
    dados
  );
  return lista.filter((item) => !item.ainda_nao_comecou && normalizarTexto(item.status) === 'ATIVO'
    && (!dados.etapa_pagamento || (dados.etapa_pagamento === 'DIARIA'
      ? item.dias_diaria_elegiveis?.length > 0
      : item.forma_calculo_gerencial === 'MENSAL' && item.pagamento_automatico_40_60)));
}

async function gerarModeloJornada(dados = {}) {
  const colaboradores = await colaboradoresAtivosDoPeriodo(dados);
  if (!colaboradores.length) {
    throw new ValidationError('Nenhum colaborador ativo foi encontrado na obra e no periodo selecionados.', 404);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fluxy';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('Jornada');
  worksheet.columns = COLUNAS.map(({ header, key, width }) => ({ header, key, width }));
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  const ultimaColuna = worksheet.getColumn(COLUNAS.length).letter;
  worksheet.autoFilter = { from: 'A1', to: `${ultimaColuna}${Math.max(1, colaboradores.length + 1)}` };

  const cabecalho = worksheet.getRow(1);
  cabecalho.height = 24;
  cabecalho.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.protection = { locked: true };
  });
  worksheet.getColumn('datas_trabalhadas').numFmt = '@';
  worksheet.getColumn('chave_pix_titulo').numFmt = '@';
  worksheet.getColumn('favorecido_pix_cpf').numFmt = '@';
  worksheet.getCell('E1').note = 'Para diaristas, informe as datas efetivamente trabalhadas, separadas por ponto e virgula. Ex.: 2026-10-03;2026-10-07. Para mensalistas, deixe vazio.';

  colaboradores
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
    .forEach((colaborador) => {
      const row = worksheet.addRow({
        matricula: colaborador.matricula || '',
        cpf: colaborador.cpf || '',
        nome: colaborador.nome || '',
        regime_pagamento: 'NORMAL',
        chave_pix_titulo: colaborador.pix_titulo?.chave_pix || ''
      });
      row.getCell(1).numFmt = '@';
      row.getCell(2).numFmt = '@';
      COLUNAS.forEach((coluna, index) => {
        row.getCell(index + 1).protection = { locked: Boolean(coluna.protegida) };
      });
      row.getCell('regime_pagamento').dataValidation = {
        type: 'list', allowBlank: false, formulae: ['"NORMAL,EMPREITADA"']
      };
    });

  await worksheet.protect('fluxy-jornada-modelo', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertRows: false,
    deleteRows: false,
    sort: false,
    autoFilter: true
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function importarJornadaPlanilha(dados = {}, arquivo, contexto = {}) {
  if (!arquivo?.buffer) throw new ValidationError('Selecione a planilha da jornada.');

  const colaboradores = await colaboradoresAtivosDoPeriodo(dados);
  const porCpf = new Map(colaboradores.map((item) => [normalizarDocumento(item.cpf), item]));
  const porMatricula = new Map(colaboradores.map((item) => [normalizarTexto(item.matricula), item]));
  const linhasBrutas = await sheetToJsonRows(arquivo.buffer, {
    filename: arquivo.originalname,
    defval: '',
    raw: false
  });

  const usadas = new Set();
  const linhas = [];
  for (const linhaOriginal of linhasBrutas) {
    const linha = mapaDaLinha(linhaOriginal);
    if (!CAMPOS_NUMERICOS.some((campo) => temValor(valorDaLinha(linha, campo)))
      && !temValor(valorDaLinha(linha, 'datas_trabalhadas'))) continue;

    const cpf = normalizarDocumento(valorDaLinha(linha, 'cpf'));
    const matricula = normalizarTexto(valorDaLinha(linha, 'matricula'));
    const porCpfEncontrado = cpf ? porCpf.get(cpf) : null;
    const porMatriculaEncontrado = matricula ? porMatricula.get(matricula) : null;
    if (porCpfEncontrado && porMatriculaEncontrado
      && Number(porCpfEncontrado.colaborador_id) !== Number(porMatriculaEncontrado.colaborador_id)) {
      throw new ValidationError(`CPF e matricula apontam para colaboradores diferentes na linha de ${valorDaLinha(linha, 'nome') || 'colaborador'}.`);
    }
    const colaborador = porCpfEncontrado || porMatriculaEncontrado;
    if (!colaborador) {
      throw new ValidationError(`Colaborador nao encontrado entre os ativos da obra: ${valorDaLinha(linha, 'nome') || cpf || matricula}.`);
    }
    if (temValor(valorDaLinha(linha, 'nome'))
      && normalizarTexto(valorDaLinha(linha, 'nome')) !== normalizarTexto(colaborador.nome)) {
      throw new ValidationError(`O nome informado nao corresponde ao CPF/matricula de ${colaborador.nome}. Baixe um novo modelo e tente novamente.`);
    }
    if (usadas.has(Number(colaborador.colaborador_id))) {
      throw new ValidationError(`${colaborador.nome} aparece mais de uma vez na planilha.`);
    }
    usadas.add(Number(colaborador.colaborador_id));

    const payload = { colaborador_id: Number(colaborador.colaborador_id) };
    CAMPOS_NUMERICOS.forEach((campo) => {
      payload[campo] = numeroDaPlanilha(valorDaLinha(linha, campo), campo.replace(/_/g, ' '), colaborador.nome);
    });
    payload.regime_pagamento = normalizarTexto(valorDaLinha(linha, 'regime_pagamento') || 'NORMAL');
    payload.servico_executado = String(valorDaLinha(linha, 'servico_executado') || '').trim();
    payload.chave_pix_titulo = String(valorDaLinha(linha, 'chave_pix_titulo') || '').trim();
    payload.favorecido_pix_nome = String(valorDaLinha(linha, 'favorecido_pix_nome') || '').trim();
    payload.favorecido_pix_cpf = normalizarDocumento(valorDaLinha(linha, 'favorecido_pix_cpf'));
    const datas = datasDaPlanilha(valorDaLinha(linha, 'datas_trabalhadas'), colaborador.nome);
    if (dados.etapa_pagamento === 'DIARIA') {
      if (!datas.length) throw new ValidationError(`${colaborador.nome}: informe as datas trabalhadas da diaria.`);
      payload.dias_trabalhados_datas = datas;
      if (!temValor(valorDaLinha(linha, 'dias_trabalhados'))) payload.dias_trabalhados = datas.length;
    } else if (datas.length) {
      throw new ValidationError(`${colaborador.nome}: datas trabalhadas individuais sao exclusivas das diarias.`);
    }
    payload.observacoes = String(valorDaLinha(linha, 'observacoes') || '').trim() || undefined;
    linhas.push(payload);
  }

  if (!linhas.length) {
    throw new ValidationError('Preencha ao menos uma linha da planilha antes de importar.');
  }

  return registrarJornada({
    ...dados,
    origem: 'PLANILHA',
    nome_arquivo: arquivo.originalname,
    linhas
  }, contexto);
}

module.exports = {
  gerarModeloJornada,
  importarJornadaPlanilha
};

if (process.env.NODE_ENV === 'test') module.exports.__test = { COLUNAS, datasDaPlanilha };
