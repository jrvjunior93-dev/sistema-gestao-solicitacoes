import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getModulosSistema, salvarModulosSistema } from '../services/configuracoesSistema';
import {
  getModuleDependencyLabels,
  getModuleDependents,
  getModuleGovernance,
  MODULE_GOVERNANCE,
  toggleModuleWithDependencies
} from '../constants/moduleGovernance';
import { Avisos, BlocoConteudo, Pagina, PageHeader, useAvisos } from '../components/padrao';

/**
 * MODULOS E PLANOS — reforma de 04/09.
 *
 * ## O mesmo defeito da tela de Notificações, e vale repetir aqui
 *
 * O cabeçalho vestia `className="app-page-header"` — a classe sticky da R13
 * — sem que a tela renderizasse o `Pagina`. Quem publica
 * `--pos-cabecalho-fixo` (a altura REAL da topbar, medida no DOM) é só o
 * `Pagina`; sem ele o CSS caía no literal de fallback `top: 96px`, origem
 * conhecida do vão transparente registrado em 02/09. E sem `PageHeader` não
 * havia compactação, porque compactação é ESTADO do componente, não efeito
 * da classe.
 *
 * **Vestir a classe certa sem o componente que a alimenta é pior do que não
 * ter faixa, porque parece resolvido.** O `grep` acha a classe, o check
 * estático acha o sticky no CSS, e a faixa continua sem grudar na tela real.
 * `Pagina` + `PageHeader` fecha os dois: posição do primeiro, compactação do
 * segundo.
 */

export default function ConfiguracoesModulos() {
  const { updateUser } = useAuth();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /*
    R3/R19: as três caixas do navegador saíram. A do salvamento é a que mais
    pedia: ligar ou desligar um módulo muda MENU e ROTAS da instalação
    inteira, e esse recado merece a faixa do sistema — que fica no DOM, é
    medível pelo harness e acompanha tema e tokens — em vez de uma caixa do
    Chrome que some sem deixar rastro.
  */
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const data = await getModulosSistema();
        if (!active) return;
        setModules(Array.isArray(data?.modules) ? data.modules : []);
      } catch (error) {
        console.error(error);
        if (active) {
          avisar.erro(error.message || 'Erro ao carregar modulos');
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
  }, [avisar]);

  const enabledCount = useMemo(
    () => modules.filter((item) => item?.enabled).length,
    [modules]
  );
  const enabledMap = useMemo(
    () => new Map(modules.map((item) => [item.key, Boolean(item.enabled)])),
    [modules]
  );

  function toggleModule(targetKey) {
    setModules((current) => toggleModuleWithDependencies(current, targetKey));
  }

  async function handleSave() {
    try {
      setSaving(true);
      const data = await salvarModulosSistema({ modules });
      const nextModules = Array.isArray(data?.modules) ? data.modules : modules;
      setModules(nextModules);
      updateUser({ modulos_habilitados: nextModules });
      avisar.sucesso('Módulos atualizados: menu e rotas desta instalacao passam a refletir a nova configuração.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao salvar modulos');
    } finally {
      setSaving(false);
    }
  }

  /*
    R5: o `page-subtitle` solto virou `descricao`, e o "Ativos: N" — que era
    um <span> com pílula própria na barra de AÇÕES, disputando espaço com o
    botão de salvar — virou a prop `contagem`, que rende em <strong>
    ancorado ao título, na mesma linha do apoio.
  */
  const cabecalho = (
    <PageHeader
      titulo="Módulos e planos"
      contagem={loading ? null : `${enabledCount} ativo(s)`}
      descricao="Controle quais módulos ficam disponíveis para esta instalacao sem expor essa camada ao administrador interno."
      acaoPrincipal={{
        rotulo: saving ? 'Salvando...' : 'Salvar modulos',
        onClick: handleSave,
        desabilitada: saving || loading
      }}
    />
  );

  if (loading) {
    // B5: o "Carregando modulos..." era um <p> solto sobre o canvas, sem
    // superfície. Todo texto tem bloco.
    return (
      <Pagina>
        {cabecalho}
        <Avisos avisos={avisos} aoFechar={fechar} />
        <div className="app-empty-card">Carregando módulos...</div>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {cabecalho}

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo titulo="Matriz operacional da instalacao" variante="secundario">
        {/* R25: toda a caixa era paleta crua (sky/emerald/slate), que não tem
            par no tema escuro nem passa pelo piso de contraste do
            ThemeContext (R24). Tom informativo = tokens --sem-info-*. */}
        <div className="rounded-xl border border-[var(--sem-info-border)] bg-[var(--sem-info-bg)] p-4 text-sm text-[var(--sem-info)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <p>
              Esta leitura evita ambiguidade comercial e operacional: desligar um módulo deve ocultar menu, rotas e
              obrigatoriedades ligadas a ele, sem quebrar o fluxo principal quando o acoplamento for opcional.
              Dependencias comerciais sao aplicadas automaticamente ao ativar ou desativar modulos.
            </p>
            <p className="rounded-xl border border-[var(--sem-info-border)] bg-[var(--c-surface)] px-3 py-2 text-xs">
              Instalacao single-tenant: o efeito vale para toda a base do cliente.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {MODULE_GOVERNANCE.map((item) => {
            const active = enabledMap.get(item.key);
            return (
              <article
                key={item.key}
                className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-muted)]">{item.role}</div>
                    <h3 className="mt-1 text-lg font-semibold text-[var(--c-text)]">{item.label}</h3>
                  </div>
                  {/* M2/R10 + R25: `px-2.5` e `text-[11px]` eram medida à mão
                      (e abaixo do piso de 12px). A pílula do sistema resolve
                      cor, tamanho e respiro de uma vez. */}
                  <span className={`fx-badge ${active ? 'fx-badge--success' : 'fx-badge--neutral'}`}>
                    {active ? 'Ativo na instalacao' : 'Desabilitado'}
                  </span>
                </div>

                <dl className="mt-3 space-y-2 text-sm text-[var(--c-muted)]">
                  <div>
                    <dt className="font-medium text-[var(--c-text)]">Relação com os demais módulos</dt>
                    <dd>{item.dependency}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-[var(--c-text)]">Superficies impactadas</dt>
                    <dd>{item.usedIn.join(' | ')}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-[var(--c-text)]">Ao desabilitar</dt>
                    <dd>{item.disabledEffect}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Módulos desta instalacao"
        variante="primario"
        cor="var(--c-primary)"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((item) => (
            <ModuleCard
              key={item.key}
              item={item}
              governance={getModuleGovernance(item.key)}
              dependencyLabels={getModuleDependencyLabels(item.key)}
              dependents={getModuleDependents(item.key)}
              onToggle={toggleModule}
            />
          ))}
        </div>
      </BlocoConteudo>
    </Pagina>
  );
}

function ModuleCard({ item, governance, dependencyLabels, dependents, onToggle }) {
  const requiresAll = dependencyLabels?.requiresAll || [];
  const requiresAny = dependencyLabels?.requiresAny || [];
  const dependentLabels = (Array.isArray(dependents) ? dependents : []).map((dependent) => dependent.label);

  return (
    <article className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-[var(--c-text)]">{item.label}</h3>
          <p className="text-sm text-[var(--c-muted)]">{item.description}</p>
          {item.packageLabel ? (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-muted)]">{item.packageLabel}</p>
          ) : null}
        </div>
        <span className={`fx-badge ${item.enabled ? 'fx-badge--success' : 'fx-badge--neutral'}`}>
          {item.enabled ? 'Ativo' : 'Desabilitado'}
        </span>
      </div>

      {governance && (
        <div className="mt-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-3 text-xs text-[var(--c-muted)]">
          <div className="font-semibold uppercase tracking-[0.12em] text-[var(--c-text)]">{governance.role}</div>
          <p className="mt-1">{governance.dependency}</p>
          <p className="mt-2">
            <strong className="text-[var(--c-text)]">Impacto operacional:</strong> {governance.disabledEffect}
          </p>
          <p className="mt-2">
            <strong className="text-[var(--c-text)]">Usado em:</strong> {governance.usedIn.join(' | ')}
          </p>
          {requiresAll.length ? (
            <p className="mt-2">
              <strong className="text-[var(--c-text)]">Requer:</strong> {requiresAll.join(' + ')}
            </p>
          ) : null}
          {requiresAny.length ? (
            <p className="mt-2">
              <strong className="text-[var(--c-text)]">Requer um destes:</strong> {requiresAny.join(' | ')}
            </p>
          ) : null}
          {dependentLabels.length ? (
            <p className="mt-2">
              <strong className="text-[var(--c-text)]">Desligar também pode afetar:</strong> {dependentLabels.join(' | ')}
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--c-text)]">
            {item.locked ? 'Modulo obrigatorio' : 'Disponivel no plano'}
          </p>
          <p className="text-xs text-[var(--c-muted)]">
            {item.locked
              ? 'Este modulo faz parte do nucleo do produto e nao pode ser desativado.'
              : 'Desative para ocultar menu, rotas e operacao desse dominio na instalacao.'}
          </p>
        </div>

        {/*
          C5: UM primário sólido por tela. O toggle virava `btn-primary`
          quando o módulo estava ativo, então a tela exibia N primários
          sólidos — um por card ligado — competindo com o "Salvar modulos" da
          faixa, que é a única ação primária de verdade aqui (nada é gravado
          antes dele). O estado ligado continua legível: `btn-secondary` é
          preenchido e distinto do contorno, e a pílula ao lado já diz
          "Ativo".
        */}
        <button
          type="button"
          className={`btn ${item.enabled ? 'btn-secondary' : 'btn-outline'}`}
          onClick={() => onToggle(item.key)}
          disabled={item.locked}
        >
          {item.locked ? 'Fixo' : (item.enabled ? 'Desabilitar' : 'Habilitar')}
        </button>
      </div>
    </article>
  );
}
