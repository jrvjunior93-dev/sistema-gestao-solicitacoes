import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DONO_DETALHE } from '../../hooks/useAutorizacaoHistorico';
import ModalPortal from '../ui/ModalPortal';
import TituloExcluidoAviso from './TituloExcluidoAviso';
import BotaoReenvioAutorizacao from './BotaoReenvioAutorizacao';
import { useWorkspaceActive, useWorkspaceWork } from '../../navigation/WorkspaceContext';
import { listarTitulosAutorizacao, obterOpcoesDecisaoPasskey, decidirAutorizacaoPagamento, obterOpcoesRejeicaoFilaDireta, rejeitarFilaDireta } from '../../services/pagamentoAutorizacao';
import { autenticarComPasskey } from '../../utils/webauthn';
import { passkeyInterrompida, mensagemPasskeyInterrompida } from '../../utils/passkeyInterrompida';
import { podeSelecionarAutorizacao, podeDecidirItem, podeAutorizar, podeRejeitarFila, valorSelecionado, assinaturaDecisao, rotuloSituacao } from '../../utils/autorizacaoPagamentoSituacao';
import { dataISOParaBR } from '../DateInputBR';

const moeda = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesmaVersao = (a, b) => assinaturaDecisao(a) === assinaturaDecisao(b);

// Dados de leitura, nao o formulario editavel da solicitacao. POSTs digitais e
// diretos usam contratos separados, com passkey nominal e UM titulo explicito.
export default function AutorizacaoTituloDetalhe({ inicial, filtro, caps, setBusy, abrirDocumento, onFechar, onDecidido, onOcupado }) {
  const [item, setItem] = useState(inicial), [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(''), [aviso, setAviso] = useState('');
  const [motivo, setMotivo] = useState(''), [confirmacao, setConfirmacao] = useState(null), [operando, setOperando] = useState(false);
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const vivo = useRef(true), trava = useRef(false), painel = useRef(null), corpo = useRef(null), motivoRef = useRef(null);
  const ativo = useWorkspaceActive();
  const s = item.snapshot_json || {};
  const direto = item.origem_painel === 'FILA_DIRETA';
  const bloqueado = carregando || operando;
  useLayoutEffect(() => { onOcupado?.(bloqueado); return () => onOcupado?.(false); }, [bloqueado, onOcupado]);
  const podeDecidir = caps.can_decide && caps.passkey_count && !caps.paused && podeSelecionarAutorizacao(item) && !erro;
  // Rascunho local da rejeicao e descartado ao navegar/fechar; nao deixar
  // um marcador dirty orfao no snapshot do workspace apos desmontar o detalhe.
  useWorkspaceWork(false, bloqueado, 'autorizacoes:titulo-detalhe');
  const fechar = () => { if (!trava.current) onFechar(); };

  useEffect(() => {
    if (!ativo) return undefined;
    const root = document.getElementById('root'), anterior = root?.inert;
    if (root) root.inert = true;
    painel.current?.querySelector('h2')?.focus();
    return () => { if (root) root.inert = anterior; };
  }, [ativo]);
  useEffect(() => {
    vivo.current = true;
    atualizar();
    return () => { vivo.current = false; };
  }, []);
  useEffect(() => {
    if (confirmacao) painel.current?.querySelector('.pa-titulo-conferencia')?.scrollIntoView({ block: 'nearest' });
  }, [confirmacao]);
  useEffect(() => { if (pedindoMotivo) motivoRef.current?.focus(); }, [pedindoMotivo]);

  async function consultarAtual(alvo = item) {
    // Revalidar sem status/obra (uma decisao pode retirar o titulo do filtro),
    // mantendo a mesma base de data/valor e cursor do periodo que foi aberto.
    const resposta = await listarTitulosAutorizacao({ data_tipo: filtro.data_tipo,
      vencimento_inicio: filtro.vencimento_inicio, vencimento_fim: filtro.vencimento_fim,
      item_ids: String(alvo.id), limite: '1' });
    if (!resposta.data?.[0]) throw Error('Os dados para autorização foram substituídos ou ficaram indisponíveis. Volte à lista e atualize.');
    return resposta.data[0];
  }
  async function atualizar() {
    if (trava.current) return;
    trava.current = true; setCarregando(true); setConfirmacao(null);
    try { const atual = await consultarAtual(); if (vivo.current) { setItem(atual); setErro(''); } }
    catch (e) { if (vivo.current) setErro(e.message || 'Não foi possível consultar o título. Atualize para tentar novamente.'); }
    finally { trava.current = false; if (vivo.current) setCarregando(false); }
  }
  async function navegar(sentido) {
    if (trava.current) return;
    trava.current = true; setCarregando(true); setConfirmacao(null); setAviso('');
    try {
      const referencia = Object.hasOwn(item, 'data_referencia') ? item.data_referencia : item.vencimento_atual;
      const resposta = await listarTitulosAutorizacao({ ...filtro, limite: '1', sentido,
        cursor_item_id: String(item.id), cursor_vencimento: referencia ? String(referencia).slice(0, 10) : 'SEM_DATA' });
      if (!vivo.current) return;
      if (!resposta.data?.[0]) { setAviso(sentido === 'PROXIMA' ? 'Último título deste filtro na obra.' : 'Primeiro título deste filtro na obra.'); return; }
      setItem(resposta.data[0]); setMotivo(''); setPedindoMotivo(false); setErro(''); corpo.current?.scrollTo(0, 0);
      painel.current?.querySelector('h2')?.focus();
    } catch (e) { if (vivo.current) setErro(e.message || 'Não foi possível navegar. Atualize o título antes de decidir.'); }
    finally { trava.current = false; if (vivo.current) setCarregando(false); }
  }
  async function conferir(decisao) {
    if (trava.current || !podeDecidir || !podeDecidirItem(item, decisao)) return;
    if (decisao === 'REJEITAR' && !motivo.trim()) { setAviso('Informe o motivo da rejeição.'); motivoRef.current?.focus(); return; }
    trava.current = true; setCarregando(true); setBusy(true); setConfirmacao(null); setAviso('');
    try {
      const atual = await consultarAtual();
      if (!vivo.current) return;
      setItem(atual);
      if (!podeDecidirItem(atual, decisao) || !mesmaVersao(item, atual)) { setAviso('A situação do título mudou. Confira os dados atualizados antes de decidir.'); return; }
      setPedindoMotivo(false);
      setConfirmacao({ decisao, item: atual, motivo: decisao === 'REJEITAR' ? motivo.trim() : null });
      setErro('');
    } catch (e) { if (vivo.current) setErro(e.message || 'Não foi possível conferir o título.'); }
    finally { trava.current = false; setBusy(false); if (vivo.current) setCarregando(false); }
  }
  async function confirmar() {
    if (trava.current || !confirmacao || !podeDecidir || !podeDecidirItem(item, confirmacao.decisao) || !mesmaVersao(item, confirmacao.item)) return;
    trava.current = true; setOperando(true); setBusy(true); setAviso('');
    try {
      const decisao = confirmacao.decisao === 'REJEITAR' && podeRejeitarFila(item) ? 'REJEITAR_FILA' : confirmacao.decisao;
      const decisoes = direto ? [{ fila_id: item.fila_id, titulo_id: item.titulo_financeiro_id, versao: item.versao_painel, motivo: confirmacao.motivo }]
        : [{ item_id: Number(item.id), decisao, motivo: confirmacao.motivo }];
      const opcoes = direto ? await obterOpcoesRejeicaoFilaDireta(decisoes) : await obterOpcoesDecisaoPasskey(item.lote_id, decisoes);
      if (!vivo.current) return;
      const credential = await autenticarComPasskey(opcoes);
      if (!vivo.current) return;
      const resultado = direto ? await rejeitarFilaDireta(decisoes, credential) : await decidirAutorizacaoPagamento(item.lote_id, decisoes, credential);
      if (!vivo.current) return;
      const registro = resultado?.itens?.find(i => Number(i.id) === Number(item.id));
      if (registro && registro.status !== 'PENDENTE') onDecidido(item.titulo_financeiro_id);
      const esperado = confirmacao.decisao === 'AUTORIZAR' ? ['AUTORIZADO', 'ENFILEIRADO'] : ['REJEITADO'];
      if (!registro || !esperado.includes(registro.status)) throw Error('O servidor não confirmou esta decisão. O título pode ter sido invalidado. Atualize e confira antes de tentar novamente.');
      setItem({ ...item, ...registro }); setMotivo('');
      setAviso(resultado.envio_pendente ? 'Autorização registrada. O envio à fila não foi concluído. Use Reenviar para a fila.' : confirmacao.decisao === 'AUTORIZAR' ? 'Somente este título foi aprovado. Os demais não foram decididos.' : 'Somente este título foi rejeitado, com motivo e histórico.');
      // Nao avancar automaticamente nem conservar um badge financeiro obsoleto.
      try { const atual = await consultarAtual(); if (vivo.current) { setItem(atual); setErro(''); } }
      catch { if (vivo.current) setErro('Decisão registrada. Não foi possível atualizar a situação financeira; atualize o título.'); }
    } catch (e) {
      if (vivo.current) {
        if (passkeyInterrompida(e)) { setErro(''); setAviso(mensagemPasskeyInterrompida()); }
        else setErro(e.message || 'Não foi possível confirmar a decisão. Atualize antes de tentar novamente.');
      }
    }
    finally { trava.current = false; setBusy(false); if (vivo.current) { setOperando(false); setConfirmacao(null); corpo.current?.scrollTo(0, 0); } }
  }
  function manterFoco(event) {
    if (event.key !== 'Tab' || !painel.current?.contains(document.activeElement)) return;
    const elementos = [...painel.current.querySelectorAll('button:not(:disabled),textarea:not(:disabled),a[href],summary')].filter(el => el.offsetParent !== null);
    const primeiro = elementos[0], ultimo = elementos.at(-1);
    if (event.shiftKey && document.activeElement === primeiro) { event.preventDefault(); ultimo?.focus(); }
    else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primeiro?.focus(); }
  }
  return <ModalPortal onClose={fechar} historyOwner={DONO_DETALHE}>
    <section ref={painel} role="dialog" aria-modal="true" aria-label="Detalhes do título para autorização" className="pa-titulo-tela" onKeyDown={manterFoco}>
      <header className="pa-titulo-cabecalho">
        <div><h2 tabIndex={-1}>{s.solicitacao?.codigo || s.codigo || `Título #${item.titulo_financeiro_id}`}</h2><span>{s.codigo} · {direto ? `Envio direto · fila #${item.fila_id}` : item.lote?.codigo || `Lote #${item.lote_id}`}</span></div>
        <button type="button" className="btn btn-outline btn-sm" disabled={bloqueado} onClick={fechar}>Voltar à lista</button>
      </header>
      <div ref={corpo} className="pa-titulo-corpo" aria-busy={bloqueado}>
        <div className="pa-titulo-situacao"><span className={`pa-status pa-status--${item.situacao_financeira?.toLowerCase()}`}>{rotuloSituacao(item.situacao_financeira)}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={bloqueado} onClick={atualizar}>Atualizar título</button></div>
        {carregando && <p role="status">Consultando título…</p>}
        {aviso && <p role="status" className="pa-titulo-aviso">{aviso}</p>}
        {erro && <p role="alert" className="pa-obras-erro">{erro}</p>}
        <TituloExcluidoAviso exclusao={item.exclusao_titulo} />
        <BotaoReenvioAutorizacao item={item} caps={caps} disabled={bloqueado || Boolean(erro)} setBusy={setBusy}
          onOcupado={value => { trava.current = value; setOperando(value); }}
          onEnviado={atual => { setItem(current => ({ ...current, ...atual })); onDecidido(item.titulo_financeiro_id); }} />
        <div className="pa-titulo-valores"><div><span>{item.exclusao_titulo ? 'Valor histórico enviado' : direto ? 'Valor enviado à fila' : 'Valor enviado para autorização'}</span><strong>{moeda(item.valor_snapshot)}</strong></div><div><span>Pago</span><strong>{item.titulo ? moeda(item.titulo.valor_baixado) : '—'}</strong></div><div><span>Saldo atual</span><strong>{item.titulo ? moeda(item.titulo.valor_saldo) : '—'}</strong></div></div>
        {(item.envio_destino === 'AUTORIZACAO' || item.fila_atual) && <p>{item.envio_destino === 'AUTORIZACAO' ? 'Enviado para autorização.' : direto ? 'Envio direto à fila, sem autorização digital anterior.' : 'Enviado à fila.'} Por {item.enviado_por?.nome || 'usuário não disponível'}{item.enviado_em ? ` em ${new Date(item.enviado_em).toLocaleString('pt-BR')}` : ''}.</p>}
        {filtro.data_tipo === 'PAGAMENTO' && <p>Valor efetivamente pago no período: <strong>{moeda(item.pago_no_periodo)}</strong>. Baixas ativas; estornos desconsiderados.</p>}
        {item.bloqueado_proprietario && <p>Saldo restante bloqueado pelo proprietário até nova autorização.</p>}
        <dl className="pa-titulo-dados">
          <div><dt>Credor / favorecido</dt><dd>{s.favorecido_pagamento?.nome || s.credor?.nome || 'Não informado'}</dd><dd>{s.favorecido_pagamento?.documento_mascarado || s.credor?.documento_mascarado}</dd></div>
          <div><dt>Obra / centro de custo</dt><dd>{item.obras_nomes || s.obra?.nome || 'Não informado'}</dd></div>
          <div><dt>Empresa devedora</dt><dd>{s.empresa?.nome || (s.participacoes?.length ? 'Confira as participações' : 'Não informada')}</dd></div>
          <div><dt>Vencimento</dt><dd>{dataISOParaBR(item.vencimento_atual || s.data_vencimento) || 'Não informado'}</dd></div>
          <div><dt>Emissão</dt><dd>{dataISOParaBR(item.data_emissao || s.data_emissao) || 'Não informada'}</dd></div>
          {filtro.data_tipo === 'PAGAMENTO' && <div><dt>Última baixa no período consultado</dt><dd>{dataISOParaBR(item.ultima_baixa_periodo) || 'Sem baixa no período'}</dd></div>}
          <div><dt>Forma de pagamento</dt><dd>{s.forma_pagamento?.nome || s.favorecido_pagamento?.metodo || 'Não informada'}</dd></div>
          <div><dt>Descrição do título</dt><dd>{s.descricao || 'Não informada'}</dd></div>
        </dl>
        {s.solicitacao?.descricao && <section><h3>Descrição da solicitação</h3><p>{s.solicitacao.descricao}</p></section>}
        {item.titulo?.solicitacao?.justificativa && <section><h3>Justificativa atual da solicitação</h3><p>{item.titulo.solicitacao.justificativa}</p></section>}
        {s.favorecido_pagamento && <section><h3>Dados para autorização</h3><p>{[s.favorecido_pagamento.metodo, s.favorecido_pagamento.pix_tipo, s.favorecido_pagamento.pix_mascarado, s.favorecido_pagamento.banco, s.favorecido_pagamento.agencia_mascarada, s.favorecido_pagamento.conta_mascarada, s.favorecido_pagamento.tipo_conta].filter(Boolean).join(' · ') || 'Não informados'}</p></section>}
        {(Number(s.juros) > 0 || Number(s.multa) > 0) && <p>Juros: {moeda(s.juros)} · Multa: {moeda(s.multa)} · Total enviado para autorização: {moeda(s.valor_total ?? item.valor_snapshot)}</p>}
        {s.participacoes?.length > 0 && <section><h3>Participações do título compartilhado</h3><p>A decisão abrange o título inteiro, não apenas esta obra.</p>{s.participacoes.map((p, i) => <p key={i}>{p.obra_nome || `Obra #${p.obra_id}`} · {p.empresa_nome || `Empresa #${p.empresa_id}`} · {moeda(p.valor)}</p>)}</section>}
        <section><h3>Documentos enviados para autorização</h3><div className="pa-obra-documentos">{(item.documentos || []).map(doc => <button type="button" className="btn btn-outline btn-sm" key={doc.id} disabled={operando} onClick={() => abrirDocumento(doc)}>{doc.nome}</button>)}</div>{!item.documentos?.length && <p>Nenhum documento enviado para autorização.</p>}</section>
        {(item.motivo_decisao || item.fila_atual?.motivo) && <section><h3>Decisão / última tentativa</h3><p>{item.motivo_decisao || item.fila_atual.motivo}</p><p>{rotuloSituacao(item.status)}</p></section>}
        {!caps.can_decide && <p>Seu acesso permite consultar os títulos, mas não aprovar ou rejeitar.</p>}
        {caps.paused && <p>Novas decisões pausadas.</p>}
        {caps.can_decide && !caps.passkey_count && <p>Cadastre uma passkey em Opções para decidir.</p>}
        {pedindoMotivo && caps.can_decide && podeSelecionarAutorizacao(item) && <form className="pa-titulo-motivo" onSubmit={e => { e.preventDefault(); conferir('REJEITAR'); }}><label>Motivo da rejeição<textarea ref={motivoRef} rows={2} maxLength={500} required value={motivo} disabled={bloqueado} onChange={e => { setMotivo(e.target.value); setConfirmacao(null); }} /></label>{podeRejeitarFila(item) && <p>Bloqueia somente o saldo restante até nova autorização, sem estorno dos valores já pagos.</p>}<div className="pa-obras-acoes"><button type="button" className="btn btn-outline btn-sm" disabled={bloqueado} onClick={() => setPedindoMotivo(false)}>Cancelar rejeição</button><button type="submit" className="btn btn-primary btn-sm" disabled={bloqueado || !motivo.trim()}>Conferir rejeição</button></div></form>}
        {confirmacao && <section className="pa-titulo-conferencia" aria-label="Conferência deste título">
          <h3>{confirmacao.decisao === 'AUTORIZAR' ? 'Aprovar' : 'Rejeitar'} somente {s.codigo || `título #${item.titulo_financeiro_id}`}?</h3>
          <p>{moeda(valorSelecionado(item))} · Os demais títulos permanecem como estão.</p>
          {confirmacao.motivo && <p>Motivo: {confirmacao.motivo}</p>}
          <div className="pa-obras-acoes"><button type="button" className="btn btn-outline btn-sm" disabled={bloqueado} onClick={() => setConfirmacao(null)}>Voltar à conferência</button><button type="button" className="btn btn-primary btn-sm" disabled={bloqueado || !podeDecidir} onClick={confirmar}>Confirmar {confirmacao.decisao === 'AUTORIZAR' ? 'aprovação' : 'rejeição'} com passkey</button></div>
        </section>}
      </div>
      <footer className="pa-titulo-rodape">
        <small>Anterior e Próxima apenas navegam pelos títulos da obra e dos filtros aplicados.</small>
        <nav aria-label="Ações e navegação do título"><button type="button" className="btn btn-outline btn-sm" disabled={bloqueado} onClick={() => navegar('ANTERIOR')}>Anterior</button><button type="button" className="btn btn-outline btn-sm pa-titulo-rejeitar" disabled={bloqueado || !podeDecidir} onClick={() => { setConfirmacao(null); setPedindoMotivo(true); }}>Rejeitar</button><button type="button" className="btn btn-primary btn-sm" disabled={bloqueado || !podeDecidir || !podeAutorizar(item)} onClick={() => conferir('AUTORIZAR')}>Autorizar</button><button type="button" className="btn btn-outline btn-sm" disabled={bloqueado} onClick={() => navegar('PROXIMA')}>Próxima</button></nav>
      </footer>
    </section>
  </ModalPortal>;
}
