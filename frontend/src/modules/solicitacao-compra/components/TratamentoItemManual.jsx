import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineCheck, HiOutlineMagnifyingGlass, HiOutlineXMark } from 'react-icons/hi2';
import Alert from '../../../components/ui/Alert';
import {
  catalogarItemManualSolicitacaoCompra,
  listarCategorias,
  listarInsumos,
  listarUnidades
} from '../../../services/compras';

function normalizar(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function unidadeInsumo(insumo) {
  return insumo?.unidade?.sigla || insumo?.unidade?.nome || insumo?.unidade_manual || 'Sem unidade';
}

function rotuloInsumo(insumo) {
  if (!insumo) return '';
  return `${insumo.codigo || `ID ${insumo.id}`} — ${insumo.nome}`;
}

function formularioInicial(item) {
  return {
    nome: item.nome || '',
    descricao: item.especificacao === '-' ? '' : item.especificacao || '',
    unidade_id: '',
    unidade_manual: item.unidade === '-' ? '' : item.unidade || '',
    categoria_id: ''
  };
}

export default function TratamentoItemManual({ item, solicitacaoId, onCatalogado }) {
  const [modo, setModo] = useState('EXISTENTE');
  const [insumos, setInsumos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [busca, setBusca] = useState('');
  const [insumoId, setInsumoId] = useState('');
  const [form, setForm] = useState(() => formularioInicial(item));
  const [loading, setLoading] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [autocompleteAberto, setAutocompleteAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const buscaInputRef = useRef(null);

  useEffect(() => {
    const atual = item.insumoCatalogado || null;
    setModo('EXISTENTE');
    setInsumos(atual ? [atual] : []);
    setBusca('');
    setInsumoId('');
    setForm(formularioInicial(item));
    setAutocompleteAberto(false);
    setIndiceAtivo(0);
    setBuscando(false);
    setErro('');
    setMensagem('');
  }, [item.id, item.item_tipo, solicitacaoId]);

  useEffect(() => {
    let ativo = true;

    async function carregarContexto() {
      try {
        setLoading(true);
        const [listaInsumos, listaUnidades, listaCategorias] = await Promise.all([
          listarInsumos({ q: item.nome || '', limit: 20 }),
          listarUnidades(),
          listarCategorias()
        ]);
        if (!ativo) return;

        const unidadesAtivas = Array.isArray(listaUnidades) ? listaUnidades : [];
        const encontrados = Array.isArray(listaInsumos) ? listaInsumos : [];
        const atual = item.insumoCatalogado;
        setInsumos(atual?.id && !encontrados.some((entry) => Number(entry.id) === Number(atual.id))
          ? [atual, ...encontrados]
          : encontrados);
        setInsumoId('');
        setBusca('');
        setModo('EXISTENTE');
        setUnidades(unidadesAtivas);
        setCategorias(Array.isArray(listaCategorias) ? listaCategorias : []);

        const unidadeCorrespondente = unidadesAtivas.find((entry) => (
          [entry.sigla, entry.nome].some((value) => normalizar(value) === normalizar(item.unidade))
        ));
        setForm((atual) => ({
          ...atual,
          unidade_id: unidadeCorrespondente ? String(unidadeCorrespondente.id) : '',
          unidade_manual: unidadeCorrespondente ? '' : atual.unidade_manual
        }));
      } catch (error) {
        if (ativo) setErro(error.message || 'Nao foi possivel carregar os cadastros de Compras.');
      } finally {
        if (ativo) setLoading(false);
      }
    }

    carregarContexto();
    return () => {
      ativo = false;
    };
  }, [item.id, item.nome, item.unidade, item.insumo_catalogado_id, item.insumoCatalogado?.id]);

  const insumoSelecionado = useMemo(() => {
    if (!Number(insumoId)) return null;
    return insumos.find((entry) => Number(entry.id) === Number(insumoId))
      || (Number(item.insumoCatalogado?.id) === Number(insumoId) ? item.insumoCatalogado : null);
  }, [insumoId, insumos, item.insumoCatalogado]);

  const podeSalvar = modo === 'EXISTENTE'
    ? Boolean(Number(insumoId))
    : Boolean(form.nome.trim() && (form.unidade_id || form.unidade_manual.trim()));

  useEffect(() => {
    if (modo !== 'EXISTENTE' || !autocompleteAberto || Number(insumoId)) return undefined;

    const controller = new AbortController();
    let ativo = true;
    const timer = setTimeout(async () => {
      try {
        setBuscando(true);
        setErro('');
        const data = await listarInsumos({ q: busca.trim(), limit: 30 }, { signal: controller.signal });
        if (!ativo) return;
        setInsumos(Array.isArray(data) ? data : []);
        setIndiceAtivo(0);
      } catch (error) {
        if (ativo && error?.name !== 'AbortError') setErro(error.message || 'Erro ao pesquisar insumos.');
      } finally {
        if (ativo) setBuscando(false);
      }
    }, 250);

    return () => {
      ativo = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [autocompleteAberto, busca, insumoId, modo]);

  function selecionarInsumo(insumo) {
    setInsumos((atual) => atual.some((entry) => Number(entry.id) === Number(insumo.id))
      ? atual
      : [insumo, ...atual]);
    setInsumoId(String(insumo.id));
    setBusca(rotuloInsumo(insumo));
    setAutocompleteAberto(false);
    setIndiceAtivo(0);
    setBuscando(false);
    setErro('');
    setMensagem('');
  }

  function alterarBusca(event) {
    setBusca(event.target.value);
    if (insumoId) setInsumoId('');
    setInsumos([]);
    setAutocompleteAberto(true);
    setIndiceAtivo(0);
    setBuscando(true);
    setMensagem('');
  }

  function limparSelecao() {
    setBusca('');
    setInsumoId('');
    setInsumos([]);
    setAutocompleteAberto(true);
    setIndiceAtivo(0);
    setBuscando(true);
    setMensagem('');
    requestAnimationFrame(() => buscaInputRef.current?.focus());
  }

  function navegarAutocomplete(event) {
    if (event.key === 'Escape') {
      setAutocompleteAberto(false);
      setBuscando(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const abrirNaPrimeiraOpcao = !autocompleteAberto;
      setAutocompleteAberto(true);
      setIndiceAtivo((atual) => abrirNaPrimeiraOpcao ? 0 : Math.min(atual + 1, Math.max(insumos.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setAutocompleteAberto(true);
      setIndiceAtivo((atual) => Math.max(atual - 1, 0));
      return;
    }
    if (event.key === 'Enter' && autocompleteAberto && insumos[indiceAtivo]) {
      event.preventDefault();
      selecionarInsumo(insumos[indiceAtivo]);
    }
  }

  function selecionarModo(novoModo) {
    setModo(novoModo);
    setAutocompleteAberto(false);
    setBuscando(false);
    if (novoModo === 'NOVO') {
      setForm((atual) => ({
        ...atual,
        nome: item.nome || '',
        descricao: item.especificacao === '-' ? '' : item.especificacao || ''
      }));
    } else {
      const atual = item.insumoCatalogado || null;
      setInsumos(atual ? [atual] : []);
      setBusca('');
      setInsumoId('');
      setIndiceAtivo(0);
    }
    setErro('');
    setMensagem('');
  }

  async function salvar(event) {
    event.preventDefault();
    setErro('');
    setMensagem('');

    if (modo === 'EXISTENTE' && !Number(insumoId)) {
      setErro('Selecione um insumo existente.');
      return;
    }
    if (modo === 'NOVO' && (!form.nome.trim() || (!form.unidade_id && !form.unidade_manual.trim()))) {
      setErro('Informe o nome e a unidade do novo insumo.');
      return;
    }

    try {
      setSalvando(true);
      const payload = modo === 'EXISTENTE'
        ? {
            acao: 'VINCULAR_EXISTENTE',
            insumo_id: Number(insumoId),
            corrigir_vinculo: Boolean(item.insumo_catalogado_id)
          }
        : {
            acao: 'CRIAR_INSUMO',
            nome: form.nome.trim(),
            descricao: form.descricao.trim() || null,
            unidade_id: form.unidade_id ? Number(form.unidade_id) : null,
            unidade_manual: form.unidade_id ? null : form.unidade_manual.trim(),
            categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
            corrigir_vinculo: Boolean(item.insumo_catalogado_id)
          };

      const resultado = await catalogarItemManualSolicitacaoCompra(solicitacaoId, item.id, payload);
      setMensagem(resultado?.ja_catalogado
        ? 'Este item ja estava catalogado. Os dados foram atualizados na tela.'
        : 'Item catalogado e disponivel para novas solicitacoes.');
      onCatalogado?.(resultado);
    } catch (error) {
      const candidato = error?.details?.insumo;
      if (candidato?.id) {
        selecionarInsumo(candidato);
        setModo('EXISTENTE');
      }
      setErro(error.message || 'Erro ao catalogar item manual.');
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return <div className="compra-item-tratamento-loading" role="status">Carregando cadastro de insumos...</div>;
  }

  return (
    <form className="compra-item-tratamento" onSubmit={salvar}>
      <div className="compra-item-tratamento-head">
        <div>
          <span className="compra-item-eyebrow">Catalogacao</span>
          <h4>{item.insumo_catalogado_id ? 'Corrigir vinculo oficial' : 'Tratar item manual'}</h4>
          <p>O texto original da solicitação será preservado.</p>
        </div>
        <div className="compra-item-tratamento-choice" role="group" aria-label="Forma de catalogacao">
          <button
            type="button"
            className={modo === 'EXISTENTE' ? 'is-active' : ''}
            onClick={() => selecionarModo('EXISTENTE')}
            aria-pressed={modo === 'EXISTENTE'}
          >
            Vincular existente
          </button>
          <button
            type="button"
            className={modo === 'NOVO' ? 'is-active' : ''}
            onClick={() => selecionarModo('NOVO')}
            aria-pressed={modo === 'NOVO'}
          >
            Criar novo
          </button>
        </div>
      </div>

      {modo === 'EXISTENTE' ? (
        <div className="compra-item-tratamento-body">
          <div className="compra-item-field compra-item-field-wide">
            <label htmlFor={`insumo-autocomplete-${item.id}`}><span>Pesquisar cadastro oficial</span></label>
            {/*
              MEDIDO EM 05/09 E MANTIDO COMO ESTA — a leva que trocou o
              `onBlur` com `setTimeout` pelo `useFecharAoSair` em 10 camadas
              parou aqui, de proposito.

              1) ESTA CAIXA NAO E CAMADA FLUTUANTE. `.compra-item-autocomplete-options`
                 nao tem `position: absolute` nem `z-index`
                 (compras-responsive.css): e um bloco EM FLUXO que empurra o
                 resto do formulario para baixo, dentro da linha ja expandida
                 do item. Ela nao cobre nada, e por isso o defeito que a leva
                 conserta — camada por cima do formulario que so fecha
                 perdendo o foco — nao existe aqui.

              2) O FECHAMENTO DAQUI NAO TEM A CORRIDA DOS 120ms. Nao e
                 `blur` + `setTimeout`: e `focusout` com `relatedTarget`,
                 conferindo se o foco foi para DENTRO deste mesmo `div`.
                 Escolher uma opcao mantem o foco dentro (o botao tem
                 `tabIndex={-1}` e recebe o foco no clique), entao nao fecha;
                 sair para qualquer outro lugar da pagina fecha na hora, sem
                 espera. E o mecanismo mais completo do projeto, e foi dele
                 que veio a ideia de conferir contencao.

              3) FECHAR AQUI FAZ DUAS COISAS: desliga a lista E desliga o
                 indicador "Buscando...". Trocar por um `fechar` cru deixaria
                 o indicador pendurado — o mesmo tipo de perda que o
                 `restaurarSelecao` do CategoriaFinanceiraAutocomplete sofreria.

              Unificar aqui trocaria um mecanismo sem corrida por dois
              mecanismos convivendo, para ganhar um caso que esta caixa nao
              tem. O que o hook acrescentaria de verdade — fechar sem que o
              foco mude — nao se aplica a um bloco que nao cobre nada.
            */}
            <div
              className="compra-item-autocomplete"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setAutocompleteAberto(false);
                  setBuscando(false);
                }
              }}
            >
              <div className={`compra-item-autocomplete-input ${insumoSelecionado ? 'is-selected' : ''}`}>
                <HiOutlineMagnifyingGlass aria-hidden="true" />
                <input
                  ref={buscaInputRef}
                  id={`insumo-autocomplete-${item.id}`}
                  className="input"
                  value={busca}
                  onChange={alterarBusca}
                  onFocus={() => setAutocompleteAberto(true)}
                  onKeyDown={navegarAutocomplete}
                  placeholder="Nome, código ou alias"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={autocompleteAberto}
                  aria-controls={`insumo-opcoes-${item.id}`}
                  aria-activedescendant={autocompleteAberto && insumos[indiceAtivo]
                    ? `insumo-opcao-${item.id}-${insumos[indiceAtivo].id}`
                    : undefined}
                />
                {buscando ? <span className="compra-item-autocomplete-loading" role="status">Buscando...</span> : null}
                {!buscando && (busca || insumoId) ? (
                  <button type="button" className="compra-item-autocomplete-clear" onClick={limparSelecao} aria-label="Limpar insumo selecionado">
                    <HiOutlineXMark aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              {autocompleteAberto ? (
                <div id={`insumo-opcoes-${item.id}`} className="compra-item-autocomplete-options" role="listbox">
                  {buscando && !insumos.length ? (
                    <div className="compra-item-autocomplete-empty" role="status">Buscando insumos...</div>
                  ) : insumos.length ? insumos.map((insumo, index) => (
                    <button
                      key={insumo.id}
                      id={`insumo-opcao-${item.id}-${insumo.id}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={Number(insumoId) === Number(insumo.id)}
                      className={`${index === indiceAtivo ? 'is-active' : ''} ${Number(insumoId) === Number(insumo.id) ? 'is-selected' : ''}`}
                      onMouseEnter={() => setIndiceAtivo(index)}
                      onClick={() => selecionarInsumo(insumo)}
                    >
                      <span>
                        <strong>{rotuloInsumo(insumo)}</strong>
                        <small>{unidadeInsumo(insumo)} · {insumo.categoria?.nome || 'Sem categoria'}</small>
                      </span>
                      {Number(insumoId) === Number(insumo.id) ? <HiOutlineCheck aria-hidden="true" /> : null}
                    </button>
                  )) : (
                    <div className="compra-item-autocomplete-empty">Nenhum insumo encontrado. Revise a busca ou crie um novo.</div>
                  )}
                </div>
              ) : null}
            </div>

            {insumoSelecionado ? (
              <div className="compra-item-autocomplete-selection" role="status">
                <HiOutlineCheck aria-hidden="true" />
                <span>Selecionado: {unidadeInsumo(insumoSelecionado)} · {insumoSelecionado.categoria?.nome || 'Sem categoria'}</span>
              </div>
            ) : <small className="compra-item-autocomplete-help">Digite para buscar e selecione uma opção antes de salvar.</small>}
          </div>
        </div>
      ) : (
        <div className="compra-item-tratamento-grid">
          <label className="compra-item-field compra-item-field-wide">
            <span>Nome oficial</span>
            <input className="input" value={form.nome} onChange={(event) => setForm((atual) => ({ ...atual, nome: event.target.value }))} />
          </label>
          <label className="compra-item-field">
            <span>Unidade cadastrada</span>
            <select
              className="input"
              value={form.unidade_id}
              onChange={(event) => setForm((atual) => ({ ...atual, unidade_id: event.target.value, unidade_manual: event.target.value ? '' : atual.unidade_manual }))}
            >
              <option value="">Usar unidade manual</option>
              {unidades.map((unidade) => <option key={unidade.id} value={unidade.id}>{unidade.sigla} — {unidade.nome}</option>)}
            </select>
          </label>
          <label className="compra-item-field">
            <span>Unidade manual</span>
            <input
              className="input"
              value={form.unidade_manual}
              disabled={Boolean(form.unidade_id)}
              onChange={(event) => setForm((atual) => ({ ...atual, unidade_manual: event.target.value }))}
            />
          </label>
          <label className="compra-item-field">
            <span>Categoria</span>
            <select className="input" value={form.categoria_id} onChange={(event) => setForm((atual) => ({ ...atual, categoria_id: event.target.value }))}>
              <option value="">Sem categoria</option>
              {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}
            </select>
          </label>
          <div className="compra-item-field compra-item-code-preview">
            <span>Código</span>
            <strong>Gerado automaticamente</strong>
            <small>Formato INS-000001</small>
          </div>
          <label className="compra-item-field compra-item-field-wide">
            <span>Descrição do cadastro</span>
            <textarea className="input min-h-24" value={form.descricao} onChange={(event) => setForm((atual) => ({ ...atual, descricao: event.target.value }))} />
          </label>
        </div>
      )}

      <div className="compra-item-tratamento-footer">
        <button type="submit" className="btn btn-primary" disabled={salvando || !podeSalvar}>
          {salvando
            ? 'Salvando insumo...'
            : modo === 'EXISTENTE'
              ? 'Salvar vinculo do insumo'
              : 'Salvar novo insumo'}
        </button>
      </div>

      {/*
        O retorno da catalogação passou a usar o `Alert` do sistema.

        As duas faixas eram `.compra-item-feedback.is-error/.is-success`, e
        o CSS do módulo pinta as duas com hexadecimal cru (#fff0ef/#9d2821 e
        #e7f7ed/#17633b). Cor à mão não tem par no tema escuro e não passa
        pelo piso de contraste que o `ThemeContext` aplica (R24/R25): no
        escuro o texto vinha quase da mesma família do fundo do bloco.

        Continua sendo FEEDBACK DO FORMULÁRIO, ancorado ao botão que o
        produziu — não `useAvisos`, que é faixa de evento no topo da página.
        Este componente é montado dentro da linha expandida de um item, e o
        resultado precisa aparecer ali, no lugar onde a pessoa está olhando.
      */}
      {erro ? <Alert type="error" message={erro} /> : null}
      {mensagem ? <Alert type="success" message={mensagem} /> : null}
    </form>
  );
}
