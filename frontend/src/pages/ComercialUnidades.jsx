import { useEffect, useMemo, useState } from 'react';
import ParceiroAutocomplete from '../components/ui/ParceiroAutocomplete';
import { buscarParceiros } from '../services/parceiros';
import {
  atualizarUnidadeComercial,
  atualizarConfiguracaoUnidadesComerciais,
  criarUnidadeComercial,
  getConfiguracaoUnidadesComerciais,
  getEmpreendimentosComerciais,
  getUnidadesComerciais
} from '../services/comercial';
import { formatCurrencyInput, normalizeCurrencyTyping } from '../utils/formatters';

const SITUACOES = ['DISPONIVEL', 'RESERVADA', 'VENDIDA', 'DISTRATADA', 'BLOQUEADA'];

function defaultForm() {
  return {
    id: null,
    empreendimento_id: '',
    parceiro_reserva_id: '',
    codigo: '',
    nome: '',
    torre: '',
    pavimento: '',
    metragem_privativa: '',
    fracao_ideal: '',
    valor_tabela: '',
    valor_base_venda: '',
    situacao: 'DISPONIVEL',
    reservado_ate: '',
    observacoes: '',
    ativo: true
  };
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function pickForm(item = {}) {
  return {
    id: item.id || null,
    empreendimento_id: item.empreendimento_id ? String(item.empreendimento_id) : '',
    parceiro_reserva_id: item.parceiro_reserva_id ? String(item.parceiro_reserva_id) : '',
    codigo: String(item.codigo || '').replace(/\D/g, ''),
    nome: item.nome || '',
    torre: item.torre || '',
    pavimento: item.pavimento || '',
    metragem_privativa: item.metragem_privativa || '',
    fracao_ideal: item.fracao_ideal || '',
    valor_tabela: formatCurrencyInput(item.valor_tabela),
    valor_base_venda: formatCurrencyInput(item.valor_base_venda),
    situacao: item.situacao || 'DISPONIVEL',
    reservado_ate: item.reservado_ate || '',
    observacoes: item.observacoes || '',
    ativo: item.ativo !== false
  };
}

function statusClass(status) {
  switch (String(status || '').toUpperCase()) {
    case 'DISPONIVEL':
      return 'bg-emerald-100 text-emerald-700';
    case 'RESERVADA':
      return 'bg-amber-100 text-amber-700';
    case 'VENDIDA':
      return 'bg-blue-100 text-blue-700';
    case 'BLOQUEADA':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

export default function ComercialUnidades() {
  const [form, setForm] = useState(defaultForm());
  const [busca, setBusca] = useState('');
  const [filtroEmpreendimento, setFiltroEmpreendimento] = useState('');
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [permitirVendaManual, setPermitirVendaManual] = useState(false);
  const [error, setError] = useState('');

  async function carregar() {
    try {
      setLoading(true);
      setError('');
      const [empreendimentosData, clientesData, unidadesData, configuracaoData] = await Promise.all([
        getEmpreendimentosComerciais({ ativo: 1 }),
        buscarParceiros({ cliente: 1, ativo: 1, limit: 'all' }),
        getUnidadesComerciais(),
        getConfiguracaoUnidadesComerciais()
      ]);
      setEmpreendimentos(Array.isArray(empreendimentosData) ? empreendimentosData : []);
      setClientes(Array.isArray(clientesData) ? clientesData : []);
      setUnidades(Array.isArray(unidadesData) ? unidadesData : []);
      setPermitirVendaManual(Boolean(configuracaoData?.permitir_venda_manual));
    } catch (err) {
      setError(err?.message || 'Erro ao carregar unidades comerciais');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const listaFiltrada = useMemo(() => {
    const termo = normalizeSearch(busca);
    return unidades.filter((item) => {
      if (filtroEmpreendimento && String(item.empreendimento_id) !== filtroEmpreendimento) {
        return false;
      }

      if (!termo) {
        return true;
      }

      const blob = normalizeSearch([
        item.codigo,
        item.nome,
        item.torre,
        item.fracao_ideal,
        item.empreendimento?.nome,
        item.parceiroReserva?.nome
      ].filter(Boolean).join(' '));

      return blob.includes(termo);
    });
  }, [busca, filtroEmpreendimento, unidades]);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');

      const payload = {
        empreendimento_id: Number(form.empreendimento_id),
        parceiro_reserva_id: form.parceiro_reserva_id ? Number(form.parceiro_reserva_id) : undefined,
        codigo: form.codigo,
        nome: form.nome,
        torre: form.torre,
        pavimento: form.pavimento,
        metragem_privativa: form.metragem_privativa || undefined,
        fracao_ideal: form.fracao_ideal || undefined,
        valor_tabela: form.valor_tabela || undefined,
        valor_base_venda: form.valor_base_venda || undefined,
        situacao: form.situacao,
        reservado_ate: form.reservado_ate || undefined,
        observacoes: form.observacoes,
        ativo: form.ativo
      };

      if (form.id) {
        await atualizarUnidadeComercial(form.id, payload);
      } else {
        await criarUnidadeComercial(payload);
      }

      setForm(defaultForm());
      await carregar();
    } catch (err) {
      setError(err?.message || 'Erro ao salvar unidade comercial');
    } finally {
      setSaving(false);
    }
  }

  async function handleVendaManualChange(checked) {
    try {
      setSavingConfig(true);
      setError('');
      const data = await atualizarConfiguracaoUnidadesComerciais({ permitir_venda_manual: checked });
      setPermitirVendaManual(Boolean(data?.permitir_venda_manual));
    } catch (err) {
      setError(err?.message || 'Erro ao atualizar a configuracao de venda manual.');
    } finally {
      setSavingConfig(false);
    }
  }

  return (
    <div className="page solicitacoes-page space-y-5 md:space-y-6">
      <header className="app-page-header">
        <div className="app-page-header-row">
          <div>
            <h1 className="text-xl font-semibold md:text-2xl">Unidades comerciais</h1>
            <p className="page-subtitle">
              Controle disponibilidade, reservas, valores de tabela e base de venda por empreendimento.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm text-[var(--c-text)]">
            <input
              type="checkbox"
              checked={permitirVendaManual}
              onChange={(event) => handleVendaManualChange(event.target.checked)}
              disabled={savingConfig}
            />
            Permitir marcar unidade como Vendida manualmente
          </label>
        </div>
      </header>

      {error && (
        <div className="app-alert app-alert--error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="app-empty-card">Carregando unidades comerciais...</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[460px_minmax(0,1fr)]">
          <section className="sol-surface-card rounded-2xl p-4 md:p-5">
            <h2 className="text-lg font-semibold text-[var(--c-text)]">
              {form.id ? 'Editar unidade' : 'Nova unidade'}
            </h2>

            <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
              <label className="sol-filter-field">
                <span className="sol-filter-label">Empreendimento</span>
                <select
                  className="input w-full"
                  value={form.empreendimento_id}
                  onChange={(event) => setForm((current) => ({ ...current, empreendimento_id: event.target.value }))}
                  required
                >
                  <option value="">Selecione</option>
                  {empreendimentos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.codigo ? `${item.codigo} - ${item.nome}` : item.nome}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Codigo</span>
                  <input
                    className="input w-full"
                    inputMode="numeric"
                    pattern="[0-9]+"
                    value={form.codigo}
                    onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value.replace(/\D/g, '') }))}
                    required
                    placeholder="Ex.: 101"
                  />
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Nome</span>
                  <input
                    className="input w-full"
                    value={form.nome}
                    onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                    placeholder="Cobertura, loja, lote..."
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Torre</span>
                  <input className="input w-full" value={form.torre} onChange={(event) => setForm((current) => ({ ...current, torre: event.target.value }))} />
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Pavimento</span>
                  <input className="input w-full" value={form.pavimento} onChange={(event) => setForm((current) => ({ ...current, pavimento: event.target.value }))} />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Metragem privativa</span>
                  <input className="input w-full" type="number" step="0.01" value={form.metragem_privativa} onChange={(event) => setForm((current) => ({ ...current, metragem_privativa: event.target.value }))} />
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Fracao ideal</span>
                  <input className="input w-full" type="number" step="0.000001" value={form.fracao_ideal} onChange={(event) => setForm((current) => ({ ...current, fracao_ideal: event.target.value }))} />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Valor tabela</span>
                  <input className="input w-full" inputMode="decimal" value={form.valor_tabela} onChange={(event) => setForm((current) => ({ ...current, valor_tabela: normalizeCurrencyTyping(event.target.value) }))} onBlur={(event) => setForm((current) => ({ ...current, valor_tabela: formatCurrencyInput(event.target.value) }))} placeholder="R$ 0,00" />
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Valor base de venda</span>
                  <input className="input w-full" inputMode="decimal" value={form.valor_base_venda} onChange={(event) => setForm((current) => ({ ...current, valor_base_venda: normalizeCurrencyTyping(event.target.value) }))} onBlur={(event) => setForm((current) => ({ ...current, valor_base_venda: formatCurrencyInput(event.target.value) }))} placeholder="R$ 0,00" />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Situacao</span>
                  <select
                    className="input w-full"
                    value={form.situacao}
                    onChange={(event) => setForm((current) => ({ ...current, situacao: event.target.value }))}
                  >
                    {SITUACOES.filter((item) => item !== 'VENDIDA' || permitirVendaManual || form.situacao === 'VENDIDA').map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  {!permitirVendaManual && form.situacao !== 'VENDIDA' && (
                    <span className="mt-1 text-xs text-[var(--c-muted)]">Vendida e definida automaticamente ao vincular um contrato.</span>
                  )}
                </label>
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Reservado ate</span>
                  <input
                    className="input w-full"
                    type="date"
                    value={form.reservado_ate}
                    onChange={(event) => setForm((current) => ({ ...current, reservado_ate: event.target.value }))}
                  />
                </label>
              </div>

              <div className="sol-filter-field">
                <ParceiroAutocomplete
                  label="Cliente da reserva"
                  value={form.parceiro_reserva_id}
                  options={clientes}
                  onChange={(parceiroId) => setForm((current) => ({ ...current, parceiro_reserva_id: parceiroId }))}
                  placeholder="Digite nome, CPF/CNPJ ou e-mail"
                  emptyLabel="Nenhum cliente encontrado"
                  showOptionsOnFocus
                  resultLimit={8}
                />
                <span className="mt-1 text-xs text-[var(--c-muted)]">
                  Campo opcional. Apague a busca para deixar a unidade sem reserva vinculada.
                </span>
              </div>

              <label className="sol-filter-field">
                <span className="sol-filter-label">Observacoes</span>
                <textarea
                  className="input min-h-[96px] w-full"
                  value={form.observacoes}
                  onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))}
                  placeholder="Pendencias, restricoes ou detalhes da unidade"
                />
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-[var(--c-text)]">
                <input type="checkbox" checked={form.ativo} onChange={(event) => setForm((current) => ({ ...current, ativo: event.target.checked }))} />
                Unidade ativa
              </label>

              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : (form.id ? 'Salvar alteracoes' : 'Criar unidade')}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setForm(defaultForm())}>
                  Limpar
                </button>
              </div>
            </form>
          </section>

          <section className="sol-surface-card rounded-2xl p-4 md:p-5">
            <div className="sol-filtros-head">
              <div>
                <p className="sol-filtros-title">Unidades cadastradas</p>
                <p className="sol-filtros-subtitle">
                  Base para reserva, venda, distrato e carteira de recebimentos.
                </p>
              </div>
              <div className="sol-filtros-meta">
                <span>Total listado {listaFiltrada.length}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
              <label className="sol-filter-field">
                <span className="sol-filter-label">Empreendimento</span>
                <select className="input w-full" value={filtroEmpreendimento} onChange={(event) => setFiltroEmpreendimento(event.target.value)}>
                  <option value="">Todos</option>
                  {empreendimentos.map((item) => (
                    <option key={item.id} value={item.id}>{item.nome}</option>
                  ))}
                </select>
              </label>

              <label className="sol-filter-field">
                <span className="sol-filter-label">Busca</span>
                <input className="input w-full" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Codigo, torre, pavimento, reserva ou empreendimento" />
              </label>
            </div>

            <div className="mt-4 space-y-3">
              {listaFiltrada.length === 0 ? (
                <div className="app-empty-card">Nenhuma unidade comercial encontrada.</div>
              ) : (
                listaFiltrada.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-[var(--c-text)]">
                            {item.codigo} {item.nome ? `- ${item.nome}` : ''}
                          </h3>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(item.situacao)}`}>
                            {item.situacao}
                          </span>
                        </div>
                        <div className="grid gap-2 text-sm text-[var(--c-muted)] md:grid-cols-2">
                          <span>Empreendimento: {item.empreendimento?.nome || '-'}</span>
                          <span>Torre: {item.torre || '-'}</span>
                          <span>Pavimento: {item.pavimento || '-'}</span>
                          <span>Metragem privativa: {item.metragem_privativa || '-'}</span>
                          <span>Fracao ideal: {item.fracao_ideal || '-'}</span>
                          <span>Reserva: {item.parceiroReserva?.nome || '-'}</span>
                          <span>Reservado ate: {item.reservado_ate || '-'}</span>
                          <span>Valor tabela: {item.valor_tabela ? formatCurrency(item.valor_tabela) : '-'}</span>
                          <span>Base venda: {item.valor_base_venda ? formatCurrency(item.valor_base_venda) : '-'}</span>
                        </div>
                        {item.observacoes && (
                          <p className="text-sm text-[var(--c-muted)]">{item.observacoes}</p>
                        )}
                      </div>

                      <button type="button" className="btn btn-outline" onClick={() => setForm(pickForm(item))}>
                        Editar
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
