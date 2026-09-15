import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineArrowRight,
  HiOutlineArrowUpTray,
  HiOutlineBanknotes,
  HiOutlineEye,
  HiOutlinePlus,
  HiOutlineXMark
} from 'react-icons/hi2';
import PessoaChequeAutocomplete from '../components/financeiro/PessoaChequeAutocomplete';
import OverlayModal from '../components/ui/OverlayModal';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BarraFiltros,
  alternarValorFiltro,
  StatGrid,
  StatTile,
  CelulaDupla,
  TabelaPadrao,
  Avisos,
  useAvisos,
  useFiltrosVisiveis
} from '../components/padrao';
import { useAuth } from '../contexts/AuthContext';
import {
  baixarModeloChequesTerceiros,
  confirmarImportacaoChequesTerceiros,
  criarChequeTerceiro,
  getChequeTerceiro,
  getChequesTerceiros,
  getContasBancarias,
  movimentarChequeTerceiro,
  previewImportacaoChequesTerceiros
} from '../services/financeiro';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import { hasPermissao } from '../utils/acessoProduto';
import { maskCpfCnpj, normalizeCurrencyTyping, parseCurrencyInput } from '../utils/formatters';
import DateInputBR from '../components/DateInputBR';

const STATUS_LABELS = {
  EM_CARTEIRA: 'Em carteira',
  RESERVADO: 'Reservado',
  UTILIZADO: 'Utilizado',
  DEPOSITADO: 'Depositado',
  COMPENSADO: 'Compensado',
  DEVOLVIDO: 'Devolvido',
  CANCELADO: 'Cancelado'
};

function createEmptyForm() {
  return {
  empresa_id: '', numero_cheque: '', titular_parceiro_id: '', titular_nome: '', titular_documento: '',
  parceiro_entregou_id: '', cliente_nome: '', cliente_documento: '', banco: '', agencia: '', conta: '',
  valor: '', data_vencimento: '', data_entrada: new Date().toISOString().slice(0, 10),
  motivo_origem: 'Saldo inicial sem lastro de obra identificado', observacoes: ''
  };
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateBr(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

/* R25/R18 — a casca à mão (overlay `bg-slate-950/55`, sombra e raio
   próprios) virou a do sistema: `OverlayModal` sai do `.layout-main`, usa
   `--modal-overlay` e recorta com `clip`, nunca `hidden`. */
function Modal({ title, subtitle, children, onClose, wide = false }) {
  return (
    <OverlayModal
      rotulo={title}
      largura={wide ? 'var(--modal-max-w-xl, 1080px)' : 'var(--modal-max-w-lg, 860px)'}
      onFechar={onClose}
    >
      <header className="flex items-start justify-between gap-4 border-b border-[var(--c-border)] p-4">
        <div><h2 className="app-confirmacao-titulo">{title}</h2>{subtitle ? <p className="mt-1 text-sm text-[var(--c-muted)]">{subtitle}</p> : null}</div>
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose} aria-label="Fechar"><HiOutlineXMark className="h-4 w-4" aria-hidden="true" /></button>
      </header>
      {/* O painel do OverlayModal tem altura máxima e recorta com `clip`
          (R18) — quem rola é o corpo. Sem esta linha, formulário e preview
          de importação longos seriam CORTADOS sem barra de rolagem. */}
      <div className="min-h-0 overflow-y-auto p-4">{children}</div>
    </OverlayModal>
  );
}

/* R25 — o tom do status vem do `badge-*` do sistema (tokens --sem-*), que
   tem par no tema escuro e passa pelo piso de contraste do ThemeContext
   (R24). `bg-emerald-100`/`text-slate-700` não têm nem um nem outro. */
function StatusBadge({ status }) {
  const normalized = String(status || '').toUpperCase();
  const tone = normalized === 'EM_CARTEIRA' || normalized === 'COMPENSADO' ? 'badge badge-success'
    : normalized === 'DEPOSITADO' ? 'badge badge-warning'
    : normalized === 'DEVOLVIDO' || normalized === 'CANCELADO' ? 'badge badge-danger'
      : 'badge badge-muted';
  return <span className={tone}>{STATUS_LABELS[normalized] || normalized || '-'}</span>;
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
  { id: 'empresa_id', rotulo: 'Empresa detentora' },
  { id: 'status', rotulo: 'Status' }
];

/*
  O recorte com que a tela ABRE. Existe para o `preenchidos` do painel: o
  valor que o SISTEMA propõe (`status: 'EM_CARTEIRA'`) não conta como
  preenchido, senão ele revelaria de volta, a cada abertura, o filtro que a
  pessoa escondeu.
*/
const FILTROS_INICIAIS = { q: '', empresa_id: '', status: 'EM_CARTEIRA' };

export default function FinanceiroChequesTerceiros() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ q: '', empresa_id: '', status: 'EM_CARTEIRA' });
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      const valor = String(filters[filtro.id] ?? '').trim();
      return valor !== '' && valor !== String(FILTROS_INICIAIS[filtro.id] ?? '');
    }).map((filtro) => filtro.id),
    [filters]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:financeiro-cheques-terceiros:carteira', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => setFilters((atual) => ({ ...atual, [id]: '' }))
  });
  const [data, setData] = useState({ cheques: [], totais: {}, total: 0 });
  const [empresas, setEmpresas] = useState([]);
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(false);
  /*
    R19 — a faixa de erro de tom próprio (`border-rose-200 bg-rose-50`)
    virou a faixa do sistema. Tudo o que passava por ela é EVENTO: a carga
    falhou agora, a planilha não validou agora, o cheque não salvou agora.
    Fechar a faixa não deixa condição pendente na tela.
  */
  const { avisos, avisar, fechar: fecharAviso, limpar: limparAvisos } = useAvisos();
  const [form, setForm] = useState(createEmptyForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState(null);
  const [actionIdempotencyKey, setActionIdempotencyKey] = useState(null);
  const [actionForm, setActionForm] = useState({ data_evento: new Date().toISOString().slice(0, 10), conta_bancaria_id: '', empresa_destino_id: '', observacoes: '' });

  const canCreate = hasPermissao(user, 'financeiro.cheques.cadastrar');
  const canImport = hasPermissao(user, 'financeiro.cheques.importar');
  const canDeposit = hasPermissao(user, 'financeiro.cheques.depositar');
  const canReturn = hasPermissao(user, 'financeiro.cheques.devolver');
  const canCancel = hasPermissao(user, 'financeiro.cheques.cancelar');
  const canTransfer = hasPermissao(user, 'financeiro.cheques.transferir');

  async function load() {
    setLoading(true);
    try { setData(await getChequesTerceiros(filters)); }
    catch (err) { avisar.erro(err.message || 'Erro ao carregar carteira de cheques.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    Promise.all([getEmpresasGrupo({ ativo: true }), getContasBancarias()])
      .then(([empresasData, contasData]) => {
        setEmpresas(Array.isArray(empresasData) ? empresasData : empresasData?.items || []);
        setContas(Array.isArray(contasData) ? contasData : contasData?.items || []);
      }).catch(() => {});
  }, []);

  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [filters.q, filters.empresa_id, filters.status]);

  const totalCarteira = Number(data?.totais?.EM_CARTEIRA || 0);
  // O preview de importação é editado por POSIÇÃO na lista; a tabela precisa
  // de um id estável por linha, então o índice viaja junto do registro.
  const linhasImportacao = useMemo(
    () => importRows.map((row, indice) => ({ ...row, __indice: indice })),
    [importRows]
  );
  const contasEmpresaAcao = useMemo(() => contas.filter((item) => Number(item.empresa_id) === Number(selected?.empresa_id)), [contas, selected]);

  async function submitCreate(event) {
    event.preventDefault();
    if (!form.titular_parceiro_id) {
      // AVISO (alerta): responde ao clique de agora; não há ação a segurar.
      avisar.alerta('Selecione o titular na pesquisa de pessoas cadastradas.');
      return;
    }
    setSaving(true); limparAvisos();
    try {
      const { cliente_documento: _clienteDocumento, ...payload } = form;
      await criarChequeTerceiro({ ...payload, valor: parseCurrencyInput(form.valor) });
      setCreateOpen(false); setForm(createEmptyForm()); await load();
    } catch (err) { avisar.erro(err.message || 'Erro ao cadastrar cheque.'); }
    finally { setSaving(false); }
  }

  async function openDetail(id) {
    try { setSelected(await getChequeTerceiro(id)); }
    catch (err) { avisar.erro(err.message); }
  }

  async function downloadModel() {
    try {
      const blob = await baixarModeloChequesTerceiros();
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = 'modelo-carteira-cheques-terceiros.xlsx'; link.click(); URL.revokeObjectURL(url);
    } catch (err) { avisar.erro(err.message); }
  }

  async function importFile(file) {
    if (!file) return;
    setSaving(true); limparAvisos();
    try { const preview = await previewImportacaoChequesTerceiros(file); setImportRows(preview.linhas || []); }
    catch (err) { avisar.erro(err.message || 'Erro ao validar planilha.'); }
    finally { setSaving(false); }
  }

  function updateImportRow(index, field, value) {
    setImportRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value, erros: [], valido: true } : row));
  }

  async function confirmImport() {
    setSaving(true); limparAvisos();
    // Consentimento: o número do aviso vem da MESMA lista enviada ao
    // serviço (`linhas: lote`), lida no mesmo instante.
    const lote = importRows;
    try {
      await confirmarImportacaoChequesTerceiros({ linhas: lote }, crypto.randomUUID());
      setImportOpen(false); setImportRows([]); await load();
      avisar.sucesso(`${lote.length} cheque(s) importado(s) para a carteira.`);
    } catch (err) { avisar.erro(err.message || 'Erro ao importar cheques.'); }
    finally { setSaving(false); }
  }

  async function submitAction(event) {
    event.preventDefault(); setSaving(true); limparAvisos();
    try {
      await movimentarChequeTerceiro(
        selected.id,
        { acao: action, ...actionForm },
        action === 'DEPOSITAR' ? actionIdempotencyKey : null
      );
      setAction(null); setActionIdempotencyKey(null); setSelected(null); await load();
      avisar.sucesso(action === 'DEPOSITAR'
        ? 'Depósito registrado. O cheque ficará aguardando a conciliação do crédito bancário.'
        : 'Movimentação registrada na custódia do cheque.');
    } catch (err) { avisar.erro(err.message || 'Erro ao movimentar cheque.'); }
    finally { setSaving(false); }
  }

  function openAction(nextAction) {
    setAction(nextAction);
    setActionIdempotencyKey(nextAction === 'DEPOSITAR' ? crypto.randomUUID() : null);
  }

  const actionLabels = { DEPOSITAR: 'Registrar depósito', DEVOLVER: 'Registrar devolução', CANCELAR: 'Cancelar cheque', TRANSFERIR: 'Transferir custódia' };

  /*
    R12/R23 — Empresa e Status eram `select` de escolha única: o estado do
    recorte ficava invisível e não combinável. Viraram marcação na
    BarraFiltros, com etiqueta removível, e APLICAM AO MARCAR — o efeito é
    UMA requisição (`getChequesTerceiros`), com a mesma espera de digitação
    de 250ms que a tela já tinha. Muito abaixo do teto de 3 requisições e
    dos 2s da R23: nada de rascunho, nada de botão "aplicar".

    Cada dimensão vira UM parâmetro do serviço (`empresa_id`, `status`), e
    marcar duas mandaria nenhuma — então as duas são `unico`, com a marca
    redonda dizendo que só cabe uma (o defeito de "capacidade aparente sem
    efeito" que a BarraFiltros documenta).
  */
  const filtrosAtivos = useMemo(() => ({
    empresa_id: new Set(filters.empresa_id ? [String(filters.empresa_id)] : []),
    status: new Set(filters.status ? [String(filters.status)] : [])
  }), [filters.empresa_id, filters.status]);

  function alternarFiltro(dimensao, valor, opcoes) {
    const proximo = alternarValorFiltro(filtrosAtivos, dimensao, valor, opcoes);
    setFilters((v) => ({
      ...v,
      empresa_id: [...(proximo.empresa_id || [])][0] || '',
      status: [...(proximo.status || [])][0] || ''
    }));
  }

  const escopoAtual = filters.empresa_id
    ? (empresas.find((item) => Number(item.id) === Number(filters.empresa_id))?.nome || 'Empresa selecionada')
    : 'Grupo empresarial';

  return (
    <Pagina>
      {/* R13/C1/C2/R5 — faixa fixa do sistema, com os três pesos de ação
          (D3/C5): "Cadastrar cheque" primário sólido, "Importar" e
          "Atualizar" secundários em contorno. Antes o <header> rolava para
          fora e o botão de cadastro sumia em carteira longa. */}
      <PageHeader
        titulo="Cheques de terceiros"
        contagem={`${data.total || 0} documento(s)`}
        descricao="Controle físico e auditável sem transformar cheques em contas bancárias fictícias."
        acaoPrincipal={canCreate ? {
          rotulo: 'Cadastrar cheque',
          onClick: () => setCreateOpen(true),
          icone: <HiOutlinePlus className="h-4 w-4" aria-hidden="true" />
        } : undefined}
        secundarias={[
          canImport ? {
            rotulo: 'Importar',
            onClick: () => setImportOpen(true),
            icone: <HiOutlineArrowUpTray className="h-4 w-4" aria-hidden="true" />
          } : null,
          {
            rotulo: 'Atualizar',
            onClick: load,
            desabilitada: loading,
            icone: <HiOutlineArrowPath className="h-4 w-4" aria-hidden="true" />
          }
        ].filter(Boolean)}
      />

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      {/* M2/R10: o ladrilho do sistema no lugar dos três cards com escala e
          cor escritas na tela. */}
      <StatGrid colunas={3}>
        <StatTile label="Em carteira" valor={money(totalCarteira)} tom="success" />
        <StatTile label="Documentos exibidos" valor={String(data.total || 0)} />
        <StatTile label="Escopo" valor={escopoAtual} title={escopoAtual} />
      </StatGrid>

      {/* B2: a carteira é o conteúdo da tela. */}
      <BlocoConteudo titulo="Carteira de cheques" variante="primario" descricao="O recorte vale assim que a marca é feita.">
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('q') ? {
            valor: filters.q,
            aoMudar: (valor) => setFilters((v) => ({ ...v, q: valor })),
            placeholder: 'Código, número, titular ou banco'
          } : null}
          filtros={[
            {
              id: 'empresa_id',
              rotulo: 'Empresa detentora',
              unico: true,
              opcoes: empresas.map((item) => ({ valor: String(item.id), rotulo: `${item.codigo ? `${item.codigo} · ` : ''}${item.nome}` }))
            },
            {
              id: 'status',
              rotulo: 'Status',
              unico: true,
              opcoes: Object.entries(STATUS_LABELS).map(([value, label]) => ({ valor: value, rotulo: label }))
            }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={filtrosAtivos}
          aoAlternar={alternarFiltro}
          aoLimpar={() => setFilters((v) => ({ ...v, empresa_id: '', status: '' }))}
          visibilidade={visibilidadeFiltros}
        />

        <TabelaPadrao
          colunas={[
            {
              id: 'codigo',
              titulo: 'Código / cheque',
              // R17: o CÓDIGO do documento é o que nomeia o cheque na carteira.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => (
                <CelulaDupla principal={item.codigo} sub={`Nº ${item.numero_cheque || '-'}`} />
              )
            },
            {
              id: 'empresa',
              titulo: 'Empresa',
              tipo: 'texto',
              render: (item) => item.empresa?.nome || '-'
            },
            {
              id: 'titular',
              titulo: 'Titular',
              tipo: 'texto',
              render: (item) => (
                <CelulaDupla
                  principal={item.titular_nome || '-'}
                  sub={item.titular_documento ? maskCpfCnpj(item.titular_documento) : (item.cliente_nome || '')}
                />
              )
            },
            {
              id: 'banco',
              titulo: 'Banco',
              tipo: 'texto',
              render: (item) => (
                <CelulaDupla
                  principal={item.banco || '-'}
                  sub={[item.agencia, item.conta].filter(Boolean).join(' / ')}
                />
              )
            },
            {
              id: 'vencimento',
              titulo: 'Vencimento',
              tipo: 'data',
              ordenavel: true,
              valorOrdenacao: (item) => String(item.data_vencimento || ''),
              render: (item) => dateBr(item.data_vencimento)
            },
            {
              id: 'valor',
              titulo: 'Valor',
              tipo: 'valor',
              ordenavel: true,
              ordemInicial: 'desc',
              valorOrdenacao: (item) => Number(item.valor || 0),
              render: (item) => money(item.valor)
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (item) => <StatusBadge status={item.status} />
            }
          ]}
          itens={data.cheques || []}
          storageKey="tabela:financeiro-cheques-terceiros:carteira"
          rotuloRolagem="Carteira de cheques de terceiros"
          carregando={loading}
          vazio="Nenhum cheque encontrado para os filtros."
          acoesLinha={(item) => (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => openDetail(item.id)} title="Ver histórico">
              <HiOutlineEye className="h-4 w-4" />
            </button>
          )}
          larguraAcoes={120}
        />
      </BlocoConteudo>

      {createOpen ? (
        <Modal
          title="Cadastrar cheque de terceiro"
          subtitle="Entrada de saldo inicial legado. Não cria título nem receita."
          onClose={() => setCreateOpen(false)}
        >
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submitCreate}>
            {[
              ['numero_cheque', 'Número do cheque', 'text', true]
            ].map(([key, label, type, required]) => (
              <label className="form-control" key={key}>
                <span>{label}{required ? ' *' : ''}</span>
                <input
                  className="input"
                  type={type}
                  step={type === 'number' ? '0.01' : undefined}
                  required={required}
                  value={form[key]}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                />
              </label>
            ))}

            <PessoaChequeAutocomplete
              label="Titular (nome ou CPF/CNPJ)"
              required
              selected={form.titular_parceiro_id ? {
                id: form.titular_parceiro_id,
                nome: form.titular_nome,
                cpf_cnpj: form.titular_documento
              } : null}
              createButtonLabel="Cadastrar titular"
              onSelect={(partner) => {
                setForm((current) => ({
                  ...current,
                  titular_parceiro_id: partner?.id || '',
                  titular_nome: partner?.nome || '',
                  titular_documento: partner?.cpf_cnpj || ''
                }));
              }}
            />

            <PessoaChequeAutocomplete
              label="Cliente/origem informada"
              selected={form.parceiro_entregou_id ? {
                id: form.parceiro_entregou_id,
                nome: form.cliente_nome,
                cpf_cnpj: form.cliente_documento
              } : null}
              createButtonLabel="Cadastrar cliente/origem"
              helperText="Campo opcional. Pesquise qualquer pessoa ativa ou faça um cadastro rápido como cliente."
              onSelect={(partner) => setForm((current) => ({
                ...current,
                parceiro_entregou_id: partner?.id || '',
                cliente_nome: partner?.nome || '',
                cliente_documento: partner?.cpf_cnpj || ''
              }))}
            />

            {[
              ['banco', 'Banco', 'text'],
              ['agencia', 'Agência', 'text'],
              ['conta', 'Conta', 'text'],
              ['valor', 'Valor', 'currency', true],
              ['data_vencimento', 'Data de vencimento', 'date', true],
              ['data_entrada', 'Data de entrada', 'date', true]
            ].map(([key, label, type, required]) => (
              <label className="form-control" key={key}>
                <span>{label}{required ? ' *' : ''}</span>
                <input
                  className="input"
                  type={type === 'currency' ? 'text' : type}
                  inputMode={type === 'currency' ? 'numeric' : undefined}
                  step={type === 'number' ? '0.01' : undefined}
                  required={required}
                  value={form[key]}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    [key]: type === 'currency' ? normalizeCurrencyTyping(event.target.value) : event.target.value
                  }))}
                  placeholder={type === 'currency' ? 'R$ 0,00' : undefined}
                  autoComplete="off"
                />
              </label>
            ))}

            <label className="form-control sm:col-span-2">
              <span>Empresa detentora *</span>
              <select className="select" required value={form.empresa_id} onChange={(event) => setForm((current) => ({ ...current, empresa_id: event.target.value }))}>
                <option value="">Selecione</option>
                {empresas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
            </label>
            <label className="form-control sm:col-span-2">
              <span>Justificativa da origem *</span>
              <input className="input" required value={form.motivo_origem} onChange={(event) => setForm((current) => ({ ...current, motivo_origem: event.target.value }))} />
            </label>
            <label className="form-control sm:col-span-2">
              <span>Observações</span>
              <textarea className="textarea" value={form.observacoes} onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))} />
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" className="btn btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving || !form.titular_parceiro_id}>Salvar cheque</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {importOpen ? (
        <Modal
          wide
          title="Importar cheques"
          subtitle="Revise as linhas antes de confirmar. A operação é atômica e auditada."
          onClose={() => { setImportOpen(false); setImportRows([]); }}
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-outline" onClick={downloadModel}>
              <HiOutlineArrowDownTray className="h-4 w-4" /> Baixar modelo
            </button>
            <label className="btn btn-primary cursor-pointer">
              <HiOutlineArrowUpTray className="h-4 w-4" /> Selecionar XLSX
              <input type="file" className="hidden" accept=".xlsx" onChange={(e) => importFile(e.target.files?.[0])} />
            </label>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setImportRows((rows) => [...rows, {
                linha: `Nova ${rows.length + 1}`,
                empresa_id: empresas[0]?.id || '',
                empresa_codigo: empresas[0]?.codigo || '',
                numero_cheque: '', titular_nome: '', titular_documento: '', banco: '', agencia: '', conta: '',
                valor: '', data_vencimento: '', data_entrada: new Date().toISOString().slice(0, 10),
                motivo_origem: 'Saldo inicial sem lastro de obra identificado',
                erros: [], valido: true
              }])}
            >
              <HiOutlinePlus /> Adicionar linha
            </button>
          </div>
          {importRows.length ? (
            <>
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
                    id: 'linha',
                    titulo: 'Linha',
                    // R17: no preview de importação quem nomeia o registro é a
                    // LINHA da planilha (é por ela que o erro é encontrado no
                    // arquivo original).
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (row) => row.linha
                  },
                  {
                    id: 'empresa',
                    titulo: 'Empresa',
                    tipo: 'texto',
                    // Edição inline: o controle mora no render da coluna.
                    render: (row) => (
                      <select
                        className="select select-sm"
                        aria-label={`Empresa da linha ${row.linha}`}
                        value={row.empresa_id || ''}
                        onChange={(e) => {
                          const empresa = empresas.find((item) => Number(item.id) === Number(e.target.value));
                          setImportRows((rows) => rows.map((item, i) => (i === row.__indice ? {
                            ...item,
                            empresa_id: empresa?.id || '',
                            empresa_codigo: empresa?.codigo || '',
                            erros: [],
                            valido: true
                          } : item)));
                        }}
                      >
                        <option value="">Selecione</option>
                        {empresas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                      </select>
                    )
                  },
                  {
                    id: 'numero_cheque',
                    titulo: 'Número',
                    tipo: 'codigo',
                    render: (row) => (
                      <input
                        className="input input-sm"
                        aria-label={`Número do cheque da linha ${row.linha}`}
                        value={row.numero_cheque || ''}
                        onChange={(e) => updateImportRow(row.__indice, 'numero_cheque', e.target.value)}
                      />
                    )
                  },
                  {
                    id: 'titular_nome',
                    titulo: 'Titular',
                    tipo: 'texto',
                    render: (row) => (
                      <input
                        className="input input-sm"
                        aria-label={`Titular da linha ${row.linha}`}
                        value={row.titular_nome || ''}
                        onChange={(e) => updateImportRow(row.__indice, 'titular_nome', e.target.value)}
                      />
                    )
                  },
                  {
                    id: 'banco',
                    titulo: 'Banco',
                    tipo: 'texto',
                    render: (row) => (
                      <input
                        className="input input-sm"
                        aria-label={`Banco da linha ${row.linha}`}
                        value={row.banco || ''}
                        onChange={(e) => updateImportRow(row.__indice, 'banco', e.target.value)}
                      />
                    )
                  },
                  {
                    id: 'valor',
                    titulo: 'Valor',
                    tipo: 'valor',
                    render: (row) => (
                      <input
                        className="input input-sm"
                        type="number"
                        step="0.01"
                        aria-label={`Valor da linha ${row.linha}`}
                        value={row.valor || ''}
                        onChange={(e) => updateImportRow(row.__indice, 'valor', e.target.value)}
                      />
                    )
                  },
                  {
                    id: 'data_vencimento',
                    titulo: 'Vencimento',
                    tipo: 'data',
                    render: (row) => (
                      <DateInputBR
                        className="input input-sm"
                        aria-label={`Vencimento da linha ${row.linha}`}
                        value={row.data_vencimento || ''}
                        onChange={(e) => updateImportRow(row.__indice, 'data_vencimento', e.target.value)}
                      />
                    )
                  },
                  {
                    id: 'validacao',
                    titulo: 'Validação',
                    tipo: 'status',
                    render: (row) => (
                      <span className={row.valido ? 'text-[var(--sem-success)]' : 'text-[var(--sem-danger)]'}>
                        {row.valido ? 'Válida' : (row.erros || []).join(' ')}
                      </span>
                    )
                  }
                ]}
                itens={linhasImportacao}
                getId={(row) => row.__indice}
                storageKey="tabela:financeiro-cheques-terceiros:importacao"
                rotuloRolagem="Linhas do lote de importação"
                urgencia={(row) => (row.valido ? null : 'danger')}
                vazio="Nenhuma linha no lote."
                acoesLinha={(row) => (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    title="Remover linha"
                    aria-label={`Remover linha ${row.linha}`}
                    onClick={() => setImportRows((rows) => rows.filter((_, i) => i !== row.__indice))}
                  >
                    <HiOutlineXMark />
                  </button>
                )}
                larguraAcoes={120}
              />
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-[var(--c-muted)]">{importRows.length} cheque(s) no lote</span>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving || importRows.some((row) => !row.valido)}
                  onClick={confirmImport}
                >
                  Confirmar importação
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--c-border)] p-8 text-center text-sm text-[var(--c-muted)]">
              Baixe o modelo, preencha e selecione o arquivo para gerar o preview.
            </div>
          )}
        </Modal>
      ) : null}

      {selected && !action ? (
        <Modal
          title={`${selected.codigo} · cheque ${selected.numero_cheque}`}
          subtitle={`${selected.empresa?.nome || '-'} · ${money(selected.valor)}`}
          onClose={() => setSelected(null)}
        >
          <div className="grid gap-3 sm:grid-cols-4">
            <div><small className="text-[var(--c-muted)]">Status</small><div className="mt-1"><StatusBadge status={selected.status} /></div></div>
            <div><small className="text-[var(--c-muted)]">Titular</small><strong className="block">{selected.titularParceiro?.nome || selected.titular_nome || '-'}</strong></div>
            <div><small className="text-[var(--c-muted)]">Cliente/origem</small><strong className="block">{selected.parceiroEntregou?.nome || selected.cliente_nome || '-'}</strong></div>
            <div><small className="text-[var(--c-muted)]">Vencimento</small><strong className="block">{dateBr(selected.data_vencimento)}</strong></div>
          </div>
          {selected.movimentoDeposito ? (
            <div className="mt-4 grid gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-soft)] p-3 sm:grid-cols-3">
              <div><small className="text-[var(--c-muted)]">Conta do depósito</small><strong className="block">{selected.movimentoDeposito.contaBancaria?.nome || '-'}</strong></div>
              <div><small className="text-[var(--c-muted)]">Data do depósito</small><strong className="block">{dateBr(selected.data_deposito || selected.movimentoDeposito.data_movimento)}</strong></div>
              <div><small className="text-[var(--c-muted)]">Compensação</small><strong className="block">{selected.data_compensacao ? dateBr(selected.data_compensacao) : 'Aguardando conciliação'}</strong></div>
            </div>
          ) : null}
          {selected.status === 'EM_CARTEIRA' ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {canDeposit ? <button className="btn btn-outline btn-sm" onClick={() => openAction('DEPOSITAR')}><HiOutlineBanknotes /> Depositar</button> : null}
              {canTransfer ? <button className="btn btn-outline btn-sm" onClick={() => openAction('TRANSFERIR')}><HiOutlineArrowRight /> Transferir</button> : null}
              {canReturn ? <button className="btn btn-outline btn-sm" onClick={() => openAction('DEVOLVER')}>Devolver</button> : null}
              {canCancel ? <button className="btn btn-outline btn-perigo-suave btn-sm" onClick={() => openAction('CANCELAR')}>Cancelar cheque</button> : null}
            </div>
          ) : null}
          {selected.status === 'UTILIZADO' && canReturn ? (
            <div className="mt-4">
              <button className="btn btn-outline btn-sm" onClick={() => openAction('DEVOLVER')}>Registrar devolução pelo credor</button>
            </div>
          ) : null}
          <h3 className="mt-6 font-semibold">Histórico</h3>
          <div className="mt-2 space-y-2">
            {(selected.historico || []).map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--c-border)] p-3 text-sm">
                <div className="flex justify-between gap-3"><strong>{item.tipo_evento}</strong><span>{dateBr(item.data_evento)}</span></div>
                <p className="mt-1 text-[var(--c-muted)]">{item.observacoes || `${item.status_anterior || '-'} → ${item.status_novo}`}</p>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}

      {selected && action ? <Modal title={actionLabels[action]} subtitle={`${selected.codigo} · ${money(selected.valor)}`} onClose={() => setAction(null)}><form className="space-y-3" onSubmit={submitAction}>{action === 'DEPOSITAR' ? <label className="form-control"><span>Conta de destino *</span><select className="select" required value={actionForm.conta_bancaria_id} onChange={(e) => setActionForm((v) => ({ ...v, conta_bancaria_id: e.target.value }))}><option value="">Selecione</option>{contasEmpresaAcao.map((item) => <option key={item.id} value={item.id}>{item.nome || item.banco_nome || `Conta #${item.id}`}</option>)}</select></label> : null}{action === 'TRANSFERIR' ? <label className="form-control"><span>Empresa de destino *</span><select className="select" required value={actionForm.empresa_destino_id} onChange={(e) => setActionForm((v) => ({ ...v, empresa_destino_id: e.target.value }))}><option value="">Selecione</option>{empresas.filter((item) => Number(item.id) !== Number(selected.empresa_id)).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label> : null}<label className="form-control"><span>Data *</span><DateInputBR className="input" required value={actionForm.data_evento} onChange={(e) => setActionForm((v) => ({ ...v, data_evento: e.target.value }))} /></label><label className="form-control"><span>Justificativa / observação *</span><textarea className="textarea" required value={actionForm.observacoes} onChange={(e) => setActionForm((v) => ({ ...v, observacoes: e.target.value }))} /></label><div className="flex justify-end gap-2"><button type="button" className="btn btn-outline" onClick={() => setAction(null)}>Voltar</button><button className="btn btn-primary" disabled={saving}>Confirmar</button></div></form></Modal> : null}
    </Pagina>
  );
}
