import { useEffect, useMemo, useRef, useState } from 'react';
import { useFecharAoSair } from '../hooks/useFecharAoSair';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos
} from '../components/padrao';
import { buscarParceiros } from '../services/parceiros';
import { listarCartoesRecargaAdmin, salvarCartaoRecarga } from '../services/recargasCartao';

// =====================================================================
// CARTÕES DE RECARGA — Configurações
// ---------------------------------------------------------------------
// Cadastra os cartões Flash e diz quais usuários podem pedir recarga em
// cada um. Chega-se aqui pelo hub de Configurações → Cadastros.
//
// R9 (revista em 04/09) — FORMULÁRIO INLINE, E NÃO EM MODAL.
// ---------------------------------------------------------------------
// O critério da R9 não é a frequência do cadastro: é o que a tela existe
// para fazer. Aplicando o TESTE da regra — "tire o formulário da tela;
// sobra tela?" — aqui não sobra: o que resta é uma lista de três colunas
// (cartão, quantos usuários, situação) sem nenhuma forma de criar um
// cartão nem de mexer nos vínculos. Ninguém abre "Cartões de recarga"
// para CONSULTAR quantos cartões existem; abre para cadastrar um cartão
// ou para mudar quem pode usá-lo — que é, palavra por palavra, o que o
// card do hub promete ("Cadastre os cartões Flash e vincule os usuários
// autorizados a solicitar recarga").
//
// Logo: o achado antigo, de que este formulário "devia abrir em
// OverlayModal", NÃO PROCEDE — ele vinha da versão anterior da R9, que
// media o sintoma (cadastro raro) em vez da causa (o cadastro interrompe
// outro trabalho). Modal aqui seria atrito: obrigaria a abrir e fechar
// para fazer exatamente aquilo que se veio fazer, e a lista de usuários
// marcáveis (o miolo do cadastro) é justamente o que pede tela larga.
// Modal fica para o cadastro que INTERROMPE — criar um credor no meio de
// uma solicitação, por exemplo. Não é o caso.
//
// ARRANJO — empilhado, e não as duas metades lado a lado
// ---------------------------------------------------------------------
// O arranjo anterior era `lg:grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.1fr)]`:
// além de escrever pixel na tela (R10), espremia a tabela em ~40% da
// largura. Com três colunas de conteúdo (mín. 160px cada, R1) mais a
// coluna de ações, a lista entrava em rolagem horizontal permanente em
// telas de 1366px. Empilhado, cada um usa a largura inteira e a ordem de
// leitura vira a ordem do trabalho: cadastrar → conferir a lista.
// Como o "Editar" da lista fica ABAIXO do formulário, `editar()` leva a
// pessoa até ele (rolagem + foco) — sem isso o clique pareceria não ter
// feito nada.
// =====================================================================

const FORM_VAZIO = {
  nome: '',
  identificador: '',
  ultimos_quatro: '',
  parceiro_id: '',
  parceiro_nome: '',
  empresa_id: '',
  categoria_financeira_id: '',
  usuario_ids: [],
  observacoes: '',
  ativo: true
};

function normalizarLista(data) {
  if (Array.isArray(data)) return data;
  return data?.items || data?.rows || data?.data || [];
}

export default function CartoesRecarga() {
  const [dados, setDados] = useState({ cartoes: [], usuarios: [], empresas: [], categorias: [] });
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [buscaFornecedor, setBuscaFornecedor] = useState('');
  const [fornecedores, setFornecedores] = useState([]);
  /*
    A LISTA DE FORNECEDORES DO CARTÃO NÃO FECHAVA DE JEITO NENHUM (05/09).

    Ela não tinha estado de aberta: existia enquanto `fornecedores.length`
    fosse maior que zero, e o único jeito de esvaziar essa lista era
    ESCOLHER um fornecedor (o `onMouseDown` da opção chama
    `setFornecedores([])`) ou apagar a busca. Como é `absolute z-dropdown`, ela
    ficava sobre a seção "Usuários vinculados" logo abaixo — quem
    desistisse da troca não tinha como dispensá-la. Clicar fora não fazia
    nada; `Esc` não fazia nada.

    Agora existe `sugestoesFornecedorAbertas`, que o clique fora e o `Esc`
    desligam; digitar ou focar o campo reabre.

    A seleção continua funcionando, e aqui ela é MAIS sensível que nas
    outras: a escolha mora no `onMouseDown` da opção, exatamente o evento
    em que o hook fecha. Ela sobrevive porque o ref envolve o campo E a
    lista — o alvo está DENTRO, o hook não dispara — e porque o handler
    de React roda antes do listener de documento. O `preventDefault` que
    a opção já trazia continua onde estava.
  */
  const sugestoesFornecedorRef = useRef(null);
  const [sugestoesFornecedorAbertas, setSugestoesFornecedorAbertas] = useState(false);
  useFecharAoSair(
    sugestoesFornecedorRef,
    sugestoesFornecedorAbertas,
    () => setSugestoesFornecedorAbertas(false)
  );
  const [buscaUsuario, setBuscaUsuario] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  /*
    A CONFIRMACAO ESTAVA PINTADA DE ALERTA (04/09).

    As duas faixas eram `app-alert` a mao. A classe `app-alert--success` NAO
    EXISTE no index.css: o base `.app-alert` e ambar, com icone de triangulo
    de atencao (`index.css:5141-5165`), e so `--error` sobrescreve. Ou seja
    "Cartao cadastrado." saia com a cor e o icone de AVISO. Elemento
    presente, texto certo, significado trocado — a classe de defeito que este
    projeto chama de SIGNIFICADO, e nenhum check de forma pega.

    A confirmação usa o componente padrão de eventos: a última ação
    substitui a anterior, sucesso some automaticamente e erro permanece.
  */
  const { avisos, avisar, fechar, limpar } = useAvisos();
  // R22: hook usado é hook importado — o useRef está no import acima.
  // A referência serve para levar a pessoa ao formulário; não mede nada.
  const campoNomeRef = useRef(null);

  /*
    A RECARGA DA LISTA PODE FALHAR DEPOIS DE UMA GRAVACAO QUE PASSOU (04/09).

    Por isso `carregar` recebe opcoes em vez de sempre zerar a tela.
    `preservarAvisos` mantem o que ja esta escrito (a confirmacao de que
    gravou) e `prefixoErro` deixa quem chamou dizer o que a falha significa
    NAQUELE ponto — carregar sozinha nao sabe se veio da montagem da pagina
    ou logo depois de um cadastro. Sem parametro, o comportamento e byte a
    byte o de antes: limpa e mostra o erro cru (mudanca aditiva, R21).
  */
  async function carregar({ preservarAvisos = false, prefixoErro = '' } = {}) {
    setCarregando(true);
    if (!preservarAvisos) limpar();
    try {
      setDados(await listarCartoesRecargaAdmin());
    } catch (error) {
      avisar.erro(`${prefixoErro}${error.message}`);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  useEffect(() => {
    const termo = buscaFornecedor.trim();
    if (!termo || form.parceiro_id) {
      setFornecedores([]);
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      buscarParceiros({ q: termo, fornecedor: 1, ativo: 1, limit: 10 })
        .then((resultado) => setFornecedores(normalizarLista(resultado)))
        .catch(() => setFornecedores([]));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [buscaFornecedor, form.parceiro_id]);

  const usuariosFiltrados = useMemo(() => {
    const termo = buscaUsuario.trim().toLocaleLowerCase('pt-BR');
    if (!termo) return dados.usuarios || [];
    return (dados.usuarios || []).filter((usuario) => `${usuario.nome} ${usuario.email}`.toLocaleLowerCase('pt-BR').includes(termo));
  }, [dados.usuarios, buscaUsuario]);

  const cartoes = dados.cartoes || [];

  // preventScroll: quem rola é o scrollIntoView suave; sem ele o foco dá
  // um salto seco por cima da rolagem (mesmo idioma do StatusSetor).
  function irParaFormulario() {
    campoNomeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    campoNomeRef.current?.focus({ preventScroll: true });
  }

  // Zerar os CAMPOS e apagar os AVISOS eram a mesma funcao — e nao sao a
  // mesma coisa. Separadas: `limparRascunho` mexe so no formulario; quem
  // apaga aviso e quem tem motivo para apagar.
  function limparRascunho() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setBuscaFornecedor('');
    setBuscaUsuario('');
  }

  function novo() {
    limparRascunho();
    limpar();
  }

  // A ação da faixa fixa (R13) não abre nada — o formulário já está na
  // tela: ela limpa o rascunho e LEVA O FOCO até ele, o que serve para
  // quem está no fim de uma lista longa.
  function novoDoCabecalho() {
    novo();
    irParaFormulario();
  }

  function editar(cartao) {
    setEditandoId(cartao.id);
    setForm({
      nome: cartao.nome || '',
      identificador: cartao.identificador || '',
      ultimos_quatro: cartao.ultimos_quatro || '',
      parceiro_id: cartao.parceiro_id || cartao.parceiro?.id || '',
      parceiro_nome: cartao.parceiro?.nome || '',
      empresa_id: cartao.empresa_id || cartao.empresa?.id || '',
      categoria_financeira_id: cartao.categoria_financeira_id || cartao.categoriaFinanceira?.id || '',
      usuario_ids: (cartao.vinculosUsuarios || []).filter((item) => item.ativo !== false).map((item) => Number(item.user_id || item.usuario?.id)),
      observacoes: cartao.observacoes || '',
      ativo: cartao.ativo !== false
    });
    setBuscaFornecedor(cartao.parceiro?.nome || '');
    setBuscaUsuario('');
    limpar();
    irParaFormulario();
  }

  function alternarUsuario(usuarioId) {
    setForm((atual) => {
      const ids = new Set(atual.usuario_ids.map(Number));
      if (ids.has(Number(usuarioId))) ids.delete(Number(usuarioId));
      else ids.add(Number(usuarioId));
      return { ...atual, usuario_ids: [...ids] };
    });
  }

  /*
    ORDEM DOS AVISOS — GRAVAR e RECARREGAR sao DUAS verdades (04/09).

    Antes: `await carregar(); novo(); avisar.sucesso(...)`. Se a gravacao
    passava e a recarga falhava, o `limpar()` de dentro de `novo()` apagava o
    erro que `carregar()` tinha acabado de escrever, e a tela ficava so com
    "Cartao cadastrado." sobre uma lista velha — sem o cartao novo a vista e
    sem sinal nenhum do que falhou. Sucesso posterior comendo erro anterior.

    Agora, na ordem do que e verdade: (1) reseta o rascunho sem tocar nos
    avisos; (2) publica a confirmacao — o registro GRAVOU, e isso nao depende
    de a lista recarregar; (3) recarrega pedindo que os avisos sobrevivam. Se
    a lista nao vier, o erro entra AO LADO da confirmacao e diz o que ficou
    velho, em vez de apagar ou ser apagado por ela.
  */
  async function salvar(event) {
    event.preventDefault();
    if (salvando) return;
    setSalvando(true);
    limpar();
    try {
      const estavaEditando = Boolean(editandoId);
      await salvarCartaoRecarga({ ...form, ultimos_quatro: String(form.ultimos_quatro).replace(/\D/g, '') }, editandoId);
      limparRascunho();
      avisar.sucesso(estavaEditando ? 'Alterações do cartão salvas.' : 'Cartão cadastrado.');
      await carregar({
        preservarAvisos: true,
        prefixoErro: 'A gravação passou, mas a lista abaixo não foi atualizada: '
      });
    } catch (error) {
      avisar.erro(error.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Pagina>
      {/* C1/C2/R5/R13: título (22px), contagem e apoio na faixa fixa do
          topo. Antes eram um `<header>` próprio com `text-xl` e um `<p>`
          solto: sem `.app-page-header` não havia faixa fixa nem
          compactação, e o apoio ficava fora do cabeçalho padrão.
          A ação principal deixou de ser um botão de contorno no meio do
          cabeçalho custom e virou o primário da faixa (C5). */}
      <PageHeader
        titulo="Cartões de recarga"
        contagem={carregando ? null : `${cartoes.length} cartão(ões)`}
        descricao="Cadastre os cartões Flash e defina quais usuários podem solicitá-los."
        acaoPrincipal={{ rotulo: 'Novo cartão', onClick: novoDoCabecalho }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo={editandoId ? 'Editar cartão' : 'Novo cartão'}
        descricao="Um cartão é identificado pelo nome interno, pelo identificador do fornecedor e pelos quatro últimos dígitos."
        acoes={editandoId ? (
          <span className="text-xs font-medium text-[var(--c-muted)]">Cadastro #{editandoId}</span>
        ) : null}
      >
        <form className="space-y-4" onSubmit={salvar}>
          {/* R7: rótulo SEMPRE acima do campo e mesma altura de controle
              (44px do `.input`) — antes os três campos vinham com
              `input-sm` (32px) e o "Cartão ativo" era um checkbox alinhado
              por `items-end pb-2`, ou seja, rótulo ao lado num campo e
              acima nos outros. */}
          <FormSecao legenda="Identificação do cartão" colunas={2}>
            <CampoForm label="Nome de identificação" obrigatorio>
              <input
                ref={campoNomeRef}
                className="input w-full"
                value={form.nome}
                onChange={(e) => setForm((v) => ({ ...v, nome: e.target.value }))}
                required
              />
            </CampoForm>
            <CampoForm label="Identificador interno" obrigatorio>
              <input
                className="input w-full"
                value={form.identificador}
                onChange={(e) => setForm((v) => ({ ...v, identificador: e.target.value }))}
                placeholder="Ex.: FLASH-GEO-01"
                required
              />
            </CampoForm>
            <CampoForm label="Últimos quatro dígitos" obrigatorio>
              <input
                className="input w-full"
                value={form.ultimos_quatro}
                onChange={(e) => setForm((v) => ({ ...v, ultimos_quatro: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                inputMode="numeric"
                maxLength="4"
                required
              />
            </CampoForm>
            <div className="form-campo--linha">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm((v) => ({ ...v, ativo: e.target.checked }))}
                />
                Cartão ativo
              </label>
            </div>
          </FormSecao>

          <FormSecao legenda="Fornecedor" colunas={2}>
            <CampoForm
              label="Fornecedor do cartão"
              obrigatorio
              span={2}
              hint="Digite para buscar entre os fornecedores ativos e escolha um da lista."
            >
              {/* O `relative` mora aqui, e não no CampoForm: é a âncora da
                  lista de sugestões, que é filha deste bloco. */}
              <div className="relative" ref={sugestoesFornecedorRef}>
                <input
                  className="input w-full"
                  value={buscaFornecedor}
                  onFocus={() => setSugestoesFornecedorAbertas(true)}
                  onChange={(e) => { setSugestoesFornecedorAbertas(true); setBuscaFornecedor(e.target.value); setForm((v) => ({ ...v, parceiro_id: '', parceiro_nome: '' })); }}
                  placeholder="Buscar fornecedor"
                  autoComplete="off"
                />
                {sugestoesFornecedorAbertas && fornecedores.length ? (
                  <div className="absolute left-0 right-0 top-full z-dropdown mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--c-border)] bg-[var(--ui-surface)] p-1 shadow-lg">
                    {fornecedores.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-[var(--ui-surface-soft)]"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setForm((v) => ({ ...v, parceiro_id: item.id, parceiro_nome: item.nome }));
                          setBuscaFornecedor(item.nome);
                          setFornecedores([]);
                        }}
                      >
                        {item.nome}
                        <span className="block text-xs text-[var(--c-muted)]">{item.cpf_cnpj || ''}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Classificação financeira" colunas={2}>
            <CampoForm
              label="Empresa responsável"
              obrigatorio
              hint="Será gravada automaticamente no título de cada nova recarga."
            >
              <select
                className="input w-full"
                value={form.empresa_id}
                onChange={(e) => setForm((v) => ({ ...v, empresa_id: e.target.value }))}
                required
              >
                <option value="">Selecione</option>
                {(dados.empresas || []).map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.codigo ? `${empresa.codigo} - ` : ''}{empresa.nome}
                  </option>
                ))}
              </select>
            </CampoForm>
            <CampoForm
              label="Categoria financeira"
              obrigatorio
              hint="Classifica o título; a obra e a apropriação reais serão definidas na prestação de contas."
            >
              <select
                className="input w-full"
                value={form.categoria_financeira_id}
                onChange={(e) => setForm((v) => ({ ...v, categoria_financeira_id: e.target.value }))}
                required
              >
                <option value="">Selecione</option>
                {(dados.categorias || []).map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}{categoria.dre_grupo ? ` · ${categoria.dre_grupo}` : ''}
                  </option>
                ))}
              </select>
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Usuários vinculados" colunas={2}>
            <CampoForm
              label="Filtrar usuários"
              span={2}
              hint="Marque ao menos um usuário — são eles que poderão pedir recarga neste cartão."
            >
              <input
                className="input w-full"
                value={buscaUsuario}
                onChange={(e) => setBuscaUsuario(e.target.value)}
                placeholder="Filtrar usuários"
              />
            </CampoForm>
            {/* R18: a rolagem da lista é `overflow-y: auto`, não `hidden` —
                `auto` é o contêiner de rolagem correto e não sequestra
                sticky nenhum. */}
            <div className="form-campo--linha">
              <div className="grid max-h-56 gap-x-4 gap-y-1 overflow-y-auto md:grid-cols-2">
                {usuariosFiltrados.map((usuario) => (
                  <label key={usuario.id} className="flex items-start gap-2 rounded px-2 py-2 text-sm hover:bg-[var(--ui-surface-soft)]">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={form.usuario_ids.map(Number).includes(Number(usuario.id))}
                      onChange={() => alternarUsuario(usuario.id)}
                    />
                    <span>
                      {usuario.nome}
                      <small className="block text-[var(--c-muted)]">{usuario.email}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </FormSecao>

          <FormSecao legenda="Complemento" colunas={2}>
            <CampoForm label="Observações" tipo="texto-longo">
              {/* Sem `min-h-[72px]`: a altura mínima do textarea já é do
                  componente (`textarea.input`), e px na tela é R10. */}
              <textarea
                className="input w-full"
                value={form.observacoes}
                onChange={(e) => setForm((v) => ({ ...v, observacoes: e.target.value }))}
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando...' : (editandoId ? 'Salvar alterações' : 'Cadastrar cartão')}
            </button>
            <button type="button" className="btn btn-outline" onClick={novo}>
              {editandoId ? 'Cancelar edição' : 'Limpar'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      {/* B2: a lista é o bloco primário — é nela que se vê o efeito do
          cadastro. Antes era uma `<section>` com borda e raio escritos na
          tela; a superfície agora é do BlocoConteudo. */}
      <BlocoConteudo
        titulo="Cartões cadastrados"
        variante="primario"
        cor="var(--c-primary)"
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'cartao',
              titulo: 'Cartão',
              // R17: o cartão é o registro desta lista.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (cartao) => (
                <CelulaDupla
                  principal={cartao.nome}
                  sub={`${cartao.identificador} · final ${cartao.ultimos_quatro}`}
                />
              )
            },
            {
              id: 'classificacao',
              titulo: 'Classificação financeira',
              tipo: 'texto',
              render: (cartao) => (
                <CelulaDupla
                  principal={cartao.empresa?.nome || 'Empresa não configurada'}
                  sub={cartao.categoriaFinanceira?.nome || 'Categoria não configurada'}
                />
              )
            },
            {
              id: 'usuarios',
              titulo: 'Usuários',
              tipo: 'numero',
              render: (cartao) => (cartao.vinculosUsuarios || []).filter((item) => item.ativo !== false).length
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (cartao) => (cartao.ativo !== false ? 'Ativo' : 'Inativo')
            }
          ]}
          itens={cartoes}
          getId={(cartao) => cartao.id}
          carregando={carregando}
          storageKey="tabela:cartoes-recarga"
          rotuloRolagem="Cartões de recarga"
          vazio="Nenhum cartão cadastrado."
          urgencia={(cartao) => (Number(editandoId) === Number(cartao.id) ? 'warning' : null)}
          acoesLinha={(cartao) => (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => editar(cartao)}
              aria-label={`Editar cartão ${cartao.nome}`}
            >
              Editar
            </button>
          )}
          larguraAcoes={120}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
