import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  StatGrid,
  StatTile,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import { getObras } from '../../../services/obras';
import { useAuth } from '../../../contexts/AuthContext';
import {
  atualizarApropriacao,
  baixarModeloApropriacoes,
  criarApropriacao,
  deletarApropriacao,
  importarApropriacoesXlsx,
  listarApropriacoes,
  obterConfiguracaoMacrosApropriacao,
  salvarConfiguracaoMacrosApropriacao
} from '../../../services/apropriacoes';

const OBRAS_COM_CONFIGURACAO_MACRO = new Set(['109', '110']);

/*
  A linha ORIGINAL viaja junto do registro normalizado: quando a gravação de
  uma linha falha, é ela que volta para a caixa de importação. Antes o texto
  inteiro era apagado no sucesso parcial e o que não entrou se perdia.
*/
function parseLinhaApropriacao(linha) {
  const original = String(linha || '');
  const partes = original
    .split('|')
    .map((valor) => String(valor || '').trim());

  if (!partes[0]) return null;

  return {
    original,
    dados: {
      codigo: partes[0],
      descricao: partes[1] || '',
      somadora: partes[2] || '',
      codigo_apropriacao_pai: partes[3] || ''
    }
  };
}

export default function GestaoApropriacoes() {
  const { user } = useAuth();
  const [obras, setObras] = useState([]);
  const [obraSelecionada, setObraSelecionada] = useState('');
  const [apropriacoes, setApropriacoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [somadora, setSomadora] = useState(false);
  const [apropriacaoPaiId, setApropriacaoPaiId] = useState('');
  const [textoMassa, setTextoMassa] = useState('');
  const [arquivoXlsx, setArquivoXlsx] = useState(null);
  const [importandoXlsx, setImportandoXlsx] = useState(false);
  const [configuracaoMacros, setConfiguracaoMacros] = useState(null);
  const [exibirConfiguracaoMacros, setExibirConfiguracaoMacros] = useState(false);
  const [carregandoMacros, setCarregandoMacros] = useState(false);
  const [salvandoMacros, setSalvandoMacros] = useState(false);
  const [macrosSelecionadas, setMacrosSelecionadas] = useState(() => new Set());
  // O relatório da importação de Excel ficava num `alert` multilinha: sem
  // cópia, sem histórico, some ao clicar em OK. Agora ele é um BLOCO da tela.
  const [resultadoXlsx, setResultadoXlsx] = useState(null);
  // Set em vez de array: é o que a `selecao` da TabelaPadrao consome e o que
  // torna barato tirar da marcação SÓ o que realmente foi excluído.
  const [selecionados, setSelecionados] = useState(() => new Set());
  // R19/R21: as 17 caixas do navegador deste arquivo (alert/confirm) viram
  // faixa de aviso do sistema + modal de confirmação.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  // R22: hook usado é hook importado. O ref leva o foco ao formulário, que
  // fica ACIMA da lista (R15).
  const campoCodigoRef = useRef(null);
  /*
    NÃO CORRIGIDO, POR SER DECISÃO DE SEGURANÇA DO RESPONSÁVEL: `isSuperadmin`
    só esconde o botão "Baixar modelo Excel" do JSX. `handleSalvar`,
    `excluirLote`, `importarMassa` e `importarExcel` não são barrados por
    perfil nenhum no cliente. Mantido byte a byte como estava — está no
    relatório da rodada.
  */
  const isSuperadmin = String(user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN';
  const obraAtual = useMemo(
    () => obras.find((obra) => String(obra.id) === String(obraSelecionada)) || null,
    [obras, obraSelecionada]
  );
  const podeConfigurarMacros = OBRAS_COM_CONFIGURACAO_MACRO.has(String(obraAtual?.codigo || '').trim());

  useEffect(() => {
    (async () => {
      try {
        const data = await getObras({ escopo: 'OBRAS' });
        const lista = Array.isArray(data) ? data : [];
        setObras(lista);
      } catch (error) {
        console.error(error);
        avisar.erro(error?.message || 'Erro ao carregar obras');
      }
    })();
  }, []);

  async function carregarApropriacoes(obraIdAtual = obraSelecionada) {
    if (!obraIdAtual) {
      setApropriacoes([]);
      return;
    }

    try {
      setLoading(true);
      const data = await listarApropriacoes({ obra_id: obraIdAtual, include_somadoras: true });
      setApropriacoes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar apropriacoes');
    } finally {
      setLoading(false);
    }
  }

  async function carregarConfiguracaoMacros(obraId, abrir = false) {
    const obra = obras.find((item) => String(item.id) === String(obraId));
    if (!OBRAS_COM_CONFIGURACAO_MACRO.has(String(obra?.codigo || '').trim())) return;

    try {
      setCarregandoMacros(true);
      const data = await obterConfiguracaoMacrosApropriacao(obraId);
      const atuais = Array.isArray(data?.apropriacao_ids) ? data.apropriacao_ids : [];
      const sugeridas = Array.isArray(data?.sugestao_ids) ? data.sugestao_ids : [];
      setConfiguracaoMacros(data);
      setMacrosSelecionadas(new Set((data?.configurada ? atuais : sugeridas).map(Number)));
      if (abrir) setExibirConfiguracaoMacros(true);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar etapas macro');
    } finally {
      setCarregandoMacros(false);
    }
  }

  function alternarMacro(id) {
    setMacrosSelecionadas((atual) => {
      const proximo = new Set(atual);
      const numero = Number(id);
      if (proximo.has(numero)) proximo.delete(numero);
      else proximo.add(numero);
      return proximo;
    });
  }

  function alternarMacrosVisiveis(marcar, idsVisiveis) {
    setMacrosSelecionadas((atual) => {
      const proximo = new Set(atual);
      idsVisiveis.forEach((id) => (marcar ? proximo.add(Number(id)) : proximo.delete(Number(id))));
      return proximo;
    });
  }

  async function salvarMacros() {
    const ids = [...macrosSelecionadas];
    if (!ids.length) {
      avisar.alerta('Selecione ao menos uma etapa macro.');
      return;
    }

    try {
      setSalvandoMacros(true);
      await salvarConfiguracaoMacrosApropriacao(obraSelecionada, ids);
      avisar.sucesso(`${ids.length} etapa(s) macro confirmada(s) para os formularios.`);
      await Promise.all([
        carregarConfiguracaoMacros(obraSelecionada, false),
        carregarApropriacoes(obraSelecionada)
      ]);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar etapas macro');
    } finally {
      setSalvandoMacros(false);
    }
  }

  useEffect(() => {
    setSelecionados(new Set());
    setConfiguracaoMacros(null);
    setMacrosSelecionadas(new Set());
    setExibirConfiguracaoMacros(false);
    carregarApropriacoes();
    if (obraSelecionada) carregarConfiguracaoMacros(obraSelecionada, false);
  }, [obraSelecionada]);

  const idsSelecionados = useMemo(() => [...selecionados], [selecionados]);

  const apropriacoesPaisDisponiveis = useMemo(
    () => apropriacoes.filter((item) => item.somadora && item.id !== editandoId),
    [apropriacoes, editandoId]
  );

  const errosXlsx = useMemo(
    () => (Array.isArray(resultadoXlsx?.erros) ? resultadoXlsx.erros : []),
    [resultadoXlsx]
  );

  function limparFormulario() {
    setEditandoId(null);
    setCodigo('');
    setDescricao('');
    setSomadora(false);
    setApropriacaoPaiId('');
  }

  function focarFormulario() {
    campoCodigoRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    campoCodigoRef.current?.focus({ preventScroll: true });
  }

  async function handleSalvar(event) {
    event.preventDefault();

    if (!obraSelecionada) {
      avisar.alerta('Selecione a obra.');
      return;
    }

    if (!codigo.trim()) {
      avisar.alerta('Informe o código da apropriação.');
      return;
    }

    try {
      setSalvando(true);
      const payload = {
        obra_id: Number(obraSelecionada),
        codigo,
        descricao,
        somadora,
        apropriacao_pai_id: apropriacaoPaiId || null
      };

      if (editandoId) {
        await atualizarApropriacao(editandoId, payload);
      } else {
        await criarApropriacao(payload);
      }

      limparFormulario();
      avisar.sucesso(editandoId ? 'Apropriacao atualizada.' : 'Apropriacao criada.');
      await carregarApropriacoes();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar apropriacao');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(item) {
    setEditandoId(item.id);
    setCodigo(item.codigo || '');
    setDescricao(item.descricao || '');
    setSomadora(Boolean(item.somadora));
    setApropriacaoPaiId(item.apropriacao_pai_id ? String(item.apropriacao_pai_id) : '');
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

    O `toggleTodos` antigo fazia `apropriacoes.map(...)`: marcava a lista
    INTEIRA carregada, não a exibida — o padrão "pergunta sobre 3, apaga 47"
    da DoD. Agora o marcar-todos é o do cabeçalho da TabelaPadrao, que
    entrega em `ids` exatamente os itens que ela está exibindo.
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

    Antes: `for (const id of ids) await deletarApropriacao(id);` dentro de UM
    try/catch. Falhando a 3ª de 10, as 2 primeiras JÁ ESTAVAM excluídas e a
    pessoa lia "Erro ao excluir apropriacoes". Agora cada exclusão tem o seu
    try/catch, e os dois números aparecem no aviso.

    R26: `alvos` fixa o lote numa const ANTES do await da confirmação — e aqui
    a janela é real: trocar a obra do seletor enquanto o modal está aberto
    recarrega a lista inteira por baixo.
  */
  async function excluirLote(ids) {
    const alvos = [...ids];

    if (!alvos.length) {
      avisar.alerta('Selecione ao menos uma apropriação.');
      return;
    }

    const { ok } = await confirmar({
      titulo: 'Excluir apropriações',
      mensagem: `Excluir ${alvos.length} apropriacao(oes)? Esta acao nao pode ser desfeita. Se o lote parar no meio, o que ja foi excluido continua excluido.`,
      rotuloConfirmar: `Excluir ${alvos.length}`,
      destrutiva: true
    });
    if (!ok) return;

    const excluidos = new Set();
    const falhas = [];

    for (const id of alvos) {
      try {
        await deletarApropriacao(id);
        excluidos.add(id);
      } catch (error) {
        console.error(error);
        falhas.push(error?.message || `Nao foi possivel excluir o registro ${id}.`);
      }
    }

    // Só sai da marcação o que realmente foi excluído.
    setSelecionados((atual) => new Set([...atual].filter((id) => !excluidos.has(id))));
    await carregarApropriacoes();

    if (!falhas.length) {
      avisar.sucesso(`${excluidos.size} de ${alvos.length} apropriacao(oes) excluida(s).`);
    } else if (excluidos.size) {
      avisar.alerta(
        `${excluidos.size} de ${alvos.length} apropriacao(oes) excluida(s); ${falhas.length} falharam e continuam na lista. Primeira falha: ${falhas[0]}`
      );
    } else {
      avisar.erro(
        `Nenhuma das ${alvos.length} apropriacao(oes) foi excluida. Primeira falha: ${falhas[0]}`
      );
    }
  }

  /*
    DEFEITO DE SIGNIFICADO CORRIGIDO — a importação anunciava o número PEDIDO,
    não o GRAVADO, e descartava em silêncio as linhas sem código. Agora conta
    gravadas × falhadas × ignoradas, diz os três, e devolve à caixa as linhas
    que não entraram.

    R26: a obra é fixada numa const ANTES do laço — o seletor de obra continua
    clicável enquanto a importação corre, e sem isso metade do lote poderia ir
    para uma obra e metade para outra.
  */
  async function importarMassa() {
    const obraAlvo = obraSelecionada;

    if (!obraAlvo) {
      avisar.alerta('Selecione a obra antes de importar.');
      return;
    }

    const brutas = String(textoMassa || '')
      .split(/\r?\n/)
      .filter((linha) => String(linha || '').trim());
    const linhas = brutas.map(parseLinhaApropriacao).filter(Boolean);
    const ignoradas = brutas.filter((linha) => !parseLinhaApropriacao(linha));

    if (!linhas.length) {
      avisar.alerta('Use o formato Código|Descrição, uma por linha.');
      return;
    }

    try {
      setSalvando(true);
      let gravadas = 0;
      const naoGravadas = [...ignoradas];
      const falhas = [];

      for (const item of linhas) {
        try {
          await criarApropriacao({
            obra_id: Number(obraAlvo),
            codigo: item.dados.codigo,
            descricao: item.dados.descricao,
            somadora: item.dados.somadora,
            codigo_apropriacao_pai: item.dados.codigo_apropriacao_pai
          });
          gravadas += 1;
        } catch (error) {
          console.error(error);
          naoGravadas.push(item.original);
          falhas.push(error?.message || `Linha "${item.original}"`);
        }
      }

      setTextoMassa(naoGravadas.join('\n'));
      await carregarApropriacoes(obraAlvo);

      const sobreIgnoradas = ignoradas.length
        ? ` ${ignoradas.length} linha(s) sem codigo foram ignoradas e continuam na caixa.`
        : '';

      if (!falhas.length) {
        avisar.sucesso(`${gravadas} de ${linhas.length} apropriacao(oes) importada(s).${sobreIgnoradas}`);
      } else if (gravadas) {
        avisar.alerta(
          `${gravadas} de ${linhas.length} apropriacao(oes) importada(s); ${falhas.length} nao entraram e ficaram na caixa.${sobreIgnoradas} Primeira falha: ${falhas[0]}`
        );
      } else {
        avisar.erro(
          `Nenhuma das ${linhas.length} apropriacao(oes) foi importada.${sobreIgnoradas} Primeira falha: ${falhas[0]}`
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleBaixarModelo() {
    try {
      await baixarModeloApropriacoes();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao baixar modelo de apropriacoes');
    }
  }

  /*
    O relatório da importação de Excel saía num `alert` multilinha com no
    máximo 8 erros truncados: não dá para copiar, não dá para conferir depois
    e some ao clicar em OK — justamente o retorno que a pessoa precisa ler
    linha a linha para corrigir a planilha. Agora o resumo vai para a faixa de
    avisos e o relatório INTEIRO (todos os erros, com o número da linha) fica
    num bloco da tela, até a próxima importação.
  */
  async function importarExcel() {
    const arquivo = arquivoXlsx;
    const obraAlvo = obraSelecionada || null;

    if (!arquivo) {
      avisar.alerta('Selecione um arquivo Excel para importar.');
      return;
    }

    try {
      setImportandoXlsx(true);
      const resultado = await importarApropriacoesXlsx(arquivo, obraAlvo);
      setArquivoXlsx(null);
      setResultadoXlsx({ ...resultado, arquivo: arquivo.name });
      await carregarApropriacoes();

      const erros = Array.isArray(resultado?.erros) ? resultado.erros : [];
      const importadas = resultado?.importados || 0;

      if (!erros.length) {
        avisar.sucesso(`Importacao concluida: ${importadas} linha(s) importada(s). Detalhe no bloco "Resultado da importacao Excel".`);
      } else if (importadas) {
        avisar.alerta(`Importacao parcial: ${importadas} linha(s) importada(s) e ${erros.length} com erro. Os erros estao listados no bloco "Resultado da importacao Excel".`);
      } else {
        avisar.erro(`Nenhuma linha importada: ${erros.length} erro(s). Os erros estao listados no bloco "Resultado da importacao Excel".`);
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao importar arquivo Excel');
    } finally {
      setImportandoXlsx(false);
    }
  }

  /*
    R17: toda coluna declara o `tipo`. A coluna de marcação feita à mão saiu —
    quem a desenha agora é a `selecao` da TabelaPadrao.
  */
  const colunas = [
    {
      id: 'codigo',
      titulo: 'Código',
      tipo: 'codigo',
      render: (item) => item.codigo
    },
    {
      id: 'descricao',
      titulo: 'Descrição',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => item.descricao || '-'
    },
    {
      id: 'tipo',
      titulo: 'Tipo',
      tipo: 'badge',
      /*
        R25: as classes `bg-amber-100 text-amber-700` / `bg-slate-100
        text-slate-600` eram paleta crua — sem par no tema escuro e fora do
        piso de contraste do ThemeContext. O StatusBadge resolve cor, ícone e
        contraste por token; a família é declarada para preservar a distinção
        (somadora chamava atenção em âmbar, analítica ficava neutra).
      */
      render: (item) => (
        <StatusBadge
          status={item.somadora ? 'Somadora' : 'Analitica'}
          kind={item.somadora ? 'warning' : 'neutral'}
        />
      )
    },
    {
      id: 'pai',
      titulo: 'Pai',
      tipo: 'codigo',
      render: (item) => item.apropriacao_pai?.codigo || '-'
    }
  ];

  const colunasErrosXlsx = [
    {
      id: 'linha',
      titulo: 'Linha',
      tipo: 'numero',
      render: (erro) => erro?.linha ?? '-'
    },
    {
      id: 'erro',
      titulo: 'Erro',
      tipo: 'texto',
      noCard: 'titulo',
      render: (erro) => (
        <span title={erro?.erro || undefined}>{erro?.erro || '-'}</span>
      )
    }
  ];

  const sugestoesMacro = new Set((configuracaoMacros?.sugestao_ids || []).map(Number));
  const colunasMacros = [
    {
      id: 'codigo',
      titulo: 'Código',
      tipo: 'codigo',
      render: (item) => item.codigo
    },
    {
      id: 'descricao',
      titulo: 'Etapa',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => item.descricao || '-'
    },
    {
      id: 'pai',
      titulo: 'Etapa superior',
      tipo: 'codigo',
      render: (item) => item.apropriacao_pai?.codigo || 'Raiz'
    },
    {
      id: 'sugestao',
      titulo: 'Detecção',
      tipo: 'badge',
      render: (item) => sugestoesMacro.has(Number(item.id))
        ? <StatusBadge status="Sugerida" kind="info" />
        : <StatusBadge status="Estrutural" kind="neutral" />
    }
  ];

  return (
    <Pagina>
      <PageHeader
        titulo="Gestão de apropriações"
        /*
          A FAIXA SEMPRE TEM NUMERO (C2, 05/09).

          A contagem so existia com uma obra escolhida; sem obra a faixa
          ficava sem numero nenhum, que e justamente o estado em que a tela
          abre. Quem chega precisa saber sobre quanta coisa esta olhando —
          e antes de escolher a obra o total da tela e quantas obras ela
          alcanca. Mesmo criterio de 05/09: a faixa leva o TOTAL, os blocos
          levam os recortes.
        */
        contagem={obraSelecionada && !loading
          ? `${apropriacoes.length} apropriacao(oes)`
          : `${obras.length} obra(s)`}
        descricao="Cadastro compartilhado das apropriações vinculadas as obras para solicitações, financeiro e compras."
        acaoPrincipal={{ rotulo: 'Nova apropriação', onClick: () => { limparFormulario(); focarFormulario(); } }}
      />

      {/* R16: UM dono para a faixa de avisos, logo abaixo do cabeçalho. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R12: seletor de CONTEXTO — escolhe de QUAL obra são as apropriações
        que se lê e se cadastra, e o registro novo herda a escolha. A regra
        declara esse caso como select legítimo; o que ela proíbe é o select de
        RECORTE de lista, que não existe nesta tela.
      */}
      <BlocoConteudo
        titulo="Obra"
        descricao="As apropriações listadas e as que você cadastrar pertencem a obra escolhida aqui."
      >
        <FormSecao colunas={2}>
          <CampoForm label="Obra" obrigatorio>
            <select
              className="input w-full"
              value={obraSelecionada}
              onChange={(event) => setObraSelecionada(event.target.value)}
            >
              <option value="">Selecione</option>
              {obras.map((obra) => (
                <option key={obra.id} value={obra.id}>
                  {obra.codigo ? `${obra.codigo} - ` : ''}{obra.nome}
                </option>
              ))}
            </select>
          </CampoForm>
        </FormSecao>
      </BlocoConteudo>

      {podeConfigurarMacros ? (
        <BlocoConteudo
          titulo="Etapas macro dos formulários"
          descricao={configuracaoMacros?.configurada
            ? 'Configuração ativa. Novos lançamentos fora de Custos e Recebíveis usam somente as etapas confirmadas.'
            : 'Revise a sugestão automática antes de limitar os formulários às etapas macro.'}
          variante="secundario"
          contagem={configuracaoMacros?.configurada
            ? `${configuracaoMacros.apropriacao_ids?.length || 0} configurada(s)`
            : 'Confirmação pendente'}
          acoes={(
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => (
                configuracaoMacros
                  ? setExibirConfiguracaoMacros((atual) => !atual)
                  : carregarConfiguracaoMacros(obraSelecionada, true)
              )}
              disabled={carregandoMacros}
            >
              {carregandoMacros
                ? 'Carregando...'
                : exibirConfiguracaoMacros
                  ? 'Recolher configuração'
                  : configuracaoMacros?.configurada
                    ? 'Editar etapas macro'
                    : 'Revisar etapas macro'}
            </button>
          )}
        >
          {exibirConfiguracaoMacros ? (
            <div className="space-y-3">
              <div className="app-actionbar">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setMacrosSelecionadas(new Set((configuracaoMacros?.sugestao_ids || []).map(Number)))}
                >
                  Restaurar sugestão
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={salvarMacros}
                  disabled={salvandoMacros || !macrosSelecionadas.size}
                >
                  {salvandoMacros ? 'Salvando...' : `Confirmar ${macrosSelecionadas.size} etapa(s)`}
                </button>
              </div>

              <TabelaPadrao
                colunas={colunasMacros}
                itens={configuracaoMacros?.candidatas || []}
                carregando={carregandoMacros}
                getId={(item) => Number(item.id)}
                storageKey="tabela:gestao-apropriacoes-macros"
                rotuloRolagem="Etapas macro candidatas"
                selecao={{
                  selecionados: macrosSelecionadas,
                  aoAlternar: (id) => alternarMacro(id),
                  aoAlternarTodos: alternarMacrosVisiveis
                }}
                vazio="Nenhuma etapa candidata foi identificada nesta obra."
              />
            </div>
          ) : null}
        </BlocoConteudo>
      ) : null}

      {/*
        R9 (revista em 04/09): esta tela EXISTE para cadastrar apropriação —
        tirando o formulário sobra uma lista que ninguém abriria por si só.
        Formulário INLINE; não mover para OverlayModal.
      */}
      <BlocoConteudo titulo={editandoId ? 'Editar apropriacao' : 'Nova apropriacao'}>
        <form onSubmit={handleSalvar}>
          <FormSecao colunas={2}>
            <CampoForm label="Código" obrigatorio>
              <input
                ref={campoCodigoRef}
                className="input w-full"
                placeholder="Ex.: 00.001.001"
                value={codigo}
                onChange={(event) => setCodigo(event.target.value)}
              />
            </CampoForm>

            <CampoForm label="Descrição">
              <input
                className="input w-full"
                placeholder="Descrição da apropriação"
                value={descricao}
                onChange={(event) => setDescricao(event.target.value)}
              />
            </CampoForm>

            <CampoForm
              label="Apropriação pai"
              hint="Deixe em 'Identificar pelo codigo' para o sistema deduzir o pai a partir da numeracao."
            >
              {/* R12: select de FORMULÁRIO (entrada de dado do registro) —
                  legítimo pela própria regra. */}
              <select
                className="input w-full"
                value={apropriacaoPaiId}
                onChange={(event) => setApropriacaoPaiId(event.target.value)}
              >
                <option value="">Identificar pelo código</option>
                {apropriacoesPaisDisponiveis.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.codigo} - {item.descricao || 'Sem descricao'}
                  </option>
                ))}
              </select>
            </CampoForm>

            <div className="form-campo--linha">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={somadora}
                  onChange={(event) => setSomadora(event.target.checked)}
                />
                Conta somadora
              </label>
            </div>
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
        descricao="Planilha Excel ou colagem de texto. O que não entrar continua na caixa para nova tentativa."
        variante="secundario"
        recolhivel
        recolhidoPadrao
        acoes={isSuperadmin ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={handleBaixarModelo}>
            Baixar modelo Excel
          </button>
        ) : null}
      >
        <FormSecao legenda="Arquivo Excel" colunas={2}>
          <CampoForm
            label="Arquivo"
            span={2}
            hint="Se uma obra estiver selecionada, ela sera usada para todas as linhas. Sem obra selecionada, preencha a coluna codigo_obra no arquivo."
          >
            <input
              className="input w-full"
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => setArquivoXlsx(event.target.files?.[0] || null)}
            />
          </CampoForm>

          <div className="form-campo--linha">
            <div className="app-actionbar">
              <button type="button" className="btn btn-primary" onClick={importarExcel} disabled={importandoXlsx}>
                {importandoXlsx ? 'Importando...' : 'Importar Excel'}
              </button>
            </div>
          </div>
        </FormSecao>

        <FormSecao legenda="Colagem de texto" colunas={2}>
          <CampoForm label="Linhas" tipo="texto-longo" span={2}>
            {/* R10: a altura do textarea vem da folha do sistema
                (textarea.input); o `min-h-[140px]` era medida à mão. */}
            <textarea
              className="input w-full"
              placeholder={'Formato: Código|Descrição|Somadora|CodigoPai\nExemplo:\n00.001|Serviços preliminares|sim|\n00.001.001|Tapume|não|00.001'}
              value={textoMassa}
              onChange={(event) => setTextoMassa(event.target.value)}
            />
          </CampoForm>
        </FormSecao>

        <div className="app-actionbar">
          <button type="button" className="btn btn-primary" onClick={importarMassa} disabled={salvando}>
            Importar
          </button>
        </div>
      </BlocoConteudo>

      {resultadoXlsx ? (
        <BlocoConteudo
          titulo="Resultado da importação Excel"
          contagem={resultadoXlsx.arquivo || null}
          descricao="Fica na tela até a próxima importação — o relatório antes so existia dentro da caixa do navegador."
          variante="secundario"
          acoes={(
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setResultadoXlsx(null)}>
              Fechar relatório
            </button>
          )}
        >
          <StatGrid colunas={4}>
            <StatTile label="Importadas" valor={resultadoXlsx.importados || 0} />
            <StatTile label="Criadas" valor={resultadoXlsx.criados || 0} />
            <StatTile label="Atualizadas" valor={resultadoXlsx.atualizados || 0} />
            <StatTile label="Somadoras identificadas" valor={resultadoXlsx.somadoras_identificadas || 0} />
            <StatTile
              label="Erros"
              valor={errosXlsx.length}
              tom={errosXlsx.length ? 'danger' : undefined}
            />
          </StatGrid>

          {errosXlsx.length ? (
            /* R17: `semIdentidade` DECLARADO — a linha de erro de uma planilha
               não tem nome de registro; forçar a mensagem em maiúsculas seria
               pior. O `alert` antigo mostrava no máximo 8 erros; aqui estão
               todos. */
            <TabelaPadrao
              colunas={colunasErrosXlsx}
              itens={errosXlsx.map((erro, indice) => ({ ...erro, id: `${erro?.linha ?? 's'}-${indice}` }))}
              semIdentidade
              storageKey="tabela:gestao-apropriacoes-erros-xlsx"
              rotuloRolagem="Erros da importacao Excel"
              vazio="Nenhum erro."
            />
          ) : null}
        </BlocoConteudo>
      ) : null}

      <BlocoConteudo
        titulo="Apropriações cadastradas"
        contagem={obraSelecionada ? `${apropriacoes.length} apropriacao(oes)` : null}
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
        {!obraSelecionada ? (
          <p className="text-muted text-sm">Selecione uma obra para visualizar as apropriações.</p>
        ) : (
          /*
            R16: o botão "Selecionar todas" saiu porque a responsabilidade
            agora é do cabeçalho da tabela. A capacidade não foi removida —
            mudou de lugar e passou a marcar o que está EXIBIDO.
          */
          <TabelaPadrao
            colunas={colunas}
            itens={apropriacoes}
            carregando={loading}
            getId={(item) => item.id}
            storageKey="tabela:gestao-apropriacoes"
            rotuloRolagem="Apropriacoes cadastradas"
            larguraAcoes={240}
            aoClicarLinha={iniciarEdicao}
            selecao={{
              selecionados,
              aoAlternar: (id) => toggleSelecionado(id),
              aoAlternarTodos: alternarTodosVisiveis
            }}
            vazio={{
              title: 'Nenhuma apropriacao cadastrada',
              message: 'Cadastre a primeira apropriacao desta obra ou use a importacao em massa.'
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
        )}
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
