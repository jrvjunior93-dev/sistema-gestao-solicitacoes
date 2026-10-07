const ExcelJS = require('exceljs');

// Uma unica coluna de regime evita conflitos entre flags "diarista" e "mensalista".
const COLUNAS = [
  ['Nome', c => c.nome], ['CPF', c => c.cpf], ['Matricula', c => c.matricula],
  ['Empresa_Codigo', c => c.empresaGrupo?.codigo], ['Obra_Codigo', c => c.obra?.codigo],
  ['Setor_Codigo', c => c.setor?.codigo], ['Cargo', c => c.cargo], ['Tipo_Vinculo', c => c.tipo_vinculo],
  ['Data_Admissao', c => c.data_admissao || c.data_inicio], ['Data_Demissao', c => c.data_demissao],
  ['Status', c => c.status], ['Salario_Base', c => c.salario_base, 'numero'],
  ['Valor_Contratual', c => c.valor_contratual, 'numero'],
  ['Tipo_Pagamento', c => c.forma_calculo_gerencial === 'DIARIA' ? 'DIARISTA' : 'MENSALISTA'],
  ['Valor_Diaria', c => c.valor_diaria, 'numero'],
  ['Pagamento_Automatico_40_60', c => c.pagamento_automatico_40_60 ? 'SIM' : 'NAO'],
  ['Calculo_Vigencia_Inicio', () => ''], ['Valor_Ticket', c => c.valor_ticket, 'numero'],
  ['Banco', c => c.pagamento?.banco || c.banco], ['Agencia', c => c.pagamento?.agencia || c.agencia],
  ['Conta', c => c.pagamento?.conta || c.conta], ['Tipo_Conta', c => c.pagamento?.tipo_conta || c.tipo_conta],
  ['Favorecido_Nome', c => c.pagamento?.favorecido_nome],
  ['Favorecido_Documento', c => c.pagamento?.favorecido_documento],
  ['Chave_PIX', c => c.pagamento?.chave_pix || c.chave_pix],
  ['Chave_PIX_Secundaria', c => c.pagamento?.chave_pix_secundaria || c.chave_pix_secundaria],
  ['Chave_PIX_Variavel', c => c.pagamento?.chave_pix_variavel || c.chave_pix_variavel],
  ['Telefone', c => c.telefone], ['Email', c => c.email], ['Observacoes', c => c.observacoes],
  ['Colaborador_ID', c => c.id], ['Empresa_Nome', c => c.empresaGrupo?.nome],
  ['Obra_Nome', c => c.obra?.nome], ['Setor_Nome', c => c.setor?.nome],
  ['RG', c => c.rg], ['Data_Nascimento', c => c.data_nascimento]
];

async function gerarPlanilhaColaboradores(colaboradores = []) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Fluxy';
  const ws = wb.addWorksheet('Colaboradores', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
  ws.columns = COLUNAS.map(([header, , tipo]) => ({ header, width: header === 'Nome' ? 36 : Math.max(18, header.length + 2), style: { numFmt: tipo === 'numero' ? '#,##0.00' : '@' } }));
  for (const colaborador of colaboradores) {
    const c = typeof colaborador.toJSON === 'function' ? colaborador.toJSON() : colaborador;
    ws.addRow(COLUNAS.map(([, obter, tipo]) => {
      const value = obter(c);
      if (value === null || value === undefined || value === '') return null;
      // Texto literal: preserva zeros de CPF/conta e nunca vira formula do Excel.
      return tipo === 'numero' ? Number(value) : String(value);
    }));
  }
  ws.autoFilter = { from: 'A1', to: { row: Math.max(1, ws.rowCount), column: COLUNAS.length } };
  ws.getRow(1).height = 30;
  ws.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF244675' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  for (const [header, valores] of [
    ['Tipo_Pagamento', 'MENSALISTA,DIARISTA'], ['Pagamento_Automatico_40_60', 'SIM,NAO'],
    ['Tipo_Vinculo', 'CLT,NAO_CLT'], ['Status', 'ATIVO,INATIVO,AFASTADO']
  ]) {
    const column = COLUNAS.findIndex(([nome]) => nome === header) + 1;
    ws.dataValidations.add(`${ws.getColumn(column).letter}2:${ws.getColumn(column).letter}${Math.max(1001, ws.rowCount)}`, {
      type: 'list', allowBlank: true, formulae: [`"${valores}"`], showErrorMessage: true,
      errorStyle: 'stop', errorTitle: 'Valor invalido', error: `Use ${valores.replace(/,/g, ' ou ')}.`
    });
  }
  const info = wb.addWorksheet('Orientacoes');
  info.columns = [{ header: 'Campo / processo', width: 30 }, { header: 'Orientacao', width: 110 }];
  info.addRows([
    ['Exportacao', 'Inclui todos os cadastros autorizados, inclusive inativos e afastados. Nao aplica os filtros da tela. Dados pessoais: compartilhe somente com pessoas autorizadas.'],
    ['Modelo preenchido', 'Baixar modelo tambem inclui os colaboradores cadastrados. Revise os campos de calculo e reimporte mantendo o CPF para atualizar o cadastro sem duplicidade.'],
    ['Tipo_Pagamento', 'Preencha MENSALISTA ou DIARISTA. O modelo antigo com Forma_Calculo_Gerencial MENSAL/DIARIA continua aceito.'],
    ['Valor_Diaria', 'Informe um valor positivo para DIARISTA. Celula vazia preserva o valor de quem ja esta cadastrado.'],
    ['Pagamento_Automatico_40_60', 'SIM ou NAO; diarista nao pode usar o pagamento automatico 40/60.'],
    ['Calculo_Vigencia_Inicio', 'Data AAAA-MM-DD (ou DD/MM/AAAA) de inicio da alteracao. Obrigatoria para mudar o calculo quando o historico por vigencia esta ativo; deve respeitar o historico existente.'],
    ['Reimportacao', 'Localiza pelo CPF. Atualiza somente Tipo_Pagamento, Valor_Diaria e Pagamento_Automatico_40_60. Valores em branco preservam o cadastro; linhas sem mudancas sao ignoradas.'],
    ['Dados preservados', 'Para cadastrados, nao altera salario, empresa, obra, vinculo, identidade ou dados bancarios. Esses ajustes mantem os fluxos proprios.'],
    ['Novos colaboradores', 'Informe Nome, CPF, Empresa_Codigo e Tipo_Vinculo. Obra/Setor usam os codigos cadastrados. Nao inclua linhas de exemplo.'],
    ['Identificacao', 'CPF, matricula, agencia e conta sao texto para preservar zeros iniciais. Colaborador_ID e nomes de empresa/obra/setor sao informativos.'],
    ['Resultado', 'A importacao retorna criados, atualizados, ignorados e erros por linha. Linhas validas sao processadas mesmo se outras contiverem erros.']
  ]);
  info.getRow(1).font = { bold: true };
  info.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true }; row.height = row.number === 1 ? 24 : 48; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { gerarPlanilhaColaboradores, COLUNAS };
