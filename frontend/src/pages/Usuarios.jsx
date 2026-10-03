import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiEnvelope } from 'react-icons/hi2';
import {
  getUsuarios,
  ativarUsuario,
  desativarUsuario,
  importarUsuariosEmMassa,
  enviarConviteUsuario,
  forcarResetSenhaUsuarios
} from '../services/usuarios';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { isSuperadmin } from '../utils/acessoProduto';

function resumirObras(vinculos) {
  const nomes = (vinculos || [])
    .map((v) => (v.obra ? (v.obra.codigo ? `${v.obra.codigo} - ${v.obra.nome}` : v.obra.nome) : null))
    .filter(Boolean);
  if (nomes.length === 0) return { texto: '-', completo: '' };
  // A coluna mostrava TODAS as obras em linha corrida e explodia a largura;
  // o dado completo continua no title (tooltip) — só a forma mudou.
  const visiveis = nomes.slice(0, 2).join(', ');
  const resto = nomes.length - 2;
  return {
    texto: resto > 0 ? `${visiveis} +${resto}` : visiveis,
    completo: nomes.join(', ')
  };
}

export default function Usuarios() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputImportacaoRef = useRef(null);
  const [usuarios, setUsuarios] = useState([]);
  const [importando, setImportando] = useState(false);
  const [loading, setLoading] = useState(true);
  const isSuperadminLogado = isSuperadmin(user);
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      const data = await getUsuarios();
      setUsuarios(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAtivo(usuario) {
    if (usuario.ativo) {
      await desativarUsuario(usuario.id);
    } else {
      await ativarUsuario(usuario.id);
    }
    carregar();
  }

  function baixarModeloImportacaoUsuarios() {
    const linhas = [
      ['Nome', 'Email', 'Setor', 'Perfil', 'Obras', 'Senha', 'Enviar convite'],
      ['Usuario Exemplo', 'usuario.exemplo@empresa.com', 'FINANCEIRO', 'USUARIO', '7|8', '', 'Sim']
    ];

    const csv = linhas
      .map((colunas) => colunas.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo-importacao-usuarios.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  async function onSelecionarArquivoImportacao(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!String(file.name || '').toLowerCase().endsWith('.csv')) {
      avisar.alerta('Utilize o arquivo modelo em CSV para importar usuários.');
      return;
    }

    const { ok } = await confirmar({
      titulo: 'Importar usuários em massa',
      mensagem: `Importar usuarios em massa usando o arquivo "${file.name}"?`,
      rotuloConfirmar: 'Importar'
    });
    if (!ok) {
      return;
    }

    try {
      setImportando(true);
      const resultado = await importarUsuariosEmMassa(file);
      await carregar();

      const importados = Number(resultado?.importados || 0);
      const ignorados = Number(resultado?.ignorados || 0);
      const convitesEnviados = Number(resultado?.convites_enviados || 0);
      const convitesErros = Number(resultado?.convites_erros || 0);
      const erros = Array.isArray(resultado?.erros) ? resultado.erros : [];
      if (erros.length > 0) {
        const resumo = erros.slice(0, 5).map((item) => `Linha ${item.linha}: ${item.error}`).join(' - ');
        avisar.alerta(
          `Importados: ${importados}. Ignorados: ${ignorados}. Convites enviados: ${convitesEnviados}. Falhas de convite: ${convitesErros}. Erros: ${erros.length}. ${resumo}${erros.length > 5 ? ' ...' : ''}`,
          'Importacao concluida com erros'
        );
      } else {
        avisar.sucesso(`Importacao concluida. Importados: ${importados}. Ignorados: ${ignorados}. Convites enviados: ${convitesEnviados}. Falhas de convite: ${convitesErros}.`);
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao importar usuarios em massa');
    } finally {
      setImportando(false);
    }
  }

  async function enviarConvite(usuario) {
    const { ok } = await confirmar({
      titulo: 'Enviar link de senha',
      mensagem: `Enviar link para definicao de senha para ${usuario.nome || usuario.email}?`,
      rotuloConfirmar: 'Enviar link'
    });
    if (!ok) {
      return;
    }

    try {
      const resultado = await enviarConviteUsuario(usuario.id);
      await carregar();
      if (resultado?.email_configurado === false) {
        avisar.alerta('Link gerado, mas o SMTP não esta configurado. Configure o e-mail antes de usar em produção.');
      } else {
        avisar.sucesso('Link enviado com sucesso.');
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao enviar link de senha');
    }
  }

  async function forcarResetSenhas() {
    const { ok } = await confirmar({
      titulo: 'Resetar senhas de todos',
      mensagem: 'Isso vai exigir que todos os usuários ativos redefinam a senha no próximo acesso e enviara links por e-mail. Deseja continuar?',
      rotuloConfirmar: 'Resetar senhas',
      rotuloCancelar: 'Manter senhas',
      destrutiva: true
    });
    if (!ok) {
      return;
    }

    try {
      const resultado = await forcarResetSenhaUsuarios();
      await carregar();
      avisar.sucesso(`Reset aplicado. Usuarios processados: ${resultado?.total || 0}. Links enviados: ${resultado?.enviados || 0}. Falhas: ${resultado?.falhas || 0}.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao forcar redefinicao de senhas');
    }
  }

  const colunas = [
    {
      id: 'usuario',
      titulo: 'Usuário',
      // Nome de usuário é identificação: exibido em maiúsculas (só exibição).
      tipo: 'identidade',
      noCard: 'titulo',
      render: (u) => <CelulaDupla principal={u.nome} sub={u.email} />
    },
    {
      id: 'setor',
      titulo: 'Setor',
      // Nome de setor é identidade; flex: false para a sobra continuar na
      // coluna principal (Usuario).
      tipo: 'identidade',
      flex: false,
      render: (u) => u.setor?.nome || '-'
    },
    {
      id: 'obras',
      titulo: 'Obras',
      tipo: 'texto',
      render: (u) => {
        const obras = resumirObras(u.vinculos);
        return <span title={obras.completo}>{obras.texto}</span>;
      }
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      render: (u) => <StatusBadge status={u.ativo ? 'Ativo' : 'Inativo'} />
    }
  ];

  return (
    <Pagina>
      {/* C2: apoio na faixa (decisão 02/09) — contagem + descrição em uma
          linha no próprio PageHeader; nada de apoio duplicado no bloco. */}
      <PageHeader
        titulo="Usuários"
        contagem={loading ? null : `${usuarios.length} usuario(s)`}
        descricao="Cadastro, importação e gestão operacional de usuários."
        acaoPrincipal={{ rotulo: 'Novo usuário', onClick: () => navigate('/usuarios/novo') }}
        /* Modelo e importação vinham do "⋯" (removido do sistema em 07/09)
           e são secundárias visíveis. "Resetar senhas de todos" era o item
           `perigosa` do menu, que o apartava com separador e cor de perigo:
           na faixa, o equivalente é o grupo APARTADO — por isso ela vai
           para `destrutiva`, e não para a fila das secundárias. */
        secundarias={[
          { rotulo: 'Baixar modelo CSV', onClick: baixarModeloImportacaoUsuarios },
          {
            rotulo: importando ? 'Importando…' : 'Importar usuarios (.csv)',
            desabilitada: importando,
            onClick: () => inputImportacaoRef.current?.click()
          }
        ]}
        destrutiva={isSuperadminLogado ? {
          rotulo: 'Resetar senhas de todos',
          title: 'Forcar redefinicao de senha para todos os usuarios ativos',
          onClick: forcarResetSenhas
        } : undefined}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <input
        ref={inputImportacaoRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onSelecionarArquivoImportacao}
        disabled={importando}
      />

      <BlocoConteudo
        titulo="Modelo de importação CSV"
        variante="secundario"
        recolhivel
        recolhidoPadrao
      >
        <p className="app-note">
          Colunas: Nome, Email, Setor, Perfil, Obras (separar por <code>|</code> ou <code>,</code>), Senha e Enviar convite. Perfis aceitos: <code>USUARIO</code>, <code>ESTAGIARIO</code>, <code>ADMIN</code>, <code>ADMINISTRADOR</code> e <code>SUPERADMIN</code>. Com convite marcado, a senha pode ficar vazia e o usuario define a propria senha pelo link seguro.
        </p>
      </BlocoConteudo>

      <BlocoConteudo
        variante="primario"
        cor="var(--c-primary)"
      >
        <TabelaPadrao
          colunas={colunas}
          itens={usuarios}
          carregando={loading}
          storageKey="tabela:usuarios"
          larguraAcoes={320}
          aoClicarLinha={(u) => navigate(`/usuarios/${u.id}`)}
          vazio={{
            title: 'Nenhum usuario cadastrado',
            message: 'Quando novos acessos forem criados ou importados, eles aparecem aqui.'
          }}
          acoesLinha={(u) => (
            <>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => enviarConvite(u)}
                title="Enviar link para definir ou redefinir senha"
              >
                <HiEnvelope className="w-4 h-4" />
                Convite
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => navigate(`/usuarios/${u.id}`)}>
                Editar
              </button>
              {u.ativo ? (
                <button className="btn btn-outline btn-sm btn-perigo-suave" onClick={() => toggleAtivo(u)}>
                  Desativar
                </button>
              ) : (
                <button className="btn btn-outline btn-sm" onClick={() => toggleAtivo(u)}>
                  Ativar
                </button>
              )}
            </>
          )}
        />
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
