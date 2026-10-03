import { useEffect, useMemo, useState } from 'react';
import { getUsuarios } from '../services/usuarios';
import {
  getUsuariosPermissoesRhDp,
  salvarUsuariosPermissoesRhDp
} from '../services/configuracoesSistema';
import { RH_DP_PERMISSION_GROUPS, normalizeRhDpPermissionList } from '../constants/rhDpPermissions';
import { Pagina, PageHeader, BlocoConteudo, BarraFiltros, Avisos, useAvisos } from '../components/padrao';

function normalizePermissionMap(input) {
  const source = input && typeof input === 'object' ? input : {};
  return Object.entries(source).reduce((acc, [userId, permissions]) => {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) {
      return acc;
    }

    const normalized = normalizeRhDpPermissionList(permissions);
    if (!normalized.length) {
      return acc;
    }

    acc[id] = normalized;
    return acc;
  }, {});
}

function sortUsuarios(lista = []) {
  return [...lista].sort((a, b) =>
    String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR', { sensitivity: 'base' })
  );
}

function perfilLabel(usuario) {
  return String(usuario?.perfil || '').trim().toUpperCase() || 'USUARIO';
}

function setorLabel(usuario) {
  return String(usuario?.setor?.nome || '-').trim().toUpperCase();
}

export default function UsuariosPermissoesRhDp() {
  const [usuarios, setUsuarios] = useState([]);
  const [selecionados, setSelecionados] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState('');
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    async function load() {
      const [listaUsuarios, config] = await Promise.all([
        getUsuarios(),
        getUsuariosPermissoesRhDp()
      ]);

      const ativos = Array.isArray(listaUsuarios)
        ? listaUsuarios.filter((usuario) => usuario?.ativo !== false)
        : [];

      setUsuarios(sortUsuarios(ativos));
      setSelecionados(normalizePermissionMap(config?.usuarios));
    }

    load().catch((error) => {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar permissoes do RH/DP');
    });
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const query = String(filtro || '').trim().toLowerCase();
    if (!query) {
      return usuarios;
    }

    return usuarios.filter((usuario) => {
      const haystack = [
        usuario?.nome,
        usuario?.email,
        usuario?.perfil,
        usuario?.setor?.nome
      ]
        .map((item) => String(item || '').toLowerCase())
        .join(' ');

      return haystack.includes(query);
    });
  }, [filtro, usuarios]);

  function togglePermission(userId, permissionKey) {
    const normalizedKey = String(permissionKey || '').trim().toLowerCase();
    const id = Number(userId);

    setSelecionados((current) => {
      const currentList = normalizeRhDpPermissionList(current[id] || []);
      const nextList = currentList.includes(normalizedKey)
        ? currentList.filter((item) => item !== normalizedKey)
        : [...currentList, normalizedKey];

      const next = { ...current };
      if (nextList.length) {
        next[id] = nextList;
      } else {
        delete next[id];
      }
      return next;
    });
  }

  async function salvar() {
    try {
      setSalvando(true);
      const payload = {
        usuarios: Object.entries(selecionados).reduce((acc, [userId, permissions]) => {
          const normalized = normalizeRhDpPermissionList(permissions);
          if (normalized.length) {
            acc[userId] = normalized;
          }
          return acc;
        }, {})
      };

      const response = await salvarUsuariosPermissoesRhDp(payload);
      setSelecionados(normalizePermissionMap(response?.usuarios));
      avisar.sucesso('Permissões do RH/DP salvas com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar permissoes do RH/DP');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Pagina className="rhdp-page">
      {/* C2: apoio na faixa (decisão 02/09) — contagem + descrição em uma
          linha no próprio PageHeader. */}
      <PageHeader
        titulo="Permissões RH/DP por usuário"
        contagem={`${Object.keys(selecionados).length} configurado(s)`}
        descricao="Monte usuários de RH e contabilidade sem criar perfil novo: o ADMINISTRADOR define exatamente quais áreas do RH/DP cada usuário pode operar."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar matriz de permissoes',
          onClick: salvar,
          desabilitada: salvando
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Regra base de acesso ao RH/DP"
        variante="secundario"
        recolhivel
        recolhidoPadrao
      >
        <p className="app-note">
          SUPERADMIN e ADMINISTRADOR continuam com bypass total. Esta tela serve para liberar
          acessos granulares aos demais usuarios, inclusive contabilidade com escopo parcial.
        </p>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Usuários ativos"
        variante="primario"
        cor="var(--c-primary)"
      >
        {/* F1: UMA busca, ocupando a largura da faixa (padrão BarraFiltros). */}
        <BarraFiltros
          busca={{
            valor: filtro,
            aoMudar: setFiltro,
            placeholder: 'Nome, email, perfil ou setor'
          }}
        />
        <div className="space-y-3">
          {usuariosFiltrados.map((usuario) => {
              const currentPermissions = normalizeRhDpPermissionList(selecionados[Number(usuario.id)] || []);

              return (
                <BlocoConteudo
                  key={usuario.id}
                  titulo={`${usuario.nome} — ${currentPermissions.length} permissão(oes)`}
                  variante="secundario"
                  recolhivel
                  recolhidoPadrao={currentPermissions.length === 0}
                >
                  <p className="app-note mb-3">
                    {usuario.email} · {perfilLabel(usuario)} · {setorLabel(usuario)}
                  </p>

                  <div className="grid gap-3 xl:grid-cols-2">
                    {RH_DP_PERMISSION_GROUPS.map((group) => (
                      <fieldset
                        key={group.key}
                        className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3"
                      >
                        <legend className="form-section-legenda">{group.label}</legend>
                        <div className="space-y-2">
                          {(group.permissions || []).map((permission) => {
                            const permissionKey = permission?.key || permission;
                            const permissionLabel = permission?.label || permissionKey;
                            const permissionDescription = permission?.description || '';
                            const checked = currentPermissions.includes(String(permissionKey).toLowerCase());

                            return (
                              <label
                                key={permissionKey}
                                title={permissionKey}
                                className="flex items-start gap-3 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={checked}
                                  onChange={() => togglePermission(usuario.id, permissionKey)}
                                />
                                <span className="flex flex-col gap-1">
                                  <span className="font-medium text-[var(--c-text)]">{permissionLabel}</span>
                                  <span className="app-note">{permissionDescription}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </BlocoConteudo>
              );
            })}

            {!usuariosFiltrados.length && (
              <div className="app-empty-card">
                Nenhum usuário encontrado para o filtro atual.
              </div>
            )}
          </div>
        </BlocoConteudo>
    </Pagina>
  );
}
