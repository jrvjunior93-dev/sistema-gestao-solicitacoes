import { useEffect, useRef, useState } from 'react';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  TabelaPadrao,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import { formatCurrencyBRL } from '../utils/formatters';
import { getMinhasObras } from '../services/obras';
import { getContratoObraCategorias, getApropriacoesDaObra } from '../services/configuracoesSistema';
import { criarContratoFluxoNovo, aprovarContratoFluxoNovo, rejeitarContratoFluxoNovo } from '../services/contratos';
import { buscarParceiros } from '../services/parceiros';
import { useFecharAoSair } from '../hooks/useFecharAoSair';
import DateInputBR from '../components/DateInputBR';
import ApropriacaoAutocomplete from '../components/ui/ApropriacaoAutocomplete';

/**
 * Criacao de contrato do fluxo novo (wireframe 1).
 *
 * Tela propria, fora da NovaSolicitacao monolitica que atende o fluxo antigo em producao.
 * A previa de parcelas e o saldo ESPELHAM as regras do backend (centavos inteiros, sobra na
 * ultima, redistribuicao nas ultimas) — o backend continua sendo a fonte da verdade e
 * revalida tudo na gravacao.
 */

const LIMITE_DETALHES = 50000;

// Para onde a seta do cabecalho devolve (R11/C3): a listagem de onde os contratos vivem.
const CAMINHO_GESTAO_CONTRATOS = '/gestao-contratos';

// O status do backend em texto de gente — o `StatusBadge` imprime o que recebe, e
// AGUARDANDO_APROVACAO com sublinhado nao e rotulo. "Aprovado" para ATIVO preserva o
// que a tela ja dizia antes da reforma.
const ROTULO_STATUS_CONTRATO = {
  AGUARDANDO_APROVACAO: 'Aguardando aprovacao',
  ATIVO: 'Aprovado',
  REJEITADO: 'Rejeitado'
};

// Conversao por DIGITOS, igual ao backend: toFixed arredonda o binario e divergia do
// DECIMAL do MySQL (8333.335 -> tela 8333,33 x banco 8333,34 — F2 da auditoria).
function paraCentavos(v) {
  const texto = String(v ?? '').trim();
  if (!texto || !Number.isFinite(Number(texto))) return NaN;
  const neg = texto.startsWith('-');
  const [i = '0', f = ''] = texto.replace(/^[-+]/, '').split('.');
  let cent = parseInt(i || '0', 10) * 100 + parseInt((f + '00').slice(0, 2), 10);
  if (f.length > 2 && Number(f[2]) >= 5) cent += 1;
  return neg ? -cent : cent;
}

function gerarPrevia(valorTotal, qtde, primeiroVencimento) {
  const total = paraCentavos(valorTotal);
  const n = Number(qtde);
  if (!Number.isFinite(total) || total <= 0 || !Number.isInteger(n) || n < 1 || !primeiroVencimento) return [];
  const base = Math.floor(total / n);
  const sobra = total - base * n;
  const [ano, mes, dia] = primeiroVencimento.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const alvo = new Date(ano, mes - 1 + i, 1);
    const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    alvo.setDate(Math.min(dia, ultimo));
    return {
      numero: i + 1,
      valor: (i === n - 1 ? base + sobra : base) / 100,
      vencimento: `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')}`
    };
  });
}

export default function ContratoFluxoNovo() {
  const [obras, setObras] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [apropriacoesObra, setApropriacoesObra] = useState([]);
  const [form, setForm] = useState({
    obra_id: '', parceiro_id: '', ref_contrato: '', objeto: '', detalhes_contratacao: '',
    valor_total: '', qtde_parcelas: '', primeiro_vencimento: '', categoria_financeira_id: '',
    forma_pagamento_id: '2', apropriacao_id: ''
  });
  const [parcelas, setParcelas] = useState([]);
  const [credorBusca, setCredorBusca] = useState('');
  const [credorResultados, setCredorResultados] = useState([]);
  const [credorNome, setCredorNome] = useState('');
  /*
    A LISTA DE CREDORES NÃO FECHAVA DE JEITO NENHUM (05/09).

    Não havia estado de aberta: a camada existia enquanto
    `credorResultados` tivesse itens, e essa lista só era esvaziada ao
    ESCOLHER um credor ou ao digitar menos de dois caracteres. Como é
    `absolute z-dropdown`, ficava pousada sobre "Referência" e "Categoria
    financeira" logo abaixo. Clicar fora não fazia nada; `Esc` não fazia
    nada.

    Agora existe `listaCredorAberta`: digitar ou focar o campo abre,
    clicar fora e `Esc` fecham — sem apagar o termo buscado.

    PROTEÇÃO DA SELEÇÃO, e esta tela não tinha nenhuma: o hook fecha no
    `mousedown` e o `onClick` da opção só dispara no `mouseup`. O ref
    envolve o campo E a lista (clique na opção é DENTRO, o hook não
    fecha), e a opção ganhou `onMouseDown` com `preventDefault` para o
    foco não sair do campo antes do `onClick`. Sem as duas coisas o
    clique morreria no meio e o credor nunca seria escolhido.
  */
  const listaCredorRef = useRef(null);
  const [listaCredorAberta, setListaCredorAberta] = useState(false);
  useFecharAoSair(listaCredorRef, listaCredorAberta, () => setListaCredorAberta(false));
  const [contratoCriado, setContratoCriado] = useState(null);
  const [salvando, setSalvando] = useState(false);

  // R3/R19 — erro e sucesso na faixa do sistema, dentro da pagina, com o tom
  // semantico e fechavel pelo usuario. Nada de caixa do navegador.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  useEffect(() => {
    (async () => {
      setObras(await getMinhasObras({ modo: 'CRIACAO', escopo: 'TODOS' }).catch(() => []));
      const cfg = await getContratoObraCategorias().catch(() => null);
      const permitidas = new Set((cfg?.categoria_ids || []).map(Number));
      setCategorias((cfg?.categorias_disponiveis || []).filter((c) => permitidas.has(Number(c.id))));
    })();
  }, []);

  useEffect(() => {
    if (!form.obra_id) { setApropriacoesObra([]); return; }
    getApropriacoesDaObra(form.obra_id).then((d) => setApropriacoesObra(d?.apropriacoes || [])).catch(() => setApropriacoesObra([]));
  }, [form.obra_id]);

  // Previa regenerada quando valor/qtde/vencimento mudam.
  useEffect(() => {
    setParcelas(gerarPrevia(form.valor_total, form.qtde_parcelas, form.primeiro_vencimento));
  }, [form.valor_total, form.qtde_parcelas, form.primeiro_vencimento]);

  const totalCent = paraCentavos(form.valor_total) || 0;
  const somaParcelasCent = parcelas.reduce((a, p) => a + paraCentavos(p.valor), 0);
  // Saldo em tempo real: o que do valor do contrato ainda nao esta coberto pelas parcelas.
  const saldoCent = totalCent - somaParcelasCent;

  function editarParcela(numero, novoValor) {
    // Redistribui nas ULTIMAS (espelha o backend): diferenca vai para a ultima parcela
    // livre e retrocede se consumi-la. Total do contrato nunca muda.
    const novoCent = paraCentavos(novoValor);
    if (!Number.isFinite(novoCent) || novoCent < 0) return;
    const lista = parcelas.map((p) => ({ ...p, cent: paraCentavos(p.valor) }));
    const alvo = lista.find((p) => p.numero === numero);
    if (!alvo) return;
    let diferenca = novoCent - alvo.cent;
    alvo.cent = novoCent;
    for (const p of [...lista].sort((a, b) => b.numero - a.numero)) {
      if (diferenca === 0) break;
      if (p.numero === numero) continue;
      if (diferenca > 0) { const c = Math.min(p.cent, diferenca); p.cent -= c; diferenca -= c; }
      else { p.cent += -diferenca; diferenca = 0; }
    }
    if (diferenca !== 0) {
      avisar.erro(
        `A parcela ${numero} nao cabe: o valor excede o saldo do contrato (${formatCurrencyBRL(totalCent / 100)}). `
        + 'Reduza o valor desta parcela ou aumente o valor total do contrato.',
        'Valor acima do total do contrato'
      );
      return;
    }
    setParcelas(lista.map(({ cent, ...p }) => ({ ...p, valor: cent / 100 })));
  }

  async function salvar() {
    setSalvando(true); setContratoCriado(null);
    try {
      const r = await criarContratoFluxoNovo({
        obra_id: Number(form.obra_id),
        parceiro_id: Number(form.parceiro_id),
        ref_contrato: form.ref_contrato,
        objeto: form.objeto,
        detalhes_contratacao: form.detalhes_contratacao,
        valor_total: Number(form.valor_total),
        qtde_parcelas: Number(form.qtde_parcelas),
        // A lista da tela (inclusive edicoes com redistribuicao) e o que o backend grava;
        // ele valida soma exata e quantidade — nunca regenera em silencio (F1).
        parcelas: parcelas.map((p) => ({ numero: p.numero, valor: p.valor, vencimento: p.vencimento })),
        primeiro_vencimento: form.primeiro_vencimento,
        categoria_financeira_id: Number(form.categoria_financeira_id),
        forma_pagamento_id: Number(form.forma_pagamento_id),
        apropriacoes: [{ apropriacao_id: Number(form.apropriacao_id), percentual: 100 }]
      });
      setContratoCriado(r.contrato);
    } catch (e) {
      avisar.erro(
        `${e?.message || 'Falha ao falar com o servidor.'} O contrato NAO foi criado — o que voce digitou continua na tela. `
        + 'Corrija o que a mensagem aponta e clique de novo em criar; nao recarregue a pagina.',
        'Nao foi possivel criar o contrato'
      );
    } finally { setSalvando(false); }
  }

  async function aprovar() {
    // R26 — o contrato e FIXADO antes do `await`: a tela segue montada e clicavel
    // enquanto a requisicao corre, e ler `contratoCriado` de novo depois dela faria a
    // mensagem nomear um contrato e a acao ter tocado outro. (Aqui nao ha confirmacao:
    // aprovar segue o fluxo e nao destroi nada — a rejeicao, sim, confirma e pede motivo.)
    const contrato = contratoCriado;
    if (!contrato) return;
    try {
      const r = await aprovarContratoFluxoNovo(contrato.id);
      setContratoCriado({ ...contrato, status_contrato: r.contrato.status_contrato });
      avisar.sucesso(
        `Contrato ${contrato.codigo} aprovado. As parcelas previstas passam a valer no financeiro.`,
        'Contrato aprovado'
      );
    } catch (e) {
      avisar.erro(
        `${e?.message || 'Falha ao falar com o servidor.'} O contrato ${contrato.codigo} continua aguardando aprovacao.`,
        'Nao foi possivel aprovar'
      );
    }
  }

  async function rejeitar() {
    /*
      R19/R3 — era `window.prompt('Motivo da rejeicao:')`: a caixa do Chrome,
      que ignora tema e tokens, nao existe no DOM e some sem rastro. O
      substituto do sistema para "confirmar PEDINDO UM TEXTO" e o `campo` do
      `useConfirmacao`, que devolve o texto junto com o `ok`.

      R21 — o retorno e OBJETO e vai DESESTRUTURADO. `const ok = await
      confirmar(...)` compila, roda, e faz o "Cancelar" seguir com a acao,
      porque objeto e sempre truthy.

      R26 — o contrato e fixado numa `const` ANTES do `await`, e a acao usa
      essa `const`. Com o `prompt` a pagina ficava bloqueada e nada podia
      mudar entre a pergunta e a acao; com o modal do sistema a tela segue
      montada e clicavel, e reler o estado depois do `await` faria a tela
      perguntar sobre um contrato e rejeitar outro.

      O texto diz QUAL contrato e o que acontece depois: pelo backend
      (`rejeitarContrato`), rejeitar NAO e terminal — as parcelas em previsao
      passam a REJEITADA, a solicitacao volta como PENDENTE DE AJUSTE e o
      motivo fica registrado no historico do contrato.
    */
    const contrato = contratoCriado;
    if (!contrato) return;
    const { ok, texto } = await confirmar({
      titulo: 'Rejeitar contrato',
      mensagem: `Rejeitar o contrato ${contrato.codigo}? As parcelas em previsao passam a rejeitadas e a `
        + 'solicitacao volta para ajuste — o contrato nao e excluido, e o motivo fica no historico dele.',
      campo: { rotulo: 'Motivo da rejeição', obrigatorio: true, multilinha: true },
      rotuloConfirmar: 'Rejeitar contrato',
      rotuloCancelar: 'Manter aguardando aprovacao',
      destrutiva: true
    });
    if (!ok) return;
    try {
      const r = await rejeitarContratoFluxoNovo(contrato.id, String(texto || '').trim());
      setContratoCriado({ ...contrato, status_contrato: r.contrato.status_contrato });
      // O numero vem da RESPOSTA do servidor, nunca de uma contagem paralela da tela.
      const rejeitadas = Number(r.parcelas_rejeitadas || 0);
      avisar.sucesso(
        `Contrato ${contrato.codigo} rejeitado e devolvido para ajuste`
        + (rejeitadas ? `; ${rejeitadas} parcela(s) em previsao foram rejeitadas.` : '.'),
        'Contrato devolvido para ajuste'
      );
    } catch (e) {
      avisar.erro(
        `${e?.message || 'Falha ao falar com o servidor.'} O contrato ${contrato.codigo} continua aguardando aprovacao.`,
        'Nao foi possivel rejeitar'
      );
    }
  }

  const campo = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const exigeDetalhes = Number(form.valor_total) > LIMITE_DETALHES;
  const aguardandoAprovacao = contratoCriado?.status_contrato === 'AGUARDANDO_APROVACAO';

  /*
    ESTRUTURA DA TELA (reforma 05/09).

    Antes: `div.page.solicitacoes-page` cru, sem faixa fixa nenhuma (R13/C1) —
    ao rolar a previa de parcelas, o unico botao "Criar contrato" saia da tela;
    `<h1 class="page-title">` com um `<p>` de apoio solto embaixo, colorido por
    style inline (R5/C2); rotulo como texto solto dentro do `<label>` (R7); e
    medidas em px escritas a mao (R10).

    Agora: `Pagina` (ritmo vertical e posicao da faixa fixa), `PageHeader`
    (faixa fixa R13, apoio na prop `descricao` R5, seta de voltar R11/C3 e a
    acao principal na faixa, que e o que a mantem a um clique em pagina longa),
    `BlocoConteudo` primario com a cor do modulo de contratos, `FormSecao` +
    `CampoForm` (R7: mesma altura, rotulo sempre acima do campo) e
    `.input-moeda` em todo campo de dinheiro (R6).
  */
  return (
    <Pagina>
      <PageHeader
        titulo="Novo contrato"
        descricao="O contrato e criado aguardando aprovação; as parcelas so entram no financeiro quando aprovado."
        voltar={{ to: CAMINHO_GESTAO_CONTRATOS, title: 'Voltar para a gestao de contratos' }}
        acaoPrincipal={{
          rotulo: salvando ? 'Criando...' : 'Criar contrato',
          onClick: salvar,
          desabilitada: salvando
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {contratoCriado && (
        /* B5: o resultado tem superficie propria, e o codigo do contrato e o
           titulo do bloco — numero sem contexto era o que o `app-alert` dava. */
        <BlocoConteudo
          titulo={`Contrato ${contratoCriado.codigo}`}
          descricao="Criado por este formulário."
          acoes={(
            <StatusBadge
              status={ROTULO_STATUS_CONTRATO[contratoCriado.status_contrato] || contratoCriado.status_contrato}
            />
          )}
        >
          {aguardandoAprovacao ? (
            <>
              <p className="app-note">
                As parcelas ficam em previsão até a aprovação. Rejeitar devolve o contrato para
                ajuste — nao o exclui.
              </p>
              {/* C5: primario solido para a acao que segue o fluxo; a destrutiva
                  em vermelho suave e APARTADA. */}
              <div className="app-actionbar">
                <button type="button" className="btn btn-primary" onClick={aprovar}>
                  Aprovar
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-perigo-suave app-actionbar-apartada"
                  onClick={rejeitar}
                >
                  Rejeitar
                </button>
              </div>
            </>
          ) : (
            <p className="app-note">
              {contratoCriado.status_contrato === 'ATIVO'
                ? 'Contrato aprovado: as parcelas valem no financeiro.'
                : 'Contrato rejeitado e devolvido para ajuste. O motivo esta no historico do contrato.'}
            </p>
          )}
        </BlocoConteudo>
      )}

      <BlocoConteudo
        variante="primario"
        cor="var(--module-contratos)"
        descricao="Acima do limite do Jurídico a negociação detalhada e obrigatória e vira documento anexado depois da criação."
      >
        <FormSecao legenda="Identificação do contrato" colunas={3}>
          <CampoForm label="Obra" obrigatorio>
            <select className="input w-full" value={form.obra_id} onChange={campo('obra_id')}>
              <option value="">Selecione</option>
              {obras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </CampoForm>

          {/*
            Campo COMPOSTO (entrada + lista de resultados). Usa as classes do
            CampoForm mas num `div`, nao num `label`: o `CampoForm` sempre
            envolve num `<label>`, e um `<label>` em volta de varios controles
            rouba o clique dos botoes para o primeiro campo. Mesma lacuna ja
            registrada na FinanceiroTituloNovo — R21: nao se muda o contrato do
            componente padrao por causa de uma tela.
          */}
          <div className="form-group">
            <span className="form-label form-label--required">Credor</span>
            <div className="relative" ref={listaCredorRef}>
              <input
                className="input w-full"
                value={credorNome || credorBusca}
                placeholder="Digite para buscar"
                onFocus={() => setListaCredorAberta(true)}
                onChange={async (e) => {
                  setListaCredorAberta(true);
                  const termo = e.target.value;
                  setCredorNome(''); setCredorBusca(termo);
                  setForm((f) => ({ ...f, parceiro_id: '' }));
                  if (termo.length < 2) { setCredorResultados([]); return; }
                  const r = await buscarParceiros({ q: termo }).catch(() => []);
                  setCredorResultados((Array.isArray(r) ? r : r?.parceiros || []).slice(0, 8));
                }}
              />
              {listaCredorAberta && credorResultados.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-dropdown mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-1 shadow-lg">
                  {credorResultados.map((pRes) => (
                    <button
                      key={pRes.id}
                      type="button"
                      className="btn btn-outline btn-sm mb-1 block w-full text-left"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setForm((f) => ({ ...f, parceiro_id: pRes.id }));
                        setCredorNome(pRes.nome);
                        setCredorResultados([]);
                      }}
                    >
                      {pRes.nome} {pRes.cpf_cnpj ? '(' + pRes.cpf_cnpj + ')' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="form-hint">
              {form.parceiro_id ? `Credor selecionado: ${credorNome}` : 'Busque por nome ou CPF/CNPJ e escolha na lista.'}
            </span>
          </div>

          <CampoForm label="Referência">
            <input className="input w-full" value={form.ref_contrato} onChange={campo('ref_contrato')} />
          </CampoForm>

          {/*
            SEM asterisco de obrigatorio, e a diferenca e do backend, nao de estilo:
            `criarContrato` NAO exige a categoria (PI-16 — quem abre o contrato e o
            usuario da obra, que nao conhece o plano de contas). Quem a exige e a
            APROVACAO (`garantirCategoriaParaTitulos`). Marcar como obrigatoria aqui
            seria a tela afirmando uma regra que o servidor nao tem.
          */}
          <CampoForm
            label="Categoria financeira"
            hint="Nao e exigida para criar; sem ela, porem, a aprovacao do contrato e barrada."
          >
            <select className="input w-full" value={form.categoria_financeira_id} onChange={campo('categoria_financeira_id')}>
              <option value="">Selecione</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </CampoForm>

          <CampoForm label="Apropriação" obrigatorio hint="A lista depende da obra escolhida.">
            <ApropriacaoAutocomplete
              value={form.apropriacao_id}
              options={apropriacoesObra}
              onChange={(id) => setForm((atual) => ({ ...atual, apropriacao_id: id }))}
              disabled={!form.obra_id}
              required
              disabledPlaceholder="Selecione a obra primeiro"
            />
          </CampoForm>
        </FormSecao>

        <FormSecao legenda="Valores e parcelas" colunas={3}>
          <CampoForm label="Valor total" obrigatorio>
            <input
              className="input input-moeda w-full"
              type="number"
              step="0.01"
              value={form.valor_total}
              onChange={campo('valor_total')}
            />
          </CampoForm>

          <CampoForm label="Qtde parcelas" obrigatorio>
            <input className="input w-full" type="number" min="1" value={form.qtde_parcelas} onChange={campo('qtde_parcelas')} />
          </CampoForm>

          <CampoForm label="1º vencimento" obrigatorio>
            <DateInputBR className="input w-full" value={form.primeiro_vencimento} onChange={campo('primeiro_vencimento')} />
          </CampoForm>

          {/*
            R6: valor em pt-BR, com separador de milhar e `tabular-nums` —
            `R$ 1234.56` nao e moeda brasileira.

            E o SALDO ZERO ganha frase, nao numero: "Saldo: R$ 0,00" confundiu o
            cliente no bloco irmao (BlocoContratoFluxoNovo, 20/08) porque zero
            sem contexto parece campo vazio ou erro, quando e exatamente o estado
            CERTO — as parcelas fecham o contrato.
          */}
          <div className="form-group form-campo--linha">
            <span className="form-label">Saldo a distribuir</span>
            <div
              className={`valor-tabular flex min-h-12 flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                saldoCent === 0
                  ? 'border-[var(--sem-success-border)] bg-[var(--sem-success-bg)] text-[var(--sem-success)]'
                  : 'border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] text-[var(--sem-warning)]'
              }`}
            >
              <span className="font-semibold">{formatCurrencyBRL(Math.abs(saldoCent) / 100)}</span>
              <span className="text-xs">
                {saldoCent === 0
                  ? 'As parcelas fecham o valor do contrato.'
                  : saldoCent > 0
                    ? 'Falta distribuir — ajuste as parcelas ate fechar o total.'
                    : 'Passou do valor do contrato — reduza as parcelas ate fechar o total.'}
              </span>
            </div>
            <span className="form-hint">
              Diferença entre o valor total do contrato e a soma das parcelas previstas abaixo.
            </span>
          </div>
        </FormSecao>

        {/* A negociacao detalhada virou DOCUMENTO (20/08). Esta tela nao tem o campo de anexo — ela
            cria o contrato antes de existir um contrato a que anexar —, entao aqui fica o aviso.
            Deixar o textarea seria pior: a pessoa preencheria achando que cumpriu a exigencia, e o
            contrato travaria na aprovacao do mesmo jeito, porque o backend cobra o arquivo. */}
        {exigeDetalhes && (
          <div className="app-alert app-alert--warning" data-testid="aviso-negociacao">
            Acima do limite do Jurídico a negociação detalhada e obrigatória e precisa ser um
            documento (.docx ou .pdf). Depois de criar, anexe o documento pela Gestao de Contratos —
            sem ele o contrato nao pode ser aprovado.
          </div>
        )}

        {parcelas.length > 0 && (
          <TabelaPadrao
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
                sempreVisivel: true,
                titulo: 'Valor',
                tipo: 'valor',
                /* R6 — dinheiro editavel tambem e campo de dinheiro: `.input-moeda`
                   (180px, a direita, tabular-nums). `w-full` para acompanhar a coluna
                   quando o usuario a alarga; abaixo disso vale o piso da classe. */
                render: (p) => (
                  <input className="input input-moeda w-full" type="number" step="0.01"
                    value={p.valor}
                    onChange={(e) => editarParcela(p.numero, e.target.value)} />
                )
              },
              {
                id: 'vencimento',
                titulo: 'Vencimento',
                tipo: 'data',
                render: (p) => p.vencimento
              },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: () => 'Previsao'
              }
            ]}
            itens={parcelas}
            getId={(p) => p.numero}
            storageKey="tabela:contrato-fluxo-novo:parcelas"
            rotuloRolagem="Previa de parcelas"
            vazio="Nenhuma parcela prevista"
            /* R17: previa de parcelas — numero, valor, vencimento e status; nao
               ha nome de registro a exibir, a parcela e identificada pelo numero. */
            semIdentidade
          />
        )}
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
