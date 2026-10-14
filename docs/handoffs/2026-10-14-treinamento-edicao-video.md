# Treinamento: edicao, exclusao e video interno - 14/10/2026

## Escopo e estado

Usuario pediu editar/excluir conteudos de treinamento, trocar videos e avaliar
reproducao no proprio sistema em modal amplo. Implementado localmente, sem
commit/push, banco/S3 reais, .env, migration ou EC2. Worktree reutilizado
promocao-dp-main-20261014/Fluxy, branch codex/rhdp-pagamento50-transferencia-dp-20261014.
Preservados todos os ajustes locais RH/DP das tarefas anteriores.

## Diagnostico e mudanca

- API ja tinha PATCH/DELETE/upload e permissao allowTreinamentoManage. UI
  dependia de clicar na linha e encontrar formulario abaixo, com Arquivar
  somente no rodape. Agora Editar/Excluir sao explicitos na lista; Editar
  direciona ao formulario inline existente. Leitor nao recebe gestao.
- Excluir continua arquivamento reversivel (status ARQUIVADO), com confirmacao;
  nao apaga arquivo do S3 nem leituras/conclusoes. Gestao/publicacao conservam
  regras existentes, sem novas permissoes ou concessoes a usuarios.
- Selecionar arquivo nao faz upload imediato: Salvar confirma substituicao no
  mesmo registro, preservando os outros campos editados. Trava/fieldset impedem
  duplo clique e mudanca de alvo durante operacao. Se criar conteudo e o upload
  falhar, formulario conserva ID e arquivo pendente; retry edita, nao cria outro.
- Player reutiliza VisualizadorArquivoModal/useVisualizadorArquivo: MP4/WebM
  por MIME/extensao, controles nativos, playsInline, tela cheia, largura1200px
  adaptada ao viewport. Sem autoplay e sem conclusao automatica. Fechar desmonta
  video. Link vem do endpoint autorizado com assinatura temporaria existente;
  nao publica bucket nem exige leitura integral em Blob do arquivo real.
- Backend rejeita arquivo nao MP4/WebM no slot VIDEO e tipo de slot invalido.
  Falha de upload nao substitui referencia anterior. Arquivo antigo preservado.
- Corrigido vazamento de metadados na listagem: leitor anteriormente conseguia
  pedir status RASCUNHO/ARQUIVADO na query; agora sempre exige PUBLICADO.
  Detalhe/assinatura ja exigiam publicacao para leitor, e foram preservados.
- services/treinamento.js normaliza /uploads legados para origem da API;
  URLs absolutas assinadas permanecem intactas. Nenhuma mudanca no S3/CORS.

## Arquivos

- frontend/src/pages/Treinamento.jsx
- frontend/src/components/ui/VisualizadorArquivoModal.jsx
- frontend/src/services/treinamento.js
- backend/src/services/treinamentoService.js
- frontend/scripts/validarTreinamentoEdicaoVideo.mjs (novo)
- backend/scripts/validarTreinamentoEdicaoVideo.js (novo)
- docs/modulos/treinamento/README.md, ownership e este handoff

## Validacoes

- Backend novo: metadados editados, troca de video, falha preserva anterior,
  tipo/extensao invalidos sem upload, leituras/arquivo preservados no archive,
  assinatura privada900s, leitor sem draft/archive e rotas de gestao protegidas.
- Frontend novo: pagina/helpers reais, desktop1366/mobile390; Editar/Excluir,
  selecionar sem upload, salvar com duplo clique, descricao preservada,
  falha/retry sem duplicar criacao, cancelar/confirmar exclusao, leitor sem
  gestao, endpoint negado sem player. Gera WebM local de QA com MediaRecorder
  e efetivamente reproduz no elemento video (readyState/currentTime), nao
  apenas verifica que a tag existe. Fechar remove player; nao conclui sozinho.
  Adapter real normaliza legado /uploads e conserva link assinado.
- validarVisualizadoresArquivos.mjs outros: 11 handlers/endpoints reais,
  PDF/imagem/HTML interno/blob, desktop/mobile, foco/Escape/pilha, 403 e respostas
  atrasadas aprovados; camada compartilhada conserva comportamento anterior.
- validarSegurancaAcessoDireto.js; build/navegacao frontend; test:docs,
  sintaxe do service e git diff --check aprovados. Sem banco/rede externa nos
  testes funcionais; bucket e credenciais nao consultados.
- Evidencias em outputs/treinamento-edicao-video/video-{1366,390}.png (fora release).
  Avisos preexistentes de Browserslist/chunks grandes no build.

## Limites e proximo passo

Suporte depende do codec/browser/rede; nao ha transcodificacao ou teste no S3
real. A assinatura continua900s; para link expirado, reabrir gera novo link.
Formato incompativel conserva alternativas Abrir em nova aba/Baixar.
Arquivar nao e apagar fisicamente; nenhuma remocao material ocorreu neste turno.
Se API PATCH salvar campos e upload falhar, os campos ficam salvos e o video
anterior fica intacto; UI informa falha e conserva novo arquivo para retry.

Quando usuario autorizar commit/push: conferir refs remotas/trabalho concorrente,
integrar somente estes arquivos e os ajustes locais anteriores expressamente
incluidos no pedido. Excluir outputs/ e caixa de outro worktree. Reexecutar
validacoes, publicar refactor/frontend e fornecer comandos backend-dev, sem
executar EC2. Homologar com video real enviado antes de promocao a producao.
Frontend/backend devem acompanhar juntos o ajuste; nenhuma migration.

Ownership liberado apos verificacao; alteracoes locais preservadas.
