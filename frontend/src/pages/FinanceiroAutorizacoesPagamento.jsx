import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineBell, HiOutlineCheckCircle, HiOutlineDocumentText, HiOutlineFingerPrint, HiOutlineLockClosed, HiOutlineXCircle } from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import { Avisos, Pagina, PageHeader, useAvisos } from '../components/padrao';
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
import { criarAssinaturaPush, obterAssinaturaPush, suportaWebPush } from '../utils/webPush';
import '../styles/financeiro-autorizacoes-pagamento.css';

const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value) => value ? new Date(value).toLocaleString('pt-BR') : '-';
const titleDescription = (value) => String(value || '')
  .replace(/\s*valor total\s*:\s*r\$\s*[\d.]+(?:,\d{1,2})?/gi, '')
  .trim();

function Status({ value }) {
  return <span className={`pa-status pa-status--${String(value || '').toLowerCase()}`}>{value === 'ENFILEIRADO' ? 'Na fila de pagamento' : String(value || '').replaceAll('_', ' ')}</span>;
}

export default function FinanceiroAutorizacoesPagamento() {
  const { user, refreshSession } = useAuth();
  const caps = user?.autorizacao_pagamentos || {};
  const { avisos, avisar, fechar } = useAvisos();
  const [lots, setLots] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState([]);
  const [authorizers, setAuthorizers] = useState([]);
  const [authorizerUserId, setAuthorizerUserId] = useState('');
  const [pushActive, setPushActive] = useState(false);
  const [passkeys, setPasskeys] = useState([]);
  const listaRequestRef = useRef(0);

  const selected = useMemo(() => lots.find((lot) => Number(lot.id) === Number(selectedId)) || lots[0] || null, [lots, selectedId]);
  const pendingItems = useMemo(() => (selected?.itens || []).filter((item) => item.status === 'PENDENTE'), [selected]);
  const selectedTotal = useMemo(() => pendingItems.filter((item) => selectedItems.includes(Number(item.id))).reduce((sum, item) => sum + Number(item.valor_snapshot || 0), 0), [pendingItems, selectedItems]);

  async function carregarLotes() {
    const requestId = ++listaRequestRef.current;
    const response = await listarAutorizacoesPagamento();
    if (requestId !== listaRequestRef.current) return;
    const rows = response?.data || [];
    setLots(rows);
    setSelectedId((current) => rows.some((row) => Number(row.id) === Number(current)) ? current : rows[0]?.id || null);
  }

  async function load() {
    try {
      await carregarLotes();
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

  useEffect(() => { load(); }, []);
  useEffect(() => { setSelectedItems(pendingItems.map((item) => Number(item.id))); }, [selected?.id]);
  useEffect(() => {
    setSelectedItems(current => {
      const validos = current.filter(id => pendingItems.some(item => Number(item.id) === id));
      return validos.length === current.length ? current : validos;
    });
  }, [pendingItems]);
  useEffect(() => {
    if (busy) return undefined;
    let ativo = true, pendente = false;
    const atualizar = async () => {
      if (!ativo || pendente || document.visibilityState !== 'visible') return;
      pendente = true;
      try { await carregarLotes(); } catch { /* Atualizacao silenciosa; botao permite tentar novamente. */ }
      finally { pendente = false; }
    };
    const timer = window.setInterval(atualizar, 30000);
    window.addEventListener('focus', atualizar);
    document.addEventListener('visibilitychange', atualizar);
    return () => {
      ativo = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', atualizar);
      document.removeEventListener('visibilitychange', atualizar);
      listaRequestRef.current++;
    };
  }, [busy]);
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
    if (!selectedItems.length || busy) return;
    if (decision === 'REJEITAR' && !rejectReason.trim()) return avisar.erro('Informe o motivo da rejeição.');
    const decisions = selectedItems.map((itemId) => ({ item_id: itemId, decisao: decision, motivo: decision === 'REJEITAR' ? rejectReason.trim() : null }));
    setBusy(true);
    try {
      const options = await obterOpcoesDecisaoPasskey(selected.id, decisions);
      const credential = await autenticarComPasskey(options);
      await decidirAutorizacaoPagamento(selected.id, decisions, credential);
      setRejectReason('');
      await load();
      avisar.sucesso(decision === 'AUTORIZAR' ? 'Pagamentos autorizados e encaminhados à fila.' : 'Pagamentos rejeitados com rastreabilidade.');
    } catch (error) {
      avisar.erro(error?.message || 'Não foi possível registrar a decisão.');
    } finally { setBusy(false); }
  }

  async function openDocument(documentId) {
    try {
      const response = await obterDocumentoAutorizacao(documentId);
      window.open(response.url, '_blank', 'noopener,noreferrer');
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
    if (busy) return;
    setBusy(true);
    try { await reenviarAutorizacaoParaFila(selected.id); await load(); avisar.sucesso('Itens autorizados encaminhados para a fila.'); }
    catch (error) { avisar.erro(error?.message || 'Não foi possível reenviar para a fila.'); }
    finally { setBusy(false); }
  }

  return (
    <Pagina>
      <PageHeader title="Autorizações de pagamento" subtitle="Decisão do proprietário antes de os títulos entrarem na fila operacional." />
      <Avisos avisos={avisos} onFechar={fechar} />

      <div className="pa-toolbar">
        <div><strong>Modo {caps.mode}</strong><span>{caps.paused ? 'Novas decisões pausadas' : 'Dossiês sem acesso de edição à solicitação'}</span></div>
        <div className="pa-toolbar__actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={busy}>Atualizar</button>
          {caps.can_decide && <button type="button" className="btn btn-secondary btn-sm" onClick={togglePush} disabled={busy || !caps.push_available || !suportaWebPush()} title={!caps.push_available ? 'O envio de avisos ainda não foi configurado neste ambiente.' : (!suportaWebPush() ? 'Este navegador não oferece notificações push.' : undefined)}><HiOutlineBell /> {!caps.push_available ? 'Avisos não configurados' : (pushActive ? 'Desativar avisos' : 'Ativar avisos')}</button>}
          {caps.can_decide && <button type="button" className="btn btn-secondary btn-sm" onClick={registerPasskey} disabled={busy}><HiOutlineFingerPrint /> {caps.passkey_count ? 'Adicionar passkey' : 'Cadastrar passkey'}</button>}
        </div>
      </div>

      <div className="pa-layout">
        <aside className="pa-list" aria-label="Lotes de autorização">
          <div className="pa-list__head"><strong>Pendências e histórico</strong><span>{lots.length}</span></div>
          {lots.length === 0 && <p className="pa-empty">Nenhum lote disponível.</p>}
          {lots.map((lot) => (
            <button key={lot.id} type="button" className={`pa-lot ${Number(selected?.id) === Number(lot.id) ? 'is-active' : ''}`} onClick={() => setSelectedId(lot.id)}>
              <span><strong>{lot.codigo}</strong><Status value={lot.status} /></span>
              <span>{money(lot.valor_total)} · {lot.quantidade_itens} título(s)</span>
              <small>Expira em {date(lot.expira_em)}</small>
            </button>
          ))}
        </aside>

        <section className="pa-detail">
          {!selected ? <p className="pa-empty">Selecione um lote.</p> : <>
            <header className="pa-detail__head">
              <div><strong>{selected.codigo}</strong><span>Criado por {selected.criadoPor?.nome || '-'} · hash {String(selected.dossie_hash).slice(0, 12)}…</span></div>
              <Status value={selected.status} />
            </header>
            <div className="pa-table-wrap">
              <table className="pa-table">
                <thead><tr><th aria-label="Selecionar" /><th>Título</th><th>Credor e pagamento</th><th>Obra</th><th>Vencimento</th><th className="num pa-value-column">Valor</th><th>Documentos</th><th>Status</th></tr></thead>
                <tbody>{(selected.itens || []).map((item) => {
                  const snapshot = item.snapshot_json || {};
                  return <tr key={item.id}>
                    <td>{item.status === 'PENDENTE' && <input type="checkbox" checked={selectedItems.includes(Number(item.id))} onChange={(event) => setSelectedItems((current) => event.target.checked ? [...current, Number(item.id)] : current.filter((id) => id !== Number(item.id)))} />}</td>
                    <td><strong>{snapshot.codigo || `#${snapshot.titulo_id}`}</strong><small>{titleDescription(snapshot.descricao)}</small><small className="pa-title-value"><span>Valor do título</span><strong>{money(item.valor_snapshot)}</strong></small></td>
                    <td>{snapshot.favorecido_pagamento?.nome || snapshot.credor?.nome || '-'}<small>{snapshot.favorecido_pagamento?.documento_mascarado || snapshot.credor?.documento_mascarado || ''}</small><small>{snapshot.forma_pagamento?.nome || snapshot.favorecido_pagamento?.metodo || ''}{snapshot.favorecido_pagamento?.pix_mascarado ? ` · ${snapshot.favorecido_pagamento.pix_mascarado}` : ''}</small></td>
                    <td>{snapshot.obra?.nome || '-'}</td><td>{snapshot.data_vencimento || '-'}</td><td className="num pa-value-column">{money(item.valor_snapshot)}</td>
                    <td><div className="pa-documents">{(item.documentos || []).map((doc) => <button type="button" key={doc.id} onClick={() => openDocument(doc.id)} title={doc.nome}><HiOutlineDocumentText /><span>{doc.nome}</span></button>)}</div></td>
                    <td><Status value={item.status} />{item.fila_item_id && <small>Fila #{item.fila_item_id}</small>}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {caps.can_decide && pendingItems.length > 0 && <div className="pa-decision">
              <label>Motivo para rejeição<input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Obrigatório somente ao rejeitar" maxLength={500} /></label>
              <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => decide('REJEITAR')} disabled={busy || !selectedItems.length}><HiOutlineXCircle /> Rejeitar</button><button type="button" className="btn btn-primary btn-sm" onClick={() => decide('AUTORIZAR')} disabled={busy || !selectedItems.length || !caps.passkey_count}><HiOutlineCheckCircle /> Autorizar {money(selectedTotal)}</button></div>
              {!caps.passkey_count && <small><HiOutlineLockClosed /> Cadastre uma passkey antes da primeira autorização.</small>}
            </div>}
            {caps.can_prepare && (selected.itens || []).some((item) => item.status === 'AUTORIZADO') && <div className="pa-retry"><span>A autorização foi registrada, mas há itens ainda não encaminhados.</span><button type="button" className="btn btn-secondary btn-sm" onClick={retryQueue} disabled={busy}>Reprocessar envio à fila</button></div>}
          </>}
        </section>
      </div>

      {caps.can_decide && passkeys.length > 0 && <section className="pa-devices">
        <div><strong>Dispositivos autorizados</strong><span>Revogue imediatamente um aparelho perdido ou que não esteja mais sob seu controle.</span></div>
        <div>{passkeys.map((passkey) => <span key={passkey.id}><span>{passkey.nome_dispositivo || 'Dispositivo'} · {date(passkey.ultimo_uso_em || passkey.createdAt)}</span><button type="button" onClick={() => revokePasskey(passkey.id)} disabled={busy}>Revogar</button></span>)}</div>
      </section>}

      {caps.can_configure && <section className="pa-config">
        <div><strong>Autorizadores nominais</strong><span>Não há bypass de perfil: o usuário também precisa da permissão granular “Autorizar pagamentos”.</span></div>
        <div className="pa-config__form"><select value={authorizerUserId} onChange={(event) => setAuthorizerUserId(event.target.value)}><option value="">Selecione um usuário ativo</option>{users.map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.email}</option>)}</select><button type="button" className="btn btn-secondary btn-sm" onClick={addAuthorizer} disabled={!authorizerUserId || busy}>Adicionar</button></div>
        <div className="pa-config__chips">{authorizers.map((item) => <span key={item.id}><span>{item.usuario?.nome} · {item.ativo ? 'ativo' : 'inativo'}</span><button type="button" onClick={() => toggleAuthorizer(item)} disabled={busy}>{item.ativo ? 'Desativar' : 'Reativar'}</button></span>)}</div>
      </section>}
    </Pagina>
  );
}
