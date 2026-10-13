# Modal da fila somente boletos

## Escopo e estado

Pedido: mostrar no modal de arquivos da solicitacao da fila somente arquivos
enviados pelo campo de boleto. Concluido localmente, sem commit/push/deploy,
EC2, banco real, migration ou alteracao das regras de visibilidade.
Alteracoes locais anteriores preservadas.

## Implementacao

listarArquivosSolicitacaoPelaFila conserva o mesmo controle de acesso da fila
e consulta Anexo por solicitacao_id, tipo BOLETO e deleted_at nulo. Nao consulta
Comprovante nem determina origem por nome/extensao. DTO e ordenacao preservados.
O helper compartilhado de permissoes nao foi alterado.

ArquivosSolicitacaoFilaModal filtra BOLETO tambem no cliente para respostas
mistas de backend anterior. Textos explicam o recorte e ausencia de boletos.
Preview PDF/imagem, assinatura sob demanda, download, foco, Escape e rolagem
mantidos. Comprovantes continuam em seus controles proprios; demais anexos
seguem no detalhe da solicitacao. Nenhum arquivo foi removido/reclassificado.

## Arquivos

- backend/src/services/solicitacaoFilaPagamentoAcessoService.js
- backend/scripts/validarFilaPagamentoSolicitacaoAcesso.js
- frontend/src/components/financeiro/ArquivosSolicitacaoFilaModal.jsx
- frontend/scripts/validarArquivosSolicitacaoFila.mjs
- frontend/scripts/validarFilaInstrumentosUI.mjs (classificacao das fixtures)
- README financeiro, ownership e este handoff.

## Validacoes

- validarFilaPagamentoSolicitacaoAcesso: multiplos boletos PDF/imagem, arquivo
  comum com nome boleto excluido, removidos/outra solicitacao excluidos,
  nenhuma consulta a comprovantes e negativas de acesso.
- validarSegurancaAcessoDireto: matriz de visibilidade, identidade e negativos
  de autorizacao das rotas; nenhuma ampliacao de permissoes.
- validarArquivosSolicitacaoFila: componente real com APIs isoladas, resposta
  antiga mista filtrada, presign sob demanda, preview/download e estado vazio.
- validarFilaInstrumentosUI: fila real desktop/mobile, colunas, previews,
  foco/rolagem, negativa 403, massa, cheques, desconto, estorno e devolucao.
- Build frontend aprovada (584 modulos). Avisos preexistentes de Browserslist
  antigo e chunk maior que 500 kB nao bloquearam a build.

## Limites e proximo passo

Nenhuma homologacao em EC2/DB/S3 real. Publicar apenas mediante autorizacao.
Em dev, conferir solicitacao com varios boletos e anexos comuns: somente
boletos no modal, todos os anexos preservados no detalhe, comprovantes nos
controles proprios, preview/download e posicao da fila preservados. Testar
solicitacao sem boleto e usuario fora do acesso (403).

Arquivos legados sem classificacao BOLETO nao sao presumidos como boleto;
reclassificacao retroativa exigiria consulta/recorte e autorizacao separados.
