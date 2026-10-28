import { useEffect, useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import { Avisos, useAvisos, useConfirmacao } from '../padrao';
import { pagamentoRhSolicitacao } from '../../services/rhDp';
import { useWorkspaceState, useWorkspaceWork } from '../../navigation/WorkspaceContext';
import { contaPagamentoInputs, pagamentoInputs, restaurarPagamentoInputs } from '../../navigation/rhPagamentoWorkspaceDraft';
import { formatCurrencyInput, normalizeCurrencyTyping, parseCurrencyInput } from '../../utils/formatters';
import '../../styles/rh-pagamento-solicitacao.css';

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const arredondar = v => Math.round((v + Number.EPSILON) * 100) / 100;
const podeEditarResposta = resposta => Boolean(resposta && (resposta.solicitacao.situacao === 'RASCUNHO'
  || (resposta.pode_conferir && ['ABERTA', 'APROVADA', 'ENVIO_PARCIAL', 'EM_REVISAO'].includes(resposta.solicitacao.situacao))));
export function valoresDaLinha(l, concluido = false) {
  const diaria = l.forma_calculo_gerencial === 'DIARIA';
  const percentual = diaria ? 100 : l.parcela_50 ? 50
    : Boolean(l.parcela_40) === Boolean(l.parcela_60) ? 100 : l.parcela_40 ? 40 : 60;
  if (l.salario_oculto) return { percentual, bruto: null, liquido: null };
  // Pagamentos ja gerados conservam o snapshot aprovado, mesmo apos uma mudanca de regra.
  if (concluido && l.bruto != null && l.liquido != null
    && Number.isFinite(Number(l.bruto)) && Number.isFinite(Number(l.liquido))) {
    return { percentual, bruto: Number(l.bruto), liquido: Number(l.liquido) };
  }
  if (l.vale) return { percentual: null, bruto: Number(l.valor_vale || 0), liquido: Number(l.valor_vale || 0) };
  const bruto = arredondar(diaria ? Number(l.valor_diaria || 0) * Number(l.dias || 0)
    : Number(l.salario_base || 0) * percentual / 100);
  return { percentual, bruto, liquido: arredondar(bruto + Number(l.acrescimos || 0) - Number(l.descontos || 0)) };
}

function DadosRecebimento({ dados, alterar, reembolso = false }) {
  return <div className="rh-pagamento-conta">
    <label>Recebimento<select aria-label="Recebimento" className="form-control" value={dados.modo_recebimento || 'PIX'}
      onChange={e => alterar({ ...(e.target.value === 'CONTA_SALARIO' ? dados.conta_salario || {}
        : e.target.value === 'PIX' ? dados.pix_cadastro || {} : e.target.value === 'DINHEIRO'
          ? { chave_pix: '', banco: '', agencia: '', conta: '', tipo_conta: '' } : {}), modo_recebimento: e.target.value })}>
      <option value="PIX">Pix</option>{!reembolso && <option value="CONTA_SALARIO">Conta salário</option>}
      <option value="OUTRA_CONTA">Outra conta</option><option value="DINHEIRO">Dinheiro</option></select></label>
    {dados.modo_recebimento !== 'CONTA_SALARIO' && <>
      <label>Favorecido<input className="form-control" value={dados.favorecido_nome || ''} onChange={e => alterar({ favorecido_nome: e.target.value })} /></label>
      <label>CPF/CNPJ<input className="form-control" value={dados.favorecido_documento || ''} maxLength={20} onChange={e => alterar({ favorecido_documento: e.target.value })} /></label>
    </>}
    {(dados.modo_recebimento || 'PIX') === 'PIX' ? <label className="rh-pagamento-conta-chave">Chave Pix / Copia e Cola
      <textarea aria-label="Chave Pix / Copia e Cola" className="form-control" rows={2} maxLength={8192} value={dados.chave_pix || ''} onChange={e => alterar({ chave_pix: e.target.value })} /></label>
      : dados.modo_recebimento !== 'DINHEIRO' && <>{[['banco', 'Banco (código)'], ['agencia', 'Agência'], ['conta', 'Conta'], ['tipo_conta', 'Tipo de conta']].map(([campo, rotulo]) =>
        <label key={campo}>{rotulo}<input className="form-control" value={dados[campo] || ''}
          readOnly={dados.modo_recebimento === 'CONTA_SALARIO'} onChange={e => alterar({ [campo]: e.target.value })} /></label>)}</>}
  </div>;
}

export default function RhDpPagamentoModal({ local, locais = [], colaborador, colaboradorIds, solicitacaoId, onIniciada, onFechar, aoEnviar }) {
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [resposta, setResposta] = useState(null);
  const [form, setForm] = useState(null);
  const [localId, setLocalId] = useState(local?.id || '');
  const [ocupado, setOcupado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [editores, setEditores] = useWorkspaceState('pagamento:editores', {});
  const [busca, setBusca] = useWorkspaceState('pagamento:busca', '');
  const [drafts, setDrafts] = useWorkspaceState('pagamento:inputs', {});
  const draftsRef = useRef(drafts); draftsRef.current = drafts;
  const [conflito, setConflito] = useState(false);
  const restauradoSemSalvar = useRef(false);
  const recebidoInicial = useRef(null);
  const trava = useRef(false);
  const atual = useRef(null);
  const sujoRef = useRef(false);
  const iniciarPromise = useRef(null);
  const falhaAutomatica = useRef(false);
  const salvamentoPromise = useRef(null);
  const respostaRef = useRef(null);
  const chaveRascunho = useRef(crypto.randomUUID());
  const montado = useRef(true);
  const chavePrevia = `previa:${localId}:${colaborador?.id || (colaboradorIds ? [...colaboradorIds].sort((a,b)=>a-b).join(',') : 'todos')}`;
  atual.current = form; sujoRef.current = sujo;
  const dp = Boolean(resposta?.pode_conferir);
  const concluido = resposta?.solicitacao?.situacao === 'APROVADA';
  const editavel = !conflito && podeEditarResposta(resposta);
  const estadoLinha = l => l.pagamento_estado || (concluido ? 'ENVIADO' : 'PENDENTE');
  const linhaEditavel = l => editavel && ['PENDENTE', 'EM_EDICAO'].includes(estadoLinha(l));
  const editorSalvo = editores[resposta?.solicitacao?.id || chavePrevia];
  const editor = editorSalvo && resposta?.solicitacao?.dados_json?.linhas?.some(l =>
    Number(l.colaborador_id) === Number(editorSalvo.id) && linhaEditavel(l)) ? editorSalvo : null;
  function setEditor(update) {
    const id = respostaRef.current?.solicitacao?.id || chavePrevia;
    if (!id) return;
    setEditores(values => {
      const next = typeof update === 'function' ? update(values[id] || null) : update;
      if (!next) return Object.fromEntries(Object.entries(values).filter(([key]) => String(key) !== String(id)));
      return { ...values, [id]: next };
    });
  }
  useWorkspaceWork(sujo || Boolean(editor), ocupado || salvando || carregando, 'pagamento:work');
  function guardar(formulario, revisao = respostaRef.current?.solicitacao?.dados_json?.revisao) {
    const id = respostaRef.current?.solicitacao?.id || chavePrevia;
    if (!id) return;
    setDrafts(values => ({ ...values, [id]: { revisao, inputs: pagamentoInputs(formulario), chave_rascunho: chaveRascunho.current } }));
  }
  function limparDraft(id) {
    setDrafts(values => Object.fromEntries(Object.entries(values).filter(([key]) => String(key) !== String(id))));
  }
  function receber(result, restaurar = false) {
    respostaRef.current = result;
    setLocalId(result.solicitacao.obra_id || local?.id || '');
    const fresh = result.solicitacao.dados_json;
    const saved = restaurar ? draftsRef.current[result.solicitacao.id || chavePrevia] : null;
    if (saved?.chave_rascunho) chaveRascunho.current = saved.chave_rascunho;
    atual.current = restaurarPagamentoInputs(fresh, saved?.inputs, result.pode_conferir, result.solicitacao.situacao);
    const mudou = podeEditarResposta(result) && (JSON.stringify(pagamentoInputs(atual.current)) !== JSON.stringify(pagamentoInputs(fresh))
      || fresh.linhas.some(l => l.cadastro_atualizado && ['PENDENTE', 'EM_EDICAO'].includes(l.pagamento_estado)));
    sujoRef.current = mudou; restauradoSemSalvar.current = mudou;
    setConflito(Boolean(saved && saved.revisao !== fresh.revisao));
    if (!restaurar) { limparDraft(result.solicitacao.id || chavePrevia); setEditor(null); }
    setResposta(result); setForm(atual.current); setSujo(mudou);
  }
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);
  useEffect(() => {
    if (!solicitacaoId && !localId) return undefined;
    let ativo = true;
    setCarregando(true);
    iniciarPromise.current ||= solicitacaoId ? pagamentoRhSolicitacao(`/${solicitacaoId}`)
      : pagamentoRhSolicitacao('/preparar', { method: 'POST', data: {
        obra_id: Number(localId), colaborador_id: colaborador?.id, colaborador_ids: colaboradorIds
      } });
    iniciarPromise.current.then(result => { if (ativo && recebidoInicial.current !== result) {
      recebidoInicial.current = result; receber(result, true);
      if (result.solicitacao.id) onIniciada?.(result.solicitacao.id);
    } })
      .catch(e => { if (ativo) { setResposta(null); setForm(null); avisar.erro(e.message); } iniciarPromise.current = null; })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [solicitacaoId, localId, colaborador?.id, colaboradorIds]); // eslint-disable-line react-hooks/exhaustive-deps
  function alterar(patch) {
    if (!editavel) return;
    if (patch.linhas) {
      // Linhas removidas saem da tabela ativa, nao do snapshot enviado ao servidor.
      const porId = new Map(patch.linhas.map(l => [Number(l.colaborador_id), l]));
      patch = { ...patch, linhas: atual.current.linhas.map(l => l.removido_em ? l : porId.get(Number(l.colaborador_id)) || l) };
    }
    falhaAutomatica.current = false;
    restauradoSemSalvar.current = false;
    atual.current = { ...atual.current, ...patch }; sujoRef.current = true;
    guardar(atual.current);
    setForm(atual.current); setSujo(true);
  }
  function linhaAlterar(id, patch, conferindo = false) {
    if (patch.vale === true) patch = { ...patch, parcela_40: false, parcela_50: false, parcela_60: false, acrescimos: 0, descontos: 0, reembolso: null, desconto_sem_reembolso: false };
    if (patch.parcela_50 === true) patch = { ...patch, parcela_40: false, parcela_60: false };
    else if ('parcela_40' in patch || 'parcela_60' in patch) patch = { ...patch, parcela_50: false };
    alterar({ linhas: atual.current.linhas.map(l => Number(l.colaborador_id) === Number(id) && linhaEditavel(l)
      ? { ...l, ...(!conferindo ? { [dp ? 'conferido_dp' : 'conferido_obra']: false } : {}), ...patch } : l) });
    if (conferindo && Object.values(patch).some(v => v === true) && !respostaRef.current.solicitacao.id) {
      operacao(() => salvar(true, true));
    }
  }
  async function salvar(completo = false, permitirNovo = false) {
    if (!podeEditarResposta(respostaRef.current)) return respostaRef.current;
    if (conflito) throw new Error('O pagamento mudou. Confira os dados atuais antes de salvar ou enviar.');
    // Somente uma gravacao em voo; fechar/enviar aguardam e salvam tambem edicoes posteriores.
    if (salvamentoPromise.current) await salvamentoPromise.current;
    do {
      const novo = !respostaRef.current?.solicitacao.id;
      if ((!sujoRef.current && !novo) || (novo && !permitirNovo) || !montado.current) return respostaRef.current;
      const snapshot = atual.current;
      const gravacao = (async () => {
        setSalvando(true);
        try {
          const dados = {
            ...snapshot, linhas: snapshot.linhas.map(l => ({ ...l,
              acrescimos: Number(l.acrescimos || 0), descontos: Number(l.descontos || 0),
              conferir_alteracoes: Boolean(l.conferido_dp) }))
          };
          const result = novo ? await pagamentoRhSolicitacao('/salvar', { method: 'POST', data: {
            obra_id: Number(localId), colaborador_id: colaborador?.id, colaborador_ids: colaboradorIds,
            chave_idempotencia: chaveRascunho.current, dados
          } }) : await pagamentoRhSolicitacao(`/${respostaRef.current.solicitacao.id}`, { method: 'PUT', data: dados });
          if (!montado.current) return result;
          if (snapshot.linhas.some(l => {
            if (!linhaEditavel(l)) return false;
            const salva = result.solicitacao.dados_json.linhas.find(s => Number(s.colaborador_id) === Number(l.colaborador_id));
            return Boolean(l.vale) !== Boolean(salva?.vale) || (l.vale && Number(l.valor_vale || 0) !== Number(salva?.valor_vale));
          })) throw new Error('O servidor não confirmou o Vale. Atualize o backend antes de enviar.');
          const percentualNaoConfirmado = snapshot.linhas.some(l => l.parcela_50 && linhaEditavel(l)
            && !result.solicitacao.dados_json.linhas.find(s => Number(s.colaborador_id) === Number(l.colaborador_id))?.parcela_50);
          if (percentualNaoConfirmado) throw new Error('O servidor não confirmou o pagamento de 50%. Atualize o backend e reabra o pagamento antes de enviar.');
          // Deploy desencontrado: backend antigo ignora o valor e reembolsa o desconto inteiro.
          const divergente = snapshot.linhas.some(l => {
            if (!l.reembolso || l.reembolso.valor == null) return false;
            const salva = result.solicitacao.dados_json.linhas.find(s => Number(s.colaborador_id) === Number(l.colaborador_id));
            return !salva?.reembolso || Number(salva.reembolso.valor ?? salva.descontos) !== Number(l.reembolso.valor);
          });
          if (divergente) throw new Error('O servidor não confirmou o valor do reembolso. Atualize o backend e reabra o pagamento.');
          const editadoDuranteGravacao = atual.current !== snapshot;
          respostaRef.current = result; setResposta(result);
          if (novo) {
            iniciarPromise.current = Promise.resolve(result); recebidoInicial.current = result;
            limparDraft(chavePrevia);
            onIniciada?.(result.solicitacao.id);
          }
          // Nao substituir os inputs: mantem foco, texto em digitacao e novas edicoes.
          atual.current = { ...(editadoDuranteGravacao ? restaurarPagamentoInputs(result.solicitacao.dados_json,
            pagamentoInputs(atual.current), result.pode_conferir, result.solicitacao.situacao) : result.solicitacao.dados_json),
            revisao: result.solicitacao.dados_json.revisao,
            salvo_por: result.solicitacao.dados_json.salvo_por, salvo_em: result.solicitacao.dados_json.salvo_em };
          sujoRef.current = editadoDuranteGravacao;
          if (editadoDuranteGravacao) guardar(atual.current, result.solicitacao.dados_json.revisao);
          else limparDraft(result.solicitacao.id);
          restauradoSemSalvar.current = false;
          setForm(atual.current); setSujo(editadoDuranteGravacao);
          return result;
        } finally { if (montado.current) setSalvando(false); }
      })();
      salvamentoPromise.current = gravacao;
      try { await gravacao; } finally { salvamentoPromise.current = null; }
    } while (completo && sujoRef.current);
    return respostaRef.current;
  }
  async function operacao(fn) {
    if (trava.current) return;
    trava.current = true; setOcupado(true);
    try { await fn(); } catch (e) { falhaAutomatica.current = true; avisar.erro(e.message); }
    finally { trava.current = false; setOcupado(false); }
  }
  useEffect(() => {
    if (!sujo || !resposta?.solicitacao.id || !editavel || ocupado || salvando || editor || falhaAutomatica.current || restauradoSemSalvar.current) return undefined;
    const timer = setTimeout(() => salvar().catch(e => {
      if (montado.current) { falhaAutomatica.current = true; avisar.erro(e.message); }
    }), 900);
    return () => clearTimeout(timer);
  }, [sujo, form, ocupado, salvando, editor]); // eslint-disable-line react-hooks/exhaustive-deps
  async function fechar() {
    if (trava.current || carregando) return;
    if (conflito || !podeEditarResposta(respostaRef.current)) { onFechar(); return; }
    if (!respostaRef.current?.solicitacao.id) { onFechar(); return; }
    await operacao(async () => { await salvar(true); onFechar(); });
  }
  async function atualizarCadastro() {
    await operacao(async () => {
      if (salvamentoPromise.current) await salvamentoPromise.current;
      const anterior = respostaRef.current;
      const inputs = pagamentoInputs(atual.current);
      const result = anterior.solicitacao.id ? await pagamentoRhSolicitacao(`/${anterior.solicitacao.id}`)
        : await pagamentoRhSolicitacao('/preparar', { method: 'POST', data: {
          obra_id: Number(localId), colaborador_id: colaborador?.id, colaborador_ids: colaboradorIds
        } });
      if (!montado.current) return;
      const mudouRevisao = anterior.solicitacao.id && anterior.solicitacao.dados_json.revisao !== result.solicitacao.dados_json.revisao;
      respostaRef.current = result; setResposta(result);
      atual.current = restaurarPagamentoInputs(result.solicitacao.dados_json, inputs, result.pode_conferir, result.solicitacao.situacao);
      setForm(atual.current); setConflito(Boolean(mudouRevisao));
      sujoRef.current = true; setSujo(true); restauradoSemSalvar.current = true;
      guardar(atual.current, anterior.solicitacao.dados_json.revisao);
      avisar.sucesso('Cadastro atualizado. Confira os valores e dados para pagamento antes de enviar.');
    });
  }
  async function enviar() {
    await operacao(async () => {
      if (!respostaRef.current?.solicitacao.id) throw new Error('Salve o rascunho ou marque como Conferido antes de enviar.');
      const result = await salvar(true);
      const selecionados = result.solicitacao.dados_json.linhas.filter(l => l.selecionado && linhaEditavel(l));
      if (!selecionados.length) throw new Error('Selecione os colaboradores do pagamento.');
      const { ok } = await confirmar({ titulo: dp ? 'Enviar pagamentos para a fila' : 'Solicitar pagamento ao DP',
        mensagem: `${selecionados.length} colaborador(es) · ${selecionados.some(l => l.salario_oculto) ? 'Valor restrito ao DP' : moeda(selecionados.reduce((s, l) => s + valoresDaLinha(l).liquido, 0))}${result.avisos?.length ? '\nHá pagamentos anteriores nesta competência. Esta solicitação será independente.' : ''}`,
        rotuloConfirmar: dp ? 'Enviar para a fila' : 'Solicitar pagamento' });
      if (!ok) return;
      const enviado = await pagamentoRhSolicitacao(`/${result.solicitacao.id}/enviar`, { method: 'POST', data: { revisao: result.solicitacao.dados_json.revisao } });
      receber(enviado); aoEnviar?.(enviado);
      avisar.sucesso(dp ? 'Títulos gerados e enviados para a fila.' : 'Pagamento solicitado ao DP.');
    });
  }
  const linhasRemovidas = (form?.linhas || []).filter(l => l.removido_em);
  const linhas = (form?.linhas || []).filter(l => !l.removido_em);
  const selecionados = linhas.filter(l => l.selecionado && linhaEditavel(l));
  const editaveis = linhas.filter(linhaEditavel);
  // Consulta concluida conserva o resumo historico; novos envios contam apenas linhas editaveis.
  const consultaSelecionadas = linhas.filter(l => estadoLinha(l) !== 'CANCELADO' && l.selecionado);
  const resumo = !editaveis.length ? (consultaSelecionadas.length ? consultaSelecionadas : linhas.filter(l => estadoLinha(l) === 'ENVIADO')) : selecionados;
  const resumoEnviado = !editaveis.length && resumo.every(l => estadoLinha(l) === 'ENVIADO');
  const visiveis = linhas.filter(l => l.nome.toLocaleLowerCase().includes(busca.toLocaleLowerCase()));
  const reembolsos = [...selecionados.filter(l => l.reembolso && Number(l.descontos) > 0).reduce((grupos, l) => {
    const chave = `${l.reembolso.responsavel_id}:${l.empresa_grupo_id}`;
    const grupo = grupos.get(chave) || { chave, nome: l.reembolso.favorecido_nome, valor: 0, origens: [] };
    const valor = Number(l.reembolso.valor ?? l.descontos);
    grupo.valor = arredondar(grupo.valor + valor);
    grupo.origens.push({ colaborador_id: l.colaborador_id, nome: l.nome, valor });
    grupos.set(chave, grupo); return grupos;
  }, new Map()).values()];
  function todos(campo, valor) {
    alterar({ linhas: linhas.map(l => {
      if (!linhaEditavel(l)) return l;
      if (campo !== 'selecionado' && !l.selecionado) return l;
      return { ...l, [campo]: valor,
        ...(!campo.startsWith('conferido') ? { [dp ? 'conferido_dp' : 'conferido_obra']: false } : {}) };
    }) });
    if (campo.startsWith('conferido') && valor && selecionados.length && !respostaRef.current.solicitacao.id) {
      operacao(() => salvar(true, true));
    }
  }
  async function excluirRascunho() {
    if (trava.current || !resposta?.pode_excluir_rascunho) return;
    await operacao(async () => {
      const { ok } = await confirmar({ titulo: 'Excluir rascunho de pagamento',
        mensagem: 'Este rascunho será retirado das solicitações. O histórico será preservado. Nenhum pagamento enviado será alterado.',
        rotuloConfirmar: 'Excluir rascunho', destrutiva: true });
      if (!ok) return;
      if (salvamentoPromise.current) await salvamentoPromise.current;
      await pagamentoRhSolicitacao(`/${respostaRef.current.solicitacao.id}/rascunho`, { method: 'DELETE' });
      limparDraft(respostaRef.current.solicitacao.id); limparDraft(chavePrevia); setEditor(null);
      aoEnviar?.(); onFechar();
    });
  }
  async function revisar(linha, acao) {
    await operacao(async () => {
      const result = await salvar(true);
      const ids = new Set([Number(linha.colaborador_id)]);
      if (acao === 'EDITAR') {
        let mudou;
        do {
          mudou = false;
          for (const t of result.solicitacao.dados_json.titulos || []) {
            if (t.cancelado || !t.origens?.some(o => ids.has(Number(o.colaborador_id)))) continue;
            for (const o of t.origens) if (!ids.has(Number(o.colaborador_id))) { ids.add(Number(o.colaborador_id)); mudou = true; }
          }
        } while (mudou);
      }
      const nomes = result.solicitacao.dados_json.linhas.filter(l => ids.has(Number(l.colaborador_id))).map(l => l.nome).join(', ');
      const { ok, texto } = await confirmar({ titulo: acao === 'EDITAR' ? 'Editar e reenviar pagamento' : 'Cancelar pagamento',
        mensagem: acao === 'EDITAR' ? `${nomes}. Os pagamentos serão bloqueados na fila até a conferência e o reenvio.${ids.size > 1 ? ' O reembolso agrupado exige revisar todos os colaboradores envolvidos.' : ''}`
          : `${linha.nome}. O salário e a parte deste colaborador no reembolso serão cancelados. O histórico será preservado.`,
        rotuloConfirmar: acao === 'EDITAR' ? 'Bloquear para edição' : 'Cancelar pagamento',
        rotuloCancelar: 'Voltar', destrutiva: acao === 'CANCELAR', campo: { rotulo: 'Motivo', multilinha: true, obrigatorio: true } });
      if (!ok) return;
      if (!texto?.trim()) throw new Error('Informe o motivo.');
      const revisado = await pagamentoRhSolicitacao(`/${result.solicitacao.id}/revisar`, { method: 'POST', data: {
        colaborador_id: linha.colaborador_id, acao, motivo: texto, revisao: result.solicitacao.dados_json.revisao
      } });
      receber(revisado); aoEnviar?.(revisado);
      avisar.sucesso(acao === 'EDITAR' ? 'Pagamento bloqueado na fila e liberado para edição.' : 'Pagamento cancelado. Histórico preservado.');
    });
  }
  async function alterarComposicao(linha = null) {
    if (!resposta?.pode_gerenciar_solicitacao || conflito) return;
    await operacao(async () => {
      const cancelarTudo = !linha;
      const { ok, texto } = await confirmar({
        titulo: cancelarTudo ? 'Cancelar solicitação completa' : 'Remover colaborador da solicitação',
        mensagem: `${cancelarTudo ? 'Todos os colaboradores desta solicitação' : linha.nome}. Os títulos sem pagamento serão cancelados; reembolsos compartilhados serão ajustados. Se houver pagamento registrado, a ação será bloqueada. Histórico e comprovantes serão preservados.${sujoRef.current ? ' Alterações locais ainda não salvas serão descartadas.' : ''}`,
        rotuloConfirmar: cancelarTudo ? 'Cancelar solicitação' : 'Remover colaborador',
        rotuloCancelar: 'Voltar', destrutiva: true,
        campo: { rotulo: 'Motivo', multilinha: true, obrigatorio: true }
      });
      if (!ok) return;
      if (!texto?.trim()) throw new Error('Informe o motivo.');
      if (salvamentoPromise.current) await salvamentoPromise.current;
      const atualResposta = respostaRef.current;
      const result = await pagamentoRhSolicitacao(`/${atualResposta.solicitacao.id}/${cancelarTudo ? 'cancelar' : 'remover-colaborador'}`, {
        method: 'POST', data: { revisao: atualResposta.solicitacao.dados_json.revisao,
          motivo: texto, ...(linha ? { colaborador_id: linha.colaborador_id } : {}) }
      });
      receber(result); aoEnviar?.(result);
      avisar.sucesso(cancelarTudo ? 'Solicitação cancelada. Histórico preservado.' : 'Colaborador removido da solicitação. Histórico preservado.');
    });
  }
  return <OverlayModal largura="1480px" rotulo="Solicitar pagamento" onFechar={editor ? () => setEditor(null) : fechar}>
    <div data-modal="cabecalho" className="rh-local-modal-cabecalho">
      <div><h2 className="app-bloco-titulo">{dp ? 'Conferir pagamento' : 'Solicitar pagamento'}{resposta?.solicitacao.codigo ? ` · ${resposta.solicitacao.codigo}` : ''}</h2>
        <p className="app-note">{local?.nome || locais.find(l => Number(l.id) === Number(localId))?.nome || 'Obra / Centro de custo'}{resposta?.solicitacao?.situacao === 'ENVIO_PARCIAL' ? ' · Envio parcial para pagamento' : resposta?.solicitacao?.situacao === 'EM_REVISAO' ? ' · Em edição pelo DP' : ''}</p></div>
      <button type="button" className="btn btn-outline btn-sm" disabled={ocupado || carregando} onClick={fechar}>Fechar</button>
    </div>
    <div className="rh-local-modal-corpo rh-pagamento-solicitacao">
      <Avisos avisos={avisos} aoFechar={fecharAviso} />
      {!localId && !solicitacaoId && <label>Obra / Centro de custo<select aria-label="Obra / Centro de custo" className="form-control" value={localId} onChange={e => setLocalId(e.target.value)}>
        <option value="">Selecione</option>{locais.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nome}</option>)}</select></label>}
      {carregando && <p role="status">Carregando pagamento…</p>}
      {conflito && <div role="alert" className="app-note">O pagamento mudou. Seu preenchimento foi mantido para conferência; o envio está bloqueado.
        <button type="button" className="btn btn-outline btn-sm" onClick={async () => {
          const { ok } = await confirmar({ titulo: 'Descartar preenchimento', mensagem: 'Descartar as alterações locais e usar o pagamento atual?', destrutiva: true });
          if (ok) receber(respostaRef.current);
        }}>Usar dados atuais</button></div>}
      {form && <>
        <div className="flex flex-wrap items-center gap-2 py-2">
          <span className="app-note" role="status">Situação: {resposta.solicitacao.situacao}</span>
          {resposta.pode_gerenciar_solicitacao && resposta.solicitacao.id && <button type="button" className="btn btn-outline btn-sm"
            disabled={ocupado || salvando || carregando || Boolean(editor) || conflito} onClick={() => alterarComposicao()}>Cancelar solicitação</button>}
        </div>
        <div className="rh-pagamento-toolbar">
          <label>Competência<input disabled={ocupado || !editavel || Boolean(form.titulos?.length)} className="form-control" type="month" value={form.competencia} onChange={e => alterar({ competencia: e.target.value, linhas: linhas.map(l => ({ ...l, conferido_dp: false, conferido_obra: false })) })} /></label>
          <label>Vencimento<input disabled={ocupado || !editavel} className="form-control" type="date" value={form.data_vencimento} onChange={e => alterar({ data_vencimento: e.target.value, linhas: linhas.map(l => ({ ...l, conferido_dp: false, conferido_obra: false })) })} /></label>
          <label>Aplicar aos selecionados<select disabled={ocupado || !editavel} aria-label="Aplicar aos selecionados" className="form-control" defaultValue="" onChange={e => {
            const valor = e.target.value;
            if (valor === '100') alterar({ linhas: linhas.map(l => l.selecionado && linhaEditavel(l) && !l.vale ? { ...l, parcela_40: false, parcela_50: false, parcela_60: false, conferido_dp: false, conferido_obra: false } : l) });
            else if (valor === 'conferir') todos(dp ? 'conferido_dp' : 'conferido_obra', true);
            else if (valor) alterar({ linhas: linhas.map(l => l.selecionado && linhaEditavel(l) && l.forma_calculo_gerencial !== 'DIARIA' && !l.vale ? { ...l, parcela_40: valor === '40', parcela_50: valor === '50', parcela_60: valor === '60', conferido_dp: false, conferido_obra: false } : l) });
            e.target.value = '';
          }}><option value="">Selecione</option><option value="40">40%</option><option value="50">50%</option><option value="60">60%</option><option value="100">100%</option><option value="conferir">Conferido</option></select></label>
          <label>Pesquisar<input className="form-control" type="search" value={busca} onChange={e => setBusca(e.target.value)} /></label>
          {editaveis.length > 0 && <button type="button" className="btn btn-outline btn-sm" disabled={ocupado || salvando || carregando || Boolean(editor) || conflito}
            onClick={atualizarCadastro}>Atualizar cadastro</button>}
        </div>
        {linhas.some(l => l.cadastro_atualizado && linhaEditavel(l)) && <p role="status" className="app-note">Salário/diária e dados de cadastro atualizados. Confira novamente as linhas alteradas. Pagamentos já enviados não foram modificados.</p>}
        {resposta.avisos?.length > 0 && <details className="rh-pagamento-aviso"><summary>Pagamentos anteriores nesta competência ({resposta.avisos.length})</summary>
          <ul>{resposta.avisos.map(a => <li key={a.id}>{a.codigo} · {a.status} · {a.salario_oculto ? 'Valor restrito ao DP' : moeda(a.valor_original)}</li>)}</ul></details>}
        <fieldset disabled={ocupado || Boolean(editor)} className="rh-pagamento-table-wrap">
          <table className="rh-pagamento-tabela"><thead><tr>
            <th><input aria-label="Selecionar todos" type="checkbox" disabled={!editaveis.length} checked={editaveis.length > 0 && selecionados.length === editaveis.length} onChange={e => todos('selecionado', e.target.checked)} /></th>
            <th>Colaborador</th><th>Conferido</th><th>40%</th><th>50%</th><th>60%</th><th>100%</th><th>Vale</th><th>Salário bruto / Valor</th><th>Acréscimos</th><th>Descontos</th><th>Líquido</th><th>Dias</th><th>Faltas</th><th>Dados para pagamento</th><th>Observações</th>
          </tr></thead><tbody>{visiveis.map(l => {
            const bloqueada = !linhaEditavel(l);
            const estado = estadoLinha(l);
            const calculo = valoresDaLinha(l, ['ENVIADO', 'CANCELADO'].includes(estado));
            const titulosLinha = form.titulos?.filter(t => !t.cancelado && (Number(t.colaborador_id) === Number(l.colaborador_id)
              || t.origens?.some(o => Number(o.colaborador_id) === Number(l.colaborador_id)))) || [];
            const comBaixa = titulosLinha.some(t => resposta.pagamentos_financeiros?.some(f => Number(f.id) === Number(t.id)
              && (f.status !== 'ABERTO' || Number(f.valor_baixado) > 0)));
            const diaria = l.forma_calculo_gerencial === 'DIARIA';
            const check = (campo, rotulo, disabled = false) => <input type="checkbox" aria-label={`${rotulo}: ${l.nome}`} disabled={disabled || bloqueada || (l.vale && campo.startsWith('parcela_'))} checked={Boolean(l[campo])} onChange={e => linhaAlterar(l.colaborador_id, { [campo]: e.target.checked }, campo.startsWith('conferido'))} />;
            const numero = (campo, rotulo, max) => <input disabled={bloqueada} className="form-control" aria-label={`${rotulo}: ${l.nome}`} type="number" min="0" max={max} step="1" value={l[campo]} onChange={e => linhaAlterar(l.colaborador_id, { [campo]: e.target.value })} />;
            const ajuste = (campo, rotulo) => <input disabled={bloqueada} className="form-control rh-pagamento-moeda" aria-label={`${rotulo}: ${l.nome}`} type="text" inputMode="numeric"
              value={formatCurrencyInput(l[campo] || 0, { emptyZero: false })} onFocus={e => e.target.select()}
              onChange={e => {
                // A mascara e apenas visual: calculo/API recebem numero, inclusive ao apagar.
                const valor = parseCurrencyInput(normalizeCurrencyTyping(e.target.value));
                linhaAlterar(l.colaborador_id, { [campo]: valor, ...(campo === 'descontos' && valor !== Number(l.descontos || 0)
                  ? { reembolso: null, desconto_sem_reembolso: true } : {}) });
              }} />;
            return <tr key={l.colaborador_id} data-selecionado={l.selecionado} data-pagamento-estado={estado}>
              <td>{check('selecionado', 'Selecionar')}</td><td><strong>{l.nome}</strong><small>{l.salario_oculto ? 'Salário restrito ao DP' : l.vale ? 'Pagamento de Vale' : diaria ? `${moeda(l.valor_diaria)} / dia` : `${moeda(l.salario_base)} · ${calculo.percentual}%`}</small>
                {estado !== 'PENDENTE' && <small className="rh-pagamento-estado">{comBaixa ? 'Pagamento processado' : { ENVIADO: 'Enviado para pagamento', EM_EDICAO: 'Em edição pelo DP', CANCELADO: 'Cancelado' }[estado]}</small>}
                {dp && resposta.pode_enviar_fila && !comBaixa && ['ENVIADO', 'EM_EDICAO'].includes(estado) && <div className="rh-pagamento-acoes">
                  {estado === 'ENVIADO' && <button type="button" className="btn btn-outline btn-sm" onClick={() => revisar(l, 'EDITAR')}>Editar e reenviar</button>}
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => revisar(l, 'CANCELAR')}>Cancelar pagamento</button>
                </div>}
                {resposta.pode_gerenciar_solicitacao && resposta.solicitacao.id && !comBaixa && <button type="button" className="btn btn-outline btn-sm"
                  aria-label={`Remover colaborador: ${l.nome}`} disabled={salvando || conflito}
                  onClick={() => alterarComposicao(l)}>Remover da solicitação</button>}</td>
              <td>{check(dp ? 'conferido_dp' : 'conferido_obra', 'Conferido', !l.selecionado)}</td><td>{check('parcela_40', '40%', diaria)}</td><td>{check('parcela_50', '50%', diaria)}</td><td>{check('parcela_60', '60%', diaria)}</td>
              <td><input type="checkbox" aria-label={`100%: ${l.nome}`} disabled={diaria || bloqueada || l.vale} checked={!l.vale && !diaria && calculo.percentual === 100} onChange={() => linhaAlterar(l.colaborador_id, { parcela_40: false, parcela_50: false, parcela_60: false })} /></td>
              <td>{check('vale', 'Vale')}</td>
              <td>{l.vale ? ajuste('valor_vale', 'Valor') : l.salario_oculto ? 'Restrito ao DP' : moeda(calculo.bruto)}</td><td>{!l.vale && ajuste('acrescimos', 'Acréscimos')}</td><td>{!l.vale && ajuste('descontos', 'Descontos')}{!l.vale && Number(l.descontos) > 0 && <button disabled={bloqueada} type="button" className="rh-pagamento-link" onClick={() => setEditor({ id: l.colaborador_id, tipo: 'reembolso', dados: {
                ...(l.reembolso || { modo_recebimento: 'PIX', responsavel_id: '', favorecido_nome: '', favorecido_documento: '' }),
                valor: Number(l.reembolso?.valor ?? l.descontos)
              } })}>{l.reembolso ? 'Reembolso de vale' : 'Solicitar reembolso'}</button>}</td>
              <td className={calculo.liquido < 0 ? 'text-red-700' : ''}><strong>{l.salario_oculto ? 'Restrito ao DP' : moeda(calculo.liquido)}</strong></td><td>{!l.vale && numero('dias', 'Dias', 31)}</td><td>{!l.vale && numero('faltas', 'Faltas', 31)}</td>
              <td><button disabled={bloqueada} type="button" className="btn btn-outline btn-sm" onClick={() => setEditor({ id: l.colaborador_id, tipo: 'conta', dados: contaPagamentoInputs(l) })}>{l.modo_recebimento === 'CONTA_SALARIO' ? 'Conta salário' : l.modo_recebimento === 'OUTRA_CONTA' ? 'Outra conta' : l.modo_recebimento === 'DINHEIRO' ? 'Dinheiro' : 'Pix'}</button>{l.modo_recebimento !== 'DINHEIRO' && <small className="rh-pagamento-dados" title={l.modo_recebimento === 'PIX' ? l.chave_pix : `${l.banco || '—'} · ${l.agencia || '—'} · ${l.conta || '—'}`}>{l.modo_recebimento === 'PIX' ? l.chave_pix : `Banco ${l.banco || '—'} · Ag. ${l.agencia || '—'} · Conta ${l.conta || '—'}`}</small>}</td>
              <td><input disabled={bloqueada} className="form-control" aria-label={`Observações: ${l.nome}`} value={l.observacoes || ''} maxLength={1000} onChange={e => linhaAlterar(l.colaborador_id, { observacoes: e.target.value })} /></td>
            </tr>;
          })}</tbody></table>
          {!visiveis.length && <p className="app-note">Nenhum colaborador encontrado.</p>}
        </fieldset>
        {linhasRemovidas.length > 0 && <details className="app-note"><summary>Colaboradores removidos ({linhasRemovidas.length})</summary>
          <ul>{linhasRemovidas.map(l => <li key={l.colaborador_id}>{l.nome} · {l.motivo_remocao}</li>)}</ul>
        </details>}
        {!concluido && reembolsos.length > 0 && <div className="rh-pagamento-reembolsos">{reembolsos.map(g => <details key={g.chave}><summary>Reembolso de vale · {g.nome} · {moeda(g.valor)} · {g.origens.length} colaborador(es)</summary><ul>{g.origens.map(o => <li key={o.colaborador_id}>{o.nome} · {moeda(o.valor)}</li>)}</ul></details>)}</div>}
        {form.titulos?.length > 0 && <details className="rh-pagamento-titulos" open={concluido}><summary>Títulos desta solicitação ({form.titulos.length})</summary><ul>{form.titulos.map(t => <li key={t.id}>{t.codigo} · {t.tipo === 'REEMBOLSO' ? 'Reembolso' : t.natureza === 'VALE' ? 'Pagamento de Vale' : 'Salário'} · {t.salario_oculto ? 'Valor restrito ao DP' : moeda(t.valor)}{t.cancelado ? ' · Cancelado' : ''}{t.origens?.length > 0 && <details><summary>Ver colaboradores do reembolso</summary><ul>{t.origens.map(o => <li key={o.colaborador_id}>{o.nome} · {o.salario_oculto ? 'Valor restrito ao DP' : moeda(o.valor)}</li>)}</ul></details>}</li>)}</ul></details>}
        <div className="rh-pagamento-rodape"><span role="status">{salvando ? 'Salvando…' : ocupado ? 'Processando…' : sujo ? 'Alterações pendentes' : 'Salvo'} · {resumo.length} {resumoEnviado ? 'enviado(s)' : 'selecionado(s)'} · <strong>{resumo.some(l => l.salario_oculto) ? 'Valor restrito ao DP' : moeda(resumo.reduce((s, l) => s + valoresDaLinha(l, estadoLinha(l) === 'ENVIADO').liquido, 0))}</strong></span>
          {editavel && editaveis.length > 0 && <div>{resposta.pode_excluir_rascunho && <button type="button" className="btn btn-outline btn-sm" disabled={ocupado} onClick={excluirRascunho}>Excluir rascunho</button>}<button type="button" className="btn btn-outline btn-sm" disabled={ocupado || (!sujo && Boolean(resposta.solicitacao.id))} onClick={() => operacao(() => salvar(true, true))}>Salvar</button><button type="button" className="btn btn-primary btn-sm" disabled={ocupado || !selecionados.length || (dp && !resposta.pode_enviar_fila)} onClick={enviar}>{dp ? 'Enviar para a fila' : 'Solicitar pagamento'}</button></div>}
        </div>
        {!resposta.solicitacao.id && <p className="form-hint">Prévia sem rascunho salvo. Salvar ou marcar como Conferido cria o rascunho; fechar esta prévia não grava uma solicitação.</p>}
        {dp && editavel && !resposta.pode_enviar_fila && <p className="app-note">O envio exige as permissões de gerar títulos e preparar a fila de pagamentos.</p>}
      </>}
    </div>
    {editor && <OverlayModal largura="660px" rotulo={editor.tipo === 'reembolso' ? 'Reembolso de vale' : 'Dados de recebimento'} onFechar={() => setEditor(null)}>
      <div className="rh-local-modal-cabecalho"><h3 className="app-bloco-titulo">{editor.tipo === 'reembolso' ? 'Reembolso de vale' : 'Dados de recebimento'}</h3><button className="btn btn-outline btn-sm" onClick={() => setEditor(null)}>Voltar</button></div>
      <div className="rh-local-modal-corpo">{editor.tipo === 'reembolso' && <>
        <p><strong>{linhas.find(l => Number(l.colaborador_id) === Number(editor.id))?.nome} · Desconto: {moeda(linhas.find(l => Number(l.colaborador_id) === Number(editor.id))?.descontos)}</strong></p>
        <div className="rh-pagamento-conta">
          <label>Valor do reembolso<input aria-label="Valor do reembolso" className="form-control rh-pagamento-moeda" type="text" inputMode="numeric"
            value={formatCurrencyInput(editor.dados.valor || 0, { emptyZero: false })}
            aria-invalid={Boolean(editor.erroValor)} aria-describedby={editor.erroValor ? 'rh-reembolso-erro' : undefined}
            onFocus={e => e.target.select()} onChange={e => {
              const valor = parseCurrencyInput(normalizeCurrencyTyping(e.target.value));
              setEditor(v => ({ ...v, erroValor: '', dados: { ...v.dados, valor } }));
            }} />
            {editor.erroValor && <span id="rh-reembolso-erro" role="alert" className="text-red-700">{editor.erroValor}</span>}
          </label>
          <label>Responsável<select aria-label="Responsável" className="form-control" value={editor.dados.responsavel_id} onChange={e => {
            const pessoa = resposta.responsaveis.find(r => Number(r.id) === Number(e.target.value));
            const existente = linhas.find(l => l.reembolso && Number(l.reembolso.responsavel_id) === Number(e.target.value))?.reembolso;
            setEditor(v => ({ ...v, dados: { modo_recebimento: 'PIX', favorecido_documento: '', chave_pix: '', banco: '', agencia: '', conta: '', tipo_conta: '',
              ...existente, valor: v.dados.valor, responsavel_id: Number(e.target.value), favorecido_nome: pessoa?.nome || '' } }));
          }}><option value="">Selecione</option>{resposta.responsaveis.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></label>
        </div>
      </>}
        <DadosRecebimento dados={{ ...editor.dados,
          ...(editor.tipo !== 'reembolso' && editor.dados.modo_recebimento === 'CONTA_SALARIO'
            ? linhas.find(l => Number(l.colaborador_id) === Number(editor.id))?.conta_salario || {} : {}),
          conta_salario: linhas.find(l => Number(l.colaborador_id) === Number(editor.id))?.conta_salario,
          pix_cadastro: editor.tipo !== 'reembolso' ? linhas.find(l => Number(l.colaborador_id) === Number(editor.id))?.pix_cadastro : null }} reembolso={editor.tipo === 'reembolso'} alterar={patch => setEditor(v => ({ ...v, dados: { ...v.dados, ...patch } }))} />
        {editor.tipo !== 'reembolso' && <button type="button" className="btn btn-outline btn-sm" onClick={() => {
          const pix = linhas.find(l => Number(l.colaborador_id) === Number(editor.id))?.pix_cadastro;
          if (pix) setEditor(v => ({ ...v, dados: { ...v.dados, ...pix } }));
        }}>Usar Pix do cadastro</button>}
        <div className="rh-pagamento-rodape"><button className="btn btn-outline btn-sm" onClick={() => setEditor(null)}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={() => {
            if (editor.tipo === 'reembolso' && !editor.dados.responsavel_id) { avisar.erro('Selecione o responsável pelo reembolso.'); return; }
            if (editor.tipo === 'reembolso') {
              const desconto = Number(linhas.find(l => Number(l.colaborador_id) === Number(editor.id))?.descontos || 0);
              const valor = Number(editor.dados.valor);
              if (!Number.isFinite(valor) || valor <= 0 || valor > desconto) {
                setEditor(v => ({ ...v, erroValor: 'Informe um valor maior que zero e até o valor do desconto.' }));
                return;
              }
            }
            const conta = Object.fromEntries(['modo_recebimento', 'favorecido_nome', 'favorecido_documento', 'chave_pix', 'banco', 'agencia', 'conta', 'tipo_conta'].map(k => [k, editor.dados[k] || '']));
            linhaAlterar(editor.id, editor.tipo === 'reembolso' ? { reembolso: editor.dados, desconto_sem_reembolso: false }
              : { ...conta, recebimento_personalizado: conta.modo_recebimento !== 'CONTA_SALARIO'
                && (conta.modo_recebimento !== 'PIX' || Object.keys(conta).some(k => String(conta[k]) !== String(linhas.find(l => Number(l.colaborador_id) === Number(editor.id))?.pix_cadastro?.[k] || ''))) }); setEditor(null);
          }}>Confirmar</button></div>
      </div>
    </OverlayModal>}
    {elementoConfirmacao}
  </OverlayModal>;
}
