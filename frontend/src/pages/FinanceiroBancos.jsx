import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineCloudArrowDown,
  HiOutlinePaperAirplane,
  HiOutlinePlus,
  HiOutlineXMark
} from 'react-icons/hi2';
import {
  baixarCaixaPagamentoRemessa,
  gerarCaixaPagamentoRemessa,
  getBankingDashboard,
  getCaixaPagamentoConvenios,
  getCaixaPagamentoRemessas,
  getCaixaPagamentoTitulosElegiveis,
  getContasBancarias,
  salvarCaixaPagamentoConvenio
} from '../services/financeiro';
import OverlayModal from '../components/ui/OverlayModal';
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
import { getCpfCnpjError, maskCpfCnpj, onlyDigits } from '../utils/formatters';
import DateInputBR from '../components/DateInputBR';

/*
 * AS QUATRO CLASSES FANTASMA DESTA TELA (achado de 04/09, fatia 3).
 *
 * `.app-card`, `.app-button`, `.app-button-secondary` e `.app-input` eram
 * usadas em 26 pontos deste arquivo e **nunca foram declaradas em CSS
 * nenhum** — nem aqui, nem no index.css, nem nos componentes padrão. Não é
 * regressão: está assim desde que a tela existe. Classe fantasma passa por
 * qualquer check de FORMA (a R25 vê `.app-input` e lê "classe do sistema")
 * e só some quando alguém cruza o que a tela USA com o que o sistema
 * DECLARA — `scripts/provas/tokensExistem.mjs`.
 *
 * O que a tela PARECIA ter × o que ela TINHA:
 *
 *  - `.app-card` (3x: os MetricCard, as Section e o <header> do topo)
 *      Parecia: superfície branca sobre o canvas, com contorno, raio e
 *      sombra — os "blocos flutuando" da B1/B5.
 *      Era: um <div> transparente. Só o padding utilitário do Tailwind
 *      existia — e, num dos três, num degrau que nem é da escala.
 *      Ou seja: título, métricas e todas as seções eram TEXTO SOLTO sobre
 *      o fundo cinza — B5 reprovando em toda a tela, sem ninguém ver.
 *      Agora: `BlocoConteudo` (`.app-bloco`) e `StatTile` (`.app-stat`).
 *
 *  - `.app-button` + `.app-button-secondary` (5x e 3x, sempre juntas)
 *      Parecia: botão do sistema — 32px de alvo no desktop / 44px no
 *      toque (R2), tom por token, ícone com piso de 18px, hover e foco.
 *      Era: <button> CRU do navegador, com a altura do texto (~21px no
 *      Chrome). Reprova a R2 e a M1 em oito pontos, incluindo o botão que
 *      GERA A REMESSA DE PAGAMENTO.
 *      Agora: `.btn btn-primary` / `.btn btn-outline`.
 *
 *  - `.app-input` (15x: todo o formulário de convênio e a linha da remessa)
 *      Parecia: campo do sistema — altura mínima, borda por token, raio,
 *      anel de foco, placeholder legível.
 *      Era: <input>/<select> CRU, com `mt-1` de margem e nada mais. Quinze
 *      campos sem altura de sistema, sem foco visível e — no campo de
 *      valor — sem o piso de 180px, o alinhamento à direita e o
 *      tabular-nums que a R6 exige.
 *      Agora: `.input` (+ `.input-moeda` onde é dinheiro), dentro de
 *      `CampoForm`/`FormSecao`.
 *
 * A lição que fica: **classe fantasma parece intenção.** Quem lê
 * `className="app-input mt-1"` acredita que há estilo ali, e por isso o
 * defeito atravessa revisões — não há nada errado para ver, só uma coisa
 * ausente que o olho preenche.
 */

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

/* R25 — o tom do estado vem da classe do sistema (`badge-*`, que aponta
   para --sem-*), nunca de paleta crua do Tailwind. `bg-emerald-100`,
   `bg-amber-100`, `bg-rose-100` e `bg-slate-100` não têm par no tema
   escuro e não passam pelo piso de contraste do ThemeContext (R24) —
   `text-slate-500` é 4,34:1 contra o mínimo AA de 4,5:1. */
function statusBadgeClasse(status) {
  const normalized = String(status || '').toUpperCase();
  if (['OK', 'ATIVO', 'CONCLUIDO', 'BAIXADO', 'PROCESSADO', 'SUCESSO'].includes(normalized)) {
    return 'badge badge-success';
  }
  if (['WARNING', 'ACTION', 'PENDENTE', 'ENVIADO_AO_BANCO', 'AGUARDANDO_CONFIRMACAO_BAIXA'].includes(normalized)) {
    return 'badge badge-warning';
  }
  if (['CRITICAL', 'ERRO', 'FALHA_INTEGRACAO', 'REJEITADO', 'CANCELADO'].includes(normalized)) {
    return 'badge badge-danger';
  }
  return 'badge badge-muted';
}

function statusTom(status) {
  const normalized = String(status || '').toUpperCase();
  if (['CRITICAL', 'ERRO', 'FALHA', 'FALHA_INTEGRACAO'].includes(normalized)) return 'danger';
  if (['WARNING', 'ACTION', 'PENDENTE'].includes(normalized)) return 'warning';
  if (['OK', 'ATIVO'].includes(normalized)) return 'success';
  return undefined;
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

function hojeIso() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
}

const convenioInicial = {
  empresa_id: '',
  conta_bancaria_id: '',
  agencia: '',
  agencia_dv: '',
  conta: '',
  conta_dv: '',
  convenio_codigo: '',
  convenio_nome: '',
  compromisso_codigo: '',
  compromisso_nome: '',
  empresa_nome: '',
  empresa_cpf_cnpj: '',
  layout_arquivo_versao: '080',
  layout_lote_versao: '045',
  ambiente: 'HOMOLOGACAO',
  homologado: false,
  ativo: true
};

function CaixaPagamentosPanel({ avisar, limparAvisos, confirmar }) {
  const [contas, setContas] = useState([]);
  const [convenios, setConvenios] = useState([]);
  const [remessas, setRemessas] = useState([]);
  const [titulos, setTitulos] = useState([]);
  const [selectedConvenioId, setSelectedConvenioId] = useState('');
  const [selectedTitulos, setSelectedTitulos] = useState([]);
  const [dataPagamento, setDataPagamento] = useState(hojeIso());
  const [form, setForm] = useState(convenioInicial);
  const [modalConvenio, setModalConvenio] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadBase() {
    try {
      const [contasData, conveniosData, remessasData] = await Promise.all([
        getContasBancarias(),
        getCaixaPagamentoConvenios(),
        getCaixaPagamentoRemessas()
      ]);
      setContas(normalizeList(contasData));
      const conveniosList = normalizeList(conveniosData);
      setConvenios(conveniosList);
      setRemessas(normalizeList(remessasData));
      if (!selectedConvenioId && conveniosList[0]?.id) {
        setSelectedConvenioId(String(conveniosList[0].id));
      }
    } catch (err) {
      avisar.erro(err.message || 'Erro ao carregar dados Caixa Pagamentos');
    }
  }

  async function loadTitulos(convenioId = selectedConvenioId) {
    if (!convenioId) {
      setTitulos([]);
      setSelectedTitulos([]);
      return;
    }
    try {
      const data = await getCaixaPagamentoTitulosElegiveis(convenioId);
      setTitulos(normalizeList(data));
      setSelectedTitulos([]);
    } catch (err) {
      setTitulos([]);
      setSelectedTitulos([]);
      avisar.erro(err.message || 'Erro ao buscar titulos elegiveis');
    }
  }

  useEffect(() => {
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTitulos(selectedConvenioId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConvenioId]);

  function onContaChange(value) {
    const conta = contas.find((item) => String(item.id) === String(value));
    const empresa = conta?.empresa || {};
    setForm((current) => ({
      ...current,
      conta_bancaria_id: value,
      empresa_id: String(conta?.empresa_id || empresa.id || ''),
      empresa_nome: empresa.razao_social || empresa.nome || current.empresa_nome,
      empresa_cpf_cnpj: empresa.cnpj || current.empresa_cpf_cnpj,
      agencia: conta?.agencia || current.agencia,
      conta: conta?.conta || current.conta
    }));
  }

  async function submitConvenio(event) {
    event.preventDefault();
    const documentoErro = getCpfCnpjError(form.empresa_cpf_cnpj, {
      required: true,
      label: 'CPF/CNPJ da empresa'
    });
    if (documentoErro) {
      avisar.erro(documentoErro);
      return;
    }
    setLoading(true);
    limparAvisos();
    try {
      // Payload idêntico ao anterior — a reforma é de layout.
      await salvarCaixaPagamentoConvenio({ ...form, empresa_cpf_cnpj: onlyDigits(form.empresa_cpf_cnpj) });
      setForm(convenioInicial);
      setModalConvenio(false);
      avisar.sucesso('Convênio Caixa de pagamentos salvo.');
      await loadBase();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao salvar convenio');
    } finally {
      setLoading(false);
    }
  }

  function toggleTitulo(id) {
    setSelectedTitulos((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  function alternarTodosTitulos(marcar, ids) {
    setSelectedTitulos(marcar ? [...ids] : []);
  }

  async function gerarRemessa() {
    /*
      R26 (04/09) — tudo o que a ação usa é FIXADO antes do `await`: o
      convênio, a lista de títulos e a data. O modal do sistema não bloqueia
      a tela como o `prompt` bloqueava; trocar o convênio no seletor com a
      confirmação aberta recarrega `titulos` e ZERA `selectedTitulos`, então
      reler o estado depois do `await` faria a tela perguntar sobre N
      títulos e mandar outra lista (ou lista vazia) ao banco.

      DoD (classe "consentimento"): a contagem e o valor citados na mensagem
      saem de `titulosAlvo`/`valorAlvo`, e é `titulosAlvo` que vai no payload.
    */
    const convenioAlvo = selectedConvenioId;
    const titulosAlvo = [...selectedTitulos];
    const dataAlvo = dataPagamento;
    const valorAlvo = titulos
      .filter((titulo) => titulosAlvo.includes(titulo.id))
      .reduce((total, titulo) => total + Number(titulo.valor_saldo || titulo.valor_original || 0), 0);

    if (!convenioAlvo || !titulosAlvo.length) return;

    const { ok } = await confirmar({
      titulo: 'Gerar a remessa de pagamento?',
      mensagem: `${titulosAlvo.length} título(s), somando ${formatCurrency(valorAlvo)}, entram num arquivo CNAB240 de pagamento com data ${dataAlvo}. O arquivo é gerado e fica registrado; esta tela não desfaz a geração — cancelar depois é tratativa junto ao banco.`,
      rotuloConfirmar: 'Gerar remessa'
    });
    if (!ok) return;

    setLoading(true);
    limparAvisos();
    try {
      const remessa = await gerarCaixaPagamentoRemessa({
        convenio_id: convenioAlvo,
        titulo_ids: titulosAlvo,
        data_pagamento: dataAlvo
      });
      avisar.sucesso(`Remessa ${remessa.nome_arquivo} gerada com sucesso.`);
      setSelectedTitulos([]);
      await Promise.all([loadBase(), loadTitulos(convenioAlvo)]);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao gerar remessa Caixa');
    } finally {
      setLoading(false);
    }
  }

  async function baixarRemessa(id) {
    try {
      const { blob, filename } = await baixarCaixaPagamentoRemessa(id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao baixar remessa Caixa');
    }
  }

  const valorSelecionado = titulos
    .filter((titulo) => selectedTitulos.includes(titulo.id))
    .reduce((total, titulo) => total + Number(titulo.valor_saldo || titulo.valor_original || 0), 0);

  return (
    <>
      <BlocoConteudo
        titulo="Caixa Pagamentos CNAB240"
        contagem={`${selectedTitulos.length} título(s) · ${formatCurrency(valorSelecionado)}`}
        descricao="Remessas reais de pagamento de boleto por código de barras/linha digitável, separadas das remessas de cobrança."
        acoes={(
          <>
            {/* D3 — as ações do bloco ficam VISÍVEIS, em três pesos: o
                cadastro raro (R9) abre em modal pelo secundário, e o
                primário é o que executa o pagamento. */}
            <button type="button" className="btn btn-outline" onClick={() => { setForm(convenioInicial); setModalConvenio(true); }}>
              <HiOutlinePlus aria-hidden="true" />
              Novo convênio
            </button>
            <button type="button" className="btn btn-outline" onClick={loadBase} disabled={loading}>
              <HiOutlineArrowPath aria-hidden="true" className={loading ? 'animate-spin' : ''} />
              Atualizar Caixa
            </button>
          </>
        )}
      >
        {/* R12 — este `select` é SELETOR DE CONTEXTO, não filtro de lista:
            escolhe QUAL convênio a remessa usa, e a lista abaixo (e o
            arquivo gerado) herdam a escolha. Continua legítimo pela regra.
            R2/R7 — os dois campos da linha compartilham altura e linha de
            base pelo form-grid; nenhum deles mede a si mesmo (a grade
            `1fr 180px auto` escrita na tela saiu). */}
        <FormSecao legenda="Gerar remessa de pagamento" colunas={2}>
          <CampoForm label="Convênio Caixa" obrigatorio>
            <select className="input" value={selectedConvenioId} onChange={(e) => setSelectedConvenioId(e.target.value)}>
              <option value="">Selecione um convênio</option>
              {convenios.map((convenio) => (
                <option key={convenio.id} value={convenio.id}>
                  {convenio.empresa?.razao_social || convenio.empresa_nome} - {convenio.compromisso_codigo || convenio.convenio_codigo}
                </option>
              ))}
            </select>
          </CampoForm>
          <CampoForm label="Data de pagamento" obrigatorio>
            <DateInputBR className="input" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
          </CampoForm>
        </FormSecao>

        {/* C5/D3 — UM primário sólido, e ele diz o que vai acontecer. Fica
            fora do FormSecao de propósito: botão não é campo, e envolvê-lo
            num <label> faria o rótulo do campo disputar o clique com ele. */}
        <div className="app-actionbar">
          <button
            type="button"
            className="btn btn-primary"
            onClick={gerarRemessa}
            disabled={!selectedConvenioId || !selectedTitulos.length || loading}
          >
            <HiOutlinePaperAirplane aria-hidden="true" />
            Gerar remessa
          </button>
        </div>

        <TabelaPadrao
          // R16b — a marcação em lote é capacidade do componente (com
          // "todos" no cabeçalho e estado indeterminado), não uma coluna de
          // checkbox montada à mão dentro de um `tipo: 'status'`.
          selecao={{
            selecionados: selectedTitulos,
            aoAlternar: (id) => toggleTitulo(id),
            aoAlternarTodos: alternarTodosTitulos
          }}
          colunas={[
            { id: 'codigo', titulo: 'Título', tipo: 'codigo', render: (titulo) => titulo.codigo },
            {
              id: 'fornecedor',
              titulo: 'Fornecedor',
              // R17: o fornecedor NOMEIA o titulo elegivel.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (titulo) => titulo.parceiro?.nome || '-'
            },
            { id: 'vencimento', titulo: 'Venc.', tipo: 'data', render: (titulo) => titulo.data_vencimento || '-' },
            { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (titulo) => formatCurrency(titulo.valor_saldo || titulo.valor_original) }
          ]}
          itens={titulos}
          storageKey="tabela:financeiro-bancos:titulos-elegiveis"
          rotuloRolagem="Titulos elegiveis para remessa"
          vazio="Nenhum título elegível encontrado."
        />
      </BlocoConteudo>

      <BlocoConteudo titulo="Remessas geradas" descricao="Arquivos CNAB240 já produzidos por esta tela.">
        <TabelaPadrao
          colunas={[
            {
              id: 'arquivo',
              titulo: 'Arquivo',
              // R17: o nome do arquivo NOMEIA a remessa gerada.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (remessa) => remessa.nome_arquivo
            },
            { id: 'empresa', titulo: 'Empresa', tipo: 'texto', render: (remessa) => remessa.empresa?.razao_social || remessa.empresa?.nome || '-' },
            { id: 'status', titulo: 'Status', tipo: 'status', render: (remessa) => <span className={statusBadgeClasse(remessa.status)}>{remessa.status}</span> },
            { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (remessa) => formatCurrency(remessa.valor_total) }
          ]}
          itens={remessas}
          storageKey="tabela:financeiro-bancos:remessas"
          vazio="Sem registros para exibir."
          rotuloRolagem="Remessas geradas"
          larguraAcoes={140}
          acoesLinha={(remessa) => (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => baixarRemessa(remessa.id)}>
              <HiOutlineCloudArrowDown aria-hidden="true" />
              Baixar
            </button>
          )}
        />
      </BlocoConteudo>

      {/* R9/R1 — cadastro esporádico abre em MODAL do sistema, não inline
          na tela: o formulário de convênio dividia a tela ao meio e empurrava
          a lista de títulos para uma coluna estreita.
          R27 — corpo rolante e rodapé fixo são do OverlayModal; a tela não
          escreve `overflow-y` nenhum, e o botão de salvar fica sempre à
          vista mesmo com os quinze campos abertos. */}
      {modalConvenio ? (
        <OverlayModal
          rotulo="Novo convênio Caixa de pagamentos"
          largura="var(--modal-max-w-xl, 1080px)"
          onFechar={() => setModalConvenio(false)}
        >
          <div data-modal="cabecalho" className="flex items-start justify-between gap-4 border-b border-[var(--c-border)] p-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--c-text)]">Cadastrar convênio Caixa</h2>
              <p className="text-sm text-[var(--c-muted)]">
                A empresa do convênio será identificada pela conta de débito.
              </p>
            </div>
            <button type="button" className="btn btn-outline" onClick={() => setModalConvenio(false)} aria-label="Fechar">
              <HiOutlineXMark aria-hidden="true" />
            </button>
          </div>

          <form id="form-convenio-caixa" className="p-4" onSubmit={submitConvenio}>
            {/* R2/R7 — todos os campos com a MESMA altura e a mesma linha de
                base: quem mede é o form-grid, não a tela. Antes eram
                `<input>`/`<select>` crus do navegador (ver o comentário da
                classe fantasma no topo do arquivo). */}
            <FormSecao legenda="Empresa e conta" colunas={2}>
              <CampoForm label="Conta de débito" obrigatorio>
                <select className="input" value={form.conta_bancaria_id} onChange={(e) => onContaChange(e.target.value)} required>
                  <option value="">Selecione</option>
                  {contas.map((conta) => (
                    <option key={conta.id} value={conta.id}>{conta.nome || conta.banco} - {conta.agencia}/{conta.conta}{conta.empresa?.nome ? ` - ${conta.empresa.nome}` : ''}</option>
                  ))}
                </select>
              </CampoForm>
              <CampoForm label="Nome da empresa no convênio" obrigatorio linha>
                <input className="input" value={form.empresa_nome} onChange={(e) => setForm({ ...form, empresa_nome: e.target.value })} required />
              </CampoForm>
              <CampoForm label="CNPJ/CPF da empresa" obrigatorio>
                <input
                  className="input"
                  value={maskCpfCnpj(form.empresa_cpf_cnpj)}
                  onChange={(e) => setForm({ ...form, empresa_cpf_cnpj: maskCpfCnpj(e.target.value) })}
                  inputMode="numeric"
                  maxLength={18}
                  required
                />
              </CampoForm>
              <CampoForm label="Ambiente">
                <select className="input" value={form.ambiente} onChange={(e) => setForm({ ...form, ambiente: e.target.value })}>
                  <option value="HOMOLOGACAO">Homologação</option>
                  <option value="PRODUCAO">Produção</option>
                </select>
              </CampoForm>
            </FormSecao>

            <FormSecao legenda="Convênio e compromisso" colunas={2}>
              <CampoForm label="Código do convênio" obrigatorio>
                <input className="input" value={form.convenio_codigo} onChange={(e) => setForm({ ...form, convenio_codigo: e.target.value })} required />
              </CampoForm>
              <CampoForm label="Nome do convênio">
                <input className="input" value={form.convenio_nome} onChange={(e) => setForm({ ...form, convenio_nome: e.target.value })} placeholder="Ex.: CONSTRUTORA SUL CAPIXABA..." />
              </CampoForm>
              <CampoForm
                label="Código do compromisso"
                hint="Para a Caixa, o código do compromisso é o identificador operacional do CNAB quando informado. Vazio, o sistema usa o código do convênio."
              >
                <input className="input" value={form.compromisso_codigo} onChange={(e) => setForm({ ...form, compromisso_codigo: e.target.value })} placeholder="Ex.: 0001" />
              </CampoForm>
              <CampoForm label="Nome do compromisso">
                <input className="input" value={form.compromisso_nome} onChange={(e) => setForm({ ...form, compromisso_nome: e.target.value })} placeholder="Ex.: PAG FORN 0557 003..." />
              </CampoForm>
            </FormSecao>

            <FormSecao legenda="Agência e conta no arquivo" colunas={4}>
              <CampoForm label="Agência" obrigatorio>
                <input className="input" value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} required />
              </CampoForm>
              <CampoForm label="Dígito da agência">
                <input className="input" value={form.agencia_dv} onChange={(e) => setForm({ ...form, agencia_dv: e.target.value })} />
              </CampoForm>
              <CampoForm label="Conta" obrigatorio>
                <input className="input" value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} required />
              </CampoForm>
              <CampoForm label="Dígito da conta">
                <input className="input" value={form.conta_dv} onChange={(e) => setForm({ ...form, conta_dv: e.target.value })} />
              </CampoForm>
              <CampoForm label="Convênio homologado" linha>
                <label className="flex items-center gap-2 text-sm text-[var(--c-text)]">
                  <input type="checkbox" checked={form.homologado} onChange={(e) => setForm({ ...form, homologado: e.target.checked })} />
                  O banco já homologou este convênio
                </label>
              </CampoForm>
            </FormSecao>
          </form>

          {/* C5/D3 — o rodapé não rola (R27), e o botão que executa a ação
              liga ao formulário pelo atributo `form`. */}
          <div data-modal="rodape" className="app-actionbar border-t border-[var(--c-border)] p-4">
            <button type="button" className="btn btn-outline" onClick={() => setModalConvenio(false)} disabled={loading}>Cancelar</button>
            <button type="submit" form="form-convenio-caixa" className="btn btn-primary" disabled={loading}>
              {loading ? 'Salvando…' : 'Salvar convênio'}
            </button>
          </div>
        </OverlayModal>
      ) : null}
    </>
  );
}

export default function FinanceiroBancos() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const { avisos, avisar, fechar: fecharAviso, limpar: limparAvisos } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  async function loadDashboard() {
    setLoading(true);
    setFalhou(false);
    try {
      const data = await getBankingDashboard();
      setDashboard(data);
    } catch (err) {
      setFalhou(true);
      avisar.erro(err.message || 'Erro ao carregar painel bancario enterprise');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshots = dashboard?.snapshots || {};
  const summary = dashboard?.summary || {};
  const alerts = dashboard?.alerts || [];
  const cnab = dashboard?.cnab240_payments || {};

  // A leitura de saúde tem de acompanhar a falha de carga: sem isto o
  // ladrilho diria "OK" com o painel vazio, que é pior que dizer nada.
  const statusLabel = useMemo(() => {
    if (loading) return 'Carregando';
    if (falhou) return 'Falha';
    return dashboard?.status || 'OK';
  }, [dashboard?.status, falhou, loading]);

  return (
    <Pagina>
      {/* R13/C1/C2/R5 — faixa fixa do sistema. O <header> custom com o rótulo
          "Financeiro" em versalete, o <h1> com tamanho escrito na tela e o
          parágrafo de apoio de três linhas saíram: título, contagem e apoio
          são do PageHeader, numa linha só. */}
      <PageHeader
        titulo="Bancos"
        contagem={`${summary?.accounts?.active || 0} conta(s) ativa(s)`}
        descricao="Contas, pagamentos BB, boletos Caixa, remessas, retornos, conciliação e financiamentos — observabilidade, sem alterar a operação."
        secundarias={[
          {
            rotulo: 'Atualizar',
            onClick: () => { limparAvisos(); loadDashboard(); },
            desabilitada: loading,
            icone: <HiOutlineArrowPath aria-hidden="true" />
          }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      {/* M2/R10 — o ladrilho do sistema no lugar dos quatro `MetricCard`
          locais, cujo rótulo, número e ícone traziam tamanho escrito à mão,
          fora da escala. B3: a contagem de contas ativas já vive na faixa
          fixa, e aqui aparece o total cadastrado, que é outro número. */}
      <StatGrid colunas={4}>
        <StatTile label="Saúde bancária" valor={statusLabel} sub={formatDateTime(dashboard?.generated_at)} tom={statusTom(statusLabel)} />
        <StatTile label="Contas cadastradas" valor={String(summary?.accounts?.total || 0)} />
        <StatTile
          label="Conciliação pendente"
          valor={String(summary?.reconciliation?.pending || 0)}
          sub={formatCurrency(summary?.reconciliation?.pending_value)}
          tom={(summary?.reconciliation?.pending || 0) > 0 ? 'warning' : undefined}
        />
        <StatTile
          label="Alertas operacionais"
          valor={String(alerts.length)}
          sub="Pontos para acompanhamento"
          tom={alerts.length ? 'warning' : undefined}
        />
      </StatGrid>

      {/* B2 — UM bloco principal com barra de cor: é o alerta que responde a
          pergunta central de um painel de observabilidade. */}
      <BlocoConteudo
        titulo="Alertas operacionais"
        variante="primario"
        cor="var(--sem-warning)"
        descricao="Pontos que podem gerar distorção de saldo, baixa ou retorno bancário."
      >
        {!alerts.length ? (
          <p className="text-sm text-[var(--c-muted)]">Nenhum alerta operacional encontrado.</p>
        ) : (
          <TabelaPadrao
            colunas={[
              {
                id: 'alerta',
                titulo: 'Alerta',
                // R17: o título do alerta NOMEIA a ocorrência.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (alerta) => (
                  <div>
                    <div className="font-semibold text-[var(--c-text)]">{alerta.title}</div>
                    <div className="text-xs text-[var(--c-muted)]">{alerta.description}</div>
                  </div>
                )
              },
              { id: 'origem', titulo: 'Origem', tipo: 'texto', render: (alerta) => alerta.source || '-' },
              {
                id: 'severidade',
                titulo: 'Severidade',
                tipo: 'status',
                render: (alerta) => <span className={statusBadgeClasse(alerta.severity)}>{alerta.severity}</span>
              }
            ]}
            itens={alerts}
            getId={(alerta) => `${alerta.type}-${alerta.severity}`}
            storageKey="tabela:financeiro-bancos:alertas"
            rotuloRolagem="Alertas operacionais"
            vazio="Nenhum alerta operacional encontrado."
          />
        )}
      </BlocoConteudo>

      <CaixaPagamentosPanel avisar={avisar} limparAvisos={limparAvisos} confirmar={confirmar} />

      <BlocoConteudo
        titulo="Contas bancárias"
        descricao="Contas vinculadas a empresas do grupo e saldo operacional estimado pelos movimentos registrados."
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'conta',
              titulo: 'Conta',
              // R17: a conta/banco NOMEIA o registro.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (account) => account.nome || account.banco || `Conta #${account.id}`
            },
            { id: 'empresa', titulo: 'Empresa', tipo: 'texto', render: (account) => account.empresa?.nome || account.empresa?.razao_social || '-' },
            { id: 'status', titulo: 'Status', tipo: 'status', render: (account) => <span className={statusBadgeClasse(account.ativo ? 'ATIVO' : 'INATIVO')}>{account.ativo ? 'ATIVO' : 'INATIVO'}</span> },
            { id: 'saldo', titulo: 'Saldo estimado', tipo: 'valor', render: (account) => formatCurrency(account.saldo_operacional_estimado) }
          ]}
          itens={snapshots.accounts?.data?.items || []}
          storageKey="tabela:financeiro-bancos:contas"
          vazio="Sem registros para exibir."
          rotuloRolagem="Contas bancarias"
        />
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Pagamentos BB"
        descricao="Lotes e transações do motor de pagamento em massa."
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'lote',
              titulo: 'Lote',
              // R17: o codigo do lote NOMEIA o pagamento em massa.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (batch) => batch.codigo || `#${batch.id}`
            },
            { id: 'status', titulo: 'Status', tipo: 'status', render: (batch) => <span className={statusBadgeClasse(batch.status)}>{batch.status || '-'}</span> },
            { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (batch) => formatCurrency(batch.valor_total) },
            { id: 'atualizado', titulo: 'Atualizado', tipo: 'data', render: (batch) => formatDateTime(batch.updatedAt) }
          ]}
          itens={snapshots.bb_payments?.data?.recent_batches || []}
          storageKey="tabela:financeiro-bancos:pagamentos-bb"
          vazio="Sem registros para exibir."
          rotuloRolagem="Lotes de pagamento BB"
        />
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Conciliação bancária"
        descricao="Importações OFX e movimentos pendentes, para evitar baixa duplicada ou saldo distorcido."
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'movimento',
              titulo: 'Movimento',
              // R17: a descricao do banco NOMEIA o movimento conciliado.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => item.descricao_banco || item.documento || `Movimento #${item.id}`
            },
            { id: 'status', titulo: 'Status', tipo: 'status', render: (item) => <span className={statusBadgeClasse(item.status)}>{item.status || '-'}</span> },
            { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => formatCurrency(item.valor) },
            { id: 'data', titulo: 'Data', tipo: 'data', render: (item) => item.data_movimento || '-' }
          ]}
          itens={snapshots.reconciliation?.data?.recent || []}
          storageKey="tabela:financeiro-bancos:conciliacao"
          vazio="Sem registros para exibir."
          rotuloRolagem="Movimentos de conciliacao"
        />
      </BlocoConteudo>

      {/* Blocos de consulta esporádica nascem RECOLHIDOS (o título fica
          sempre à vista, então nada some — recolher e reorganizar é livre,
          remover é que exigiria decisão do cliente). É o que faz o painel
          caber na tela sem apertar a leitura (D4). */}
      <BlocoConteudo
        titulo="Boletos Caixa"
        descricao="Remessas, retornos e ocorrências de cobrança, separados do CNAB240 de pagamentos."
        recolhivel
        recolhidoPadrao
      >
        <TabelaPadrao
          colunas={[
            { id: 'origem', titulo: 'Origem', tipo: 'badge', render: (item) => item.origem },
            {
              id: 'codigo',
              titulo: 'Código',
              // R17: o codigo/arquivo NOMEIA a remessa ou o retorno.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => item.codigo || item.nome_arquivo || `#${item.id}`
            },
            { id: 'status', titulo: 'Status', tipo: 'status', render: (item) => <span className={statusBadgeClasse(item.status)}>{item.status || '-'}</span> },
            { id: 'data', titulo: 'Data', tipo: 'data', render: (item) => formatDateTime(item.createdAt) }
          ]}
          itens={[
            ...(snapshots.caixa_boletos?.data?.remessas?.recent || []).map((item) => ({ ...item, origem: 'Remessa' })),
            ...(snapshots.caixa_boletos?.data?.retornos?.recent || []).map((item) => ({ ...item, origem: 'Retorno' }))
          ].slice(0, 8)}
          getId={(item) => `${item.origem}-${item.id}`}
          storageKey="tabela:financeiro-bancos:boletos-caixa"
          vazio="Sem registros para exibir."
          rotuloRolagem="Remessas e retornos de boletos Caixa"
        />
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Financiamentos bancários"
        descricao="Contratos bancários que geram títulos e movimentam contas de crédito."
        recolhivel
        recolhidoPadrao
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'contrato',
              titulo: 'Contrato',
              // R17: o contrato NOMEIA o financiamento.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => item.codigo || item.numero_contrato || `#${item.id}`
            },
            { id: 'status', titulo: 'Status', tipo: 'status', render: (item) => <span className={statusBadgeClasse(item.status)}>{item.status || '-'}</span> },
            { id: 'parcelas', titulo: 'Parcelas', tipo: 'numero', render: (item) => item.quantidade_parcelas || '-' },
            { id: 'total', titulo: 'Total', tipo: 'valor', render: (item) => formatCurrency(item.valor_total) }
          ]}
          itens={snapshots.financing?.data?.recent || []}
          storageKey="tabela:financeiro-bancos:financiamentos"
          vazio="Sem registros para exibir."
          rotuloRolagem="Financiamentos bancarios"
        />
      </BlocoConteudo>

      <BlocoConteudo
        titulo="CNAB240 Pagamentos — contrato técnico"
        descricao="Preparado a partir do manual de pagamentos e débito automático."
        recolhivel
        recolhidoPadrao
      >
        <p className="text-sm text-[var(--c-text)]">
          <span className={statusBadgeClasse('OK')}>Segmento J habilitado</span>{' '}
          <span className="text-xs text-[var(--c-muted)]">{cnab.status || 'BOLETO_SEGMENTO_J_READY'}</span>
        </p>
        <p className="mt-3 text-sm font-semibold text-[var(--c-text)]">Segmentos planejados</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(cnab.supported_segments || []).map((segment) => (
            <span key={segment.code} className="badge badge-muted">
              {segment.code} - {segment.name}
            </span>
          ))}
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-[var(--c-muted)]">
          {(cnab.guardrails || []).slice(0, 5).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Timeline bancária"
        descricao="Linha de eventos consolidada entre pagamentos, boletos e conciliação."
        recolhivel
        recolhidoPadrao
      >
        <TabelaPadrao
          // Sem coluna de IDENTIDADE por natureza: a linha da timeline é um
          // EVENTO no tempo — o rótulo já é a coluna-título e o que a
          // distingue é o instante, não um nome próprio.
          semIdentidade
          colunas={[
            {
              id: 'evento',
              titulo: 'Evento',
              tipo: 'texto',
              noCard: 'titulo',
              render: (event) => (
                <div>
                  <div className="font-medium text-[var(--c-text)]">{event.label}</div>
                  <div className="text-xs text-[var(--c-muted)]">{event.source} - {event.type}</div>
                </div>
              )
            },
            { id: 'status', titulo: 'Status', tipo: 'status', render: (event) => <span className={statusBadgeClasse(event.status)}>{event.status || '-'}</span> },
            { id: 'quando', titulo: 'Quando', tipo: 'data', render: (event) => formatDateTime(event.occurred_at) }
          ]}
          itens={dashboard?.timeline || []}
          storageKey="tabela:financeiro-bancos:timeline"
          vazio="Sem registros para exibir."
          rotuloRolagem="Timeline bancaria"
        />
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
