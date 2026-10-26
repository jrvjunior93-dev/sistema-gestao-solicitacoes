import { useEffect, useRef, useState } from 'react';
import DateInputBR, { dataISOParaBR } from '../DateInputBR';
import { useWorkspaceActive, useWorkspaceState, useWorkspaceWork } from '../../navigation/WorkspaceContext';
import usePollingSeguro from '../../hooks/usePollingSeguro';
import { listarObrasAutorizacao, listarTitulosAutorizacao, obterOpcoesDecisaoPasskey, decidirAutorizacaoPagamento, obterOpcoesRejeicaoFilaDireta, rejeitarFilaDireta, obterOpcoesAutorizacaoSelecao, autorizarSelecaoPagamento } from '../../services/pagamentoAutorizacao';
import { autenticarComPasskey } from '../../utils/webauthn';
import { passkeyInterrompida, mensagemPasskeyInterrompida } from '../../utils/passkeyInterrompida';
import { SITUACOES_AUTORIZACAO, rotuloSituacao, podeSelecionarAutorizacao, podeDecidirItem, podeAutorizar, valorSelecionado, assinaturaDecisao, selecionarPagina, reconciliarSelecao, agruparDecisoes } from '../../utils/autorizacaoPagamentoSituacao';
import { resumoSolicitacaoAutorizacao } from '../../utils/autorizacaoPagamentoResumo';
import AutorizacaoTituloDetalhe from './AutorizacaoTituloDetalhe';
import TituloExcluidoAviso from './TituloExcluidoAviso';
import useAutorizacaoHistorico from '../../hooks/useAutorizacaoHistorico';
import BotaoReenvioAutorizacao from './BotaoReenvioAutorizacao';
import RetirarEnvios from './RetirarEnvios';
import ValorAutorizacao, { conferirValorAutorizacao } from './ValorAutorizacao';
import { envioDoPainel, podeRetirarEnvio } from '../../utils/retiradaEnvio';

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const INICIAL = { data_tipo: 'VENCIMENTO', vencimento_inicio: '', vencimento_fim: '', obra: '', solicitacao: '', situacao: 'AGUARDANDO' };
const EVENTO = 'fluxy-autorizacoes-obras-atualizar';
const emptyPage = { data: [], paginacao: { pagina: 1, total: 0, mais: false }, resumo: { quantidade_titulos: 0, valor_total: 0 } };
function Paginacao({ pagina, dados, alterar, disabled, nome, children }) {
  return <nav className="pa-obras-paginacao" aria-label={`Paginação de ${nome}`}>
    <span>Página {pagina} · {dados.total || 0} {nome}</span>
    <button type="button" className="btn btn-outline btn-sm" disabled={disabled || pagina <= 1} onClick={() => alterar(pagina - 1)}>Anterior</button>
    {children}
    <button type="button" className="btn btn-outline btn-sm" disabled={disabled || !dados.mais} onClick={() => alterar(pagina + 1)}>Próxima</button>
  </nav>;
}
export default function AutorizacoesPorObra({ caps, userId, user, busy, setBusy, abrirDocumento, revisao = 0 }) {
  const slot = `autorizacoes:obras:${userId}`;
  const workspaceAtivo = useWorkspaceActive();
  const [filtro, setFiltro] = useWorkspaceState(slot + ':filtro', INICIAL);
  const [rascunho, setRascunho] = useState(filtro);
  const [revisaoFiltros, setRevisaoFiltros] = useState(0);
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
  const [valores, setValores] = useState({});
  const proposto = item => valores[item.id]?.assinatura === assinaturaDecisao(item) ? valores[item.id].valor : undefined;
  const valorDaSelecao = item => podeAutorizar(item) ? Number(proposto(item) ?? valorSelecionado(item)) : valorSelecionado(item);
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const motivoRef = useRef(null), formularioFiltros = useRef(null), conferenciaRef = useRef(null);
  const { obra, detalhe, abrirObra, abrirDetalhe, voltar } = useAutorizacaoHistorico(slot, busy || preparando || detalheOcupado);
  const vivo = useRef(true), voo = useRef(null), travado = useRef(false);
  const parametros = { filtro, obra, paginaObras, paginaTitulos };
  const chave = JSON.stringify(parametros), contexto = useRef({ parametros, chave }); contexto.current = { parametros, chave };
  const selecionados = Object.values(selecao);
  const totalSelecionado = selecionados.reduce((s, i) => s + Math.round((podeSelecionarAutorizacao(i) ? valorDaSelecao(i) : Number(i.titulo?.valor_saldo || 0)) * 100), 0) / 100;
  const indisponivel = busy || preparando || carregando || Boolean(erro) || chaveCarregada !== chave;
  const podeRetirar = item => { const envio = envioDoPainel(item); return envio && podeRetirarEnvio(user, envio.origem); };
  const selecionavel = item => (!caps.paused && caps.can_decide && podeSelecionarAutorizacao(item)) || podeRetirar(item);
  const envios = selecionados.length && selecionados.every(podeRetirar) ? selecionados.map(envioDoPainel) : [];
  const podeRetirarAlgum = podeRetirarEnvio(user, 'FILA') || podeRetirarEnvio(user, 'AUTORIZACAO');
  const elegiveis = titulos.data.filter(selecionavel);
  const todosDaPagina = elegiveis.length > 0 && elegiveis.every(i => selecao[String(i.titulo_financeiro_id)]?.id === i.id);
  useWorkspaceWork(selecionados.length > 0 || Boolean(motivo), busy || preparando, slot);
  useEffect(() => {
    if (!revisaoDecisao || busy) return;
    const assinatura = itens => itens.map(assinaturaDecisao).sort().join('|');
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
        setSelecao(current => reconciliarSelecao(current, titulosResposta.data, selecionavel));
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
  function filtrosProntos() {
    const form = formularioFiltros.current;
    return !form || (form.checkValidity() && [...form.querySelectorAll('input[data-filtro-data]')]
      .every(el => !el.value || /^\d{2}\/\d{2}\/\d{4}$/.test(el.value)));
  }
  function aplicar(event) {
    event?.preventDefault(); if (busy || preparando) return;
    if (!filtrosProntos()) return;
    if (rascunho.vencimento_inicio && rascunho.vencimento_fim && rascunho.vencimento_inicio > rascunho.vencimento_fim) {
      setAviso('Ajuste as datas: a data final deve ser igual ou posterior à inicial.'); return;
    }
    setFiltro({ ...rascunho, obra: rascunho.obra.trim() }); setPaginaObras(1); setPaginaTitulos(1); voltar(); setRevisaoDecisao(null);
    setAviso('');
    setTentativaManual(current => current + 1);
  }
  useEffect(() => {
    const proximo = { ...rascunho, obra: rascunho.obra.trim() };
    if (busy || preparando || !filtrosProntos()
      || Object.keys(INICIAL).every(key => proximo[key] === filtro[key])) return undefined;
    // Situacao aplica imediatamente com o rascunho completo. Texto/datas
    // aguardam a digitacao; respostas antigas continuam descartadas por chave.
    const timer = setTimeout(() => aplicar(), rascunho.situacao !== filtro.situacao ? 0 : 600);
    return () => clearTimeout(timer);
  }, [rascunho, filtro, busy, preparando]);
  useEffect(() => { if (pedindoMotivo) motivoRef.current?.focus(); }, [pedindoMotivo]);
  useEffect(() => {
    if (!revisaoDecisao) return;
    // A conferencia fica fora da rolagem dos titulos. Levar o usuario a ela
    // nao confirma a decisao nem inicia a biometria.
    conferenciaRef.current?.focus({ preventScroll: true });
    conferenciaRef.current?.scrollIntoView({ block: 'start' });
  }, [revisaoDecisao]);
  function mudarSelecao(update) { setRevisaoDecisao(null); setSelecao(update); setAviso(''); }
  async function conferir(decisao) {
    if (travado.current || indisponivel || !selecionados.length) return;
    if (decisao === 'AUTORIZAR' && !selecionados.every(podeAutorizar)) { setAviso('Para autorizar, selecione somente títulos aguardando aprovação. Títulos já na fila podem apenas ser rejeitados.'); return; }
    if (decisao === 'AUTORIZAR' && selecionados.length > 1000) { setAviso('Selecione no máximo 1.000 títulos por autorização.'); return; }
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
      const mudou = selecionados.some(i => !porId.has(Number(i.id)) || assinaturaDecisao(porId.get(Number(i.id))) !== assinaturaDecisao(i)
        || !podeDecidirItem(porId.get(Number(i.id)), decisao));
      const next = Object.fromEntries(validos.map(i => [String(i.titulo_financeiro_id), i]));
      setSelecao(next);
      if (mudou) { setRevisaoDecisao(null); setAviso('A situação de um ou mais títulos mudou. A seleção foi atualizada; confira novamente antes de decidir.'); atualizar(); return; }
      const grupos = agruparDecisoes(validos, decisao, motivo);
      const valoresAutorizados = decisao === 'AUTORIZAR' ? validos.map(i => ({ item_id: Number(i.id), valor: conferirValorAutorizacao(i, proposto(i)) })) : [];
      setPedindoMotivo(false);
      setRevisaoDecisao({ decisao, grupos, itens: validos, valoresAutorizados, motivo: motivo.trim() });
    } catch (e) { if (vivo.current) setAviso(e.message || 'Não foi possível conferir a seleção.'); }
    finally { travado.current = false; if (vivo.current) setPreparando(false); }
  }
  async function confirmar() {
    if (travado.current || busy || !revisaoDecisao || !caps.can_decide || !caps.passkey_count || caps.paused) return;
    travado.current = true; setBusy(true); let concluidos = 0, enviosPendentes = 0;
    try {
      if (revisaoDecisao.decisao === 'AUTORIZAR') {
        const ids = revisaoDecisao.itens.map(i => Number(i.id)).sort((a, b) => a - b);
        const opcoes = await obterOpcoesAutorizacaoSelecao(ids, revisaoDecisao.valoresAutorizados);
        const credential = await autenticarComPasskey(opcoes.publicKey);
        const resultado = await autorizarSelecaoPagamento(ids, opcoes.selecao_id, credential, revisaoDecisao.valoresAutorizados);
        if (!Array.isArray(resultado?.itens) || resultado.itens.length !== ids.length || resultado.envio_pendente
          || new Set(resultado.itens.map(i => Number(i.id))).size !== ids.length
          || resultado.itens.some(i => !ids.includes(Number(i.id)) || i.status !== 'ENFILEIRADO' || !i.fila_item_id)) {
          throw Error('A resposta não confirmou o envio de toda a seleção. Atualize e confira antes de tentar novamente.');
        }
        const confirmados = new Set(ids);
        setSelecao(current => Object.fromEntries(Object.entries(current).filter(([, i]) => !confirmados.has(Number(i.id)))));
        setAviso(`${ids.length} título(s) confirmado(s) e enviado(s) para a fila com uma única autorização.`);
        return;
      }
      for (const [loteId, decisoes] of revisaoDecisao.grupos) {
        if (!vivo.current) throw Error('Operação interrompida ao sair da tela.');
        const direto = loteId === 'FILA_DIRETA';
        const opcoes = direto ? await obterOpcoesRejeicaoFilaDireta(decisoes) : await obterOpcoesDecisaoPasskey(loteId, decisoes);
        const credential = await autenticarComPasskey(opcoes);
        const resultado = direto ? await rejeitarFilaDireta(decisoes, credential) : await decidirAutorizacaoPagamento(loteId, decisoes, credential);
        if (!Array.isArray(resultado?.itens)) throw Error('A resposta não confirmou a situação dos títulos. Confira a atualização antes de continuar.');
        const esperados = revisaoDecisao.decisao === 'AUTORIZAR' ? ['AUTORIZADO', 'ENFILEIRADO'] : ['REJEITADO'];
        const identificador = d => direto ? -d.fila_id : d.item_id;
        const confirmados = decisoes.filter(d => resultado.itens.some(i => Number(i.id) === identificador(d) && esperados.includes(i.status)));
        concluidos += confirmados.length;
        if (resultado.envio_pendente) enviosPendentes += resultado.itens.filter(i => i.status === 'AUTORIZADO').length;
        const ids = new Set(decisoes.filter(d => resultado.itens.some(i => Number(i.id) === identificador(d) && i.status !== 'PENDENTE')).map(identificador));
        setSelecao(current => Object.fromEntries(Object.entries(current).filter(([, i]) => !ids.has(Number(i.id)))));
        if (confirmados.length !== decisoes.length) throw Error('Um ou mais títulos mudaram ou foram invalidados na conferência do servidor. Confira o financeiro antes de continuar.');
      }
      setMotivo(''); setAviso(enviosPendentes ? `Autorização registrada. ${enviosPendentes} título(s) aguardam envio. Use Reenviar para a fila.` : `${concluidos} título(s) confirmado(s). ${revisaoDecisao.decisao === 'AUTORIZAR' ? 'Somente os selecionados foram autorizados; os demais continuam pendentes.' : 'Rejeições registradas com histórico.'}`);
    } catch (e) {
      setAviso(passkeyInterrompida(e) ? mensagemPasskeyInterrompida(concluidos)
        : revisaoDecisao.decisao === 'AUTORIZAR'
          ? `${e.message || 'Não foi possível confirmar o envio.'} Confira a atualização antes de tentar novamente.`
          : `${concluidos ? `${concluidos} título(s) já confirmado(s). ` : ''}${e.message || 'Não foi possível concluir.'} Os demais não foram confirmados. Atualize e confira antes de tentar novamente.`);
      // Resposta perdida pode esconder um commit completo. Reconciliar todos
      // os selecionados, inclusive fora da pagina atual, sem repetir POST/passkey.
      if (revisaoDecisao.decisao === 'AUTORIZAR' && !passkeyInterrompida(e)) {
        try {
          const atuais = [];
          for (let inicio = 0; inicio < revisaoDecisao.itens.length; inicio += 50) {
            const r = await listarTitulosAutorizacao({ item_ids: revisaoDecisao.itens.slice(inicio, inicio + 50).map(i => i.id).join(','), limite: '50' });
            atuais.push(...r.data);
          }
          if (vivo.current) {
            const selecionadosIds = new Set(revisaoDecisao.itens.map(i => Number(i.id)));
            const retirados = new Set(atuais.filter(i => !podeAutorizar(i)).map(i => Number(i.id)));
            setSelecao(current => Object.fromEntries(Object.entries(current).filter(([, i]) => !retirados.has(Number(i.id)))));
            if (atuais.filter(i => selecionadosIds.has(Number(i.id)) && i.status === 'ENFILEIRADO').length === selecionadosIds.size) {
              setAviso(`A atualização confirmou ${selecionadosIds.size} título(s) enviado(s) para a fila. Não é necessário autorizar novamente.`);
            }
          }
        } catch (_) { /* Sem GET confirmado, preservar selecao e aviso de conferencia. */ }
      }
    } finally { setRevisaoDecisao(null); travado.current = false; setBusy(false); atualizar(); }
  }
  const altera = key => event => setRascunho(current => ({ ...current, [key]: event.target.value }));
  const semResultado = !carregando && !erro && obras.data.length === 0;
  return <section className="pa-obras" aria-label="Autorizações por obra" data-detalhe={Boolean(obra)}>
    <form ref={formularioFiltros} className="pa-obras-filtros" onSubmit={aplicar}>
      <label className="pa-obras-data-tipo">Filtrar pela data de<select value={rascunho.data_tipo || 'VENCIMENTO'} onChange={altera('data_tipo')} disabled={busy || preparando}>
        <option value="VENCIMENTO">Vencimento</option><option value="EMISSAO">Emissão do título</option><option value="PAGAMENTO">Pagamento / baixa</option>
      </select></label>
      <label>{(rascunho.data_tipo || 'VENCIMENTO') === 'VENCIMENTO' ? 'Vencimento inicial' : 'Data inicial'}<DateInputBR key={'inicio:' + revisaoFiltros} data-filtro-data edicaoSegmentada value={rascunho.vencimento_inicio} onChange={altera('vencimento_inicio')} disabled={busy || preparando} /></label>
      <label>{(rascunho.data_tipo || 'VENCIMENTO') === 'VENCIMENTO' ? 'Vencimento final' : 'Data final'}<DateInputBR key={'fim:' + revisaoFiltros} data-filtro-data edicaoSegmentada value={rascunho.vencimento_fim} onChange={altera('vencimento_fim')} disabled={busy || preparando} /></label>
      <label className="pa-obras-busca">Obra / centro de custo<input value={rascunho.obra} onChange={altera('obra')} placeholder="Digite parte do nome da obra" maxLength={120} disabled={busy || preparando} /></label>
      <label className="pa-obras-busca">Solicitação<input value={rascunho.solicitacao || ''} onChange={altera('solicitacao')} placeholder="Código ou descrição da solicitação" maxLength={120} disabled={busy || preparando} /></label>
      <label className="pa-obras-situacao">Situação atual<select value={rascunho.situacao} onChange={altera('situacao')} disabled={busy || preparando}>
        <option value="">Todas as situações</option>{SITUACOES_AUTORIZACAO.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
      </select></label>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy || preparando} onClick={() => { setRascunho(INICIAL); setFiltro(INICIAL); setRevisaoFiltros(current => current + 1); setAviso(''); setPaginaObras(1); setPaginaTitulos(1); voltar(); }}>Limpar filtros</button>
    </form>
    <div className="pa-obras-resumo" aria-live="polite"><span>{obras.resumo?.quantidade_titulos || 0} títulos únicos nos filtros</span>
      <span>{filtro.situacao === 'EXCLUIDO' ? 'Valor histórico enviado — não é saldo a pagar' : filtro.data_tipo === 'PAGAMENTO' ? 'Valor efetivamente pago no período' : 'Valor das obras filtradas'} <strong>{moeda(obras.resumo?.valor_total)}</strong></span>
      <span>{carregando ? 'Atualizando…' : !filtro.vencimento_inicio && !filtro.vencimento_fim ? 'Todo o período · situação financeira atual' : 'Período aplicado · situação financeira atual'}</span>
      {filtro.data_tipo === 'PAGAMENTO' && filtro.situacao === 'QUITADO' && <small>Quitados inclui somente títulos totalmente pagos. Para consultar todas as baixas, inclusive parciais, escolha Todas as situações.</small>}
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
          <div className="pa-obras-itens">
          {(caps.can_decide || podeRetirarAlgum) && <div className="pa-obras-total-selecao"><strong aria-live="polite">{selecionados.length} selecionado(s) · {moeda(totalSelecionado)}</strong><small>Seleção de todas as obras e páginas; saldo dos títulos já na fila.</small><button type="button" className="btn btn-outline btn-sm" disabled={busy || preparando || !selecionados.length} onClick={() => mudarSelecao({})}>Limpar seleção de todas as páginas</button></div>}
          <div className="pa-obras-selecao"><label><input type="checkbox" checked={todosDaPagina} disabled={indisponivel || !elegiveis.length}
            onChange={e => mudarSelecao(current => selecionarPagina(current, titulos.data, e.target.checked, selecionavel))} /> Selecionar os disponíveis desta página</label><small>A retirada encerra só o envio. Aprovação, rejeição e pagamento mantêm suas permissões.</small>
            {podeRetirarAlgum && <RetirarEnvios key={userId} itens={envios} disabled={indisponivel} onOcupado={setBusy}
              onRetirado={() => { mudarSelecao({}); setTentativaManual(n => n + 1); }} />}</div>
          {titulos.data.map(item => {
            const s = item.snapshot_json || {}, permitido = podeSelecionarAutorizacao(item);
            return <article key={item.id} className="pa-obra-titulo">
              <div className="pa-obra-titulo__principal"><div><input type="checkbox" aria-label={`Selecionar ${s.codigo || item.titulo_financeiro_id}`}
                checked={selecao[String(item.titulo_financeiro_id)]?.id === item.id} disabled={indisponivel || !selecionavel(item)}
                onChange={e => mudarSelecao(current => selecionarPagina(current, [item], e.target.checked, selecionavel))} /><button type="button" className="pa-titulo-abrir" aria-label={`Abrir detalhes de ${s.codigo || item.titulo_financeiro_id}`} disabled={busy || preparando || carregando}
                  onClick={() => abrirDetalhe({ item, filtro: { ...filtro, obra_id: String(obra.id) } })}>{s.solicitacao?.codigo || s.codigo || `Título #${item.titulo_financeiro_id}`} <span aria-hidden="true">›</span></button></div>
                <span className={`pa-status pa-status--${item.situacao_financeira?.toLowerCase()}`}>{rotuloSituacao(item.situacao_financeira)}</span></div>
              <TituloExcluidoAviso exclusao={item.exclusao_titulo} />
              {caps.can_decide && !caps.paused && podeAutorizar(item) && <ValorAutorizacao item={item} value={proposto(item)} disabled={indisponivel}
                onChange={valor => { setRevisaoDecisao(null); setValores(current => ({ ...current, [item.id]: { valor, assinatura: assinaturaDecisao(item) } })); }} />}
              {item.autorizacao_valor_json && <small>Valor editado pelo proprietário: {moeda(item.autorizacao_valor_json.valor_autorizado)} · Original: {moeda(item.autorizacao_valor_json.valor_original)}</small>}
              <BotaoReenvioAutorizacao item={item} caps={caps} disabled={indisponivel} setBusy={setBusy}
                onEnviado={() => setTentativaManual(current => current + 1)} />
              {!item.exclusao_titulo && item.status === 'PENDENTE' && (!permitido || item.situacao_financeira !== 'AGUARDANDO') && <small>{permitido ? 'Aguardando aprovação do saldo deste título.' : 'Pendente de decisão, mas o saldo ou vínculo mudou. Confira o financeiro antes de aprovar.'}</small>}
              {item.fila_atual?.status === 'NAO_PAGO' && item.situacao_financeira !== 'NAO_PAGO' && <small>Última tentativa na fila: não pago.</small>}
              <div className="pa-obra-titulo__corpo"><div><strong>{s.favorecido_pagamento?.nome || s.credor?.nome || 'Credor não informado'}</strong>
                <small>{s.codigo} · {item.origem_painel === 'FILA_DIRETA' ? `Envio direto · fila #${item.fila_id}` : item.lote?.codigo || `Lote #${item.lote_id}`}</small><small>{resumoSolicitacaoAutorizacao(s)}</small>
                <small>Vencimento {dataISOParaBR(item.vencimento_atual || s.data_vencimento) || 'não informado'} · {s.forma_pagamento?.nome || s.favorecido_pagamento?.metodo || 'Forma não informada'}</small>
                {(item.envio_destino === 'AUTORIZACAO' || item.fila_atual) && <small>{item.envio_destino === 'AUTORIZACAO' ? 'Enviado para autorização' : item.origem_painel === 'FILA_DIRETA' ? 'Envio direto à fila' : 'Enviado à fila'} · {item.enviado_por?.nome || 'Usuário não disponível'}{item.enviado_em ? ` · ${new Date(item.enviado_em).toLocaleString('pt-BR')}` : ''}</small>}
                {filtro.data_tipo === 'PAGAMENTO' && <small>Pago no período: {moeda(item.pago_no_periodo)}</small>}
                {item.bloqueado_proprietario && <small>Saldo bloqueado pelo proprietário até nova autorização.</small>}</div>
                <div className="pa-obra-valores"><span>{item.exclusao_titulo ? 'Valor histórico enviado' : item.origem_painel === 'FILA_DIRETA' ? 'Valor enviado à fila' : 'Valor enviado para autorização'} <strong>{moeda(item.valor_snapshot)}</strong></span>
                  <span>Pago <strong>{item.titulo ? moeda(item.titulo.valor_baixado) : '—'}</strong> · Saldo <strong>{item.titulo ? moeda(item.titulo.valor_saldo) : '—'}</strong></span>
                  {filtro.data_tipo !== 'PAGAMENTO' && Math.abs(Number(item.valor_no_recorte) - Number(item.valor_snapshot)) > 0.005 && <small>Participação no recorte: {moeda(item.valor_no_recorte)}. A decisão abrange o título inteiro.</small>}</div></div>
              {(item.documentos || []).length > 0 && <div className="pa-obra-documentos">{item.documentos.map(doc => <button type="button" className="btn btn-outline btn-sm" key={doc.id} onClick={() => abrirDocumento(doc)}>{doc.nome}</button>)}</div>}
              {s.participacoes?.length > 0 && <details><summary>Participações do título compartilhado</summary>{s.participacoes.map((p, indice) => <small key={indice}>{p.obra_nome || `Obra #${p.obra_id}`} · {p.empresa_nome || `Empresa #${p.empresa_id}`} · {moeda(p.valor)}</small>)}</details>}
              {item.titulo?.solicitacao?.justificativa && <details><summary>Justificativa da solicitação</summary><p>{item.titulo.solicitacao.justificativa}</p></details>}
              {(item.motivo_decisao || item.fila_atual?.motivo) && <details><summary>Motivos e decisão registrada</summary><p>{item.motivo_decisao || item.fila_atual.motivo}</p><small>Decisão: {rotuloSituacao(item.status)}</small></details>}
            </article>;
          })}
          {!carregando && !erro && !titulos.data.length && <p className="pa-empty">Nenhum título nesta obra com os filtros aplicados.</p>}
          </div>
          <footer className="pa-obras-rodape">
            {caps.can_decide && <div className="pa-obras-acoes-selecao" role="group" aria-label="Ações dos títulos selecionados">
              <button type="button" className="btn btn-outline btn-sm" disabled={indisponivel || !selecionados.length || !selecionados.every(podeSelecionarAutorizacao) || caps.paused || !caps.passkey_count} onClick={() => { setRevisaoDecisao(null); setPedindoMotivo(true); }}>Rejeitar</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={indisponivel || !selecionados.length || !selecionados.every(podeAutorizar) || caps.paused || !caps.passkey_count} onClick={() => conferir('AUTORIZAR')}>Autorizar selecionados ({selecionados.length})</button>
            </div>}
            <Paginacao nome="títulos" pagina={paginaTitulos} dados={titulos.paginacao} alterar={setPaginaTitulos} disabled={indisponivel} />
          </footer>
        </>}
      </section>
    </div>
    {caps.can_decide && (obra || selecionados.length > 0) && <section className="pa-obras-retorno" aria-label="Conferência e avisos">
      {!obra && selecionados.length > 0 && <p>{selecionados.length} selecionado(s) · {moeda(totalSelecionado)} entre obras e páginas. Abra uma obra para decidir ou limpar a seleção.</p>}
      {pedindoMotivo && <form className="pa-obras-conferencia" onSubmit={e => { e.preventDefault(); conferir('REJEITAR'); }}><label>Motivo para rejeição<textarea ref={motivoRef} value={motivo} maxLength={500} required disabled={busy || preparando} onChange={e => setMotivo(e.target.value)} /></label><p>O saldo restante dos títulos já na fila será bloqueado até nova autorização. Valores pagos e histórico serão preservados.</p><div className="pa-obras-acoes"><button type="button" className="btn btn-outline btn-sm" disabled={busy || preparando} onClick={() => setPedindoMotivo(false)}>Cancelar rejeição</button><button type="submit" className="btn btn-primary btn-sm" disabled={indisponivel || !motivo.trim() || !selecionados.length}>Conferir rejeição</button></div></form>}
      {!caps.passkey_count && <small>Cadastre uma passkey nas opções para confirmar decisões.</small>}
      {revisaoDecisao && <section ref={conferenciaRef} tabIndex={-1} className="pa-obras-conferencia" aria-label="Conferência da decisão">
        <strong>Conferir {revisaoDecisao.decisao === 'AUTORIZAR' ? 'autorização' : 'rejeição'} de {revisaoDecisao.itens.length} título(s)</strong>
        <p>Total selecionado: <strong>{moeda(revisaoDecisao.itens.reduce((total, item) => total + Math.round(valorDaSelecao(item) * 100), 0) / 100)}</strong></p>
        <p>{revisaoDecisao.decisao === 'AUTORIZAR'
          ? 'Uma única confirmação por passkey autoriza e envia todos os títulos selecionados para a fila, mesmo de lotes diferentes. Os demais permanecem como estão.'
          : `Somente os títulos selecionados serão decididos. Serão solicitadas ${revisaoDecisao.grupos.length} confirmações por passkey, separadas por lote e tipo de decisão. Se interromper, as decisões já confirmadas não serão desfeitas.`}</p>
        <ul>{revisaoDecisao.itens.map(i => <li key={i.id}>{i.snapshot_json?.codigo || `Título #${i.titulo_financeiro_id}`} · {i.obras_nomes} · {moeda(valorDaSelecao(i))}{revisaoDecisao.decisao === 'AUTORIZAR' && valorDaSelecao(i) < Number(i.valor_snapshot) ? ` · Valor editado pelo proprietário; original ${moeda(i.valor_snapshot)}, restante ${moeda(Number(i.valor_snapshot) - valorDaSelecao(i))}` : ''}</li>)}</ul>
        {revisaoDecisao.decisao === 'REJEITAR' && <p>Motivo: {revisaoDecisao.motivo}</p>}
        <div className="pa-obras-acoes"><button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setRevisaoDecisao(null)}>Voltar à seleção</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || caps.paused} onClick={confirmar}>Confirmar {revisaoDecisao.decisao === 'AUTORIZAR' ? `autorização com passkey (${revisaoDecisao.itens.length})` : 'rejeição com passkey'}</button></div>
      </section>}
    </section>}
    {aviso && <p role="status">{aviso}</p>}
    {detalhe && <AutorizacaoTituloDetalhe inicial={detalhe.item} valorInicial={proposto(detalhe.item)} filtro={detalhe.filtro} caps={caps} setBusy={setBusy} abrirDocumento={abrirDocumento}
      onOcupado={setDetalheOcupado} onFechar={() => { voltar(); setTentativaManual(current => current + 1); }}
      onDecidido={tituloId => { setRevisaoDecisao(null); setSelecao(current => Object.fromEntries(Object.entries(current).filter(([id]) => Number(id) !== Number(tituloId)))); }} />}
  </section>;
}
