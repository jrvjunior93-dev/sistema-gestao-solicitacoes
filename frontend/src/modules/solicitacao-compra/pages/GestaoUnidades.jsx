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
  atualizarUnidade,
  criarUnidade,
  deletarUnidade,
  listarUnidades
} from '../../../services/compras';

/*
  A linha ORIGINAL viaja junto do registro normalizado: quando a gravação de
  uma linha falha, é ela que volta para a caixa de importação. Antes o texto
  inteiro era apagado no sucesso parcial e o que não entrou se perdia.
*/
function normalizarLinhaMassa(linha) {
  const original = String(linha || '');
  const partes = original
    .split('|')
    .map((valor) => String(valor || '').trim())
    .filter(Boolean);

  if (partes.length < 2) {
    return null;
  }

  return {
    original,
    dados: { nome: partes[0], sigla: partes[1] }
  };
}

export default function GestaoUnidades() {
  const [unidades, setUnidades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [nome, setNome] = useState('');
  const [sigla, setSigla] = useState('');
  const [textoMassa, setTextoMassa] = useState('');
  // Set em vez de array: é o que a `selecao` da TabelaPadrao consome e o que
  // torna barato tirar da marcação SÓ o que realmente foi excluído.
  const [selecionados, setSelecionados] = useState(() => new Set());
  // R19/R21: as 10 caixas do navegador deste arquivo (alert/confirm) viram
  // faixa de aviso do sistema + modal de confirmação.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  // R22: hook usado é hook importado. O ref leva o foco ao formulário, que
  // fica ACIMA da lista (R15).
  const campoNomeRef = useRef(null);

  async function carregar() {
    try {
      setLoading(true);
      const data = await listarUnidades();
      setUnidades(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar unidades');
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
    setSigla('');
  }

  function focarFormulario() {
    campoNomeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    campoNomeRef.current?.focus({ preventScroll: true });
  }

  async function handleSalvar(event) {
    event.preventDefault();

    if (!nome.trim() || !sigla.trim()) {
      avisar.alerta('Informe nome e sigla.');
      return;
    }

    try {
      setSalvando(true);

      if (editandoId) {
        await atualizarUnidade(editandoId, { nome, sigla });
      } else {
        await criarUnidade({ nome, sigla });
      }

      limparFormulario();
      avisar.sucesso(editandoId ? 'Unidade atualizada.' : 'Unidade criada.');
      await carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar unidade');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(unidade) {
    setEditandoId(unidade.id);
    setNome(unidade.nome || '');
    setSigla(unidade.sigla || '');
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

    O `toggleTodos` antigo fazia `unidades.map(...)`: marcava a lista INTEIRA
    carregada, não a exibida — o padrão "pergunta sobre 3, apaga 47" da DoD.
    Agora o marcar-todos é o do cabeçalho da TabelaPadrao, que entrega em
    `ids` exatamente os itens que ela está exibindo.
  */
  function alternarTodosVisiveis(marcar, idsVisiveis) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      idsVisiveis.forEach((id) => (marcar ? proximo.add(id) : proximo.delete(id)));
      return proximo;
    });
  }

  /*
    DEFEITO DE SIGNIFICADO + CONSENTIMENTO CORRIGIDO — o lote apagava em parte
    e avisava que não tinha apagado nada.

    Antes: `for (const id of ids) await deletarUnidade(id);` dentro de UM
    try/catch. Falhando a 3ª de 10, as 2 primeiras JÁ ESTAVAM excluídas e a
    pessoa lia "Erro ao excluir unidades". Agora cada exclusão tem o seu
    try/catch, e os dois números aparecem no aviso.

    R26: `alvos` fixa o lote numa const ANTES do await da confirmação.
  */
  async function excluirLote(ids) {
    const alvos = [...ids];

    if (!alvos.length) {
      avisar.alerta('Selecione ao menos uma unidade.');
      return;
    }

    const { ok } = await confirmar({
      titulo: 'Excluir unidades',
      mensagem: `Excluir ${alvos.length} unidade(s)? Esta acao nao pode ser desfeita. Se o lote parar no meio, o que ja foi excluido continua excluido.`,
      rotuloConfirmar: `Excluir ${alvos.length}`,
      destrutiva: true
    });
    if (!ok) return;

    const excluidos = new Set();
    const falhas = [];

    for (const id of alvos) {
      try {
        await deletarUnidade(id);
        excluidos.add(id);
      } catch (error) {
        console.error(error);
        falhas.push(error?.message || `Nao foi possivel excluir o registro ${id}.`);
      }
    }

    // Só sai da marcação o que realmente foi excluído.
    setSelecionados((atual) => new Set([...atual].filter((id) => !excluidos.has(id))));
    await carregar();

    if (!falhas.length) {
      avisar.sucesso(`${excluidos.size} de ${alvos.length} unidade(s) excluida(s).`);
    } else if (excluidos.size) {
      avisar.alerta(
        `${excluidos.size} de ${alvos.length} unidade(s) excluida(s); ${falhas.length} falharam e continuam na lista. Primeira falha: ${falhas[0]}`
      );
    } else {
      avisar.erro(
        `Nenhuma das ${alvos.length} unidade(s) foi excluida. Primeira falha: ${falhas[0]}`
      );
    }
  }

  /*
    DEFEITO DE SIGNIFICADO CORRIGIDO — a importação anunciava o número PEDIDO,
    não o GRAVADO, e descartava em silêncio as linhas fora do formato
    `Nome|Sigla`. Agora conta gravadas × falhadas × ignoradas, diz os três, e
    devolve à caixa as linhas que não entraram.
  */
  async function importarMassa() {
    const brutas = String(textoMassa || '')
      .split(/\r?\n/)
      .filter((linha) => String(linha || '').trim());
    const linhas = brutas.map(normalizarLinhaMassa).filter(Boolean);
    const ignoradas = brutas.filter((linha) => !normalizarLinhaMassa(linha));

    if (!linhas.length) {
      avisar.alerta('Cole os registros no formato Nome|Sigla.');
      return;
    }

    try {
      setSalvando(true);
      let gravadas = 0;
      const naoGravadas = [...ignoradas];
      const falhas = [];

      for (const item of linhas) {
        try {
          await criarUnidade(item.dados);
          gravadas += 1;
        } catch (error) {
          console.error(error);
          naoGravadas.push(item.original);
          falhas.push(error?.message || `Linha "${item.original}"`);
        }
      }

      setTextoMassa(naoGravadas.join('\n'));
      await carregar();

      const sobreIgnoradas = ignoradas.length
        ? ` ${ignoradas.length} linha(s) fora do formato Nome|Sigla foram ignoradas e continuam na caixa.`
        : '';

      if (!falhas.length) {
        avisar.sucesso(`${gravadas} de ${linhas.length} unidade(s) importada(s).${sobreIgnoradas}`);
      } else if (gravadas) {
        avisar.alerta(
          `${gravadas} de ${linhas.length} unidade(s) importada(s); ${falhas.length} nao entraram e ficaram na caixa.${sobreIgnoradas} Primeira falha: ${falhas[0]}`
        );
      } else {
        avisar.erro(
          `Nenhuma das ${linhas.length} unidade(s) foi importada.${sobreIgnoradas} Primeira falha: ${falhas[0]}`
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  /*
    R17: toda coluna declara o `tipo`, nunca a largura. A coluna de marcação
    feita à mão saiu — quem a desenha agora é a `selecao` da TabelaPadrao.
  */
  const colunas = [
    {
      id: 'nome',
      titulo: 'Nome',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => item.nome
    },
    {
      id: 'sigla',
      titulo: 'Sigla',
      tipo: 'codigo',
      render: (item) => item.sigla || '-'
    }
  ];

  return (
    <Pagina>
      <PageHeader
        titulo="Gestão de unidades"
        contagem={loading ? null : `${unidades.length} unidade(s)`}
        descricao="Cadastro e manutenção das unidades de medida do módulo compras."
        acaoPrincipal={{ rotulo: 'Nova unidade', onClick: () => { limparFormulario(); focarFormulario(); } }}
      />

      {/* R16: UM dono para a faixa de avisos, logo abaixo do cabeçalho. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 (revista em 04/09): esta tela EXISTE para cadastrar unidade de
        medida — tirando o formulário sobra uma lista que ninguém abriria por
        si só. Formulário INLINE; não mover para OverlayModal.
      */}
      <BlocoConteudo titulo={editandoId ? 'Editar unidade' : 'Nova unidade'}>
        <form onSubmit={handleSalvar}>
          <FormSecao colunas={2}>
            <CampoForm label="Nome da unidade" obrigatorio>
              <input
                ref={campoNomeRef}
                className="input w-full"
                placeholder="Ex.: Quilograma"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
              />
            </CampoForm>

            <CampoForm label="Sigla" obrigatorio>
              <input
                className="input w-full"
                placeholder="Ex.: kg"
                value={sigla}
                onChange={(event) => setSigla(event.target.value)}
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
        descricao="Formato Nome|Sigla, uma por linha. O que não entrar continua na caixa para nova tentativa."
        variante="secundario"
        recolhivel
        recolhidoPadrao
      >
        {/* R10: a altura do textarea vem da folha do sistema (textarea.input);
            o `min-h-[140px]` que estava aqui era medida à mão. */}
        <textarea
          className="input w-full"
          placeholder={'Formato: Nome|Sigla\nExemplo:\nMetro|m\nQuilograma|kg'}
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
        titulo="Unidades cadastradas"
        contagem={`${unidades.length} unidade(s)`}
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
          é do cabeçalho da tabela. A capacidade não foi removida — mudou de
          lugar e passou a marcar o que está EXIBIDO.
        */}
        <TabelaPadrao
          colunas={colunas}
          itens={unidades}
          carregando={loading}
          getId={(item) => item.id}
          storageKey="tabela:gestao-unidades"
          rotuloRolagem="Unidades cadastradas"
          larguraAcoes={240}
          aoClicarLinha={iniciarEdicao}
          selecao={{
            selecionados,
            aoAlternar: (id) => toggleSelecionado(id),
            aoAlternarTodos: alternarTodosVisiveis
          }}
          vazio={{
            title: 'Nenhuma unidade cadastrada',
            message: 'Cadastre a primeira unidade de medida para usar nos itens das solicitacoes.'
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
