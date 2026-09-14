import DateInputBR from '../components/DateInputBR';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlineArrowPath,
  HiOutlineDocumentPlus,
  HiOutlineXMark
} from 'react-icons/hi2';
import OverlayModal from '../components/ui/OverlayModal';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BarraFiltros,
  alternarValorFiltro,
  FormSecao,
  CampoForm,
  StatGrid,
  StatTile,
  TabelaPadrao,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import { buscarParceiros } from '../services/parceiros';
import {
  atualizarParcelaFinanciamentoBancario,
  criarFinanciamentoBancario,
  gerarTitulosFinanciamentoBancario,
  getCategoriasFinanceiras,
  getContasBancarias,
  getFinanciamentosBancarios
} from '../services/financeiro';

const EMPTY_FORM = {
  conta_bancaria_id: '',
  empresa_id: '',
  parceiro_id: '',
  categoria_financeira_id: '',
  numero_contrato: '',
  documento_referencia: '',
  tipo_contrato: 'Capital de giro',
  sistema_amortizacao: 'FIXO',
  taxa_juros_mensal: '',
  data_contrato: new Date().toISOString().slice(0, 10),
  data_credito: new Date().toISOString().slice(0, 10),
  primeiro_vencimento: '',
  quantidade_parcelas: 12,
  valor_credito: '',
  valor_juros_total: '',
  valor_iof: '',
  valor_tarifas: '',
  observacoes: ''
};

const STATUS = [
  { valor: 'RASCUNHO', rotulo: 'Rascunho' },
  { valor: 'ATIVO', rotulo: 'Ativo' },
  { valor: 'LIQUIDADO', rotulo: 'Liquidado' },
  { valor: 'CANCELADO', rotulo: 'Cancelado' }
];

/* ------------------------------------------------------------------ *
 * CÁLCULO DE PARCELA, JUROS E ENCARGOS — INTOCADO NESTA LEVA.
 * A reforma é de layout. Nenhuma das funções abaixo (arredondamento,
 * distribuição de centavos, PRICE, SAC, totais) mudou uma linha, e o
 * payload enviado ao serviço é o mesmo de antes.
 * ------------------------------------------------------------------ */

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function parseCurrencyInput(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? Number(digits) / 100 : '';
}

function formatCurrencyInput(value) {
  if (value === '' || value === null || value === undefined) return '';
  return formatCurrency(value);
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function addMonths(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  const day = date.getDate();
  date.setMonth(date.getMonth() + Number(amount || 0), 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function distribuirValor(valorTotal, quantidade) {
  const totalCentavos = Math.round(Number(valorTotal || 0) * 100);
  const base = Math.floor(totalCentavos / quantidade);
  let resto = totalCentavos - (base * quantidade);
  return Array.from({ length: quantidade }, () => {
    const centavos = base + (resto > 0 ? 1 : 0);
    if (resto > 0) resto -= 1;
    return roundCurrency(centavos / 100);
  });
}

function calcularPreviewParcelas(form) {
  const quantidade = Math.max(Number(form.quantidade_parcelas || 0), 0);
  const principal = roundCurrency(form.valor_credito);
  if (!quantidade || principal <= 0 || !form.primeiro_vencimento) return [];

  const sistema = String(form.sistema_amortizacao || 'FIXO').toUpperCase();
  const taxaMensal = Number(form.taxa_juros_mensal || 0) / 100;
  const jurosInformado = roundCurrency(form.valor_juros_total || 0);
  const iofParcelas = distribuirValor(form.valor_iof || 0, quantidade);
  const tarifaParcelas = distribuirValor(form.valor_tarifas || 0, quantidade);
  let principalParcelas = [];
  let jurosParcelas = [];

  if (sistema === 'SAC' && taxaMensal > 0) {
    principalParcelas = distribuirValor(principal, quantidade);
    let saldo = principal;
    jurosParcelas = principalParcelas.map((amortizacao) => {
      const juros = roundCurrency(saldo * taxaMensal);
      saldo = roundCurrency(saldo - amortizacao);
      return juros;
    });
  } else if (sistema === 'PRICE' && taxaMensal > 0) {
    const parcelaBase = roundCurrency(principal * (taxaMensal / (1 - ((1 + taxaMensal) ** (-quantidade)))));
    let saldo = principal;
    for (let index = 0; index < quantidade; index += 1) {
      const juros = roundCurrency(saldo * taxaMensal);
      const amortizacao = index === quantidade - 1 ? roundCurrency(saldo) : roundCurrency(parcelaBase - juros);
      principalParcelas.push(amortizacao);
      jurosParcelas.push(juros);
      saldo = roundCurrency(saldo - amortizacao);
    }
  } else {
    principalParcelas = distribuirValor(principal, quantidade);
    jurosParcelas = distribuirValor(jurosInformado, quantidade);
  }

  return Array.from({ length: quantidade }, (_, index) => {
    const principalParcela = principalParcelas[index] || 0;
    const jurosParcela = jurosParcelas[index] || 0;
    const iofParcela = iofParcelas[index] || 0;
    const tarifaParcela = tarifaParcelas[index] || 0;
    return {
      numero_parcela: index + 1,
      data_vencimento: addMonths(form.primeiro_vencimento, index),
      valor_principal: principalParcela,
      valor_juros: jurosParcela,
      valor_iof: iofParcela,
      valor_tarifa: tarifaParcela,
      valor_parcela: roundCurrency(principalParcela + jurosParcela + iofParcela + tarifaParcela)
    };
  });
}

function getFinanciamentoTotais(parcelas = []) {
  return parcelas.reduce((acc, parcela) => ({
    principal: roundCurrency(acc.principal + Number(parcela.valor_principal || 0)),
    juros: roundCurrency(acc.juros + Number(parcela.valor_juros || 0)),
    encargos: roundCurrency(acc.encargos + Number(parcela.valor_iof || 0) + Number(parcela.valor_tarifa || 0)),
    total: roundCurrency(acc.total + Number(parcela.valor_parcela || 0))
  }), {
    principal: 0,
    juros: 0,
    encargos: 0,
    total: 0
  });
}

/* R25 — o tom do status vem da classe do sistema (`badge-*` → --sem-*).
   `badge badge-soft` não existia em CSS nenhum: era uma quinta classe
   fantasma desta tela, só que escondida numa string em vez de um
   `className=` — por isso a prova de tokens não a via. */
function StatusBadge({ status }) {
  const normalized = String(status || 'RASCUNHO').toUpperCase();
  const className = normalized === 'ATIVO'
    ? 'badge badge-success'
    : normalized === 'CANCELADO'
      ? 'badge badge-danger'
      : 'badge badge-muted';
  return <span className={className}>{normalized}</span>;
}

// A dimensão de status é de valor ÚNICO no serviço (`status=`): o conjunto
// marcado vira o parâmetro, e conjunto vazio significa "todos".
function umValor(conjunto) {
  const [primeiro] = [...(conjunto || [])];
  return primeiro || '';
}

export default function FinanceiroFinanciamentosBancarios() {
  const [financiamentos, setFinanciamentos] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [contas, setContas] = useState([]);
  const [parceiros, setParceiros] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [filtrosAtivos, setFiltrosAtivos] = useState({ status: new Set() });
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [modalCadastro, setModalCadastro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingParcela, setEditingParcela] = useState(null);
  const [parcelaForm, setParcelaForm] = useState({
    valor_principal: '',
    valor_juros: '',
    observacoes: ''
  });
  const { avisos, avisar, fechar: fecharAviso, limpar: limparAvisos } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const selected = useMemo(
    () => financiamentos.find((item) => Number(item.id) === Number(selectedId)) || financiamentos[0] || null,
    [financiamentos, selectedId]
  );

  const selectedParcelas = Array.isArray(selected?.parcelas) ? selected.parcelas : [];
  const previewParcelas = useMemo(() => calcularPreviewParcelas(form), [form]);
  const previewTotais = useMemo(() => getFinanciamentoTotais(previewParcelas), [previewParcelas]);
  const resumo = useMemo(() => {
    const ativos = financiamentos.filter((item) => String(item.status).toUpperCase() === 'ATIVO');
    const totalAberto = financiamentos.reduce((acc, item) => acc + Number(item.valor_total || 0), 0);
    const titulosGerados = financiamentos.filter((item) => item.titulos_gerados_em).length;
    return {
      contratos: financiamentos.length,
      ativos: ativos.length,
      total: totalAberto,
      titulosGerados
    };
  }, [financiamentos]);

  useEffect(() => {
    let active = true;
    Promise.all([
      getContasBancarias(),
      buscarParceiros({ fornecedor: '1', ativo: '1', limit: 200 }),
      getCategoriasFinanceiras()
    ])
      .then(([contasData, parceirosData, categoriasData]) => {
        if (!active) return;
        setContas(Array.isArray(contasData) ? contasData : []);
        setParceiros(Array.isArray(parceirosData) ? parceirosData : []);
        setCategorias(Array.isArray(categoriasData) ? categoriasData : []);
      })
      .catch((err) => {
        if (active) avisar.erro(err?.message || 'Erro ao carregar cadastros financeiros');
      });

    return () => {
      active = false;
    };
  }, [avisar]);

  // R23 — busca textual tem espera de digitação (350ms) e NUNCA botão.
  useEffect(() => {
    const timer = setTimeout(() => setBuscaAplicada(busca.trim()), 350);
    return () => clearTimeout(timer);
  }, [busca]);

  const status = umValor(filtrosAtivos.status);

  useEffect(() => {
    let active = true;
    setLoading(true);
    // R23 — o recorte é UMA requisição: o filtro aplica ao MARCAR, sem botão
    // de confirmação (duas dimensões, uma chamada — longe do critério de
    // consulta cara: 4+ dimensões ou mais de 2s).
    getFinanciamentosBancarios({ status, q: buscaAplicada, limit: 200 })
      .then((data) => {
        if (active) setFinanciamentos(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!active) return;
        setFinanciamentos([]);
        avisar.erro(err?.message || 'Erro ao carregar financiamentos bancarios');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [status, buscaAplicada, recarga, avisar]);

  function recarregar() {
    setRecarga((n) => n + 1);
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateMoneyField(field, value) {
    updateForm(field, parseCurrencyInput(value));
  }

  function updateParcelaMoneyField(field, value) {
    setParcelaForm((current) => ({
      ...current,
      [field]: parseCurrencyInput(value)
    }));
  }

  async function submitForm(event) {
    event.preventDefault();
    setSaving(true);
    limparAvisos();

    try {
      // Payload idêntico ao anterior — a reforma não toca em dinheiro.
      const created = await criarFinanciamentoBancario({
        ...form,
        quantidade_parcelas: Number(form.quantidade_parcelas || 0),
        valor_credito: Number(form.valor_credito || 0),
        valor_juros_total: Number(form.valor_juros_total || 0),
        valor_iof: Number(form.valor_iof || 0),
        valor_tarifas: Number(form.valor_tarifas || 0),
        taxa_juros_mensal: form.taxa_juros_mensal === '' ? undefined : Number(form.taxa_juros_mensal)
      });
      avisar.sucesso('Financiamento cadastrado. Revise as parcelas e gere os títulos quando estiver conferido.');
      setForm(EMPTY_FORM);
      setModalCadastro(false);
      recarregar();
      setSelectedId(created?.id || null);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao cadastrar financiamento bancario');
    } finally {
      setSaving(false);
    }
  }

  async function handleGerarTitulos(contrato) {
    /*
      R26 (04/09) — a referência é FIXADA antes do `await`. O contrato vem
      como ARGUMENTO e é copiado para uma `const` local: o modal do sistema
      não bloqueia a tela, e o `selected` desta tela muda quando alguém
      clica "Ver" noutra linha da lista. Reler `selected` depois da
      confirmação faria a tela PERGUNTAR sobre o contrato A e gerar os
      títulos do contrato B — consentimento válido para a ação errada, sem
      rastro no log.

      DoD (classe "consentimento"): o contrato citado na mensagem e o
      contrato passado ao serviço são o MESMO objeto, lido no mesmo momento.
    */
    const alvo = contrato;
    if (!alvo) return;

    const { ok } = await confirmar({
      titulo: 'Gerar os títulos deste contrato?',
      mensagem: `${alvo.quantidade_parcelas || 0} parcela(s) do contrato ${alvo.numero_contrato || alvo.codigo || `#${alvo.id}`}, somando ${formatCurrency(alvo.valor_total)}, entram em contas a pagar e passam a seguir o fluxo normal de baixa. Esta tela não desfaz a geração: para voltar atrás é preciso tratar os títulos um a um no financeiro.`,
      rotuloConfirmar: 'Gerar títulos'
    });
    if (!ok) return;

    setSaving(true);
    try {
      const updated = await gerarTitulosFinanciamentoBancario(alvo.id);
      avisar.sucesso('Títulos financeiros gerados para as parcelas do financiamento.');
      recarregar();
      setSelectedId(updated?.id || alvo.id);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao gerar títulos do financiamento');
    } finally {
      setSaving(false);
    }
  }

  function parcelaPodeSerEditada(parcela) {
    const titulo = parcela?.tituloFinanceiro;
    if (!titulo) return true;
    const status = String(titulo.status || '').toUpperCase();
    return Number(titulo.valor_baixado || 0) <= 0 && !['BAIXADO', 'PAGO', 'QUITADO'].includes(status);
  }

  function abrirEdicaoParcela(parcela) {
    setEditingParcela(parcela);
    setParcelaForm({
      valor_principal: Number(parcela?.valor_principal || 0),
      valor_juros: Number(parcela?.valor_juros || 0),
      observacoes: parcela?.observacoes || ''
    });
  }

  async function salvarParcela(event) {
    event.preventDefault();
    if (!editingParcela) return;
    // R26 — parcela e valores fixados antes de qualquer `await`.
    const parcelaAlvo = editingParcela;
    const dados = {
      valor_principal: Number(parcelaForm.valor_principal || 0),
      valor_juros: Number(parcelaForm.valor_juros || 0),
      observacoes: parcelaForm.observacoes || null
    };
    setSaving(true);
    limparAvisos();

    try {
      const updated = await atualizarParcelaFinanciamentoBancario(parcelaAlvo.id, dados);

      setFinanciamentos((current) => current.map((item) => (
        Number(item.id) === Number(updated?.id) ? updated : item
      )));
      setSelectedId(updated?.id || selectedId);
      setEditingParcela(null);
      avisar.sucesso('Parcela do financiamento atualizada.');
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao atualizar parcela do financiamento');
    } finally {
      setSaving(false);
    }
  }

  function alternarFiltro(dimensao, valor, opcoes) {
    setFiltrosAtivos((atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes));
  }

  const categoriasPagar = categorias.filter((categoria) => {
    const tipo = String(categoria.tipo || 'AMBOS').toUpperCase();
    return categoria.ativo !== false && (tipo === 'PAGAR' || tipo === 'AMBOS');
  });

  const rotuloContratoSelecionado = selected
    ? selected.codigo || selected.numero_contrato || `#${selected.id}`
    : '';

  return (
    <Pagina>
      {/* R13/C1/C2/R5 — faixa fixa do sistema: o título de página é do
          componente (22px), e o apoio vive nas props contagem/descricao. O
          <h1> com tamanho escrito na tela e o parágrafo de apoio solto
          saíram. R11/C6 — os links "Títulos" e "Conciliação OFX" na barra de
          ações eram NAVEGAÇÃO disfarçada de ação e saíram; menu, breadcrumb
          e Ctrl+K levam lá.
          R9/R1 — cadastro esporádico abre em MODAL: a ação principal da
          faixa substitui o painel que dividia a tela ao meio. */}
      <PageHeader
        titulo="Financiamentos Bancários"
        contagem={`${resumo.contratos} contrato(s)`}
        descricao="Contratos de crédito, parcelas conferidas e geração dos títulos de contas a pagar."
        acaoPrincipal={{
          rotulo: 'Novo financiamento',
          onClick: () => { setForm(EMPTY_FORM); setModalCadastro(true); },
          icone: <HiOutlineDocumentPlus aria-hidden="true" />
        }}
        secundarias={[
          {
            rotulo: 'Atualizar',
            onClick: () => { limparAvisos(); recarregar(); },
            desabilitada: loading,
            icone: <HiOutlineArrowPath aria-hidden="true" />
          }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      {/* M2/R10 — o ladrilho do sistema no lugar dos `app-summary-card` com
          ícone medido à mão. B3: a contagem de contratos já vive na faixa
          fixa e não se repete aqui. */}
      <StatGrid colunas={4}>
        <StatTile label="Contratos ativos" valor={String(resumo.ativos)} tom="success" />
        <StatTile
          label="Total contratado"
          valor={formatCurrency(resumo.total)}
          sub="amortização + encargos"
        />
        <StatTile label="Cronogramas enviados" valor={String(resumo.titulosGerados)} sub="para contas a pagar" />
        <StatTile
          label="Sem títulos gerados"
          valor={String(Math.max(resumo.contratos - resumo.titulosGerados, 0))}
          tom={resumo.contratos - resumo.titulosGerados > 0 ? 'warning' : undefined}
        />
      </StatGrid>

      <BlocoConteudo
        titulo="Contratos cadastrados"
        descricao="A conta bancária representa onde o crédito foi tomado."
      >
        {/* R12/F1/F2 — busca única ocupando a faixa e status por MARCAÇÃO,
            com etiqueta removível. O formulário de filtro com <select> de
            escolha única e botões "Atualizar/Limpar" saiu. */}
        <BarraFiltros
          busca={{
            valor: busca,
            aoMudar: setBusca,
            placeholder: 'Contrato, código ou documento'
          }}
          filtros={[
            { id: 'status', rotulo: 'Status', unico: true, opcoes: STATUS }
          ]}
          ativos={filtrosAtivos}
          aoAlternar={alternarFiltro}
          aoLimpar={() => { setFiltrosAtivos({ status: new Set() }); setBusca(''); }}
        />

        <TabelaPadrao
          colunas={[
            {
              id: 'codigo',
              titulo: 'Código',
              tipo: 'codigo',
              render: (item) => (
                <span className={Number(selected?.id) === Number(item.id) ? 'font-semibold text-[var(--c-primary)]' : 'font-semibold'}>
                  {item.codigo || `#${item.id}`}
                </span>
              )
            },
            {
              id: 'contrato',
              titulo: 'Contrato',
              // R17: o contrato (e sua instituição) NOMEIA o financiamento.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => (
                <div>
                  <div className="font-semibold text-[var(--c-text)]">{item.numero_contrato}</div>
                  <div className="text-xs text-[var(--c-muted)]">{item.instituicaoFinanceira?.nome || '-'}</div>
                </div>
              )
            },
            {
              id: 'conta',
              titulo: 'Conta do crédito',
              tipo: 'texto',
              render: (item) => (
                <div>
                  <div>{item.contaBancaria?.nome || '-'}</div>
                  <div className="text-xs text-[var(--c-muted)]">{item.contaBancaria?.banco || ''}</div>
                </div>
              )
            },
            { id: 'empresa', titulo: 'Empresa', tipo: 'texto', render: (item) => item.empresa?.nome || '-' },
            { id: 'parcelas', titulo: 'Parcelas', tipo: 'numero', render: (item) => item.quantidade_parcelas },
            { id: 'total', titulo: 'Total', tipo: 'valor', render: (item) => formatCurrency(item.valor_total) },
            { id: 'status', titulo: 'Status', tipo: 'status', render: (item) => <StatusBadge status={item.status} /> }
          ]}
          itens={financiamentos}
          carregando={loading}
          vazio="Nenhum financiamento cadastrado."
          storageKey="tabela:financiamentos-bancarios:contratos"
          rotuloRolagem="Contratos de financiamento cadastrados"
          larguraAcoes={220}
          acoesLinha={(item) => (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedId(item.id)}>
                Ver parcelas
              </button>
              {!item.titulos_gerados_em ? (
                <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => handleGerarTitulos(item)}>
                  Gerar títulos
                </button>
              ) : null}
            </>
          )}
        />
      </BlocoConteudo>

      {/* B2 — UM bloco principal com barra de cor: é aqui que o dinheiro do
          contrato aparece parcela a parcela. */}
      <BlocoConteudo
        titulo={selected ? `Parcelas · ${rotuloContratoSelecionado}` : 'Parcelas'}
        variante="primario"
        cor="var(--module-financeiro)"
        descricao="Cada parcela gera um título a pagar e segue o fluxo normal de baixa e conciliação."
        acoes={selected && !selected.titulos_gerados_em ? (
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => handleGerarTitulos(selected)}>
            Gerar títulos do contrato
          </button>
        ) : null}
      >
        <TabelaPadrao
          // Sem coluna de IDENTIDADE por natureza: a parcela não tem nome
          // próprio — o contrato que a nomeia já está no título do bloco e
          // as linhas são posições numeradas (número, datas e valores).
          semIdentidade
          colunas={[
            { id: 'numero', titulo: '#', tipo: 'numero', noCard: 'titulo', render: (parcela) => parcela.numero_parcela },
            { id: 'vencimento', titulo: 'Vencimento', tipo: 'data', render: (parcela) => formatDate(parcela.data_vencimento) },
            { id: 'principal', titulo: 'Amortização', tipo: 'valor', render: (parcela) => formatCurrency(parcela.valor_principal) },
            { id: 'juros', titulo: 'Juros', tipo: 'valor', render: (parcela) => formatCurrency(parcela.valor_juros) },
            { id: 'encargos', titulo: 'Encargos', tipo: 'valor', render: (parcela) => formatCurrency(Number(parcela.valor_iof || 0) + Number(parcela.valor_tarifa || 0)) },
            { id: 'total', titulo: 'Parcela', tipo: 'valor', render: (parcela) => <span className="font-semibold">{formatCurrency(parcela.valor_parcela)}</span> },
            {
              id: 'titulo',
              titulo: 'Título',
              tipo: 'codigo',
              render: (parcela) => (parcela.tituloFinanceiro ? (
                /* R25 — o azul do link vem do token do sistema, não de
                   `text-blue-700`, que não tem par no tema escuro. */
                <Link to={`/financeiro/titulos/${parcela.tituloFinanceiro.id}`} className="text-[var(--c-primary)] underline">
                  {parcela.tituloFinanceiro.codigo || `#${parcela.tituloFinanceiro.id}`}
                </Link>
              ) : (
                <span className="text-[var(--c-muted)]">Pendente</span>
              ))
            }
          ]}
          itens={selected ? selectedParcelas : []}
          vazio={selected ? 'Nenhuma parcela encontrada.' : 'Selecione um financiamento para ver as parcelas.'}
          storageKey="tabela:financiamentos-bancarios:parcelas"
          rotuloRolagem="Parcelas do financiamento"
          larguraAcoes={140}
          acoesLinha={(parcela) => (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => abrirEdicaoParcela(parcela)}
              disabled={!parcelaPodeSerEditada(parcela) || saving}
              title={parcelaPodeSerEditada(parcela) ? 'Editar amortização e juros' : 'Parcela com título baixado'}
            >
              Editar
            </button>
          )}
        />
      </BlocoConteudo>

      {/* R9/R1 — cadastro esporádico em MODAL do sistema.
          R27 — o corpo rolante e o rodapé fixo são do OverlayModal: a tela
          não escreve `overflow-y` nenhum. O botão de cadastrar fica sempre
          visível, mesmo com o formulário inteiro aberto. */}
      {modalCadastro ? (
        <OverlayModal
          rotulo="Novo financiamento bancário"
          largura="var(--modal-max-w-xl, 1080px)"
          onFechar={() => setModalCadastro(false)}
        >
          <div data-modal="cabecalho" className="flex items-start justify-between gap-4 border-b border-[var(--c-border)] p-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--c-text)]">Novo financiamento</h2>
              <p className="text-sm text-[var(--c-muted)]">
                A empresa do título será identificada pela conta que recebeu o crédito.
              </p>
            </div>
            <button type="button" className="btn btn-outline" onClick={() => setModalCadastro(false)} aria-label="Fechar">
              <HiOutlineXMark aria-hidden="true" />
            </button>
          </div>

          <form id="form-novo-financiamento" className="p-4" onSubmit={submitForm}>
            {/* R2/R7 — campos da mesma linha com a MESMA altura e a mesma
                linha de base: quem mede é o form-grid, não a tela. */}
            <FormSecao legenda="Contrato" colunas={2}>
              <CampoForm label="Conta que recebeu o crédito" obrigatorio>
                <select className="input" value={form.conta_bancaria_id} onChange={(event) => {
                  const conta = contas.find((item) => String(item.id) === String(event.target.value));
                  setForm((current) => ({
                    ...current,
                    conta_bancaria_id: event.target.value,
                    empresa_id: String(conta?.empresa_id || '')
                  }));
                }} required>
                  <option value="">Selecione</option>
                  {contas.map((conta) => (
                    <option key={conta.id} value={conta.id}>{conta.nome} - {conta.banco || 'Conta'}{conta.empresa?.nome ? ` - ${conta.empresa.nome}` : ''}</option>
                  ))}
                </select>
              </CampoForm>
              <CampoForm label="Instituição financeira" obrigatorio>
                <select className="input" value={form.parceiro_id} onChange={(event) => updateForm('parceiro_id', event.target.value)} required>
                  <option value="">Banco/fornecedor</option>
                  {parceiros.map((parceiro) => (
                    <option key={parceiro.id} value={parceiro.id}>{parceiro.nome}</option>
                  ))}
                </select>
              </CampoForm>
              <CampoForm label="Categoria das parcelas" obrigatorio>
                <select className="input" value={form.categoria_financeira_id} onChange={(event) => updateForm('categoria_financeira_id', event.target.value)} required>
                  <option value="">Selecione</option>
                  {categoriasPagar.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
                  ))}
                </select>
              </CampoForm>
              <CampoForm label="Número do contrato" obrigatorio>
                <input className="input" value={form.numero_contrato} onChange={(event) => updateForm('numero_contrato', event.target.value)} required />
              </CampoForm>
              <CampoForm label="Documento de referência">
                <input className="input" value={form.documento_referencia} onChange={(event) => updateForm('documento_referencia', event.target.value)} />
              </CampoForm>
              <CampoForm label="Tipo de contrato">
                <input className="input" value={form.tipo_contrato} onChange={(event) => updateForm('tipo_contrato', event.target.value)} />
              </CampoForm>
              <CampoForm label="Sistema de amortização">
                <select className="input" value={form.sistema_amortizacao} onChange={(event) => updateForm('sistema_amortizacao', event.target.value)}>
                  <option value="FIXO">Parcelas fixas por valor informado</option>
                  <option value="PRICE">Tabela PRICE</option>
                  <option value="SAC">SAC</option>
                </select>
              </CampoForm>
            </FormSecao>

            <FormSecao legenda="Prazos e parcelas" colunas={2}>
              <CampoForm label="Data do contrato" obrigatorio>
                <DateInputBR className="input" value={form.data_contrato} onChange={(event) => updateForm('data_contrato', event.target.value)} required />
              </CampoForm>
              <CampoForm label="Data do crédito" obrigatorio>
                <DateInputBR className="input" value={form.data_credito} onChange={(event) => updateForm('data_credito', event.target.value)} required />
              </CampoForm>
              <CampoForm label="Primeiro vencimento" obrigatorio>
                <DateInputBR className="input" value={form.primeiro_vencimento} onChange={(event) => updateForm('primeiro_vencimento', event.target.value)} required />
              </CampoForm>
              <CampoForm label="Parcelas" obrigatorio>
                <input className="input" type="number" min="1" max="240" value={form.quantidade_parcelas} onChange={(event) => updateForm('quantidade_parcelas', event.target.value)} required />
              </CampoForm>
            </FormSecao>

            {/* R6 — campo monetário dimensionado pelo pior caso:
                `.input-moeda` dá o piso de 180px, alinha à direita e usa
                tabular-nums. Antes eram `.input` comuns, do tamanho da
                coluna do grid. */}
            <FormSecao legenda="Valores" colunas={2}>
              <CampoForm label="Valor do crédito" obrigatorio>
                <input className="input input-moeda" inputMode="decimal" value={formatCurrencyInput(form.valor_credito)} onChange={(event) => updateMoneyField('valor_credito', event.target.value)} required />
              </CampoForm>
              <CampoForm
                label="Juros total"
                hint={['PRICE', 'SAC'].includes(form.sistema_amortizacao) && Number(form.taxa_juros_mensal || 0) > 0
                  ? 'Calculado pela taxa mensal no sistema escolhido.'
                  : undefined}
              >
                <input className="input input-moeda" inputMode="decimal" value={formatCurrencyInput(form.valor_juros_total)} onChange={(event) => updateMoneyField('valor_juros_total', event.target.value)} disabled={['PRICE', 'SAC'].includes(form.sistema_amortizacao) && Number(form.taxa_juros_mensal || 0) > 0} />
              </CampoForm>
              <CampoForm label="Taxa mensal (%)">
                <input className="input" type="number" step="0.0001" min="0" value={form.taxa_juros_mensal} onChange={(event) => updateForm('taxa_juros_mensal', event.target.value)} />
              </CampoForm>
              <CampoForm label="IOF">
                <input className="input input-moeda" inputMode="decimal" value={formatCurrencyInput(form.valor_iof)} onChange={(event) => updateMoneyField('valor_iof', event.target.value)} />
              </CampoForm>
              <CampoForm label="Tarifas">
                <input className="input input-moeda" inputMode="decimal" value={formatCurrencyInput(form.valor_tarifas)} onChange={(event) => updateMoneyField('valor_tarifas', event.target.value)} />
              </CampoForm>
              <CampoForm label="Observações" tipo="texto-longo">
                <textarea className="input" rows={3} value={form.observacoes} onChange={(event) => updateForm('observacoes', event.target.value)} />
              </CampoForm>
            </FormSecao>

            <p className="app-note">
              Prévia: {previewParcelas.length} parcela(s), amortização {formatCurrency(previewTotais.principal)},
              juros {formatCurrency(previewTotais.juros)}, encargos {formatCurrency(previewTotais.encargos)},
              total {formatCurrency(previewTotais.total)}.
            </p>
          </form>

          {/* C5/D3 — três pesos visíveis: UM primário sólido, secundário em
              contorno. R27: o rodapé NÃO rola, e é por isso que ele é filho
              direto do modal — o botão que executa a ação liga ao formulário
              pelo atributo `form`, em vez de morar dentro dele. */}
          <div data-modal="rodape" className="app-actionbar border-t border-[var(--c-border)] p-4">
            <button type="button" className="btn btn-outline" onClick={() => setForm(EMPTY_FORM)} disabled={saving}>Limpar</button>
            <button type="submit" form="form-novo-financiamento" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Cadastrar financiamento'}
            </button>
          </div>
        </OverlayModal>
      ) : null}

      {/* R3/R27 — a casca de modal do sistema no lugar do `fixed inset-0`
          com fundo preto escrito na tela; o corpo rolante e o rodapé fixo
          são do componente. */}
      {editingParcela ? (
        <OverlayModal
          rotulo={`Editar parcela ${editingParcela.numero_parcela}`}
          largura="var(--modal-max-w-lg, 860px)"
          onFechar={() => setEditingParcela(null)}
        >
          <div data-modal="cabecalho" className="flex items-start justify-between gap-4 border-b border-[var(--c-border)] p-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--c-text)]">Editar parcela #{editingParcela.numero_parcela}</h2>
              <p className="text-sm text-[var(--c-muted)]">
                Ajuste amortização e juros. Parcelas já baixadas ficam bloqueadas.
              </p>
            </div>
            <button type="button" className="btn btn-outline" onClick={() => setEditingParcela(null)} aria-label="Fechar">
              <HiOutlineXMark aria-hidden="true" />
            </button>
          </div>

          <form id="form-parcela-financiamento" className="p-4" onSubmit={salvarParcela}>
            <FormSecao colunas={2}>
              <CampoForm label="Amortização" obrigatorio>
                <input
                  className="input input-moeda"
                  inputMode="decimal"
                  value={formatCurrencyInput(parcelaForm.valor_principal)}
                  onChange={(event) => updateParcelaMoneyField('valor_principal', event.target.value)}
                  required
                />
              </CampoForm>
              <CampoForm label="Juros">
                <input
                  className="input input-moeda"
                  inputMode="decimal"
                  value={formatCurrencyInput(parcelaForm.valor_juros)}
                  onChange={(event) => updateParcelaMoneyField('valor_juros', event.target.value)}
                />
              </CampoForm>
              <CampoForm label="Observações" tipo="texto-longo">
                <textarea
                  className="input"
                  rows={3}
                  value={parcelaForm.observacoes}
                  onChange={(event) => setParcelaForm((current) => ({ ...current, observacoes: event.target.value }))}
                />
              </CampoForm>
            </FormSecao>

            <p className="app-note">
              Total recalculado:{' '}
              <strong className="valor-tabular text-[var(--c-text)]">
                {formatCurrency(Number(parcelaForm.valor_principal || 0) + Number(parcelaForm.valor_juros || 0) + Number(editingParcela.valor_iof || 0) + Number(editingParcela.valor_tarifa || 0))}
              </strong>
            </p>
          </form>

          <div data-modal="rodape" className="app-actionbar border-t border-[var(--c-border)] p-4">
            <button type="button" className="btn btn-outline" onClick={() => setEditingParcela(null)} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" form="form-parcela-financiamento" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar parcela'}
            </button>
          </div>
        </OverlayModal>
      ) : null}

      {elementoConfirmacao}
    </Pagina>
  );
}
