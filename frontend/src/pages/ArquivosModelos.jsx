import { useEffect, useMemo, useState } from 'react';
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
import {
  excluirArquivoModelo,
  getContextoArquivosModelos,
  getLinkArquivoModelo,
  listarArquivosModelos,
  uploadArquivoModelo
} from '../services/arquivosModelos';
import { useAuth } from '../contexts/AuthContext';
import { canManageBiblioteca } from '../utils/acessoProduto';

// =====================================================================
// ARQUIVOS MODELOS — biblioteca por página
// ---------------------------------------------------------------------
// R9 (revista em 04/09) — ENVIO INLINE, NUNCA EM MODAL.
// A tela existe para MANTER a biblioteca: quem tem permissão abre aqui
// justamente para subir o modelo da sua área. Pelo teste da regra, o
// envio atrás de um modal obrigaria a abrir e fechar uma caixa para fazer
// exatamente aquilo que a pessoa veio fazer. O bloco de envio fica ACIMA
// da lista (padrão de tela mista do ComercialUnidades), visível só para
// quem pode enviar na página selecionada — nenhuma permissão mudou.
//
// R12 — a fileira de páginas NÃO é filtro: é SELETOR DE CONTEXTO. Ela
// escolhe em qual página se está lendo E em qual o próximo arquivo será
// gravado (o `paginaCodigo` do upload vem dela). A própria R12 declara
// esse caso como legítimo; por isso não virou marcação com etiquetas.
// =====================================================================

function formatarDataHora(valor) {
  if (!valor) return '-';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleString('pt-BR');
}

function formatarTamanho(bytes) {
  const valor = Number(bytes || 0);
  if (!valor) return '-';
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
  return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ArquivosModelos() {
  const { user } = useAuth();
  const podeGerenciarBiblioteca = canManageBiblioteca(user);
  const [contexto, setContexto] = useState(null);
  const [paginaSelecionada, setPaginaSelecionada] = useState('');
  const [arquivos, setArquivos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [uploading, setUploading] = useState(false);
  // R3/R19: as OITO caixas do navegador desta tela (7 `alert` + 1
  // `confirm`) viraram faixa de aviso e confirmação do sistema.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const paginasAtivas = useMemo(
    () => (contexto?.paginas || []).filter(p => p.ativo),
    [contexto]
  );

  const paginaAtual = useMemo(
    () => paginasAtivas.find(p => p.codigo === paginaSelecionada) || null,
    [paginasAtivas, paginaSelecionada]
  );

  const podeUploadAtual = useMemo(() => {
    if (!contexto || !paginaSelecionada) return false;
    return podeGerenciarBiblioteca && contexto?.uploadPermitidoPorPagina?.[paginaSelecionada] === true;
  }, [contexto, paginaSelecionada, podeGerenciarBiblioteca]);

  async function carregarContexto() {
    const data = await getContextoArquivosModelos();
    setContexto(data);
    if (!paginaSelecionada && data?.paginas?.length) {
      const primeiraAtiva = data.paginas.find(p => p.ativo) || data.paginas[0];
      setPaginaSelecionada(primeiraAtiva?.codigo || '');
    }
  }

  async function carregarArquivos(codigoPagina) {
    if (!codigoPagina) {
      setArquivos([]);
      return;
    }
    const data = await listarArquivosModelos(codigoPagina);
    setArquivos(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    carregarContexto().catch(error => {
      console.error(error);
      avisar.erro('Erro ao carregar arquivos modelos');
    });
  }, []);

  useEffect(() => {
    setCarregando(true);
    carregarArquivos(paginaSelecionada)
      .catch(error => {
        console.error(error);
        avisar.erro('Erro ao listar arquivos');
      })
      .finally(() => setCarregando(false));
  }, [paginaSelecionada]);

  async function abrirArquivo(id) {
    try {
      const url = await getLinkArquivoModelo(id);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao abrir arquivo');
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !paginaSelecionada) return;
    // R26: a página de destino é fixada ANTES do await — a fileira de
    // contexto continua clicável enquanto o envio corre.
    const destino = paginaSelecionada;
    try {
      setUploading(true);
      await uploadArquivoModelo({
        paginaCodigo: destino,
        file
      });
      await carregarArquivos(destino);
      avisar.sucesso('Arquivo enviado com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  }

  async function handleExcluir(arquivo) {
    // R26: o registro (e a página) ficam fixados em `const` ANTES do
    // `await` da confirmação — o modal do sistema NÃO congela a tela, e
    // trocar de página com o modal aberto excluiria outro arquivo.
    const alvo = arquivo;
    const destino = paginaSelecionada;
    // R21: `confirmar()` devolve { ok, texto } e OBJETO É SEMPRE TRUTHY —
    // desestruturar é o que faz o "Cancelar" cancelar de verdade.
    const { ok } = await confirmar({
      titulo: 'Excluir arquivo',
      mensagem: `Excluir "${alvo.nome_original}" da biblioteca? Esta ação não pode ser desfeita.`,
      rotuloConfirmar: 'Excluir',
      destrutiva: true
    });
    if (!ok) return;
    try {
      await excluirArquivoModelo(alvo.id);
      await carregarArquivos(destino);
      avisar.sucesso('Arquivo excluído com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao excluir arquivo');
    }
  }

  /*
    R1/R17 — a lista era uma grade de `card` dentro de `card`, com os
    quatro dados do arquivo soltos em <p>: sem colunas declaradas, sem
    redimensionamento, sem largura salva por usuário. Vira TabelaPadrao,
    e cada coluna declara o que ELA É (`tipo`) — a medida é do componente.

    `semIdentidade` é DECLARADO de propósito (R17): nome de arquivo
    preserva caixa e extensão, então não pode virar coluna `identidade`
    (que exibe em MAIÚSCULAS). É o exemplo que a própria regra cita.
  */
  const colunas = [
    {
      id: 'arquivo',
      titulo: 'Arquivo',
      tipo: 'texto',
      noCard: 'titulo',
      render: (item) => (
        <CelulaDupla
          principal={item.nome_original}
          sub={formatarTamanho(item.tamanho_bytes)}
          title={item.nome_original}
        />
      )
    },
    {
      id: 'enviado_por',
      titulo: 'Enviado por',
      tipo: 'texto',
      render: (item) => item?.criadoPor?.nome || '-'
    },
    {
      id: 'data',
      titulo: 'Data',
      tipo: 'data',
      render: (item) => formatarDataHora(item.createdAt)
    }
  ];

  return (
    <Pagina>
      {/* R5/C2: título, contagem e apoio na faixa fixa — o `page-title` +
          `page-subtitle` soltos sobre o canvas saíram (B5).
          C2 × B3 (05/09): a faixa carrega o TOTAL do que está carregado, e
          o rótulo diz de QUE conjunto ele é. O serviço lista uma página
          por vez (`listarArquivosModelos(codigoPagina)`), então dizer
          "N arquivo(s)" sem qualificar prometeria a biblioteca inteira e
          entregaria um recorte. */}
      <PageHeader
        titulo="Arquivos Modelos"
        contagem={carregando ? null : `${arquivos.length} arquivo(s) nesta página`}
        descricao="Biblioteca de modelos por área. Visualização e download disponíveis para todos os usuários."
      />

      {/* R16: UM dono para a faixa de avisos, logo abaixo do cabeçalho. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Página da biblioteca"
        contagem={`${paginasAtivas.length} página(s) ativa(s)`}
        descricao="Escolha a área: a lista abaixo e o envio de arquivo valem para a página marcada."
      >
        <div className="flex flex-wrap gap-2">
          {paginasAtivas.map(pagina => (
            <button
              key={pagina.codigo}
              type="button"
              className={`btn ${paginaSelecionada === pagina.codigo ? 'btn-primary' : 'btn-outline'}`}
              aria-pressed={paginaSelecionada === pagina.codigo}
              onClick={() => setPaginaSelecionada(pagina.codigo)}
            >
              {pagina.nome}
            </button>
          ))}
          {paginasAtivas.length === 0 && (
            <p className="text-sm text-[var(--c-muted)]">
              Nenhuma página ativa. Ative uma em Configuração de Arquivos Modelos.
            </p>
          )}
        </div>
      </BlocoConteudo>

      {podeUploadAtual && (
        <BlocoConteudo
          titulo="Enviar arquivo"
          descricao={`O arquivo entra na página "${paginaAtual?.nome || paginaSelecionada}" e fica visível para todos os usuários.`}
        >
          <div className="app-actionbar">
            {/* O input de arquivo continua escondido atrás do rótulo: é o
                único jeito de estilizar `input[type=file]`, e o alvo de
                clique é o próprio .btn (M1). */}
            <label className="btn btn-primary cursor-pointer">
              {uploading ? 'Enviando...' : 'Selecionar e enviar arquivo'}
              <input
                type="file"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </div>
        </BlocoConteudo>
      )}

      <BlocoConteudo
        titulo={paginaAtual?.nome || 'Selecione uma página'}
        variante="primario"
        cor="var(--c-primary)"
      >
        <TabelaPadrao
          colunas={colunas}
          itens={arquivos}
          carregando={carregando}
          getId={(item) => item.id}
          storageKey="tabela:arquivos-modelos"
          rotuloRolagem="Arquivos modelos"
          semIdentidade
          larguraAcoes={podeUploadAtual ? 300 : 220}
          vazio={{
            title: 'Nenhum arquivo cadastrado nesta página',
            message: 'Quem tem permissão de upload nesta página pode enviar o primeiro modelo pelo bloco acima.'
          }}
          acoesLinha={(item) => (
            <>
              {/*
                DEFEITO DE SIGNIFICADO PRESERVADO E REGISTRADO (não removido):
                "Visualizar" e "Baixar" chamam a MESMA função com o MESMO
                argumento — os dois abrem a URL assinada em outra aba, e o
                que decide entre ver e baixar é o content-type do S3, não o
                botão. Dois rótulos prometendo coisas diferentes para uma
                ação só. Remover um botão é remover elemento visível, o que
                exige aprovação do cliente (Disciplina de regras, item 2):
                fica como está e vai no relatório como proposta.
              */}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirArquivo(item.id)}>
                Visualizar
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirArquivo(item.id)}>
                Baixar
              </button>
              {podeUploadAtual && (
                <button
                  type="button"
                  className="btn btn-outline btn-perigo-suave btn-sm"
                  onClick={() => handleExcluir(item)}
                >
                  Excluir
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
