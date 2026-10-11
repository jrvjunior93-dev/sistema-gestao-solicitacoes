import { useEffect, useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import { Avisos, useAvisos, useConfirmacao } from '../padrao';
import { pagamentoRhSolicitacao } from '../../services/rhDp';
import { formatCurrencyInput, normalizeCurrencyTyping, parseCurrencyInput } from '../../utils/formatters';
import '../../styles/rh-pagamento-solicitacao.css';

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const arredondar = v => Math.round((v + Number.EPSILON) * 100) / 100;
export function valoresDaLinha(l, concluido = false) {
  const diaria = l.forma_calculo_gerencial === 'DIARIA';
  const percentual = diaria || Boolean(l.parcela_40) === Boolean(l.parcela_60) ? 100 : l.parcela_40 ? 40 : 60;
  // Pagamentos ja gerados conservam o snapshot aprovado, mesmo apos uma mudanca de regra.
  if (concluido && l.bruto != null && l.liquido != null
    && Number.isFinite(Number(l.bruto)) && Number.isFinite(Number(l.liquido))) {
    return { percentual, bruto: Number(l.bruto), liquido: Number(l.liquido) };
  }
  const bruto = arredondar(diaria ? Number(l.valor_diaria || 0) * Number(l.dias || 0)
    : Number(l.salario_base || 0) * percentual / 100);
  return { percentual, bruto, liquido: arredondar(bruto + Number(l.acrescimos || 0) - Number(l.descontos || 0)) };
}

function DadosRecebimento({ dados, alterar, reembolso = false }) {
  return <div className="rh-pagamento-conta">
    <label>Recebimento<select aria-label="Recebimento" className="form-control" value={dados.modo_recebimento || 'PIX'}
      onChange={e => alterar({ ...(e.target.value === 'CONTA_SALARIO' ? dados.conta_salario || {} : {}), modo_recebimento: e.target.value })}>
      <option value="PIX">Pix</option>{!reembolso && <option value="CONTA_SALARIO">Conta salário</option>}
      <option value="OUTRA_CONTA">Outra conta</option></select></label>
    {dados.modo_recebimento !== 'CONTA_SALARIO' && <>
      <label>Favorecido<input className="form-control" value={dados.favorecido_nome || ''} onChange={e => alterar({ favorecido_nome: e.target.value })} /></label>
      <label>CPF/CNPJ<input className="form-control" value={dados.favorecido_documento || ''} maxLength={20} onChange={e => alterar({ favorecido_documento: e.target.value })} /></label>
    </>}
    {(dados.modo_recebimento || 'PIX') === 'PIX' ? <label className="rh-pagamento-conta-chave">Chave Pix / Copia e Cola
      <textarea aria-label="Chave Pix / Copia e Cola" className="form-control" rows={2} maxLength={8192} value={dados.chave_pix || ''} onChange={e => alterar({ chave_pix: e.target.value })} /></label>
      : <>{[['banco', 'Banco (código)'], ['agencia', 'Agência'], ['conta', 'Conta'], ['tipo_conta', 'Tipo de conta']].map(([campo, rotulo]) =>
        <label key={campo}>{rotulo}<input className="form-control" value={dados[campo] || ''}
          readOnly={dados.modo_recebimento === 'CONTA_SALARIO'} onChange={e => alterar({ [campo]: e.target.value })} /></label>)}</>}
  </div>;
}

export default function RhDpPagamentoModal({ local, locais = [], colaborador, colaboradorIds, solicitacaoId, onFechar, aoEnviar }) {
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [resposta, setResposta] = useState(null);
  const [form, setForm] = useState(null);
  const [localId, setLocalId] = useState(local?.id || '');
  const [ocupado, setOcupado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [editor, setEditor] = useState(null);
  const [busca, setBusca] = useState('');
  const trava = useRef(false);
  const atual = useRef(null);
  const sujoRef = useRef(false);
  const iniciarPromise = useRef(null);
  const falhaAutomatica = useRef(false);
  const salvamentoPromise = useRef(null);
  const respostaRef = useRef(null);
  const montado = useRef(true);
  atual.current = form; sujoRef.current = sujo;
  const dp = Boolean(resposta?.pode_conferir);
  const concluido = resposta?.solicitacao?.situacao === 'APROVADA';
  const editavel = resposta && (resposta.solicitacao.situacao === 'RASCUNHO' || (dp && resposta.solicitacao.situacao === 'ABERTA'));
  function receber(result) {
    respostaRef.current = result; atual.current = result.solicitacao.dados_json; sujoRef.current = false;
    setResposta(result); setForm(atual.current); setSujo(false);
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
      : pagamentoRhSolicitacao('', { method: 'POST', data: {
        obra_id: Number(localId), colaborador_id: colaborador?.id, colaborador_ids: colaboradorIds
      } });
    iniciarPromise.current.then(result => { if (ativo) receber(result); })
      .catch(e => { if (ativo) avisar.erro(e.message); iniciarPromise.current = null; })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [solicitacaoId, localId, colaborador?.id, colaboradorIds]); // eslint-disable-line react-hooks/exhaustive-deps
  function alterar(patch) {
    falhaAutomatica.current = false;
    atual.current = { ...atual.current, ...patch }; sujoRef.current = true;
    setForm(atual.current); setSujo(true);
  }
  function linhaAlterar(id, patch, conferindo = false) {
    alterar({ linhas: atual.current.linhas.map(l => Number(l.colaborador_id) === Number(id)
      ? { ...l, ...(!conferindo ? { [dp ? 'conferido_dp' : 'conferido_obra']: false } : {}), ...patch } : l) });
  }
  async function salvar(completo = false) {
    // Somente uma gravacao em voo; fechar/enviar aguardam e salvam tambem edicoes posteriores.
    if (salvamentoPromise.current) await salvamentoPromise.current;
    do {
      if (!sujoRef.current || !montado.current) return respostaRef.current;
      const snapshot = atual.current;
      const gravacao = (async () => {
        setSalvando(true);
        try {
          const result = await pagamentoRhSolicitacao(`/${respostaRef.current.solicitacao.id}`, { method: 'PUT', data: {
            ...snapshot, linhas: snapshot.linhas.map(l => ({ ...l,
              acrescimos: Number(l.acrescimos || 0), descontos: Number(l.descontos || 0),
              conferir_alteracoes: Boolean(l.conferido_dp) }))
          } });
          if (!montado.current) return result;
          // Deploy desencontrado: backend antigo ignora o valor e reembolsa o desconto inteiro.
          const divergente = snapshot.linhas.some(l => {
            if (!l.reembolso || l.reembolso.valor == null) return false;
            const salva = result.solicitacao.dados_json.linhas.find(s => Number(s.colaborador_id) === Number(l.colaborador_id));
            return !salva?.reembolso || Number(salva.reembolso.valor ?? salva.descontos) !== Number(l.reembolso.valor);
          });
          if (divergente) throw new Error('O servidor não confirmou o valor do reembolso. Atualize o backend e reabra o pagamento.');
          const editadoDuranteGravacao = atual.current !== snapshot;
          respostaRef.current = result; setResposta(result);
          // Nao substituir os inputs: mantem foco, texto em digitacao e novas edicoes.
          atual.current = { ...atual.current, revisao: result.solicitacao.dados_json.revisao,
            salvo_por: result.solicitacao.dados_json.salvo_por, salvo_em: result.solicitacao.dados_json.salvo_em };
          sujoRef.current = editadoDuranteGravacao;
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
    if (!sujo || !resposta || !editavel || ocupado || salvando || editor || falhaAutomatica.current) return undefined;
    const timer = setTimeout(() => salvar().catch(e => {
      if (montado.current) { falhaAutomatica.current = true; avisar.erro(e.message); }
    }), 900);
    return () => clearTimeout(timer);
  }, [sujo, form, ocupado, salvando, editor]); // eslint-disable-line react-hooks/exhaustive-deps
  async function fechar() {
    if (trava.current || carregando) return;
    await operacao(async () => { await salvar(true); onFechar(); });
  }
  async function enviar() {
    await operacao(async () => {
      const result = await salvar(true);
      const selecionados = result.solicitacao.dados_json.linhas.filter(l => l.selecionado);
      if (!selecionados.length) throw new Error('Selecione os colaboradores do pagamento.');
      const { ok } = await confirmar({ titulo: dp ? 'Enviar pagamentos para a fila' : 'Solicitar pagamento ao DP',
        mensagem: `${selecionados.length} colaborador(es) · ${moeda(selecionados.reduce((s, l) => s + valoresDaLinha(l).liquido, 0))}${result.avisos?.length ? '\nHá pagamentos anteriores nesta competência. Esta solicitação será independente.' : ''}`,
        rotuloConfirmar: dp ? 'Enviar para a fila' : 'Solicitar pagamento' });
      if (!ok) return;
      const enviado = await pagamentoRhSolicitacao(`/${result.solicitacao.id}/enviar`, { method: 'POST', data: { revisao: result.solicitacao.dados_json.revisao } });
      receber(enviado); aoEnviar?.(enviado);
      avisar.sucesso(dp ? 'Títulos gerados e enviados para a fila.' : 'Pagamento solicitado ao DP.');
    });
  }
  const linhas = form?.linhas || [];
  const selecionados = linhas.filter(l => l.selecionado);
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
      if (campo !== 'selecionado' && !l.selecionado) return l;
      return { ...l, [campo]: valor,
        ...(!campo.startsWith('conferido') ? { [dp ? 'conferido_dp' : 'conferido_obra']: false } : {}) };
    }) });
  }
  return <OverlayModal largura="1480px" rotulo="Solicitar pagamento" onFechar={editor ? () => setEditor(null) : fechar}>
    <div data-modal="cabecalho" className="rh-local-modal-cabecalho">
      <div><h2 className="app-bloco-titulo">{dp ? 'Conferir pagamento' : 'Solicitar pagamento'}{resposta ? ` · ${resposta.solicitacao.codigo}` : ''}</h2>
        <p className="app-note">{local?.nome || locais.find(l => Number(l.id) === Number(localId))?.nome || 'Obra / Centro de custo'}</p></div>
      <button type="button" className="btn btn-outline btn-sm" disabled={ocupado || carregando} onClick={fechar}>Fechar</button>
    </div>
    <div className="rh-local-modal-corpo rh-pagamento-solicitacao">
      <Avisos avisos={avisos} aoFechar={fecharAviso} />
      {!localId && !solicitacaoId && <label>Obra / Centro de custo<select aria-label="Obra / Centro de custo" className="form-control" value={localId} onChange={e => setLocalId(e.target.value)}>
        <option value="">Selecione</option>{locais.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nome}</option>)}</select></label>}
      {carregando && <p role="status">Carregando pagamento…</p>}
      {form && <>
        <div className="rh-pagamento-toolbar">
          <label>Competência<input disabled={ocupado || !editavel} className="form-control" type="month" value={form.competencia} onChange={e => alterar({ competencia: e.target.value, linhas: linhas.map(l => ({ ...l, conferido_dp: false, conferido_obra: false })) })} /></label>
          <label>Vencimento<input disabled={ocupado || !editavel} className="form-control" type="date" value={form.data_vencimento} onChange={e => alterar({ data_vencimento: e.target.value, linhas: linhas.map(l => ({ ...l, conferido_dp: false, conferido_obra: false })) })} /></label>
          <label>Aplicar aos selecionados<select disabled={ocupado || !editavel} aria-label="Aplicar aos selecionados" className="form-control" defaultValue="" onChange={e => {
            const valor = e.target.value;
            if (valor === '100') alterar({ linhas: linhas.map(l => l.selecionado ? { ...l, parcela_40: false, parcela_60: false, conferido_dp: false, conferido_obra: false } : l) });
            else if (valor === 'conferir') todos(dp ? 'conferido_dp' : 'conferido_obra', true);
            else if (valor) alterar({ linhas: linhas.map(l => l.selecionado && l.forma_calculo_gerencial !== 'DIARIA' ? { ...l, parcela_40: valor === '40', parcela_60: valor === '60', conferido_dp: false, conferido_obra: false } : l) });
            e.target.value = '';
          }}><option value="">Selecione</option><option value="40">40%</option><option value="60">60%</option><option value="100">100%</option><option value="conferir">Conferido</option></select></label>
          <label>Pesquisar<input className="form-control" type="search" value={busca} onChange={e => setBusca(e.target.value)} /></label>
        </div>
        {resposta.avisos?.length > 0 && <details className="rh-pagamento-aviso"><summary>Pagamentos anteriores nesta competência ({resposta.avisos.length})</summary>
          <ul>{resposta.avisos.map(a => <li key={a.id}>{a.codigo} · {a.status} · {moeda(a.valor_original)}</li>)}</ul></details>}
        <fieldset disabled={ocupado || !editavel || Boolean(editor)} className="rh-pagamento-table-wrap">
          <table className="rh-pagamento-tabela"><thead><tr>
            <th><input aria-label="Selecionar todos" type="checkbox" checked={linhas.length > 0 && selecionados.length === linhas.length} onChange={e => todos('selecionado', e.target.checked)} /></th>
            <th>Colaborador</th><th>Conferido</th><th>40%</th><th>60%</th><th>100%</th><th>Salário bruto</th><th>Acréscimos</th><th>Descontos</th><th>Líquido</th><th>Dias</th><th>Faltas</th><th>Dados para pagamento</th><th>Observações</th>
          </tr></thead><tbody>{visiveis.map(l => {
            const calculo = valoresDaLinha(l, concluido);
            const diaria = l.forma_calculo_gerencial === 'DIARIA';
            const check = (campo, rotulo, disabled = false) => <input type="checkbox" aria-label={`${rotulo}: ${l.nome}`} disabled={disabled} checked={Boolean(l[campo])} onChange={e => linhaAlterar(l.colaborador_id, { [campo]: e.target.checked }, campo.startsWith('conferido'))} />;
            const numero = (campo, rotulo, max) => <input className="form-control" aria-label={`${rotulo}: ${l.nome}`} type="number" min="0" max={max} step="1" value={l[campo]} onChange={e => linhaAlterar(l.colaborador_id, { [campo]: e.target.value })} />;
            const ajuste = (campo, rotulo) => <input className="form-control rh-pagamento-moeda" aria-label={`${rotulo}: ${l.nome}`} type="text" inputMode="numeric"
              value={formatCurrencyInput(l[campo] || 0, { emptyZero: false })} onFocus={e => e.target.select()}
              onChange={e => {
                // A mascara e apenas visual: calculo/API recebem numero, inclusive ao apagar.
                const valor = parseCurrencyInput(normalizeCurrencyTyping(e.target.value));
                linhaAlterar(l.colaborador_id, { [campo]: valor, ...(campo === 'descontos' && valor !== Number(l.descontos || 0)
                  ? { reembolso: null, desconto_sem_reembolso: true } : {}) });
              }} />;
            return <tr key={l.colaborador_id} data-selecionado={l.selecionado}>
              <td>{check('selecionado', 'Selecionar')}</td><td><strong>{l.nome}</strong><small>{diaria ? `${moeda(l.valor_diaria)} / dia` : `${moeda(l.salario_base)} · ${calculo.percentual}%`}</small></td>
              <td>{check(dp ? 'conferido_dp' : 'conferido_obra', 'Conferido', !l.selecionado)}</td><td>{check('parcela_40', '40%', diaria)}</td><td>{check('parcela_60', '60%', diaria)}</td>
              <td><input type="checkbox" aria-label={`100%: ${l.nome}`} disabled={diaria} checked={!diaria && calculo.percentual === 100} onChange={() => linhaAlterar(l.colaborador_id, { parcela_40: false, parcela_60: false })} /></td>
              <td>{moeda(calculo.bruto)}</td><td>{ajuste('acrescimos', 'Acréscimos')}</td><td>{ajuste('descontos', 'Descontos')}{Number(l.descontos) > 0 && <button type="button" className="rh-pagamento-link" onClick={() => setEditor({ id: l.colaborador_id, tipo: 'reembolso', dados: {
                ...(l.reembolso || { modo_recebimento: 'PIX', responsavel_id: '', favorecido_nome: '', favorecido_documento: '' }),
                valor: Number(l.reembolso?.valor ?? l.descontos)
              } })}>{l.reembolso ? 'Reembolso de vale' : 'Solicitar reembolso'}</button>}</td>
              <td className={calculo.liquido < 0 ? 'text-red-700' : ''}><strong>{moeda(calculo.liquido)}</strong></td><td>{numero('dias', 'Dias', 31)}</td><td>{numero('faltas', 'Faltas', 31)}</td>
              <td><button type="button" className="btn btn-outline btn-sm" onClick={() => setEditor({ id: l.colaborador_id, tipo: 'conta', dados: { ...l } })}>{l.modo_recebimento === 'CONTA_SALARIO' ? 'Conta salário' : l.modo_recebimento === 'OUTRA_CONTA' ? 'Outra conta' : 'Pix'}</button><small className="rh-pagamento-dados" title={l.modo_recebimento === 'PIX' ? l.chave_pix : `${l.banco || '—'} · ${l.agencia || '—'} · ${l.conta || '—'}`}>{l.modo_recebimento === 'PIX' ? l.chave_pix : `Banco ${l.banco || '—'} · Ag. ${l.agencia || '—'} · Conta ${l.conta || '—'}`}</small></td>
              <td><input className="form-control" aria-label={`Observações: ${l.nome}`} value={l.observacoes || ''} maxLength={1000} onChange={e => linhaAlterar(l.colaborador_id, { observacoes: e.target.value })} /></td>
            </tr>;
          })}</tbody></table>
          {!visiveis.length && <p className="app-note">Nenhum colaborador encontrado.</p>}
        </fieldset>
        {!concluido && reembolsos.length > 0 && <div className="rh-pagamento-reembolsos">{reembolsos.map(g => <details key={g.chave}><summary>Reembolso de vale · {g.nome} · {moeda(g.valor)} · {g.origens.length} colaborador(es)</summary><ul>{g.origens.map(o => <li key={o.colaborador_id}>{o.nome} · {moeda(o.valor)}</li>)}</ul></details>)}</div>}
        {concluido && <ul className="rh-pagamento-titulos">{form.titulos?.map(t => <li key={t.id}>{t.codigo} · {t.tipo === 'REEMBOLSO' ? 'Reembolso' : 'Salário'} · {moeda(t.valor)}{t.origens?.length > 0 && <details><summary>Ver colaboradores do reembolso</summary><ul>{t.origens.map(o => <li key={o.colaborador_id}>{o.nome} · {moeda(o.valor)}</li>)}</ul></details>}</li>)}</ul>}
        <div className="rh-pagamento-rodape"><span role="status">{salvando ? 'Salvando…' : ocupado ? 'Processando…' : sujo ? 'Alterações pendentes' : 'Salvo'} · {selecionados.length} selecionado(s) · <strong>{moeda(selecionados.reduce((s, l) => s + valoresDaLinha(l, concluido).liquido, 0))}</strong></span>
          {editavel && <div><button type="button" className="btn btn-outline btn-sm" disabled={ocupado || !sujo} onClick={() => operacao(() => salvar(true))}>Salvar</button><button type="button" className="btn btn-primary btn-sm" disabled={ocupado || !selecionados.length || (dp && !resposta.pode_enviar_fila)} onClick={enviar}>{dp ? 'Enviar para a fila' : 'Solicitar pagamento'}</button></div>}
        </div>
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
        <DadosRecebimento dados={editor.dados} reembolso={editor.tipo === 'reembolso'} alterar={patch => setEditor(v => ({ ...v, dados: { ...v.dados, ...patch } }))} />
        <div className="rh-pagamento-rodape"><button className="btn btn-outline btn-sm" onClick={() => setEditor(null)}>Cancelar</button>
          {editor.tipo === 'reembolso' && <button className="btn btn-outline btn-sm" onClick={() => { linhaAlterar(editor.id, { reembolso: null, desconto_sem_reembolso: true }); setEditor(null); }}>Sem reembolso</button>}
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
            linhaAlterar(editor.id, editor.tipo === 'reembolso' ? { reembolso: editor.dados, desconto_sem_reembolso: false } : conta); setEditor(null);
          }}>Confirmar</button></div>
      </div>
    </OverlayModal>}
    {elementoConfirmacao}
  </OverlayModal>;
}
