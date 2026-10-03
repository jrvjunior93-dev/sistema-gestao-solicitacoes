import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { baixarPdfSolicitacaoCompra, obterUrlAssinadaCompra } from '../../../services/compras';
import CompraPreviewModal from '../components/CompraPreviewModal';
import {
  Avisos,
  BlocoConteudo,
  CamposComVazios,
  Pagina,
  PageHeader,
  TabelaPadrao,
  useAvisos
} from '../../../components/padrao';
import { criarPreviewCompra } from '../utils/preview';
import { montarLinhasResumoApropriacao } from '../utils/apropriacoes';

/**
 * RECIBO DA SOLICITAÇÃO GRAVADA — e é só isso que ela é.
 *
 * Chega aqui quem JÁ criou o registro: a tela lê o que veio no
 * `location.state` da navegação e imprime. Não decide, não valida, não
 * grava — não existe checkpoint nenhum nela.
 *
 * Registro para quem for mexer depois: um levantamento mediu 16 linhas e 10
 * classes em comum entre esta tela e a `RevisarSolicitacaoCompra`, e a
 * semelhança é enganosa. Aquela é o CHECKPOINT antes de gravar (checklist,
 * autorização, botão que cria); esta é o COMPROVANTE depois de gravado. São
 * papéis opostos no mesmo fluxo, e unificá-las pelo texto que compartilham
 * juntaria a tela que pergunta com a tela que responde.
 */
export default function RevisarSolicitacaoCompraFinal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [baixando, setBaixando] = useState(false);
  const [previewArquivo, setPreviewArquivo] = useState(null);
  const { avisos, avisar, fechar } = useAvisos();
  const resultado = location.state?.resultado || null;
  const resumo = location.state?.resumo || null;
  const compraDireta = String(resultado?.origem || '').toUpperCase() === 'COMPRA_DIRETA';

  const codigo = useMemo(
    () => resultado?.codigo || `SC-${String(id || '').padStart(5, '0')}`,
    [id, resultado]
  );

  const quantidadeItens = resultado?.quantidade_itens || resumo?.itens?.length || 0;

  // A tabela do recibo enxerga só o item; a chave da linha vem resolvida.
  const itensRecibo = useMemo(
    () => (resumo?.itens || []).map((item, index) => ({
      ...item,
      __chave: `${item.manual ? 'manual' : item.insumo_id}-${index}`
    })),
    [resumo]
  );

  async function handleAbrirPdf() {
    try {
      setBaixando(true);
      const blob = await baixarPdfSolicitacaoCompra(id);
      const url = window.URL.createObjectURL(blob);
      setPreviewArquivo(await criarPreviewCompra({
        title: `PDF da solicitacao ${codigo}`,
        name: `${codigo}.pdf`,
        url
      }));
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao abrir PDF');
    } finally {
      setBaixando(false);
    }
  }

  async function handleAbrirArquivo(item) {
    try {
      const url = await obterUrlAssinadaCompra(item?.arquivo_url);
      if (!url) {
        avisar.erro('Arquivo não encontrado.');
        return;
      }

      setPreviewArquivo(await criarPreviewCompra({
        title: 'Arquivo do item',
        name: item.arquivo_nome_original || 'Arquivo anexado',
        url
      }));
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao abrir arquivo do item');
    }
  }

  return (
    <Pagina>
      <Avisos avisos={avisos} aoFechar={fechar} />
      {/*
        As duas ações secundárias não são atalho de módulo vestido de ação
        (C6): são a continuação do trabalho que acabou de terminar aqui.
        Um recibo sem saída deixa a pessoa parada no comprovante.
      */}
      <PageHeader
        titulo={compraDireta ? 'Compra Direta Criada' : 'Solicitacao de Compra Criada'}
        contagem={`${quantidadeItens} item(ns)`}
        descricao={compraDireta
          ? 'A compra direta gerou uma solicitacao no fluxo principal com PDF e anexos para pagamento.'
          : 'O registro foi criado no modulo compras e ja gerou uma solicitacao no fluxo principal.'}
        acaoPrincipal={{
          rotulo: baixando ? 'Abrindo PDF...' : 'Abrir PDF',
          onClick: handleAbrirPdf,
          desabilitada: baixando
        }}
        secundarias={[
          { rotulo: 'Ir para solicitações', onClick: () => navigate('/solicitacoes') },
          {
            rotulo: compraDireta ? 'Nova compra direta' : 'Nova solicitacao',
            onClick: () => navigate(compraDireta ? '/solicitacoes-compra-direta/nova' : '/solicitacoes-compra/nova')
          }
        ]}
      />

      <BlocoConteudo variante="primario" cor="var(--sem-success)" titulo="Confirmação">
        <CamposComVazios
          colunas={3}
          campos={[
            { label: 'Código principal', valor: codigo, tom: 'success' },
            { label: 'ID da solicitação de compra', valor: resultado?.id || id },
            { label: 'Solicitação principal vinculada', valor: resultado?.solicitacao_principal_id },
            { label: 'Obra', valor: resumo?.obra_nome },
            { label: 'Solicitante', valor: resumo?.solicitante_nome }
          ]}
        />
      </BlocoConteudo>

      <BlocoConteudo
        variante="secundario"
        titulo="Resumo enviado"
        descricao="O que foi gravado nesta solicitação, como saiu no documento."
      >
        {resumo ? (
          /*
            Tabela PRÓPRIA do recibo — mesma estrutura padrão, `storageKey`
            próprio. Não é a tabela da tela de revisão reaproveitada: os
            itens aqui são leitura de comprovante, sem edição e sem
            checkpoint.
          */
          <TabelaPadrao
            colunas={[
              {
                id: 'item',
                titulo: 'Item',
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => item.insumo_nome
              },
              {
                id: 'quantidade',
                titulo: 'Quantidade',
                tipo: 'numero',
                render: (item) => `${item.quantidade} ${item.unidade_sigla || ''}`.trim()
              },
              {
                id: 'apropriacao',
                titulo: 'Apropriação',
                tipo: 'texto',
                render: (item) => {
                  const linhas = montarLinhasResumoApropriacao(item);
                  if (!linhas.length) return '-';
                  return (
                    <div className="grid gap-1 text-xs text-[var(--c-muted)]">
                      {linhas.map((linha, linhaIndex) => (
                        <div key={`${linha}-${linhaIndex}`}>{linha}</div>
                      ))}
                    </div>
                  );
                }
              }
            ]}
            itens={itensRecibo}
            getId={(item) => item.__chave}
            vazio="Nenhum item registrado nesta solicitação."
            storageKey="tabela:solicitacao-compra-finalizada:itens"
            rotuloRolagem="Itens da solicitacao criada"
            acoesLinha={(item) => (
              <>
                {item.link_produto ? (
                  <a
                    href={item.link_produto}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline"
                  >
                    Abrir link
                  </a>
                ) : null}
                {item.arquivo_url ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleAbrirArquivo(item)}
                    title={item.arquivo_nome_original || 'Abrir arquivo'}
                  >
                    <span className="truncate">{item.arquivo_nome_original || 'Abrir arquivo'}</span>
                  </button>
                ) : null}
              </>
            )}
            larguraAcoes={280}
          />
        ) : (
          <p className="text-sm text-[var(--c-muted)]">
            Resumo não disponível nesta navegação. O PDF pode ser aberto normalmente.
          </p>
        )}
      </BlocoConteudo>

      <CompraPreviewModal preview={previewArquivo} onClose={() => setPreviewArquivo(null)} />
    </Pagina>
  );
}
