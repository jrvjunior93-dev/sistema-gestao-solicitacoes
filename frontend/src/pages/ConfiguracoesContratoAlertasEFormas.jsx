import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Avisos, BlocoConteudo, Pagina, PageHeader, useAvisos } from '../components/padrao';
import { API_URL, authHeaders } from '../services/api';

/**
 * Duas configuracoes de contrato que so existiam pela API (24/08).
 *
 * 1. **Alerta de saldo do contrato** (item 21): os cortes e as cores dos tres niveis — Saudavel,
 *    Normal e Critico. O cliente pediu a tela junto com o alerta: *"os percentuais mudam com o
 *    tempo"*;
 * 2. **Formas de pagamento dos fluxos**: quais das formas cadastradas aparecem na Nova Solicitacao,
 *    no fluxo novo de contratos e nas medicoes. Uma unica selecao evita divergencia entre telas.
 *
 * As duas moram na mesma pagina porque sao a mesma natureza — configuracao do fluxo de contrato — e
 * separa-las criaria dois itens de menu para duas listas curtas.
 *
 * Nas duas, a regra que este projeto ja registrou: **configuracao CURA, nunca substitui o cadastro**.
 * As formas continuam vindo de `financeiro_formas_pagamento`; a configuracao so diz quais aparecem.
 * E lista vazia significa TODAS — sem isso o sistema nasceria travado, sem forma nenhuma para
 * escolher, ate alguem abrir esta tela.
 *
 * ## UMA TELA, DOIS ASSUNTOS — como o cabecalho decide o que anunciar (03/09)
 *
 * Duas familias de rota servem este mesmo componente, e cada uma foi batizada por um assunto
 * diferente:
 *   - `/configuracoes-contrato-alertas` — ALERTAS DE CONTRATO;
 *   - `/configuracoes-formas-pagamento-solicitacao` — FORMAS DE PAGAMENTO.
 *
 * Desde 04/09 as DUAS tem porta propria no hub de Configuracoes. Ate entao a
 * primeira nao tinha nenhuma, e eu quase a removi como duplicata — o que
 * teria apagado um assunto inteiro do sistema. O criterio que resolveu: se a
 * tela ANUNCIA COISA DIFERENTE conforme o caminho, sao dois destinos, e o
 * que falta e a porta do segundo, nao a remocao dele.
 *
 * Ate 03/09 o titulo era fixo em "Formas de pagamento da Nova Solicitacao": quem chegava pela rota
 * dos alertas lia o titulo da OUTRA configuracao. `useLocation` resolve isso — o cabecalho nomeia o
 * assunto por onde se entrou, e a barra de cor (B2) marca o bloco que responde a ele. Os QUATRO
 * blocos continuam visiveis nas duas rotas: esconder por rota faria a rota fora do menu ser o unico
 * caminho para o que ficasse escondido.
 */

const NIVEIS = [
  { chave: 'cor_saudavel', rotulo: 'Saudavel', ajuda: 'Ha folga no contrato.' },
  { chave: 'cor_normal', rotulo: 'Normal', ajuda: 'Ainda ha saldo, mas já pede atenção.' },
  { chave: 'cor_critico', rotulo: 'Crítico', ajuda: 'O contrato esta no fim do saldo.' }
];

const ROTA_ALERTAS_CONTRATO = '/configuracoes-contrato-alertas';

// C2/R5: um assunto por rota, com o apoio em UMA linha. O apoio termina
// dizendo que o resto continua na mesma pagina — senao quem entra por uma
// rota supoe que a outra metade nao existe.
const ASSUNTOS = {
  contrato: {
    titulo: 'Alertas e limites do contrato',
    descricao: 'Cortes e cores do alerta de saldo e o limite para análise jurídica; a mesma página também guarda a Despesa Eventual e as formas de pagamento.',
    blocoPrimario: 'alerta-saldo'
  },
  formas: {
    titulo: 'Formas de pagamento da Nova Solicitação',
    descricao: 'Formas exibidas nos fluxos de solicitação e os limites da Despesa Eventual; a mesma página também guarda os alertas e o limite jurídico do contrato.',
    blocoPrimario: 'formas-pagamento'
  }
};

export default function ConfiguracoesContratoAlertasEFormas() {
  const { pathname } = useLocation();
  const [alerta, setAlerta] = useState(null);
  const [limiteContrato, setLimiteContrato] = useState(null);
  const [formas, setFormas] = useState([]);
  const [limitesDespesa, setLimitesDespesa] = useState(null);
  const [todasAsFormas, setTodasAsFormas] = useState(true);
  const [salvando, setSalvando] = useState('');
  const { avisos, avisar, fechar, limpar } = useAvisos();

  const assunto = useMemo(() => (
    String(pathname || '').startsWith(ROTA_ALERTAS_CONTRATO) ? ASSUNTOS.contrato : ASSUNTOS.formas
  ), [pathname]);

  // B2: UM bloco principal com barra de cor — e ele que responde a pergunta
  // com que a pessoa entrou. Os outros ficam neutros.
  const varianteDoBloco = (id) => (assunto.blocoPrimario === id ? 'primario' : 'neutro');
  const corDoBloco = (id) => (assunto.blocoPrimario === id ? 'var(--c-primary)' : undefined);

  const carregar = useCallback(async () => {
    try {
      const [resAlerta, resLimiteContrato, resFormas, resLimitesDespesa] = await Promise.all([
        fetch(`${API_URL}/configuracoes/alerta-saldo-contrato`, { headers: authHeaders() }),
        fetch(`${API_URL}/configuracoes/contrato-limite-juridico`, { headers: authHeaders() }),
        fetch(`${API_URL}/configuracoes/formas-pagamento-medicao`, { headers: authHeaders() }),
        fetch(`${API_URL}/configuracoes/despesa-eventual-limites`, { headers: authHeaders() })
      ]);
      if (!resAlerta.ok || !resLimiteContrato.ok || !resFormas.ok || !resLimitesDespesa.ok) {
        throw new Error('Erro ao carregar as configuracoes.');
      }

      setAlerta(await resAlerta.json());
      setLimiteContrato(await resLimiteContrato.json());
      const dadosFormas = await resFormas.json();
      setFormas(Array.isArray(dadosFormas?.formas) ? dadosFormas.formas : []);
      setTodasAsFormas(dadosFormas?.todas !== false);
      setLimitesDespesa(await resLimitesDespesa.json());
    } catch (e) {
      avisar.erro(e.message || 'Erro ao carregar as configuracoes.');
    }
  }, [avisar]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function salvarLimiteContrato(event) {
    event.preventDefault();
    if (salvando) return;
    limpar();
    setSalvando('limite-contrato');
    try {
      const res = await fetch(`${API_URL}/configuracoes/contrato-limite-juridico`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ limite: limiteContrato.limite })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Erro ao salvar o limite juridico do contrato.');
      setLimiteContrato(json);
      avisar.sucesso('Limite jurídico dos contratos salvo.');
    } catch (e) {
      avisar.erro(e.message || 'Erro ao salvar o limite juridico do contrato.');
    } finally {
      setSalvando('');
    }
  }

  async function salvarAlerta(event) {
    event.preventDefault();
    limpar();
    setSalvando('alerta');
    try {
      const res = await fetch(`${API_URL}/configuracoes/alerta-saldo-contrato`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(alerta)
      });
      const json = await res.json().catch(() => ({}));
      // A recusa do backend e informativa ("o corte de Saudavel tem de ser maior..."): mostrar o
      // texto dele e melhor do que traduzir a regra numa segunda mensagem aqui.
      if (!res.ok) throw new Error(json?.error || 'Erro ao salvar o alerta.');
      setAlerta(json);
      avisar.sucesso('Alerta de saldo salvo.');
    } catch (e) {
      avisar.erro(e.message || 'Erro ao salvar o alerta.');
    } finally {
      setSalvando('');
    }
  }

  async function salvarFormas() {
    limpar();
    setSalvando('formas');
    try {
      // Lista dos LIBERADOS. Se todas estiverem marcadas, manda vazio de propósito: "vazio = todas"
      // e o padrao aberto, e gravar a lista inteira congelaria as formas que forem cadastradas
      // depois — elas nasceriam invisiveis na medicao.
      const marcadas = formas.filter((f) => f.liberada).map((f) => f.id);
      const todas = marcadas.length === formas.length;

      const res = await fetch(`${API_URL}/configuracoes/formas-pagamento-medicao`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ formas: todas ? [] : marcadas })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Erro ao salvar as formas.');

      setFormas(Array.isArray(json?.formas) ? json.formas : []);
      setTodasAsFormas(json?.todas !== false);
      avisar.sucesso(todas
        ? 'Todas as formas ativas voltam a aparecer nos fluxos — inclusive as cadastradas depois.'
        : 'Formas de pagamento da Nova Solicitacao salvas.');
    } catch (e) {
      avisar.erro(e.message || 'Erro ao salvar as formas.');
    } finally {
      setSalvando('');
    }
  }

  async function salvarLimitesDespesa(event) {
    event.preventDefault();
    limpar();
    setSalvando('despesa-eventual');
    try {
      const res = await fetch(`${API_URL}/configuracoes/despesa-eventual-limites`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          limite_solicitacao: limitesDespesa.limite_solicitacao,
          limite_obra: limitesDespesa.limite_obra
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Erro ao salvar os limites da Despesa Eventual.');
      setLimitesDespesa(json);
      avisar.sucesso('Limites da Despesa Eventual salvos.');
    } catch (e) {
      avisar.erro(e.message || 'Erro ao salvar os limites da Despesa Eventual.');
    } finally {
      setSalvando('');
    }
  }

  function alterarAlerta(campo, valor) {
    setAlerta((atual) => ({ ...atual, [campo]: valor }));
    // MEXER NUM CAMPO APAGA A MENSAGEM ANTERIOR.
    //
    // Sem isto, a recusa de uma tentativa ficava na tela enquanto a pessoa corrigia os valores — e
    // pior: quando o proprio navegador barra o envio (os campos tem `max="100"`, e a validacao
    // nativa impede o submit), a mensagem exibida era a da tentativa ANTERIOR, dizendo uma coisa
    // enquanto a bolha do navegador dizia outra. Encontrado rodando a matriz de teste na tela.
    limpar();
  }

  const cabecalho = (
    <PageHeader titulo={assunto.titulo} descricao={assunto.descricao} />
  );

  if (!alerta || !limiteContrato || !limitesDespesa) {
    // A faixa de avisos entra TAMBEM aqui: sem ela, uma falha no carregamento
    // deixava a tela em "Carregando configuracoes..." para sempre e a mensagem
    // do erro nunca aparecia.
    return (
      <Pagina>
        {cabecalho}
        <Avisos avisos={avisos} aoFechar={fechar} />
        <div className="app-empty-card">Carregando configurações...</div>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {/* D6/R11: o botao "Ir para formas de pagamento" saiu do cabecalho —
          era navegacao disfarcada de acao, e existia so porque o titulo fixo
          nao dizia qual assunto estava aberto. Agora o titulo diz. */}
      {cabecalho}

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Limite para análise jurídica"
        descricao="Contratos acima deste valor seguem da Gerência de Processos para o Jurídico. No valor exato ou abaixo dele, a aprovação permanece na Gerência."
        variante={varianteDoBloco('limite-juridico')}
        cor={corDoBloco('limite-juridico')}
        data-testid="config-limite-juridico"
      >
        <form className="space-y-4" onSubmit={salvarLimiteContrato}>
          {limiteContrato.padrao && (
            <p className="app-note">Ainda vale o limite padrão do sistema até o primeiro salvamento.</p>
          )}

          <label className="grid max-w-md gap-1 text-sm">
            Limite jurídico (R$)
            <input
              className="input input-moeda"
              type="number"
              min="0.01"
              step="0.01"
              value={limiteContrato.limite}
              onChange={(event) => {
                setLimiteContrato((atual) => ({ ...atual, limite: event.target.value }));
                limpar();
              }}
              required
            />
          </label>

          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={Boolean(salvando)}>
              {salvando === 'limite-contrato' ? 'Salvando...' : 'Salvar limite jurídico'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      {/* ---------- ITEM 21 ---------- */}
      <BlocoConteudo
        titulo="Alerta de saldo do contrato"
        descricao="A cor do texto do saldo, no card de títulos do contrato. O percentual e do saldo sobre o valor do contrato, com os aditivos."
        variante={varianteDoBloco('alerta-saldo')}
        cor={corDoBloco('alerta-saldo')}
        data-testid="config-alerta-saldo"
      >
        <form className="space-y-4" onSubmit={salvarAlerta}>
          {alerta.padrao && (
            <p className="app-note" data-testid="alerta-no-padrao">
              Ainda não ha configuração gravada: valem os valores padrão abaixo.
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Saudavel a partir de (%)
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                step="0.1"
                name="saudavel_a_partir_de"
                value={alerta.saudavel_a_partir_de}
                onChange={(e) => alterarAlerta('saudavel_a_partir_de', e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Normal a partir de (%)
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                step="0.1"
                name="normal_a_partir_de"
                value={alerta.normal_a_partir_de}
                onChange={(e) => alterarAlerta('normal_a_partir_de', e.target.value)}
              />
            </label>
          </div>
          <p className="app-note">
            Abaixo do corte de Normal, o saldo fica Crítico. O corte de Saudavel tem de ser maior que o
            de Normal — do contrario uma das faixas nunca aconteceria.
          </p>

          <div className="grid gap-3 md:grid-cols-3">
            {NIVEIS.map((nivel) => (
              <label key={nivel.chave} className="grid gap-1 text-sm">
                Cor · {nivel.rotulo}
                <span className="flex items-center gap-2">
                  {/* R10/M1: 48×32 vem dos degraus da escala (w-12/h-8); a
                      borda e o raio vem de token, nao de px escrito na tela. */}
                  <input
                    type="color"
                    className="w-12 h-8 p-0 border"
                    style={{ borderColor: 'var(--ui-border)', borderRadius: 'var(--raio-1)' }}
                    name={nivel.chave}
                    value={alerta[nivel.chave]}
                    onChange={(e) => alterarAlerta(nivel.chave, e.target.value)}
                  />
                  <strong style={{ color: alerta[nivel.chave] }}>R$ 12.345,67</strong>
                </span>
                <span className="text-xs text-[var(--c-muted)]">{nivel.ajuda}</span>
              </label>
            ))}
          </div>

          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" data-testid="salvar-alerta"
              disabled={salvando === 'alerta'}>
              {salvando === 'alerta' ? 'Salvando...' : 'Salvar alerta'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Limites da Despesa Eventual"
        descricao="Controle o teto de cada solicitação e o valor acumulado permitido em cada obra. Solicitações canceladas ou rejeitadas não comprometem o saldo."
        variante={varianteDoBloco('despesa-eventual')}
        cor={corDoBloco('despesa-eventual')}
        data-testid="config-despesa-eventual"
      >
        <form className="space-y-4" onSubmit={salvarLimitesDespesa}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Limite por solicitação (R$)
              <input
                className="input input-moeda"
                type="number"
                min="0.01"
                step="0.01"
                value={limitesDespesa.limite_solicitacao}
                onChange={(event) => setLimitesDespesa((atual) => ({
                  ...atual,
                  limite_solicitacao: event.target.value
                }))}
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              Limite acumulado por obra (R$)
              <input
                className="input input-moeda"
                type="number"
                min="0.01"
                step="0.01"
                value={limitesDespesa.limite_obra}
                onChange={(event) => setLimitesDespesa((atual) => ({
                  ...atual,
                  limite_obra: event.target.value
                }))}
                required
              />
            </label>
          </div>

          {(limitesDespesa.padrao_solicitacao || limitesDespesa.padrao_obra) && (
            <p className="app-note">Ainda valem os limites padrão do sistema até o primeiro salvamento.</p>
          )}

          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={salvando === 'despesa-eventual'}>
              {salvando === 'despesa-eventual' ? 'Salvando...' : 'Salvar limites'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        id="formas-pagamento-solicitacao"
        titulo="Formas exibidas na Nova Solicitação"
        descricao="Esta e uma configuração única para Contratos e para os demais tipos de solicitação. As opções continuam vindo do cadastro do Financeiro; forma desativada não aparece nem se estiver marcada aqui."
        variante={varianteDoBloco('formas-pagamento')}
        cor={corDoBloco('formas-pagamento')}
        className="scroll-mt-4"
        data-testid="config-formas-medicao"
      >
        <div className="space-y-4">
          {todasAsFormas && (
            <p className="app-note" data-testid="formas-todas">
              Nenhuma escolha feita ainda: todas as formas ativas aparecem nos fluxos.
            </p>
          )}

          <div className="grid gap-1 md:grid-cols-2">
            {formas.length === 0 && (
              <p className="text-sm text-[var(--c-muted)]">Nenhuma forma de pagamento cadastrada.</p>
            )}
            {formas.map((forma) => (
              <label key={forma.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid={`forma-${forma.id}`}
                  checked={forma.liberada}
                  onChange={(e) => setFormas((atual) => atual.map((f) => (
                    f.id === forma.id ? { ...f, liberada: e.target.checked } : f
                  )))}
                />
                <span className={forma.ativo ? '' : 'text-[var(--c-muted)] line-through'}>
                  {forma.nome}
                  {!forma.ativo && ' (desativada no cadastro)'}
                </span>
              </label>
            ))}
          </div>

          <div className="flex justify-end">
            <button type="button" className="btn btn-primary" data-testid="salvar-formas"
              disabled={salvando === 'formas'} onClick={salvarFormas}>
              {salvando === 'formas' ? 'Salvando...' : 'Salvar formas'}
            </button>
          </div>
        </div>
      </BlocoConteudo>
    </Pagina>
  );
}
