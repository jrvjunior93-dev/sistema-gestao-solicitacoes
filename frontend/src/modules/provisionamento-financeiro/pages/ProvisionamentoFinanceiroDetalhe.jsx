import DateInputBR from '../../../components/DateInputBR';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Avisos,
  BlocoConteudo,
  CamposComVazios,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import {
  adicionarComentarioProvisaoFinanceira,
  atualizarProvisaoFinanceira,
  getProvisionamentoFinanceiroContexto,
  getProvisaoFinanceira,
  listarCategoriasMacroProvisionamento,
  obterLinkAnexoProvisaoFinanceira,
  uploadAnexosProvisaoFinanceira
} from '../../../services/provisoesFinanceiras';
import {
  formatarMoedaBRL,
  inicializarEntradaMoeda,
  normalizarEntradaMoeda
} from '../utils/moeda';

/*
  ATENÇÃO — FORMATADOR DE CAMPO DE DETALHE (B4/CamposComVazios).

  Estes formatadores devolvem `null` quando não há dado, NUNCA '-' nem '—'.
  O `CamposComVazios` conta como VAZIO aquilo que não tem valor; um
  formatador que devolve traço entrega uma string preenchida, o campo passa
  a contar como cheio e o alternador "Ver todos os campos (N vazios)"
  reporta um número menor do que a realidade. O traço quem desenha é o
  componente.

  Fora do grid de campos (tabela de anexos, histórico) o traço continua
  legítimo — lá ele é só exibição, não entra em contagem nenhuma.
*/
function formatarDataOuNulo(valor) {
  if (!valor) return null;
  const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleString('pt-BR');
}

/** Exibição fora do grid de campos (tabela/lista): traço é aceitável. */
function formatarData(valor) {
  return formatarDataOuNulo(valor) || '-';
}

const PRIORIDADES = {
  baixa: 'Baixa',
  media: 'Media',
  alta: 'Alta',
  critica: 'Critica'
};

function formatarPrioridadeOuNulo(valor) {
  return PRIORIDADES[String(valor || '').toLowerCase()] || null;
}

const STATUS = {
  previsto: 'Previsto',
  em_analise: 'Em analise',
  aprovado: 'Aprovado',
  cancelado: 'Cancelado',
  realizado: 'Realizado'
};

function formatarStatus(valor) {
  return STATUS[String(valor || '').toLowerCase()] || '-';
}

/*
  A família semântica do status do provisionamento. Cancelado é NEUTRO
  (não é erro: é uma decisão registrada) e realizado é SUCESSO — a
  classificação automática do StatusBadge jogaria "previsto" e "em analise"
  em famílias diferentes das que este módulo entende.
*/
function familiaStatus(valor) {
  const normalizado = String(valor || '').toLowerCase();
  if (normalizado === 'realizado' || normalizado === 'aprovado') return 'success';
  if (normalizado === 'cancelado') return 'neutral';
  if (normalizado === 'em_analise') return 'info';
  return 'warning';
}

function formatarObraOuNulo(obra) {
  if (!obra) return null;
  return `${obra.codigo ? `${obra.codigo} - ` : ''}${obra.nome}`;
}

export default function ProvisionamentoFinanceiroDetalhe() {
  const { id } = useParams();
  const { avisos, avisar, fechar } = useAvisos();
  const [contexto, setContexto] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [provisao, setProvisao] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [comentando, setComentando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [comentario, setComentario] = useState('');
  const [form, setForm] = useState(null);
  const [valorPrevistoTexto, setValorPrevistoTexto] = useState('');

  async function carregar() {
    try {
      setLoading(true);
      const [contextoData, categoriasData, provisaoData] = await Promise.all([
        getProvisionamentoFinanceiroContexto(),
        listarCategoriasMacroProvisionamento(),
        getProvisaoFinanceira(id)
      ]);

      setContexto(contextoData);
      setCategorias(Array.isArray(categoriasData) ? categoriasData : []);
      setProvisao(provisaoData);
      setForm({
        item_macro: provisaoData?.categoriaMacro?.nome || '',
        data_prevista_desembolso: String(provisaoData?.data_prevista_desembolso || ''),
        descricao: provisaoData?.descricao || '',
        valor_previsto: String(provisaoData?.valor_previsto || ''),
        fornecedor_texto: provisaoData?.fornecedor_texto || '',
        prioridade: provisaoData?.prioridade || ''
      });
      setValorPrevistoTexto(inicializarEntradaMoeda(provisaoData?.valor_previsto).textoFormatado);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar detalhe da provisao.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const podeEditar = useMemo(() => {
    if (!contexto?.permissoes?.pode_editar || !provisao) return false;
    return !['cancelado', 'realizado'].includes(String(provisao.status || '').toLowerCase());
  }, [contexto, provisao]);

  function atualizarValorPrevisto(raw) {
    const { textoFormatado, valorNumerico } = normalizarEntradaMoeda(raw);
    setValorPrevistoTexto(textoFormatado);
    setForm((atual) => ({
      ...atual,
      valor_previsto: valorNumerico
    }));
  }

  async function salvarEdicao(event) {
    event.preventDefault();
    if (!form || saving) return;

    if (!form.item_macro.trim() || !form.data_prevista_desembolso || !form.descricao.trim() || !form.valor_previsto) {
      avisar.erro('Preencha item macro, data prevista, descrição e valor previsto.');
      return;
    }

    try {
      setSaving(true);
      await atualizarProvisaoFinanceira(id, {
        item_macro: form.item_macro,
        data_prevista_desembolso: form.data_prevista_desembolso,
        descricao: form.descricao,
        valor_previsto: form.valor_previsto,
        fornecedor_texto: form.fornecedor_texto,
        prioridade: form.prioridade
      });
      setEditando(false);
      avisar.sucesso('Alterações da provisão salvas.');
      await carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar alteracoes.');
    } finally {
      setSaving(false);
    }
  }

  async function enviarComentario(event) {
    event.preventDefault();
    if (comentando) return;
    if (!comentario.trim()) {
      avisar.erro('Informe um comentário.');
      return;
    }

    try {
      setComentando(true);
      await adicionarComentarioProvisaoFinanceira(id, { comentario });
      setComentario('');
      avisar.sucesso('Comentário registrado.');
      await carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao registrar comentario.');
    } finally {
      setComentando(false);
    }
  }

  async function enviarAnexos(files) {
    if (!files?.length || uploading) return;

    // A quantidade é fixada ANTES do await: a mensagem de sucesso tem de
    // citar o que FOI enviado, não o que o input contém depois.
    const quantidade = files.length;

    try {
      setUploading(true);
      await uploadAnexosProvisaoFinanceira(id, files);
      avisar.sucesso(`${quantidade} anexo(s) enviado(s).`);
      await carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao enviar anexos.');
    } finally {
      setUploading(false);
    }
  }

  async function abrirAnexo(anexo) {
    try {
      const data = await obterLinkAnexoProvisaoFinanceira(anexo?.id);
      if (!data?.url) {
        avisar.erro(`Arquivo indisponivel: ${anexo?.nome_original || 'anexo'}.`);
        return;
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao abrir anexo.');
    }
  }

  if (loading || !provisao || !form) {
    return (
      <Pagina>
        <PageHeader titulo="Provisão" voltar={{ to: '/provisoes-financeiras' }} />
        <Avisos avisos={avisos} aoFechar={fechar} />
        <BlocoConteudo>Carregando provisão...</BlocoConteudo>
      </Pagina>
    );
  }

  const anexos = Array.isArray(provisao.anexos) ? provisao.anexos : [];
  const historicos = Array.isArray(provisao.historicos) ? provisao.historicos : [];

  return (
    <Pagina>
      {/*
        C3/R11 — a seta de voltar à esquerda do cabeçalho é a affordance
        primária de retorno em tela de DETALHE e FICA SEMPRE. O botão
        "Voltar" solto da barra de ações virou esta seta (é a mesma
        navegação, no lugar que a regra define).

        C4/R13 — o cabeçalho de tela de REGISTRO exibe a IDENTIFICAÇÃO com
        destaque: o código é o título, e a obra + data prevista são o apoio.
        Número sem nome é defeito.
      */}
      <PageHeader
        titulo={provisao.codigo}
        voltar={{ to: '/provisoes-financeiras', title: 'Voltar para provisionamentos' }}
        contagem={formatarObraOuNulo(provisao.obra) || undefined}
        descricao={`${formatarStatus(provisao.status)} · desembolso previsto para ${formatarData(provisao.data_prevista_desembolso)}`}
        acaoPrincipal={podeEditar
          ? {
            rotulo: editando ? 'Fechar edicao' : 'Editar registro',
            onClick: () => setEditando((valor) => !valor)
          }
          : undefined}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        MÓDULO DE DINHEIRO: o valor previsto é a resposta da tela e sobe para
        o ladrilho, com o status ao lado (é ele que decide se a provisão
        ainda pode ser editada). O `.app-stat-valor` já é tabular.
      */}
      <StatGrid colunas={3}>
        <StatTile
          label="Valor previsto"
          valor={formatarMoedaBRL(provisao.valor_previsto)}
          sub={`Desembolso em ${formatarData(provisao.data_prevista_desembolso)}`}
        />
        <StatTile
          label="Status"
          valor={<StatusBadge status={formatarStatus(provisao.status)} kind={familiaStatus(provisao.status)} />}
          sub={podeEditar ? 'Registro aberto para edicao' : 'Registro fechado para edicao'}
        />
        <StatTile
          label="Prioridade"
          valor={formatarPrioridadeOuNulo(provisao.prioridade)}
          vazio={!formatarPrioridadeOuNulo(provisao.prioridade)}
          sub="Definida no cadastro da provisão"
        />
      </StatGrid>

      <BlocoConteudo
        titulo="Dados da provisão"
        variante="primario"
        cor="var(--c-primary)"
      >
        {/*
          B4/CamposComVazios — a contagem de vazios sai da PRÓPRIA lista de
          campos. Por isso todo formatador acima devolve `null` no vazio:
          '-' ou '—' seria uma string preenchida, e o alternador contaria
          menos vazios do que existem.

          B3: código, valor, status, prioridade, obra e data prevista já
          aparecem na faixa e nos ladrilhos com papel de DECISÃO; aqui não
          se repetem. O que fica é o que só este bloco responde.
        */}
        <CamposComVazios
          colunas={4}
          campos={[
            { label: 'Item macro', valor: provisao.categoriaMacro?.nome || null, span: 2 },
            { label: 'Credor', valor: provisao.fornecedor_texto || null, span: 2 },
            { label: 'Criado por', valor: provisao.usuarioCriacao?.nome || null, span: 2 },
            { label: 'Atualizado por', valor: provisao.usuarioAtualizacao?.nome || null, span: 2 },
            {
              label: 'Descrição',
              valor: provisao.descricao || null,
              span: 4
            }
          ]}
        />
      </BlocoConteudo>

      {editando && podeEditar && (
        /*
          R9 — o formulário de edição é INLINE, num painel ACIMA do apoio
          (padrão de tela mista): a pessoa está no registro para mexer nele,
          e o modal a obrigaria a abrir e fechar para ver o que edita.
        */
        <BlocoConteudo titulo="Editar provisão">
          <form className="space-y-4" onSubmit={salvarEdicao}>
            <FormSecao legenda="Compromisso" colunas={2}>
              <CampoForm label="Item macro" obrigatorio>
                <input
                  type="text"
                  className="input w-full"
                  list="provisao-item-macro-opcoes-edicao"
                  value={form.item_macro}
                  onChange={(event) => setForm((atual) => ({ ...atual, item_macro: event.target.value }))}
                />
                <datalist id="provisao-item-macro-opcoes-edicao">
                  {categorias.map((categoria) => (
                    <option key={categoria.id} value={categoria.nome} />
                  ))}
                </datalist>
              </CampoForm>

              <CampoForm label="Data prevista" obrigatorio>
                <DateInputBR
                  className="input w-full"
                  value={form.data_prevista_desembolso}
                  onChange={(event) => setForm((atual) => ({ ...atual, data_prevista_desembolso: event.target.value }))}
                />
              </CampoForm>

              {/* R6 — dinheiro no pior caso: `.input-moeda` (mín 180px,
                  R$ 9.999.999.999,99, à direita, tabular-nums). */}
              <CampoForm label="Valor previsto" obrigatorio>
                <input
                  type="text"
                  inputMode="numeric"
                  className="input input-moeda w-full"
                  value={valorPrevistoTexto}
                  onChange={(event) => atualizarValorPrevisto(event.target.value)}
                  placeholder={formatarMoedaBRL(0)}
                />
              </CampoForm>

              <CampoForm label="Prioridade">
                <select
                  className="input w-full"
                  value={form.prioridade}
                  onChange={(event) => setForm((atual) => ({ ...atual, prioridade: event.target.value }))}
                >
                  <option value="">Não definida</option>
                  <option value="baixa">Baixa</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Critica</option>
                </select>
              </CampoForm>

              <CampoForm label="Credor" span={2}>
                <input
                  className="input w-full"
                  value={form.fornecedor_texto}
                  onChange={(event) => setForm((atual) => ({ ...atual, fornecedor_texto: event.target.value }))}
                />
              </CampoForm>

              <CampoForm label="Descrição" obrigatorio tipo="texto-longo" span={2}>
                {/* R10: altura do textarea vem da folha do sistema, não do
                    `min-h-[110px]` que estava aqui. */}
                <textarea
                  className="input w-full"
                  value={form.descricao}
                  onChange={(event) => setForm((atual) => ({ ...atual, descricao: event.target.value }))}
                />
              </CampoForm>
            </FormSecao>

            <div className="app-actionbar">
              <button type="button" className="btn btn-outline" onClick={() => setEditando(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar alteracoes'}
              </button>
            </div>
          </form>
        </BlocoConteudo>
      )}

      <BlocoConteudo
        titulo="Comentários"
        variante="secundario"
        descricao="Observação complementar fica registrada no histórico da provisão."
      >
        <form className="space-y-4" onSubmit={enviarComentario}>
          <FormSecao colunas={2}>
            <CampoForm label="Novo comentário" tipo="texto-longo" span={2}>
              <textarea
                className="input w-full"
                value={comentario}
                onChange={(event) => setComentario(event.target.value)}
                placeholder="Registrar observação complementar"
              />
            </CampoForm>
          </FormSecao>
          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={comentando || !podeEditar}>
              {comentando ? 'Salvando...' : 'Adicionar comentario'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Anexos"
        variante="secundario"
        contagem={`${anexos.length} anexo(s)`}
        acoes={podeEditar ? (
          <label className={`btn btn-outline btn-sm${uploading ? ' pointer-events-none opacity-60' : ''}`}>
            <input
              type="file"
              className="hidden"
              multiple
              onChange={(event) => {
                void enviarAnexos(Array.from(event.target.files || []));
                event.target.value = '';
              }}
            />
            {uploading ? 'Enviando...' : 'Adicionar anexos'}
          </label>
        ) : null}
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'arquivo',
              titulo: 'Arquivo',
              // R17: tabela de ARQUIVOS — o nome preserva caixa e extensão,
              // então não vira `identidade` (que exibe em maiúsculas). A
              // ausência de identidade é DECLARADA no `semIdentidade` abaixo.
              tipo: 'texto',
              noCard: 'titulo',
              render: (anexo) => (
                <span title={anexo.nome_original || undefined}>{anexo.nome_original || '-'}</span>
              )
            },
            {
              id: 'enviado_por',
              titulo: 'Enviado por',
              tipo: 'texto',
              render: (anexo) => anexo.uploadUser?.nome || '-'
            },
            {
              id: 'enviado_em',
              titulo: 'Enviado em',
              tipo: 'data',
              render: (anexo) => formatarData(anexo.createdAt)
            }
          ]}
          itens={anexos}
          getId={(anexo) => anexo.id}
          semIdentidade
          storageKey="tabela:provisionamento-detalhe:anexos"
          rotuloRolagem="Anexos da provisao"
          vazio="Nenhum anexo registrado."
          larguraAcoes={110}
          /* A1: a ação da linha é um <button> focável. */
          acoesLinha={(anexo) => (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirAnexo(anexo)}>
              Abrir
            </button>
          )}
        />
      </BlocoConteudo>

      {/*
        Histórico é registro: nasce RECOLHIDO (regra 1 de organização — dado
        que gera ação primeiro, histórico por último), mas o título fica à
        vista para que se saiba que existe.
      */}
      <BlocoConteudo
        titulo="Histórico"
        variante="secundario"
        contagem={`${historicos.length} evento(s)`}
        recolhivel
        recolhidoPadrao={historicos.length === 0}
      >
        {historicos.length > 0 ? (
          <div className="grid gap-3">
            {historicos.map((historico) => (
              <article key={historico.id} className="rounded-lg border border-[var(--c-border)] px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{historico.acao}</strong>
                  <span className="text-[var(--c-muted)]">{formatarData(historico.createdAt)}</span>
                </div>
                {historico.descricao && <div className="mt-2">{historico.descricao}</div>}
                {historico.comentario && <div className="mt-2 whitespace-pre-wrap">{historico.comentario}</div>}
                <div className="mt-2 text-[var(--c-muted)]">{historico.usuario?.nome || 'Sistema'}</div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--c-muted)]">Nenhum histórico registrado.</p>
        )}
      </BlocoConteudo>
    </Pagina>
  );
}
