import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  FormSecao,
  CampoForm,
  BarraFiltros,
  alternarValorFiltro,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import {
  atualizarInsumo,
  criarInsumo,
  deletarInsumo,
  importarInsumosEmMassa,
  listarCategorias,
  listarInsumos,
  listarUnidades
} from '../../../services/compras';

const initialForm = {
  nome: '',
  codigo: '',
  descricao: '',
  unidade_id: '',
  unidade_manual: '',
  categoria_id: ''
};

export default function GestaoInsumos() {
  const [insumos, setInsumos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  /*
    R12 — o recorte da lista deixa de ser <select> de escolha única e passa a
    ser MARCAÇÃO na BarraFiltros: busca larga em cima, filtro marcável
    abaixo, etiqueta removível mostrando o que está filtrando.

    `unico: true` na dimensão CATEGORIA porque o serviço aceita UM valor só:
    `listarInsumos({ categoria_id })` vira `?categoria_id=N` e o
    InsumoController faz `where.categoria_id = categoria_id` (igualdade, não
    lista). Com marcação múltipla o usuário veria duas etiquetas e a lista
    não estreitaria — capacidade aparente sem efeito, a família da R15.
  */
  const [filtros, setFiltros] = useState({ q: '', categoria: new Set() });
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [importacaoAberta, setImportacaoAberta] = useState(false);
  const [importacaoTexto, setImportacaoTexto] = useState('');
  const [importacaoUnidadeId, setImportacaoUnidadeId] = useState('');
  const [importacaoCategoriaId, setImportacaoCategoriaId] = useState('');
  const [importandoEmMassa, setImportandoEmMassa] = useState(false);
  const [resultadoImportacao, setResultadoImportacao] = useState(null);

  // R19: a faixa de avisos do sistema no lugar dos sete `alert()` da tela.
  const { avisos, avisar, fechar } = useAvisos();
  // R19/R21: confirmação do sistema no lugar do `window.confirm` da exclusão.
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  // R22: hook usado é hook importado — `useRef` está no import acima. A
  // referência leva o foco ao formulário inline (que fica ACIMA da lista);
  // não mede nada.
  const campoNomeRef = useRef(null);

  // A dimensão é `unico`, então o conjunto tem no máximo um valor — e é ele
  // que vai para o serviço. Declarado ANTES do efeito que o cita (TDZ).
  const categoriaSelecionada = [...filtros.categoria][0] || '';

  async function carregarContexto() {
    try {
      const [listaInsumos, listaUnidades, listaCategorias] = await Promise.all([
        listarInsumos(categoriaSelecionada ? { categoria_id: categoriaSelecionada } : {}),
        listarUnidades(),
        listarCategorias()
      ]);

      setInsumos(Array.isArray(listaInsumos) ? listaInsumos : []);
      setUnidades(Array.isArray(listaUnidades) ? listaUnidades : []);
      setCategorias(Array.isArray(listaCategorias) ? listaCategorias : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar cadastros de insumos');
    } finally {
      setLoading(false);
    }
  }

  // R23: o recorte aplica AO MARCAR — uma dimensão, uma requisição, longe do
  // critério de "consulta cara" que pediria botão de aplicar.
  useEffect(() => {
    setLoading(true);
    carregarContexto();
  }, [categoriaSelecionada]);

  const insumosFiltrados = useMemo(() => {
    const termo = filtros.q.trim().toLowerCase();
    if (!termo) return insumos;

    return insumos.filter((item) =>
      [item.nome, item.codigo, item.descricao, item.categoria?.nome, item.unidade?.sigla]
        .some((valor) => String(valor || '').toLowerCase().includes(termo))
    );
  }, [filtros.q, insumos]);

  // O formulário fica ACIMA da lista: sem levar o foco até ele, clicar em
  // "Editar" no fim de uma lista longa não muda nada no que a pessoa vê —
  // a edição aconteceria fora do campo de visão (R15).
  function focarFormulario() {
    campoNomeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // preventScroll: quem rola é o scrollIntoView suave.
    campoNomeRef.current?.focus({ preventScroll: true });
  }

  function abrirNovo() {
    setEditandoId(null);
    setForm(initialForm);
    focarFormulario();
  }

  function abrirEdicao(item) {
    setEditandoId(item.id);
    setForm({
      nome: item.nome || '',
      codigo: item.codigo || '',
      descricao: item.descricao || '',
      unidade_id: item.unidade_id ? String(item.unidade_id) : '',
      unidade_manual: item.unidade_manual || '',
      categoria_id: item.categoria_id ? String(item.categoria_id) : ''
    });
    focarFormulario();
  }

  function limparFormulario() {
    setEditandoId(null);
    setForm(initialForm);
  }

  async function handleSalvar(event) {
    event.preventDefault();

    if (!form.nome.trim()) {
      avisar.alerta('Informe o nome.');
      return;
    }

    if (!form.unidade_id && !form.unidade_manual.trim()) {
      avisar.alerta('Selecione uma unidade ou informe uma unidade manual.');
      return;
    }

    const payload = {
      nome: form.nome,
      codigo: form.codigo || null,
      descricao: form.descricao || null,
      unidade_id: form.unidade_id ? Number(form.unidade_id) : null,
      unidade_manual: form.unidade_manual || null,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null
    };

    try {
      setSalvando(true);
      if (editandoId) {
        await atualizarInsumo(editandoId, payload);
      } else {
        await criarInsumo(payload);
      }
      avisar.sucesso(editandoId ? 'Insumo atualizado.' : 'Insumo cadastrado.');
      limparFormulario();
      setLoading(true);
      await carregarContexto();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar insumo');
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(item) {
    /*
      R26 — o alvo é fixado numa `const` ANTES do `await`. O modal do sistema
      NÃO congela a página (o `window.confirm` congelava): com o formulário
      inline e a lista vivas atrás dele, clicar noutra linha entre a pergunta
      e a resposta faria a tela perguntar sobre um insumo e apagar outro.
      A `const` abaixo é o que impede isso; nunca reler o estado depois.
    */
    const alvo = item;
    // R21: o retorno é `{ ok, texto }` — objeto é sempre truthy, então
    // desestruturar não é estilo, é o que faz o "Cancelar" cancelar.
    const { ok } = await confirmar({
      titulo: 'Excluir insumo',
      mensagem: `Excluir o insumo "${alvo.nome}"? Esta acao nao pode ser desfeita.`,
      rotuloConfirmar: 'Excluir',
      destrutiva: true
    });
    if (!ok) return;

    try {
      await deletarInsumo(alvo.id);
      avisar.sucesso('Insumo excluído.');
      // O formulário inline fica ACIMA da lista: se o registro aberto nele
      // acabou de ser apagado, salvar depois recriaria/atualizaria um id que
      // não existe mais.
      if (editandoId === alvo.id) limparFormulario();
      setLoading(true);
      await carregarContexto();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao excluir insumo');
    }
  }

  function abrirImportacao() {
    setImportacaoTexto('');
    setImportacaoUnidadeId('');
    setImportacaoCategoriaId('');
    setResultadoImportacao(null);
    setImportacaoAberta(true);
  }

  function fecharImportacao() {
    setImportacaoAberta(false);
    setImportacaoTexto('');
    setImportacaoUnidadeId('');
    setImportacaoCategoriaId('');
    setResultadoImportacao(null);
  }

  async function handleImportarEmMassa(event) {
    event.preventDefault();

    const linhas = importacaoTexto
      .split('\n')
      .map(linha => linha.trim())
      .filter(linha => linha.length > 0);

    if (linhas.length === 0) {
      avisar.alerta('Cole pelo menos um insumo.');
      return;
    }

    try {
      setImportandoEmMassa(true);
      const resultado = await importarInsumosEmMassa({
        insumos: linhas,
        unidade_id: importacaoUnidadeId ? Number(importacaoUnidadeId) : null,
        categoria_id: importacaoCategoriaId ? Number(importacaoCategoriaId) : null
      });

      setResultadoImportacao(resultado);

      if (resultado.sucesso > 0) {
        avisar.sucesso(`${resultado.sucesso} de ${resultado.total} insumos importados com sucesso.`);
        setLoading(true);
        await carregarContexto();
      } else {
        avisar.erro(`Nenhum insumo importado (${resultado.sucesso} de ${resultado.total}).`);
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao importar insumos em massa');
    } finally {
      setImportandoEmMassa(false);
    }
  }

  const linhasColadas = importacaoTexto.split('\n').filter((linha) => linha.trim()).length;

  /*
    R17 — toda coluna declara o seu `tipo`; medida e alinhamento são do
    componente (R1/R10/R14), a tela não escreve largura.
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
      id: 'codigo',
      titulo: 'Código',
      tipo: 'codigo',
      render: (item) => item.codigo || '-'
    },
    {
      id: 'unidade',
      titulo: 'Unidade',
      tipo: 'codigo',
      /*
        R25 — a unidade digitada à mão era `text-red-600 dark:text-red-400`,
        paleta crua sem par de tema e fora do piso de contraste do
        ThemeContext. O vermelho aqui é SIGNIFICADO (a unidade manual sai em
        vermelho no PDF, é o aviso de que ninguém padronizou aquela unidade),
        então vira o token semântico — mesma cor, agora com tema e contraste.
      */
      render: (item) => (
        item.unidade_manual ? (
          <span
            className="font-semibold"
            style={{ color: 'var(--sem-danger)' }}
            title="Unidade informada manualmente — sai em vermelho no PDF"
          >
            {item.unidade_manual}
          </span>
        ) : (
          item.unidade?.sigla || item.unidade?.nome || '-'
        )
      )
    },
    {
      id: 'categoria',
      titulo: 'Categoria',
      tipo: 'texto',
      render: (item) => item.categoria?.nome || '-'
    },
    {
      id: 'descricao',
      titulo: 'Descrição',
      tipo: 'texto',
      // T6: texto longo trunca com o texto completo no tooltip.
      render: (item) => (
        <span title={item.descricao || undefined}>{item.descricao || '-'}</span>
      )
    }
  ];

  return (
    <Pagina>
      {/* R5/R13/C1: o título e o apoio viviam num <div> solto com
          `page-subtitle`. Agora moram na faixa fixa do PageHeader, que
          compacta na rolagem e mantém as ações a um clique. */}
      <PageHeader
        titulo="Gestão de Insumos"
        contagem={loading ? null : `${insumosFiltrados.length} insumo(s)`}
        descricao="Cadastro de insumos vinculados a unidades e categorias do módulo compras."
        acaoPrincipal={{ rotulo: 'Novo insumo', onClick: abrirNovo }}
        secundarias={[{
          rotulo: 'Importar em massa',
          onClick: () => (importacaoAberta ? fecharImportacao() : abrirImportacao())
        }]}
      />

      {/* R16: UM dono para a faixa de avisos, logo abaixo do cabeçalho. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, E NÃO EM MODAL.

        Esta tela existe PARA cadastrar insumo: pelo teste da regra, tirando
        o formulário sobra uma lista que ninguém abriria por si só. O
        `fixed inset-0` à mão obrigava a abrir e fechar uma caixa para fazer
        justamente aquilo que a pessoa veio fazer — e o uso normal é
        cadastrar vários insumos seguidos. Painel ACIMA da lista, molde da
        ComercialUnidades.
      */}
      <BlocoConteudo titulo={editandoId ? 'Editar insumo' : 'Novo insumo'}>
        <form className="space-y-4" onSubmit={handleSalvar}>
          <FormSecao legenda="Identificação" colunas={2}>
            <CampoForm label="Nome" obrigatorio>
              <input
                ref={campoNomeRef}
                className="input w-full"
                value={form.nome}
                onChange={(event) => setForm((atual) => ({ ...atual, nome: event.target.value }))}
              />
            </CampoForm>

            <CampoForm label="Código">
              <input
                className="input w-full"
                value={form.codigo}
                onChange={(event) => setForm((atual) => ({ ...atual, codigo: event.target.value }))}
              />
            </CampoForm>

            <CampoForm
              label="Unidade"
              hint={form.unidade_manual
                ? `Unidade manual em uso: "${form.unidade_manual}". Escolher uma unidade aqui NAO apaga a manual.`
                : 'Obrigatoria, salvo quando o insumo ja tem unidade manual (vinda da importacao).'}
            >
              {/* R12: select de FORMULÁRIO (entrada de dado do registro) —
                  legítimo. O filtro da lista, esse sim, virou marcação. */}
              <select
                className="input w-full"
                value={form.unidade_id}
                onChange={(event) => setForm((atual) => ({ ...atual, unidade_id: event.target.value }))}
              >
                <option value="">Selecione</option>
                {unidades.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sigla} - {item.nome}
                  </option>
                ))}
              </select>
            </CampoForm>

            {/*
              `unidade_manual` continua no estado e no payload, exatamente
              como estava: o formulário lê o valor do registro e o devolve
              intacto. Ele NÃO ganha campo aqui — reorganização é pura, e
              expor um campo novo seria capacidade nova. Fica registrado no
              relatório como proposta (a validação da tela exige "unidade OU
              unidade manual" e só a primeira metade tem onde ser digitada).
            */}

            <CampoForm label="Categoria">
              <select
                className="input w-full"
                value={form.categoria_id}
                onChange={(event) => setForm((atual) => ({ ...atual, categoria_id: event.target.value }))}
              >
                <option value="">Selecione</option>
                {categorias.map((item) => (
                  <option key={item.id} value={item.id}>{item.nome}</option>
                ))}
              </select>
            </CampoForm>

            <CampoForm label="Descrição" tipo="texto-longo" span={2}>
              {/* R10: a altura do textarea vem da folha do sistema
                  (textarea.input), não do `min-h-[110px]` que estava aqui. */}
              <textarea
                className="input w-full"
                value={form.descricao}
                onChange={(event) => setForm((atual) => ({ ...atual, descricao: event.target.value }))}
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando...' : (editandoId ? 'Salvar alteracoes' : 'Criar insumo')}
            </button>
            <button type="button" className="btn btn-outline" onClick={limparFormulario} disabled={salvando}>
              Limpar
            </button>
          </div>
        </form>
      </BlocoConteudo>

      {/*
        A importação em massa é a MESMA tarefa (cadastrar insumo) por outro
        caminho, e por isso também é inline — só que recolhida por padrão,
        porque a via normal é o formulário acima. O `key` remonta o bloco
        quando o botão do cabeçalho abre/fecha (o estado de recolhido é
        interno ao BlocoConteudo).
      */}
      {importacaoAberta && (
        <BlocoConteudo
          key="importacao-aberta"
          titulo="Importar insumos em massa"
          descricao="Um insumo por linha. Linhas vazias são ignoradas e duplicados não são criados."
          variante="secundario"
        >
          <form onSubmit={handleImportarEmMassa} className="space-y-4">
            <FormSecao legenda="Padrão aplicado a todas as linhas" colunas={2}>
              <CampoForm
                label="Unidade (opcional)"
                hint="Selecione uma unidade pre-cadastrada ou deixe em branco para preencher depois."
              >
                <select
                  className="input w-full"
                  value={importacaoUnidadeId}
                  onChange={(event) => setImportacaoUnidadeId(event.target.value)}
                >
                  <option value="">Nenhuma (entrada manual)</option>
                  {unidades.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sigla} - {item.nome}
                    </option>
                  ))}
                </select>
              </CampoForm>

              <CampoForm
                label="Categoria (opcional)"
                hint="Todos os insumos colados recebem esta categoria."
              >
                <select
                  className="input w-full"
                  value={importacaoCategoriaId}
                  onChange={(event) => setImportacaoCategoriaId(event.target.value)}
                >
                  <option value="">Nenhuma</option>
                  {categorias.map((item) => (
                    <option key={item.id} value={item.id}>{item.nome}</option>
                  ))}
                </select>
              </CampoForm>

              <CampoForm
                label="Insumos (um por linha)"
                tipo="texto-longo"
                span={2}
                hint={`${linhasColadas} insumo(s) colado(s). Unidade em branco entra como unidade manual e aparece em vermelho no PDF.`}
              >
                {/* R10: a altura vem de `rows`, não do `min-h-[200px]`. */}
                <textarea
                  className="input w-full font-mono"
                  rows={8}
                  placeholder="Parafuso M8&#10;Prego 2.5&#10;Cimento Portland&#10;Areia média&#10;Brita 1"
                  value={importacaoTexto}
                  onChange={(event) => setImportacaoTexto(event.target.value)}
                  required
                />
              </CampoForm>
            </FormSecao>

            {/*
              R25 — o resultado era um painel pintado com nove famílias de
              paleta crua (green/red/yellow/blue, com o par `dark:` escrito à
              mão). O placar vai para a faixa de avisos do sistema, que já
              tem tom semântico por token; a lista de erros fica aqui, junto
              do texto que a originou. Nenhuma informação saiu.
            */}
            {resultadoImportacao ? (
              <div className="space-y-2">
                <p className="form-hint">
                  {resultadoImportacao.sucesso} de {resultadoImportacao.total} insumos importados com sucesso.
                </p>
                {resultadoImportacao.erros && resultadoImportacao.erros.length > 0 && (
                  <div className="space-y-1">
                    <p className="form-label">Erros encontrados</p>
                    <ul className="list-disc list-inside text-sm text-muted space-y-1">
                      {resultadoImportacao.erros.map((erro, idx) => (
                        <li key={idx}>{erro}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}

            <div className="app-actionbar">
              <button type="submit" className="btn btn-primary" disabled={importandoEmMassa}>
                {importandoEmMassa ? 'Importando...' : 'Importar'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={fecharImportacao}
                disabled={importandoEmMassa}
              >
                Fechar
              </button>
            </div>
          </form>
        </BlocoConteudo>
      )}

      <BlocoConteudo
        titulo="Insumos cadastrados"
        descricao="Base dos itens de solicitação, cotação e pedido de compra."
        variante="primario"
        cor="var(--c-primary)"
      >
        <BarraFiltros
          busca={{
            valor: filtros.q,
            aoMudar: (valor) => setFiltros((atual) => ({ ...atual, q: valor })),
            placeholder: 'Buscar por nome, código, descrição, categoria ou unidade'
          }}
          filtros={[{
            id: 'categoria',
            rotulo: 'Categoria',
            unico: true,
            opcoes: categorias.map((item) => ({ valor: String(item.id), rotulo: item.nome }))
          }]}
          ativos={{ categoria: filtros.categoria }}
          aoAlternar={(dim, valor, opcoes) => setFiltros((atual) => ({
            ...alternarValorFiltro(atual, dim, valor, opcoes),
            q: atual.q
          }))}
          aoLimpar={() => setFiltros((atual) => ({ ...atual, categoria: new Set() }))}
        />

        {/* A1: a ação da linha é um <button> focável ("Editar"), e a linha
            inteira é acionável por teclado (o TabelaPadrao dá tabIndex +
            Enter/Espaço quando recebe aoClicarLinha). */}
        <TabelaPadrao
          colunas={colunas}
          itens={insumosFiltrados}
          carregando={loading}
          getId={(item) => item.id}
          vazio="Nenhum insumo cadastrado."
          storageKey="tabela:gestao-insumos"
          rotuloRolagem="Insumos cadastrados"
          colunasConfiguraveis
          aoClicarLinha={abrirEdicao}
          acoesLinha={(item) => (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirEdicao(item)}>
                Editar
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm btn-perigo-suave"
                onClick={() => handleExcluir(item)}
              >
                Excluir
              </button>
            </>
          )}
          larguraAcoes={240}
        />
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
