import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUsuarios } from '../services/usuarios';
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
import { isSuperadmin } from '../utils/acessoProduto';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BarraFiltros,
  StatGrid,
  StatTile,
  Avisos,
  useAvisos
} from '../components/padrao';

const PERMISSAO_SOLICITACOES_MINHAS = 'solicitacoes.lista.visualizar_minhas';
const COMPRAS_SCOPE_KEYS = [
  'compras.escopo.minhas_atribuidas',
  'compras.escopo.setor',
  'compras.escopo.todas'
];
const COMPRAS_SCOPE_DEFAULT = 'compras.escopo.minhas_atribuidas';
const COMPRAS_SCOPE_SELECT_ALL = 'compras.escopo.setor';

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePerfil(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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

function normalizeMapa(input) {
  if (!input || typeof input !== 'object') return {};
  return Object.entries(input).reduce((acc, [userId, perms]) => {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return acc;

    const lista = Array.isArray(perms)
      ? [...new Set(perms.map(normalizeKey).filter(Boolean))]
      : [];

    // Lista vazia e uma configuracao explicita valida (nega todas). Remover a
    // chave faria o runtime voltar ao acesso legado irrestrito.
    acc[id] = lista;
    return acc;
  }, {});
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

function sortUsuarios(lista = []) {
  return [...lista].sort((a, b) =>
    String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR', { sensitivity: 'base' })
  );
}

function isSetorObra(setor) {
  const tokens = [setor?.codigo, setor?.nome, setor?.slug]
    .map(normalizeToken)
    .filter(Boolean);

  return Boolean(setor?.eh_setor_obra) || tokens.some((token) => token === 'OBRA' || token.includes('OBRA'));
}

function getSetorPermissionKeys(usuario) {
  const values = [
    usuario?.setor_id,
    usuario?.setor?.id,
    usuario?.setor?.codigo,
    usuario?.setor?.nome
  ];

  return [...new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .flatMap((value) => [value, normalizeToken(value)])
      .filter(Boolean)
  )];
}

function getPermissoesPadraoUsuario(usuario, padroesSetorPerfil) {
  if (!usuario || !padroesSetorPerfil || typeof padroesSetorPerfil !== 'object') return [];

  const perfil = normalizePerfil(usuario?.perfil);
  const permissoes = [];

  getSetorPermissionKeys(usuario).forEach((setorKey) => {
    const perfis = padroesSetorPerfil[setorKey] || padroesSetorPerfil[normalizeToken(setorKey)];
    if (perfis?.[perfil]) {
      permissoes.push(...perfis[perfil]);
    }
  });

  if (isSetorObra(usuario?.setor)) {
    permissoes.push(PERMISSAO_SOLICITACOES_MINHAS);
  }

  return [...new Set(permissoes.map(normalizeKey).filter(Boolean))];
}

function hasPadraoConfiguradoUsuario(usuario, padroesSetorPerfil) {
  if (!usuario || !padroesSetorPerfil || typeof padroesSetorPerfil !== 'object') return false;
  if (isSetorObra(usuario?.setor)) return true;

  const perfil = normalizePerfil(usuario?.perfil);
  return getSetorPermissionKeys(usuario).some((setorKey) => {
    const perfis = padroesSetorPerfil[setorKey] || padroesSetorPerfil[normalizeToken(setorKey)];
    return Boolean(perfis) && Object.prototype.hasOwnProperty.call(perfis, perfil);
  });
}

function isBypassAdmin(usuario) {
  const perfil = String(usuario?.perfil || '').trim().toUpperCase();
  return perfil === 'SUPERADMIN' || perfil === 'ADMINISTRADOR';
}

// R25: as quatro cores de perfil vinham de paleta crua (violet/sky/emerald/
// slate), que não tem par no tema escuro nem passa pelo piso de contraste do
// ThemeContext. Passaram para as pílulas do sistema, que apontam para token:
// os dois perfis com BYPASS TOTAL ficam em `warning` e `info` (privilégio
// merece destaque), FINANCEIRO em `success` e o resto neutro. Quatro
// aparências distintas, como antes — só que dentro do tema.
function BadgePerfil({ perfil }) {
  const token = String(perfil || '').toUpperCase();
  const classeBadge =
    token === 'SUPERADMIN' ? 'badge-warning' :
    token === 'ADMINISTRADOR' ? 'badge-info' :
    token === 'FINANCEIRO' ? 'badge-success' :
    'badge-muted';

  return (
    <span className={`badge badge-sm uppercase tracking-wide ${classeBadge}`}>
      {token || 'USUARIO'}
    </span>
  );
}

function CheckboxItem({ permissao, checked, onChange, disabled, origem, inputType = 'checkbox', inputName }) {
  return (
    // R10/M2: py-3, gap-1, mt-1 e text-xs (12px) — o 10px/11px de antes fica
    // abaixo do piso de leitura e o py-2.5 fora dos degraus.
    // R25: realce do marcado e etiqueta de ORIGEM vêm de token semântico —
    // bloqueada=perigo, individual=informação, padrão=sucesso.
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors ${
        disabled
          ? 'cursor-not-allowed border-[var(--ui-border)] bg-[var(--ui-canvas)] opacity-40'
          : checked
            ? 'border-[var(--c-primary)] bg-[var(--sem-info-bg)]'
            : 'border-[var(--ui-border)] bg-[var(--ui-surface)] hover:bg-[var(--ui-canvas)]'
      }`}
    >
      <input
        type={inputType}
        name={inputName}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-1 shrink-0"
      />
      <span className="flex flex-col items-start gap-1">
        <span className="font-medium text-[var(--c-text)]">{permissao.label}</span>
        {permissao.descricao && (
          <span className="text-xs text-[var(--c-muted)]">{permissao.descricao}</span>
        )}
        {origem && (
          <span
            className={`badge badge-sm uppercase tracking-wide ${
              origem === 'bloqueada'
                ? 'badge-danger'
                : origem === 'individual'
                  ? 'badge-info'
                  : 'badge-success'
            }`}
          >
            {origem === 'bloqueada'
              ? 'Bloqueada neste usuario'
              : origem === 'individual'
                ? 'Permissao individual'
                : 'Padrao do setor/perfil'}
          </span>
        )}
        <span className="font-mono text-xs text-[var(--c-muted)] opacity-60">{permissao.key}</span>
      </span>
    </label>
  );
}

function ModuleGovernancePanel({ moduleEnabledMap }) {
  return (
    // O h2 de 16px (text-base) virou o título do BlocoConteudo, que já é o
    // degrau 18 da escala; o apoio virou a prop `descricao` do bloco.
    <BlocoConteudo
      titulo="Matriz modular relevante para permissão de área"
      variante="secundario"
      descricao="Esta leitura mostra o impacto estrutural dos módulos que mais afetam o fluxo principal da instalacao."
    >
      <p className="app-note mb-4">
        A tela de permissão não habilita módulo. Ela apenas restringe o que cada usuário pode operar nos módulos ativos.
      </p>

      <div className="grid gap-3 xl:grid-cols-2">
        {MODULE_GOVERNANCE.map((item) => {
          const active = moduleEnabledMap.has(item.key) ? moduleEnabledMap.get(item.key) : true;

          return (
            <article
              key={item.key}
              className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-canvas)] px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-muted)]">
                    {item.role}
                  </div>
                  <h3 className="mt-1 text-sm font-semibold text-[var(--c-text)]">{item.label}</h3>
                </div>
                <span className={`badge ${active ? 'badge-success' : 'badge-muted'}`}>
                  {active ? 'Ativo' : 'Desabilitado'}
                </span>
              </div>

              <div className="mt-3 space-y-2 text-xs text-[var(--c-muted)]">
                <p><strong className="text-[var(--c-text)]">Relação:</strong> {item.dependency}</p>
                <p><strong className="text-[var(--c-text)]">Usado em:</strong> {item.usedIn.join(' | ')}</p>
                <p><strong className="text-[var(--c-text)]">Ao desabilitar:</strong> {item.disabledEffect}</p>
              </div>
            </article>
          );
        })}
      </div>
    </BlocoConteudo>
  );
}

function ModuleCard({
  grupo,
  governance,
  moduleEnabled,
  sessionIsSuperadmin,
  selectedUserIsBypassAdmin,
  permissoesUsuarioAtual,
  permissoesPadraoUsuarioAtual,
  permissoesIndividuaisUsuarioAtual,
  permissoesBloqueadasUsuarioAtual,
  areaExpandida,
  onToggleArea,
  onTogglePermissao,
  onSelectAll,
  onClearAll
}) {
  const todasChaves = grupo.areas.flatMap((area) => area.permissoes.map((perm) => perm.key));
  const marcadas = todasChaves.filter((key) => permissoesUsuarioAtual.includes(normalizeKey(key)));

  const statusLabel = moduleEnabled
    ? 'Disponivel na instalacao'
    : (sessionIsSuperadmin ? 'Modulo desligado' : 'Recurso indisponivel');

  return (
    // O cartão do módulo virou BlocoConteudo: título no degrau de bloco,
    // apoio na prop `descricao` e as ações do módulo no slot `acoes`.
    // M1: "Marcar tudo"/"Desmarcar" perderam os overrides `px-2 py-0.5
    // text-[11px]`, que sobrescreviam o padding do `.btn` e podiam derrubar
    // a altura abaixo dos 32px do alvo mínimo. Quem impõe o alvo é o `.btn`.
    <BlocoConteudo
      titulo={grupo.label}
      descricao={grupo.descricao}
      acoes={(
        <>
          <span className={`badge ${moduleEnabled ? 'badge-success' : 'badge-muted'}`}>
            {statusLabel}
          </span>
          {selectedUserIsBypassAdmin ? (
            <span className="shrink-0 text-xs text-[var(--c-muted)]">Bypass total</span>
          ) : (
            <>
              <span className="badge badge-default tabular-nums">
                {marcadas.length}/{todasChaves.length}
              </span>
              <button type="button" className="btn btn-outline btn-sm" onClick={onSelectAll}>
                Marcar tudo
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={onClearAll}>
                Desmarcar
              </button>
            </>
          )}
        </>
      )}
    >
      {sessionIsSuperadmin && governance && (
        <p className="app-note mb-3">
          <strong className="text-[var(--c-text)]">Impacto operacional:</strong> {governance.disabledEffect}
        </p>
      )}

      {!moduleEnabled && (
        <div className="mb-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-canvas)] px-4 py-3 text-xs text-[var(--c-muted)]">
          {sessionIsSuperadmin
            ? 'As permissoes deste modulo podem ser configuradas agora, mas so entram em vigor quando o modulo for habilitado na instalacao.'
            : 'Este recurso nao esta disponivel nesta instalacao. As permissoes podem ser deixadas preparadas, mas permanecem inativas ate a liberacao.'}
        </div>
      )}

      {!selectedUserIsBypassAdmin && (
        <div className="divide-y divide-[var(--ui-border)] rounded-xl border border-[var(--ui-border)]">
          {grupo.areas.map((area) => {
            const aberta = areaExpandida === area.key;
            const areaEscopoCompras = area.key === 'compras.escopo';
            const escopoComprasAtivo = areaEscopoCompras
              ? getEffectiveComprasScope(permissoesUsuarioAtual)
              : null;
            const marcadasArea = area.permissoes.filter(
              (perm) => areaEscopoCompras
                ? normalizeKey(perm.key) === escopoComprasAtivo
                : permissoesUsuarioAtual.includes(normalizeKey(perm.key))
            ).length;

            return (
              <div key={area.key}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--ui-canvas)]"
                  onClick={() => onToggleArea(area.key)}
                >
                  <span className="text-sm font-semibold text-[var(--c-text)]">{area.label}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums text-xs text-[var(--c-muted)]">
                      {marcadasArea}/{area.permissoes.length}
                    </span>
                    <span className="text-xs text-[var(--c-muted)]">{aberta ? '▲' : '▼'}</span>
                  </div>
                </button>

                {aberta && (
                  <div className="grid gap-2 px-4 pb-3 sm:grid-cols-2">
                    {area.permissoes.map((perm) => {
                      const key = normalizeKey(perm.key);
                      const vemDoPadrao = permissoesPadraoUsuarioAtual.includes(key);
                      const individual = permissoesIndividuaisUsuarioAtual.includes(key);
                      const bloqueada = permissoesBloqueadasUsuarioAtual.includes(key);
                      return (
                        <CheckboxItem
                          key={perm.key}
                          permissao={perm}
                          checked={areaEscopoCompras ? key === escopoComprasAtivo : permissoesUsuarioAtual.includes(key)}
                          onChange={() => onTogglePermissao(perm.key)}
                          disabled={false}
                          origem={bloqueada ? 'bloqueada' : individual ? 'individual' : vemDoPadrao ? 'padrao' : ''}
                          inputType={areaEscopoCompras ? 'radio' : 'checkbox'}
                          inputName={areaEscopoCompras ? `compras-escopo-${normalizeKey(grupo.modulo)}` : undefined}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </BlocoConteudo>
  );
}

export default function PermissoesAreas() {
  const { user, updateUser } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [registry, setRegistry] = useState([]);
  const [mapa, setMapa] = useState({});
  const [bloqueiosMapa, setBloqueiosMapa] = useState({});
  const [padroesSetorPerfil, setPadroesSetorPerfil] = useState({});
  const [usuarioSelecionadoId, setUsuarioSelecionadoId] = useState(null);
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [areaExpandida, setAreaExpandida] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  // R3/R19: até aqui a tela NÃO tinha canal de aviso nenhum — carregar,
  // salvar e falhar passavam todos pela caixa do Chrome. Agora todo retorno
  // sai na faixa do sistema, dentro da página e legível pelo harness.
  const { avisos, avisar, fechar } = useAvisos();

  const sessionIsSuperadmin = useMemo(() => isSuperadmin(user), [user]);
  const moduleEnabledMap = useMemo(
    () => buildModuleEnabledMap(user?.modulos_habilitados),
    [user]
  );

  useEffect(() => {
    async function load() {
      setCarregando(true);
      try {
        const [listaUsuarios, configAtual, registroPerms] = await Promise.all([
          getUsuarios(),
          getPermissoesAreas(),
          getPermissoesAreasRegistry()
        ]);

        const ativos = Array.isArray(listaUsuarios)
          ? listaUsuarios.filter((item) => item?.ativo !== false)
          : [];

        setUsuarios(sortUsuarios(ativos));
        setMapa(normalizeMapa(configAtual?.usuarios));
        setBloqueiosMapa(normalizeMapa(configAtual?.usuarios_bloqueios));
        setPadroesSetorPerfil(normalizePadroes(configAtual?.padroes_setor_perfil));
        setRegistry(Array.isArray(registroPerms) ? registroPerms : []);
      } catch (err) {
        console.error(err);
        avisar.erro(err?.message || 'Erro ao carregar configuracoes de permissoes');
      } finally {
        setCarregando(false);
      }
    }

    load();
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const filtro = String(filtroUsuario || '').trim().toLowerCase();
    if (!filtro) return usuarios;

    return usuarios.filter((item) => {
      const haystack = [item?.nome, item?.email, item?.perfil, item?.setor?.nome]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(filtro);
    });
  }, [filtroUsuario, usuarios]);

  const usuarioSelecionado = useMemo(
    () => usuarios.find((item) => item.id === usuarioSelecionadoId) || null,
    [usuarios, usuarioSelecionadoId]
  );

  const selectedUserIsBypassAdmin = useMemo(() => {
    return isBypassAdmin(usuarioSelecionado);
  }, [usuarioSelecionado]);

  const permissoesIndividuaisUsuarioAtual = useMemo(() => {
    if (!usuarioSelecionadoId) return [];
    return mapa[usuarioSelecionadoId] || [];
  }, [mapa, usuarioSelecionadoId]);

  const permissoesBloqueadasUsuarioAtual = useMemo(() => {
    if (!usuarioSelecionadoId) return [];
    return bloqueiosMapa[usuarioSelecionadoId] || [];
  }, [bloqueiosMapa, usuarioSelecionadoId]);

  const permissoesPadraoUsuarioAtual = useMemo(() => {
    if (!usuarioSelecionado) return [];
    return getPermissoesPadraoUsuario(usuarioSelecionado, padroesSetorPerfil);
  }, [padroesSetorPerfil, usuarioSelecionado]);

  const permissoesUsuarioAtual = useMemo(() => {
    const bloqueadas = new Set(permissoesBloqueadasUsuarioAtual);
    return [...new Set([...permissoesPadraoUsuarioAtual, ...permissoesIndividuaisUsuarioAtual])]
      .filter((key) => !bloqueadas.has(key));
  }, [permissoesBloqueadasUsuarioAtual, permissoesIndividuaisUsuarioAtual, permissoesPadraoUsuarioAtual]);

  const usuarioSelecionadoTemConfiguracao = useMemo(() => {
    if (!usuarioSelecionadoId || !usuarioSelecionado) return false;
    return Object.prototype.hasOwnProperty.call(mapa, usuarioSelecionadoId) ||
      hasPadraoConfiguradoUsuario(usuarioSelecionado, padroesSetorPerfil);
  }, [mapa, padroesSetorPerfil, usuarioSelecionado, usuarioSelecionadoId]);

  function setUserList(setter, userId, updater) {
    setter((current) => {
      const listaAtual = current[userId] || [];
      const proximaLista = [...new Set(updater(listaAtual).map(normalizeKey).filter(Boolean))];
      const next = { ...current };

      next[userId] = proximaLista;

      return next;
    });
  }

  function togglePermissao(permKey) {
    const id = usuarioSelecionadoId;
    if (!id) return;

    const normalizedKey = normalizeKey(permKey);
    const vemDoPadrao = permissoesPadraoUsuarioAtual.includes(normalizedKey);
    const estaBloqueada = permissoesBloqueadasUsuarioAtual.includes(normalizedKey);

    if (isComprasScopeKey(normalizedKey)) {
      const escopoAtual = getEffectiveComprasScope(permissoesUsuarioAtual);
      if (escopoAtual === normalizedKey) return;

      const padrao = new Set(permissoesPadraoUsuarioAtual);
      setUserList(setMapa, id, (lista) => [
        ...lista.filter((item) => !isComprasScopeKey(item)),
        ...(padrao.has(normalizedKey) ? [] : [normalizedKey])
      ]);
      setUserList(setBloqueiosMapa, id, (lista) => [
        ...lista.filter((item) => !isComprasScopeKey(item)),
        ...COMPRAS_SCOPE_KEYS.filter((key) => key !== normalizedKey && padrao.has(key))
      ]);
      return;
    }

    if (vemDoPadrao) {
      setUserList(setBloqueiosMapa, id, (lista) =>
        estaBloqueada ? lista.filter((item) => item !== normalizedKey) : [...lista, normalizedKey]
      );
      setUserList(setMapa, id, (lista) => lista.filter((item) => item !== normalizedKey));
      return;
    }

    setUserList(setMapa, id, (lista) =>
      lista.includes(normalizedKey)
        ? lista.filter((item) => item !== normalizedKey)
        : [...lista, normalizedKey]
    );
    setUserList(setBloqueiosMapa, id, (lista) => lista.filter((item) => item !== normalizedKey));
  }

  function toggleArea(areaKey) {
    setAreaExpandida((current) => (current === areaKey ? null : areaKey));
  }

  function selecionarTudoModulo(grupo) {
    if (!usuarioSelecionadoId || selectedUserIsBypassAdmin) return;

    const chavesOriginais = grupo.areas.flatMap((area) => area.permissoes.map((perm) => normalizeKey(perm.key)));
    const possuiEscopoCompras = chavesOriginais.some(isComprasScopeKey);
    const chaves = possuiEscopoCompras
      ? [...chavesOriginais.filter((key) => !isComprasScopeKey(key)), COMPRAS_SCOPE_SELECT_ALL]
      : chavesOriginais;
    const padrao = new Set(permissoesPadraoUsuarioAtual);
    setUserList(setMapa, usuarioSelecionadoId, (lista) => [
      ...lista.filter((key) => !possuiEscopoCompras || !isComprasScopeKey(key)),
      ...chaves.filter((key) => !padrao.has(key))
    ]);
    setUserList(setBloqueiosMapa, usuarioSelecionadoId, (lista) =>
      [
        ...lista.filter((item) => !chaves.includes(item) && (!possuiEscopoCompras || !isComprasScopeKey(item))),
        ...(possuiEscopoCompras
          ? COMPRAS_SCOPE_KEYS.filter((key) => key !== COMPRAS_SCOPE_SELECT_ALL && padrao.has(key))
          : [])
      ]
    );
  }

  function desmarcarTudoModulo(grupo) {
    if (!usuarioSelecionadoId || selectedUserIsBypassAdmin) return;

    const removidas = new Set(
      grupo.areas.flatMap((area) => area.permissoes.map((perm) => normalizeKey(perm.key)))
    );

    const padrao = new Set(permissoesPadraoUsuarioAtual);
    setUserList(setMapa, usuarioSelecionadoId, (lista) => lista.filter((item) => !removidas.has(item)));
    setUserList(setBloqueiosMapa, usuarioSelecionadoId, (lista) => [
      ...lista.filter((item) => !removidas.has(item)),
      ...Array.from(removidas).filter((key) => padrao.has(key))
    ]);
  }

  async function salvar() {
    try {
      setSalvando(true);
      const resultado = await salvarPermissoesAreas({
        usuarios: mapa,
        usuarios_bloqueios: bloqueiosMapa
      });
      const persistedMap = normalizeMapa(resultado?.usuarios);
      const persistedBlocks = normalizeMapa(resultado?.usuarios_bloqueios);
      setMapa(persistedMap);
      setBloqueiosMapa(persistedBlocks);
      if (Number(usuarioSelecionadoId) === Number(user?.id)) {
        const padroesUsuario = getPermissoesPadraoUsuario(usuarioSelecionado, normalizePadroes(resultado?.padroes_setor_perfil));
        const bloqueadas = new Set(persistedBlocks[usuarioSelecionadoId] || []);
        updateUser({
          areas_permissoes: [...new Set([...padroesUsuario, ...(persistedMap[usuarioSelecionadoId] || [])])]
            .filter((key) => !bloqueadas.has(key)),
          areas_permissoes_configuradas:
            Object.prototype.hasOwnProperty.call(persistedMap, usuarioSelecionadoId) ||
            hasPadraoConfiguradoUsuario(usuarioSelecionado, normalizePadroes(resultado?.padroes_setor_perfil))
        });
      }
      avisar.sucesso('Permissões salvas com sucesso.');
    } catch (err) {
      console.error(err);
      avisar.erro(err?.message || 'Erro ao salvar permissoes');
    } finally {
      setSalvando(false);
    }
  }

  return (
    /*
      C1/R13 — A LIÇÃO DA `.app-toolbar-card`.

      Esta tela usava `card sol-surface-card app-toolbar-card` no topo, com
      `app-page-header-row` e `app-page-actions` dentro. Parecia o cabeçalho
      certo e tinha até os nomes certos — mas a `.app-toolbar-card` é só
      `display:flex; flex-direction:column; gap`. Nenhum sticky, nenhuma
      compactação, nenhuma superfície de faixa fixa. Numa tela de 800+ linhas
      o "Salvar permissoes" saía da vista na primeira rolagem e não voltava.

      **Classe PARECIDA com a certa, sem o comportamento dela, é pior que
      classe nenhuma — porque parece resolvido.** Quem lesse este arquivo via
      `app-page-header-row` e concluía que a R13 estava atendida; só o DOM
      rolando denunciava. Quem impõe o comportamento é o `PageHeader`
      (`.app-page-header`, sticky em `--pos-cabecalho-fixo` medido pelo
      `Pagina`), e é dele que a tela passou a depender.
    */
    <Pagina>
      {/* C6/R11 (decisão do cliente, 04/09): navegação mora no hub, no
          breadcrumb e na busca — não na barra de ações. O link "Padroes por
          setor/perfil" saiu daqui: o destino tem porta própria no hub de
          Configurações (grupo "Status e Vinculos"), então remover não cria
          porta ausente. Ele ainda era um `<a href>` cru, que numa SPA faz
          recarga completa da página e joga fora o estado do React. */}
      <PageHeader
        titulo="Permissões adicionais por Usuário"
        // B3: a contagem da faixa e a do painel lateral são fatos DIFERENTES
        // — aqui, quantos usuários já têm exceção individual gravada (o
        // assunto da tela); lá, quantos a busca deixou na lista. Repetir o
        // mesmo número nos dois lugares é que seria defeito.
        contagem={carregando ? null : `${Object.keys(mapa).length} com excecao individual`}
        descricao="Adicione exceções individuais acima do padrão por setor e perfil. Nas operações críticas de pagamento, aprovação e preparacao/envio são papeis incompativeis, inclusive para perfis administrativos."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar permissoes',
          onClick: salvar,
          desabilitada: salvando || carregando
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* B5: texto não fica solto sobre o canvas — o "Como funciona" ganhou
          superfície própria. Não passa pelo useAvisos de propósito: é
          CONDIÇÃO permanente da tela (fecha e continua valendo), não evento.
          Recolhível para quem já sabe, visível por padrão para quem não. */}
      <BlocoConteudo titulo="Como funciona" variante="secundario" recolhivel>
        <p className="app-note">
          Esta tela mostra o acesso efetivo do usuário: padrão do setor/perfil, permissões individuais extras
          e bloqueios individuais. Se uma permissao herdada for desmarcada aqui, ela fica bloqueada apenas
          para este usuario.
        </p>
      </BlocoConteudo>

      {sessionIsSuperadmin ? (
        <ModuleGovernancePanel moduleEnabledMap={moduleEnabledMap} />
      ) : (
        <BlocoConteudo titulo="Leitura operacional" variante="secundario">
          <p className="app-note">
            Esta tela controla apenas o que cada usuário pode operar nos recursos disponíveis nesta instalacao.
            Se algum recurso ainda nao estiver disponivel, as permissoes podem ser deixadas prontas aqui, mas
            permanecem inativas ate a liberacao.
          </p>
        </BlocoConteudo>
      )}

      {carregando ? (
        <div className="app-empty-card">Carregando...</div>
      ) : (
        // R10: a grade era `lg:grid-cols-[280px,1fr]` — medida escrita na
        // tela. Vira uma grade de 4 trilhas da própria escala: 1 para o
        // painel de usuários, 3 para a matriz.
        <div className="grid gap-4 lg:grid-cols-4">
          {/* F1/R16: UMA busca no contexto, e ela é a da BarraFiltros — a
              cápsula do sistema, que já traz a largura certa (.app-busca:
              220–480px, e 100% dentro do painel) e o botão de limpar. O
              `input input-sm w-full` cru saiu: `.app-busca` é classe de
              LARGURA, não de papel, e o papel de "caixa de busca" é do
              componente. A contagem da lista é apoio DESTE bloco. */}
          {/*
            B2 (medido no preview): a tela abria com ZERO bloco primário. O
            único `variante="primario"` desta tela é o bloco do usuário
            selecionado, e ele mora dentro do ramo `usuarioSelecionado` — que
            só existe DEPOIS de alguém clicar num nome. `usuarioSelecionadoId`
            nasce `null` e a tela não escolhe ninguém sozinha (nem deve: qual
            usuário editar é decisão de quem abriu a tela).

            Então o conserto não é inventar uma seleção: é decidir qual bloco
            é o principal NO ESTADO EM QUE A TELA ABRE. Sem usuário escolhido,
            o trabalho da tela é escolher um — a lista de usuários é o bloco
            que responde a pergunta do momento, e é ela que recebe a barra de
            cor. Assim que a escolha acontece, o principal passa a ser o bloco
            do usuário e este volta a neutro: continua UM primário por tela
            (B2) nos dois estados, e a barra de cor sempre aponta para onde o
            trabalho está agora.
          */}
          <BlocoConteudo
            titulo="Usuários"
            contagem={`${usuariosFiltrados.length} usuário(s)`}
            variante={usuarioSelecionado ? 'neutro' : 'primario'}
            cor="var(--c-primary)"
            className="self-start lg:col-span-1 lg:sticky lg:top-4"
          >
            <BarraFiltros
              busca={{
                valor: filtroUsuario,
                aoMudar: setFiltroUsuario,
                placeholder: 'Buscar usuário...'
              }}
            />

            {/* R18 "onde NÃO vale (1)": overflow-y auto é o contêiner de
                rolagem correto — só `hidden` sequestra sticky. */}
            <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
              {usuariosFiltrados.map((item) => {
                const extras = mapa[item.id] || [];
                const bloqueios = bloqueiosMapa[item.id] || [];
                const padroes = getPermissoesPadraoUsuario(item, padroesSetorPerfil);
                const qPerms = [...new Set([...padroes, ...extras])].filter((key) => !bloqueios.includes(key)).length;
                const configurado = Object.prototype.hasOwnProperty.call(mapa, item.id) ||
                  hasPadraoConfiguradoUsuario(item, padroesSetorPerfil);
                const perfil = String(item.perfil || '').toUpperCase();
                const ehBypass = perfil === 'SUPERADMIN' || perfil === 'ADMINISTRADOR';
                const ativo = item.id === usuarioSelecionadoId;

                return (
                  // A1: a linha da lista é um <button> de verdade — focável
                  // por teclado, com Enter/Espaço nativos. Nada a fazer aqui.
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full rounded-lg px-3 py-3 text-left transition-colors ${
                      ativo
                        ? 'bg-[var(--c-primary)] text-white'
                        : 'text-[var(--c-text)] hover:bg-[var(--ui-canvas)]'
                    }`}
                    onClick={() => {
                      setUsuarioSelecionadoId(item.id);
                      setAreaExpandida(null);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{item.nome}</span>
                      {ehBypass ? (
                        <span className={`shrink-0 text-xs ${ativo ? 'text-white/70' : 'text-[var(--c-muted)]'}`}>
                          bypass
                        </span>
                      ) : configurado ? (
                        <span className={`shrink-0 tabular-nums text-xs ${ativo ? 'text-white/80' : 'text-[var(--c-primary)]'}`}>
                          {qPerms} perm.
                        </span>
                      ) : (
                        // R25: o "legado" era amber cru nos dois estados. Fora
                        // da linha ativa vem do token de alerta; sobre o fundo
                        // primário (já semântico) o branco é o par legítimo.
                        <span className={`shrink-0 text-xs ${ativo ? 'text-white' : 'text-[var(--sem-warning)]'}`}>
                          legado
                        </span>
                      )}
                    </div>

                    <div className={`mt-1 flex items-center gap-2 ${ativo ? 'text-white/70' : 'text-[var(--c-muted)]'}`}>
                      <span className="truncate text-xs">{item.setor?.nome || 'Sem setor'}</span>
                      <BadgePerfil perfil={item.perfil} />
                    </div>
                  </button>
                );
              })}
            </div>
          </BlocoConteudo>

          <div className="space-y-4 lg:col-span-3">
            {!usuarioSelecionado ? (
              <div className="app-empty-card">
                <p className="text-sm text-[var(--c-muted)]">Selecione um usuário para configurar as permissões.</p>
              </div>
            ) : (
              <>
                {/* C4: o NOME do usuário é a identificação do registro que
                    está sendo editado — vai no título do bloco, com peso e
                    escala de título; e-mail, perfil e setor ficam ao lado.
                    O número "Permissoes configuradas" saiu do `text-2xl`
                    escrito à mão e virou StatTile: o ladrilho de dado único
                    do sistema, com rótulo, valor e sub na escala. */}
                <BlocoConteudo
                  titulo={usuarioSelecionado.nome}
                  descricao={usuarioSelecionado.email}
                  variante="primario"
                  cor="var(--c-primary)"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <BadgePerfil perfil={usuarioSelecionado.perfil} />
                      <span className="text-xs text-[var(--c-muted)]">
                        {usuarioSelecionado.setor?.nome || 'Sem setor'}
                      </span>
                    </div>

                    {selectedUserIsBypassAdmin ? (
                      <div className="rounded-lg border border-[var(--sem-info-border)] bg-[var(--sem-info-bg)] px-3 py-2 text-xs text-[var(--sem-info)]">
                        Bypass total: este perfil não e afetado por permissões de área.
                      </div>
                    ) : (
                      <StatGrid colunas={1}>
                        <StatTile
                          label="Permissões configuradas"
                          valor={permissoesUsuarioAtual.length}
                          sub={`${permissoesPadraoUsuarioAtual.length} padrão | ${permissoesIndividuaisUsuarioAtual.length} individual | ${permissoesBloqueadasUsuarioAtual.length} bloqueada(s)`}
                        />
                      </StatGrid>
                    )}
                  </div>
                </BlocoConteudo>

                {/* Também é CONDIÇÃO, não evento (fecha e o usuário continua
                    com acesso legado), então segue como faixa fixa ao lado do
                    que descreve — só a cor amber crua virou token de alerta. */}
                {!selectedUserIsBypassAdmin && !usuarioSelecionadoTemConfiguracao ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--sem-warning-border)] bg-[var(--sem-warning-bg)] px-4 py-3 text-sm text-[var(--sem-warning)]">
                    <div>
                      <strong>Acesso legado irrestrito:</strong> este usuario ainda nao possui configuracao individual
                      nem padrao de setor/perfil. Ative a matriz, marque somente o necessario e salve. Uma matriz ativa
                      com tudo desmarcado bloqueia todas as areas granulares.
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm shrink-0"
                      onClick={() => setUserList(setMapa, usuarioSelecionadoId, (lista) => lista)}
                    >
                      Ativar matriz granular
                    </button>
                  </div>
                ) : null}

                {registry.map((grupo) => {
                  const moduloKey = String(grupo.modulo || '').trim().toUpperCase();
                  const moduleEnabled = moduleEnabledMap.has(moduloKey) ? moduleEnabledMap.get(moduloKey) : true;
                  const governance = getModuleGovernance(moduloKey);

                  return (
                    <ModuleCard
                      key={grupo.modulo}
                      grupo={grupo}
                      governance={governance}
                      moduleEnabled={moduleEnabled}
                      sessionIsSuperadmin={sessionIsSuperadmin}
                      selectedUserIsBypassAdmin={selectedUserIsBypassAdmin}
                      permissoesUsuarioAtual={permissoesUsuarioAtual}
                      permissoesPadraoUsuarioAtual={permissoesPadraoUsuarioAtual}
                      permissoesIndividuaisUsuarioAtual={permissoesIndividuaisUsuarioAtual}
                      permissoesBloqueadasUsuarioAtual={permissoesBloqueadasUsuarioAtual}
                      areaExpandida={areaExpandida}
                      onToggleArea={toggleArea}
                      onTogglePermissao={togglePermissao}
                      onSelectAll={() => selecionarTudoModulo(grupo)}
                      onClearAll={() => desmarcarTudoModulo(grupo)}
                    />
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </Pagina>
  );
}
