import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getOpcoesFormularioContrato, getTetoAditivo, solicitarAditivoContrato } from '../../services/contratos';
import { formatCurrencyBRL, normalizeCurrencyTyping, parseCurrencyInput } from '../../utils/formatters';
import DateInputBR from '../DateInputBR';

/**
 * Modal do TERMO ADITIVO (PI-15).
 *
 * O aditivo deixou de ser um subtipo da Nova Solicitacao e virou uma ACAO sobre o contrato:
 * um botao na tela de medicao abre este modal. Vale para contrato do fluxo ANTIGO e do NOVO.
 * No novo, o cronograma financeiro e montado linha a linha; no legado, a quantidade numerica e
 * preservada porque esse contrato nao possui registros de parcelas para reaproveitar.
 *
 * O teto de 25% e calculado no BACKEND e apenas exibido aqui: a tela nao recalcula regra de
 * dinheiro. O backend reconfere na solicitacao e de novo na aprovacao, e e ele quem decide.
 * O aviso local existe so para o usuario nao perder a digitacao ate o servidor responder.
 *
 * Independente da solicitacao em curso: pedir o aditivo nao envia nem valida a medicao que a
 * pessoa esta preenchendo. Sao dois atos separados, e misturar os dois faria o usuario perder o
 * formulario.
 *
 * VAI EM PORTAL PARA O BODY, e isso nao e detalhe de estilo — sao duas coisas que so o portal
 * resolve (medidas conferidas na tela, nao deduzidas):
 *
 *   1) `main.layout-main` tem `position: relative; z-index: 1`, o que CRIA UM CONTEXTO DE
 *      EMPILHAMENTO. Dentro dele, o `z-index: 50` do modal so disputa entre irmaos do main — e o
 *      main inteiro vale 1 contra a sidebar, que vale 40. Nenhum valor de z-index no modal
 *      resolveria: o teto e o do ancestral. Fora do main, o modal disputa no nivel do body.
 *   2) `responsive-system.css` tem `.layout-main :where(..., .card, ...) { max-width: 100% }`.
 *      O `:where()` zera a propria especificidade, mas o `.layout-main` nao: a regra EMPATA com o
 *      utilitario de largura e vence pela ordem de importacao. Resultado: o painel esticava para
 *      1408px numa viewport de 1440. Fora do `.layout-main`, a regra deixa de casar.
 *
 * As medidas saem dos tokens do proprio projeto (`--modal-max-w-lg`, `--z-modal`) em vez de
 * utilitario, para a largura nao voltar a depender de quem e importado por ultimo.
 */

const moeda = (v) => formatCurrencyBRL(v);

function criarChaveIdempotenciaAditivo() {
  const sufixo = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `aditivo:${sufixo}`;
}

function formatarDataContrato(valor) {
  const partes = String(valor || '').slice(0, 10).split('-');
  if (partes.length !== 3 || partes.some((parte) => !parte)) return '';
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function rotuloVigenciaAtual(contrato) {
  const inicio = formatarDataContrato(contrato?.vigencia_inicio);
  const fim = formatarDataContrato(contrato?.vigencia_fim);
  if (inicio && fim) return `${inicio} a ${fim}`;
  if (fim) return `Até ${fim}`;
  if (inicio) return `Desde ${inicio}`;
  return 'Não informada';
}

function hojeLocalIso() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function adicionarUmDiaIso(valor) {
  const partes = String(valor || '').slice(0, 10).split('-').map(Number);
  if (partes.length !== 3 || partes.some((parte) => !Number.isInteger(parte))) return '';
  const data = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2] + 1));
  return data.toISOString().slice(0, 10);
}

function dataMinimaNovaVigencia(contrato) {
  const hoje = hojeLocalIso();
  const fimAtual = String(contrato?.vigencia_fim || '').slice(0, 10);
  if (!fimAtual || fimAtual < hoje) return hoje;
  return adicionarUmDiaIso(fimAtual);
}

function mensagemNovaVigencia(valor, contrato) {
  if (!valor) return '';
  const hoje = hojeLocalIso();
  const fimAtual = String(contrato?.vigencia_fim || '').slice(0, 10);
  if (valor < hoje) return `A nova vigência não pode ser anterior a hoje (${formatarDataContrato(hoje)}).`;
  if (fimAtual && valor === fimAtual) {
    return 'A data é igual à vigência atual e não altera o prazo. Para acrescentar apenas valor, use Somente valor.';
  }
  if (fimAtual && valor < fimAtual) {
    return `Este fluxo aceita apenas prorrogação. Informe uma data posterior à vigência atual (${formatarDataContrato(fimAtual)}).`;
  }
  return '';
}

function proximoVencimento(ultimoVencimento) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(ultimoVencimento || ''))
    ? (() => { const [a, m, d] = ultimoVencimento.split('-').map(Number); return new Date(a, m - 1, d); })()
    : new Date();
  const dia = base.getDate();
  const alvo = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(dia, ultimoDia));
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')}`;
}

function paraCentavosCronograma(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 100) : NaN;
}

function redistribuirCronograma(lista, valorTotal) {
  const totalCent = paraCentavosCronograma(valorTotal);
  if (!Number.isFinite(totalCent) || totalCent <= 0 || lista.length === 0) return lista;
  const travadasCent = lista
    .filter((parcela) => parcela.travada)
    .reduce((soma, parcela) => soma + (paraCentavosCronograma(parcela.valor) || 0), 0);
  const livres = lista.filter((parcela) => !parcela.travada);
  if (livres.length === 0 || travadasCent > totalCent) return lista;
  const restanteCent = totalCent - travadasCent;
  const baseCent = Math.floor(restanteCent / livres.length);
  const sobraCent = restanteCent - baseCent * livres.length;
  let indiceLivre = 0;
  return lista.map((parcela) => {
    if (parcela.travada) return parcela;
    indiceLivre += 1;
    const valorCent = indiceLivre === livres.length ? baseCent + sobraCent : baseCent;
    return { ...parcela, valor: valorCent / 100 };
  });
}

// `tipo` comeca VAZIO de proposito: o cliente pediu que informar seja OBRIGATORIO, e um padrao
// escolhido pela tela seria a decisao sendo tomada por quem nao devia. E ele que decide o que a
// aprovacao faz — uma parcela com o vencimento antigo ou um cronograma financeiro independente.
const criarCamposVazios = () => ({
  tipo: '',
  valor: '',
  nova_vigencia_fim: '',
  qtde_parcelas: '',
  parcelas: [],
  justificativa: '',
  responsavel_id: ''
});

export default function ModalAditivoContrato({ contratoId, contratoRotulo, areaResponsavel, aberto, onFechar, onSolicitado }) {
  const [teto, setTeto] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [campos, setCampos] = useState(criarCamposVazios);
  const [negociacaoArquivo, setNegociacaoArquivo] = useState(null);
  const idempotencyKeyRef = useRef('');

  // Recarrega o teto toda vez que abre: entre uma abertura e outra outro aditivo pode ter sido
  // aprovado, e mostrar um disponivel velho induziria a pessoa a pedir um valor que sera negado.
  useEffect(() => {
    if (!aberto || !contratoId) return undefined;
    let cancelado = false;
    setErro('');
    setCampos(criarCamposVazios());
    setNegociacaoArquivo(null);
    idempotencyKeyRef.current = criarChaveIdempotenciaAditivo();
    setTeto(null);
    setCarregando(true);

    getTetoAditivo(contratoId)
      .then(async (r) => {
        if (cancelado) return;
        setTeto(r);

        try {
          const opcoes = await getOpcoesFormularioContrato({ obraId: r?.contrato?.obra_id });
          if (cancelado) return;
          const lista = Array.isArray(opcoes?.usuarios) ? opcoes.usuarios : [];
          const responsavelContratoId = r?.contrato?.responsavel_id;
          setUsuarios(lista);
          setCampos((atuais) => ({
            ...atuais,
            responsavel_id: lista.some((u) => String(u.id) === String(responsavelContratoId))
              ? String(responsavelContratoId)
              : ''
          }));
        } catch (e) {
          if (!cancelado) {
            setUsuarios([]);
            setErro(e.message || 'Erro ao carregar os responsaveis vinculados a obra.');
          }
        }
      })
      .catch((e) => { if (!cancelado) setErro(e.message || 'Erro ao carregar o limite de aditivo.'); })
      .finally(() => { if (!cancelado) setCarregando(false); });

    return () => { cancelado = true; };
  }, [aberto, contratoId]);

  const valorCronograma = campos.tipo === 'PRAZO'
    ? Number(teto?.saldo_livre || 0)
    : parseCurrencyInput(campos.valor);

  useEffect(() => {
    if (!aberto || !teto?.contrato?.fluxo_novo) return;
    setCampos((atuais) => (atuais.parcelas.length === 0
      ? atuais
      : { ...atuais, parcelas: redistribuirCronograma(atuais.parcelas, valorCronograma) }));
  }, [aberto, teto?.contrato?.fluxo_novo, valorCronograma]);

  // Centralizar na viewport deixa o modal visualmente A ESQUERDA, porque o menu ocupa ~286px que
  // nao sao area util. Entao o overlay cobre a tela inteira (escurece o menu e bloqueia o clique
  // nele), mas o painel e centralizado sobre a AREA DE CONTEUDO.
  //
  // A borda do conteudo e MEDIDA, nao fixada: o menu recolhe, e no celular vira gaveta e comeca em
  // zero. Medida fixa daria certo num estado e errado nos outros.
  const [recuoConteudo, setRecuoConteudo] = useState(0);
  useEffect(() => {
    if (!aberto || typeof document === 'undefined') return undefined;
    const medir = () => {
      const principal = document.querySelector('.layout-main');
      setRecuoConteudo(principal ? Math.max(0, Math.round(principal.getBoundingClientRect().left)) : 0);
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [aberto]);

  if (!aberto) return null;

  const valorNumero = parseCurrencyInput(campos.valor);
  const passaDoTeto = Boolean(teto) && campos.tipo !== 'PRAZO' && valorNumero > Number(teto.disponivel);
  // O backend informa se o contrato aceita aditivo (encerrado ou inativo nao aceita). A tela
  // obedece esse campo em vez de reimplementar a regra.
  const contratoAceita = teto ? teto.aceita_aditivo !== false : true;
  const ehVigencia = campos.tipo === 'VALOR_E_VIGENCIA' || campos.tipo === 'PRAZO';
  // Aditivo de PRAZO nao acrescenta dinheiro: o valor ja esta no contrato, parado numa parcela que
  // ninguem mediu. O campo Valor some, e o teto de 25% deixa de valer para ele.
  const soPrazo = campos.tipo === 'PRAZO';
  const qtdeParcelas = Number(campos.qtde_parcelas) || 0;
  const usaCronogramaManual = ehVigencia && Boolean(teto?.contrato?.fluxo_novo);
  const parcelasCronograma = Array.isArray(campos.parcelas) ? campos.parcelas : [];
  const parcelasExistentes = Number(teto?.parcelas_existentes || 0);
  const parcelasLivres = Number(teto?.parcelas_livres || 0);
  const parcelasComprometidas = Math.max(parcelasExistentes - parcelasLivres, 0);
  const maximoCronograma = soPrazo
    ? Math.max(24 - parcelasComprometidas, 0)
    : Math.max(24 - parcelasExistentes, 0);
  const totalCronogramaCent = paraCentavosCronograma(valorCronograma) || 0;
  const somaCronogramaCent = parcelasCronograma.reduce(
    (soma, parcela) => soma + (paraCentavosCronograma(parcela.valor) || 0),
    0
  );
  const cronogramaCompleto = parcelasCronograma.length >= 1
    && parcelasCronograma.length <= maximoCronograma
    && parcelasCronograma.every((parcela) => (
      paraCentavosCronograma(parcela.valor) > 0
      && /^\d{4}-\d{2}-\d{2}$/.test(String(parcela.vencimento || ''))
    ))
    && somaCronogramaCent === totalCronogramaCent;
  const dataMinimaVigencia = dataMinimaNovaVigencia(teto?.contrato);
  const erroNovaVigencia = ehVigencia ? mensagemNovaVigencia(campos.nova_vigencia_fim, teto?.contrato) : '';
  // No fluxo novo a pessoa monta o cronograma financeiro linha a linha. Em contratos legados,
  // preservamos o campo numerico antigo porque eles nao possuem `contrato_parcelas`.
  const vigenciaCompleta = !ehVigencia || (
    Boolean(campos.nova_vigencia_fim)
    && (usaCronogramaManual ? cronogramaCompleto : qtdeParcelas >= 1)
  );

  const podeEnviar = Boolean(teto)
    && contratoAceita
    && Boolean(campos.tipo)
    && vigenciaCompleta
    && !erroNovaVigencia
    && (soPrazo || valorNumero > 0)
    && String(campos.justificativa || '').trim().length > 0
    && Boolean(negociacaoArquivo)
    && !passaDoTeto
    && !enviando;

  const campo = (k) => (e) => setCampos((c) => ({ ...c, [k]: e.target.value }));

  function alterarTipo(e) {
    const tipo = e.target.value;
    setErro('');
    setCampos((atuais) => ({ ...atuais, tipo, parcelas: [], qtde_parcelas: '' }));
  }

  function selecionarNegociacao(e) {
    const arquivo = e.target.files?.[0] || null;
    if (arquivo && !/\.(pdf|docx)$/i.test(String(arquivo.name || ''))) {
      setErro('Envie a Negociacao Detalhada em formato .pdf ou .docx.');
      setNegociacaoArquivo(null);
      e.target.value = '';
      return;
    }
    setErro('');
    setNegociacaoArquivo(arquivo);
  }

  function adicionarParcela() {
    if (totalCronogramaCent <= 0) {
      setErro(soPrazo
        ? 'Nao ha saldo livre para distribuir neste aditivo de prazo.'
        : 'Informe o valor do aditivo antes de adicionar parcelas.');
      return;
    }
    setCampos((atuais) => {
      if (atuais.parcelas.length >= maximoCronograma) {
        setErro(`O contrato aceita no maximo mais ${maximoCronograma} parcela(s) neste cronograma.`);
        return atuais;
      }
      setErro('');
      const ultima = atuais.parcelas[atuais.parcelas.length - 1];
      const vencimentoBase = ultima?.vencimento || teto?.contrato?.ultima_parcela_vencimento;
      const nova = {
        numero: atuais.parcelas.length + 1,
        valor: 0,
        vencimento: proximoVencimento(vencimentoBase),
        travada: false
      };
      return {
        ...atuais,
        parcelas: redistribuirCronograma([...atuais.parcelas, nova], valorCronograma)
      };
    });
  }

  function editarValorParcela(numero, texto) {
    const digitos = String(texto || '').replace(/\D/g, '');
    const valor = digitos ? Number(digitos) / 100 : 0;
    setCampos((atuais) => {
      const editadas = atuais.parcelas.map((parcela) => (parcela.numero === numero
        ? { ...parcela, valor, travada: true }
        : parcela));
      return { ...atuais, parcelas: redistribuirCronograma(editadas, valorCronograma) };
    });
  }

  function editarVencimentoParcela(numero, vencimento) {
    setCampos((atuais) => ({
      ...atuais,
      parcelas: atuais.parcelas.map((parcela) => (parcela.numero === numero
        ? { ...parcela, vencimento }
        : parcela))
    }));
  }

  function removerParcela(numero) {
    setErro('');
    setCampos((atuais) => ({
      ...atuais,
      parcelas: redistribuirCronograma(
        atuais.parcelas
          .filter((parcela) => parcela.numero !== numero)
          .map((parcela, indice) => ({ ...parcela, numero: indice + 1 })),
        valorCronograma
      )
    }));
  }

  async function enviar() {
    if (!podeEnviar) return;
    setEnviando(true);
    setErro('');
    try {
      const r = await solicitarAditivoContrato(Number(contratoId), {
        tipo: campos.tipo,
        valor: soPrazo ? 0 : valorNumero,
        // Aditivo so de valor nao manda prazo nem quantidade: o prazo final nao mudou.
        nova_vigencia_fim: ehVigencia ? campos.nova_vigencia_fim : null,
        qtde_parcelas: ehVigencia
          ? (usaCronogramaManual ? parcelasCronograma.length : qtdeParcelas)
          : null,
        parcelas: usaCronogramaManual
          ? parcelasCronograma.map(({ numero, valor, vencimento }) => ({ numero, valor, vencimento }))
          : null,
        justificativa: String(campos.justificativa).trim(),
        responsavel_id: campos.responsavel_id ? Number(campos.responsavel_id) : null,
        negociacao_arquivo: negociacaoArquivo,
        // PI-16: no contrato LEGADO o aditivo abre uma solicitacao propria, e ela precisa de um
        // setor. No fluxo novo o backend ignora isto e usa a solicitacao que ja existe.
        area_responsavel: areaResponsavel || null
      }, { idempotencyKey: idempotencyKeyRef.current });
      onSolicitado?.(r);
      onFechar?.();
    } catch (e) {
      setErro(e.message || 'Erro ao solicitar aditivo.');
    } finally {
      setEnviando(false);
    }
  }

  const conteudo = (
    <div
      className="fixed inset-0 flex items-center justify-center py-6"
      style={{
        zIndex: 'var(--z-modal)',
        background: 'var(--modal-overlay, rgba(15, 23, 42, 0.48))',
        // O recuo do menu entra como padding: o overlay segue cobrindo tudo, mas a centralizacao
        // do flex passa a valer sobre a area de conteudo. Com o menu recolhido ou em gaveta o
        // recuo e zero e o modal volta a centralizar na viewport inteira, sozinho.
        paddingLeft: `calc(${recuoConteudo}px + 1rem)`,
        paddingRight: '1rem'
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Solicitar termo aditivo"
    >
      <div
        className="card overflow-hidden"
        data-testid="modal-aditivo"
        style={{
          width: 'min(100%, var(--modal-max-w-lg, 860px))',
          maxHeight: 'min(88vh, 920px)',
          display: 'flex',
          flexDirection: 'column',
          padding: 0
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--c-text)]">Solicitar termo aditivo</h3>
            {contratoRotulo && (
              <p className="mt-1 text-xs text-[var(--c-muted)]">{contratoRotulo}</p>
            )}
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onFechar} disabled={enviando}>Fechar</button>
        </div>

        {/* Corpo rolavel: em tela baixa o modal nao pode empurrar rodape para fora da viewport. */}
        <div className="space-y-3 overflow-y-auto px-4 py-4">
          {erro && <div className="app-alert app-alert--error">{erro}</div>}
          {carregando && <p className="text-sm text-[var(--c-muted)]">Carregando o limite do contrato...</p>}

          {teto && !contratoAceita && (
            <div className="app-alert app-alert--error">
              Este contrato esta encerrado ou inativo e não aceita termo aditivo.
            </div>
          )}

          {teto && (
            <div className="text-sm" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span><strong>Valor original:</strong> {moeda(teto.valor_original)}</span>
              {/* O teto e sobre o valor ORIGINAL e acumula os aditivos ja aprovados (PI-13). */}
              <span><strong>Limite de {teto.percentual_maximo}%:</strong> {moeda(teto.teto)}</span>
              <span><strong>Já aprovado:</strong> {moeda(teto.usado)}</span>
              <span><strong>Disponível:</strong> {moeda(teto.disponivel)}</span>
            </div>
          )}

          {teto && (
            <div
              className="text-sm"
              style={{
                borderTop: '1px solid var(--c-border)',
                borderBottom: '1px solid var(--c-border)',
                padding: '8px 0'
              }}
            >
              <strong>Vigência atual:</strong>{' '}
              <span style={{ color: 'var(--c-muted)' }}>{rotuloVigenciaAtual(teto.contrato)}</span>
            </div>
          )}

          {passaDoTeto && (
            <div className="app-alert app-alert--error">
              O valor do aditivo passa do limite disponível ({moeda(teto.disponivel)}).
            </div>
          )}

          {/* O TIPO vem primeiro porque e ele que decide quais campos importam abaixo — e o que a
              aprovacao vai fazer com o valor. Sem escolha, o botao nao libera. */}
          <fieldset className="text-sm" style={{ border: 0, padding: 0, margin: '0 0 8px' }}>
            <legend style={{ padding: 0, marginBottom: 4 }}>Este aditivo é de *</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="aditivo_tipo"
                  value="VALOR"
                  checked={campos.tipo === 'VALOR'}
                  onChange={alterarTipo}
                  disabled={!contratoAceita}
                />
                <span>Somente valor</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="aditivo_tipo"
                  value="VALOR_E_VIGENCIA"
                  checked={campos.tipo === 'VALOR_E_VIGENCIA'}
                  onChange={alterarTipo}
                  disabled={!contratoAceita}
                />
                <span>Valor e nova vigência</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="aditivo_tipo"
                  value="PRAZO"
                  checked={campos.tipo === 'PRAZO'}
                  onChange={alterarTipo}
                  disabled={!contratoAceita}
                />
                <span>Somente prazo</span>
              </label>
            </div>
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
              {campos.tipo === 'VALOR'
                ? 'O prazo final do contrato nao muda. O valor entra na ultima parcela ainda livre; se ela ja foi medida, nasce uma parcela nova com o mesmo vencimento da ultima.'
                : campos.tipo === 'VALOR_E_VIGENCIA'
                  ? 'Informe a nova vigência do serviço e monte o cronograma de pagamento. Os vencimentos são independentes e podem ocorrer depois da vigência.'
                  : campos.tipo === 'PRAZO'
                    ? 'Sem dinheiro novo: o saldo ainda não medido é redistribuído no cronograma informado. As datas de pagamento podem ultrapassar a nova vigência.'
                    : 'Escolha uma opção para definir se o aditivo altera valor, vigência ou ambos.'}
            </span>
          </fieldset>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {!soPrazo && (
              <label className="text-sm">Valor do aditivo *
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  name="aditivo_valor"
                  value={campos.valor}
                  onChange={(e) => setCampos((atuais) => ({
                    ...atuais,
                    valor: normalizeCurrencyTyping(e.target.value)
                  }))}
                  placeholder="R$ 0,00"
                  disabled={!contratoAceita}
                />
              </label>
            )}
            {/* A nova vigencia representa a execucao do servico. O cronograma financeiro fica
                separado logo abaixo e pode ultrapassar essa data. */}
            {ehVigencia && (
              <label className="text-sm">Prazo (nova vigência final) *
                <DateInputBR
                  className="input"
                  name="aditivo_nova_vigencia_fim"
                  value={campos.nova_vigencia_fim}
                  onChange={campo('nova_vigencia_fim')}
                  min={dataMinimaVigencia}
                  aria-invalid={Boolean(erroNovaVigencia)}
                  disabled={!contratoAceita}
                />
                {erroNovaVigencia ? (
                  <span className="text-xs" style={{ color: 'var(--c-danger, #b91c1c)' }}>
                    {erroNovaVigencia}
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
                    Data mínima: {formatarDataContrato(dataMinimaVigencia)}. Redução de prazo exige um fluxo específico.
                  </span>
                )}
              </label>
            )}
            {ehVigencia && !usaCronogramaManual && (
              <label className="text-sm">Parcelas a criar *
                <input
                  className="input"
                  type="number"
                  min="1"
                  step="1"
                  name="aditivo_qtde_parcelas"
                  value={campos.qtde_parcelas}
                  onChange={campo('qtde_parcelas')}
                  disabled={!contratoAceita}
                />
              </label>
            )}
            <label className="text-sm">Responsável
              <select
                className="input"
                name="aditivo_responsavel_id"
                value={campos.responsavel_id}
                onChange={campo('responsavel_id')}
                disabled={!contratoAceita}
              >
                <option value="">Selecione</option>
                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
              {usuarios.length === 0 && (
                <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
                  Nenhum usuário ativo esta vinculado a obra/centro de custo deste contrato.
                </span>
              )}
            </label>
          </div>

          {usaCronogramaManual && (
            <section
              className="space-y-2"
              aria-label="Cronograma financeiro do aditivo"
              style={{ borderTop: '1px solid var(--c-border)', paddingTop: 12 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Cronograma de pagamento *</div>
                  <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                    Distribuir {moeda(valorCronograma)} em até {maximoCronograma} parcela(s). As datas não limitam a vigência do serviço.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={adicionarParcela}
                  disabled={!contratoAceita || parcelasCronograma.length >= maximoCronograma}
                >
                  + Adicionar parcela
                </button>
              </div>

              {parcelasCronograma.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--c-muted)' }}>
                  Adicione as parcelas. O sistema distribui o valor automaticamente e permite ajustar cada valor e vencimento.
                </p>
              ) : (
                <div className="overflow-x-auto" style={{ border: '1px solid var(--c-border)', borderRadius: 10 }}>
                  <div
                    className="grid min-w-[560px] items-end gap-2 px-3 py-2 text-xs font-semibold uppercase"
                    style={{ gridTemplateColumns: '48px minmax(150px, 1fr) minmax(160px, 1fr) 92px', color: 'var(--c-muted)', background: 'var(--c-surface-soft, #f8fafc)' }}
                  >
                    <span>#</span><span>Valor</span><span>Vencimento</span><span>Ação</span>
                  </div>
                  {parcelasCronograma.map((parcela) => (
                    <div
                      key={parcela.numero}
                      className="grid min-w-[560px] items-center gap-2 border-t border-[var(--c-border)] px-3 py-2"
                      style={{ gridTemplateColumns: '48px minmax(150px, 1fr) minmax(160px, 1fr) 92px' }}
                    >
                      <strong className="text-sm">{parcela.numero}</strong>
                      <input
                        className="input input-sm"
                        type="text"
                        inputMode="numeric"
                        aria-label={`Valor da parcela ${parcela.numero}`}
                        value={moeda(parcela.valor)}
                        onChange={(e) => editarValorParcela(parcela.numero, e.target.value)}
                        disabled={!contratoAceita}
                      />
                      <DateInputBR
                        className="input input-sm"
                        aria-label={`Vencimento da parcela ${parcela.numero}`}
                        value={parcela.vencimento || ''}
                        onChange={(e) => editarVencimentoParcela(parcela.numero, e.target.value)}
                        disabled={!contratoAceita}
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => removerParcela(parcela.numero)}
                        disabled={!contratoAceita}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {parcelasCronograma.length > 0 && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                  <span>Total: <strong>{moeda(valorCronograma)}</strong></span>
                  <span>Distribuído: <strong>{moeda(somaCronogramaCent / 100)}</strong></span>
                  <span style={{ color: somaCronogramaCent === totalCronogramaCent ? 'var(--c-success, #047857)' : 'var(--c-danger, #b91c1c)' }}>
                    Diferença: <strong>{moeda((totalCronogramaCent - somaCronogramaCent) / 100)}</strong>
                  </span>
                </div>
              )}
            </section>
          )}

          <label className="block text-sm">
            Negociação Detalhada *
            <input
              className="input w-full"
              type="file"
              name="aditivo_negociacao_detalhada"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={selecionarNegociacao}
              required
              disabled={!contratoAceita || enviando}
            />
            <span className="mt-1 block text-xs text-[var(--c-muted)]">
              Anexe o documento negociado deste termo em PDF ou DOCX. Ele ficará disponível para a aprovação.
            </span>
          </label>

          <label className="block text-sm">Justificativa do aditivo *
            <textarea
              className="input"
              rows={3}
              name="aditivo_justificativa"
              value={campos.justificativa}
              onChange={campo('justificativa')}
              placeholder="Por que este aditivo e necessário"
              disabled={!contratoAceita}
            />
          </label>

          <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
            O aditivo entra como pendente: o valor só é somado ao contrato quando for aprovado.
          </p>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--c-border)] px-4 py-3">
          <button type="button" className="btn btn-outline btn-sm" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={enviar} disabled={!podeEnviar}>
            {enviando ? 'Enviando...' : 'Solicitar aditivo'}
          </button>
        </div>
      </div>
    </div>
  );

  // Sem `document` (SSR/teste fora do navegador) devolve nulo em vez de estourar.
  return typeof document === 'undefined' ? null : createPortal(conteudo, document.body);
}
