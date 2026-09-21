import { useCallback, useEffect, useState } from 'react';
import {
  listarAditivosContrato,
  decidirAditivoContrato,
  cancelarAditivoContrato
} from '../../services/contratos';
import StatusBadge from '../../components/StatusBadge';
import { BlocoConteudo, TabelaPadrao, CelulaDupla, useConfirmacao } from '../../components/padrao';

/**
 * Os termos aditivos do contrato, com os tres botoes do fluxo (item 26, 23/08).
 *
 * O que faltava nao era um `<button>`: era o LUGAR dele. A rota de decisao existia desde 21/08, e a
 * de listagem nao existia — o aditivo era pedido e sumia da tela. Quem aprovava tinha de ir ao
 * banco.
 *
 * APROVAR e REJEITAR sao a decisao de merito, e usam a permissao de aprovacao do contrato.
 * CANCELAR e outra coisa: e o pedido sendo RETIRADO — foi pedido errado, ou deixou de ser
 * necessario — e por isso usa a permissao de cancelamento. Sao decisoes de pessoas diferentes, e e
 * por isso que sao dois botoes e nao um.
 *
 * Os botoes so aparecem nos PENDENTES: decidido nao volta atras por aqui (o backend responde 409).
 *
 * ## O que a rodada de 05/09 mudou
 *
 * - **R19**: o motivo da rejeicao/cancelamento vinha de `window.prompt`. Mesma caixa do navegador
 *   que a regra bane (ignora tema e tokens, nao existe no DOM, o harness nao mede) — virou o
 *   `campo` do `useConfirmacao`, que pergunta e devolve o texto num passo so.
 * - **R21**: o retorno e desestruturado (`const { ok, texto }`). Objeto e sempre truthy.
 * - **R26**: o aditivo alvo e fixado numa `const` ANTES do `await`. O modal do sistema NAO congela
 *   a pagina (o `prompt` congelava): entre a pergunta e a acao a lista pode ser recarregada pelo
 *   `onMudou` de outro bloco, e reler o estado depois do await confirmaria o aditivo A para agir
 *   sobre o B.
 * - **R25**: o mapa `CORES` pintava o status com hex a mao (`#b45309`, `#15803d`, `#b91c1c`) como
 *   fallback de token. Agora e o `StatusBadge`, a etiqueta unica do sistema.
 * - **R1/R17**: a lista virou `TabelaPadrao` (largura por `tipo`, colunas redimensionaveis, cards
 *   no celular com o MESMO markup).
 */

const moeda = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const brData = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');

const ROTULO_TIPO = {
  VALOR: 'Valor',
  VALOR_E_VIGENCIA: 'Valor e vigencia',
  PRAZO: 'Prazo'
};

export default function AditivosDoContrato({ contrato, onMudou }) {
  const [aditivos, setAditivos] = useState([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(null);
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const contratoId = contrato?.id || null;
  const pode = contrato?.permissoes || {};
  const podeDecidir = pode.aprovar === true;
  const podeCancelar = pode.cancelar === true;

  const carregar = useCallback(async () => {
    if (!contratoId) return;
    try {
      setAditivos(await listarAditivosContrato(contratoId));
    } catch (e) {
      setErro(e.message || 'Nao foi possivel carregar os aditivos.');
    }
  }, [contratoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Card inteiro oculto quando nao ha aditivo: um card vazio em toda solicitacao de contrato seria
  // ruido — a maioria dos contratos nunca tem aditivo.
  if (!contratoId || aditivos.length === 0) return null;

  async function agir(aditivo, acao) {
    // R26: o alvo e fixado AQUI, antes de qualquer `await`. A partir daqui a
    // mensagem e a acao falam do MESMO aditivo, aconteca o que acontecer com
    // a lista enquanto o modal esta aberto.
    const alvo = aditivo;
    const descricaoAlvo = `${ROTULO_TIPO[alvo.tipo] || alvo.tipo || 'Aditivo'}${Number(alvo.valor) > 0 ? ` · ${moeda(alvo.valor)}` : ''}`;
    setErro('');

    // O motivo e OBRIGATORIO na rejeicao (o backend recusa sem ele) e opcional no cancelamento.
    let motivo = '';
    if (acao !== 'aprovar') {
      const { ok, texto } = await confirmar({
        titulo: acao === 'rejeitar' ? 'Rejeitar termo aditivo' : 'Cancelar termo aditivo',
        mensagem: acao === 'rejeitar'
          ? `Rejeitar o aditivo ${descricaoAlvo}? A decisao fica registrada e nao volta atras por aqui.`
          : `Cancelar o pedido do aditivo ${descricaoAlvo}? O pedido e retirado e nao volta atras por aqui.`,
        rotuloConfirmar: acao === 'rejeitar' ? 'Rejeitar' : 'Cancelar aditivo',
        rotuloCancelar: 'Voltar',
        destrutiva: true,
        campo: {
          rotulo: acao === 'rejeitar' ? 'Motivo da rejeicao' : 'Motivo do cancelamento (opcional)',
          obrigatorio: acao === 'rejeitar',
          multilinha: true
        }
      });
      if (!ok) return;
      motivo = String(texto || '');
      if (acao === 'rejeitar' && !motivo.trim()) {
        setErro('Informe o motivo da rejeição.');
        return;
      }
    }

    setOcupado(alvo.id);
    try {
      if (acao === 'cancelar') await cancelarAditivoContrato(alvo.id, motivo);
      else await decidirAditivoContrato(alvo.id, { aprovar: acao === 'aprovar', motivo });
      await carregar();
      onMudou?.();
    } catch (e) {
      setErro(e.message || 'Nao foi possivel concluir a acao.');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <BlocoConteudo titulo="Termos aditivos" contagem={`${aditivos.length} aditivo(s)`}
      recolhivel recolhidoPadrao alternarAoClicar>
      <div data-testid="aditivos-do-contrato">
        {erro && <div className="app-alert app-alert--error">{erro}</div>}

        <TabelaPadrao
          /*
            R17 — `semIdentidade` DECLARADO, com motivo: um termo aditivo nao
            tem nome proprio. Ele e identificado pela combinacao tipo + valor
            + nova vigencia, que sao dados tipados (texto/valor/data) e nao
            um rotulo legivel para exibir em MAIUSCULAS.
          */
          semIdentidade
          colunas={[
            {
              id: 'tipo',
              titulo: 'Tipo',
              tipo: 'texto',
              noCard: 'titulo',
              render: (a) => ROTULO_TIPO[a.tipo] || a.tipo || 'Aditivo'
            },
            {
              id: 'valor',
              titulo: 'Valor',
              tipo: 'valor',
              render: (a) => (Number(a.valor) > 0 ? moeda(a.valor) : '—')
            },
            {
              id: 'vigencia',
              titulo: 'Nova vigência',
              tipo: 'data',
              render: (a) => (a.nova_vigencia_fim ? brData(a.nova_vigencia_fim) : '—')
            },
            {
              id: 'justificativa',
              titulo: 'Justificativa',
              tipo: 'texto',
              render: (a) => (
                <CelulaDupla
                  principal={a.justificativa || '—'}
                  sub={a.motivo_rejeicao ? `Motivo: ${a.motivo_rejeicao}` : null}
                />
              )
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (a) => (
                <span data-testid={`aditivo-status-${a.id}`}>
                  <StatusBadge status={a.status} />
                </span>
              )
            }
          ]}
          itens={aditivos}
          getId={(a) => a.id}
          larguraAcoes={320}
          acoesLinha={(a) => (
            a.status === 'PENDENTE' && (podeDecidir || podeCancelar) ? (
              <span className="flex flex-wrap gap-2" data-testid={`aditivo-${a.id}`}>
                {podeDecidir && (
                  <button type="button" className="btn btn-primary btn-sm"
                    data-testid={`aprovar-aditivo-${a.id}`}
                    disabled={ocupado === a.id} onClick={() => agir(a, 'aprovar')}>
                    {ocupado === a.id ? 'Aguarde...' : 'Aprovar'}
                  </button>
                )}
                {podeDecidir && (
                  <button type="button" className="btn btn-outline btn-sm btn-perigo-suave"
                    data-testid={`rejeitar-aditivo-${a.id}`}
                    disabled={ocupado === a.id} onClick={() => agir(a, 'rejeitar')}>
                    Rejeitar
                  </button>
                )}
                {podeCancelar && (
                  <button type="button" className="btn btn-outline btn-sm"
                    data-testid={`cancelar-aditivo-${a.id}`}
                    disabled={ocupado === a.id} onClick={() => agir(a, 'cancelar')}>
                    Cancelar
                  </button>
                )}
              </span>
            ) : null
          )}
          vazio="Nenhum termo aditivo neste contrato."
          storageKey="tabela:solicitacao-detalhe-aditivos-contrato"
          rotuloRolagem="Termos aditivos do contrato"
        />
      </div>
      {elementoConfirmacao}
    </BlocoConteudo>
  );
}
