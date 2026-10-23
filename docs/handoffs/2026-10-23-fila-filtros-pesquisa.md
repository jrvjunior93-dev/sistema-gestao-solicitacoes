# Fila de pagamentos: filtros digitaveis - 23/10/2026

## Autorizacao e isolamento

Usuario pediu autocomplete dos filtros existentes e novos filtros de obra/
centro de custo, favorecido, vencimento, solicitacao, titulo e forma de pagamento.
Confirmou explicitamente que forma significa a prevista no titulo, nao efetiva.
Agente unico, sem delegacao, base origin/refactor/frontend fee28b6d na branch
isolada codex/solicitacao-distribuicao-gerencial-20261023. Delta anterior de
distribuicao gerencial preservado. Sem commit/push, producao, EC2, migrations,
banco/S3 reais, dependencias novas ou alteracao dos dados/calculos financeiros.

## Mapeamento e alteracoes

- Pagina real usa GET paginado da fila, contas e instrumentos (ultimo apenas
  com permissao de baixa). applyFilters ja reiniciava pagina e selecao; mantido
  com novas chaves no workspace/URL e sem apagar edicoes de pagamento locais.
- Novo FiltrosFilaPagamentos reutiliza ApropriacaoAutocomplete/DateInputBR:
  selecao explicita, limpar individual/todos, debounce350ms, minimo2caracteres,
  resposta antiga descartada/AbortController, intervalo de datas com submit e
  validacao real de calendario. Status/busca geral saem da toolbar e permanecem
  no bloco. Autocomplete compartilhado recebe apenas callback opcional onClose:
  fecha/limpa busca transitoria ao sair por foco/Tab; outros usos sem callback
  mantem comportamento anterior. Skill frontend-design orientou UI compacta,
  responsiva e utilitaria; nenhum redesenho do fluxo de baixa.
- Novo GET sugestoes usa allowFilaPagamentosRead + validator com whitelist.
  Consulta SELECT com limite21/retorno20 e escopo/status da listagem, sem
  hidratar titulos ou carregar a fila inteira na aplicacao. Rejeicoes usam
  ultima decisao por titulo e exclusao por fila ativa, como index existente.
  Sugestoes independem dos demais filtros, permitindo substituir selecao vazia.
  JOIN explicita deleted_at IS NULL, espelhando defaultScope do TituloFinanceiro
  tambem na consulta bruta de sugestoes; registros excluidos nao viram opcoes.
- pagamentoFilaPesquisaDomain compartilha status/rejeicao e condicoes de
  vencimento (data do titulo, senao previsao da linha; rejeicao usa titulo).
  FavorecidoSQL replica prioridade de beneficiaryData, sem credor como fallback
  comum: negociacao -> parte direta/origem -> medicao aprovada exata -> titulo/
  beneficiario bancario/solicitacao. Dados incompletos e vinculos ambiguos nao
  herdam destinatario errado; DP em dinheiro preserva excecao existente.
- tituloWhere adiciona obra/solicitacao via whereOrigem (participacoes tambem),
  titulo, favorecido e forma prevista. Filtros/datas aplicados antes do LIMIT e
  nas contagens; resumos mantem independencia da busca textual q. Total de
  baixados agora reutiliza o mesmo filtroConsulta com escopo compartilhado dos
  demais resumos, sem mudar regras de leitura/escrita de registros.
- Nenhum handler de baixar/estornar/resolver, idempotencia, movimentos,
  pagamento parcial ou motor financeiro alterado. Ajustes nos QAs legados sao
  apenas nova dependencia isolada/recursao Op.and/seletores de combobox.

## Validacao concluida

- Backend novos validadores/datas/IDs e SQL gerado MySQL com filtros antes do
  limite; novo QA de nomes efetivos executa projeccao SQL em SQLite em memoria
  para16casos e compara com helper real da UI. Apenas expressao de recebimento
  DP/JSON_TABLE e substituida pelo resultado de sua leitura ja testada no QA DP.
- Sugestoes25combinacoes campo/status: limite/escopo/ultima decisao/forma prevista,
  sem documentos/cadastro integral; transporte/modelos interceptados, sem rede.
- Fila DP/paginacao/performance, baixa/estorno, comprovantes, destinatarios,
  liquidacao rateada1000casos, relatorio DP, hardening e seguranca2304comparacoes/
  66casosescopo/48rotas HTTP aprovados. UI novos filtros1366/390 aprovada;
  regressao de multiplas fontes1366/390 tambem aprovada.
- Auditoria geral validarPermissoesFinanceiroRota FALHA preexistente:
  GET /financeiro/titulos/:id/negociacao/pagamento nao consta da tabela auditada.
  Confirmado em git show HEAD:backend/src/routes.js e no mapa em HEAD. Nao
  corrigir permissao da negociacao sem escopo separado; novo GET usa guarda
  especifica da fila, nao allowFinanceiro. Testes especificos/hardening passam.
- Rodada final novos filtros backend/UI aprovada; restauracao de rotulos pelo
  DTO ja autorizado e URL validada sem nova consulta. Regressao completa da fila
  --filtros-dp: baixas, instrumentos, carteira/cheques/estorno, colunas persistidas,
  arquivos/preview e dados/copia, comprovantes e650titulos/13paginas/8status.
- --concorrencia aprovado: respostas atrasadas isoladas por recorte, preferencia
  apos reload e fallback sem observer. Nenhuma alteracao das chaves de baixa.
- Regressao do bloco anterior de distribuicao gerencial1366/390 aprovada apos
  callback opcional no autocomplete; demais usos sem callback preservados.
- Build final640modulos/15,05s aprovado; avisos existentes de Browserslist/
  chunk grande. Prints1366/390 conferidos visualmente, sugestoes no viewport,
  sem erro simulado persistente nem overflow da pagina. Node --check/diffcheck
  aprovados; docs608Markdown/19canonicos. Teste SQLite requer Node recente
  (validado no Node24 local); nao e dependencia do runtime de producao.
- Implementacao local concluida, ownership liberado. Proximo passo exato:
  apenas mediante autorizacao de publicacao, revisar delta (inclui tarefa
  anterior separada), commitar/push na refactor/frontend e fornecer roteiro
  DEV; depois conferir latencia/planos e casos reais no DEV antes de promover.

## Limites e teste DEV recomendado

Nao conectado a MySQL real; sintaxe emitida pelo ORM/dominio e consultas
interceptadas, logica SQL de nomes executada em memoria. Sem benchmark com
carga real: confirmar planos/latencia do filtro Favorecido no DEV antes de
promover. Correlacoes sao vinculadas ao titulo e so introduzidas ao filtrar/
sugerir Favorecido; consultas antigas sem filtro mantem sem JSON_TABLE novo.
AbortController nao cancela SQL ja em execucao no servidor.

No DEV conferir combinacoes e filtros vazios, titulo fora da primeira pagina,
obras/centros de custo/compartilhados, varias origens de favorecido, periodo
inclusive, formas previstas diferentes da baixa, readonly e usuario restrito;
troca/limpeza nao pode gerar baixa ou apagar rascunhos. Publicar frontend e
backend juntos: API antiga rejeita novas chaves/sugestoes. Sem migration.
Outputs privados permanecem fora do Git. Comandos QA locais:
`npm run test:fila-filtros-pesquisa` em backend/ e frontend/.

## Publicacao DEV autorizada

Proprietario autorizou commit/push dos filtros e do bloco gerencial juntos em
refactor/frontend, com comandos EC2 DEV. Base fee28b6d remota conferida igual
ao HEAD de implementacao. Sem PR/main/force-push, migration ou dependencias.
Novo roteiro ops/deploy/atualizar-dev-filtros-distribuicao-20261023.sh valida
SHA/fast-forward, checkout/caminho, PM2 DEV8001/watch/DDL, inventario17runtimes,
manifestos (somente scripts QA), lockfiles/migrations intactos e hash de .env.
Preflight configurarSessao12hDev --verificar antes/depois e apos restart;
somente leitura de identidade/UUID/schema/sessao, nao configura flags ou banco.
QAs isolados precedem restart exclusivo backend-dev, preservando ambiente PM2;
health local8001 confirmado pelo roteiro a executar pelo usuario, nao pelo agente.

validarDeployFiltrosDistribuicaoDev.js testa guardas/negativas em VM. QA dos
filtros pode omitir SQLite com --sem-sqlite no host DEV, sem mudar Node/pacotes;
validadores e sugestoes MySQL continuam testados. Os16casos completos SQLite
foram repetidos no Node24 local. Exige atualizar API DEV e frontend Vercel DEV
no mesmo SHA; nao promover para producao antes da homologacao/performance.

Validacoes de publicacao repetidas aprovadas: QAs dos dois ajustes,11regressoes
backend incluindo seguranca2304comparacoes/66escopos/48rotas HTTP, UI1366/390,
build640modulos/12,24s, documentacao608/19, Bash -n e guardas/negativas de deploy
em VM. Escopo sem lockfiles/migrations/dependencias conferido; servicos de
baixa/estorno e demais regras financeiras preservados. Sem homologacao real
MySQL/EC2/Vercel pelo agente; ainda depende dos testes DEV do proprietario.
