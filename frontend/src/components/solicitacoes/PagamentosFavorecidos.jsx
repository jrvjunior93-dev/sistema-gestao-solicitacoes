import { useId, useState } from 'react';
import { HiOutlinePlus, HiOutlineXMark, HiPaperClip } from 'react-icons/hi2';
import ParceiroBuscaRemota from './ParceiroBuscaRemota';
import CadastroRapidoFavorecidoButton from './CadastroRapidoFavorecidoButton';
import PendingAttachmentsList from '../attachments/PendingAttachmentsList';
import { chavePixPreferencial, formaPagamentoEhBoleto, formaPagamentoEhPix } from '../../utils/formaPagamento';
import { formatCurrencyInput, normalizeCurrencyTyping, parseCurrencyInput } from '../../utils/formatters';
import { arquivoDocumentoPermitido, concatenarAnexosPendentes } from '../../utils/pendingAttachments';
import { PIX_TEXTO_MAX } from '../../utils/pix';

let sequencia = 0;
export const novaParteFavorecido = (dados = {}) => ({
  chave: `favorecido-${++sequencia}`, parceiro: null, valor: '', forma_pagamento_id: '',
  favorecido_chave_pix: '', dados_pagamento: '', boletos: [], ...dados
});
export function payloadFavorecidos(linhas) {
  return linhas.map(l => ({
    ...(l.contrato_parcela_id ? { contrato_parcela_id: Number(l.contrato_parcela_id) } : {}),
    favorecido_id: Number(l.parceiro?.id), forma_pagamento_id: Number(l.forma_pagamento_id),
    valor: parseCurrencyInput(l.valor), favorecido_chave_pix: l.favorecido_chave_pix || null,
    dados_pagamento: l.dados_pagamento || null, boleto_nomes: (l.boletos || []).map(a => a.nome)
  }));
}
export function erroDivisaoFavorecidos(linhas, formas, totais) {
  if (!linhas) return null;
  if (linhas.length < 2 || linhas.length > 50) return 'Informe entre 2 e 50 pagamentos.';
  const somas = new Map(); const nomes = new Set(); const chaves = new Set();
  for (const [index, l] of linhas.entries()) {
    const forma = formas.find(f => String(f.id) === String(l.forma_pagamento_id));
    const cent = Math.round(parseCurrencyInput(l.valor) * 100);
    const parcela = Number(l.contrato_parcela_id || 0);
    if (!l.parceiro?.id || !forma || !Number.isSafeInteger(cent) || cent <= 0) return `Favorecido ${index + 1}: informe pessoa, valor e forma de pagamento.`;
    const chave = `${parcela}:${l.parceiro.id}:${forma.id}`;
    if (chaves.has(chave)) return 'Consolide o valor do favorecido repetido na mesma forma e parcela.';
    chaves.add(chave);
    if (formaPagamentoEhPix(forma) && !l.favorecido_chave_pix?.trim()) return `Favorecido ${index + 1}: informe a chave PIX.`;
    if (formaPagamentoEhBoleto(forma) && !l.boletos?.length) return `Favorecido ${index + 1}: anexe os boletos.`;
    if (!formaPagamentoEhPix(forma) && !formaPagamentoEhBoleto(forma) && !l.dados_pagamento?.trim()) return `Favorecido ${index + 1}: informe os dados para pagamento.`;
    for (const a of l.boletos || []) {
      if (nomes.has(a.nome)) return 'Use nomes distintos nos boletos de cada favorecido.';
      nomes.add(a.nome);
    }
    somas.set(parcela, (somas.get(parcela) || 0) + cent);
  }
  if (somas.size !== totais.length || totais.some(t => somas.get(Number(t.id || 0)) !== Math.round(Number(t.valor) * 100))) return 'A soma dos favorecidos deve ser igual ao valor solicitado em cada parcela.';
  return null;
}

// Somente inputs locais. Buscar/cadastrar pessoas continua pelos endpoints e
// permissoes existentes; dados financeiros nunca sao gravados por este componente.
export default function PagamentosFavorecidos({ linhas, onChange, formas, parcelas = [], cadastro = {}, disabled = false, onCancelar }) {
  const id = useId(); const [erroArquivo, setErroArquivo] = useState('');
  const alterar = (chave, patch) => onChange(linhas.map(l => l.chave === chave ? { ...l, ...patch } : l));
  return <fieldset disabled={disabled} className="min-w-0 space-y-3" aria-label="Divisão entre favorecidos">
    {linhas.map((l, index) => {
      const forma = formas.find(f => String(f.id) === String(l.forma_pagamento_id));
      const pix = formaPagamentoEhPix(forma); const boleto = formaPagamentoEhBoleto(forma);
      const escolher = parceiro => alterar(l.chave, { parceiro, favorecido_chave_pix: pix ? chavePixPreferencial(parceiro) : '' });
      return <div key={l.chave} className="border-t border-[var(--c-border)] pt-3 min-w-0" data-testid="parte-favorecido">
        <div className="flex items-center justify-between mb-2"><span className="text-sm font-semibold">Favorecido {index + 1}</span>
          {index > 0 && <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remover favorecido ${index + 1}`} onClick={() => linhas.length === 2 ? onCancelar?.() : onChange(linhas.filter(p => p.chave !== l.chave))}><HiOutlineXMark className="h-4 w-4" /></button>}
        </div>
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <ParceiroBuscaRemota label={`Favorecido ${index + 1}`} obrigatorio selecionado={l.parceiro} onSelecionar={escolher}
            acaoFinal={<CadastroRapidoFavorecidoButton {...cadastro} onCadastrado={escolher} />} />
          <label className="grid gap-1 text-sm" htmlFor={`${id}-valor-${index}`}>Valor do favorecido {index + 1} *
            <input id={`${id}-valor-${index}`} className="input input-sm" inputMode="decimal" required value={l.valor}
              onChange={e => alterar(l.chave, { valor: normalizeCurrencyTyping(e.target.value) })}
              onBlur={() => alterar(l.chave, { valor: formatCurrencyInput(l.valor, { emptyZero: false }) })} />
          </label>
          {parcelas.length > 0 && <label className="grid gap-1 text-sm">Parcela do favorecido {index + 1} *
            <select className="input input-sm" value={l.contrato_parcela_id || ''} onChange={e => alterar(l.chave, { contrato_parcela_id: Number(e.target.value) })} required>
              {parcelas.map(p => <option key={p.id} value={p.id}>Parcela {p.numero}</option>)}
            </select>
          </label>}
          <label className="grid gap-1 text-sm">Forma de pagamento do favorecido {index + 1} *
            <select className="input input-sm" required value={l.forma_pagamento_id} onChange={e => {
              const proxima = formas.find(f => String(f.id) === e.target.value);
              alterar(l.chave, { forma_pagamento_id: e.target.value, favorecido_chave_pix: formaPagamentoEhPix(proxima) ? chavePixPreferencial(l.parceiro) : '', dados_pagamento: '', boletos: [] });
            }}><option value="">Selecione</option>{formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
          </label>
          {pix && <label className="grid gap-1 text-sm md:col-span-2">Chave PIX / Copia e Cola do favorecido {index + 1} *
            <textarea className="input min-w-0 w-full" maxLength={PIX_TEXTO_MAX} required value={l.favorecido_chave_pix} onChange={e => alterar(l.chave, { favorecido_chave_pix: e.target.value })} />
          </label>}
          {forma && !pix && !boleto && <label className="grid gap-1 text-sm md:col-span-2">Dados para pagamento do favorecido {index + 1} *
            <textarea className="input w-full" maxLength={2000} required value={l.dados_pagamento} onChange={e => alterar(l.chave, { dados_pagamento: e.target.value })} />
          </label>}
          {boleto && <div className="space-y-1 md:col-span-2"><label className="btn btn-outline btn-sm"><HiPaperClip className="h-4 w-4" />Boletos do favorecido {index + 1}
            <input type="file" multiple className="sr-only" aria-label={`Boletos do favorecido ${index + 1}`} accept=".pdf,.png,.jpg,.jpeg" onChange={e => {
              const files = Array.from(e.target.files || []); e.target.value = '';
              const permitidos = files.filter(f => /\.(pdf|png|jpe?g)$/i.test(f.name) && arquivoDocumentoPermitido(f));
              const { arquivos, rejeitados } = concatenarAnexosPendentes(l.boletos, permitidos, { maxFileSizeMb: 50 });
              setErroArquivo(permitidos.length !== files.length || rejeitados.length ? 'Use PDF/PNG/JPG de até 50 MB por arquivo.' : '');
              alterar(l.chave, { boletos: arquivos });
            }} /></label><PendingAttachmentsList items={l.boletos} onRemove={i => alterar(l.chave, { boletos: l.boletos.filter((_, j) => i !== j) })} /></div>}
        </div>
      </div>;
    })}
    {erroArquivo && <p role="alert" className="form-error">{erroArquivo}</p>}
    <div className="flex gap-2"><button type="button" className="btn btn-outline btn-sm" disabled={linhas.length >= 50} aria-label="Adicionar novo favorecido" onClick={() => onChange([...linhas, novaParteFavorecido({ contrato_parcela_id: parcelas[0]?.id })])}><HiOutlinePlus className="h-4 w-4" />Favorecido</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelar}>Usar apenas o primeiro favorecido</button>
    </div>
  </fieldset>;
}
