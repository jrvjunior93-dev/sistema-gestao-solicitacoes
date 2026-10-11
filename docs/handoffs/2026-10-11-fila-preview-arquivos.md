# Fila de pagamentos: visualizacao interna de arquivos

## Escopo e estado

Implementado na refactor/frontend sobre 0b2a83dde467506f1bc9fc143ac3db3ff33724cf.
Sem commit/push, main, deploy, migration, backend novo ou dados reais alterados.
Usuario solicitou PDFs/imagens no proprio fluxo para consulta/copia de dados.

## Mapeamento e alteracoes

- ArquivosSolicitacaoFilaModal: lista continua usando GET protegido da fila e
  getLinkSeguroAnexoSolicitacao/presign. Depois de obter link autorizado, PDFs e
  JPG/JPEG/PNG/GIF/WebP abrem PreviewAnexoModal como irmao da lista (portal proprio).
- PreviewAnexoModal: largura/alturaPreview opcionais. Na fila, 1200px e altura
  adaptada; os outros chamadores continuam com 860px/80vh por padrao. Nome longo
  quebra linha e Fechar nao encolhe. Cabecalho/rodape fixos existentes preservados.
- Sem nova dependencia. PDF segue iframe/viewer nativo, sem converter para imagem,
  sandbox que desabilite funcionalidade ou camada que impeca selecionar texto.
  Copia depende de texto selecionavel e suporte nativo; nao ha OCR.
- Downloads e abertura de outros formatos seguem fluxo anterior. SVG continua
  sem embed; o presign/backend conserva protecoes de formatos arriscados.
- Ref de abertura evita presign duplicado no duplo clique, invalida resposta
  em voo apos fechar/trocar solicitacao, preserva erro no modal original.
- Fechar preview retorna foco ao disparador depois da montagem/limpeza da pilha,
  com preventScroll. ModalPortal global resolve Escape somente do topo e trava
  rolagem ate fechar a lista; useRolagemModal da fila continua preservado.
- Backend/permissoes/lista de anexos/remocao/vinculos/baixas nao foram alterados.

## Validacoes

- frontend/scripts/validarFilaInstrumentosUI.mjs, incluindo filaArquivosPreviewQA:
  pagina, lista, preview e servico frontend de presign reais. Transporte/APIs e
  PDF com linha digitavel/imagens criados para QA, sem rede externa de negocio.
  Recursos locais do viewer nativo do Chrome permitidos no harness.
- PDF/imagens internos sem popup, ampla viewport 1366px e 390px, cabecalho/
  rodape acessiveis, foco de retorno, Escape somente preview, rolagem e trava
  preservadas, negativa 403, fechamento em voo, duplo clique, download e DOCX
  externo. Regressao de colunas/encargos/lote/permissoes tambem aprovada.
- backend/scripts/validarFilaPagamentoSolicitacaoAcesso.js e
  validarAcessoAnexosSolicitacoes.js: aprovados sem banco, regras existentes.
- npm run build: aprovado; avisos preexistentes de Browserslist/chunk.
- Capturas outputs/fila-preview-pdf-1366.png e fila-preview-pdf-390.png
  conferidas visualmente (viewer Chrome renderizando o PDF). outputs nao versionar.
- Copia para clipboard e dispositivo fisico/iPhone/Android nao automatizados.
- Prova extra modalPortalNaoPropaga.mjs nao executou no harness legado: browser
  headless_shell ausente; com Chrome alternativo nao montou o fixture (#modal).
  Esse script e o ModalPortal global nao foram alterados. O teste novo exercita
  pilha e acoes reais da fila em Chrome instalado e foi aprovado.

## Proximo passo

Usuario autorizou commit/push somente na refactor/frontend. Revalidados antes
da publicacao: UI da fila/preview/colunas, verificacoes de acesso sem banco,
sintaxe, diff e build. outputs/ preservado fora do Git.

Ajuste somente frontend,
sem necessidade de EC2/migration por si so. Conferir presign/Content-Type e
suporte do viewer no ambiente publicado, principalmente Safari/Android. Se o
navegador nao renderizar PDF embutido, saida explicita Abrir arquivo em nova aba
continua disponivel. Nao ampliar para OCR sem pedido proprio.
