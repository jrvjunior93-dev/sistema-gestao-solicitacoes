# PWA: datas, rejeicao de saldo e observacoes - 2026-10-18

## Autoridade e estado

- Usuario pediu ajustes PWA e notas dos titulos. Confirmou explicitamente
  rejeicao de saldo dos parcialmente pagos, sem estorno e com nova autorizacao.
- Implementacao LOCAL no worktree performance-fila-dp, branch
  codex/autorizacoes-textos-ofx-diagnostico-20261018, HEAD publicado 6cee2949.
  Usuario autorizou agora commit/push na refactor/frontend e roteiro DEV.
  Nao executar deploy, migration real, banco, EC2, PM2, .env ou permissao.
- Preservar pacote local anterior de textos/OFX descrito em
  2026-10-18-autorizacao-textos-ofx-obras.md. Ele compartilha alguns componentes
  e scripts; nao descartar ou publicar arquivos misturados sem revisar escopo.
  Outputs preexistentes e QA ficam fora de commits.
- Skill frontend-design aplicada junto as referencias de interacao e
  responsividade, subordinada ao padrao compacto/operacional do repositorio.

## Dependencias mapeadas e alteracoes

- DateInputBR, util editarDataBR: modo posicional opt-in, teclado/caret,
  beforeinput mobile e recorte/colagem; API recebe somente ISO valido.
- AutorizacoesPorObra, AutorizacaoTituloDetalhe, autorizacaoPagamentoSituacao
  e CSS: filtros automaticos apenas com duas datas validas/ordenadas, selecao
  global preservada, total junto a obra, acoes junto a navegacao, motivo sob
  demanda. Detalhe e historico do aparelho/anexos continuam independentes.
- Endpoints existentes painel/obras, painel/titulos, autenticacao/opcoes e
  decidir. REJEITAR_FILA e uma acao nova no mesmo contrato nominal/passkey.
  Misturar rejeicao de fila com pendentes exige confirmacoes separadas mesmo
  no mesmo lote. Revalidacao serial, estado atual e mutex continuam ativos.
- pagamentoAutorizacaoService e novo pagamentoAutorizacaoRejeicaoFila:
  locks titulo -> lote -> item; rejeita apenas saldo PAGAR aberto/parcial;
  bloqueia banco ativo, revisao DP e ciclo posterior. Encerra filas abertas,
  marca item REJEITADO e audita sem alterar valores/comprovantes/movimentos.
  Incrementa revisao do lote, invalidando challenges/envios antigos.
- Nova coluna JSON bloqueio_pagamento_proprietario em TituloFinanceiro.
  Policy compartilhada de disponibilidade e hooks individual/bulk impedem
  novas baixas; fila inclui o campo e banco mostra pendencia correta. Guard
  de negociacao impede fabricar novo saldo desbloqueado. Correcao de medicao
  continua permitida sob suas regras e conserva o bloqueio do proprietario.
- Apenas AUTORIZAR validado em NOVO item/ciclo posterior remove bloqueio,
  apos revalidar snapshot/documentos, com evento SALDO_REAUTORIZADO. Item
  antigo invalida sem liberar. Preparar novo lote nao libera. REVOGAR legado
  nao foi convertido em rejeicao, continua barrando baixa parcial/total.
- FinanceiroCard e observacoesTitulo: campo ao lado de Total das formas,
  aplicado a formas/parcelas, sem perder notas/instrucoes. Limite 1000 combinado
  checado antes de gravar favorecidos. Root observacoes segue ao backend para
  partes por favorecido; tituloObservacoesDomain preserva instrucao servidor.
- FinanceiroFilaPagamentos: Observacoes apos Titulo/documento, expansao de
  notas longas, mesmas APIs/permissoes. Preferencias e alinhamento de colunas
  testados com quantidade nova. Nenhuma selecao/regra de baixa alterada pela nota.

## Migration e publicacao DEV

- 202610180002_bloqueio_pagamento_proprietario.js: somente addColumn JSON
  nullable, idempotente, sem seeds/backfill, nao preencher titulos antigos.
  Down recusa apagar bloqueios financeiros sem revisao explicita.
- Nao executar migrate generico em producao. Primeiro publicar somente o
  pacote autorizado e fornecer roteiro DEV com identidade/backup/preflight,
  whitelist de migrations pendentes e health 8001/backend-dev. Nao reutilizar
  runner RH que autoriza exclusivamente 202610180001. Usar o novo runner
  aplicarMigrationPwaSaldoDev.js e atualizar-dev-pwa-saldo-20261018.sh.
  Eles preservam flags, validam host/UUID/caminho/PM2/porta/watch/JSON, exigem
  backup e autorizam exclusivamente 202610180002, com verificacao antes/depois.
  Outra pendencia, inclusive RH 202610180001, interrompe sem aplicar DDL.
- Escopo publicado: PWA/notas e os rotulos usados pelos dois componentes PWA.
  OFX, textos de outras telas e seu handoff/testes continuam locais/excluidos.
- Sem teste MySQL real nesta etapa. Homologar migration, locks, retorno de
  rejeicao/nova autorizacao e passkey no DEV antes de qualquer promocao main.

## Validacoes locais executadas

- Publicacao: runner DEV testado em validarDeployPwaSaldoDev.js com E/S
  isolada; negativa para producao/UUID/host/porta/processo/watch/flags, backup
  ausente, outra migration e falha DDL. Bash -n do roteiro aprovado. Sem EC2.
- Backend test:pwa-rejeicao-fila: migration simulada idempotente, policy/hook
  individual/bulk, rejeicao parcial preservando 30 pagos e 70 de saldo,
  comprovantes/movimento, bloqueio OFF/PILOT, nova autorizacao, replay, rollback
  integral em erro/auditoria, banco, revisao DP, ciclo posterior e ACL.
- validarBloqueioRetornoObra, validarTituloRenegociacaoService/Vinculos,
  validarMedicaoValorPagamento, validarFilaInstrumentos,
  validarPainelAutorizacoes, validarCompraDiretaFreteFinanceiro e
  validarSolicitacaoFavorecidosIntegracao aprovados com modelos isolados.
- Frontend test:pwa-rejeicao-datas: datas reais digitadas, final primeiro,
  autoaplicacao, ano limitado, beforeinput, substituicao de segmentos,
  selecao multipagina/obra, motivo/passkey, rejeicao em fila/parcial,
  navegacao nativa, ACL/pausa, duplo clique e stale/invalidacao.
- FinanceiroCard real desktop/mobile: notas no payload e preservadas na
  falha/refresh, descarte sem vazar para outro titulo e permissoes mantidas.
- validarFilaInstrumentosUI: coluna/ordem/visibilidade, preferencias antigas,
  comprovantes/anexos, instrumentos, 650 registros/8 cards e selecao aprovados.
- Build frontend aprovado (618 modulos; avisos preexistentes browserslist e
  chunks grandes). git diff --check aprovado. Screenshots locais sem commit.

## Roteiro funcional DEV

1. Data final primeiro; depois inicial: aplicar automaticamente sem erro.
   Editar somente dia/mes/ano selecionado, testar colagem e ano com 5 digitos.
2. Selecionar pendentes em obras/paginas distintas; navegar sem decidir;
   limpar globalmente; conferir total unico e ordem dos quatro botoes.
3. Rejeitar titulo na fila com motivo/passkey. Financeiro nao pode pagar nem
   reenviar diretamente. Repetir em PARCIAL: pago/comprovantes inalterados,
   somente saldo suspenso. Titulo quitado nao oferece rejeicao.
4. Tentar banco ativo, revisao DP e duas decisoes concorrentes: recusar/rollback
   sem nova baixa. Nao forcar cancelamento bancario ou alterar flags.
5. Preparar NOVO ciclo do saldo e aprovar: so entao permitir nova fila/baixa.
6. Criar titulo com notas, multiplas formas/parcelas e favorecidos; conferir
   nota na fila junto a instrucao original, sem dados de outra parte.
