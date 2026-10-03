import { useEffect, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  Avisos,
  useAvisos
} from '../components/padrao';
import { getSetorPermissoes, salvarSetorPermissao } from '../services/setorPermissoes';

export default function PermissoesSetor() {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(null);
  // R3/R19: aviso do sistema no lugar da caixa do navegador — as três
  // chamadas de alert() desta tela (carregar, salvar ok, salvar erro)
  // viram faixa dentro da página, com o tom semântico.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      const data = await getSetorPermissoes();
      setLista(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar permissoes.');
    } finally {
      setLoading(false);
    }
  }

  function atualizarLocal(id, campo, valor) {
    setLista(prev =>
      prev.map(item =>
        item.setor_id === id ? { ...item, [campo]: valor } : item
      )
    );
  }

  async function salvar(item) {
    try {
      setSalvando(item.setor_id);
      await salvarSetorPermissao({
        setor_id: item.setor_id,
        usuario_pode_assumir: !!item.usuario_pode_assumir,
        usuario_pode_atribuir: !!item.usuario_pode_atribuir,
        modo_recebimento: item.modo_recebimento || 'TODOS_VISIVEIS'
      });
      avisar.sucesso(`Permissoes de ${item.nome || item.codigo || item.setor_id} salvas.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar permissao.');
    } finally {
      setSalvando(null);
    }
  }

  return (
    // B5: o carregamento acontece DENTRO da estrutura padrão — antes a tela
    // devolvia `<p>Carregando permissões...</p>` cru, sem página, sem
    // cabeçalho e sem superfície. Quem carrega vê a mesma tela, com a
    // tabela em estado de carregamento.
    <Pagina>
      <PageHeader
        titulo="Permissões por Setor"
        contagem={loading ? null : `${lista.length} setor(es)`}
        descricao="Define quem pode assumir e atribuir solicitações em cada setor."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Setores"
        variante="primario"
        cor="var(--c-primary)"
      >
        <TabelaPadrao
          /*
            GRADE DE LANÇAMENTO, NÃO LISTA DE CONSULTA (05/09).
            A maioria das colunas aqui é campo de digitação, não dado a ler.
            Oferecer "escolher colunas" numa grade assim dá ao usuário como
            esconder o campo que ele precisa preencher — e ele não descobre por
            que o lançamento parou de funcionar. A capacidade sai DAQUI, não do
            sistema: nas 246 tabelas de consulta ela continua.
          */
          colunasConfiguraveis={false}
          colunas={[
            {
              id: 'setor',
              titulo: 'Setor',
              // R17: o setor é o registro desta lista.
              tipo: 'identidade',
              noCard: 'titulo',
              render: item => item.nome || item.codigo || item.setor_id
            },
            {
              id: 'pode_assumir',
              titulo: 'Usuário pode assumir',
              tipo: 'status',
              render: item => (
                <input
                  type="checkbox"
                  checked={!!item.usuario_pode_assumir}
                  onChange={e => atualizarLocal(item.setor_id, 'usuario_pode_assumir', e.target.checked)}
                />
              )
            },
            {
              id: 'pode_atribuir',
              titulo: 'Usuário pode atribuir',
              tipo: 'status',
              render: item => (
                <input
                  type="checkbox"
                  checked={!!item.usuario_pode_atribuir}
                  onChange={e => atualizarLocal(item.setor_id, 'usuario_pode_atribuir', e.target.checked)}
                />
              )
            }
          ]}
          itens={lista}
          carregando={loading}
          getId={item => item.setor_id}
          storageKey="tabela:permissoes-setor"
          rotuloRolagem="Permissoes por setor"
          vazio="Nenhum setor encontrado"
          acoesLinha={item => (
            // R2/M1: sem a classe `.btn` nada impunha o alvo mínimo de
            // 32×32 (44 no toque) — era um <button> nu com cor de link.
            // A cor sai junto (R25): a ênfase agora vem da variante.
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => salvar(item)}
              disabled={salvando === item.setor_id}
            >
              {salvando === item.setor_id ? 'Salvando...' : 'Salvar'}
            </button>
          )}
          larguraAcoes={120}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
