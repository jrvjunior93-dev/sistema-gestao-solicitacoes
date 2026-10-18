# PWA: periodo e diferenca da fila direta - 2026-10-18

## Atualizacao autorizada: implementacao local

- Esta secao substitui o estado de espera do diagnostico historico abaixo.
  Usuario confirmou pacote completo, sem alterar producao, e tambem a rejeicao
  do saldo direto/parcial com motivo e passkey. Nao ha nova migration.
- Base762370cf, branch local codex/rh-admissao-datas-20261018, destino posterior
  refactor/frontend. Pacote RH anterior e outputs preservados. Sem commit/push,
  EC2/PM2/.env, PILOT, banco/Redis/S3 real ou operacao de producao.
- Consulta/projecao: universo por titulo dos ultimos IDs digitais/filas, joinsPK
  e agregado unico (sem correlacionar por ciclo); CAST SIGNED para identidade
  negativa de leitura MySQL. CTE650 passou em cerca de4segundos apos retirar
  o desenho correlato lento. Nao varre movimentos em vencimento/emissao.
- data_tipo VENCIMENTO/EMISSAO/PAGAMENTO, data_inicio/fim e aliases legados.
  Sem datas: todo periodo. Pagamento com datas exige baixa ATIVO/BAIXA no recorte;
  soma valor_quitacao (juros/multa/desconto), parcial/multiplas baixas/estorno,
  rateios e centavos sem duplicidade. Situcao e sempre atual, nao historica.
- Na fila=PENDENTE/EM_EDICAO; Divergente separado, NAO_PAGO pela ultima tentativa.
  Parcial pode pertencer ao filtro da tentativa e conserva badge parcial.
  Fila atual tem precedencia sobre decisao digital historica, sem reescrever
  assinatura/status digital. Quitado/terminal/bloqueio continuam protegidos.
- Diretos: pagamentoFilaDiretaDomain minimo e fingerprint titulo+fila;
  hidratacao<=50/autores em lote. Sem lote/snapshot assinado/decisao ficticia,
  dados bancarios/CPF ou anexos genericos. OrigemFILA_DIRETA, id negativo somente
  em leitura/cursor; nunca item_id digital. Autor e quem enviou, nao quem baixou.
- pagamentoFilaDiretaRejeicao valida1..50, IDs positivos separados, motivo500
  e versaoSHA64. Lock tituloASC; confere ausencia de item digital, ultima fila,
  saldo/parcial, revisaoDP e banco. Atualiza somente ownerblockJSON (item_id0),
  encerra filas RESOLVIDO e exige SecurityEventLog na transacao. Falha atomica.
- Servico/controller/rotas: novosPOSTs rate-limited em /painel/fila-direta/
  autenticacao/opcoes e rejeitar. ACL/autorizador nominal, OFF/PAUSED/Testar
  usuario preservados. Credencial ativa com lock, assinatura/origin/RPID/UV,
  counter e hash de decisoes. Challenge reject-direct-queue separado.
- webauthnChallengeStore: consumo atomicoGETDEL do novo contrato, sem fallback
  GET/DEL. Redis6.2+ requerido; indisponibilidade falha fechado. Fluxo digital
  anterior nao foi migrado implicitamente nesta tarefa.
- Front cliente/helper/PWA por obra/detalhe: selector antes das datas; limpar
  ambas autoaplica600ms; fim-primeiro/parcial/invalido nao manda intervalo errado.
  Revalidacao do detalhe mantem base/periodo, sem status/obra que esconderiam
  item apos decidir. Navegacao usa data_referencia (incluindo NULL e id negativo).
- Rejeicao direta individual/grupo, mistos separados com passkey por grupo,
  fingerprint na revalidacao. Cancelar nao enviaPOST. Preserva parcial/pago,
  bloqueia somente saldo; novo ciclo digital real e necessario para liberar.
- Skill frontend-design orientou rotulos/erros e densidade operacional existente,
  sem redesenho generico. Nenhuma ampliacao nominal de acesso.

### Validacoes executadas

- Backend test:pwa-periodo-fila-direta: estados/ACL/PILOT/OFF/PAUSED/1001lotes;
  CTE SQLite650titulos150obras+6diretos (7Na fila), tresdatas, parcial/estorno,
  rateios/centavos, semdates/nulos/paginas/cursornegativo/ultima fila.
- validarFilaDiretaProprietario: servicos e storeGETDEL reais emVM; deps
  simuladas. ACL/nominal/noTestar, replay/concorrencia, motivo adulterado,
  UV/origem/RPID, versao/banco/DP/quitado/novo ciclo, auditoria e rollback.
- test:pwa-rejeicao-fila: policies/hooks/locks/auditoria e nova autorizacao real
  libera tambem ownerblock diretoitem0. test:autorizacao-proprietario,
  test:fila-pagamentos, test:banking-enterprise e suiteRH backend aprovados.
- Front validarAutorizacoesPorObra: 320/390/768/1366/dark, historico nativo,
  selecao/detalhe/passkey/motivo/duplo clique; datas/limpar/total pago30semestorno,
  autor/direto parcial/rejeicao individual e mista. Mantem periodo no detalhe.
  APIs e biometria isoladas; sem calls inesperadas/consoleerrors.
- Regressao final backend de permissoes financeiras, OFX/obras e performance
  fila/DP aprovada. Suites UI RH/documentos e PWA/datas/atualizacao do titulo
  passaram; build619modulos e documentacao566arquivos/19canonicos aprovados.
  Screenshots320/390/768/1366 revisados: selector/datas sem corte; CSS operacional
  ajustado para manter datas lado a lado no celular e filtros numa linha desktop.
  Avisos preexistentes de Browserslist/chunk nao tratados.
- Verificador MySQL DEV ampliado: tresbases/cursor digital+direto, EXPLAIN JSON,
  SELECTs sem dados pessoais no log. Guardas de identidade antes do painel.
  Nao executado contra MySQL real; SQLite nao atesta o dialeto/plano MySQL.

### Proximo passo exato

- UI/build/docs e diff conferidos; ownership liberado. Entrega local, sem
  commit/push. Publicar apenas a pedido. Preservar pacoteRH nao commitado.
- Homologar no DEV: schema762370cf/202610180002, RedisGETDEL e passkey nominal
  real (nao Testar usuario); executar verificador com timeout120s somente leitura.
- Conferir notebook/PWA mesmo usuario/status/obra/datas, diretos+digitais,
  parciais em doisdias/estorno/semvencimento/semperiodo/cursor. Nao certificamos
  os7/4 reais dos prints: registros nao foram auditados em producao.
- Rejeitar saldo e tentar baixa/envio direto (deve negar), preparar novo ciclo
  (continua bloqueado) e autorizar com passkey real para liberar. Nao regulariza
  registros antigos nem promove main automaticamente.

## Diagnostico historico anterior a confirmacao (nao e o estado atual)

## Pedido e estado

- Usuario mostrou notebook com 7 pendentes e PWA com 4 titulos em Na fila,
  datas vazias, e pediu garantir filtros, periodo inteiro sem datas, selecao
  de data (emissao/vencimento/pagamento), quitados pela baixa e envios diretos
  com informacao de quem enviou. Nao acessamos esses registros reais.
- Agente unico no worktree performance-fila-dp, base publicada 762370cf,
  branch local codex/rh-admissao-datas-20261018. Preservar todo delta RH local
  ja implementado/testado e outputs. Nenhum commit/push/deploy novo.
- Antes da mudanca financeira maior, aguardamos confirmacao do pacote e se
  titulos diretos poderao rejeitar saldo com passkey ou serao apenas consulta.
  Perguntas assincronas enviadas nesta conversa; nao decidir esse fluxo sozinho.

## Evidencias no codigo

- pagamentoAutorizacaoConsultaService consulta apenas pagamento_autorizacao_itens,
  com lote e ultima autorizacao por titulo. O comentario/CTE explicita exclusao
  de quem nunca foi enviado para autorizacao. Envios diretos sem item ficam fora.
- Vencimento usa COALESCE(t.data_vencimento,a.vencimento_snapshot). Nao consulta
  emissao nem data de pagamento. Sem limites aplicados nao acrescenta WHERE de
  data; isso ainda nao resolve o universo restrito a autorizacoes.
- Tela tem rascunho separado do filtro aplicado. Datas completas ordenadas
  autoaplicam em600ms; ao apagar datas essa condicao deixa de autoaplicar.
  Nao afirmar que campo visual vazio prova ausencia de filtro aplicado.
- NA_FILA PWA inclui PENDENTE, EM_EDICAO e DIVERGENTE, mas exige status digital
  AUTORIZADO/ENFILEIRADO e saldo ABERTO/PARCIAL. Card PENDENTE do financeiro
  usa PENDENTE/EM_EDICAO; divergentes sao outro card. Sao regras diferentes.
- Totais de obras somam valor_snapshot rateado, nao os pagamentos no periodo.
- PagamentoManualFilaItem tem selecionado_por/selecionado_em (quem enviou),
  processado_por/processado_em e data_baixa. Nao confundir autor do envio com
  usuario que registrou a baixa. Envios diretos ja possuem auditoria explicita.
- Movimentos financeiros tem data_movimento, valor/juros/multa/desconto,
  valor_quitacao e status/estorno. Pagamento por periodo deve considerar as
  baixas efetivas (inclusive parciais), sem usar timestamp de criacao do registro
  ou somar valor original de um titulo a cada baixa. Definir rotulo do total.

## Proposta aguardando confirmacao

- Escolher antes das datas: Emissao, Vencimento ou Pagamento/baixa; rotulos
  claros e sem periodos ocultos. Datas aplicadas vazias significam todo periodo.
- Alinhar filtros/contagens com os cards financeiros, explicando sobreposicao
  de estado parcial e tentativa de pagamento. Sem duplicar titulos rateados.
- Incluir titulos com fila direta sem criar lote/dossie/decisao ficticios;
  identificar origem, usuario/data do envio. Nao vincular ID de fila a item_id
  digital ou reaproveitar challenge de outro titulo/ciclo.
- Visibilidade permanece sob ACL existente do painel. Documentos somente pelas
  origens autorizadas, sem abrir conversas/anexos genericos ou dados extras.
- Rejeicao de saldo direto e decisao financeira nova; exige escolha do usuario,
  passkey nominal/challenge especifico, lock/idempotencia/auditoria e protecoes
  de pagamentos/parciais/intencao bancaria. Nao inventar autorizacao anterior.
- Pagamento por periodo: total efetivamente pago no recorte, desconsiderando
  estornos; manter valores assinados historicos intactos e mostrar suas bases.
- Testar consultas/cursor/paginas com e sem datas, titulos sem vencimento,
  emissoes distintas, baixas parciais em dias diferentes, quitacao/estorno,
  retorno da fila, diretos+digitais, rateios/compartilhados e nomes de autores.
- Testes de UI devem preservar voltar nativo, selecao entre paginas, revalidacao,
  rejeicao e passkey, filtros de data final primeiro/limpeza e falhas atomicas.
- Nenhuma alteracao de codigo PWA foi feita neste diagnostico; somente leitura
  e este handoff. Implementar localmente para refactor/frontend apos resposta,
  sem operar producao. MySQL real requer verificacao somente leitura separada.
