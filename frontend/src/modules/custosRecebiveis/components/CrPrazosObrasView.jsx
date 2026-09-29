import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avisos,
  useConfirmacao,
  BarraFiltros,
  BlocoConteudo,
  CampoForm,
  CelulaDupla,
  FormSecao,
  TabelaPadrao
} from '../../../components/padrao';
import { listarPrazosObras, salvarPrazosObra } from '../services/custosRecebiveis';

/*
  Prazos por obra (reforma de 29/09/2026, Fase 2). Padrão: planejamento do
  dia 25 do mês anterior ao dia 5 do mês; medição aprovada em 40 dias a partir
  do dia 1º. O administrador ajusta por obra; "Restaurar padrão" apaga o
  ajuste. O servidor valida os limites e registra a auditoria.
*/
function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('pt-BR');
}

export default function CrPrazosObrasView() {
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setData(await listarPrazosObras());
    } catch (error) {
      setAviso({ id: 'prazos', tipo: 'error', mensagem: error.message || 'Erro ao carregar prazos.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const limites = data?.limites || {};
  const itens = useMemo(() => {
    const query = normalize(busca);
    return (data?.items || []).filter((item) => !query
      || normalize(item.obra?.nome).includes(query)
      || normalize(item.obra?.codigo).includes(query));
  }, [busca, data?.items]);

  function startEdit(item) {
    setEditing(item);
    setDraft({
      planejamento_dia_abertura: item.planejamento_dia_abertura,
      planejamento_dia_fechamento: item.planejamento_dia_fechamento,
      medicao_prazo_dias: item.medicao_prazo_dias
    });
    setAviso(null);
  }

  async function save(payload) {
    const obraAlvo = editing?.obra;
    if (!obraAlvo || saving) return;
    // O prazo vale para todos os meses da obra, inclusive os já passados
    // (contadores e obrigações são recalculados).
    const { ok } = await confirmar({
      titulo: payload.padrao ? 'Restaurar prazos padrão' : 'Salvar prazos da obra',
      mensagem: `${obraAlvo.nome}: os novos prazos passam a valer para todos os meses da obra, inclusive os já registrados.`,
      rotuloConfirmar: payload.padrao ? 'Restaurar padrão' : 'Salvar prazos'
    });
    if (!ok) return;
    try {
      setSaving(true);
      await salvarPrazosObra(obraAlvo.id, payload);
      setAviso({ id: 'prazos', tipo: 'success', mensagem: `Prazos de ${obraAlvo.nome} salvos.` });
      setEditing(null);
      await load();
    } catch (error) {
      setAviso({ id: 'prazos', tipo: 'error', mensagem: error.message || 'Erro ao salvar prazos.' });
    } finally {
      setSaving(false);
    }
  }

  const numberField = (key, label, [min, max] = []) => (
    <CampoForm label={label} obrigatorio hint={min ? `De ${min} a ${max}` : undefined}>
      <input
        className="input w-full"
        type="number"
        min={min}
        max={max}
        step={1}
        value={draft[key] ?? ''}
        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
      />
    </CampoForm>
  );

  return (
    <BlocoConteudo titulo="Prazos por obra" contagem={`${itens.length} obra(s)`}>
      <Avisos avisos={aviso ? [aviso] : []} aoFechar={() => setAviso(null)} />
      {editing ? (
        <form
          className="cr-prazos-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save(Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, Number(value)])));
          }}
        >
          <FormSecao legenda={`${editing.obra?.codigo || editing.obra?.id} · ${editing.obra?.nome}`} colunas={3}>
            {numberField('planejamento_dia_abertura', 'Planejamento abre no dia (mês anterior)', limites.planejamento_dia_abertura)}
            {numberField('planejamento_dia_fechamento', 'Planejamento fecha no dia (mês da competência)', limites.planejamento_dia_fechamento)}
            {numberField('medicao_prazo_dias', 'Medição aprovada: dias a partir do dia 1º', limites.medicao_prazo_dias)}
          </FormSecao>
          <div className="cr-prazos-form__acoes">
            <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setEditing(null)}>
              Cancelar
            </button>
            {editing.personalizado ? (
              <button type="button" className="btn btn-outline" disabled={saving} onClick={() => save({ padrao: true })}>
                Restaurar padrão
              </button>
            ) : null}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar prazos'}
            </button>
          </div>
        </form>
      ) : null}
      <BarraFiltros busca={{ valor: busca, aoMudar: setBusca, placeholder: 'Nome ou código da obra' }} />
      <TabelaPadrao
        colunas={[
          {
            id: 'obra',
            titulo: 'Obra',
            tipo: 'identidade',
            noCard: 'titulo',
            render: (item) => (
              <CelulaDupla
                principal={`${item.obra?.codigo || item.obra?.id} · ${item.obra?.nome}`}
                sub={String(item.obra?.classificacao || '').toUpperCase() === 'PUBLICA' ? 'Obra pública' : 'Obra privada'}
              />
            )
          },
          {
            id: 'janela',
            titulo: 'Planejamento',
            tipo: 'texto',
            render: (item) => `dia ${item.planejamento_dia_abertura} (mês anterior) a dia ${item.planejamento_dia_fechamento}`
          },
          {
            id: 'medicao',
            titulo: 'Medição aprovada',
            tipo: 'texto',
            render: (item) => (String(item.obra?.classificacao || '').toUpperCase() === 'PUBLICA'
              ? `${item.medicao_prazo_dias} dias do dia 1º`
              : '—')
          },
          {
            id: 'origem',
            titulo: 'Origem',
            tipo: 'badge',
            render: (item) => (
              <span className="cr-status-pill" data-status={item.personalizado ? 'ABERTO' : 'NEUTRO'}>
                {item.personalizado ? 'Ajustado' : 'Padrão'}
              </span>
            )
          }
        ]}
        itens={itens}
        getId={(item) => item.obra?.id}
        storageKey="tabela:custos-recebiveis-prazos-obras"
        rotuloRolagem="Prazos por obra"
        carregando={loading}
        acoesLinha={(item) => (
          <button type="button" className="btn btn-outline" onClick={() => startEdit(item)}>
            Editar
          </button>
        )}
        larguraAcoes={120}
      />
      {elementoConfirmacao}
    </BlocoConteudo>
  );
}
