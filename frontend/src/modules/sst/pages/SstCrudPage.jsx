import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { canManageSstArea, canViewSstArea } from '../../../utils/acessoProduto';
import { useAuth } from '../../../contexts/AuthContext';
import { useUiVisibility } from '../../../hooks/useUiVisibility';
import { getObras } from '../../../services/obras';
import { getRhColaboradores, getRhEmpresasGrupo } from '../../../services/rhDp';
import {
  analisarDocumentoIaSst,
  aprovarAnaliseIaSst,
  atualizarSst,
  criarSst,
  getDocumentoSstUrl,
  listarSst,
  rejeitarAnaliseIaSst,
  sincronizarEventosVencimentoSst,
  uploadDocumentoSst
} from '../services/sst';
import { isSstResourceVisible, SST_RESOURCES } from '../constants/sstResources';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  TabelaPadrao,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import { getCpfCnpjError, maskCpfCnpj, onlyDigits } from '../../../utils/formatters';

const FILTROS_VAZIOS = { empresa_id: '', obra_id: '', colaborador_id: '', status: '', search: '' };

function getValue(row, path) {
  return String(path).split('.').reduce((acc, key) => acc?.[key], row);
}

// R17 — esta tela é genérica: uma rota por recurso SST, com as colunas vindo
// do catálogo (constants/sstResources) como caminhos de campo. O papel de
// cada coluna é derivado AQUI, no ponto de uso, para que nenhuma coluna
// chegue à tabela sem `tipo` (a medida e o alinhamento saem dele).
const REGRAS_TIPO_COLUNA = [
  [/(^|\.)(createdAt|updatedAt|calculado_em|sampled_at|expires_at|last_hit_at|entrega_em)$/i, 'data'],
  [/(data|validade|vigencia)/i, 'data'],
  [/(^|\.)(status|ativo|apto|resultado|cat_emitida|epc_eficaz|epi_eficaz|utiliza_epc|utiliza_epi)$/i, 'status'],
  [/(severidade|criticidade|gravidade|prioridade|nivel|confianca)/i, 'badge'],
  // Chave técnica é CÓDIGO, não nome: job_type, queue_name, metric_name e
  // cache_key preservam a caixa em que foram gravados (SstWorkflowJob,
  // sst-default) — vê-los em maiúsculas mudaria o dado aos olhos de quem lê.
  [/(^|\.)(codigo|protocolo|recibo|ca|crm|cache_key|namespace|entidade_id|workflow_id|job_type|queue_name|metric_name|metric_group)$/i, 'codigo'],
  [/(_ms$|_count$|_jobs$|attempts|score|peso|percentual|ordem|valor|intensidade)/i, 'numero']
];

/*
  A coluna que NOMEIA o registro (R17), em duas camadas e nesta ordem:

  1. NOME PRÓPRIO DO PRÓPRIO REGISTRO (campo sem ponto). É o que o usuário
     usa para falar da linha: o nome do risco, o título do documento, o
     responsável do PGR.
  2. NOME DO REGISTRO RELACIONADO (caminho com ponto: colaborador.nome,
     workflow.nome, documento.titulo), quando o registro não tem nome
     próprio — uma exposição ocupacional é lida pelo colaborador.

  A ordem importa e corrige o que a versão anterior fazia: ela pegava a
  PRIMEIRA coluna que casasse, na ordem do catálogo, então em `treinamentos`
  (['colaborador.nome','codigo','nome',…]) a identidade caía no colaborador
  em vez de no nome do treinamento, e em `recomendacoes`/`pendencias` caía na
  obra em vez de no título do registro.

  Ficam DELIBERADAMENTE de fora as chaves técnicas (job_type, queue_name,
  metric_name, cache_key, automacao, integracao): identidade é exibida sempre
  em MAIÚSCULAS, e "SstScoreRecalculationJob" virando "SSTSCORERECALCULATIONJOB"
  deixa de ser o identificador que existe no sistema. Recurso cuja única
  coluna candidata é uma dessas — e todo recurso de log/telemetria, que só
  tem data, tipo, status e mensagem — declara `semIdentidade`.
*/
const PADRAO_NOME_PROPRIO = /^(nome|titulo|razao_social|nome_exame|epi_nome|responsavel|responsavel_tecnico|medico_responsavel)$/i;
const PADRAO_NOME_RELACIONADO = /^[a-z_]+\.(nome|titulo|razao_social)$/i;

function tipoDaColuna(caminho) {
  const regra = REGRAS_TIPO_COLUNA.find(([padrao]) => padrao.test(caminho));
  return regra ? regra[1] : 'texto';
}

// Título da coluna legível: o catálogo guarda o CAMINHO do campo
// ('colaborador.nome'), que é endereço de dado, não rótulo de cabeçalho.
function tituloDaColuna(caminho, fields = []) {
  const doFormulario = fields.find((field) => field.key === caminho);
  if (doFormulario?.label) return doFormulario.label;
  const partes = String(caminho).split('.');
  const base = partes.length > 1 && /^(nome|titulo|razao_social)$/i.test(partes[partes.length - 1])
    ? partes[partes.length - 2]
    : partes[partes.length - 1];
  const texto = base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function emptyForm(fields) {
  return fields.reduce((acc, field) => {
    acc[field.key] = field.type === 'checkbox' ? false : '';
    return acc;
  }, {});
}

function optionLabel(type, item) {
  if (!item) return '';
  if (type === 'colaboradores') {
    return [item.nome, item.cpf ? `CPF ${item.cpf}` : null].filter(Boolean).join(' - ');
  }
  if (type === 'obras') {
    return [item.nome, item.codigo ? `Codigo ${item.codigo}` : null].filter(Boolean).join(' - ');
  }
  if (['ambientes', 'riscos', 'agentes', 'asos'].includes(type)) {
    return item.nome || item.tipo_exame || item.nome_exame || item.titulo || `#${item.id}`;
  }
  return item.razao_social || item.nome_fantasia || item.nome || `#${item.id}`;
}

/*
  Booleano é DADO, não ausência de dado. A versão anterior renderizava
  `String(valor || '-')`: com `ativo: false` a célula mostrava "—", que na
  tabela inteira significa "campo vazio". Um registro DESATIVADO aparecia
  como registro sem informação — e "ativo" é exatamente a coluna que decide
  se aquilo ainda vale. Sim/Não com o tom semântico do sistema.
*/
function CelulaValor({ valor }) {
  if (typeof valor === 'boolean') {
    return <StatusBadge status={valor ? 'Sim' : 'Nao'} kind={valor ? 'success' : 'neutral'} />;
  }
  if (valor === null || valor === undefined || valor === '') return '-';
  return String(valor);
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
  { id: 'search', rotulo: 'Busca', obrigatorio: true },
  { id: 'empresa_id', rotulo: 'Empresa' },
  { id: 'obra_id', rotulo: 'Obra/Centro' },
  { id: 'colaborador_id', rotulo: 'Colaborador' },
  { id: 'status', rotulo: 'Status' }
];

export default function SstCrudPage() {
  const { resource } = useParams();
  const { user } = useAuth();
  const { isVisible } = useUiVisibility();
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const config = SST_RESOURCES[resource] || SST_RESOURCES.riscos;
  const canView = canViewSstArea(user, config.area);
  const canManage = canManageSstArea(user, config.area);
  const tableVisible = isVisible(`sst.${resource}.tabela`);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(() => emptyForm(config.fields));
  const [editing, setEditing] = useState(null);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [erroCpf, setErroCpf] = useState('');
  const [refs, setRefs] = useState({ empresas: [], obras: [], colaboradores: [], ambientes: [], riscos: [], agentes: [], asos: [], ltcats: [] });
  const [filters, setFilters] = useState(FILTROS_VAZIOS);
  const [syncingEvents, setSyncingEvents] = useState(false);
  const [rowActionId, setRowActionId] = useState('');

  useEffect(() => {
    setForm(emptyForm(config.fields));
    setEditing(null);
    setFile(null);
    setErroCpf('');
  }, [resource, config.fields]);

  const load = (params = filters) => {
    setLoading(true);
    listarSst(resource, params)
      .then((payload) => {
        setRows(payload.rows || []);
      })
      .catch((err) => avisar.erro(err.message || 'Erro ao carregar SST'))
      .finally(() => setLoading(false));
  };

  /*
    R23 — o recorte custa UMA requisição, então marcar APLICA na hora: a
    etiqueta que aparece na faixa já descreve o que está filtrando. O botão
    "Aplicar" que existia antes (e a cópia manual do fetch dentro do "Limpar")
    saíram porque a mesma consulta passou a ser uma só, aqui: recurso ou
    recorte mudou, a lista recarrega. A espera de 350ms é a da digitação da
    busca (R23), que vale para o recorte inteiro sem multiplicar requisição.
  */
  useEffect(() => {
    if (!canView) return undefined;
    const timer = setTimeout(() => load(filters), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, canView, filters]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getRhEmpresasGrupo({ ativo: true }),
      getObras({ ativo: true }),
      getRhColaboradores({ status: 'ATIVO' }),
      listarSst('ambientes', { limit: 200 }),
      listarSst('riscos', { limit: 200 }),
      listarSst('agentes', { limit: 200 }),
      listarSst('aso', { limit: 200 }),
      listarSst('ltcat', { limit: 200 })
    ]).then(([empresasResult, obrasResult, colaboradoresResult, ambientesResult, riscosResult, agentesResult, asosResult, ltcatsResult]) => {
      if (!active) return;
      setRefs({
        empresas: empresasResult.status === 'fulfilled' && Array.isArray(empresasResult.value) ? empresasResult.value : [],
        obras: obrasResult.status === 'fulfilled' && Array.isArray(obrasResult.value) ? obrasResult.value : [],
        colaboradores: colaboradoresResult.status === 'fulfilled' && Array.isArray(colaboradoresResult.value) ? colaboradoresResult.value : [],
        ambientes: ambientesResult.status === 'fulfilled' ? (ambientesResult.value.rows || []) : [],
        riscos: riscosResult.status === 'fulfilled' ? (riscosResult.value.rows || []) : [],
        agentes: agentesResult.status === 'fulfilled' ? (agentesResult.value.rows || []) : [],
        asos: asosResult.status === 'fulfilled' ? (asosResult.value.rows || []) : [],
        ltcats: ltcatsResult.status === 'fulfilled' ? (ltcatsResult.value.rows || []) : []
      });
    });
    return () => {
      active = false;
    };
  }, []);

  const columns = useMemo(() => config.columns || [], [config.columns]);

  // Identidade: nome próprio do registro primeiro; nome do relacionado só
  // quando o registro não tem um. Ver o comentário dos padrões acima.
  const indiceIdentidade = useMemo(() => {
    const proprio = columns.findIndex((coluna) => PADRAO_NOME_PROPRIO.test(coluna));
    if (proprio >= 0) return proprio;
    return columns.findIndex((coluna) => PADRAO_NOME_RELACIONADO.test(coluna));
  }, [columns]);

  const colunasTabela = useMemo(() => columns.map((coluna, indice) => ({
    id: coluna,
    titulo: tituloDaColuna(coluna, config.fields),
    tipo: indice === indiceIdentidade ? 'identidade' : tipoDaColuna(coluna),
    noCard: indice === indiceIdentidade ? 'titulo' : undefined,
    render: (row) => {
      const valor = getValue(row, coluna);
      if (indice !== indiceIdentidade && tipoDaColuna(coluna) === 'status' && valor !== '' && valor !== null && valor !== undefined) {
        if (typeof valor === 'boolean') return <CelulaValor valor={valor} />;
        return <StatusBadge status={String(valor)} />;
      }
      return <CelulaValor valor={valor} />;
    }
  })), [columns, indiceIdentidade, config.fields]);

  const statusOpcoes = useMemo(() => {
    const campoStatus = (config.fields || []).find((field) => field.key === 'status');
    return (campoStatus?.options || []).map((opcao) => ({ valor: opcao, rotulo: opcao }));
  }, [config.fields]);

  const ativos = useMemo(() => ({
    empresa_id: new Set(filters.empresa_id ? [String(filters.empresa_id)] : []),
    obra_id: new Set(filters.obra_id ? [String(filters.obra_id)] : []),
    colaborador_id: new Set(filters.colaborador_id ? [String(filters.colaborador_id)] : []),
    status: new Set(filters.status ? [String(filters.status)] : [])
  }), [filters]);

  /*
    `unico: true` nas quatro dimensões: o serviço aceita UM valor por chave
    (empresa_id=1) e o estado guarda escalar. Marcar duas com caixa quadrada
    prometeria combinação e entregaria substituição (R15).
  */
  const dimensoes = useMemo(() => {
    const lista = [
      {
        id: 'empresa_id',
        rotulo: 'Empresa',
        unico: true,
        opcoes: refs.empresas.map((item) => ({ valor: String(item.id), rotulo: optionLabel('empresas', item) }))
      },
      {
        id: 'obra_id',
        rotulo: 'Obra/Centro',
        unico: true,
        opcoes: refs.obras.map((item) => ({ valor: String(item.id), rotulo: optionLabel('obras', item) }))
      },
      {
        id: 'colaborador_id',
        rotulo: 'Colaborador',
        unico: true,
        opcoes: refs.colaboradores.map((item) => ({ valor: String(item.id), rotulo: optionLabel('colaboradores', item) }))
      }
    ];
    // O status só vira marcação onde o catálogo declara as opções do recurso;
    // sem lista fechada não há o que marcar, e ele fica como campo de texto
    // (exceção declarada do BarraFiltros, não porta dos fundos).
    if (statusOpcoes.length) {
      lista.push({ id: 'status', rotulo: 'Status', unico: true, opcoes: statusOpcoes });
    }
    return lista;
  }, [refs, statusOpcoes]);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => String(filters[filtro.id] ?? '').trim() !== '').map((filtro) => filtro.id),
    [filters]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis(`tabela:sst-crud:${resource}`, FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => setFilters((atual) => ({ ...atual, [id]: '' }))
  });

  if (!isSstResourceVisible(resource)) {
    return <Navigate to="/sst" replace />;
  }

  if (!canView) {
    return (
      <Pagina className="sst-page">
        <PageHeader titulo={config.title} voltar={{ to: '/sst', title: 'Voltar ao painel SST' }} />
        <div className="app-alert">Você não tem permissão para visualizar esta área do SST.</div>
      </Pagina>
    );
  }

  const alternarFiltro = (dimensao, valor) => {
    setFilters((current) => ({
      ...current,
      [dimensao]: String(current[dimensao]) === String(valor) ? '' : String(valor)
    }));
  };

  const limparFiltros = () => setFilters(FILTROS_VAZIOS);

  const startEdit = (row) => {
    const next = emptyForm(config.fields);
    config.fields.forEach((field) => {
      next[field.key] = row[field.key] ?? (field.type === 'checkbox' ? false : '');
    });
    setEditing(row);
    setForm(next);
    setErroCpf('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm(config.fields));
    setFile(null);
    setErroCpf('');
  };

  const submit = async (event) => {
    event.preventDefault();
    const cpfErro = getCpfCnpjError(form.responsavel_tecnico_cpf, {
      type: 'cpf',
      label: 'CPF do responsável técnico'
    });
    setErroCpf(cpfErro || '');
    if (cpfErro) {
      avisar.erro(cpfErro);
      return;
    }
    const payload = form.responsavel_tecnico_cpf
      ? { ...form, responsavel_tecnico_cpf: onlyDigits(form.responsavel_tecnico_cpf) }
      : form;
    setSaving(true);
    try {
      if (resource === 'documentos' && file && !editing) {
        await uploadDocumentoSst(payload, file);
      } else if (editing) {
        await atualizarSst(resource, editing.id, payload);
      } else {
        await criarSst(resource, payload);
      }
      avisar.sucesso(editing ? 'Registro atualizado.' : 'Registro criado.');
      resetForm();
      load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao salvar registro SST');
    } finally {
      setSaving(false);
    }
  };

  const openDocument = async (row) => {
    try {
      const payload = await getDocumentoSstUrl(row.id);
      if (payload?.url) window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao abrir documento');
    }
  };

  const analyzeDocument = async (row) => {
    setRowActionId(`ia-${row.id}`);
    try {
      const payload = await analisarDocumentoIaSst(row.id);
      avisar.sucesso(`Analise IA: ${payload.status || 'registrada'}.`);
      load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao analisar documento com IA');
    } finally {
      setRowActionId('');
    }
  };

  /*
    CONSENTIMENTO (R26) — aprovar/rejeitar uma sugestão de IA GRAVA no
    registro e não tem desfazer na tela. Antes acontecia no primeiro clique,
    sem pergunta. Agora pergunta, e a pergunta cita o registro FIXADO na
    `const alvo` ANTES do await: o modal do sistema não congela a página, e
    sem essa cópia a lista poderia recarregar (o efeito de filtro/recurso roda
    sozinho) entre a leitura e a ação — perguntando por um registro e
    gravando em outro.
  */
  const decidirIa = async (row, acao) => {
    const alvo = row;
    const rejeitar = acao === 'rejeitar';
    const nome = alvo.documento?.titulo || alvo.tipo_documento || `#${alvo.id}`;
    // R21: o retorno de confirmar() é objeto — SEMPRE desestruturado.
    const { ok } = await confirmar({
      titulo: rejeitar ? 'Rejeitar sugestao da IA' : 'Aprovar sugestao da IA',
      mensagem: rejeitar
        ? `Rejeitar a sugestao da IA para "${nome}"? A analise fica registrada como rejeitada e nada e aplicado ao documento.`
        : `Aprovar a sugestao da IA para "${nome}"? Os dados sugeridos passam a valer no registro.`,
      rotuloConfirmar: rejeitar ? 'Rejeitar' : 'Aprovar',
      destrutiva: rejeitar
    });
    if (!ok) return;
    setRowActionId(`${acao}-${alvo.id}`);
    try {
      const payload = rejeitar ? await rejeitarAnaliseIaSst(alvo.id) : await aprovarAnaliseIaSst(alvo.id);
      avisar.sucesso(`Sugestao IA: ${payload.status || (rejeitar ? 'rejeitada' : 'aprovada')}.`);
      load();
    } catch (err) {
      avisar.erro(err.message || (rejeitar ? 'Erro ao rejeitar sugestao IA' : 'Erro ao aprovar sugestao IA'));
    } finally {
      setRowActionId('');
    }
  };

  const syncEvents = async () => {
    setSyncingEvents(true);
    try {
      const payload = await sincronizarEventosVencimentoSst();
      avisar.sucesso(`${payload.eventos_criados || 0} evento(s) novo(s), ${payload.eventos_existentes || 0} ja existentes.`);
      load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao sincronizar eventos SST');
    } finally {
      setSyncingEvents(false);
    }
  };

  const campoDoFormulario = (field) => {
    if (field.type === 'textarea') {
      return (
        <textarea
          className="input"
          value={form[field.key] || ''}
          onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
        />
      );
    }
    if (field.type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={Boolean(form[field.key])}
          onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.checked }))}
        />
      );
    }
    if (field.type === 'selectRef') {
      return (
        <select
          className="input"
          value={form[field.key] || ''}
          required={field.required}
          onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
        >
          <option value="">Selecionar</option>
          {(refs[field.ref] || []).map((item) => (
            <option key={item.id} value={item.id}>{optionLabel(field.ref, item)}</option>
          ))}
        </select>
      );
    }
    if (field.options) {
      return (
        <select
          className="input"
          value={form[field.key] || ''}
          required={field.required}
          onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
        >
          <option value="">Selecionar</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    }
    return (
      <input
        className="input"
        type={field.type || 'text'}
        value={form[field.key] || ''}
        required={field.required}
        inputMode={field.key === 'responsavel_tecnico_cpf' ? 'numeric' : undefined}
        maxLength={field.key === 'responsavel_tecnico_cpf' ? 14 : undefined}
        onChange={(event) => setForm((current) => ({
          ...current,
          [field.key]: field.key === 'responsavel_tecnico_cpf'
            ? maskCpfCnpj(event.target.value)
            : event.target.value
        }))}
      />
    );
  };

  return (
    <Pagina className="sst-page">
      <PageHeader
        titulo={config.title}
        descricao={config.subtitle}
        /* C2: a faixa carrega a contagem do recorte — o numero que a pessoa
           veio conferir, sem depender de achar o bloco certo. */
        contagem={`${rows.length} registro(s)`}
        /*
          SEM SETA DE VOLTAR (05/09, apontado pela matriz).

          Eu tinha movido para ca o link "Voltar ao dashboard" que morava
          solto na faixa, achando que so mudava de lugar. A matriz reprovou
          na C3, e com razao: seta de voltar e de tela de DETALHE, que tem um
          registro-pai a que retornar. Esta e uma LISTAGEM — e o painel SST e
          destino do menu. Seta aqui e o mesmo "caminho para outra tela
          vestido de acao" que a R11 tira da faixa; so tinha trocado o botao
          pela seta.
        */
        acaoPrincipal={resource === 'eventos' && canManage ? {
          rotulo: syncingEvents ? 'Sincronizando...' : 'Atualizar vencimentos',
          onClick: syncEvents,
          desabilitada: syncingEvents
        } : undefined}
        secundarias={[{ rotulo: 'Limpar filtros', onClick: limparFiltros }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {canManage ? (
        /*
          R9 — a tela EXISTE para cadastrar o recurso: se o formulário sair,
          o que sobra é uma lista que ninguém abriria sozinha. Então ele é
          INLINE, acima da lista, e assume a barra de cor enquanto edita
          (padrão de tela mista: um primário por tela segue o foco).
        */
        <BlocoConteudo
          titulo={editing ? 'Editar registro' : 'Novo registro'}
          descricao={editing ? 'Alterando um registro existente deste recurso.' : null}
          variante="primario"
          cor="var(--sem-info)"
          acoes={editing ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={resetForm}>Cancelar edição</button>
          ) : null}
        >
          <form onSubmit={submit}>
            <FormSecao colunas={3}>
              {config.fields.map((field) => (
                <CampoForm
                  key={field.key}
                  label={field.label}
                  obrigatorio={Boolean(field.required)}
                  tipo={field.type === 'textarea' ? 'texto-longo' : undefined}
                  erro={field.key === 'responsavel_tecnico_cpf' ? erroCpf : undefined}
                >
                  {campoDoFormulario(field)}
                </CampoForm>
              ))}
              {resource === 'documentos' && !editing ? (
                <CampoForm label="Arquivo">
                  <input
                    className="input"
                    type="file"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                </CampoForm>
              ) : null}
            </FormSecao>
            <div className="app-actionbar">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </BlocoConteudo>
      ) : null}

      <BlocoConteudo
        variante="secundario"
        descricao="Filtre registros por empresa, obra, colaborador, status ou texto — o recorte aplica ao marcar."
      >
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('search') ? {
            valor: filters.search,
            aoMudar: (valor) => setFilters((current) => ({ ...current, search: valor })),
            placeholder: 'Nome, título, mensagem...'
          } : null}
          campos={(statusOpcoes.length ? [] : [{
            id: 'status',
            rotulo: 'Status',
            tipo: 'text',
            valor: filters.status,
            aoMudar: (valor) => setFilters((current) => ({ ...current, status: valor }))
          }]).filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      {tableVisible ? (
        <BlocoConteudo
          titulo="Registros"
          contagem={loading ? 'Carregando' : `${rows.length} item(ns)`}
        >
          <TabelaPadrao
            colunas={colunasTabela}
            itens={rows}
            carregando={loading}
            vazio="Nenhum registro encontrado."
            storageKey={`tabela:sst-crud:${resource}`}
            rotuloRolagem={config.title}
            larguraAcoes={280}
            /*
              R17 — a identidade desta tabela é decidida por RECURSO, em
              tempo de execução: `tipo: 'identidade'` vai na coluna que nomeia
              o registro (nome do risco, título do documento, colaborador da
              exposição). Os recursos de LOG e TELEMETRIA — workflow_logs,
              blocking_logs, telemetria, jobs, queue_metrics,
              performance_metrics, cache_entries — não têm nenhuma: a linha é
              um evento (data + tipo + status + mensagem) ou uma chave técnica
              que precisa manter a caixa original. Nesses, a ausência é
              DECLARADA aqui, nunca silenciosa.
              O validador estático não consegue provar isto (as colunas vêm do
              catálogo, não de um literal) e emite aviso; a prova está nesta
              expressão, que é a mesma para as duas metades.
            */
            {...(indiceIdentidade < 0 ? { semIdentidade: true } : null)}
            acoesLinha={(row) => (
              <>
                {resource === 'documentos' && row.arquivo_url ? (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => openDocument(row)}>Abrir</button>
                ) : null}
                {resource === 'documentos' && canManage ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => analyzeDocument(row)}
                    disabled={rowActionId === `ia-${row.id}`}
                  >
                    {rowActionId === `ia-${row.id}` ? 'Analisando...' : 'Analisar IA'}
                  </button>
                ) : null}
                {resource === 'documentos_ia' && canManage ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => decidirIa(row, 'aprovar')}
                      disabled={rowActionId === `aprovar-${row.id}`}
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm btn-perigo-suave"
                      onClick={() => decidirIa(row, 'rejeitar')}
                      disabled={rowActionId === `rejeitar-${row.id}`}
                    >
                      Rejeitar
                    </button>
                  </>
                ) : null}
                {canManage ? (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => startEdit(row)}>Editar</button>
                ) : null}
              </>
            )}
          />
        </BlocoConteudo>
      ) : null}

      {elementoConfirmacao}
    </Pagina>
  );
}
