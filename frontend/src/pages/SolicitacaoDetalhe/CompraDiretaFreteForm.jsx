import { useEffect, useRef, useState } from 'react';
import DateInputBR from '../../components/DateInputBR';
import ParceiroBuscaRemota from '../../components/solicitacoes/ParceiroBuscaRemota';
import { CampoForm, FormSecao } from '../../components/padrao';
import { listarFormasPagamentoCompraDireta, uploadAnexoTemporarioCompra } from '../../services/compras';
import { PIX_TEXTO_MAX } from '../../utils/pix';

const decimal = value => {
  const raw = String(value ?? '').trim();
  return Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
};

export default function CompraDiretaFreteForm({ compra, itens, ocupado, onOcupado, onSalvar }) {
  const [form, setForm] = useState(() => ({ frete_tipo: compra.frete_tipo || 'SEM_FRETE', frete_modo: compra.frete_modo || 'GLOBAL',
    frete_valor: String(compra.frete_valor || 0).replace('.', ','), frete_data_vencimento: compra.frete_data_vencimento || '',
    frete_forma_pagamento_id: compra.frete_forma_pagamento_id || '', frete_dados_pagamento: compra.frete_dados_pagamento || '',
    frete_favorecido_chave_pix: compra.frete_favorecido_chave_pix || '', motivo: '' }));
  const [credor, setCredor] = useState(compra.freteCredor || null);
  const [favorecido, setFavorecido] = useState(compra.freteFavorecido || null);
  const [usarCredor, setUsarCredor] = useState(Boolean(compra.frete_parceiro_id && compra.frete_parceiro_id === compra.frete_favorecido_id));
  const [porItem, setPorItem] = useState(() => Object.fromEntries(itens.map(i => [`${i.item_tipo}:${i.id}`, String(i.frete_valor || 0).replace('.', ',')])));
  const [formas, setFormas] = useState([]);
  const [erroFormas, setErroFormas] = useState('');
  const [erro, setErro] = useState('');
  const [boleto, setBoleto] = useState(null);
  const trava = useRef(false);
  const editar = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const terceiro = form.frete_tipo === 'TERCEIRO';
  const forma = formas.find(f => Number(f.id) === Number(form.frete_forma_pagamento_id))
    || (Number(compra.freteFormaPagamento?.id) === Number(form.frete_forma_pagamento_id) ? compra.freteFormaPagamento : null);
  const token = `${forma?.codigo || ''} ${forma?.nome || ''} ${forma?.tipo || ''}`.toUpperCase();
  const ehBoleto = Boolean(forma?.gera_boleto) || token.includes('BOLETO');
  const ehPix = token.includes('PIX');
  async function carregarFormas() {
    try { setErroFormas(''); setFormas(await listarFormasPagamentoCompraDireta()); }
    catch (error) { setErroFormas(error.message || 'Falha ao carregar formas de pagamento.'); }
  }
  useEffect(() => { void carregarFormas(); }, []);

  async function enviarBoleto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || trava.current || ocupado) return;
    trava.current = true; onOcupado(true); setErro('');
    try { setBoleto(await uploadAnexoTemporarioCompra(file)); }
    catch (error) { setErro(error.message || 'Falha ao enviar boleto.'); }
    finally { trava.current = false; onOcupado(false); }
  }
  async function salvar(event) {
    event.preventDefault();
    if (trava.current || ocupado) return;
    const valor = decimal(form.frete_valor);
    const linhas = itens.map(i => ({ id: i.id, item_tipo: i.item_tipo, frete_valor: decimal(porItem[`${i.item_tipo}:${i.id}`]) }));
    if (form.frete_tipo !== 'SEM_FRETE' && (form.frete_modo === 'GLOBAL' ? !Number.isFinite(valor) || valor <= 0
      : linhas.some(i => !Number.isFinite(i.frete_valor) || i.frete_valor < 0) || linhas.reduce((s, i) => s + i.frete_valor, 0) <= 0)) {
      setErro('Informe o valor do frete. Por item, informe todos os valores, mesmo que zero.'); return;
    }
    if (terceiro && (!credor?.id || !form.frete_data_vencimento || !form.frete_forma_pagamento_id
      || (!ehBoleto && !(usarCredor ? credor : favorecido)?.id) || (ehPix && !form.frete_favorecido_chave_pix.trim()))) {
      setErro('Confira credor, vencimento, forma de pagamento, favorecido e chave PIX do frete.'); return;
    }
    trava.current = true; onOcupado(true); setErro('');
    try {
      await onSalvar({ ...form, acao: 'FRETE', revisao_gestao: compra.revisao_gestao,
        frete_valor: valor, itens: linhas, frete_parceiro_id: credor?.id || null,
        frete_favorecido_id: (usarCredor ? credor : favorecido)?.id || null,
        ...(terceiro && ehBoleto && boleto ? { boleto } : {}) });
    } catch (error) { setErro(error.message || 'Falha ao salvar frete.'); }
    finally { trava.current = false; onOcupado(false); }
  }
  return <form onSubmit={salvar} className="min-w-0 flex-1 space-y-3" aria-label="Frete da compra direta">
    <p className="text-sm text-[var(--c-muted)]">O total da compra será recalculado. Nenhum título ou pagamento existente será alterado. Frete a terceiro permanece disponível para geração separada no Financeiro.</p>
    {erro && <p role="alert" className="text-sm text-[var(--sem-danger)]">{erro}</p>}
    <fieldset disabled={ocupado} className="space-y-3">
      <FormSecao colunas={2}>
        <CampoForm label="Tratamento do frete"><select aria-label="Tratamento do frete" className="input" value={form.frete_tipo} onChange={e => { editar('frete_tipo', e.target.value); setBoleto(null); }}>
          <option value="SEM_FRETE">Sem frete</option><option value="EMBUTIDO">Embutido</option><option value="TERCEIRO">Pago a terceiro</option>
        </select></CampoForm>
        {form.frete_tipo !== 'SEM_FRETE' && <>
          <CampoForm label="Como informar o frete"><select aria-label="Como informar o frete" className="input" value={form.frete_modo} onChange={e => editar('frete_modo', e.target.value)}>
            <option value="GLOBAL">Valor total do frete</option><option value="POR_ITEM">Frete por item</option>
          </select></CampoForm>
          {form.frete_modo === 'GLOBAL' && <CampoForm label="Valor do frete" obrigatorio><input className="input" inputMode="decimal" required value={form.frete_valor} onChange={e => editar('frete_valor', e.target.value)} /></CampoForm>}
        </>}
      </FormSecao>
      {form.frete_tipo !== 'SEM_FRETE' && form.frete_modo === 'POR_ITEM' && <div className="space-y-2">
        {itens.map(i => <label key={`${i.item_tipo}:${i.id}`} className="flex items-center justify-between gap-3 text-sm"><span>{i.descricao}</span>
          <input aria-label={`Frete: ${i.descricao}`} className="input w-36" inputMode="decimal" required value={porItem[`${i.item_tipo}:${i.id}`]}
            onChange={e => setPorItem(p => ({ ...p, [`${i.item_tipo}:${i.id}`]: e.target.value }))} /></label>)}
      </div>}
      {terceiro && <>
        <ParceiroBuscaRemota label="Credor do frete" obrigatorio somenteFornecedor selecionado={credor} onSelecionar={p => {
          setCredor(p); if (usarCredor) editar('frete_favorecido_chave_pix', '');
        }} />
        <FormSecao colunas={2}>
          <CampoForm label="Data para pagamento" obrigatorio><DateInputBR className="input" required value={form.frete_data_vencimento} onChange={e => editar('frete_data_vencimento', e.target.value)} /></CampoForm>
          <CampoForm label="Forma de pagamento do frete" obrigatorio><select aria-label="Forma de pagamento do frete" className="input" required value={form.frete_forma_pagamento_id}
            onChange={e => { editar('frete_forma_pagamento_id', e.target.value); editar('frete_favorecido_chave_pix', ''); setBoleto(null); }}>
            <option value="">Selecione</option>{formas.filter(f => !`${f.codigo} ${f.nome}`.toUpperCase().includes('FOPAG')).map(f => <option key={f.id} value={f.id}>{f.nome || f.codigo}</option>)}
          </select></CampoForm>
        </FormSecao>
        {erroFormas && <div role="alert">{erroFormas} <button type="button" className="btn btn-outline btn-sm" onClick={carregarFormas}>Tentar novamente</button></div>}
        {!ehBoleto && <>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={usarCredor} onChange={e => {
            setUsarCredor(e.target.checked); editar('frete_favorecido_chave_pix', '');
          }} />Usar o credor do frete como favorecido</label>
          {!usarCredor && <ParceiroBuscaRemota label="Favorecido do frete" obrigatorio selecionado={favorecido} onSelecionar={p => {
            setFavorecido(p); editar('frete_favorecido_chave_pix', '');
          }} />}
        </>}
        {ehPix && <CampoForm label="Chave PIX do frete" obrigatorio><input className="input" required maxLength={PIX_TEXTO_MAX} value={form.frete_favorecido_chave_pix} onChange={e => editar('frete_favorecido_chave_pix', e.target.value)} /></CampoForm>}
        {ehBoleto && <label className="form-group"><span className="form-label">Boleto do frete</span>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={enviarBoleto} />
          <span className="form-hint">{boleto?.arquivo_nome_original || 'Anexe um boleto ou mantenha o já registrado na solicitação.'}</span></label>}
        <CampoForm label="Dados para pagamento do frete"><textarea className="input" rows={3} maxLength={10000} value={form.frete_dados_pagamento} onChange={e => editar('frete_dados_pagamento', e.target.value)} placeholder="Banco, agência, conta ou instruções para o Financeiro" /></CampoForm>
      </>}
      <CampoForm label="Motivo da alteração do frete" obrigatorio><textarea className="input" rows={2} required maxLength={2000} value={form.motivo} onChange={e => editar('motivo', e.target.value)} /></CampoForm>
    </fieldset>
    <button type="submit" className="btn btn-primary" disabled={ocupado || (terceiro && (!formas.length || Boolean(erroFormas)))}>{ocupado ? 'Aguarde…' : 'Salvar frete'}</button>
  </form>;
}
