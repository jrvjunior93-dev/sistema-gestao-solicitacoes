import { useEffect, useMemo, useRef, useState } from 'react';
import {
  atualizarCanalCrm,
  criarCanalCrm,
  excluirCanalCrm,
  listarCanaisCrm
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
  nome: '',
  type: 'WHATSAPP',
  status: 'ACTIVE',
  provider: '',
  public_label: '',
  business_main_phone: '',
  operational_phone: '',
  tracking_phone: '',
  destination_phone: '',
  meta_waba_id: '',
  meta_phone_number_id: '',
  google_customer_id: ''
};

const TYPE_LABEL = {
  WHATSAPP: 'WhatsApp',
  PHONE: 'Telefone',
  EMAIL: 'E-mail',
  FORM: 'Formulario',
  CHAT: 'Chat'
};

const STATUS_LABEL = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  BLOCKED: 'Bloqueado'
};

/*
  R25 — o status vinha numa `app-status-pill bg-elevated text-main`: a MESMA
  pílula cinza para Ativo, Inativo e Bloqueado. Três situações com efeito
  externo diferente (canal bloqueado não recebe mensagem) exibidas
  exatamente iguais é cor que não informa nada. O StatusBadge resolve cor,
  ícone e contraste por token; o mapa é explícito porque a classificação
  automática leria "Bloqueado" como danger e "Inativo" como neutral, mas
  "Ativo" cairia certo por acaso — depender de acaso aqui é o defeito.
*/
const FAMILIA_STATUS = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  BLOCKED: 'danger'
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
  { id: 'type', rotulo: 'Tipo' },
  { id: 'status', rotulo: 'Status' }
];

export default function CrmAdminCanais() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  // R12: o recorte da lista é um conjunto de MARCAS (vazio = todos), nunca
  // um select de escolha única.
  const [filtros, setFiltros] = useState({ q: '', type: new Set(), status: new Set() });
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
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:crm-admin-canais', FILTROS_DA_TELA, {
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
  // R22: hook usado é hook importado — o useRef está no import acima. Leva o
  // foco ao formulário, que fica ACIMA da lista; não mede nada.
  const campoNomeRef = useRef(null);
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  async function load() {
    setLoading(true);
    try {
      const data = await listarCanaisCrm();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      // R19: a caixa do navegador (`alert`) some sem rastro e ignora o tema.
      avisar.erro(err.message || 'Erro ao carregar canais');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const listaFiltrada = useMemo(() => {
    const termo = normalizarBusca(filtros.q);
    return items.filter((item) => {
      // R23: recorte local, aplica ao marcar — não há consulta cara aqui.
      if (filtros.type.size > 0 && !filtros.type.has(String(item.type))) return false;
      if (filtros.status.size > 0 && !filtros.status.has(String(item.status))) return false;
      if (!termo) return true;
      const blob = normalizarBusca([
        item.nome,
        item.public_label,
        item.provider,
        item.business_main_phone,
        item.operational_phone,
        item.tracking_phone,
        item.destination_phone
      ].filter(Boolean).join(' '));
      return blob.includes(termo);
    });
  }, [filtros, items]);

  function updateField(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  // O formulário fica ACIMA da lista: sem levar o foco até ele, clicar em
  // "Editar" no fim de uma lista longa não muda nada no que a pessoa vê —
  // a edição aconteceria fora do campo de visão (R15).
  function focarFormulario() {
    campoNomeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    campoNomeRef.current?.focus({ preventScroll: true });
  }

  function novoCanal() {
    resetForm();
    focarFormulario();
  }

  function edit(item) {
    setEditingId(item.id);
    setForm({
      nome: item.nome || '',
      type: item.type || 'WHATSAPP',
      status: item.status || 'ACTIVE',
      provider: item.provider || '',
      public_label: item.public_label || '',
      business_main_phone: item.business_main_phone || '',
      operational_phone: item.operational_phone || '',
      tracking_phone: item.tracking_phone || '',
      destination_phone: item.destination_phone || '',
      meta_waba_id: item.meta_waba_id || '',
      meta_phone_number_id: item.meta_phone_number_id || '',
      google_customer_id: item.google_customer_id || ''
    });
    focarFormulario();
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await atualizarCanalCrm(editingId, form);
      } else {
        await criarCanalCrm(form);
      }
      resetForm();
      avisar.sucesso('Canal salvo.');
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao salvar canal');
    } finally {
      setSaving(false);
    }
  }

  /*
    R21 + R26 — excluir canal tem EFEITO EXTERNO REAL: o que chegava por ele
    deixa de chegar. Duas coisas, então:

    1. o retorno de `confirmar()` é DESESTRUTURADO (`const { ok } =`). Ler o
       objeto como booleano faria o "Cancelar" EXCLUIR o canal — objeto é
       sempre truthy;
    2. o canal é fixado numa `const` ANTES do `await`. O modal do sistema não
       congela a tela: clicar noutra linha enquanto a pergunta está aberta
       faria a tela perguntar por um canal e excluir outro — consentimento
       válido no log, ação sobre o registro errado.
  */
  async function remove(item) {
    const canal = item;
    const { ok } = await confirmar({
      titulo: 'Excluir canal CRM',
      mensagem: `Excluir o canal "${canal.nome}"? Mensagens e eventos que chegavam por ele deixam de ser recebidos. Esta acao nao pode ser desfeita.`,
      rotuloConfirmar: 'Excluir canal',
      destrutiva: true
    });
    if (!ok) return;
    try {
      await excluirCanalCrm(canal.id);
      avisar.sucesso('Canal excluído.');
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao excluir canal');
    }
  }

  /*
    R1/R17 — cada coluna declara o PAPEL (`tipo`); largura e alinhamento são
    do componente. Nenhum dado saiu: os pares da mesma família viraram
    CelulaDupla e os três números continuam na mesma célula.
  */
  const colunas = [
    {
      id: 'canal',
      titulo: 'Canal',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => (
        <CelulaDupla principal={item.nome} sub={item.public_label || null} />
      )
    },
    {
      id: 'tipo',
      titulo: 'Tipo',
      tipo: 'badge',
      render: (item) => TYPE_LABEL[item.type] || item.type || '-'
    },
    {
      id: 'provider',
      titulo: 'Fornecedor',
      tipo: 'texto',
      render: (item) => item.provider || '-'
    },
    {
      id: 'numeros',
      titulo: 'Números',
      tipo: 'texto',
      render: (item) => (
        <CelulaDupla
          principal={`Principal: ${item.business_main_phone || '-'}`}
          sub={`Operacional: ${item.operational_phone || '-'} · Tracking: ${item.tracking_phone || '-'}`}
        />
      )
    },
    {
      id: 'destino',
      titulo: 'Destino',
      tipo: 'texto',
      render: (item) => item.destination_phone || '-'
    },
    {
      id: 'meta_waba_id',
      titulo: 'Meta WABA ID',
      tipo: 'codigo',
      render: (item) => item.meta_waba_id || '-'
    },
    {
      id: 'meta_phone_number_id',
      titulo: 'Meta Phone ID',
      tipo: 'codigo',
      render: (item) => item.meta_phone_number_id || '-'
    },
    {
      id: 'google_customer_id',
      titulo: 'Google Customer ID',
      tipo: 'codigo',
      render: (item) => item.google_customer_id || '-'
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
      {/* R13/R5/C1: o cabeçalho era `app-toolbar-card` com o apoio num
          `page-subtitle` solto — sem faixa fixa e sem compactação. */}
      <PageHeader
        titulo="Canais CRM"
        contagem={loading ? null : `${listaFiltrada.length} canal(is)`}
        descricao="Configure canais de origem, atendimento e rastreamento."
        acaoPrincipal={{ rotulo: 'Novo canal', onClick: novoCanal }}
        secundarias={[{ rotulo: 'Atualizar', onClick: load, desabilitada: loading }]}
      />

      {/* R16: UM dono para a faixa de avisos. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, painel ACIMA da lista.
        Esta tela EXISTE para cadastrar canal: pelo teste da regra, tirando o
        formulário sobra uma lista que ninguém abriria por si só. Modal aqui
        obrigaria a abrir e fechar para fazer justamente o que se veio fazer.
      */}
      <BlocoConteudo titulo={editingId ? 'Editar canal' : 'Novo canal'}>
        <form onSubmit={submit} className="space-y-4">
          <FormSecao legenda="Identificação" colunas={3}>
            <CampoForm label="Nome interno" obrigatorio>
              <input ref={campoNomeRef} className="input w-full" value={form.nome} onChange={updateField('nome')} required />
            </CampoForm>
            <CampoForm label="Tipo">
              {/* R12: select de FORMULÁRIO (entrada de dado do registro) —
                  legítimo. O recorte da lista é que virou marcação. */}
              <select className="input w-full" value={form.type} onChange={updateField('type')}>
                {Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </CampoForm>
            <CampoForm label="Status">
              <select className="input w-full" value={form.status} onChange={updateField('status')}>
                {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </CampoForm>
            <CampoForm label="Fornecedor">
              <input className="input w-full" value={form.provider} onChange={updateField('provider')} placeholder="Meta, Google, Zenvia..." />
            </CampoForm>
            <CampoForm label="Nome publico" span={2}>
              <input className="input w-full" value={form.public_label} onChange={updateField('public_label')} />
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Números do canal" colunas={4}>
            <CampoForm label="Número principal">
              <input className="input w-full" value={form.business_main_phone} onChange={updateField('business_main_phone')} />
            </CampoForm>
            <CampoForm label="Número operacional">
              <input className="input w-full" value={form.operational_phone} onChange={updateField('operational_phone')} />
            </CampoForm>
            <CampoForm label="Tracking">
              <input className="input w-full" value={form.tracking_phone} onChange={updateField('tracking_phone')} />
            </CampoForm>
            <CampoForm label="Destino">
              <input className="input w-full" value={form.destination_phone} onChange={updateField('destination_phone')} />
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Identificadores do fornecedor" colunas={3}>
            <CampoForm label="Meta WABA ID">
              <input className="input w-full" value={form.meta_waba_id} onChange={updateField('meta_waba_id')} />
            </CampoForm>
            <CampoForm label="Meta Phone ID">
              <input className="input w-full" value={form.meta_phone_number_id} onChange={updateField('meta_phone_number_id')} />
            </CampoForm>
            <CampoForm label="Google Customer ID">
              <input className="input w-full" value={form.google_customer_id} onChange={updateField('google_customer_id')} />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : editingId ? 'Salvar canal' : 'Criar canal'}
            </button>
            {editingId ? (
              <button type="button" className="btn btn-outline" onClick={resetForm}>Cancelar edição</button>
            ) : null}
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Canais cadastrados"
        descricao="Origem, atendimento e rastreamento de cada canal em uso."
        variante="primario"
        cor="var(--c-primary)"
      >
        {/* R12/R3: busca única em cima ocupando a faixa e, abaixo, os
            filtros por MARCAÇÃO com etiquetas removíveis. */}
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('q') ? {
            valor: filtros.q,
            aoMudar: (valor) => setFiltros((prev) => ({ ...prev, q: valor })),
            placeholder: 'Buscar nome, nome publico, fornecedor ou número'
          } : null}
          filtros={[
            {
              id: 'type',
              rotulo: 'Tipo',
              opcoes: Object.entries(TYPE_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }))
            },
            {
              id: 'status',
              rotulo: 'Status',
              opcoes: Object.entries(STATUS_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }))
            }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={{ type: filtros.type, status: filtros.status }}
          aoAlternar={(dim, valor, opcoes) => setFiltros((prev) => ({
            ...alternarValorFiltro(prev, dim, valor, opcoes),
            q: prev.q
          }))}
          aoLimpar={() => setFiltros((prev) => ({ ...prev, type: new Set(), status: new Set() }))}
          visibilidade={visibilidadeFiltros}
        />

        {/* A1: a ação da linha é um <button> focável e a linha inteira é
            acionável por teclado (o TabelaPadrao dá tabIndex + Enter/Espaço
            quando recebe aoClicarLinha). */}
        <TabelaPadrao
          colunas={colunas}
          itens={listaFiltrada}
          getId={(item) => item.id}
          carregando={loading}
          vazio={{
            title: 'Nenhum canal cadastrado',
            message: 'Cadastre o primeiro canal para o CRM passar a receber e classificar as origens.'
          }}
          storageKey="tabela:crm-admin-canais"
          rotuloRolagem="Canais CRM"
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
