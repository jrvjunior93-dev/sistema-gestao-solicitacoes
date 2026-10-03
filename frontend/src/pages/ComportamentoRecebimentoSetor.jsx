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

const MODOS = [
  { value: 'ADMIN_PRIMEIRO', label: 'Admin primeiro (admin atribui)' },
  { value: 'TODOS_VISIVEIS', label: 'Todos visíveis (usuários podem assumir/atribuir)' }
];

export default function ComportamentoRecebimentoSetor() {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(null);
  // R3/R19: as três caixas do navegador (uma no carregar, duas no salvar)
  // viraram aviso do sistema — a do Chrome ignora tema e tokens, bloqueia a
  // página, não existe no DOM para o harness medir e some sem rastro.
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
      avisar.erro('Erro ao carregar configurações de recebimento.');
    } finally {
      setLoading(false);
    }
  }

  function atualizarLocal(setorId, modo) {
    setLista(prev =>
      prev.map(item =>
        item.setor_id === setorId ? { ...item, modo_recebimento: modo } : item
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
      avisar.sucesso('Comportamento salvo.');
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao salvar comportamento.');
    } finally {
      setSalvando(null);
    }
  }

  return (
    <Pagina>
      {/* C1/R13/C2: o `h1.page-title` estava solto, sem faixa fixa e sem
          apoio — em rolagem o título sumia e não havia contagem nenhuma
          dizendo quantos setores a lista traz. */}
      <PageHeader
        titulo="Comportamento de Recebimento por Setor"
        contagem={loading ? null : `${lista.length} setor(es)`}
        descricao="Defina como cada setor recebe as solicitações: o admin atribui primeiro ou todos os usuários enxergam e podem assumir."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Setores"
        variante="primario"
        cor="var(--c-primary)"
      >
        {/* B5: o `if (loading) return <p>Carregando...</p>` deixava um texto
            solto, sem superfície e sem cabeçalho — a tela inteira sumia
            enquanto carregava. O estado de carregamento é da tabela, que já
            o desenha dentro do bloco. */}
        <TabelaPadrao
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
              id: 'comportamento',
              sempreVisivel: true,
              titulo: 'Comportamento no recebimento',
              tipo: 'texto',
              flex: true,
              // R12: este select é ENTRADA DE DADO (o valor que será salvo
              // na linha), não filtro da lista — segue legítimo.
              render: item => (
                <select
                  className="input"
                  value={item.modo_recebimento || 'TODOS_VISIVEIS'}
                  onChange={e => atualizarLocal(item.setor_id, e.target.value)}
                >
                  {MODOS.map(modo => (
                    <option key={modo.value} value={modo.value}>
                      {modo.label}
                    </option>
                  ))}
                </select>
              )
            }
          ]}
          itens={lista}
          getId={item => item.setor_id}
          carregando={loading}
          storageKey="tabela:comportamento-recebimento-setor"
          rotuloRolagem="Comportamento de recebimento por setor"
          vazio="Nenhum setor encontrado"
          acoesLinha={item => (
            // R2/M1: sem a classe `.btn` nada impunha o alvo mínimo de
            // 32×32px (44 no toque) — era texto azul clicável. E sem
            // `type="button"` o elemento nasce `submit`: dentro de um
            // formulário ele enviaria a página em vez de salvar a linha.
            <button
              type="button"
              className="btn btn-outline btn-sm"
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
