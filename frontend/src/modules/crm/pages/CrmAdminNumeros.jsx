import { useEffect, useMemo, useRef, useState } from 'react';
import {
  atualizarNumeroCrm,
  criarNumeroCrm,
  excluirNumeroCrm,
  listarNumerosCrm
} from '../../../services/crm';
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
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';

const EMPTY_FORM = {
  label: '',
  phone_number: '',
  country_code: '+55',
  role_type: 'OPERATIONAL',
  provider: '',
  is_whatsapp_enabled: false,
  is_google_ads_enabled: false,
  is_meta_ads_enabled: false,
  display_name: '',
  risk_level: 'LOW',
  can_receive_messages: true,
  can_receive_calls: true,
  forward_to_phone: '',
  status: 'ACTIVE',
  notes: ''
};

const ROLE_LABEL = {
  MAIN: 'Principal',
  OPERATIONAL: 'Operacional',
  TRACKING: 'Tracking',
  DESTINATION: 'Destino'
};

const STATUS_LABEL = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  SUSPENDED: 'Suspenso'
};

const RISK_LABEL = {
  LOW: 'Baixo',
  MEDIUM: 'Medio',
  HIGH: 'Alto'
};

/*
  R25 — status e risco vinham como pílula cinza única (`app-status-pill
  bg-elevated text-main`): "Ativo" e "Suspenso" pintados igual. São dois
  eixos SEMÂNTICOS diferentes e cada um ganha o seu mapa, porque a
  classificação automática do StatusBadge lê o texto e jogaria "Baixo",
  "Medio" e "Alto" todos em 'info' — as três faixas de risco com a mesma
  cor é justamente a distinção que a tela precisa mostrar.
*/
const FAMILIA_STATUS = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'danger'
};

const FAMILIA_RISCO = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger'
};

function normalizarBusca(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/*
  QUAIS FILTROS APARECEM (N53) — a declaração desta tela para o painel
  único de `PainelFiltrosVisiveis`, no molde do painel "Colunas" da
  TabelaPadrao.

  NENHUM `padrao: false`: todos os filtros continuam VISÍVEIS na primeira
  abertura. Só três telas têm conjunto inicial reduzido, e é o que o
  cliente aprovou nelas — aqui o seletor apenas passa a EXISTIR, para quem
  quiser mexer. Esconder por padrão mudaria o que a pessoa vê sem ela ter
  pedido.

  `obrigatorio` na busca livre: é o único caminho para achar um registro
  pelo que a pessoa lembra dele. Mesma família da coluna de identidade
  travada da TabelaPadrao — aparece na lista, marcada e sem desmarcar.
*/
const FILTROS_DA_TELA = [
  { id: 'q', rotulo: 'Busca', obrigatorio: true },
  { id: 'role_type', rotulo: 'Papel' },
  { id: 'status', rotulo: 'Status' },
  { id: 'risk_level', rotulo: 'Risco' }
];

export default function CrmAdminNumeros() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  // R12: recorte por MARCAÇÃO (vazio = todos), nunca select de escolha única.
  const [filtros, setFiltros] = useState({ q: '', role_type: new Set(), status: new Set(), risk_level: new Set() });
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      const valor = filtros[filtro.id];
      return valor instanceof Set ? valor.size > 0 : String(valor ?? '').trim() !== '';
    }).map((filtro) => filtro.id),
    [filtros]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:crm-admin-numeros', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      setFiltros((atual) => ({ ...atual, [id]: atual[id] instanceof Set ? new Set() : '' }));
    }
  });
  // R22: hook usado é hook importado — leva o foco ao formulário, que fica
  // ACIMA da lista; não mede nada.
  const campoLabelRef = useRef(null);
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  async function load() {
    setLoading(true);
    try {
      const data = await listarNumerosCrm();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      // R19: no lugar do `alert` do navegador.
      avisar.erro(err.message || 'Erro ao carregar numeros');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const listaFiltrada = useMemo(() => {
    const termo = normalizarBusca(filtros.q);
    return items.filter((item) => {
      // R23: recorte local, aplica ao marcar.
      if (filtros.role_type.size > 0 && !filtros.role_type.has(String(item.role_type))) return false;
      if (filtros.status.size > 0 && !filtros.status.has(String(item.status))) return false;
      if (filtros.risk_level.size > 0 && !filtros.risk_level.has(String(item.risk_level))) return false;
      if (!termo) return true;
      const blob = normalizarBusca([
        item.label,
        item.display_name,
        item.provider,
        item.country_code,
        item.phone_number,
        item.forward_to_phone,
        item.notes
      ].filter(Boolean).join(' '));
      return blob.includes(termo);
    });
  }, [filtros, items]);

  function updateField(field) {
    return (event) => {
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
    };
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  // Formulário ACIMA da lista: sem levar o foco, "Editar" no fim de uma
  // lista longa não muda nada no campo de visão (R15).
  function focarFormulario() {
    campoLabelRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    campoLabelRef.current?.focus({ preventScroll: true });
  }

  function novoNumero() {
    resetForm();
    focarFormulario();
  }

  function edit(item) {
    setEditingId(item.id);
    setForm({
      label: item.label || '',
      phone_number: item.phone_number || '',
      country_code: item.country_code || '+55',
      role_type: item.role_type || 'OPERATIONAL',
      provider: item.provider || '',
      is_whatsapp_enabled: Boolean(item.is_whatsapp_enabled),
      is_google_ads_enabled: Boolean(item.is_google_ads_enabled),
      is_meta_ads_enabled: Boolean(item.is_meta_ads_enabled),
      display_name: item.display_name || '',
      risk_level: item.risk_level || 'LOW',
      can_receive_messages: Boolean(item.can_receive_messages),
      can_receive_calls: Boolean(item.can_receive_calls),
      forward_to_phone: item.forward_to_phone || '',
      status: item.status || 'ACTIVE',
      notes: item.notes || ''
    });
    focarFormulario();
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await atualizarNumeroCrm(editingId, form);
      } else {
        await criarNumeroCrm(form);
      }
      resetForm();
      avisar.sucesso('Número salvo.');
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao salvar numero');
    } finally {
      setSaving(false);
    }
  }

  /*
    R21 + R26 — remover número tem EFEITO EXTERNO REAL: quem liga ou manda
    mensagem para ele deixa de ser atendido pelo CRM.

    1. `const { ok } = await confirmar(...)` — DESESTRUTURADO. O objeto
       `{ ok, texto }` é sempre truthy: lido como booleano, o "Cancelar"
       EXCLUIRIA o número;
    2. o número é fixado numa `const` ANTES do `await` — o modal do sistema
       não congela a tela, e clicar noutra linha com a pergunta aberta faria
       perguntar por um número e excluir outro.
  */
  async function remove(item) {
    const numero = item;
    const identificacao = `${numero.label || ''} ${numero.country_code || ''} ${numero.phone_number || ''}`.trim();
    const { ok } = await confirmar({
      titulo: 'Excluir número CRM',
      mensagem: `Excluir o numero ${identificacao}? Mensagens e ligacoes que chegavam por ele deixam de ser recebidas. Esta acao nao pode ser desfeita.`,
      rotuloConfirmar: 'Excluir numero',
      destrutiva: true
    });
    if (!ok) return;
    try {
      await excluirNumeroCrm(numero.id);
      avisar.sucesso('Número excluído.');
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao excluir numero');
    }
  }

  /*
    R1/R17 — coluna declara o PAPEL (`tipo`), não a largura. Os campos que a
    lista antiga não mostrava (risco, encaminhamento, recebe mensagens,
    recebe ligações, observações) ganharam coluna própria em vez de
    continuarem invisíveis; quem não quiser esconde no painel de colunas.
  */
  const colunas = [
    {
      id: 'numero',
      titulo: 'Número',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => (
        <CelulaDupla
          principal={item.label}
          sub={`${item.country_code || ''} ${item.phone_number || ''}`.trim() || null}
        />
      )
    },
    {
      id: 'papel',
      titulo: 'Papel',
      tipo: 'badge',
      render: (item) => ROLE_LABEL[item.role_type] || item.role_type || '-'
    },
    {
      id: 'display_name',
      titulo: 'Nome exibido',
      tipo: 'texto',
      render: (item) => item.display_name || '-'
    },
    {
      id: 'provider',
      titulo: 'Provider',
      tipo: 'texto',
      render: (item) => item.provider || '-'
    },
    {
      id: 'uso',
      titulo: 'Uso',
      tipo: 'texto',
      render: (item) => (
        <CelulaDupla
          principal={`WhatsApp: ${item.is_whatsapp_enabled ? 'sim' : 'nao'}`}
          sub={`Meta: ${item.is_meta_ads_enabled ? 'sim' : 'nao'} · Google: ${item.is_google_ads_enabled ? 'sim' : 'nao'}`}
        />
      )
    },
    {
      id: 'recebe',
      titulo: 'Recebe',
      tipo: 'texto',
      render: (item) => (
        <CelulaDupla
          principal={`Mensagens: ${item.can_receive_messages ? 'sim' : 'nao'}`}
          sub={`Ligacoes: ${item.can_receive_calls ? 'sim' : 'nao'}`}
        />
      )
    },
    {
      id: 'forward_to_phone',
      titulo: 'Encaminhar para',
      tipo: 'texto',
      render: (item) => item.forward_to_phone || '-'
    },
    {
      id: 'risco',
      titulo: 'Risco',
      tipo: 'badge',
      render: (item) => (
        <StatusBadge
          status={RISK_LABEL[item.risk_level] || item.risk_level}
          kind={FAMILIA_RISCO[item.risk_level] || 'neutral'}
        />
      )
    },
    {
      id: 'notes',
      titulo: 'Observações',
      tipo: 'texto',
      // T6: texto longo trunca com o texto completo no tooltip.
      render: (item) => <span title={item.notes || undefined}>{item.notes || '-'}</span>
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      render: (item) => (
        <StatusBadge
          status={STATUS_LABEL[item.status] || item.status}
          kind={FAMILIA_STATUS[item.status] || 'neutral'}
        />
      )
    }
  ];

  return (
    <Pagina>
      {/* R13/R5/C1: título, contagem e apoio na faixa fixa do PageHeader. */}
      <PageHeader
        titulo="Números CRM"
        contagem={loading ? null : `${listaFiltrada.length} numero(s)`}
        descricao="Separe número institucional, operacional, tracking e destino."
        acaoPrincipal={{ rotulo: 'Novo número', onClick: novoNumero }}
        secundarias={[{ rotulo: 'Atualizar', onClick: load, desabilitada: loading }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, painel ACIMA da lista.
        A tela EXISTE para cadastrar número: tirando o formulário sobra uma
        lista que ninguém abriria por si só. Modal aqui é atrito.
      */}
      <BlocoConteudo titulo={editingId ? 'Editar numero' : 'Novo numero'}>
        <form onSubmit={submit} className="space-y-4">
          <FormSecao legenda="Identificação" colunas={4}>
            <CampoForm label="Identificação" obrigatorio>
              <input ref={campoLabelRef} className="input w-full" value={form.label} onChange={updateField('label')} required />
            </CampoForm>
            <CampoForm label="DDI">
              <input className="input w-full" value={form.country_code} onChange={updateField('country_code')} />
            </CampoForm>
            <CampoForm label="Número" obrigatorio>
              <input className="input w-full" value={form.phone_number} onChange={updateField('phone_number')} required />
            </CampoForm>
            <CampoForm label="Papel">
              {/* R12: select de FORMULÁRIO (entrada de dado) — legítimo. */}
              <select className="input w-full" value={form.role_type} onChange={updateField('role_type')}>
                {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </CampoForm>
            <CampoForm label="Provider">
              <input className="input w-full" value={form.provider} onChange={updateField('provider')} />
            </CampoForm>
            <CampoForm label="Nome exibido">
              <input className="input w-full" value={form.display_name} onChange={updateField('display_name')} />
            </CampoForm>
            <CampoForm label="Risco">
              <select className="input w-full" value={form.risk_level} onChange={updateField('risk_level')}>
                {Object.entries(RISK_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </CampoForm>
            <CampoForm label="Status">
              <select className="input w-full" value={form.status} onChange={updateField('status')}>
                {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Encaminhamento e capacidades" colunas={2}>
            <CampoForm label="Encaminhar para">
              <input className="input w-full" value={form.forward_to_phone} onChange={updateField('forward_to_phone')} />
            </CampoForm>
            <CampoForm label="Observações">
              <input className="input w-full" value={form.notes} onChange={updateField('notes')} />
            </CampoForm>

            <div className="form-campo--linha app-actionbar">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_whatsapp_enabled} onChange={updateField('is_whatsapp_enabled')} />
                WhatsApp ativo
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_google_ads_enabled} onChange={updateField('is_google_ads_enabled')} />
                Google Ads
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_meta_ads_enabled} onChange={updateField('is_meta_ads_enabled')} />
                Meta Ads
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.can_receive_messages} onChange={updateField('can_receive_messages')} />
                Recebe mensagens
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.can_receive_calls} onChange={updateField('can_receive_calls')} />
                Recebe ligacoes
              </label>
            </div>
          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : editingId ? 'Salvar numero' : 'Criar numero'}
            </button>
            {editingId ? (
              <button type="button" className="btn btn-outline" onClick={resetForm}>Cancelar edição</button>
            ) : null}
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Números cadastrados"
        descricao="Base de números que o CRM usa para receber, rastrear e encaminhar."
        variante="primario"
        cor="var(--c-primary)"
      >
        {/* R12/R3: busca larga em cima e filtros por marcação abaixo. */}
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('q') ? {
            valor: filtros.q,
            aoMudar: (valor) => setFiltros((prev) => ({ ...prev, q: valor })),
            placeholder: 'Buscar identificação, número, provider ou observação'
          } : null}
          filtros={[
            {
              id: 'role_type',
              rotulo: 'Papel',
              opcoes: Object.entries(ROLE_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }))
            },
            {
              id: 'status',
              rotulo: 'Status',
              opcoes: Object.entries(STATUS_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }))
            },
            {
              id: 'risk_level',
              rotulo: 'Risco',
              opcoes: Object.entries(RISK_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }))
            }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={{ role_type: filtros.role_type, status: filtros.status, risk_level: filtros.risk_level }}
          aoAlternar={(dim, valor, opcoes) => setFiltros((prev) => ({
            ...alternarValorFiltro(prev, dim, valor, opcoes),
            q: prev.q
          }))}
          aoLimpar={() => setFiltros((prev) => ({
            ...prev,
            role_type: new Set(),
            status: new Set(),
            risk_level: new Set()
          }))}
          visibilidade={visibilidadeFiltros}
        />

        {/* A1: ação da linha em <button> focável e linha acionável por
            teclado (tabIndex + Enter/Espaço vêm do TabelaPadrao). */}
        <TabelaPadrao
          colunas={colunas}
          itens={listaFiltrada}
          getId={(item) => item.id}
          carregando={loading}
          vazio={{
            title: 'Nenhum numero cadastrado',
            message: 'Cadastre o primeiro numero para separar institucional, operacional, tracking e destino.'
          }}
          storageKey="tabela:crm-admin-numeros"
          rotuloRolagem="Numeros CRM"
          colunasConfiguraveis
          aoClicarLinha={edit}
          acoesLinha={(item) => (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => edit(item)}>Editar</button>
              {/* Destrutivo em vermelho suave e APARTADO das demais ações. */}
              <span className="app-actionbar-apartada">
                <button type="button" className="btn btn-outline btn-sm btn-perigo-suave" onClick={() => remove(item)}>
                  Excluir
                </button>
              </span>
            </>
          )}
          larguraAcoes={200}
        />
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
