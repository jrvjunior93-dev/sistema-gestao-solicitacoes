import { useEffect, useMemo, useState } from 'react';
import { HiOutlineArrowPath, HiOutlineEye, HiOutlineXMark } from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import {
  estornarBaixaFinanceiraComposta,
  getBaixaFinanceiraComposta,
  getBaixasFinanceirasCompostas
} from '../services/financeiro';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import { hasPermissao } from '../utils/acessoProduto';
import StatusBadge from '../components/StatusBadge';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BarraFiltros,
  alternarValorFiltro,
  TabelaPadrao,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';

const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBr = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '-';

const STATUS_OPCOES = [
  { valor: 'CONFIRMADO', rotulo: 'Confirmados' },
  { valor: 'ESTORNADO', rotulo: 'Estornados' }
];

function Modal({ item, onClose, onReverse, canReverse, saving }) {
  return (
    <div className="modal-overlay finance-operation-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="baixa-composta-detalhe-titulo">
      <section className="modal-dialog finance-operation-modal finance-operation-modal--detail">
        <header className="modal-header">
          <div>
            <h2 id="baixa-composta-detalhe-titulo" className="modal-title">{item.codigo}</h2>
            <p className="modal-subtitle">
              {item.parceiro?.nome} · {item.empresa?.nome} · {dateBr(item.data_movimento)}
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fechar detalhes da baixa">
            <HiOutlineXMark className="h-4 w-4" />
          </button>
        </header>

        <div className="modal-body min-h-0 overflow-y-auto">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="finance-operation-metric p-3">
              <small className="text-[var(--c-muted)]">Status</small>
              <strong className="block"><StatusBadge status={item.status} /></strong>
            </div>
            <div className="finance-operation-metric p-3">
              <small className="text-[var(--c-muted)]">Principal</small>
              <strong className="block">{money(item.valor_principal)}</strong>
            </div>
            <div className="finance-operation-metric p-3">
              <small className="text-[var(--c-muted)]">Valor da operação</small>
              <strong className="block">{money(item.valor_quitacao)}</strong>
            </div>
          </div>

          <div className="space-y-3">
            {(item.componentes || []).map((component) => (
              <section key={component.id} className="finance-operation-panel p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>Fonte {component.ordem} · {component.formaPagamento?.nome || component.forma_recebimento}</strong>
                  <strong>{money(component.valor_quitacao)}</strong>
                </div>
                <p className="mt-1 text-sm text-[var(--c-muted)]">
                  {component.contaBancaria?.nome || component.cartao?.nome || component.chequeTerceiro?.codigo || 'Sem instrumento financeiro'}
                </p>
                <div className="mt-3">
                  <TabelaPadrao
                    colunas={[
                      {
                        id: 'titulo',
                        titulo: 'Título',
                        // R17: o código do título NOMEIA a alocação.
                        tipo: 'identidade',
                        noCard: 'titulo',
                        render: (allocation) => allocation.titulo?.codigo
                      },
                      {
                        id: 'descricao',
                        titulo: 'Descrição',
                        tipo: 'texto',
                        render: (allocation) => allocation.titulo?.descricao
                      },
                      {
                        id: 'valor',
                        titulo: 'Valor alocado',
                        tipo: 'valor',
                        render: (allocation) => money(allocation.valor)
                      }
                    ]}
                    itens={component.alocacoes || []}
                    storageKey="tabela:baixas-compostas:alocacoes"
                    rotuloRolagem={`Alocações da fonte ${component.ordem}`}
                    vazio="Nenhuma alocação nesta fonte."
                  />
                </div>
              </section>
            ))}
          </div>

          {/*
            R19/R3 — o estorno pedia a justificativa numa caixa de texto solta
            no rodapé do modal, com o botão logo abaixo e NENHUMA confirmação:
            um clique estornava o grupo inteiro. Agora o botão abre a
            confirmação do sistema (`useConfirmacao` com `campo`), que é onde
            a justificativa é pedida e onde a irreversibilidade é declarada.
            A ação destrutiva fica APARTADA e em vermelho suave (D3/C5).
          */}
          {canReverse && item.status === 'CONFIRMADO' ? (
            <div className="finance-operation-notice finance-operation-notice--danger mt-4 p-4">
              <p className="text-sm">
                O estorno desfaz o grupo inteiro: todas as fontes e todas as alocações
                desta operação voltam atrás de uma vez. Esta ação não pode ser desfeita.
              </p>
              <button type="button" className="btn btn-outline btn-perigo-suave mt-3" disabled={saving} onClick={onReverse}>
                {saving ? 'Estornando...' : 'Estornar grupo completo'}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default function FinanceiroBaixasCompostas() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  /*
    R12/F2/F3 — os dois `select` de filtro viraram marcação na BarraFiltros,
    com etiqueta removível. As duas dimensões são de valor ÚNICO (o serviço
    aceita um `empresa_id` e um `status`), então a marca é redonda e marcar
    outra substitui — sem isso a tela mostraria duas etiquetas e mandaria
    filtro nenhum.

    R23 — DUAS dimensões e uma requisição por recorte: bem abaixo do teto de
    3 requisições da regra, então o filtro APLICA AO MARCAR. Não há botão de
    "aplicar" e a etiqueta nunca fica na frente da lista.
  */
  const [filtrosAtivos, setFiltrosAtivos] = useState({ empresa: new Set(), status: new Set() });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const canReverse = hasPermissao(user, 'financeiro.baixas_compostas.estornar');

  const empresaId = useMemo(() => Array.from(filtrosAtivos.empresa || [])[0] || '', [filtrosAtivos.empresa]);
  const statusFiltro = useMemo(() => Array.from(filtrosAtivos.status || [])[0] || '', [filtrosAtivos.status]);

  async function load() {
    setLoading(true);
    try { setItems(await getBaixasFinanceirasCompostas({ empresa_id: empresaId, status: statusFiltro })); }
    catch (err) { avisar.erro(err.message || 'Erro ao carregar baixas compostas.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { getEmpresasGrupo({ ativo: true }).then((data) => setCompanies(Array.isArray(data) ? data : data?.items || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [empresaId, statusFiltro]);

  async function open(id) {
    try { setSelected(await getBaixaFinanceiraComposta(id)); }
    catch (err) { avisar.erro(err.message || 'Erro ao abrir a baixa composta.'); }
  }

  async function reverse() {
    /*
      FAMÍLIA D / consentimento — a confirmação fala do grupo `selected` (o
      código citado é `selected.codigo`, o valor citado é `selected.valor_quitacao`)
      e a ação percorre ESSE MESMO registro: `estornarBaixaFinanceiraComposta(alvo.id, …)`.
      O `alvo` é fixado ANTES do `await`, porque durante a confirmação a tela
      continua montada e `selected` poderia mudar — perguntar sobre um grupo e
      estornar outro é o defeito que esta trava existe para impedir.

      R21 — o retorno se DESESTRUTURA: `confirmar()` devolve { ok, texto } e
      objeto é sempre truthy; ler como booleano faria "Cancelar" estornar.
    */
    const alvo = selected;
    if (!alvo?.id) return;

    const { ok, texto } = await confirmar({
      titulo: 'Estornar grupo completo?',
      mensagem: `O grupo ${alvo.codigo} (${money(alvo.valor_quitacao)}) será estornado por inteiro: todas as fontes e alocações voltam atrás. Esta ação não pode ser desfeita.`,
      rotuloConfirmar: 'Estornar grupo',
      destrutiva: true,
      campo: { rotulo: 'Justificativa do estorno', obrigatorio: true, multilinha: true }
    });
    if (!ok) return;

    setSaving(true);
    try {
      await estornarBaixaFinanceiraComposta(alvo.id, texto);
      setSelected(null);
      avisar.sucesso(`Grupo ${alvo.codigo} estornado.`);
      await load();
    }
    catch (err) { avisar.erro(err.message || 'Erro ao estornar grupo.'); }
    finally { setSaving(false); }
  }

  return (
    <Pagina>
      {/*
        R13/C1/C2 — a linha solta de título (sobrescrito colorido + h1 de
        24px + parágrafo de apoio) virou a faixa fixa do sistema: título em
        22px, contagem e apoio em UMA linha na própria faixa (R5), e a única
        ação da tela com peso de primária (D3/C5).
      */}
      <PageHeader
        titulo="Baixas com múltiplas fontes"
        contagem={`${items.length} baixa(s)`}
        descricao="Financeiro · Rastreabilidade — pagamentos e recebimentos combinados, suas fontes, alocações e estornos."
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar',
          onClick: load,
          desabilitada: loading,
          icone: <HiOutlineArrowPath className={`h-4 w-4${loading ? ' animate-spin' : ''}`} />
        }}
      />

      {/* R19/R25: o erro saía num cartão de paleta crua (rose) montado à mão;
          agora é a faixa de aviso do sistema, com tom semântico e fechável. */}
      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      <BarraFiltros
        /*
          R15 — dimensão sem opção não entra na faixa: um filtro que abre
          vazio é capacidade aparente sem efeito. A lista de empresas chega
          por requisição própria, então ela só aparece depois de carregada.
        */
        filtros={[
          companies.length ? {
            id: 'empresa',
            rotulo: 'Empresa',
            unico: true,
            opcoes: companies.map((company) => ({ valor: String(company.id), rotulo: company.nome }))
          } : null,
          { id: 'status', rotulo: 'Status', unico: true, opcoes: STATUS_OPCOES }
        ].filter(Boolean)}
        ativos={filtrosAtivos}
        aoAlternar={(dimensao, valor, opcoes) => setFiltrosAtivos((atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes))}
        aoLimpar={() => setFiltrosAtivos({ empresa: new Set(), status: new Set() })}
      />

      <BlocoConteudo
        titulo="Baixas com múltiplas fontes"
        variante="primario"
        cor="var(--module-financeiro)"
        descricao="Abra uma baixa para ver as fontes, as alocações por título e o histórico de estorno."
      >
        <TabelaPadrao
          colunas={[
            { id: 'codigo', titulo: 'Código', tipo: 'codigo', render: (item) => <strong>{item.codigo}</strong> },
            { id: 'data', titulo: 'Data', tipo: 'data', render: (item) => dateBr(item.data_movimento) },
            { id: 'empresa', titulo: 'Empresa', tipo: 'texto', render: (item) => item.empresa?.nome },
            { id: 'tipo', titulo: 'Operação', tipo: 'texto', render: (item) => item.tipo === 'RECEBIMENTO' ? 'Recebimento' : 'Pagamento' },
            // R17: a contraparte NOMEIA a baixa composta.
            { id: 'parceiro', titulo: 'Cliente / Credor', tipo: 'identidade', noCard: 'titulo', render: (item) => item.parceiro?.nome },
            { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => item.valor_quitacao == null ? '-' : money(item.valor_quitacao) },
            // R25: o status vira StatusBadge (token + ícone), não pastilha de paleta crua.
            { id: 'status', titulo: 'Status', tipo: 'status', render: (item) => <StatusBadge status={item.status} /> }
          ]}
          itens={items}
          carregando={loading}
          vazio="Nenhuma baixa composta encontrada."
          storageKey="tabela:baixas-compostas"
          rotuloRolagem="Baixas com múltiplas fontes"
          acoesLinha={(item) => (
            <button type="button" className="btn btn-outline btn-sm" title="Ver composição" onClick={() => open(item.id)}><HiOutlineEye /></button>
          )}
          larguraAcoes={120}
        />
      </BlocoConteudo>

      {selected ? <Modal item={selected} onClose={() => setSelected(null)} onReverse={reverse} canReverse={canReverse} saving={saving} /> : null}
      {elementoConfirmacao}
    </Pagina>
  );
}
