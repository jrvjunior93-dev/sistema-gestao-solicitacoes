import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avisos, TabelaPadrao, useAvisos, useConfirmacao } from '../components/padrao';
import OverlayModal from '../components/ui/OverlayModal';
import { rhTransferencias } from '../services/rhDp';
import { useWorkspaceState, useWorkspaceWork } from '../navigation/WorkspaceContext';
import useQueryRevision from '../navigation/useQueryRevision';
import '../styles/rh-pessoal-atividade.css';

const data = v => v ? new Date(v).toLocaleString('pt-BR') : '—';
const dataDia = v => v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const paginaVazia = { itens: [], total: 0, pagina: 1, limite: 20, total_paginas: 1, nao_lidas: 0 };

export default function RhDpTransferencias({ onNotificacoesLidas, obraId }) {
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [parametros, setParametros] = useSearchParams();
  const secao = parametros.get('secao') === 'transferencias' ? 'transferencias' : 'global';
  const [config, setConfig] = useState({ obras: [], obras_responsavel_ids: [], acesso_global: false });
  const [transferencias, setTransferencias] = useState(paginaVazia);
  const [diretorio, setDiretorio] = useState({ itens: [], total: 0, pagina: 1 });
  const [busca, setBusca] = useWorkspaceState('transferencias:busca', '');
  const [buscaAplicada, setBuscaAplicada] = useWorkspaceState('transferencias:buscaAplicada', '');
  const [paginaDiretorio, setPaginaDiretorio] = useWorkspaceState('transferencias:paginaDiretorio', 1);
  const [paginaSalva, setPaginaSalva] = useWorkspaceState('transferencias:pagina', 1);
  const [carregando, setCarregando] = useState(false);
  const [carregandoTransferencias, setCarregandoTransferencias] = useState(false);
  const [formInputs, setFormInputs] = useWorkspaceState('transferencias:inputs', null);
  const [abertaId, setAbertaId] = useWorkspaceState('transferencias:abertaId', null);
  const [aberta, renderAberta] = useState(null);
  const [comentarios, setComentarios] = useWorkspaceState('transferencias:comentarios', {});
  const comentario = comentarios[abertaId] || '';
  const setComentario = texto => setComentarios(current => ({ ...current, [abertaId]: texto }));
  const setAberta = detalhe => { renderAberta(detalhe); setAbertaId(detalhe?.id || null); };
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  const consultaDiretorio = useQueryRevision(obraId);
  const consultaTransferencias = useQueryRevision(obraId);
  const consultaDetalhe = useQueryRevision(obraId);
  const consultaConfig = useQueryRevision(obraId);
  const paginaTransferencias = useRef(paginaSalva);
  const colaboradorAtual = diretorio.itens.find(item => String(item.id) === String(formInputs?.colaboradorId));
  const form = !carregando && colaboradorAtual && config.obras.length && formInputs
    ? { ...formInputs, colaborador: colaboradorAtual } : null;
  const formConflito = Boolean(form && String(form.origemBase) !== String(colaboradorAtual.obra_id));
  const setForm = update => {
    if (update === null) { setFormInputs(null); return; }
    const next = typeof update === 'function' ? update(form) : update;
    setFormInputs({ colaboradorId: next.colaborador.id, origemBase: next.origemBase ?? next.colaborador.obra_id,
      obra_destino_id: next.obra_destino_id, justificativa: next.justificativa });
  };
  useWorkspaceWork(Boolean(formInputs || Object.values(comentarios).some(Boolean)), ocupado, 'transferencias:work');
  const obrasTransferiveis = config.obras.filter((obra) => (
    String(obra?.tipo_centro_custo || 'OBRA').trim().toUpperCase() === 'OBRA'
  ));
  const minhas = obrasTransferiveis.filter(o => config.obras_responsavel_ids.includes(Number(o.id)));
  const nomeObra = id => !id ? 'Sem obra vinculada' : config.obras.find(o => Number(o.id) === Number(id))?.nome || `Obra #${id}`;

  const fluxoDoFormulario = formulario => {
    if (!formulario) return null;
    const origem = Number(formulario.colaborador.obra_id);
    const destino = Number(formulario.obra_destino_id);
    const responsavelOrigem = config.obras_responsavel_ids.includes(origem);
    const responsavelDestino = config.obras_responsavel_ids.includes(destino);
    const automatico = Boolean(destino && responsavelDestino && (!origem || responsavelOrigem));
    const solicitante = responsavelOrigem ? origem : (responsavelDestino ? destino : null);
    return { origem, destino, responsavelOrigem, responsavelDestino, automatico, solicitante,
      aprovadora: automatico ? null : (solicitante === origem ? destino : origem) };
  };
  const fluxoForm = fluxoDoFormulario(form);

  const atualizar = useCallback(async (pagina = 1) => {
    const token = consultaTransferencias.begin();
    paginaTransferencias.current = pagina;
    setPaginaSalva(pagina);
    setCarregandoTransferencias(true);
    try {
      const resultado = await rhTransferencias('', { params: { grupo: 'TODAS', pagina, limite: 20, obra_id: obraId } });
      if (!consultaTransferencias.isCurrent(token)) return null;
      if (resultado.pagina > resultado.total_paginas) {
        return atualizar(resultado.total_paginas);
      }
      setTransferencias(resultado);
      return resultado;
    } catch (e) {
      if (!consultaTransferencias.isCurrent(token)) return null;
      setTransferencias(paginaVazia);
      avisar.erro(e.message);
      return null;
    } finally {
      if (consultaTransferencias.isCurrent(token)) setCarregandoTransferencias(false);
    }
  }, [avisar, obraId, consultaTransferencias.begin, consultaTransferencias.isCurrent, setPaginaSalva]);

  const reconhecerTransferencias = useCallback(async () => {
    try {
      await rhTransferencias('/leituras', { method: 'POST', data: { obra_id: obraId } });
      setTransferencias(atual => ({
        ...atual,
        nao_lidas: 0,
        itens: atual.itens.map(item => ({ ...item, nao_lida: false }))
      }));
      if (!obraId) onNotificacoesLidas?.();
      window.dispatchEvent(new Event('notificacoes:atualizar'));
    } catch (e) {
      avisar.erro(e.message);
    }
  }, [avisar, onNotificacoesLidas, obraId]);

  const pesquisar = useCallback(async (pagina = 1, termo = '') => {
    const versao = consultaDiretorio.begin();
    setCarregando(true);
    try {
      const resultado = await rhTransferencias('/diretorio', { params: { busca: termo, pagina } });
      if (consultaDiretorio.isCurrent(versao)) {
        setDiretorio(resultado);
        setBuscaAplicada(termo);
        setPaginaDiretorio(pagina);
      }
    } catch (e) {
      if (consultaDiretorio.isCurrent(versao)) { setDiretorio({ itens: [], total: 0, pagina: 1 }); avisar.erro(e.message); }
    } finally {
      if (consultaDiretorio.isCurrent(versao)) setCarregando(false);
    }
  }, [avisar, obraId, consultaDiretorio.begin, consultaDiretorio.isCurrent, setBuscaAplicada, setPaginaDiretorio]);

  useEffect(() => {
    const token = consultaConfig.begin();
    rhTransferencias('/configuracao').then(resultado => {
      if (consultaConfig.isCurrent(token)) setConfig(resultado);
    }).catch(e => { if (consultaConfig.isCurrent(token)) {
      setConfig({ obras: [], obras_responsavel_ids: [], acesso_global: false }); avisar.erro(e.message);
    } });
    atualizar(paginaTransferencias.current);
    pesquisar(paginaDiretorio, buscaAplicada);
    const atualizarVisivel = () => { if (!document.hidden) atualizar(paginaTransferencias.current); };
    const timer = setInterval(atualizarVisivel, 30000);
    window.addEventListener('focus', atualizarVisivel);
    return () => { clearInterval(timer); window.removeEventListener('focus', atualizarVisivel); };
    // Pagina/busca aplicada sao o recorte inicial; nao reiniciar polling e
    // carregar diretorio a cada tecla ou resposta de pagina.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atualizar, avisar, pesquisar, consultaConfig.begin, consultaConfig.isCurrent]);

  const carregarDetalhe = useCallback(async id => {
    const token = consultaDetalhe.begin();
    renderAberta(null);
    try {
      const detalhe = await rhTransferencias(`/${id}`);
      if (consultaDetalhe.isCurrent(token)) renderAberta(detalhe);
    } catch (e) { if (consultaDetalhe.isCurrent(token)) { renderAberta(null); avisar.erro(e.message); } }
  }, [avisar, consultaDetalhe.begin, consultaDetalhe.isCurrent]);
  useEffect(() => {
    if (abertaId) carregarDetalhe(abertaId);
    else { consultaDetalhe.begin(); renderAberta(null); }
  }, [abertaId, carregarDetalhe, consultaDetalhe.begin]);

  useEffect(() => {
    if (secao !== 'transferencias') return;
    atualizar(paginaTransferencias.current).then(resultado => { if (resultado) reconhecerTransferencias(); });
  }, [atualizar, reconhecerTransferencias, secao]);

  function trocarSecao(proxima) {
    setParametros(atuais => {
      const novos = new URLSearchParams(atuais);
      if (proxima === 'transferencias') novos.set('secao', 'transferencias');
      else novos.delete('secao');
      return novos;
    });
  }

  async function abrir(s) {
    if (ocupado) return;
    if (String(abertaId) === String(s.id)) await carregarDetalhe(s.id);
    else setAbertaId(s.id);
    await atualizar(paginaTransferencias.current);
  }

  async function executar(fn) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    try {
      await fn();
      await atualizar(paginaTransferencias.current);
    } catch (e) { avisar.erro(e.message); }
    finally { trava.current = false; setOcupado(false); }
  }

  async function decidir(acao) {
    if (!aberta || trava.current || (acao === 'aprovar' || acao === 'rejeitar'
      ? !aberta.pode_decidir : acao === 'enviar' ? !aberta.pode_enviar : !aberta.pode_cancelar)) return;
    if (acao === 'rejeitar' && !comentario.trim()) { avisar.erro('Informe o motivo no campo de comentário.'); return; }
    const { ok } = await confirmar({
      titulo: `${acao === 'aprovar' ? 'Aprovar' : acao === 'rejeitar' ? 'Rejeitar' : acao === 'enviar' ? 'Enviar' : 'Cancelar'} transferência?`,
      mensagem: acao === 'aprovar' ? 'O colaborador passará para a obra de destino a partir de hoje.' : 'Confirme a ação sobre esta transferência.'
    });
    if (!ok) return;
    executar(async () => {
      await rhTransferencias(`/${aberta.id}/${acao}`, { method: 'POST', data: { texto: comentario } });
      setComentario('');
      setAberta(null);
      avisar.sucesso('Transferência atualizada.');
    });
  }

  function selecionar(c) {
    if (carregando || ocupado || !minhas.length) return;
    const souOrigem = config.obras_responsavel_ids.includes(Number(c.obra_id));
    const destino = souOrigem ? '' : String(minhas.find(o => Number(o.id) !== Number(c.obra_id))?.id || '');
    setForm({ colaborador: c, obra_destino_id: destino, justificativa: '' });
  }

  const colunasTransferencias = [
    { id: 'colaborador', titulo: 'Colaborador', tipo: 'identidade', noCard: 'titulo', render: s => s.colaborador?.nome || '—' },
    { id: 'origem', titulo: 'Origem', tipo: 'texto', render: s => s.obra?.nome || nomeObra(s.obra_id) },
    { id: 'destino', titulo: 'Destino', tipo: 'texto', render: s => s.obra_destino_nome || nomeObra(s.obra_destino_id) },
    { id: 'situacao', titulo: 'Situação', tipo: 'status', render: s => <>{s.situacao}{s.nao_lida && <span className="rh-chip rh-chip--aberta ml-2">Nova interação</span>}</> },
    { id: 'responsavel', titulo: 'Aprovação por', tipo: 'texto', render: s => s.aprovacao_automatica ? 'Automática' : nomeObra(s.obra_aprovadora_id) },
    { id: 'atividade', titulo: 'Última interação', tipo: 'data', render: s => data(s.atividade_em) }
  ];

  const paginacao = (pagina, aoMudar) => (
    <div className="app-page-actions">
      <span aria-live="polite">{pagina.total} transferência(ões) · Página {pagina.pagina} de {pagina.total_paginas}</span>
      <button type="button" className="btn btn-outline btn-sm" disabled={pagina.pagina <= 1} onClick={() => aoMudar(pagina.pagina - 1)}>Anterior</button>
      <button type="button" className="btn btn-outline btn-sm" disabled={pagina.pagina >= pagina.total_paginas} onClick={() => aoMudar(pagina.pagina + 1)}>Próxima</button>
    </div>
  );

  return <div className="space-y-4 min-w-0">
    <Avisos avisos={avisos} aoFechar={fechar} />
    <div className="rh-pessoal-abas rh-transferencias-subabas" role="tablist" aria-label="Consultas de transferências">
      <button type="button" role="tab" aria-selected={secao === 'global'} className={`rh-pessoal-aba${secao === 'global' ? ' rh-pessoal-aba--ativa' : ''}`} onClick={() => trocarSecao('global')}>Todos Colaboradores</button>
      <button type="button" role="tab" aria-selected={secao === 'transferencias'} className={`rh-pessoal-aba${secao === 'transferencias' ? ' rh-pessoal-aba--ativa' : ''}`} onClick={() => trocarSecao('transferencias')}>
        {obraId ? 'Transferências deste local' : config.acesso_global ? 'Transferências entre obras' : 'Transferências das minhas obras'}
        {transferencias.nao_lidas > 0 ? <span className="rh-pessoal-aba-contador">{transferencias.nao_lidas}</span> : null}
      </button>
    </div>

    {secao === 'transferencias' ? <>
      <p className="form-hint">{obraId ? 'Transferências com origem ou destino neste local. A aprovação continua com os responsáveis das obras envolvidas.' : config.acesso_global
        ? 'Consulte as transferências pendentes e resolvidas de todas as obras. A decisão continua com os responsáveis das obras envolvidas.'
        : 'Acompanhe na mesma lista as transferências pendentes e as já resolvidas entre suas obras.'}</p>
      {!config.acesso_global && !minhas.length && <p className="alert alert-info">Para solicitar ou aprovar, configure o responsável ou substituto vigente em Configurações → Responsáveis por obra.</p>}
      <section aria-label="Transferências entre obras">
        <div className="app-page-actions">
          <h3 className="app-bloco-titulo">{config.acesso_global ? 'Transferências entre obras' : 'Transferências das minhas obras'}</h3>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => atualizar(transferencias.pagina)}>Atualizar</button>
        </div>
        <TabelaPadrao chaveWorkspace="transferencias:tabela" storageKey="tabela:rh-transferencias-todas" itens={transferencias.itens} carregando={carregandoTransferencias}
          urgencia={s => s.nao_lida ? 'warning' : null} classeLinha={s => s.nao_lida ? 'rh-solicitacao-nao-lida' : ''}
          vazio={config.acesso_global ? 'Nenhuma transferência entre obras encontrada.' : 'Nenhuma transferência encontrada para os responsáveis deste usuário.'}
          colunas={colunasTransferencias} acoesLinha={s => <button type="button" className="btn btn-outline btn-sm" onClick={() => abrir(s)}>Abrir</button>} />
        {paginacao(transferencias, atualizar)}
      </section>
    </> : <section aria-label="Todos Colaboradores">
      <p className="form-hint">Somente identificação profissional e obra atual. Sem dados financeiros ou documentos pessoais.</p>
      <form className="app-page-actions" onSubmit={e => { e.preventDefault(); pesquisar(1, busca.trim()); }}>
        <label className="form-field flex-1 min-w-0"><span className="form-label">Nome, matrícula ou função</span>
          <input className="form-control" value={busca} onChange={e => setBusca(e.target.value)} maxLength={100} /></label>
        <button className="btn btn-outline" disabled={carregando}>{carregando ? 'Pesquisando…' : 'Pesquisar'}</button>
      </form>
      <TabelaPadrao chaveWorkspace="transferencias:diretorio" consultaWorkspace={buscaAplicada} storageKey="tabela:rh-diretorio-global" itens={diretorio.itens} carregando={carregando}
        vazio={buscaAplicada ? 'Nenhum colaborador encontrado para esta pesquisa.' : 'Nenhum colaborador ativo encontrado.'}
        colunas={[
          { id: 'nome', titulo: 'Nome', tipo: 'identidade', noCard: 'titulo', render: c => c.nome },
          { id: 'matricula', titulo: 'Matrícula', tipo: 'codigo', render: c => c.matricula || '—' },
          { id: 'cargo', titulo: 'Função', tipo: 'texto', render: c => c.cargo || '—' },
          { id: 'obra', titulo: 'Obra atual', tipo: 'texto', render: c => c.obra?.nome || 'Sem obra' }
        ]} acoesLinha={c => minhas.length ? <button type="button" className="btn btn-outline btn-sm" onClick={() => selecionar(c)}>Solicitar transferência</button> : null} />
      <div className="app-page-actions">
        <span aria-live="polite">{diretorio.total} colaborador(es) · Página {diretorio.pagina} de {Math.max(1, Math.ceil(diretorio.total / 50))}</span>
        <button type="button" className="btn btn-outline btn-sm" disabled={carregando || diretorio.pagina <= 1} onClick={() => pesquisar(diretorio.pagina - 1, buscaAplicada)}>Anterior</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={carregando || diretorio.pagina * 50 >= diretorio.total} onClick={() => pesquisar(diretorio.pagina + 1, buscaAplicada)}>Próxima</button>
      </div>
    </section>}

    {form && <OverlayModal rotulo="Solicitar transferência entre obras" onFechar={() => { if (!ocupado) setForm(null); }}>
      <form className="space-y-3 p-4" onSubmit={e => { e.preventDefault(); if (formConflito || !fluxoForm?.destino || !fluxoForm?.solicitante) return; executar(async () => {
        const resultado = await rhTransferencias('', { method: 'POST', data: { colaborador_id: form.colaborador.id,
          obra_destino_id: Number(form.obra_destino_id), justificativa: form.justificativa } });
        setForm(null);
        avisar.sucesso(resultado.aprovacao_automatica
          ? `Transferência efetivada automaticamente em ${dataDia(resultado.data_vigencia)}.`
          : 'Transferência enviada ao responsável da outra obra.');
        await pesquisar(diretorio.pagina, buscaAplicada);
      }); }}>
        <h2 className="app-bloco-titulo">Solicitar transferência entre obras</h2>
        {formConflito && <p role="alert" className="app-note">A obra atual do colaborador mudou. Cancele este preenchimento e confira a nova origem antes de transferir.</p>}
        <p><strong>{form.colaborador.nome}</strong> · Obra atual: {form.colaborador.obra?.nome || nomeObra(form.colaborador.obra_id)}</p>
        <label className="form-field"><span className="form-label">Obra de destino</span>
          <select className="form-control" aria-label="Obra de destino" required value={form.obra_destino_id}
            onChange={e => setForm(f => ({ ...f, obra_destino_id: e.target.value }))}>
            <option value="">Selecione</option>
            {obrasTransferiveis.filter(o => Number(o.id) !== Number(form.colaborador.obra_id)).map(o => {
              const habilitada = fluxoForm?.responsavelOrigem || config.obras_responsavel_ids.includes(Number(o.id));
              return <option key={o.id} value={o.id} disabled={!habilitada}>
                {o.codigo} · {o.nome}{habilitada ? '' : ' · sem responsabilidade atribuída'}
              </option>;
            })}
          </select>
        </label>
        {fluxoForm?.destino ? <div className={`alert ${fluxoForm.automatico ? 'alert-success' : 'alert-info'}`}>
          {fluxoForm.automatico
            ? <>{fluxoForm.origem ? 'Você responde pela obra atual e pela obra de destino.' : 'O colaborador está sem obra e você responde pela obra de destino.'} A transferência será aprovada automaticamente e terá vigência hoje.</>
            : <>Solicitação feita pela obra <strong>{nomeObra(fluxoForm.solicitante)}</strong>. Aprovação necessária pela obra <strong>{nomeObra(fluxoForm.aprovadora)}</strong>; a vigência começa na aprovação.</>}
        </div> : null}
        <label className="form-field"><span className="form-label">Justificativa</span><textarea className="form-control" aria-label="Justificativa" required maxLength={2000} value={form.justificativa} onChange={e => setForm(f => ({ ...f, justificativa: e.target.value }))} /></label>
        <div className="app-page-actions"><button className="btn btn-primary" disabled={ocupado || formConflito || !fluxoForm?.destino || !fluxoForm?.solicitante}>{ocupado ? 'Processando…' : fluxoForm?.automatico ? 'Confirmar transferência' : 'Enviar para aprovação'}</button><button type="button" className="btn btn-outline" disabled={ocupado} onClick={() => setForm(null)}>Cancelar</button></div>
      </form>
    </OverlayModal>}

    {aberta && <OverlayModal rotulo={`Transferência #${aberta.id}`} onFechar={() => { if (!ocupado) setAberta(null); }}>
      <div className="space-y-3 p-4">
        <div className="app-page-actions"><h2 className="app-bloco-titulo">Transferência #{aberta.id}</h2><button type="button" className="btn btn-outline btn-sm" disabled={ocupado} onClick={() => setAberta(null)}>Fechar</button></div>
        <p><strong>{aberta.colaborador?.nome}</strong> · {aberta.obra?.nome || nomeObra(aberta.obra_id)} → {nomeObra(aberta.obra_destino_id)}</p>
        <p>{aberta.situacao} · Aprovação: {aberta.aprovacao_automatica ? 'Automática' : nomeObra(aberta.obra_aprovadora_id)}{aberta.data_vigencia ? ` · Vigência: ${dataDia(aberta.data_vigencia)}` : ''}</p>
        <p>{aberta.justificativa}</p>
        <ul className="rh-pessoal-historico">{(aberta.historicos || []).map(h => <li key={h.id}><small>{data(h.createdAt)} · Usuário #{h.usuario_id} · {h.setor}</small><div>{h.descricao}</div></li>)}</ul>
        <label className="form-field"><span className="form-label">Comentário / motivo da rejeição</span><textarea className="form-control" aria-label="Comentário / motivo da rejeição" maxLength={2000} value={comentario} onChange={e => setComentario(e.target.value)} /></label>
        <div className="app-page-actions">
          <button type="button" className="btn btn-outline" disabled={ocupado || !comentario.trim()} onClick={() => executar(async () => {
            await rhTransferencias(`/${aberta.id}/comentar`, { method: 'POST', data: { texto: comentario } }); setComentario(''); await abrir(aberta);
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
