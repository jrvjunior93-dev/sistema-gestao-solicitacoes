import { useState } from 'react';
import {
  HiOutlineArrowUturnLeft,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineXCircle
} from 'react-icons/hi2';
import {
  cancelarRetornoSolicitacao,
  decidirRetornoSolicitacao,
  solicitarRetornoSolicitacao
} from '../../services/solicitacoes';
import { Avisos, CampoForm, useAvisos } from '../../components/padrao';

/**
 * BARRA DE RETORNO DA SOLICITACAO — condicao do fluxo, nao card de conteudo.
 *
 * Ela existe em dois estados, e os dois continuam iguais em capacidade:
 *   1. a solicitacao esta em OUTRO setor: comentarios nos itens livres;
 *      conversa geral e demais acoes bloqueadas, com o pedido de retorno;
 *   2. ha pedidos de retorno esperando decisao NESTE setor: aprovar/rejeitar cada um.
 *
 * O que a rodada de 05/09 mudou:
 * - **R25**: as duas faixas eram paleta crua do Tailwind (`bg-amber-50`, `text-amber-950`,
 *   `border-blue-600`, `bg-gray-950`…). Paleta crua nao tem par no tema escuro e nao passa pelo
 *   piso de contraste do ThemeContext — trocada pelos tokens semanticos (`--sem-warning*`,
 *   `--sem-info*`) e pelo utilitario `.tarja`, que ja e a barra lateral de 4px do sistema.
 * - **R19**: o `alert()` do erro virou `Avisos`/`useAvisos` — faixa dentro da propria barra, com o
 *   tom semantico e fechavel.
 * - **R10**: `mt-0.5`, `gap-1.5`, `px-2.5` e `h-5/w-5` estavam fora dos degraus da escala.
 *
 * A faixa NAO virou `BlocoConteudo` de proposito: ela nao e um bloco de conteudo do detalhe (nao
 * entra no catalogo de blocos, nao e reordenavel nem recolhivel). E uma condicao do fluxo, ancorada
 * logo abaixo do cabecalho — a mesma leitura do `useAvisos` sobre condicao derivada do conteudo:
 * fechar nao resolve o problema, entao ela nao pode ser fechavel.
 */
export default function RetornoSolicitacaoBar({ solicitacao, onMudou }) {
  const contexto = solicitacao?.contexto_interacao;
  const [formAberto, setFormAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [rejeitandoId, setRejeitandoId] = useState(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [processando, setProcessando] = useState('');
  const { avisos, avisar, fechar } = useAvisos();

  if (!contexto) return null;

  const pedidos = Array.isArray(contexto.pedidos_retorno_para_decisao)
    ? contexto.pedidos_retorno_para_decisao
    : [];
  const pedidoPendente = contexto.pedido_retorno_pendente;
  const exibir = !contexto.pode_interagir || pedidos.length > 0;
  if (!exibir) return null;

  async function atualizar(callback, chave) {
    try {
      setProcessando(chave);
      await callback();
      setFormAberto(false);
      setMotivo('');
      setRejeitandoId(null);
      setMotivoRejeicao('');
      await onMudou?.();
    } catch (error) {
      avisar.erro(error?.message || 'Nao foi possivel concluir a operacao.');
    } finally {
      setProcessando('');
    }
  }

  function enviarPedido() {
    if (!motivo.trim()) return;
    return atualizar(
      () => solicitarRetornoSolicitacao(solicitacao.id, motivo.trim()),
      'solicitar'
    );
  }

  function cancelarPedido() {
    if (!pedidoPendente?.id) return;
    return atualizar(
      () => cancelarRetornoSolicitacao(pedidoPendente.id),
      `cancelar-${pedidoPendente.id}`
    );
  }

  function decidir(pedido, aprovar) {
    // O pedido alvo chega por parametro e e usado inteiro aqui dentro — a
    // decisao nunca relê a lista depois do await (R26).
    const alvo = pedido;
    if (!aprovar && !motivoRejeicao.trim()) return;
    const justificativa = motivoRejeicao.trim();
    return atualizar(
      () => decidirRetornoSolicitacao(alvo.id, {
        aprovar,
        motivo_decisao: aprovar ? '' : justificativa
      }),
      `${aprovar ? 'aprovar' : 'rejeitar'}-${alvo.id}`
    );
  }

  if (!contexto.pode_interagir) {
    return (
      <section
        className="tarja tarja--warning rounded-xl border border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] px-4 py-3 text-sm text-[var(--sem-warning)]"

        aria-label="Conversa geral e ações do setor bloqueadas; comentários nos itens permitidos"
        data-testid="barra-retorno-solicitacao"
      >
        <Avisos avisos={avisos} aoFechar={fechar} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <HiOutlineArrowUturnLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Somente acompanhamento · setor atual: {contexto.setor_atual}</p>
              <p className="mt-1 text-xs leading-5">
                Você pode comentar nos itens visíveis. Comentários na conversa geral, anexos, medições, aditivos e outras ações exigem o retorno para {contexto.setor_usuario || 'seu setor'}.
              </p>
            </div>
          </div>

          {pedidoPendente ? (
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-2 rounded-full border border-[var(--sem-warning-border)] bg-[var(--ui-surface)] px-2 py-1 text-xs font-semibold"
              >
                <HiOutlineClock className="h-4 w-4" /> Retorno solicitado
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={Boolean(processando)}
                onClick={cancelarPedido}
              >
                {processando === `cancelar-${pedidoPendente.id}` ? 'Cancelando...' : 'Cancelar pedido'}
              </button>
            </div>
          ) : contexto.pode_solicitar_retorno ? (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setFormAberto((atual) => !atual)}
            >
              Solicitar retorno
            </button>
          ) : null}
        </div>

        {pedidoPendente && (
          <p className="mt-2 border-t border-[var(--sem-warning-border)] pt-2 text-xs">
            <span className="font-semibold">Motivo enviado:</span> {pedidoPendente.motivo}
          </p>
        )}

        {formAberto && !pedidoPendente && (
          <div
            className="mt-3 grid gap-2 border-t border-[var(--sem-warning-border)] pt-3 md:grid-cols-[1fr_auto]"
          >
            <CampoForm label="Por que precisa do retorno?" obrigatorio>
              <textarea
                className="input w-full resize-y"
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                placeholder="Ex.: preciso registrar a medição deste período e anexar os documentos."
                maxLength={2000}
                autoFocus
              />
            </CampoForm>
            <div className="flex items-end justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFormAberto(false)} disabled={Boolean(processando)}>
                Fechar
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={enviarPedido} disabled={Boolean(processando) || !motivo.trim()}>
                {processando === 'solicitar' ? 'Enviando...' : 'Enviar pedido'}
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      className="tarja tarja--info rounded-xl border border-[var(--sem-info-border)] bg-[var(--sem-info-bg)] px-4 py-3 text-sm text-[var(--sem-info)]"

      aria-label="Pedidos de retorno aguardando decisão"
      data-testid="pedidos-retorno-decisao"
    >
      <Avisos avisos={avisos} aoFechar={fechar} />

      <div className="flex items-center gap-2">
        <HiOutlineClock className="h-4 w-4" aria-hidden="true" />
        <p className="font-semibold">
          {pedidos.length} pedido(s) de retorno aguardando decisao neste setor
        </p>
      </div>

      <div className="mt-3 border-y border-[var(--sem-info-border)]">
        {pedidos.map((pedido) => {
          const rejeitando = rejeitandoId === pedido.id;
          return (
            <div
              key={pedido.id}
              className="border-t border-[var(--sem-info-border)] py-3 first:border-t-0 first:pt-2 last:pb-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {pedido.solicitante?.nome || `Usuario #${pedido.solicitado_por}`} · retorno para {pedido.setor_solicitante}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-5">{pedido.motivo}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={Boolean(processando)}
                    onClick={() => decidir(pedido, true)}
                  >
                    <HiOutlineCheckCircle className="h-4 w-4" />
                    {processando === `aprovar-${pedido.id}` ? 'Aprovando...' : 'Aprovar retorno'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={Boolean(processando)}
                    onClick={() => {
                      setRejeitandoId(rejeitando ? null : pedido.id);
                      setMotivoRejeicao('');
                    }}
                  >
                    <HiOutlineXCircle className="h-4 w-4" /> Rejeitar
                  </button>
                </div>
              </div>

              {rejeitando && (
                <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                  <CampoForm label="Motivo da rejeição" obrigatorio>
                    <textarea
                      className="input w-full resize-y"
                      value={motivoRejeicao}
                      onChange={(event) => setMotivoRejeicao(event.target.value)}
                      placeholder="Explique o que precisa ser concluído antes da devolução."
                      maxLength={2000}
                      autoFocus
                    />
                  </CampoForm>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={Boolean(processando) || !motivoRejeicao.trim()}
                      onClick={() => decidir(pedido, false)}
                    >
                      {processando === `rejeitar-${pedido.id}` ? 'Rejeitando...' : 'Confirmar rejeicao'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
