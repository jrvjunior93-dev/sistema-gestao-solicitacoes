import { useEffect, useMemo, useState } from 'react';
import { formatCurrencyBRL as formatarMoedaBR } from '../../utils/formatters';
import { HiPaperClip, HiTrash } from 'react-icons/hi2';
import { TabelaPadrao } from '../padrao';
import { getOpcoesFormularioContrato } from '../../services/contratos';
import DateInputBR from '../DateInputBR';

/**
 * Bloco do fluxo novo de contratos (wireframe 1), montado DENTRO da Nova Solicitacao
 * quando o tipo selecionado tem `usa_fluxo_contrato_novo` no comportamento (D38).
 *
 * Logica portada da pagina ContratoFluxoNovo.jsx (etapa 8 auditada): conversao por
 * DIGITOS igual ao backend, previa com sobra na ultima parcela, redistribuicao nas
 * ultimas com retrocesso, saldo em tempo real. O backend revalida tudo na gravacao.
 *
 * O bloco NAO conhece obra/credor/valor/descricao — esses vivem no formulario principal.
 * Ele emite via onChange: { qtde_parcelas, primeiro_vencimento, negociacao_arquivo, parcelas }.
 * `negociacao_arquivo` e o File da negociacao detalhada, que a tela sobe depois de criar o
 * contrato. Forma de pagamento, favorecido e instrucoes pertencem a medicao, pois e nela que a
 * solicitacao de pagamento efetivamente nasce.
 */

/**
 * Fallback do limite do Juridico.
 *
 * A fonte de verdade e a configuracao `CONTRATO_LIMITE_JURIDICO`, lida do backend — a Diretoria
 * muda o valor por tela, e este numero fixo aqui fazia a tela cobrar num corte e o backend rotear
 * noutro. Fica so para a tela nao quebrar se a rota falhar.
 */
export const LIMITE_DETALHES_CONTRATO = 50000;
// Espelha MAXIMO_PARCELAS do backend (contratoFluxoNovoService) — la e a borda que vale;
// aqui e so para o usuario ver o limite antes de enviar. 24 definido pelo cliente.
export const MAXIMO_PARCELAS_CONTRATO = 24;

// Conversao por digitos, identica ao backend (contratoParcelasService.paraCentavos):
// toFixed arredonda o binario e ja divergiu do DECIMAL do MySQL tres vezes no projeto.
export function paraCentavosContrato(v) {
  const texto = String(v ?? '').trim();
  if (!texto || !Number.isFinite(Number(texto))) return NaN;
  const neg = texto.startsWith('-');
  const [i = '0', f = ''] = texto.replace(/^[-+]/, '').split('.');
  let cent = parseInt(i || '0', 10) * 100 + parseInt((f + '00').slice(0, 2), 10);
  if (f.length > 2 && Number(f[2]) >= 5) cent += 1;
  return neg ? -cent : cent;
}

/**
 * AS PARCELAS PASSARAM A SER MANUAIS (item 6 do lote de 23/08).
 *
 * Antes, informar "quantidade" e "1o vencimento" gerava N parcelas mensais de uma vez. Agora a
 * pessoa acrescenta uma de cada vez pelo botao "+", e o valor do contrato e redividido a cada
 * adicao — respeitando as TRAVAS.
 *
 * A trava e o que faz a divisao ser util: sem ela, acertar a primeira parcela e depois acrescentar
 * a segunda apagaria o acerto. Editar o valor de uma parcela TRAVA essa parcela automaticamente —
 * digitar um numero e dizer "esta e assim".
 */

/** Vencimento da proxima parcela: um mes depois da ultima, ou daqui a um mes quando nao ha nenhuma. */
function proximoVencimento(ultimoVencimento) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(ultimoVencimento || ''))
    ? (() => { const [a, m, d] = ultimoVencimento.split('-').map(Number); return new Date(a, m - 1, d); })()
    : new Date();

  const dia = base.getDate();
  const alvo = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const ultimoDiaDoMes = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(dia, ultimoDiaDoMes));

  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')}`;
}

/**
 * Redivide o valor do contrato entre as parcelas NAO TRAVADAS.
 *
 * As travadas ficam como estao e saem da conta; o que sobra e dividido em centavos inteiros entre
 * as demais, com o resto na ultima delas — a mesma aritmetica do rateio de apropriacao. Somar
 * float e arredondar no fim ja divergiu do DECIMAL do MySQL tres vezes neste projeto.
 *
 * Sem parcela livre, devolve a lista intacta: quem travou tudo decide o total, e a mensagem de
 * "falta distribuir" avisa que as contas nao fecham.
 */
function redistribuirEntreLivres(lista, valorTotal) {
  const totalCent = paraCentavosContrato(valorTotal);
  if (!Number.isFinite(totalCent) || totalCent <= 0) return lista;

  const travadasCent = lista
    .filter((p) => p.travada)
    .reduce((acc, p) => acc + (paraCentavosContrato(p.valor) || 0), 0);

  const livres = lista.filter((p) => !p.travada);
  if (livres.length === 0) return lista;

  const restanteCent = totalCent - travadasCent;
  if (restanteCent < 0) return lista;

  const base = Math.floor(restanteCent / livres.length);
  const sobra = restanteCent - base * livres.length;
  let indiceLivre = 0;

  return lista.map((p) => {
    if (p.travada) return p;
    indiceLivre += 1;
    const cent = indiceLivre === livres.length ? base + sobra : base;
    return { ...p, valor: cent / 100 };
  });
}

const ESTADOS_CIVIS_REPRESENTANTE = [
  ['SOLTEIRO', 'Solteiro(a)'],
  ['CASADO', 'Casado(a)'],
  ['DIVORCIADO', 'Divorciado(a)'],
  ['VIUVO', 'Viúvo(a)'],
  ['SEPARADO', 'Separado(a)'],
  ['UNIAO_ESTAVEL', 'União estável']
];

const REGIMES_BENS_CASAMENTO = [
  'Comunhão parcial de bens',
  'Comunhão universal de bens',
  'Separação total de bens',
  'Separação obrigatória de bens',
  'Participação final nos aquestos'
];

const CONJUGE_QUALIFICACAO_VAZIO = {
  nome: '',
  cpf: '',
  rg: '',
  nacionalidade: '',
  profissao: '',
  regime_bens: ''
};

const QUALIFICACAO_REPRESENTANTE_VAZIA = {
  nome: '',
  cpf: '',
  rg: '',
  cargo: '',
  nacionalidade: '',
  estado_civil: '',
  profissao: '',
  conjuge: CONJUGE_QUALIFICACAO_VAZIO
};

function normalizarEstadoCivilRepresentante(valor) {
  const chave = String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\(A\)/g, '')
    .replace(/[^A-Z]+/g, '_')
    .replace(/^_|_$/g, '');
  const aliases = {
    SOLTEIRA: 'SOLTEIRO',
    CASADA: 'CASADO',
    DIVORCIADA: 'DIVORCIADO',
    VIUVA: 'VIUVO',
    SEPARADA: 'SEPARADO',
    SEPARADO_JUDICIALMENTE: 'SEPARADO',
    SEPARADA_JUDICIALMENTE: 'SEPARADO'
  };
  return aliases[chave] || chave;
}

const ACEITE_DOCUMENTO_JURIDICO = '.pdf,.docx,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function AnexoJuridicoObrigatorio({ id, titulo, arquivo, onSelecionar, onRemover }) {
  return (
    <div className="grid items-center gap-3 border-b border-[var(--c-border)] py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="text-sm font-medium">{titulo} *</div>
        <div className="mt-1 truncate text-xs" style={{ color: arquivo ? 'var(--c-text)' : 'var(--c-muted)' }}
          data-testid={`${id}-nome`}>
          {arquivo?.name || 'Nenhum arquivo selecionado'}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
          <HiPaperClip className="w-4 h-4" />
          <span className="ml-1">{arquivo ? 'Trocar' : 'Anexar'}</span>
          <input
            type="file"
            name={id}
            accept={ACEITE_DOCUMENTO_JURIDICO}
            style={{ display: 'none' }}
            onChange={(e) => {
              onSelecionar(e.target.files?.[0] || null);
              e.target.value = '';
            }}
          />
        </label>
        {arquivo && (
          <button type="button" className="btn btn-outline btn-sm" title={`Remover ${titulo}`}
            aria-label={`Remover ${titulo}`} onClick={onRemover}>
            <HiTrash className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function BlocoContratoFluxoNovo({
  obraId,
  valorTotal,
  contratadoPrincipal,
  limiteJuridico,
  camposConfigurados = {},
  onChange
}) {
  // Todos os contratados respondem pelo contrato. O credor escolhido no formulario principal e
  // o primeiro contratado; os demais entram aqui. Favorecido nao e atributo da abertura: ele e
  // informado na medicao, quando existe uma solicitacao de pagamento concreta.
  const [outrosContratados, setOutrosContratados] = useState([]);
  const [campos, setCampos] = useState({
    // O File fica no estado do bloco e sobe depois da criacao do contrato.
    negociacao_arquivo: null,
    cartao_cnpj_arquivo: null,
    ato_constitutivo_arquivo: null,
    documentos_representante_legal_arquivo: null,
    representante_legal_qualificacao: QUALIFICACAO_REPRESENTANTE_VAZIA,
    detalhes_contratacao: '',
    // Campos do escopo 3.1/3.2 que ja tinham coluna no banco e nao tinham campo na tela.
    objeto: '',
    vigencia_inicio: '',
    vigencia_fim: '',
    justificativa: '',
    responsavel_id: ''
  });
  const [usuarios, setUsuarios] = useState([]);
  const [erroUsuarios, setErroUsuarios] = useState('');
  const [parcelas, setParcelas] = useState([]);
  const [erroLocal, setErroLocal] = useState('');

  // Uma rota so, e acessivel a quem abre contrato.
  //
  // Antes o responsavel vinha de uma rota administrativa (`/usuarios`, com `allowGestaoUsuarios`).
  // O usuario da OBRA nao tem esse acesso, entao o select ficava vazio em silencio.
  //
  // Agora o erro APARECE. Falha silenciosa que apaga opcao ja reprovou este projeto antes.
  useEffect(() => {
    if (!obraId) {
      setUsuarios([]);
      setErroUsuarios('');
      setCampos((atuais) => ({ ...atuais, responsavel_id: '' }));
      return undefined;
    }

    let cancelado = false;
    setErroUsuarios('');
    getOpcoesFormularioContrato({ obraId })
      .then((r) => {
        if (cancelado) return;
        const lista = Array.isArray(r?.usuarios) ? r.usuarios : [];
        setUsuarios(lista);
        setCampos((atuais) => (lista.some((u) => String(u.id) === String(atuais.responsavel_id))
          ? atuais
          : { ...atuais, responsavel_id: '' }));
      })
      .catch((e) => {
        if (cancelado) return;
        setUsuarios([]);
        setCampos((atuais) => ({ ...atuais, responsavel_id: '' }));
        setErroUsuarios(e.message || 'Nao foi possivel carregar os responsaveis pela contratacao.');
      });
    return () => { cancelado = true; };
  }, [obraId]);

  // Previa regenerada quando valor (externo), qtde ou vencimento mudam.
  useEffect(() => {
    // O valor do contrato mudou: redivide entre as parcelas livres, sem tocar nas travadas. As
    // parcelas em si nao sao recriadas — quem as cria e o botao "+".
    setParcelas((atuais) => (atuais.length === 0 ? atuais : redistribuirEntreLivres(atuais, valorTotal)));
  }, [valorTotal]);

  // O teto de parcelas agora e cobrado no botao "+" (que nem deixa passar) e aqui, para o caso de
  // uma lista vinda de fora. Antes era o `min`/`max` nativo do campo de quantidade, que nao existe
  // mais — e cuja mensagem fugia do padrao dos demais erros do bloco (B2).
  const avisoQtde = parcelas.length > MAXIMO_PARCELAS_CONTRATO
    ? `A quantidade de parcelas nao pode passar de ${MAXIMO_PARCELAS_CONTRATO}.`
    : '';

  const totalCent = paraCentavosContrato(valorTotal) || 0;
  const somaCent = parcelas.reduce((a, p) => a + paraCentavosContrato(p.valor), 0);
  const saldoCent = totalCent - somaCent;
  const limiteAplicado = Number(limiteJuridico) > 0 ? Number(limiteJuridico) : LIMITE_DETALHES_CONTRATO;
  const exigeDocumentacaoJuridica = paraCentavosContrato(valorTotal) > paraCentavosContrato(limiteAplicado);
  // TODO contrato exige a negociacao detalhada, e nao so acima do limite (item 7, 23/08). O
  // documento deixou de ser exigencia do contrato grande e virou parte do que define um contrato.
  const exigeDetalhes = true;

  function editarParcela(numero, novoValor) {
    // Aqui NAO se valida o minimo: bloquear a cada tecla impedia digitar "0,50" — o primeiro "0"
    // era rejeitado, o campo revertia e os digitos seguintes se somavam ao valor antigo (N3). O
    // minimo e cobrado quando o usuario termina de digitar (onBlur) e no submit.
    const novoCent = paraCentavosContrato(novoValor);
    if (!Number.isFinite(novoCent) || novoCent < 0) return;

    setErroLocal('');
    setParcelas((atuais) => {
      // Editar TRAVA a parcela: digitar um numero e dizer "esta e assim". Sem isso, a proxima
      // adicao redividiria o valor e apagaria o que a pessoa acabou de escrever.
      const comEdicao = atuais.map((p) => (p.numero === numero
        ? { ...p, valor: novoCent / 100, travada: true }
        : p));
      return redistribuirEntreLivres(comEdicao, valorTotal);
    });
  }

  function editarVencimento(numero, valor) {
    setParcelas((atuais) => atuais.map((p) => (p.numero === numero ? { ...p, vencimento: valor } : p)));
  }

  function adicionarParcela() {
    setParcelas((atuais) => {
      if (atuais.length >= MAXIMO_PARCELAS_CONTRATO) {
        setErroLocal(`A quantidade de parcelas nao pode passar de ${MAXIMO_PARCELAS_CONTRATO}.`);
        return atuais;
      }
      setErroLocal('');
      const ultima = atuais[atuais.length - 1];
      const nova = {
        numero: atuais.length + 1,
        valor: 0,
        vencimento: proximoVencimento(ultima?.vencimento),
        travada: false
      };
      return redistribuirEntreLivres([...atuais, nova], valorTotal);
    });
  }

  function removerParcela(numero) {
    setErroLocal('');
    setParcelas((atuais) => redistribuirEntreLivres(
      atuais
        .filter((p) => p.numero !== numero)
        // Renumera: o backend exige numeracao sequencial a partir de 1, e um buraco vira
        // "Parcela editada N invalida" no envio.
        .map((p, i) => ({ ...p, numero: i + 1 })),
      valorTotal
    ));
  }

  const campo = (k) => (e) => setCampos((c) => ({ ...c, [k]: e.target.value }));
  const campoQualificacao = (k) => (e) => setCampos((atuais) => ({
    ...atuais,
    representante_legal_qualificacao: {
      ...atuais.representante_legal_qualificacao,
      [k]: e.target.value
    }
  }));
  const campoConjugeQualificacao = (k) => (e) => setCampos((atuais) => ({
    ...atuais,
    representante_legal_qualificacao: {
      ...atuais.representante_legal_qualificacao,
      conjuge: {
        ...atuais.representante_legal_qualificacao.conjuge,
        [k]: e.target.value
      }
    }
  }));

  useEffect(() => {
    if (!contratadoPrincipal) return;
    setCampos((atuais) => ({
      ...atuais,
      representante_legal_qualificacao: {
        nome: contratadoPrincipal.representante_nome || '',
        cpf: contratadoPrincipal.representante_cpf || '',
        rg: contratadoPrincipal.representante_rg || '',
        cargo: contratadoPrincipal.representante_cargo || '',
        nacionalidade: contratadoPrincipal.representante_nacionalidade || '',
        estado_civil: normalizarEstadoCivilRepresentante(contratadoPrincipal.representante_estado_civil),
        profissao: contratadoPrincipal.representante_profissao || '',
        conjuge: {
          ...CONJUGE_QUALIFICACAO_VAZIO,
          nome: contratadoPrincipal.conjuge_nome || '',
          regime_bens: contratadoPrincipal.regime_bens || ''
        }
      }
    }));
  }, [contratadoPrincipal]);

  // Lista completa de contratados: o do formulario principal na frente, sem repetir.
  const contratados = useMemo(() => {
    const lista = contratadoPrincipal ? [contratadoPrincipal] : [];
    outrosContratados.forEach((p) => {
      if (!lista.some((x) => String(x.id) === String(p.id))) lista.push(p);
    });
    return lista;
  }, [contratadoPrincipal, outrosContratados]);

  useEffect(() => {
    onChange?.({
      ...campos,
      // Deixaram de ser campos e passaram a SAIR das parcelas (item 6, 23/08). O backend continua
      // recebendo os dois — ele gera uma lista propria por quantidade e a usa como conferencia de
      // forma antes de aceitar a lista real, que e esta. Mandar valores coerentes mantem essa
      // conferencia valendo sem precisar mexer no nucleo que cria os titulos.
      qtde_parcelas: parcelas.length,
      primeiro_vencimento: parcelas[0]?.vencimento || '',
      parcelas,
      parceiros: contratados.map((p) => p.id)
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campos, parcelas, contratados]);

  const campoVisivel = (id) => camposConfigurados?.[id]?.visivel !== false;
  const campoObrigatorio = (id) => Boolean(camposConfigurados?.[id]?.obrigatorio);
  const exibirObjeto = campoVisivel('contrato_objeto');
  const exibirJustificativa = campoVisivel('contrato_justificativa');
  const exibirResponsavel = campoVisivel('contrato_responsavel');
  const exibirVigenciaInicio = campoVisivel('contrato_vigencia_inicio');
  const exibirVigenciaFim = campoVisivel('contrato_vigencia_fim');
  const exibirDetalhamentoContratacao = exibirObjeto || exibirJustificativa || exibirResponsavel || exibirVigenciaInicio || exibirVigenciaFim;
  const representanteCasado = campos.representante_legal_qualificacao.estado_civil === 'CASADO';

  return (
    <div className="card space-y-3" style={{ marginTop: 12 }}>
      <div className="text-sm" style={{ fontWeight: 700 }}>Detalhamento</div>

      {erroLocal && <div className="app-alert app-alert--error">{erroLocal}</div>}
      {erroUsuarios && <div className="app-alert app-alert--error">{erroUsuarios}</div>}
      {avisoQtde && <div className="app-alert app-alert--error">{avisoQtde}</div>}

      {/* Ordem da tela: O QUE se contrata -> documentos -> cronograma financeiro. Os dados
          operacionais de pagamento ficam na medicao e nao poluem a abertura do contrato. */}
      {exibirDetalhamentoContratacao && <div className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {exibirObjeto && <label className="grid gap-1 text-sm md:col-span-3">
            Objeto do contrato{campoObrigatorio('contrato_objeto') ? ' *' : ''}
            <input className="input input-sm" value={campos.objeto} onChange={campo('objeto')}
              required={campoObrigatorio('contrato_objeto')}
              placeholder="O que está sendo contratado" />
          </label>}
          {exibirJustificativa && <label className="grid gap-1 text-sm md:col-span-3">
            Justificativa da contratação{campoObrigatorio('contrato_justificativa') ? ' *' : ''}
            <textarea className="input input-sm" rows={2} value={campos.justificativa}
              required={campoObrigatorio('contrato_justificativa')}
              onChange={campo('justificativa')} placeholder="Por que esta contratação é necessária" />
          </label>}
          {exibirResponsavel && <label className="grid gap-1 text-sm">
            Responsável pela contratação{campoObrigatorio('contrato_responsavel') ? ' *' : ''}
            <select className="input input-sm" value={campos.responsavel_id} onChange={campo('responsavel_id')}
              required={campoObrigatorio('contrato_responsavel')} disabled={!obraId}>
              <option value="">{obraId ? 'Selecione' : 'Selecione a obra primeiro'}</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            {obraId && usuarios.length === 0 && !erroUsuarios && (
              <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
                Nenhum usuário ativo esta vinculado a esta obra/centro de custo.
              </span>
            )}
          </label>}
          {exibirVigenciaInicio && <label className="grid gap-1 text-sm">
            Vigência inicial{campoObrigatorio('contrato_vigencia_inicio') ? ' *' : ''}
            <DateInputBR className="input input-sm" value={campos.vigencia_inicio} onChange={campo('vigencia_inicio')}
              required={campoObrigatorio('contrato_vigencia_inicio')} />
          </label>}
          {exibirVigenciaFim && <label className="grid gap-1 text-sm">
            Vigência final{campoObrigatorio('contrato_vigencia_fim') ? ' *' : ''}
            <DateInputBR className="input input-sm" value={campos.vigencia_fim} onChange={campo('vigencia_fim')}
              required={campoObrigatorio('contrato_vigencia_fim')} />
          </label>}
        </div>
      </div>}

      <div className="space-y-2" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 12 }}>
        <div className="text-xs" style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
          Previsão de pagamento
        </div>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Defina abaixo os valores e vencimentos previstos. A forma de pagamento, o favorecido e
          as instrucoes serao informados em cada medicao.
        </p>
        {/* "Saldo a distribuir: R$ 0,00" confundiu o cliente (20/08): zero sem contexto parece
            campo vazio ou erro, quando e exatamente o estado CERTO — as parcelas fecham o valor do
            contrato. O numero sozinho nao diz se e bom ou ruim; agora a frase diz. */}
        <div className="text-sm" data-testid="saldo-a-distribuir">
          {saldoCent === 0 ? (
            <span style={{ color: 'var(--c-success, #15803d)' }}>
              As parcelas fecham o valor do contrato.
            </span>
          ) : (
            <span style={{
              color: saldoCent < 0 ? '#dc2626' : 'var(--c-danger, #b91c1c)',
              fontWeight: saldoCent < 0 ? 600 : undefined
            }}>
              <strong>{saldoCent > 0 ? 'Falta distribuir' : 'Passou do valor do contrato em'}:</strong>
              {' '}{formatarMoedaBR(Math.abs(saldoCent) / 100)}
              {saldoCent > 0
                ? ' — ajuste as parcelas ate fechar o total.'
                : ' — reduza as parcelas ate fechar o total.'}
            </span>
          )}
        </div>
      </div>

      {/* A negociacao detalhada deixou de ser texto e passou a ser DOCUMENTO (decisao do cliente,
          20/08): ela chega pronta em .docx. O arquivo fica retido aqui e sobe logo depois da
          criacao do contrato, porque a criacao e JSON e so entao existe um contrato a que anexar.
          Quem cobra de verdade e a aprovacao, no servidor. */}
      {exigeDetalhes && (
        <div className="text-sm">
          <span className="block">
            Negociacao detalhada (obrigatoria) *
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }} title="Anexar .docx ou .pdf">
              <HiPaperClip className="w-4 h-4" />
              <span className="ml-1">{campos.negociacao_arquivo ? 'Trocar arquivo' : 'Anexar documento'}</span>
              <input
                type="file"
                name="negociacao_detalhada"
                accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const arquivo = e.target.files?.[0] || null;
                  setCampos((atuais) => ({ ...atuais, negociacao_arquivo: arquivo }));
                  // Limpa o input para que escolher o MESMO arquivo de novo dispare o onChange.
                  e.target.value = '';
                }}
              />
            </label>
            {campos.negociacao_arquivo ? (
              <>
                <span className="text-xs text-[var(--c-text)]" data-testid="negociacao-nome">
                  {campos.negociacao_arquivo.name}
                </span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  title="Remover documento"
                  aria-label="Remover documento"
                  onClick={() => setCampos((atuais) => ({ ...atuais, negociacao_arquivo: null }))}
                >
                  <HiTrash className="w-4 h-4" />
                </button>
              </>
            ) : (
              <span className="text-xs text-[var(--c-muted)]">Nenhum documento anexado (.docx ou .pdf)</span>
            )}
          </div>
        </div>
      )}

      {exigeDocumentacaoJuridica && (
        <section className="space-y-5" data-testid="documentacao-juridica-obrigatoria"
          style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16 }}>
          <div>
            <div className="text-xs" style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
              Documentação jurídica obrigatória
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--c-muted)' }}>
              Exigida porque o contrato ultrapassa {formatarMoedaBR(limiteAplicado)}. Os dados abaixo ficam registrados no contrato.
            </p>
          </div>

          <div className="border-y border-[var(--c-border)]">
            <AnexoJuridicoObrigatorio
              id="cartao_cnpj"
              titulo="Cartão CNPJ"
              arquivo={campos.cartao_cnpj_arquivo}
              onSelecionar={(arquivo) => setCampos((atuais) => ({ ...atuais, cartao_cnpj_arquivo: arquivo }))}
              onRemover={() => setCampos((atuais) => ({ ...atuais, cartao_cnpj_arquivo: null }))}
            />
            <AnexoJuridicoObrigatorio
              id="ato_constitutivo"
              titulo="Ato constitutivo"
              arquivo={campos.ato_constitutivo_arquivo}
              onSelecionar={(arquivo) => setCampos((atuais) => ({ ...atuais, ato_constitutivo_arquivo: arquivo }))}
              onRemover={() => setCampos((atuais) => ({ ...atuais, ato_constitutivo_arquivo: null }))}
            />
            <AnexoJuridicoObrigatorio
              id="documentos_representante_legal"
              titulo="Documentos do representante legal"
              arquivo={campos.documentos_representante_legal_arquivo}
              onSelecionar={(arquivo) => setCampos((atuais) => ({ ...atuais, documentos_representante_legal_arquivo: arquivo }))}
              onRemover={() => setCampos((atuais) => ({ ...atuais, documentos_representante_legal_arquivo: null }))}
            />
          </div>

          <fieldset className="border-0 border-t border-[var(--c-border)] pt-4"
            style={{ paddingLeft: 0, paddingRight: 0, paddingBottom: 0, margin: 0 }}>
            <legend className="pr-3 text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              Qualificação do representante legal
            </legend>
            <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1.5 text-sm md:col-span-2">
              Nome completo *
              <input className="input input-sm" value={campos.representante_legal_qualificacao.nome}
                onChange={campoQualificacao('nome')} autoComplete="name" />
            </label>
            <label className="grid gap-1.5 text-sm">
              CPF *
              <input className="input input-sm" value={campos.representante_legal_qualificacao.cpf}
                onChange={campoQualificacao('cpf')} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" />
            </label>
            <label className="grid gap-1.5 text-sm">
              RG *
              <input className="input input-sm" value={campos.representante_legal_qualificacao.rg}
                onChange={campoQualificacao('rg')} maxLength={40} />
            </label>
            <label className="grid gap-1.5 text-sm">
              Cargo ou função *
              <input className="input input-sm" value={campos.representante_legal_qualificacao.cargo}
                onChange={campoQualificacao('cargo')} maxLength={80} placeholder="Ex.: Sócio administrador" />
            </label>
            <label className="grid gap-1.5 text-sm">
              Nacionalidade *
              <input className="input input-sm" value={campos.representante_legal_qualificacao.nacionalidade}
                onChange={campoQualificacao('nacionalidade')} maxLength={60} />
            </label>
            <label className="grid gap-1.5 text-sm">
              Estado civil *
              <select className="input input-sm" value={campos.representante_legal_qualificacao.estado_civil}
                onChange={campoQualificacao('estado_civil')} data-testid="estado-civil-representante">
                <option value="">Selecione</option>
                {ESTADOS_CIVIS_REPRESENTANTE.map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>{rotulo}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              Profissão *
              <input className="input input-sm" value={campos.representante_legal_qualificacao.profissao}
                onChange={campoQualificacao('profissao')} maxLength={80} />
            </label>
            {representanteCasado && (
              <fieldset className="md:col-span-2 lg:col-span-4"
                data-testid="dados-conjuge-representante"
                style={{ border: 0, borderTop: '1px solid var(--c-border)', padding: '12px 0 0', margin: '4px 0 0' }}>
                <legend className="text-sm font-semibold" style={{ paddingRight: 8 }}>
                  Dados do cônjuge
                </legend>
                <p className="text-xs mb-3" style={{ color: 'var(--c-muted)' }}>
                  Obrigatórios porque o representante foi informado como casado.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <label className="grid gap-1 text-sm md:col-span-2">
                    Nome completo do cônjuge *
                    <input className="input input-sm"
                      value={campos.representante_legal_qualificacao.conjuge?.nome || ''}
                      onChange={campoConjugeQualificacao('nome')} autoComplete="name" maxLength={180} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    CPF do cônjuge *
                    <input className="input input-sm"
                      value={campos.representante_legal_qualificacao.conjuge?.cpf || ''}
                      onChange={campoConjugeQualificacao('cpf')} inputMode="numeric" maxLength={14}
                      placeholder="000.000.000-00" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    RG do cônjuge *
                    <input className="input input-sm"
                      value={campos.representante_legal_qualificacao.conjuge?.rg || ''}
                      onChange={campoConjugeQualificacao('rg')} maxLength={40} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Nacionalidade do cônjuge *
                    <input className="input input-sm"
                      value={campos.representante_legal_qualificacao.conjuge?.nacionalidade || ''}
                      onChange={campoConjugeQualificacao('nacionalidade')} maxLength={60} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Profissão do cônjuge *
                    <input className="input input-sm"
                      value={campos.representante_legal_qualificacao.conjuge?.profissao || ''}
                      onChange={campoConjugeQualificacao('profissao')} maxLength={80} />
                  </label>
                  <label className="grid gap-1 text-sm md:col-span-2">
                    Regime de bens *
                    <select className="input input-sm"
                      value={campos.representante_legal_qualificacao.conjuge?.regime_bens || ''}
                      onChange={campoConjugeQualificacao('regime_bens')}>
                      <option value="">Selecione</option>
                      {REGIMES_BENS_CASAMENTO.map((regime) => (
                        <option key={regime} value={regime}>{regime}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
            )}
            </div>
          </fieldset>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 12 }}>
        <div className="text-xs" style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
          Parcelas
        </div>
        <button type="button" className="btn btn-outline btn-sm" data-testid="adicionar-parcela"
          onClick={adicionarParcela}
          disabled={parcelas.length >= MAXIMO_PARCELAS_CONTRATO}>
          + Adicionar parcela
        </button>
      </div>

      {parcelas.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--c-muted)' }}>
          Nenhuma parcela ainda. Use <strong>+ Adicionar parcela</strong> — o valor do contrato e
          dividido entre as parcelas a cada uma que voce acrescenta.
        </p>
      )}

      {parcelas.length > 0 && (
        <TabelaPadrao
          /*
            GRADE DE LANÇAMENTO, NÃO LISTA DE CONSULTA (05/09).
            A maioria das colunas aqui é campo de digitação, não dado a ler.
            Oferecer "escolher colunas" numa grade assim dá ao usuário como
            esconder o campo que ele precisa preencher — e ele não descobre por
            que o lançamento parou de funcionar. A capacidade sai DAQUI, não do
            sistema: nas 246 tabelas de consulta ela continua.
          */
          colunasConfiguraveis={false}
          colunas={[
            {
              id: 'numero',
              titulo: '#',
              tipo: 'codigo',
              noCard: 'titulo',
              render: (p) => p.numero
            },
            {
              id: 'valor',
              titulo: 'Valor',
              tipo: 'valor',
              /* sem `min` nativo de proposito: com ele o navegador barra o submit com a
                 mensagem dele, em vez da mensagem do sistema (a queixa do B2). O minimo
                 e cobrado no onBlur e no submit. */
              /* Moeda brasileira, por DIGITOS (pedido do cliente, 19/08): cada tecla empurra
                 os centavos, como no campo Valor da solicitacao. E a mesma conversao que o
                 backend usa — converter por `toFixed` arredondaria o binario e ja divergiu do
                 DECIMAL do MySQL antes (F2 da auditoria). O valor guardado segue sendo numero
                 cru; a mascara e so o que se ve. */
              render: (p) => (
                <input className="input" type="text" inputMode="numeric"
                  value={p.valor === '' || p.valor === null || p.valor === undefined
                    ? ''
                    : formatarMoedaBR(Number(p.valor))}
                  onChange={(e) => {
                    const digitos = String(e.target.value).replace(/\D/g, '');
                    editarParcela(p.numero, digitos ? String(Number(digitos) / 100) : '0');
                  }}
                  onBlur={(e) => {
                    // Cobra o minimo so quando o campo e concluido, nunca no meio da digitacao.
                    const cent = paraCentavosContrato(String(e.target.value).replace(/\D/g, '') / 100);
                    setErroLocal(Number.isFinite(cent) && cent > 0 ? '' : 'A parcela deve ser de no minimo R$ 0,01.');
                  }} />
              )
            },
            {
              id: 'vencimento',
              titulo: 'Vencimento',
              tipo: 'data',
              /* Editavel linha a linha: sem o campo de "1o vencimento" gerando tudo, a data de
                 cada parcela e escolha de quem monta o contrato. */
              render: (p) => (
                <DateInputBR className="input"
                  value={p.vencimento || ''}
                  onChange={(e) => editarVencimento(p.numero, e.target.value)} />
              )
            }
          ]}
          itens={parcelas}
          getId={(p) => p.numero}
          storageKey="tabela:contrato-fluxo-novo-bloco:parcelas"
          rotuloRolagem="Parcelas do contrato"
          vazio="Nenhuma parcela ainda."
          acoesLinha={(p) => (
            <button type="button" className="btn btn-outline btn-sm"
              data-testid={`remover-parcela-${p.numero}`}
              aria-label={`Remover parcela ${p.numero}`}
              onClick={() => removerParcela(p.numero)}>
              <HiTrash className="w-4 h-4" />
            </button>
          )}
          larguraAcoes={120}
          /* R17: linha de parcela — numero, valor e vencimento; nao ha nome de
             registro, a parcela e identificada pelo numero. */
          semIdentidade
        />
      )}
    </div>
  );
}
