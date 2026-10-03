import { useEffect, useMemo, useState } from 'react';
import {
  getTiposSubContrato,
  criarTipoSubContrato,
  atualizarTipoSubContrato,
  ativarTipoSubContrato,
  desativarTipoSubContrato,
  excluirTipoSubContrato
} from '../services/tiposSubContrato';
import { getTiposSolicitacao } from '../services/tiposSolicitacao';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import OverlayModal from '../components/ui/OverlayModal';
import StatusBadge from '../components/StatusBadge';

export default function TiposSubContrato() {
  const [tipos, setTipos] = useState([]);
  const [macros, setMacros] = useState([]);
  const [mostrarTiposInativos, setMostrarTiposInativos] = useState(false);
  const [formAberto, setFormAberto] = useState(false); // painel "Novo subtipo"
  const [nome, setNome] = useState('');
  const [tipoMacroIds, setTipoMacroIds] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editMacroIds, setEditMacroIds] = useState([]);
  const [saving, setSaving] = useState(false);
  // R3: aviso e confirmação do sistema no lugar das caixas do navegador.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  async function carregar() {
    const data = await getTiposSubContrato();
    setTipos(Array.isArray(data) ? data : []);
  }

  async function carregarMacros() {
    const tiposData = await getTiposSolicitacao();
    setMacros(Array.isArray(tiposData) ? tiposData : []);
  }

  useEffect(() => {
    carregar();
    carregarMacros();
  }, []);

  function abrirNovoSubtipo() {
    setFormAberto(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      await criarTipoSubContrato({
        nome,
        tipo_solicitacao_ids: tipoMacroIds
      });
      setNome('');
      setTipoMacroIds([]);
      setFormAberto(false);
      await carregar();
      avisar.sucesso('Subtipo criado e vinculado aos Tipos de Solicitação selecionados.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao criar subtipo.');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(tipo) {
    try {
      if (tipo.ativo) {
        await desativarTipoSubContrato(tipo.id);
      } else {
        await ativarTipoSubContrato(tipo.id);
      }
      carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao alterar status do subtipo');
    }
  }

  async function excluir(item) {
    // confirmar() devolve { ok, texto } — objeto é sempre truthy, então o
    // retorno TEM de ser desestruturado (R21), senão "Cancelar" excluiria.
    const { ok } = await confirmar({
      titulo: 'Excluir subtipo',
      mensagem: `Excluir o subtipo "${item.nome}"?`,
      rotuloConfirmar: 'Excluir',
      destrutiva: true
    });
    if (!ok) return;
    try {
      await excluirTipoSubContrato(item.id);
      carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao excluir subtipo');
    }
  }

  function iniciarEdicao(item) {
    setEditId(item.id);
    setEditNome(item.nome);
    setEditMacroIds(idsDoSubtipo(item).map(String));
  }

  function cancelarEdicao() {
    setEditId(null);
    setEditNome('');
    setEditMacroIds([]);
  }

  async function salvarEdicao(id) {
    try {
      setSaving(true);
      await atualizarTipoSubContrato(id, {
        nome: editNome,
        tipo_solicitacao_ids: editMacroIds
      });
      cancelarEdicao();
      carregar();
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao salvar edição');
    } finally {
      setSaving(false);
    }
  }

  // R16: UM dono para a faixa de avisos. Com o modal aberto ela vive dentro
  // dele (a validação do "Novo subtipo" avisa com o modal aberto e ficaria
  // atrás do fundo escuro); fechado, logo abaixo do PageHeader.
  const faixaAvisos = <Avisos avisos={avisos} aoFechar={fechar} />;

  const macrosPorId = useMemo(() => {
    const map = new Map();
    macros.forEach(macro => map.set(Number(macro.id), macro));
    return map;
  }, [macros]);

  const macrosDoSetor = useMemo(() => {
    return macros
      .filter(macro => {
        if (!mostrarTiposInativos && macro?.ativo === false) return false;
        return true;
      })
      .sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'));
  }, [macros, mostrarTiposInativos]);

  function idsDoSubtipo(tipo) {
    const ids = Array.isArray(tipo?.tipo_solicitacao_ids)
      ? tipo.tipo_solicitacao_ids
      : [tipo?.tipo_macro_id];
    return [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  }

  function alternarMacro(id, edicao = false) {
    const setter = edicao ? setEditMacroIds : setTipoMacroIds;
    setter((atuais) => {
      const valor = String(id);
      return atuais.includes(valor)
        ? atuais.filter((item) => item !== valor)
        : [...atuais, valor];
    });
  }

  const tiposFiltrados = useMemo(() => {
    return tipos.filter(tipo => {
      const macrosVinculados = idsDoSubtipo(tipo).map((id) => macrosPorId.get(id)).filter(Boolean);
      if (!mostrarTiposInativos && macrosVinculados.length > 0 && macrosVinculados.every((macro) => macro?.ativo === false)) return false;
      return true;
    });
  }, [macrosPorId, mostrarTiposInativos, tipos]);

  function macroLabel(macro) {
    const status = macro?.ativo === false ? 'Inativo' : 'Ativo';
    return `${macro?.nome || '-'} - ${status}`;
  }

  function macrosDoSubtipo(t) {
    const vinculados = idsDoSubtipo(t).map((id) => macrosPorId.get(id)).filter(Boolean);
    if (vinculados.length) return vinculados;
    return t.macro ? [t.macro] : [];
  }

  // 6 colunas viraram 3 + acoes. O que a tabela antiga repetia foi unificado:
  // os Tipos de Solicitação aparecem juntos e o status consolidado fica na
  // coluna Status.
  const colunas = [
    {
      id: 'subtipo',
      titulo: 'Subtipo',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (t) => (
        editId === t.id ? (
          <input
            className="input input-sm w-full"
            aria-label="Nome do subtipo"
            value={editNome}
            onChange={e => setEditNome(e.target.value)}
          />
        ) : (
          t.nome
        )
      )
    },
    {
      id: 'tipo_macro',
      // Em edição esta coluna é o seletor múltiplo dos Tipos de Solicitação.
      sempreVisivel: true,
      titulo: 'Tipos de Solicitação',
      tipo: 'texto',
      render: (t) => (
        editId === t.id ? (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-[var(--c-border)] p-2" aria-label="Tipos de Solicitação">
            {macrosDoSetor.map((macro) => (
              <label key={macro.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editMacroIds.includes(String(macro.id))}
                  onChange={() => alternarMacro(macro.id, true)}
                />
                <span>{macroLabel(macro)}</span>
              </label>
            ))}
          </div>
        ) : (
          <CelulaDupla
            principal={macrosDoSubtipo(t).map((macro) => macro.nome).join(', ') || '-'}
            sub={`${macrosDoSubtipo(t).length} tipo(s) vinculado(s)`}
          />
        )
      )
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      render: (t) => {
        const tiposVinculados = macrosDoSubtipo(t);
        const statusTipo = tiposVinculados.some((macro) => macro?.ativo !== false) ? 'ativo' : 'inativo';
        return (
          <CelulaDupla
            principal={<StatusBadge status={t.ativo ? 'Ativo' : 'Inativo'} />}
            sub={`Tipos ${statusTipo}s`}
            title={`Subtipo ${t.ativo ? 'ativo' : 'inativo'} — Tipos de Solicitação ${statusTipo}s`}
          />
        );
      }
    }
  ];

  return (
    <Pagina>
      {/* C2: apoio na faixa (decisão 02/09) — contagem + descrição em uma
          linha no próprio PageHeader. */}
      <PageHeader
        titulo="Subtipos"
        contagem={`${tiposFiltrados.length} subtipo(s)`}
        descricao="Cadastre subtipos reutilizáveis e vincule cada um a um ou mais Tipos de Solicitação."
        acaoPrincipal={{ rotulo: 'Novo subtipo', onClick: abrirNovoSubtipo }}
      />

      {!formAberto && faixaAvisos}

      {/* R9 (docs/REGRAS-LAYOUT.md): cadastro raro abre em MODAL pela ação
          principal do cabeçalho; a lista é o bloco primário PERMANENTE.
          O seletor de Setor ficou junto da lista porque também é o recorte
          dela (mesmo estado de sempre). O ritmo vertical vem do Pagina. */}
      {formAberto && (
        <OverlayModal rotulo="Novo subtipo" onFechar={() => setFormAberto(false)}>
          <div className="flex items-center justify-between border-b border-[var(--c-border)] px-4 py-3">
            <h3 className="text-lg font-semibold text-[var(--c-text)]">Novo subtipo</h3>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setFormAberto(false)}>
              Fechar
            </button>
          </div>
          <div className="overflow-y-auto px-4 py-3">
            {faixaAvisos}
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormSecao legenda="Dados do subtipo" colunas={3}>
                <CampoForm
                  label="Tipos de Solicitação"
                  obrigatorio
                  hint="Marque todos os tipos em que este subtipo poderá ser escolhido."
                >
                  <div className="max-h-52 space-y-1 overflow-y-auto rounded border border-[var(--c-border)] p-2">
                    {macrosDoSetor.map((macro) => (
                      <label key={macro.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--c-surface)]">
                        <input
                          type="checkbox"
                          checked={tipoMacroIds.includes(String(macro.id))}
                          onChange={() => alternarMacro(macro.id)}
                        />
                        <span>{macroLabel(macro)}</span>
                      </label>
                    ))}
                  </div>
                </CampoForm>

                <CampoForm label="Nome do subtipo" obrigatorio hint="Ex: Combustivel">
                  <input
                    className="input w-full"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    required
                  />
                </CampoForm>

                <div className="flex items-end">
                  <button type="submit" className="btn btn-primary" disabled={saving || tipoMacroIds.length === 0}>
                    {saving ? 'Adicionando...' : 'Adicionar'}
                  </button>
                </div>
              </FormSecao>

              <p className="app-note">
                A configuração por Obra/Centro de Custo é feita no tipo macro; subtipos ativos são incluídos automaticamente.
              </p>
            </form>
          </div>
        </OverlayModal>
      )}

      <BlocoConteudo
        titulo="Subtipos cadastrados"
        variante="primario"
        cor="var(--c-primary)"
        acoes={(
          <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--c-muted)' }}>
              <input
                type="checkbox"
                checked={mostrarTiposInativos}
                onChange={event => setMostrarTiposInativos(event.target.checked)}
              />
              Mostrar tipos inativos
          </label>
        )}
      >
        <TabelaPadrao
          colunas={colunas}
          itens={tiposFiltrados}
          storageKey="tabela:tipos-subcontrato"
          larguraAcoes={260}
          aoClicarLinha={(t) => {
            if (editId !== t.id) iniciarEdicao(t);
          }}
          vazio={{ title: 'Nenhum subtipo cadastrado' }}
          acoesLinha={(t) => (
            editId === t.id ? (
              <>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => salvarEdicao(t.id)} disabled={saving || editMacroIds.length === 0}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={cancelarEdicao} disabled={saving}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => iniciarEdicao(t)}>
                  Editar
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => toggle(t)}>
                  {t.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button type="button" className="btn btn-outline btn-sm btn-perigo-suave" onClick={() => excluir(t)}>
                  Excluir
                </button>
              </>
            )
          )}
        />
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
