# Modulo TREINAMENTO

## Papel

Treinamento centraliza FAQ, guias, videos, documentos e trilhas internas, registrando leitura ou conclusao por usuario.

## Regras

- conteudo possui modulo, tipo, titulo, corpo/arquivo, ordem e estado de publicacao;
- rascunho e visivel apenas para quem gerencia;
- publicacao exige permissao especifica;
- leitura/conclusao e idempotente por usuario e conteudo;
- atualizar uma versao relevante pode exigir nova conclusao sem apagar a anterior;
- videos e documentos privados usam S3 e URL assinada;
- Editar e Excluir sao acoes explicitas na lista, apenas para quem ja possui
  permissao de gerenciar treinamentos (inclusive excecao administrativa existente).
  Editar abre o formulario inline; Excluir pede confirmacao e arquiva o conteudo,
  retirando-o do acervo ativo sem apagar arquivos nem leituras/conclusoes.
- Trocar arquivo apenas seleciona o novo material. Salvar confirma o envio e
  substitui a referencia do mesmo conteudo, preservando seus campos editados.
  Falha de upload mantem o arquivo anterior e permite tentar novamente. Se o
  conteudo acabou de ser criado, o retry usa seu ID, nao cria outro registro.
  Acoes concorrentes sao bloqueadas enquanto salva/publica/arquiva/envia.
- MP4 e WebM podem ser reproduzidos no visualizador interno amplo, com controles,
  volume, tela cheia e playsInline no celular. Fechar desmonta o player. Acesso
  segue pelo endpoint autorizado e URL assinada temporaria; nao torna bucket
  publico nem baixa o video inteiro para montar a previa. Codec incompativel,
  link expirado ou falha de rede mostram alternativa de abrir/baixar o arquivo.
  Assistir nao marca conclusao automaticamente: Concluir continua explicito.
- Leitor ve somente PUBLICADO, inclusive se adulterar filtros da API para
  pedir RASCUNHO/ARQUIVADO. Gestores conservam consulta administrativa existente.
- Relatorio de reproducao possui permissao granular independente
  `treinamento.relatorios.visualizar`, em Configuracoes > Permissoes de Areas
  por Usuario > Treinamento > Relatorios de Treinamento > Visualizar relatorios.
  Somente assistir/gerenciar/publicar nao concede consulta; sem configuracao
  granular o acesso ao relatorio e negado, preservando o bypass administrativo
  existente do modulo. Frontend, middleware e controller verificam acesso.
- Rastreio agrupa por conteudo, versao do arquivo e usuario. Sessoes assumidas
  pelo SUPERADMIN ficam separadas, com identidade do ator original. Identidade
  vem da autenticacao, nunca de usuario/ator informado no payload do navegador.
- Tempo reproduzido soma segundos reais do player, inclusive repeticoes;
  cobertura une trechos unicos do video e nao infla ao reassistir. Avancos e
  retornos maiores que 2 segundos sao registrados; avanco para os ultimos 5%
  e indicado como "avancou ao final", sem preencher o trecho pulado.
  Ultimos 100 saltos sao detalhados, mantendo contador total. Tempo exibido
  em minutos:segundos; velocidade altera cobertura, nao segundos reais.
- Concluir continua manual, sem percentual minimo nem conclusao automatica.
  Conclusao manual continua por conteudo (inclusive apos trocar arquivo),
  explicitamente separada da cobertura por versao no relatorio.
- Pausas, buffering, aba oculta e saltos nao contam como reproducao; amostragem
  conservadora pode perder pequenos trechos nas transicoes. Eventos sao enviados
  a cada 5 segundos e ao pausar/fechar. Sequencia/hash/replay, locks e transacao
  impedem contagem duplicada em retry; memoria limitada em falha de rede, com
  aviso ao usuario, sem impedir reproducao ou Concluir. Fechar navegador/queda
  abrupta pode perder a cauda nao enviada. Nao ha historico retroativo nem prova
  de atencao; telemetria depende dos eventos informados pelo navegador.
- Downloads/nova aba nao sao rastreados. O relatorio lista apenas quem abriu
  o player interno; ausencia de registro nao prova ausencia de treinamento.
  Trocar arquivo preserva progresso anterior e inicia nova versao pela referencia
  do arquivo (hash da key/URL persistente, nunca assinatura temporaria).
- Migration estrutural `202610140003_treinamento_video_rastreio.js` cria somente
  `treinamento_video_progressos` e `treinamento_video_sessoes`, sem seeds/backfills.
  Deve ser aplicada no ambiente autorizado antes de habilitar os endpoints.
  Excluir/arquivar conteudo nao apaga o rastreio. Nenhum acesso e concedido por
  migration. Relatorios nao substituem avaliacao formal de competencia.

## Integracoes

Usuarios fornece identidade e progresso. Biblioteca pode fornecer modelos. Cada modulo pode possuir conteudos associados, sem transferir suas regras de negocio para o material educacional.

## Mudanca segura

Testar rascunho, publicacao, permissao, arquivo, leitura repetida, nova versao, filtros por modulo e relatorios.
