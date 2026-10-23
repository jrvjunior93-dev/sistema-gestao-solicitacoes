import useVisualizadorArquivo from '../hooks/useVisualizadorArquivo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceState, useWorkspaceWork } from '../navigation/WorkspaceContext';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { HiOutlineBell, HiOutlineCheckCircle, HiOutlineDocumentText, HiOutlineFingerPrint, HiOutlineLockClosed, HiOutlineXCircle } from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import { Avisos, Pagina, useAvisos } from '../components/padrao';
import { getUsuarios } from '../services/usuarios';
import {
  confirmarRegistroPasskey,
  assinarNotificacoesPagamento,
  decidirAutorizacaoPagamento,
  listarAutorizacoesPagamento,
  listarAutorizadoresPagamento,
  listarPasskeysPagamento,
  obterDocumentoAutorizacao,
  obterOpcoesDecisaoPasskey,
  obterOpcoesRegistroPasskey,
  removerNotificacoesPagamento,
  revogarPasskeyPagamento,
  reenviarAutorizacaoParaFila,
  salvarAutorizadorPagamento
} from '../services/pagamentoAutorizacao';
import { autenticarComPasskey, registrarPasskey, suportaPasskeys } from '../utils/webauthn';
import { passkeyInterrompida, mensagemPasskeyInterrompida } from '../utils/passkeyInterrompida';
import { criarAssinaturaPush, obterAssinaturaPush, suportaWebPush } from '../utils/webPush';
import { codigoLoteAutorizacao, motivosAjusteAutorizacao, resumoSolicitacaoAutorizacao } from '../utils/autorizacaoPagamentoResumo';
import OverlayModal from '../components/ui/OverlayModal';
import AutorizacoesPorObra from '../components/financeiro/AutorizacoesPorObra';
import AutorizacaoReenvioAviso from '../components/financeiro/AutorizacaoReenvioAviso';
import { rotuloSituacao, tituloExcluido, podeReenviarAutorizacao } from '../utils/autorizacaoPagamentoSituacao';
import TituloExcluidoAviso from '../components/financeiro/TituloExcluidoAviso';
import usePollingSeguro from '../hooks/usePollingSeguro';
import { useWorkspaceActive } from '../navigation/WorkspaceContext';
import '../styles/financeiro-autorizacoes-pagamento.css';

const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value) => value ? new Date(value).toLocaleString('pt-BR') : '-';

function Status({ value }) {
  const label = rotuloSituacao(value);
  return <span className={`pa-status pa-status--${String(value || '').toLowerCase()}`}>{label}</span>;
}

export default function FinanceiroAutorizacoesPagamento() {
  const { abrirPreview, modalPreview } = useVisualizadorArquivo();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshSession } = useAuth();
  const caps = user?.autorizacao_pagamentos || {};
  const workspaceAtivo = useWorkspaceActive();
  const [visao, setVisao] = useWorkspaceState('autorizacoes:visao:v2', 'obras');
  const [paginaLotes, setPaginaLotes] = useWorkspaceState('autorizacoes:pagina', 1);
  const [paginacaoLotes, setPaginacaoLotes] = useState({ total: 0, mais: false });
  const [revisaoObras, setRevisaoObras] = useState(0);
  const { avisos, avisar, fechar } = useAvisos();
  const [lots, setLots] = useState([]);
  const [selectedId, setSelectedId] = useWorkspaceState('autorizacoes:lote', null);
  const [trabalhoPorLote, setTrabalhoPorLote] = useWorkspaceState('autorizacoes:trabalho', {});
  const mutationRef = useRef(false);
  const [operando, setBusy] = useState(false);
  const [carregandoLotes, setCarregandoLotes] = useState(false);
  const busy = operando || (visao === 'lotes' && carregandoLotes);
  const [users, setUsers] = useState([]);
  const [authorizers, setAuthorizers] = useState([]);
  const [authorizerUserId, setAuthorizerUserId] = useState('');
  const [pushActive, setPushActive] = useState(false);
  const [passkeys, setPasskeys] = useState([]);
  const listaRequestRef = useRef(0);
  const vooLotes = useRef(Promise.resolve());

  const selected = useMemo(() => lots.find((lot) => Number(lot.id) === Number(selectedId)) || lots[0] || null, [lots, selectedId]);
  const pendingItems = useMemo(() => (selected?.itens || []).filter((item) => item.status === 'PENDENTE' && !tituloExcluido(item)), [selected]);
  const trabalho = trabalhoPorLote[selected?.id] || {};
  const selectedItems = (trabalho.selectedItems || pendingItems.map(item => Number(item.id)))
    .filter(id => pendingItems.some(item => Number(item.id) === id));
  const revokeItems = (trabalho.revokeItems || []).filter(id => (selected?.itens || [])
    .some(item => Number(item.id) === id && !tituloExcluido(item) && ['AUTORIZADO', 'ENFILEIRADO'].includes(item.status)));
  const rejectReason = trabalho.rejectReason || '';
  const revokeReason = trabalho.revokeReason || '';
  const alterarTrabalho = (key, update) => {
    if (!selected) return;
    setTrabalhoPorLote(current => {
      const anterior = current[selected.id] || {};
      const initial = key === 'selectedItems' ? selectedItems : key === 'revokeItems' ? revokeItems : '';
      return { ...current, [selected.id]: { ...anterior,
        [key]: typeof update === 'function' ? update(anterior[key] || initial) : update } };
    });
  };
  const setSelectedItems = update => alterarTrabalho('selectedItems', update);
  const setRevokeItems = update => alterarTrabalho('revokeItems', update);
  const setRejectReason = update => alterarTrabalho('rejectReason', update);
  const setRevokeReason = update => alterarTrabalho('revokeReason', update);
  useWorkspaceWork(Boolean(Object.keys(trabalhoPorLote).length), busy);
  const selectedTotal = useMemo(() => pendingItems.filter((item) => selectedItems.includes(Number(item.id))).reduce((sum, item) => sum + Number(item.valor_snapshot || 0), 0), [pendingItems, selectedItems]);
  const justificativaId = searchParams.get('justificativa');
  const loteJustificativa = lots.find(lot => (lot.itens || []).some(item => String(item.id) === justificativaId));
  const itemJustificativa = loteJustificativa?.itens.find(item => String(item.id) === justificativaId);
  const textoJustificativa = itemJustificativa?.titulo?.solicitacao?.justificativa;
  const motivoId = searchParams.get('motivo');
  const loteMotivo = lots.find(lot => (lot.itens || []).some(item => String(item.id) === motivoId));
  const itemMotivo = loteMotivo?.itens.find(item => String(item.id) === motivoId);

  useEffect(() => {
    if (loteJustificativa) setSelectedId(loteJustificativa.id);
  }, [loteJustificativa?.id]);
  useEffect(() => { if (loteMotivo) setSelectedId(loteMotivo.id); }, [loteMotivo?.id]);

  function abrirMotivo(itemId) {
    const next = new URLSearchParams(searchParams);
    next.delete('justificativa');
    next.set('motivo', String(itemId));
    setSearchParams(next, { state: { ...location.state, modalMotivo: true } });
  }

  function fecharMotivo() {
    if (location.state?.modalMotivo && Number(window.history.state?.idx) > 0) return navigate(-1);
    const next = new URLSearchParams(searchParams);
    next.delete('motivo');
    setSearchParams(next, { replace: true, state: { ...location.state, modalMotivo: false } });
  }

  function abrirJustificativa(itemId) {
    const next = new URLSearchParams(searchParams);
    next.delete('motivo');
    next.set('justificativa', String(itemId));
    // Uma entrada na mesma rota permite que voltar/gesto do aparelho feche
    // apenas o modal, preservando lote, selecao e lista montados.
    setSearchParams(next, { state: { ...location.state, modalJustificativa: true } });
  }

  function fecharJustificativa() {
    if (location.state?.modalJustificativa && Number(window.history.state?.idx) > 0) {
      navigate(-1);
      return;
    }
    // Link direto/sem historico seguro: nao sair da pagina de autorizacoes.
    const next = new URLSearchParams(searchParams);
    next.delete('justificativa');
    setSearchParams(next, { replace: true, state: { ...location.state, modalJustificativa: false } });
  }

  function carregarLotes() {
    const requestId = ++listaRequestRef.current;
    const tarefa = vooLotes.current.catch(() => {}).then(async () => {
      if (requestId !== listaRequestRef.current) return;
      setCarregandoLotes(true);
      try {
        const response = await listarAutorizacoesPagamento({ pagina: String(paginaLotes), limite: '30' });
        if (requestId !== listaRequestRef.current) return;
        const rows = response?.data || [];
        setLots(rows);
        setPaginacaoLotes(response?.paginacao || { total: rows.length, mais: false });
        setSelectedId((current) => rows.some((row) => Number(row.id) === Number(current)) ? current : rows[0]?.id || null);
      } catch (error) {
        if (requestId === listaRequestRef.current) setLots([]);
        throw error;
      } finally { setCarregandoLotes(false); }
    });
    vooLotes.current = tarefa;
    return tarefa;
  }

  async function load() {
    try {
      if (visao === 'lotes') await carregarLotes();
      else setRevisaoObras(current => current + 1);
      if (caps.can_decide) {
        const passkeyResponse = await listarPasskeysPagamento();
        setPasskeys(passkeyResponse?.data || []);
      }
      if (caps.can_configure) {
        const [authorizerResponse, userResponse] = await Promise.all([listarAutorizadoresPagamento(), getUsuarios()]);
        setAuthorizers(authorizerResponse?.data || []);
        setUsers((Array.isArray(userResponse) ? userResponse : userResponse?.data || []).filter((item) => item.ativo !== false));
      }
    } catch (error) {
      avisar.erro(error?.message || 'Não foi possível carregar as autorizações.');
    }
  }

  useEffect(() => { load(); return () => { listaRequestRef.current++; }; }, [visao, paginaLotes]);
  usePollingSeguro(carregarLotes, { ativo: visao === 'lotes' && !busy && workspaceAtivo, imediato: false });
  useEffect(() => { if (justificativaId || motivoId) setVisao('lotes'); }, [justificativaId, motivoId]);
  useEffect(() => {
    if (!caps.can_decide || !caps.push_available || !suportaWebPush()) {
      setPushActive(false);
      return;
    }
    obterAssinaturaPush()
      .then((subscription) => setPushActive(Boolean(subscription) && Boolean(caps.push_subscribed)))
      .catch(() => setPushActive(false));
  }, [caps.can_decide, caps.push_available, caps.push_subscribed]);

  async function registerPasskey() {
    if (!suportaPasskeys()) return avisar.erro('Este navegador não oferece suporte a passkeys.');
    setBusy(true);
    try {
      const options = await obterOpcoesRegistroPasskey();
      const credential = await registrarPasskey(options);
      await confirmarRegistroPasskey(credential, navigator.userAgentData?.platform || navigator.platform || 'Celular pessoal');
      await refreshSession();
      avisar.sucesso('Passkey cadastrada. A biometria/PIN do aparelho já pode confirmar autorizações.');
    } catch (error) {
      avisar.erro(error?.message || 'Não foi possível cadastrar a passkey.');
    } finally { setBusy(false); }
  }

  async function togglePush() {
    if (!caps.push_public_key) return avisar.erro('As notificações ainda não foram configuradas neste ambiente.');
    setBusy(true);
    try {
      if (pushActive) {
        const current = await obterAssinaturaPush();
        if (current) {
          await removerNotificacoesPagamento(current.endpoint);
          await current.unsubscribe();
        }
        setPushActive(false);
        avisar.sucesso('Notificações desativadas neste aparelho.');
        return;
      }
      const subscription = await criarAssinaturaPush(caps.push_public_key);
      await assinarNotificacoesPagamento(subscription.toJSON());
      setPushActive(true);
      avisar.sucesso('Notificações ativadas neste aparelho. O conteúdo financeiro não será exibido no aviso.');
    } catch (error) { avisar.erro(error?.message || 'Não foi possível ativar as notificações.'); }
    finally { setBusy(false); }
  }

  async function revokePasskey(id) {
    if (busy) return;
    setBusy(true);
    try {
      await revogarPasskeyPagamento(id);
      await refreshSession();
      await load();
      avisar.sucesso('Passkey revogada neste usuário.');
    } catch (error) { avisar.erro(error?.message || 'Não foi possível revogar a passkey.'); }
    finally { setBusy(false); }
  }

  async function decide(decision) {
    if (!selectedItems.length || busy || mutationRef.current) return;
    if (decision === 'REJEITAR' && !rejectReason.trim()) return avisar.erro('Informe o motivo da rejeição.');
    const decisions = selectedItems.map((itemId) => ({ item_id: itemId, decisao: decision, motivo: decision === 'REJEITAR' ? rejectReason.trim() : null }));
    mutationRef.current = true;
    setBusy(true);
    try {
      const options = await obterOpcoesDecisaoPasskey(selected.id, decisions);
      const credential = await autenticarComPasskey(options);
      const resultado = await decidirAutorizacaoPagamento(selected.id, decisions, credential);
      setRejectReason('');
      await load();
      if (resultado.envio_pendente) avisar.alerta('Autorização registrada. O envio à fila não foi concluído. Use Reenviar autorizados para a fila.');
      else avisar.sucesso(decision === 'AUTORIZAR' ? 'Pagamentos autorizados e encaminhados à fila.' : 'Pagamentos rejeitados com rastreabilidade.');
    } catch (error) {
      if (passkeyInterrompida(error)) avisar.alerta(mensagemPasskeyInterrompida());
      else avisar.erro(error?.message || 'Não foi possível registrar a decisão.');
    } finally { mutationRef.current = false; setBusy(false); }
  }

  async function revokeAuthorization() {
    if (busy || mutationRef.current || !revokeItems.length || !caps.can_decide) return;
    if (!revokeReason.trim()) return avisar.erro('Informe o motivo da revogação.');
    const decisions = revokeItems.map(itemId => ({ item_id: itemId, decisao: 'REVOGAR', motivo: revokeReason.trim() }));
    mutationRef.current = true;
    setBusy(true);
    try {
      const options = await obterOpcoesDecisaoPasskey(selected.id, decisions);
      const credential = await autenticarComPasskey(options);
      await decidirAutorizacaoPagamento(selected.id, decisions, credential);
      setRevokeItems([]); setRevokeReason('');
      await load();
      avisar.sucesso('Autorização revogada. Os títulos saíram da fila e voltaram para decisão do proprietário.');
    } catch (error) {
      if (passkeyInterrompida(error)) avisar.alerta(mensagemPasskeyInterrompida());
      else avisar.erro(error?.message || 'Não foi possível revogar a autorização.');
    }
    finally { mutationRef.current = false; setBusy(false); }
  }

  async function openDocument(doc) {
    try {
      await abrirPreview(() => obterDocumentoAutorizacao(doc.id), { nome: doc.nome, mime: doc.mime_type });
    } catch (error) { avisar.erro(error?.message || 'Não foi possível abrir o documento.'); }
  }

  async function addAuthorizer() {
    if (!authorizerUserId) return;
    setBusy(true);
    try {
      await salvarAutorizadorPagamento({ usuario_id: Number(authorizerUserId), ativo: true, piloto: caps.mode === 'PILOT' });
      setAuthorizerUserId('');
      await load();
      avisar.sucesso('Autorizador nominal atualizado. Conceda também a permissão granular de decisão.');
    } catch (error) { avisar.erro(error?.message || 'Não foi possível salvar o autorizador.'); }
    finally { setBusy(false); }
  }

  async function toggleAuthorizer(item) {
    if (busy) return;
    setBusy(true);
    try {
      await salvarAutorizadorPagamento({ usuario_id: Number(item.usuario_id), ativo: !item.ativo, piloto: Boolean(item.piloto), limite_por_lote: item.limite_por_lote || null });
      await load();
      avisar.sucesso(item.ativo ? 'Autorizador desativado imediatamente.' : 'Autorizador reativado.');
    } catch (error) { avisar.erro(error?.message || 'Não foi possível atualizar o autorizador.'); }
    finally { setBusy(false); }
  }

  async function retryQueue() {
    if (busy || mutationRef.current) return;
    mutationRef.current = true;
    setBusy(true);
    try { await reenviarAutorizacaoParaFila(selected.id, selected.itens.filter(podeReenviarAutorizacao).map(i => Number(i.id))); await load(); avisar.sucesso('Itens autorizados encaminhados para a fila.'); }
    catch (error) { avisar.erro(error?.message || 'Não foi possível reenviar para a fila.'); }
    finally { mutationRef.current = false; setBusy(false); }
  }

  return (
    <Pagina className="pa-pagina">
      <Avisos avisos={avisos} onFechar={fechar} />

      <div className="pa-pwa-toolbar">
        <div className="pa-visoes" role="group" aria-label="Visualização das autorizações">
          <button type="button" className="btn btn-outline btn-sm" aria-pressed={visao === 'obras'} disabled={busy} onClick={() => setVisao('obras')}>Por obra</button>
          <button type="button" className="btn btn-outline btn-sm" aria-pressed={visao === 'lotes'} disabled={busy} onClick={() => setVisao('lotes')}>Por lote / histórico</button>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={busy}>Atualizar</button>
        <details className="pa-pwa-options">
          <summary>Opções</summary>
          <div className="pa-pwa-options__content">
            <span>Modo {caps.mode}</span>
            {caps.can_decide && <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={togglePush} disabled={busy || !caps.push_available || !suportaWebPush()}><HiOutlineBell /> {!caps.push_available ? 'Avisos não configurados' : (pushActive ? 'Desativar avisos' : 'Ativar avisos')}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={registerPasskey} disabled={busy}><HiOutlineFingerPrint /> {caps.passkey_count ? 'Adicionar passkey' : 'Cadastrar passkey'}</button>
              <a href="#pa-dispositivos">Dispositivos autorizados</a>
            </>}
          </div>
        </details>
      </div>
      {caps.paused && <p role="status">Novas decisões pausadas.</p>}
      {/^[1-9]\d*$/.test(searchParams.get('reenvio') || '') && <AutorizacaoReenvioAviso loteId={Number(searchParams.get('reenvio'))}
        caps={caps} busy={busy} setBusy={setBusy} onAtualizado={() => { setRevisaoObras(n => n + 1); load(); }}
        onFechar={() => { const params = new URLSearchParams(searchParams); params.delete('reenvio'); setSearchParams(params, { replace: true }); }} />}
      {visao === 'obras' && <AutorizacoesPorObra user={user} userId={user?.id} caps={caps} busy={busy} setBusy={setBusy} abrirDocumento={openDocument} revisao={revisaoObras} />}
      {visao === 'lotes' && <div className="pa-layout">
        <aside className="pa-list" aria-label="Lotes de autorização">
          <div className="pa-list__head"><strong>Pendências e histórico</strong><span>{paginacaoLotes.total} lotes</span></div>
          {carregandoLotes && <p role="status" className="pa-obras-paginacao">Atualizando lotes…</p>}
          {lots.length === 0 && <p className="pa-empty">Nenhum lote disponível.</p>}
          {lots.map((lot) => (
            <button key={lot.id} type="button" className={`pa-lot ${Number(selected?.id) === Number(lot.id) ? 'is-active' : ''}`} onClick={() => setSelectedId(lot.id)}>
              <span><strong title={lot.codigo}>{codigoLoteAutorizacao(lot)}</strong><Status value={lot.situacao_financeira || lot.status} /></span>
              <span>{money(lot.valor_total)} · {lot.quantidade_itens} título(s)</span>
              <small>Criado em {date(lot.createdAt)}</small>
              {motivosAjusteAutorizacao(lot).map(ajuste => <small key={ajuste.id} className="pa-lot-reason">
                <strong>{ajuste.referencia}</strong> · Motivo do ajuste: {ajuste.motivo}
              </small>)}
            </button>
          ))}
          <nav className="pa-obras-paginacao" aria-label="Paginação de lotes"><span>Página {paginaLotes}</span>
            <button type="button" className="btn btn-outline btn-sm" disabled={busy || paginaLotes <= 1} onClick={() => setPaginaLotes(paginaLotes - 1)}>Anterior</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={busy || !paginacaoLotes.mais} onClick={() => setPaginaLotes(paginaLotes + 1)}>Próxima</button>
          </nav>
        </aside>

        <section className="pa-detail">
          {!selected ? <p className="pa-empty">Selecione um lote.</p> : <>
            <header className="pa-detail__head">
              <div><strong title={selected.codigo}>{codigoLoteAutorizacao(selected)}</strong><span>Criado por {selected.criadoPor?.nome || '-'} · hash {String(selected.dossie_hash).slice(0, 12)}…</span>
                <details className="pa-lot-record"><summary>Registro do lote</summary><small>Criado em {date(selected.createdAt)} · Código registrado: {selected.codigo}</small></details>
              </div>
              <div><Status value={selected.situacao_financeira || selected.status} />
                {selected.resumo_situacoes && <small>{Object.entries(selected.resumo_situacoes).map(([estado, quantidade]) => `${quantidade} ${rotuloSituacao(estado)}`).join(' · ')}</small>}
                {caps.can_decide && (selected.itens || []).some(item => !tituloExcluido(item) && ['AUTORIZADO', 'ENFILEIRADO'].includes(item.status)) &&
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
                    onClick={() => setRevokeItems((selected.itens || []).filter(item => !tituloExcluido(item) && ['AUTORIZADO', 'ENFILEIRADO'].includes(item.status)).map(item => Number(item.id)))}>Revogar autorizações do lote</button>}
              </div>
            </header>
            <div className="pa-table-wrap">
              <table className="pa-table">
                <thead><tr><th aria-label="Selecionar" /><th>Solicitação</th><th>Credor e pagamento</th><th>Obra</th><th>Vencimento</th><th className="num pa-value-column">Valor</th><th>Documentos</th><th>Status</th><th>Justificativa</th><th>Motivo</th></tr></thead>
                <tbody>{(selected.itens || []).map((item) => {
                  const snapshot = item.snapshot_json || {};
                  return <tr key={item.id}>
                    <td>{item.status === 'PENDENTE' && !tituloExcluido(item) && <input type="checkbox" checked={selectedItems.includes(Number(item.id))} onChange={(event) => setSelectedItems((current) => event.target.checked ? [...current, Number(item.id)] : current.filter((id) => id !== Number(item.id)))} />}</td>
                    <td><strong>{snapshot.solicitacao?.codigo || snapshot.codigo || `#${snapshot.titulo_id}`}</strong>
                      {snapshot.solicitacao?.codigo && <small>Título {snapshot.codigo || `#${snapshot.titulo_id}`}</small>}
                      <small>{resumoSolicitacaoAutorizacao(snapshot)}</small><small className="pa-title-value"><span>Valor do título</span><strong>{money(item.valor_snapshot)}</strong></small></td>
                    <td>{snapshot.favorecido_pagamento?.nome || snapshot.credor?.nome || '-'}<small>{snapshot.favorecido_pagamento?.documento_mascarado || snapshot.credor?.documento_mascarado || ''}</small><small>{snapshot.forma_pagamento?.nome || snapshot.favorecido_pagamento?.metodo || ''}{snapshot.favorecido_pagamento?.pix_mascarado ? ` · ${snapshot.favorecido_pagamento.pix_mascarado}` : ''}</small></td>
                    <td>{snapshot.obra?.nome || (snapshot.compartilhamento_id ? 'Várias origens' : '-')}
                      {snapshot.compartilhamento_id && <details><summary>Lote #{snapshot.compartilhamento_id} · participações</summary>
                        {(snapshot.participacoes || []).map((p, i) => <small key={i}>Solicitação #{p.solicitacao_id}{p.pedido_compra_id ? ` · PC-${String(p.pedido_compra_id).padStart(5, '0')}` : ''}<br />{p.obra_nome || `Obra #${p.obra_id}`} · {p.empresa_nome || `Empresa #${p.empresa_id}`} · {money(p.valor)}</small>)}
                      </details>}</td><td>{snapshot.data_vencimento || '-'}</td><td className="num pa-value-column">{money(item.valor_snapshot)}</td>
                    <td><div className="pa-documents">{(item.documentos || []).map((doc) => <button type="button" key={doc.id} onClick={() => openDocument(doc)} title={doc.nome}><HiOutlineDocumentText /><span>{doc.nome}</span></button>)}</div></td>
                    <td><Status value={item.situacao_financeira || item.status} />{item.fila_item_id && <small>Fila #{item.fila_item_id}</small>}
                      <TituloExcluidoAviso exclusao={item.exclusao_titulo} />
                      {item.situacao_financeira && ['REJEITADO', 'INVALIDADO', 'CANCELADO'].includes(item.status) && <small>Decisão registrada: {rotuloSituacao(item.status)}</small>}
                      {caps.can_decide && !tituloExcluido(item) && ['AUTORIZADO', 'ENFILEIRADO'].includes(item.status) && item.titulo?.status === 'ABERTO' &&
                        Number(item.titulo?.valor_baixado || 0) === 0 && <button type="button" className="btn btn-secondary btn-sm"
                          disabled={busy} onClick={() => setRevokeItems([Number(item.id)])}>Revogar autorização</button>}
                    </td>
                    <td className="pa-justification-column">{String(item.titulo?.solicitacao?.justificativa || '').trim() ?
                      <button type="button" className="pa-justification-preview" onClick={() => abrirJustificativa(item.id)}
                        aria-label={`Ler justificativa de ${snapshot.solicitacao?.codigo || snapshot.codigo || `título ${snapshot.titulo_id}`}`}>
                        {item.titulo.solicitacao.justificativa}
                      </button> : '-'}</td>
                    <td className="pa-reason-column">{String(item.motivo_decisao || '').trim() ?
                      <button type="button" className="pa-justification-preview" onClick={() => abrirMotivo(item.id)}
                        aria-label={`Ler motivo do ajuste de ${snapshot.solicitacao?.codigo || snapshot.codigo || `título ${snapshot.titulo_id}`}`}>
                        {item.motivo_decisao}
                      </button> : '-'}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {caps.can_decide && pendingItems.length > 0 && <div className="pa-decision">
              <label>Motivo para rejeição<input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Obrigatório somente ao rejeitar" maxLength={500} /></label>
              <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => decide('REJEITAR')} disabled={busy || !selectedItems.length}><HiOutlineXCircle /> Rejeitar</button><button type="button" className="btn btn-primary btn-sm" onClick={() => decide('AUTORIZAR')} disabled={busy || !selectedItems.length || !caps.passkey_count}><HiOutlineCheckCircle /> Autorizar {money(selectedTotal)}</button></div>
              {!caps.passkey_count && <small><HiOutlineLockClosed /> Cadastre uma passkey antes da primeira autorização.</small>}
            </div>}
            {(caps.can_prepare || caps.can_decide) && (selected.itens || []).some(podeReenviarAutorizacao) && <div className="pa-retry"><span>A autorização foi registrada, mas há itens ainda não encaminhados.</span><button type="button" className="btn btn-secondary btn-sm" onClick={retryQueue} disabled={busy || caps.paused}>Reenviar autorizados para a fila</button></div>}
            {caps.can_decide && revokeItems.length > 0 && <div className="pa-decision">
              <label>Motivo da revogação<input value={revokeReason} maxLength={500} onChange={event => setRevokeReason(event.target.value)} /></label>
              <p>{revokeItems.length} título(s) voltarão para autorização. Nenhum pagamento será estornado. Se houver baixa, inclusive parcial, a operação inteira será recusada.</p>
              <div><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setRevokeItems([])}>Manter autorização</button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !revokeReason.trim() || !caps.passkey_count}
                  onClick={revokeAuthorization}>Confirmar revogação com passkey</button></div>
            </div>}
          </>}
        </section>
      </div>}

      {!motivoId && String(textoJustificativa || '').trim() && <OverlayModal rotulo="Justificativa da solicitação"
        largura="680px" onFechar={fecharJustificativa} fecharAoClicarFora>
        <header data-modal="cabecalho" className="pa-justification-head">
          <strong>Justificativa da solicitação</strong>
          <button type="button" className="btn btn-secondary btn-sm" onClick={fecharJustificativa}>Fechar</button>
        </header>
        <p className="pa-justification-text">{textoJustificativa}</p>
      </OverlayModal>}

      {String(itemMotivo?.motivo_decisao || '').trim() && <OverlayModal rotulo="Motivo do ajuste"
        largura="680px" onFechar={fecharMotivo} fecharAoClicarFora>
        <header data-modal="cabecalho" className="pa-justification-head">
          <strong>Motivo do ajuste · {itemMotivo.snapshot_json?.solicitacao?.codigo || itemMotivo.snapshot_json?.codigo || `#${itemMotivo.id}`}</strong>
          <button type="button" className="btn btn-secondary btn-sm" onClick={fecharMotivo}>Fechar</button>
        </header>
        <p className="pa-justification-text">{itemMotivo.motivo_decisao}</p>
      </OverlayModal>}

      {caps.can_decide && <details id="pa-dispositivos" className="pa-device-disclosure">
        <summary>Dispositivos autorizados ({passkeys.length})</summary>
        {passkeys.length === 0 && <p>Nenhuma passkey cadastrada.</p>}
        {passkeys.length > 0 && <section className="pa-devices">
        <div><strong>Dispositivos autorizados</strong><span>Revogue imediatamente um aparelho perdido ou que não esteja mais sob seu controle.</span></div>
        <div>{passkeys.map((passkey) => <span key={passkey.id}><span>{passkey.nome_dispositivo || 'Dispositivo'} · {date(passkey.ultimo_uso_em || passkey.createdAt)}</span><button type="button" onClick={() => revokePasskey(passkey.id)} disabled={busy}>Revogar</button></span>)}</div>
      </section>}
      </details>}

      {caps.can_configure && <section className="pa-config">
        <div><strong>Autorizadores nominais</strong><span>Não há bypass de perfil: o usuário também precisa da permissão granular “Autorizar pagamentos”.</span></div>
        <div className="pa-config__form"><select value={authorizerUserId} onChange={(event) => setAuthorizerUserId(event.target.value)}><option value="">Selecione um usuário ativo</option>{users.map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.email}</option>)}</select><button type="button" className="btn btn-secondary btn-sm" onClick={addAuthorizer} disabled={!authorizerUserId || busy}>Adicionar</button></div>
        <div className="pa-config__chips">{authorizers.map((item) => <span key={item.id}><span>{item.usuario?.nome} · {item.ativo ? 'ativo' : 'inativo'}</span><button type="button" onClick={() => toggleAuthorizer(item)} disabled={busy}>{item.ativo ? 'Desativar' : 'Reativar'}</button></span>)}</div>
      </section>}
      {modalPreview}
    </Pagina>
  );
}
