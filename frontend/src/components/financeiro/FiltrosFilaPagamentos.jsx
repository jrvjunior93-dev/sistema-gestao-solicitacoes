import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from 'react-icons/hi2';
import ApropriacaoAutocomplete from '../ui/ApropriacaoAutocomplete';
import DateInputBR from '../DateInputBR';
import { getSugestoesFilaPagamentos } from '../../services/financeiro';
import { RECEBIMENTOS_DP } from '../../utils/recebimentoDp';
import { beneficiaryData } from '../../utils/filaPagamentoDestinatarios.mjs';
import { useAuth } from '../../contexts/AuthContext';
import { useControlesDoBloco } from '../padrao/BlocoConteudo';
import PainelFiltrosVisiveis, { useFiltrosVisiveis } from '../padrao/PainelFiltrosVisiveis';

export const CAMPOS_FILTROS_FILA = ['origem', 'empresa_id', 'credor_id', 'recebimento_dp',
  'obra_id', 'favorecido', 'vencimento_de', 'vencimento_ate', 'solicitacao_id', 'titulo_id', 'forma_pagamento_id'];
export const filtrosFilaVazios = () => Object.fromEntries(CAMPOS_FILTROS_FILA.map(key => [key, '']));
export const FILTROS_CONFIG_FILA = [
  ['status', 'Situação'], ['origem', 'Origem'], ['empresa_id', 'Empresa do título / colaborador'],
  ['credor_id', 'Credor'], ['recebimento_dp', 'Recebimento DP'], ['obra_id', 'Obra / Centro de custo'],
  ['favorecido', 'Favorecido'], ['solicitacao_id', 'Solicitação'], ['titulo_id', 'Título'],
  ['forma_pagamento_id', 'Forma de pagamento'], ['vencimento', 'Vencimento'], ['busca', 'Busca geral']
].map(([id, rotulo]) => ({ id, rotulo, obrigatorio: id === 'busca' }));
const PLACEHOLDERS = {
  'Situação': 'Digite a situação…', 'Origem': 'Digite a origem…',
  'Empresa do título / colaborador': 'Digite a empresa…', 'Credor': 'Digite o credor…',
  'Recebimento DP': 'Digite o recebimento…', 'Obra / Centro de custo': 'Digite a obra ou centro de custo…',
  'Favorecido': 'Digite o favorecido…', 'Solicitação': 'Digite a solicitação…',
  'Título': 'Digite o título…', 'Forma de pagamento': 'Digite a forma de pagamento…'
};

function FiltroAutocomplete({ rotulo, ariaLabel = rotulo, value = '', onChange, options = [], remoto, status, disabled, permitirTodos = true }) {
  const [busca, setBusca] = useState('');
  const [resultado, setResultado] = useState({ data: [] });
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);
  const listarAoAbrir = remoto === 'forma_pagamento_id';
  const escolhida = useRef(null);
  const termo = busca.trim();
  useEffect(() => {
    if (!remoto || !aberto || disabled) return undefined;
    let vigente = true;
    const abort = new AbortController();
    setResultado({ data: [] }); setErro(''); setCarregando(false);
    if (!listarAoAbrir && termo.length < 2) return () => { vigente = false; abort.abort(); };
    setCarregando(true);
    const timer = setTimeout(async () => {
      try {
        const result = await getSugestoesFilaPagamentos({ campo: remoto, status, q: termo }, { signal: abort.signal });
        if (vigente) setResultado({ ...result, chave: `${status}|${termo}` });
      } catch (error) {
        if (vigente && error.name !== 'AbortError') setErro(error.message);
      } finally { if (vigente) setCarregando(false); }
    }, listarAoAbrir && !termo ? 0 : 350);
    return () => { vigente = false; clearTimeout(timer); abort.abort(); };
  }, [remoto, status, termo, aberto, disabled]);
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
      <ApropriacaoAutocomplete value={value} options={opcoes} disabled={disabled}
        className="min-w-0 flex-1" inputClassName="input input-sm w-full min-w-0"
        ariaLabel={ariaLabel} mostrarConsultaCompleta={false} loading={carregando}
        placeholder={PLACEHOLDERS[rotulo]} selecionarTextoAoFocar
        abrirAoClicar={listarAoAbrir}
        emptyText={erro || (remoto && !listarAoAbrir && termo.length < 2 ? 'Digite ao menos 2 caracteres.' : 'Nenhum resultado nesta situação.')}
        onClose={() => { setAberto(false); setBusca(''); setErro(''); }}
        onSearch={query => { setAberto(true); setBusca(query === selecionado?.nome ? '' : query); }} onChange={id => {
          // Digitar pesquisa sugestoes; so uma escolha ou limpar altera o filtro.
          if (!id) return;
          escolhida.current = opcoes.find(o => String(o.id) === id) || null;
          setBusca(''); onChange(id === '__TODOS__' ? '' : id);
        }} />
      {value && permitirTodos && <button type="button" className="btn btn-outline btn-sm shrink-0 px-1" aria-label={`Limpar ${rotulo}`}
        disabled={disabled} onClick={() => { setBusca(''); onChange(''); }}><HiOutlineXMark className="h-4 w-4" /></button>}
    </div>
    {erro && <span role="status" className="mt-1 block text-[var(--c-danger)]">{erro}</span>}
    {resultado.mais && <span className="mt-1 block text-[var(--c-muted)]">Até {resultado.limite || 20} sugestões; refine a busca.</span>}
  </div>;
}

const opcoes = pares => pares.map(([id, nome]) => ({ id, nome }));
export default function FiltrosFilaPagamentos({ status, statusOptions, filtros, catalogo, rows = [], search, onSearch, onApply, busy }) {
  const { user } = useAuth();
  const slot = useControlesDoBloco();
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
  const preenchidos = [...new Set(CAMPOS_FILTROS_FILA.filter(key => filtros[key])
    .map(key => key.startsWith('vencimento_') ? 'vencimento' : key))];
  if (status !== 'PENDENTE') preenchidos.push('status');
  if (datas.de || datas.ate) preenchidos.push('vencimento');
  const visibilidade = useFiltrosVisiveis(user?.id ? `financeiro-fila-pagamentos:filtros:${user.id}` : '', FILTROS_CONFIG_FILA, {
    ordenavel: true, preenchidos,
    aoEsconder: id => {
      if (busy) return;
      if (id === 'status') { if (status !== 'PENDENTE') onApply('PENDENTE'); return; }
      if (id === 'vencimento') {
        setDatas({ de: '', ate: '' }); setRevisaoDatas(n => n + 1); setErroDatas('');
        if (filtros.vencimento_de || filtros.vencimento_ate) onApply(status, undefined, { ...filtros, vencimento_de: '', vencimento_ate: '' });
      } else if (filtros[id]) alterar(id, '');
    }
  });
  const campos = Object.fromEntries(FILTROS_CONFIG_FILA.filter(f => !['busca', 'vencimento'].includes(f.id)).map(({ id, rotulo }) => {
    const locais = { status: opcoes(statusOptions), origem: opcoes([['RH_DP', 'RH/DP'], ['OUTROS', 'Outras origens']]),
      empresa_id: catalogo.empresas, credor_id: catalogo.credores, recebimento_dp: opcoes(RECEBIMENTOS_DP) };
    return [id, <FiltroAutocomplete rotulo={rotulo} ariaLabel={id === 'status' ? 'Status' : id === 'origem' ? 'Origem dos títulos' : rotulo}
      value={id === 'status' ? status : filtros[id]} options={locais[id] || rotulos[id]} remoto={id in locais ? null : id}
      status={status} disabled={busy} permitirTodos={id !== 'status'}
      onChange={v => id === 'status' ? onApply(v || 'PENDENTE') : alterar(id, v)} />];
  }));
  campos.vencimento = <form className="flex max-w-full flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault();
        if (datas.de && datas.ate && datas.de > datas.ate) { setErroDatas('A data inicial não pode ser posterior à final.'); return; }
        setErroDatas(''); onApply(status, undefined, { ...filtros, vencimento_de: datas.de, vencimento_ate: datas.ate });
      }}>
        <label className="w-32 max-w-full text-xs">Vencimento de
          <DateInputBR key={`de-${revisaoDatas}`} aria-label="Vencimento de" className="input input-sm w-full" value={datas.de} disabled={busy}
            revisaoWorkspace={revisaoDatas} onChange={e => setDatas(d => ({ ...d, de: e.target.value }))} /></label>
        <label className="w-32 max-w-full text-xs">Vencimento até
          <DateInputBR key={`ate-${revisaoDatas}`} aria-label="Vencimento até" className="input input-sm w-full" value={datas.ate} disabled={busy}
            revisaoWorkspace={revisaoDatas} onChange={e => setDatas(d => ({ ...d, ate: e.target.value }))} /></label>
        <button className="btn btn-outline btn-sm" type="submit" disabled={busy}>Filtrar vencimento</button>
      </form>;
  campos.busca = <form className="flex min-w-0 items-end gap-1"
        onSubmit={event => { event.preventDefault(); onApply(status, search.trim()); }}>
        <label className="min-w-0 flex-1 text-xs">Busca geral
          <input aria-label="Busca geral da fila" className="input input-sm w-full" value={search} disabled={busy} maxLength={120}
            placeholder="Título, credor, obra ou centro de custo" onChange={e => onSearch(e.target.value)} /></label>
        <button className="btn btn-outline btn-sm" disabled={busy} type="submit" title="Pesquisar" aria-label="Pesquisar">
          <HiOutlineMagnifyingGlass className="h-4 w-4" /></button>
      </form>;
  const painel = <PainelFiltrosVisiveis visibilidade={visibilidade} rotulo="Organizar filtros" disabled={busy} />;
  return <div className="mb-3 space-y-2" aria-label="Filtros dos títulos da fila">
    {slot?.no ? createPortal(painel, slot.no) : <div className="flex justify-end">{painel}</div>}
    <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {visibilidade.ordem.filter(id => visibilidade.ehVisivel(id)).map(id => <div key={id} data-filtro-id={id}
        className={['busca', 'vencimento'].includes(id) ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>{campos[id]}</div>)}
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" className="btn btn-outline btn-sm" disabled={busy || (!Object.values(filtros).some(Boolean) && !search && !datas.de && !datas.ate)}
        onClick={() => { setDatas({ de: '', ate: '' }); setRevisaoDatas(n => n + 1); onSearch(''); onApply(status, '', filtrosFilaVazios()); }}>Limpar filtros dos títulos</button>
    </div>
    {erroDatas && <p role="alert" className="text-xs text-[var(--c-danger)]">{erroDatas}</p>}
    <p className="text-xs text-[var(--c-muted)]">Clique em Forma de pagamento para ver as opções da fila. Os demais campos permitem pesquisar sugestões. Forma de pagamento considera a prevista no título, não a forma efetiva da baixa.</p>
  </div>;
}
