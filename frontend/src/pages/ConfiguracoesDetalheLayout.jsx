import { useEffect, useMemo, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import { getSetores } from '../services/setores';
import { BLOCOS_HOME, ORDEM_PADRAO_HOME, rotuloBlocoHome } from '../navigation/blocosHome';
import { getDetalheLayouts, salvarDetalheLayout, excluirDetalheLayout } from '../services/detalheLayout';

// O detalhe da solicitação passou a ter padrão global + personalização
// individual. A camada por setor permanece apenas para a Home.
const TELAS = [
  { id: 'home', rotulo: 'Início (Home)', blocos: BLOCOS_HOME, ordemPadrao: ORDEM_PADRAO_HOME, rotuloBloco: rotuloBlocoHome }
];

function rotuloDaTela(id) {
  return TELAS.find((tela) => tela.id === id)?.rotulo || id;
}

// O <select> de setor grava CÓDIGO e exibe NOME. Estas duas funções são o
// par: `codigoDoSetor` é a única fonte do `value` da opção, e
// `rotuloDoSetor` faz o caminho de volta para a confirmação falar o mesmo
// nome que a pessoa leu na lista. Sem o par, a tela pergunta por "CMP"
// sobre o setor que ela chama de "Compras".
function codigoDoSetor(setor) {
  return String(setor.codigo || setor.nome).toUpperCase();
}

function rotuloDoSetor(listaSetores, codigo) {
  // Sem correspondência (lista de setores não carregada, setor removido),
  // cai no próprio código — melhor um rótulo cru do que um alvo vazio.
  return listaSetores.find((setor) => codigoDoSetor(setor) === codigo)?.nome || codigo;
}

// =====================================================================
// LAYOUT DA HOME POR SETOR — Configurações
// ---------------------------------------------------------------------
// O admin ainda pode definir por setor a ordem dos blocos da Home. O
// detalhe da solicitação não participa mais desta camada: usa padrão
// global e preferência individual.
// =====================================================================
export default function ConfiguracoesDetalheLayout() {
  const [setores, setSetores] = useState([]);
  const [layouts, setLayouts] = useState([]);
  const [telaSelecionada, setTelaSelecionada] = useState('home');
  const [setorSelecionado, setSetorSelecionado] = useState('');
  const [linhas, setLinhas] = useState([]); // [{bloco, visivel}] na ordem
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  // R3/R19: carga, gravação e exclusão relatam pela faixa de avisos do
  // sistema; a confirmação destrutiva, pelo modal do sistema.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  async function carregar() {
    try {
      setCarregando(true);
      const [listaSetores, listaLayouts] = await Promise.all([
        getSetores().catch(() => []),
        getDetalheLayouts(null, telaSelecionada)
      ]);
      setSetores(Array.isArray(listaSetores) ? listaSetores : []);
      setLayouts(listaLayouts);
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telaSelecionada]);

  const telaAtiva = TELAS.find((tela) => tela.id === telaSelecionada) || TELAS[0];
  const ordemPadraoTela = telaAtiva.ordemPadrao;
  const rotuloBlocoTela = telaAtiva.rotuloBloco;

  const layoutDoSetor = useMemo(() => (
    layouts.find((layout) => layout.setor === setorSelecionado) || null
  ), [layouts, setorSelecionado]);

  // Ao trocar de setor, monta as linhas: config salva ou padrão atual.
  useEffect(() => {
    if (!setorSelecionado) {
      setLinhas([]);
      return;
    }
    if (layoutDoSetor) {
      const daConfig = layoutDoSetor.config
        .slice()
        .sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0))
        .map((item) => ({ bloco: item.bloco, visivel: item.visivel !== false }));
      const listados = new Set(daConfig.map((item) => item.bloco));
      setLinhas([
        ...daConfig,
        ...ordemPadraoTela.filter((id) => !listados.has(id)).map((id) => ({ bloco: id, visivel: true }))
      ]);
    } else {
      setLinhas(ordemPadraoTela.map((id) => ({ bloco: id, visivel: true })));
    }
  }, [setorSelecionado, layoutDoSetor, ordemPadraoTela]);

  function mover(indice, delta) {
    setLinhas((atuais) => {
      const alvo = indice + delta;
      if (alvo < 0 || alvo >= atuais.length) return atuais;
      const novas = atuais.slice();
      const [linha] = novas.splice(indice, 1);
      novas.splice(alvo, 0, linha);
      return novas;
    });
  }

  function alternarVisivel(indice) {
    setLinhas((atuais) => atuais.map((linha, i) => (
      i === indice ? { ...linha, visivel: !linha.visivel } : linha
    )));
  }

  async function salvar() {
    if (!setorSelecionado) return;
    try {
      setSalvando(true);
      const config = linhas.map((linha, indice) => ({
        bloco: linha.bloco,
        visivel: linha.visivel,
        posicao: indice
      }));
      await salvarDetalheLayout(setorSelecionado, config, telaSelecionada);
      await carregar();
      avisar.sucesso('Layout salvo.');
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao salvar layout');
    } finally {
      setSalvando(false);
    }
  }

  async function restaurarPadrao() {
    /*
      R26 — A JANELA QUE O MODAL NÃO BLOQUEANTE ABRE.

      Com `window.confirm` a página ficava CONGELADA entre a pergunta e a
      resposta: era impossível trocar de setor ou de tela no meio, e ler o
      estado depois da resposta era seguro por construção.

      O modal do sistema não bloqueia nada. Os dois seletores de contexto
      (Tela e Setor) seguem montados e clicáveis com a pergunta na frente,
      e `carregar()` pode devolver outra lista de layouts enquanto ela
      está aberta. Se a exclusão relesse `setorSelecionado`,
      `telaSelecionada` ou `layoutDoSetor` DEPOIS do `await`, a tela
      perguntaria pelo setor A e apagaria o layout do setor B — e a
      trilha registraria um consentimento válido para o alvo errado,
      que é a classe de defeito que ninguém descobre pelo log.

      Por isso o alvo é FIXADO aqui, antes de abrir a confirmação, e é
      ele que a mensagem cita e que a exclusão usa.

      O NOME de exibição do setor entra na mesma fixação, e não é detalhe:
      `setores` também é estado e `carregar()` o repõe. Resolver o nome
      depois do `await` reabriria — pelo rótulo — exatamente a janela que
      esta fixação fecha: a pergunta citaria um nome e a exclusão apagaria
      outro alvo. O código continua sendo o que a ação usa; o nome existe
      só para a frase.
    */
    const setorAlvo = setorSelecionado;
    const telaAlvo = telaSelecionada;
    const layoutAlvo = layoutDoSetor;
    const nomeSetorAlvo = rotuloDoSetor(setores, setorAlvo);
    if (!setorAlvo || !layoutAlvo) return;

    const { ok } = await confirmar({
      titulo: 'Excluir layout do setor',
      mensagem: `Excluir o layout do setor "${nomeSetorAlvo}" em "${rotuloDaTela(telaAlvo)}" e voltar ao padrão do sistema? Esta ação não pode ser desfeita — a ordem e as ocultações salvas para este setor são perdidas.`,
      rotuloConfirmar: 'Excluir layout',
      destrutiva: true
    });
    if (!ok) return;

    try {
      await excluirDetalheLayout(setorAlvo, telaAlvo);
      await carregar();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao excluir layout');
    }
  }

  return (
    <Pagina>
      {/*
        C1/R13: as duas ações subiram do rodapé da lista para a faixa fixa.
        A lista de blocos passa de dez itens e cresce com o catálogo — no
        fim dela, "Salvar layout do setor" saía da vista assim que alguém
        rolava para reordenar, que é exatamente quando ela é necessária.
        Na faixa fixa está sempre a um clique.

        C5 preservado: a destrutiva continua APARTADA do primário — antes
        pelo `justify-between` do rodapé, agora pela prop `destrutiva` do
        PageHeader, que a separa e a veste de vermelho suave.
      */}
      <PageHeader
        titulo="Layout por setor"
        contagem={carregando ? null : `${layouts.length} setor(es) com layout próprio`}
        descricao="Define por setor a ordem dos blocos da Home. O detalhe da solicitação agora usa um único padrão global, com personalização individual feita na própria tela."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando…' : 'Salvar layout do setor',
          onClick: salvar,
          desabilitada: !setorSelecionado || salvando,
          title: setorSelecionado ? undefined : 'Selecione um setor para configurar o layout'
        }}
        destrutiva={{
          rotulo: 'Excluir layout do setor',
          onClick: restaurarPadrao,
          desabilitada: !layoutDoSetor,
          title: layoutDoSetor ? undefined : 'Este setor ainda usa o layout padrão do sistema'
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* B2/B5: o que era um `card` cru vira o bloco principal da tela —
          é ele que responde à pergunta da página, então leva a barra de cor. */}
      <BlocoConteudo
        titulo="Blocos da tela"
        variante="primario"
        cor="var(--c-primary)"
      >
        <div className="grid gap-3 md:grid-cols-3">
          {/* R12: "Tela" e "Setor" são seletores de CONTEXTO — escolhem QUAL
              configuração se edita, e o que for salvo pertence à escolha.
              Continuam legítimos como lista suspensa. */}
          <label className="block text-sm text-[var(--c-muted)]">
            Tela
            <select
              className="input mt-1"
              value={telaSelecionada}
              onChange={(event) => setTelaSelecionada(event.target.value)}
            >
              {TELAS.map((tela) => (
                <option key={tela.id} value={tela.id}>{tela.rotulo}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-[var(--c-muted)]">
            Setor
            <select
              className="input mt-1"
              value={setorSelecionado}
              onChange={(event) => setSetorSelecionado(String(event.target.value).toUpperCase())}
            >
              <option value="">Selecione…</option>
              {setores.map((setor) => (
                <option key={setor.id} value={codigoDoSetor(setor)}>
                  {setor.nome}
                </option>
              ))}
            </select>
          </label>
          {setorSelecionado && (
            <p className="self-end text-sm text-[var(--c-muted)]">
              {layoutDoSetor
                ? 'Este setor tem layout próprio salvo.'
                : 'Este setor ainda usa o layout padrão do sistema.'}
            </p>
          )}
        </div>

        {carregando && <p className="text-sm text-[var(--c-muted)]">Carregando…</p>}

        {/* Lista de REORDENAÇÃO, não tabela de dados: cada linha é um bloco
            que se sobe, desce e oculta. Por isso `<ul>/<li>` e não
            TabelaPadrao — não há colunas para redimensionar nem ordenar. */}
        {!carregando && setorSelecionado && (
          <ul className="list-none m-0 p-0 space-y-1">
            {linhas.map((linha, indice) => (
              <li
                key={linha.bloco}
                className="flex items-center gap-3 rounded-lg border border-[var(--ui-border)] px-3 py-2"
              >
                <span className="text-xs font-bold text-[var(--c-muted)] w-6 text-right">
                  {indice + 1}.
                </span>
                <span className={`flex-1 text-sm font-semibold ${linha.visivel ? '' : 'line-through text-[var(--c-muted)]'}`}>
                  {rotuloBlocoTela(linha.bloco)}
                </span>
                <label className="inline-flex items-center gap-2 text-sm text-[var(--c-muted)]">
                  <input
                    type="checkbox"
                    checked={linha.visivel}
                    onChange={() => alternarVisivel(indice)}
                  />
                  visível
                </label>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => mover(indice, -1)}
                  disabled={indice === 0}
                  aria-label={`Subir ${rotuloBlocoTela(linha.bloco)}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => mover(indice, 1)}
                  disabled={indice === linhas.length - 1}
                  aria-label={`Descer ${rotuloBlocoTela(linha.bloco)}`}
                >
                  ↓
                </button>
              </li>
            ))}
          </ul>
        )}

        {!carregando && !setorSelecionado && (
          <p className="text-sm text-[var(--c-muted)]">
            Selecione um setor para configurar. Blocos do catálogo: {telaAtiva.blocos.map((b) => b.rotulo).join(' · ')}.
          </p>
        )}
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
