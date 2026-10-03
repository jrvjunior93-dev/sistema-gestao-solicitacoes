import { useEffect, useMemo, useState } from 'react';
import { getUsuarios } from '../services/usuarios';
import { getSetores } from '../services/setores';
import {
  getPermissoesAreas,
  getPermissoesAreasRegistry,
  salvarPermissoesAreas
} from '../services/configuracoesSistema';
import {
  buildModuleEnabledMap,
  getModuleGovernance,
  MODULE_GOVERNANCE
} from '../constants/moduleGovernance';
import { Pagina, PageHeader, BlocoConteudo, Avisos, useAvisos } from '../components/padrao';

const PERMISSAO_SOLICITACOES_MINHAS = 'solicitacoes.lista.visualizar_minhas';
const COMPRAS_SCOPE_KEYS = [
  'compras.escopo.minhas_atribuidas',
  'compras.escopo.setor',
  'compras.escopo.todas'
];
const COMPRAS_SCOPE_DEFAULT = 'compras.escopo.minhas_atribuidas';
const COMPRAS_SCOPE_SELECT_ALL = 'compras.escopo.setor';
const PERFIS_BASE = ['USUARIO', 'ESTAGIARIO', 'ADMINISTRADOR', 'FINANCEIRO', 'COMPRAS', 'RH_DP', 'DIRETORIA', 'ENGENHEIRO'];

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePerfil(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function isComprasScopeKey(value) {
  return COMPRAS_SCOPE_KEYS.includes(normalizeKey(value));
}

function getEffectiveComprasScope(permissoes = []) {
  const normalized = new Set(permissoes.map(normalizeKey));
  if (normalized.has('compras.escopo.todas')) return 'compras.escopo.todas';
  if (normalized.has('compras.escopo.setor')) return 'compras.escopo.setor';
  return COMPRAS_SCOPE_DEFAULT;
}

function normalizePadroes(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  return Object.entries(input).reduce((acc, [setorKey, perfis]) => {
    const key = String(setorKey || '').trim();
    if (!key || !perfis || typeof perfis !== 'object' || Array.isArray(perfis)) return acc;

    const normalizedPerfis = Object.entries(perfis).reduce((perfilAcc, [perfil, permissoes]) => {
      const perfilKey = normalizePerfil(perfil);
      if (!perfilKey) return perfilAcc;

      perfilAcc[perfilKey] = Array.isArray(permissoes)
        ? [...new Set(permissoes.map(normalizeKey).filter(Boolean))]
        : [];
      return perfilAcc;
    }, {});

    acc[key] = normalizedPerfis;
    return acc;
  }, {});
}

function sortByName(lista = []) {
  return [...lista].sort((a, b) =>
    String(a?.nome || a?.label || '').localeCompare(String(b?.nome || b?.label || ''), 'pt-BR', {
      sensitivity: 'base'
    })
  );
}

function isSetorObra(setor) {
  const tokens = [setor?.codigo, setor?.nome, setor?.slug, setor?.id]
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);

  return Boolean(setor?.eh_setor_obra) || tokens.some((token) => token === 'OBRA' || token.includes('OBRA'));
}

function getSetorId(setor) {
  return setor?.id ? String(setor.id) : '';
}

function uniq(lista = []) {
  return [...new Set(lista.filter(Boolean))];
}

function CheckboxPermissao({ permissao, checked, disabled, onChange, inputType = 'checkbox', inputName }) {
  return (
    // R10/M2: espaçamento e tipo só em degraus da escala (py-3, gap-1, mt-1,
    // text-xs=12px). O 11px/10px de antes ficava abaixo do piso de leitura.
    // R25: o realce do item marcado vem do token semântico de informação —
    // `bg-blue-50/70` não tem par no tema escuro nem piso de contraste.
    <label
      className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors ${
        disabled
          ? 'cursor-not-allowed border-[var(--ui-border)] bg-[var(--ui-canvas)] opacity-70'
          : checked
            ? 'border-[var(--c-primary)] bg-[var(--sem-info-bg)]'
            : 'border-[var(--ui-border)] bg-[var(--ui-surface)] hover:bg-[var(--ui-canvas)]'
      }`}
    >
      <input
        type={inputType}
        name={inputName}
        className="mt-1 shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="flex flex-col gap-1">
        <span className="font-medium text-[var(--c-text)]">{permissao.label}</span>
        {permissao.descricao && (
          <span className="text-xs text-[var(--c-muted)]">{permissao.descricao}</span>
        )}
        <span className="font-mono text-xs text-[var(--c-muted)] opacity-60">{permissao.key}</span>
        {disabled && (
          <span className="text-xs font-semibold text-[var(--sem-success)]">
            Padrão obrigatório para setor OBRA
          </span>
        )}
      </span>
    </label>
  );
}

function ModuleCard({
  grupo,
  governance,
  moduleEnabled,
  permissoesAtuais,
  permissoesObrigatorias,
  onTogglePermissao,
  onSelectAll,
  onClearAll
}) {
  const allKeys = grupo.areas.flatMap((area) => area.permissoes.map((perm) => normalizeKey(perm.key)));
  const checkedCount = allKeys.filter((key) => permissoesAtuais.includes(key) || permissoesObrigatorias.includes(key)).length;

  // O cartão do módulo passou a ser um BlocoConteudo: título em degrau de
  // bloco (18px), apoio na prop `descricao` e as ações do módulo no slot
  // `acoes`. O estado do módulo e a contagem viraram `badge` do sistema —
  // pílula desenhada à mão trazia junto px-2.5/text-[10px] e paleta crua.
  return (
    <BlocoConteudo
      titulo={grupo.label}
      descricao={grupo.descricao}
      acoes={(
        <>
          <span className={`badge ${moduleEnabled ? 'badge-success' : 'badge-muted'}`}>
            {moduleEnabled ? 'Modulo ativo' : 'Modulo desabilitado'}
          </span>
          <span className="badge badge-default tabular-nums">
            {checkedCount}/{allKeys.length}
          </span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onSelectAll(allKeys)}>
            Marcar tudo
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onClearAll(allKeys)}>
            Desmarcar
          </button>
        </>
      )}
    >
      {governance && (
        <p className="app-note mb-4">
          <strong className="text-[var(--c-text)]">Impacto:</strong> {governance.disabledEffect}
        </p>
      )}

      <div className="space-y-4">
        {grupo.areas.map((area) => {
          const areaEscopoCompras = area.key === 'compras.escopo';
          const escopoComprasAtivo = areaEscopoCompras ? getEffectiveComprasScope(permissoesAtuais) : null;
          return (
          <div key={area.key} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-canvas)] p-3">
            <div className="mb-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--c-muted)]">{area.label}</h3>
              {area.descricao && <p className="mt-1 text-xs text-[var(--c-muted)]">{area.descricao}</p>}
            </div>
            <div className="grid gap-2 xl:grid-cols-2">
              {area.permissoes.map((permissao) => {
                const key = normalizeKey(permissao.key);
                const obrigatoria = permissoesObrigatorias.includes(key);
                return (
                  <CheckboxPermissao
                    key={permissao.key}
                    permissao={permissao}
                    checked={areaEscopoCompras ? key === escopoComprasAtivo : permissoesAtuais.includes(key) || obrigatoria}
                    disabled={obrigatoria}
                    onChange={() => onTogglePermissao(key)}
                    inputType={areaEscopoCompras ? 'radio' : 'checkbox'}
                    inputName={areaEscopoCompras ? 'compras-escopo-padrao' : undefined}
                  />
                );
              })}
            </div>
          </div>
          );
        })}
      </div>
    </BlocoConteudo>
  );
}

export default function PermissoesAreasPadroes() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setores, setSetores] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [registry, setRegistry] = useState([]);
  const [padroes, setPadroes] = useState({});
  const [setorSelecionado, setSetorSelecionado] = useState('');
  const [perfilSelecionado, setPerfilSelecionado] = useState('USUARIO');
  // R3/R19: o canal de retorno da tela é o aviso do sistema — a faixa de erro
  // desenhada à mão e o alert() do navegador saíram no mesmo movimento.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        const [setoresRes, usuariosRes, configRes, registryRes] = await Promise.all([
          getSetores(),
          getUsuarios(),
          getPermissoesAreas(),
          getPermissoesAreasRegistry()
        ]);

        const setoresAtivos = sortByName(Array.isArray(setoresRes) ? setoresRes.filter((setor) => setor?.ativo !== false) : []);
        const usuariosAtivos = Array.isArray(usuariosRes) ? usuariosRes.filter((usuario) => usuario?.ativo !== false) : [];

        setSetores(setoresAtivos);
        setUsuarios(usuariosAtivos);
        setRegistry(Array.isArray(registryRes) ? registryRes : []);
        setPadroes(normalizePadroes(configRes?.padroes_setor_perfil));

        if (!setorSelecionado && setoresAtivos.length) {
          setSetorSelecionado(getSetorId(setoresAtivos[0]));
        }
      } catch (error) {
        console.error(error);
        avisar.erro('Não foi possível carregar as permissões padrão.');
      } finally {
        setLoading(false);
      }
    }

    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const perfisDisponiveis = useMemo(() => {
    const perfisUsuarios = usuarios.map((usuario) => normalizePerfil(usuario?.perfil));
    return uniq([...PERFIS_BASE, ...perfisUsuarios]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [usuarios]);

  const setorAtual = useMemo(
    () => setores.find((setor) => getSetorId(setor) === String(setorSelecionado)),
    [setores, setorSelecionado]
  );

  const moduleEnabledMap = useMemo(() => {
    const source = registry?.module_settings || registry;
    return buildModuleEnabledMap(source);
  }, [registry]);

  const permissoesObrigatorias = useMemo(() => {
    return isSetorObra(setorAtual) ? [PERMISSAO_SOLICITACOES_MINHAS] : [];
  }, [setorAtual]);

  const permissoesAtuais = useMemo(() => {
    const lista = padroes[String(setorSelecionado)]?.[perfilSelecionado] || [];
    return uniq([...lista.map(normalizeKey), ...permissoesObrigatorias]);
  }, [padroes, perfilSelecionado, setorSelecionado, permissoesObrigatorias]);

  function updatePermissoes(nextList) {
    setPadroes((current) => ({
      ...current,
      [String(setorSelecionado)]: {
        ...(current[String(setorSelecionado)] || {}),
        [perfilSelecionado]: uniq([...nextList.map(normalizeKey), ...permissoesObrigatorias])
      }
    }));
  }

  function togglePermissao(key) {
    const normalized = normalizeKey(key);
    if (permissoesObrigatorias.includes(normalized)) return;

    if (isComprasScopeKey(normalized)) {
      const atual = getEffectiveComprasScope(permissoesAtuais);
      if (atual === normalized) return;
      updatePermissoes([
        ...permissoesAtuais.filter((item) => !isComprasScopeKey(item)),
        normalized
      ]);
      return;
    }

    if (permissoesAtuais.includes(normalized)) {
      updatePermissoes(permissoesAtuais.filter((item) => item !== normalized));
      return;
    }

    updatePermissoes([...permissoesAtuais, normalized]);
  }

  function selectAll(keys) {
    const normalizedKeys = keys.map(normalizeKey);
    const possuiEscopoCompras = normalizedKeys.some(isComprasScopeKey);
    updatePermissoes(uniq([
      ...permissoesAtuais.filter((key) => !possuiEscopoCompras || !isComprasScopeKey(key)),
      ...normalizedKeys.filter((key) => !isComprasScopeKey(key)),
      ...(possuiEscopoCompras ? [COMPRAS_SCOPE_SELECT_ALL] : [])
    ]));
  }

  function clearAll(keys) {
    const removable = new Set(keys.map(normalizeKey).filter((key) => !permissoesObrigatorias.includes(key)));
    updatePermissoes(permissoesAtuais.filter((key) => !removable.has(key)));
  }

  async function salvar() {
    try {
      setSaving(true);
      const resultado = await salvarPermissoesAreas({ padroes_setor_perfil: padroes });
      setPadroes(normalizePadroes(resultado?.padroes_setor_perfil));
      avisar.sucesso('Permissões padrão por setor e perfil salvas.');
    } catch (error) {
      console.error(error);
      avisar.erro('Não foi possível salvar as permissões padrão.');
    } finally {
      setSaving(false);
    }
  }

  return (
    // C1/R13: a tela é ALTA (a matriz inteira de módulos rola) e o
    // "Salvar padroes" saía da vista. Com Pagina + PageHeader o cabeçalho
    // gruda abaixo da topbar, compacta ao rolar e a ação principal fica
    // sempre a um clique. O ritmo vertical (16px entre blocos) é do Pagina —
    // por isso o `space-y-6` da raiz saiu.
    <Pagina>
      {/* C6/R11 (decisão do cliente, 04/09): navegação não mora em barra de
          ação — mora no hub, no breadcrumb e na busca. O link "Excecoes por
          usuario" saiu daqui; a tela de exceções por usuário tem porta
          própria no hub de Configurações, grupo "Status e Vinculos". */}
      <PageHeader
        titulo="Permissões por Setor e Perfil"
        descricao="Configurações · Defina a matriz padrão para todos os usuários de um setor e perfil. Permissões adicionais continuam sendo configuradas por usuário na tela granular existente."
        acaoPrincipal={{
          rotulo: saving ? 'Salvando...' : 'Salvar padroes',
          onClick: salvar,
          desabilitada: saving || loading
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* R5: a contagem do padrão atual é apoio DESTE bloco (depende do setor
          e do perfil escolhidos ao lado), não da tela — por isso vive nas
          props contagem/descricao do BlocoConteudo e não se repete na faixa
          do topo (B3). Com ela fora da grade, restaram as duas colunas dos
          seletores e a medida arbitrária da grade deixou de existir. */}
      <BlocoConteudo
        titulo="Contexto do padrão"
        variante="primario"
        cor="var(--c-primary)"
        contagem={`${permissoesAtuais.length} permissão(oes)`}
        descricao="no padrão atual do setor e perfil selecionados"
      >
        {/* R12: estes dois selects são seletores de CONTEXTO (escolhem QUAL
            padrão está sendo editado, e o que for marcado é gravado neles) —
            legítimos pela própria regra, não são filtro de lista. */}
        <div className="grid gap-3 lg:grid-cols-2 lg:items-end">
          <label className="form-field">
            <span>Setor</span>
            <select value={setorSelecionado} onChange={(event) => setSetorSelecionado(event.target.value)}>
              {setores.map((setor) => (
                <option key={setor.id} value={getSetorId(setor)}>
                  {setor.nome || setor.codigo || `Setor ${setor.id}`}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Perfil</span>
            <select value={perfilSelecionado} onChange={(event) => setPerfilSelecionado(normalizePerfil(event.target.value))}>
              {perfisDisponiveis.map((perfil) => (
                <option key={perfil} value={perfil}>
                  {perfil}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Isto NÃO é aviso e por isso não passa pelo useAvisos: é CONDIÇÃO
            derivada do setor escolhido (fecha e o problema continua). Fica
            como faixa fixa ao lado do que descreve — só a cor virou token. */}
        {isSetorObra(setorAtual) && (
          <div className="mt-4 rounded-xl border border-[var(--sem-success-border)] bg-[var(--sem-success-bg)] px-4 py-3 text-sm text-[var(--sem-success)]">
            Setor OBRA recebe automaticamente a permissão para ver suas próprias solicitações e solicitações das obras
            vinculadas ao usuario, sem liberar todas as solicitacoes do setor.
          </div>
        )}
      </BlocoConteudo>

      {loading ? (
        <div className="app-empty-card">Carregando permissões...</div>
      ) : (
        registry.map((grupo) => (
          <ModuleCard
            key={grupo.key}
            grupo={grupo}
            governance={getModuleGovernance(grupo.key)}
            moduleEnabled={moduleEnabledMap.has(grupo.key) ? moduleEnabledMap.get(grupo.key) : true}
            permissoesAtuais={permissoesAtuais}
            permissoesObrigatorias={permissoesObrigatorias}
            onTogglePermissao={togglePermissao}
            onSelectAll={selectAll}
            onClearAll={clearAll}
          />
        ))
      )}

      <BlocoConteudo titulo="Resumo dos módulos" variante="secundario">
        <div className="grid gap-3 xl:grid-cols-2">
          {MODULE_GOVERNANCE.map((item) => {
            const active = moduleEnabledMap.has(item.key) ? moduleEnabledMap.get(item.key) : true;
            return (
              <article key={item.key} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-canvas)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-muted)]">
                      {item.role}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-[var(--c-text)]">{item.label}</h3>
                  </div>
                  <span className={`badge ${active ? 'badge-success' : 'badge-muted'}`}>
                    {active ? 'Ativo' : 'Desabilitado'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--c-muted)]">{item.dependency}</p>
              </article>
            );
          })}
        </div>
      </BlocoConteudo>
    </Pagina>
  );
}
