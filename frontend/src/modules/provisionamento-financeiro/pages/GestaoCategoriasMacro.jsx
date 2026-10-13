import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { canManageProvisionamentoCategorias } from '../../../utils/acessoProduto';
import { useWorkspaceState, useWorkspaceWork } from '../../../navigation/WorkspaceContext';
import useWorkspaceRecordDraft from '../../../navigation/useWorkspaceRecordDraft';
import useQueryRevision from '../../../navigation/useQueryRevision';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  TabelaPadrao,
  useAvisos
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import {
  ativarCategoriaMacroProvisionamento,
  atualizarCategoriaMacroProvisionamento,
  criarCategoriaMacroProvisionamento,
  desativarCategoriaMacroProvisionamento,
  listarCategoriasMacroProvisionamento
} from '../../../services/provisoesFinanceiras';

const FORM_VAZIO = { nome: '', descricao: '', ordem_exibicao: '' };
const EDICAO_VAZIA = { nome: '', descricao: '', ordem_exibicao: '', ativo: true };
const inputsCategoria = c => ({ nome: c.nome || '', descricao: c.descricao || '',
  ordem_exibicao: c.ordem_exibicao ?? '', ativo: c.ativo !== false });
const revisaoCategoria = c => JSON.stringify([c.id, c.updatedAt, c.updated_at, inputsCategoria(c)]);

export default function GestaoCategoriasMacro() {
  const { user } = useAuth();
  const permitido = canManageProvisionamentoCategorias(user);
  const consulta = useQueryRevision(permitido);
  const ciclo = useQueryRevision(permitido);
  const mutex = useRef(false);
  const { avisos, avisar, fechar } = useAvisos();
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');
  const [form, setForm] = useWorkspaceState('provisoes:categoria:nova', FORM_VAZIO);
  const [editId, setEditId] = useWorkspaceState('provisoes:categoria:id', null);
  const draft = useWorkspaceRecordDraft('provisoes:categoria:inputs', EDICAO_VAZIA);
  const { value: editForm, setValue: setEditForm } = draft;
  const alvoAtual = categorias.find(c => String(c.id) === String(editId));
  const disponivel = permitido && !loading && !erro;
  useWorkspaceWork(draft.dirty || Object.values(form).some(v => v !== ''), saving, 'provisoes:categorias:work');
  useEffect(() => {
    if (!disponivel || (editId != null && !alvoAtual)) { draft.conceal(EDICAO_VAZIA); return; }
    if (alvoAtual) draft.hydrate(inputsCategoria(alvoAtual), revisaoCategoria(alvoAtual));
  }, [disponivel, editId, alvoAtual, draft.hydrate, draft.conceal]);

  async function carregar() {
    const token = consulta.begin();
    try {
      setLoading(true);
      setErro(''); setCategorias([]);
      if (!permitido) return;
      const data = await listarCategoriasMacroProvisionamento({ incluir_inativas: 1 });
      if (!consulta.isCurrent(token)) return;
      setCategorias(Array.isArray(data) ? data : []);
    } catch (error) {
      if (!consulta.isCurrent(token)) return;
      console.error(error);
      setCategorias([]); setErro(error?.message || 'Erro ao carregar categorias macro.');
      avisar.erro(error?.message || 'Erro ao carregar categorias macro.');
    } finally {
      if (consulta.isCurrent(token)) setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permitido]);

  // C2 × B3 (critério de 05/09): a FAIXA fica com o TOTAL; os blocos, com os
  // RECORTES. Ativas/inativas é o recorte que só a lista sabe e vai no bloco.
  const { ativas, inativas } = useMemo(() => {
    const total = categorias.length;
    const desativadas = categorias.filter((categoria) => categoria.ativo === false).length;
    return { ativas: total - desativadas, inativas: desativadas };
  }, [categorias]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (mutex.current || !disponivel) return;

    if (!form.nome.trim()) {
      avisar.erro('Informe o nome da categoria macro.');
      return;
    }

    const payload = { ...form };
    const token = ciclo.capture(); mutex.current = true;
    try {
      setSaving(true);
      await criarCategoriaMacroProvisionamento(payload);
      if (!ciclo.isCurrent(token)) return;
      setForm(FORM_VAZIO);
      avisar.sucesso(`Categoria macro "${form.nome.trim()}" criada.`);
      await carregar();
    } catch (error) {
      if (!ciclo.isCurrent(token)) return;
      console.error(error);
      avisar.erro(error?.message || 'Erro ao criar categoria macro.');
    } finally {
      mutex.current = false;
      if (ciclo.isCurrent(token)) setSaving(false);
    }
  }

  function iniciarEdicao(categoria) {
    if (!disponivel || mutex.current) return;
    draft.hydrate(inputsCategoria(categoria), revisaoCategoria(categoria), { discard: true });
    setEditId(categoria.id);
  }

  function cancelarEdicao() {
    draft.discard();
    draft.conceal(EDICAO_VAZIA);
    setEditId(null);
  }

  async function salvarEdicao() {
    // R26: o alvo é fixado ANTES de qualquer await — `editId` é estado da
    // tela e a linha em edição pode mudar enquanto a requisição corre.
    const alvoId = editId;
    const alvoDados = { ...editForm };
    if (!disponivel || mutex.current || draft.conflict || !alvoAtual || !alvoId) return;
    if (!alvoDados.nome.trim()) { avisar.erro('Informe o nome da categoria macro.'); return; }

    const token = ciclo.capture(); mutex.current = true;
    try {
      setSaving(true);
      await atualizarCategoriaMacroProvisionamento(alvoId, alvoDados);
      if (!ciclo.isCurrent(token)) return;
      cancelarEdicao();
      avisar.sucesso(`Categoria macro "${String(alvoDados.nome || '').trim()}" atualizada.`);
      await carregar();
    } catch (error) {
      if (!ciclo.isCurrent(token)) return;
      console.error(error);
      avisar.erro(error?.message || 'Erro ao atualizar categoria macro.');
    } finally {
      mutex.current = false;
      if (ciclo.isCurrent(token)) setSaving(false);
    }
  }

  async function alternarStatus(categoria) {
    // R26: a categoria vem por argumento e é fixada aqui, antes do await —
    // a ação opera sobre a MESMA linha que o usuário acionou, mesmo que a
    // lista recarregue no meio.
    const alvo = categoria;
    const vaiAtivar = alvo.ativo === false;

    if (!disponivel || mutex.current || !categorias.includes(alvo)) return;
    const token = ciclo.capture(); mutex.current = true;
    try {
      setSaving(true);
      if (vaiAtivar) {
        await ativarCategoriaMacroProvisionamento(alvo.id);
      } else {
        await desativarCategoriaMacroProvisionamento(alvo.id);
      }
      if (!ciclo.isCurrent(token)) return;
      avisar.sucesso(`Categoria macro "${alvo.nome}" ${vaiAtivar ? 'ativada' : 'desativada'}.`);
      await carregar();
    } catch (error) {
      if (!ciclo.isCurrent(token)) return;
      console.error(error);
      avisar.erro(error?.message || 'Erro ao alterar status da categoria.');
    } finally {
      mutex.current = false;
      if (ciclo.isCurrent(token)) setSaving(false);
    }
  }

  return (
    <Pagina>
      {/*
        R11/C6 — o botão "Voltar" saiu da barra de ações: esta é uma tela de
        LISTAGEM/cadastro, não de detalhe, e o destino
        (/provisoes-financeiras) é o primeiro item do menu do módulo
        (`prov-lista` no navigationConfig) e está no Ctrl+K. A seta de voltar
        que a R11 preserva é a de tela de REGISTRO, não esta.

        R5/C2: título, contagem e apoio moram na faixa fixa do PageHeader —
        o `page-subtitle` solto que estava aqui é reprovado pelo validador.
      */}
      <PageHeader
        titulo="Categorias Macro"
        contagem={loading ? null : `${categorias.length} categoria(s)`}
        descricao="Base de classificação do módulo de provisionamento."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {!permitido || erro ? <p role="alert">{erro || 'Gestão de categorias indisponível para este usuário.'}</p> : null}

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, NÃO EM MODAL.
        Esta tela EXISTE para cadastrar categoria macro: pelo teste da regra,
        tirando o formulário sobra uma lista que ninguém abriria por si só.
        Modal aqui obrigaria a abrir e fechar para fazer exatamente aquilo
        que a pessoa veio fazer. Não mover para OverlayModal.
      */}
      {disponivel && <BlocoConteudo titulo="Nova categoria macro">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <fieldset disabled={saving}>
          <FormSecao legenda="Identificação" colunas={2}>
            <CampoForm label="Nome" obrigatorio>
              <input
                className="input w-full"
                aria-label="Nome da nova categoria macro"
                value={form.nome}
                onChange={(event) => setForm((atual) => ({ ...atual, nome: event.target.value }))}
                required
              />
            </CampoForm>

            <CampoForm label="Ordem de exibição" hint="Define a posicao da categoria nas listas do modulo.">
              <input
                className="input w-full"
                aria-label="Ordem da nova categoria macro"
                type="number"
                value={form.ordem_exibicao}
                onChange={(event) => setForm((atual) => ({ ...atual, ordem_exibicao: event.target.value }))}
              />
            </CampoForm>

            <CampoForm label="Descrição" tipo="texto-longo" span={2}>
              {/* R10: a altura do textarea vem da folha do sistema
                  (textarea.input), não do `min-h-[96px]` que estava aqui. */}
              <textarea
                className="input w-full"
                aria-label="Descrição da nova categoria macro"
                value={form.descricao}
                onChange={(event) => setForm((atual) => ({ ...atual, descricao: event.target.value }))}
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Adicionar categoria'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setForm(FORM_VAZIO)}>
              Limpar
            </button>
          </div>
          </fieldset>
        </form>
      </BlocoConteudo>}

      {disponivel && editId != null && !alvoAtual ? <p role="alert">A categoria em edição não está disponível na lista atual.</p> : null}
      {disponivel && draft.conflict ? <div role="alert">A categoria mudou desde o início da edição.
        <button type="button" className="btn btn-outline btn-sm" disabled={saving} onClick={() => draft.discard()}>Usar dados atuais</button>
      </div> : null}

      <BlocoConteudo
        titulo="Categorias cadastradas"
        /* C2 × B3: o TOTAL está na faixa; aqui fica o RECORTE que só este
           bloco sabe — quantas estão ativas e quantas foram desativadas. */
        contagem={loading ? null : `${ativas} ativa(s) · ${inativas} inativa(s)`}
        descricao="Categoria desativada some das listas de escolha, mas continua nas provisões já classificadas."
        variante="primario"
        cor="var(--c-primary)"
      >
        <TabelaPadrao
          chaveWorkspace="provisoes:categorias:tabela"
          colunas={[
            {
              id: 'nome',
              titulo: 'Nome',
              // R17: o nome NOMEIA a categoria macro.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (categoria) => (editId === categoria.id ? (
                <input
                  className="input w-full"
                  value={editForm.nome}
                  aria-label="Nome da categoria macro"
                  disabled={saving || draft.conflict}
                  onChange={(event) => setEditForm((atual) => ({ ...atual, nome: event.target.value }))}
                />
              ) : categoria.nome)
            },
            {
              id: 'descricao',
              // TRAVADAS (05/09): fora do modo de edicao mostram texto, mas e aqui que o
              // campo vira editavel — esconder tira o editar, nao o dado.
              sempreVisivel: true,
              titulo: 'Descrição',
              tipo: 'texto',
              render: (categoria) => (editId === categoria.id ? (
                <textarea
                  className="input w-full"
                  value={editForm.descricao}
                  aria-label="Descrição da categoria macro"
                  disabled={saving || draft.conflict}
                  onChange={(event) => setEditForm((atual) => ({ ...atual, descricao: event.target.value }))}
                />
              ) : (
                // T6: texto longo trunca com o conteúdo completo no tooltip.
                <span title={categoria.descricao || undefined}>{categoria.descricao || '-'}</span>
              ))
            },
            {
              id: 'ordem',
              sempreVisivel: true,
              titulo: 'Ordem',
              tipo: 'numero',
              render: (categoria) => (editId === categoria.id ? (
                <input
                  className="input w-full"
                  type="number"
                  value={editForm.ordem_exibicao}
                  aria-label="Ordem de exibição"
                  disabled={saving || draft.conflict}
                  onChange={(event) => setEditForm((atual) => ({ ...atual, ordem_exibicao: event.target.value }))}
                />
              ) : (categoria.ordem_exibicao ?? '-'))
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              // R25: o estado vira pílula do sistema (token + ícone), não
              // texto solto — cor sozinha não comunica.
              render: (categoria) => (
                categoria.ativo === false
                  ? <StatusBadge status="Inativa" kind="neutral" />
                  : <StatusBadge status="Ativa" kind="success" />
              )
            }
          ]}
          itens={categorias}
          getId={(categoria) => categoria.id}
          carregando={loading}
          storageKey="tabela:provisionamento-categorias-macro"
          rotuloRolagem="Categorias macro cadastradas"
          vazio="Nenhuma categoria macro cadastrada."
          acoesLinha={(categoria) => (editId === categoria.id ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" onClick={salvarEdicao} disabled={saving || draft.conflict}>Salvar</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={cancelarEdicao} disabled={saving}>Cancelar</button>
            </>
          ) : (
            <>
              {/* A1: a linha é alcançável por teclado pelos próprios botões
                  focáveis da ação. */}
              <button type="button" className="btn btn-outline btn-sm" disabled={saving || !disponivel} onClick={() => iniciarEdicao(categoria)}>Editar</button>
              <button type="button" className="btn btn-outline btn-sm" disabled={saving || !disponivel} onClick={() => alternarStatus(categoria)}>
                {categoria.ativo === false ? 'Ativar' : 'Desativar'}
              </button>
            </>
          ))}
          larguraAcoes={240}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
