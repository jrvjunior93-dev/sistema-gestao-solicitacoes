import { useEffect, useRef, useState } from 'react';
import DateInputBR, { dataISOParaBR } from '../DateInputBR';
import { useWorkspaceActive, useWorkspaceState, useWorkspaceWork } from '../../navigation/WorkspaceContext';
import usePollingSeguro from '../../hooks/usePollingSeguro';
import { listarObrasAutorizacao, listarTitulosAutorizacao, obterOpcoesDecisaoPasskey, decidirAutorizacaoPagamento } from '../../services/pagamentoAutorizacao';
import { autenticarComPasskey } from '../../utils/webauthn';
import { SITUACOES_AUTORIZACAO, rotuloSituacao, podeSelecionarAutorizacao, selecionarPagina, reconciliarSelecao, agruparDecisoes } from '../../utils/autorizacaoPagamentoSituacao';
import { resumoSolicitacaoAutorizacao } from '../../utils/autorizacaoPagamentoResumo';
import AutorizacaoTituloDetalhe from './AutorizacaoTituloDetalhe';
import useAutorizacaoHistorico from '../../hooks/useAutorizacaoHistorico';

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const INICIAL = { vencimento_inicio: '', vencimento_fim: '', obra: '', situacao: 'AGUARDANDO' };
const EVENTO = 'fluxy-autorizacoes-obras-atualizar';
const emptyPage = { data: [], paginacao: { pagina: 1, total: 0, mais: false }, resumo: { quantidade_titulos: 0, valor_total: 0 } };
function Paginacao({ pagina, dados, alterar, disabled, nome }) {
  return <nav className="pa-obras-paginacao" aria-label={`Paginação de ${nome}`}>
    <span>Página {pagina} · {dados.total || 0} {nome}</span>
    <button type="button" className="btn btn-outline btn-sm" disabled={disabled || pagina <= 1} onClick={() => alterar(pagina - 1)}>Anterior</button>
    <button type="button" className="btn btn-outline btn-sm" disabled={disabled || !dados.mais} onClick={() => alterar(pagina + 1)}>Próxima</button>
  </nav>;
}
export default function AutorizacoesPorObra({ caps, userId, busy, setBusy, abrirDocumento, revisao = 0 }) {
  const slot = `autorizacoes:obras:${userId}`;
  const workspaceAtivo = useWorkspaceActive();
  const [filtro, setFiltro] = useWorkspaceState(slot + ':filtro', INICIAL);
  const [rascunho, setRascunho] = useState(filtro);
  const [paginaObras, setPaginaObras] = useWorkspaceState(slot + ':pagina-obras', 1);
  const [paginaTitulos, setPaginaTitulos] = useWorkspaceState(slot + ':pagina-titulos', 1);
  const [selecao, setSelecao] = useWorkspaceState(slot + ':selecao', {});
  const [motivo, setMotivo] = useWorkspaceState(slot + ':motivo', '');
  const [obras, setObras] = useState(emptyPage), [titulos, setTitulos] = useState(emptyPage);
  const [carregando, setCarregando] = useState(true), [erro, setErro] = useState(''), [aviso, setAviso] = useState('');
  const [revisaoDecisao, setRevisaoDecisao] = useState(null), [preparando, setPreparando] = useState(false);
  const [chaveCarregada, setChaveCarregada] = useState('');
  const [tentativaManual, setTentativaManual] = useState(0);
  const [detalheOcupado, setDetalheOcupado] = useState(false);
  const { obra, detalhe, abrirObra, abrirDetalhe, voltar } = useAutorizacaoHistorico(slot, busy || preparando || detalheOcupado);
  const vivo = useRef(true), voo = useRef(null), travado = useRef(false);
  const parametros = { filtro, obra, paginaObras, paginaTitulos };
  const chave = JSON.stringify(parametros), contexto = useRef({ parametros, chave }); contexto.current = { parametros, chave };
  const selecionados = Object.values(selecao);
  const totalSelecionado = selecionados.reduce((s, i) => s + Math.round(Number(i.valor_snapshot) * 100), 0) / 100;
  const indisponivel = busy || preparando || carregando || Boolean(erro) || chaveCarregada !== chave;
  const elegiveis = titulos.data.filter(podeSelecionarAutorizacao);
  const todosDaPagina = elegiveis.length > 0 && elegiveis.every(i => selecao[String(i.titulo_financeiro_id)]?.id === i.id);
  useWorkspaceWork(selecionados.length > 0 || Boolean(motivo), busy || preparando, slot);
  useEffect(() => {
    if (!revisaoDecisao || busy) return;
    const assinatura = itens => itens.map(i => `${i.id}:${i.snapshot_hash}:${i.valor_snapshot}`).sort().join('|');
    if (assinatura(Object.values(selecao)) !== assinatura(revisaoDecisao.itens)) {
      setRevisaoDecisao(null); setAviso('A seleção mudou. Confira novamente os títulos antes de confirmar.');
    }
  }, [selecao, revisaoDecisao, busy]);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  const atualizar = () => window.dispatchEvent(new Event(EVENTO));
  async function carregar() {
    if (voo.current) return voo.current;
    const atual = contexto.current;
    voo.current = (async () => {
      if (vivo.current) setCarregando(true);
      try {
        const p = atual.parametros;
        const obrasResposta = await listarObrasAutorizacao({ ...p.filtro, pagina: String(p.paginaObras), limite: '30' });
        const titulosResposta = p.obra ? await listarTitulosAutorizacao({ ...p.filtro, obra_id: String(p.obra.id), pagina: String(p.paginaTitulos), limite: '50' }) : emptyPage;
        if (!vivo.current || atual.chave !== contexto.current.chave) return true;
        // Lista, totais e pagina mudam juntos. Falha nunca mistura dados de obras.
        setObras(obrasResposta); setTitulos(titulosResposta); setChaveCarregada(atual.chave); setErro('');
        setSelecao(current => reconciliarSelecao(current, titulosResposta.data));
        return true;
      } catch (e) {
        if (vivo.current && atual.chave === contexto.current.chave) setErro(e.message || 'Não foi possível atualizar. Tente novamente.');
        return atual.chave !== contexto.current.chave;
      } finally {
        voo.current = null;
        if (vivo.current) {
          setCarregando(false);
          if (atual.chave !== contexto.current.chave) queueMicrotask(atualizar);
        }
      }
    })();
    return voo.current;
  }
  usePollingSeguro(carregar, { ativo: !busy && !preparando && !detalhe && workspaceAtivo, eventos: [EVENTO], revisao: `${chave}:${revisao}:${tentativaManual}` });
  useEffect(() => { setRevisaoDecisao(null); }, [chave]);
  function aplicar(event) {
    event.preventDefault(); if (busy || preparando) return;
    setFiltro({ ...rascunho, obra: rascunho.obra.trim() }); setPaginaObras(1); setPaginaTitulos(1); voltar(); setRevisaoDecisao(null);
    setTentativaManual(current => current + 1);
  }
  function mudarSelecao(update) { setRevisaoDecisao(null); setSelecao(update); setAviso(''); }
  async function conferir(decisao) {
    if (travado.current || indisponivel || !selecionados.length) return;
    if (decisao === 'REJEITAR' && !motivo.trim()) { setAviso('Informe o motivo para rejeitar os títulos.'); return; }
    travado.current = true; setPreparando(true); setAviso('');
    try {
      const atuais = [];
      // Revalidacao limitada e serial, incluindo os selecionados de outras paginas.
      for (let inicio = 0; inicio < selecionados.length; inicio += 50) {
        const r = await listarTitulosAutorizacao({ item_ids: selecionados.slice(inicio, inicio + 50).map(i => i.id).join(','), limite: '50' });
        atuais.push(...r.data);
      }
      if (!vivo.current) return;
      const validos = atuais.filter(podeSelecionarAutorizacao);
      const porId = new Map(validos.map(i => [Number(i.id), i]));
      const mudou = selecionados.some(i => !porId.has(Number(i.id)) || porId.get(Number(i.id)).snapshot_hash !== i.snapshot_hash
        || Number(porId.get(Number(i.id)).valor_snapshot) !== Number(i.valor_snapshot));
      const next = Object.fromEntries(validos.map(i => [String(i.titulo_financeiro_id), i]));
      setSelecao(next);
      if (mudou) { setRevisaoDecisao(null); setAviso('A situação de um ou mais títulos mudou. A seleção foi atualizada; confira novamente antes de decidir.'); atualizar(); return; }
      const grupos = agruparDecisoes(validos, decisao, motivo);
      setRevisaoDecisao({ decisao, grupos, itens: validos, motivo: motivo.trim() });
    } catch (e) { if (vivo.current) setAviso(e.message || 'Não foi possível conferir a seleção.'); }
    finally { travado.current = false; if (vivo.current) setPreparando(false); }
  }
  async function confirmar() {
    if (travado.current || busy || !revisaoDecisao || !caps.can_decide || !caps.passkey_count || caps.paused) return;
    travado.current = true; setBusy(true); let concluidos = 0;
    try {
      for (const [loteId, decisoes] of revisaoDecisao.grupos) {
        if (!vivo.current) throw Error('Operação interrompida ao sair da tela.');
        const opcoes = await obterOpcoesDecisaoPasskey(loteId, decisoes);
        const credential = await autenticarComPasskey(opcoes);
        const resultado = await decidirAutorizacaoPagamento(loteId, decisoes, credential);
        if (!Array.isArray(resultado?.itens)) throw Error('A resposta não confirmou a situação dos títulos. Confira a atualização antes de continuar.');
        const esperados = revisaoDecisao.decisao === 'AUTORIZAR' ? ['AUTORIZADO', 'ENFILEIRADO'] : ['REJEITADO'];
        const confirmados = decisoes.filter(d => resultado.itens.some(i => Number(i.id) === d.item_id && esperados.includes(i.status)));
        concluidos += confirmados.length;
        const ids = new Set(decisoes.filter(d => resultado.itens.some(i => Number(i.id) === d.item_id && i.status !== 'PENDENTE')).map(i => i.item_id));
        setSelecao(current => Object.fromEntries(Object.entries(current).filter(([, i]) => !ids.has(Number(i.id)))));
        if (confirmados.length !== decisoes.length) throw Error('Um ou mais títulos mudaram ou foram invalidados na conferência do servidor. Confira o financeiro antes de continuar.');
      }
      setMotivo(''); setAviso(`${concluidos} título(s) confirmado(s). ${revisaoDecisao.decisao === 'AUTORIZAR' ? 'Somente os selecionados foram autorizados; os demais continuam pendentes.' : 'Rejeições registradas com histórico.'}`);
    } catch (e) {
      setAviso(`${concluidos ? `${concluidos} título(s) já confirmado(s). ` : ''}${e.message || 'Não foi possível concluir.'} Os demais não foram confirmados. Atualize e confira antes de tentar novamente.`);
    } finally { setRevisaoDecisao(null); travado.current = false; setBusy(false); atualizar(); }
  }
  const altera = key => event => setRascunho(current => ({ ...current, [key]: event.target.value }));
  const semResultado = !carregando && !erro && obras.data.length === 0;
  return <section className="pa-obras" aria-label="Autorizações por obra" data-detalhe={Boolean(obra)}>
    <form className="pa-obras-filtros" onSubmit={aplicar}>
      <label>Vencimento inicial<DateInputBR value={rascunho.vencimento_inicio} onChange={altera('vencimento_inicio')} disabled={busy || preparando} /></label>
      <label>Vencimento final<DateInputBR value={rascunho.vencimento_fim} onChange={altera('vencimento_fim')} disabled={busy || preparando} /></label>
      <label className="pa-obras-busca">Obra / centro de custo<input value={rascunho.obra} onChange={altera('obra')} placeholder="Digite parte do nome da obra" maxLength={120} disabled={busy || preparando} /></label>
      <label className="pa-obras-situacao">Situação atual<select value={rascunho.situacao} onChange={altera('situacao')} disabled={busy || preparando}>
        <option value="">Todas as situações</option>{SITUACOES_AUTORIZACAO.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
      </select></label>
      <button type="submit" className="btn btn-outline btn-sm" disabled={busy || preparando}>Aplicar filtros</button>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy || preparando} onClick={() => { setRascunho(INICIAL); setFiltro(INICIAL); setPaginaObras(1); setPaginaTitulos(1); voltar(); }}>Limpar filtros</button>
    </form>
    <div className="pa-obras-resumo" aria-live="polite"><span>{obras.resumo?.quantidade_titulos || 0} títulos únicos nos filtros</span>
      <span>Valor das obras filtradas <strong>{moeda(obras.resumo?.valor_total)}</strong></span>
      <span>{carregando ? 'Atualizando…' : 'Situação financeira atual · valores do dossiê'}</span>
    </div>
    {erro && <p role="alert" className="pa-obras-erro">{erro} <button type="button" className="btn btn-outline btn-sm" disabled={busy || preparando || carregando} onClick={() => setTentativaManual(current => current + 1)}>Tentar novamente</button></p>}
    <div className="pa-obras-layout" data-detalhe={Boolean(obra)}>
      <aside className="pa-obras-lista" aria-label="Obras nos filtros" aria-busy={carregando}>
        {semResultado && <p className="pa-empty">Nenhuma obra nesta situação e período. Ajuste os filtros para consultar o histórico.</p>}
        {obras.data.map(o => <button type="button" key={o.obra_id} disabled={busy || preparando || carregando} aria-pressed={Number(obra?.id) === Number(o.obra_id)}
          className="pa-obra" onClick={() => { abrirObra({ id: o.obra_id, nome: o.obra_nome }); setPaginaTitulos(1); }}>
          <strong>{o.obra_nome}</strong><span><span>{o.quantidade_titulos} título(s)</span><strong>{moeda(o.valor_total)}</strong></span>
        </button>)}
        <Paginacao nome="obras" pagina={paginaObras} dados={obras.paginacao} alterar={setPaginaObras} disabled={busy || preparando || carregando} />
      </aside>
      <section className="pa-obras-titulos" aria-label="Títulos da obra" aria-busy={carregando}>
        {!obra ? <p className="pa-empty">Selecione uma obra para conferir os títulos e decidir.</p> : <>
          <header className="pa-obras-cabecalho"><button type="button" className="btn btn-outline btn-sm pa-voltar-obras" disabled={busy || preparando} onClick={voltar}>Voltar às obras</button><strong>{obra.nome}</strong></header>
          <div className="pa-obras-selecao"><label><input type="checkbox" checked={todosDaPagina} disabled={indisponivel || !caps.can_decide || !elegiveis.length || caps.paused}
            onChange={e => mudarSelecao(current => selecionarPagina(current, titulos.data, e.target.checked))} /> Selecionar os pendentes desta página</label></div>
          {titulos.data.map(item => {
            const s = item.snapshot_json || {}, permitido = podeSelecionarAutorizacao(item);
            return <article key={item.id} className="pa-obra-titulo">
              <div className="pa-obra-titulo__principal"><div><input type="checkbox" aria-label={`Selecionar ${s.codigo || item.titulo_financeiro_id}`}
                checked={selecao[String(item.titulo_financeiro_id)]?.id === item.id} disabled={indisponivel || !caps.can_decide || caps.paused || !permitido}
                onChange={e => mudarSelecao(current => selecionarPagina(current, [item], e.target.checked))} /><button type="button" className="pa-titulo-abrir" aria-label={`Abrir detalhes de ${s.codigo || item.titulo_financeiro_id}`} disabled={busy || preparando || carregando}
                  onClick={() => abrirDetalhe({ item, filtro: { ...filtro, obra_id: String(obra.id) } })}>{s.solicitacao?.codigo || s.codigo || `Título #${item.titulo_financeiro_id}`} <span aria-hidden="true">›</span></button></div>
                <span className={`pa-status pa-status--${item.situacao_financeira?.toLowerCase()}`}>{rotuloSituacao(item.situacao_financeira)}</span></div>
              {item.status === 'PENDENTE' && (!permitido || item.situacao_financeira !== 'AGUARDANDO') && <small>{permitido ? 'Aguardando aprovação do saldo deste título.' : 'Pendente de decisão, mas o saldo ou vínculo mudou. Confira o financeiro antes de aprovar.'}</small>}
              {item.fila_atual?.status === 'NAO_PAGO' && item.situacao_financeira !== 'NAO_PAGO' && <small>Última tentativa na fila: não pago.</small>}
              <div className="pa-obra-titulo__corpo"><div><strong>{s.favorecido_pagamento?.nome || s.credor?.nome || 'Credor não informado'}</strong>
                <small>{s.codigo} · {item.lote?.codigo || `Lote #${item.lote_id}`}</small><small>{resumoSolicitacaoAutorizacao(s)}</small>
                <small>Vencimento {dataISOParaBR(item.vencimento_atual || s.data_vencimento) || 'não informado'} · {s.forma_pagamento?.nome || s.favorecido_pagamento?.metodo || 'Forma não informada'}</small></div>
                <div className="pa-obra-valores"><span>Valor do dossiê <strong>{moeda(item.valor_snapshot)}</strong></span>
                  <span>Pago <strong>{item.titulo ? moeda(item.titulo.valor_baixado) : '—'}</strong> · Saldo <strong>{item.titulo ? moeda(item.titulo.valor_saldo) : '—'}</strong></span>
                  {Math.abs(Number(item.valor_no_recorte) - Number(item.valor_snapshot)) > 0.005 && <small>Participação no recorte: {moeda(item.valor_no_recorte)}. A decisão abrange o título inteiro.</small>}</div></div>
              {(item.documentos || []).length > 0 && <div className="pa-obra-documentos">{item.documentos.map(doc => <button type="button" className="btn btn-outline btn-sm" key={doc.id} onClick={() => abrirDocumento(doc)}>{doc.nome}</button>)}</div>}
              {s.participacoes?.length > 0 && <details><summary>Participações do título compartilhado</summary>{s.participacoes.map((p, indice) => <small key={indice}>{p.obra_nome || `Obra #${p.obra_id}`} · {p.empresa_nome || `Empresa #${p.empresa_id}`} · {moeda(p.valor)}</small>)}</details>}
              {item.titulo?.solicitacao?.justificativa && <details><summary>Justificativa da solicitação</summary><p>{item.titulo.solicitacao.justificativa}</p></details>}
              {(item.motivo_decisao || item.fila_atual?.motivo) && <details><summary>Motivos e decisão registrada</summary><p>{item.motivo_decisao || item.fila_atual.motivo}</p><small>Decisão: {rotuloSituacao(item.status)}</small></details>}
            </article>;
          })}
          {!carregando && !erro && !titulos.data.length && <p className="pa-empty">Nenhum título nesta obra com os filtros aplicados.</p>}
          <Paginacao nome="títulos" pagina={paginaTitulos} dados={titulos.paginacao} alterar={setPaginaTitulos} disabled={indisponivel} />
        </>}
      </section>
    </div>
    {caps.can_decide && (obra || selecionados.length > 0) && <section className="pa-obras-decisao" aria-label="Seleção e decisão">
      <div><strong>{selecionados.length} selecionado(s) · {moeda(totalSelecionado)}</strong><small>Seleção mantida entre obras e páginas. Títulos compartilhados são contados uma vez.</small></div>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy || preparando || !selecionados.length} onClick={() => mudarSelecao({})}>Limpar seleção de todas as páginas</button>
      <label>Motivo para rejeição<input value={motivo} maxLength={500} disabled={busy || preparando} onChange={e => { setMotivo(e.target.value); setRevisaoDecisao(null); }} /></label>
      <div className="pa-obras-acoes"><button type="button" className="btn btn-outline btn-sm" disabled={indisponivel || !selecionados.length || caps.paused || !caps.passkey_count} onClick={() => conferir('REJEITAR')}>Rejeitar selecionados</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={indisponivel || !selecionados.length || caps.paused || !caps.passkey_count} onClick={() => conferir('AUTORIZAR')}>Autorizar selecionados</button></div>
      {!caps.passkey_count && <small>Cadastre uma passkey nas opções para confirmar decisões.</small>}
      {aviso && <p role="status">{aviso}</p>}
      {revisaoDecisao && <section className="pa-obras-conferencia" aria-label="Conferência da decisão">
        <strong>Conferir {revisaoDecisao.decisao === 'AUTORIZAR' ? 'autorização' : 'rejeição'} de {revisaoDecisao.itens.length} título(s)</strong>
        <p>Somente os títulos selecionados serão decididos. Os demais do mesmo lote continuam pendentes. Serão solicitadas {revisaoDecisao.grupos.length} confirmações por passkey, uma para os selecionados de cada lote. Se interromper, as decisões já confirmadas não serão desfeitas.</p>
        <ul>{revisaoDecisao.itens.map(i => <li key={i.id}>{i.snapshot_json?.codigo || `Título #${i.titulo_financeiro_id}`} · {i.obras_nomes} · {moeda(i.valor_snapshot)}</li>)}</ul>
        {revisaoDecisao.decisao === 'REJEITAR' && <p>Motivo: {revisaoDecisao.motivo}</p>}
        <div className="pa-obras-acoes"><button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setRevisaoDecisao(null)}>Voltar à seleção</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || caps.paused} onClick={confirmar}>Confirmar {revisaoDecisao.decisao === 'AUTORIZAR' ? 'autorização' : 'rejeição'} com passkey</button></div>
      </section>}
    </section>}
    {detalhe && <AutorizacaoTituloDetalhe inicial={detalhe.item} filtro={detalhe.filtro} caps={caps} setBusy={setBusy} abrirDocumento={abrirDocumento}
      onOcupado={setDetalheOcupado} onFechar={() => { voltar(); setTentativaManual(current => current + 1); }}
      onDecidido={tituloId => { setRevisaoDecisao(null); setSelecao(current => Object.fromEntries(Object.entries(current).filter(([id]) => Number(id) !== Number(tituloId)))); }} />}
  </section>;
}
