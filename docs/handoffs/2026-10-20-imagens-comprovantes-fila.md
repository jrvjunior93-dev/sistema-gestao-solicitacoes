# Imagens nos comprovantes manuais da fila

## Autorizacao e limites

Usuario autorizou JPG/JPEG/PNG nos anexos individuais e compartilhados na
refactor/frontend, mantendo importacao automatica somente PDF, permissoes e
protecoes atuais. Agente unico, branch isolada na baseDEV1f02c745558cabf465d84ef4b0e92e9c27f09f23.
Main b31531d0 preservada. Sem EC2/SSH, banco/S3/antivirus reais, migration,
dependencia, commit/push ou deploy.

## Mapa do fluxo

- POST /financeiro/fila-pagamentos/:id/comprovante e /comprovantes/compartilhar:
  mesma allowFilaPagamentosBaixa/uploadRateLimit; variante manual do upload.
- POST /comprovantes/preview e /comprovantes/vincular: upload padrao continua
  exclusivamente PDF, mesma permissao de importar e limites; parser inalterado.
- GET comprovante primario/adicional: endpoints autorizados e assinatura S3
  inalterados. Preview deixa de forcar application/pdf e usa nome real.
- Vinculo manual reutiliza hash por destino, revalidacao sob lock, transacao,
  S3 separado por destino, historico COMPROVANTE e regras de remocao/replay.
  Nao altera pagamentos, valores, datas, contas ou status financeiros.

## Implementacao

- Novo comprovanteFilaArquivoDomain verifica extensao/MIME coerentes (PDF,
  JPEG, PNG; branco/octet-stream continuam aceitos pelo conteudo), tamanho12MB
  e assinatura binaria existente. Nao modifica perfil/seguranca global.
- uploadComprovantesPagamento.manual passa pelo MESMO createSecureUpload,
  assinatura binaria e scanner configurado. Exportacao padrao continua PDF.
  Limites de tamanho/quantidade e autenticacao antes do upload preservados.
- Servico valida novamente antes de S3 e persiste tipo PDF/JPEG/PNG nas colunas
  STRING existentes. ContentType do objeto e normalizado pelo formato validado,
  inclusive quando navegador envia MIME generico; arquivo de entrada inalterado.
- Novo helper frontend compartilha accept/validacao manual de MIME/extensao/
  tamanho, sem mudar o seletor/parser PDF. Erro antes de enviar formato invalido;
  envio sequencial e mensagem de sucesso parcial existentes preservados.
- Rotulos manuais deixam de dizer apenas PDF, preview de imagem usa img, nao
  iframe PDF; permissao, estados busy, mutex e selecao permanecem os mesmos.
- Skill frontend/interaction/UX writing orientou preservar controles compactos
  do Fluxy e apenas alinhar rotulos/feedback aos formatos, sem redesenho visual.

## Arquivos/testes

Runtime: config upload, novo domain e helper frontend, duas rotas manuais,
validacao/metadados de vincularArquivoFila e pagina FinanceiroFilaPagamentos.
Sem alteracao em auth, parser PDF, middleware de seguranca, binarios ou scanner.

validarUploadComprovantesFila.js executa Multer e middleware de seguranca reais
em HTTP loopback/porta efemera com antivirus/log simulados: formatos aceitos,
importacao somente PDF, MIME/assinatura/extensao falsos, SVG/WEBP, 12MB,
quantidade, negacao antes do scanner e bloqueio do scanner/log. Sem rede externa.

validarFilaComprovantePendente ampliado: imagem individual/compartilhada,
tipo/ContentType, historico, financeiros intactos, escopo/destinos, replay/
concorrencia e rollback. PDF/importador e schema mantidos. Parser PDF e teste
cheques/contrato aprovados como regressao, sem baixa/migration real.

UI modo --comprovantes-imagens: tela real com APIs em memoria em1366/390,
JPG/JPEG/PNG, invalidos sem envio, duplo clique, readonly, preview img e
importador recusando imagem antes da API. Capturas privadas em outputs,
modal390 inspecionado visualmente. Suite completa e rolagem650titulos/8recortes,
build, docs586/19/Node/diff aprovados. Campos/selectores, anexos, selecao,
preservacao de valores, cheques/cartoes e negativas de escopo/permissao da
fixture continuam aprovados. Novos casos do helper frontend tambem aprovados
(MIME vazio/generico, extensao malformada, vazio e limite). Ownership liberado.

## Proximo passo

Publicacao DEV autorizada em pedido posterior: commit/push refactor/frontend,
sem promover main ou acessar EC2. Roteiro atualizar-dev-datas-cheques-20261019.sh
agora roda QAs de upload/manual/schema/parser depois do merge pinado e antes
do restart exclusivo backend-dev. Bootstrap usa verificador JA instalado;
hash .env, PM2/watch/porta8001, sessao12h/flags/schema sem DDL preservados.
Guarda impede qualquer delta de migration/dependencia desde a base homologada.
Backend completo do roteiro, UI imagens1366/390 e build repetidos/aprovados.
Node/Bash, documentacao e diff conferidos. Outputs privados nao publicados.

Operador executa roteiro pinado no novo SHA. Homologar com
Financeiro em titulos de teste DEV ja baixados e sem comprovante: anexar imagem
na linha, abrir/baixar; compartilhar a mesma em dois destinos; conferir
historico e ausencia de outra baixa/duplicidade. Importador deve continuar PDF.
Nenhuma imagem sera lida por OCR ou convertida automaticamente em PDF.
