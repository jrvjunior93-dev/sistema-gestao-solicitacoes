import { useEffect, useState } from 'react';
import ParceiroBuscaRemota from '../solicitacoes/ParceiroBuscaRemota';
import { getFormasPagamentoFinanceiras } from '../../services/financeiro';
import { formaPagamentoEhPix, formaPagamentoEhBoleto } from '../../utils/formaPagamento';
import { PIX_TEXTO_MAX } from '../../utils/pix';

export function pagamentoNegociacaoForm(pagamento, titulo = {}) {
  return { forma_pagamento_id: String(pagamento?.forma_pagamento_id || titulo.forma_pagamento_id || ''),
    favorecido: pagamento?.favorecido_id ? { id: pagamento.favorecido_id, nome: pagamento.nome_favorecido, cpf_cnpj: pagamento.cpf_cnpj }
      : titulo.favorecidoPagamento || (titulo.parceiro_id ? { id: titulo.parceiro_id, nome: titulo.parceiro?.nome || 'Credor do titulo' } : null),
    chave_pix: pagamento?.favorecido_chave_pix || '', dados_pagamento: pagamento?.dados_pagamento || '' };
}
export const pagamentoNegociacaoPayload = form => ({ forma_pagamento_id: Number(form?.forma_pagamento_id || 0),
  favorecido_id: form?.favorecido?.id ? Number(form.favorecido.id) : null,
  chave_pix: form?.chave_pix || '', dados_pagamento: form?.dados_pagamento || '' });

export default function NegociacaoPagamentoFields({ value, onChange, tipo = 'PAGAR', disabled = false }) {
  const [formas, setFormas] = useState([]), [erro, setErro] = useState(''), [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    setErro('');
    getFormasPagamentoFinanceiras({ signal: controller.signal }).then(data => {
      if (ativo) setFormas((Array.isArray(data) ? data : []).filter(f => f.ativo !== false && !`${f.codigo} ${f.tipo} ${f.nome}`.toUpperCase().includes('FOPAG')));
    }).catch(() => { if (ativo) setErro('Nao foi possivel consultar as formas de pagamento.'); }).finally(() => clearTimeout(timer));
    return () => { ativo = false; clearTimeout(timer); controller.abort(); };
  }, [tentativa]);
  const forma = formas.find(f => String(f.id) === String(value.forma_pagamento_id));
  const pix = formaPagamentoEhPix(forma), boleto = formaPagamentoEhBoleto(forma);
  return <fieldset disabled={disabled} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
    <legend className="mb-2 text-sm font-semibold">Forma e dados de pagamento</legend>
    {erro && <div role="alert" className="sm:col-span-2">{erro}{' '}
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setTentativa(v => v + 1)}>Consultar formas novamente</button>
    </div>}
    <label>Forma de pagamento *<select aria-label="Forma de pagamento" className="input mt-1 w-full" value={value.forma_pagamento_id} required onChange={e => onChange({ forma_pagamento_id: e.target.value, chave_pix: '' })}>
      <option value="">Selecione</option>{formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
    </select></label>
    {tipo === 'PAGAR' && <ParceiroBuscaRemota label="Favorecido do pagamento" obrigatorio selecionado={value.favorecido}
      onSelecionar={favorecido => onChange({ favorecido: favorecido ? { id: favorecido.id, nome: favorecido.nome, cpf_cnpj: favorecido.cpf_cnpj } : null })} />}
    {pix && <label className="sm:col-span-2">Chave PIX ou copia e cola *<textarea aria-label="Chave PIX ou copia e cola" className="input mt-1 w-full" rows={2} maxLength={PIX_TEXTO_MAX} required value={value.chave_pix} onChange={e => onChange({ chave_pix: e.target.value })} /></label>}
    <label className="sm:col-span-2">Dados para pagamento{forma && !pix && !boleto ? ' *' : ''}
      <textarea aria-label="Dados para pagamento" className="input mt-1 w-full" rows={2} maxLength={2000} value={value.dados_pagamento} onChange={e => onChange({ dados_pagamento: e.target.value })}
        placeholder={boleto ? 'Instrucoes do boleto. Linha digitavel e cobranca continuam na area de boleto do titulo.' : 'Informe os dados combinados para este pagamento.'} />
    </label>
    <p className="sm:col-span-2 text-xs text-[var(--c-muted)]">Instrucao prevista: nao registra baixa, nao altera o cadastro de Pessoas e nao gera fatura ou pagamento bancario.</p>
  </fieldset>;
}
