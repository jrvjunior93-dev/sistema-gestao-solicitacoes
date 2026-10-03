import { useEffect, useRef, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos
} from '../components/padrao';
import { getSetores } from '../services/setores';
import {
  getStatusSetor,
  criarStatusSetor,
  atualizarStatusSetor,
  ativarStatusSetor,
  desativarStatusSetor
} from '../services/statusSetor';

export default function StatusSetor() {
  const [setores, setSetores] = useState([]);
  const [setor, setSetor] = useState('');
  const [status, setStatus] = useState([]);
  const [nome, setNome] = useState('');
  const [ordem, setOrdem] = useState(1);
  const [criando, setCriando] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editOrdem, setEditOrdem] = useState(1);
  const [saving, setSaving] = useState(false);
  const [reordenando, setReordenando] = useState(false);
  // R22: hook usado é hook importado — o useRef está no import acima.
  // A referência serve à ação da faixa fixa (levar o foco ao formulário),
  // não a medida nenhuma.
  const campoNomeRef = useRef(null);
  // R3/R19: as duas chamadas de alert() desta tela viram faixa do sistema.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    carregarSetores();
  }, []);

  useEffect(() => {
    if (!setor) {
      setStatus([]);
      setOrdem(1);
      return;
    }
    // Trocar de setor recarrega a lista E reposiciona a sugestão de ordem:
    // o formulário fica sempre apontando para o próximo lugar da fila DO
    // setor que está na tela.
    carregarStatus(setor).then((lista) => setOrdem(lista.length + 1));
  }, [setor]);

  async function carregarSetores() {
    try {
      const data = await getSetores();
      const lista = Array.isArray(data) ? data : [];
      setSetores(lista);
      if (lista.length > 0) {
        setSetor(lista[0].codigo);
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar setores');
    }
  }

  async function carregarStatus(cod) {
    try {
      const data = await getStatusSetor({ setor: cod });
      const lista = Array.isArray(data) ? data : [];
      setStatus(lista);
      return lista;
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar status do setor');
      return [];
    }
  }

  // A ação da faixa fixa não abre nada: o formulário já está na tela. Ela
  // limpa o rascunho e LEVA O FOCO até ele — o que serve para quem está no
  // fim de uma lista longa (R13: a ação principal a um clique).
  function irParaCadastro() {
    setNome('');
    // Sugere o próximo lugar da fila em vez de recomeçar em 1 — a ordem
    // duplicada só apareceria depois de salvar.
    setOrdem(status.length + 1);
    // preventScroll: quem rola e o scrollIntoView suave; sem ele o foco
    // daria um salto seco por cima da rolagem.
    campoNomeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    campoNomeRef.current?.focus({ preventScroll: true });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setCriando(true);
      await criarStatusSetor({
        setor,
        nome,
        ordem: Number(ordem)
      });
      setNome('');
      avisar.sucesso('Status cadastrado.');
      const lista = await carregarStatus(setor);
      // Cadastrar em série é o uso normal desta tela: o formulário continua
      // aberto, vazio e já apontando para o próximo lugar da fila.
      setOrdem(lista.length + 1);
      campoNomeRef.current?.focus();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao cadastrar status');
    } finally {
      setCriando(false);
    }
  }

  async function toggle(item) {
    try {
      if (item.ativo) {
        await desativarStatusSetor(item.id);
      } else {
        await ativarStatusSetor(item.id);
      }
      carregarStatus(setor);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao mudar a situacao do status');
    }
  }

  function iniciarEdicao(item) {
    setEditId(item.id);
    setEditNome(item.nome);
    setEditOrdem(item.ordem);
  }

  function cancelarEdicao() {
    setEditId(null);
    setEditNome('');
    setEditOrdem(1);
  }

  async function salvarEdicao(id) {
    try {
      setSaving(true);
      await atualizarStatusSetor(id, {
        nome: editNome,
        ordem: Number(editOrdem)
      });
      cancelarEdicao();
      carregarStatus(setor);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar edicao');
    } finally {
      setSaving(false);
    }
  }

  async function reordenar() {
    try {
      setReordenando(true);
      const ordenado = [...status].sort((a, b) => a.ordem - b.ordem);
      await Promise.all(
        ordenado.map((item, index) =>
          atualizarStatusSetor(item.id, { ordem: index + 1 })
        )
      );
      carregarStatus(setor);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao reordenar');
    } finally {
      setReordenando(false);
    }
  }

  return (
    <Pagina>
      {/* C1/C2/R5/R13: título, contagem e apoio na faixa fixa do topo; as
          ações da tela ficam na barra do cabeçalho — inclusive "Reordenar",
          que antes vivia no card-header do bloco da lista (C5). */}
      <PageHeader
        titulo="Status por Setor"
        contagem={`${status.length} status`}
        descricao="Defina os status disponíveis por setor."
        secundarias={[{
          rotulo: reordenando ? 'Reordenando...' : 'Reordenar',
          onClick: reordenar,
          desabilitada: reordenando || status.length === 0
        }]}
        acaoPrincipal={{
          rotulo: 'Novo status',
          onClick: irParaCadastro,
          desabilitada: !setor
        }}
      />

      {/* R16: UM dono para a faixa de avisos — logo abaixo do cabeçalho,
          onde ela é vista tanto pelo cadastro quanto pela lista. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* R12: seletor de CONTEXTO (escolhe de qual setor são os status que a
          tela lista e cadastra), não filtro — continua sendo select. */}
      <BlocoConteudo titulo="Selecionar setor">
        <FormSecao colunas={2}>
          <CampoForm label="Setor">
            <select className="input w-full" value={setor} onChange={e => setSetor(e.target.value)}>
              {setores.map(s => (
                <option key={s.id} value={s.codigo}>
                  {s.nome}
                </option>
              ))}
            </select>
          </CampoForm>
        </FormSecao>
      </BlocoConteudo>

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, E NÃO EM MODAL.

        O critério da R9 não é a frequência do cadastro: é o que a tela
        existe para fazer. Esta tela existe PARA cadastrar status de setor —
        tire o formulário e o que sobra é uma lista que ninguém abriria por
        si só. Em tela assim o modal é atrito: obriga a abrir e fechar para
        fazer exatamente aquilo que a pessoa veio fazer, e some da vista
        depois de cada cadastro (o uso normal aqui é cadastrar vários
        seguidos, um por etapa do fluxo do setor).

        Modal fica reservado ao cadastro que INTERROMPE outro trabalho
        (cadastrar um credor no meio de uma solicitação, por exemplo) — não
        é o caso aqui. Se for mexer nisto, leia antes a R9 em
        docs/REGRAS-LAYOUT.md: a versão que mandava usar modal estava
        escrita pelo sintoma (cadastro raro) e foi corrigida.

        ARRANJO — empilhado, acima da lista, e não em duas colunas: a ordem
        de leitura da tela é a ordem do trabalho (escolher o setor →
        cadastrar → conferir a fila que se formou), e a lista precisa da
        largura inteira porque ela é EDITÁVEL na linha (nome e ordem viram
        campos). Espremer a tabela em meia tela para ganhar uma coluna de
        formulário de dois campos trocaria conforto de leitura por
        densidade, contra a R10.
      */}
      <BlocoConteudo titulo="Novo status">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <FormSecao legenda="Identificação" colunas={2}>
            <CampoForm label="Nome do status" obrigatorio span={2}>
              <input
                ref={campoNomeRef}
                className="input w-full"
                placeholder="Ex: Em analise"
                value={nome}
                onChange={e => setNome(e.target.value)}
                required
              />
            </CampoForm>
            <CampoForm label="Ordem" obrigatorio hint="Posição do status na fila do setor.">
              <input
                className="input w-full"
                type="number"
                min="1"
                value={ordem}
                onChange={e => setOrdem(e.target.value)}
                required
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={criando || !setor}>
              {criando ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Lista de status"
        variante="primario"
        cor="var(--c-primary)"
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'ordem',
              // TRAVADA (05/09): em edicao esta coluna e o campo da ordem; escondida,
              // nao sobra onde reordenar o status.
              sempreVisivel: true,
              titulo: 'Ordem',
              tipo: 'numero',
              render: s => (
                editId === s.id ? (
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={editOrdem}
                    onChange={e => setEditOrdem(e.target.value)}
                  />
                ) : (
                  s.ordem
                )
              )
            },
            {
              id: 'nome',
              titulo: 'Nome',
              // R17: o nome do status é o registro desta lista.
              tipo: 'identidade',
              noCard: 'titulo',
              render: s => (
                editId === s.id ? (
                  <input
                    className="input"
                    value={editNome}
                    onChange={e => setEditNome(e.target.value)}
                  />
                ) : (
                  s.nome
                )
              )
            },
            {
              id: 'ativo',
              titulo: 'Status',
              tipo: 'status',
              render: s => (s.ativo ? 'Ativo' : 'Inativo')
            }
          ]}
          itens={status}
          getId={s => s.id}
          storageKey="tabela:status-setor"
          rotuloRolagem="Status do setor"
          vazio="Nenhum status cadastrado"
          acoesLinha={s => (
            editId === s.id ? (
              <>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => salvarEdicao(s.id)} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>{' '}
                <button type="button" className="btn btn-outline btn-sm" onClick={cancelarEdicao} disabled={saving}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => iniciarEdicao(s)}>
                  Editar
                </button>{' '}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggle(s)}>
                  {s.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </>
            )
          )}
          larguraAcoes={200}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
