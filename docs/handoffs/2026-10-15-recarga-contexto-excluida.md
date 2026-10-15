# Recarga: consulta de historico excluido e bloqueio enganoso

## Pedido / causa

Usuario reportou alerta vermelho Solicitacao nao encontrada e botao Criar
Solicitacao desabilitado, apesar do rotulo Sem recarga anterior. Confirmou
ambiente DEV e recarga anterior cancelada/excluida. Captura mostra outras
recargas historicas do mesmo cartao. Nao foi consultado o banco real para
determinar quais titulos/prestacoes desse cartao permanecem pendentes.

Codigo reproduziu o caminho: buscarUltimaRecarga incluia solicitacao excluida;
controller chamava assertPodeVisualizarSolicitacao nela e recebia404. Frontend
apagava contexto e mostrava Sem recarga anterior, enquanto o agregador bloqueava
o POST porque faltava uma consulta concluida. Nao e falta de permissao granular.

## Implementacao local

- Branch codex/recarga-contexto-excluida-20261015, base publicado501e822f.
- recargaCartaoService inclui cancelada na associacao e procura a ultima
  recarga operacional. Pula excluidas/ausentes sem obrigacao financeira;
  preserva recarga ativa anterior e locks de criacao. Havendo titulo aberto,
  previsao, pagamento com prestacao nao validada ou referencia de titulo
  quebrada, devolve bloqueio explicito de regularizacao GEO, sem dados excluidos.
- RecargaCartaoController sinaliza historico restrito quando ACL redige dados.
  Nao converte 404 generico em sucesso nem amplia acesso ao detalhe excluido.
- RecargaCartaoFields/RecargasCartoesFields separam loading de catalogo/contexto,
  erro de ausencia, exibem estado consultando e botao Tentar novamente.
  Mantem bloqueio na falha/consulta pendente e inputs no retry. Sem rediseno.
- Backend script multicartoes ampliado, fixture UI com botao representativo da
  guarda real de NovaSolicitacao e novo validarRecargaContextoExcluidoUI.mjs.
- README Financeiro e registros workspace atualizados.

## Validacoes

- Service/controller reais com modelos/ACL adaptados: primeira recarga200,
  excluida encerrada sem404 e POST permitido, fallback para ativa anterior,
  excluida com titulo aberto/prestacao pendente ou enviada protegida, bloqueio
  do POST sem escrita, ACL negativa e nenhuma mudanca em pagamento/exclusao.
- Regressao multicartoes/saldo, medicao-recarga, middleware/schema e deploy
  saldo-dev isolado aprovados. Nenhum teste em banco real.
- UI com APIs ficticias: erro404 continua bloqueado e nao diz Sem recarga,
  retry preserva5000 e libera somente apos200 sem pendencia, loading bloqueado,
  aviso GEO de excluida pendente, ativa anterior identificada; desktop/mobile390.
  Regressoes validarRecargasMultiplasUI e validarSaldoCartoesUI aprovadas.
- Build frontend, sintaxe e diff aprovados. Imagens em
  outputs/qa-recarga-contexto-excluido, inspecionadas; nao publicar outputs/.

## Riscos / proximo passo

- Nao cancela nem exclui titulos e nao aprova prestacoes. Excluir apenas a
  solicitacao nao equivale a regularizar a obrigacao financeira.
- Usuario autorizou commit/push na refactor/frontend e comandos DEV.
- Script ops/deploy/atualizar-dev-recarga-contexto-20261015.sh confere checkout,
  processo/porta8001, identidade staging, flags sem sobrescrita e schema somente
  leitura; reinicia apenas backend-dev. Sem migration nova ou aplicacao automatica.
- validarDeployRecargaContextoDev.js executa os blocos reais com PM2/banco
  ficticios e cobre negativas de ambiente, identidade, schema, flags e health.
- Sem EC2, banco real, deploy ou restart pelo agente; outputs/ fora do commit.
- Homologar no DEV depois da atualizacao pelo usuario. O cartao real pode
  continuar bloqueado se houver pendencia; nesse caso consultar titulo/prestacao
  em modo somente leitura e orientar GEO, sem alterar historico automaticamente.
