import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiOutlineArrowPath, HiOutlineEye } from 'react-icons/hi2';
import {
  baixarBoletoCaixaHomologacaoCsv,
  baixarBoletoCaixaHomologacaoPacote,
  baixarBoletoCaixaRemessa,
  baixarPdfBoletoTitulo,
  gerarBoletoCaixaRemessa,
  gerarAmostraBoletoTitulo,
  gerarBoletoTitulo,
  getBoletoCaixaConvenios,
  getBoletoCaixaRemessas,
  getBoletoCaixaRetornos,
  getBoletoTitulo,
  getBoletosConfig,
  getTitulosParaBoleto,
  importarBoletoCaixaRetorno
} from '../services/financeiro';
import { getEmpreendimentosComerciais } from '../services/comercial';
import { buscarParceiros } from '../services/parceiros';
import { useAuth } from '../contexts/AuthContext';
import { hasEnabledModule } from '../utils/acessoProduto';
import ParceiroAutocomplete from '../components/ui/ParceiroAutocomplete';
import OverlayModal from '../components/ui/OverlayModal';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BarraFiltros,
  alternarValorFiltro,
  StatGrid,
  StatTile,
  TabelaPadrao,
  Avisos,
  useAvisos,
  useFiltrosVisiveis
} from '../components/padrao';
// R25: a ficha de compensação é PAPEL, não tela — a decisão e os valores
// moram em um lugar só, com o motivo escrito.
import '../styles/boleto-ficha.css';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos elegíveis' },
  { value: 'PENDENTE_EMISSAO', label: 'Pendente emissão' },
  { value: 'EMITIDO', label: 'Emitido' },
  { value: 'CANCELADO', label: 'Cancelado' }
];

const DEFAULT_FILTERS = {
  q: '',
  codigo: '',
  numero_documento: '',
  empreendimento_id: '',
  parceiro_id: '',
  status_cobranca: 'PENDENTE_EMISSAO',
  origem: 'TODOS',
  vencimento_inicial: '',
  vencimento_final: ''
};

const I25_PATTERNS = {
  0: 'nnwwn',
  1: 'wnnnw',
  2: 'nwnnw',
  3: 'wwnnn',
  4: 'nnwnw',
  5: 'wnwnn',
  6: 'nwwnn',
  7: 'nnnww',
  8: 'wnnwn',
  9: 'nwnwn'
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatCpfCnpj(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return value || '-';
}

function getConfigIssues(config) {
  if (!config) return ['configuracao de boletos ainda nao carregada'];
  const pending = Array.isArray(config.configuracao_pendente) ? config.configuracao_pendente : [];
  if (pending.length) return pending;

  const issues = [];
  if (!config.agencia_configurada) issues.push('CAIXA_AGENCIA');
  if (!config.codigo_beneficiario_configurado) issues.push('CAIXA_CODIGO_BENEFICIARIO');
  if (!config.beneficiario_configurado) issues.push('CAIXA_BENEFICIARIO_NOME ou COMPANY_LEGAL_NAME');
  if (!config.beneficiario_cpf_cnpj_configurado) issues.push('CAIXA_BENEFICIARIO_CPF_CNPJ');
  if (config.emissao_real_bloqueada) issues.push('homologacao Caixa pendente para emissao real');
  return issues;
}

function getConfigIssueMessage(config, action = 'gerar boletos') {
  const issues = getConfigIssues(config);
  if (!issues.length) return '';
  return `Nao foi possivel ${action}: ${issues.join(', ')}.`;
}

function normalizeBarcode(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length % 2 === 0 ? digits : `0${digits}`;
}

function BarcodeSvg({ value }) {
  const digits = normalizeBarcode(value);
  const narrow = 1;
  const wide = 3;
  const height = 58;
  const quietZone = narrow * 10;
  const bars = [];
  let x = quietZone;

  function addBar(width) {
    bars.push({ x, width });
    x += width;
  }

  function addSpace(width) {
    x += width;
  }

  addBar(narrow);
  addSpace(narrow);
  addBar(narrow);
  addSpace(narrow);

  for (let index = 0; index < digits.length; index += 2) {
    const first = I25_PATTERNS[digits[index]];
    const second = I25_PATTERNS[digits[index + 1]];
    for (let pos = 0; pos < 5; pos += 1) {
      addBar(first[pos] === 'w' ? wide : narrow);
      addSpace(second[pos] === 'w' ? wide : narrow);
    }
  }

  addBar(wide);
  addSpace(narrow);
  addBar(narrow);
  x += quietZone;

  return (
    <svg
      viewBox={`0 0 ${x} ${height}`}
      preserveAspectRatio="xMinYMid meet"
      className="boleto-codigo-barras"
      role="img"
      aria-label="Código de barras do boleto"
    >
      {bars.map((bar, index) => (
        <rect key={`${bar.x}-${index}`} x={bar.x} y="0" width={bar.width} height={height} fill="currentColor" />
      ))}
    </svg>
  );
}

function BoletoPrintView({ detalhe }) {
  const titulo = detalhe?.titulo || {};
  const boleto = detalhe?.boleto || {};
  const pagador = detalhe?.pagador || titulo.parceiro || {};
  const beneficiario = boleto.beneficiario || {};
  const enderecoPagador = [
    pagador.endereco,
    pagador.numero,
    pagador.bairro,
    pagador.municipio,
    pagador.estado,
    pagador.cep
  ].filter(Boolean).join(' - ');

  if (!boleto.codigo_barras) {
    return (
      <div className="app-empty-card">
        Gere o boleto para visualizar a ficha de compensação.
      </div>
    );
  }

  return (
    <section className="boleto-print rounded-2xl border border-[color:var(--boleto-regua)] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--boleto-regua)] pb-3">
        <div>
          <div className="text-lg font-bold">CAIXA</div>
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--boleto-rotulo)]">Banco {boleto.codigo_banco || '104-0'}</div>
        </div>
        {boleto.modo_teste && (
          <div className="rounded-full border border-[color:var(--boleto-aviso)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--boleto-aviso)]">
            Boleto de teste - não registrado
          </div>
        )}
        <div className="text-right font-mono text-sm font-semibold">{boleto.linha_digitavel}</div>
      </div>

      <div className="grid border-b border-[color:var(--boleto-regua)] text-xs md:grid-cols-[2fr_1fr]">
        <div className="border-r border-[color:var(--boleto-regua)] p-2">
          <span className="block text-[var(--boleto-rotulo)]">Local de pagamento</span>
          <strong>{boleto.local_pagamento || '-'}</strong>
        </div>
        <div className="p-2">
          <span className="block text-[var(--boleto-rotulo)]">Vencimento</span>
          <strong>{formatDate(titulo.data_vencimento)}</strong>
        </div>
      </div>

      <div className="grid border-b border-[color:var(--boleto-regua)] text-xs md:grid-cols-[2fr_1fr]">
        <div className="border-r border-[color:var(--boleto-regua)] p-2">
          <span className="block text-[var(--boleto-rotulo)]">Beneficiario</span>
          <strong>{beneficiario.nome || '-'}</strong>
          <div>{formatCpfCnpj(beneficiario.cpf_cnpj)}</div>
          <div>{beneficiario.endereco || '-'}</div>
        </div>
        <div className="p-2">
          <span className="block text-[var(--boleto-rotulo)]">Agência / Código do beneficiario</span>
          <strong>{boleto.agencia_codigo_beneficiario || '-'}</strong>
        </div>
      </div>

      <div className="grid border-b border-[color:var(--boleto-regua)] text-xs md:grid-cols-5">
        <div className="border-r border-[color:var(--boleto-regua)] p-2">
          <span className="block text-[var(--boleto-rotulo)]">Data documento</span>
          <strong>{formatDate(titulo.data_emissao)}</strong>
        </div>
        <div className="border-r border-[color:var(--boleto-regua)] p-2">
          <span className="block text-[var(--boleto-rotulo)]">Nr. documento</span>
          <strong>{titulo.numero_documento || titulo.id}</strong>
        </div>
        <div className="border-r border-[color:var(--boleto-regua)] p-2">
          <span className="block text-[var(--boleto-rotulo)]">Especie doc</span>
          <strong>DS</strong>
        </div>
        <div className="border-r border-[color:var(--boleto-regua)] p-2">
          <span className="block text-[var(--boleto-rotulo)]">Aceite</span>
          <strong>N</strong>
        </div>
        <div className="p-2">
          <span className="block text-[var(--boleto-rotulo)]">Nosso número</span>
          <strong>{boleto.nosso_numero || titulo.nosso_numero || '-'}</strong>
        </div>
      </div>

      <div className="grid border-b border-[color:var(--boleto-regua)] text-xs md:grid-cols-5">
        <div className="border-r border-[color:var(--boleto-regua)] p-2">
          <span className="block text-[var(--boleto-rotulo)]">Uso do banco</span>
          <strong>-</strong>
        </div>
        <div className="border-r border-[color:var(--boleto-regua)] p-2">
          <span className="block text-[var(--boleto-rotulo)]">Carteira</span>
          <strong>RG</strong>
        </div>
        <div className="border-r border-[color:var(--boleto-regua)] p-2">
          <span className="block text-[var(--boleto-rotulo)]">Especie moeda</span>
          <strong>R$</strong>
        </div>
        <div className="border-r border-[color:var(--boleto-regua)] p-2">
          <span className="block text-[var(--boleto-rotulo)]">Quantidade moeda</span>
          <strong>-</strong>
        </div>
        <div className="p-2">
          <span className="block text-[var(--boleto-rotulo)]">(=) Valor documento</span>
          <strong>{formatCurrency(titulo.valor_saldo || titulo.valor_original)}</strong>
        </div>
      </div>

      <div className="boleto-instrucoes grid border-b border-[color:var(--boleto-regua)] text-xs md:grid-cols-[2fr_1fr]">
        <div className="border-r border-[color:var(--boleto-regua)] p-2">
          <span className="block text-[var(--boleto-rotulo)]">Instruções</span>
          <strong>Instrucoes (Texto de Responsabilidade do Beneficiario)</strong>
          {boleto.modo_teste && (
            <p className="mt-1 font-semibold text-[var(--boleto-aviso)]">
              BOLETO DE TESTE. Não usar para cobrança real e não distribuir ao pagador.
            </p>
          )}
          <p className="mt-1">Não receber após o vencimento sem autorização do beneficiario.</p>
          <p>{titulo.descricao}</p>
        </div>
        <div className="grid grid-rows-4">
          <div className="border-b border-[color:var(--boleto-regua)] p-2">
            <span className="block text-[var(--boleto-rotulo)]">(-) Desconto / Abatimento</span>
          </div>
          <div className="border-b border-[color:var(--boleto-regua)] p-2">
            <span className="block text-[var(--boleto-rotulo)]">(+) Juros / Multa</span>
          </div>
          <div className="border-b border-[color:var(--boleto-regua)] p-2">
            <span className="block text-[var(--boleto-rotulo)]">(=) Valor cobrado</span>
          </div>
          <div className="p-2">
            <span className="block text-[var(--boleto-rotulo)]">Autenticacao mecanica</span>
          </div>
        </div>
      </div>

      <div className="border-b border-[color:var(--boleto-regua)] p-2 text-xs">
        <span className="block text-[var(--boleto-rotulo)]">Pagador</span>
        <strong>{pagador.nome || '-'}</strong>
        <div>{formatCpfCnpj(pagador.cpf_cnpj)}</div>
        <div>{enderecoPagador || '-'}</div>
      </div>

      <div className="grid items-end gap-4 pt-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <BarcodeSvg value={boleto.codigo_barras} />
        <div className="text-right text-xs font-semibold">Autenticacao Mecanica - Ficha de Compensação</div>
      </div>

      <div className="mt-2 break-all font-mono text-xs text-[var(--boleto-rotulo)]">
        Linha digitavel: {boleto.linha_digitavel}
      </div>
    </section>
  );
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
  { id: 'codigo', rotulo: 'Título' },
  { id: 'numero_documento', rotulo: 'N. documento' },
  { id: 'vencimento_inicial', rotulo: 'Vencimento início' },
  { id: 'vencimento_final', rotulo: 'Vencimento fim' },
  { id: 'status_cobranca', rotulo: 'Status cobrança' },
  { id: 'origem', rotulo: 'Origem' },
  { id: 'empreendimento_id', rotulo: 'Empreendimento' }
];

export default function FinanceiroBoletos() {
  const { user } = useAuth();
  const comercialHabilitado = hasEnabledModule(user, 'COMERCIAL', { allowSuperadminBypass: false });
  const [config, setConfig] = useState(null);
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [titulos, setTitulos] = useState([]);
  const [selecionados, setSelecionados] = useState([]);
  const [detalhe, setDetalhe] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(null);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      const padrao = String(DEFAULT_FILTERS[filtro.id] ?? '');
      const rascunho = String(filters[filtro.id] ?? '');
      const emCurso = String(appliedFilters?.[filtro.id] ?? '');
      return (rascunho !== '' && rascunho !== padrao) || (emCurso !== '' && emCurso !== padrao);
    }).map((filtro) => filtro.id),
    [filters, appliedFilters]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:financeiro-boletos', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      /* O rascunho E a consulta em curso: escondido é escondido dos dois
         lados, senão a lista continua recortada sem campo na faixa. */
      updateFilter(id, DEFAULT_FILTERS[id] ?? '');
      setAppliedFilters((atual) => (atual ? { ...atual, [id]: DEFAULT_FILTERS[id] ?? '' } : atual));
    }
  });
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [gerandoId, setGerandoId] = useState(null);
  const [baixandoPdfId, setBaixandoPdfId] = useState(null);
  const [gerandoMassa, setGerandoMassa] = useState(false);
  /*
    R19 — as quatro faixas de tom próprio desta tela (`error`, `feedback`,
    `cnabFeedback` e as duas classes FANTASMA `.app-alert--info` e
    `.app-alert--warning`, que nunca existiram no CSS e portanto nunca
    estilizaram nada) viraram a faixa do sistema.

    A fronteira do `Avisos` separou o que passava por elas: gerou, baixou,
    importou, falhou — EVENTO, e evento é aviso empilhável e fechável. O
    que sobrou (configuração pendente, ambiente de teste, emissão real
    bloqueada) é CONDIÇÃO: fecha e o problema continua, então continua como
    bloco fixo no fluxo, logo abaixo do cabeçalho.
  */
  const [resultadoMassa, setResultadoMassa] = useState(null);
  const [conveniosCaixa, setConveniosCaixa] = useState([]);
  const [convenioSelecionadoId, setConvenioSelecionadoId] = useState('');
  const [remessasCaixa, setRemessasCaixa] = useState([]);
  const [retornosCaixa, setRetornosCaixa] = useState([]);
  const [retornoFile, setRetornoFile] = useState(null);
  const [gerandoRemessa, setGerandoRemessa] = useState(false);
  const [importandoRetorno, setImportandoRetorno] = useState(false);
  const [baixandoRemessaId, setBaixandoRemessaId] = useState(null);
  const [baixandoHomologacaoId, setBaixandoHomologacaoId] = useState(null);
  const [baixandoPacoteId, setBaixandoPacoteId] = useState(null);
  const retornoInputRef = useRef(null);
  const { avisos, avisar, fechar: fecharAviso, limpar: limparAvisos } = useAvisos();

  function prepararFiltrosBoleto(rawFilters = filters) {
    const boletoFilters = { ...rawFilters };

    if (!comercialHabilitado) {
      delete boletoFilters.empreendimento_id;
      boletoFilters.origem = 'MANUAL';
    }

    return boletoFilters;
  }

  async function carregarBase() {
    try {
      setLoadingOptions(true);
      const [
        configData,
        empreendimentosData,
        clientesData,
        conveniosData,
        remessasData,
        retornosData
      ] = await Promise.all([
        getBoletosConfig(),
        comercialHabilitado ? getEmpreendimentosComerciais() : Promise.resolve([]),
        buscarParceiros({ cliente: 1, ativo: 1, limit: 500 }),
        getBoletoCaixaConvenios({ ativo: 1 }),
        getBoletoCaixaRemessas(),
        getBoletoCaixaRetornos()
      ]);
      setConfig(configData);
      setEmpreendimentos(Array.isArray(empreendimentosData) ? empreendimentosData : []);
      setClientes(Array.isArray(clientesData) ? clientesData : []);
      const listaConvenios = Array.isArray(conveniosData) ? conveniosData : [];
      setConveniosCaixa(listaConvenios);
      setRemessasCaixa(Array.isArray(remessasData) ? remessasData : []);
      setRetornosCaixa(Array.isArray(retornosData) ? retornosData : []);
      setConvenioSelecionadoId((current) => current || String(listaConvenios[0]?.id || ''));
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao carregar configuracoes de boletos');
    } finally {
      setLoadingOptions(false);
    }
  }

  async function carregarTitulos(nextFilters = appliedFilters) {
    if (!nextFilters) {
      setTitulos([]);
      setSelecionados([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const titulosData = await getTitulosParaBoleto(prepararFiltrosBoleto(nextFilters));
      const listaTitulos = Array.isArray(titulosData) ? titulosData : [];
      setTitulos(listaTitulos);
      setSelecionados((current) => {
        const idsVisiveis = new Set(listaTitulos.map((item) => Number(item.id)));
        return current.filter((id) => idsVisiveis.has(Number(id)));
      });
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao carregar boletos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarBase();
  }, []);

  useEffect(() => {
    if (comercialHabilitado) return;

    setFilters((current) => {
      if (!current.empreendimento_id && current.origem !== 'COMERCIAL') {
        return current;
      }

      return {
        ...current,
        empreendimento_id: '',
        origem: current.origem === 'COMERCIAL' ? 'TODOS' : current.origem
      };
    });
    setAppliedFilters((current) => {
      if (!current) return current;
      return {
        ...current,
        empreendimento_id: '',
        origem: current.origem === 'COMERCIAL' ? 'TODOS' : current.origem
      };
    });
  }, [comercialHabilitado]);

  const resumo = useMemo(() => titulos.reduce((acc, item) => {
    acc.total += 1;
    acc.valor += Number(item.valor_saldo || item.valor_original || 0);
    if (item.codigo_barras) acc.emitidos += 1;
    return acc;
  }, { total: 0, valor: 0, emitidos: 0 }), [titulos]);
  const hasConsulted = Boolean(appliedFilters);
  const titulosSelecionados = useMemo(() => {
    const ids = new Set(selecionados.map(Number));
    return titulos.filter((item) => ids.has(Number(item.id)));
  }, [selecionados, titulos]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function aplicarFiltros(event) {
    event.preventDefault();
    const nextFilters = { ...filters };
    setAppliedFilters(nextFilters);
    setSelecionados([]);
    setResultadoMassa(null);
    limparAvisos();
    carregarTitulos(nextFilters);
  }

  function limparFiltros() {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(null);
    setTitulos([]);
    setSelecionados([]);
    setResultadoMassa(null);
    limparAvisos();
    setLoading(false);
  }

  function atualizarConsulta() {
    if (appliedFilters) {
      carregarTitulos(appliedFilters);
      return;
    }

    carregarBase();
  }

  function toggleSelecionado(tituloId, checked) {
    const id = Number(tituloId);
    setSelecionados((current) => {
      const currentSet = new Set(current.map(Number));
      if (checked) {
        currentSet.add(id);
      } else {
        currentSet.delete(id);
      }
      return Array.from(currentSet);
    });
  }

  async function selecionarTitulo(titulo) {
    try {
      limparAvisos();
      const data = await getBoletoTitulo(titulo.id);
      setDetalhe(data);
      setPreviewOpen(true);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao carregar boleto');
    }
  }

  async function onGerar(titulo) {
    const configIssue = getConfigIssueMessage(config, 'gerar o boleto');
    if (configIssue) {
      // AVISO (alerta): responde ao clique. A CONDIÇÃO que o gerou continua
      // declarada no bloco fixo de estado da integração, que não fecha.
      avisar.alerta(configIssue);
      return;
    }

    try {
      setGerandoId(titulo.id);
      limparAvisos();
      setResultadoMassa(null);
      const data = await gerarBoletoTitulo(titulo.id);
      setDetalhe(data);
      setPreviewOpen(true);
      await carregarTitulos(appliedFilters);
      avisar.sucesso(`Boleto do titulo #${titulo.id} gerado com sucesso.`);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao gerar boleto');
    } finally {
      setGerandoId(null);
    }
  }

  async function onGerarAmostra(titulo) {
    const configIssue = getConfigIssueMessage(config, 'gerar a amostra');
    if (configIssue) {
      avisar.alerta(configIssue);
      return;
    }

    try {
      setGerandoId(titulo.id);
      limparAvisos();
      const data = await gerarAmostraBoletoTitulo(titulo.id);
      setDetalhe(data);
      setPreviewOpen(true);
      // Amostra nao grava nada (nao entra na lista, sem carregarTitulos): o preview que abre ja mostra o resultado.
      avisar.sucesso(`Amostra do titulo #${titulo.id} gerada com sucesso.`, undefined, { efemero: true });
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao gerar amostra de boleto');
    } finally {
      setGerandoId(null);
    }
  }

  async function onBaixarPdf(titulo, { amostra = false } = {}) {
    try {
      setBaixandoPdfId(titulo.id);
      limparAvisos();
      const data = await baixarPdfBoletoTitulo(titulo.id, { amostra });
      const url = URL.createObjectURL(data.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      // Download simples: o navegador ja mostra que baixou, nada foi gravado no sistema.
      avisar.sucesso(`PDF do titulo #${titulo.id} baixado com sucesso.`, undefined, { efemero: true });
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao baixar PDF do boleto');
    } finally {
      setBaixandoPdfId(null);
    }
  }

  async function onGerarMassa() {
    if (!titulosSelecionados.length) {
      avisar.alerta('Selecione ao menos um título para gerar boletos em massa.');
      return;
    }

    const configIssue = getConfigIssueMessage(config);
    if (configIssue) {
      avisar.alerta(configIssue);
      setResultadoMassa(null);
      return;
    }

    try {
      setGerandoMassa(true);
      limparAvisos();
      setResultadoMassa(null);
      let ultimoDetalhe = null;
      const sucessos = [];
      const falhas = [];

      for (const titulo of titulosSelecionados) {
        setGerandoId(titulo.id);
        try {
          ultimoDetalhe = await gerarBoletoTitulo(titulo.id);
          sucessos.push({
            id: titulo.id,
            documento: titulo.numero_documento || ''
          });
        } catch (err) {
          falhas.push({
            id: titulo.id,
            documento: titulo.numero_documento || '',
            motivo: err?.message || 'Erro ao gerar boleto'
          });
        }
      }

      if (ultimoDetalhe) setDetalhe(ultimoDetalhe);
      setSelecionados([]);
      await carregarTitulos(appliedFilters);
      setResultadoMassa({ sucessos, falhas });

      if (sucessos.length) {
        avisar.sucesso(`${sucessos.length} boleto(s) gerado(s) com sucesso.`);
      }
      if (falhas.length) {
        avisar.erro(`${falhas.length} boleto(s) nao foram gerados. Veja os motivos no resumo abaixo.`);
      }
      if (!sucessos.length && !falhas.length) {
        avisar.alerta('Nenhum boleto foi processado.');
      }
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao gerar boletos em massa');
    } finally {
      setGerandoId(null);
      setGerandoMassa(false);
    }
  }

  async function onGerarRemessa() {
    if (!selecionados.length) {
      avisar.alerta('Selecione os títulos com boleto gerado para montar a remessa.');
      return;
    }

    if (!convenioSelecionadoId) {
      avisar.alerta('Cadastre ou selecione um convênio Caixa antes de gerar a remessa.');
      return;
    }

    try {
      setGerandoRemessa(true);
      limparAvisos();
      const data = await gerarBoletoCaixaRemessa({
        convenioId: convenioSelecionadoId,
        tituloIds: selecionados
      });
      const url = URL.createObjectURL(data.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSelecionados([]);
      avisar.sucesso(`Remessa ${data.filename} gerada para homologacao. Hash ${data.hash || '-'}.`);
      await carregarBase();
      await carregarTitulos(appliedFilters);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao gerar remessa Caixa');
    } finally {
      setGerandoRemessa(false);
    }
  }

  async function onImportarRetorno() {
    if (!retornoFile) {
      retornoInputRef.current?.click();
      limparAvisos();
      return;
    }

    if (!convenioSelecionadoId) {
      avisar.alerta('Selecione o convênio Caixa para importar o retorno.');
      return;
    }

    try {
      setImportandoRetorno(true);
      limparAvisos();
      const data = await importarBoletoCaixaRetorno({
        convenioId: convenioSelecionadoId,
        file: retornoFile
      });
      const quantidade = data?.parsed?.ocorrencias?.length || data?.retorno?.quantidade_ocorrencias || 0;
      const baixas = Number(data?.baixas_aplicadas || 0);
      setRetornoFile(null);
      avisar.sucesso(data?.duplicate
        ? 'Retorno ja importado anteriormente. Nenhuma duplicidade foi criada.'
        : `Retorno importado com ${quantidade} ocorrencia(s) e ${baixas} baixa(s) financeira(s) aplicada(s).`);
      await carregarBase();
      await carregarTitulos(appliedFilters);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao importar retorno Caixa');
    } finally {
      setImportandoRetorno(false);
    }
  }

  async function salvarBlob(data) {
    const url = URL.createObjectURL(data.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = data.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function onBaixarRemessa(item) {
    try {
      setBaixandoRemessaId(item.id);
      limparAvisos();
      const data = await baixarBoletoCaixaRemessa(item.id);
      await salvarBlob(data);
      // Hash divergente é ALERTA, não sucesso: o arquivo baixou, mas o
      // conteúdo não confere com o original registrado.
      if (data.hashConfere) {
        avisar.sucesso(`Remessa #${item.numero_remessa} baixada com hash conferido.`);
      } else {
        avisar.alerta(`Remessa #${item.numero_remessa} baixada, mas o hash regenerado difere do original. Confira o relatorio.`);
      }
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao baixar remessa Caixa');
    } finally {
      setBaixandoRemessaId(null);
    }
  }

  async function onBaixarHomologacao(item) {
    try {
      setBaixandoHomologacaoId(item.id);
      limparAvisos();
      const data = await baixarBoletoCaixaHomologacaoCsv(item.id);
      await salvarBlob(data);
      // Download simples, sem checagem de hash: o navegador ja mostra que baixou.
      avisar.sucesso(`Relatorio de homologacao da remessa #${item.numero_remessa} baixado.`, undefined, { efemero: true });
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao baixar relatorio de homologacao Caixa');
    } finally {
      setBaixandoHomologacaoId(null);
    }
  }

  async function onBaixarPacoteHomologacao(item) {
    try {
      setBaixandoPacoteId(item.id);
      limparAvisos();
      const data = await baixarBoletoCaixaHomologacaoPacote(item.id);
      await salvarBlob(data);
      if (data.hashConfere) {
        avisar.sucesso(`Pacote de homologacao da remessa #${item.numero_remessa} baixado com hash conferido.`);
      } else {
        avisar.alerta(`Pacote de homologacao da remessa #${item.numero_remessa} baixado, mas o hash regenerado difere do original.`);
      }
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao baixar pacote de homologacao Caixa');
    } finally {
      setBaixandoPacoteId(null);
    }
  }


  /*
    R23 — EXCEÇÃO DECLARADA (consulta cara), e ela já era o comportamento
    desta tela: a lista só carrega ao clicar em "Consultar". São NOVE
    dimensões de recorte que o usuário combina (título, busca, documento,
    status, empreendimento, cliente, origem e as duas pontas do
    vencimento) — muito acima do teto de 3 requisições da regra, que a
    própria regra traduz como "4+ dimensões que o usuário costuma
    combinar".

    O que faltava era o que a R23 exige da exceção: que ela SE DECLARE na
    tela. Agora as marcas ficam visíveis como etiquetas de RASCUNHO, o
    apoio do bloco avisa que a marca só vale no clique, e o botão diz o que
    faz. Sem isso a etiqueta afirmaria um recorte que a lista ainda não
    tem — a mentira que a F3 descreve, só que mais devagar.
  */
  const filtrosRascunho = useMemo(() => ({
    status_cobranca: new Set(filters.status_cobranca ? [String(filters.status_cobranca)] : []),
    origem: new Set(filters.origem && filters.origem !== 'TODOS' ? [String(filters.origem)] : []),
    empreendimento_id: new Set(filters.empreendimento_id ? [String(filters.empreendimento_id)] : [])
  }), [filters.status_cobranca, filters.origem, filters.empreendimento_id]);

  function alternarFiltroRascunho(dimensao, valor, opcoes) {
    const proximo = alternarValorFiltro(filtrosRascunho, dimensao, valor, opcoes);
    const status = [...(proximo.status_cobranca || [])][0] || '';
    const origem = [...(proximo.origem || [])][0] || 'TODOS';
    const empreendimento = [...(proximo.empreendimento_id || [])][0] || '';
    setFilters((current) => ({
      ...current,
      status_cobranca: status,
      origem,
      // Acoplamento preservado do comportamento anterior: origem MANUAL não
      // combina com empreendimento comercial.
      empreendimento_id: origem === 'MANUAL' ? '' : empreendimento
    }));
  }

  const recorteEmRascunho = Boolean(appliedFilters)
    && JSON.stringify(filters) !== JSON.stringify(appliedFilters);

  const dimensoesRascunho = [
    {
      id: 'status_cobranca',
      rotulo: 'Status cobrança',
      unico: true,
      opcoes: STATUS_OPTIONS.filter((item) => item.value).map((item) => ({ valor: item.value, rotulo: item.label }))
    },
    comercialHabilitado ? {
      id: 'origem',
      rotulo: 'Origem',
      unico: true,
      opcoes: [
        { valor: 'COMERCIAL', rotulo: 'Contratos de venda' },
        { valor: 'MANUAL', rotulo: 'Manual' }
      ]
    } : null,
    comercialHabilitado && filters.origem !== 'MANUAL' ? {
      id: 'empreendimento_id',
      rotulo: 'Empreendimento',
      unico: true,
      opcoes: empreendimentos.map((item) => ({
        valor: String(item.id),
        rotulo: item.codigo ? `${item.codigo} - ${item.nome}` : item.nome
      }))
    } : null
  ].filter(Boolean);

  const condicoesDaIntegracao = [
    config && !config.configurado ? {
      id: 'configuracao',
      titulo: 'Configuração de boletos pendente',
      cor: 'var(--sem-warning)',
      texto: `Configure ${getConfigIssues(config).join(', ')} no backend/.env antes de gerar boletos.`
    } : null,
    config?.modo_teste ? {
      id: 'modo_teste',
      titulo: 'Ambiente de boletos em TESTE',
      cor: 'var(--sem-info)',
      texto: 'A geração e local: não registra nem envia boletos para a Caixa.'
    } : null,
    config?.emissao_real_bloqueada ? {
      id: 'emissao_bloqueada',
      titulo: 'Emissão real bloqueada',
      cor: 'var(--sem-warning)',
      texto: 'Defina CAIXA_BOLETO_HOMOLOGADO=true somente após homologação formal com a Caixa.'
    } : null
  ].filter(Boolean);

  return (
    <Pagina>
      {/* R13/C1/C2/R5 — o cabeçalho era um `.app-page-header` copiado à mão,
          com título fora da escala e o apoio num `page-subtitle` solto (que
          a R5 reprova). Agora é o componente: título em 22px, contagem e
          apoio numa linha na própria faixa, ações com os três pesos.

          R11/C6 — saiu daqui o link "Ver titulos": navegação não é ação, e
          o menu, o breadcrumb e o Ctrl+K já levam à tela de títulos. É a
          mesma remoção que a R11 autoriza pelo exemplo do "⋯" de Parceiros
          e que a FinanceiroTitulos aplicou a quatro links em 03/09. */}
      <PageHeader
        titulo="Geração de boletos"
        /* C2: contagem é número em todos os estados; o "ainda não
           consultei" vive na descrição, que é onde essa informação cabe. */
        contagem={`${hasConsulted ? titulos.length : 0} título(s) no resultado`}
        descricao={`${hasConsulted ? '' : 'Consulta ainda nao executada. '}${comercialHabilitado
          ? 'Emissao Caixa SIGCB a partir dos titulos a receber comerciais ou manuais.'
          : 'Emissao Caixa SIGCB a partir dos titulos a receber manuais.'}`}
        secundarias={[
          {
            rotulo: 'Atualizar',
            onClick: atualizarConsulta,
            icone: <HiOutlineArrowPath className="h-4 w-4" aria-hidden="true" />
          }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      {/*
        CONDIÇÃO, não aviso (fronteira do `Avisos`): configuração pendente,
        ambiente de teste e emissão bloqueada continuam verdadeiras depois
        de qualquer clique — fechá-las esconderia o motivo pelo qual a
        geração vai falhar, e elas voltariam a cada recarga. Ficam como
        bloco fixo no fluxo, ao lado do que descrevem.
      */}
      {condicoesDaIntegracao.map((condicao) => (
        <BlocoConteudo key={condicao.id} titulo={condicao.titulo} variante="primario" cor={condicao.cor}>
          <p className="text-sm text-[var(--c-muted)]">{condicao.texto}</p>
        </BlocoConteudo>
      ))}

      <BlocoConteudo
        titulo="Remessa e retorno Caixa"
        contagem={`${remessasCaixa.length} remessa(s) · ${retornosCaixa.length} retorno(s)`}
        descricao="Use depois de gerar os boletos e antes da homologação na agência."
        variante="secundario"
        recolhivel
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--ui-surface-soft)] p-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <label className="sol-filter-field">
                <span className="sol-filter-label">Convênio Caixa</span>
                {/* R12: seletor de CONTEXTO — escolhe SOB QUAL convênio a
                    remessa é montada, e o arquivo herda a escolha. A regra
                    declara esse uso legítimo; não é filtro de lista. */}
                <select
                  className="input w-full"
                  value={convenioSelecionadoId}
                  onChange={(event) => setConvenioSelecionadoId(event.target.value)}
                  disabled={loadingOptions || gerandoRemessa || importandoRetorno}
                >
                  <option value="">Selecione</option>
                  {conveniosCaixa.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.beneficiario_nome} - {item.codigo_beneficiario}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onGerarRemessa}
                disabled={!selecionados.length || !convenioSelecionadoId || gerandoRemessa}
                title="Gerar arquivo de remessa CNAB 240"
              >
                {gerandoRemessa ? 'Gerando...' : `Gerar remessa (${selecionados.length})`}
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--c-muted)]">
              A remessa usa os títulos selecionados na tabela. Gere o boleto antes de montar o arquivo CNAB.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--ui-surface-soft)] p-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <label className="sol-filter-field">
                <span className="sol-filter-label">Retorno Caixa</span>
                <input
                  ref={retornoInputRef}
                  className="sr-only"
                  type="file"
                  accept=".ret,.crt,.rem,.cnab,.txt"
                  onChange={(event) => setRetornoFile(event.target.files?.[0] || null)}
                  disabled={!convenioSelecionadoId || importandoRetorno}
                />
                <button
                  type="button"
                  className="input flex w-full items-center justify-between text-left"
                  onClick={() => retornoInputRef.current?.click()}
                  disabled={!convenioSelecionadoId || importandoRetorno}
                >
                  <span className={retornoFile ? 'text-[var(--c-text)]' : 'text-[var(--c-muted)]'}>
                    {retornoFile ? retornoFile.name : 'Selecionar arquivo de retorno'}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--c-muted)]">
                    Buscar
                  </span>
                </button>
              </label>
              <button
                type="button"
                className="btn btn-outline"
                onClick={onImportarRetorno}
                disabled={!convenioSelecionadoId || importandoRetorno}
                title="Importar arquivo de retorno CNAB 240"
              >
                {importandoRetorno ? 'Importando...' : retornoFile ? 'Importar retorno' : 'Selecionar retorno'}
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--c-muted)]">
              Liquidacoes do retorno baixam os títulos vinculados de forma idempotente, sem duplicar movimentos já aplicados.
            </p>
          </div>
        </div>

        {remessasCaixa.length > 0 && (
          <div className="mt-4">
            <TabelaPadrao
              colunas={[
                { id: 'numero', titulo: 'Últimas remessas', tipo: 'codigo', render: (item) => <strong>#{item.numero_remessa}</strong> },
                {
                  id: 'arquivo',
                  titulo: 'Arquivo',
                  // R17: o nome do arquivo NOMEIA a remessa.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.nome_arquivo
                },
                { id: 'boletos', titulo: 'Boletos', tipo: 'numero', render: (item) => item.quantidade_boletos },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatCurrency(item.valor_total) },
                { id: 'status', titulo: 'Status', tipo: 'status', render: (item) => <span className="badge badge-muted">{item.status}</span> }
              ]}
              itens={remessasCaixa.slice(0, 5)}
              storageKey="tabela:financeiro-boletos:remessas"
              rotuloRolagem="Ultimas remessas de cobranca"
              larguraAcoes={260}
              acoesLinha={(item) => (
                <>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => onBaixarRemessa(item)}
                    title="Baixar o arquivo de remessa CNAB"
                    disabled={baixandoRemessaId === item.id || baixandoHomologacaoId === item.id || baixandoPacoteId === item.id}
                  >
                    {baixandoRemessaId === item.id ? 'REM...' : 'REM'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => onBaixarHomologacao(item)}
                    title="Baixar o relatório de homologação em CSV"
                    disabled={baixandoRemessaId === item.id || baixandoHomologacaoId === item.id || baixandoPacoteId === item.id}
                  >
                    {baixandoHomologacaoId === item.id ? 'CSV...' : 'CSV'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onBaixarPacoteHomologacao(item)}
                    title="Baixar o pacote completo de homologação"
                    disabled={baixandoRemessaId === item.id || baixandoHomologacaoId === item.id || baixandoPacoteId === item.id}
                  >
                    {baixandoPacoteId === item.id ? 'ZIP...' : 'ZIP'}
                  </button>
                </>
              )}
            />
          </div>
        )}
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Consulta de títulos elegíveis"
        variante="secundario"
        descricao={recorteEmRascunho
          ? 'As marcas abaixo sao RASCUNHO: a lista so muda quando voce clicar em Consultar.'
          : 'A lista abaixo atualiza somente ao consultar — marcar um filtro nao recarrega sozinho.'}
      >
        <form onSubmit={aplicarFiltros}>
          {/*
            R12/F1/F3 — os recortes ENUMERÁVEIS (status, origem,
            empreendimento) saíram do `select` de escolha única e viraram
            marcação com etiqueta removível: com select o estado do filtro
            é invisível; com marcação ele é legível de imediato.

            Cada um vira UM parâmetro do serviço, então os três são
            `unico` (marca redonda — a forma diz que só cabe uma). Título,
            documento e as duas pontas do vencimento são CONTÍNUOS, não
            enumeráveis: ficam em `campos`, o espaço que a BarraFiltros
            declara para eles. O cliente continua no autocomplete, que é a
            forma certa para uma lista de centenas de parceiros — marcação
            ali seria um menu impossível de ler.
          */}
          <BarraFiltros
            busca={visibilidadeFiltros.ehVisivel('q') ? {
              valor: filters.q,
              aoMudar: (valor) => updateFilter('q', valor),
              placeholder: 'Cliente, obra, documento, nosso número ou linha digitável'
            } : null}
            campos={[
              { id: 'codigo', rotulo: 'Título', tipo: 'text', valor: filters.codigo, aoMudar: (valor) => updateFilter('codigo', valor) },
              { id: 'numero_documento', rotulo: 'N. documento', tipo: 'text', valor: filters.numero_documento, aoMudar: (valor) => updateFilter('numero_documento', valor) },
              { id: 'vencimento_inicial', rotulo: 'Vencimento início', tipo: 'date', valor: filters.vencimento_inicial, aoMudar: (valor) => updateFilter('vencimento_inicial', valor) },
              { id: 'vencimento_final', rotulo: 'Vencimento fim', tipo: 'date', valor: filters.vencimento_final, aoMudar: (valor) => updateFilter('vencimento_final', valor) }
            ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
            filtros={dimensoesRascunho.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
            ativos={filtrosRascunho}
            aoAlternar={alternarFiltroRascunho}
            aoLimpar={() => setFilters((current) => ({
              ...current,
              status_cobranca: '',
              origem: 'TODOS',
              empreendimento_id: ''
            }))}
            /* Só as marcas: o recorte inteiro (com busca, datas e resultado)
               é do botão "Limpar consulta", abaixo. */
            visibilidade={visibilidadeFiltros}
          />

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <ParceiroAutocomplete
              className="sol-filter-field"
              label="Cliente"
              value={filters.parceiro_id}
              options={clientes}
              onChange={(nextValue) => updateFilter('parceiro_id', nextValue)}
              disabled={loadingOptions}
              placeholder="Digite o cliente"
              emptyLabel="Nenhum cliente encontrado"
            />
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-[var(--c-border)] pt-3 md:flex-row md:items-center md:justify-between">
            {/* B3 — a contagem do resultado já está na faixa fixa e no
                ladrilho; aqui o apoio fala só do ESTADO da consulta, que é
                informação diferente. */}
            <div className="text-xs text-[var(--c-muted)]">
              {hasConsulted
                ? (recorteEmRascunho ? 'Ha marcas em rascunho: clique em Consultar para aplica-las.' : 'A lista abaixo reflete a ultima consulta.')
                : 'A tabela fica vazia ate voce consultar.'}
            </div>
            {/* D3/C5: dois pesos visíveis — "Consultar" é a primária sólida
                (é ela que faz a marca valer), "Limpar" a secundária. */}
            <div className="flex flex-wrap gap-2">
              {/* R16 — dois limpadores com escopos DIFERENTES, cada um
                  rotulado pelo que faz: o "Limpar tudo" da faixa de
                  etiquetas tira as MARCAS; este devolve a tela ao estado
                  inicial e esvazia o resultado já consultado. Rótulo igual
                  para escopos diferentes é que seria defeito. */}
              <button type="button" className="btn btn-outline btn-sm" onClick={limparFiltros}>
                Limpar consulta
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={loadingOptions}>
                Consultar
              </button>
            </div>
          </div>
        </form>
      </BlocoConteudo>

      {/* M2/R10: o ladrilho do sistema no lugar dos quatro números com
          escala escrita na tela. Os rótulos dizem que o número é do
          RESULTADO consultado, não da carteira inteira — `resumo` soma
          `titulos`, que é o que a consulta trouxe. */}
      <StatGrid colunas={4}>
        <StatTile label="Títulos no resultado" valor={String(resumo.total)} />
        <StatTile label="Valor em aberto no resultado" valor={formatCurrency(resumo.valor)} />
        <StatTile label="Já emitidos no resultado" valor={String(resumo.emitidos)} />
        <StatTile label="Ambiente" valor={config?.ambiente || 'TESTE'} />
      </StatGrid>

      <BlocoConteudo
        titulo="Títulos para boleto"
        contagem={`${titulosSelecionados.length} selecionado(s) de ${titulos.length}`}
        descricao={!hasConsulted
          ? 'Aplique um filtro para carregar os boletos elegiveis.'
          : comercialHabilitado
            ? 'Contas a receber comerciais ou manuais com saldo em aberto.'
            : 'Contas a receber manuais com saldo em aberto.'}
      >
        {resultadoMassa && (
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <div className="tarja tarja--success rounded-2xl border border-[var(--c-border)] bg-[var(--ui-surface-soft)] p-3 text-sm">
              <div className="font-semibold text-[var(--sem-success)]">Gerados: {resultadoMassa.sucessos.length}</div>
              {resultadoMassa.sucessos.length ? (
                <ul className="mt-2 space-y-1">
                  {resultadoMassa.sucessos.slice(0, 8).map((item) => (
                    <li key={item.id}>Titulo #{item.id}{item.documento ? ` - ${item.documento}` : ''}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2">Nenhum boleto gerado neste lote.</p>
              )}
            </div>
            <div className="tarja tarja--danger rounded-2xl border border-[var(--c-border)] bg-[var(--ui-surface-soft)] p-3 text-sm">
              <div className="font-semibold text-[var(--sem-danger)]">Nao gerados: {resultadoMassa.falhas.length}</div>
              {resultadoMassa.falhas.length ? (
                <ul className="mt-2 space-y-1">
                  {resultadoMassa.falhas.map((item) => (
                    <li key={item.id}>Titulo #{item.id}{item.documento ? ` - ${item.documento}` : ''}: {item.motivo}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2">Sem falhas neste lote.</p>
              )}
            </div>
          </div>
        )}

        {!hasConsulted ? (
          <div className="app-empty-card">
            Nenhum filtro aplicado. Use os filtros acima e clique em Consultar para listar os boletos.
          </div>
        ) : (
          <TabelaPadrao
            colunas={[
              {
                id: 'titulo',
                titulo: 'Título',
                tipo: 'codigo',
                render: (titulo) => (
                  <div>
                    <Link className="font-semibold text-[var(--c-primary)] hover:underline" to={`/financeiro/titulos/${titulo.id}`}>
                      {titulo.codigo || `#${titulo.id}`} {titulo.numero_documento ? `- ${titulo.numero_documento}` : ''}
                    </Link>
                    <p className="mt-1 text-xs text-[var(--c-muted)]">{titulo.descricao}</p>
                  </div>
                )
              },
              {
                id: 'cliente',
                titulo: 'Cliente',
                // R17: o cliente NOMEIA o titulo a cobrar.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (titulo) => titulo.parceiro?.nome || '-'
              },
              ...(comercialHabilitado ? [
                {
                  id: 'origem',
                  titulo: 'Origem',
                  tipo: 'badge',
                  render: (titulo) => (titulo.parcelasComerciais?.length ? 'Comercial' : 'Manual')
                },
                {
                  id: 'empreendimento',
                  titulo: 'Empreendimento',
                  tipo: 'texto',
                  render: (titulo) => titulo.parcelasComerciais?.[0]?.contrato?.empreendimento?.nome || '-'
                }
              ] : []),
              { id: 'vencimento', titulo: 'Vencimento', tipo: 'data', render: (titulo) => formatDate(titulo.data_vencimento) },
              { id: 'saldo', titulo: 'Saldo', tipo: 'valor', render: (titulo) => formatCurrency(titulo.valor_saldo) },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: (titulo) => (
                  <span className="badge badge-muted">
                    {titulo.status_cobranca || 'NAO_APLICAVEL'}
                  </span>
                )
              },
              {
                id: 'boleto',
                titulo: 'Boleto',
                tipo: 'texto',
                render: (titulo) => (
                  <div className="text-xs text-[var(--c-muted)]">
                    <div>{titulo.nosso_numero ? `Nosso numero: ${titulo.nosso_numero}` : 'Nao emitido'}</div>
                    {titulo.codigo_barras && <div className="mt-1 text-[var(--sem-success)]">Código gerado</div>}
                  </div>
                )
              }
            ]}
            itens={titulos}
            /*
              `getId` NORMALIZA o id para número, e isso é o que faz a
              seleção funcionar: o componente marca a linha com
              `selecionados.has(getId(item))`, sem converter nada. O resto
              desta tela sempre comparou com `Number(...)`; se o serviço
              devolver `id` como string, um Set de números nunca casaria com
              a chave string e o checkbox jamais apareceria marcado — com o
              lote seguindo vazio, calado.
            */
            getId={(titulo) => Number(titulo.id)}
            carregando={loading}
            vazio="Nenhum título elegível encontrado para os filtros aplicados."
            storageKey="tabela:financeiro-boletos:titulos"
            rotuloRolagem="Titulos elegiveis para boleto"
            larguraAcoes={320}
            /*
              R16b — a seleção em lote é do componente. A coluna de checkbox
              desenhada à mão e a barra "Selecionar todos" acima da tabela
              eram DOIS donos da mesma responsabilidade (R16); a marca do
              cabeçalho, com o estado indeterminado, é a mesma capacidade,
              declarada uma vez só.
            */
            selecao={{
              selecionados: selecionados.map(Number),
              aoAlternar: (id) => toggleSelecionado(id, !selecionados.map(Number).includes(Number(id))),
              aoAlternarTodos: (marcar, ids) => setSelecionados(marcar ? ids.map(Number) : [])
            }}
            acoesTabela={(
              <>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelecionados([])} disabled={!selecionados.length || gerandoMassa}>
                  Limpar seleção
                </button>
                {/*
                  CONSENTIMENTO: o número deste rótulo vem de
                  `titulosSelecionados` — a MESMA coleção que `onGerarMassa`
                  percorre no `for`. Antes o botão contava `selecionados`
                  (ids crus) e a ação percorria `titulosSelecionados` (ids
                  cruzados com a página carregada): dois conjuntos com nomes
                  diferentes, e nada garantia que fossem o mesmo número.
                */}
                <button type="button" className="btn btn-primary btn-sm" onClick={onGerarMassa} disabled={!titulosSelecionados.length || gerandoMassa}>
                  {gerandoMassa ? 'Gerando boletos...' : `Gerar boletos selecionados (${titulosSelecionados.length})`}
                </button>
              </>
            )}
            acoesLinha={(titulo) => (
              <>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => selecionarTitulo(titulo)}
                  title="Visualizar boleto"
                  aria-label={`Visualizar boleto do título ${titulo.id}`}
                >
                  <HiOutlineEye className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={gerandoId === titulo.id || gerandoMassa}
                  onClick={() => onGerarAmostra(titulo)}
                  title="Gerar amostra para homologação"
                >
                  Amostra
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={baixandoPdfId === titulo.id || gerandoMassa}
                  onClick={() => onBaixarPdf(titulo, { amostra: !titulo.codigo_barras })}
                  title={titulo.codigo_barras ? 'Baixar PDF do boleto' : 'Baixar PDF de amostra'}
                >
                  {baixandoPdfId === titulo.id ? 'PDF...' : 'PDF'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={gerandoId === titulo.id || gerandoMassa}
                  onClick={() => onGerar(titulo)}
                >
                  {gerandoId === titulo.id ? 'Gerando...' : (titulo.codigo_barras ? 'Regerar' : 'Gerar')}
                </button>
              </>
            )}
          />
        )}
      </BlocoConteudo>

      {/* R18: a casca do sistema no lugar do overlay à mão. O painel recorta
          com `clip`, nunca `hidden` — o `overflow-hidden` que estava aqui
          era ancestral do conteúdo rolável da pré-visualização. */}
      {previewOpen && (
        <OverlayModal
          rotulo="Pre-visualização do boleto"
          largura="var(--modal-max-w-xl, 1080px)"
          onFechar={() => setPreviewOpen(false)}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--c-border)] p-4">
            <div>
              <p className="app-confirmacao-titulo">Pre-visualização do boleto</p>
              <p className="text-xs text-[var(--c-muted)]">A amostra deve ser homologada pela Caixa antes do uso em massa.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-outline btn-sm" disabled={!detalhe?.boleto?.codigo_barras} onClick={() => window.print()}>
                Imprimir
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setPreviewOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
          {/* O painel recorta com `clip` (R18): quem rola é o corpo — e a
              ficha inteira precisa caber na leitura antes de imprimir. */}
          <div className="boleto-preview-fundo min-h-0 overflow-y-auto p-4">
            {detalhe ? (
              <BoletoPrintView detalhe={detalhe} />
            ) : (
              <div className="app-empty-card">Selecione ou gere um boleto para visualizar.</div>
            )}
          </div>
        </OverlayModal>
      )}
    </Pagina>
  );
}
