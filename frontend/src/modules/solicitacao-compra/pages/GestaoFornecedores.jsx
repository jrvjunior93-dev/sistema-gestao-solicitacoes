import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  BarraFiltros,
  alternarValorFiltro,
  Avisos,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import {
  listarFornecedoresCompra,
  criarFornecedorCompra,
  atualizarFornecedorCompra,
  desativarFornecedorCompra
} from '../../../services/compras';
import { useAuth } from '../../../contexts/AuthContext';
import { canManageComprasFornecedores } from '../../../utils/acessoProduto';
import { getCpfCnpjError, maskCep, maskCpfCnpj, maskPhone, onlyDigits } from '../../../utils/formatters';

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO'
];

const CATEGORIAS_SUGERIDAS = [
  'Concreto e Argamassa',
  'Eletrico',
  'Hidraulico',
  'Ferragens e Metalurgia',
  'Madeira e Esquadrias',
  'Revestimentos',
  'Tintas e Acabamentos',
  'Equipamentos e Maquinas',
  'EPI e Seguranca',
  'Manutencao Geral',
  'Combustiveis',
  'Servicos Terceirizados',
  'Impermeabilizacao',
  'Estrutura Metalica',
  'Cobertura e Telhado',
  'Ceramica e Porcelanato',
  'Sanitarios e Metais',
  'Iluminacao',
  'Automacao e CFTV',
  'Limpeza e Conservacao'
];

function whatsappLink(numero, mensagem) {
  const digits = String(numero || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/55${digits}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}`;
}

function formVazio() {
  return {
    id: null,
    nome: '',
    cnpj: '',
    email: '',
    whatsapp: '',
    contato: '',
    observacoes: '',
    cidade: '',
    estado: '',
    cep: '',
    categoria_insumos: []
  };
}

function formDoRegistro(fornecedor) {
  return {
    id: fornecedor.id,
    nome: fornecedor.nome || '',
    cnpj: maskCpfCnpj(fornecedor.cnpj),
    email: fornecedor.email || '',
    whatsapp: maskPhone(fornecedor.whatsapp),
    contato: fornecedor.contato || '',
    observacoes: fornecedor.observacoes || '',
    cidade: fornecedor.cidade || '',
    estado: fornecedor.estado || '',
    cep: maskCep(fornecedor.cep),
    categoria_insumos: Array.isArray(fornecedor.categoria_insumos) ? [...fornecedor.categoria_insumos] : []
  };
}

/*
  QUAIS FILTROS APARECEM (N53) — a declaração desta tela para o painel
  único de `PainelFiltrosVisiveis`, no molde do painel "Colunas" da
  TabelaPadrao.

  NENHUM `padrao: false`: todos os filtros continuam VISÍVEIS na primeira
  abertura. Só três telas têm conjunto inicial reduzido, e é o que o
  cliente aprovou nelas — aqui o seletor apenas passa a EXISTIR, para quem
  quiser mexer. Esconder por padrão mudaria o que a pessoa vê sem ela ter
  pedido.

  `obrigatorio` na busca livre: é o único caminho para achar um registro
  pelo que a pessoa lembra dele. Mesma família da coluna de identidade
  travada da TabelaPadrao — aparece na lista, marcada e sem desmarcar.
*/
const FILTROS_DA_TELA = [
  { id: 'q', rotulo: 'Busca', obrigatorio: true },
  { id: 'estado', rotulo: 'Estado' },
  { id: 'categoria', rotulo: 'Categoria' },
  { id: 'situacao', rotulo: 'Situação' }
];

export default function GestaoFornecedores() {
  const { user } = useAuth();
  const canManage = canManageComprasFornecedores(user);
  const { avisos, avisar, fechar } = useAvisos();
  // R19/R21: confirmação do sistema no lugar do `confirm()` NU (sem
  // `window.`) que a tela usava para desativar fornecedor.
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // O formulário é INLINE (R9), então o estado dele mora na tela — como na
  // ComercialUnidades. `form.id` preenchido = edição; vazio = cadastro novo.
  const [form, setForm] = useState(formVazio());
  const [novaCategoria, setNovaCategoria] = useState('');

  /*
    R12 — os filtros eram um <select> de UF, um campo de texto de categoria,
    uma caixa "Incluir inativos" e um botão "Buscar", todos soltos numa
    grade própria. Agora: busca larga em cima e MARCAÇÃO abaixo, com
    etiqueta removível por valor escolhido (BarraFiltros).

    As três dimensões levam `unico: true` porque o serviço aceita UM valor
    em cada uma: o FornecedorCompraController lê `req.query.estado` como
    string única (uppercase), `req.query.categoria` como string única
    (lowercase, comparada por LIKE) e `incluir_inativos` como o literal '1'.
    Marcação múltipla aqui deixaria o usuário ver duas etiquetas e a lista
    não estreitar — capacidade aparente sem efeito (a família da R15).
  */
  const [filtros, setFiltros] = useState({
    q: '',
    estado: new Set(),
    categoria: new Set(),
    situacao: new Set()
  });
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      const valor = filtros[filtro.id];
      return valor instanceof Set ? valor.size > 0 : String(valor ?? '').trim() !== '';
    }).map((filtro) => filtro.id),
    [filtros]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:gestao-fornecedores', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      setFiltros((atual) => ({ ...atual, [id]: atual[id] instanceof Set ? new Set() : '' }));
    }
  });

  /*
    A categoria do fornecedor é texto livre (o formulário deixa digitar
    qualquer uma), então a lista de marcação nasce das sugestões e CRESCE
    com o que aparece nos fornecedores carregados — e nunca encolhe. Se ela
    encolhesse ao aplicar o filtro, a etiqueta do valor escolhido sumiria
    junto (a BarraFiltros monta as etiquetas a partir das opções) e o filtro
    voltaria a ser invisível, que é justamente o que a R12 proíbe.
  */
  const [categoriasConhecidas, setCategoriasConhecidas] = useState(() => new Set(CATEGORIAS_SUGERIDAS));

  // R22: hooks usados são hooks importados. A referência leva o foco ao
  // formulário inline, que fica ACIMA da lista.
  const campoNomeRef = useRef(null);
  const primeiraBusca = useRef(true);

  // Declarados ANTES dos efeitos que os citam (TDZ: `const` não sobe).
  const estadoSelecionado = [...filtros.estado][0] || '';
  const categoriaSelecionada = [...filtros.categoria][0] || '';
  const incluirInativos = filtros.situacao.has('inativos');

  async function carregar() {
    try {
      setLoading(true);
      const params = {};
      if (filtros.q.trim()) params.q = filtros.q.trim();
      if (estadoSelecionado) params.estado = estadoSelecionado;
      if (categoriaSelecionada) params.categoria = categoriaSelecionada;
      if (incluirInativos) params.incluir_inativos = 1;
      const data = await listarFornecedoresCompra(params);
      const lista = Array.isArray(data) ? data : [];
      setFornecedores(lista);
      setCategoriasConhecidas((atual) => {
        const proximo = new Set(atual);
        lista.forEach((item) => {
          (Array.isArray(item.categoria_insumos) ? item.categoria_insumos : [])
            .forEach((categoria) => { if (categoria) proximo.add(String(categoria)); });
        });
        return proximo;
      });
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao carregar fornecedores');
    } finally {
      setLoading(false);
    }
  }

  // R23: marcar um filtro APLICA na hora — são três dimensões e UMA
  // requisição, longe do critério de consulta cara que pediria botão.
  useEffect(() => {
    carregar();
  }, [estadoSelecionado, categoriaSelecionada, incluirInativos]);

  // R23: busca textual nunca tem botão — tem espera de digitação. O botão
  // "Buscar" que existia era o único jeito de aplicar o que se digitava;
  // com a espera de 350ms ele deixa de ter função.
  useEffect(() => {
    if (primeiraBusca.current) {
      primeiraBusca.current = false;
      return undefined;
    }
    const temporizador = setTimeout(() => { carregar(); }, 350);
    return () => clearTimeout(temporizador);
  }, [filtros.q]);

  const opcoesCategoria = useMemo(
    () => [...categoriasConhecidas]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((categoria) => ({ valor: categoria, rotulo: categoria })),
    [categoriasConhecidas]
  );

  // O formulário fica ACIMA da lista: sem levar o foco até ele, clicar em
  // "Editar" no fim de uma lista longa não muda nada no que a pessoa vê
  // (R15).
  function focarFormulario() {
    campoNomeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // preventScroll: quem rola é o scrollIntoView suave.
    campoNomeRef.current?.focus({ preventScroll: true });
  }

  function atualizarCampo(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function novoFornecedor() {
    setForm(formVazio());
    setNovaCategoria('');
    focarFormulario();
  }

  function editarFornecedor(fornecedor) {
    setForm(formDoRegistro(fornecedor));
    setNovaCategoria('');
    focarFormulario();
  }

  function adicionarCategoria(categoria) {
    const valor = String(categoria || '').trim();
    if (!valor) return;
    setForm((atual) => ({
      ...atual,
      categoria_insumos: atual.categoria_insumos.includes(valor)
        ? atual.categoria_insumos
        : [...atual.categoria_insumos, valor]
    }));
  }

  function removerCategoria(categoria) {
    setForm((atual) => ({
      ...atual,
      categoria_insumos: atual.categoria_insumos.filter((item) => item !== categoria)
    }));
  }

  function handleCategoriaKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      adicionarCategoria(novaCategoria);
      setNovaCategoria('');
    }
  }

  async function handleSalvar(event) {
    event.preventDefault();

    const documentoErro = getCpfCnpjError(form.cnpj, { label: 'CPF/CNPJ do fornecedor' });
    if (documentoErro) {
      avisar.alerta(documentoErro);
      return;
    }

    try {
      setSalvando(true);
      // `id` é controle do formulário inline, não campo do registro: sai do
      // corpo enviado para o serviço, que continua recebendo os mesmos
      // campos de antes.
      const { id, ...dados } = form;
      const payload = {
        ...dados,
        cnpj: onlyDigits(dados.cnpj),
        whatsapp: onlyDigits(dados.whatsapp),
        cep: onlyDigits(dados.cep)
      };
      if (id) {
        await atualizarFornecedorCompra(id, payload);
      } else {
        await criarFornecedorCompra(payload);
      }
      avisar.sucesso(id ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
      setForm(formVazio());
      setNovaCategoria('');
      await carregar();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao salvar fornecedor');
    } finally {
      setSalvando(false);
    }
  }

  async function handleDesativar(fornecedor) {
    /*
      R26 — o alvo é fixado numa `const` ANTES do `await`. O `confirm()` do
      navegador congelava a página; o modal do sistema não congela: a lista e
      o formulário seguem clicáveis atrás dele. Sem esta `const`, clicar
      noutra linha entre a pergunta e a resposta faria a tela perguntar sobre
      um fornecedor e desativar outro — consentimento válido registrado para
      a ação errada.
    */
    const alvo = fornecedor;
    // R21: `confirmar()` devolve `{ ok, texto }`. Objeto é sempre truthy —
    // sem desestruturar, o "Cancelar" seguiria com a desativação.
    const { ok } = await confirmar({
      titulo: 'Desativar fornecedor',
      mensagem: `Desativar o fornecedor "${alvo.nome}"? Ele deixa de aparecer nas cotacoes ate ser reativado.`,
      rotuloConfirmar: 'Desativar',
      destrutiva: true
    });
    if (!ok) return;

    try {
      await desativarFornecedorCompra(alvo.id);
      avisar.sucesso('Fornecedor desativado.');
      await carregar();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao desativar fornecedor');
    }
  }

  /*
    R17 — toda coluna declara o seu `tipo`; medida e alinhamento vêm do
    componente. As colunas são as mesmas de antes, na mesma ordem.
  */
  const colunas = [
    {
      id: 'nome',
      titulo: 'Nome',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (f) => <CelulaDupla principal={f.nome} sub={f.contato || ''} />
    },
    {
      id: 'cnpj',
      titulo: 'CNPJ',
      tipo: 'codigo',
      render: (f) => f.cnpj || '-'
    },
    {
      id: 'whatsapp',
      titulo: 'WhatsApp',
      tipo: 'codigo',
      /*
        R25 — o link era `text-emerald-600`, paleta crua sem par no tema
        escuro e fora do piso de contraste do ThemeContext. O verde aqui tem
        SIGNIFICADO (é o canal de contato que abre o WhatsApp), então vira o
        token semântico: mesma leitura, agora com tema e contraste.
      */
      render: (f) => (
        f.whatsapp ? (
          <a
            href={whatsappLink(f.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline"
            style={{ color: 'var(--sem-success)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {f.whatsapp}
          </a>
        ) : '-'
      )
    },
    {
      id: 'email',
      titulo: 'Email',
      tipo: 'texto',
      render: (f) => f.email || '-'
    },
    {
      id: 'cidade_uf',
      titulo: 'Cidade / UF',
      tipo: 'texto',
      render: (f) => [f.cidade, f.estado].filter(Boolean).join(' / ') || '-'
    },
    {
      id: 'categorias',
      titulo: 'Categorias',
      tipo: 'texto',
      // R25: `bg-blue-50 text-blue-700` vira a `.chip` do sistema, que tem
      // par declarado no tema escuro.
      render: (f) => (
        <div className="flex flex-wrap gap-1">
          {Array.isArray(f.categoria_insumos) && f.categoria_insumos.length > 0
            ? f.categoria_insumos.map((cat) => (
              <span key={cat} className="chip">{cat}</span>
            ))
            : <span className="text-muted">-</span>
          }
        </div>
      )
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      /*
        R25 — a pílula era `bg-emerald-100/text-emerald-700` ×
        `bg-slate-100/text-slate-500` à mão (o `text-slate-500` é o
        4,34:1 que a própria regra cita como exemplo de reprovação em AA).
        O StatusBadge resolve cor, ícone e contraste por token, e classifica
        "Ativo" como success e "Inativo" como neutral sozinho — a distinção
        que a tela tinha é preservada.
      */
      render: (f) => <StatusBadge status={f.ativo ? 'Ativo' : 'Inativo'} />
    }
  ];

  return (
    /*
      R18 — a raiz da página tinha `overflow-x-hidden` e o card da tabela
      `overflow-hidden`. Os dois criam scrollport e MATAM, em silêncio, o
      `position: sticky` da faixa fixa do cabeçalho e da coluna fixa da
      tabela. Saem junto com os cards crus: quem recorta agora é o `Pagina`
      e o `BlocoConteudo`, com as classes do sistema.
    */
    <Pagina>
      {/* R5/R13/C1: título, contagem e apoio moram na faixa fixa do
          PageHeader — o `page-subtitle` solto some. */}
      <PageHeader
        titulo="Fornecedores"
        contagem={loading ? null : `${fornecedores.length} fornecedor(es)`}
        descricao="Cadastro de fornecedores para cotações de compra."
        acaoPrincipal={canManage ? { rotulo: 'Novo fornecedor', onClick: novoFornecedor } : undefined}
      />

      {/*
        R16 — UM dono para a faixa de avisos. Ela precisava viver dentro do
        modal quando ele estava aberto (senão o aviso ficava atrás do fundo
        escuro); com o formulário inline não há mais fundo escuro nem dois
        lugares possíveis: a faixa fica sempre logo abaixo do cabeçalho.
      */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, E NÃO EM MODAL.

        Esta tela existe PARA cadastrar fornecedor: pelo teste da regra,
        tirando o formulário sobra uma lista que ninguém abriria por si só.

        O caso que pediria a exceção — "cadastrar um credor no meio de uma
        solicitação" é o exemplo textual da R9 para modal — foi MEDIDO no
        código e não passa por aqui: quem cadastra fornecedor no meio de uma
        cotação é a `GerenciarCotacaoSolicitacao`, que tem o seu PRÓPRIO
        formulário rápido de cinco campos (`novoFornecedor`/
        `handleCriarFornecedorRapido`, chamando `criarFornecedorCompra`
        direto) e nunca importou o modal desta tela. Ou seja: o fluxo que
        interrompe já é atendido em outro arquivo, e este formulário só é
        alcançado a partir desta rota. Sem chamador que interrompa, o modal
        aqui só cobra abrir e fechar uma caixa para fazer o que a pessoa veio
        fazer. Fica inline. (Registrado no relatório para decisão do cliente:
        se um dia esta tela virar o formulário do cadastro rápido, a leitura
        muda junto.)
      */}
      {canManage && (
        <BlocoConteudo titulo={form.id ? 'Editar fornecedor' : 'Novo fornecedor'}>
          <form className="space-y-4" onSubmit={handleSalvar}>
            <FormSecao legenda="Identificação" colunas={2}>
              <CampoForm label="Nome" obrigatorio>
                <input
                  ref={campoNomeRef}
                  className="input w-full"
                  value={form.nome}
                  onChange={(e) => atualizarCampo('nome', e.target.value)}
                  placeholder="Razão social ou nome fantasia"
                  required
                />
              </CampoForm>

              <CampoForm label="CNPJ / CPF">
                <input
                  className="input w-full"
                  value={form.cnpj}
                  onChange={(e) => atualizarCampo('cnpj', maskCpfCnpj(e.target.value))}
                  placeholder="00.000.000/0000-00"
                />
              </CampoForm>

              <CampoForm label="WhatsApp">
                <input
                  className="input w-full"
                  value={form.whatsapp}
                  onChange={(e) => atualizarCampo('whatsapp', maskPhone(e.target.value))}
                  placeholder="(11) 99999-9999"
                />
              </CampoForm>

              <CampoForm label="Email">
                <input
                  className="input w-full"
                  type="email"
                  value={form.email}
                  onChange={(e) => atualizarCampo('email', e.target.value)}
                  placeholder="contato@empresa.com"
                />
              </CampoForm>

              <CampoForm label="Nome do contato" span={2}>
                <input
                  className="input w-full"
                  value={form.contato}
                  onChange={(e) => atualizarCampo('contato', e.target.value)}
                  placeholder="Responsável comercial"
                />
              </CampoForm>
            </FormSecao>

            <FormSecao legenda="Endereço" colunas={3}>
              <CampoForm label="Cidade">
                <input
                  className="input w-full"
                  value={form.cidade}
                  onChange={(e) => atualizarCampo('cidade', e.target.value)}
                  placeholder="São Paulo"
                />
              </CampoForm>

              <CampoForm label="Estado">
                {/* R12: select de FORMULÁRIO (entrada de dado do registro) —
                    legítimo. O filtro de UF da lista, esse sim, virou
                    marcação. */}
                <select
                  className="input w-full"
                  value={form.estado}
                  onChange={(e) => atualizarCampo('estado', e.target.value)}
                >
                  <option value="">UF</option>
                  {ESTADOS_BR.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </CampoForm>

              <CampoForm label="CEP">
                <input
                  className="input w-full"
                  value={form.cep}
                  onChange={(e) => atualizarCampo('cep', maskCep(e.target.value))}
                  placeholder="00000-000"
                />
              </CampoForm>
            </FormSecao>

            <FormSecao legenda="Atendimento" colunas={2}>
              {/*
                Grupo de controles, não um campo só: fica em `form-group`
                direto (as classes do sistema que o CampoForm usa) em vez de
                um <label> envolvendo uma dúzia de botões, que amarraria o
                rótulo a um controle que não existe.
              */}
              <div className="form-group form-campo--linha">
                <span className="form-label">Categorias de insumos atendidos</span>
                <span className="form-hint">
                  Define quais categorias este fornecedor atende. Usado para filtrar fornecedores ao enviar cotações.
                </span>

                {form.categoria_insumos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {/* R2: cada categoria escolhida é um alvo de clique de
                        verdade (`.btn` garante 32px), não um "✕" de 12px. */}
                    {form.categoria_insumos.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => removerCategoria(cat)}
                        title={`Remover a categoria ${cat}`}
                      >
                        {cat}
                        <span aria-hidden="true">✕</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <input
                    className="input flex-1"
                    value={novaCategoria}
                    onChange={(e) => setNovaCategoria(e.target.value)}
                    onKeyDown={handleCategoriaKeyDown}
                    placeholder="Digite uma categoria e pressione Enter"
                    aria-label="Nova categoria atendida"
                  />
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => { adicionarCategoria(novaCategoria); setNovaCategoria(''); }}
                  >
                    Adicionar
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {CATEGORIAS_SUGERIDAS.filter((c) => !form.categoria_insumos.includes(c)).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => adicionarCategoria(cat)}
                      title={`Adicionar a categoria ${cat}`}
                    >
                      + {cat}
                    </button>
                  ))}
                </div>
              </div>

              <CampoForm label="Observações" tipo="texto-longo" span={2}>
                <textarea
                  className="input w-full"
                  rows={3}
                  value={form.observacoes}
                  onChange={(e) => atualizarCampo('observacoes', e.target.value)}
                  placeholder="Condições comerciais, prazo padrão, etc."
                />
              </CampoForm>
            </FormSecao>

            <div className="app-actionbar">
              <button type="submit" className="btn btn-primary" disabled={salvando || !form.nome.trim()}>
                {salvando ? 'Salvando...' : (form.id ? 'Salvar alteracoes' : 'Criar fornecedor')}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => { setForm(formVazio()); setNovaCategoria(''); }}
                disabled={salvando}
              >
                Limpar
              </button>
            </div>
          </form>
        </BlocoConteudo>
      )}

      <BlocoConteudo
        titulo="Fornecedores cadastrados"
        descricao="Localize por identificação, regiao ou categoria atendida."
        variante="primario"
        cor="var(--c-primary)"
      >
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('q') ? {
            valor: filtros.q,
            aoMudar: (valor) => setFiltros((atual) => ({ ...atual, q: valor })),
            placeholder: 'Buscar por nome, CNPJ, email ou contato'
          } : null}
          filtros={[
            {
              id: 'estado',
              rotulo: 'Estado',
              unico: true,
              opcoes: ESTADOS_BR.map((uf) => ({ valor: uf, rotulo: uf }))
            },
            {
              id: 'categoria',
              rotulo: 'Categoria',
              unico: true,
              opcoes: opcoesCategoria
            },
            {
              id: 'situacao',
              rotulo: 'Situação',
              unico: true,
              opcoes: [{ valor: 'inativos', rotulo: 'Incluir inativos' }]
            }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={{
            estado: filtros.estado,
            categoria: filtros.categoria,
            situacao: filtros.situacao
          }}
          aoAlternar={(dim, valor, opcoes) => setFiltros((atual) => ({
            ...alternarValorFiltro(atual, dim, valor, opcoes),
            q: atual.q
          }))}
          aoLimpar={() => setFiltros((atual) => ({
            ...atual,
            estado: new Set(),
            categoria: new Set(),
            situacao: new Set()
          }))}
          visibilidade={visibilidadeFiltros}
        />

        {/* A1: a ação da linha é um <button> focável ("Editar"), e a linha
            inteira é acionável por teclado quando quem olha pode editar (o
            TabelaPadrao dá tabIndex + Enter/Espaço com aoClicarLinha). */}
        <TabelaPadrao
          colunas={colunas}
          itens={fornecedores}
          carregando={loading}
          getId={(f) => f.id}
          vazio="Nenhum fornecedor encontrado. Ajuste os filtros ou cadastre um novo."
          storageKey="tabela:gestao-fornecedores"
          rotuloRolagem="Fornecedores"
          colunasConfiguraveis
          aoClicarLinha={canManage ? editarFornecedor : undefined}
          acoesLinha={canManage ? (f) => (
            <>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => editarFornecedor(f)}
              >
                Editar
              </button>
              {f.ativo && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm btn-perigo-suave"
                  onClick={() => handleDesativar(f)}
                >
                  Desativar
                </button>
              )}
            </>
          ) : undefined}
          larguraAcoes={240}
        />
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
