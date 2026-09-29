import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Avisos,
  BlocoConteudo,
  CelulaDupla,
  TabelaPadrao,
  useConfirmacao
} from '../../../components/padrao';
import {
  consultaIndisponivel,
  decidirDilatacao,
  decidirReabertura,
  listarDecisoesPendentes,
  mensagemLegivel
} from '../services/custosRecebiveis';
import { monthLabel } from '../utils/prazos';
import { formatarDataHora, rotuloObra } from './CrFormatos';

// Página da fila: o servidor devolve 50 por padrão e aceita até 200.
const PAGINA = 200;
const CONSULTA_ESTREITA = '(max-width: 640px)';

function telaEstreita() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(CONSULTA_ESTREITA).matches;
}

// Celular: a fila nasce recolhida para as abas não descerem a tela inteira.
function useTelaEstreita() {
  const [estreita, setEstreita] = useState(telaEstreita);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(CONSULTA_ESTREITA);
    const aoMudar = () => setEstreita(media.matches);
    aoMudar();
    media.addEventListener?.('change', aoMudar);
    return () => media.removeEventListener?.('change', aoMudar);
  }, []);
  return estreita;
}

const TIPO_LABEL = {
  REABERTURA: 'Reabertura de competência',
  DILATACAO: 'Dilatação de prazo'
};

function ordemDeChegada(left, right) {
  const a = left.solicitado_em ? new Date(left.solicitado_em).getTime() : 0;
  const b = right.solicitado_em ? new Date(right.solicitado_em).getTime() : 0;
  return a - b;
}

/*
  Fila de decisões do administrador (Fase 4). Reaberturas e dilatações
  pendentes juntas, mais antiga primeiro, no topo da tela — é para cá que vai
  o pedido do engenheiro. Some quando não há pedido; decide-se aqui mesmo.
*/
export default function CrFilaDecisoes({ versao = 0, onOpenMonth, onDecided }) {
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [expandida, setExpandida] = useState(false);
  const estreita = useTelaEstreita();
  const carregadosRef = useRef(0);
  const [estado, setEstado] = useState('carregando');
  const [aviso, setAviso] = useState(null);
  const [decidindo, setDecidindo] = useState(null);
  const decidindoRef = useRef(false);

  // Recarrega tantas páginas quantas já estavam na tela (a atualização de
  // minuto em minuto não desfaz o "Carregar mais"). Conta pelo `total`.
  const load = useCallback(async () => {
    try {
      const alvo = Math.max(carregadosRef.current, 1);
      let lista = [];
      let totalServidor = 0;
      do {
        // eslint-disable-next-line no-await-in-loop
        const response = await listarDecisoesPendentes({ limit: PAGINA, offset: lista.length });
        const novos = Array.isArray(response?.items) ? response.items : [];
        lista = [...lista, ...novos];
        const informado = Number(response?.total);
        totalServidor = Number.isFinite(informado) && informado >= lista.length ? informado : lista.length;
        if (!novos.length) break;
      } while (lista.length < alvo && lista.length < totalServidor);
      carregadosRef.current = lista.length;
      setItems(lista.sort(ordemDeChegada));
      setTotal(totalServidor);
      setEstado('pronto');
    } catch (error) {
      carregadosRef.current = 0;
      setItems([]);
      setTotal(0);
      setEstado(consultaIndisponivel(error) ? 'indisponivel' : 'erro');
    }
  }, []);

  async function carregarMais() {
    if (carregandoMais) return;
    setCarregandoMais(true);
    try {
      const response = await listarDecisoesPendentes({ limit: PAGINA, offset: items.length });
      const novos = Array.isArray(response?.items) ? response.items : [];
      const lista = [...items, ...novos].sort(ordemDeChegada);
      const informado = Number(response?.total);
      carregadosRef.current = lista.length;
      setItems(lista);
      setTotal(Number.isFinite(informado) && informado >= lista.length ? informado : lista.length);
    } catch (error) {
      setAviso({ id: 'fila', tipo: 'error', mensagem: mensagemLegivel(error, 'Não foi possível carregar mais pedidos.') });
    } finally {
      setCarregandoMais(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(timer);
  }, [load, versao]);

  async function decidir(item, decisao) {
    if (decidindoRef.current) return;
    const alvo = item;
    const aprovar = decisao === 'APROVADA';
    const tipo = alvo.tipo;
    const detalhe = tipo === 'DILATACAO' && alvo.dias ? ` · ${alvo.dias} dia(s)` : '';
    const { ok, texto } = await confirmar({
      titulo: `${aprovar ? 'Aprovar' : 'Negar'} ${tipo === 'DILATACAO' ? 'dilatação' : 'reabertura'}`,
      mensagem: `${rotuloObra(alvo.obra)} · ${monthLabel(alvo.competencia)}${detalhe}. Motivo: ${alvo.motivo || '—'}`,
      rotuloConfirmar: aprovar ? 'Aprovar' : 'Negar',
      destrutiva: !aprovar,
      // O servidor não exige justificativa para aprovar nem para negar;
      // quando informada, fica na auditoria da decisão.
      campo: { rotulo: 'Justificativa (opcional)', multilinha: true }
    });
    if (!ok) return;
    decidindoRef.current = true;
    setDecidindo(`${tipo}-${alvo.id}`);
    try {
      if (tipo === 'DILATACAO') {
        await decidirDilatacao(alvo.id, decisao, texto);
      } else {
        await decidirReabertura(alvo.id, decisao, texto);
      }
      setAviso({
        id: 'fila',
        tipo: 'success',
        mensagem: `${TIPO_LABEL[tipo]} ${aprovar ? 'aprovada' : 'negada'}: ${rotuloObra(alvo.obra)}, ${monthLabel(alvo.competencia)}.`
      });
      await load();
      onDecided?.();
    } catch (error) {
      setAviso({ id: 'fila', tipo: 'error', mensagem: mensagemLegivel(error, 'Não foi possível registrar a decisão.') });
    } finally {
      decidindoRef.current = false;
      setDecidindo(null);
    }
  }

  if (estado === 'carregando' || (estado === 'pronto' && total === 0 && items.length === 0 && !aviso)) {
    return elementoConfirmacao;
  }

  if (estado !== 'pronto') {
    // Dentro de um bloco (B5): texto solto na pagina nao tem dono visual.
    return (
      <BlocoConteudo className="cr-fila-decisoes" titulo="Decisões pendentes">
        <p className="cr-fila-indisponivel" role="status">
          {estado === 'indisponivel'
            ? 'Fila de decisões indisponível no servidor no momento.'
            : 'Não foi possível consultar a fila de decisões.'}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}>
            Tentar novamente
          </button>
        </p>
      </BlocoConteudo>
    );
  }

  return (
    <>
    <BlocoConteudo
      className="cr-fila-decisoes"
      titulo="Decisões pendentes"
      contagem={items.length < total
        ? `${total} pedido(s) aguardando decisão · mostrando ${items.length}`
        : `${total} pedido(s) aguardando decisão`}
      variante="primario"
      cor="var(--sem-warning)"
      recolhivel={estreita}
      recolhido={estreita && !expandida}
      aoAlternarRecolhido={(proximo) => setExpandida(!proximo)}
    >
      <Avisos avisos={aviso ? [aviso] : []} aoFechar={() => setAviso(null)} />
      {items.length ? (
        <TabelaPadrao
          colunas={[
            {
              id: 'pedido',
              titulo: 'Pedido',
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => (
                <CelulaDupla
                  principal={rotuloObra(item.obra)}
                  sub={`${TIPO_LABEL[item.tipo] || item.tipo} · ${monthLabel(item.competencia)}`}
                />
              )
            },
            {
              id: 'detalhe',
              titulo: 'Prazo',
              tipo: 'texto',
              render: (item) => (item.tipo === 'DILATACAO'
                ? `+${item.dias || 0} dia(s)${item.prazo_vigente ? ` · vence ${formatarDataHora(item.prazo_vigente)}` : ''}`
                : 'Reabre por 24 horas')
            },
            { id: 'motivo', titulo: 'Motivo', tipo: 'texto', render: (item) => item.motivo || '—' },
            {
              id: 'solicitado',
              titulo: 'Solicitado',
              tipo: 'texto',
              render: (item) => (
                <CelulaDupla
                  principal={item.solicitado_por?.nome || '—'}
                  sub={formatarDataHora(item.solicitado_em)}
                />
              )
            }
          ]}
          itens={items}
          getId={(item) => `${item.tipo}-${item.id}`}
          storageKey="tabela:custos-recebiveis-fila-decisoes"
          rotuloRolagem="Decisões pendentes"
          vazio="Nenhuma decisão pendente."
          acoesLinha={(item) => {
            const chave = `${item.tipo}-${item.id}`;
            return (
              <>
                <button type="button" className="btn btn-outline" onClick={() => onOpenMonth?.(item)}>
                  Abrir mês
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={Boolean(decidindo)}
                  onClick={() => decidir(item, 'NEGADA')}
                >
                  Negar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={Boolean(decidindo)}
                  onClick={() => decidir(item, 'APROVADA')}
                >
                  {decidindo === chave ? 'Enviando...' : 'Aprovar'}
                </button>
              </>
            );
          }}
          larguraAcoes={300}
        />
      ) : (
        <p className="cr-fila-vazia">Nenhuma decisão pendente.</p>
      )}
      {items.length < total ? (
        <div className="cr-faixa-mais">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={carregandoMais}
            onClick={() => void carregarMais()}
          >
            {carregandoMais ? 'Carregando...' : `Carregar mais (${items.length} de ${total})`}
          </button>
        </div>
      ) : null}
    </BlocoConteudo>
    {elementoConfirmacao}
    </>
  );
}
