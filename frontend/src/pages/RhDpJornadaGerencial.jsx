import { useEffect, useMemo, useRef, useState } from 'react';
import { Avisos, useAvisos } from '../components/padrao';
import { useAuth } from '../contexts/AuthContext';
import { getMinhasObras, getObras } from '../services/obras';
import { colaboradoresParaJornadaGerencialRh, registrarJornadaGerencialRh } from '../services/rhDp';
import { isBusinessAdmin } from '../utils/acessoProduto';
import { userHasSetorCapability } from '../utils/setor';
import { formatCurrencyInput, parseCurrencyInput } from '../utils/formatters';
import './RhDpJornadaGerencial.css';

const COMPETENCIA_ATUAL = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo'
}).format(new Date()).slice(0, 7);

const INTENCOES = {
  ADIANTAMENTO_40: 'Adiantamento · 40%',
  SALDO_60: 'Saldo · 60%',
  PROPORCIONAL: 'Proporcional aos dias',
  DIARIA: 'Diárias'
};

function linhaInicial(item) {
  return {
    ...item,
    selecionado: false,
    intencao_pagamento: item.forma_calculo_gerencial === 'DIARIA' ? 'DIARIA' : '',
    dias_trabalhados: '',
    dias_trabalhados_datas: [],
    adicionais: '', descontos: '', faltas: '', decimo_terceiro: '', observacoes: '',
    chave_pix_titulo: item.pix_titulo?.chave_pix || '',
    favorecido_pix_nome: '', favorecido_pix_cpf: ''
  };
}

function moeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function limiteDaLinha(item) {
  if (item.intencao_pagamento === 'DIARIA') return Number(item.dias_diaria_elegiveis?.length || 0);
  return Number(item.limite_dias_mensais ?? item.dias_vinculados ?? 0);
}

function intencoesDisponiveis(item) {
  const enviadas = new Set(item.etapas_enviadas || []);
  const naCompetencia = new Set(item.etapas_enviadas_competencia || []);
  const mensal = item.conversao_mensal_diaria || item.forma_calculo_gerencial !== 'DIARIA';
  const opcoes = mensal ? ['ADIANTAMENTO_40', 'SALDO_60', 'PROPORCIONAL'] : [];
  if (!mensal || item.conversao_mensal_diaria) opcoes.push('DIARIA');
  return opcoes.filter((etapa) => {
    if (etapa === 'DIARIA') return true;
    if (enviadas.has(etapa)) return false;
    if (etapa === 'ADIANTAMENTO_40') return !naCompetencia.has('SALDO_60') && !naCompetencia.has('PROPORCIONAL');
    if (etapa === 'SALDO_60') return naCompetencia.has('ADIANTAMENTO_40') && !naCompetencia.has('PROPORCIONAL');
    return !naCompetencia.has('SALDO_60');
  });
}

export default function RhDpJornadaGerencial({ abasJornada, podeEnviar, onAbrirLegado,
  obraFixaId, colaboradorId, aoEnviar, aoOcupado, aoAlterar }) {
  const { user } = useAuth();
  const { avisos, avisar, fechar } = useAvisos();
  const [obras, setObras] = useState([]);
  const [obraId, setObraId] = useState(() => obraFixaId ? String(obraFixaId) : '');
  const [competencia, setCompetencia] = useState(COMPETENCIA_ATUAL);
  const [linhas, setLinhas] = useState([]);
  const [passo, setPasso] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const chaveEnvioRef = useRef(null);
  const emEnvioRef = useRef(false);
  const consultaRef = useRef(0);

  useEffect(() => { aoOcupado?.(salvando); }, [salvando, aoOcupado]);
  useEffect(() => {
    if (obraFixaId) montarLista();
    // A competencia fixa desta montagem e selecionavel antes de atualizar a lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraFixaId, colaboradorId]);

  useEffect(() => {
    let ativo = true;
    const operacional = !isBusinessAdmin(user) && userHasSetorCapability(user, 'eh_setor_obra');
    (operacional ? getMinhasObras({ escopo: 'TODOS' }) : getObras({ escopo: 'TODOS' }))
      .then((dados) => { if (ativo) setObras(Array.isArray(dados) ? dados : dados?.obras || []); })
      .catch((error) => avisar.erro(error.message || 'Não foi possível carregar as obras.'));
    return () => { ativo = false; };
  }, [user, avisar]);

  const selecionadas = useMemo(() => linhas.filter((item) => item.selecionado), [linhas]);
  const elegiveis = linhas.filter((item) => !item.ainda_nao_comecou
    && !item.regime_em_transicao && item.dias_vinculados && intencoesDisponiveis(item).length);

  function alterar(id, mudanca) {
    aoAlterar?.();
    setLinhas((atuais) => atuais.map((item) => Number(item.colaborador_id) === Number(id)
      ? { ...item, ...mudanca } : item));
    chaveEnvioRef.current = null;
  }

  async function montarLista() {
    if (!obraId || !competencia || carregando || emEnvioRef.current) return;
    const consulta = ++consultaRef.current;
    setCarregando(true);
    setResultado(null);
    try {
      const dados = await colaboradoresParaJornadaGerencialRh({ obra_id: obraId, competencia });
      if (consulta !== consultaRef.current) return;
      setLinhas((Array.isArray(dados) ? dados : []).filter((item) => !colaboradorId
        || Number(item.colaborador_id) === Number(colaboradorId)).map((item) => ({
          ...linhaInicial(item), selecionado: Boolean(colaboradorId) && !item.ainda_nao_comecou
            && !item.regime_em_transicao && Boolean(item.dias_vinculados) && Boolean(intencoesDisponiveis(item).length)
        })));
      setPasso(2);
      if (!dados?.length) avisar.alerta('Não há colaboradores vinculados à obra nessa competência.');
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível montar a lista.');
    } finally {
      setCarregando(false);
    }
  }

  function alternarDia(item, dia) {
    const dias = new Set(item.dias_trabalhados_datas);
    if (dias.has(dia)) dias.delete(dia);
    else dias.add(dia);
    const selecionados = [...dias].sort();
    alterar(item.colaborador_id, { dias_trabalhados_datas: selecionados,
      dias_trabalhados: String(selecionados.length) });
  }

  function validar() {
    if (!selecionadas.length) return 'Selecione ao menos um colaborador.';
    for (const item of selecionadas) {
      if (!item.intencao_pagamento) return `Selecione o pagamento de ${item.nome}.`;
      const dias = Number(item.dias_trabalhados);
      if (!Number.isInteger(dias) || dias < 1 || dias > limiteDaLinha(item)) {
        return `Confira os dias de ${item.nome}; o limite na obra é ${limiteDaLinha(item)}.`;
      }
      if (item.intencao_pagamento === 'DIARIA' && dias !== item.dias_trabalhados_datas.length) {
        return `Selecione os dias trabalhados de ${item.nome}.`;
      }
      if (item.chave_pix_titulo !== (item.pix_titulo?.chave_pix || '')
        && (!item.chave_pix_titulo || !item.favorecido_pix_nome || !item.favorecido_pix_cpf)) {
        return `Informe nome e CPF do novo beneficiário PIX de ${item.nome}.`;
      }
    }
    return null;
  }

  function revisar() {
    const erro = validar();
    if (erro) return avisar.erro(erro);
    setPasso(3);
  }

  async function enviar() {
    if (!podeEnviar || emEnvioRef.current) return;
    const erro = validar();
    if (erro) return avisar.erro(erro);
    const payload = {
      obra_id: Number(obraId), competencia,
      linhas: selecionadas.map((item) => ({
        colaborador_id: item.colaborador_id,
        intencao_pagamento: item.intencao_pagamento,
        dias_trabalhados: Number(item.dias_trabalhados),
        ...(item.intencao_pagamento === 'DIARIA'
          ? { dias_trabalhados_datas: item.dias_trabalhados_datas } : {}),
        adicionais: parseCurrencyInput(item.adicionais),
        descontos: parseCurrencyInput(item.descontos),
        faltas: Number(item.faltas || 0),
        decimo_terceiro: parseCurrencyInput(item.decimo_terceiro),
        observacoes: item.observacoes || undefined,
        chave_pix_titulo: item.chave_pix_titulo || undefined,
        favorecido_pix_nome: item.favorecido_pix_nome || undefined,
        favorecido_pix_cpf: item.favorecido_pix_cpf || undefined
      }))
    };
    const assinatura = JSON.stringify(payload);
    if (chaveEnvioRef.current?.assinatura !== assinatura) {
      chaveEnvioRef.current = { assinatura, chave: crypto.randomUUID() };
    }
    payload.idempotency_key = chaveEnvioRef.current.chave;
    emEnvioRef.current = true;
    setSalvando(true);
    try {
      const dados = await registrarJornadaGerencialRh(payload);
      setResultado(dados);
      setLinhas([]);
      setPasso(1);
      chaveEnvioRef.current = null;
      aoEnviar?.(dados);
      avisar.sucesso(`${selecionadas.length} colaborador(es) enviado(s) ao DP. A apuração definirá o valor líquido.`);
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível enviar a jornada.');
    } finally {
      emEnvioRef.current = false;
      setSalvando(false);
    }
  }

  return (
    <div className="app-pagina rh-gerencial">
      <Avisos avisos={avisos} aoFechar={fechar} />
      {abasJornada}
      <div className="rh-gerencial-etapas" aria-label="Etapas do envio">
        {['Obra e mês', 'Pagamentos', 'Revisão'].map((titulo, indice) => (
          <span key={titulo} className={passo === indice + 1 ? 'ativo' : passo > indice + 1 ? 'concluido' : ''}>
            <b>{indice + 1}</b>{titulo}
          </span>
        ))}
      </div>

      <section className="rh-gerencial-painel">
        <div className="rh-gerencial-titulo"><h2>Jornada da obra</h2><div className="rh-gerencial-acoes">
          <span>O DP confere e calcula o líquido</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={onAbrirLegado}>Planilha e lançamentos especiais</button>
        </div></div>
        <div className="rh-gerencial-filtros">
          <label>Obra / centro de custo<select value={obraId} disabled={Boolean(obraFixaId) || carregando || salvando} onChange={(evento) => { setObraId(evento.target.value); setLinhas([]); setPasso(1); }}>
            <option value="">Selecione a obra</option>
            {obras.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo ? `${obra.codigo} · ` : ''}{obra.nome}</option>)}
          </select></label>
          <label>Competência<input type="month" value={competencia} disabled={carregando || salvando} onChange={(evento) => {
            aoAlterar?.();
            setCompetencia(evento.target.value); setLinhas([]); setPasso(1);
          }} /></label>
          <button type="button" className="btn btn-primary" disabled={carregando || !obraId} onClick={montarLista}>
            {carregando ? 'Carregando...' : linhas.length ? 'Atualizar lista' : 'Montar lista'}
          </button>
        </div>
      </section>

      {passo === 2 && linhas.length ? <section className="rh-gerencial-painel">
        <div className="rh-gerencial-titulo"><h2>O que deve ser pago?</h2><span>{selecionadas.length} de {elegiveis.length} selecionados</span></div>
        <div className="rh-gerencial-lista">
          {linhas.map((item) => {
            const bloqueado = item.ainda_nao_comecou || item.regime_em_transicao
              || !item.dias_vinculados || !intencoesDisponiveis(item).length;
            const diario = item.intencao_pagamento === 'DIARIA';
            const pixAlterado = item.chave_pix_titulo !== (item.pix_titulo?.chave_pix || '');
            return <div className={`rh-gerencial-linha${item.selecionado ? ' selecionada' : ''}`} key={item.colaborador_id}>
              <label className="rh-gerencial-pessoa"><input type="checkbox" checked={item.selecionado} disabled={bloqueado}
                onChange={(evento) => alterar(item.colaborador_id, { selecionado: evento.target.checked })} />
                <span><strong>{item.nome}</strong><small>{item.conversao_mensal_diaria ? 'Mensal → diária' : item.forma_calculo_gerencial === 'DIARIA' ? 'Diarista' : 'Mensalista'} · {item.tipo_vinculo} · limite {limiteDaLinha(item)} dias
                  {(item.etapas_enviadas_competencia || []).length
                    ? ` · na competência: ${item.etapas_enviadas_competencia.map((etapa) => INTENCOES[etapa] || etapa).join(', ')}` : ''}</small></span>
              </label>
              {bloqueado ? <span className="rh-gerencial-pendente">{item.regime_em_transicao ? 'Revisão do DP'
                : !intencoesDisponiveis(item).length ? 'Etapa já enviada' : 'Fora do período'}</span> : item.selecionado ? <>
                <div className="rh-gerencial-campos">
                  <label>Pagamento<select value={item.intencao_pagamento} onChange={(evento) => alterar(item.colaborador_id, {
                    intencao_pagamento: evento.target.value, dias_trabalhados: '', dias_trabalhados_datas: []
                  })}>
                    <option value="">Selecione</option>
                    {intencoesDisponiveis(item)
                      .map((intencao) => <option key={intencao} value={intencao}>{INTENCOES[intencao]}</option>)}
                  </select></label>
                  <label>{diario ? 'Dias selecionados' : item.intencao_pagamento === 'PROPORCIONAL'
                    ? 'Dias totais nesta obra' : 'Dias desta etapa'}<input type="number" min="1" max={limiteDaLinha(item)} value={item.dias_trabalhados}
                    readOnly={diario} onChange={(evento) => alterar(item.colaborador_id, { dias_trabalhados: evento.target.value })}
                    placeholder={diario ? 'Selecione abaixo' : '0'} /></label>
                  <label>Faltas (registro)<input type="number" min="0" max={limiteDaLinha(item)} value={item.faltas}
                    onChange={(evento) => alterar(item.colaborador_id, { faltas: evento.target.value })} /></label>
                  <label>Acréscimos<input type="text" inputMode="decimal" value={item.adicionais}
                    onChange={(evento) => alterar(item.colaborador_id, { adicionais: evento.target.value })}
                    onBlur={() => alterar(item.colaborador_id, { adicionais: item.adicionais ? formatCurrencyInput(String(parseCurrencyInput(item.adicionais))) : '' })}
                    placeholder="R$ 0,00" /></label>
                  <label>Descontos<input type="text" inputMode="decimal" value={item.descontos}
                    onChange={(evento) => alterar(item.colaborador_id, { descontos: evento.target.value })}
                    onBlur={() => alterar(item.colaborador_id, { descontos: item.descontos ? formatCurrencyInput(String(parseCurrencyInput(item.descontos))) : '' })}
                    placeholder="R$ 0,00" /></label>
                </div>
                {diario ? <details className="rh-gerencial-dias"><summary>Selecionar dias trabalhados ({item.dias_trabalhados_datas.length})</summary>
                  <div>{(item.dias_diaria_elegiveis || []).map((dia) => <label key={dia}>
                    <input type="checkbox" checked={item.dias_trabalhados_datas.includes(dia)}
                      disabled={(item.dias_diaria_ja_informados || []).includes(dia)}
                      onChange={() => alternarDia(item, dia)} />{dia.slice(-2)}
                  </label>)}</div>
                </details> : null}
                <details className="rh-gerencial-extras"><summary>Outros ajustes e PIX</summary>
                  <div className="rh-gerencial-campos">
                    <label>13º<input type="text" inputMode="decimal" value={item.decimo_terceiro}
                      onChange={(evento) => alterar(item.colaborador_id, { decimo_terceiro: evento.target.value })}
                      onBlur={() => alterar(item.colaborador_id, { decimo_terceiro: item.decimo_terceiro
                        ? formatCurrencyInput(String(parseCurrencyInput(item.decimo_terceiro))) : '' })}
                      placeholder="R$ 0,00" /></label>
                    <label>Chave PIX<input value={item.chave_pix_titulo} onChange={(evento) => alterar(item.colaborador_id, {
                      chave_pix_titulo: evento.target.value, favorecido_pix_nome: '', favorecido_pix_cpf: ''
                    })} /></label>
                    {pixAlterado ? <><label>Beneficiário<input value={item.favorecido_pix_nome}
                      onChange={(evento) => alterar(item.colaborador_id, { favorecido_pix_nome: evento.target.value })} /></label>
                      <label>CPF do beneficiário<input value={item.favorecido_pix_cpf}
                        onChange={(evento) => alterar(item.colaborador_id, { favorecido_pix_cpf: evento.target.value })} /></label></> : null}
                    <label>Observação<input value={item.observacoes}
                      onChange={(evento) => alterar(item.colaborador_id, { observacoes: evento.target.value })} /></label>
                  </div>
                </details>
              </> : null}
            </div>;
          })}
        </div>
        <div className="rh-gerencial-rodape"><span>Valores finais e recorrências são conferidos pelo DP.</span>
          <button type="button" className="btn btn-primary" onClick={revisar} disabled={!podeEnviar}>Revisar envio</button></div>
      </section> : null}

      {passo === 3 ? <section className="rh-gerencial-painel">
        <div className="rh-gerencial-titulo"><h2>Revisar envio</h2><span>{selecionadas.length} colaborador(es)</span></div>
        <div className="rh-gerencial-revisao">{selecionadas.map((item) => <div key={item.colaborador_id}>
          <strong>{item.nome}</strong><span>{INTENCOES[item.intencao_pagamento]} · {item.dias_trabalhados} dias</span>
          <small>+ {moeda(parseCurrencyInput(item.adicionais))} · − {moeda(parseCurrencyInput(item.descontos))}</small>
        </div>)}</div>
        <div className="rh-gerencial-rodape"><button type="button" className="btn btn-outline" disabled={salvando} onClick={() => setPasso(2)}>Voltar</button>
          <button type="button" className="btn btn-primary" disabled={salvando} onClick={enviar}>
            {salvando ? 'Enviando...' : 'Enviar ao DP'}</button></div>
      </section> : null}

      {resultado ? <div className="alert alert-success" role="status">
        Envio registrado: {(resultado.solicitacoes || []).map((item) => item?.codigo || `#${item?.id}`).join(' · ')}.
      </div> : null}
    </div>
  );
}
