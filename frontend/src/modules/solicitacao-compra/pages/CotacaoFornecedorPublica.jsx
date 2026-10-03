import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  CamposComVazios,
  FormSecao,
  Pagina,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import {
  obterCotacaoPublica,
  responderCotacaoPublica,
  salvarRascunhoCotacaoPublica,
  uploadArquivosCotacaoPublica
} from '../../../services/compras';
import { getCpfCnpjError, maskCpfCnpj, onlyDigits } from '../../../utils/formatters';
import DateInputBR from '../../../components/DateInputBR';

/*
  COTAÇÃO PÚBLICA DO FORNECEDOR — a única tela do sistema usada por alguém de
  FORA da empresa. Chega por link com token: sem conta, sem topbar, sem menu,
  sem breadcrumb. Para o fornecedor, esta página É a empresa.

  DoD própria (docs/DEFINICAO-DE-PRONTO.md, "TELAS FORA DO SHELL", 03/09):
  - N/A aqui: C1/C2 (não há topbar para a faixa grudar), C3 (não há detalhe
    nem hierarquia de retorno), X2, F1–F4 (não há listagem com recorte). O
    título CONTINUA no degrau de 22px — sai só a exigência de grudar, e por
    isso a tela usa `Pagina` + `.page-title` em vez de `PageHeader`.
  - Vale sem desconto: M1–M4, R1–R3, B1–B5, X1, X3, R18, A1 e T1–T7.
  - Exigência que só existe aqui: erro de rede, token inválido e link vencido
    precisam dizer O QUE FAZER. Não há menu, não há login, não há para onde
    escapar — "Erro ao carregar" numa página em branco faz o fornecedor
    desistir e trava o processo de compra do outro lado.

  R3/R19 (03/09): esta tela tinha 14 caixas do navegador (`alert`). Nenhuma
  sobrou. Evento virou `useAvisos`; condição derivada do conteúdo (link
  morto, cotação encerrada, resposta já enviada) NÃO é evento e não vira
  aviso dispensável — vira estado/faixa fixa no fluxo, ao lado do que ela
  descreve. A pergunta que separa: fecha e o problema continua?
*/

function formatarData(data) {
  if (!data) return '-';
  const raw = String(data);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) return '-';
  return valor.toLocaleDateString('pt-BR');
}

function contarCasasDecimaisSignificativas(valor, limite = 2) {
  const texto = String(valor ?? '').trim();
  const parteDecimal = texto.split(/[,.]/)[1] || '';
  return Math.min(parteDecimal.length, limite);
}

function normalizarDecimalEditavel(valor, limiteDecimais = 2) {
  if (valor === '' || valor === null || valor === undefined) return '';
  const texto = String(valor).trim().replace('.', ',');
  const [inteiroRaw = '', decimalRaw = ''] = texto.split(',');
  const inteiro = inteiroRaw.replace(/\D/g, '');
  const decimal = decimalRaw.replace(/\D/g, '').slice(0, limiteDecimais);
  if (texto.includes(',')) return `${inteiro || '0'},${decimal}`;
  return decimal ? `${inteiro || '0'},${decimal}` : inteiro;
}

function normalizarDecimalDaApi(valor, limiteDecimais = 10) {
  const editavel = normalizarDecimalEditavel(valor, limiteDecimais);
  if (!editavel.includes(',')) return editavel;
  const [inteiro, decimal] = editavel.split(',');
  const decimalSemZerosArtificiais = decimal.replace(/0+$/, '');
  return decimalSemZerosArtificiais ? `${inteiro},${decimalSemZerosArtificiais}` : inteiro;
}

function sanitizarDecimalInput(valor, limiteDecimais = 2) {
  let raw = String(valor || '').replace(/[^\d.,]/g, '').replace(/\./g, ',');
  const partes = raw.split(',');
  const inteiro = partes.shift().replace(/\D/g, '');
  const decimal = partes.join('').replace(/\D/g, '').slice(0, limiteDecimais);
  if (raw.includes(',')) return `${inteiro || '0'},${decimal}`;
  return inteiro;
}

function formatarMoeda(valor, { casasDecimaisMaximas = 2, preservarEscala = false } = {}) {
  if (valor === '' || valor === null || valor === undefined) return '';
  const num = parseFloat(String(valor).replace(',', '.'));
  if (isNaN(num)) return valor;
  const casas = preservarEscala
    ? contarCasasDecimaisSignificativas(valor, casasDecimaisMaximas)
    : casasDecimaisMaximas;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  }).format(num);
}

function numeroCotacao(valor) {
  const raw = String(valor ?? '').trim().replace(/[^\d,.-]/g, '');
  const parsed = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calcularTotalItemCotacao(item, incluirFrete = false) {
  return (
    numeroCotacao(item?.preco) * numeroCotacao(item?.quantidade)
    + numeroCotacao(item?.ipi_valor)
    + numeroCotacao(item?.icms_valor)
    + numeroCotacao(item?.st_valor)
    + (incluirFrete ? numeroCotacao(item?.frete_valor) : 0)
  );
}

/* ---------------------------------------------------------------------------
   CAMINHOS DE ERRO — a exigência extra desta tela.

   O fornecedor não tem menu, login nem suporte dentro do produto. O único
   canal que ele com certeza possui é o e-mail que trouxe o link. Então todo
   texto de erro diz: (1) o que aconteceu, em português de gente; (2) o que
   fazer AGORA; (3) o caminho de saída quando nada resolve.

   A classificação é pelo `status` que o `handleJsonResponse` anexa ao erro.
   `fetch` que nem chega ao servidor (offline, DNS, proxy da obra) lança sem
   `status` — é o caso de REDE, e não pode ser confundido com link inválido:
   mandar o fornecedor pedir um link novo quando o problema é o 4G dele é
   perder dois dias do processo de compra.
--------------------------------------------------------------------------- */
const ERRO_REDE = 'REDE';
const ERRO_LINK = 'LINK';
const ERRO_SERVIDOR = 'SERVIDOR';

function classificarErroDeCarregamento(erro) {
  const status = Number(erro?.status);
  if (!Number.isFinite(status) || status === 0) return ERRO_REDE;
  if (status === 404 || status === 400 || status === 401 || status === 403 || status === 410) {
    return ERRO_LINK;
  }
  return ERRO_SERVIDOR;
}

const TEXTOS_ERRO_CARREGAMENTO = {
  [ERRO_REDE]: {
    titulo: 'Não conseguimos carregar esta cotação',
    resumo: 'O navegador não chegou a falar com o servidor. Quase sempre é a conexão deste computador ou celular, não o seu link.',
    passos: [
      'Confira se você está conectado à internet e clique em "Tentar de novo" abaixo.',
      'Se estiver em rede de obra ou 4G instável, espere alguns minutos e tente de novo, ou abra o mesmo link em outra conexão.',
      'Se não abrir de jeito nenhum, responda o e-mail em que você recebeu este link contando o que aparece nesta tela e o horário — enquanto o link não abre, o prazo não corre contra você.'
    ]
  },
  [ERRO_LINK]: {
    titulo: 'Este link não abre mais uma cotação em aberto',
    resumo: 'O endereço que você abriu não corresponde a nenhuma cotação aceitando resposta. Isso acontece em três casos: o link foi copiado pela metade, a cotação já foi encerrada, ou o prazo de resposta venceu e o link foi fechado.',
    passos: [
      'Volte ao e-mail e abra o link CLICANDO nele, em vez de copiar e colar: quando o programa de e-mail quebra a linha, metade do endereço fica para trás e o link deixa de valer.',
      'Se você já tinha enviado sua proposta, ela está registrada — não é preciso reenviar nada.',
      'Se ainda precisa responder, responda o e-mail em que recebeu este link pedindo um link novo e informe o nome da obra que aparecia no convite. A equipe de compras consegue reabrir o prazo.'
    ]
  },
  [ERRO_SERVIDOR]: {
    titulo: 'A cotação não abriu por uma falha do nosso lado',
    resumo: 'O servidor recebeu seu pedido e não conseguiu montar a página. O problema não é do seu computador nem do seu link.',
    passos: [
      'Clique em "Tentar de novo" abaixo — falhas assim costumam durar poucos minutos.',
      'Se continuar, responda o e-mail em que recebeu este link informando o horário da tentativa e o detalhe técnico mostrado abaixo.',
      'Não é preciso procurar outro caminho: sem esta página, ninguém consegue registrar sua proposta, e a equipe de compras reabre o prazo assim que souber.'
    ]
  }
};

/**
 * Mensagem de falha de GRAVAÇÃO (rascunho, envio, anexo). Mesma disciplina do
 * carregamento: diz o que fazer, e garante ao fornecedor que o que ele digitou
 * continua na tela — o medo de perder o preenchimento é o que faz a pessoa
 * abandonar o formulário.
 */
function mensagemDeFalha(erro, oQueFalhou) {
  const status = Number(erro?.status);
  const detalhe = String(erro?.message || '').trim();

  if (!Number.isFinite(status) || status === 0) {
    return `${oQueFalhou} porque o navegador não conseguiu falar com o servidor. Confira sua conexão e clique de novo — nada do que você preencheu nesta página foi perdido.`;
  }
  if (status === 404 || status === 410) {
    return `${oQueFalhou}: este link não corresponde mais a uma cotação em aberto. NÃO feche esta página — responda o e-mail em que recebeu o link pedindo a reabertura, e depois volte aqui para enviar o que já está preenchido.`;
  }
  if (status >= 500) {
    return `${oQueFalhou} por uma falha do nosso servidor${detalhe ? ` (${detalhe})` : ''}. Tente de novo em alguns minutos; se continuar, responda o e-mail em que recebeu este link informando o horário da tentativa. O que você preencheu continua na tela.`;
  }
  return `${oQueFalhou}: ${detalhe || 'o servidor recusou os dados enviados.'} Ajuste o que a mensagem aponta e tente de novo. Se não estiver claro o que corrigir, responda o e-mail em que recebeu este link com esta mensagem.`;
}

function CurrencyInput({
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
  casasDecimais = 2,
  preservarEscala = false,
  zeroComoVazio = false
}) {
  const [focused, setFocused] = useState(false);

  function handleChange(e) {
    onChange(sanitizarDecimalInput(e.target.value, casasDecimais));
  }

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={
        focused
          ? (zeroComoVazio && Number(String(value || '0').replace(',', '.')) === 0
              ? ''
              : normalizarDecimalEditavel(value, casasDecimais))
          : formatarMoeda(value, { casasDecimaisMaximas: casasDecimais, preservarEscala })
      }
      disabled={disabled}
      placeholder={focused ? '0,00' : 'R$ 0,00'}
      onFocus={(event) => {
        setFocused(true);
        window.requestAnimationFrame(() => event.target.select());
      }}
      onBlur={() => setFocused(false)}
      onChange={handleChange}
    />
  );
}

const FORMAS_PAGAMENTO = [
  { value: 'PIX', label: 'PIX' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'TRANSFERENCIA', label: 'Transferência' },
  { value: 'CARTAO', label: 'Cartão' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'FATURADO', label: 'Faturado' },
  { value: 'OUTROS', label: 'Outros' }
];

const FORMAS_PAGAMENTO_EXIGEM_PRAZO_DEFAULT = ['BOLETO', 'CARTAO', 'CHEQUE', 'FATURADO', 'OUTROS'];

function obterFormasPagamentoExigemPrazo(configuracoes) {
  return Array.isArray(configuracoes?.condicoes_pagamento_exigem_prazo)
    ? configuracoes.condicoes_pagamento_exigem_prazo
    : FORMAS_PAGAMENTO_EXIGEM_PRAZO_DEFAULT;
}

function formaPagamentoExigePrazo(tipo, configuracoes) {
  return obterFormasPagamentoExigemPrazo(configuracoes).includes(tipo);
}

function criarCondicoesPagamentoVazias() {
  return Object.fromEntries(
    FORMAS_PAGAMENTO.map((opcao) => [opcao.value, { selecionado: false, prazo: '' }])
  );
}

function parseCondicoesPagamento(valor) {
  const condicoes = criarCondicoesPagamentoVazias();
  const texto = String(valor || '').trim();
  if (!texto) return condicoes;

  let encontrouOpcao = false;
  FORMAS_PAGAMENTO.forEach((opcao) => {
    const escapedLabel = opcao.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = texto.match(new RegExp(`${escapedLabel}\\s*[:\\-]\\s*([^;]+)`, 'i'));
    if (match) {
      condicoes[opcao.value] = { selecionado: true, prazo: match[1].trim() };
      encontrouOpcao = true;
    } else {
      const hasLabel = texto
        .split(';')
        .some((parte) => parte.trim().toLowerCase() === opcao.label.toLowerCase());
      if (hasLabel) {
        condicoes[opcao.value] = { selecionado: true, prazo: '' };
        encontrouOpcao = true;
      }
    }
  });

  if (!encontrouOpcao) {
    condicoes.OUTROS = { selecionado: true, prazo: texto };
  }

  return condicoes;
}

function montarCondicaoPagamento(condicoes) {
  return FORMAS_PAGAMENTO
    .filter((opcao) => condicoes?.[opcao.value]?.selecionado)
    .map((opcao) => {
      const prazo = String(condicoes[opcao.value]?.prazo || '').trim();
      return prazo ? `${opcao.label}: ${prazo}` : opcao.label;
    })
    .join('; ');
}

/**
 * CONDIÇÃO (não é aviso). Descreve o ESTADO do que está na tela: cotação
 * encerrada, cancelada, resposta já enviada. Fechável seria mentira — fecha e
 * o problema continua —, então mora no fluxo, dentro do bloco a que se
 * refere, com superfície própria (B5) e cor por token (M2/M3).
 */
function Condicao({ tom = 'warning', children }) {
  const cor = tom === 'info' ? 'var(--sem-info)' : 'var(--sem-warning)';
  const fundo = tom === 'info' ? 'var(--sem-info-bg)' : 'var(--sem-warning-bg)';
  return (
    <p
      className="rounded-xl border p-3 text-sm"
      style={{
        background: fundo,
        color: cor,
        borderColor: cor,
        marginBlock: 0,
        lineHeight: 'var(--lh-corpo)'
      }}
    >
      {children}
    </p>
  );
}

function AttachmentPreview({ item }) {
  if (!item?.arquivo_url) {
    return null;
  }

  const label = item.arquivo_nome_original || 'Abrir anexo';

  if (item.arquivo_is_image) {
    return (
      <a
        href={item.arquivo_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block shrink-0"
        title={label}
      >
        <img
          src={item.arquivo_url}
          alt={label}
          className="h-12 w-12 rounded-lg border object-cover"
          style={{ borderColor: 'var(--c-border)', background: 'var(--ui-surface-2)' }}
        />
      </a>
    );
  }

  return (
    <a
      href={item.arquivo_url}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-outline btn-sm shrink-0"
      title={label}
    >
      Ver anexo
    </a>
  );
}

/**
 * Moldura da página pública. Fora do shell não existe topbar, então o título
 * NÃO gruda (C1/C2 são N/A) — mas continua no degrau de 22px, que é o que o
 * `Pagina` aplica em `.app-pagina > .page-title`. O ritmo entre blocos é do
 * componente, nunca da tela (R10).
 */
function MolduraPublica({ avisos, aoFecharAviso, children }) {
  return (
    <div className="cotacao-publica-page min-h-screen px-3 py-4">
      <Pagina className="cotacao-publica-shell">
        <h1 className="page-title">Resposta de cotação</h1>
        {/*
          LACUNA DO PADRÃO, registrada no relatório: as regras de `.alert`
          (a superfície que o `Avisos` desenha) só existem sob `.layout-shell`
          e `.login-card` no index.css. Esta tela renderiza fora do Layout, e
          sem esse escopo a faixa sairia sem cor, sem respiro e sem raio — o
          aviso existiria no DOM e quase não existiria para o fornecedor
          (R15: capacidade sem sinal não existe). A classe entra AQUI, num
          invólucro que contém só a pilha de avisos, porque corrigir o escopo
          é mexer em CSS de sistema — fora do meu arquivo nesta leva.
        */}
        <div className="layout-shell">
          <Avisos avisos={avisos} aoFechar={aoFecharAviso} />
        </div>
        {children}
      </Pagina>
    </div>
  );
}

export default function CotacaoFornecedorPublica() {
  const { token } = useParams();
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [dados, setDados] = useState(null);
  const [itens, setItens] = useState([]);
  // Começa em `true`: com `false`, o primeiro quadro (antes de o efeito rodar)
  // pintava "Cotação não encontrada" para todo fornecedor que abre o link.
  const [loading, setLoading] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState(null);
  const [detalheTecnico, setDetalheTecnico] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvandoRascunho, setSalvandoRascunho] = useState(false);
  const [enviandoPlanilha, setEnviandoPlanilha] = useState(false);
  const [valorMinimoPedido, setValorMinimoPedido] = useState('');
  const [descontoTotal, setDescontoTotal] = useState('');
  const [condicoesPagamento, setCondicoesPagamento] = useState(() => criarCondicoesPagamentoVazias());
  const [prazoEntregaDias, setPrazoEntregaDias] = useState('');
  const [prazoEntregaTipo, setPrazoEntregaTipo] = useState('DIAS_CORRIDOS');
  const [difalValor, setDifalValor] = useState('');
  const [freteTipo, setFreteTipo] = useState('SEM_FRETE');
  const [freteModo, setFreteModo] = useState('GLOBAL');
  const [freteValor, setFreteValor] = useState('');
  const [freteDataVencimento, setFreteDataVencimento] = useState('');
  const [freteTransportadorNome, setFreteTransportadorNome] = useState('');
  const [freteTransportadorCpfCnpj, setFreteTransportadorCpfCnpj] = useState('');
  const [observacaoResposta, setObservacaoResposta] = useState('');

  async function carregar() {
    try {
      setLoading(true);
      setErroCarregamento(null);
      setDetalheTecnico('');
      const data = await obterCotacaoPublica(token);
      if (!data) {
        // 200 sem corpo: para o fornecedor é o mesmo que link morto.
        setDados(null);
        setErroCarregamento(ERRO_LINK);
        return;
      }
      setDados(data);
      setItens(
        Array.isArray(data?.itens)
            ? data.itens.map((item) => ({
                ...item,
                preco: normalizarDecimalDaApi(item.preco, 10),
                quantidade_disponivel: normalizarDecimalDaApi(
                  item.quantidade_disponivel ?? (item.disponivel ? item.quantidade : ''),
                  3
                ),
                ipi_valor: normalizarDecimalDaApi(item.ipi_valor, 2),
                icms_valor: normalizarDecimalDaApi(item.icms_valor, 2),
                st_valor: normalizarDecimalDaApi(item.st_valor, 2),
                frete_valor: normalizarDecimalDaApi(item.frete_valor, 2)
              }))
          : []
      );
      setValorMinimoPedido(data?.cotacao?.valor_minimo_pedido ?? '');
      setDescontoTotal(data?.cotacao?.desconto_total ?? '');
      setCondicoesPagamento(parseCondicoesPagamento(data?.cotacao?.condicao_pagamento ?? ''));
      setPrazoEntregaDias(data?.cotacao?.prazo_entrega_dias ?? '');
      setPrazoEntregaTipo(data?.cotacao?.prazo_entrega_tipo || 'DIAS_CORRIDOS');
      setDifalValor(data?.cotacao?.difal_valor ?? '');
      setFreteTipo(data?.cotacao?.frete_tipo || 'SEM_FRETE');
      setFreteModo(data?.cotacao?.frete_modo || 'GLOBAL');
      setFreteValor(data?.cotacao?.frete_valor ?? '');
      setFreteDataVencimento(data?.cotacao?.frete_data_vencimento || '');
      setFreteTransportadorNome(data?.cotacao?.frete_transportador_nome || '');
      setFreteTransportadorCpfCnpj(data?.cotacao?.frete_transportador_cpf_cnpj || '');
      setObservacaoResposta(data?.cotacao?.observacao_resposta ?? '');
    } catch (error) {
      console.error(error);
      setDados(null);
      setErroCarregamento(classificarErroDeCarregamento(error));
      setDetalheTecnico(String(error?.message || '').trim());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, [token]);

  function atualizarItem(index, campo, valor) {
    setItens((atual) =>
      atual.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          [campo]: valor
        };
      })
    );
  }

  function atualizarCondicaoPagamento(tipo, campo, valor) {
    setCondicoesPagamento((atual) => ({
      ...atual,
      [tipo]: {
        ...(atual[tipo] || { selecionado: false, prazo: '' }),
        [campo]: valor
      }
    }));
  }

  /**
   * Devolve a LISTA de pendências, em vez de parar na primeira: com `alert`
   * o fornecedor corrigia um campo, clicava, e levava outra caixa — seis
   * viagens para um formulário só. Agora todas aparecem de uma vez, cada
   * uma dizendo em que bloco e em que campo mexer.
   */
  function pendenciasDaResposta() {
    const pendencias = [];
    const selecionadas = FORMAS_PAGAMENTO.filter((opcao) => condicoesPagamento?.[opcao.value]?.selecionado);

    if (selecionadas.length === 0) {
      pendencias.push('Marque ao menos uma condição de pagamento aceita (PIX, boleto, faturado…) no bloco "Condições comerciais".');
    }

    selecionadas
      .filter((opcao) =>
        formaPagamentoExigePrazo(opcao.value, dados?.configuracoes)
        && !String(condicoesPagamento?.[opcao.value]?.prazo || '').trim())
      .forEach((opcao) => {
        pendencias.push(`Informe o prazo de "${opcao.label}" no campo que aparece logo abaixo da opção marcada (ex.: à vista, 7 dias, 30/60).`);
      });

    if (!Number.isInteger(Number(prazoEntregaDias)) || Number(prazoEntregaDias) <= 0) {
      pendencias.push('Preencha "Prazo de entrega" com um número inteiro de dias maior que zero.');
    }

    if (!['DIAS_CORRIDOS', 'DIAS_UTEIS'].includes(prazoEntregaTipo)) {
      pendencias.push('Escolha, ao lado do número de dias, se o prazo de entrega conta dias corridos ou dias úteis.');
    }

    const valorFreteInformado = freteModo === 'POR_ITEM'
      ? itens.reduce((total, item) => total + numeroCotacao(item.frete_valor), 0)
      : numeroCotacao(freteValor);
    if (freteTipo !== 'SEM_FRETE' && valorFreteInformado <= 0) {
      pendencias.push(freteModo === 'POR_ITEM'
        ? 'Você escolheu frete por item: informe o valor do frete em ao menos um item da tabela, ou troque "Aplicação do frete" para frete global.'
        : 'Preencha "Valor do frete" — ou escolha "Sem frete", se o frete já está embutido no preço unitário.');
    }

    if (freteTipo === 'TERCEIRO' && !freteDataVencimento) {
      pendencias.push('Preencha "Data para pagamento" do frete pago a terceiro.');
    }

    return pendencias;
  }

  function montarPayloadResposta({ finalizar = false } = {}) {
    const documentoErro = getCpfCnpjError(freteTransportadorCpfCnpj, {
      label: 'CPF/CNPJ do transportador'
    });
    if (documentoErro) throw new Error(documentoErro);
    const normalizarNumeroResposta = (value) => {
      if (value === '' || value === null || value === undefined) return null;
      const raw = String(value).trim();
      const cleaned = raw.replace(/[^\d,.-]/g, '');
      const parsed = Number(cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const itensPayload = itens.map((item) => {
      const preco = normalizarNumeroResposta(item.preco);
      const quantidadeDisponivel = normalizarNumeroResposta(item.quantidade_disponivel) || 0;
      const quantidadeMinima = normalizarNumeroResposta(item.quantidade_minima_item);
      const disponivel = quantidadeDisponivel > 0 && preco !== null && preco > 0;
      const statusEfetivo = disponivel ? 'DISPONIVEL' : 'NAO_TEM';

      return {
        item_tipo: item.item_tipo,
        item_referencia_id: item.item_referencia_id,
        status_disponibilidade: statusEfetivo,
        disponivel,
        preco: statusEfetivo === 'NAO_TEM' ? null : preco,
        prazo: null,
        observacao: item.observacao,
        quantidade_minima_item: statusEfetivo === 'NAO_TEM' ? null : quantidadeMinima,
        quantidade_disponivel: quantidadeDisponivel,
        ipi_valor: normalizarNumeroResposta(item.ipi_valor) || 0,
        icms_valor: normalizarNumeroResposta(item.icms_valor) || 0,
        st_valor: normalizarNumeroResposta(item.st_valor) || 0,
        frete_valor: freteTipo !== 'SEM_FRETE' && freteModo === 'POR_ITEM'
          ? normalizarNumeroResposta(item.frete_valor) || 0
          : 0
      };
    });

    return {
      itens: itensPayload,
      valor_minimo_pedido: valorMinimoPedido,
      desconto_total: descontoTotal,
      condicao_pagamento: montarCondicaoPagamento(condicoesPagamento),
      prazo_entrega_dias: Number(prazoEntregaDias) || null,
      prazo_entrega_tipo: prazoEntregaTipo,
      difal_valor: difalValor,
      frete_tipo: freteTipo,
      frete_modo: freteModo,
      frete_valor: freteTipo === 'SEM_FRETE' || freteModo === 'POR_ITEM' ? 0 : freteValor,
      frete_data_vencimento: freteTipo === 'TERCEIRO' ? freteDataVencimento : null,
      frete_transportador_nome: freteTransportadorNome,
      frete_transportador_cpf_cnpj: onlyDigits(freteTransportadorCpfCnpj) || null,
      observacao_resposta: observacaoResposta
    };
  }

  async function handleSalvarRascunho() {
    try {
      setSalvandoRascunho(true);
      await salvarRascunhoCotacaoPublica(token, montarPayloadResposta({ finalizar: false }));
      await carregar();
      avisar.sucesso(
        'Rascunho salvo. Você pode fechar esta página e voltar pelo MESMO link para continuar depois. A equipe de compras só recebe sua proposta quando você clicar em "Enviar resposta".',
        'Rascunho salvo'
      );
    } catch (error) {
      console.error(error);
      avisar.erro(mensagemDeFalha(error, 'Não foi possível salvar o rascunho'), 'Rascunho não salvo');
    } finally {
      setSalvandoRascunho(false);
    }
  }

  async function handleSalvarOnline() {
    const pendencias = pendenciasDaResposta();
    if (pendencias.length > 0) {
      avisar.alerta(pendencias.join(' '), 'Faltam dados para enviar a resposta');
      return;
    }

    // A ação é irreversível para o fornecedor: depois do envio a tela fica só
    // para consulta e qualquer correção passa a depender da equipe de compras.
    // R21: `confirmar()` devolve OBJETO — desestruturar, senão "Cancelar"
    // seguiria com o envio.
    const { ok } = await confirmar({
      titulo: 'Enviar resposta da cotação',
      mensagem: `Serão enviados ${itensDisponiveis} de ${itens.length} itens com preço e quantidade, somando ${formatarMoeda(valorTotalProposta)}. Depois do envio esta página fica apenas para consulta: para mudar qualquer valor você precisará pedir a reabertura à equipe de compras.`,
      rotuloConfirmar: 'Enviar resposta',
      rotuloCancelar: 'Revisar antes'
    });
    if (!ok) return;

    try {
      setSalvando(true);
      await responderCotacaoPublica(token, montarPayloadResposta({ finalizar: true }));
      await carregar();
      avisar.sucesso(
        'Resposta enviada. A equipe de compras já recebeu seus preços e você não precisa fazer mais nada. Guarde este mesmo link para consultar depois o que foi enviado.',
        'Resposta enviada'
      );
    } catch (error) {
      console.error(error);
      avisar.erro(mensagemDeFalha(error, 'Não foi possível enviar a resposta'), 'Resposta não enviada');
    } finally {
      setSalvando(false);
    }
  }

  async function handleUploadArquivos(files) {
    try {
      const selecionados = Array.from(files || []);
      if (!selecionados.length) return;
      if (selecionados.length > 10) {
        avisar.alerta(
          `Você escolheu ${selecionados.length} arquivos e o limite é 10 por vez. Selecione os 10 primeiros, clique em "Adicionar arquivos", e repita para os demais — os anexos vão se somando, nada é substituído.`,
          'Arquivos demais de uma vez'
        );
        return;
      }

      setEnviandoPlanilha(true);
      await uploadArquivosCotacaoPublica(token, selecionados);
      await carregar();
      avisar.sucesso(
        `${selecionados.length} arquivo(s) anexado(s). Eles ainda NÃO foram enviados como resposta: confira os dados e clique em "Enviar resposta" para concluir.`,
        'Arquivos anexados'
      );
    } catch (error) {
      console.error(error);
      avisar.erro(mensagemDeFalha(error, 'Não foi possível anexar os arquivos'), 'Arquivos não anexados');
    } finally {
      setEnviandoPlanilha(false);
    }
  }

  if (loading) {
    return (
      <MolduraPublica avisos={avisos} aoFecharAviso={fechar}>
        <BlocoConteudo
          titulo="Carregando a cotação"
          descricao="Estamos buscando os itens e os preços já preenchidos. Costuma levar poucos segundos; se demorar mais que isso, é sinal de conexão instável."
        >
          <p className="text-sm" style={{ color: 'var(--c-muted)', marginBlock: 0 }}>
            Mantenha esta página aberta.
          </p>
        </BlocoConteudo>
      </MolduraPublica>
    );
  }

  if (erroCarregamento || !dados) {
    const texto = TEXTOS_ERRO_CARREGAMENTO[erroCarregamento] || TEXTOS_ERRO_CARREGAMENTO[ERRO_LINK];
    return (
      <MolduraPublica avisos={avisos} aoFecharAviso={fechar}>
        <BlocoConteudo
          variante="primario"
          cor="var(--sem-warning)"
          titulo={texto.titulo}
          descricao={texto.resumo}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--c-text)', marginBlock: 0 }}>
            O que fazer agora
          </p>
          <ol className="mt-2 list-decimal pl-6 text-sm" style={{ color: 'var(--c-text)', lineHeight: 'var(--lh-corpo)' }}>
            {texto.passos.map((passo) => (
              <li className="mt-2" key={passo}>{passo}</li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={carregar}>
              Tentar de novo
            </button>
          </div>
          {detalheTecnico ? (
            <p className="mt-3 text-xs" style={{ color: 'var(--c-muted)', marginBlock: 0 }}>
              Detalhe técnico para a equipe de compras: {detalheTecnico}
            </p>
          ) : null}
        </BlocoConteudo>
      </MolduraPublica>
    );
  }

  const statusCotacao = dados.cotacao?.status || 'EM ABERTO';
  const arquivosResposta = Array.isArray(dados.cotacao?.arquivos_resposta) && dados.cotacao.arquivos_resposta.length
    ? dados.cotacao.arquivos_resposta
    : (dados.cotacao?.arquivo_resposta_url || dados.cotacao?.pdf_resposta_url
      ? [{
          chave: 'legado',
          url: dados.cotacao?.arquivo_resposta_url || dados.cotacao?.pdf_resposta_url,
          nome_original: 'Arquivo anexado',
          tipo: dados.cotacao?.arquivo_resposta_tipo || 'ARQUIVO',
          is_image: Boolean(dados.cotacao?.arquivo_resposta_is_image)
        }]
      : []);
  const respostaFinalizada = ['RESPONDIDO', 'FINALIZADA'].includes(String(statusCotacao).toUpperCase());
  const formularioBloqueado = dados.somente_leitura || respostaFinalizada;
  const cotacaoCancelada = ['CANCELADA', 'CANCELADO'].includes(String(dados.cotacao?.status || '').toUpperCase());
  const itensDisponiveis = itens.filter(
    (item) => numeroCotacao(item.quantidade_disponivel) > 0 && numeroCotacao(item.preco) > 0
  ).length;
  const valorMercadorias = itens.reduce(
    (total, item) => total + numeroCotacao(item.preco) * numeroCotacao(item.quantidade),
    0
  );
  const valorTributos = itens.reduce(
    (total, item) => total + numeroCotacao(item.ipi_valor) + numeroCotacao(item.icms_valor) + numeroCotacao(item.st_valor),
    0
  );
  const valorFreteAdicional = freteTipo === 'SEM_FRETE'
    ? 0
    : (freteModo === 'POR_ITEM'
      ? itens.reduce((total, item) => total + numeroCotacao(item.frete_valor), 0)
      : numeroCotacao(freteValor));
  const valorTotalProposta = Math.max(
    0,
    valorMercadorias + valorTributos + numeroCotacao(difalValor) + valorFreteAdicional - numeroCotacao(descontoTotal)
  );

  const acoesResposta = dados.somente_leitura ? null : (
    <>
      <button
        type="button"
        className="btn btn-outline"
        onClick={handleSalvarRascunho}
        disabled={salvandoRascunho || salvando || enviandoPlanilha || respostaFinalizada}
        title={respostaFinalizada ? 'Sua resposta já foi enviada.' : 'Guarda o que já foi preenchido sem enviar à equipe de compras.'}
      >
        {salvandoRascunho ? 'Salvando...' : 'Salvar rascunho'}
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleSalvarOnline}
        disabled={salvando || salvandoRascunho || enviandoPlanilha || respostaFinalizada}
        title={respostaFinalizada ? 'Sua resposta já foi enviada.' : 'Envia sua proposta à equipe de compras.'}
      >
        {respostaFinalizada ? 'Resposta enviada' : salvando ? 'Enviando...' : 'Enviar resposta'}
      </button>
    </>
  );

  return (
    <MolduraPublica avisos={avisos} aoFecharAviso={fechar}>

      {/* Bloco principal (B2): quem pediu, para qual obra, em que situação. */}
      <BlocoConteudo
        variante="primario"
        cor="var(--c-primary)"
        titulo="Dados da cotação"
        contagem={`${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`}
        descricao={`${itensDisponiveis} já com preço e quantidade preenchidos`}
        acoes={acoesResposta}
      >
        {dados.somente_leitura ? (
          <div className="mb-4">
            <Condicao>
              {cotacaoCancelada
                ? 'Esta cotação foi CANCELADA pela equipe de compras. Você pode consultar o que havia sido pedido, mas não é possível enviar preços por aqui. Se você já estava montando a proposta, responda o e-mail em que recebeu este link antes de seguir: a compra pode ter sido refeita em outra cotação, com outro link.'
                : 'Esta cotação já foi ENCERRADA e ficou apenas para consulta. O que você enviou continua registrado. Se ainda precisa corrigir algum valor, responda o e-mail em que recebeu este link pedindo a reabertura e informe o nome da obra.'}
            </Condicao>
          </div>
        ) : null}

        {!dados.somente_leitura && respostaFinalizada ? (
          <div className="mb-4">
            <Condicao tom="info">
              Sua resposta já foi enviada e está registrada — não é preciso reenviar. Os campos ficaram bloqueados de propósito. Para corrigir algum valor, responda o e-mail em que recebeu este link pedindo a reabertura da cotação.
            </Condicao>
          </div>
        ) : null}

        <CamposComVazios
          colunas={4}
          campos={[
            { label: 'Fornecedor', valor: dados.fornecedor?.nome || '' },
            { label: 'Obra', valor: dados.solicitacao?.obra?.nome || '' },
            { label: 'Situação', valor: statusCotacao },
            { label: 'Recebido em', valor: formatarData(dados.cotacao?.enviado_em) }
          ]}
        />
      </BlocoConteudo>

      {/* Anexos primeiro: quem só quer mandar o PDF da proposta não precisa
          rolar a tabela inteira para achar o botão. */}
      <BlocoConteudo
        titulo="Arquivos da resposta"
        contagem={arquivosResposta.length ? `${arquivosResposta.length} anexado(s)` : undefined}
        descricao="Preencher os itens é opcional: você pode apenas anexar o PDF ou a foto da sua proposta. Até 10 PDFs ou imagens por vez; anexar não envia — quem envia é o botão “Enviar resposta”."
      >
        <div className="flex flex-wrap items-center gap-2">
          {/*
            A1: `<label>` com `<input type="file" class="hidden">` NÃO é
            alcançável por teclado — `display:none` tira o input da ordem de
            tabulação e o rótulo não é um controle. Quem não usa mouse perdia
            o único caminho de anexar a proposta. O rótulo passa a ser um alvo
            focável (tabIndex + role) que responde a Enter/Espaço abrindo o
            seletor do próprio input que ele embrulha.
          */}
          <label
            className={`btn btn-outline${(enviandoPlanilha || formularioBloqueado) ? ' pointer-events-none opacity-60' : ''}`}
            role="button"
            tabIndex={enviandoPlanilha || formularioBloqueado ? -1 : 0}
            aria-disabled={enviandoPlanilha || formularioBloqueado}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.currentTarget.querySelector('input[type="file"]')?.click();
            }}
          >
            <input
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              multiple
              disabled={enviandoPlanilha || formularioBloqueado}
              onChange={(event) => {
                void handleUploadArquivos(event.target.files);
                event.target.value = '';
              }}
            />
            {enviandoPlanilha ? 'Enviando...' : 'Adicionar arquivos'}
          </label>
        </div>

        {arquivosResposta.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {arquivosResposta.map((arquivo, index) => (
              <a
                key={arquivo.chave || `${arquivo.url}-${index}`}
                href={arquivo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline justify-start truncate"
                title={arquivo.nome_original || `Arquivo ${index + 1}`}
              >
                {arquivo.nome_original || `Arquivo ${index + 1}`} ({arquivo.tipo || 'ARQUIVO'})
              </a>
            ))}
          </div>
        ) : null}
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Condições comerciais"
        descricao="Estes dados valem para a proposta inteira. Os campos marcados com * precisam estar preenchidos para enviar a resposta."
      >
        <FormSecao colunas={3}>
          <CampoForm label="Valor mínimo do pedido">
            <CurrencyInput
              className="input input-moeda"
              ariaLabel="Valor mínimo do pedido"
              value={valorMinimoPedido}
              disabled={formularioBloqueado}
              onChange={setValorMinimoPedido}
            />
          </CampoForm>

          <CampoForm label="Desconto concedido">
            <CurrencyInput
              className="input input-moeda"
              ariaLabel="Desconto concedido"
              value={descontoTotal}
              disabled={formularioBloqueado}
              onChange={setDescontoTotal}
              zeroComoVazio
            />
          </CampoForm>

          <CampoForm label="DIFAL">
            <CurrencyInput
              className="input input-moeda"
              ariaLabel="Valor do DIFAL"
              value={difalValor}
              disabled={formularioBloqueado}
              onChange={setDifalValor}
              zeroComoVazio
            />
          </CampoForm>

          <CampoForm label="Prazo de entrega (dias)" obrigatorio>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={prazoEntregaDias}
              disabled={formularioBloqueado}
              onChange={(e) => setPrazoEntregaDias(e.target.value.replace(/\D/g, ''))}
              placeholder="Dias"
            />
          </CampoForm>

          <CampoForm label="Contagem do prazo" obrigatorio>
            {/* Select de FORMULÁRIO (entrada de dado), não de filtro — R12. */}
            <select
              className="input"
              value={prazoEntregaTipo}
              disabled={formularioBloqueado}
              onChange={(e) => setPrazoEntregaTipo(e.target.value)}
            >
              <option value="DIAS_CORRIDOS">Dias corridos</option>
              <option value="DIAS_UTEIS">Dias úteis</option>
            </select>
          </CampoForm>
        </FormSecao>

        <FormSecao legenda="Frete" colunas={3}>
          <CampoForm label="Frete">
            <select
              className="input"
              value={freteTipo}
              disabled={formularioBloqueado}
              onChange={(event) => setFreteTipo(event.target.value)}
            >
              <option value="SEM_FRETE">Sem frete</option>
              <option value="EMBUTIDO">Embutido no preço</option>
              <option value="TERCEIRO">Pago a terceiro</option>
            </select>
          </CampoForm>

          {freteTipo !== 'SEM_FRETE' ? (
            <CampoForm label="Aplicação do frete">
              <select
                className="input"
                value={freteModo}
                disabled={formularioBloqueado}
                onChange={(event) => setFreteModo(event.target.value)}
              >
                <option value="GLOBAL">Frete global da proposta</option>
                <option value="POR_ITEM">Frete informado por item</option>
              </select>
            </CampoForm>
          ) : null}

          {freteTipo !== 'SEM_FRETE' && freteModo === 'GLOBAL' ? (
            <CampoForm label="Valor do frete" obrigatorio>
              <CurrencyInput
                className="input input-moeda"
                ariaLabel="Valor do frete"
                value={freteValor}
                disabled={formularioBloqueado}
                onChange={setFreteValor}
                zeroComoVazio
              />
            </CampoForm>
          ) : null}

          {freteTipo === 'TERCEIRO' ? (
            <>
              <CampoForm label="Data para pagamento" obrigatorio>
                <DateInputBR
                  className="input"
                  value={freteDataVencimento}
                  disabled={formularioBloqueado}
                  onChange={(event) => setFreteDataVencimento(event.target.value)}
                />
              </CampoForm>
              <CampoForm label="Transportador" hint="Opcional">
                <input
                  className="input"
                  value={freteTransportadorNome}
                  disabled={formularioBloqueado}
                  onChange={(event) => setFreteTransportadorNome(event.target.value)}
                />
              </CampoForm>
              <CampoForm label="CPF/CNPJ do transportador" hint="Opcional">
                <input
                  className="input"
                  inputMode="numeric"
                  maxLength={18}
                  value={maskCpfCnpj(freteTransportadorCpfCnpj)}
                  disabled={formularioBloqueado}
                  onChange={(event) => setFreteTransportadorCpfCnpj(maskCpfCnpj(event.target.value))}
                />
              </CampoForm>
            </>
          ) : null}
        </FormSecao>

        <FormSecao legenda="Condições de pagamento aceitas *" colunas={4}>
          {FORMAS_PAGAMENTO.map((opcao) => {
            const condicao = condicoesPagamento[opcao.value] || { selecionado: false, prazo: '' };
            const exigePrazo = formaPagamentoExigePrazo(opcao.value, dados?.configuracoes);
            return (
              <div
                key={opcao.value}
                className="rounded-xl border p-3"
                style={{
                  borderColor: condicao.selecionado ? 'var(--c-primary)' : 'var(--c-border)',
                  background: condicao.selecionado ? 'var(--ui-surface-soft)' : 'var(--ui-surface)'
                }}
              >
                {/* M1: o alvo de clique é o rótulo inteiro, no piso do sistema
                    (--alvo-clique: 32px no desktop, 44px no toque). */}
                <label
                  className="flex cursor-pointer items-center gap-2 text-sm font-semibold"
                  style={{ minHeight: 'var(--alvo-clique)', color: 'var(--c-text)' }}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border"
                    style={{ borderColor: 'var(--c-border)' }}
                    checked={Boolean(condicao.selecionado)}
                    disabled={formularioBloqueado}
                    onChange={(e) => atualizarCondicaoPagamento(opcao.value, 'selecionado', e.target.checked)}
                  />
                  <span>{opcao.label}</span>
                </label>
                {condicao.selecionado && exigePrazo && (
                  <input
                    className="input mt-2"
                    type="text"
                    value={condicao.prazo}
                    disabled={formularioBloqueado}
                    aria-label={`Prazo para ${opcao.label}`}
                    onChange={(e) => atualizarCondicaoPagamento(opcao.value, 'prazo', e.target.value)}
                    placeholder="Ex.: à vista, 7 dias, 30/60"
                  />
                )}
              </div>
            );
          })}
        </FormSecao>

        <FormSecao colunas={2}>
          <CampoForm
            label="Observação da proposta"
            tipo="observacao"
            hint="Condições comerciais, marcas principais, restrições ou qualquer recado para a equipe de compras."
          >
            <textarea
              className="input"
              rows={3}
              value={observacaoResposta}
              disabled={formularioBloqueado}
              onChange={(e) => setObservacaoResposta(e.target.value)}
              placeholder="Informe condições comerciais, marcas principais, restrições ou observações gerais da proposta."
            />
          </CampoForm>
        </FormSecao>
      </BlocoConteudo>

      {/* R18: os antigos invólucros (.solicitacoes-table-shell /
          .cotacao-publica-table-shell) traziam `overflow: hidden`, que cria
          contexto de rolagem e mata o sticky do cabeçalho e da coluna fixa.
          A TabelaPadrao já traz o próprio invólucro com área de rolagem
          rotulada — nenhum ancestral aqui recorta com `hidden`. */}
      <BlocoConteudo
        titulo="Itens da cotação"
        descricao="Informe o preço unitário e a quantidade que você tem disponível. Item deixado sem preço ou sem quantidade é enviado como “não tenho” — e isso não inválida a proposta."
      >
        <TabelaPadrao
          /*
            GRADE DE LANÇAMENTO, NÃO LISTA DE CONSULTA (05/09).
            A maioria das colunas aqui é campo de digitação, não dado a ler.
            Oferecer "escolher colunas" numa grade assim dá ao usuário como
            esconder o campo que ele precisa preencher — e ele não descobre por
            que o lançamento parou de funcionar. A capacidade sai DAQUI, não do
            sistema: nas 246 tabelas de consulta ela continua.
          */
          colunasConfiguraveis={false}
          colunas={[
            {
              id: 'descricao',
              titulo: 'Descrição',
              // R17: o nome do insumo é quem nomeia a linha da cotação.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => (
                <div className="cotacao-publica-cell-description">
                  <strong>{item.nome}</strong>
                  {item.especificacao ? (
                    <span
                      className="mt-1 block whitespace-normal text-xs font-medium"
                      style={{ color: 'var(--c-muted)', lineHeight: 'var(--lh-detalhe)' }}
                    >
                      {item.especificacao}
                    </span>
                  ) : null}
                </div>
              )
            },
            {
              id: 'quantidade',
              titulo: 'Qtd./Un.',
              tipo: 'numero',
              render: (item) => (
                <span className="cotacao-publica-cell-muted">{item.quantidade} {item.unidade}</span>
              )
            },
            {
              id: 'necessario_para',
              titulo: 'Necessário',
              tipo: 'data',
              render: (item) => (
                <span className="cotacao-publica-cell-muted">{formatarData(item.necessario_para)}</span>
              )
            },
            {
              id: 'preco',
              titulo: 'Preço unit.',
              tipo: 'valor',
              render: (item) => (
                <CurrencyInput
                  className="input input-moeda"
                  ariaLabel={`Preço unitário de ${item.nome}`}
                  value={item.preco}
                  disabled={formularioBloqueado}
                  casasDecimais={10}
                  preservarEscala
                  onChange={(val) => atualizarItem(item.__indice, 'preco', val)}
                />
              )
            },
            {
              id: 'quantidade_disponivel',
              titulo: 'Qtd. disponível',
              tipo: 'numero',
              render: (item) => (
                <input
                  className="input"
                  inputMode="decimal"
                  value={item.quantidade_disponivel}
                  disabled={formularioBloqueado}
                  aria-label={`Quantidade disponível de ${item.nome}`}
                  title="Informe sua disponibilidade para orientar a compra. Este campo não altera o valor cotado para a quantidade solicitada."
                  onChange={(e) => atualizarItem(item.__indice, 'quantidade_disponivel', sanitizarDecimalInput(e.target.value, 3))}
                  placeholder="0"
                />
              )
            },
            {
              id: 'valor_total',
              titulo: 'Valor total',
              tipo: 'valor',
              render: (item) => (
                <span className="font-semibold valor-tabular" style={{ color: 'var(--c-text)' }}>
                  {formatarMoeda(calcularTotalItemCotacao(item, freteModo === 'POR_ITEM'))}
                </span>
              )
            },
            {
              id: 'ipi_valor',
              titulo: 'IPI',
              tipo: 'valor',
              render: (item) => (
                <CurrencyInput
                  className="input input-moeda"
                  ariaLabel={`IPI de ${item.nome}`}
                  value={item.ipi_valor}
                  disabled={formularioBloqueado}
                  onChange={(valor) => atualizarItem(item.__indice, 'ipi_valor', valor)}
                  zeroComoVazio
                />
              )
            },
            {
              id: 'icms_valor',
              titulo: 'ICMS',
              tipo: 'valor',
              render: (item) => (
                <CurrencyInput
                  className="input input-moeda"
                  ariaLabel={`ICMS de ${item.nome}`}
                  value={item.icms_valor}
                  disabled={formularioBloqueado}
                  onChange={(valor) => atualizarItem(item.__indice, 'icms_valor', valor)}
                  zeroComoVazio
                />
              )
            },
            {
              id: 'st_valor',
              titulo: 'ST',
              tipo: 'valor',
              render: (item) => (
                <CurrencyInput
                  className="input input-moeda"
                  ariaLabel={`Substituição tributária de ${item.nome}`}
                  value={item.st_valor}
                  disabled={formularioBloqueado}
                  onChange={(valor) => atualizarItem(item.__indice, 'st_valor', valor)}
                  zeroComoVazio
                />
              )
            },
            ...(freteModo === 'POR_ITEM' ? [
              {
                id: 'frete_valor',
                titulo: 'Frete',
                tipo: 'valor',
                render: (item) => (
                  <CurrencyInput
                    className="input input-moeda"
                    ariaLabel={`Frete de ${item.nome}`}
                    value={item.frete_valor}
                    disabled={formularioBloqueado}
                    onChange={(valor) => atualizarItem(item.__indice, 'frete_valor', valor)}
                    zeroComoVazio
                  />
                )
              }
            ] : []),
            {
              id: 'quantidade_minima_item',
              titulo: 'Qtd. mín.',
              tipo: 'numero',
              render: (item) => (
                <input
                  className="input"
                  type="number"
                  lang="pt-BR"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={item.quantidade_minima_item}
                  disabled={formularioBloqueado}
                  aria-label={`Quantidade mínima de ${item.nome}`}
                  onChange={(e) => atualizarItem(item.__indice, 'quantidade_minima_item', e.target.value)}
                  placeholder="Opcional"
                />
              )
            },
            {
              id: 'observacao',
              titulo: 'Observação',
              tipo: 'texto',
              render: (item) => (
                <div className="flex min-w-0 items-start gap-2">
                  <AttachmentPreview item={item} />
                  <div className="min-w-0 flex-1">
                    {item.link_produto ? (
                      <a
                        href={item.link_produto}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mb-1 block truncate text-xs font-medium hover:underline"
                        style={{ color: 'var(--c-primary)' }}
                        title={item.link_produto}
                      >
                        Link do produto
                      </a>
                    ) : null}
                    <textarea
                      className="input"
                      value={item.observacao}
                      disabled={formularioBloqueado}
                      aria-label={`Observação de ${item.nome}`}
                      onChange={(e) => atualizarItem(item.__indice, 'observacao', e.target.value)}
                      placeholder="Marca, condições ou restrições"
                      rows={2}
                    />
                  </div>
                </div>
              )
            }
          ]}
          // `__indice` carrega a posição no formulário: `atualizarItem`
          // trabalha por índice, não por id do item.
          itens={itens.map((item, index) => ({ ...item, __indice: index }))}
          getId={(item) => `${item.item_tipo}-${item.item_referencia_id}`}
          storageKey="tabela:cotacao-fornecedor-publica:itens"
          rotuloRolagem="Itens da cotação"
          vazio="Esta cotação não trouxe itens para preencher. Anexe o PDF da sua proposta acima e clique em Enviar resposta; se acha que faltou item, responda o e-mail em que recebeu este link."
        />
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Resumo da proposta"
        descricao="Conferência automática do que será enviado. Os valores acompanham o que você digita nos itens e nas condições comerciais."
      >
        <StatGrid colunas={3}>
          <StatTile label="Mercadorias" valor={formatarMoeda(valorMercadorias)} />
          <StatTile label="IPI + ICMS + ST" valor={formatarMoeda(valorTributos)} />
          <StatTile label="DIFAL" valor={formatarMoeda(numeroCotacao(difalValor))} />
          <StatTile
            label={`Frete ${freteModo === 'POR_ITEM' ? 'por item' : 'global'}`}
            valor={formatarMoeda(valorFreteAdicional)}
          />
          <StatTile label="Desconto concedido" valor={`- ${formatarMoeda(numeroCotacao(descontoTotal))}`} />
          <StatTile
            label="Total estimado da proposta"
            valor={formatarMoeda(valorTotalProposta)}
            sub="Mercadorias + tributos + DIFAL + frete − desconto"
          />
        </StatGrid>
      </BlocoConteudo>

      {elementoConfirmacao}
    </MolduraPublica>
  );
}
