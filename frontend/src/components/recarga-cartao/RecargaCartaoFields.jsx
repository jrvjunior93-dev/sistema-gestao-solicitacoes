import { useEffect, useMemo, useState } from 'react';
import { HiOutlineArrowUturnLeft, HiOutlineClock, HiOutlinePencilSquare } from 'react-icons/hi2';
import DateInputBR from '../DateInputBR';
import PrestacaoRecargaCartao from './PrestacaoRecargaCartao';
import { editarRecargaPendente, listarMeusCartoesRecarga, obterContextoCartaoRecarga } from '../../services/recargasCartao';
import { solicitarRetornoSolicitacao } from '../../services/solicitacoes';

function moeda(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function valorUltimaRecarga(recarga) {
  const valorEfetivo = Number(recarga?.valor_efetivo || 0);
  return valorEfetivo > 0 ? valorEfetivo : Number(recarga?.valor_solicitado || 0);
}

function textoMoeda(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numeroMoeda(value) {
  const limpo = String(value || '').trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (!limpo) return 0;
  return Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo);
}

function hojeLocal() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export default function RecargaCartaoFields({ ativo, value, onChange, onContextChange, onSolicitacaoAnteriorEnviada }) {
  const [cartoes, setCartoes] = useState([]);
  const [contexto, setContexto] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [retorno, setRetorno] = useState({ aberto: false, motivo: '', processando: false, erro: '' });
  const [edicao, setEdicao] = useState({ aberto: false, valor: '', data_vencimento: '', processando: false, erro: '' });

  useEffect(() => {
    if (!ativo) {
      setCartoes([]);
      setContexto(null);
      setErro('');
      setRetorno({ aberto: false, motivo: '', processando: false, erro: '' });
      setEdicao({ aberto: false, valor: '', data_vencimento: '', processando: false, erro: '' });
      onContextChange?.(null);
      return;
    }
    setCarregando(true);
    listarMeusCartoesRecarga()
      .then((dados) => setCartoes(dados?.cartoes || []))
      .catch((error) => setErro(error.message))
      .finally(() => setCarregando(false));
  }, [ativo, onContextChange]);

  async function carregarContexto(cartaoId) {
    setRetorno({ aberto: false, motivo: '', processando: false, erro: '' });
    setEdicao({ aberto: false, valor: '', data_vencimento: '', processando: false, erro: '' });
    if (!cartaoId) {
      setContexto(null);
      onContextChange?.(null);
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      const dados = await obterContextoCartaoRecarga(cartaoId);
      setContexto(dados);
      onContextChange?.(dados);
    } catch (error) {
      setContexto(null);
      onContextChange?.(null);
      setErro(error.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (ativo && value) void carregarContexto(value);
  }, [ativo, value]);

  const ultima = contexto?.ultima_recarga || null;
  const solicitacaoAnterior = ultima?.solicitacao || null;
  const contextoInteracao = contexto?.contexto_interacao || null;
  const statusPrestacao = String(ultima?.prestacao?.status || '').trim().toUpperCase();
  const statusTitulo = String(ultima?.titulo?.status || '').trim().toUpperCase();
  const valorBaixado = Number(ultima?.titulo?.valor_baixado || ultima?.valor_efetivo || 0);
  const podeEditarRecargaAnterior = contexto?.bloqueado
    && contextoInteracao?.pode_interagir === true
    && !ultima?.prestacao
    && valorBaixado <= 0
    && ['PREVISAO', 'ABERTO'].includes(statusTitulo);
  const aguardandoBaixa = contexto?.bloqueado
    && !ultima?.prestacao
    && !podeEditarRecargaAnterior
    && ['PREVISAO', 'ABERTO', 'PARCIAL'].includes(statusTitulo);
  const podePrestarNestaTela = contexto?.bloqueado
    && contextoInteracao?.pode_interagir === true
    && ['PENDENTE', 'REJEITADA'].includes(statusPrestacao);
  const rotuloSituacao = useMemo(() => {
    if (!ultima) return 'Sem recarga anterior';
    return ultima.prestacao?.status || ultima.status_ciclo || ultima.titulo?.status || '-';
  }, [ultima]);

  useEffect(() => {
    if (!ativo || !value || !contexto?.bloqueado || podePrestarNestaTela) return undefined;

    let cancelado = false;
    let consultando = false;
    const atualizarSilenciosamente = async () => {
      if (consultando) return;
      consultando = true;
      try {
        const dados = await obterContextoCartaoRecarga(value);
        if (cancelado) return;
        setContexto(dados);
        onContextChange?.(dados);
      } catch {
        // A consulta inicial continua responsavel por exibir falhas. O acompanhamento silencioso
        // nao deve apagar o formulario nem gerar alertas repetidos por uma oscilacao de rede.
      } finally {
        consultando = false;
      }
    };

    const timer = window.setInterval(atualizarSilenciosamente, 6000);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [ativo, value, contexto?.bloqueado, podePrestarNestaTela, onContextChange]);

  async function solicitarRetorno() {
    const solicitacaoId = Number(solicitacaoAnterior?.id);
    const motivo = String(retorno.motivo || '').trim();
    if (!solicitacaoId || !motivo || retorno.processando) return;

    setRetorno((atual) => ({ ...atual, processando: true, erro: '' }));
    try {
      await solicitarRetornoSolicitacao(solicitacaoId, motivo);
      setRetorno({ aberto: false, motivo: '', processando: false, erro: '' });
      await carregarContexto(value);
    } catch (error) {
      setRetorno((atual) => ({
        ...atual,
        processando: false,
        erro: error?.message || 'Não foi possível solicitar o retorno da solicitação.'
      }));
    }
  }

  function abrirEdicao() {
    setEdicao({
      aberto: true,
      valor: textoMoeda(ultima?.valor_solicitado),
      data_vencimento: ultima?.titulo?.data_vencimento || solicitacaoAnterior?.data_vencimento || '',
      processando: false,
      erro: ''
    });
  }

  async function enviarEdicao() {
    const solicitacaoId = Number(solicitacaoAnterior?.id);
    const valor = numeroMoeda(edicao.valor);
    if (!solicitacaoId || edicao.processando) return;
    if (!Number.isFinite(valor) || valor <= 0) {
      setEdicao((atual) => ({ ...atual, erro: 'Informe um valor de recarga maior que zero.' }));
      return;
    }
    if (!edicao.data_vencimento || edicao.data_vencimento < hojeLocal()) {
      setEdicao((atual) => ({ ...atual, erro: 'A nova data de recarga deve ser hoje ou uma data futura.' }));
      return;
    }

    setEdicao((atual) => ({ ...atual, processando: true, erro: '' }));
    try {
      await editarRecargaPendente(solicitacaoId, {
        valor,
        data_vencimento: edicao.data_vencimento
      });
      setEdicao({ aberto: false, valor: '', data_vencimento: '', processando: false, erro: '' });
      onSolicitacaoAnteriorEnviada?.();
    } catch (error) {
      setEdicao((atual) => ({
        ...atual,
        processando: false,
        erro: error?.message || 'Não foi possível editar e reenviar a solicitação.'
      }));
    }
  }

  if (!ativo) return null;

  return (
    <section className="min-w-0 space-y-3 border-y border-[var(--c-border)] py-3 lg:col-span-12" aria-labelledby="recarga-cartao-heading">
      <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_minmax(320px,1.4fr)]">
        <label className="grid gap-1 text-sm">
          <span id="recarga-cartao-heading">Cartão para recarga *</span>
          <select
            className="input input-sm"
            value={value || ''}
            onChange={(event) => onChange(event.target.value)}
            required
            disabled={carregando && cartoes.length === 0}
          >
            <option value="">{carregando ? 'Carregando cartões...' : 'Selecione um cartão vinculado'}</option>
            {cartoes.map((cartao) => (
              <option key={cartao.id} value={cartao.id}>{cartao.nome} · final {cartao.ultimos_quatro}</option>
            ))}
          </select>
          {!carregando && cartoes.length === 0 ? (
            <span className="text-xs text-amber-700">Nenhum cartão ativo está vinculado ao seu usuário.</span>
          ) : null}
        </label>

        <div className="grid grid-cols-2 gap-x-5 gap-y-1 self-end border-l border-[var(--c-border)] pl-4 text-sm">
          <span className="text-[var(--c-muted)]">Última recarga</span>
          <strong className="text-right tabular-nums text-[var(--c-text)]">{ultima ? moeda(valorUltimaRecarga(ultima)) : '-'}</strong>
          <span className="text-[var(--c-muted)]">Situação</span>
          <strong className="text-right text-[var(--c-text)]">{rotuloSituacao}</strong>
        </div>
      </div>

      {contexto?.bloqueado ? (
        <div className="space-y-3 border-y border-amber-300 bg-amber-50/70 px-3 py-3 text-amber-950" role="status">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold">
                Continue pela solicitação anterior {solicitacaoAnterior?.codigo ? `(${solicitacaoAnterior.codigo})` : ''}
              </p>
              <p className="max-w-3xl text-xs leading-5">
                {aguardandoBaixa
                  ? 'Esta recarga ainda não possui valor efetivamente baixado. Assim que o Financeiro registrar uma baixa, a solicitação voltará automaticamente para a Obra e o card de prestação aparecerá aqui, sem atualizar o navegador.'
                  : podePrestarNestaTela
                  ? 'A solicitação já está no seu setor. Preencha a prestação abaixo; quando os rateios fecharem o valor efetivamente recarregado, o próximo pedido será liberado e esta solicitação seguirá para conferência da Gerência de Processos.'
                  : podeEditarRecargaAnterior
                  ? 'A solicitação já voltou ao seu setor. Corrija o valor e a data prevista abaixo para reenviar o mesmo pedido à Gerência de Processos.'
                  : contextoInteracao?.pode_interagir
                  ? 'A solicitação já está no seu setor. Conclua o ciclo anterior antes de pedir uma nova recarga.'
                  : `A solicitação está no setor ${contextoInteracao?.setor_atual || solicitacaoAnterior?.area_responsavel || 'responsável atual'}. Solicite o retorno ao seu setor antes de continuar. Quando ela retornar, edite a solicitação anterior em vez de criar uma nova.`}
              </p>
              <p className="text-xs font-medium">{contexto.motivo_bloqueio}</p>
              <p className="text-xs leading-5">
                Recargas quitadas integralmente, parcialmente ou com valor efetivo diferente do solicitado exigem prestação de contas no registro anterior antes de uma nova solicitação.
              </p>
            </div>

            {aguardandoBaixa ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold">
                <HiOutlineClock aria-hidden="true" />
                Aguardando baixa
              </span>
            ) : podeEditarRecargaAnterior && solicitacaoAnterior?.id ? (
              <button
                type="button"
                className="btn btn-outline btn-sm shrink-0"
                onClick={abrirEdicao}
                disabled={edicao.processando}
              >
                <HiOutlinePencilSquare aria-hidden="true" />
                Editar valor e data
              </button>
            ) : contextoInteracao?.pedido_retorno_pendente ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold">
                <HiOutlineClock aria-hidden="true" />
                Retorno solicitado
              </span>
            ) : contextoInteracao?.pode_solicitar_retorno && !aguardandoBaixa ? (
              <button
                type="button"
                className="btn btn-outline btn-sm shrink-0"
                onClick={() => setRetorno((atual) => ({ ...atual, aberto: true, erro: '' }))}
              >
                <HiOutlineArrowUturnLeft aria-hidden="true" />
                Solicitar retorno
              </button>
            ) : null}
          </div>

          {contextoInteracao?.pedido_retorno_pendente?.motivo ? (
            <p className="border-t border-amber-200 pt-2 text-xs">
              Motivo enviado: {contextoInteracao.pedido_retorno_pendente.motivo}
            </p>
          ) : null}

          {retorno.aberto && !contextoInteracao?.pedido_retorno_pendente ? (
            <div className="grid gap-2 border-t border-amber-200 pt-3 md:grid-cols-[1fr_auto] md:items-end">
              <label className="grid gap-1 text-xs font-semibold">
                Motivo do retorno *
                <textarea
                  className="input min-h-[68px] bg-[var(--c-surface)]"
                  value={retorno.motivo}
                  onChange={(event) => setRetorno((atual) => ({ ...atual, motivo: event.target.value, erro: '' }))}
                  placeholder="Ex.: preciso concluir a prestação de contas desta recarga."
                  disabled={retorno.processando}
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setRetorno({ aberto: false, motivo: '', processando: false, erro: '' })}
                  disabled={retorno.processando}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={solicitarRetorno}
                  disabled={retorno.processando || !retorno.motivo.trim()}
                >
                  {retorno.processando ? 'Enviando...' : 'Enviar pedido'}
                </button>
              </div>
            </div>
          ) : null}

          {edicao.aberto && podeEditarRecargaAnterior ? (
            <div className="grid gap-3 border-t border-amber-200 pt-3 md:grid-cols-[minmax(180px,0.7fr)_minmax(210px,0.8fr)_auto] md:items-end">
              <label className="grid gap-1 text-xs font-semibold">
                Novo valor *
                <div className="input input-sm flex items-center gap-2 bg-[var(--c-surface)] focus-within:ring-2 focus-within:ring-blue-200">
                  <span className="text-[var(--c-muted)]">R$</span>
                  <input
                    className="min-w-0 flex-1 bg-transparent text-right tabular-nums outline-none"
                    inputMode="decimal"
                    value={edicao.valor}
                    onChange={(event) => setEdicao((atual) => ({ ...atual, valor: event.target.value, erro: '' }))}
                    onBlur={() => {
                      const valor = numeroMoeda(edicao.valor);
                      if (Number.isFinite(valor)) setEdicao((atual) => ({ ...atual, valor: textoMoeda(valor) }));
                    }}
                    disabled={edicao.processando}
                    aria-label="Novo valor da recarga"
                  />
                </div>
              </label>
              <label className="grid gap-1 text-xs font-semibold">
                Nova data prevista *
                <DateInputBR
                  className="input input-sm bg-[var(--c-surface)]"
                  value={edicao.data_vencimento}
                  onChange={(event) => setEdicao((atual) => ({ ...atual, data_vencimento: event.target.value, erro: '' }))}
                  disabled={edicao.processando}
                  required
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEdicao({ aberto: false, valor: '', data_vencimento: '', processando: false, erro: '' })}
                  disabled={edicao.processando}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={enviarEdicao}
                  disabled={edicao.processando || !edicao.valor || !edicao.data_vencimento}
                >
                  {edicao.processando ? 'Reenviando...' : 'Salvar e enviar'}
                </button>
              </div>
              {edicao.erro ? <div className="app-alert app-alert--error md:col-span-3" role="alert">{edicao.erro}</div> : null}
            </div>
          ) : null}

          {retorno.erro ? <div className="app-alert app-alert--error" role="alert">{retorno.erro}</div> : null}
        </div>
      ) : null}
      {erro ? <div className="app-alert app-alert--error" role="alert">{erro}</div> : null}

      {podePrestarNestaTela && solicitacaoAnterior?.id ? (
        <PrestacaoRecargaCartao
          solicitacaoId={solicitacaoAnterior.id}
          contexto={contexto}
          onAtualizado={() => carregarContexto(value)}
        />
      ) : null}

      {!contexto?.bloqueado && statusPrestacao === 'ENVIADA' ? (
        <div className="app-alert app-alert--success" role="status">
          Prestação enviada para conferência da Gerência de Processos. Você já pode criar a próxima solicitação de recarga.
        </div>
      ) : null}
    </section>
  );
}
