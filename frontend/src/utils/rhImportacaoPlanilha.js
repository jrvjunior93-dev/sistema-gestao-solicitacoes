export function buildRhImportTemplateRows(tipo) {
  if (tipo === 'JORNADA') {
    return [
      ['Matricula', 'CPF', 'Dias_Trabalhados', 'Faltas', 'Horas_Extras', 'Adicionais', 'Descontos_Informados', 'Valor_Informado', 'Observacoes'],
      ['MAT-001', '12345678909', '22', '0', '8', '250,00', '0,00', '', 'Competencia regular']
    ];
  }

  if (tipo === 'EVENTO_VARIAVEL') {
    return [
      ['Matricula', 'CPF', 'Codigo_Evento', 'Descricao_Evento', 'Natureza', 'Valor', 'Referencia', 'Observacoes'],
      ['MAT-001', '12345678909', 'HE50', 'Hora extra 50%', 'CREDITO', '480,00', 'Abril/2026', 'Lote complementar']
    ];
  }

  return [
    ['Matricula', 'CPF', 'Codigo_Evento', 'Descricao_Evento', 'Valor', 'Referencia', 'Observacoes'],
    ['MAT-001', '12345678909', 'DESC-ADIANT', 'Desconto de adiantamento', '300,00', 'Abril/2026', 'Importado pela contabilidade']
  ];
}

export function downloadRhImportTemplate(tipo) {
  const rows = buildRhImportTemplateRows(tipo);
  const csv = rows
    .map((cols) => cols.map((item) => `"${String(item).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `modelo-rh-importacao-${String(tipo || 'dados').toLowerCase()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
