import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineBuildingOffice2,
  HiOutlineMapPin,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlinePower,
  HiOutlineArrowRight
} from 'react-icons/hi2';
import {
  getObras,
  getObrasGestao,
  criarObra,
  atualizarObra,
  ativarObra,
  desativarObra
} from '../services/obras';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import { useAuth } from '../contexts/AuthContext';
import { canAccessGestaoObras, isBusinessAdmin } from '../utils/acessoProduto';

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function parseBRLInput(raw) {
  // aceita tanto "1.500.000,00" quanto "1500000.00"
  const stripped = String(raw).trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(stripped);
  return Number.isFinite(num) ? num : null;
}

function CurrencyInput({ value, onChange, placeholder, className }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const inputRef = useRef(null);

  const formatted = value !== '' && value != null
    ? Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  function handleFocus() {
    setEditing(true);
    setRaw(value !== '' && value != null ? String(Number(value)) : '');
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function handleBlur() {
    setEditing(false);
    const num = parseBRLInput(raw);
    onChange(num != null ? String(num) : '');
  }

  return (
    <div className="relative flex items-center">
      <span className="pointer-events-none absolute left-3 select-none text-sm" style={{ color: 'var(--c-muted)' }}>R$</span>
      <input
        ref={inputRef}
        className={`${className} pl-9`}
        value={editing ? raw : formatted}
        onChange={(e) => setRaw(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        inputMode="decimal"
      />
    </div>
  );
}

function PercentInput({ value, onChange, placeholder, className }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const inputRef = useRef(null);

  const formatted = value !== '' && value != null
    ? Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  function handleFocus() {
    setEditing(true);
    setRaw(value !== '' && value != null ? String(Number(value)) : '');
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function handleBlur() {
    setEditing(false);
    const clean = String(raw).replace(',', '.');
    const num = parseFloat(clean);
    if (Number.isFinite(num)) {
      onChange(String(Math.min(100, Math.max(0, num))));
    } else {
      onChange('');
    }
  }

  return (
    <div className="relative flex items-center">
      <input
        ref={inputRef}
        className={`${className} pr-8`}
        value={editing ? raw : formatted}
        onChange={(e) => setRaw(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        inputMode="decimal"
      />
      <span className="pointer-events-none absolute right-3 select-none text-sm" style={{ color: 'var(--c-muted)' }}>%</span>
    </div>
  );
}

function getExecucaoPercentual(orcado, executado) {
  const base = Number(orcado || 0);
  if (base <= 0) return 0;
  return Math.max(0, Math.min(100, Number(((Number(executado || 0) / base) * 100).toFixed(1))));
}

function getLucroPrejuizoColor(value) {
  const numero = Number(value || 0);
  if (numero > 0) return '#10b981';
  if (numero < 0) return '#ef4444';
  return 'var(--c-text)';
}

function isCadastroObra(obra) {
  return String(obra?.tipo_centro_custo || 'OBRA').trim().toUpperCase() === 'OBRA';
}

function getTipoCadastroLabel(obra) {
  return isCadastroObra(obra) ? 'Obra' : 'Centro de custo';
}

function initialFormState() {
  return {
    id: null,
    tipo_centro_custo: 'OBRA',
    empresa_grupo_id: '',
    codigo: '',
    nome: '',
    cidade: '',
    cno: '',
    endereco_logradouro: '',
    endereco_numero: '',
    endereco_complemento: '',
    endereco_bairro: '',
    endereco_cep: '',
    endereco_uf: '',
    classificacao: '',
    vgv: '',
    planilha_geral: '',
    margem_custo_esperada: ''
  };
}

export default function Obras() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [obras, setObras] = useState([]);
  const [empresasGrupo, setEmpresasGrupo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState(initialFormState());

  const podeGerenciarCadastro = isBusinessAdmin(user);
  const gestaoObrasHabilitada = canAccessGestaoObras(user);

  useEffect(() => {
    carregarObras();
    carregarEmpresasGrupo();
  }, [gestaoObrasHabilitada]);

  async function carregarEmpresasGrupo() {
    try {
      const data = await getEmpresasGrupo({ ativo: true });
      setEmpresasGrupo(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    }
  }

  async function carregarObras() {
    try {
      setLoading(true);
      const cadastrosData = await getObras({ escopo: 'TODOS' });
      let lista = Array.isArray(cadastrosData) ? cadastrosData : [];

      if (gestaoObrasHabilitada) {
        const gestaoData = await getObrasGestao();
        const resumoPorId = new Map((Array.isArray(gestaoData) ? gestaoData : [])
          .map((obra) => [Number(obra.id), obra]));
        lista = lista.map((obra) => {
          const gestaoObra = resumoPorId.get(Number(obra.id));
          return {
            ...obra,
            vgv_efetivo: gestaoObra?.vgv_efetivo,
            vgv_origem: gestaoObra?.vgv_origem,
            vgv_unidades_total: gestaoObra?.vgv_unidades_total,
            vgv_unidades_sem_valor: gestaoObra?.vgv_unidades_sem_valor,
            resumo: gestaoObra?.resumo || obra.resumo
          };
        });
      }

      setObras(lista);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar obras');
    } finally {
      setLoading(false);
    }
  }

  function abrirModalNovaObra() {
    setForm(initialFormState());
    setModalAberto(true);
  }

  function abrirModalEditarObra(obra) {
    setForm({
      id: obra.id,
      tipo_centro_custo: obra.tipo_centro_custo || 'OBRA',
      empresa_grupo_id: obra.empresa_grupo_id ? String(obra.empresa_grupo_id) : '',
      codigo: obra.codigo || '',
      nome: obra.nome || '',
      cidade: obra.cidade || '',
      cno: obra.cno || '',
      endereco_logradouro: obra.endereco_logradouro || '',
      endereco_numero: obra.endereco_numero || '',
      endereco_complemento: obra.endereco_complemento || '',
      endereco_bairro: obra.endereco_bairro || '',
      endereco_cep: obra.endereco_cep || '',
      endereco_uf: obra.endereco_uf || '',
      classificacao: obra.classificacao || '',
      vgv: obra.vgv != null ? String(obra.vgv) : '',
      planilha_geral: obra.planilha_geral != null ? String(obra.planilha_geral) : '',
      margem_custo_esperada: obra.margem_custo_esperada != null ? String(obra.margem_custo_esperada) : ''
    });
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setForm(initialFormState());
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setSaving(true);
      const tipoCadastro = String(form.tipo_centro_custo || 'OBRA').trim().toUpperCase();
      const cadastroEhObra = tipoCadastro === 'OBRA';
      const payload = {
        tipo_centro_custo: tipoCadastro,
        empresa_grupo_id: form.empresa_grupo_id ? Number(form.empresa_grupo_id) : null,
        codigo: String(form.codigo || '').trim().toUpperCase(),
        nome: String(form.nome || '').trim(),
        cidade: String(form.cidade || '').trim(),
        cno: String(form.cno || '').trim() || null,
        endereco_logradouro: String(form.endereco_logradouro || '').trim() || null,
        endereco_numero: String(form.endereco_numero || '').trim() || null,
        endereco_complemento: String(form.endereco_complemento || '').trim() || null,
        endereco_bairro: String(form.endereco_bairro || '').trim() || null,
        endereco_cep: String(form.endereco_cep || '').trim() || null,
        endereco_uf: String(form.endereco_uf || '').trim().toUpperCase() || null,
        classificacao: cadastroEhObra ? (form.classificacao || null) : null,
        vgv: cadastroEhObra && form.classificacao === 'PRIVADA' && form.vgv !== '' ? Number(form.vgv) : null,
        planilha_geral: cadastroEhObra && form.classificacao === 'PUBLICA' && form.planilha_geral !== '' ? Number(form.planilha_geral) : null,
        margem_custo_esperada: cadastroEhObra && form.margem_custo_esperada !== '' ? Number(form.margem_custo_esperada) : null
      };

      if (!payload.codigo || !payload.nome) {
        alert('Informe codigo e nome do cadastro.');
        return;
      }

      if (form.id) {
        await atualizarObra(form.id, payload);
      } else {
        await criarObra(payload);
      }

      fecharModal();
      await carregarObras();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao salvar obra');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(obra) {
    try {
      if (obra.ativo) {
        await desativarObra(obra.id);
      } else {
        await ativarObra(obra.id);
      }

      await carregarObras();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao atualizar status da obra');
    }
  }

  const obrasFiltradas = useMemo(() => {
    const termo = String(busca || '').trim().toLowerCase();
    if (!termo) return obras;

    return obras.filter((obra) => {
      const texto = [
        obra.codigo,
        obra.nome,
        obra.cidade,
        obra.empresaGrupo?.nome,
        getTipoCadastroLabel(obra)
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return texto.includes(termo);
    });
  }, [busca, obras]);

  return (
    <div className="page solicitacoes-page">
      {/* Header */}
      <div
        className="sol-surface-card rounded-2xl border px-6 py-6 md:px-8"
        style={{
          borderColor: 'var(--ui-border)',
          boxShadow: 'var(--ui-shadow-sm)'
        }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <span
              className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ borderColor: 'var(--ui-border)', color: 'var(--c-muted)', background: 'var(--ui-canvas)' }}
            >
              Portfólio operacional
            </span>
            <h1 className="page-title">Gestão de Obras e Centros de Custo</h1>
            <p className="page-subtitle">
              {gestaoObrasHabilitada
                ? 'Controle das obras reais com orçamento e dos centros de custo administrativos usados nas solicitações.'
                : 'Cadastro basico de obras e centros de custo utilizado pelo nucleo de solicitacoes.'}
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 md:w-auto md:min-w-[300px]">
            <input
              className="input"
              placeholder="Buscar por codigo, nome ou cidade"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
            />
            {podeGerenciarCadastro && (
              <button
                type="button"
                className="btn btn-primary inline-flex items-center justify-center gap-2"
                onClick={abrirModalNovaObra}
              >
                <HiOutlinePlus className="h-5 w-5" />
                Novo cadastro
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="app-empty-card">
          Carregando obras...
        </div>
      ) : obrasFiltradas.length === 0 ? (
        <div className="app-empty-card">
          <h2 className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>Nenhum cadastro encontrado</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--c-muted)' }}>
            Ajuste o filtro ou cadastre uma nova obra/centro de custo para iniciar o gerenciamento.
          </p>
        </div>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {obrasFiltradas.map((obra) => {
            const orcado = Number(obra.resumo?.orcado || 0);
            const executado = Number(obra.resumo?.executado || 0);
            const recebido = Number(obra.resumo?.recebido || 0);
            const faltaReceber = Number(obra.resumo?.falta_receber || 0);
            const lucroPrejuizo = Number(obra.resumo?.lucro_prejuizo || 0);
            const percentual = getExecucaoPercentual(orcado, executado);
            const cadastroEhObra = isCadastroObra(obra);
            const vgvVisual = obra.classificacao === 'PRIVADA'
              ? (obra.vgv_efetivo ?? obra.vgv)
              : obra.vgv;

            return (
              <article
                key={obra.id}
                className="group overflow-hidden rounded-2xl border transition hover:-translate-y-0.5"
                style={{
                  background: 'var(--ui-surface)',
                  borderColor: 'var(--ui-border)',
                  boxShadow: 'var(--ui-shadow-sm)'
                }}
              >
                <div className="flex min-h-[255px] flex-col p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className="inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white"
                      style={{ background: 'var(--c-primary)', boxShadow: '0 8px 20px rgba(0,0,0,0.2)' }}
                    >
                      <HiOutlineBuildingOffice2 className="h-7 w-7" />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
                        obra.ativo
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {obra.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      {getTipoCadastroLabel(obra)}
                    </span>
                    {cadastroEhObra && obra.classificacao && (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                        obra.classificacao === 'PRIVADA'
                          ? 'border-violet-200 bg-violet-50 text-violet-700'
                          : 'border-sky-200 bg-sky-50 text-sky-700'
                      }`}>
                        {obra.classificacao}
                      </span>
                    )}
                  </div>
                  </div>

                  <div className="mt-5">
                    <div
                      className="text-[11px] font-bold uppercase tracking-[0.26em]"
                      style={{ color: 'var(--c-muted)' }}
                    >
                      {obra.codigo || `OBRA ${obra.id}`}
                    </div>
                    <h2
                      className="mt-2 text-2xl font-black uppercase leading-tight tracking-tight"
                      style={{ color: 'var(--c-text)' }}
                    >
                      {obra.nome}
                    </h2>
                    <div
                      className="mt-3 inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em]"
                      style={{ color: 'var(--c-muted)' }}
                    >
                      <HiOutlineMapPin className="h-4 w-4" />
                      {obra.cidade || 'Cidade nao informada'}
                    </div>
                    <div className="mt-2 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--c-muted)' }}>
                      Empresa: {obra.empresaGrupo?.nome || 'Nao vinculada'}
                    </div>
                  </div>

                  {cadastroEhObra && (vgvVisual != null || obra.planilha_geral != null || obra.margem_custo_esperada != null) && (
                    <div className="mt-4 flex flex-wrap gap-3">
                      {vgvVisual != null && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--c-muted)' }}>VGV</div>
                          <div className="mt-0.5 text-sm font-bold" style={{ color: 'var(--c-text)' }}>{formatCurrency(vgvVisual)}</div>
                          {obra.vgv_origem === 'UNIDADES' && <div className="text-[10px] text-[var(--c-muted)]">{obra.vgv_unidades_total} unidades · base de venda</div>}
                          {obra.vgv_origem === 'UNIDADES_INCOMPLETAS' && <div className="text-[10px] text-[var(--c-muted)]">{obra.vgv_unidades_sem_valor} unidade(s) sem valor base</div>}
                        </div>
                      )}
                      {obra.planilha_geral != null && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--c-muted)' }}>Planilha Geral</div>
                          <div className="mt-0.5 text-sm font-bold" style={{ color: 'var(--c-text)' }}>{formatCurrency(obra.planilha_geral)}</div>
                        </div>
                      )}
                      {obra.margem_custo_esperada != null && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--c-muted)' }}>Margem</div>
                          <div className="mt-0.5 text-sm font-bold" style={{ color: 'var(--c-text)' }}>{Number(obra.margem_custo_esperada).toFixed(1)}%</div>
                        </div>
                      )}
                      {(() => {
                        const ref = obra.classificacao === 'PRIVADA' ? vgvVisual : obra.planilha_geral;
                        const margem = obra.margem_custo_esperada;
                        if (ref != null && margem != null && margem > 0) {
                          const orcamento = Number(ref) * (1 - Number(margem) / 100);
                          return (
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--c-muted)' }}>Orçamento</div>
                              <div className="mt-0.5 text-sm font-bold" style={{ color: 'var(--c-primary)' }}>{formatCurrency(orcamento)}</div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}

                  {gestaoObrasHabilitada && cadastroEhObra ? (
                    <>
                      <div className="mt-8 grid grid-cols-2 gap-4">
                        <div>
                          <div
                            className="text-[10px] font-bold uppercase tracking-[0.2em]"
                            style={{ color: 'var(--c-muted)' }}
                          >
                            Executado
                          </div>
                          <div className="mt-2 text-base font-black" style={{ color: 'var(--c-primary)' }}>
                            {formatCurrency(executado)}
                          </div>
                        </div>
                        <div>
                          <div
                            className="text-[10px] font-bold uppercase tracking-[0.2em]"
                            style={{ color: 'var(--c-muted)' }}
                          >
                            Recebido
                          </div>
                          <div className="mt-2 text-base font-black" style={{ color: '#10b981' }}>
                            {formatCurrency(recebido)}
                          </div>
                        </div>
                        <div>
                          <div
                            className="text-[10px] font-bold uppercase tracking-[0.2em]"
                            style={{ color: 'var(--c-muted)' }}
                          >
                            Falta receber
                          </div>
                          <div className="mt-2 text-base font-black" style={{ color: faltaReceber > 0 ? '#f59e0b' : 'var(--c-text)' }}>
                            {formatCurrency(faltaReceber)}
                          </div>
                        </div>
                        <div>
                          <div
                            className="text-[10px] font-bold uppercase tracking-[0.2em]"
                            style={{ color: 'var(--c-muted)' }}
                          >
                            Lucro/Prejuizo
                          </div>
                          <div className="mt-2 text-base font-black" style={{ color: getLucroPrejuizoColor(lucroPrejuizo) }}>
                            {formatCurrency(lucroPrejuizo)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5">
                        <div
                          className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em]"
                          style={{ color: 'var(--c-muted)' }}
                        >
                          <span>Execucao</span>
                          <span>{percentual.toFixed(1)}%</span>
                        </div>
                        <div
                          className="h-2 overflow-hidden rounded-full"
                          style={{ background: 'var(--ui-border)' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${percentual}%`, background: 'var(--c-primary)' }}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="mt-8 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-canvas)] px-4 py-4">
                      <div
                        className="text-[10px] font-bold uppercase tracking-[0.2em]"
                        style={{ color: 'var(--c-muted)' }}
                      >
                        Modo atual
                      </div>
                      <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                        {cadastroEhObra ? 'Cadastro basico ativo' : 'Centro de custo ativo'}
                      </div>
                      <p className="mt-2 text-sm" style={{ color: 'var(--c-muted)' }}>
                        {cadastroEhObra
                          ? 'Esta obra continua disponivel para solicitacoes e configuracoes basicas.'
                          : 'Este centro de custo esta disponivel para solicitacoes e titulos financeiros sem estrutura de obra.'}
                      </p>
                    </div>
                  )}

                  <div className="mt-auto pt-7">
                    <div className="flex flex-wrap gap-2">
                      {gestaoObrasHabilitada && cadastroEhObra ? (
                        <button
                          type="button"
                          className="btn btn-primary inline-flex flex-1 items-center justify-center gap-2"
                          onClick={() => navigate(`/obras/${obra.id}`)}
                        >
                          Gerenciar obra
                          <HiOutlineArrowRight className="h-4 w-4" />
                        </button>
                      ) : (
                        <div className="inline-flex min-h-[44px] flex-1 items-center rounded-xl border border-[var(--ui-border)] bg-[var(--ui-canvas)] px-4 text-sm font-medium text-[var(--c-muted)]">
                          {cadastroEhObra ? 'Gestao de obras desabilitada no plano' : 'Centro de custo sem abas de obra'}
                        </div>
                      )}
                      {podeGerenciarCadastro && (
                        <>
                          <button
                            type="button"
                            className="btn btn-outline inline-flex h-[44px] w-[44px] items-center justify-center"
                            onClick={() => abrirModalEditarObra(obra)}
                            title="Editar obra"
                          >
                            <HiOutlinePencilSquare className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline inline-flex h-[44px] w-[44px] items-center justify-center"
                            onClick={() => toggleAtivo(obra)}
                            title={obra.ativo ? 'Desativar obra' : 'Ativar obra'}
                          >
                            <HiOutlinePower className="h-5 w-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* Modal */}
      {modalAberto && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && fecharModal()}>
          <div className="modal-dialog modal-dialog--lg">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">
                  {form.id ? 'Editar cadastro' : 'Novo cadastro'}
                </h2>
                <p className="modal-subtitle">
                  Mantenha obras reais e centros de custo administrativos alinhados para o modulo operacional e financeiro.
                </p>
              </div>
              <button type="button" className="modal-close-btn" onClick={fecharModal} aria-label="Fechar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
            <form id="obras-form" onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                Código
                <input
                  className="input"
                  value={form.codigo}
                  onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value.toUpperCase() }))}
                  placeholder="Ex: OBRA-001"
                  required
                />
              </label>

              <label className="grid gap-1 text-sm font-medium md:col-span-2" style={{ color: 'var(--c-text)' }}>
                Nome
                <input
                  className="input"
                  value={form.nome}
                  onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                  placeholder="Ex: Muro São Domingos"
                  required
                />
              </label>

              <label className="grid gap-1 text-sm font-medium md:col-span-3" style={{ color: 'var(--c-text)' }}>
                Tipo de cadastro
                <select
                  className="input"
                  value={form.tipo_centro_custo}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    tipo_centro_custo: event.target.value,
                    classificacao: event.target.value === 'OBRA' ? current.classificacao : '',
                    vgv: event.target.value === 'OBRA' ? current.vgv : '',
                    planilha_geral: event.target.value === 'OBRA' ? current.planilha_geral : '',
                    margem_custo_esperada: event.target.value === 'OBRA' ? current.margem_custo_esperada : ''
                  }))}
                >
                  <option value="OBRA">Obra</option>
                  <option value="CENTRO_CUSTO">Centro de custo</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm font-medium md:col-span-3" style={{ color: 'var(--c-text)' }}>
                Empresa do grupo
                <select
                  className="input"
                  value={form.empresa_grupo_id}
                  onChange={(event) => setForm((current) => ({ ...current, empresa_grupo_id: event.target.value }))}
                >
                  <option value="">Selecione a empresa operacional</option>
                  {empresasGrupo
                    .filter((empresa) => String(empresa.tipo_empresa || 'OPERACIONAL').toUpperCase() !== 'HOLDING')
                    .map((empresa) => (
                      <option key={empresa.id} value={empresa.id}>
                        {empresa.nome}
                      </option>
                    ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm font-medium md:col-span-3" style={{ color: 'var(--c-text)' }}>
                Cidade
                <input
                  className="input"
                  value={form.cidade}
                  onChange={(event) => setForm((current) => ({ ...current, cidade: event.target.value }))}
                  placeholder="Ex: São Domingos"
                />
              </label>

              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                CNO
                <input
                  className="input"
                  value={form.cno}
                  onChange={(event) => setForm((current) => ({ ...current, cno: event.target.value }))}
                  placeholder="Cadastro Nacional de Obras"
                />
              </label>

              <label className="grid gap-1 text-sm font-medium md:col-span-2" style={{ color: 'var(--c-text)' }}>
                Logradouro
                <input
                  className="input"
                  value={form.endereco_logradouro}
                  onChange={(event) => setForm((current) => ({ ...current, endereco_logradouro: event.target.value }))}
                  placeholder="Rua, avenida ou localidade"
                />
              </label>

              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                Número
                <input
                  className="input"
                  value={form.endereco_numero}
                  onChange={(event) => setForm((current) => ({ ...current, endereco_numero: event.target.value }))}
                  placeholder="Ex: 120"
                />
              </label>

              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                Bairro
                <input
                  className="input"
                  value={form.endereco_bairro}
                  onChange={(event) => setForm((current) => ({ ...current, endereco_bairro: event.target.value }))}
                  placeholder="Bairro"
                />
              </label>

              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                CEP
                <input
                  className="input"
                  value={form.endereco_cep}
                  onChange={(event) => setForm((current) => ({ ...current, endereco_cep: event.target.value }))}
                  placeholder="00000-000"
                />
              </label>

              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                UF
                <input
                  className="input"
                  maxLength={2}
                  value={form.endereco_uf}
                  onChange={(event) => setForm((current) => ({ ...current, endereco_uf: event.target.value.toUpperCase() }))}
                  placeholder="ES"
                />
              </label>

              <label className="grid gap-1 text-sm font-medium md:col-span-2" style={{ color: 'var(--c-text)' }}>
                Complemento
                <input
                  className="input"
                  value={form.endereco_complemento}
                  onChange={(event) => setForm((current) => ({ ...current, endereco_complemento: event.target.value }))}
                  placeholder="Complemento ou referência"
                />
              </label>

              {form.tipo_centro_custo === 'OBRA' && (
              <>
              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                Classificação
                <select
                  className="input"
                  value={form.classificacao}
                  onChange={(event) => setForm((current) => ({ ...current, classificacao: event.target.value }))}
                >
                  <option value="">Não definida</option>
                  <option value="PRIVADA">Privada</option>
                  <option value="PUBLICA">Pública</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                Margem de custo (%)
                <PercentInput
                  className="input"
                  value={form.margem_custo_esperada}
                  onChange={(v) => setForm((current) => ({ ...current, margem_custo_esperada: v }))}
                  placeholder="Ex: 30,00"
                />
              </label>

              {form.classificacao === 'PRIVADA' && (
                <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                  VGV
                  <CurrencyInput
                    className="input"
                    value={form.vgv}
                    onChange={(v) => setForm((current) => ({ ...current, vgv: v }))}
                    placeholder="Ex: 1.500.000,00"
                  />
                </label>
              )}

              {form.classificacao === 'PUBLICA' && (
                <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                  Planilha geral
                  <CurrencyInput
                    className="input"
                    value={form.planilha_geral}
                    onChange={(v) => setForm((current) => ({ ...current, planilha_geral: v }))}
                    placeholder="Ex: 800.000,00"
                  />
                </label>
              )}
              </>
              )}

              <div className="flex flex-wrap justify-end gap-3 md:col-span-3" style={{ display: 'none' }} />
            </form>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={fecharModal} disabled={saving}>
                Cancelar
              </button>
              <button
                type="submit"
                form="obras-form"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Salvando...' : form.id ? 'Salvar cadastro' : 'Criar cadastro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
