import { useEffect, useState } from 'react';
import { atualizarEmpresaGrupo, criarEmpresaGrupo, getEmpresasGrupo } from '../services/empresasGrupo';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  BarraFiltros,
  alternarValorFiltro,
  Avisos,
  useAvisos
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import OverlayModal from '../components/ui/OverlayModal';
import { getCpfCnpjError, maskCpfCnpj, onlyDigits } from '../utils/formatters';

function emptyForm() {
  return {
    id: null,
    codigo: '',
    nome: '',
    razao_social: '',
    cnpj: '',
    tipo_empresa: 'OPERACIONAL',
    tipo_gerencial: 'OPERACIONAL',
    empresa_caixa: false,
    empresa_operacional: true,
    consolidar_no_grupo: true,
    elimina_intercompany: true,
    holding_id: '',
    ativo: true
  };
}

function formatDocumento(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return value || '-';
}

const TIPOS_GERENCIAIS = [
  ['HOLDING', 'Holding'],
  ['TESOURARIA', 'Tesouraria'],
  ['SPE', 'SPE'],
  ['ADMINISTRATIVA', 'Administrativa'],
  ['OPERACIONAL', 'Operacional'],
  ['PATRIMONIAL', 'Patrimonial'],
  ['COMERCIAL', 'Comercial'],
  ['RH_FOLHA', 'RH/Folha'],
  ['INVESTIMENTOS', 'Investimentos']
];

function labelTipoGerencial(value) {
  return TIPOS_GERENCIAIS.find(([key]) => key === String(value || '').toUpperCase())?.[1] || 'Operacional';
}

export default function EmpresasGrupo() {
  const [empresas, setEmpresas] = useState([]);
  // R12: filtro por MARCAÇÃO — situacao é um conjunto (vazio = todas);
  // com exatamente uma marca, vira o parametro ativo=true/false da API.
  const [filtros, setFiltros] = useState({ q: '', situacao: new Set() });
  const [form, setForm] = useState(null); // null = painel de formulario fechado
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // R3: aviso do sistema no lugar da caixa do navegador. Esta tela é a
  // ÚNICA de empresas do grupo (o RH/DP aponta para cá), então a mensagem
  // aqui atende também quem chega pelo RH/DP.
  const { avisos, avisar, fechar } = useAvisos();

  // Filtro marcado aplica na hora (padrão Solicitações); a busca digitada
  // espera 350ms para não martelar a API a cada tecla.
  useEffect(() => {
    const atraso = setTimeout(carregar, 350);
    return () => clearTimeout(atraso);
  }, [filtros]);

  async function carregar() {
    try {
      setCarregando(true);
      const ativo = filtros.situacao.size === 1 ? filtros.situacao.values().next().value : undefined;
      const data = await getEmpresasGrupo({
        q: filtros.q || undefined,
        ativo
      });
      setEmpresas(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar empresas do grupo');
    } finally {
      setCarregando(false);
    }
  }

  function selecionarEmpresa(item) {
    setForm({
      id: item.id,
      codigo: item.codigo || '',
      nome: item.nome || '',
      razao_social: item.razao_social || '',
      cnpj: item.cnpj || '',
      tipo_empresa: item.tipo_empresa || 'OPERACIONAL',
      tipo_gerencial: item.tipo_gerencial || 'OPERACIONAL',
      empresa_caixa: Boolean(item.empresa_caixa),
      empresa_operacional: item.empresa_operacional !== false,
      consolidar_no_grupo: item.consolidar_no_grupo !== false,
      elimina_intercompany: item.elimina_intercompany !== false,
      holding_id: item.holding_id ? String(item.holding_id) : '',
      ativo: item.ativo !== false
    });
  }

  function abrirNovaEmpresa() {
    setForm(emptyForm());
  }

  function limparFormulario() {
    setForm(null);
  }

  async function salvar(event) {
    event.preventDefault();
    const documentoErro = getCpfCnpjError(form.cnpj, { type: 'cnpj' });
    if (documentoErro) {
      avisar.erro(documentoErro);
      return;
    }
    try {
      setSalvando(true);
      const payload = {
        codigo: form.codigo || undefined,
        nome: form.nome,
        razao_social: form.razao_social || undefined,
        cnpj: onlyDigits(form.cnpj) || undefined,
        tipo_empresa: form.tipo_empresa || 'OPERACIONAL',
        tipo_gerencial: form.tipo_gerencial || 'OPERACIONAL',
        empresa_caixa: Boolean(form.empresa_caixa),
        empresa_operacional: Boolean(form.empresa_operacional),
        consolidar_no_grupo: Boolean(form.consolidar_no_grupo),
        elimina_intercompany: Boolean(form.elimina_intercompany),
        holding_id: form.tipo_empresa === 'HOLDING' ? null : (form.holding_id ? Number(form.holding_id) : null),
        ativo: Boolean(form.ativo)
      };

      if (form.id) {
        await atualizarEmpresaGrupo(form.id, payload);
      } else {
        await criarEmpresaGrupo(payload);
      }

      limparFormulario();
      await carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar empresa do grupo');
      } finally {
      setSalvando(false);
    }
  }

  // R16: UM dono para a faixa de avisos. Com o modal aberto ela vive dentro
  // dele (o erro do salvar acontece com o modal aberto e ficaria atrás do
  // fundo escuro); com o modal fechado, logo abaixo do PageHeader.
  const faixaAvisos = <Avisos avisos={avisos} aoFechar={fechar} />;

  const holdings = empresas.filter((empresa) => String(empresa.tipo_empresa || '').toUpperCase() === 'HOLDING');
  const formAtivo = form !== null;

  // 10 colunas viraram 5 + acoes: dados relacionados foram combinados em
  // CelulaDupla (nome+codigo, razao social+CNPJ, tipo+gerencial,
  // holding+consolidacao) — nenhum dado saiu da tela, so mudou de forma.
  const colunas = [
    {
      id: 'empresa',
      titulo: 'Empresa',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => (
        <CelulaDupla principal={item.nome} sub={item.codigo ? `Cód. ${item.codigo}` : null} />
      )
    },
    {
      id: 'razao_cnpj',
      titulo: 'Razão social / CNPJ',
      // CNPJ formatado (18 chars) não cabe nos 130px do tipo 'codigo'.
      tipo: 'identidade',
      flex: false,
      render: (item) => (
        <CelulaDupla
          principal={item.razao_social || '-'}
          sub={item.cnpj ? formatDocumento(item.cnpj) : null}
        />
      )
    },
    {
      id: 'classificacao',
      titulo: 'Classificação',
      tipo: 'texto',
      render: (item) => (
        <CelulaDupla
          principal={String(item.tipo_empresa || 'OPERACIONAL') === 'HOLDING' ? 'Holding' : 'Empresa operacional'}
          sub={labelTipoGerencial(item.tipo_gerencial)}
        />
      )
    },
    {
      id: 'grupo',
      titulo: 'Holding / consolidação',
      tipo: 'texto',
      render: (item) => (
        <CelulaDupla
          principal={item.holding_id
            ? (empresas.find((empresa) => Number(empresa.id) === Number(item.holding_id))?.nome || item.holding_id)
            : '-'}
          sub={item.consolidar_no_grupo !== false ? 'Consolida: Sim' : 'Consolida: Não'}
        />
      )
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      render: (item) => <StatusBadge status={item.ativo ? 'Ativa' : 'Inativa'} />
    }
  ];

  return (
    <Pagina>
      {/* R5 (piloto 02/09): contagem + apoio na FAIXA FIXA do topo, com
          escala de título, superfície própria e uma linha só. */}
      <PageHeader
        titulo="Empresas do Grupo"
        contagem={carregando ? null : `${empresas.length} empresa(s)`}
        descricao="Cadastro central usado por financeiro, pagamentos, RH/DP e demais módulos multiempresa."
        acaoPrincipal={{ rotulo: 'Nova empresa', onClick: abrirNovaEmpresa }}
      />

      {!formAtivo && faixaAvisos}

      {/* R9 (docs/REGRAS-LAYOUT.md): cadastro de uso esporádico abre em
          MODAL — a tela inteira fica com a listagem. Mesmos handlers,
          mesmo payload: só a moldura mudou. O ritmo vertical vem do Pagina. */}
      {formAtivo && (
        <OverlayModal
          aberto
          rotulo={form.id ? 'Editar empresa do grupo' : 'Nova empresa do grupo'}
          onFechar={limparFormulario}
        >
          <div key={form.id || 'nova'}>
          <BlocoConteudo
            titulo={form.id ? `Editar empresa — ${form.nome || ''}` : 'Nova empresa do grupo'}
            acoes={(
              <button type="button" className="btn btn-outline btn-sm" onClick={limparFormulario}>
                Fechar
              </button>
            )}
          >
            <form className="space-y-4" onSubmit={salvar}>
              {faixaAvisos}
              <p className="app-note">
                Essas empresas passam a ser a autoridade central para contas, caixa, pagamentos e RH/DP.
              </p>

              <FormSecao legenda="Identificação" colunas={2}>
                <CampoForm label="Nome" obrigatorio span={2}>
                  <input
                    className="input w-full"
                    value={form.nome}
                    onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))}
                    required
                  />
                </CampoForm>
                <CampoForm label="Razão social" span={2}>
                  <input
                    className="input w-full"
                    value={form.razao_social}
                    onChange={(event) => setForm((prev) => ({ ...prev, razao_social: event.target.value }))}
                  />
                </CampoForm>
                <CampoForm label="Código">
                  <input
                    className="input w-full"
                    value={form.codigo}
                    onChange={(event) => setForm((prev) => ({ ...prev, codigo: event.target.value }))}
                  />
                </CampoForm>
                <CampoForm label="CNPJ">
                  <input
                    className="input w-full"
                    value={form.cnpj}
                    onChange={(event) => setForm((prev) => ({ ...prev, cnpj: maskCpfCnpj(event.target.value) }))}
                    inputMode="numeric"
                    maxLength={18}
                  />
                </CampoForm>
              </FormSecao>

              <FormSecao legenda="Classificação" colunas={2}>
                <CampoForm label="Tipo">
                  <select
                    className="input w-full"
                    value={form.tipo_empresa}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      tipo_empresa: event.target.value,
                      tipo_gerencial: event.target.value === 'HOLDING' ? 'HOLDING' : prev.tipo_gerencial,
                      empresa_operacional: event.target.value === 'HOLDING' ? false : prev.empresa_operacional,
                      holding_id: event.target.value === 'HOLDING' ? '' : prev.holding_id
                    }))}
                  >
                    <option value="HOLDING">Holding</option>
                    <option value="OPERACIONAL">Empresa operacional</option>
                  </select>
                </CampoForm>
                <CampoForm label="Tipo gerencial">
                  <select
                    className="input w-full"
                    value={form.tipo_gerencial}
                    onChange={(event) => setForm((prev) => ({ ...prev, tipo_gerencial: event.target.value }))}
                  >
                    {TIPOS_GERENCIAIS.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </CampoForm>
                <CampoForm label="Holding controladora">
                  <select
                    className="input w-full"
                    value={form.holding_id}
                    onChange={(event) => setForm((prev) => ({ ...prev, holding_id: event.target.value }))}
                    disabled={form.tipo_empresa === 'HOLDING'}
                  >
                    <option value="">Não vinculada</option>
                    {holdings
                      .filter((holding) => Number(holding.id) !== Number(form.id))
                      .map((holding) => (
                        <option key={holding.id} value={holding.id}>
                          {holding.nome}
                        </option>
                    ))}
                  </select>
                </CampoForm>
                <div className="form-campo--linha">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.ativo}
                      onChange={(event) => setForm((prev) => ({ ...prev, ativo: event.target.checked }))}
                    />
                    Empresa ativa
                  </label>
                </div>
              </FormSecao>

              <FormSecao legenda="Classificação gerencial" colunas={2}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.empresa_caixa}
                    onChange={(event) => setForm((prev) => ({ ...prev, empresa_caixa: event.target.checked }))}
                  />
                  Empresa caixa / tesouraria
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.empresa_operacional}
                    onChange={(event) => setForm((prev) => ({ ...prev, empresa_operacional: event.target.checked }))}
                  />
                  Empresa operacional
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.consolidar_no_grupo}
                    onChange={(event) => setForm((prev) => ({ ...prev, consolidar_no_grupo: event.target.checked }))}
                  />
                  Consolidar no grupo
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.elimina_intercompany}
                    onChange={(event) => setForm((prev) => ({ ...prev, elimina_intercompany: event.target.checked }))}
                  />
                  Eliminar entre empresas no consolidado
                </label>
              </FormSecao>

              <div className="app-actionbar">
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar empresa'}
                </button>
                <button type="button" className="btn btn-outline" onClick={limparFormulario}>
                  {form.id ? 'Cancelar edição' : 'Cancelar'}
                </button>
              </div>
            </form>
          </BlocoConteudo>
          </div>
        </OverlayModal>
      )}

      <BlocoConteudo
        titulo="Empresas cadastradas"
        variante="primario"
        cor="var(--c-primary)"
      >
        {/* R12: busca larga em cima + filtro por marcação com etiquetas —
            o padrão das Solicitações; o filtro aplica ao marcar. */}
        <BarraFiltros
          busca={{
            valor: filtros.q,
            aoMudar: (valor) => setFiltros((prev) => ({ ...prev, q: valor })),
            placeholder: 'Buscar nome, código ou CNPJ'
          }}
          filtros={[{
            id: 'situacao',
            rotulo: 'Situação',
            // O parâmetro `ativo` do serviço aceita um valor só; sem `unico`
            // marcar Ativas+Inativas deixava duas etiquetas e filtro nenhum.
            unico: true,
            opcoes: [
              { valor: 'true', rotulo: 'Ativas' },
              { valor: 'false', rotulo: 'Inativas' }
            ]
          }]}
          ativos={{ situacao: filtros.situacao }}
          aoAlternar={(dim, valor, opcoes) => setFiltros((prev) => ({ ...alternarValorFiltro(prev, dim, valor, opcoes), q: prev.q }))}
          aoLimpar={() => setFiltros((prev) => ({ ...prev, situacao: new Set() }))}
        />

        <TabelaPadrao
          colunas={colunas}
          itens={empresas}
          carregando={carregando}
          storageKey="tabela:empresas-grupo"
          larguraAcoes={110}
          aoClicarLinha={selecionarEmpresa}
          vazio={{
            title: 'Nenhuma empresa do grupo cadastrada',
            message: 'Cadastre a primeira empresa para habilitar contas, caixa, pagamentos e RH/DP multiempresa.'
          }}
          acoesLinha={(item) => (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => selecionarEmpresa(item)}>
              Editar
            </button>
          )}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
