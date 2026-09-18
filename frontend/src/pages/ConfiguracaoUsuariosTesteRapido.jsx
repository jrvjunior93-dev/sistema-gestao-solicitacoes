import { useEffect, useMemo, useState } from 'react';
import { HiOutlineMagnifyingGlass } from 'react-icons/hi2';
import { Avisos, BlocoConteudo, PageHeader, Pagina, useAvisos } from '../components/padrao';
import { useAuth } from '../contexts/AuthContext';
import { getDevUserSwitchConfig, updateDevUserSwitchConfig } from '../services/auth';
import { nomeProprio } from '../utils/texto';
import { ResizableTable, ResizableTh } from '../components/ResizableTable';

const USER_TABLE_COLUMNS = [
  { key: 'usar', size: 'selection' },
  { key: 'usuario', size: 'identity' },
  { key: 'setor', size: 'wide' },
  { key: 'perfil', size: 'standard' }
];

export default function ConfiguracaoUsuariosTesteRapido() {
  const { loadDevUserSwitch } = useAuth();
  const { avisos, avisar, fechar } = useAvisos();
  const [users, setUsers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getDevUserSwitchConfig()
      .then((data) => {
        if (!active) return;
        setUsers(data?.users || []);
        setSelectedIds((data?.user_ids || []).map(Number));
      })
      .catch((error) => {
        if (active) avisar.erro(error?.message || 'Erro ao carregar usuários de teste.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return users;
    return users.filter((user) => (
      `${user.nome} ${user.email} ${user.perfil} ${user.setor?.nome || ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(normalized)
    ));
  }, [query, users]);

  function toggleUser(userId) {
    const id = Number(userId);
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  async function save() {
    setSaving(true);
    try {
      const data = await updateDevUserSwitchConfig(selectedIds);
      setSelectedIds((data?.user_ids || []).map(Number));
      await loadDevUserSwitch();
      avisar.sucesso('Usuários disponíveis na troca rápida foram atualizados.');
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao salvar usuários de teste.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Pagina className="dev-user-config-page">
      <PageHeader
        titulo="Usuários para teste rápido"
        contagem={`${selectedIds.length} selecionado(s)`}
        descricao="Disponível apenas no ambiente de desenvolvimento para o SUPERADMIN validar fluxos e permissões."
        acaoPrincipal={{
          rotulo: saving ? 'Salvando...' : 'Salvar configuração',
          onClick: save,
          desabilitada: loading || saving
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Perfis disponíveis"
        descricao="Escolha até 20 usuários ativos. A troca não altera senha, setor, permissões ou sessão do usuário escolhido."
        variante="primario"
        cor="var(--c-primary)"
      >
        <label className="dev-user-config-search">
          <span className="sr-only">Buscar usuário</span>
          <HiOutlineMagnifyingGlass size={18} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, e-mail, setor ou perfil"
          />
        </label>

        <div className="app-table-shell min-w-0">
            <ResizableTable columns={USER_TABLE_COLUMNS} storageKey="config-usuarios-teste-rapido" className="table" scrollLabel="Usuários disponíveis para teste rápido">
              <thead>
                <tr>
                  <ResizableTh columnKey="usar" className="col-checkbox">Usar</ResizableTh>
                  <ResizableTh columnKey="usuario">Usuário</ResizableTh>
                  <ResizableTh columnKey="setor">Setor</ResizableTh>
                  <ResizableTh columnKey="perfil">Perfil</ResizableTh>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const selected = selectedIds.includes(Number(user.id));
                  return (
                    <tr key={user.id} className={selected ? 'is-selected' : ''}>
                      <td className="col-checkbox">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleUser(user.id)}
                          aria-label={`Disponibilizar ${user.nome} para teste rápido`}
                          disabled={!selected && selectedIds.length >= 20}
                        />
                      </td>
                      <td>
                        <strong>{nomeProprio(user.nome)}</strong>
                        <small className="dev-user-config-email">{user.email}</small>
                      </td>
                      <td>{user.setor?.nome || user.setor?.codigo || 'Sem setor'}</td>
                      <td>{user.perfil}</td>
                    </tr>
                  );
                })}
                {!loading && !filteredUsers.length && (
                  <tr><td colSpan="4" className="text-center text-muted">Nenhum usuário encontrado.</td></tr>
                )}
              </tbody>
            </ResizableTable>
        </div>
        {loading && <p className="text-muted">Carregando usuários...</p>}
      </BlocoConteudo>
    </Pagina>
  );
}
