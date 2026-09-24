import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineArrowRight,
  HiOutlineBuildingOffice2,
  HiOutlineMapPin,
  HiOutlinePencilSquare,
  HiOutlinePower
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
import { getResultadoObras } from '../services/financeiro';
import { useAuth } from '../contexts/AuthContext';
import {
  canAccessGestaoObras,
  canManageCadastroObras,
  canViewFinanceiroRelatorio
} from '../utils/acessoProduto';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BarraFiltros,
  Avisos,
  useAvisos
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import './Obras.css';

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
        className={`${className} input-prefixo-moeda`}
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

function isCadastroObra(obra) {
  return String(obra?.tipo_centro_custo || 'OBRA').trim().toUpperCase() === 'OBRA';
}

function getTipoCadastroLabel(obra) {
  return isCadastroObra(obra) ? 'Obra' : 'Centro de custo';
}

function ObraMetrica({ label, value, tone = 'default', support }) {
  return (
    <div className={`obra-card-metrica obra-card-metrica--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {support ? <small>{support}</small> : null}
    </div>
  );
}

function ObraProgresso({ label, value, max, tone = 'primary' }) {
  const percentual = getExecucaoPercentual(max, value);

  return (
    <div className="obra-card-progresso">
      <div className="obra-card-progresso__legenda">
        <span>{label}</span>
        <strong>{percentual.toFixed(1)}%</strong>
      </div>
      <div
        className="obra-card-progresso__trilha"
        role="progressbar"
        aria-label={label}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={percentual}
      >
        <span
          className={`obra-card-progresso__barra obra-card-progresso__barra--${tone}`}
          style={{ width: `${percentual}%` }}
        />
      </div>
    </div>
  );
}

function ObraCadastroCard({
  obra,
  gestaoObrasHabilitada,
  podeGerenciarCadastro,
  onGerenciar,
  onEditar,
  onToggleAtivo
}) {
  const cadastroEhObra = isCadastroObra(obra);
  const classificacao = String(obra.classificacao || '').trim().toUpperCase();
  const obraPrivada = classificacao === 'PRIVADA';
  const obraPublica = classificacao === 'PUBLICA';
  const valorReferencia = Number(
    obra.valor_referencia_resultado
      ?? (obraPrivada
        ? (obra.vgv_efetivo ?? obra.vgv)
        : obraPublica
          ? obra.planilha_geral
          : 0)
      ?? 0
  );
  const margem = Number(obra.margem_custo_esperada || 0);
  const orcamentoCusto = obra.orcamento != null
    ? Number(obra.orcamento)
    : valorReferencia > 0 && margem > 0
      ? valorReferencia * (1 - margem / 100)
      : null;
  const executado = Number(obra.resumo?.executado || 0);
  const recebido = Number(obra.resumo?.recebido || 0);
  const faltaReceber = Number(obra.resumo?.falta_receber || 0);
  const lucroPrejuizo = Number(obra.resumo?.lucro_prejuizo || 0);
  const valorVendido = obra.valor_vendido == null ? null : Number(obra.valor_vendido);
  const faltaVender = obra.falta_vender == null ? null : Number(obra.falta_vender);
  const mostrarResultado = gestaoObrasHabilitada && cadastroEhObra;
  const referenciaLabel = obraPrivada ? 'VGV' : obraPublica ? 'Planilha geral' : 'Volume financeiro';
  const fonteReferencia = obra.vgv_origem === 'UNIDADES'
    ? `${Number(obra.vgv_unidades_total || 0)} unidade(s) ativa(s)`
    : obra.vgv_origem === 'UNIDADES_INCOMPLETAS'
      ? `${Number(obra.vgv_unidades_sem_valor || 0)} unidade(s) sem valor base`
      : null;

  return (
    <article className={`obra-cadastro-card${obra.ativo ? '' : ' obra-cadastro-card--inativa'}`}>
      <header className="obra-cadastro-card__cabecalho">
        <div className="obra-cadastro-card__icone" aria-hidden="true">
          <HiOutlineBuildingOffice2 />
        </div>
        <div className="obra-cadastro-card__status">
          <StatusBadge status={obra.ativo ? 'Ativa' : 'Inativa'} />
          <span className="obra-cadastro-card__tipo">{getTipoCadastroLabel(obra)}</span>
          {cadastroEhObra && classificacao ? (
            <span className="obra-cadastro-card__tipo">{classificacao === 'PRIVADA' ? 'Privada' : 'Pública'}</span>
          ) : null}
        </div>
      </header>

      <div className="obra-cadastro-card__identidade">
        <span className="obra-cadastro-card__codigo">{obra.codigo || `OBRA ${obra.id}`}</span>
        <h2>{obra.nome}</h2>
        <div className="obra-cadastro-card__local">
          <HiOutlineMapPin aria-hidden="true" />
          <span>{obra.cidade || 'Cidade não informada'}</span>
        </div>
        <p>Empresa: {obra.empresaGrupo?.nome || 'Não vinculada'}</p>
      </div>

      {mostrarResultado ? (
        <>
          <div className="obra-cadastro-card__metricas obra-cadastro-card__metricas--referencia">
            <ObraMetrica
              label={referenciaLabel}
              value={valorReferencia > 0 ? formatCurrency(valorReferencia) : '—'}
              support={fonteReferencia}
              tone="reference"
            />
            <ObraMetrica
              label="Orçamento de custo"
              value={orcamentoCusto == null ? '—' : formatCurrency(orcamentoCusto)}
              support={margem > 0 ? `Margem esperada ${margem.toFixed(1)}%` : null}
              tone="reference"
            />
            {obraPrivada && valorVendido != null ? (
              <>
                <ObraMetrica
                  label="Valor vendido"
                  value={formatCurrency(valorVendido)}
                  support={`${Number(obra.quantidade_contratos_venda || 0)} contrato(s) vigente(s)`}
                  tone="received"
                />
                <ObraMetrica
                  label="Falta vender"
                  value={faltaVender == null ? '—' : formatCurrency(faltaVender)}
                  support={faltaVender == null ? 'Aguardando VGV calculável' : 'VGV menos valor vendido'}
                  tone="pending"
                />
              </>
            ) : null}
          </div>

          <div className="obra-cadastro-card__metricas">
            <ObraMetrica label="Executado" value={formatCurrency(executado)} tone="executed" />
            <ObraMetrica label="Recebido" value={formatCurrency(recebido)} tone="received" />
            <ObraMetrica label="Falta receber" value={formatCurrency(faltaReceber)} tone="pending" />
            <ObraMetrica
              label="Lucro/Prejuízo"
              value={formatCurrency(lucroPrejuizo)}
              tone={lucroPrejuizo < 0 ? 'negative' : lucroPrejuizo > 0 ? 'positive' : 'default'}
            />
          </div>

          <div className="obra-cadastro-card__progressos">
            {orcamentoCusto != null ? (
              <ObraProgresso label="Executado / Orçamento" value={executado} max={orcamentoCusto} />
            ) : null}
            {valorReferencia > 0 ? (
              <ObraProgresso label={`Recebido / ${referenciaLabel}`} value={recebido} max={valorReferencia} tone="success" />
            ) : null}
          </div>
        </>
      ) : (
        <div className="obra-cadastro-card__modo">
          <strong>{cadastroEhObra ? 'Cadastro básico ativo' : 'Centro de custo ativo'}</strong>
          <span>
            {cadastroEhObra
              ? 'A gestão financeira desta obra não está disponível no acesso atual.'
              : 'Disponível para solicitações e títulos, sem estrutura operacional de obra.'}
          </span>
        </div>
      )}

      <footer className="obra-cadastro-card__acoes">
        {gestaoObrasHabilitada && cadastroEhObra ? (
          <button type="button" className="btn btn-primary obra-cadastro-card__gerenciar" onClick={onGerenciar}>
            Gerenciar obra
            <HiOutlineArrowRight aria-hidden="true" />
          </button>
        ) : (
          <span className="obra-cadastro-card__acao-indisponivel">
            {cadastroEhObra ? 'Gestão indisponível' : 'Cadastro administrativo'}
          </span>
        )}

        {podeGerenciarCadastro ? (
          <>
            <button
              type="button"
              className="btn btn-outline obra-cadastro-card__icone-acao"
              onClick={onEditar}
              title="Editar cadastro"
              aria-label={`Editar ${obra.nome}`}
            >
              <HiOutlinePencilSquare aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`btn btn-outline obra-cadastro-card__icone-acao${obra.ativo ? ' btn-perigo-suave' : ''}`}
              onClick={onToggleAtivo}
              title={obra.ativo ? 'Desativar cadastro' : 'Ativar cadastro'}
              aria-label={`${obra.ativo ? 'Desativar' : 'Ativar'} ${obra.nome}`}
            >
              <HiOutlinePower aria-hidden="true" />
            </button>
          </>
        ) : null}
      </footer>
    </article>
  );
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
    nivel_apropriacao_formulario: '',
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
  // ?q= da busca universal abre a lista já filtrada.
  const [busca, setBusca] = useState(() => (
    new URLSearchParams(window.location.search).get('q') || ''
  ));
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState(initialFormState());
  const { avisos, avisar, fechar } = useAvisos();

  const podeGerenciarCadastro = canManageCadastroObras(user);
  const gestaoObrasHabilitada = canAccessGestaoObras(user);
  const podeVerResultadoObras = canViewFinanceiroRelatorio(
    user,
    'financeiro.relatorios.resultado_obras'
  );

  useEffect(() => {
    carregarObras();
    carregarEmpresasGrupo();
  }, [gestaoObrasHabilitada, podeVerResultadoObras]);

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
        const [gestaoData, resultadoData] = await Promise.all([
          getObrasGestao(),
          podeVerResultadoObras
            ? getResultadoObras().catch((error) => {
              console.error(error);
              return [];
            })
            : Promise.resolve([])
        ]);
        const resumoPorId = new Map((Array.isArray(gestaoData) ? gestaoData : [])
          .map((obra) => [Number(obra.id), obra]));
        const resultadoPorId = new Map((Array.isArray(resultadoData) ? resultadoData : [])
          .map((obra) => [Number(obra.id), obra]));
        lista = lista.map((obra) => {
          const gestaoObra = resumoPorId.get(Number(obra.id));
          const resultadoObra = resultadoPorId.get(Number(obra.id));
          return {
            ...obra,
            vgv_efetivo: resultadoObra?.vgv_efetivo ?? gestaoObra?.vgv_efetivo,
            vgv_origem: resultadoObra?.vgv_origem ?? gestaoObra?.vgv_origem,
            vgv_unidades_total: resultadoObra?.vgv_unidades_total ?? gestaoObra?.vgv_unidades_total,
            vgv_unidades_sem_valor: resultadoObra?.vgv_unidades_sem_valor ?? gestaoObra?.vgv_unidades_sem_valor,
            valor_referencia_resultado: resultadoObra?.valor_referencia_resultado
              ?? gestaoObra?.resumo?.valor_referencia_resultado,
            orcamento: resultadoObra?.orcamento,
            valor_vendido: resultadoObra?.valor_vendido,
            falta_vender: resultadoObra?.falta_vender,
            quantidade_contratos_venda: resultadoObra?.quantidade_contratos_venda,
            resumo: resultadoObra
              ? {
                ...(gestaoObra?.resumo || {}),
                executado: resultadoObra.pagar?.executado,
                recebido: resultadoObra.receber?.recebido,
                falta_receber: resultadoObra.falta_receber,
                lucro_prejuizo: resultadoObra.lucro_prejuizo
              }
              : gestaoObra?.resumo || obra.resumo
          };
        });
      }

      setObras(lista);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao carregar obras');
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
      nivel_apropriacao_formulario: obra.nivel_apropriacao_formulario || '',
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
        nivel_apropriacao_formulario: cadastroEhObra
          ? String(form.nivel_apropriacao_formulario || '').trim().toUpperCase()
          : null,
        classificacao: cadastroEhObra ? (form.classificacao || null) : null,
        vgv: cadastroEhObra && form.classificacao === 'PRIVADA' && form.vgv !== '' ? Number(form.vgv) : null,
        planilha_geral: cadastroEhObra && form.classificacao === 'PUBLICA' && form.planilha_geral !== '' ? Number(form.planilha_geral) : null,
        margem_custo_esperada: cadastroEhObra && form.margem_custo_esperada !== '' ? Number(form.margem_custo_esperada) : null
      };

      if (!payload.codigo || !payload.nome) {
        avisar.alerta('Informe código e nome do cadastro.');
        return;
      }
      if (cadastroEhObra && !payload.nivel_apropriacao_formulario) {
        avisar.alerta('Selecione o nível de apropriação usado nos formulários da obra.');
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
      avisar.erro(error.message || 'Erro ao salvar obra');
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
      avisar.erro(error.message || 'Erro ao atualizar status da obra');
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

  // R16: UM dono para a faixa de avisos. Com o modal aberto ela vive dentro
  // dele (senão o erro de salvar ficaria atrás do fundo escuro); com o modal
  // fechado, logo abaixo do PageHeader.
  const faixaAvisos = <Avisos avisos={avisos} aoFechar={fechar} />;

  return (
    <Pagina>
      {/* C2 (02/09): toda tela usa a MESMA faixa — título 22px e o apoio
          (contagem + descrição) em uma linha NA FAIXA, como em Empresas do
          Grupo. Duas telas com dois padrões era o defeito. */}
      <PageHeader
        titulo="Gestão de Obras e Centros de Custo"
        contagem={loading ? null : `${obras.length} cadastro(s)`}
        descricao={gestaoObrasHabilitada
          ? 'Obras reais com orçamento e centros de custo administrativos usados nas solicitações.'
          : 'Cadastro basico de obras e centros de custo utilizado pelo nucleo de solicitacoes.'}
        acaoPrincipal={podeGerenciarCadastro
          ? { rotulo: 'Novo cadastro', onClick: abrirModalNovaObra }
          : null}
      />

      {!modalAberto && faixaAvisos}

      <BlocoConteudo
        titulo="Cadastros"
        variante="primario"
        cor="var(--c-primary)"
      >
        {/* F1: UMA busca, ocupando a largura da faixa (padrão BarraFiltros). */}
        <BarraFiltros
          busca={{
            valor: busca,
            aoMudar: setBusca,
            placeholder: 'Buscar por código, nome ou cidade'
          }}
        />
        {!gestaoObrasHabilitada && (
          <p className="app-note">
            Gestão de obras desabilitada no plano — os cadastros seguem disponíveis para
            solicitações, títulos e configurações básicas.
          </p>
        )}
        {loading ? (
          <div className="app-empty-card">Carregando obras...</div>
        ) : obrasFiltradas.length === 0 ? (
          <div className="app-empty-card">
            <strong>Nenhum cadastro encontrado</strong>
            <span>Ajuste o filtro ou cadastre uma nova obra/centro de custo para iniciar o gerenciamento.</span>
          </div>
        ) : (
          <section className="obras-card-grid" aria-label="Obras e centros de custo">
            {obrasFiltradas.map((obra) => (
              <ObraCadastroCard
                key={obra.id}
                obra={obra}
                gestaoObrasHabilitada={gestaoObrasHabilitada}
                podeGerenciarCadastro={podeGerenciarCadastro}
                onGerenciar={() => navigate(`/obras/${obra.id}`)}
                onEditar={() => abrirModalEditarObra(obra)}
                onToggleAtivo={() => toggleAtivo(obra)}
              />
            ))}
          </section>
        )}
      </BlocoConteudo>

      {/* Modal */}
      {modalAberto && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && fecharModal()}>
          <div
            className="modal-dialog modal-dialog--lg"
            role="dialog"
            aria-modal="true"
            aria-label={form.id ? 'Editar cadastro' : 'Novo cadastro'}
          >
            <div className="modal-header">
              <div>
                <h2 className="modal-title">
                  {form.id ? 'Editar cadastro' : 'Novo cadastro'}
                </h2>
                <p className="modal-subtitle">
                  Mantenha obras reais e centros de custo administrativos alinhados para o módulo operacional e financeiro.
                </p>
              </div>
              <button type="button" className="modal-close-btn" onClick={fecharModal} aria-label="Fechar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
            {faixaAvisos}
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
                    nivel_apropriacao_formulario: event.target.value === 'OBRA'
                      ? current.nivel_apropriacao_formulario
                      : '',
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
              <label className="grid gap-1 text-sm font-medium md:col-span-2" style={{ color: 'var(--c-text)' }}>
                Nível de apropriação nos formulários
                <select
                  className="input"
                  value={form.nivel_apropriacao_formulario}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    nivel_apropriacao_formulario: event.target.value
                  }))}
                  required
                >
                  <option value="">Selecione</option>
                  <option value="ETAPA">Etapa — visão mais resumida</option>
                  <option value="SERVICO">Serviço — nível intermediário</option>
                  <option value="SUBSERVICO">Subserviço — itens mais detalhados</option>
                  {form.nivel_apropriacao_formulario === 'PERSONALIZADO' ? (
                    <option value="PERSONALIZADO">Personalizado — definido na Gestão de Apropriações</option>
                  ) : null}
                </select>
                <span className="text-xs font-normal" style={{ color: 'var(--c-muted)' }}>
                  Define quais apropriações desta obra aparecem em solicitações, compras e demais formulários operacionais.
                </span>
              </label>

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
    </Pagina>
  );
}
