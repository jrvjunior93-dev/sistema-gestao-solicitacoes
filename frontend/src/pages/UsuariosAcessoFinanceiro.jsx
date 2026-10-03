import { useEffect, useMemo, useState } from 'react';
import { getUsuarios } from '../services/usuarios';
import {
  getUsuariosAcessoFinanceiro,
  salvarUsuariosAcessoFinanceiro
} from '../services/configuracoesSistema';
import { Pagina, PageHeader, BlocoConteudo, TabelaPadrao, CelulaDupla, Avisos, useAvisos } from '../components/padrao';
import StatusBadge from '../components/StatusBadge';

function hasFinanceiroBaseAccess(usuario) {
  const perfil = String(usuario?.perfil || '').trim().toUpperCase();
  if (perfil === 'SUPERADMIN' || perfil === 'ADMINISTRADOR' || perfil === 'FINANCEIRO') {
    return true;
  }

  return Boolean(usuario?.setor?.eh_setor_financeiro);
}

export default function UsuariosAcessoFinanceiro() {
  const [usuarios, setUsuarios] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
  const [salvando, setSalvando] = useState(false);
  // R3 (02/09): aviso do sistema no lugar da caixa do navegador.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    async function load() {
      const [listaUsuarios, cfg] = await Promise.all([
        getUsuarios(),
        getUsuariosAcessoFinanceiro()
      ]);

      const usuariosAtivos = Array.isArray(listaUsuarios)
        ? listaUsuarios.filter((usuario) => usuario?.ativo !== false)
        : [];
      setUsuarios(usuariosAtivos);

      const listaCfg = Array.isArray(cfg?.usuarios) ? cfg.usuarios : [];
      setSelecionados(new Set(listaCfg.map((item) => Number(item))));
    }

    load();
  }, []);

  const usuariosOrdenados = useMemo(() => (
    [...usuarios].sort((a, b) =>
      String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR', { sensitivity: 'base' })
    )
  ), [usuarios]);

  function alternarUsuario(usuarioId) {
    const key = Number(usuarioId);
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function salvar() {
    try {
      setSalvando(true);
      await salvarUsuariosAcessoFinanceiro({ usuarios: Array.from(selecionados) });
      avisar.sucesso('Configuração salva com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao salvar configuração.');
    } finally {
      setSalvando(false);
    }
  }

  const colunas = [
    {
      id: 'extra',
      sempreVisivel: true,
      titulo: 'Acesso extra',
      tipo: 'status',
      render: (usuario) => (
        <input
          type="checkbox"
          checked={selecionados.has(Number(usuario.id))}
          onChange={() => alternarUsuario(usuario.id)}
          aria-label={`Liberar acesso ao financeiro para ${usuario.nome}`}
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
      id: 'setor',
      titulo: 'Setor',
      tipo: 'badge',
      render: (usuario) => String(usuario?.setor?.nome || '-').toUpperCase()
    },
    {
      id: 'perfil',
      titulo: 'Perfil',
      tipo: 'badge',
      render: (usuario) => String(usuario?.perfil || '').toUpperCase() || '-'
    },
    {
      id: 'base',
      titulo: 'Regra base',
      tipo: 'status',
      render: (usuario) => (
        hasFinanceiroBaseAccess(usuario) ? (
          <span title="Já possui acesso por perfil/setor, mesmo sem marcacao nesta tela">
            <StatusBadge status="Ja liberado" kind="success" />
          </span>
        ) : (
          <span className="text-[var(--c-muted)]">-</span>
        )
      )
    }
  ];

  return (
    <Pagina>
      {/* C2: apoio na faixa (decisão 02/09) — contagem + descrição em uma
          linha no próprio PageHeader. */}
      <PageHeader
        titulo="Acesso ao financeiro por usuário"
        contagem={`${selecionados.size} com acesso extra`}
        descricao="Marque usuários extras que devem acessar o módulo financeiro. Usuários liberados aqui também passam a operar o financeiro com acesso a todas as obras."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar',
          onClick: salvar,
          desabilitada: salvando
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Quem já tem acesso por regra base"
        variante="secundario"
        recolhivel
        recolhidoPadrao
      >
        <p className="app-note">
          Perfis SUPERADMIN, ADMINISTRADOR, perfil FINANCEIRO e usuários de setor financeiro
          ja possuem acesso por regra base, mesmo sem marcacao nesta tela. Eles aparecem na
          lista com a etiqueta &quot;Ja liberado&quot;.
        </p>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Usuários ativos"
        variante="primario"
        cor="var(--module-financeiro)"
      >
        <TabelaPadrao
          colunas={colunas}
          itens={usuariosOrdenados}
          storageKey="tabela:usuarios-acesso-financeiro"
          vazio={{
            title: 'Nenhum usuario para exibir',
            message: 'Aguarde o carregamento ou verifique o cadastro de usuarios ativos.'
          }}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
