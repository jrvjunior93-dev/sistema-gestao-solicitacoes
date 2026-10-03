import DateInputBR from '../components/DateInputBR';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  baixarFaturaCartaoFinanceiro,
  getContasBancarias,
  getFaturaCartaoFinanceiro
} from '../services/financeiro';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  FormSecao,
  CampoForm,
  StatGrid,
  StatTile,
  TabelaPadrao,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return '-';
  return `${day}/${month}/${year}`;
}

/* R25 — o tom vem da classe do sistema (`badge-*` → --sem-*), nunca de
   paleta crua do Tailwind: `bg-emerald-100`/`text-slate-700` não têm par no
   tema escuro nem passam pelo piso de contraste do ThemeContext (R24). */
function statusBadgeClasse(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PAGA' || normalized === 'QUITADO') return 'badge badge-success';
  if (normalized === 'FECHADA' || normalized === 'ABERTO') return 'badge badge-info';
  if (normalized === 'PARCIAL') return 'badge badge-warning';
  if (normalized === 'CANCELADA' || normalized === 'CANCELADO') return 'badge badge-danger';
  return 'badge badge-muted';
}

function statusTom(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PAGA') return 'success';
  if (normalized === 'PARCIAL') return 'warning';
  if (normalized === 'CANCELADA') return 'danger';
  return undefined;
}

function cartaoLabel(cartao) {
  if (!cartao) return 'Cartao nao informado';
  const final = String(cartao.ultimos_digitos || '').replace(/\D/g, '').slice(-4);
  const bandeira = String(cartao.bandeira || '').trim();
  return final
    ? `${bandeira || 'Cartao'} final ${final}`
    : `Cartao #${cartao.id}`;
}

function contaLabel(conta) {
  if (!conta) return 'Conta nao informada';
  const banco = conta.banco || conta.tipo_operacional || 'Conta';
  return `${conta.nome || `Conta #${conta.id}`} - ${banco}`;
}

function getValorAberto(fatura) {
  return (fatura?.titulos || []).reduce((total, titulo) => {
    if (!['ABERTO', 'PARCIAL'].includes(String(titulo.status || '').toUpperCase())) return total;
    return total + Number(titulo.valor_saldo || titulo.valor_original || 0);
  }, 0);
}

function countTitulosAbertos(fatura) {
  return (fatura?.titulos || []).filter((titulo) => ['ABERTO', 'PARCIAL'].includes(String(titulo.status || '').toUpperCase())).length;
}

export default function FinanceiroFaturaCartaoDetalhe() {
  const { id } = useParams();
  const [fatura, setFatura] = useState(null);
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [processing, setProcessing] = useState(false);
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [baixaForm, setBaixaForm] = useState({
    conta_bancaria_id: '',
    data_pagamento: today(),
    observacoes: ''
  });

  useEffect(() => {
    let active = true;
    setLoading(true);

    getFaturaCartaoFinanceiro(id)
      .then((data) => {
        if (!active) return;
        setFatura(data);
        setBaixaForm((current) => ({
          ...current,
          conta_bancaria_id: String(data.status || '').toUpperCase() === 'PAGA'
            ? data.conta_bancaria_id || ''
            : ''
        }));
      })
      .catch((err) => {
        if (active) avisar.erro(err?.message || 'Erro ao carregar fatura de cartao');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, avisar]);

  useEffect(() => {
    let active = true;
    setLoadingOptions(true);

    getContasBancarias()
      .then((data) => {
        if (active) setContas(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setContas([]);
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const resumo = useMemo(() => ({
    total: Number(fatura?.valor_total || 0),
    aberto: getValorAberto(fatura),
    titulos: (fatura?.titulos || []).length,
    titulosAbertos: countTitulosAbertos(fatura)
  }), [fatura]);

  async function baixarFatura(event) {
    event.preventDefault();
    if (!fatura || processing) return;

    /*
      R26 (04/09) — a referência é FIXADA antes do `await`. O modal do
      sistema não bloqueia a tela como o `prompt` bloqueava: entre a
      pergunta e a ação a fatura em `state` pode ser trocada por uma
      recarga. `faturaAlvo` e `dados` são o que a pessoa leu e autorizou, e
      são o que a ação usa — mesma fatura, mesma conta, mesmo valor.

      DoD (classe "consentimento"): o valor citado na mensagem
      (`faturaAlvo.valor_total`) e a conta citada são exatamente os que vão
      no payload; nada é relido depois da confirmação.
    */
    const faturaAlvo = fatura;
    const dados = { ...baixaForm };
    const contaAlvo = contas.find((conta) => String(conta.id) === String(dados.conta_bancaria_id));

    const { ok } = await confirmar({
      titulo: 'Registrar o pagamento desta fatura?',
      mensagem: `${formatCurrency(faturaAlvo.valor_total)} da fatura ${faturaAlvo.competencia || `#${faturaAlvo.id}`} sairão de ${contaLabel(contaAlvo)} em ${formatDate(dados.data_pagamento)}, e a conta de controle do cartão recebe o crédito de compensação. Esta tela não desfaz a baixa: para voltar atrás é preciso estornar pela tela de baixas.`,
      rotuloConfirmar: 'Baixar fatura'
    });
    if (!ok) return;

    try {
      setProcessing(true);
      const data = await baixarFaturaCartaoFinanceiro(faturaAlvo.id, dados);
      setFatura(data);
      avisar.sucesso('Pagamento da fatura registrado. A conta real recebeu a saída e a conta do cartão recebeu o crédito de compensação.');
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao baixar fatura de cartao');
    } finally {
      setProcessing(false);
    }
  }

  const status = String(fatura?.status || '').toUpperCase();
  const canBaixar = Boolean(fatura) && ['ABERTA', 'FECHADA', 'PARCIAL'].includes(status) && resumo.total > 0;
  const periodo = fatura
    ? `${cartaoLabel(fatura.cartao)} · ${formatDate(fatura.data_inicio)} a ${formatDate(fatura.data_fechamento)} · vence em ${formatDate(fatura.data_vencimento)}`
    : 'Carregando fatura…';

  return (
    <Pagina>
      {/* C3/C4/R11 — tela de DETALHE: a seta de voltar à esquerda é a
          affordance primária de retorno e FICA; o botão "Voltar" solto e os
          links "Faturas"/"Titulos" na barra de ações eram navegação
          disfarçada de ação (C6) e saíram. O título carrega a IDENTIDADE do
          registro (competência), não "Detalhes da Fatura". */}
      <PageHeader
        titulo={fatura ? `Fatura ${fatura.competencia || `#${fatura.id}`}` : 'Fatura de cartão'}
        contagem={fatura ? `${resumo.titulos} título(s)` : ''}
        descricao={periodo}
        voltar={{ to: '/financeiro/faturas-cartao', title: 'Voltar para faturas de cartão' }}
      />

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      {loading ? (
        <BlocoConteudo>
          <p className="text-sm text-[var(--c-muted)]">Carregando fatura…</p>
        </BlocoConteudo>
      ) : !fatura ? (
        <BlocoConteudo>
          <p className="text-sm text-[var(--c-muted)]">Fatura não encontrada.</p>
        </BlocoConteudo>
      ) : (
        <>
          {/* M2/R10 — ladrilho do sistema no lugar dos cartões cujo número e
              cujo ícone traziam tamanho medido à mão, fora da escala. B3: a
              contagem de títulos já vive na faixa fixa e não se repete. */}
          <StatGrid colunas={4}>
            <StatTile label="Situação" valor={fatura.status || 'ABERTA'} tom={statusTom(fatura.status)} />
            <StatTile label="Valor total" valor={formatCurrency(resumo.total)} />
            <StatTile
              label="Saldo aberto"
              valor={formatCurrency(resumo.aberto)}
              tom={resumo.aberto > 0 ? 'warning' : 'success'}
            />
            <StatTile label="Títulos em aberto" valor={String(resumo.titulosAbertos)} />
          </StatGrid>

          {/* B2 — UM bloco principal com barra de cor: é a baixa que responde
              a pergunta central da tela, e ela fica ANTES da lista para não
              ficar abaixo de uma fatura com dezenas de títulos (D4). */}
          {canBaixar ? (
            <BlocoConteudo
              titulo="Baixar fatura"
              variante="primario"
              cor="var(--module-financeiro)"
              descricao="A baixa registra a saída na conta real e credita a conta de controle do cartão."
            >
              <form onSubmit={baixarFatura}>
                {/* R2/R7 — campos da mesma linha com a mesma altura e o mesmo
                    alinhamento: quem mede é o form-grid do FormSecao, não a
                    tela. As classes `app-filter-field` (faixa de filtro) num
                    formulário de entrada saíram. */}
                <FormSecao colunas={2}>
                  <CampoForm label="Conta bancária" obrigatorio>
                    <select
                      className="input"
                      value={baixaForm.conta_bancaria_id}
                      onChange={(event) => setBaixaForm((current) => ({ ...current, conta_bancaria_id: event.target.value }))}
                      disabled={loadingOptions}
                      required
                    >
                      <option value="">Selecione a conta real</option>
                      {contas.map((conta) => (
                        <option key={conta.id} value={conta.id}>{contaLabel(conta)}</option>
                      ))}
                    </select>
                  </CampoForm>
                  <CampoForm label="Data de pagamento" obrigatorio>
                    <DateInputBR
                      className="input"
                      value={baixaForm.data_pagamento}
                      onChange={(event) => setBaixaForm((current) => ({ ...current, data_pagamento: event.target.value }))}
                      required
                    />
                  </CampoForm>
                  <CampoForm label="Observações" tipo="texto-longo">
                    <textarea
                      className="input"
                      rows={3}
                      value={baixaForm.observacoes}
                      onChange={(event) => setBaixaForm((current) => ({ ...current, observacoes: event.target.value }))}
                      placeholder="Opcional"
                    />
                  </CampoForm>
                </FormSecao>
                {/* C5/D3 — UM primário sólido, e ele diz o que vai acontecer. */}
                <div className="app-actionbar">
                  <button type="submit" className="btn btn-primary" disabled={processing}>
                    {processing ? 'Baixando…' : 'Baixar fatura'}
                  </button>
                </div>
              </form>
            </BlocoConteudo>
          ) : (
            <BlocoConteudo titulo="Baixar fatura" variante="secundario">
              <p className="text-sm text-[var(--c-muted)]">
                Esta fatura não possui valor aberto para pagamento ou já foi baixada.
              </p>
            </BlocoConteudo>
          )}

          <BlocoConteudo
            titulo="Títulos da fatura"
            descricao="Lista completa dos títulos vinculados a esta fatura."
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'titulo',
                  titulo: 'Título',
                  tipo: 'codigo',
                  render: (titulo) => (
                    <div>
                      <div className="font-semibold text-[var(--c-text)]">{titulo.codigo || `Titulo #${titulo.id}`}</div>
                      <div className="text-xs text-[var(--c-muted)]">{titulo.descricao || 'Sem descricao'}</div>
                    </div>
                  )
                },
                {
                  id: 'parceiro',
                  titulo: 'Parceiro',
                  // R17: o parceiro NOMEIA o titulo da fatura.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (titulo) => titulo.parceiro?.nome || 'Parceiro nao informado'
                },
                { id: 'vencimento', titulo: 'Vencimento', tipo: 'data', render: (titulo) => formatDate(titulo.data_vencimento) },
                {
                  id: 'status',
                  titulo: 'Status',
                  tipo: 'status',
                  render: (titulo) => <span className={statusBadgeClasse(titulo.status)}>{titulo.status || 'ABERTO'}</span>
                },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (titulo) => <span className="font-semibold">{formatCurrency(titulo.valor_original)}</span> },
                { id: 'saldo', titulo: 'Saldo', tipo: 'valor', render: (titulo) => formatCurrency(titulo.valor_saldo) }
              ]}
              itens={fatura.titulos || []}
              vazio="Nenhum título vinculado a esta fatura."
              storageKey="tabela:fatura-cartao-detalhe:titulos"
              rotuloRolagem="Titulos da fatura"
            />
          </BlocoConteudo>
        </>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
