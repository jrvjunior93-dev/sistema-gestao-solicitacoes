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
  { header: 'Faltas', key: 'faltas', width: 12 },
  { header: 'Horas_Extras', key: 'horas_extras', width: 16 },
  { header: 'Adicional_Noturno', key: 'adicional_noturno', width: 20 },
  { header: 'Adicional_Insalubridade', key: 'adicional_insalubridade', width: 24 },
  { header: 'Adicional_Periculosidade', key: 'adicional_periculosidade', width: 26 },
  { header: 'Bonificacoes', key: 'bonificacoes', width: 16 },
  { header: 'Outros_Acrescimos', key: 'adicionais', width: 20 },
  { header: 'Descontos_Informados', key: 'descontos', width: 22 },
  { header: 'Valor_Informado', key: 'valor_informado', width: 18 },
  { header: 'Observacoes', key: 'observacoes', width: 36 }
];

const CAMPOS_EDITAVEIS = COLUNAS.filter((coluna) => !coluna.protegida).map((coluna) => coluna.key);
const CAMPOS_NUMERICOS = CAMPOS_EDITAVEIS.filter((campo) => campo !== 'observacoes');

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
  return lista.filter((item) => !item.ainda_nao_comecou && normalizarTexto(item.status) === 'ATIVO');
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
  worksheet.autoFilter = { from: 'A1', to: `N${Math.max(1, colaboradores.length + 1)}` };

  const cabecalho = worksheet.getRow(1);
  cabecalho.height = 24;
  cabecalho.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.protection = { locked: true };
  });

  colaboradores
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
    .forEach((colaborador) => {
      const row = worksheet.addRow({
        matricula: colaborador.matricula || '',
        cpf: colaborador.cpf || '',
        nome: colaborador.nome || ''
      });
      row.getCell(1).numFmt = '@';
      row.getCell(2).numFmt = '@';
      COLUNAS.forEach((coluna, index) => {
        row.getCell(index + 1).protection = { locked: Boolean(coluna.protegida) };
      });
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
    if (!CAMPOS_NUMERICOS.some((campo) => temValor(valorDaLinha(linha, campo)))) continue;

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
