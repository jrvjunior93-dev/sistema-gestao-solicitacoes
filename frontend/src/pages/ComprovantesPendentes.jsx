import { useEffect, useState } from 'react';
import { HiOutlineArrowPath, HiOutlineMagnifyingGlass } from 'react-icons/hi2';
import PreviewAnexoModal from './SolicitacaoDetalhe/PreviewAnexoModal';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import { fileUrl } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { canDeleteComprovante } from '../utils/acessoProduto';
import {
  getComprovantesPendentes,
  buscarSolicitacoesParaComprovante,
  vincularComprovante,
  excluirComprovante
} from '../services/comprovantes';

export default function ComprovantesPendentes() {
  const { user } = useAuth();
  const [pendentes, setPendentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [selecionadas, setSelecionadas] = useState({});
  const [buscando, setBuscando] = useState(false);
  const [vinculando, setVinculando] = useState({});
  const [preview, setPreview] = useState(null);
  const podeExcluirComprovante = canDeleteComprovante(user);

  /*
    R3/R19 — as OITO caixas do navegador desta tela (7 `alert` + 1
    `window.confirm`) saíram. A separação seguiu a pergunta do `Avisos`:
    "fecha e o problema continua?".

    Sete eram EVENTO — falhou agora, salvou agora — e viraram faixa do
    sistema (`useAvisos`). Uma segurava uma ação destrutiva (excluir o
    comprovante) e virou CONFIRMAÇÃO do sistema (`useConfirmacao`), com o
    nome do arquivo no texto e a irreversibilidade declarada.
  */
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  useEffect(() => {
    carregarPendentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarPendentes() {
    try {
      setLoading(true);
      const data = await getComprovantesPendentes();
      setPendentes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      // AVISO (evento): a carga falhou AGORA. Fechar a faixa não deixa
      // nenhuma condição pendente na tela — o botão Atualizar refaz.
      avisar.erro('Erro ao carregar comprovantes pendentes');
    } finally {
      setLoading(false);
    }
  }

  async function buscarSolicitacoes() {
    try {
      setBuscando(true);
      const data = await buscarSolicitacoesParaComprovante(busca);
      setSolicitacoes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      // AVISO (evento): esta busca falhou.
      avisar.erro('Erro ao buscar solicitações');
    } finally {
      setBuscando(false);
    }
  }

  async function handleVincular(comprovanteId) {
    const solicitacaoId = selecionadas[comprovanteId];
    if (!solicitacaoId) {
      // AVISO (alerta), não confirmação: não há ação para segurar — não
      // existe nada a autorizar. É a resposta ao clique de agora.
      avisar.alerta('Escolha a solicitação na coluna "Vincular a solicitação" antes de vincular.');
      return;
    }

    try {
      setVinculando(prev => ({ ...prev, [comprovanteId]: true }));
      await vincularComprovante(comprovanteId, solicitacaoId);
      setSelecionadas(prev => {
        const next = { ...prev };
        delete next[comprovanteId];
        return next;
      });
      await carregarPendentes();
      avisar.sucesso('Comprovante vinculado a solicitação.');
    } catch (error) {
      console.error(error);
      // AVISO (evento): a vinculação falhou agora.
      avisar.erro(error?.message || 'Erro ao vincular comprovante');
    } finally {
      setVinculando(prev => ({ ...prev, [comprovanteId]: false }));
    }
  }

  async function handleExcluir(item) {
    /*
      CONFIRMAÇÃO (R19 + R21): segura uma ação destrutiva até o
      consentimento, e o retorno se DESESTRUTURA — `confirmar()` devolve
      `{ ok, texto }`, e objeto é sempre truthy: lido como booleano, o
      "Cancelar" EXCLUIRIA o comprovante.

      Consentimento: a mensagem nomeia o MESMO comprovante que a ação
      apaga (`item.id`, um registro só — sem quantidade a divergir) e
      declara que a tela não desfaz.
    */
    const { ok } = await confirmar({
      titulo: 'Excluir comprovante?',
      mensagem: `O arquivo "${item.nome_original || 'sem nome'}" sera removido da fila de pendentes e do armazenamento. Esta acao nao pode ser desfeita.`,
      rotuloConfirmar: 'Excluir comprovante',
      destrutiva: true
    });
    if (!ok) return;

    try {
      await excluirComprovante(item.id);
      await carregarPendentes();
      // AVISO (evento): deu certo agora; some sozinho em 6s.
      avisar.sucesso('Comprovante excluído com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao excluir comprovante');
    }
  }

  async function baixarArquivo(item) {
    try {
      const urlArquivo = fileUrl(item.caminho_arquivo);
      const response = await fetch(urlArquivo);
      if (!response.ok) {
        throw new Error('Falha ao baixar arquivo');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = item.nome_original || 'comprovante';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      // AVISO (evento): este download falhou.
      avisar.erro('Erro ao baixar arquivo');
    }
  }

  return (
    <Pagina>
      {/* R13/C1/C2/R5 — faixa fixa do sistema: título em 22px, contagem e
          apoio em UMA linha na própria faixa. Antes era um <h1> solto num
          card, que rolava para fora com a lista. */}
      <PageHeader
        titulo="Comprovantes pendentes"
        contagem={`${pendentes.length} comprovante(s)`}
        descricao="Arquivos recebidos que ainda não foram vinculados a uma solicitação."
        secundarias={[
          {
            rotulo: 'Atualizar',
            onClick: carregarPendentes,
            desabilitada: loading,
            icone: <HiOutlineArrowPath aria-hidden="true" />
          }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      {/*
        R23 — NÃO se aplica: esta caixa não filtra a lista de pendentes.
        Ela CONSULTA o cadastro de solicitações para popular as opções de
        vínculo de cada linha; por isso o botão explícito ("Buscar"), e por
        isso nenhuma etiqueta de filtro nasce dela.
      */}
      <BlocoConteudo
        titulo="Localizar solicitação para vincular"
        variante="secundario"
        contagem={solicitacoes.length ? `${solicitacoes.length} solicitacao(oes) encontradas` : null}
        descricao="O resultado alimenta a escolha de cada linha; a lista de pendentes não muda com esta busca."
      >
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="sol-filter-field">
            <span className="sol-filter-label">Código ou descrição da solicitação</span>
            <input
              className="input w-full"
              placeholder="Ex: SOL-000123 ou Combustivel"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </label>
          <button
            className="btn btn-primary"
            type="button"
            onClick={buscarSolicitacoes}
            disabled={buscando}
          >
            <HiOutlineMagnifyingGlass aria-hidden="true" />
            {buscando ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </BlocoConteudo>

      {/* B2: a fila é o conteúdo da tela; a busca acima é apoio. */}
      <BlocoConteudo titulo="Fila de comprovantes" variante="primario">
        <TabelaPadrao
          colunas={[
            {
              id: 'arquivo',
              titulo: 'Visualização',
              tipo: 'texto',
              noCard: 'titulo',
              render: (item) => item.nome_original
            },
            {
              id: 'obra',
              titulo: 'Obra',
              tipo: 'texto',
              render: (item) => (
                item.obra?.codigo ? `${item.obra.codigo} - ${item.obra.nome}` : item.obra?.nome || '-'
              )
            },
            {
              id: 'valor',
              titulo: 'Valor',
              tipo: 'valor',
              render: (item) => (
                item.valor
                  ? Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                  : '-'
              )
            },
            {
              id: 'vincular',
              // TRAVADAS (05/09): o select vincula o comprovante e os botoes abrem/baixam
              // o arquivo. Nenhuma das duas carrega dado — sao so o caminho de agir.
              sempreVisivel: true,
              titulo: 'Vincular a solicitação',
              tipo: 'texto',
              // R12: select de FORMULÁRIO (entrada de dado da linha), não de
              // filtro — a regra o mantém legítimo.
              render: (item) => (
                <select
                  className="input"
                  aria-label={`Solicitação para o comprovante ${item.nome_original || item.id}`}
                  value={selecionadas[item.id] || ''}
                  onChange={e =>
                    setSelecionadas(prev => ({ ...prev, [item.id]: e.target.value }))
                  }
                >
                  <option value="">Selecione</option>
                  {solicitacoes.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.codigo} - {s.obra?.codigo ? `${s.obra.codigo} - ` : ''}{s.obra?.nome || ''} {s.descricao ? `| ${s.descricao}` : ''}
                    </option>
                  ))}
                </select>
              )
            },
            {
              id: 'arquivo_acoes',
              sempreVisivel: true,
              titulo: 'Arquivo',
              tipo: 'texto',
              render: (item) => (
                <div className="flex gap-2">
                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    onClick={() =>
                      setPreview({
                        nome: item.nome_original,
                        caminho: item.caminho_arquivo
                      })
                    }
                  >
                    Visualizar
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    onClick={() => baixarArquivo(item)}
                  >
                    Download
                  </button>
                </div>
              )
            }
          ]}
          itens={pendentes}
          carregando={loading}
          vazio="Nenhum comprovante pendente."
          storageKey="tabela:comprovantes-pendentes"
          rotuloRolagem="Comprovantes pendentes"
          // R17: a identidade deste registro é o NOME DO ARQUIVO do
          // comprovante — exibi-lo em maiúsculas distorceria caixa e
          // extensão; a ausência de coluna 'identidade' fica declarada.
          semIdentidade
          acoesLinha={(item) => (
            <>
              {/* D3: os três pesos, todos visíveis — primário sólido para a
                  ação da linha e destrutiva em vermelho suave, apartada. */}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleVincular(item.id)}
                disabled={vinculando[item.id]}
              >
                {vinculando[item.id] ? 'Vinculando...' : 'Vincular'}
              </button>
              {podeExcluirComprovante && (
                <button
                  className="btn btn-outline btn-perigo-suave btn-sm"
                  type="button"
                  onClick={() => handleExcluir(item)}
                >
                  Excluir
                </button>
              )}
            </>
          )}
          larguraAcoes={240}
        />
      </BlocoConteudo>

      {preview && (
        <PreviewAnexoModal
          anexo={preview}
          onClose={() => setPreview(null)}
        />
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
