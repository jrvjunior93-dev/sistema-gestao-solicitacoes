# Fila: filtros e recebimento DP; relatorio de envios - 2026-10-15

## Ownership temporario

Agente unico desta conversa, sem delegacao. Reserva: pagamentoManualFilaService,
paymentValidators, FinanceiroFilaPagamentos, dominios/consultas de recebimento DP,
rhPagamentoSolicitacaoDomain/Service, RhDpPagamentoModal, relatorios RH/DP e sua
integracao, testes backend/UI e READMEs canonicos financeiro/RH-DP.
Usuario pediu filtros por empresa/credor/origem DP/recebimento, coluna de
recebimento, DINHEIRO no pedido e relatorio dos titulos enviados com status para
conferencia de duplicidades. Sem autorizacao de commit/push/deploy nesta etapa.

## Invariantes

- Empresa do titulo/colaborador nao e a empresa pagadora da baixa.
- Recebimento solicitado pelo DP nao e o instrumento usado para efetuar a baixa.
- Preservar permissoes/escopo, snapshots financeiros, historico e idempotencia.
- GET/relatorio nao grava nem cancela titulos. Suspeita nao e prova de duplicidade.
- DINHEIRO nao deve exigir/inventar conta ou chave Pix; identificacao preservada.
- Sem banco real, migration aplicada, EC2, PM2, S3 ou Vercel pelo agente.

## Estado

Implementacao local na branch codex/fila-filtros-recebimento-dp-20261015,
criada de origin/refactor/frontend=10c58364. outputs/ preexistente preservado.

## Implementado

- Fila: filtros SQL por origem RH_DP/RH_DP_TICKET, empresa do titulo, credor e
  modo; antes do limite, inclusive totais estruturados. Catalogos minimos da fila.
  Filtro/URL/workspace limpa selecao de baixa, conserva drafts e revisao de GET.
- Colunas empresa do colaborador e recebimento; empresa da baixa rotulada pagadora.
- Modo projetado por JSON_TABLE sobre a solicitacao identificada no documento e
  referencia exata do titulo. Vale respeita a empresa. Fallback conservador de
  Pix no beneficiario, demais legados sem evidencia ficam NAO_INFORMADO.
- DINHEIRO sem dados bancarios/favorecido bancario; exige forma financeira ativa.
  Referencia de titulo no JSON conserva modo escolhido. Sem migration ou backfill.
- Relatorio novo no hub/rotas/navegacao central, permissao de relatorios existente,
  escopo preservado, todos os titulos realmente enviados e registros/status da fila.
  Alerta por id distinto+colaborador/competencia/empresa/percentual/valor, somente
  informativo; nao trata reenvio como novo titulo, nao cancela nem da baixa.
- Arquivos novos principais: pagamentoFilaFiltrosDomain.js,
  rhTitulosEnviadosRelatorioService.js, RhDpTitulosEnviados.jsx,
  recebimentoDp.js e validadores/QA dedicados. Demais arquivos conforme git diff.

## Validacoes

- Backend: filtros/SQL MySQL gerado pelo ORM com execucao interceptada, query
  negativa/injecao, report com ACL/granular/escopo e dados inteiramente simulados.
- DINHEIRO individual/todos/selecionados, forma inativa bloqueada/rollback,
  documento obrigatorio, sem dados bancarios falsos, snapshot e envio concorrente.
- Regressao: pagamento/envio parcial, pessoal/escopo, comprovantes, baixa/estorno,
  cheques, cartao opcional, seguranca direta/anexos e PDF, tudo sem banco real.
- UI real de fila/DP e relatorio com APIs em memoria, desktop/mobile, filtros/URL,
  selecao, persistencia, colunas/ordem/larguras, negativas, erro e sem baixa.
  Capturas locais em outputs/, inspecionadas visualmente, fora do Git.
- Build local e navegacao; avisos anteriores de Browserslist/chunk grande.
- Navegacao nova deriva do catalogo central, sem aumentar destinos manuais.
  Trinco legado de ModuloRelatorios nao foi relaxado nem regravado.
- Referencia tecnica da projecao:
  [MySQL 8.4 JSON_TABLE](https://dev.mysql.com/doc/refman/8.4/en/json-table-functions.html).
  Teste SQL intercepta a execucao: nao comprova execucao em MySQL real.

## Limites e proximo passo

- Docs (527 Markdown/19 canonicos), build final, navegacao, sintaxe e diff
  aprovados. UI de fila (inclui regressao completa de colunas/arquivos/baixa),
  modal DP (inclui DINHEIRO desktop/mobile) e relatorio aprovadas.
  Trinco emite aviso sobre legado ModuloRelatorios ao importar o catalogo central;
  nao foi regravado nem reduzido artificialmente, demais destinos preservados.
- Ownership liberado. Implementacao local pronta para publicacao/homologacao
  somente apos autorizacao do usuario, sem commit nesta etapa.
- Sem commit/push/deploy, banco real, EC2, S3 ou migration pelo agente.
- Homologar em dev com conta salario, Pix, dinheiro e outra conta, registros
  legados sem modo, Ticket, empresas/pagadoras distintas e negativos de acesso.
  Relatorio mantem padrao dos demais relatorios RH de leitura integral do recorte;
  monitorar volume/tempo em dev se historico crescer. Nao tem corte oculto de 500.
- Fila preserva limite anterior de 500; filtros estruturados precedem o limite.
  Busca textual mantem semantica anterior. GET/relatorio nao altera historico.

## Publicacao DEV autorizada

- Usuario autorizou commit/push refactor/frontend e comandos de atualizacao DEV.
  Base remota conferida novamente: 10c583645037695ff3e8d8ea327497d9b24f6190.
  Main permanece fora do escopo desta publicacao.
- Novo script ops/deploy/atualizar-dev-fila-filtros-dp-20261015.sh valida checkout,
  branch, ancestrais e mutex; instala dependencias e executa testes isolados.
  Antes do restart valida backend-dev, caminho DEV, porta 8001, identidade do
  banco DEV, flags equivalentes e schema somente leitura. Nao executa migrations,
  seeds/backfills, nao altera .env/flags e nao reinicia backend-solicitacoes.
- Teste validarDeployFilaFiltrosDpDev.js executa os blocos reais em VM sem
  EC2/banco/rede; cobre identidade/porta/processo/configuracao divergentes,
  negativas de schema, AUSENTE/false equivalentes, preservacao de flags e health.
- Bash -n, teste do deploy, backend/regressoes, build, navegacao, docs e diff
  repetidos e aprovados. Avisos preexistentes de Browserslist/chunk grande.
- Regressao completa da fila e modal DP, novos filtros e relatorio novamente
  aprovados em desktop/mobile com APIs em memoria. Ownership liberado.
- Aplicacao na EC2 fica a cargo do operador, com SHA remoto fixado nos comandos;
  se houver migrations pendentes ou divergencia, parar sem forcar configuracao.
  Homologar filtros/relatorio e DINHEIRO antes de qualquer promocao para main.
