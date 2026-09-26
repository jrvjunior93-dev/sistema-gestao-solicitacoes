import { useEffect, useMemo, useState } from 'react';
import { getContratoParcelas, getFormasPagamentoMedicao } from '../../services/contratos';
import { buscarParceiros } from '../../services/parceiros';
import { TabelaPadrao } from '../padrao';
import { paraCentavosContrato } from './BlocoContratoFluxoNovo';
import { HiPaperClip } from 'react-icons/hi2';
import { chavePixPreferencial, formaPagamentoEhBoleto, formaPagamentoEhPix } from '../../utils/formaPagamento';
import DateInputBR from '../DateInputBR';
import CadastroRapidoFavorecidoButton from '../solicitacoes/CadastroRapidoFavorecidoButton';
import { useFecharAoSair } from '../../hooks/useFecharAoSair';

/**
 * Bloco de MEDICAO (wireframe 2), montado dentro da Nova Solicitacao quando o contrato
 * escolhido e do fluxo novo (MD-3). Contrato legado nao passa por aqui — a trilha antiga
 * continua exatamente como sempre foi (MD-5).
 *
 * O backend ja entrega tudo pronto em GET /contratos/:id/parcelas: saldo, comprometido, o
 * status REAL de cada linha (do titulo quando existe, da parcela quando ainda nao) e se a
 * linha aceita medicao. A tela projeta a mesma redistribuicao em cascata do backend apenas para
 * mostrar o resultado antes do envio; a regra definitiva continua sendo aplicada na transacao.
 *
 * Emite via onChange: { itens: [{ contrato_parcela_id, valor_medido, vencimento }], saldo }.
 */

const formatarMoeda = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Espelho visual de `redistribuirNasUltimas` / `aplicarMedicaoNasParcelas` do backend.
 *
 * A diferenca de uma parcela medida vai primeiro para a ultima parcela livre. Se ela nao tiver
 * saldo suficiente, o desconto segue em cascata para as anteriores. Parcelas de medicoes ja
 * criadas (`medivel === false`) nunca entram como destino. Esta funcao nao altera o payload nem
 * substitui a validacao transacional; ela so antecipa na tabela os valores que serao gravados.
 */
export function projetarValoresRedistribuidos(parcelas, selecao) {
  const trabalho = parcelas.map((parcela) => ({
    parcela,
    cent: paraCentavosContrato(parcela.valor),
    editavel: Boolean(parcela.editavel)
  }));
  const porId = new Map(trabalho.map((item) => [item.parcela.id, item]));
  const jaMedidas = new Set(
    parcelas.filter((parcela) => parcela.medivel === false).map((parcela) => parcela.id)
  );

  parcelas
    .filter((parcela) => selecao[parcela.id]?.marcada)
    .forEach((parcela) => {
      const alvo = porId.get(parcela.id);
      const medidoCent = paraCentavosContrato(selecao[parcela.id]?.valor ?? parcela.valor);
      if (!alvo || !Number.isFinite(medidoCent) || medidoCent <= 0) return;

      const diferencaCent = alvo.cent - medidoCent;
      const destinos = [...trabalho]
        .reverse()
        .filter((item) => item.editavel && item.parcela.id !== parcela.id && !jaMedidas.has(item.parcela.id));

      if (diferencaCent > 0) {
        // Devolucao sem destino vira saldo livre do contrato, como no backend.
        if (destinos[0]) destinos[0].cent += diferencaCent;
      } else if (diferencaCent < 0) {
        let faltaCent = -diferencaCent;
        for (const destino of destinos) {
          if (faltaCent <= 0) break;
          const disponivel = Math.min(destino.cent, faltaCent);
          destino.cent -= disponivel;
          faltaCent -= disponivel;
        }
      }

      alvo.cent = medidoCent;
    });

  return new Map(trabalho.map((item) => [item.parcela.id, item.cent / 100]));
}

export default function BlocoMedicaoContrato({
  contratoId,
  tipoSolicitacaoId,
  tipoSubId,
  areaResponsavel,
  onChange,
  // O periodo da medicao subiu para ca (pedido do cliente, 20/08): ele data a tabela de parcelas e
  // ficava solto no meio do formulario, longe dela. O ESTADO continua sendo o da Nova Solicitacao —
  // este bloco so recebe e devolve. Estado proprio faria a validacao de periodo (MD-8) conferir um
  // valor e o envio mandar outro.
  periodo = null,
  periodoObrigatorio = false,
  onPeriodoChange = null,
  boletoArquivo = null,
  onSelecionarBoleto = null,
  onRemoverBoleto = null
}) {
  // DADOS DE PAGAMENTO DA MEDICAO (itens 5 e 9 do lote de 23/08).
  //
  // O favorecido saiu da abertura do contrato e veio para ca: quem recebe pode mudar de uma medicao
  // para outra, e defini-lo la obrigava a acertar no comeco algo que so se sabe no fim.
  const [usarCredor, setUsarCredor] = useState(true);
  const [favorecido, setFavorecido] = useState(null);
  const [buscaFavorecido, setBuscaFavorecido] = useState('');
  const [resultadosFavorecido, setResultadosFavorecido] = useState([]);
  /*
    SÓ O ESC (06/09, decisão do cliente — D5).

    Esta lista é de resultado EM FLUXO: não cobre nada, empurra o
    formulário para baixo. Por isso ela NÃO recebe o fechamento por clique
    fora que as 35 camadas do sistema receberam. Medido o preço de
    converter por inteiro: clicar em outro campo do MESMO formulário
    passaria a sumir com a lista, no meio do preenchimento.

    Palavras do cliente: "o Esc dá saída sem esse risco".
  */
  useFecharAoSair(null, resultadosFavorecido.length > 0, () => setResultadosFavorecido([]), { apenasEsc: true });
  const [carregandoFavorecido, setCarregandoFavorecido] = useState(false);
  const [chavePix, setChavePix] = useState('');
  const [contato, setContato] = useState('');
  const [formaPagamentoId, setFormaPagamentoId] = useState('');
  const [formas, setFormas] = useState([]);
  const [confirmado, setConfirmado] = useState(false);

  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  // { [parcelaId]: { marcada, valor, vencimento } }
  const [selecao, setSelecao] = useState({});

  useEffect(() => {
    let cancelado = false;
    setSelecao({});
    setErro('');
    if (!contratoId) { setDados(null); return undefined; }

    setCarregando(true);
    getContratoParcelas(contratoId)
      .then((r) => { if (!cancelado) setDados(r); })
      .catch((e) => { if (!cancelado) { setDados(null); setErro(e.message || 'Erro ao carregar parcelas do contrato.'); } })
      .finally(() => { if (!cancelado) setCarregando(false); });

    return () => { cancelado = true; };
  }, [contratoId]);

  // As formas vem JA filtradas pela configuracao do superadmin: a tela nao decide o que mostrar.
  useEffect(() => {
    let cancelado = false;
    getFormasPagamentoMedicao()
      .then((r) => { if (!cancelado) setFormas(Array.isArray(r?.formas) ? r.formas : []); })
      .catch(() => { if (!cancelado) setFormas([]); });
    return () => { cancelado = true; };
  }, []);

  // O credor do contrato e o favorecido por padrao — e o caso comum, e repetir a busca a cada
  // medicao seria trabalho sem informacao nova.
  const credorDoContrato = dados?.contrato?.contratados?.[0] || null;
  const favorecidoEfetivo = usarCredor && credorDoContrato ? credorDoContrato : favorecido;
  const formaPagamentoSelecionada = formas.find((forma) => String(forma.id) === String(formaPagamentoId)) || null;
  const pagamentoViaPix = formaPagamentoEhPix(formaPagamentoSelecionada);
  const pagamentoViaBoleto = formaPagamentoEhBoleto(formaPagamentoSelecionada);

  const parcelas = dados?.parcelas || [];
  const saldo = dados?.saldo || null;

  // PI-11: a medicao segue a ordem de vencimento. A linha so libera quando todas as anteriores
  // (por vencimento) ja estao marcadas — assim o usuario nao monta uma selecao que o backend
  // vai recusar. A regra que vale continua sendo a do backend.
  const ordemPorVencimento = useMemo(() => [...parcelas]
    .filter((p) => p.medivel !== false && p.editavel)
    .sort((a, b) => (String(a.vencimento) < String(b.vencimento) ? -1
      : String(a.vencimento) > String(b.vencimento) ? 1 : a.numero - b.numero))
    .map((p) => p.id), [parcelas]);

  const liberadaParaMarcar = (parcelaId) => {
    const pos = ordemPorVencimento.indexOf(parcelaId);
    if (pos <= 0) return true;
    return ordemPorVencimento.slice(0, pos).every((id) => selecao[id]?.marcada);
  };

  // A linha fechada para medicao vinha esmaecida na <tr>; a TabelaPadrao nao
  // estiliza linha, entao o esmaecido acompanha o conteudo de cada celula.
  const atenuada = (p, conteudo) => (
    p.medivel === false || !p.editavel ? <span className="opacity-60">{conteudo}</span> : conteudo
  );

  const itens = useMemo(() => parcelas
    .filter((p) => selecao[p.id]?.marcada)
    .map((p) => ({
      contrato_parcela_id: p.id,
      valor_medido: selecao[p.id]?.valor ?? p.valor,
      vencimento: selecao[p.id]?.vencimento ?? p.vencimento
    })), [parcelas, selecao]);

  const valoresProjetados = useMemo(
    () => projetarValoresRedistribuidos(parcelas, selecao),
    [parcelas, selecao]
  );

  const totalSelecionadoCent = itens.reduce((acc, i) => {
    const c = paraCentavosContrato(i.valor_medido);
    return acc + (Number.isFinite(c) ? c : 0);
  }, 0);

  // Saldo restante mostrado em tempo real: e o numero que o cliente pediu para o usuario ver
  // ANTES de enviar (PI-6). O backend revalida — aqui e so para nao enviar no escuro.
  const saldoCent = saldo ? Math.round(Number(saldo.saldo) * 100) : 0;
  const excedeSaldo = totalSelecionadoCent > saldoCent;

  useEffect(() => {
    onChange?.({
      itens,
      excedeSaldo,
      saldo,
      // O aceite e os dados de pagamento sobem junto: o backend recusa a medicao sem eles.
      pagamento: {
        // Favorecido pertence a instrucao de pagamento inteira, nao apenas ao PIX. Boleto e
        // transferencia tambem precisam dizer a quem o Financeiro deve pagar.
        favorecido_id: favorecidoEfetivo?.id || null,
        favorecido_chave_pix: pagamentoViaPix ? chavePix : null,
        // Em PIX e o contato; nas demais formas sem documento proprio, guarda os dados bancarios
        // ou a instrucao que o Financeiro usara para pagar.
        favorecido_contato: contato || null,
        forma_pagamento_id: formaPagamentoId ? Number(formaPagamentoId) : null,
        boleto_anexo_nome: pagamentoViaBoleto ? (boletoArquivo?.nome || null) : null,
        via_pix: pagamentoViaPix,
        via_boleto: pagamentoViaBoleto,
        dados_confirmados: confirmado
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, excedeSaldo, usarCredor, favorecido, chavePix, contato, formaPagamentoId, confirmado, credorDoContrato, pagamentoViaPix, pagamentoViaBoleto, boletoArquivo]);

  // Autocomplete sem quantidade minima de caracteres. O pequeno debounce evita uma requisicao por
  // tecla sem obrigar o usuario a interromper a digitacao para clicar em "Buscar".
  useEffect(() => {
    const termo = buscaFavorecido.trim();
    if (!termo || (favorecido && termo === favorecido.nome) || (usarCredor && credorDoContrato)) {
      setResultadosFavorecido([]);
      setCarregandoFavorecido(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCarregandoFavorecido(true);
      try {
        // `q` e o parametro que o backend le; nao existe limite minimo de caracteres no servico.
        const achados = await buscarParceiros({ q: termo, limit: 10 }, { signal: controller.signal });
        setResultadosFavorecido(Array.isArray(achados) ? achados : []);
      } catch (error) {
        if (error?.name !== 'AbortError') setResultadosFavorecido([]);
      } finally {
        if (!controller.signal.aborted) setCarregandoFavorecido(false);
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [buscaFavorecido, favorecido, usarCredor, credorDoContrato]);

  function escolherFavorecido(p) {
    setFavorecido(p);
    setConfirmado(false);
    setResultadosFavorecido([]);
    setBuscaFavorecido(p.nome);
    // A chave vem preenchida do cadastro quando existir, e continua editavel: e ela que sera
    // COPIADA para a medicao, e a do cadastro pode mudar depois.
    setChavePix(p.chave_pix_selecionada || chavePixPreferencial(p));
  }

  function alternar(parcela) {
    setSelecao((s) => {
      const atual = s[parcela.id];
      if (atual?.marcada) return { ...s, [parcela.id]: { ...atual, marcada: false } };
      return { ...s, [parcela.id]: { marcada: true, valor: parcela.valor, vencimento: parcela.vencimento } };
    });
  }

  function alterar(parcelaId, campo, valor) {
    setSelecao((s) => ({ ...s, [parcelaId]: { ...(s[parcelaId] || {}), marcada: true, [campo]: valor } }));
  }

  if (!contratoId) return null;

  return (
    <div className="card mt-3 min-w-0 space-y-4 overflow-hidden">
      <div className="text-sm font-bold">Medição — títulos do contrato</div>

      {periodo && onPeriodoChange && (
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-sm">
            Data inicial (Medição)
            <DateInputBR
              name="data_inicio_medicao"
              className="input input-sm w-full min-w-0"
              value={periodo.inicio || ''}
              onChange={onPeriodoChange}
              required={periodoObrigatorio}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm">
            Data final (Medição)
            <DateInputBR
              name="data_fim_medicao"
              className="input input-sm w-full min-w-0"
              value={periodo.fim || ''}
              onChange={onPeriodoChange}
              required={periodoObrigatorio}
            />
          </label>
        </div>
      )}

      {carregando && <p className="text-xs" style={{ color: 'var(--c-muted)' }}>Carregando parcelas do contrato...</p>}
      {erro && <div className="app-alert app-alert--error">{erro}</div>}

      {saldo && (
        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-sm">
          <span><strong>Valor do contrato:</strong> {formatarMoeda(saldo.valor_contrato)}</span>
          {/* Comprometido conta medicao ja solicitada, mesmo sem pagamento (PI-6). */}
          <span><strong>Já comprometido:</strong> {formatarMoeda(saldo.comprometido)}</span>
          <span><strong>Saldo:</strong> {formatarMoeda(saldo.saldo)}</span>
          {totalSelecionadoCent > 0 && (
            <span style={{ color: excedeSaldo ? 'var(--c-danger, #b00020)' : 'inherit' }}>
              <strong>Nesta medição:</strong> {formatarMoeda(totalSelecionadoCent / 100)}
              {' · '}
              <strong>Saldo após:</strong> {formatarMoeda((saldoCent - totalSelecionadoCent) / 100)}
            </span>
          )}
        </div>
      )}

      {excedeSaldo && (
        <div className="app-alert app-alert--error">
          O total selecionado passa do saldo do contrato.
        </div>
      )}

      {!carregando && parcelas.length === 0 && !erro && (
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Este contrato não possui parcelas para medir.
        </p>
      )}

      {parcelas.length > 0 && (
        <TabelaPadrao
          colunas={[
            {
              id: 'selecao',
              // TRAVADA (05/09): marcar, valor e vencimento SAO a medicao. Sem elas a
              // tabela vira extrato e nao sobra caminho para medir a parcela.
              sempreVisivel: true,
              titulo: 'Medir',
              tipo: 'badge',
              // `medivel` e nao `editavel`: parcela ja medida segue com o titulo ABERTO ate o
              // pagamento, entao `editavel` continua verdadeiro nela — e o checkbox ficava liberado
              // para medir a mesma parcela de novo.
              render: (p) => (
                <input
                  type="checkbox"
                  checked={Boolean(selecao[p.id]?.marcada)}
                  // Quitado e parcialmente pago ficam fechados: o saldo ja foi
                  // redistribuido no pagamento (PI-7).
                  disabled={!p.editavel || p.medivel === false || (!selecao[p.id]?.marcada && !liberadaParaMarcar(p.id))}
                  title={p.medivel === false
                    ? `Já medida${p.medicao ? ` na medição ${p.medicao.numero}` : ''}: para corrigir o valor, altere aquela medição`
                    : (!p.editavel
                      ? `Parcela ${p.status}: fechada para medição`
                      : (!selecao[p.id]?.marcada && !liberadaParaMarcar(p.id)
                        ? 'Solicite primeiro as parcelas de vencimento anterior'
                        : ''))}
                  onChange={() => alternar(p)}
                />
              )
            },
            {
              id: 'numero',
              titulo: 'Parcela',
              tipo: 'numero',
              noCard: 'titulo',
              render: (p) => atenuada(p, p.numero)
            },
            {
              id: 'valor',
              sempreVisivel: true,
              titulo: 'Valor',
              tipo: 'valor',
              render: (p) => {
                const sel = selecao[p.id] || {};
                const valorProjetado = valoresProjetados.get(p.id) ?? p.valor;
                const foiReajustadaNaProjecao = !sel.marcada
                  && paraCentavosContrato(valorProjetado) !== paraCentavosContrato(p.valor);
                return atenuada(p, (
                  <>
                    <input
                      className="input input-sm w-full min-w-0" type="number" step="0.01"
                      value={sel.valor ?? valorProjetado}
                      disabled={!p.editavel || p.medivel === false || !sel.marcada}
                      onChange={(e) => alterar(p.id, 'valor', e.target.value)}
                    />
                    {foiReajustadaNaProjecao && (
                      <span className="text-xs" style={{ display: 'block', color: 'var(--c-primary)' }}>
                        reajustado nesta medição
                      </span>
                    )}
                  </>
                ));
              }
            },
            {
              id: 'vencimento',
              sempreVisivel: true,
              titulo: 'Vencimento',
              tipo: 'data',
              render: (p) => {
                const sel = selecao[p.id] || {};
                return atenuada(p, (
                  <DateInputBR
                    className="input input-sm w-full min-w-0"
                    name={`vencimento_parcela_${p.id}`}
                    value={sel.vencimento ?? p.vencimento ?? ''}
                    disabled={!p.editavel || p.medivel === false || !sel.marcada}
                    onChange={(e) => alterar(p.id, 'vencimento', e.target.value)}
                  />
                ));
              }
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (p) => atenuada(p, (
                <>
                  {p.status}
                  {/* Sem esta marca, a linha desabilitada so ficaria acinzentada e a pessoa
                      precisaria passar o mouse por cima para descobrir o motivo. */}
                  {p.medivel === false && (
                    <span className="text-xs" style={{ display: 'block', color: 'var(--c-muted)' }}>
                      já medida{p.medicao ? ` (medição ${p.medicao.numero})` : ''}
                    </span>
                  )}
                </>
              ))
            },
            {
              id: 'previsto',
              titulo: 'Previsto',
              tipo: 'valor',
              // Referencia da auditoria: previsto na criacao x solicitado (PI-5).
              render: (p) => atenuada(p, (
                <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
                  {p.valor_previsto === null ? '-' : formatarMoeda(p.valor_previsto)}
                </span>
              ))
            }
          ]}
          itens={parcelas}
          getId={(p) => p.id}
          storageKey="tabela:contrato-medicao:parcelas"
          rotuloRolagem="Parcelas do contrato para medicao"
          vazio="Este contrato não possui parcelas para medir."
          larguraMaximaParaCards={1023}
          rotuloRegistro="parcela"
          /* R17: linha de parcela — numero, valor, vencimento e status; nao ha
             nome de registro, a parcela e identificada pelo numero. */
          semIdentidade
        />
      )}

      {/* A forma vem PRIMEIRO e governa os campos condicionais. O favorecido vale para TODAS as
          formas; PIX acrescenta a chave e boleto acrescenta o arquivo. */}
      <div className="space-y-2" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 12 }}>
        <div className="text-xs" style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
          Pagamento desta medição
        </div>

        <label className="grid min-w-0 max-w-md gap-1 text-sm">
          Forma de pagamento *
          <select
            className="input input-sm w-full min-w-0"
            name="forma_pagamento_medicao"
            value={formaPagamentoId}
            onChange={(e) => {
              const proximoId = e.target.value;
              const proximaForma = formas.find((forma) => String(forma.id) === String(proximoId)) || null;
              setFormaPagamentoId(proximoId);
              setConfirmado(false);
              setContato('');
              if (formaPagamentoEhPix(proximaForma) && usarCredor) {
                setChavePix(chavePixPreferencial(credorDoContrato));
              }
              if (!formaPagamentoEhBoleto(proximaForma)) onRemoverBoleto?.();
            }}
          >
            <option value="">Selecione</option>
            {formas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </label>

        {formaPagamentoId && (
          <div className="space-y-2" data-testid="pagamento-medicao-favorecido">
            <label className="flex min-w-0 items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="favorecido_e_credor"
                checked={usarCredor && Boolean(credorDoContrato)}
                disabled={!credorDoContrato}
                onChange={(e) => {
                  setUsarCredor(e.target.checked);
                  setConfirmado(false);
                  if (e.target.checked) {
                    setFavorecido(null);
                    setBuscaFavorecido('');
                    setChavePix(chavePixPreferencial(credorDoContrato));
                  } else {
                    setChavePix('');
                  }
                }}
              />
              <span className="min-w-0 break-words">O favorecido e o proprio credor do contrato{credorDoContrato ? ` (${credorDoContrato.nome})` : ''}</span>
            </label>

            {(!usarCredor || !credorDoContrato) && (
              <div className="space-y-2">
                <div className="flex min-w-0 gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      className="input input-sm w-full min-w-0"
                      name="busca_favorecido"
                      placeholder="Buscar por nome, telefone, CPF/CNPJ ou PIX"
                      value={buscaFavorecido}
                      autoComplete="off"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={resultadosFavorecido.length > 0}
                      aria-controls="resultados-favorecido-medicao"
                      onChange={(e) => {
                        setBuscaFavorecido(e.target.value);
                        setFavorecido(null);
                        setConfirmado(false);
                      }}
                    />
                  </div>
                  <CadastroRapidoFavorecidoButton
                    tipoSolicitacaoId={tipoSolicitacaoId}
                    tipoSubId={tipoSubId}
                    areaResponsavel={areaResponsavel}
                    onCadastrado={escolherFavorecido}
                  />
                </div>
                {carregandoFavorecido && (
                  <p className="text-xs" style={{ color: 'var(--c-muted)' }}>Buscando favorecidos...</p>
                )}
                {resultadosFavorecido.length > 0 && (
                  <div
                    id="resultados-favorecido-medicao"
                    role="listbox"
                    className="max-h-40 overflow-auto rounded border bg-[var(--c-surface)] p-1"
                  >
                    {resultadosFavorecido.map((p) => (
                      <button key={p.id} type="button" role="option" aria-selected={false}
                        className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--ui-surface-soft)]"
                        onClick={() => escolherFavorecido(p)}>
                        {p.nome}{(p.cpf_cnpj || p.telefone || p.pix_chave_fixa_1 || p.pix_chave_fixa_2 || p.pix_chave_variavel)
                          ? ` — ${p.cpf_cnpj || p.telefone || p.pix_chave_fixa_1 || p.pix_chave_fixa_2 || p.pix_chave_variavel}`
                          : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!favorecidoEfetivo && (
              <p className="text-xs" style={{ color: 'var(--c-danger, #b00020)' }}>
                Selecione o favorecido desta medição.
              </p>
            )}

            {pagamentoViaPix && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="pagamento-medicao-pix">
                <label className="grid gap-1 text-sm">
                  Chave PIX do favorecido *
                  <input
                    className="input input-sm w-full min-w-0"
                    name="favorecido_chave_pix"
                    value={chavePix}
                    onChange={(e) => { setChavePix(e.target.value); setConfirmado(false); }}
                    placeholder="Chave para o pagamento"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Contato do favorecido
                  <input
                    className="input input-sm w-full min-w-0"
                    name="favorecido_contato"
                    value={contato}
                    onChange={(e) => { setContato(e.target.value); setConfirmado(false); }}
                    placeholder="Telefone, e-mail, quem procurar"
                  />
                </label>
              </div>
            )}

            {!pagamentoViaPix && !pagamentoViaBoleto && (
              <label className="grid min-w-0 max-w-2xl gap-1 text-sm" data-testid="pagamento-medicao-dados">
                Dados para pagamento *
                <textarea
                  className="input input-sm w-full min-w-0"
                  name="favorecido_dados_pagamento"
                  rows={2}
                  maxLength={180}
                  value={contato}
                  onChange={(e) => { setContato(e.target.value); setConfirmado(false); }}
                  placeholder="Ex.: banco, agência, conta, tipo de conta ou outra instrucao necessária"
                />
              </label>
            )}
          </div>
        )}

        {pagamentoViaBoleto && (
          <div className="grid max-w-xl gap-1 text-sm" data-testid="pagamento-medicao-boleto">
            <span>Boleto *</span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn btn-outline btn-sm inline-flex cursor-pointer items-center gap-2">
                <HiPaperClip className="h-4 w-4" />
                <span>Selecionar boleto</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(e) => {
                    onSelecionarBoleto?.(e.target.files);
                    e.target.value = '';
                    setConfirmado(false);
                  }}
                />
              </label>
              <span className="text-xs text-[var(--c-muted)]">
                {boletoArquivo?.nome || 'Nenhum boleto selecionado'}
              </span>
              {boletoArquivo && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { onRemoverBoleto?.(); setConfirmado(false); }}>
                  Remover
                </button>
              )}
            </div>
          </div>
        )}

        {/* O aceite e uma DECLARACAO: o sistema guarda quem confirmou e quando. Por isso ele cai
            sozinho sempre que um dos dados de pagamento muda — confirmar e depois alterar deixaria
            uma confirmacao que nao se refere ao que sera pago. */}
        {formaPagamentoId && (
          <label className="flex min-w-0 items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="dados_pagamento_confirmados"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
            />
            <span className="min-w-0 break-words">Confirmo que os dados de pagamento acima estão corretos *</span>
          </label>
        )}
      </div>
    </div>
  );
}
