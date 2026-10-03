import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avisos,
  BlocoConteudo,
  CelulaDupla,
  TabelaPadrao,
  useConfirmacao
} from '../../../components/padrao';
import { decidirDilatacao, listarDilatacoes, mensagemLegivel } from '../services/custosRecebiveis';
import { monthLabel } from '../utils/prazos';

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo'
});

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? dateTime.format(date) : '—';
}

const SITUACAO = { SOLICITADA: 'Aguardando', APROVADA: 'Aprovada', NEGADA: 'Negada' };

/*
  Dilatações de prazo da medição aprovada (29/09/2026). Pedidos pendentes em
  ordem de chegada; cada um mostra o histórico da obra (por mês e no período
  todo) antes da decisão. A fila entra no topo do administrador na Fase 4.
*/
export default function CrDilatacoesView({ canDecide = false, onDecided, versao = 0 }) {
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyObra, setHistoryObra] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [aviso, setAviso] = useState(null);
  const [deciding, setDeciding] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await listarDilatacoes({ situacao: 'SOLICITADA' });
      setItems(Array.isArray(response?.items) ? response.items : []);
    } catch (error) {
      setAviso({ id: 'dilatacoes', tipo: 'error', mensagem: mensagemLegivel(error, 'Erro ao carregar dilatações.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, versao]);

  async function openHistory(obraRef) {
    setHistoryObra(obraRef);
    setHistoryItems([]);
    try {
      const response = await listarDilatacoes({ obra_id: obraRef.id });
      setHistoryItems(Array.isArray(response?.items) ? response.items : []);
    } catch (error) {
      setAviso({ id: 'dilatacoes', tipo: 'error', mensagem: mensagemLegivel(error, 'Erro ao carregar o histórico.') });
    }
  }

  const pending = useMemo(() => items.filter((item) => item.situacao === 'SOLICITADA'), [items]);
  const history = useMemo(() => {
    if (!historyObra) return null;
    const rows = historyItems;
    const approvedDays = rows.filter((item) => item.situacao === 'APROVADA')
      .reduce((sum, item) => sum + Number(item.dias || 0), 0);
    const byMonth = new Map();
    rows.forEach((item) => {
      const entry = byMonth.get(item.competencia) || { pedidos: 0, aprovados: 0, dias: 0 };
      entry.pedidos += 1;
      if (item.situacao === 'APROVADA') {
        entry.aprovados += 1;
        entry.dias += Number(item.dias || 0);
      }
      byMonth.set(item.competencia, entry);
    });
    return { rows, approvedDays, byMonth: [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a)) };
  }, [historyObra, historyItems]);

  async function decide(item, decisao) {
    const alvo = item;
    if (deciding) return;
    const { ok, texto } = await confirmar({
      titulo: decisao === 'APROVADA' ? 'Aprovar dilatação' : 'Negar dilatação',
      mensagem: `${alvo.obra?.nome} · ${monthLabel(alvo.competencia)}: ${alvo.dias} dia(s). ${alvo.motivo}`,
      rotuloConfirmar: decisao === 'APROVADA' ? 'Aprovar' : 'Negar',
      destrutiva: decisao === 'NEGADA',
      campo: { rotulo: 'Observação (opcional)', multilinha: true }
    });
    if (!ok) return;
    try {
      setDeciding(alvo.id);
      await decidirDilatacao(alvo.id, decisao, texto);
      setAviso({
        id: 'dilatacoes',
        tipo: 'success',
        mensagem: decisao === 'APROVADA' ? 'Dilatação aprovada.' : 'Dilatação negada.'
      });
      await load();
      onDecided?.();
      if (historyObra?.id === alvo.obra_id) await openHistory(historyObra);
    } catch (error) {
      setAviso({ id: 'dilatacoes', tipo: 'error', mensagem: mensagemLegivel(error, 'Erro ao decidir dilatação.') });
    } finally {
      setDeciding(null);
    }
  }

  return (
    <BlocoConteudo titulo="Dilatações de prazo" contagem={`${pending.length} aguardando`}>
      <Avisos avisos={aviso ? [aviso] : []} aoFechar={() => setAviso(null)} />
      <TabelaPadrao
        colunas={[
          {
            id: 'obra',
            titulo: 'Obra',
            tipo: 'identidade',
            noCard: 'titulo',
            render: (item) => (
              <CelulaDupla
                principal={`${item.obra?.codigo || item.obra_id} · ${item.obra?.nome || ''}`}
                sub={`Medição de ${monthLabel(item.competencia)}`}
              />
            )
          },
          { id: 'dias', titulo: 'Dias', tipo: 'texto', render: (item) => `${item.dias} dia(s)` },
          { id: 'motivo', titulo: 'Motivo', tipo: 'texto', render: (item) => item.motivo },
          {
            id: 'solicitante',
            titulo: 'Pedido',
            tipo: 'texto',
            render: (item) => `${item.solicitante?.nome || '—'} · ${formatDate(item.solicitado_em)}`
          }
        ]}
        itens={pending}
        getId={(item) => item.id}
        storageKey="tabela:custos-recebiveis-dilatacoes"
        rotuloRolagem="Dilatações aguardando decisão"
        carregando={loading}
        vazio="Nenhuma dilatação aguardando decisão."
        acoesLinha={(item) => (
          <>
            <button type="button" className="btn btn-outline" onClick={() => openHistory(item.obra || { id: item.obra_id })}>
              Histórico
            </button>
            {canDecide ? (
              <>
                <button type="button" className="btn btn-outline" disabled={deciding === item.id} onClick={() => decide(item, 'NEGADA')}>
                  Negar
                </button>
                <button type="button" className="btn btn-primary" disabled={deciding === item.id} onClick={() => decide(item, 'APROVADA')}>
                  Aprovar
                </button>
              </>
            ) : null}
          </>
        )}
        larguraAcoes={canDecide ? 300 : 130}
      />
      {history ? (
        <section className="cr-dilatacao-historico" aria-label="Histórico de dilatações da obra">
          <header>
            <strong>{historyObra.codigo || historyObra.id} · {historyObra.nome}</strong>
            <span>
              {history.rows.length} pedido(s) · {history.approvedDays} dia(s) concedidos no período
            </span>
            <button type="button" className="btn btn-outline" onClick={() => setHistoryObra(null)}>Fechar</button>
          </header>
          <ul className="cr-dilatacao-historico__meses">
            {history.byMonth.map(([competencia, entry]) => (
              <li key={competencia}>
                <strong>{monthLabel(competencia)}</strong>
                <span>{entry.pedidos} pedido(s) · {entry.aprovados} aprovado(s) · {entry.dias} dia(s)</span>
              </li>
            ))}
          </ul>
          <TabelaPadrao
            colunas={[
              { id: 'mes', titulo: 'Mês', tipo: 'identidade', noCard: 'titulo', render: (item) => monthLabel(item.competencia) },
              { id: 'dias', titulo: 'Dias', tipo: 'texto', render: (item) => `${item.dias}` },
              {
                id: 'situacao',
                titulo: 'Situação',
                tipo: 'badge',
                render: (item) => <span className="cr-status-pill" data-status={item.situacao}>{SITUACAO[item.situacao]}</span>
              },
              { id: 'motivo', titulo: 'Motivo', tipo: 'texto', render: (item) => item.motivo },
              {
                id: 'decisao',
                titulo: 'Decisão',
                tipo: 'texto',
                render: (item) => (item.decidido_em
                  ? `${item.decisor?.nome || '—'} · ${formatDate(item.decidido_em)}${item.prazo_novo ? ` · novo prazo ${formatDate(item.prazo_novo)}` : ''}`
                  : '—')
              }
            ]}
            itens={[...history.rows].reverse()}
            getId={(item) => item.id}
            storageKey="tabela:custos-recebiveis-dilatacoes-historico"
            rotuloRolagem="Histórico de dilatações"
          />
        </section>
      ) : null}
      {elementoConfirmacao}
    </BlocoConteudo>
  );
}
