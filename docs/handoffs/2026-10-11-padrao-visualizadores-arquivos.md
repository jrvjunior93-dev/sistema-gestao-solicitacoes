# Padrao de visualizacao de arquivos

## Estado e autorizacao

Implementacao local concluida na refactor/frontend, sobre c249aed4.
Usuario autorizou aplicar o mapa, testar cada etapa e depois commitar e fazer
push das pendencias na refactor/frontend. Sem main, EC2, deploy, migration,
alteracao de backend ou dados reais. outputs/ preservado
fora do Git; contem capturas e codemod temporario, nao publicar essa pasta.

A skill frontend-design orientou uma casca reutilizavel, compacta e consistente
com o Fluxy. Nao foram alterados os componentes globais ModalPortal/OverlayModal.

## Base e contratos

- frontend/src/components/ui/VisualizadorArquivoModal.jsx: largura padrao 1200px,
  altura responsiva, cabecalho/rodape fixos, PDF nativo em iframe e imagem em img.
  Nome/MIME/caminho permitem classificar URLs assinadas sem extensao. MIME HTML
  e SVG nao sao incorporados. Protocolos perigosos nao geram preview nem links.
  Erro de imagem/iframe tem estado proprio, reiniciado quando a URL muda.
- frontend/src/hooks/useVisualizadorArquivo.jsx: cada chamador continua dono do
  endpoint autorizado e do tratamento de erro. O hook resolve carregamento,
  dupla abertura durante a requisicao, respostas tardias, descarte de blobs
  explicitamente pertencentes a ele, foco e rolagem vertical/horizontal.
- PreviewAnexoModal e CompraPreviewModal sao adapters dos contratos existentes.
  O segundo conserva o descarte dos blobs produzidos pelas telas de compra.
  srcDocInterno e exclusivamente a previa HTML gerada pela propria compra,
  nunca um upload HTML. A ficha de boleto conserva BoletoPrintView e Imprimir.
- Downloads explicitos e fallback de nova aba continuam disponiveis. A acao
  historica chamada Baixar PDF na lista de compras abria um viewer externo;
  agora abre o viewer interno, com Baixar arquivo no rodape.
- Relatorios mantem filtros aplicados, IDs selecionados, endpoints, filename,
  tratamento de erro/nova tentativa e invalidacao de resposta ao fechar.
  Removida apenas a trava de body/Escape duplicada do relatorio de titulos:
  agora usa a pilha global existente. Clique fora continua fechando esse relatorio.
- Nenhuma regra de permissao, criacao, aprovacao, baixa, anexo, historico,
  envio financeiro, setor ou idempotencia de negocio foi substituida pelo viewer.

## Mapa implementado

Todos os arquivos abaixo estao em frontend/src, salvo a linha mobile.

| Area | Pontos abrangidos | Acesso preservado |
| --- | --- | --- |
| Solicitacoes | pages/SolicitacaoDetalhe/PreviewAnexoModal, Timeline, ModalMedicao; pages/ComprovantesPendentes; boleto da compra direta em SolicitacaoDetalhe/index | Link seguro/presign; historico_id no boleto permanece |
| Financeiro | FinanceiroFilaPagamentos, FinanceiroCard e ComprovantesTituloSolicitacao, FinanceiroAutorizacoesPagamento, FinanceiroPagamentos | Links da fila, da solicitacao, documento da autorizacao e comprovante do lote permanecem especificos |
| Financeiro/relatorios | FinanceiroTitulos, FinanceiroObras (PDF e arquivos do pagamento), FinanceiroBoletos (ficha interna) | Geracao/exportacao e selecao existentes; arquivos ja autorizados pela listagem |
| Recarga | components/recarga-cartao/PrestacaoRecargaCartao | Mesmo link seguro da solicitacao |
| Compras | CompraPreviewModal e seus cinco chamadores: NovaSolicitacaoCompra, RevisarSolicitacaoCompra, RevisarSolicitacaoCompraFinal, GerenciarCotacaoSolicitacao, PedidoCompraDetalhe; tambem SolicitacoesCompra, SolicitacaoCompraDetalheView, ItemCompraDetalhe, PedidoCompraFinanceiro | Geracao de PDF e links assinados existentes; fluxo de revisao/confirmacao intacto |
| Portal publico | CotacaoFornecedorPublica: anexo do item e arquivos da resposta | URL retornada pelo fluxo publico por token; nao passa a exigir sessao privada |
| Contratos | GestaoContratos, SolicitacaoDetalhe/AditivosDoContrato, ComercialContratos (PDF) | Mesmos endpoints de contrato e link seguro de negociacao; DOCX/assinatura externa preservados |
| RH/DP | RhDpDocumentos, RhDpColaboradores (documentos/dossie), RhDpPessoalSolicitacoes (admissao/anexos), RhDpFechamentos (comprovantes) | Documento por ID, anexo por solicitacao, dossie por colaborador e fechamento/fila originais; local/global e editor mantidos |
| Outros | ArquivosModelos (Visualizar), Treinamento (documento), ObraGestao, ComunicacaoInterna, ProvisionamentoFinanceiroDetalhe, SstCrudPage (documentos), FiscalDocuments e FiscalDocumentDetail (PDF/DANFE) | Endpoints de cada area; marcacao de leitura de treinamento e geracao de DANFE conservadas |
| Mobile nativo | mobile/app/anexo.tsx, app/_layout.tsx, detalhes de solicitacoes e provisionamento, src/utils/arquivoPreview.ts | Assinatura original antes de navegar; fullScreenModal, Fechar/voltar, bloqueio de dupla abertura/resposta apos sair, URL HTTP(S) e fallback |

Exclusoes intencionais: links de produto, WhatsApp, portal de fornecedor e
assinatura; videos; downloads XLSX/CSV/XML/ZIP e logs fiscais brutos. SVG/HTML
externos nao sao embutidos. Biblioteca mantem Baixar separado de Visualizar.

## Testes executados e aprovados

1. Build apos base/financeiro, Compras/Contratos e integracao final: npm run build.
   Avisos existentes de Browserslist e tamanho de chunk; sem erro de compilacao.
2. validarVisualizadoresArquivos.mjs executado por etapa financeiro/compras/dp/
   outros e, ao final, todos: 27 handlers reais extraidos do codigo, endpoints/
   argumentos originais, adapters reais, dois relatorios com seus handlers e JSX
   reais, selecao/filtros, download/filename, erro/retry e fechamento em voo.
   Tambem PDF/imagens, HTML interno, MIME e protocolos, blobs, desktop 1366px/
   viewport estreita 390px, pilha/Escape/foco e negativas de acesso.
   Trata-se de fixture dos handlers/componentes, nao de E2E de todas as paginas.
3. validarFilaInstrumentosUI.mjs: pagina/lista/viewer/presign reais com transporte
   isolado; inclui filaArquivosPreviewQA e filaColunasQA. Baixa/encargos/lote,
   colunas/persistencia, leitura negativa, modal filho, foco/rolagem, 403, duplo
   clique, fechamento em voo e downloads/outros formatos passaram.
4. validarContrastePreviewCompras.mjs: contraste escuro com tema personalizado.
5. validarRelatorioTitulosSelecao.mjs: handler/botao/service HTTP reais; GET sem
   selecao, POST com IDs, filtros, limpeza, erro e permissao. Extracao atualizada
   para AST, independente dos helpers de download que foram removidos.
6. validarArquivosSolicitacaoFila.mjs: teste legado atualizado para PDF interno,
   download separado e lista vazia. Nao exige mais ancora externa no Visualizar.
7. validarMedicaoRecargaEnvioUI.mjs: FinanceiroCard/modal reais, permissao,
   aprovacao/envio/cancelamento/retry idempotente e recarga; desktop/mobile.
8. validarRhPessoalPorLocal.mjs --gerencial: seis abas DP, cadastro, documentos/
   relatorios locais/globais, escopos negativos e fluxos gerenciais.
9. validarPermissoesContratos.mjs: rotas/menu continuam respeitando permissoes.
10. Backend, sem banco: validarAcessoAnexosSolicitacoes.js,
    validarFilaPagamentoSolicitacaoAcesso.js, validarEscopoRhDpUsuarioObra.js.
11. validarPreviewMobile.mjs: utilitario e TS/TSX reais, handlers de navegacao,
    negativa, concorrencia/resposta tardia, layout cheio, Fechar e fallback, com
    adaptadores nativos isolados. Nao executa WebView/dispositivo real.
12. git diff --check aprovado. Capturas fila-preview-pdf-1366.png e
    fila-preview-pdf-390.png conferidas visualmente: PDF real renderizado no Chrome,
    cabecalho/rodape visiveis e sem overflow horizontal externo.

Falhas de harness corrigidas/reexecutadas: fixture virtual JSX precisou de
transpilacao Vite; dois testes legados procuravam o helper removido/abertura
externa antiga. Scripts que esperavam chromium_headless_shell usaram Chrome
instalado via PLAYWRIGHT_EXECUTABLE_PATH, sem instalar navegador fora do repo.

## Limites e proximo passo

- Clipboard nativo, OCR e PDFs escaneados nao foram automatizados. O iframe
  preserva o viewer/texto selecionavel; imagens nao ganham OCR.
- Safari/iPhone/Android e S3 reais nao foram testados. Verificar preview, copiar
  linha digitavel, fechar/voltar mantendo contexto e download no ambiente dev.
- mobile/node_modules ausente: typecheck completo Expo nao executado. O teste
  de transpilacao emite aviso sobre expo/tsconfig.base e usa adaptadores, nao
  comprova compatibilidade fisica do WebView. Android pode precisar do fallback
  para PDFs, conforme suporte nativo. Nenhuma dependencia foi instalada.
- Commit/push na refactor/frontend autorizado pelo usuario na sequencia.
  Ajuste web apenas frontend: por si so nao requer EC2 ou migration. Mobile
  nativo requer seu proprio ciclo de build/publicacao e QA em dispositivo.
- Conferencia manual recomendada em dev: historico/medicao; comprovante da fila
  e da autorizacao; item/cotacao/portal publico; admissao/dossie DP; relatorio
  selecionado; DANFE; anexos do app nativo. Nao liberar producao automaticamente.
