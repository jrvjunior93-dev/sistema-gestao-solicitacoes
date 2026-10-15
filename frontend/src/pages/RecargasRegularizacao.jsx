import { useEffect, useRef, useState } from 'react';
import { Pagina, PageHeader, BlocoConteudo, TabelaPadrao } from '../components/padrao';
import { listarRecargasParaRegularizar, consultarRegularizacaoRecarga, regularizarRecargaExcluida } from '../services/recargasCartao';

const moeda = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function RecargasRegularizacao() {
  const [lista, setLista] = useState({ items: [], proximo_cursor: null });
  const [carregando, setCarregando] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [aplicado, setAplicado] = useState('');
  const [detalhe, setDetalhe] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [conferido, setConferido] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState(null);
  const trava = useRef(false);
  const chave = useRef('');
  const versao = useRef(0);
  const selecao = useRef(0);
  const formulario = useRef(null);

  async function carregar({ antes_de, filtro = aplicado } = {}) {
    const atual = ++versao.current;
    setCarregando(true);
    try {
      const dados = await listarRecargasParaRegularizar({ codigo: filtro, antes_de });
      if (atual === versao.current) { setLista(dados); setAplicado(filtro); }
    } catch (e) { if (atual === versao.current) setErro(`Lista não atualizada: ${e.message}`); }
    finally { if (atual === versao.current) setCarregando(false); }
  }
  useEffect(() => { void carregar({ filtro: '' }); return () => { versao.current++; selecao.current++; }; }, []);

  async function conferir(id) {
    if (trava.current) return;
    const atual = ++selecao.current;
    setConsultando(true); setDetalhe(null); setErro(''); setResultado(null); setConferido(false); setMotivo('');
    try {
      const dados = await consultarRegularizacaoRecarga(id);
      if (atual !== selecao.current) return;
      chave.current = crypto.randomUUID(); setDetalhe(dados);
      requestAnimationFrame(() => { formulario.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); formulario.current?.focus(); });
    } catch (e) { if (atual === selecao.current) setErro(e.message); }
    finally { if (atual === selecao.current) setConsultando(false); }
  }

  async function confirmar(event) {
    event.preventDefault();
    if (trava.current || !detalhe?.pode_regularizar || !conferido || motivo.trim().length < 10) return;
    trava.current = true; setSalvando(true); setErro('');
    try {
      const resposta = await regularizarRecargaExcluida(detalhe.id, { motivo: motivo.trim(), revisao: detalhe.revisao, chave_idempotencia: chave.current });
      setResultado(resposta); setDetalhe(null); setConferido(false); setMotivo('');
      await carregar();
    } catch (e) { setErro(e.message); }
    finally { trava.current = false; setSalvando(false); }
  }

  return <Pagina>
    <PageHeader titulo="Regularizar recargas" descricao="Solicitações excluídas · GEO / SUPERADMIN" />
    {erro && <div className="app-alert app-alert--error" role="alert">{erro}</div>}
    {resultado && <div className="app-alert app-alert--success" role="status">
      {resultado.mensagem} {resultado.recuperada && <a className="btn btn-outline btn-sm" href={`/solicitacoes/${resultado.solicitacao_id}`}>Abrir prestação de contas · {resultado.codigo}</a>}
    </div>}
    <BlocoConteudo titulo="Solicitações de recarga excluídas">
      <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); setErro(''); void carregar({ filtro: codigo.trim() }); }}>
        <label className="min-w-0">Código da solicitação
          <input className="input" value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ex.: SOL-31" maxLength={40} disabled={salvando} />
        </label>
        <button className="btn btn-outline btn-sm" disabled={carregando || salvando}>Consultar lista</button>
        {aplicado && <button type="button" className="btn btn-ghost btn-sm" disabled={carregando || salvando} onClick={() => { setCodigo(''); void carregar({ filtro: '' }); }}>Limpar filtro</button>}
      </form>
      <p className="py-3 text-sm text-[var(--c-muted)]">Confira a solicitação antes de agir. A regularização abrange todos os cartões dela; não apaga pagamentos, anexos ou histórico.</p>
      <TabelaPadrao storageKey="recargas-regularizacao" itens={lista.items} carregando={carregando} vazio="Nenhuma recarga excluída neste recorte."
        acoesLinha={i => <button type="button" className="btn btn-outline btn-sm" disabled={consultando || salvando} onClick={() => conferir(i.id)}>Conferir {i.codigo}</button>} colunas={[
        { id: 'codigo', titulo: 'Solicitação', tipo: 'codigo', render: i => i.codigo },
        { id: 'obra', titulo: 'Obra / Centro de custo', tipo: 'identidade', render: i => i.obra },
        { id: 'cartoes', titulo: 'Cartões', tipo: 'texto', render: i => i.cartoes },
        { id: 'situacao', titulo: 'Situação', tipo: 'status', render: i => i.ciclo_encerrado ? 'Ciclo encerrado' : 'Conferir pendência' }
      ]} />
      {lista.proximo_cursor && <button type="button" className="btn btn-outline btn-sm" disabled={carregando || salvando} onClick={() => carregar({ antes_de: lista.proximo_cursor })}>Próximas solicitações</button>}
      {consultando && <p role="status">Conferindo títulos e pagamentos...</p>}
    </BlocoConteudo>
    {detalhe && <section ref={formulario} tabIndex={-1} aria-label={`Conferência ${detalhe.codigo}`}>
      <BlocoConteudo titulo={`Conferência · ${detalhe.codigo}`}>
        <p className="py-3 text-sm">{detalhe.descricao}</p>
        <TabelaPadrao storageKey="recargas-regularizacao-detalhe" itens={detalhe.recargas} colunas={[
          { id: 'cartao', titulo: 'Cartão', tipo: 'identidade', render: i => i.cartao },
          { id: 'titulo', titulo: 'Título', tipo: 'codigo', render: i => i.titulo_codigo || `#${i.titulo_id || 'ausente'}` },
          { id: 'status', titulo: 'Situação do título', tipo: 'status', render: i => i.titulo_status },
          { id: 'pago', titulo: 'Pago', tipo: 'valor', render: i => moeda(i.valor_pago) },
          { id: 'saldo', titulo: 'Saldo do título', tipo: 'valor', render: i => moeda(i.valor_saldo) },
          { id: 'prestacao', titulo: 'Prestação', tipo: 'status', render: i => i.prestacao_status },
          { id: 'tratamento', titulo: 'Tratamento', tipo: 'texto', render: i => i.tratamento }
        ]} />
        {detalhe.impedimento && <div className="app-alert app-alert--warning" role="status">{detalhe.impedimento}</div>}
        {detalhe.encerrada && <p role="status">Esta recarga já foi encerrada sem pagamento.</p>}
        <form className="space-y-3 py-3" onSubmit={confirmar}>
          {detalhe.pode_regularizar && <>
            <div>
              <label className="block" htmlFor="regularizacao-recarga-motivo">Motivo da regularização *</label>
              <textarea id="regularizacao-recarga-motivo" className="input" value={motivo} minLength={10} maxLength={2000} required disabled={salvando}
                onChange={e => { setMotivo(e.target.value); chave.current = crypto.randomUUID(); }} />
            </div>
            <label className="flex items-start gap-2"><input type="checkbox" checked={conferido} onChange={e => setConferido(e.target.checked)} disabled={salvando} />Conferi o tratamento de todos os cartões desta solicitação.</label>
          </>}
          <div className="flex flex-wrap gap-2">
            {detalhe.pode_regularizar && <button className="btn btn-primary btn-sm" disabled={salvando || !conferido || motivo.trim().length < 10}>{salvando ? 'Regularizando...' : detalhe.acao === 'RECUPERAR_PRESTACAO' ? 'Recuperar para prestação de contas' : 'Encerrar recarga sem pagamento'}</button>}
            <button type="button" className="btn btn-outline btn-sm" disabled={salvando} onClick={() => conferir(detalhe.id)}>Atualizar conferência</button>
          </div>
        </form>
      </BlocoConteudo>
    </section>}
  </Pagina>;
}
