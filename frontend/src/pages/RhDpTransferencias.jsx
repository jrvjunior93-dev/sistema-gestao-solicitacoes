import { useCallback, useEffect, useRef, useState } from 'react';
import { Avisos, TabelaPadrao, useAvisos, useConfirmacao } from '../components/padrao';
import OverlayModal from '../components/ui/OverlayModal';
import { rhTransferencias } from '../services/rhDp';
import '../styles/rh-pessoal-atividade.css';

const data = v => v ? new Date(v).toLocaleString('pt-BR') : '—';

export default function RhDpTransferencias() {
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [config, setConfig] = useState({ obras: [], obras_responsavel_ids: [] });
  const [lista, setLista] = useState([]);
  const [diretorio, setDiretorio] = useState({ itens: [], total: 0, pagina: 1 });
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [form, setForm] = useState(null);
  const [aberta, setAberta] = useState(null);
  const [comentario, setComentario] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  const versaoBusca = useRef(0);
  const minhas = config.obras.filter(o => config.obras_responsavel_ids.includes(Number(o.id)));
  const nomeObra = id => config.obras.find(o => Number(o.id) === Number(id))?.nome || `Obra #${id}`;
  const atualizar = useCallback(async () => {
    try { setLista(await rhTransferencias()); }
    catch (e) { avisar.erro(e.message); }
  }, [avisar]);

  useEffect(() => {
    rhTransferencias('/configuracao').then(setConfig).catch(e => avisar.erro(e.message));
    atualizar();
    const atualizarVisivel = () => { if (!document.hidden) atualizar(); };
    const timer = setInterval(atualizarVisivel, 30000);
    window.addEventListener('focus', atualizarVisivel);
    return () => { clearInterval(timer); window.removeEventListener('focus', atualizarVisivel); };
  }, [atualizar, avisar]);

  async function pesquisar(pagina = 1) {
    const versao = ++versaoBusca.current;
    setCarregando(true);
    try {
      const resultado = await rhTransferencias('/diretorio', { params: { busca, pagina } });
      if (versao === versaoBusca.current) setDiretorio(resultado);
    } catch (e) { avisar.erro(e.message); }
    finally { if (versao === versaoBusca.current) setCarregando(false); }
  }

  async function abrir(s) {
    try {
      const detalhe = await rhTransferencias(`/${s.id}`);
      setAberta(detalhe); setComentario(''); await atualizar();
    } catch (e) { avisar.erro(e.message); }
  }

  async function executar(fn) {
    if (trava.current) return;
    trava.current = true; setOcupado(true);
    try { await fn(); await atualizar(); }
    catch (e) { avisar.erro(e.message); }
    finally { trava.current = false; setOcupado(false); }
  }

  async function decidir(acao) {
    if (acao === 'rejeitar' && !comentario.trim()) { avisar.erro('Informe o motivo no campo de comentário.'); return; }
    const { ok } = await confirmar({ titulo: `${acao === 'aprovar' ? 'Aprovar' : acao === 'rejeitar' ? 'Rejeitar' : acao === 'enviar' ? 'Enviar' : 'Cancelar'} transferência?`,
      mensagem: acao === 'aprovar' ? 'O colaborador passará para a obra de destino a partir de hoje.' : 'Confirme a ação sobre esta transferência.' });
    if (!ok) return;
    executar(async () => {
      await rhTransferencias(`/${aberta.id}/${acao}`, { method: 'POST', data: { texto: comentario } });
      setAberta(null); avisar.sucesso('Transferência atualizada.');
    });
  }

  function selecionar(c) {
    const souOrigem = config.obras_responsavel_ids.includes(Number(c.obra_id));
    const destino = souOrigem ? '' : String(minhas.find(o => Number(o.id) !== Number(c.obra_id))?.id || '');
    setForm({ colaborador: c, obra_destino_id: destino,
      obra_solicitante_id: souOrigem ? String(c.obra_id) : destino, justificativa: '' });
  }

  return <div className="space-y-4 min-w-0">
    <Avisos avisos={avisos} aoFechar={fechar} />
    <p className="form-hint">A obra atual pode enviar ou a obra de destino pode solicitar. Outro responsável da obra oposta aprova. O vínculo só muda na aprovação.</p>
    {!minhas.length && <p className="alert alert-info">Para solicitar ou aprovar, configure o responsável ou substituto vigente em Configurações → Responsáveis por obra. A consulta global exige vínculo do usuário com uma obra.</p>}
    <section aria-label="Transferências entre obras">
      <div className="app-page-actions"><h3 className="app-bloco-titulo">Transferências das minhas obras</h3><button type="button" className="btn btn-outline btn-sm" onClick={atualizar}>Atualizar</button></div>
      <TabelaPadrao storageKey="tabela:rh-transferencias" itens={lista} urgencia={s => s.nao_lida ? 'warning' : null} classeLinha={s => s.nao_lida ? 'rh-solicitacao-nao-lida' : ''}
        vazio="Nenhuma transferência para os responsáveis deste usuário."
        colunas={[
          { id: 'colaborador', titulo: 'Colaborador', render: s => s.colaborador?.nome || '—' },
          { id: 'origem', titulo: 'Origem', render: s => s.obra?.nome || nomeObra(s.obra_id) },
          { id: 'destino', titulo: 'Destino', render: s => s.obra_destino_nome || nomeObra(s.obra_destino_id) },
          { id: 'situacao', titulo: 'Situação', render: s => <>{s.situacao}{s.nao_lida && <span className="rh-chip rh-chip--aberta ml-2">Nova interação</span>}</> },
          { id: 'responsavel', titulo: 'Aprovação por', render: s => nomeObra(s.obra_aprovadora_id) },
          { id: 'atividade', titulo: 'Última interação', render: s => data(s.atividade_em) }
        ]} acoesLinha={s => <button type="button" className="btn btn-outline btn-sm" onClick={() => abrir(s)}>Abrir</button>} />
    </section>
    <section aria-label="Diretório global de colaboradores">
      <h3 className="app-bloco-titulo">Lista global de colaboradores</h3>
      <p className="form-hint">Somente identificação profissional e obra atual. Sem dados financeiros ou documentos pessoais.</p>
      <form className="app-page-actions" onSubmit={e => { e.preventDefault(); pesquisar(); }}>
        <label className="form-field flex-1 min-w-0"><span className="form-label">Nome, matrícula ou função</span>
          <input className="form-control" value={busca} onChange={e => setBusca(e.target.value)} maxLength={100} /></label>
        <button className="btn btn-outline" disabled={carregando}>{carregando ? 'Pesquisando…' : 'Pesquisar'}</button>
      </form>
      <TabelaPadrao storageKey="tabela:rh-diretorio-global" itens={diretorio.itens} carregando={carregando}
        vazio="Pesquise para localizar colaboradores ativos de todas as obras."
        colunas={[
          { id: 'nome', titulo: 'Nome', render: c => c.nome },
          { id: 'matricula', titulo: 'Matrícula', render: c => c.matricula || '—' },
          { id: 'cargo', titulo: 'Função', render: c => c.cargo || '—' },
          { id: 'obra', titulo: 'Obra atual', render: c => c.obra?.nome || 'Sem obra' }
        ]} acoesLinha={c => c.obra_id && minhas.length ? <button type="button" className="btn btn-outline btn-sm" onClick={() => selecionar(c)}>Solicitar transferência</button> : null} />
      <div className="app-page-actions">
        <span>{diretorio.total} colaborador(es) · Página {diretorio.pagina}</span>
        <button type="button" className="btn btn-outline btn-sm" disabled={carregando || diretorio.pagina <= 1} onClick={() => pesquisar(diretorio.pagina - 1)}>Anterior</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={carregando || diretorio.pagina * 50 >= diretorio.total} onClick={() => pesquisar(diretorio.pagina + 1)}>Próxima</button>
      </div>
    </section>
    {form && <OverlayModal rotulo="Solicitar transferência entre obras" onFechar={() => { if (!ocupado) setForm(null); }}>
      <form className="space-y-3 p-4" onSubmit={e => { e.preventDefault(); executar(async () => {
        await rhTransferencias('', { method: 'POST', data: { colaborador_id: form.colaborador.id,
          obra_destino_id: Number(form.obra_destino_id), obra_solicitante_id: Number(form.obra_solicitante_id), justificativa: form.justificativa } });
        setForm(null); avisar.sucesso('Transferência enviada ao responsável da outra obra.');
      }); }}>
        <h2 className="app-bloco-titulo">Solicitar transferência entre obras</h2>
        <p><strong>{form.colaborador.nome}</strong> · Obra atual: {form.colaborador.obra?.nome}</p>
        <label className="form-field"><span className="form-label">Obra de destino</span>
          <select className="form-control" aria-label="Obra de destino" required value={form.obra_destino_id} onChange={e => {
            const destino = e.target.value;
            setForm(f => ({ ...f, obra_destino_id: destino, obra_solicitante_id: config.obras_responsavel_ids.includes(Number(f.colaborador.obra_id)) ? String(f.colaborador.obra_id) : destino }));
          }}><option value="">Selecione</option>{config.obras.filter(o => Number(o.id) !== Number(form.colaborador.obra_id)
            && (config.obras_responsavel_ids.includes(Number(form.colaborador.obra_id)) || config.obras_responsavel_ids.includes(Number(o.id))))
            .map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nome}</option>)}</select>
        </label>
        <label className="form-field"><span className="form-label">Obra que está solicitando</span>
          <select className="form-control" aria-label="Obra que está solicitando" required value={form.obra_solicitante_id} onChange={e => setForm(f => ({ ...f, obra_solicitante_id: e.target.value }))}>
            <option value="">Selecione</option>{minhas.filter(o => [Number(form.colaborador.obra_id), Number(form.obra_destino_id)].includes(Number(o.id)))
              .map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </label>
        <p className="form-hint">Aprovação pela obra {nomeObra(Number(form.obra_solicitante_id) === Number(form.colaborador.obra_id) ? form.obra_destino_id : form.colaborador.obra_id)}. Vigência na data de aprovação.</p>
        <label className="form-field"><span className="form-label">Justificativa</span><textarea className="form-control" required maxLength={2000} value={form.justificativa} onChange={e => setForm(f => ({ ...f, justificativa: e.target.value }))} /></label>
        <div className="app-page-actions"><button className="btn btn-primary" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar para aprovação'}</button><button type="button" className="btn btn-outline" disabled={ocupado} onClick={() => setForm(null)}>Cancelar</button></div>
      </form>
    </OverlayModal>}
    {aberta && <OverlayModal rotulo={`Transferência #${aberta.id}`} onFechar={() => { if (!ocupado) setAberta(null); }}>
      <div className="space-y-3 p-4">
        <div className="app-page-actions"><h2 className="app-bloco-titulo">Transferência #{aberta.id}</h2><button type="button" className="btn btn-outline btn-sm" disabled={ocupado} onClick={() => setAberta(null)}>Fechar</button></div>
        <p><strong>{aberta.colaborador?.nome}</strong> · {aberta.obra?.nome} → {nomeObra(aberta.obra_destino_id)}</p>
        <p>{aberta.situacao} · Aprovação por: {nomeObra(aberta.obra_aprovadora_id)}</p>
        <p>{aberta.justificativa}</p>
        <ul className="rh-pessoal-historico">{(aberta.historicos || []).map(h => <li key={h.id}><small>{data(h.createdAt)} · Usuário #{h.usuario_id} · {h.setor}</small><div>{h.descricao}</div></li>)}</ul>
        <label className="form-field"><span className="form-label">Comentário / motivo da rejeição</span><textarea className="form-control" maxLength={2000} value={comentario} onChange={e => setComentario(e.target.value)} /></label>
        <div className="app-page-actions">
          <button type="button" className="btn btn-outline" disabled={ocupado || !comentario.trim()} onClick={() => executar(async () => {
            await rhTransferencias(`/${aberta.id}/comentar`, { method: 'POST', data: { texto: comentario } }); await abrir(aberta);
          })}>Comentar</button>
          {aberta.pode_decidir && <><button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => decidir('aprovar')}>Aprovar transferência</button><button type="button" className="btn btn-outline" disabled={ocupado} onClick={() => decidir('rejeitar')}>Rejeitar</button></>}
          {aberta.pode_enviar && <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => decidir('enviar')}>Enviar para aprovação</button>}
          {aberta.pode_cancelar && <button type="button" className="btn btn-outline" disabled={ocupado} onClick={() => decidir('cancelar')}>Cancelar transferência</button>}
        </div>
      </div>
    </OverlayModal>}
    {elementoConfirmacao}
  </div>;
}
