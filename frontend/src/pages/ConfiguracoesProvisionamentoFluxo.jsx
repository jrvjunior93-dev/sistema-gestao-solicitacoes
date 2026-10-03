import { useEffect, useMemo, useState } from 'react';
import { getTiposSolicitacao } from '../services/tiposSolicitacao';
import {
  getProvisionamentoFluxoConfig,
  salvarProvisionamentoFluxoConfig
} from '../services/configuracoesSistema';
import { Pagina, PageHeader, Avisos, useAvisos } from '../components/padrao';

const DEFAULT_CONFIG = {
  modo_operacional: 'INFORMATIVO',
  aprovacao_ativa: false,
  controle_vencimento_ativo: false,
  integracao_solicitacoes_ativa: false,
  exigir_provisao_na_solicitacao: false,
  bloquear_solicitacao_sem_provisao: false,
  validar_saldo_provisao: false,
  somente_provisoes_aprovadas: false,
  permitir_multiplas_provisoes_por_solicitacao: true,
  tipos_solicitacao_exigem_provisao: []
};

const DESCRICAO = 'Controle quando o provisionamento deve ser apenas informativo e quando passa a orientar solicitacoes.';

const MODOS = [
  {
    value: 'INFORMATIVO',
    title: 'Informativo',
    description: 'Cadastro e leitura gerencial das provisoes, sem aprovar, bloquear ou exigir vinculos.'
  },
  {
    value: 'CONTROLADO',
    title: 'Controlado',
    description: 'Habilita regras de aprovacao e vencimento sem obrigar provisao na solicitacao.'
  },
  {
    value: 'INTEGRADO',
    title: 'Integrado',
    description: 'Prepara a exigencia de provisao em tipos de solicitacao definidos pelo SUPERADMIN.'
  }
];

function normalizarConfig(data) {
  return {
    ...DEFAULT_CONFIG,
    ...(data && typeof data === 'object' ? data : {}),
    tipos_solicitacao_exigem_provisao: Array.isArray(data?.tipos_solicitacao_exigem_provisao)
      ? data.tipos_solicitacao_exigem_provisao.map(Number).filter(Number.isFinite)
      : []
  };
}

export default function ConfiguracoesProvisionamentoFluxo() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // R3/R19: as três caixas do navegador viraram aviso do sistema — faixa
  // dentro da página, com tom semântico, fechável e visível ao harness.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [configData, tiposData] = await Promise.all([
          getProvisionamentoFluxoConfig(),
          getTiposSolicitacao()
        ]);
        if (!active) return;
        setConfig(normalizarConfig(configData));
        setTipos(Array.isArray(tiposData) ? tiposData.filter((tipo) => tipo?.ativo !== false) : []);
      } catch (error) {
        console.error(error);
        if (active) {
          avisar.erro(error.message || 'Erro ao carregar configuracao do provisionamento.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const modoSelecionado = useMemo(
    () => MODOS.find((modo) => modo.value === config.modo_operacional) || MODOS[0],
    [config.modo_operacional]
  );

  const modoInformativo = config.modo_operacional === 'INFORMATIVO';
  const modoControlado = config.modo_operacional === 'CONTROLADO';
  const modoIntegrado = config.modo_operacional === 'INTEGRADO';

  function updateConfig(field, value) {
    setConfig((current) => {
      const next = { ...current, [field]: value };

      if (field === 'modo_operacional') {
        if (value === 'INFORMATIVO') {
          return {
            ...next,
            aprovacao_ativa: false,
            controle_vencimento_ativo: false,
            integracao_solicitacoes_ativa: false,
            exigir_provisao_na_solicitacao: false,
            bloquear_solicitacao_sem_provisao: false,
            validar_saldo_provisao: false,
            somente_provisoes_aprovadas: false
          };
        }

        if (value === 'CONTROLADO') {
          return {
            ...next,
            integracao_solicitacoes_ativa: false,
            exigir_provisao_na_solicitacao: false,
            bloquear_solicitacao_sem_provisao: false
          };
        }
      }

      if (field === 'integracao_solicitacoes_ativa' && value === false) {
        next.exigir_provisao_na_solicitacao = false;
        next.bloquear_solicitacao_sem_provisao = false;
      }

      return next;
    });
  }

  function toggleTipo(tipoId) {
    const id = Number(tipoId);
    if (!Number.isInteger(id) || id <= 0) return;

    setConfig((current) => {
      const atual = new Set(current.tipos_solicitacao_exigem_provisao || []);
      if (atual.has(id)) {
        atual.delete(id);
      } else {
        atual.add(id);
      }

      return {
        ...current,
        tipos_solicitacao_exigem_provisao: Array.from(atual)
      };
    });
  }

  async function salvar() {
    try {
      setSaving(true);
      const data = await salvarProvisionamentoFluxoConfig(config);
      setConfig(normalizarConfig(data));
      avisar.sucesso('Configuração salva com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao salvar configuracao.');
    } finally {
      setSaving(false);
    }
  }

  // B5: estava a meio caminho — dentro do `Pagina`, mas sem cabecalho e sem
  // faixa de avisos. Quem carrega ficava sem titulo e, pior, sem superficie
  // onde uma falha no carregamento pudesse aparecer.
  //
  // Sem contagem tambem aqui: este cabecalho nao tem contagem em nenhum dos
  // dois estados, e inventar uma ("0 tipo(s)") afirmaria algo que a tela
  // ainda nao apurou.
  if (loading) {
    return (
      <Pagina>
        <PageHeader titulo="Fluxo do Provisionamento" descricao={DESCRICAO} />
        <Avisos avisos={avisos} aoFechar={fechar} />
        <div className="app-empty-card">Carregando configuração do provisionamento...</div>
      </Pagina>
    );
  }

  return (
    // C1/R13: o cabeçalho era .config-page-header, que NÃO é sticky em
    // nenhuma das duas definições de CSS — a ação principal sumia ao rolar.
    // Passa a ser a faixa fixa do sistema (PageHeader dentro do Pagina, que
    // é quem mede a topbar e publica --pos-cabecalho-fixo). C5: a ação
    // principal é botão cheio via `acaoPrincipal`, não um btn-sm à mão.
    // M2/R10: o ritmo vertical vem do Pagina, não de space-y na raiz.
    <Pagina>
      <PageHeader
        titulo="Fluxo do Provisionamento"
        descricao={DESCRICAO}
        acaoPrincipal={{
          rotulo: saving ? 'Salvando...' : 'Salvar configuracao',
          onClick: salvar,
          desabilitada: saving
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <section className="config-summary-card">
        <div>
          <p className="config-summary-kicker">Modo atual</p>
          <h2 className="config-summary-title">{modoSelecionado.title}</h2>
          <p className="config-summary-copy">{modoSelecionado.description}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {MODOS.map((modo) => (
          <button
            key={modo.value}
            type="button"
            // R25: o azul do estado selecionado vem do token de informação
            // (--sem-info-*) e do primário do tema; paleta crua não tem par
            // no tema escuro nem passa pelo piso de contraste do ThemeContext.
            className={`rounded-2xl border p-4 text-left transition ${
              config.modo_operacional === modo.value
                ? 'border-[var(--c-primary)] bg-[var(--sem-info-bg)] text-[var(--c-text)]'
                : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text)] hover:border-[var(--c-primary)]'
            }`}
            onClick={() => updateConfig('modo_operacional', modo.value)}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-muted)]">
              Modo operacional
            </span>
            <strong className="mt-2 block text-lg">{modo.title}</strong>
            <span className="mt-2 block text-sm text-[var(--c-muted)]">{modo.description}</span>
          </button>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="card space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-muted)]">
              Regras de controle
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--c-text)]">Aprovação, vencimento e bloqueios</h2>
          </div>

          <ConfigToggle
            title="Aprovação ativa"
            description="Libera o uso gerencial dos estados de analise e aprovacao."
            checked={config.aprovacao_ativa}
            disabled={modoInformativo}
            onChange={(checked) => updateConfig('aprovacao_ativa', checked)}
          />
          <ConfigToggle
            title="Controle de vencimento ativo"
            description="Prepara alertas e acoes obrigatorias por data prevista."
            checked={config.controle_vencimento_ativo}
            disabled={modoInformativo}
            onChange={(checked) => updateConfig('controle_vencimento_ativo', checked)}
          />
          <ConfigToggle
            title="Integrar com solicitações"
            description="Permite que solicitacoes sejam vinculadas a provisoes por registro estruturado."
            checked={config.integracao_solicitacoes_ativa}
            disabled={!modoIntegrado}
            onChange={(checked) => updateConfig('integracao_solicitacoes_ativa', checked)}
          />
          <ConfigToggle
            title="Exigir provisão na solicitação"
            description="Torna a selecao de provisao obrigatoria para os tipos marcados."
            checked={config.exigir_provisao_na_solicitacao}
            disabled={!modoIntegrado || !config.integracao_solicitacoes_ativa}
            onChange={(checked) => updateConfig('exigir_provisao_na_solicitacao', checked)}
          />
          <ConfigToggle
            title="Bloquear solicitação sem provisão"
            description="Impede o envio de solicitacoes de tipos marcados quando o vinculo nao existir."
            checked={config.bloquear_solicitacao_sem_provisao}
            disabled={!modoIntegrado || !config.integracao_solicitacoes_ativa || !config.exigir_provisao_na_solicitacao}
            onChange={(checked) => updateConfig('bloquear_solicitacao_sem_provisao', checked)}
          />
          <ConfigToggle
            title="Validar saldo da provisão"
            description="Reserva validacao futura para comparar valor solicitado com saldo disponivel."
            checked={config.validar_saldo_provisao}
            disabled={!modoIntegrado || !config.integracao_solicitacoes_ativa}
            onChange={(checked) => updateConfig('validar_saldo_provisao', checked)}
          />
          <ConfigToggle
            title="Somente provisões aprovadas"
            description="Restringe o vinculo a provisoes aprovadas quando o fluxo de aprovacao estiver ativo."
            checked={config.somente_provisoes_aprovadas}
            disabled={!modoIntegrado || !config.integracao_solicitacoes_ativa || !config.aprovacao_ativa}
            onChange={(checked) => updateConfig('somente_provisoes_aprovadas', checked)}
          />
          <ConfigToggle
            title="Permitir múltiplas provisões por solicitação"
            description="Mantem a arquitetura aberta para uma solicitacao consumir mais de uma provisao."
            checked={config.permitir_multiplas_provisoes_por_solicitacao}
            disabled={!modoIntegrado || !config.integracao_solicitacoes_ativa}
            onChange={(checked) => updateConfig('permitir_multiplas_provisoes_por_solicitacao', checked)}
          />

          {modoControlado ? (
            <div className="rounded-xl border border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] px-4 py-3 text-sm text-[var(--sem-warning)]">
              O modo controlado prepara aprovação e vencimento sem exigir provisão nas solicitações.
            </div>
          ) : null}
        </div>

        <aside className="card space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-muted)]">
              Tipos integrados
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--c-text)]">Solicitações que exigem provisão</h2>
            <p className="mt-1 text-sm text-[var(--c-muted)]">
              A lista so tem efeito quando o modo integrado e a exigencia estiverem ativos.
            </p>
          </div>

          <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
            {tipos.map((tipo) => {
              const checked = config.tipos_solicitacao_exigem_provisao.includes(Number(tipo.id));
              return (
                <label
                  key={tipo.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm ${
                    checked
                      ? 'border-[var(--c-primary)] bg-[var(--sem-info-bg)] text-[var(--c-text)]'
                      : 'border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)]'
                  } ${!modoIntegrado ? 'opacity-60' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    disabled={!modoIntegrado}
                    onChange={() => toggleTipo(tipo.id)}
                  />
                  <span>
                    <strong className="block">{tipo.nome}</strong>
                    <span className="text-xs text-[var(--c-muted)]">
                      ID {tipo.id}
                    </span>
                  </span>
                </label>
              );
            })}

            {!tipos.length ? (
              <p className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-3 text-sm text-[var(--c-muted)]">
                Nenhum tipo de solicitação ativo encontrado.
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </Pagina>
  );
}

function ConfigToggle({ title, description, checked, disabled, onChange }) {
  return (
    <label className={`flex items-start justify-between gap-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-4 py-3 ${disabled ? 'opacity-60' : ''}`}>
      <span>
        <strong className="block text-sm text-[var(--c-text)]">{title}</strong>
        <span className="mt-1 block text-xs text-[var(--c-muted)]">{description}</span>
      </span>
      <input
        type="checkbox"
        className="mt-1"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
