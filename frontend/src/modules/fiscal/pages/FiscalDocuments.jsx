import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  BarraFiltros,
  Avisos,
  useAvisos,
  useFiltrosVisiveis
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import {
  generateFiscalDocumentDanfe,
  getFiscalCompanies,
  getFiscalDocumentFileUrl,
  getFiscalDocuments,
  uploadFiscalXml
} from '../services/fiscalApi';

const FILTROS_VAZIOS = {
  company_id: '',
  status: '',
  document_type: '',
  source: '',
  manifestation_status: '',
  issuer_cnpj: '',
  emission_start: '',
  emission_end: '',
  min_value: '',
  max_value: '',
  has_xml: '',
  has_pdf: '',
  q: ''
};

const OPCOES_STATUS = [
  ['pending_link', 'Pendente de vinculo'],
  ['linked_to_order', 'Vinculado'],
  ['with_divergence', 'Com divergencia'],
  ['validated', 'Validado'],
  ['ignored', 'Ignorado'],
  ['xml_downloaded', 'XML baixado'],
  ['discovered', 'Descoberto']
];

const OPCOES_TIPO = [
  ['nfe', 'NFe'],
  ['cte', 'CTe'],
  ['nfse', 'NFSe']
];

const OPCOES_ORIGEM = [
  ['manual_upload', 'Upload manual'],
  ['sefaz_distribution', 'SEFAZ'],
  ['batch_import', 'Importacao em lote']
];

const OPCOES_MANIFESTACAO = [
  ['pending', 'Pendente'],
  ['not_required', 'Nao requerida'],
  ['ciencia_operacao', 'Ciencia'],
  ['confirmacao_operacao', 'Confirmacao'],
  ['desconhecimento_operacao', 'Desconhecimento'],
  ['operacao_nao_realizada', 'Operacao nao realizada']
];

const OPCOES_ARQUIVO = [
  ['true', 'Com arquivo'],
  ['false', 'Sem arquivo']
];

function paraOpcoes(pares) {
  return pares.map(([valor, rotulo]) => ({ valor, rotulo }));
}

function getImportFileInfo(originalName = '') {
  const raw = String(originalName || '');
  const separatorIndex = raw.indexOf(':');
  const container = separatorIndex > -1 ? raw.slice(0, separatorIndex) : '';
  const entry = separatorIndex > -1 ? raw.slice(separatorIndex + 1) : raw;
  const normalizedEntry = entry.replace(/\\/g, '/');
  const parts = normalizedEntry.split('/').filter(Boolean);
  const fileName = parts.at(-1) || raw || '-';
  const folder = parts.slice(0, -1).join('/');

  return {
    container,
    folder,
    fileName,
    fullPath: raw
  };
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
  { id: 'company_id', rotulo: 'Empresa' },
  { id: 'status', rotulo: 'Status' },
  { id: 'document_type', rotulo: 'Tipo' },
  { id: 'source', rotulo: 'Origem' },
  { id: 'manifestation_status', rotulo: 'Manifestacao' },
  { id: 'has_xml', rotulo: 'XML' },
  { id: 'has_pdf', rotulo: 'PDF' },
  { id: 'issuer_cnpj', rotulo: 'CNPJ fornecedor' },
  { id: 'emission_start', rotulo: 'Emissão de' },
  { id: 'emission_end', rotulo: 'Emissão até' },
  { id: 'min_value', rotulo: 'Valor mínimo' },
  { id: 'max_value', rotulo: 'Valor máximo' }
];

export default function FiscalDocuments() {
  const [documents, setDocuments] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [filters, setFilters] = useState(FILTROS_VAZIOS);
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
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:documentos-fiscais', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      // A lista vem de `load`, não de um efeito sobre o estado: sem
      // recarregar, o recorte escondido seguiria valendo.
      const proximos = { ...filters, [id]: '' };
      setFilters(proximos);
      load(proximos);
    }
  });
  const [uploadCompanyId, setUploadCompanyId] = useState('');
  const [uploadFiles, setUploadFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [openingFile, setOpeningFile] = useState('');
  const [generatingDanfe, setGeneratingDanfe] = useState('');
  const [importReport, setImportReport] = useState(null);
  /*
    R3/R19 — os dois <div> de erro/sucesso pintados com paleta crua
    (red-50/emerald-50, sem par no tema escuro) viram a faixa do sistema.
    Um dono só para o aviso, logo abaixo do cabeçalho (R16).
  */
  const { avisos, avisar, fechar } = useAvisos();

  const load = async (filtrosAtuais = filters) => {
    setLoading(true);
    try {
      const [documentsResult, companiesResult] = await Promise.all([
        getFiscalDocuments(filtrosAtuais),
        getFiscalCompanies({ ativo: true })
      ]);
      setDocuments(documentsResult?.data || []);
      const nextCompanies = companiesResult?.data || [];
      setCompanies(nextCompanies);
      setUploadCompanyId((current) => current || String(nextCompanies[0]?.id || ''));
    } catch (err) {
      avisar.erro(err.message || 'Erro ao buscar documentos fiscais');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(FILTROS_VAZIOS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    R12 — o recorte era DOZE controles soltos numa grade: sete <select> de
    escolha única (empresa, status, tipo, origem, manifestação, XML, PDF),
    quatro campos contínuos e a busca. Com select, o estado do filtro só
    aparecia abrindo cada lista.

    Agora é a BarraFiltros: busca larga em cima, marcação abaixo e etiqueta
    removível para cada valor escolhido. Todas as dimensões enumeráveis são
    `unico: true` porque o serviço só aceita UM valor por parâmetro
    (`status=validated`) — marcar dois mandaria filtro nenhum e o usuário
    veria duas etiquetas sem a lista estreitar (a armadilha que a própria
    BarraFiltros documenta).

    O payload que vai para `getFiscalDocuments` é o MESMO objeto de antes:
    as marcas são derivadas dele, não um estado paralelo.
  */
  const ativos = useMemo(() => ({
    company_id: filters.company_id ? new Set([String(filters.company_id)]) : new Set(),
    status: filters.status ? new Set([filters.status]) : new Set(),
    document_type: filters.document_type ? new Set([filters.document_type]) : new Set(),
    source: filters.source ? new Set([filters.source]) : new Set(),
    manifestation_status: filters.manifestation_status ? new Set([filters.manifestation_status]) : new Set(),
    has_xml: filters.has_xml ? new Set([filters.has_xml]) : new Set(),
    has_pdf: filters.has_pdf ? new Set([filters.has_pdf]) : new Set()
  }), [filters]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  // Dimensão de valor único: marcar o mesmo valor desmarca; marcar outro
  // substitui. É o `alternarValorFiltro` com `unico`, escrito sobre o
  // payload de string que o serviço espera.
  const alternarMarca = (dimensao, valor) => {
    setFilters((current) => ({
      ...current,
      [dimensao]: String(current[dimensao] || '') === String(valor) ? '' : String(valor)
    }));
  };

  const limparFiltros = async () => {
    setFilters(FILTROS_VAZIOS);
    await load(FILTROS_VAZIOS);
  };

  const openFile = async (documentId, type) => {
    setOpeningFile(`${documentId}-${type}`);
    try {
      const result = await getFiscalDocumentFileUrl(documentId, type);
      if (result?.url) window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao abrir arquivo fiscal');
    } finally {
      setOpeningFile('');
    }
  };

  const generateDanfe = async (documentId) => {
    setGeneratingDanfe(String(documentId));
    try {
      const result = await generateFiscalDocumentDanfe(documentId);
      if (result?.url) window.open(result.url, '_blank', 'noopener,noreferrer');
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao gerar DANFE fiscal');
    } finally {
      setGeneratingDanfe('');
    }
  };

  const submitUpload = async (event) => {
    event.preventDefault();
    // A referência do <form> é fixada ANTES do await: `event.target` some
    // depois que o React recicla o evento sintético.
    const formulario = event.currentTarget;
    if (!uploadCompanyId || !uploadFiles.length) {
      avisar.erro('Selecione a empresa fiscal e ao menos um XML ou ZIP fiscal.');
      return;
    }

    setUploading(true);
    try {
      const result = await uploadFiscalXml({ companyId: uploadCompanyId, files: uploadFiles });
      setImportReport(result || null);
      const falhas = Number(result?.failed_count || 0);
      const importados = Number(result?.imported_count || 0);
      const duplicados = Number(result?.duplicate_count || 0);
      const resumo = falhas
        ? `${importados} XML(s) importado(s), ${duplicados} reimportado(s) e ${falhas} arquivo(s) com erro.`
        : `${importados} XML(s) importado(s) com sucesso. ${duplicados ? `${duplicados} ja existiam e foram atualizados.` : ''}`;
      // Importação com falha não é sucesso: o tom da faixa segue o
      // resultado, não a conclusão da chamada.
      if (falhas) avisar.alerta(resumo);
      else avisar.sucesso(resumo);
      setUploadFiles([]);
      formulario.reset();
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao importar XML fiscal');
      setImportReport(null);
    } finally {
      setUploading(false);
    }
  };

  const copyImportFailures = async () => {
    const failures = importReport?.failed || [];
    if (!failures.length) return;

    const text = failures
      .map((item) => {
        const file = getImportFileInfo(item.original_name);
        return `${file.fileName} | ${file.fullPath} | ${item.error || 'Erro ao importar XML fiscal.'}`;
      })
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      // Retorno trivial de clipboard: nada foi gravado, o texto ja esta na area de transferencia.
      avisar.sucesso('Lista de erros copiada para a área de transferência.', undefined, { efemero: true });
    } catch {
      avisar.erro('Não foi possível copiar a lista de erros automaticamente.');
    }
  };

  return (
    <Pagina>
      {/*
        R13/C1/C2 — o cabeçalho era um bloco de <p>/<h1> soltos que rolava
        para fora da tela, com o apoio em `text-2xl`/paleta crua. Vira a
        faixa fixa do PageHeader: contagem TOTAL aqui (C2 × B3, 05/09), os
        recortes ficam nos blocos.
      */}
      <PageHeader
        titulo="Documentos fiscais"
        contagem={loading ? null : `${documents.length} documento(s)`}
        descricao="Caixa de documentos DFe com importação manual de XMLs individuais ou ZIP exportado por outro sistema."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 — a importação FICA INLINE. Ela não interrompe outro trabalho:
        é o que a pessoa vem fazer nesta tela junto de conferir a caixa de
        entrada. O formulário estava espremido dentro da faixa do cabeçalho
        (onde C2/R5 pedem uma linha de apoio e a barra de ações); ganha
        superfície própria, sem perder nenhum campo.
      */}
      <BlocoConteudo
        titulo="Importar XML/ZIP"
        descricao="Aceita XMLs individuais ou um ZIP exportado por outro sistema. Documentos já existentes são atualizados."
      >
        <form onSubmit={submitUpload}>
          <FormSecao colunas={2}>
            <CampoForm label="Empresa fiscal" obrigatorio>
              {/* Select de FORMULÁRIO (para qual empresa o XML entra), não
                  de filtro — legítimo pela própria R12. */}
              <select
                className="input w-full"
                value={uploadCompanyId}
                onChange={(event) => setUploadCompanyId(event.target.value)}
                required
              >
                <option value="">Empresa fiscal</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.razao_social}</option>
                ))}
              </select>
            </CampoForm>

            <CampoForm
              label="Arquivos"
              obrigatorio
              hint={uploadFiles.length
                ? `${uploadFiles.length} arquivo(s) selecionado(s)`
                : 'Selecione XMLs ou um ZIP'}
            >
              {/* R10: a largura do campo vem da classe do sistema — o
                  `min-w-[260px]` que estava aqui era medida à mão. */}
              <input
                className="input w-full"
                type="file"
                accept=".xml,.zip,application/xml,text/xml,application/zip"
                multiple
                onChange={(event) => setUploadFiles(Array.from(event.target.files || []))}
                required
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button className="btn btn-primary" type="submit" disabled={uploading}>
              {uploading ? 'Importando...' : 'Importar XML/ZIP'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      {importReport ? (
        <BlocoConteudo
          variante="secundario"
          titulo="Relatório de importação"
          descricao={`${Number(importReport.total || 0)} XML(s) lido(s), ${Number(importReport.imported_count || 0)} processado(s), ${Number(importReport.duplicate_count || 0)} reimportado(s) e ${Number(importReport.failed_count || 0)} com erro.`}
          acoes={(
            <>
              {importReport.failed?.length ? (
                <button className="btn btn-outline btn-sm" type="button" onClick={copyImportFailures}>
                  Copiar erros
                </button>
              ) : null}
              <button className="btn btn-outline btn-sm" type="button" onClick={() => setImportReport(null)}>
                Fechar
              </button>
            </>
          )}
        >
          {importReport.failed?.length ? (
            <TabelaPadrao
              colunas={[
                {
                  id: 'arquivo',
                  titulo: 'Arquivo',
                  // R17: nome de arquivo preserva caixa e extensão — é
                  // `texto`, nunca `identidade` (que exibe em MAIÚSCULAS).
                  tipo: 'texto',
                  noCard: 'titulo',
                  render: (item) => {
                    const file = getImportFileInfo(item.original_name);
                    return (
                      <CelulaDupla
                        principal={file.fileName}
                        sub={[file.container, file.folder].filter(Boolean).join(':') || file.fullPath}
                        title={file.fullPath}
                      />
                    );
                  }
                },
                {
                  id: 'motivo',
                  titulo: 'Motivo',
                  tipo: 'texto',
                  render: (item) => (
                    <span className="text-[var(--sem-danger)]">
                      {item.error || 'Erro ao importar XML fiscal.'}
                    </span>
                  )
                }
              ]}
              itens={importReport.failed}
              semIdentidade
              getId={(item) => item.original_name}
              storageKey="tabela:documentos-fiscais:falhas-importacao"
              rotuloRolagem="Falhas de importacao"
              vazio="Nenhuma falha de importação."
            />
          ) : null}
        </BlocoConteudo>
      ) : null}

      {/*
        R18 — o `overflow-hidden` do card que embrulhava a tabela criava
        scrollport e matava o `position: sticky` do cabeçalho e da coluna
        fixa, em silêncio. O BlocoConteudo não recorta; onde precisar, o
        sistema usa `overflow: clip`.
      */}
      <BlocoConteudo
        titulo="Caixa de documentos"
        variante="primario"
        cor="var(--module-fiscal)"
      >
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('q') ? {
            valor: filters.q,
            aoMudar: (valor) => updateFilter('q', valor),
            placeholder: 'Buscar por chave, fornecedor ou número'
          } : null}
          campos={[
            { id: 'issuer_cnpj', rotulo: 'CNPJ fornecedor', tipo: 'text', valor: filters.issuer_cnpj, aoMudar: (valor) => updateFilter('issuer_cnpj', valor) },
            { id: 'emission_start', rotulo: 'Emissão de', tipo: 'date', valor: filters.emission_start, aoMudar: (valor) => updateFilter('emission_start', valor) },
            { id: 'emission_end', rotulo: 'Emissão até', tipo: 'date', valor: filters.emission_end, aoMudar: (valor) => updateFilter('emission_end', valor) },
            { id: 'min_value', rotulo: 'Valor mínimo', tipo: 'number', valor: filters.min_value, aoMudar: (valor) => updateFilter('min_value', valor) },
            { id: 'max_value', rotulo: 'Valor máximo', tipo: 'number', valor: filters.max_value, aoMudar: (valor) => updateFilter('max_value', valor) }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={[
            {
              id: 'company_id',
              rotulo: 'Empresa',
              unico: true,
              opcoes: companies.map((company) => ({ valor: String(company.id), rotulo: company.razao_social }))
            },
            { id: 'status', rotulo: 'Status', unico: true, opcoes: paraOpcoes(OPCOES_STATUS) },
            { id: 'document_type', rotulo: 'Tipo', unico: true, opcoes: paraOpcoes(OPCOES_TIPO) },
            { id: 'source', rotulo: 'Origem', unico: true, opcoes: paraOpcoes(OPCOES_ORIGEM) },
            { id: 'manifestation_status', rotulo: 'Manifestacao', unico: true, opcoes: paraOpcoes(OPCOES_MANIFESTACAO) },
            { id: 'has_xml', rotulo: 'XML', unico: true, opcoes: paraOpcoes(OPCOES_ARQUIVO) },
            { id: 'has_pdf', rotulo: 'PDF', unico: true, opcoes: paraOpcoes(OPCOES_ARQUIVO) }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={(dimensao, valor) => alternarMarca(dimensao, valor)}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />

        {/*
          R23 — EXCEÇÃO DE CONSULTA CARA, declarada na tela.

          O recorte tem DOZE dimensões (sete marcáveis, quatro campos e a
          busca) e cada mudança seria uma ida ao servidor: montar um recorte
          normal aqui dispara muito mais que as três requisições que a regra
          fixa como limite. Então as marcas são RASCUNHO até o clique, o
          botão diz o que faz ("Atualizar lista", não "Aplicar filtros") e o
          apoio abaixo avisa que o recorte só vale no clique — sem esse
          aviso a etiqueta mentiria, que é justamente o que a R23 proíbe.
        */}
        <div className="app-actionbar">
          <span className="text-xs text-[var(--c-muted)]">
            O recorte marcado acima so vale depois de clicar em Atualizar lista.
          </span>
          <button className="btn btn-outline" type="button" onClick={limparFiltros}>
            Limpar
          </button>
          <button className="btn btn-primary" type="button" onClick={() => load(filters)}>
            Atualizar lista
          </button>
        </div>

        <TabelaPadrao
          colunas={[
            {
              id: 'emissao',
              titulo: 'Emissão',
              tipo: 'data',
              render: (item) => (item.emission_date ? new Date(item.emission_date).toLocaleDateString('pt-BR') : '-')
            },
            {
              id: 'fornecedor',
              titulo: 'Fornecedor',
              // R17/T5: identidade é NOME PRÓPRIO legível — o fornecedor.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => (
                <Link className="text-[var(--c-primary)] hover:underline" to={`/fiscal/documentos/${item.id}`}>
                  {item.issuer_name || item.issuer_cnpj || '-'}
                </Link>
              )
            },
            {
              id: 'chave',
              titulo: 'Chave',
              // Chave de acesso de 44 dígitos é CÓDIGO técnico, nunca
              // identidade: identidade sobe para maiúsculas e serve a nome
              // próprio legível.
              tipo: 'codigo',
              render: (item) => (
                <span title={item.access_key || undefined}>{item.access_key || '-'}</span>
              )
            },
            {
              id: 'numero',
              titulo: 'Número',
              tipo: 'codigo',
              render: (item) => item.document_number || '-'
            },
            {
              id: 'valor',
              titulo: 'Valor',
              // T7: dinheiro é `tipo: 'valor'` — 190px, à direita, tabular,
              // e nunca trunca.
              tipo: 'valor',
              render: (item) => formatMoney(item.total_value)
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              // R25: o status era texto cru; o StatusBadge resolve cor,
              // ícone e contraste por token.
              render: (item) => <StatusBadge status={item.document_status} />
            }
          ]}
          itens={documents}
          carregando={loading}
          vazio="Nenhum documento fiscal encontrado."
          storageKey="tabela:documentos-fiscais"
          rotuloRolagem="Documentos fiscais"
          larguraAcoes={320}
          colunasConfiguraveis
          acoesLinha={(item) => (
            <>
              {/* A1: a linha tem um controle focável que abre o registro. */}
              <Link className="btn btn-outline btn-sm" to={`/fiscal/documentos/${item.id}`}>
                Detalhes
              </Link>
              {item.xml_storage_key ? (
                <button className="btn btn-outline btn-sm" type="button" onClick={() => openFile(item.id, 'xml')} disabled={openingFile === `${item.id}-xml`}>
                  XML
                </button>
              ) : null}
              {item.pdf_storage_key ? (
                <button className="btn btn-outline btn-sm" type="button" onClick={() => openFile(item.id, 'pdf')} disabled={openingFile === `${item.id}-pdf`}>
                  PDF
                </button>
              ) : null}
              {item.xml_storage_key && !item.danfe_storage_key ? (
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={() => generateDanfe(item.id)}
                  disabled={generatingDanfe === String(item.id)}
                >
                  {generatingDanfe === String(item.id) ? 'Gerando...' : 'Gerar DANFE'}
                </button>
              ) : null}
              {item.danfe_storage_key ? (
                <>
                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    onClick={() => openFile(item.id, 'danfe')}
                    disabled={openingFile === `${item.id}-danfe`}
                  >
                    Abrir DANFE
                  </button>
                  {item.xml_storage_key ? (
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => generateDanfe(item.id)}
                      disabled={generatingDanfe === String(item.id)}
                    >
                      {generatingDanfe === String(item.id) ? 'Gerando...' : 'Regerar DANFE'}
                    </button>
                  ) : null}
                </>
              ) : null}
              {!item.xml_storage_key && !item.pdf_storage_key && !item.danfe_storage_key ? (
                <span className="text-xs text-[var(--c-muted)]">Indisponível</span>
              ) : null}
            </>
          )}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
