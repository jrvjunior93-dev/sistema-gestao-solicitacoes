import { useEffect, useMemo, useState } from 'react';
import { Pagina, PageHeader, Avisos, useAvisos } from '../components/padrao';
import { getSetores } from '../services/setores';
import { getTiposSolicitacao } from '../services/tiposSolicitacao';
import {
  getAutomacaoDestinoNovaSolicitacao,
  getTiposSolicitacaoPorSetor,
  salvarAutomacaoDestinoNovaSolicitacao
} from '../services/configuracoesSistema';
import {
  DESTINO_NOVA_SOLICITACAO_COMPRA,
  normalizarAreaAutomacaoDestino,
  normalizarConfigAutomacaoDestinoNovaSolicitacao
} from '../utils/novaSolicitacaoAutomacaoDestino';

const DESCRICAO = 'Defina quando a escolha de area e tipo deve levar o usuario automaticamente para outra tela operacional.';

export default function NovaSolicitacaoAutomacaoDestinoConfig() {
  const [setores, setSetores] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [tiposPorSetorConfig, setTiposPorSetorConfig] = useState({});
  const [destinosDisponiveis, setDestinosDisponiveis] = useState([]);
  const [areaSelecionada, setAreaSelecionada] = useState('');
  const [tipoSelecionadoId, setTipoSelecionadoId] = useState('');
  const [regras, setRegras] = useState({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  // R3/R19: as tres caixas do navegador (carregar, salvar com sucesso,
  // salvar com erro) viraram aviso do sistema — a do Chrome ignora tema,
  // tipografia e tokens, bloqueia a pagina, nao existe no DOM para o
  // harness medir e some sem deixar rastro.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    async function load() {
      try {
        const [setoresData, tiposData, tiposPorSetorData, configData] = await Promise.all([
          getSetores(),
          getTiposSolicitacao(),
          getTiposSolicitacaoPorSetor(),
          getAutomacaoDestinoNovaSolicitacao()
        ]);
        const listaSetores = Array.isArray(setoresData) ? setoresData : [];
        const listaTipos = Array.isArray(tiposData) ? tiposData.filter((tipo) => tipo?.ativo !== false) : [];
        const regrasTiposPorSetor = tiposPorSetorData?.regras && typeof tiposPorSetorData.regras === 'object'
          ? tiposPorSetorData.regras
          : {};
        const configNormalizada = normalizarConfigAutomacaoDestinoNovaSolicitacao(configData);
        const primeiraArea = listaSetores.find((setor) => setor?.codigo)?.codigo || '';
        const tiposPrimeiraArea = filtrarTiposPorArea(listaTipos, regrasTiposPorSetor, primeiraArea);

        setSetores(listaSetores);
        setTipos(listaTipos);
        setTiposPorSetorConfig(regrasTiposPorSetor);
        setDestinosDisponiveis(configNormalizada.destinos_disponiveis);
        setRegras(configNormalizada.regras);
        setAreaSelecionada(primeiraArea);
        setTipoSelecionadoId(tiposPrimeiraArea[0]?.id ? String(tiposPrimeiraArea[0].id) : '');
      } catch (error) {
        console.error(error);
        avisar.erro(error.message || 'Erro ao carregar automacao da nova solicitacao');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function filtrarTiposPorArea(listaTipos, regrasTiposPorSetor, area) {
    const areaKey = normalizarAreaAutomacaoDestino(area);
    const tiposAtivos = Array.isArray(listaTipos)
      ? listaTipos.filter((tipo) => tipo?.ativo !== false)
      : [];
    const tiposPermitidos = Array.isArray(regrasTiposPorSetor?.[areaKey]?.tipos)
      ? regrasTiposPorSetor[areaKey].tipos.map(Number).filter(Number.isFinite)
      : [];

    if (tiposPermitidos.length === 0) {
      return tiposAtivos;
    }

    const idsPermitidos = new Set(tiposPermitidos);
    return tiposAtivos.filter((tipo) => idsPermitidos.has(Number(tipo.id)));
  }

  const tiposDaArea = useMemo(
    () => filtrarTiposPorArea(tipos, tiposPorSetorConfig, areaSelecionada),
    [tipos, tiposPorSetorConfig, areaSelecionada]
  );

  useEffect(() => {
    if (!areaSelecionada) return;
    if (tiposDaArea.some((tipo) => String(tipo.id) === String(tipoSelecionadoId))) return;
    setTipoSelecionadoId(tiposDaArea[0]?.id ? String(tiposDaArea[0].id) : '');
  }, [areaSelecionada, tipoSelecionadoId, tiposDaArea]);

  const destinoCompra = destinosDisponiveis.find((destino) => destino.id === DESTINO_NOVA_SOLICITACAO_COMPRA);
  const areaKey = normalizarAreaAutomacaoDestino(areaSelecionada);
  const regraAtual = regras?.[areaKey]?.tipos?.[String(tipoSelecionadoId)] || null;
  const automacaoAtiva = Boolean(regraAtual?.ativo && regraAtual?.destino);

  function atualizarRegra(ativar) {
    if (!areaSelecionada || !tipoSelecionadoId) return;

    setRegras((prev) => {
      const next = { ...prev };
      const tiposArea = { ...(next[areaKey]?.tipos || {}) };

      if (!ativar) {
        delete tiposArea[String(tipoSelecionadoId)];
        next[areaKey] = { tipos: tiposArea };
        return next;
      }

      tiposArea[String(tipoSelecionadoId)] = {
        ativo: true,
        destino: DESTINO_NOVA_SOLICITACAO_COMPRA,
        rota: destinoCompra?.rota || '/solicitacoes-compra/nova',
        preservar_obra: true,
        preservar_solicitante: true
      };
      next[areaKey] = { tipos: tiposArea };
      return next;
    });
  }

  async function salvar() {
    try {
      setSalvando(true);
      const data = await salvarAutomacaoDestinoNovaSolicitacao({ regras });
      const configNormalizada = normalizarConfigAutomacaoDestinoNovaSolicitacao(data);
      setDestinosDisponiveis(configNormalizada.destinos_disponiveis);
      setRegras(configNormalizada.regras);
      avisar.sucesso('Automação salva com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao salvar automacao.');
    } finally {
      setSalvando(false);
    }
  }

  // B5: o carregamento acontece DENTRO da moldura padrao. Antes era uma
  // frase crua sobre o canvas: sem faixa fixa, sem titulo e — o que pesa —
  // sem `Avisos`, entao uma falha no carregamento nao tinha para onde ir.
  //
  // A contagem fica de fora enquanto carrega: com `regras` ainda vazio ela
  // sairia como "Sem regra neste tipo", que e uma afirmacao sobre um tipo
  // que a tela ainda nem selecionou — falso, nao apenas incompleto.
  if (loading) {
    return (
      <Pagina>
        <PageHeader titulo="Automação da Nova Solicitação" descricao={DESCRICAO} />
        <Avisos avisos={avisos} aoFechar={fechar} />
        <div className="app-empty-card">Carregando automação da nova solicitação...</div>
      </Pagina>
    );
  }

  return (
    // M2/R10: o ritmo vertical (16px entre blocos) vem do `Pagina`, nao de
    // `space-y-5 md:space-y-6` na raiz — 20/24px nao existem na escala.
    <Pagina>
      {/* C1/R13: o `.config-page-header` NAO e sticky. A faixa fixa do
          sistema (`.app-page-header`) gruda encostada na topbar e compacta
          sem sumir, entao "Salvar automacao" continua a um clique depois de
          rolar ate o painel de destino. */}
      <PageHeader
        titulo="Automação da Nova Solicitação"
        contagem={automacaoAtiva ? 'Regra ativa neste tipo' : 'Sem regra neste tipo'}
        descricao={DESCRICAO}
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar automacao',
          onClick: salvar,
          desabilitada: salvando
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <section className="config-summary-card">
        <div>
          <p className="config-summary-kicker">Redirecionamento por tipo</p>
          <h2 className="config-summary-title">Abertura guiada para módulos específicos</h2>
          <p className="config-summary-copy">
            Ao selecionar uma regra ativa, a tela Nova Solicitação redireciona o usuário preservando a obra escolhida e usando o usuário logado como solicitante.
          </p>
        </div>
      </section>

      {/* M2/R10: `gap-5` (20px) e `lg:grid-cols-[320px_1fr]` (medida em px
          escrita na tela) sairam — o vao vem de um degrau da escala e a
          proporcao do painel (1/4 para o seletor, 3/4 para o conteudo), de
          trilhas de grade: mesma leitura, sem medida escrita na tela. */}
      <div className="grid gap-4 lg:grid-cols-4">
        <section className="card space-y-3">
          <label className="grid gap-2 text-sm">
            Área responsável
            <select
              className="input input-sm"
              value={areaSelecionada}
              onChange={(event) => setAreaSelecionada(event.target.value)}
            >
              {setores.map((setor) => (
                <option key={setor.id} value={setor.codigo}>{setor.nome}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            Tipo de solicitação
            <select
              className="input input-sm"
              value={tipoSelecionadoId}
              onChange={(event) => setTipoSelecionadoId(event.target.value)}
              disabled={!areaSelecionada || tiposDaArea.length === 0}
            >
              {tiposDaArea.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>{tipo.nome}</option>
              ))}
            </select>
          </label>

          {tiposDaArea.length === 0 && (
            <p className="text-xs text-[var(--c-muted)]">
              Nenhum tipo ativo encontrado para esta área.
            </p>
          )}
        </section>

        <section className="card space-y-4 lg:col-span-3">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--c-muted)]">Destino automático</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--c-text)]">
              {destinoCompra?.label || 'Nova Solicitacao de Compra'}
            </h2>
            <p className="mt-1 text-sm text-[var(--c-muted)]">
              {destinoCompra?.descricao || 'Redireciona para o modulo de compras com a obra selecionada.'}
            </p>
          </div>

          <label className="flex items-start gap-3 rounded border border-[var(--c-border)] p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={automacaoAtiva}
              disabled={!tipoSelecionadoId || !destinoCompra}
              onChange={(event) => atualizarRegra(event.target.checked)}
            />
            <span>
              <span className="font-semibold text-[var(--c-text)]">
                Redirecionar este tipo para Solicitação de Compra
              </span>
              <span className="mt-1 block text-xs text-[var(--c-muted)]">
                Quando o usuario selecionar obra, area e este tipo, ele sera levado para {destinoCompra?.rota || '/solicitacoes-compra/nova'}.
              </span>
            </span>
          </label>

          {/* R25: a classe trazia o hexadecimal escrito dentro dela
              (`bg-[var(--c-surface-muted,#f8fafc)]`) — cor de tela vem de
              token, nunca de hex. E o fallback nao era detalhe: o token
              `--c-surface-muted` nao esta declarado em lugar nenhum do
              sistema, entao era o hex que pintava o fundo — sem par no tema
              escuro e fora do piso de contraste do ThemeContext. Aqui fica
              `--ui-surface-2`, o token real da superficie rebaixada, que
              existe nos dois temas. */}
          {automacaoAtiva && (
            <div className="rounded border border-[var(--c-border)] bg-[var(--ui-surface-2)] p-3 text-sm">
              <div className="font-semibold text-[var(--c-text)]">Regra ativa</div>
              <div className="mt-1 text-[var(--c-muted)]">
                A obra selecionada será enviada por parametro e o solicitante será o usuário logado na tela de compra.
              </div>
            </div>
          )}
        </section>
      </div>
    </Pagina>
  );
}
