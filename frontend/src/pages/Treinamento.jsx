import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineArchiveBox,
  HiOutlineBookOpen,
  HiOutlineCheckCircle,
  HiOutlineCloudArrowUp,
  HiOutlineDocumentText,
  HiOutlinePencilSquare,
  HiOutlinePlayCircle,
  HiOutlinePlusCircle,
  HiOutlineSparkles
} from 'react-icons/hi2';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  StatGrid,
  StatTile,
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
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import {
  createTreinamentoConteudo,
  deleteTreinamentoConteudo,
  getTreinamentoArquivoUrl,
  getTreinamentoConteudos,
  getTreinamentoResumo,
  marcarTreinamentoLeitura,
  publishTreinamentoConteudo,
  updateTreinamentoConteudo,
  uploadTreinamentoArquivo
} from '../services/treinamento';
import {
  canManageTreinamento,
  canPublishTreinamento
} from '../utils/acessoProduto';

// =====================================================================
// CENTRAL DE TREINAMENTO
// ---------------------------------------------------------------------
// R18 — o conteúdo tem VÍDEO e ANEXO, e a lista virou TabelaPadrao (que
// tem cabeçalho grudado e contêiner de rolagem próprio). Nenhum ancestral
// dela usa `overflow-hidden`: recorte de forma nesta tela é `overflow-clip`
// (que corta igual e NÃO cria scrollport), e o truncamento de texto fica
// no idioma de célula do próprio componente. `overflow: hidden` num
// ancestral mataria o sticky em silêncio — sem erro, sem falha de build.
//
// R9 — o painel de edição fica INLINE. A tela existe para MANTER a base
// de treinamento de quem tem `canManageTreinamento`; para os demais, o
// painel nem renderiza. Nada aqui interrompe outro trabalho, então não
// vai para OverlayModal (foi o erro de 04/09, revertido em cinco telas).
// =====================================================================

const TIPOS = [
  { valor: 'FAQ', rotulo: 'Perguntas e respostas' },
  { valor: 'VIDEO', rotulo: 'Videos' },
  { valor: 'GUIA', rotulo: 'Guias' }
];

const STATUS_GESTAO = [
  { valor: 'PUBLICADO', rotulo: 'Publicados' },
  { valor: 'RASCUNHO', rotulo: 'Rascunhos' }
];

const MODULOS_BASE = [
  'GERAL',
  'SOLICITACOES',
  'COMPRAS',
  'FINANCEIRO',
  'FISCAL',
  'RH_DP',
  'SST',
  'CONTRATOS',
  'CRM',
  'COMERCIAL',
  'PROVISIONAMENTO'
];

const EMPTY_FORM = {
  id: null,
  tipo: 'FAQ',
  status: 'RASCUNHO',
  modulo: 'GERAL',
  publico_alvo: 'Todos',
  titulo: '',
  pergunta: '',
  resposta: '',
  descricao: '',
  conteudo: '',
  tags: '',
  ordem: 0,
  duracao_minutos: '',
  thumbnail_url: ''
};

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.join(', ');
  return String(tags || '');
}

function toForm(item) {
  return {
    id: item?.id || null,
    tipo: item?.tipo || 'FAQ',
    status: item?.status || 'RASCUNHO',
    modulo: item?.modulo || 'GERAL',
    publico_alvo: item?.publico_alvo || 'Todos',
    titulo: item?.titulo || '',
    pergunta: item?.pergunta || '',
    resposta: item?.resposta || '',
    descricao: item?.descricao || '',
    conteudo: item?.conteudo || '',
    tags: normalizeTags(item?.tags),
    ordem: item?.ordem || 0,
    duracao_minutos: item?.duracao_minutos ?? '',
    thumbnail_url: item?.thumbnail_url || ''
  };
}

function toPayload(form) {
  return {
    tipo: form.tipo,
    status: form.status,
    modulo: form.modulo,
    publico_alvo: form.publico_alvo,
    titulo: form.titulo,
    pergunta: form.pergunta,
    resposta: form.resposta,
    descricao: form.descricao,
    conteudo: form.conteudo,
    tags: form.tags,
    ordem: form.ordem,
    duracao_minutos: form.duracao_minutos,
    thumbnail_url: form.thumbnail_url
  };
}

function TipoIcone({ tipo }) {
  if (tipo === 'VIDEO') return <HiOutlinePlayCircle aria-hidden="true" />;
  if (tipo === 'FAQ') return <HiOutlineSparkles aria-hidden="true" />;
  return <HiOutlineDocumentText aria-hidden="true" />;
}

// A família semântica do TIPO é explícita: o StatusBadge classificaria
// FAQ, VIDEO e GUIA todos em 'info' (nenhum casa com os padrões de
// sucesso/erro/pendência), e a tela precisa distinguir os três.
const FAMILIA_TIPO = {
  FAQ: 'info',
  VIDEO: 'warning',
  GUIA: 'success'
};

function primeiroValor(conjunto) {
  return Array.from(conjunto || [])[0] || '';
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
  { id: 'busca', rotulo: 'Busca', obrigatorio: true },
  { id: 'tipo', rotulo: 'Tipo' },
  { id: 'modulo', rotulo: 'Módulo' },
  { id: 'status', rotulo: 'Status' }
];

export default function Treinamento() {
  const { user } = useAuth();
  const podeGerenciar = canManageTreinamento(user);
  const podePublicar = canPublishTreinamento(user);
  const fileInputRef = useRef(null);

  const [resumo, setResumo] = useState(null);
  const [conteudos, setConteudos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  /*
    R12 — os TRÊS <select> de recorte (tipo, módulo, status) e a busca com
    botão "Buscar" viraram a BarraFiltros: busca larga em cima e marcação
    abaixo, com etiqueta removível. Cada dimensão é `unico` porque o
    serviço aceita UM valor por parâmetro (`tipo=`, `modulo=`, `status=`);
    com marcação múltipla a tela mandaria uma lista que a API não lê, e o
    usuário veria duas etiquetas sem a lista estreitar — capacidade
    aparente sem efeito (R15).
  */
  const [filtros, setFiltros] = useState({
    tipo: new Set(),
    modulo: new Set(),
    // Quem não gerencia só enxerga publicado — a regra de visibilidade é
    // a mesma de antes, byte a byte.
    status: podeGerenciar ? new Set() : new Set(['PUBLICADO'])
  });
  const [busca, setBusca] = useState('');
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      if (filtro.id === 'busca') return busca.trim() !== '';
      if (filtro.id === 'status' && !podeGerenciar) return false;
      return (filtros[filtro.id]?.size || 0) > 0;
    }).map((filtro) => filtro.id),
    [busca, filtros, podeGerenciar]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:treinamento:conteudos', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => setFiltros((atual) => ({
      ...atual,
      // Quem não gerencia continua vendo só o publicado: esconder o campo
      // não pode ampliar o que a pessoa tem direito de ver.
      [id]: id === 'status' && !podeGerenciar ? new Set(['PUBLICADO']) : new Set()
    }))
  });
  const [form, setForm] = useState(EMPTY_FORM);
  // R3/R19: o `window.confirm` do arquivamento e as duas faixas de
  // erro/sucesso pintadas com paleta crua viraram componentes do sistema.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const filtroTipo = primeiroValor(filtros.tipo);
  const filtroModulo = primeiroValor(filtros.modulo);
  const filtroStatus = primeiroValor(filtros.status);

  const modulos = useMemo(() => {
    const fromResumo = Object.keys(resumo?.modulos || {});
    return [...new Set([...MODULOS_BASE, ...fromResumo])].filter(Boolean).sort();
  }, [resumo]);

  const selected = useMemo(
    () => conteudos.find((item) => Number(item.id) === Number(form.id)) || null,
    [conteudos, form.id]
  );

  async function carregar(recorte) {
    const alvo = recorte || {
      tipo: filtroTipo,
      modulo: filtroModulo,
      status: filtroStatus,
      busca
    };
    setLoading(true);
    try {
      const [resumoData, listaData] = await Promise.all([
        getTreinamentoResumo(),
        getTreinamentoConteudos({
          tipo: alvo.tipo || undefined,
          modulo: alvo.modulo || undefined,
          busca: alvo.busca || undefined,
          status: alvo.status || undefined,
          limit: 300
        })
      ]);
      setResumo(resumoData || null);
      setConteudos(Array.isArray(listaData?.items) ? listaData.items : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao carregar treinamentos.');
    } finally {
      setLoading(false);
    }
  }

  /*
    R23 — o recorte APLICA AO MARCAR, e a busca textual tem espera de
    digitação (350ms) e nunca botão. Antes, marcar tipo/módulo/status
    recarregava na hora, mas a BUSCA só valia depois de um clique em
    "Buscar": a caixa mostrava um termo que a lista ainda não obedecia.
    Não cai na exceção de consulta cara (são 4 dimensões declaradas, mas
    UMA requisição de lista — o critério da R23 é 4+ requisições ou mais
    de 2 segundos).
  */
  useEffect(() => {
    const timer = setTimeout(() => {
      carregar({ tipo: filtroTipo, modulo: filtroModulo, status: filtroStatus, busca });
    }, busca ? 350 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTipo, filtroModulo, filtroStatus, busca]);

  function alternarFiltro(dimensao, valor, opcoes) {
    setFiltros((atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes));
  }

  function limparFiltros() {
    setFiltros({
      tipo: new Set(),
      modulo: new Set(),
      status: podeGerenciar ? new Set() : new Set(['PUBLICADO'])
    });
  }

  function handleChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function novoConteudo(tipo = 'FAQ') {
    setForm({ ...EMPTY_FORM, tipo });
    setPendingFile(null);
  }

  function editarConteudo(item) {
    setForm(toForm(item));
    setPendingFile(null);
    marcarTreinamentoLeitura(item.id, false).catch(() => {});
  }

  async function enviarArquivo(conteudoId, file, tipo = form.tipo) {
    const tipoArquivo = tipo === 'VIDEO' ? 'VIDEO' : 'DOCUMENTO';
    return uploadTreinamentoArquivo(conteudoId, file, tipoArquivo);
  }

  async function salvarConteudo(event) {
    event.preventDefault();
    // R26: o arquivo pendente é fixado antes dos awaits — o seletor segue
    // clicável enquanto a gravação corre, e o `pendingFile` lido depois do
    // await poderia ser outro (a mensagem final citava justamente ele).
    const arquivoPendente = pendingFile;
    setSaving(true);
    try {
      const payload = toPayload(form);
      const saved = form.id
        ? await updateTreinamentoConteudo(form.id, payload)
        : await createTreinamentoConteudo(payload);
      let next = saved;
      if (arquivoPendente) {
        setUploading(true);
        next = await enviarArquivo(saved.id, arquivoPendente, saved.tipo);
        setPendingFile(null);
      }
      setForm(toForm(next));
      avisar.sucesso(arquivoPendente
        ? 'Conteudo salvo e arquivo enviado para o S3.'
        : 'Conteudo salvo com sucesso.');
      await carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao salvar conteudo.');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  }

  async function publicarConteudo(id) {
    const alvo = id;
    setSaving(true);
    try {
      const saved = await publishTreinamentoConteudo(alvo);
      setForm(toForm(saved));
      avisar.sucesso('Conteudo publicado.');
      await carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao publicar conteudo.');
    } finally {
      setSaving(false);
    }
  }

  async function arquivarConteudo(item) {
    // R26: o registro é fixado em `const` ANTES do await. O modal do
    // sistema não congela a tela — clicar noutra linha com ele aberto
    // faria a tela perguntar sobre um conteúdo e arquivar outro.
    const alvo = item;
    if (!alvo?.id) return;
    // R21: desestruturar { ok }; o retorno é objeto e objeto é sempre
    // truthy, então `const ok = ...` faria "Cancelar" arquivar.
    const { ok } = await confirmar({
      titulo: 'Arquivar conteudo',
      mensagem: `Arquivar "${alvo.titulo || `#${alvo.id}`}"? Ele sai da Central de Treinamento para todos os usuarios.`,
      rotuloConfirmar: 'Arquivar',
      destrutiva: true
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteTreinamentoConteudo(alvo.id);
      setForm(EMPTY_FORM);
      avisar.sucesso('Conteudo arquivado.');
      await carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao arquivar conteudo.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadArquivo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPendingFile(file);
    // R26: o conteúdo de destino é fixado antes do await.
    const conteudoId = form.id;
    if (!conteudoId) {
      avisar.informacao('Arquivo selecionado. Ao salvar o conteudo, ele sera enviado para o S3.');
      return;
    }
    setUploading(true);
    try {
      const saved = await enviarArquivo(conteudoId, file);
      setForm(toForm(saved));
      setPendingFile(null);
      avisar.sucesso('Arquivo enviado para o S3.');
      await carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao enviar arquivo.');
    } finally {
      setUploading(false);
    }
  }

  const uploadAccept = form.tipo === 'VIDEO'
    ? '.mp4,.webm,video/mp4,video/webm'
    : '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';

  async function abrirArquivo(item, tipoArquivo) {
    const alvo = item;
    try {
      await marcarTreinamentoLeitura(alvo.id, false);
      const data = await getTreinamentoArquivoUrl(alvo.id, tipoArquivo);
      if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Arquivo nao encontrado.');
    }
  }

  async function concluirConteudo(item) {
    const alvo = item;
    try {
      await marcarTreinamentoLeitura(alvo.id, true);
      avisar.sucesso('Registro de leitura concluído.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao registrar conclusao.');
    }
  }

  /*
    R1/R17 — a lista era um <article> por conteúdo, com os dados soltos em
    <span> dentro de um <button>: sem colunas declaradas, sem
    redimensionamento, sem largura salva por usuário. Vira TabelaPadrao.

    `semIdentidade` é DECLARADO (R17): o título de um conteúdo de
    treinamento é uma frase ("Como lançar um título a pagar"), e a coluna
    `identidade` exibe SEMPRE em maiúsculas. Frase em caixa alta piora a
    leitura — é o mesmo motivo pelo qual a regra cita nome de arquivo como
    exemplo legítimo da marca.
  */
  const colunas = [
    {
      id: 'tipo',
      titulo: 'Tipo',
      tipo: 'badge',
      render: (item) => (
        <span className="inline-flex items-center gap-1">
          <TipoIcone tipo={item.tipo} />
          <StatusBadge status={item.tipo} kind={FAMILIA_TIPO[item.tipo] || 'info'} />
        </span>
      )
    },
    {
      id: 'conteudo',
      titulo: 'Conteudo',
      tipo: 'texto',
      noCard: 'titulo',
      render: (item) => (
        <CelulaDupla
          principal={item.titulo}
          sub={item.pergunta || item.descricao || item.resposta || item.conteudo || 'Sem descricao'}
        />
      )
    },
    {
      id: 'modulo',
      titulo: 'Módulo',
      tipo: 'codigo',
      render: (item) => item.modulo || 'GERAL'
    },
    {
      id: 'publico_alvo',
      titulo: 'Publico alvo',
      tipo: 'texto',
      render: (item) => item.publico_alvo || '-'
    },
    {
      id: 'tags',
      titulo: 'Tags',
      tipo: 'texto',
      render: (item) => {
        const texto = normalizeTags(item.tags);
        return <span title={texto || undefined}>{texto || '-'}</span>;
      }
    },
    {
      id: 'anexos',
      titulo: 'Anexos',
      tipo: 'texto',
      render: (item) => {
        const partes = [];
        if (item.video_s3_key || item.video_url) partes.push('Video');
        if (item.documento_s3_key || item.documento_url) partes.push('Arquivo');
        return partes.length ? partes.join(' · ') : '-';
      }
    },
    {
      id: 'publicacao',
      titulo: 'Publicação',
      tipo: 'texto',
      render: (item) => (
        <CelulaDupla
          principal={formatDate(item.publicado_em)}
          sub={item?.publicadoPor?.nome || '-'}
        />
      )
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      render: (item) => <StatusBadge status={item.status} />
    }
  ];

  const acoesCabecalho = podeGerenciar
    ? {
      acaoPrincipal: {
        rotulo: 'Novo guia',
        icone: <HiOutlineBookOpen aria-hidden="true" />,
        onClick: () => novoConteudo('GUIA')
      },
      secundarias: [
        { rotulo: 'Novo FAQ', icone: <HiOutlinePlusCircle aria-hidden="true" />, onClick: () => novoConteudo('FAQ') },
        { rotulo: 'Novo video', icone: <HiOutlinePlayCircle aria-hidden="true" />, onClick: () => novoConteudo('VIDEO') }
      ]
    }
    : {};

  return (
    <Pagina>
      {/*
        C2 × B3 (critério de 05/09): a FAIXA fica com o TOTAL e os blocos
        ficam com os RECORTES. O cartão "Conteudos" do resumo mostrava
        exatamente o mesmo `resumo.total` que agora vive na faixa — dois
        números iguais em lugares diferentes é duplicação, e o critério
        diz o que fazer: o cartão sem recorte próprio sai, o número fica
        na faixa, que é a que acompanha a pessoa ao rolar. Os outros
        quatro cartões continuam, porque cada um responde a uma pergunta
        que só ele responde (quantos publicados, quantos vídeos, quantas
        perguntas, quantos guias).
      */}
      <PageHeader
        titulo="Central de Treinamento"
        contagem={resumo ? `${resumo.total || 0} conteudo(s)` : null}
        descricao="Base operacional para perguntas frequentes, videos e guias de uso do FLUXY. Os arquivos ficam privados no S3 e são abertos por URL assinada."
        {...acoesCabecalho}
      />

      {/* R16: UM dono para a faixa de avisos. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo titulo="Resumo da base" descricao="Recortes do acervo publicado e em preparo.">
        {/* Ladrilho de dado único é StatGrid/StatTile — eram cinco <div>
            desenhados à mão, com `text-2xl` e `tracking-[0.22em]` (medidas
            fora da escala, R10). */}
        <StatGrid colunas={4}>
          <StatTile label="Publicados" valor={resumo?.publicados || 0} tom="success" />
          <StatTile label="Videos" valor={resumo?.videos || 0} icone={<HiOutlinePlayCircle aria-hidden="true" />} />
          <StatTile label="Perguntas" valor={resumo?.faqs || 0} icone={<HiOutlineSparkles aria-hidden="true" />} />
          <StatTile label="Guias" valor={resumo?.guias || 0} icone={<HiOutlineBookOpen aria-hidden="true" />} />
        </StatGrid>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Conteudos disponíveis"
        // O rótulo diz a VERDADE sobre o número: a consulta traz no máximo
        // 300 itens do recorte, então este é o que está LISTADO, não o
        // total da base (que vive na faixa, e vem do resumo do servidor).
        contagem={loading ? 'Carregando...' : `${conteudos.length} item(ns) listado(s)`}
        variante="primario"
        cor="var(--c-primary)"
      >
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('busca') ? {
            valor: busca,
            aoMudar: setBusca,
            placeholder: 'Buscar por pergunta, título, módulo ou tag'
          } : null}
          filtros={[
            { id: 'tipo', rotulo: 'Tipo', unico: true, opcoes: TIPOS },
            {
              id: 'modulo',
              rotulo: 'Módulo',
              unico: true,
              opcoes: modulos.map((modulo) => ({ valor: modulo, rotulo: modulo }))
            },
            ...(podeGerenciar
              ? [{ id: 'status', rotulo: 'Status', unico: true, opcoes: STATUS_GESTAO }]
              : [])
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={filtros}
          aoAlternar={alternarFiltro}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />

        <TabelaPadrao
          colunas={colunas}
          itens={conteudos}
          carregando={loading}
          getId={(item) => item.id}
          storageKey="tabela:treinamento:conteudos"
          rotuloRolagem="Conteudos de treinamento"
          semIdentidade
          colunasConfiguraveis
          larguraAcoes={300}
          // A1: a linha responde a clique E ao teclado (o TabelaPadrao dá
          // tabIndex + Enter/Espaço quando recebe aoClicarLinha); os
          // botões da linha também são focáveis.
          aoClicarLinha={podeGerenciar ? editarConteudo : undefined}
          linhaSelecionada={(item) => Number(form.id) === Number(item.id)}
          vazio={{
            title: 'Nenhum conteudo encontrado',
            message: 'Nenhum conteudo para os filtros atuais. Limpe o recorte ou publique um material novo.'
          }}
          acoesLinha={(item) => {
            const temVideo = Boolean(item.video_s3_key || item.video_url);
            const temDocumento = Boolean(item.documento_s3_key || item.documento_url);
            return (
              <>
                {temVideo && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirArquivo(item, 'VIDEO')}>
                    <HiOutlinePlayCircle aria-hidden="true" />
                    Video
                  </button>
                )}
                {temDocumento && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirArquivo(item, 'DOCUMENTO')}>
                    <HiOutlineDocumentText aria-hidden="true" />
                    Arquivo
                  </button>
                )}
                <button type="button" className="btn btn-outline btn-sm" onClick={() => concluirConteudo(item)}>
                  <HiOutlineCheckCircle aria-hidden="true" />
                  Concluir
                </button>
              </>
            );
          }}
        />
      </BlocoConteudo>

      {podeGerenciar && (
        /* R9 — INLINE (painel abaixo da lista, padrão de tela mista). Era
           um <aside> preso numa coluna de 520px escrita à mão
           (`xl:grid-cols-[minmax(0,1fr)_520px]`, medida na tela — R10) que
           espremia a listagem em meia tela. A lista tem oito colunas e
           precisa da largura inteira. */
        <BlocoConteudo
          titulo={form.id ? 'Editar conteudo' : 'Novo conteudo'}
          descricao="Publique somente materiais revisados para treinamento institucional."
          acoes={form.id ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => novoConteudo(form.tipo)}>
              Limpar
            </button>
          ) : null}
        >
          <form onSubmit={salvarConteudo}>
            <FormSecao legenda="Classificação" colunas={4}>
              <CampoForm label="Tipo" obrigatorio>
                {/* R12: select de FORMULÁRIO (entrada de dado do registro).
                    O recorte da LISTA, esse sim, virou marcação. */}
                <select className="input w-full" value={form.tipo} onChange={(event) => handleChange('tipo', event.target.value)}>
                  <option value="FAQ">FAQ</option>
                  <option value="VIDEO">Video</option>
                  <option value="GUIA">Guia</option>
                </select>
              </CampoForm>
              <CampoForm label="Status">
                <select className="input w-full" value={form.status} onChange={(event) => handleChange('status', event.target.value)}>
                  <option value="RASCUNHO">Rascunho</option>
                  <option value="PUBLICADO">Publicado</option>
                </select>
              </CampoForm>
              <CampoForm label="Módulo">
                <input className="input w-full" value={form.modulo} onChange={(event) => handleChange('modulo', event.target.value.toUpperCase())} />
              </CampoForm>
              <CampoForm label="Publico alvo">
                <input className="input w-full" value={form.publico_alvo} onChange={(event) => handleChange('publico_alvo', event.target.value)} />
              </CampoForm>
            </FormSecao>

            <FormSecao legenda="Conteudo" colunas={2}>
              <CampoForm label="Título" obrigatorio span={2}>
                <input className="input w-full" value={form.titulo} onChange={(event) => handleChange('titulo', event.target.value)} required />
              </CampoForm>

              {form.tipo === 'FAQ' && (
                <CampoForm label="Pergunta" tipo="texto-longo" span={2}>
                  {/* R10: a altura do textarea vem da folha do sistema
                      (textarea.input), não dos `min-h-[72px]`/`[112px]`/
                      `[96px]` que estavam escritos aqui. */}
                  <textarea className="input w-full" value={form.pergunta} onChange={(event) => handleChange('pergunta', event.target.value)} />
                </CampoForm>
              )}

              <CampoForm label={form.tipo === 'FAQ' ? 'Resposta' : 'Descricao'} tipo="texto-longo" span={2}>
                <textarea
                  className="input w-full"
                  value={form.tipo === 'FAQ' ? form.resposta : form.descricao}
                  onChange={(event) => handleChange(form.tipo === 'FAQ' ? 'resposta' : 'descricao', event.target.value)}
                />
              </CampoForm>

              <CampoForm label="Conteudo complementar" tipo="texto-longo" span={2}>
                <textarea className="input w-full" value={form.conteudo} onChange={(event) => handleChange('conteudo', event.target.value)} />
              </CampoForm>
            </FormSecao>

            <FormSecao legenda="Organização e midia" colunas={4}>
              <CampoForm label="Tags">
                <input className="input w-full" value={form.tags} onChange={(event) => handleChange('tags', event.target.value)} placeholder="financeiro, títulos" />
              </CampoForm>
              <CampoForm label="Ordem">
                <input className="input w-full" type="number" value={form.ordem} onChange={(event) => handleChange('ordem', event.target.value)} />
              </CampoForm>
              <CampoForm label="Duracao min.">
                <input className="input w-full" type="number" min="0" value={form.duracao_minutos} onChange={(event) => handleChange('duracao_minutos', event.target.value)} />
              </CampoForm>
              <CampoForm label="Thumbnail URL">
                <input className="input w-full" value={form.thumbnail_url} onChange={(event) => handleChange('thumbnail_url', event.target.value)} />
              </CampoForm>

              <CampoForm
                label={form.tipo === 'VIDEO' ? 'Arquivo de video' : 'Arquivo do material'}
                linha
                hint={form.tipo === 'VIDEO'
                  ? 'Selecione um MP4 ou WebM. Se ainda nao salvou, o envio acontece apos salvar.'
                  : 'Selecione PDF, planilha, apresentacao, imagem ou documento.'}
              >
                <div className="app-actionbar">
                  <label className="btn btn-outline cursor-pointer">
                    <HiOutlineCloudArrowUp aria-hidden="true" />
                    {uploading ? 'Enviando...' : 'Selecionar arquivo'}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept={uploadAccept}
                      onChange={uploadArquivo}
                      disabled={uploading || saving}
                    />
                  </label>
                  {pendingFile && (
                    <span className="text-sm text-[var(--c-muted)]">
                      Selecionado: {pendingFile.name}
                    </span>
                  )}
                </div>
              </CampoForm>
            </FormSecao>

            <div className="app-actionbar">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <HiOutlinePencilSquare aria-hidden="true" />
                {saving ? 'Salvando...' : pendingFile ? 'Salvar e enviar arquivo' : 'Salvar'}
              </button>
              {form.id && podePublicar && selected?.status !== 'PUBLICADO' && (
                <button type="button" className="btn btn-outline" onClick={() => publicarConteudo(form.id)} disabled={saving}>
                  Publicar
                </button>
              )}
              {form.id && (
                <div className="app-actionbar-apartada">
                  {/* C5: destrutiva apartada e em vermelho suave — era um
                      `btn-danger` cheio, o peso reservado à confirmação
                      final. */}
                  <button
                    type="button"
                    className="btn btn-outline btn-perigo-suave"
                    onClick={() => arquivarConteudo(selected || { id: form.id, titulo: form.titulo })}
                    disabled={saving}
                  >
                    <HiOutlineArchiveBox aria-hidden="true" />
                    Arquivar
                  </button>
                </div>
              )}
            </div>

            {form.id && (
              <p className="text-sm text-[var(--c-muted)]">
                Arquivos já salvos ficam privados no S3 e são abertos por URL assinada.
              </p>
            )}
          </form>
        </BlocoConteudo>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
