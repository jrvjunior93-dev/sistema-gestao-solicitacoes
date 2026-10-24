const cell=value=>{
  let raw=String(value??'');
  if(/^[\s]*[=+@\-\t\r]/.test(raw))raw="'"+raw;
  return '"'+raw.replace(/"/g,'""')+'"';
};
export function csvPedidosLocalizados(rows){
  const header=['Pedido','Solicitação','SC','Descrição da solicitação','Número externo','Fornecedor','Obra','Itens ativos','Status','Valor aquisição','Valor fornecedor','Criado em'];
  const data=rows.map(r=>[r.codigo,r.solicitacao_codigo,r.solicitacao_compra_codigo,r.solicitacao_titulo||r.solicitacao_descricao,
    r.numero_pedido_externo||r.numero_sienge,r.fornecedor,r.obra,(r.itens||[]).map(i=>i.descricao+' ('+i.quantidade_pedido+' '+(i.unidade||'')+')').join(' | '),
    r.status,String(r.valor_total??'').replace('.',','),String(r.valor_total_fornecedor??'').replace('.',','),r.criado_em]);
  return '\ufeff'+[header,...data].map(row=>row.map(cell).join(';')).join('\r\n');
}
