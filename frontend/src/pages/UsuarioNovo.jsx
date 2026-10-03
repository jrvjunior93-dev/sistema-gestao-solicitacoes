import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_URL, authHeaders } from '../services/api';
import { getUsuario, criarUsuario, atualizarUsuario } from '../services/usuarios';
import { useAuth } from '../contexts/AuthContext';
import { isBusinessAdmin, isSuperadmin } from '../utils/acessoProduto';
import { useSafeNavigateBack } from '../utils/navigation';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';

export default function UsuarioNovo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const navigateBack = useSafeNavigateBack('/usuarios');
  const { id } = useParams();
  const editando = Boolean(id);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviarConvite, setEnviarConvite] = useState(true);
  const [perfil, setPerfil] = useState('');
  const [setorId, setSetorId] = useState('');
  const [obras, setObras] = useState([]);
  const [podeCriarSolicitacaoCompra, setPodeCriarSolicitacaoCompra] = useState(false);

  const [listaSetores, setListaSetores] = useState([]);
  const [listaObras, setListaObras] = useState([]);
  const [loading, setLoading] = useState(true);
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const isSuperadminLogado = isSuperadmin(user);
  const isBusinessAdminLogado = isBusinessAdmin(user);
  const perfilNormalizado = String(perfil || '').toUpperCase();
  const permissaoCompraTravada =
    perfilNormalizado === 'ADMIN' ||
    perfilNormalizado === 'ADMINISTRADOR' ||
    perfilNormalizado === 'SUPERADMIN';

  useEffect(() => {
    carregarDados();
  }, [id]);

  async function carregarDados() {
    try {
      setLoading(true);
      const [setores, obrasLista] = await Promise.all([
        fetch(`${API_URL}/setores`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_URL}/obras`, { headers: authHeaders() }).then(r => r.json())
      ]);

      setListaSetores(Array.isArray(setores) ? setores : []);
      setListaObras(Array.isArray(obrasLista) ? obrasLista : []);

      if (editando) {
        const usuario = await getUsuario(id);
        setNome(usuario.nome || '');
        setEmail(usuario.email || '');
        setPerfil(usuario.perfil || '');
        setSetorId(usuario.setor_id ? String(usuario.setor_id) : '');
        setPodeCriarSolicitacaoCompra(Boolean(usuario.pode_criar_solicitacao_compra));
        const vinculos = Array.isArray(usuario.vinculos) ? usuario.vinculos : [];
        setObras(vinculos.map(v => v.obra_id).filter(Boolean));
      }
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao carregar dados do usuário');
    } finally {
      setLoading(false);
    }
  }

  function toggleObra(idObra) {
    setObras((atual) => (
      atual.includes(idObra)
        ? atual.filter((obraId) => obraId !== idObra)
        : [...atual, idObra]
    ));
  }

  async function salvar(e) {
    e.preventDefault();

    const payload = {
      nome,
      email,
      senha,
      enviar_convite: enviarConvite,
      perfil,
      setor_id: setorId || null,
      obras,
      pode_criar_solicitacao_compra: podeCriarSolicitacaoCompra
    };

    if (editando && !senha.trim()) {
      delete payload.senha;
    }

    if (!editando && enviarConvite && !senha.trim()) {
      delete payload.senha;
    }

    if (!editando && !enviarConvite && !senha.trim()) {
      avisar.alerta('Informe uma senha inicial forte ou mantenha o envio de link por e-mail habilitado.');
      return;
    }

    try {
      const resultado = editando
        ? await atualizarUsuario(id, payload)
        : await criarUsuario(payload);

      if (!editando && resultado?.convite_erro) {
        // A faixa de avisos morreria com a tela: logo abaixo saímos para
        // /usuarios e o usuário nunca leria que o link não foi enviado. O
        // A caixa do navegador daqui segurava a navegação até ser
        // dispensada — a confirmação do sistema faz o mesmo, e sair é o
        // único caminho (os dois botões seguem para a listagem).
        await confirmar({
          titulo: 'Usuário criado, link não enviado',
          mensagem: `Usuario criado, mas o link de definicao de senha nao foi enviado: ${resultado.convite_erro}`,
          rotuloConfirmar: 'Entendi',
          rotuloCancelar: 'Fechar'
        });
      }
      navigate('/usuarios');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar usuario');
    }
  }

  if (loading) {
    return (
      <Pagina>
        <div className="app-empty-card">Carregando usuário...</div>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {/* C3: tela de REGISTRO (formulário de um usuário) leva a seta de
          voltar à esquerda — affordance primária de retorno à listagem. */}
      <PageHeader
        titulo={editando ? 'Editar usuario' : 'Novo usuario'}
        descricao="Dados de acesso, perfil, permissões e obras vinculadas."
        voltar={{ to: '/usuarios', title: 'Voltar para usuários' }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <form onSubmit={salvar} className="space-y-3">
        {/* B3: o apoio da TELA mora na faixa; repetir aqui seria a mesma
            informação duas vezes. */}
        <BlocoConteudo
          variante="primario"
          cor="var(--sem-info)"
        >
          <div className="space-y-4">
            <FormSecao legenda="Identificação e acesso" colunas={2}>
              <CampoForm label="Nome" obrigatorio>
                <input
                  className="input w-full"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  required
                />
              </CampoForm>

              <CampoForm label="Email" obrigatorio>
                <input
                  className="input w-full"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </CampoForm>

              <CampoForm
                label="Senha"
                obrigatorio={!editando && !enviarConvite}
                hint={
                  editando
                    ? 'Deixe em branco para manter a senha atual.'
                    : enviarConvite
                      ? 'Opcional: o usuario recebera um link seguro para definir a propria senha.'
                      : 'Informe uma senha inicial forte.'
                }
              >
                <input
                  type="password"
                  className="input w-full"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required={!editando && !enviarConvite}
                />
              </CampoForm>

              <CampoForm label="Perfil" obrigatorio>
                <select
                  className="input w-full"
                  value={perfil}
                  onChange={e => setPerfil(e.target.value)}
                  required
                >
                  <option value="">Selecione</option>
                  {isBusinessAdminLogado && <option value="ADMINISTRADOR">ADMINISTRADOR</option>}
                  <option value="ADMIN">ADMIN</option>
                  <option value="ESTAGIARIO">ESTAGIARIO</option>
                  {isSuperadminLogado && <option value="SUPERADMIN">SUPERADMIN</option>}
                  <option value="USUARIO">USUARIO</option>
                </select>
              </CampoForm>

              <CampoForm label="Setor">
                <select
                  className="input w-full"
                  value={setorId}
                  onChange={e => setSetorId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {listaSetores.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </CampoForm>
            </FormSecao>

            {!editando && (
              <BlocoConteudo
                titulo="Convite por e-mail"
                variante="secundario"
                recolhivel
                recolhidoPadrao={!enviarConvite}
                key="convite-novo"
              >
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={enviarConvite}
                    onChange={e => setEnviarConvite(e.target.checked)}
                  />
                  <span className="grid gap-1">
                    <span className="font-medium">Enviar link para definir senha por e-mail</span>
                    <span className="app-note">
                      O usuário recebe um link seguro para criar a própria senha. Se desmarcar, informe uma senha inicial forte.
                    </span>
                  </span>
                </label>
              </BlocoConteudo>
            )}

            {isBusinessAdminLogado && (
              <BlocoConteudo
                titulo="Permissão de solicitação de compra"
                variante="secundario"
                recolhivel
                recolhidoPadrao={!(permissaoCompraTravada || podeCriarSolicitacaoCompra)}
                key={`compra-${id || 'novo'}`}
              >
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={permissaoCompraTravada ? true : podeCriarSolicitacaoCompra}
                    onChange={e => setPodeCriarSolicitacaoCompra(e.target.checked)}
                    disabled={permissaoCompraTravada}
                  />
                  <span className="grid gap-1">
                    <span className="font-medium">Permitir acesso a Nova Solicitação de Compra</span>
                    <span className="app-note">
                      {permissaoCompraTravada
                        ? 'Perfis ADMIN, ADMINISTRADOR e SUPERADMIN ja possuem esse acesso automaticamente.'
                        : 'Define se este usuário pode acessar e utilizar a tela de Nova Solicitação de Compra.'}
                    </span>
                  </span>
                </label>
              </BlocoConteudo>
            )}

            <BlocoConteudo
              titulo={`Obras vinculadas (${obras.length} selecionada(s))`}
              variante="secundario"
            >
              <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]">
                {listaObras.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-[var(--c-muted)]">
                    Nenhuma obra disponível para vínculo.
                  </div>
                ) : (
                  listaObras.map((obra) => {
                    const checked = obras.includes(obra.id);

                    return (
                      <label
                        key={obra.id}
                        title={`ID ${obra.id}`}
                        className={`flex cursor-pointer items-center gap-3 border-b border-[var(--c-border)] px-4 py-3 text-sm last:border-b-0 ${
                          checked ? 'bg-[var(--sem-info-bg)]' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleObra(obra.id)}
                        />
                        <span className="font-medium">
                          {obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </BlocoConteudo>

            <div className="app-actionbar">
              <button type="submit" className="btn btn-primary">
                Salvar
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => navigateBack('/usuarios')}
              >
                Cancelar
              </button>
            </div>
          </div>
        </BlocoConteudo>
      </form>

      {elementoConfirmacao}
    </Pagina>
  );
}
