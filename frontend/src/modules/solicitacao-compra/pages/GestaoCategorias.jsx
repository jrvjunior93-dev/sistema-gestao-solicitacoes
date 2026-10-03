import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import {
  atualizarCategoria,
  criarCategoria,
  deletarCategoria,
  listarCategorias
} from '../../../services/compras';

export default function GestaoCategorias() {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [nome, setNome] = useState('');
  const [textoMassa, setTextoMassa] = useState('');
  // Set em vez de array: é o que a `selecao` da TabelaPadrao consome e o que
  // torna barato tirar da marcação SÓ o que realmente foi excluído.
  const [selecionados, setSelecionados] = useState(() => new Set());
  // R19/R21: as 10 caixas do navegador deste arquivo (alert/confirm) viram
  // faixa de aviso do sistema + modal de confirmação.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  // R22: hook usado é hook importado. O ref leva o foco ao formulário, que
  // fica ACIMA da lista — sem isso, "Editar" no fim de uma lista longa não
  // muda nada no que a pessoa está vendo (R15).
  const campoNomeRef = useRef(null);

  async function carregar() {
    try {
      setLoading(true);
      const data = await listarCategorias();
      setCategorias(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar categorias');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const idsSelecionados = useMemo(() => [...selecionados], [selecionados]);

  function limparFormulario() {
    setEditandoId(null);
    setNome('');
  }

  function focarFormulario() {
    campoNomeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    campoNomeRef.current?.focus({ preventScroll: true });
  }

  async function handleSalvar(event) {
    event.preventDefault();

    if (!nome.trim()) {
      avisar.alerta('Informe o nome da categoria.');
      return;
    }

    try {
      setSalvando(true);
      if (editandoId) {
        await atualizarCategoria(editandoId, { nome });
      } else {
        await criarCategoria({ nome });
      }
      limparFormulario();
      avisar.sucesso(editandoId ? 'Categoria atualizada.' : 'Categoria criada.');
      await carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar categoria');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(item) {
    setEditandoId(item.id);
    setNome(item.nome || '');
    focarFormulario();
  }

  function toggleSelecionado(id) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  /*
    DEFEITO DE CONSENTIMENTO CORRIGIDO — "selecionar todas" marcava o que não
    estava na tela.

    O `toggleTodos` antigo fazia `categorias.map(...)`: marcava a lista
    INTEIRA carregada, não a lista exibida. É o padrão "pergunta sobre 3,
    apaga 47" da DoD. Agora o marcar-todos é o do cabeçalho da TabelaPadrao,
    que entrega em `ids` exatamente os itens que ela está exibindo (já
    ordenados/filtrados) — a marcação não pode divergir do que se vê.
  */
  function alternarTodosVisiveis(marcar, idsVisiveis) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      idsVisiveis.forEach((id) => (marcar ? proximo.add(id) : proximo.delete(id)));
      return proximo;
    });
  }

  /*
    DEFEITO DE SIGNIFICADO + CONSENTIMENTO CORRIGIDO — o lote apagava em
    parte e avisava que não tinha apagado nada.

    Antes: `for (const id of ids) await deletarCategoria(id);` dentro de UM
    try/catch. Falhando a 3ª de 10, as 2 primeiras JÁ ESTAVAM excluídas e a
    pessoa lia "Erro ao excluir categorias" — mensagem que afirma que nada
    aconteceu. Agora cada exclusão tem o seu try/catch, os dois números são
    contados e os DOIS aparecem no aviso.

    R26: `alvos` fixa o lote numa const ANTES do await da confirmação — o
    modal do sistema não congela a tela, então reler `selecionados` depois
    do await perguntaria sobre um conjunto e apagaria outro.
  */
  async function excluirLote(ids) {
    const alvos = [...ids];

    if (!alvos.length) {
      avisar.alerta('Selecione ao menos uma categoria.');
      return;
    }

    const { ok } = await confirmar({
      titulo: 'Excluir categorias',
      mensagem: `Excluir ${alvos.length} categoria(s)? Esta acao nao pode ser desfeita. Se o lote parar no meio, o que ja foi excluido continua excluido.`,
      rotuloConfirmar: `Excluir ${alvos.length}`,
      destrutiva: true
    });
    if (!ok) return;

    const excluidos = new Set();
    const falhas = [];

    for (const id of alvos) {
      try {
        await deletarCategoria(id);
        excluidos.add(id);
      } catch (error) {
        console.error(error);
        falhas.push(error?.message || `Nao foi possivel excluir o registro ${id}.`);
      }
    }

    // Só sai da marcação o que realmente foi excluído: o que falhou continua
    // marcado para a pessoa tentar de novo.
    setSelecionados((atual) => new Set([...atual].filter((id) => !excluidos.has(id))));
    await carregar();

    if (!falhas.length) {
      avisar.sucesso(`${excluidos.size} de ${alvos.length} categoria(s) excluida(s).`);
    } else if (excluidos.size) {
      avisar.alerta(
        `${excluidos.size} de ${alvos.length} categoria(s) excluida(s); ${falhas.length} falharam e continuam na lista. Primeira falha: ${falhas[0]}`
      );
    } else {
      avisar.erro(
        `Nenhuma das ${alvos.length} categoria(s) foi excluida. Primeira falha: ${falhas[0]}`
      );
    }
  }

  /*
    DEFEITO DE SIGNIFICADO CORRIGIDO — a importação anunciava o número PEDIDO,
    não o GRAVADO: `alert(`${linhas.length} categoria(s) importada(s)`)` saía
    do total de linhas coladas, e qualquer falha no meio caía no catch depois
    de já ter gravado parte. Agora conta gravadas × falhadas, diz as duas, e
    devolve à caixa APENAS as linhas que não entraram — antes o texto era
    apagado inteiro e o que falhou se perdia.
  */
  async function importarMassa() {
    const linhas = String(textoMassa || '')
      .split(/\r?\n/)
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    if (!linhas.length) {
      avisar.alerta('Informe ao menos uma categoria por linha.');
      return;
    }

    try {
      setSalvando(true);
      let gravadas = 0;
      const naoGravadas = [];
      const falhas = [];

      for (const item of linhas) {
        try {
          await criarCategoria({ nome: item });
          gravadas += 1;
        } catch (error) {
          console.error(error);
          naoGravadas.push(item);
          falhas.push(error?.message || `Linha "${item}"`);
        }
      }

      setTextoMassa(naoGravadas.join('\n'));
      await carregar();

      if (!falhas.length) {
        avisar.sucesso(`${gravadas} de ${linhas.length} categoria(s) importada(s).`);
      } else if (gravadas) {
        avisar.alerta(
          `${gravadas} de ${linhas.length} categoria(s) importada(s); ${falhas.length} nao entraram e ficaram na caixa. Primeira falha: ${falhas[0]}`
        );
      } else {
        avisar.erro(
          `Nenhuma das ${linhas.length} categoria(s) foi importada. Primeira falha: ${falhas[0]}`
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  /*
    R17: toda coluna declara o `tipo` (papel), nunca a largura. A coluna de
    marcação feita à mão saiu: quem a desenha agora é a `selecao` da
    TabelaPadrao, que traz junto o marcar-todos com estado indeterminado.
  */
  const colunas = [
    {
      id: 'nome',
      titulo: 'Nome',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => item.nome
    }
  ];

  return (
    <Pagina>
      <PageHeader
        titulo="Gestão de categorias"
        contagem={loading ? null : `${categorias.length} categoria(s)`}
        descricao="Cadastro e manutenção das categorias do módulo compras."
        acaoPrincipal={{ rotulo: 'Nova categoria', onClick: () => { limparFormulario(); focarFormulario(); } }}
      />

      {/* R16: UM dono para a faixa de avisos, logo abaixo do cabeçalho. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 (revista em 04/09): esta tela EXISTE para cadastrar categoria —
        tirando o formulário sobra uma lista de nomes que ninguém abriria por
        si só. Então o formulário é INLINE, painel acima da lista. Não mover
        para OverlayModal.
      */}
      <BlocoConteudo titulo={editandoId ? 'Editar categoria' : 'Nova categoria'}>
        <form onSubmit={handleSalvar}>
          <FormSecao colunas={2}>
            <CampoForm label="Nome da categoria" obrigatorio span={2}>
              <input
                ref={campoNomeRef}
                className="input w-full"
                placeholder="Ex.: Material de construção"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando...' : editandoId ? 'Salvar' : 'Adicionar'}
            </button>
            {editandoId && (
              <button type="button" className="btn btn-outline" onClick={limparFormulario} disabled={salvando}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Importação em massa"
        descricao="Uma categoria por linha. As linhas que não entrarem continuam na caixa para nova tentativa."
        variante="secundario"
        recolhivel
        recolhidoPadrao
      >
        {/* R10: a altura do textarea vem da folha do sistema (textarea.input);
            o `min-h-[140px]` que estava aqui era medida à mão. */}
        <textarea
          className="input w-full"
          placeholder={'Uma categoria por linha\nExemplo:\nMaterial de Construcao\nFerramentas'}
          value={textoMassa}
          onChange={(event) => setTextoMassa(event.target.value)}
        />
        <div className="app-actionbar">
          <button type="button" className="btn btn-primary" onClick={importarMassa} disabled={salvando}>
            Importar
          </button>
        </div>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Categorias cadastradas"
        contagem={`${categorias.length} categoria(s)`}
        descricao={idsSelecionados.length ? `${idsSelecionados.length} marcada(s) para exclusao.` : 'Marque na tabela para excluir em lote.'}
        variante="primario"
        cor="var(--module-compras)"
        acoes={(
          <button
            type="button"
            className="btn btn-outline btn-perigo-suave"
            onClick={() => excluirLote(idsSelecionados)}
            disabled={!idsSelecionados.length}
          >
            Excluir selecionadas
          </button>
        )}
      >
        {/*
          R16: o botão "Selecionar todas" saiu porque a responsabilidade agora
          é do cabeçalho da tabela (marcar-todos com estado indeterminado) —
          dois donos para a mesma marcação é o defeito que a regra descreve.
          A capacidade não foi removida: mudou de lugar, e passou a marcar o
          que está EXIBIDO em vez da lista inteira carregada.
        */}
        <TabelaPadrao
          colunas={colunas}
          itens={categorias}
          carregando={loading}
          getId={(item) => item.id}
          storageKey="tabela:gestao-categorias"
          rotuloRolagem="Categorias cadastradas"
          larguraAcoes={240}
          aoClicarLinha={iniciarEdicao}
          selecao={{
            selecionados,
            aoAlternar: (id) => toggleSelecionado(id),
            aoAlternarTodos: alternarTodosVisiveis
          }}
          vazio={{
            title: 'Nenhuma categoria cadastrada',
            message: 'Cadastre a primeira categoria para classificar as solicitacoes de compra.'
          }}
          acoesLinha={(item) => (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => iniciarEdicao(item)}>
                Editar
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm btn-perigo-suave"
                onClick={() => excluirLote([item.id])}
              >
                Excluir
              </button>
            </>
          )}
        />
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
