import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  CamposComVazios,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import {
  createFiscalDivergence,
  generateFiscalDocumentDanfe,
  getFiscalDocument,
  getFiscalDocumentFileUrl,
  getFiscalLinkOptions,
  ignoreFiscalDocument,
  linkFiscalDocument,
  suggestFiscalDocumentLinks,
  updateFiscalDivergence,
  updateFiscalDocumentLink,
  uploadFiscalDocumentFile,
  validateFiscalDocument
} from '../services/fiscalApi';

const LINK_SEARCH_TYPES = [
  { value: 'solicitacao', label: 'Solicitação', field: 'solicitacao_id' },
  { value: 'solicitacao_compra', label: 'Solicitação de compra', field: 'solicitacao_compra_id' },
  { value: 'pedido', label: 'Pedido', field: 'pedido_id' },
  { value: 'pedido_item', label: 'Item do pedido', field: 'pedido_item_id' },
  { value: 'titulo', label: 'Título financeiro', field: 'financeiro_titulo_id' },
  { value: 'obra', label: 'Obra', field: 'obra_id' },
  { value: 'fornecedor', label: 'Fornecedor', field: 'fornecedor_id' },
  { value: 'centro_custo', label: 'Centro de custo', field: 'centro_custo_id' },
  { value: 'apropriacao', label: 'Apropriação', field: 'apropriacao_id' },
  { value: 'plano_financeiro', label: 'Plano financeiro', field: 'plano_financeiro_id' }
];

function getLinkSearchType(value) {
  return LINK_SEARCH_TYPES.find((item) => item.value === value) || LINK_SEARCH_TYPES[0];
}

const DIVERGENCE_TYPES = [
  { value: 'supplier_mismatch', label: 'Fornecedor divergente' },
  { value: 'value_mismatch', label: 'Valor divergente' },
  { value: 'quantity_mismatch', label: 'Quantidade divergente' },
  { value: 'item_mismatch', label: 'Item divergente' },
  { value: 'missing_order', label: 'Pedido ausente' },
  { value: 'missing_receipt', label: 'Recebimento ausente' },
  { value: 'duplicate_invoice', label: 'Nota duplicada' },
  { value: 'cancelled_document', label: 'Documento cancelado' },
  { value: 'unknown_cost_center', label: 'Centro de custo desconhecido' },
  { value: 'unknown_financial_plan', label: 'Plano financeiro desconhecido' },
  { value: 'other', label: 'Outro' }
];

const DIVERGENCE_SEVERITIES = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Critica' }
];

const FAMILIA_SEVERIDADE = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'danger'
};

const CAMPOS_REFERENCIA = [
  ['solicitacao_id', 'Solicitacao'],
  ['solicitacao_compra_id', 'Compra'],
  ['pedido_id', 'Pedido'],
  ['pedido_item_id', 'Item'],
  ['financeiro_titulo_id', 'Titulo'],
  ['obra_id', 'Obra'],
  ['fornecedor_id', 'Fornecedor'],
  ['centro_custo_id', 'Centro de custo'],
  ['apropriacao_id', 'Apropriacao'],
  ['plano_financeiro_id', 'Plano financeiro']
];

const LINK_FORM_VAZIO = {
  solicitacao_id: '',
  solicitacao_compra_id: '',
  pedido_id: '',
  pedido_item_id: '',
  financeiro_titulo_id: '',
  obra_id: '',
  fornecedor_id: '',
  centro_custo_id: '',
  apropriacao_id: '',
  plano_financeiro_id: '',
  matched_reason: ''
};

const DIVERGENCE_FORM_VAZIO = {
  divergence_type: 'value_mismatch',
  severity: 'medium',
  description: '',
  expected_value: '',
  actual_value: '',
  fiscal_document_link_id: ''
};

/*
  ATENÇÃO — os formatadores devolvem `null` para campo vazio, NUNCA '—'.

  O alternador de campos vazios (`CamposComVazios`) conta o que está vazio a
  partir da PRÓPRIA lista de campos. Um formatador que devolve o travessão
  para dado ausente faz o componente ler "preenchido": o contador mostra
  zero vazio e o campo aparece com um traço como se fosse conteúdo. O
  travessão é decisão de EXIBIÇÃO do ladrilho, não de formatação do dado.
  Nas tabelas, onde o traço é mesmo o que se quer ver, ele entra no ponto de
  uso (`formatDate(x) || '-'`).
*/
function formatDate(value) {
  if (!value) return null;
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return null;
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleString('pt-BR');
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function referenciasDoVinculo(link) {
  return CAMPOS_REFERENCIA
    .filter(([campo]) => link?.[campo])
    .map(([campo, rotulo]) => `${rotulo} #${link[campo]}`)
    .join(' · ');
}

function JsonBlock({ value }) {
  const content = useMemo(() => {
    if (!value) return '{}';
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  /*
    R10/R25: o bloco era `max-h-[420px]` (medida à mão) sobre `bg-slate-950`
    (paleta crua, sem par no tema escuro). A altura passa a ser do conteúdo
    dentro do bloco recolhível, e a superfície é o token de bloco rebaixado.
    R18: `overflow: auto` NÃO sequestra sticky — só `hidden` faz isso.
  */
  return (
    <pre className="overflow-auto rounded-lg bg-[var(--ui-surface-2)] p-3 text-xs text-[var(--c-text)]">
      {content}
    </pre>
  );
}

export default function FiscalDocumentDetail() {
  const { id } = useParams();
  const [documento, setDocumento] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openingFile, setOpeningFile] = useState('');
  const [generatingDanfe, setGeneratingDanfe] = useState(false);
  const [fileType, setFileType] = useState('danfe');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkForm, setLinkForm] = useState(LINK_FORM_VAZIO);
  const [linkSearchType, setLinkSearchType] = useState('solicitacao');
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [suggestingLinks, setSuggestingLinks] = useState(false);
  const [updatingLinkId, setUpdatingLinkId] = useState(null);
  const [divergenceForm, setDivergenceForm] = useState(DIVERGENCE_FORM_VAZIO);
  const [savingDivergence, setSavingDivergence] = useState(false);
  const [updatingDivergenceId, setUpdatingDivergenceId] = useState(null);
  const [ignoring, setIgnoring] = useState(false);
  const [validating, setValidating] = useState(false);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  // R3/R19: as duas faixas pintadas à mão viram o aviso do sistema.
  const { avisos, avisar, fechar } = useAvisos();
  // R19/R21: o `window.confirm` do navegador sai; a confirmação é o modal do
  // sistema, e o retorno SEMPRE se desestrutura.
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const load = async () => {
    setLoading(true);
    try {
      setDocumento(await getFiscalDocument(id));
      setNaoEncontrado(false);
    } catch (err) {
      setNaoEncontrado(true);
      avisar.erro(err.message || 'Erro ao buscar documento fiscal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openFile = async (type) => {
    setOpeningFile(type);
    try {
      const result = await getFiscalDocumentFileUrl(id, type);
      if (result?.url) window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao abrir arquivo fiscal');
    } finally {
      setOpeningFile('');
    }
  };

  const generateDanfe = async () => {
    setGeneratingDanfe(true);
    try {
      const result = await generateFiscalDocumentDanfe(id);
      setDocumento(result?.document || await getFiscalDocument(id));
      avisar.sucesso('DANFE gerado com sucesso.');
      if (result?.url) window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao gerar DANFE fiscal');
    } finally {
      setGeneratingDanfe(false);
    }
  };

  const submitFileUpload = async (event) => {
    event.preventDefault();
    // A referência do <form> é fixada antes do await: o evento sintético é
    // reciclado e `event.target` não sobrevive à volta da promessa.
    const formulario = event.currentTarget;
    const tipoEscolhido = fileType;
    if (!uploadFile) {
      avisar.erro('Selecione um arquivo fiscal em PDF, PNG ou JPG.');
      return;
    }

    setUploadingFile(true);
    try {
      const result = await uploadFiscalDocumentFile({ documentId: id, fileType: tipoEscolhido, file: uploadFile });
      setDocumento(result?.document || await getFiscalDocument(id));
      setUploadFile(null);
      formulario.reset();
      avisar.sucesso(tipoEscolhido === 'danfe' ? 'DANFE anexado com sucesso.' : 'PDF fiscal anexado com sucesso.');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao anexar arquivo fiscal');
    } finally {
      setUploadingFile(false);
    }
  };

  /*
    CONSENTIMENTO (R21 + R26) — ignorar um documento fiscal tem efeito
    contábil: ele sai da conferência e deixa de gerar vínculo e divergência.

    Duas coisas que já custaram caro neste projeto e estão feitas aqui:
    1. o retorno de `confirmar()` é DESESTRUTURADO — o objeto é sempre
       truthy, e `const ok = await confirmar(...)` faria o botão "Cancelar"
       SEGUIR com a ação;
    2. o alvo é fixado numa `const` ANTES do await — o modal do sistema não
       congela a página, e reler o estado depois da confirmação é o caminho
       para perguntar sobre um documento e agir sobre outro.
  */
  const ignoreDocument = async () => {
    const alvo = documento;
    const alvoId = alvo?.id || id;
    const rotulo = alvo?.document_number || alvo?.access_key || `#${alvoId}`;
    const { ok } = await confirmar({
      titulo: 'Ignorar documento fiscal',
      mensagem: `Ignorar o documento ${rotulo}? Ele sai da conferencia fiscal e esta tela nao desfaz a marcacao.`,
      rotuloConfirmar: 'Ignorar documento',
      destrutiva: true
    });
    if (!ok) return;

    setIgnoring(true);
    try {
      setDocumento(await ignoreFiscalDocument(alvoId));
      avisar.sucesso(`Documento ${rotulo} marcado como ignorado.`);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao ignorar documento fiscal');
    } finally {
      setIgnoring(false);
    }
  };

  const validateDocument = async () => {
    setValidating(true);
    try {
      setDocumento(await validateFiscalDocument(id));
      avisar.sucesso('Documento fiscal validado.');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao validar documento fiscal');
    } finally {
      setValidating(false);
    }
  };

  const updateLinkField = (field, value) => {
    setLinkForm((current) => ({ ...current, [field]: value }));
  };

  const searchLinkOptions = async () => {
    setLinkSearching(true);
    try {
      const result = await getFiscalLinkOptions({
        type: linkSearchType,
        q: linkSearchQuery,
        limit: 15
      });
      setLinkSearchResults(result?.data || []);
      if (!result?.data?.length) {
        avisar.informacao('Nenhum registro encontrado para essa busca.');
      }
    } catch (err) {
      avisar.erro(err.message || 'Erro ao buscar opcoes de vinculo');
    } finally {
      setLinkSearching(false);
    }
  };

  const selectLinkOption = (option) => {
    const target = getLinkSearchType(option.type);
    updateLinkField(target.field, option.id);
    setLinkSearchResults([]);
    avisar.informacao(`${target.label} #${option.id} selecionado para o vinculo.`);
  };

  const suggestLinks = async () => {
    setSuggestingLinks(true);
    try {
      const result = await suggestFiscalDocumentLinks(id);
      setDocumento(result?.document || await getFiscalDocument(id));
      avisar.sucesso(result?.created_count
        ? `${result.created_count} sugestao(oes) de vinculo registrada(s).`
        : 'Nenhuma nova sugestao de vinculo foi encontrada.');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao sugerir vinculos fiscais');
    } finally {
      setSuggestingLinks(false);
    }
  };

  const confirmLink = async (link) => {
    // R26: o vínculo é fixado antes do await — a lista é recarregada por
    // outras ações da mesma tela e o array trocado no meio do caminho.
    const alvo = link;
    setUpdatingLinkId(alvo.id);
    try {
      setDocumento(await updateFiscalDocumentLink(id, alvo.id, { status: 'confirmed' }));
      avisar.sucesso('Sugestão confirmada.');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao atualizar vinculo fiscal');
    } finally {
      setUpdatingLinkId(null);
    }
  };

  const rejectLink = async (link) => {
    // Rejeitar sugestão de vínculo desfaz a amarração do documento com
    // pedido/título/obra: pergunta antes, sobre o vínculo FIXADO aqui.
    const alvo = link;
    const referencia = referenciasDoVinculo(alvo) || `vinculo #${alvo.id}`;
    const { ok } = await confirmar({
      titulo: 'Rejeitar vínculo sugerido',
      mensagem: `Rejeitar a sugestao de vinculo (${referencia})? O documento volta a ficar sem essa amarracao.`,
      rotuloConfirmar: 'Rejeitar vinculo',
      destrutiva: true
    });
    if (!ok) return;

    setUpdatingLinkId(alvo.id);
    try {
      setDocumento(await updateFiscalDocumentLink(id, alvo.id, { status: 'rejected' }));
      avisar.sucesso('Sugestão rejeitada.');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao atualizar vinculo fiscal');
    } finally {
      setUpdatingLinkId(null);
    }
  };

  const updateDivergenceField = (field, value) => {
    setDivergenceForm((current) => ({ ...current, [field]: value }));
  };

  const submitDivergence = async (event) => {
    event.preventDefault();
    if (!String(divergenceForm.description || '').trim()) {
      avisar.erro('Informe a descrição da divergência fiscal.');
      return;
    }

    const payload = Object.fromEntries(
      Object.entries(divergenceForm).filter(([, value]) => String(value || '').trim() !== '')
    );

    setSavingDivergence(true);
    try {
      setDocumento(await createFiscalDivergence(id, payload));
      setDivergenceForm(DIVERGENCE_FORM_VAZIO);
      avisar.sucesso('Divergência fiscal registrada.');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao registrar divergencia fiscal');
    } finally {
      setSavingDivergence(false);
    }
  };

  const resolveDivergence = async (divergence) => {
    const alvo = divergence;
    setUpdatingDivergenceId(alvo.id);
    try {
      setDocumento(await updateFiscalDivergence(id, alvo.id, { status: 'resolved' }));
      avisar.sucesso('Divergência resolvida.');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao atualizar divergencia fiscal');
    } finally {
      setUpdatingDivergenceId(null);
    }
  };

  const ignoreDivergence = async (divergence) => {
    // Ignorar divergência encerra a pendência sem tratá-la: pergunta antes,
    // sobre a divergência FIXADA aqui (R26), e desestrutura o retorno (R21).
    const alvo = divergence;
    const tipo = DIVERGENCE_TYPES.find((item) => item.value === alvo.divergence_type)?.label || alvo.divergence_type;
    const { ok } = await confirmar({
      titulo: 'Ignorar divergência',
      mensagem: `Ignorar a divergencia "${tipo}" deste documento? Ela deixa de aparecer como pendencia e esta tela nao reabre a marcacao.`,
      rotuloConfirmar: 'Ignorar divergencia',
      destrutiva: true
    });
    if (!ok) return;

    setUpdatingDivergenceId(alvo.id);
    try {
      setDocumento(await updateFiscalDivergence(id, alvo.id, { status: 'ignored' }));
      avisar.sucesso('Divergência ignorada.');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao atualizar divergencia fiscal');
    } finally {
      setUpdatingDivergenceId(null);
    }
  };

  const submitManualLink = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(
      Object.entries(linkForm).filter(([, value]) => String(value || '').trim() !== '')
    );

    if (Object.keys(payload).length === 0 || (Object.keys(payload).length === 1 && payload.matched_reason)) {
      avisar.erro('Informe ao menos um ID para vincular o documento fiscal.');
      return;
    }

    setLinking(true);
    try {
      setDocumento(await linkFiscalDocument(id, payload));
      avisar.sucesso('Vínculo manual registrado com sucesso.');
      setLinkForm(LINK_FORM_VAZIO);
      setLinkSearchResults([]);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao registrar vinculo manual');
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
    return (
      <Pagina>
        <PageHeader
          titulo="Documento fiscal"
          voltar={{ to: '/fiscal/documentos', title: 'Voltar para documentos fiscais' }}
        />
        <BlocoConteudo>Carregando documento fiscal...</BlocoConteudo>
      </Pagina>
    );
  }

  if (!documento) {
    return (
      <Pagina>
        {/* C3: a seta de voltar é a affordance primária de retorno da tela de
            detalhe e fica SEMPRE — inclusive no estado de erro, que é
            justamente onde a pessoa mais precisa sair daqui. */}
        <PageHeader
          titulo="Documento fiscal"
          voltar={{ to: '/fiscal/documentos', title: 'Voltar para documentos fiscais' }}
        />
        <Avisos avisos={avisos} aoFechar={fechar} />
        <BlocoConteudo>
          {naoEncontrado ? 'Documento fiscal nao encontrado.' : 'Documento fiscal indisponivel.'}
        </BlocoConteudo>
      </Pagina>
    );
  }

  const links = documento.links || [];
  const divergences = documento.divergences || [];
  const events = documento.events || [];
  const statusDocumento = String(documento.document_status || '');
  const ehIgnorado = statusDocumento === 'ignored';
  const ehValidado = statusDocumento === 'validated';
  const bloqueadoParaVinculo = ['ignored', 'cancelled'].includes(statusDocumento);
  const rotuloDocumento = documento.document_number || documento.access_key || `#${id}`;

  const acoesArquivo = [];
  if (documento.xml_storage_key) {
    acoesArquivo.push({
      rotulo: openingFile === 'xml' ? 'Abrindo...' : 'Abrir XML',
      onClick: () => openFile('xml'),
      desabilitada: openingFile === 'xml'
    });
  }
  if (documento.pdf_storage_key || documento.danfe_storage_key) {
    acoesArquivo.push({
      rotulo: openingFile === 'pdf' ? 'Abrindo...' : 'Abrir PDF',
      onClick: () => openFile('pdf'),
      desabilitada: openingFile === 'pdf'
    });
  }
  if (documento.xml_storage_key) {
    acoesArquivo.push({
      rotulo: generatingDanfe
        ? 'Gerando DANFE...'
        : documento.danfe_storage_key ? 'Regerar DANFE' : 'Gerar DANFE',
      onClick: generateDanfe,
      desabilitada: generatingDanfe
    });
  }

  return (
    <Pagina>
      {/*
        C3/C4/R13 — tela de REGISTRO: a seta de voltar fica sempre, o nome do
        documento tem o destaque do título e a chave de acesso (44 dígitos)
        é a informação secundária, no apoio da faixa. A faixa é fixa e
        compacta na rolagem, então "Validar" está sempre a um clique.

        C5: UM primário sólido (Validar), secundárias em contorno (arquivos)
        e a DESTRUTIVA apartada — "Ignorar" tira o documento da conferência
        fiscal e vai em `btn-perigo-suave`, separada das demais.
      */}
      <PageHeader
        titulo={`NF-e ${rotuloDocumento}`}
        descricao={documento.access_key || undefined}
        voltar={{ to: '/fiscal/documentos', title: 'Voltar para documentos fiscais' }}
        acaoPrincipal={{
          rotulo: validating ? 'Validando...' : ehValidado ? 'Validado' : 'Validar',
          onClick: validateDocument,
          desabilitada: validating || ['validated', 'ignored', 'cancelled'].includes(statusDocumento)
        }}
        secundarias={acoesArquivo}
        destrutiva={{
          rotulo: ignoring ? 'Ignorando...' : ehIgnorado ? 'Ignorado' : 'Ignorar',
          onClick: ignoreDocument,
          desabilitada: ignoring || ehIgnorado
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        B4 — os doze campos do "Resumo" eram um grid de cartões pintados à
        mão, todos visíveis mesmo vazios (o `value || '-'` do Field antigo
        fazia campo ausente parecer campo preenchido com um traço).
        O CamposComVazios esconde o vazio e conta quantos são — e a contagem
        sai DESTA lista, sem nenhuma condição espelhada à mão.
      */}
      <BlocoConteudo
        titulo="Dados do documento"
        variante="primario"
        cor="var(--module-fiscal)"
      >
        <CamposComVazios
          colunas={4}
          campos={[
            { label: 'Empresa monitorada', valor: documento.company?.razao_social, span: 2 },
            { label: 'Fornecedor', valor: documento.issuer_name || documento.issuer_cnpj, span: 2 },
            { label: 'CNPJ fornecedor', valor: documento.issuer_cnpj },
            { label: 'Destinatário', valor: documento.recipient_name || documento.recipient_cnpj },
            { label: 'Emissão', valor: formatDate(documento.emission_date) },
            { label: 'Valor total', valor: formatMoney(documento.total_value) },
            { label: 'Série', valor: documento.series },
            { label: 'Número', valor: documento.document_number },
            {
              label: 'Status fiscal',
              valor: documento.document_status ? <StatusBadge status={documento.document_status} /> : null
            },
            { label: 'Manifestacao', valor: documento.manifestation_status },
            { label: 'Origem', valor: documento.source },
            { label: 'Criado em', valor: formatDateTime(documento.createdAt || documento.created_at) },
            /*
              B3: "Chave XML: Disponivel/Indisponivel" saiu daqui — a
              disponibilidade dos três arquivos mora no bloco "Arquivos
              fiscais", onde ela vem acompanhada dos botões que agem sobre
              ela. O dado não deixou de existir na tela; deixou de existir
              duas vezes.
            */
            { label: 'Chave de acesso', valor: documento.access_key, span: 4 }
          ]}
        />
      </BlocoConteudo>

      <BlocoConteudo titulo="Arquivos fiscais">
        <CamposComVazios
          colunas={3}
          campos={[
            { label: 'XML', valor: documento.xml_storage_key ? 'Disponivel' : null },
            { label: 'DANFE', valor: documento.danfe_storage_key ? 'Disponivel' : null },
            { label: 'PDF', valor: documento.pdf_storage_key ? 'Disponivel' : null }
          ]}
        />

        {documento.xml_storage_key ? (
          <div className="app-actionbar">
            <button className="btn btn-outline" type="button" onClick={generateDanfe} disabled={generatingDanfe}>
              {generatingDanfe ? 'Gerando...' : documento.danfe_storage_key ? 'Regerar DANFE pelo XML' : 'Gerar DANFE pelo XML'}
            </button>
            {documento.danfe_storage_key ? (
              <button className="btn btn-outline" type="button" onClick={() => openFile('pdf')} disabled={openingFile === 'pdf'}>
                {openingFile === 'pdf' ? 'Abrindo...' : 'Abrir DANFE'}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* R10: o formulário era um grid com `lg:grid-cols-[180px_1fr_auto]`
            — largura de coluna em px, medida à mão. O FormSecao dá o grid. */}
        <form onSubmit={submitFileUpload}>
          <FormSecao legenda="Anexar arquivo" colunas={2}>
            <CampoForm label="Tipo do arquivo">
              {/* Select de FORMULÁRIO: escolhe o que está sendo anexado. */}
              <select
                className="input w-full"
                value={fileType}
                onChange={(event) => setFileType(event.target.value)}
              >
                <option value="danfe">DANFE</option>
                <option value="pdf">PDF fiscal</option>
              </select>
            </CampoForm>

            <CampoForm label="Arquivo" hint="PDF, PNG ou JPG.">
              <input
                className="input w-full"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button className="btn btn-primary" type="submit" disabled={uploadingFile}>
              {uploadingFile ? 'Anexando...' : 'Anexar arquivo'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      {/*
        R1/R17 — vínculos e divergências eram duas colunas de <div> por
        registro, com os dados soltos em <p>/<span>: sem coluna declarada,
        sem alinhamento por tipo, sem redimensionamento e sem largura salva.
        Viram duas TabelaPadrao, cada uma em largura total (bloco principal
        nunca divide espaço com apoio) e com o papel de cada coluna
        declarado. Nenhum dado saiu.
      */}
      <BlocoConteudo
        titulo="Vínculos"
        descricao="Amarracao do documento com solicitação, pedido, título, obra e apropriação."
        acoes={(
          <button
            className="btn btn-outline btn-sm"
            type="button"
            onClick={suggestLinks}
            disabled={suggestingLinks || bloqueadoParaVinculo}
            title={bloqueadoParaVinculo ? 'Documento ignorado ou cancelado nao recebe sugestao de vinculo' : undefined}
          >
            {suggestingLinks ? 'Sugerindo...' : 'Sugerir vinculos'}
          </button>
        )}
      >
        <TabelaPadrao
          // R17: vínculo não tem nome próprio — é a relação entre dois
          // registros. A ausência de identidade é DECLARADA, não silenciosa.
          semIdentidade
          colunas={[
            {
              id: 'situacao',
              titulo: 'Situação',
              tipo: 'status',
              noCard: 'titulo',
              render: (link) => <StatusBadge status={link.link_status || 'suggested'} />
            },
            {
              id: 'origem',
              titulo: 'Origem',
              tipo: 'texto',
              render: (link) => (link.matched_by === 'automatic' ? 'Sugerido automaticamente' : 'Vinculo manual')
            },
            {
              id: 'confianca',
              titulo: 'Confianca',
              tipo: 'numero',
              render: (link) => (link.confidence_score ? `${Number(link.confidence_score).toFixed(0)}%` : '-')
            },
            {
              id: 'referencias',
              titulo: 'Referências',
              tipo: 'texto',
              render: (link) => {
                const referencias = referenciasDoVinculo(link);
                return <span title={referencias || undefined}>{referencias || '-'}</span>;
              }
            },
            {
              id: 'motivo',
              titulo: 'Motivo',
              tipo: 'texto',
              render: (link) => (
                <span title={link.matched_reason || undefined}>
                  {link.matched_reason || 'Sem motivo registrado.'}
                </span>
              )
            }
          ]}
          itens={links}
          storageKey="tabela:documento-fiscal:vinculos"
          rotuloRolagem="Vinculos"
          vazio="Nenhum vínculo registrado nesta fase."
          larguraAcoes={220}
          acoesLinha={(link) => (link.link_status === 'suggested' ? (
            <>
              <button
                className="btn btn-outline btn-sm"
                type="button"
                disabled={updatingLinkId === link.id}
                onClick={() => confirmLink(link)}
              >
                Confirmar
              </button>
              {/* Destrutiva apartada, em vermelho suave (R6 do catálogo). */}
              <button
                className="btn btn-outline btn-sm btn-perigo-suave"
                type="button"
                disabled={updatingLinkId === link.id}
                onClick={() => rejectLink(link)}
              >
                Rejeitar
              </button>
            </>
          ) : null)}
        />
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Divergências"
        descricao="Pendências apontadas entre o documento fiscal e o que o sistema esperava."
      >
        <TabelaPadrao
          semIdentidade
          colunas={[
            {
              id: 'tipo',
              titulo: 'Tipo',
              tipo: 'texto',
              noCard: 'titulo',
              render: (item) => DIVERGENCE_TYPES.find((tipo) => tipo.value === item.divergence_type)?.label || item.divergence_type
            },
            {
              id: 'severidade',
              titulo: 'Severidade',
              tipo: 'badge',
              render: (item) => (
                <StatusBadge
                  status={DIVERGENCE_SEVERITIES.find((sev) => sev.value === item.severity)?.label || item.severity}
                  kind={FAMILIA_SEVERIDADE[item.severity] || 'neutral'}
                />
              )
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (item) => <StatusBadge status={item.status} />
            },
            {
              id: 'descricao',
              titulo: 'Descrição',
              tipo: 'texto',
              render: (item) => (
                <span title={item.description || undefined}>{item.description || '-'}</span>
              )
            },
            {
              id: 'valores',
              titulo: 'Esperado / encontrado',
              tipo: 'texto',
              render: (item) => (
                <CelulaDupla
                  principal={`Esperado: ${item.expected_value || '-'}`}
                  sub={`Encontrado: ${item.actual_value || '-'}`}
                />
              )
            }
          ]}
          itens={divergences}
          storageKey="tabela:documento-fiscal:divergencias"
          rotuloRolagem="Divergencias"
          vazio="Nenhuma divergência registrada."
          larguraAcoes={220}
          acoesLinha={(item) => (item.status === 'open' ? (
            <>
              <button
                className="btn btn-outline btn-sm"
                type="button"
                disabled={updatingDivergenceId === item.id}
                onClick={() => resolveDivergence(item)}
              >
                Resolver
              </button>
              <button
                className="btn btn-outline btn-sm btn-perigo-suave"
                type="button"
                disabled={updatingDivergenceId === item.id}
                onClick={() => ignoreDivergence(item)}
              >
                Ignorar
              </button>
            </>
          ) : null)}
        />
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Registrar divergência manual"
        variante="secundario"
        recolhivel
        recolhidoPadrao
      >
        <form onSubmit={submitDivergence}>
          <FormSecao colunas={3}>
            <CampoForm label="Tipo da divergência">
              <select
                className="input w-full"
                value={divergenceForm.divergence_type}
                onChange={(event) => updateDivergenceField('divergence_type', event.target.value)}
              >
                {DIVERGENCE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </CampoForm>

            <CampoForm label="Severidade">
              <select
                className="input w-full"
                value={divergenceForm.severity}
                onChange={(event) => updateDivergenceField('severity', event.target.value)}
              >
                {DIVERGENCE_SEVERITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </CampoForm>

            <CampoForm label="ID do vínculo fiscal" hint="Opcional.">
              <input
                className="input w-full"
                inputMode="numeric"
                value={divergenceForm.fiscal_document_link_id}
                onChange={(event) => updateDivergenceField('fiscal_document_link_id', event.target.value)}
              />
            </CampoForm>

            <CampoForm label="Valor esperado">
              <input
                className="input w-full"
                value={divergenceForm.expected_value}
                onChange={(event) => updateDivergenceField('expected_value', event.target.value)}
              />
            </CampoForm>

            <CampoForm label="Valor encontrado">
              <input
                className="input w-full"
                value={divergenceForm.actual_value}
                onChange={(event) => updateDivergenceField('actual_value', event.target.value)}
              />
            </CampoForm>

            <CampoForm label="Descrição" obrigatorio tipo="texto-longo">
              {/* R10: a altura vem da folha do sistema (textarea.input), não
                  do `min-h-[84px]` que estava aqui. */}
              <textarea
                className="input w-full"
                placeholder="Descrição da divergência"
                value={divergenceForm.description}
                onChange={(event) => updateDivergenceField('description', event.target.value)}
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button className="btn btn-primary" type="submit" disabled={savingDivergence}>
              {savingDivergence ? 'Registrando...' : 'Registrar divergencia'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Registrar vínculo manual"
        variante="secundario"
        recolhivel
        recolhidoPadrao={links.length > 0}
      >
        <form onSubmit={submitManualLink}>
          {/*
            R16: a busca de registros para vincular é o contexto PRÓPRIO
            deste formulário (não é a busca de uma lista da tela), então ela
            é dona única aqui dentro. R12 não se aplica: o select escolhe o
            TIPO do registro que se está procurando para gravar no vínculo —
            é entrada de dado, não recorte de lista.
          */}
          <FormSecao legenda="Procurar registro" colunas={3}>
            <CampoForm label="Tipo do registro">
              <select
                className="input w-full"
                value={linkSearchType}
                onChange={(event) => {
                  setLinkSearchType(event.target.value);
                  setLinkSearchResults([]);
                }}
              >
                {LINK_SEARCH_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </CampoForm>

            <CampoForm label="Busca" span={2}>
              <input
                className="input w-full"
                placeholder="Busque por nome, código, descrição, documento ou ID"
                value={linkSearchQuery}
                onChange={(event) => setLinkSearchQuery(event.target.value)}
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button className="btn btn-outline" type="button" onClick={searchLinkOptions} disabled={linkSearching}>
              {linkSearching ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {linkSearchResults.length ? (
            <TabelaPadrao
              semIdentidade
              colunas={[
                {
                  id: 'registro',
                  titulo: 'Registro',
                  tipo: 'texto',
                  noCard: 'titulo',
                  render: (option) => (
                    <CelulaDupla principal={option.label} sub={option.description || null} />
                  )
                },
                {
                  id: 'tipo',
                  titulo: 'Tipo',
                  tipo: 'texto',
                  render: (option) => getLinkSearchType(option.type).label
                },
                {
                  id: 'identificador',
                  titulo: 'ID',
                  tipo: 'codigo',
                  render: (option) => `#${option.id}`
                }
              ]}
              itens={linkSearchResults}
              getId={(option) => `${option.type}-${option.id}`}
              storageKey="tabela:documento-fiscal:busca-vinculo"
              rotuloRolagem="Resultados da busca de vinculo"
              vazio="Nenhum registro encontrado."
              larguraAcoes={130}
              acoesLinha={(option) => (
                <button className="btn btn-outline btn-sm" type="button" onClick={() => selectLinkOption(option)}>
                  Selecionar
                </button>
              )}
            />
          ) : null}

          <FormSecao legenda="Identificadores do vínculo" colunas={3}>
            {LINK_SEARCH_TYPES.map((tipo) => (
              <CampoForm key={tipo.field} label={`ID ${tipo.label.toLowerCase()}`}>
                <input
                  className="input w-full"
                  inputMode="numeric"
                  value={linkForm[tipo.field]}
                  onChange={(event) => updateLinkField(tipo.field, event.target.value)}
                />
              </CampoForm>
            ))}

            <CampoForm label="Motivo ou observação do vínculo" tipo="texto-longo">
              <textarea
                className="input w-full"
                value={linkForm.matched_reason}
                onChange={(event) => updateLinkField('matched_reason', event.target.value)}
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button className="btn btn-primary" type="submit" disabled={linking}>
              {linking ? 'Vinculando...' : 'Salvar vinculo'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      {/* Histórico nasce recolhido (regra 1 da organização), com o título à
          vista para quem precisa dele. */}
      <BlocoConteudo
        titulo="Eventos"
        variante="secundario"
        recolhivel
        recolhidoPadrao={!events.length}
      >
        <TabelaPadrao
          semIdentidade
          colunas={[
            {
              id: 'data',
              titulo: 'Data',
              tipo: 'data',
              noCard: 'titulo',
              render: (event) => formatDateTime(event.event_date) || '-'
            },
            {
              id: 'tipo',
              titulo: 'Tipo',
              // Tipo de evento é classificação, não nome próprio: `texto`,
              // não `identidade` (que sobe para maiúsculas).
              tipo: 'texto',
              render: (event) => event.event_type
            },
            {
              id: 'protocolo',
              titulo: 'Protocolo',
              tipo: 'codigo',
              render: (event) => event.event_protocol || '-'
            },
            {
              id: 'descricao',
              titulo: 'Descrição',
              tipo: 'texto',
              render: (event) => (
                <span title={event.event_description || undefined}>{event.event_description || '-'}</span>
              )
            }
          ]}
          itens={events}
          storageKey="tabela:documento-fiscal:eventos"
          rotuloRolagem="Eventos"
          vazio="Nenhum evento registrado."
        />
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Dados extraidos"
        descricao="Conteudo bruto lido do XML, para conferência técnica."
        variante="secundario"
        recolhivel
        recolhidoPadrao
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <p className="text-xs text-[var(--c-muted)]">XML parseado</p>
            <JsonBlock value={documento.parsed_xml_json} />
          </div>
          <div>
            <p className="text-xs text-[var(--c-muted)]">Resumo bruto</p>
            <JsonBlock value={documento.raw_summary_json} />
          </div>
        </div>
      </BlocoConteudo>

      {/* R21: o modal de confirmação do sistema, no lugar do window.confirm. */}
      {elementoConfirmacao}
    </Pagina>
  );
}
