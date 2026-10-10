# Pessoal - colaboradores ativos do local aberto

## Pedido e impacto

- Ao abrir o card de obra/centro de custo, a aba Colaboradores deve exibir
  apenas quem esta ATIVO e possui vinculo atual naquele local.
- RhDpPessoal usa getRhColaboradores -> RhColaboradorController.index ->
  listarColaboradoresRh. O controller define o escopo por usuario; o validator
  ja aceita obra_id e status. Nenhuma permissao ou endpoint novo.
- O escopo autorizado anteriormente sobrescrevia o filtro do local escolhido,
  fazendo aparecer colaboradores de todas as obras autorizadas.
- O vinculo atual e RhColaborador.obra_id; transferencias aprovadas atualizam
  esse campo. RhColaboradorVinculo permanece como historico, sem alteracoes.

## Implementacao

- backend/src/services/rhService.js: apos validar o acesso, aplicar obra_id
  exato quando informado; usar o conjunto permitido somente sem filtro local.
- frontend/src/pages/RhDpPessoal.jsx: enviar status ATIVO quando ha local aberto.
  A listagem geral do RH/DP continua sem esse filtro fixo.
- Preservados busca, contadores, solicitacoes, transferencias, exportacoes,
  acoes de pagamento, fechamento por solicitacao e protecao contra resposta
  obsoleta. A consulta compartilhada tambem corrige o filtro de obra no cadastro
  geral, sem excluir seus inativos/afastados.
- Sem migration, alteracao cadastral ou financeira, banco real ou deploy.

## Validacoes

- backend/scripts/validarRhColaboradoresPlanilha.js: testes em memoria para
  varios locais autorizados, filtro numerico/string, ATIVO, INATIVO/AFASTADO,
  sem local, transferido, acesso negado e escopo vazio/global. Exportacao e
  reimportacao completas preservadas. Aprovado.
- npm run test:rhdp-pessoal-solicitacao: aprovado, conferencia e fechamento
  por solicitacao/idempotencia preservados, sem banco.
- validarEscopoRhDpUsuarioObra.js e validarRhPrimeiraLotacao.js: aprovados
  com persistencia simulada, sem escrita no banco.
- frontend/scripts/validarRhPessoalPorLocal.mjs: ampliado com inativos,
  afastados, sem local, centro de custo, cadastro global e local sem ativos;
  inclui navegacao, permissoes, mobile e pagamentos individuais/coletivos.
- npm run test:rhdp-pessoal-local: aprovado nas variantes legado, etapas e
  gerencial, usando componentes reais com APIs locais em memoria.
- npm run build: aprovado. Avisos existentes de Browserslist e chunk >500 kB.
- git diff --check e sintaxe dos arquivos backend/testes: aprovados.
- Teste auxiliar validarRhPessoalFluxo.js: nao executa os cenarios de
  transferencia por mock ausente de ./notificacoes no carregamento de
  rhTransferenciaService.js. Esses arquivos/fluxo nao foram alterados por este
  ajuste; nao confundir com falha da consulta corrigida.

## Estado e proximo passo

- Implementado localmente na refactor/frontend. Sem commit/push/main/deploy.
- Pix Copia e Cola e resumo compacto da fila pendentes preservados, inclusive
  em arquivos compartilhados. Nao incluir tudo automaticamente em commit
  isolado. outputs/ fora dos commits.
- O pacote Pessoal/DP continua fora da main conforme orientacao anterior.
- Proximo passo: publicar somente quando solicitado. Em dev, conferir dois
  locais autorizados e a
  transferencia aprovada; conferir historico e cadastro global intactos.

## Publicacao DEV autorizada - 2026-10-10

Usuario autorizou commit/push das pendencias na refactor/frontend. Cadastro/
planilha e conferencia por solicitacao revalidados e aprovados. UI Pessoal nos
tres modos e build permanecem validos, sem alteracao funcional posterior.
outputs/ excluido. Pessoal/DP nao promovido para main; sem banco/EC2 neste passo.
