# Navegacao completa por lotes - 12/10/2026

## Autorizacao e estado

Usuario autorizou aplicar o plano completo apos E1/E2 e E3a publicados.
Base refactor/frontend 60f3f033. Implementacao sem delegacao, deploy, main,
banco ou escrita real em sistemas externos. Em pedido posterior, usuario
autorizou commit/push deste lote na refactor/frontend e instrucoes para
atualizar a EC2 DEV. Nao inclui main, deploy remoto nem homologacao financeira
real. Alteracoes alheias de auditoria preservadas fora deste lote.

## Ordem e gates

E3b Compras (criacao/revisao), E3c editores/entregas/anexos/cadastros;
E4 Financeiro; E5 Colaboradores; E6 Custos/Obras/Contratos/Comercial/CRM;
E7 demais modulos/portas publicas; E8 ensaio integrado e homologacao DEV.
Cada lote mapeia campos/endpoints/ACL/revisao, altera adapters opt-in e executa
positivos/negativos, replay, troca de identidade, desktop/mobile e desempenho.
Nenhuma linha do inventario aprovada apenas por usar um hook compartilhado.
Sem manter todas as paginas vivas nem snapshot de permissoes/DTOs/saldos.

## E3b implementada localmente - normal e direta

Mapa: NovaSolicitacaoCompra atende normal/direta/reaproveitar por wrappers;
GET obras/minhas modo CRIACAO, insumos/unidades, apropriacoes por obra,
formas permitidas e busca de credor; uploads/importacoes apenas por acao.
Revisao consome draft e cria pelo POST original com mutex existente.
Persistencia anterior por usuario/tipo com TTL 7 dias e debounce 800 ms;
cleanup cancela janela e perde ultima edicao antes de alternar. Obra/forma
elegiveis dependem de consultas novas, nunca de snapshot. Edicoes e modais
necessitam adapter separado de catalogos/loading/preview/payload aprovado.

Campos e modal de apropriacao agora usam memoria imediata por pagina/aba.
O storage legado continua com TTL/debounce, com fallback de sessao e dono
da aba: duas criacoes do mesmo tipo nao compartilham payload de revisao,
nao apagam o trabalho da outra e nao importam seu draft enquanto aberta.
Conferencia/PDF aprovado pertence ao payload exato; edicao invalida ciencia.
Sucesso limpa somente o fluxo concluido. Corrigida hidratacao que apagava
rateios e protegida consulta de apropriacao contra resultado tardio de obra.
Uploads bloqueiam navegacao/revisao/limpeza e deslocamento do item pendente;
mutex local evita repetir upload antes do primeiro terminar. Nao guarda File,
preview, loading, permissao ou catalogos no novo adapter. Referencias de
favorecidos limitadas a ID/rotulo/documento do formulario, nao DTO de Pessoas.
O endpoint original continua validando os IDs e a criacao; backend intacto.

## E3c parcial - cotacao

Busca/categoria, modo Cards/Mapa, visibilidade de colunas do mapa, fornecedor
rapido e comentario preservados. Resposta interna guarda apenas campos
digitados e ID alvo; exige GET autorizado e mesma revisao de dados comerciais
para restaurar o modal. Mudanca de preco/quantidade/status/saldo bloqueia
sobregravacao, conserva o draft para consultar/copiar e exige descarte
explicito antes de substituir. Sem token publico, URLs/arquivos, ACL ou saldo
restauravel. Quantidades/vencedores sobrevivem se comparativo inalterado;
se mudar, pede reconferencia sem enviar pedidos. Queries tardias descartadas.
Salvar resposta/upload/links/comentario/cancelamento tem mutex e navegacao
ocupada; callbacks de negocio nunca disparam por restauracao.

## Validacao e limites

- `node frontend/scripts/validarTituloCompras.mjs`: passou com controllers
  isolados e UI real nos dois modos; sem workaround da perda de apropriacao.
- `node frontend/scripts/validarWorkspacePiloto.mjs --wizard-only`: 8 casos
  normal/direta x desktop/mobile x quota; ultima tecla, duas abas, modal,
  revisao invalidada, 403, envio unico/sucesso sem replay. Mais 2 casos de
  upload pendente/identidade e 40 ciclos de limpeza de flows passaram.
- `--cotacao-only`: 2 viewports; campos/modal, selecoes, consulta nova,
  conflito consultavel, GET/PATCH 403, duplo clique e troca de identidade.
- Suite completa final passou, incluindo base/Solicitacoes, E3a, tabelas,
  superadmin/negativas, E3b/upload e E3c cotacao. `npm run build` final passou
  (573 modulos; entrada principal gzip 150,14 kB). `git diff --check` passou.
- Ensaio ABBA repetido antes da publicacao: p95 32,55 ms legado / 32,50 ms atual, memoria apos 30 ciclos dentro
  do gate de 8 MiB. Nao e benchmark de cotacao, ambiente real ou producao.
- Nenhuma migration/alteracao de ACL/backend ou banco real. Publicacao Git
  autorizada separadamente; deploy remoto e homologacao DEV nao executados.
  Avisos existentes do build: Browserslist antigo e chunk >500 kB.

## Proximo passo exato / restante nao certificado

Regressao/build final aprovados localmente. Proximo lote: completar E3c:
selecao de fornecedores com reconsulta de IDs, modais de cancelamento/
encerramento/remanejo/entregas, pedido/detalhe/cadastros e reaproveitamento
em fluxo real. Ja mapeados parcialmente GerenciarCotacaoSolicitacao e
PedidoCompraDetalhe; reservar novos arquivos antes de editar. Nao chamar E3
inteira de concluida: estes casos ainda mantem o comportamento antigo.
E4 Financeiro, E5 Colaboradores, E6 demais dominios, E7 restantes e E8
homologacao DEV/dispositivos continuam pendentes. Usar inventario original,
sem certificar pagina apenas por existir na lista opt-in. Sem keepalive global.

Arquivos proprios: NovaSolicitacaoCompra/RevisarSolicitacaoCompra,
GerenciarCotacaoSolicitacao, useComprasDraft/cotacaoWorkspaceDraft,
WorkspaceContext/WorkspaceView, validarWorkspacePiloto/validarTituloCompras,
este handoff, nota no plano e secao de ownership desta sessao. Arquivos
alheios de auditoria/HANDOFF_GLOBAL/QUADRO/SESSOES e outputs preservados.

## Publicacao deste lote

Commit limitado aos arquivos proprios de frontend, testes, plano e handoff.
Registro compartilhado OWNERSHIP_ATIVO preservado sem staging integral,
pois tambem contem alteracoes de outra tarefa. Suite completa, teste de titulo
de compras, build e diff --check passaram novamente antes do commit.
EC2 DEV precisa apenas atualizar o checkout:
nao ha dependencias novas, migrations nem necessidade de reiniciar o backend
para este lote. Frontend publicado pela Vercel a partir da branch; aguardar
o deploy correspondente antes da homologacao, sem confundir push com deploy
concluido. Etapas restantes acima continuam pendentes.
