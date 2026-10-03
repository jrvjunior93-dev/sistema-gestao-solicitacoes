import { useEffect, useMemo, useState } from 'react';
import {
  getUsuariosEnvioQualquerSetor,
  salvarUsuariosEnvioQualquerSetor
} from '../services/configuracoesSistema';
import { Pagina, PageHeader, BlocoConteudo, TabelaPadrao, CelulaDupla, BarraFiltros, Avisos, useAvisos } from '../components/padrao';
import StatusBadge from '../components/StatusBadge';

function normalizarTexto(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function UsuariosEnvioQualquerSetor() {
  const [usuarios, setUsuarios] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  // R3 (02/09): aviso do sistema no lugar da caixa do navegador.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    async function carregar() {
      try {
        setCarregando(true);
        const data = await getUsuariosEnvioQualquerSetor();
        const lista = Array.isArray(data?.usuarios) ? data.usuarios : [];
        setUsuarios(lista);
        setSelecionados(new Set(
          lista
            .filter(usuario => Boolean(usuario?.pode_enviar_qualquer_setor))
            .map(usuario => String(usuario.id))
        ));
      } catch (error) {
        console.error(error);
        avisar.erro('Erro ao carregar usuários com permissão especial de envio.');
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const termo = normalizarTexto(busca);
    return [...usuarios]
      .filter(usuario => {
        if (!termo) return true;
        const setorLabel = usuario?.setor?.nome || usuario?.setor?.codigo || '';
        return [usuario?.nome, usuario?.email, usuario?.perfil, setorLabel]
          .some(campo => normalizarTexto(campo).includes(termo));
      })
      .sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'));
  }, [usuarios, busca]);

  function alternarUsuario(usuarioId) {
    const key = String(usuarioId);
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selecionarFiltrados() {
    setSelecionados(prev => {
      const next = new Set(prev);
      usuariosFiltrados.forEach(usuario => next.add(String(usuario.id)));
      return next;
    });
  }

  function limparFiltrados() {
    setSelecionados(prev => {
      const next = new Set(prev);
      usuariosFiltrados.forEach(usuario => next.delete(String(usuario.id)));
      return next;
    });
  }

  async function salvar() {
    try {
      setSalvando(true);
      const usuarioIds = Array.from(selecionados)
        .map(id => Number(id))
        .filter(id => Number.isInteger(id) && id > 0);
      await salvarUsuariosEnvioQualquerSetor({ usuario_ids: usuarioIds });
      setUsuarios(prev => prev.map(usuario => ({
        ...usuario,
        pode_enviar_qualquer_setor: selecionados.has(String(usuario.id))
      })));
      avisar.sucesso('Configuração salva com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar permissao especial de envio.');
    } finally {
      setSalvando(false);
    }
  }

  const colunas = [
    {
      id: 'liberado',
      sempreVisivel: true,
      titulo: 'Liberado',
      tipo: 'status',
      render: (usuario) => (
        <input
          type="checkbox"
          checked={selecionados.has(String(usuario.id))}
          onChange={() => alternarUsuario(usuario.id)}
          aria-label={`Liberar envio livre para ${usuario.nome}`}
        />
      )
    },
    {
      id: 'usuario',
      titulo: 'Usuário',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (usuario) => <CelulaDupla principal={usuario.nome} sub={usuario.email} />
    },
    {
      id: 'perfil',
      titulo: 'Perfil',
      tipo: 'badge',
      render: (usuario) => String(usuario.perfil || '').toUpperCase() || '-'
    },
    {
      id: 'setor',
      titulo: 'Setor',
      tipo: 'badge',
      render: (usuario) => usuario?.setor?.nome || usuario?.setor?.codigo || '-'
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      render: (usuario) => <StatusBadge status={usuario?.ativo !== false ? 'Ativo' : 'Inativo'} />
    }
  ];

  return (
    <Pagina>
      {/* C2: apoio na faixa (decisão 02/09) — contagem + descrição em uma
          linha no próprio PageHeader. */}
      <PageHeader
        titulo="Envio livre entre setores"
        contagem={`${selecionados.size} marcado(s)`}
        descricao="Libera usuários específicos para enviar solicitações a outro setor mesmo quando elas não estão no setor atual deles. Usuários do setor OBRA continuam fora desta regra."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar',
          onClick: salvar,
          desabilitada: salvando || carregando
        }}
        secundarias={[
          { rotulo: 'Selecionar filtrados', onClick: selecionarFiltrados },
          { rotulo: 'Limpar filtrados', onClick: limparFiltrados }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Usuários"
        variante="primario"
        cor="var(--c-primary)"
      >
        {/* F1: UMA busca, ocupando a largura da faixa (padrão BarraFiltros). */}
        <BarraFiltros
          busca={{
            valor: busca,
            aoMudar: setBusca,
            placeholder: 'Nome, email, perfil ou setor'
          }}
        />
        <TabelaPadrao
          colunas={colunas}
          itens={usuariosFiltrados}
          carregando={carregando}
          storageKey="tabela:usuarios-envio-livre"
          vazio={{ title: 'Nenhum usuario encontrado' }}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
