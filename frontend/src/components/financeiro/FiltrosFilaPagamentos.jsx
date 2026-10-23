import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from 'react-icons/hi2';
import ApropriacaoAutocomplete from '../ui/ApropriacaoAutocomplete';
import DateInputBR from '../DateInputBR';
import { getSugestoesFilaPagamentos } from '../../services/financeiro';
import { RECEBIMENTOS_DP } from '../../utils/recebimentoDp';
import { beneficiaryData } from '../../utils/filaPagamentoDestinatarios.mjs';

export const CAMPOS_FILTROS_FILA = ['origem', 'empresa_id', 'credor_id', 'recebimento_dp',
  'obra_id', 'favorecido', 'vencimento_de', 'vencimento_ate', 'solicitacao_id', 'titulo_id', 'forma_pagamento_id'];
export const filtrosFilaVazios = () => Object.fromEntries(CAMPOS_FILTROS_FILA.map(key => [key, '']));

function FiltroAutocomplete({ rotulo, ariaLabel = rotulo, value = '', onChange, options = [], remoto, status, disabled, permitirTodos = true }) {
  const [busca, setBusca] = useState('');
  const [resultado, setResultado] = useState({ data: [] });
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const escolhida = useRef(null);
  const termo = busca.trim();
  useEffect(() => {
    if (!remoto) return undefined;
    let vigente = true;
    const abort = new AbortController();
    setResultado({ data: [] }); setErro(''); setCarregando(false);
    if (termo.length < 2) return () => { vigente = false; abort.abort(); };
    setCarregando(true);
    const timer = setTimeout(async () => {
      try {
        const result = await getSugestoesFilaPagamentos({ campo: remoto, status, q: termo }, { signal: abort.signal });
        if (vigente) setResultado({ ...result, chave: `${status}|${termo}` });
      } catch (error) {
        if (vigente && error.name !== 'AbortError') setErro(error.message);
      } finally { if (vigente) setCarregando(false); }
    }, 350);
    return () => { vigente = false; clearTimeout(timer); abort.abort(); };
  }, [remoto, status, termo]);
  const atuais = remoto ? (resultado.chave === `${status}|${termo}` ? resultado.data || [] : []) : options;
  const selecionada = atuais.find(o => String(o.id) === String(value))
    || options.find(o => String(o.id) === String(value))
    || (String(escolhida.current?.id) === String(value) ? escolhida.current : null);
  if (selecionada) escolhida.current = selecionada;
  const selecionado = value ? selecionada || { id: value, nome: remoto === 'favorecido' ? value : `Selecionado #${value}` } : null;
  const opcoes = [...(permitirTodos ? [{ id: '__TODOS__', nome: 'Todos' }] : []), ...atuais,
    ...(selecionado && !atuais.some(o => String(o.id) === String(value)) ? [selecionado] : [])];
  return <div className="min-w-0 text-xs">
    <span className="mb-1 block">{rotulo}</span>
    <div className="flex min-w-0 items-center gap-1">
      <ApropriacaoAutocomplete value={value || '__TODOS__'} options={opcoes} disabled={disabled}
        className="min-w-0 flex-1" inputClassName="input input-sm w-full min-w-0"
        ariaLabel={ariaLabel} mostrarConsultaCompleta={false} loading={carregando}
        placeholder={remoto ? 'Digite para buscar…' : 'Digite ou selecione…'}
        emptyText={erro || (remoto && termo.length < 2 ? 'Digite ao menos 2 caracteres.' : 'Nenhum resultado nesta situação.')}
        onClose={() => { setBusca(''); setErro(''); }}
        onSearch={query => setBusca(query === (selecionado?.nome || (!value ? 'Todos' : '')) ? '' : query)} onChange={id => {
          // Digitar pesquisa sugestoes; so uma escolha ou limpar altera o filtro.
          if (!id) return;
          escolhida.current = opcoes.find(o => String(o.id) === id) || null;
          setBusca(''); onChange(id === '__TODOS__' ? '' : id);
        }} />
      {value && permitirTodos && <button type="button" className="btn btn-outline btn-sm shrink-0 px-1" aria-label={`Limpar ${rotulo}`}
        disabled={disabled} onClick={() => { setBusca(''); onChange(''); }}><HiOutlineXMark className="h-4 w-4" /></button>}
    </div>
    {erro && <span role="status" className="mt-1 block text-[var(--c-danger)]">{erro}</span>}
    {resultado.mais && <span className="mt-1 block text-[var(--c-muted)]">Até 20 sugestões; refine a busca.</span>}
  </div>;
}

const opcoes = pares => pares.map(([id, nome]) => ({ id, nome }));
export default function FiltrosFilaPagamentos({ status, statusOptions, filtros, catalogo, rows = [], search, onSearch, onApply, busy }) {
  // Recupera rotulos ao voltar/recarregar sem outra chamada: somente dados
  // que a pagina autorizada ja trouxe. Nao vira filtro limitado a esta pagina.
  const rotulos = useMemo(() => {
    const mapas = Object.fromEntries(['obra_id', 'favorecido', 'solicitacao_id', 'titulo_id', 'forma_pagamento_id'].map(key => [key, new Map()]));
    const guardar = (key, id, nome) => { if (id && nome) mapas[key].set(String(id), { id, nome }); };
    for (const row of rows) {
      const t = row.titulo || {};
      guardar('obra_id', t.obra?.id || t.obra_id, [t.obra?.codigo, t.obra?.nome].filter(Boolean).join(' · '));
      guardar('solicitacao_id', t.solicitacao?.id || t.solicitacao_id, t.solicitacao?.codigo);
      guardar('titulo_id', t.id, [t.codigo, t.descricao].filter(Boolean).join(' · '));
      guardar('forma_pagamento_id', t.forma_pagamento_id, t.formaPagamento?.nome);
      const nome = beneficiaryData(t).nome; guardar('favorecido', nome, nome);
    }
    return Object.fromEntries(Object.entries(mapas).map(([key, mapa]) => [key, [...mapa.values()]]));
  }, [rows]);
  const [datas, setDatas] = useState({ de: filtros.vencimento_de || '', ate: filtros.vencimento_ate || '' });
  const [revisaoDatas, setRevisaoDatas] = useState(0);
  const [erroDatas, setErroDatas] = useState('');
  useEffect(() => {
    setDatas({ de: filtros.vencimento_de || '', ate: filtros.vencimento_ate || '' });
    setErroDatas(''); setRevisaoDatas(n => n + 1);
  }, [filtros.vencimento_de, filtros.vencimento_ate]);
  const alterar = (key, value) => onApply(status, undefined, { ...filtros, [key]: value });
  return <div className="mb-3 space-y-2" aria-label="Filtros dos títulos da fila">
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      <FiltroAutocomplete rotulo="Situação" ariaLabel="Status" value={status} options={opcoes(statusOptions)} disabled={busy} permitirTodos={false}
        onChange={value => onApply(value || 'PENDENTE')} />
      <FiltroAutocomplete rotulo="Origem" ariaLabel="Origem dos títulos" value={filtros.origem}
        options={opcoes([['RH_DP', 'RH/DP'], ['OUTROS', 'Outras origens']])} disabled={busy} onChange={v => alterar('origem', v)} />
      <FiltroAutocomplete rotulo="Empresa do título / colaborador" value={filtros.empresa_id}
        options={catalogo.empresas} disabled={busy} onChange={v => alterar('empresa_id', v)} />
      <FiltroAutocomplete rotulo="Credor" value={filtros.credor_id} options={catalogo.credores} disabled={busy} onChange={v => alterar('credor_id', v)} />
      <FiltroAutocomplete rotulo="Recebimento DP" value={filtros.recebimento_dp} options={opcoes(RECEBIMENTOS_DP)} disabled={busy} onChange={v => alterar('recebimento_dp', v)} />
      {[
        ['obra_id', 'Obra / Centro de custo'], ['favorecido', 'Favorecido'], ['solicitacao_id', 'Solicitação'],
        ['titulo_id', 'Título'], ['forma_pagamento_id', 'Forma de pagamento']
      ].map(([campo, rotulo]) => <FiltroAutocomplete key={campo} rotulo={rotulo} remoto={campo} status={status}
        value={filtros[campo]} options={rotulos[campo]} disabled={busy} onChange={v => alterar(campo, v)} />)}
    </div>
    <div className="flex flex-wrap items-end gap-2">
      <form className="flex max-w-full flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault();
        if (datas.de && datas.ate && datas.de > datas.ate) { setErroDatas('A data inicial não pode ser posterior à final.'); return; }
        setErroDatas(''); onApply(status, undefined, { ...filtros, vencimento_de: datas.de, vencimento_ate: datas.ate });
      }}>
        <label className="w-36 max-w-full text-xs">Vencimento de
          <DateInputBR key={`de-${revisaoDatas}`} aria-label="Vencimento de" className="input input-sm w-full" value={datas.de} disabled={busy}
            revisaoWorkspace={revisaoDatas} onChange={e => setDatas(d => ({ ...d, de: e.target.value }))} /></label>
        <label className="w-36 max-w-full text-xs">Vencimento até
          <DateInputBR key={`ate-${revisaoDatas}`} aria-label="Vencimento até" className="input input-sm w-full" value={datas.ate} disabled={busy}
            revisaoWorkspace={revisaoDatas} onChange={e => setDatas(d => ({ ...d, ate: e.target.value }))} /></label>
        <button className="btn btn-outline btn-sm" type="submit" disabled={busy}>Filtrar vencimento</button>
      </form>
      <form className="flex min-w-0 flex-1 items-end gap-1" style={{ minWidth: 'min(100%, 220px)' }}
        onSubmit={event => { event.preventDefault(); onApply(status, search.trim()); }}>
        <label className="min-w-0 flex-1 text-xs">Busca geral
          <input aria-label="Busca geral da fila" className="input input-sm w-full" value={search} disabled={busy} maxLength={120}
            placeholder="Título, credor, obra ou centro de custo" onChange={e => onSearch(e.target.value)} /></label>
        <button className="btn btn-outline btn-sm" disabled={busy} type="submit" title="Pesquisar" aria-label="Pesquisar">
          <HiOutlineMagnifyingGlass className="h-4 w-4" /></button>
      </form>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy || (!Object.values(filtros).some(Boolean) && !search && !datas.de && !datas.ate)}
        onClick={() => { setDatas({ de: '', ate: '' }); setRevisaoDatas(n => n + 1); onSearch(''); onApply(status, '', filtrosFilaVazios()); }}>Limpar filtros dos títulos</button>
    </div>
    {erroDatas && <p role="alert" className="text-xs text-[var(--c-danger)]">{erroDatas}</p>}
    <p className="text-xs text-[var(--c-muted)]">Digite e selecione uma sugestão para filtrar. Forma de pagamento considera a prevista no título, não a forma efetiva da baixa.</p>
  </div>;
}
