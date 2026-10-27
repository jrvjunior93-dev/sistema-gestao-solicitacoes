# Modulo FINANCEIRO

## Titulos: codigo da solicitacao e retorno dos filtros - 2026-10-27 (local)

Contas a Pagar/Receber oferecem Codigo da solicitacao em Filtros visiveis.
Codigo SOL ou numero, distinto de ID interno; SQL filtra antes de paginar,
inclusive origens de titulos compartilhados/negociados, mantendo escopo.
Voltar do detalhe retoma a carteira/query/pagina original; ordem identica ao
remontar nao reinicia a pagina. Preferencias protegem escolhas contra carga
atrasada e gravacoes simultaneas; esconder limpa tambem o criterio salvo.
Sem EC2/banco real/migration/publicacao; backend deve preceder frontend.
[Escopo, limites e testes](../../handoffs/2026-10-27-titulos-filtros-retorno-local.md).

## Fila: formas disponiveis ao clicar - 2026-10-27 (local)

Forma de pagamento abre sugestoes das formas previstas nos titulos da fila
autorizada/status, inclusive fora da pagina carregada, sem exigir digitacao.
Consulta leve existente por ID/nome; limite inicial100 e pesquisa digitada20.
Preserva escopo/permissoes, Todos, limpeza e forma efetiva da baixa. Demais
autocompletes continuam com minimo de dois caracteres. Sem escrita real,
migration, EC2 ou publicacao; backend deve preceder frontend no futuro deploy.
[Escopo e testes locais](../../handoffs/2026-10-27-fila-formas-disponiveis-local.md).

## Promocao MAIN: reprogramacao parcial do contrato - 2026-10-23

Usuario homologou DEVfee28b6d e autorizou promover para main; backup cifrado
e timer ativo reconfirmados. Merge sobre MAIN8982855e conserva exclusividades
e leva somente dois runtimes homologados (service de reprogramacao e input/UI).
Sem migration, dependencias, alteracao de medicoes/baixas/parcelas antigas.
Roteiro exclusivo atualizar-producao-contrato-reprogramacao-20261023.sh exige
SHA/base/ancestralidade DEV, inventario/ff-only, backup/timer/PM28000, preflight
readonly UUID/TLS/schema/sessao/flags, QAs antes de restart apenas produtivo.
DEV remoto/.env/configuracoes preservados; nenhuma programacao real no deploy.
[Escopo e verificacoes](../../handoffs/2026-10-23-promocao-contrato-reprogramacao-main.md).

## Promocao MAIN de todas as pendencias - 2026-10-23

Usuario autorizou Compra Direta/pagamento negociado, devolucao seletiva de
cheques, saldo da recarga e dados da fila/detalhe; backup cifrado/timer ativo
confirmados. Merge MAINfe663151 com DEVd641 preserva hotfixes, scripts e
historico MAIN. Dependencias/flags/.env/memoria e DEV remoto inalterados.
Duas migrations JSON nullable (pagamento_negociacao e estornos_cheques),
sem backfill, baixa, estorno ou ajuste de saldo executado pelo deploy.
Roteiro PROD exclusivo ops/deploy/atualizar-producao-pendencias-20261023.sh:
SHA/inventario/ff-only/backup/timer/PM28000, preflight identidade/TLS/12h/flags,
QAs offline antes do aplicador restrito001/002, verificacoes e restart somente
backend-solicitacoes. Nao reutilizar scripts DEV nem migrate geral.
[Escopo, evidencias, limites e recuperacao](../../handoffs/2026-10-23-promocao-pendencias-main.md).

## Promocao MAIN OFX e forma prevista - 2026-10-22

Usuario homologou OFX/codigo TIT no DEV e autorizou promover TODOS os pendentes:
41219c3a e bc2c69ed (forma prevista de contratos em Contas a Receber). Backup
cifrado/timer confirmados. Integracao sobre mainb654 conserva ajustes exclusivos
e historico MAIN; runtime final coincide com DEV412 sem alteracao funcional nova.
Forma prevista autorizada como pendente e validada em testes isolados locais.

Roteiro PROD exclusivo ops/deploy/atualizar-producao-ofx-receber-20261022.sh:
SHA/base/ff-only/backup/timer/PM28000, UUID/TLS/schema/sessao/flags readonly,
packages somente dois QAs novos, runtime limitado a oito arquivos, .env por hash,
testes antes de reiniciar apenas backend-solicitacoes. Sem DDL/dependencias,
memoria ou operacao financeira automatica; DEV remoto inalterado.
Conferir consultas em producao, sem gerar baixa/importacao so para smoke.
[Escopo, validacao, operacao e limites](../../handoffs/2026-10-22-promocao-ofx-receber-main.md).

## Promocao MAIN RH, centros e pedidos - 2026-10-21

Usuario autorizou os tres commits pendentes2d161b85/ba4a41b2/a00a15f6 e confirmou
backup cifrado/timer. Integracao sobre main80df6534 preserva hotfixes/scripts/
historico e leva runtime DEV sem alteracao adicional. RH homologado pelo usuario;
centros/pedidos validados em testes isolados. Sem DDL/dependencias/calculos
financeiros/.env/flags/memoria alterados. Roteiro PROD exclusivo com verificacoes
readonly e restart somente backend-solicitacoes, executado pelo operador.
[Escopo, testes, roteiro e recuperacao](../../handoffs/2026-10-21-promocao-rh-pedidos-centros-main.md).

## Promocao MAIN pendencias DEV - 2026-10-21

Usuario autorizou promover5dbdd55a (lista unica da fatura),44ee71b2 (quitacao
de saldo com cartao apos PIX e JOIN Obras do relatorio de permutas) e771f8041
(periodo de registro das solicitacoes). Integracao sobre main eb12d9d7 conserva
autorizacao unica por passkey, hotfixes e scripts produtivos. Runtime final
backend/frontend coincide com DEV828ed2ec; nao copiar package.json DEV por
cima do produtivo (main conserva script de QA exclusivo). Sem dependencias/DDL.

Roteiro `ops/deploy/atualizar-producao-pendencias-20261021.sh`: SHA fixo/ff-only,
base de pacote eb12d9d7 e instalado minimo60f327d7, backup/timer/PM2 PROD8000/
online/sem watch, UUID/TLS/schema/12h/flags/push em leitura antes/depois, .env
por hash, testes isolados e restart somente backend-solicitacoes. Se a EC2
ainda estiver na main60, inclui a autorizacao unica previamente aprovada;
nao exige executar os dois roteiros em sequencia. Sem npm install/ci, migrations,
baixas, estornos, cancelamentos ou regularizacoes automaticas. EC2 so operador.

Conferir lista da fatura e relatorio de permutas em leitura apos atualizar
backend/health e frontend main na Vercel. O caso PIX/cartao/desconto foi provado
em memoria/DEV; nao repetir a baixa real somente para testar producao.
[Escopo, evidencias e recuperacao](../../handoffs/2026-10-21-promocao-main-pendencias-dev.md).

## Favorecido editavel na medicao e no titulo - 2026-10-23

- Detalhe e pagina de edicao do titulo oferecem Editar favorecido, separado
  do credor. Exige permissao nominal `financeiro.titulos.editar`, escopo de
  todas as obras/rateios e ausencia de baixa/operacoes/vinculos protegidos.
- Se a previsao pertence a medicao pendente, o editor consulta/altera a
  instrucao dessa medicao (inclusive divisao por favorecidos), com sua ACL
  propria. Nao cria override oculto divergente da conferencia de aprovacao.
  Previsao de contrato ainda sem medicao recebe favorecido ao medir.
- Em titulo vigente, a correcao e especifica daquele titulo: snapshot
  `pagamento_favorecido` tem prioridade no detalhe, fila e filtro Favorecido.
  Valores, vencimento, credor, medicao aprovada, outras parcelas e cadastro
  global permanecem intactos. A mudanca e auditada com antes/depois e motivo;
  a auditoria financeira tambem le recibo permanente, independente da retencao.
- A conta bancaria antiga nao e reaproveitada silenciosamente: remessa exige
  vinculo explicito e correspondente aos dados corrigidos. A fila manual usa
  a instrucao salva no titulo. Nao altera remessas/autorizacoes ja existentes.
  O dossie novo inclui hash da instrucao; fila/autorizacao ativa impede editar.
- Pagos, negociados/compartilhados e origens DP/recarga/pedido/adiantamento
  mantem seus fluxos especializados. Negociacao conserva editor anterior;
  seu mapeamento GET/PATCH agora explicita a mesma permissao editar ja exigida
  pelo servico, corrigindo a pendencia da auditoria de rotas sem ampliar acesso.
- Skill frontend-design aplicada apenas ao padrao operacional existente:
  editor reutilizavel, busca de Pessoas, avisos e confirmacao do sistema.
  Migration/testes/limites no [handoff](../../handoffs/2026-10-23-medicao-rejeicao-favorecido.md).

## Fila: campos vazios e arranjo pessoal dos filtros - 2026-10-23

- Filtros opcionais continuam sem restricao quando vazios, mas exibem apenas
  orientacoes como "Digite a origem...", sem Todos preenchido. Ao escolher
  Todos ou limpar, o campo volta a ficar vazio. Selecionar texto ao focar/
  clicar e opt-in desta fila, facilitando substituir uma escolha existente.
- Organizar filtros usa o painel padrao: visibilidade, setas, arrasto e reset.
  Preferencia de tipo filtros pelos endpoints existentes, chave propria com ID
  do usuario para isolar tambem o espelho local em estacao compartilhada.
  Nao persiste valores de consulta, pagamento, selecao ou rascunho financeiro.
- Situacao mantem Pendentes como padrao; oculta-la quando nao padrao limpa
  somente esse recorte, retornando a Pendentes. Busca geral sempre acessivel;
  intervalo de vencimento e um grupo reposicionavel. Criterio de URL/workspace
  revela automaticamente campo oculto, sem apagar a consulta recebida.
- Esconder campo preenchido mostra aviso e limpa somente aquele criterio.
  Reordenar/esconder vazio nao consulta novamente nem descarta selecao/drafts.
  Painel bloqueado durante operacao financeira. Ordem no hook e opt-in;
  demais telas preservam contrato anterior. Sem backend/migration/producao.
- Testes e limites no [handoff](../../handoffs/2026-10-23-fila-filtros-arranjo.md).

## Filtros digitaveis da fila - 2026-10-23

- Origem, empresa do titulo/colaborador, credor e recebimento DP passam a
  aceitar digitacao/selecao. Novos filtros: obra/centro de custo, favorecido,
  solicitacao, titulo e forma de pagamento. Situacao e busca geral permanecem
  disponiveis no mesmo bloco. Vencimento aceita intervalo inclusivo de datas.
- Forma de pagamento filtra a **prevista no titulo**, conforme escolha do
  proprietario; nao a forma efetiva da baixa ou edicao local ainda nao salva.
- Sugestoes dos novos campos exigem2caracteres/debounce350ms; GET dedicado
  `/financeiro/fila-pagamentos/sugestoes`, mesma guarda de leitura da fila,
  status/escopo vigentes, ate20rotulos por consulta (21 para detectar excesso).
  Nao retorna CPF/CNPJ, instrucoes bancarias, saldos ou cadastros integrais.
- Filtros combinados sao aplicados no servidor antes de contar/paginar,
  inclusive rejeicoes somente consulta. Obra/solicitacao tambem respeitam
  vinculos compartilhados. Favorecido usa a prioridade da coluna: negociacao,
  instrucao especifica, medicao exata e destinatario explicito/origem; ausencia
  nao e preenchida com credor, exceto recebimento DP em dinheiro ja existente.
- Trocar filtros reinicia pagina/selecao, sem descartar rascunhos financeiros;
  URL preserva os criterios. Sugestoes antigas sao descartadas e o transporte
  e cancelado no cliente; nao se presume cancelamento da consulta no MySQL.
- Sem migration, escrita financeira, mudanca de permissoes ou producao.
  Validacoes/limites: [handoff](../../handoffs/2026-10-23-fila-filtros-pesquisa.md).
- Publicacao DEV autorizada junto do bloco gerencial da solicitacao. Roteiro
  atualizar-dev-filtros-distribuicao-20261023.sh valida inventario, identidade/
  schema/sessao sem mudar ambiente e reinicia somente backend-dev/8001.

## Reprogramacao parcial de saldo contratual - 2026-10-23

- Novas parcelas de previsao podem somar ate o saldo contratual sem parcela
  livre, nao necessariamente todo ele. A sobra permanece disponivel para
  outra reprogramacao; parcelas ja reservadas nao sao contadas novamente.
- Tela aceita digitacao direta, edicao no meio e colagem de valores; a moeda
  e formatada somente ao sair do campo. Total/sobra aparecem em centavos,
  excesso bloqueia confirmacao. Saldo/referencia sao reconsultados apos criar,
  permitindo nova programacao na mesma tela sem recarregar a solicitacao.
- Backend preserva ACL/obra, contratos ativos/fluxo novo, bloqueio GEO de
  totalmente medido, limite24, lock transacional e replay persistente. Historico
  registra valor efetivamente reprogramado e saldo livre restante; somente
  novas previsoes sao criadas. Nenhuma alteracao de medicoes, baixas anteriores,
  valor/aditivos do contrato ou motor de calculo; sem migration/backfill.
- Validacoes locais e limites: [handoff](../../handoffs/2026-10-23-contrato-reprogramacao-parcial.md).
- Publicacao DEV autorizada; roteiro exclusivo atualizar-dev-contrato-reprogramacao-20261023.sh
  confere ambiente/schema/sessao e inventario, sem migration, preservando main.

## Fila: Credor e Favorecido separados - 2026-10-23

- Credor identifica o parceiro comercial; Favorecido identifica o destinatario
  informado no titulo, na instrucao especifica ou na solicitacao de origem.
  Sem documento cadastral abaixo dos nomes. Ausencia nao e preenchida com o
  credor: mostra "Favorecido nao informado". No DP em dinheiro, o recebedor e
  o colaborador/responsavel registrado no titulo, nao uma conta bancaria.
- Instrucao da negociacao/parte do titulo prevalece sobre cadastro bancario
  e dados gerais da solicitacao. Destinatario diferente no titulo nao herda a
  chave de outro favorecido da solicitacao. Documento nao vira PIX presumido.
- Medicao escalar aprovada: consulta a medicao ligada a parcela daquele
  titulo (ou sua origem medicao_pagamento_origem_id), nunca a ultima medicao
  do contrato. Chave lida da medicao; credor contratual recuperado somente
  para exibicao, pois a aprovacao legada substituia parceiro_id pelo recebedor.
  Multiplos credores sao exibidos nominalmente sem escolher um por suposicao.
- Vinculo ambiguo, forma divergente ou conta/favorecido com documentos
  diferentes produz aviso de conferencia; nao substitui a chave por cadastro
  atual. Isso nao autoriza, bloqueia ou registra uma baixa por si so.
- Apenas projecoes de leitura apos ACL/escopo existentes. Sem migration,
  backfill, alteracao de permissao, saldo, baixa ou historico. TIT-009886
  permanece quitado; dados exibidos sao instrucoes previstas, nao prova do
  destino bancario efetivamente usado na baixa historica.
- O detalhe do titulo a pagar tambem mostra Credor, Favorecido, Forma prevista,
  Chave PIX/PIX copia e cola e demais dados/instrucoes, usando o mesmo
  formatador da fila. Dados longos abrem consulta/copia integral. O complemento
  e executado somente no GET show autorizado, nunca na carga usada por baixa,
  edicao ou criacao. As permissoes de movimentos/intencoes continuam separadas.
  Titulos RECEBER mantem o bloco de cobranca externa existente.
- QA local: npm run test:fila-destinatarios em backend e frontend. Inclui
  consultas em lote, ORM MySQL interceptado, tela real desktop/mobile e
  preferencias de colunas antigas sem perder ordem, selecao ou valores.
  validarTituloDadosPagamento.js e validarTituloDetalheWorkspace.mjs
  --dados-pagamento cobrem detalhe/ACL e consulta/copia sem baixa.
  [Escopo, validacoes e proximo passo](../../handoffs/2026-10-23-fila-credor-favorecido-pix.md).
- Publicacao direta DEV autorizada. Roteiro exclusivo
  ops/deploy/atualizar-dev-fila-destinatarios-20261023.sh com SHA completo,
  base5123de39/ff-only, preflight de identidade/schema/sessao e QAs antes de
  reiniciar somente backend-dev8001. Sem migration/instalacao/flags/.env novos;
  validarDeployFilaDestinatariosDev.js cobre guardas e negativas em memoria.

## Recarga: saldo e origem das prestacoes pendentes - 2026-10-23

- Resumo mantem os valores calculados, com rotulos "Saldo antes dos gastos
  pendentes", "Gastos pendentes de validacao/correcao" e "Saldo disponivel
  estimado". Nao e consulta a operadora nem saldo exclusivo daquela recarga.
- As origens mostram codigo/link da solicitacao, situacao (aguardando validacao
  ou correcao) e gasto declarado. A associacao e por prestacao/cartao, nunca por
  igualdade entre o valor gasto e o valor de uma nova recarga.
- Recarga ABERTO/PREVISAO sem baixa informa que ainda nao compoe o saldo;
  PARCIAL informa que somente a parte paga compoe o saldo. Sem evidencia de
  baixa no DTO nao presume pagamento. Cancelados/estornados nao recebem aviso
  de pagamento pendente. Formulario da nova solicitacao nao confunde a ultima
  recarga com o pedido ainda em preenchimento.
- Projecao auxiliar de leitura nos endpoints de contexto existentes: uma
  consulta para os cartoes da resposta e ACL normal de detalhe por solicitacao,
  com cache local a requisicao. Origem negada/excluida/falha nao revela numero,
  ID, status, valor individual ou link, nem amplia acesso GEO/obra/cartao.
- Consulta limitada a101 candidatos e no maximo100 origens processadas. Falha,
  limite ou diferenca entre o agregado e as origens gera aviso generico de
  origens incompletas; o saldo autorizado permanece inalterado e nao e recalculado.
- Preservados prestacao, ajuste GEO/extrato, revisao/idempotencia, pagamentos,
  valores, permissoes e calculo historico. Nenhuma migration/backfill ou escrita.
- QA: validarRecargaSaldoOrigens.js (ACL real/controller/motor de saldo em memoria)
  e validarRecargaSaldoOrigensUI.mjs (tela/CSS reais e HTTP interceptado).
  [Handoff e validacoes](../../handoffs/2026-10-23-recarga-saldo-origens.md).
- Publicacao DEV autorizada. Roteiro proprio
  ops/deploy/atualizar-dev-recarga-saldo-20261023.sh com SHA publicado; sem
  migration/dependencias/flags novos, preflight de identidade/schema, ff-only,
  testes e reinicio apenas backend-dev8001. Pendencia de banco interrompe;
  validarDeployRecargaSaldoDev.js cobre as guardas sem EC2/banco real.

## Devolucao seletiva de cheques recebidos compostos - 2026-10-22

Pacote DEV sobre28670b81, com publicacao em refactor/frontend autorizada;
sem deploy, migration aplicada ou dados reais alterados pelo agente.
Na baixa composta de RECEBIMENTO, selecionar um ou varios cheques da mesma
baixa, informar data/motivo bancario/justificativa, conferir os saldos por
titulo e aceitar explicitamente antes de confirmar. Carteira oferece link
para o grupo. Cheque rateado reverte todas as suas alocacoes; mesmo valor nao
confunde documentos. Demais recebimentos e as origens dos titulos permanecem.

Exige permissoes de visualizar/estornar baixa composta e devolver cheques,
Financeiro e escopo de todos os titulos. Somente cheques EM_CARTEIRA sem
processamento bancario/uso posterior; depositados/compensados devem seguir
o fluxo bancario, sem contrapartida automatica aqui. Um bloqueado desfaz toda
a selecao. Snapshot, transacao/locks, recibo idempotente, auditoria/historico
e sincronizacao de contrato/solicitacoes protegem a confirmacao. Resposta
perdida exige GET, nunca reenvio automatico do POST. Rascunhos preservados.

Grupo PARCIAL_ESTORNADO preserva valores originais e recibos; estorno integral
posterior trata so o restante ativo, sem reabrir valores devolvidos duas vezes.
Nao cria receita ou recebimento substituto; este deve ser conferido e registrado
separadamente pelo usuario para evitar duplicidade. Estorno generico de uma
baixa composta continua bloqueado. Operacao limitada a100cheques/200titulos/
1000alocacoes. Casos fora dessas protecoes exigem analise propria.

Migration202610220002 adiciona JSON nullable estornos_cheques no grupo;
NAO aplicada, sem backfill e down destrutivo bloqueado. Testes dedicados:
backend/scripts/validarDevolucaoChequesComposta.js e
frontend/scripts/validarDevolucaoChequesComposta.mjs.
Deploy DEV dedicado: ops/deploy/atualizar-dev-devolucao-cheques-20261022.sh,
com SHA publicado e backup DEV confirmado. Aplicador
backend/scripts/aplicarMigrationDevolucaoChequesDev.js aceita somente002 no
UUID DEV; interrompe se001 ou outra migration estiver pendente. Preserva
flags/.env/dependencias e reinicia somente backend-dev apos schema/testes.
Guarda em memoria: backend/scripts/validarDeployDevolucaoChequesDev.js.
[Handoff, arquivos, limites e gates DEV](../../handoffs/2026-10-22-devolucao-cheques-compostos.md).

## Negociacao: forma e instrucao de pagamento - 2026-10-22

Implementacao sobre refactor/frontend41219c3a; publicacao DEV dos dois ajustes
(Compra Direta e pagamento negociado) autorizada pelo usuario em22/10/2026.
A negociacao exige forma ativa e permite indicar favorecido e instrucao
(PIX/chave ou copia e cola, boleto, dados bancarios/outras instrucoes). Os
mesmos dados previstos sao aplicados a todas as novas parcelas; cada parcela
pode ser corrigida individualmente depois. Nao altera Pessoas/beneficiarios
globais, valores, vencimentos, rateios ou calculos e nao cria baixa/fatura.

O bloco `Pagamento do titulo negociado` no detalhe permite a quem possui
`financeiro.titulos.editar` consultar e editar somente esses dados. Serve
tambem para parcelas legadas sem instrucao, como TIT-011543. O registro real
nao foi alterado pelo agente. A edicao generica do acordo continua bloqueada.

GET/PATCH `/financeiro/titulos/:id/negociacao/pagamento` conservam a barreira
Financeiro; o servico revalida permissao, escopo da parcela e de todas as
origens. Exige parcela vigente ABERTO/sem baixa, sem movimentos vigentes,
fila, autorizacao pendente/autorizada/enfileirada, pagamento bancario,
boleto emitido/dados de cobranca ou cartao/fatura. Retorno a Obra e rejeicao
do proprietario nas origens tambem bloqueiam. Nunca regulariza esses fluxos
automaticamente. Para editar, regularizar primeiro no fluxo que bloqueou.

PATCH estrito apenas pagamento/revisao, transacao/locks da parcela e origens,
revisao otimista e no-op idempotente. Grava antes/depois na auditoria e nos
historicos das solicitacoes de origem, na mesma transacao. Previa/hash da
negociacao consideram a instrucao, mas snapshots/resultados originais do
acordo nao sao reescritos pela edicao. Campos de valor e origem nao entram
no payload da correcao. Falha na auditoria reverte toda a alteracao.

A instrucao aparece na fila pelo projetor autorizado existente; hash do
dossie considera o campo novo apenas quando presente, preservando hashes
legados. A instrucao nao configura automaticamente pagamento bancario.

Migration aditiva `202610220001_titulo_negociacao_pagamento.js`: JSON nullable
`pagamento_negociacao` em titulos_financeiros, sem atualizar registros.
Criada/testada somente em memoria, NAO aplicada. Exige implantacao coordenada
backend/schema/frontend DEV em etapa autorizada. Rollback de dados automatico
bloqueado para preservar as instrucoes. Nenhuma migration executada neste trabalho.

QA: `node backend/scripts/validarTituloNegociacaoPagamento.js` e, em frontend,
`node scripts/validarTituloNegociacaoPagamento.mjs`; mantidos os testes de
negociacao/parcelas/ACL/rollback/workspace, fila, autorizacao unica e Compra Direta.
[Handoff e limites](../../handoffs/2026-10-22-negociacao-pagamento.md).
Atualizacao exclusiva DEV, migration unica e roteiro de homologacao:
[publicacao DEV](../../handoffs/2026-10-22-publicacao-compra-negociacao-dev.md).

## OFX: candidatos exclusivos e codigo do titulo - 2026-10-22

Lancamentos repetidos da mesma conta/data/valor com sinal mantem a quantidade
de movimentos compativeis, inclusive quando so existe um candidato. Usar apenas
prepara: reserva o movimento nesta tela, inclusive entre paginas, sem gravar
conciliacao ou baixa. Quando sobra um candidato apos uma escolha ou match
confirmado, ele e oferecido ao primeiro pendente global por ID; excedentes
permanecem vazios. Liberar selecao recalcula as sugestoes. Conciliar confirma.
Baixas parciais distintas de um mesmo titulo continuam validas por movimento.

API le todos os pendentes do grupo, mesmo fora dos filtros/pagina, e devolve
um pool autorizado por grupo no meta, sem duplicar candidatos em todas as
linhas da resposta. Contagem nao e truncada em20. Confirmacao revalida sob
locks ordenados, mantendo principal do payload, transacao e auditoria originais.
Preparacoes nao sao reservas globais entre abas/usuarios: outro operador pode
confirmar primeiro; o backend rejeita conflito e a tela atualiza sem repetir POST.
Lote exige confirmar/liberar preparacoes manuais antes de executar.

Card Fluxy mostra codigo real TIT junto da descricao e movimento, nas opcoes,
preparacoes (codigos unicos) e confirmados. Sem codigo nao inventa numero por ID.
Mesmos componentes/acoes/ACL, com empilhamento do card no celular para nao cortar
os botoes. Sem mudar valores, dados financeiros, schema, flags ou dependencias.
Entrega local baseada em refactor/frontend; main/producao nao alteradas.
QA backend/frontend: npm run test:ofx-matches-exclusivos.
[Handoff e limites](../../handoffs/2026-10-22-ofx-matches-exclusivos.md).

Commit/push DEV autorizado em22/10. Roteiro exclusivo
ops/deploy/atualizar-dev-ofx-matches-exclusivos-20261022.sh recebe SHA fixado,
verifica identidade/schema readonly, ff-only desdebc2c69ed, runtime/pacotes
limitados, QA antes do restart somente backend-dev8001 e .env preservado.
Sem install/migrations/flags/memoria ou operacao financeira real pelo agente.
Guardas puras: node backend/scripts/validarDeployOfxMatchesDev.js. Homologacao
manual dos repetidos/parciais/codigo TIT no DEV permanece com o operador.

## Forma prevista de contrato em Contas a Receber - 2026-10-21

Listagem RECEBER COMERCIAL sem forma explicita passa a exibir a forma prevista
das parcelas vinculadas, identificada como Prevista no contrato. Leitura em
lotes500 dos IDs ja autorizados/paginados, sem hasMany na consulta principal.
Forma explicitamente vinculada tem prioridade; sem vinculo ou dado permanece
sem forma. Multiplas previsoes sao exibidas sem duplicar titulo, valor ou contador.

Mesmo padrao CelulaDupla e CSV com previsao identificada; nenhuma escolha de
baixa/cobranca ou FK e preenchida automaticamente. Filtro/ordenacao permanecem
baseados na forma explicita. Nao muda dados de contratos/titulos/movimentos,
permissoes/escopo, calculos, financeiro realizado, schema ou dependencias.
Implementacao local DEV, sem commit/push/deploy ou producao nesta etapa.
QA backend/frontend: npm run test:receber-forma-prevista.
[Handoff, impacto e validacao](../../handoffs/2026-10-21-receber-forma-prevista-contrato.md).

Publicacao DEV autorizada em22/10: roteiro exclusivo
ops/deploy/atualizar-dev-receber-forma-prevista-20261022.sh. SHA fixado,
identidade/schema readonly, ff-only desdea00a15f6, runtime/pacotes restritos,
QA antes do restart somente backend-dev e .env preservado. Nao altera main,
producao, dependencias, migrations ou dados financeiros. Detalhes no handoff.

## Distribuicao gerencial com centros de custo como destinos - 2026-10-21

Solicitacoes de Centro de Custo podem classificar gerencialmente o valor entre
obras e outros centros ativos. O relatorio diferencia Centro de custo de origem
de Obra / centro de custo de destino e permite filtrar ambos os tipos de destino.
O total classificado considera cada linha uma vez; o total nao gera novos titulos,
movimentos ou custos reais nos destinos. Resultado dos Centros de Custo e Resultado
de Obras continuam lendo suas fontes anteriores, sem somar essa classificacao.

Somas/percentuais/TODAS e ACL/configuracao do centro de origem permanecem. IDs e
rotas legadas sao mantidos, com tipo_centro_custo no DTO. A ampliacao e exclusiva
gerencial: nao altera adiantamentos/prestacao de contas. Sem migration/backfill,
operacao real ou promocao de producao nesta entrega. Testes isolados nos dois
runtimes: test:centro-custo-distribuicao.

Detalhes no [canonico de Solicitacoes](../solicitacoes/README.md#centros-de-custo)
e [handoff](../../handoffs/2026-10-21-distribuicao-centros-destinos.md).

## Autorizacao unica da selecao no PWA - 2026-10-21

Na visao Por obra, autorizar usa uma unica passkey para todos os titulos
selecionados, inclusive entre lotes, obras e paginas diferentes. A decisao e
o envio para a fila compartilham uma unica transacao: falha em qualquer item
desfaz a tentativa inteira, inclusive historico/counter. Itens nao selecionados
permanecem pendentes; os lotes originais e seus vinculos nao sao fundidos.

Novos POSTs autenticados/rate-limited sob `/financeiro/autorizacoes-pagamento`:
`/painel/selecao/autenticacao/opcoes` e `/painel/selecao/autorizar`. Challenge
individual por usuario/selecao, TTL300s e consumo Redis atomico, vinculado a IDs,
snapshots, valores, hashes/revisoes dos dossies e finalidade AUTORIZAR.
Revalida ACL nominal/DECIDE, escopo integral de titulos compartilhados, limite
por lote, preparador diferente do autorizador, passkey ativa/UV/origin/RPID,
estado financeiro/documentos e bloqueadores da fila canonica. Locks ordenados,
transacao unica e challenge descartavel impedem duplicacao em repeticoes.
Limite operacional: 1.000 itens por selecao e 200 por lote, conservando o limite
financeiro nominal de cada lote. Material alterado rejeita toda a selecao sem
invalidacao ou envio parcial; precisa ser conferido antes de nova tentativa.

Sucesso retira somente os itens confirmados da selecao. Cancelar a passkey
preserva os marcados. Se a resposta do POST se perder, GETs dos selecionados
em todas as paginas conferem o estado e retiram os ja decididos; nao repetem
automaticamente a assinatura ou o envio. Eventos mantem lote/item/autor e
incluem selecao_id/hash; diagnosticos seguros limitam a amostra a20 IDs.
Rejeicao, revogacao, reenvio e APIs legadas mantem seus fluxos anteriores.

QA: `node backend/scripts/validarAutorizacaoSelecao.js` e, em frontend/,
`node scripts/validarAutorizacoesPorObra.mjs`. Backend real com persistencia e
Redis/WebAuthn isolados; UI real com API/passkey simuladas, incluindo130 itens,
rollback tardio, replay/concorrencia, resposta perdida e320/390/1366px. Sem
migration/dependencias ou integracoes reais pelo agente nesta etapa. Usuario
homologou no DEV titulos de lotes diferentes com uma unica passkey e autorizou
promocao isolada para main em21/10, sem incluir outros pacotes DEV pendentes.
[Handoff e validacoes](../../handoffs/2026-10-21-pwa-autorizacao-unica-selecao.md).

Publicacao DEV autorizada em21/10: roteiro
`ops/deploy/atualizar-dev-autorizacao-unica-20261021.sh` recebe SHA fixo publicado,
exige base771f8041 no alvo, checkout instalado93f75 ou posterior e fast-forward.
Confere PM2 DEV/8001/online/sem watch, identidade/schema/sessao12h em leitura,
dependencias/migrations inalteradas e runtime limitado aos cinco arquivos do
pacote. Roda QA isolado antes de reiniciar somente backend-dev, confere health e
preserva hash do .env. Nao instala dependencias, roda DDL ou muda flags. Operador
executa na EC2 DEV e usa frontend DEV do mesmo SHA; o agente nao acessa a EC2.

Promocao MAIN: roteiro
`ops/deploy/atualizar-producao-autorizacao-unica-20261021.sh` exige base60f327d7,
SHA main fixo/fast-forward, backup/timer confirmados/ativo, PM2 produtivo
online8000/sem watch, identidade/TLS/schema/flags/sessao12h/push em leitura,
dependencias/migrations inalteradas e .env por hash. Suites isoladas antes de
reiniciar somente backend-solicitacoes, health e pos-check; sem DDL, instalacao,
teste financeiro real ou acesso EC2 pelo agente. Frontend depende das novas
rotas: preferir liberar frontend Vercel apos backend/health; se o deploy da main
for automatico, concluir backend antes de usar a nova autorizacao no PWA.
[Promocao, testes e recuperacao](../../handoffs/2026-10-21-promocao-main-autorizacao-unica.md).

## Promocao MAIN comprovantes de imagem - 2026-10-20

- DEVf835 homologado; promocao preserva runtime, hotfixes main e importador PDF.
  Sem migration/dependencia/permissao nova ou outra baixa ao anexar.
- Roteiro produtivo existente de cheques inclui os QAs de comprovantes antes
  do restart, exige pacote f835 e preserva .env/TLS/PILOT/12h/schema/DEV.
- [Escopo, evidencias e recuperacao](../../handoffs/2026-10-20-promocao-main-comprovantes-imagens.md).

## Promocao MAIN cheques/contrato - 2026-10-20

- DEV1f02 homologado com tres cheques8250 e descontos16273,11; runtime
  preservado na integracao com main e9df, sem migration/dependencia nova.
- Roteiro produtivo existente de cheques agora exige pacote1f02 e roda seu
  QA isolado antes do restart. Preserva .env/TLS/PILOT/12h e reinicia somente
  backend-solicitacoes; nenhuma baixa ou regularizacao automatica.
- [Gates, validacoes e recuperacao](../../handoffs/2026-10-20-promocao-main-cheques-contrato.md).

## Promocao cheques para main - 2026-10-19

- Datas/preservacao de lote719 e moedae01 homologados no DEV, sem migration
  ou dependencia nova. Runtime homologado preservado; hotfixes main mantidos.
- Roteiro `ops/deploy/atualizar-producao-cheques-20261019.sh`: SHA pinado,
  backup/timer, guardas produtivas antes/depois, .env/schema/flags/12h/TLS
  preservados; restart exclusivo producao, sem operacao financeira automatica.
- [Escopo, validacoes e recuperacao](../../handoffs/2026-10-19-promocao-main-cheques.md).

## Promocao notificacoes/reenvio para main - 2026-10-19

- Usuario homologou o pacote DEV1393a446 e autorizou promocao; backup cifrado
  recente e timer ativo confirmados. Produto identico ao homologado, sem
  migrations/dependencias/configuracoes novas nem regularizacoes automaticas.
- Roteiro `ops/deploy/atualizar-producao-autorizacao-reenvio-20261019.sh` exige
  main72 previamente concluida e schema sem pendencias; guardas existentes
  antes do merge, .env por hash, SQL somente leitura, restart apenas do backend
  produtivo e health8000. Nenhum envio/reenvio/push de teste no deploy.
- `verificarReenvioAutorizacaoProducao.js --verificar` usa UUID/TLS/PM2/flags
  produtivos, transacao READ ONLY e ROLLBACK, sem chaves/endpoints/valores no log.
  Configuracao do evento e VAPID nao sao alteradas; contagens nao comprovam
  entrega nem permissao granular de um usuario.
- [Escopo, validacao, operacao e recuperacao](../../handoffs/2026-10-19-promocao-main-autorizacao-reenvio.md).

## Preparacao da promocao financeira - 2026-10-19

- Integracao local dos pacotes DEV ate db1d2253 com a main ff459840, incluindo
  cartao, permuta, multiplas fontes, cancelamento e historico/sobreposicoes.
- Preflight portatil `backend/scripts/preflightFinanceiroProducao20261019.js`
  confere producao por leitura e executa simulacao das duas solicitacoes em
  memoria, sem regularizacao automatica. Evidencia EC2 recebida: identidade/TLS,
  sessao/flags e simulacao conferidos. CORRECAO: o inventario inicial retornou
  vazio por depender do cwd. O operador confirmou posteriormente a unica
  pendencia `202610190001_cartao_parcelamento_baixa.js`. O preflight agora usa
  `git ls-tree --full-tree`, recusa lista vazia/incompleta e testa raiz/backend.
- Roteiro `ops/deploy/atualizar-producao-financeiro-20261019.sh`: SHA fixo,
  backup/timer, bootstrap antigo, runtime homologado, schema/indices/FKs e
  consistencia por SELECT/EXPLAIN antes de restart somente producao. Nao aplica
  migration e parou antes do restart, corretamente, ao encontrar a pendencia.
  `verificarFinanceiroProducao20261019.js --verificar` e exclusivo producao;
  `verificarCartaoParcelamentoMySqlDev.js` continua exclusivo DEV.
- Retomada exclusiva do checkout ja atualizado para a67e3de9:
  `ops/deploy/concluir-producao-financeiro-20261019.sh`. Aceita apenas delta
  operacional em scripts/docs, confirma backup/timer e identidade/flags,
  aplica somente `202610190001` pelo runner canonico com autorizacao limitada
  ao processo Node, confere schema/SQL antes e depois do restart exclusivo
  `backend-solicitacoes`. Preserva .env/PILOT/TLS/12h e nao altera DEV nem
  regulariza/cancela titulos. Qualquer outra pendencia bloqueia a aplicacao.
- [Retomada, causa e validacoes](../../handoffs/2026-10-19-retomada-migration-cartao-producao.md).
- [Gates, validacoes e proximo passo](../../handoffs/2026-10-19-preparacao-main-financeiro-sobreposicoes.md).

## Promocao do historico/remetente para main - 2026-10-18

- Usuario homologou2e146629 no DEV e confirmou backup cifrado/timer ativo.
  Promocao preserva codigo funcional homologado e scripts produtivos anteriores.
- Roteiro `ops/deploy/atualizar-producao-pwa-historico-20261018.sh` exige
  SHA main, backup/timer, identidade/schema/TLS/PILOT/12h e .env preservado.
  Sem migration nova ou restauracao de titulos; restart somente producao.
- [Escopo, guardas e conferencia](../../handoffs/2026-10-18-promocao-main-pwa-historico.md).

## Cartao na fila com PIX anterior e desconto - 2026-10-21

A baixa simples por credito com `parcelamento_cartao` validado pode quitar o
saldo remanescente de um titulo com pagamentos anteriores. Continua exigindo
quitacao integral do saldo atual; o fluxo legado sem essa configuracao conserva
a restricao de ausencia de baixa anterior. Permissoes e demais bloqueadores
permanecem nos mesmos pontos, sem migracao de dados ou alteracao de schema.

Exemplo validado: original40810, PIX anterior4956,70, saldo35853,30,
desconto6853,30 e cartao29000 em6x. Somente29000 entram nas faturas:
duas parcelas4833,34 e quatro4833,33. PIX/historico anteriores sao preservados;
estorno da compra nova reabre35853,30 sem estornar o PIX. Fatura processada
continua bloqueando a operacao correspondente.

QA backend: `node backend/scripts/validarFilaCartaoSaldoRemanescente.js`,
tambem integrado a `validarCartaoParcelamentoBaixa.js`. QA UI real com API
simulada: executar `node scripts/validarCartaoParcelamentoUI.mjs` a partir de
`frontend/` (1366/390, desconto, previa6x, payload e usuario somente leitura).
Sem banco/rede externos. [Handoff e protecoes](../../handoffs/2026-10-21-fila-cartao-saldo-remanescente.md).

Publicacao DEV autorizada junto com a correcao de `Obras` do relatorio de
permutas. Roteiro `ops/deploy/atualizar-dev-saldo-cartao-permutas-20261021.sh`
recebe SHA fixo da refactor/frontend: exige base instalada93f75 ou posterior,
fast-forward, PM2 DEV online/sem watch, identidade MySQL/schema e sessao12h.
Confere dependencias/migrations inalteradas e limita runtime aos dois servicos;
roda regressoes e `verificarPermutasMySqlDev.js --verificar` somente leitura,
depois reinicia exclusivamente backend-dev. Nao altera .env/flags ou producao.
Sem instalar dependencias nem executar migrations. Homologacao financeira manual
somente no DEV, com PIX anterior preservado, desconto e cartao6x; conferir tambem
relatorio de permutas sem datas e com filtros/permissoes habituais.

## Lista unica no detalhe da fatura de cartao - 2026-10-21

`FinanceiroFaturaCartaoDetalhe` apresenta em uma unica `TabelaPadrao` os
titulos diretamente vinculados e as compras/parcelas vindas de
`compras_rateadas`, inclusive compras 1/1. Colunas: titulo/descricao,
parceiro, data da compra, parcela, vencimento, status, valor nesta fatura
e saldo do titulo. Dados antigos sem data/parcela continuam sem essa
informacao; nao inferir a compra pela emissao ou vencimento.

Helper `faturaCartaoItens.mjs` e somente uma projecao de leitura: titulo
direto conserva `valor_original`; parcela/rateio usa `valor_quitacao` da
parte e nunca o total original do titulo. Identidades de titulo, parcela
e movimento sao separadas; partes distintas do mesmo titulo permanecem
visiveis, e a mesma entidade repetida no payload nao duplica linha.
Totais/saldo da fatura, contagem de titulos, regras de baixa, permissoes,
API, banco e historico nao foram alterados. A lista nao recalcula o total
financeiro e nao cria novos vinculos ou movimentos.

Preferencias da lista usam a nova chave `tabela:fatura-cartao-detalhe:unificada`
para apresentar as novas colunas sem herdar ocultacoes das duas listas antigas.
QA: `node frontend/scripts/validarFaturaItensUnificados.mjs` e
`node frontend/scripts/validarFaturasWorkspace.mjs` (tambem executa o unitario).
Handoff: [lista unica e validacoes](../../handoffs/2026-10-21-fatura-lista-unica.md).

Atualizacao DEV deste pacote usa
`ops/deploy/atualizar-dev-fatura-lista-unica-20261021.sh` com SHA publicado fixo.
Como so muda UI/QA/docs, nao instala dependencias, nao aplica migrations e nao
reinicia backend. Confere checkout/PM2/watch/schema/.env e executa o QA unitario;
a exibicao depende do deploy do frontend DEV na Vercel. Nunca executar em main.

## Relatorio de permutas: referencia Obras - 2026-10-20

Consulta usa `LEFT JOIN Obras`, alinhada ao modelo Obra e ao nome real da
tabela no MySQL. Operador confirmou no DEV `lower_case_table_names=0`,
tabela `Obras` e `ER_NO_SUCH_TABLE` para a referencia anterior `obras`.
Sem migration, rename, ajuste de configuracao, dados ou permissoes.

`validarPermutasRelatorio.js` confere identificadores de tabela com casing
exato contra o modelo/schema antes de cada SELECT SQLite; a referencia antiga
e rejeitada explicitamente. SQLite sozinho nao detecta diferenca de casing.
Filtros, periodo integral, somas, estornos/legado, paginacao e ACL preservados.
Handoff: [correcao e validacoes](../../handoffs/2026-10-20-permutas-obras-case.md).

## Comprovantes manuais PDF e imagens - 2026-10-20

- Anexo individual e mesmo comprovante compartilhado aceitam PDF/JPG/JPEG/PNG,
  ate12MB por arquivo. Importacao automatica continua exclusivamente PDF.
- Extensao/MIME/assinatura, scanner configurado, permissoes/escopo e limites
  mantidos. Metadados PDF/JPEG/PNG usam colunas existentes; S3 recebe ContentType
  coerente e chave por destino. Sem migration ou permissao nova.
- Anexar nao registra baixa nem muda valores/contas/datas; hash/replay/locks,
  historico da solicitacao, escopo de arquivo e remocoes preservados. Imagem
  abre na previa existente, sem forcar PDF. Nao ha OCR/conversao automatica.
- [Mapa e validacoes](../../handoffs/2026-10-20-imagens-comprovantes-fila.md).

## Cheques de lote com descontos e contrato - 2026-10-20

- Instrumentos compartilhados sao partes de uma unica liquidacao: o contrato
  e a solicitacao sao sincronizados somente apos todos os componentes, na
  mesma transacao, sem tratar cada cheque como pagamento parcial definitivo.
- Descontos/principal/desembolso e centavos do rateio permanecem inalterados;
  movimentos e historicos individuais sao preservados. Falha final reverte o
  grupo inteiro, incluindo utilizacao de cheque da carteira.
- Estorno continua integral e protegido por permissoes/escopo: sincroniza
  apos reverter todas as partes e antes de reabrir a fila com o saldo atual.
  Regra de baixa avulsa e protecoes de saldo/permissao/replay permanecem.
- Sem migration ou alteracao automatica de contratos/titulos existentes.
  [Reproducao e validacao](../../handoffs/2026-10-20-cheques-lote-contrato.md).
- Publicacao DEV autorizada: roteiro de datas dos cheques reutilizado com QA
  do contrato/lote antes do restart. Preserva schema/.env/flags, sem DDL,
  e reinicia apenas backend-dev; EC2 operada pelo usuario com SHA pinado.

## Moeda nos cheques - 2026-10-19

- Valor dos cheques no editor individual e de lote usa mascara BRL existente
  (R$ 1.234,56), com teclado decimal. Estado e payload permanecem numericos;
  soma em centavos, carteira somente leitura e validacoes atuais preservadas.
- [Escopo e validacao](../../handoffs/2026-10-19-moeda-cheques.md).

## Datas dos cheques na baixa - 2026-10-19

- Campos compartilhados de cheque usam DateInputBR com edicao segmentada,
  DD/MM/AAAA e ano de quatro digitos. API conserva AAAA-MM-DD; datas opcionais
  continuam opcionais. Nenhuma inferencia/regravacao de datas antigas.
- Falhas de formato/calendario identificam emissao ou vencimento/compensacao
  e a posicao do cheque. Mensagem visivel somente na tentativa de confirmar
  ou enviar, sem avisos antecipados durante preenchimento.
- Na falha de envio da baixa em massa, o modal permanece aberto com os dados
  de conta/data/forma e instrumentos do lote. Erro nao limpa selecao nem
  cheques; correcao/retry preservam revalidacao de versao, ACL e mutex.
- Sem migration ou alteracao de permissoes, idempotencia, valores ou regras
  de cheque proprio/carteira. [Escopo e testes](../../handoffs/2026-10-19-datas-cheques-baixa.md).
- Publicacao DEV autorizada com roteiro exclusivo
  `ops/deploy/atualizar-dev-datas-cheques-20261019.sh`: guardas antes do merge,
  schema somente leitura, .env/flags/12h preservados e restart apenas do DEV.

## Autorizado aguardando envio: alerta e recuperacao - 2026-10-19

- Autorizacao digital e enqueue usam transacoes distintas. Se a assinatura
  foi commitada e a fila falha, o titulo permanece AUTORIZADO; nao pedir outra
  assinatura nem apresentar falha de passkey. A resposta explicita envio_pendente.
- Gera imediatamente notificacao interna PAGAMENTO_AUTORIZADO_ENVIO_PENDENTE
  aos autorizadores nominais ativos que ainda possuem granular de decisao,
  inclusive o proprio ator. Respeita a configuracao administrativa do evento.
  Dedup por lote/revisao/conjunto de itens, serializada pelo lock do lote.
  Push generico apos commit, sem valores/documentos/credores; falha de entrega
  nao desfaz a decisao ou a notificacao interna. Entrega pelo SO depende de
  permissao, assinatura/VAPID e conectividade; nao e garantia de entrega instantanea.
- Conferir e reenviar na notificacao abre apenas GET da conferencia do lote,
  inclusive fora da pagina carregada. Reenvio exige clique autenticado. Ha
  Reenviar para a fila na lista por obra, detalhe do titulo e visao por lote.
  No titulo envia somente aquele item; no aviso/lote envia os elegiveis exibidos.
- Backend aceita preparador atual OU autorizador nominal ativo com granular
  de decisao; visualizador/configurador sozinho nao pode reenviar. Modo Testar
  usuario e PAUSED bloqueiam. Reenvio nao consome nova passkey, nao concede
  permissao de envio direto e usa o enqueue existente com escopo/locks/revisao/
  idempotencia/protecoes e historico. Rejeitados/invalidos/pagos nao sao reenviados.
- Sem migration nova, backfill de alertas antigos, alteracao de dados reais ou
  publicacao. Implementacao isolada na base refactor/frontend db1d2253.
- Deploy anterior confirmado pelo log do operador: main72e628e8, migration
  202610190001 aplicada, nenhuma pendente, schema/SQL/indices/FKs conferidos,
  restart somente backend-solicitacoes e health200. .env/PILOT/TLS/12h e DEV
  preservados. Esta correcao nova ainda exige homologacao DEV antes da main.
- [Escopo, testes e pendencias](../../handoffs/2026-10-19-autorizacao-alerta-reenvio.md).
- Publicacao DEV autorizada posteriormente: roteiro
  `ops/deploy/atualizar-dev-autorizacao-reenvio-20261019.sh`, sem DDL, com
  identidade/schema/flags, .env preservado e restart somente backend-dev.
  `verificarReenvioAutorizacaoDev.js --verificar` confere prontidao por leitura.
  Modo opcional `--testar-push USUARIO_ID LOTE_ID` envia push real somente ao
  autorizador ativo/com granular e lote com itens AUTORIZADO no DEV; nao aprova
  ou reenvia titulos, mas pode inativar assinatura expirada. Nao gera alerta
  interno ficticio nem evento financeiro. Nao faz parte do deploy automatico.
- [Comandos, testes e operacao ja na main](../../handoffs/2026-10-19-publicacao-dev-autorizacao-reenvio.md).

## Fila: baixa com multiplas fontes - 2026-10-18

- Acoes Multiplas fontes na linha e Baixa com multiplas fontes na selecao
  reutilizam o editor atual, com valor por fonte e distribuicao entre titulos.
  A revisao nao grava baixas; confirmar revalida saldos/fontes sob bloqueio.
- Rotas exclusivas da fila exigem acesso financeiro, baixa da fila e granulares
  existentes de baixa composta criar/confirmar. Permuta exige .usar;
  estorno do novo grupo exige tambem baixa composta .estornar. Sem concessoes.
- Reusa baixarTitulo e PagamentoFilaLiquidacao; movimentos, fila e auditoria
  sao atomicos. Replay nao duplica pagamentos; estorno reverte o grupo completo,
  inclusive carteira uma vez. A linha mostra apenas suas fontes e valores.
- Mesmo credor, ate 200 itens/60 fontes, sem encargos/desconto nesse caminho.
  Cartao de credito permanece no fluxo proprio de fatura. Pagamento parcial
  exige justificativa e segue a divergencia atual da fila. Escopos, bloqueios
  proprietario/DP/Obra, caixa aberto e dados de cheque continuam validados.
- Sem migration nova, alteracao de legado, EC2 ou producao. Implementacao local
  baseada em refactor/frontend (39f368be); homologacao real DEV ainda pendente.
- [Operacao, limites e testes](../../handoffs/2026-10-18-fila-multiplas-fontes.md).

## Permutas realizadas: operacao e relatorio - 2026-10-18

- Primeira etapa confirmada pelo usuario: registrar valores de permuta nas
  baixas, sem limite/saldo de acordo e sem exigir recebimentos anteriores.
  Nenhuma migration ou seed; legado preservado, inclusive BENS/tipo_permuta.
- Cadastro da forma, uso na baixa e relatorio separados pelas granulares
  `financeiro.permutas.cadastrar`, `financeiro.permutas.usar` e
  `financeiro.permutas.relatorio`.
  Exigem os acessos financeiros atuais; nao ampliam escopo de obras.
- Na fila, PERMUTA integral sem conta; composicao monetaria informa o total
  pago e a parte em permuta. Duas baixas atomicas, estorno do grupo e replay.
  Relatorio /financeiro/permutas separa realizado pagar/receber e estornos.
- [Escopo, operacao e QA](../../handoffs/2026-10-18-permutas-realizadas-mapa-datas.md).
- [Mapa de datas, sem migracao global](../../datas/MAPA_E_PLANO_PADRONIZACAO.md).

## Titulos excluidos: consulta historica no PWA - 2026-10-18

- Exclusao logica comprovada agora aparece como Titulo excluido, com data,
  responsavel e motivo, na lista por obra, detalhe e historico por lote.
  Registro realmente inexistente e sem evidencia de exclusao segue Indisponivel.
- Filtro Titulos excluidos - historico permite conferencia separada. Excluidos
  nao entram em Aguardando aprovacao/Na fila/pendencias e nunca habilitam
  selecao, aprovacao, rejeicao ou revogacao. Fila antiga PENDENTE nao os reativa.
- Scope operacional deleted_at=null e rotas de baixa/decisao permanecem iguais.
  Metadados sao lidos separadamente por PK; DTO historico tem titulo=null e,
  na fila direta, nenhuma versao de decisao por passkey. Obra historica preservada.
- Snapshot, valor enviado e documentos assinados nao sao regravados. Exemplo
  auditado: snapshot2480 e ultimo titulo/fila1240 permanecem distintos; o painel
  explicita Valor historico enviado, nao saldo disponivel para pagamento.
- Sem restauracao, encerramento de filas, migration ou operacao em producao.
  [Handoff e testes](../../handoffs/2026-10-18-pwa-titulos-excluidos-historico.md).

## PWA: remetente por ciclo e filtros automaticos - 2026-10-18

- Estornar a baixa continua devolvendo o saldo a fila, sem nova autorizacao.
  A projecao do painel preserva remetente/data do envio seguindo exclusivamente
  os vinculos estorno.reaberto_id, inclusive em cadeias e estornos agrupados.
- Novo envio apos rejeicao, direto ou autorizado, inicia outra origem: nao se
  usa a primeira fila do titulo nem se atravessa ciclos sem vinculo de estorno.
  Pedido ainda pendente de aprovacao mostra criador/data do novo lote, com
  rotulo Enviado para autorizacao; nao usa remetente de uma fila antiga resolvida.
  Corrige tambem a leitura do legado, sem regravar selecionado_por/selecionado_em,
  estornos, valores, decisoes ou historico. Permissoes permanecem inalteradas.
- Uma consulta adicional em lote busca somente os historicos dos titulos da
  pagina ja filtrada; totais, cursores, filtros e snapshots assinados nao mudam.
- Situacao atual aplica imediatamente combinada com obra, tipo de data e
  periodo. Demais campos aplicam com debounce de 600ms; datas incompletas ou
  impossiveis nao sao enviadas. Data inicial/final isolada valida e aceita.
  Sem datas, todo o periodo. Aplicar filtros removido; Limpar filtros mantido,
  inclusive para limpar texto parcial da data. Selecao entre paginas preservada.
- Responsividade WEB: filtro ocupa largura util, sem teto global de cadastro
  de 940px; botoes e configuracao de autorizadores nao quebram em letras.
  Teste do Pagina/Layout reais cobre 320/390/768/1024/1366/1920.
- [Handoff e validacoes](../../handoffs/2026-10-18-remetente-fila-filtros-automaticos.md).

## Dados para autorizacao e obras no titulo rapido OFX - 2026-10-18

- Rotulos da autorizacao agora usam Dados para autorizacao, Valor enviado para
  autorizacao e Documentos enviados para autorizacao. Dialogos de envio e
  ajuste de medicao tambem usam linguagem de autorizacao, sem mudar decisao.
  Campos tecnicos snapshot_json/dossie_hash, valores, hashes e historico nao
  foram renomeados nem regravados. Dossie de RH/Juridico nao pertence a esta troca.
- O modal Novo titulo + baixa, em Conferir manualmente do OFX, passou a usar
  getMinhasObras com modo FINANCEIRO e escopo TODOS, igual ao cadastro normal
  de titulos. Isso inclui todas as obras e centros de custo para usuarios
  com acesso financeiro atual, sem exigir vinculo UsuarioObra.
- Causa: a consulta anterior omitia modo, caindo na lista por UsuarioObra.
  SUPERADMIN usava um caminho proprio, por isso nao apresentava o problema.
  catch vazio tambem escondia erros de consulta como se nao houvesse obras.
- Nenhuma ACL de backend alterada: modo FINANCEIRO continua dependendo de
  canAccessFinanceiro. Usuarios sem esse acesso conservam apenas seus vinculos;
  nao ganham acesso geral a solicitacoes. Criacao/baixa/conciliacao permanecem
  no POST e transacao atuais, com conta, empresa, sinal, valor, parceiro e DRE.
- Loading bloqueia selecao/envio; falha exibe motivo sanitizado e retry;
  lista vazia e sinalizada; respostas apos fechar/recarregar sao descartadas.
- npm run test:ofx-obras em backend e frontend usa models/HTTP isolados.
  Sem migration nova, alteracao de cadastro da Helida ou operacao em producao.
- [Handoff](../../handoffs/2026-10-18-autorizacao-textos-ofx-obras.md).

## Autorizar no celular: retorno e area util - 2026-10-17

- Voltar do navegador/PWA e botao nativo respeitam detalhe do titulo -> titulos
  da obra -> obras -> pagina anterior. Anterior/Proxima do detalhe continuam
  apenas consultando vizinhos, sem criar uma etapa de historico por titulo.
- Filtros, pagina e selecao ficam preservados. Anexo sobreposto fecha primeiro;
  operacao em andamento impede desmontagem. Historico guarda somente tokens
  opacos; snapshots ficam em memoria da sessao, com reconsulta ao reabrir.
- No celular, abrir obra oculta toolbar de visoes/opcoes e totais gerais,
  alem dos filtros ja recolhidos. Voltar as obras devolve esses controles.
  Situacao usa a largura inteira e Opcoes abre dentro do viewport.
- Lista de boletos da fila continua limitada a BOLETO/BOLETO_COMPRA/BOLETO_FRETE
  nao removidos e vinculados a solicitacao acessivel. Nome/extensao do arquivo
  nao tornam um anexo comum em boleto; comprovantes tem fluxo proprio.
- Correcao de gravacao NOVA: campos BOLETO/FRETE_BOLETO da compra direta
  passam a gerar BOLETO_COMPRA/BOLETO_FRETE no espelho da solicitacao. A edicao
  do boleto do frete usa BOLETO_FRETE. Nota fiscal/anexo comum continuam ANEXO.
  Nova solicitacao conserva BOLETO; solicitacao de compra via pedido conserva
  BOLETO_COMPRA/BOLETO_FRETE. Sem migration/reclassificacao de arquivos antigos,
  alteracao dos dossies assinados, permissoes ou baixa de titulos.
- [Handoff e testes](../../handoffs/2026-10-17-autorizacoes-voltar-boletos.md).

## Autorizacoes: area util e detalhe sequencial - 2026-10-17

- A rota de autorizacoes usa shell compacto em navegador e PWA para TODOS os
  usuarios que ja possuem capacidade de acesso, inclusive SUPERADMIN. Nao ha
  concessao de permissao por perfil nem mudanca da tela inicial individual.
  Cabecalho geral, breadcrumbs, abas e banner PILOT saem desta rota; conta,
  tema, menu, busca, saida, passkey, avisos e dispositivos continuam acessiveis
  por controles compactos. Outras rotas conservam o shell completo.
- `Por obra` e a visao inicial comum; historico por lote continua disponivel.
  Cards usam superficie branca no claro e tokens de contraste no escuro.
  A selecao vazia nao ocupa espaco antes de escolher obra.
- Clicar no codigo da solicitacao/titulo abre dossie de leitura em tela inteira,
  sem conceder edicao/acesso direto ao formulario da solicitacao. Corpo rolante
  mostra valores, dados do dossie, justificativa atual, participacoes e documentos.
  Rodape sempre acessivel na ordem Anterior, Rejeitar, Aprovar, Proxima.
- Anterior/Proxima sao apenas GET; nao aprovam, rejeitam ou selecionam. Mantem
  obra/filtros e atravessam paginas por cursor vencimento+ID, inclusive quando
  o titulo recem-decidido deixa o filtro. Nao ha carregamento integral da fila.
  Limites de navegacao mostram mensagem, sem sair da obra automaticamente.
- Aprovar/Rejeitar reconsultam o titulo, pedem conferencia e passkey, enviam
  somente UM item pelo POST existente. Nao avancam automaticamente. Motivo e
  obrigatorio para rejeicao. Falha/INVALIDADO nao e apresentado como aprovado.
  Sem bypass nominal, snapshot reescrito, nova permissao, POST ou migration.
- Fechar o detalhe preserva filtros, pagina e selecao geral; decisao individual
  so remove aquele titulo da selecao. Anexos usam o visualizador existente;
  Escape fecha apenas o anexo superior. Fundo fica inert e foco fica no detalhe.
  Polling da lista pausa durante o detalhe e retoma ao fechar, com dados atuais.
- Novos parametros GET de titulos: `sentido=ANTERIOR|PROXIMA`,
  `cursor_item_id`, `cursor_vencimento=YYYY-MM-DD|SEM_DATA`. Valores validados e
  parametrizados; nao combinar com pagina diferente de1 ou item_ids.
  `verificarPainelAutorizacoesDev.js --verificar` passou a exercitar ambos os
  sentidos no MySQL DEV. Revalidar apos publicar; teste local SQLite nao substitui
  homologacao MySQL/EXPLAIN. Nao executar novo painel em producao nesta etapa.
- [Handoff](../../handoffs/2026-10-17-autorizacoes-tela-inteira.md).

## Autorizacoes por obra e situacao financeira atual - 2026-10-17

- Usuarios com acesso iniciam a tela em `Por obra`; `Por lote / historico`
  permanece disponivel. O shell compacto agora tambem atende o navegador.
  Filtros por vencimento inicial/final, nome da obra e situacao sao aplicados no
  servidor, antes da paginacao. Sem conceder acesso geral ao modulo Financeiro.
- Obras mostram quantidade/valor das participacoes dos dossies no recorte.
  Resumo conta titulos unicos; varias origens na mesma obra sao agrupadas e
  residuos em centavos ficam na ultima obra. Selecionar um compartilhado decide
  o titulo inteiro, com aviso, sem repetir o pagamento em cada obra/CNPJ.
- Abrir obra lista titulos de varios lotes juntos. Aprovar apenas um NAO decide
  os outros do lote. Pode voltar depois para decidir os restantes. A selecao
  persiste entre obras/paginas; selecionar todos abrange somente a pagina atual,
  e limpar selecao remove de todas. Conferencia explicita inclui os nao visiveis.
- Passkey continua pelo contrato atual, com apenas os itens selecionados de
  cada lote. Multiplos lotes sao confirmados serialmente, com aviso de progresso
  parcial; falha interrompe os seguintes e nao desfaz decisoes anteriores.
  Revalidacao de todos os selecionados ocorre antes da conferencia, e a decisao
  continua revalidando material/ACL/locks no servidor. HTTP200 com item INVALIDADO
  nao e apresentado como autorizado. Duplo clique permanece bloqueado.
- Situacao financeira e projecao de leitura, fora do snapshot/material assinado:
  QUITADO, PARCIALMENTE_PAGO, NAO_PAGO, NA_FILA e demais estados de historico.
  Titulos/lotes quitados nao ficam mais com rotulo fixo `NA FILA`. Lote misto
  mostra pagamentos parciais e contagens de situacoes, sem alterar sua decisao.
- `Aguardando aprovacao` consulta decisoes pendentes, incluindo saldo parcial
  com dossie valido. `Nao pago`/`Na fila` consultam a tentativa atual; pagamento
  parcial continua visivel no badge financeiro. Um titulo pode estar parcialmente
  pago e ter sua ultima tentativa marcada nao paga. Quitacao/cancelamento nao
  sao confundidos com falta de pagamento. Estorno/retorno usam o ultimo ciclo.
- expira_em permanece metadado legado: nao foi criado prazo ou bloqueio novo.
  Rejeicoes/invalidacoes/cancelamentos continuam distinguiveis; leitura em PAUSED
  e bloqueio OFF seguem a politica existente. Nenhuma flag/PILOT muda.
  Leitura nao consulta passkeys/push a cada pagina; mesma matriz nominal de
  visualizar/preparar/configurar ou decidir com autorizador ativo preservada.
- API GET da lista agora retorna `{data,paginacao}` em blocos de 30 (maximo 50),
  com ordenacao estavel/data+id e contagem completa, sem teto global de 100 lotes.
  Novos GET `/financeiro/autorizacoes-pagamento/painel/obras` e `/painel/titulos`
  usam a mesma capacidade nominal de leitura de dossies; nenhum POST de decisao
  novo. Painel usa somente o dossie mais recente por titulo; por lote mantem o
  historico. Consulta paginada de documentos retorna apenas metadados, sem presign
  em massa. Endpoints e cliente usam no-store; service worker nao armazena APIs.
- Polling serial de 30s somente visivel/aba ativa, backoff de erros, respostas
  obsoletas ignoradas e retry manual explicito. Sem alterar pool/conexoes.
  Desktop tem obras/titulos lado a lado. No celular, voltar as obras reabre
  filtros; a lista de titulos rola sem afastar as acoes por dezenas de telas.
- Sem nova migration, .env ou operacao de producao. Testes isolados de 1001
  lotes/650 titulos/150 obras, ACL, estados e UI mobile/desktop registrados no
  [handoff](../../handoffs/2026-10-17-autorizacoes-obras-status.md). A execucao
  SQL local usa SQLite em memoria (Node24), nao substitui MySQL/EXPLAIN DEV.
  Operador pode validar SQL/planos somente no DEV com
  `node scripts/verificarPainelAutorizacoesDev.js --verificar` (backend).

### Conferencia dos titulos negociados enviados pelo operador

Prints mostram negociacoes #3/#4/#5 e TIT-010879/010885/010890 quitados; SOL-5419
e pedido PC-00139 aparentam somar duas vezes R$2815,00. Isso NAO prova quais
registros estao duplicados ou se eram origens selecionadas. Nao excluir titulos
para esconder a divergencia. Script de operador
`backend/scripts/auditarNegociacoes20261017.js --verificar` valida UUID/endpoint
do ambiente e executa somente tres SELECTs do recorte, distinguindo origem do
acordo, parcela paga e candidato fora dos acordos. Nao repara nem exclui nada.
Sua implementacao nao significa que o script foi publicado ou executado em
producao. Reparo exige conferencia dos vinculos e autorizacao especifica.

## Medicao x valor efetivamente autorizado - 2026-10-16

O ajuste de pagamento de medicao preserva o medido e permite reduzir titulo
aberto sem baixa, destinando a diferenca a previsao futura ou abatimento
definitivo auditado. Os valores aparecem separados no Financeiro da solicitacao.
Invalida o dossie anterior e encerra fila nao processada sem pagamento, exigindo
novo envio pelas permissoes/gate atuais. Titulos pagos/parciais nao mudam.
Nao baixar a diferenca PREVISAO antes da liberacao explicita. Regras, limites e
migration aditiva DEV em [Contratos](../contratos/README.md#valor-medido-e-valor-autorizado-para-pagamento---2026-10-16).

## Boletos da solicitacao e dos pedidos na fila - 2026-10-16

- Todos os recortes/cards usam a mesma consulta paginada de boletos ativos:
  `BOLETO`, `BOLETO_COMPRA` e `BOLETO_FRETE`. Uma consulta em lote para as
  solicitacoes da janela atual, sem N+1, sem presign em massa e sem mudar pool.
- A coluna Titulo/Documento oferece `Boletos da solicitacao (N)`, com nomes e
  acesso ao modal ja existente de Visualizar/Baixar. O modal identifica boleto
  da compra, do frete ou da solicitacao e nao mistura comprovantes/anexos gerais.
- Nao pressupor que todos os boletos da solicitacao pertencem a uma unica
  parcela: conferir fornecedor, documento, valor e vencimento antes da baixa.
- Leitura/listagem/presign mantem as autorizacoes atuais. Nao altera selecao,
  rascunhos, parcelas, contas, instrumentos, autorizacoes ou pagamentos.
- Historico de novos uploads e leitura de boletos antigos documentados no
  [README Compras](../compras/README.md#boletos-dos-titulos-de-pedido-na-fila-e-historico---2026-10-16).
  Ajuste de boletos sem migration propria; aguarda homologacao DEV.

## Titulos compartilhados entre origens e CNPJs - 2026-10-16

- A acao `Gerar titulos compartilhados`, no financeiro da solicitacao ou do
  pedido fechado, busca SOL/PC/pedido/descricao/obra dentro da visibilidade atual.
  Reune de 2 a 100 origens do mesmo credor e gera de 1 a 120 parcelas A PAGAR.
  Obras e empresas devedoras diferentes sao permitidas: existe **um titulo por
  parcela**, nao uma copia por solicitacao ou CNPJ.
- Cada origem participa pelo valor integral registrado; pedido usa total fechado
  do fornecedor com frete embutido. A previa discrimina empresa/CNPJ, origem,
  participacao e vencimento. Soma das origens e parcelas fecha em centavos. Mudanca
  invalida a previa; confirmacao revalida acesso, valores e disponibilidade com
  locks, transacao e chave idempotente por usuario. Nao reutilizar a chave para
  outro lote. Origens ja tituladas nao podem gerar outra divida ativa.
- Nao cria permissoes: pedidos exigem as mesmas autorizacoes de gerar titulos em
  Compras e escopo da compra; demais solicitacoes exigem criacao financeira e
  acesso operacional atuais. Modulos devem estar habilitados. Contratos,
  medicoes, DP, compra direta, adiantamentos e recargas preservam fluxos proprios.
- Empresa/obra do titulo fica nula quando houver varios devedores/destinos;
  identidade economica permanece nas participacoes imutaveis. A conta identifica
  quem pagou, nao substitui o devedor. Baixa parcial e estorno redistribuem
  principal/encargos/desconto/saldo sem duplicar valores por obra ou empresa nos
  relatorios adaptados de titulos, fluxo/DRE e resultado/gestao de obras.
- Fila manual mantem uma linha por titulo, com participacoes para conferencia.
  Baixa direta/em massa normal e comprovantes usam o titulo inteiro; entre
  empresas, natureza operacional a terceiro, sem transferencia interna ficticia.
  Paginar/selecionar titulos conserva as regras existentes. Autorizacao do
  proprietario congela tambem as participacoes; nenhuma flag de ativacao muda.
- Na aba da solicitacao, a leitura expõe somente sua participacao e nao permite
  enfileirar esse valor parcial. Detalhe, fila, comprovantes e operacoes do titulo
  canonico exigem todas as obras no escopo financeiro. Pedido recebe valores
  proporcionais; historico da origem nao replica nomes/codigos de outras origens.
  Retorno pendente de qualquer origem conserva o bloqueio de baixa do conjunto.
- Edicao estrutural, renegociacao, exclusao isolada e baixa agrupada que cria
  novos titulos sao bloqueadas para preservar o rateio. `Cancelar lote
  compartilhado`, no detalhe, exige a permissao existente de excluir titulos,
  todas as obras e motivo. Cancela todo o lote somente sem baixas, cartoes, fila,
  autorizacoes ou pagamentos ativos; nao apaga vinculos, documentos ou historico.
- Frete de terceiro permanece separado; se ainda pendente de titulo, regularizar
  no fluxo do pedido antes de consolidar o fornecedor. Cartao na criacao e envio
  bancario automatico nao foram ampliados: homologacao deste recurso e pela fila
  manual. Em especial, lote bancario atual exige empresa unica no titulo; nao
  atribuir artificialmente o titulo multiempresa a um CNPJ para contornar isso.
  Relatorio especializado Entre Empresas conserva seu modelo escalar; consultar
  participacoes/relatorios economicos por empresa para divida multiempresa.
- Schema: `202610160001_titulos_compartilhados.js`, estrutural/idempotente, cria
  lotes e participacoes com indices/FKs RESTRICT, sem backfill de negocios.
  Criada, mas nao aplicada pelo agente. Exige homologacao DEV antes de promocao
  para main; nao executar automaticamente em producao.
- Validacao local isolada: `npm run test:titulos-compartilhados` no backend e
  frontend, regressao `npm run test:performance-fila-dp`, build/navegacao/docs.
  Fixtures nao substituem homologacao em MySQL dev com migration aplicada.
  Atualizacao DEV: `ops/deploy/atualizar-dev-titulos-compartilhados-20261016.sh`
  confere identidade/PM2/porta/flags, aplica somente esta migration e reinicia
  backend-dev. Interrompe com pendencias adicionais; nao altera producao.

## Performance e paginacao da fila - 2026-10-15

- Tela consulta 50 registros por pagina em TODOS os cards/status, inclusive
  Baixados, Resolvidos e Pendentes de comprovante. API aceita pagina/limite
  (maximo 100); consumidores legados sem paginacao conservam o contrato anterior.
  Totais dos cards continuam representando o recorte estruturado completo.
- Busca textual e filtros sao aplicados antes do LIMIT. Comprovantes 1:N sao
  carregados separadamente para nao consumir vagas ou duplicar linhas da pagina.
  Rejeicoes continuam virtuais, nao executaveis; somente ultima decisao por titulo.
- Recebimento DP de exibicao e resolvido em lotes por solicitacao/snapshot,
  vinculado ao ID exato do titulo. Filtro de recebimento conserva SQL e fallback
  legado, sem reclassificar pelo cadastro atual. Nao ha backfill ou migration.
- Selecao entre paginas conserva apenas dados em memoria da tela. Selecionar
  todos/desmarcar todos afeta somente a pagina atual em modo Paginas e somente
  os elegiveis ja carregados em modo Rolagem. Trocar filtro/status limpa
  a selecao. Antes de baixar/autorizar/anexar, reler os IDs no mesmo recorte;
  alteracao ou indisponibilidade bloqueia a operacao. Locks/ACLs/idempotencia
  existentes continuam obrigatorios no backend.
- Limites de operacao nao aumentaram: baixa ate 200 itens, comprovante
  compartilhado ate 100. Paginar nao apaga titulos, comprovantes ou historico.
- Testes isolados: npm run test:performance-fila-dp no backend e
  node scripts/validarFilaInstrumentosUI.mjs --paginacao no frontend.
  Cenarios com 650 titulos; nao constituem benchmark de RDS real.

### Navegacao por paginas ou rolagem - 2026-10-16

- Todos os cards/status compartilham o alternador **Rolagem / Paginas** na barra
  da fila, no mesmo padrao operacional de Solicitacoes. Rolagem e o padrao para
  quem nao tem preferencia; escolha usa PreferenciasContext, tipo visual,
  por usuario/lista `financeiro-fila-pagamentos`, sem alterar colunas/larguras.
- Rolagem consulta o proximo lote de 50 ao aproximar o fim da tabela, em serie,
  sem aumentar limite SQL nem carregar o historico inteiro na abertura. Botao
  Carregar mais pagamentos permite avancar tambem sem IntersectionObserver.
  Status e filtros continuam enviados ao mesmo endpoint e ACLs nao mudam.
- Trocar modo volta ao inicio da lista e conserva selecao/rascunhos em memoria.
  Marcar todos nunca seleciona registros ainda nao carregados. Limpar selecao
  remove a selecao de todas as paginas/lotes. Limites de baixa/anexo e revalidacao
  integral dos IDs antes de escrita permanecem, inclusive fora da janela exibida.
- Atualizar ou concluir uma operacao reconsulta a janela ja carregada em serie,
  removendo linhas que sairam do recorte. Deduplicacao por ID, resposta atrasada
  descartada por revisao, janela invalidada em troca de usuario/filtro/status.
  Carga automatica pausada em aba oculta, modal aberto ou operacao em andamento.
- Falha transitoria ao carregar mais conserva a janela e oferece tentativa manual;
  nao dispara loop de retry. 401/403 e outras falhas de autorizacao/validacao
  retiram dados/selecao da tela. Baixas permanecem bloqueadas durante a carga.
- Testes: `npm run test:fila-rolagem` e regressao `npm run test:fila-instrumentos-ui`.
  Fixtures isoladas; nao sao prova de capacidade ilimitada de memoria ou de RDS.
  Nao ha migration, alteracao financeira ou escrita de dados de producao.

## Comprovante compartilhado na fila - 2026-10-15

- Mesmo PDF pode ser vinculado a titulos diferentes no upload individual,
  importador e nova acao Anexar mesmo comprovante. Nunca duplica o mesmo par
  fila/hash. Reutilizacao no importador exige escolha explicita do destino,
  sem expor codigo ou dados de outro titulo onde o PDF tenha sido utilizado.
- Lote seleciona de 1 a 100 itens PENDENTE sem baixa ou pendentes de comprovante.
  POST /financeiro/fila-pagamentos/comprovantes/compartilhar usa a mesma permissao
  de anexar individualmente (baixar), modulo Financeiro e limite seguro de upload;
  arquivo PDF ate 12 MB. Nao cria permissao ou bypass de visibilidade novo.
- Acao apenas anexa: nao baixa, nao altera conta/data/valor, nao envia ao banco
  nem autoriza divergencia. Em Todos, Baixa em massa recebe apenas pendentes sem
  pagamento; a selecao para comprovante nao pode repetir uma baixa ja registrada.
- Valida todos antes de subir, revalida status/movimento sob locks da fila em
  ordem e grava todos os vinculos/auditoria em uma transacao. Falha reverte o
  lote. S3 usa chave por destino para preservar ACLs/anexos de cada solicitacao.
  PDFs sobem antes da transacao; falha de infraestrutura pode deixar objetos
  sem vinculo, como no upload existente, mas nunca vinculos parciais no banco.
- Migration estrutural 202610150002_comprovante_compartilhado_fila.js cria
  unicidade (fila_id, hash) e remove apenas unicidades globais do hash nas duas
  tabelas, mantendo indices de busca. Idempotente, sem seeds/backfill ou ajuste
  de registros; down nao apaga vinculos para voltar a unicidade global.
  Deve ser aplicada no ambiente homologado antes de usar compartilhamento.
- Testes isolados: validarFilaComprovantePendente.js (inclui lote/replay/rollback),
  validarComprovanteCompartilhadoSchema.js, validarComprovantesPdfFila.js e
  validarFilaInstrumentosUI.mjs (desktop/mobile, sem baixa automatica).

## Regularizar recarga de solicitacao excluida - 2026-10-15

- Menu Solicitacoes > Regularizar recargas, exclusivo de GEO/SUPERADMIN,
  com consulta/regularizacao global de recargas excluidas de todas as obras.
  Esta excecao NAO altera vinculos de obra, permissoes ou regras de visibilidade
  da lista/detalhe/anexos das solicitacoes. Nao concede acesso financeiro geral.
- GET /recargas-cartao/regularizacao lista solicitacoes excluidas com recarga;
  filtro exato codigo e pagina de 30 solicitacoes por cursor antes_de.
  GET /recargas-cartao/regularizacao/:id confere todos os cartoes e titulos.
  Consultar/abrir a tela nao grava dados.
- POST no mesmo caminho exige motivo, revisao atual e chave de idempotencia;
  uma transacao, mutex por cartao em ordem crescente e locks da solicitacao,
  recargas, titulos e prestacoes. LogExclusao, entidade REGULARIZACAO_RECARGA,
  guarda autor, motivo completo em payload_json, estado anterior, resultado
  e chave. Nao cria Historico, atribuicao, mencao ou envio ao setor que possa
  conceder visibilidade. Falha de auditoria desfaz a operacao; replay legado
  ainda consulta o Historico antigo, sem reescrever ou remover esses registros.
- Sem pagamento: cancela titulo aberto/previsao e encerra o ciclo; preserva
  exclusao da solicitacao, valor original, anexos e log de exclusao.
- Com pagamento quitado: recupera a solicitacao original preservando setor,
  status, IDs e titulos. Retoma a prestacao, sem resetar rateios/decisoes existentes;
  cria somente o formulario se estiver ausente. Nao valida gastos automaticamente.
  Em solicitacao mista, encerra os cartoes nao pagos e recupera os pagos,
  com o tratamento de todos exibido antes da confirmacao.
- Prestacao/detalhe continuam com os usuarios ja autorizados pela regra normal.
  A resposta do POST revalida assertPodeVisualizarSolicitacao, inclusive no
  replay; link operacional so aparece se pode_abrir_solicitacao=true. Negativa
  ou indisponibilidade da ACL omite o link e nao concede acesso por outro caminho.
- Nao altera baixas, pagamentos, titulos pagos, saldo informado nem ajuste do
  cartao. Despesa continua vindo apenas dos gastos reais validados.
- Fila/envio bancario/autorizacao ativa, negociacao/cobranca protegida,
  prestacao em processamento ou inconsistencia financeira impedem a acao
  e orientam conferencia pelo Financeiro. Nenhuma integracao externa e
  cancelada por este endpoint. Titulo pago excluido nao e restaurado por ele.
- Rotas operacionais e anexos de solicitacoes ainda excluidas permanecem
  bloqueados; nao foi criado bypass global da exclusao. Prazo operacional da
  obra continua sendo conferido, sem excecao nova para esta operacao.
- Testes isolados: backend/scripts/validarRecargaRegularizacao.js e
  frontend/scripts/validarRecargaRegularizacaoUI.mjs, mais regressoes de saldo,
  multicartoes, medicao, exclusao/ACL e prazos. Sem nova migration.

## Consulta de cartao com solicitacao excluida - 2026-10-15

- Ausencia de recarga e resposta normal: sem alerta vermelho e sem bloqueio
  quando os demais campos/vinculos estiverem validos.
- Busca da ultima recarga ignora referencias a solicitacoes excluidas/ausentes
  somente se nao restar titulo aberto/previsao, pagamento sem prestacao validada
  ou referencia financeira quebrada. Nao altera titulos nem pagamentos.
- A mesma busca protege contexto e POST de criacao, com lock e desempate por
  ID. Recarga excluida encerrada nao encobre uma anterior ainda ativa.
- Exclusao com pendencia retorna contexto 200, bloqueado, sem dados da
  solicitacao excluida e com orientacao de regularizacao pelo GEO. Nao tenta
  abrir o detalhe excluido, que permanece protegido por 404/ACL.
- UI distingue sem historico, consulta em andamento, falha real, historico
  restrito e recarga anterior indisponivel. Falha nao libera criacao nem
  aparece como ausencia de historico; retry preserva os valores digitados.
- Testes isolados: validarRecargasMultiplosCartoes.js e
  frontend/scripts/validarRecargaContextoExcluidoUI.mjs. Sem nova migration.

## Saldo dos cartoes e prestacao pelos gastos reais - 2026-10-15

- Saldo calculado por cartao = baixas efetivas nao estornadas + ajustes auditados
  - despesas declaradas. Previsoes/pedidos ainda nao pagos nao creditam saldo.
- A interface distingue saldo antes dos gastos pendentes, gastos enviados/rejeitados
  ainda a conferir e saldo disponivel estimado. Nao consulta a operadora.
- Prestacao aceita gasto inferior a recarga e uso de sobra anterior. Rateios
  somam os gastos reais, nao o credito; motivo e documento obrigatorios para
  declarar ausencia de gastos. Documento continua obrigatorio nos demais casos.
- Envio reserva o gasto e libera a proxima solicitacao pela regra existente;
  so a validacao GEO libera custo. Rejeicao nao disponibiliza o mesmo gasto de
  novo; a correcao substitui exclusivamente a propria reserva.
- Cartao bloqueado em transacao, revisao do saldo no formulario e CAS de status
  protegem cliques/envios concorrentes. Excesso e saldo negativo sao bloqueados.
- GEO/SUPERADMIN pode ajustar o saldo disponivel real pelo detalhe da recarga,
  com motivo, extrato enviado pelo proprio usuario e chave idempotente. Ajuste
  nao altera titulos, pagamentos nem despesas/prestacoes antigas; trilha registra
  usuario, data, antes/depois e documento. Extrato utilizado nao pode ser removido.
- Cartoes existentes usam calculo historico, sem seed/backfill. Historico
  anteriormente inflado permanece preservado; GEO pode reconciliar o saldo,
  mas corrigir despesas antigas exige procedimento distinto e autorizacao.
- Apropriacao/Gestao de Obras, Resultado/Painel, Financeiro de Obras, DRE e
  Custos e Recebiveis usam gasto efetivo por destino. Sobra nao e custo. Fluxo
  de caixa/Contas a Pagar continuam mostrando a baixa integral da recarga.
  Financeiro de Obras e relatorio de custo, nao extrato bancario.
- Migration estrutural `202610150001_cartoes_recarga_saldo.js`: tres campos
  nullable de snapshot na prestacao e tabela imutavel de ajustes, sem reescrita
  de negocio. Aplicar com backup e preflight no ambiente autorizado antes do
  backend novo. Rollback automatico bloqueado para preservar auditoria.

Testes isolados: `validarRecargasMultiplosCartoes.js`,
`validarSaldoCartaoSchemaLimiteDp.js`, `validarFinanceiroObrasComprometido.js`,
`validarAdiantamentoFinanceiro.js`; UI `validarSaldoCartoesUI.mjs` e
`validarRecargasMultiplasUI.mjs`. Banco real/migration nao executados nesta entrega.

## Compra Direta: frete apos geracao do titulo - 2026-10-15

Salvar frete na gestao da Compra Direta sincroniza a obrigacao financeira na
mesma transacao: embutido ajusta somente o delta nos titulos abertos sem baixa;
havendo pagamento, cria complemento e preserva originais. Terceiro gera titulo
separado, com origem `COMPRA_DIRETA_FRETE`, sem duplicar na geracao inicial do
fornecedor. Complemento embutido usa `COMPRA_DIRETA_COMPLEMENTO`.

Nenhuma baixa, debito, envio a fila ou autorizacao e automatico. Titulos pagos
nao sao reescritos. Reducoes pagas e titulos protegidos por cobranca/integracao/
autorizacao exigem regularizacao no fluxo financeiro. Titulos novos devem ser
conferidos e classificados; frete a terceiro automatico nasce sem categoria e
fora da DRE ate classificacao pelo Financeiro. Se a solicitacao estava PAGA,
um novo titulo pendente muda para PARCIALMENTE PAGO, sem trocar setor.

A permissao `compras.compra_direta.gerenciar_frete` autoriza somente esse efeito
restrito na propria compra/obra, nao a edicao financeira geral. Detalhes,
locks, rateios e excecoes no [canonico de Compras](../compras/README.md) e no
[handoff](../../handoffs/2026-10-15-compra-direta-frete-financeiro.md).

## Fila: carteira de terceiros sem conta na massa - 2026-10-13

- Conta pagadora exigida somente para cheques proprios do conjunto. Terceiros
  usam a empresa do cheque cadastrado na carteira, sem debito bancario, inclusive
  em lote misto. Trocar a conta dos proprios nao limpa os cheques da carteira.
- Carteira legada sem empresa pede selecao explicita da empresa entre as opcoes
  ja presentes nas contas/cheques acessiveis da fila. Nao infere empresa da conta
  nem altera o cadastro legado. Empresa existente nao pode ser substituida.
- Backend resolve carteira/empresa sob lock; excecao de conta apenas no grupo
  interno validado. Pix, boleto, cartao, proprio e baixa individual conservam
  validacoes anteriores. Conta null no snapshot/movimento de terceiro; empresa
  e componentes preservados no grupo. Carteira consumida uma vez por documento.
- Sem nova migration ou mudanca de ACL. Testes locais backend/UI e build;
  homologacao integrada MySQL/EC2 continua separada. Detalhes no
  [handoff](../../handoffs/2026-10-13-fila-carteira-sem-conta.md).

## Fila: cabecalho unico da baixa em massa - 2026-10-13

- Forma de pagamento do lote vale para todos os titulos; nao existe mais
  Aplicar forma nem edicao individual de forma/instrumento dentro deste modal.
  As linhas sao somente conferencia de titulo, descricao e valor pago.
  Edicao individual continua na tabela da fila, fora da baixa em massa.
- Selecionar Cheque abre o editor do conjunto unico imediatamente, mesmo
  antes de selecionar conta. O editor permite escolher conta pagadora,
  quantidade e origem explicita de cada cheque (proprio/carteira).
  Conta pagadora se refere somente aos cheques proprios; empresa da carteira
  independe dela. O conjunto confirmado precisa ser reconferido apos trocar conta.
- Um cartao usa automaticamente sua conta vinculada; varios cartoes usam
  suas respectivas contas. Forma/instrumentos so alteram os rascunhos da fila
  na confirmacao da baixa. Cancelar nao aplica alteracoes nem registra pagamento.
- Preservados valores/encargos, ACL por titulo, soma em centavos, conjunto
  compartilhado sem duplicar documentos e estorno do grupo completo.
  Esta correcao nao cria migration nem modifica o motor financeiro.
- Testes locais de fila desktop/mobile, rateio/estorno, navegacao de pedido
  e build aprovados, sem banco/rede externos. Homologacao real continua separada.
  [Handoff](../../handoffs/2026-10-13-pedido-anexos-fila-cabecalho.md).

## Fila: origem explicita, instrumentos compartilhados e multicartao - 2026-10-13

- Escolher forma Cheque nao presume cheque proprio nem abre seu editor.
  Origem inicia vazia; escolher Proprio abre dados, Carteira mostra somente
  cheques disponiveis da empresa. Novas linhas de cheques tambem exigem origem.
  Dados de cheques ja confirmados continuam reconhecidos por compatibilidade.
- Modal em massa define forma/cartao no cabecalho para todos os selecionados.
  Tipos credito/debito filtrados pelo mesmo helper das linhas. Edicao por titulo
  continua disponivel somente fora do modal em massa.
- Selecionar Cheque no cabecalho abre o editor para um conjunto unico que
  paga o total do lote. Quantidade gera campos automaticamente; origem deve
  ser escolhida em cada linha. Terceiro precisa existir na carteira e seu
  valor integral e utilizado uma unica vez, mesmo pagando varios titulos.
- Mais de um cartao permite informar cartao e valor por parte, por titulo
  ou pelo total do lote. A soma deve fechar exatamente em centavos. Cada
  cartao usa sua conta vinculada; credito entra apenas com sua parte na
  fatura e debito registra a saida na respectiva conta. O titulo conserva
  seus vinculos anteriores, sem multiplicar a compra nas faturas.
- Backend aceita instrumentos_lote no endpoint existente de baixa em massa
  ou parcelas_cartao por item. Grupo exige chave de idempotencia, transacao,
  locks e validacao dos instrumentos; falha reverte todas as partes. Limites:
  200 titulos, 60 cheques, 20 cartoes e 1000 movimentos por grupo. Pagamento
  compartilhado acima do saldo ou parte sem principal positivo e recusado.
- Estornar uma linha de grupo estorna o conjunto inteiro, com aviso previo.
  Exige as permissoes/escopos existentes para todos os titulos; reabre a fila
  preservando historico/autorizacao valida e devolve terceiros uma unica vez.
  Fatura nao aberta ou cheque com processamento posterior bloqueia o grupo.
  Estorno individual de movimento pertencente ao grupo e bloqueado.
- Migration aditiva 202610130002_fila_liquidacao_rateada.js cria o grupo e
  referencia nullable no movimento, sem DML/backfill de registros de negocio.
  Foi preparada/testada em simulacao, NAO aplicada. Schema deve preceder o
  backend atualizado; frontend somente apos backend compativel. Nenhuma
  operacao na EC2, commit/push ou mudanca de visibilidade nesta tarefa.
- Testes isolados de rateio, servicos, faturas, estorno/ACL e UI desktop/mobile
  aprovados, incluindo navegacao e build. MySQL real, concorrencia entre
  processos e homologacao financeira em dev continuam como gate de deploy.
  [Handoff](../../handoffs/2026-10-13-fila-origem-instrumentos-massa.md).

## Fila: modal somente boletos da solicitacao - 2026-10-13

- Modal de arquivos da solicitacao lista apenas anexos ativos classificados
  como BOLETO, enviados pelo campo de boleto. Aceita multiplos PDF/imagens;
  nao infere origem por nome ou extensao. Sem boleto, exibe mensagem especifica.
- Backend filtra na consulta; frontend tambem filtra respostas antigas/mistas.
  Preservados ACL da fila, presign sob demanda, preview interno, download,
  foco e rolagem. Demais anexos continuam no detalhe da solicitacao;
  comprovantes de pagamento continuam nos botoes proprios da fila.
- Sem exclusao/reclassificacao de arquivos, migration, banco real ou deploy.
  Testes isolados de acesso, modal, fila desktop/mobile e build aprovados.
  [Handoff](../../handoffs/2026-10-13-fila-modal-somente-boletos.md).

## Fila: baixa em massa, desconto, cheques e estorno - 2026-10-13

- Baixa em massa abre modal de conta pagadora e data efetiva. Aplica esses
  dados aos selecionados (maximo 200), preservando valor/encargos por
  titulo. A forma efetivamente paga e unica no cabecalho do modal; trocar forma
  limpa instrumentos anteriores. A tabela da fila permite baixa individual.
  Cheques proprios/da carteira e seu parcelamento sao editaveis no mesmo
  fluxo, com quantidade de 1 a 60 e dados por cheque. A quantidade valida gera
  os campos automaticamente, sem aplicar/adicionar um a um; reducoes mantem
  os dados ocultados em memoria somente enquanto o modal estiver aberto.
  Apenas cheques visiveis/confirmados entram no payload. Exige conferencia final;
  cancelar o modal descarta suas alteracoes, sem registrar baixa. Cartao deve
  continuar compativel com a conta. Falha em uma linha reverte o lote inteiro.
- Coluna Desconto, inicialmente antes de Juros, aceita valor nao negativo.
  Total esperado = saldo + juros + multa - desconto. Principal liquidado =
  valor pago - juros - multa + desconto. Preferencias existentes recebem a
  coluna sem resetar a ordem; permanece configuravel/ocultavel. Regras proprias
  de adiantamento/devolucao continuam recusando desconto na baixa.
- Cheque aceita editor de 1 a 60 parcelas por titulo, misturando proprios e
  terceiros disponiveis da carteira. Soma exata em centavos; juros/multa/desconto
  rateados com residuo no ultimo cheque. Terceiro deve estar previamente
  cadastrado e seu valor e usado integralmente; a conta/empresa e disponibilidade
  sao novamente verificadas pelo fluxo existente. Link de cadastro somente
  para quem ja possui permissao. Nao gera novos titulos/autorizacoes; registra
  um movimento por cheque na mesma transacao. Repeticao no lote e bloqueada.
- Baixados inclui pagamentos registrados em pendencias resolvidas. Estornar
  baixa exige motivo e as permissoes existentes de resolver fila E estornar
  titulos; aplica a mesma ACL/escopo do estorno do titulo. Reverte os movimentos
  do pagamento completo, devolve terceiros a carteira e reabre o saldo na fila.
  Registro antigo fica resolvido, preservando movimentos/comprovantes/historico.
  Nao exige comprovante de pagamento ja estornado. Fatura aberta e recalculada;
  fatura com processamento posterior e baixa composta exigem reversao no fluxo
  proprio, sem bypass. Conciliacoes seguem a rotina existente de reabertura.
- Devolver para fila em Nao pagos preserva a autorizacao do mesmo ciclo:
  transfere somente o vinculo operacional, com evento auditado. Autorizacao
  revogada/substituida/pendente ou titulo bloqueado pelo DP impede o retorno.
  Fila direta/legada nao recebe aprovacao digital fabricada.
- Mutex de UI, payload estrito, chave de estorno, locks e transacao protegem
  contra duplo envio. Sem nova migration, mudanca de visibilidade, banco real
  ou deploy nesta implementacao. Testes locais isolados backend/UI desktop e
  celular, build e negativos de escopo aprovados; homologacao MySQL/EC2 e
  concorrencia entre processos ainda precisam de janela de staging.
  [Handoff](../../handoffs/2026-10-13-fila-baixa-cheques-estorno-desconto.md).
  Complemento de UI: [formas e cheques no modal](../../handoffs/2026-10-13-fila-massa-formas-cheques-modal.md).

## Motivo de ajuste nas autorizacoes - 2026-10-11

- Historico do detalhe mostra observacao de STATUS_ALTERADO (incluindo motivos
  digitais ja gravados), sem repetir descricao identica ou alterar o registro.
- A lista de lotes identifica SOL/TIT e resume motivos dos itens REJEITADO ou
  INVALIDADO. Coluna Motivo abre texto completo; fechar/Escape/fundo/voltar do
  navegador retorna ao lote, como a justificativa. Consulta nao decide pagamentos.
- Cada nova recusa grava seu motivo mesmo se outro titulo ja mudou o status
  da mesma solicitacao. Sem nova troca global registra evento proprio; motivos
  de medicao antiga nao sobrescrevem o fluxo da medicao mais recente.
- Sem migration/backfill: textos salvos passam a aparecer; motivos antigos
  ausentes do historico nao sao inventados nem regravados nesta alteracao.
  [Handoff](../../handoffs/2026-10-11-motivo-ajuste-autorizacao.md).

## Pix longo e dados da fila - 2026-10-11

- Copia e Cola aceita texto livre com limite operacional de 8192 caracteres.
  Campos sem seletor preservam o codigo; cadastros que inferem tipo reconhecem
  o prefixo 000201. CPF/CNPJ/telefone conservam suas validacoes especificas.
- Tres inputs de Compras (pedido, solicitacao e frete) ainda limitavam a chave
  a 255 no navegador; agora usam PIX_TEXTO_MAX = 8192, ja aceito pelo backend.
  Demais inputs Pix auditados nao tinham corte de 180/255; o RH ja usa 8192.
- Persistencia usa TEXT nas 12 colunas da migration existente
  202610090001_pix_copia_cola_texto.js. Conferir sua aplicacao em cada ambiente;
  a revisao local nao confirma schema/deploy de producao. Nenhuma nova migration.
- Na fila, dados acima de 120 caracteres ou com mais de duas linhas ganham
  Ver dados completos. Modal somente leitura, texto selecionavel, Copiar dados,
  fechamento por botao/Escape/fundo e preservacao de foco, rolagem, selecao e
  rascunho. Copiar dados copia a instrucao inteira exibida, nao extrai uma chave.
- Usa OverlayModal/useRolagemModal; sem endpoint, permissao de baixa nova,
  alteracao financeira ou consulta bancaria. Testes isolados Pix/backend/UI,
  fila/colunas/preview/baixa em massa e build. Handoff:
  [Pix e dados completos da fila](../../handoffs/2026-10-11-pix-dados-pagamento-fila.md).

## Adiantamento e forma de pagamento - 2026-10-11

O detalhe da solicitacao lista a forma de pagamento do proprio titulo,
inclusive na leitura resumida autorizada, sem ampliar dados bancarios.
A fila conserva a coluna Forma / instrumento existente.

ADIANTAMENTO nasce PAGAR/ABERTO com categoria definida pelo GEO antes do
pagamento, sem reconhecimento de custo antecipado. A conferencia aprovada
preenche valor_despesa_prestacao e rateios efetivos no titulo pago; nao gera
outro titulo de despesa. Sobra gera RECEBER/DEVOLUCAO_ADIANTAMENTO, nao DRE.
Caixa mantem o principal; DRE/obras/custos usam somente a despesa aprovada.
Pagamento 1000, despesa 800 e devolucao 200 resultam em custo 800.

Unicidade e decisoes usam transacao/bloqueios. Edicao de valor/status da
principal apos titulo, renegociacao, exclusao em massa e estorno original
apos envio da prestacao sao bloqueados. Homologacao MySQL real ainda pendente.
Detalhes: [handoff de adiantamento](../../handoffs/2026-10-11-adiantamento-centros-custo.md).

## Preview interno de arquivos da fila - 2026-10-11

- Visualizar PDFs e imagens (JPG/JPEG/PNG/GIF/WebP) na lista de arquivos abre
  um segundo modal, amplo e responsivo (ate 1200px). Reutiliza PreviewAnexoModal
  com dimensoes opcionais; os demais chamadores mantem dimensoes anteriores.
- Presign/acesso seguro e download existentes preservados; nao cria vinculos,
  nao altera pagamento e nao amplia permissoes. Formatos sem preview seguem
  abertura externa. SVG nao e embutido.
- Fechar/Escape retorna a lista de arquivos, com foco no botao e sem perder a
  rolagem da fila. Abertura concorrente e resposta atrasada apos fechar bloqueadas.
- PDF usa viewer nativo com selecao/copia de texto quando o documento permite.
  Nao ha OCR de imagem/PDF escaneado; suporte nativo pode variar por navegador.
- Teste: test:fila-instrumentos-ui inclui filaArquivosPreviewQA.mjs, com
  APIs/arquivos simulados e viewport desktop/mobile, sem banco real.
  Handoff: docs/handoffs/2026-10-11-fila-preview-arquivos.md.

## Colunas da fila por usuario - 2026-10-11

- O botao Colunas permite escolher as colunas visiveis e reordenar por arrasto
  no painel/cabecalho. Setas no painel atendem teclado e celular.
- Reutiliza preferencias do usuario no servidor, com espelho local e chave
  `financeiro-fila-pagamentos`, tipo `colunas`. Ordem/visibilidade sao recuperadas
  na sessao; Restaurar padrao nao apaga larguras ou filtros.
- Selecao, titulo e status/acoes permanecem visiveis. Ocultar/mover nao apaga
  valores digitados, nao altera permissoes e nao muda a elegibilidade de baixa.
  Erros de validacao revelam a coluna necessaria ao voltar para corrigir.
- Sem migration/backend novo. Teste: `test:fila-instrumentos-ui` e
  `backend/scripts/validarListaPreferencias.js` (APIs/banco reais nao utilizados).
  Handoff: `docs/handoffs/2026-10-11-fila-colunas-usuario.md`.

## Fila e comprovantes - 2026-10-11

- Coluna Obra/Centro de Custo usa o local do titulo (catalogo compartilhado),
  sem mudar rateios, empresa pagadora ou permissoes.
- Baixa em massa: selecao individual ou todos os pendentes da lista carregada,
  inclusive no filtro Todos. Limite existente da consulta: 500 entradas; nao
  inclui registros fora dos filtros, baixados, somente consulta ou em edicao DP.
  Divergencias continuam na autorizacao separada. Mesma validacao, transacao e
  idempotencia da baixa individual, comprovante opcional e encargos separados.
- Encargos atuais do titulo sao projetados para filas antigas pendentes sem baixa;
  pagamentos ja executados preservam snapshots. Encargos nao sao repetidos
  no saldo restante apos pagamento parcial. Edicoes manuais na fila continuam
  sendo enviadas explicitamente no payload e valores divergentes exigem motivo.
  Divergencias preservam os encargos informados na tentativa de baixa; edicao
  posterior do titulo usa a sincronizacao transacional ja existente.
- Modal de arquivos guarda a rolagem vertical/horizontal da pagina/tabela ao
  abrir e fechar (botao/Esc), sem alterar o comportamento global dos modais.
- Financeiro da solicitacao usa apenas um include da fila, sem filtro de ativos:
  alias duplicado no ORM preservava filtro que podia esconder filas baixadas.
  Principal e adicionais sao deduplicados por hash na apresentacao existente.
- Importacao pelo nome SOL-xxxx fica vinculada a solicitacao: arquivos ativos
  tambem aparecem na coluna, com prefixo Solicitação. Nao presume um vinculo
  individual ao titulo, nao registra nova baixa e nao muda conciliacao/historico.
- Diagnostico opt-in: `conferirComprovantesSolicitacao.js --somente-leitura`.
  Handoff: `docs/handoffs/2026-10-11-fila-local-massa-comprovantes.md`.

## Papel e propriedade

Financeiro e dono de titulos a pagar/receber, parcelas financeiras, movimentos, baixas, estornos, contas bancarias, categorias, conciliacao e calculos de previsto/realizado. Modulos de origem nao podem criar movimentos diretamente.

## Titulos

Tipos Pix incluem `COPIA_COLA` (rotulo **Copia e Cola**) nos cadastros,
criacao/edicao de titulo, preparar Pix da solicitacao, RH/DP e fretes. Aceita
texto livre ate 8192 caracteres, preservando caixa, simbolos e espacos internos;
apenas espacos nas extremidades sao removidos como nos campos existentes.
Nao validar esse texto como CPF/CNPJ/email/UUID nem corta-lo. Os tipos antigos
mantem as validacoes existentes. A fila manual usa o dado cadastrado; o lote
automatico BB atual por chave Pix rejeita Copia e Cola antes de gerar intents.

Migration `202610090001_pix_copia_cola_texto.js`: expansao de 12 colunas para
TEXT, preservando nulabilidade, dados e indice Pix com prefixo MySQL; nenhum
backfill ou mudanca de status. Aplicar antes de usar codigos longos. Cadastro
simplificado usa SHA-256 do texto em `pix_chave_canonica` apenas para este novo
tipo, preservando unicidade sem reduzir ou alterar o codigo armazenado.
Validacoes locais: `npm run test:pix-copia-cola` em backend e frontend.

- tipo obrigatorio `PAGAR` ou `RECEBER`;
- origem pode ser solicitacao, compra, comercial, RH/DP ou lancamento manual;
- parceiro, empresa, categoria, vencimento e valor devem ser consistentes;
- referencia de origem deve impedir titulo duplicado;
- status e saldo derivam dos movimentos ativos;
- edicao de titulo movimentado possui restricoes e auditoria.

## Recarga de cartao e envio independente

Novas recargas criam um titulo `ABERTO` por cartao, com a obra/centro de custo
da solicitacao como origem. Reabrir uma recarga ainda sem baixa preserva essa
origem e o estado aberto. A obrigacao a pagar e o movimento de caixa continuam
visiveis; nao sao custos apropriados antes da prestacao validada por cartao.
`considera_dre=false`, sem rateios financeiros, ate a validacao existente.

Resultado de Obras exclui a recarga do agregado direto; o custo entra somente
pelos rateios classificados da prestacao, sem somar a origem outra vez. Gestao
de Obras tambem nao usa a origem nem rateios da solicitacao como fallback de
custo antes dessa classificacao. O relatorio Financeiro Obras tambem exclui
recargas ainda sem essa classificacao, preservando filtros de obra, periodo e
busca. Pagamentos e anexos separados por cartao, status parcialmente pago/PAGA
e regras de prestacao permanecem existentes.

No card Financeiro dos detalhes, preparar autorizacao e enviar para fila sao
botoes separados. Cada permissao habilita apenas sua acao; a fila nao exige
permissao de preparar autorizacao, mesmo em PILOT/ENFORCED. A autorizacao
digital precisa estar disponivel, conforme regras do modulo. Selecoes e
destino sao congelados antes da confirmacao; trava e chave de idempotencia
sao compartilhadas com o modal de medicao e preservadas ao repetir uma falha.

## Juros e multa na edicao e na fila

Juros e multa sao valores em reais, nao percentuais. Na edicao do titulo ficam
em campos distintos e o total previsto e o valor liquido/base mais esses dois
encargos. O principal, os impostos e os rateios nao sao capitalizados pelos
encargos. Na Fila de Pagamentos ha uma coluna para cada encargo; o valor pago
e o desembolso total. A baixa abate apenas o principal do saldo e grava juros
e multa separadamente no movimento financeiro existente.

Exemplo: saldo de R$ 200,00, juros de R$ 10,00 e multa de R$ 3,00 esperam
pagamento de R$ 213,00, sem divergencia. Valor pago acima/abaixo desse total
continua seguindo o fluxo de divergencia justificada. Cartao de credito
continua exigindo quitacao integral, e sua fatura inclui os encargos efetivos.
Cheque de terceiro cobre o desembolso total, nao somente o principal.

Salvar uma edicao sincroniza saldo, vencimento e encargos com itens ativos da
fila ainda sem movimento, na mesma transacao (lock titulo antes de fila).
Nao altera pagamentos anteriores, comprovantes, valor pago informado, motivo
ou status de divergencia. Corrigir um titulo divergente nao autoriza sua baixa
automaticamente: a aprovacao existente permanece obrigatoria. Titulos ja
movimentados continuam sujeitos aos bloqueios de edicao anteriores.

Atualizar a tela busca o saldo/encargos novos, preservando valores de pagamento
digitados manualmente. Encargos configurados no titulo so sao copiados na
entrada/reabertura sem baixa anterior, evitando repeti-los numa segunda baixa
parcial. O dossie digital inclui encargos nao zerados no total e na revalidacao
material; titulos sem encargos mantem o formato/hash legado.

Reutiliza as rotas/permissoes de edicao de titulos, registro de baixas e
aprovacao de divergencias; nenhuma permissao nova. Requer aplicar a migration
estrutural `202610080002_fila_pagamentos_juros_multa.js` antes de iniciar o
backend atualizado. Adiciona `juros`/`multa` DECIMAL(14,2), default zero, em
`titulos_financeiros` e `pagamentos_manuais_fila`, sem DML/backfill. Os dados
ficam separados para evolucao dos relatorios; layouts de relatorios nao foram
alterados nesta entrega.

Validacoes isoladas no backend: `test:fila-juros-multa`,
`test:fila-instrumentos`, `test:fila-comprovante-pendente`.
No frontend: `test:fila-instrumentos-ui`, `test:titulo-juros-multa-ui` e build.
Os testes UI usam a pagina real com APIs simuladas, em desktop/mobile.

## Relatorio PDF de titulos

O botao Gerar relatorio em Contas a Pagar gera somente os titulos selecionados
quando ha selecao. Sem selecao, gera todos os titulos dos filtros aplicados,
incluindo todas as paginas da consulta. O botao indica a quantidade selecionada.
Ambos os casos preservam os filtros e o escopo financeiro autorizado.

Sem selecao, usa `GET /financeiro/titulos/relatorio.pdf`. Com selecao, usa `POST`
na mesma rota, com `titulo_ids` no JSON e os filtros na query. A permissao
continua sendo `financeiro.titulos.exportar`. O POST aceita ate 5000 IDs e nao
altera registros. Se algum titulo selecionado nao estiver mais disponivel nos
filtros ou no acesso atual, retorna erro e pede nova selecao; nunca gera todos
os filtrados como alternativa silenciosa. O bloqueio operacional de obras
mantem esse POST disponivel como consulta, sem liberar escritas. O controle
diario de caixa permanece inalterado para GET e POST.

A coluna Solicitacao fica imediatamente apos Titulo e mostra
`solicitacao.codigo` (por exemplo, `SOL-6240`), nunca o ID interno. Sem codigo
vinculado, mostra `-`. O renderer compartilhado de Contas a Receber segue a mesma
ordem. Totais, datas e filtros permanecem inalterados.

Validacao isolada: `npm run test:relatorio-titulos-solicitacao` no backend.
Selecao, filtros e acesso: `npm run test:relatorio-titulos-selecao` no backend;
handler, botao e HTTP reais com APIs simuladas: comando de mesmo nome no frontend,
com Playwright e Chrome disponiveis.
Nao requer migration ou nova permissao.

## Cartao na geracao pela solicitacao

Na aba Financeiro dos detalhes da solicitacao, o cartao utilizado e opcional
para as formas Cartao de Credito e Cartao de Debito. Sem cartao informado,
o titulo nasce em `ABERTO`, sem baixa, movimento, fatura ou quitacao automatica.
Com cartao informado, continuam as validacoes de atividade, tipo e conta
pagadora e a quitacao automatica existente (credito com fatura ou debito).
A escolha explicita de `PREVISAO` preserva o comportamento de previsao.

A baixa posterior pelo Financeiro exige informar o cartao efetivamente
utilizado e registra o pagamento no titulo original. Parcelamento, datas,
rateios, empresa e permissoes existentes permanecem inalterados. Esta
dispensa pertence somente ao servico `criarTituloPorSolicitacao`, chamado
por `POST /solicitacoes/:id/gerar-conta` com `financeiro.titulos.criar`;
nao e flag de payload e nao dispensa cartao no lancamento manual nem na baixa.
Nao requer nova permissao, variavel ou migration.

Validacao sem banco: `npm run test:cartao-opcional-solicitacao` no backend.
Formulario real com APIs simuladas: `npm run test:cartao-opcional-solicitacao-ui`
no frontend, com Playwright e Chrome disponiveis.

## Recargas de cartoes

Uma solicitacao de recarga pode conter varios cartoes. Cada cartao gera seu
proprio titulo PAGAR em PREVISAO, com fornecedor, empresa e categoria do
cadastro do cartao. A liberacao da solicitacao abre todos os titulos ainda em
previsao; baixa e prestacao de contas continuam separadas por cartao.

O status agregado fica `PARCIALMENTE PAGO` enquanto houver cartao com valor
pendente e muda para `PAGA` quando todos estiverem integralmente pagos. A
regra anterior de recarga parcial permanece: a baixa encerra o titulo pelo
valor efetivamente pago e registra o valor nao recarregado no ciclo; esse caso
mantem o agregado parcial. Estornos nao foram ampliados nesta entrega e devem
seguir as restricoes financeiras existentes.

A primeira baixa nao retira do Financeiro uma solicitacao com outros cartoes
aguardando pagamento. Quando todos os ciclos estiverem pagos ou cancelados,
o retorno ocorre para OBRA ou, em Centro de Custo, para o setor criador.
Prestacao validada grava somente os rateios do titulo daquele cartao e libera
sua classificacao de custo. Repetir a sincronizacao sem nova baixa nao desfaz
o status ATENDIDO/APROVADA da prestacao.

Configuracao, documentos e escopo:
[Recarga de cartoes por origem](../solicitacoes/README.md#recarga-de-cartoes-por-obra-e-centro-de-custo).
Implementacao: `recargaCartaoService` e `solicitacaoFinanceiroStatusService`.
Validacao sem banco: `npm run test:recargas-multiplas` no backend.

## Importacao em massa de contas a pagar

A importacao em massa esta implementada no repositorio e depende da migration `202607200001_financeiro_titulos_importacao.js` no ambiente de destino. O fluxo e exclusivo para `PAGAR`: o usuario exporta o modelo versionado em Contas a Pagar, envia o `.xlsx`, revisa o preview persistido e confirma a criacao atomica.

- permissao especifica `financeiro.titulos.importar`;
- `empresa_codigo` + `obra_codigo` identificam a obra pela referencia operacional conhecida pelo usuario; `apropriacao_codigo`, quando informado, identifica a apropriacao dentro dessa obra; o backend resolve os IDs internos e deriva da obra a empresa e a DRE do titulo;
- `credor_cpf_cnpj` identifica o parceiro pelo documento visivel na tela, com ou sem mascara, e `categoria_nome` usa o nome exibido no cadastro;
- o modelo de importacao nao expoe IDs internos de obra, credor, categoria ou apropriacao e bloqueia referencias inexistentes, ambiguas, inativas ou fora do escopo;
- o credor e global e pode representar colaborador cadastrado em outra empresa;
- em Contas a Pagar, o filtro de credor pesquisa todos os parceiros ativos do cadastro central, incluindo credores e fornecedores de Compras ja vinculados; a lupa abre a listagem completa com busca por nome ou CPF/CNPJ e rolagem responsiva;
- o modelo `1.4` separa as referencias em `EMPRESAS`, `OBRAS`, `APROPRIACOES`, `CREDORES`, `CATEGORIAS`, `FORMAS_PAGAMENTO` e `DOMINIOS`, todas com filtro e pesquisa do Excel; `CREDORES` informa se o favorecido bancario/PIX esta pronto;
- as listas suspensas usam essas abas, mas a planilha representa um retrato dos cadastros no momento da exportacao; para incluir referencias criadas depois, o usuario deve exportar um novo modelo;
- referencias sao revalidadas no preview e na confirmacao;
- parcelas, rateios e impostos usam abas relacionadas por `chave_importacao`;
- formulas, macros, linhas ocultas e colunas ocultas com dados sao rejeitadas;
- confirmacao exige `Idempotency-Key`, bloqueio transacional e rollback integral em erro;
- titulos recebem origem `IMPORTACAO` e nao criam baixas, movimentos, intents, faturas ou vinculos operacionais.

Detalhes tecnicos e cenarios de aceite estao em [`PLANO_IMPORTACAO_TITULOS_PAGAR.md`](./PLANO_IMPORTACAO_TITULOS_PAGAR.md).

## Baixa e estorno

- baixa pode ser parcial ou total;
- a baixa em massa lista somente formas ativas de `financeiro_formas_pagamento` e grava
  `forma_pagamento_id` no movimento, preservando `forma_recebimento` como classificacao
  tecnica retrocompativel;
- o tipo cadastrado dirige as regras existentes: `CARTAO_CREDITO` e `CARTAO_DEBITO`
  executam a regra `CARTAO`; formas como `FOPAG` podem permanecer distintas no cadastro
  e executar a regra `TRANSFERENCIA`;
- movimentos legados sem `forma_pagamento_id` continuam validos e as APIs antigas ainda
  podem enviar apenas a classificacao tecnica aceita;
- exige conta, data, valor base e ajustes de juros, multa ou desconto;
- transacao bloqueia pagamento acima do saldo;
- estorno marca o movimento como `ESTORNADO` e recalcula o titulo;
- estorno nunca remove a trilha;
- nova baixa depois do estorno e uma nova operacao auditada;
- comprovantes e conciliacoes vinculados precisam ser revistos.

## Fila manual de pagamentos

### Desvincular previsao antes de corrigir o titulo (2026-10-16)

No detalhe do titulo, **Desvincular previsao de cartao** exige a mesma permissao
`financeiro.titulos.editar` e a ACL de edicao/leitura do titulo. O motivo e
obrigatorio. A API `POST /financeiro/titulos/:id/desvincular-fatura` exige a
fatura esperada e uma chave de idempotencia; o titulo e travado antes da
revalidacao e inclusive antes de qualquer replay.

Somente PAGAR/ABERTO, com saldo e sem baixa, fatura ABERTA e vinculo consistente
podem ser desvinculados. Fila ativa (inclusive NAO_PAGO/DIVERGENTE/EM_EDICAO),
autorizacao pendente/autorizada e pagamento bancario ativo impedem a operacao.
Titulos compartilhados, renegociados, RH/DP, recargas e adiantamentos permanecem nos seus
fluxos especializados. Bloqueio de retorno da Obra tambem e respeitado.

A mesma transacao remove apenas o vinculo previsto desse titulo, limpa
cartao/fatura, recalcula a fatura e grava o motivo/estado anterior/autor.
Nao modifica valor, vencimento, quantidade de parcelas, status ou saldo, nao
gera baixa nem apaga faturas, anexos, movimentos ou historicos existentes.
Fatura paga, fechada, parcial, conciliada ou com PAGAMENTO_FATURA ativo bloqueia
a acao. Outros titulos da fatura sao preservados; fatura zerada nao e apagada.

A trilha duravel utiliza `LogExclusao`, entidade propria
`TITULO_DESVINCULACAO_FATURA`, sem `solicitacao_id`. O evento financeiro
`FINANCIAL_TITLE_CARD_FORECAST_UNLINKED` aparece uma unica vez na auditoria
existente do titulo, respeitando `financeiro.titulos.auditoria.visualizar`.
Mesmo apos a retencao dos logs de seguranca, o recibo duravel conserva motivo,
estado anterior e replay. Nao se cria Historico/autoria/interacao da solicitacao,
pois isso poderia ampliar visibilidade. Retorno e auditoria nao expoem valores
de outros titulos da fatura.

Depois de desvincular, o usuario pode **Editar titulo** para corrigir valor e
vencimento. Para trocar a quantidade de parcelas, deve desvincular todos os
titulos incorretos, exclui-los logicamente pelo fluxo existente (permissao
`financeiro.titulos.excluir`) e gerar a distribuicao correta na solicitacao
(permissao de criar titulos). Conferir o total antes de pagar. Nao existe
reparcelamento silencioso de um titulo nem reparo automatico da SOL-6104.

UI preserva motivo/chave ao alternar abas e em erro, bloqueia duplo envio e
so atualiza apos resposta da API. Validacoes: `test:titulo-desvincular-fatura`
no backend e `test:titulo-desvincular-fatura-ui` no frontend. Nenhuma migration
nova; homologacao real em DEV deve anteceder publicacao em producao.

### Forma prevista e forma efetiva (2026-10-16)

A forma cadastrada no titulo permanece como previsao. Na fila, o usuario com a
permissao de baixa informa a forma efetiva (cartao, Pix, transferencia, dinheiro
ou outra forma ativa), conta, data e instrumento exigido. O movimento e o
snapshot da fila registram essa escolha, sem reescrever a forma prevista.

Titulos legados ABERTO vinculados a fatura podem entrar na fila somente se o
titulo nao tiver baixa/movimento ativo e a fatura existir, estiver ABERTA, sem
pagamento, conciliacao ou movimento ativo de PAGAMENTO_FATURA. Cartao, campo de
fatura e tabela de vinculos devem concordar. A verificacao e repetida na baixa.
Enviar para a fila nao desfaz vinculos nem registra pagamentos.

Na baixa efetiva, a mesma transacao remove apenas o vinculo previsto desse
titulo, limpa seu cartao/fatura e recalcula a fatura antiga. A baixa canonica
registra o instrumento efetivo; se for credito, associa a compra a uma fatura
aberta do cartao escolhido. Outros titulos da fatura antiga sao preservados;
uma fatura que ficar zerada nao e apagada. A compra pode quitar o fornecedor
sem quitar a fatura. Os pagamentos da fatura continuam em seu proprio fluxo.

Auditoria transacional `MANUAL_PAYMENT_CARD_FORECAST_CORRECTED` preserva ator,
fila, previsao anterior e instrumento efetivo. A fila tambem guarda a previsao
em `instrumento_pagamento_json.previsao_cartao_anterior`. Falha na baixa,
recalculo ou auditoria reverte tudo. Divergencia acima do saldo so corrige o
vinculo quando a baixa for realmente autorizada. Replay nao duplica correcao.

Permissoes, visibilidade, governanca do proprietario, encargos e estornos nao
foram ampliados. Titulos quitados, com baixa anterior ou fatura fechada/parcial/
paga nao sao liberados por esta correcao. A criacao que ja registra uma compra
efetiva no cartao mantem sua baixa automatica existente; nao volta para a fila.
Valores e parcelamentos incorretos (inclusive SOL-6104) nao sao reparados
automaticamente por enviar/baixar. Nenhuma migration nova e necessaria.

Validacao isolada: `npm run test:fila-previsao-cartao` no backend e
`node scripts/validarFilaInstrumentosUI.mjs --previsao-cartao` no frontend.
Homologar banco/transacoes reais somente em DEV antes de promover.

A Fila de Pagamentos separa a preparacao da carteira da execucao no banco. Em Contas a Pagar, quem possui `financeiro.fila_pagamentos.preparar` seleciona titulos abertos e os encaminha para a fila; o operador pode ter acesso somente a essa tela pelas permissoes do grupo `financeiro.fila_pagamentos`.

- a tela operacional e uma tabela responsiva com rolagem horizontal, sem modal de baixa;
- cada linha mostra titulo, credor/favorecido, documento, PIX ou codigo do boleto, vencimento, saldo e forma de pagamento;
- o operador informa a forma efetiva, data da baixa, conta pagadora e valor pago; a empresa e derivada da conta e as regras existentes de caixa e intercompany continuam aplicadas;
- valor exato registra baixa total, valor menor registra baixa parcial e cria alerta de divergencia, valor maior nao baixa e permanece divergente;
- `NAO_PAGO` mantem o titulo aberto e exige motivo;
- a grade de Contas a Pagar mostra na propria linha os estados `Em fila de pagamento`, `Pagamento nao realizado` e `Pagamento divergente`;
- previsao de pagamento por cartao pode entrar na fila: o instrumento efetivo e informado ao registrar a baixa. Credito quita o titulo e vincula a compra a uma fatura aberta; debito usa a conta vinculada. Um vinculo anterior so pode ser corrigido nas condicoes de seguranca abaixo, sem segunda baixa;
- credito exige quitacao integral sem baixa anterior, pois a fatura soma o valor integral do titulo. Cartao, conta e forma devem ser compativeis;
- cheque proprio registra numero, emitente e demais dados do documento. Cheque de terceiro consome um cheque disponivel da carteira, com valor exato e empresa compativel, sem duplicar saida bancaria;
- rejeicoes atuais do proprietario aparecem em Nao pagos com motivo, somente para consulta; nao viram pagamentos executaveis nem permitem reabrir pela fila;
- o lote usa uma unica transacao e locks por titulo/item: se uma linha falhar, nenhuma baixa do lote e confirmada;
- uma chave de idempotencia protege criacao e processamento contra clique ou envio repetido.

Na tabela, trocar a forma de pagamento limpa a conta pagadora, que volta a
Selecione. Escolher um cartao continua preenchendo sua conta vinculada.
Cheque proprio usa modal com os campos compartilhados: Confirmar aplica os
dados ao rascunho da linha; Cancelar/Escape descartam somente a edicao do
modal, sem efetuar baixa. O botao de editar reabre os dados confirmados.
Cheque de terceiro continua sendo selecionado da carteira por empresa.
Acoes de abrir solicitacao/arquivos, consultar e anexar comprovantes usam
icones com tooltip e nomes acessiveis, preservando rotas e permissoes.

Permissoes independentes: `visualizar`, `preparar`, `baixar`, `reportar` e `resolver`. Elas nao liberam as demais telas do Financeiro.

Autorizadores nominais com `financeiro.autorizacoes_pagamento.decidir` podem revogar itens ou todas as autorizacoes de um lote, com motivo e passkey. A revogacao retira as entradas ativas da fila e retorna os itens a pendentes, preservando comprovantes, dossie e eventos. Baixa parcial/total, movimento financeiro registrado, pagamento bancario ativo ou ciclo mais recente impedem a operacao. Nao e um estorno.

A migration `202610080001_fila_pagamentos_instrumento.js` adiciona o instrumento efetivo na fila e a revisao da autorizacao no lote. Deve ser aplicada antes do backend atualizado. Nao insere cadastros ou pagamentos e nao deve ter suas colunas removidas depois do uso.

### Baixa com comprovante posterior

Registrar a baixa de um item pendente nao exige PDF. Conta, data, valor,
instrumento e justificativa de divergencia continuam obrigatorios conforme
as regras existentes. A baixa registra o movimento e atualiza o titulo e a
solicitacao pelo fluxo financeiro normal; faltar comprovante nao deixa o
pagamento aberto nem cria outro movimento.

O card Pendentes de comprovante fica imediatamente apos Pendentes. E um
recorte virtual `PENDENTE_COMPROVANTE`, nao um status gravado no banco:
lista itens BAIXADO, DIVERGENTE ou RESOLVIDO com movimento registrado e sem
hash/URL do primeiro PDF. O card pode sobrepor Baixados ou Divergentes;
os numeros nao devem ser somados como categorias exclusivas. Divergencia
acima do saldo sem movimento nao entra nessa pendencia. Uma baixa parcial
continua sendo divergente e aparece tambem na pendencia de comprovante.

O usuario pode anexar o primeiro PDF depois da baixa, pela linha com
`financeiro.fila_pagamentos.baixar` ou pela importacao com
`financeiro.fila_pagamentos.importar_comprovantes`. Esses caminhos gravam
somente o anexo: nao mudam valor, data, conta, instrumento, saldo, fatura ou
movimento ja registrado. O importador identifica o valor pago para itens
baixados, em vez de mostrar apenas o saldo zerado. Locks, hash de arquivo
e revalidacao do estado impedem vinculos repetidos; rejeicoes somente
consulta nao recebem anexos nem nova baixa. Consultar a fila continua
exigindo `financeiro.fila_pagamentos.visualizar`.

Anexar o comprovante retira o item desse recorte, sem remover o historico.
O PDF tambem e vinculado ao historico e aos anexos da solicitacao do titulo,
reutilizando a URL permanente no S3. Isso ocorre na transacao da baixa
quando o comprovante ja existe, ou na transacao de upload/importacao tardia.
Cada arquivo tem uma entrada `COMPROVANTE_ADICIONADO`, com IDs da fila,
titulo e movimento. Baixa parcial tambem recebe comprovante; divergencia
sem movimento so publica o arquivo quando a baixa for de fato autorizada.
Titulos sem solicitacao continuam somente na fila. Replay nao duplica
historico/anexo nem ressuscita arquivos removidos.

Registros antigos nao recebem backfill durante o deploy. O script
`backend/scripts/reconciliarHistoricoComprovantesFila.js` prepara conferencia
somente leitura por padrao, em lotes de ate 100 itens. A aplicacao separada
exige IDs revisados, hash da conferencia, superadmin ativo e opt-in
`ALLOW_PAYMENT_RECEIPT_HISTORY_RECONCILIATION=true`. Revalida sob locks e
registra auditoria na mesma transacao; nao altera valores, saldos, status,
datas ou movimentos. A execucao de escrita precisa de autorizacao propria.

Reabrir uma divergencia cria outro ciclo para o saldo, preservando o
pagamento e eventual pendencia de comprovante do ciclo anterior. A aprovacao
de baixa divergente acima do saldo continua exigindo comprovante; esta
entrega dispensa PDF apenas no registro regular dos itens pendentes.

Nao requer migration, variavel ou permissao nova. Testes sem banco:
`npm run test:fila-instrumentos` e `npm run test:fila-comprovante-pendente`
no backend; `npm run test:fila-instrumentos-ui` no frontend (Chrome/Playwright,
APIs simuladas). Homologar PDF real e baixa no ambiente dev antes de producao.

### Analise do proprietario e envio independente

Solicitar autorizacao exige `financeiro.autorizacoes_pagamento.preparar`.
Enviar para pagamento exige somente `financeiro.fila_pagamentos.preparar`,
em OFF, PILOT, ENFORCED e PAUSED. As permissoes sao independentes: quem
possui ambas ve os dois botoes. O envio direto usa a confirmacao habitual,
sem declaracao de autorizacao em papel ou permissao adicional. A auditoria
registra o responsavel pelo envio, sem simular assinatura do proprietario.

O status interno nativo `EM ANÁLISE DO PROPRIETÁRIO` pode ser aplicado
individualmente ou em massa com `financeiro.titulos.status_interno`.
Preparar um dossie digital aplica o mesmo status e atualiza as solicitacoes
vinculadas, sem mudar o setor, saldo ou status financeiro. Analise nao
significa autorizacao nem baixa. O ingresso efetivo na fila muda o status
interno para `ENVIADO PARA PAGAMENTO` e encaminha a solicitacao ao Financeiro.
Rejeicao ou invalidacao digital sinaliza ajuste; estados finais sao preservados.

A camada digital usa PWA, passkey, dossie isolado, segregacao entre preparador
e autorizador, revalidacao material e reuso transacional da fila atual.
Dossie ativo nao impede o envio direto pela permissao da fila. Os dois
caminhos reutilizam a entrada ativa do titulo, sem duplicar fila, baixa ou
comprovantes. Na mesma transacao do envio, o item do dossie recebe
`ENFILEIRADO` e `fila_item_id`; a auditoria distingue `ENVIO_DIRETO` de
`AUTORIZACAO_DIGITAL`, sem atribuir uma decisao por passkey ao envio direto.
Lotes com pendencias continuam `AGUARDANDO`; sem pendencias nem itens
autorizados por enfileirar, ficam `CONCLUIDO` quando existe item na fila.

A tela de autorizacoes mostra `Na fila de pagamento` e a referencia da fila.
Atualiza pelo botao Atualizar, ao retornar a janela e a cada 30 segundos
enquanto visivel e sem operacao em andamento. A atualizacao preserva as
desmarcacoes dos itens ainda pendentes e descarta respostas antigas. O aviso
do envio direto informa quantos titulos foram criados, ja estavam na fila
ou ja foram processados no replay da mesma chave, sem anunciar novo envio.

Validacoes isoladas: `npm run test:fila-autorizacao-convergencia` no backend
e `npm run test:fila-autorizacao-convergencia-ui` no frontend (Playwright e
Chrome). Nao requer migration, variavel ou permissao nova.
O contrato, configuracoes e limites estao em
[`AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md`](./AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md).

Em OFF ou PAUSED, o botao de solicitar autorizacao permanece visivel para
quem tem a permissao, mas desabilitado. A marcacao manual de analise e o
envio direto continuam disponiveis pelas suas proprias permissoes. Este
ajuste nao exige migration, variavel nova ou seed de status em producao.

### Consulta dos lotes de autorizacao

Os lotes novos recebem `LOTE-<id>` na mesma transacao da criacao, usando o ID
auto-incrementado, sem contador paralelo ou `MAX+1`. Replay conserva o lote;
rollback pode deixar lacunas naturais na sequencia. A tela tambem usa esse
rotulo para legados, sem reescrever seus codigos, documentos ou hashes. Data,
criador e codigo persistido ficam acessiveis em Registro do lote.

No PWA instalado (standalone Android ou iOS), um autorizador nominal com
`enabled` e `can_decide` entra diretamente nas autorizacoes, tanto apos login
como ao acessar Inicio. O preparo de MFA continua prioritario. Navegador
comum e usuarios somente preparadores conservam a preferencia de tela inicial.
Somente essa rota usa o shell compacto: Conta mantem tema, perfil, notificacoes,
busca, modulos e saida; Opcoes mantem avisos e passkey. Sem passkey, o cadastro
fica visivel e a assinatura continua bloqueada. Dispositivos ficam recolhidos.
Guardas operacionais e auditoria continuam ativos; nenhuma permissao mudou.
Validar com `test:tela-inicial`, `test:autorizacao-pwa` e a suite da fila.

Lotes nao expiram operacionalmente: pendencias continuam aguardando decisao,
inclusive lotes antigos cujo `expira_em` esteja no passado. Esse campo e o TTL
de lote permanecem apenas como metadados de compatibilidade, sem migration ou
atualizacao em massa. A passkey continua exigindo um challenge valido de cinco
minutos, de uso unico; saldo, documentos, hash e elegibilidade sao revalidados.

A tabela destaca o codigo SOL e mantem TIT como referencia secundaria (ou
principal para titulo avulso). JUSTIFICATIVA fica apos STATUS e antes de
MOTIVO. Titulos de Solicitacao
de Compra e Compra Direta mostram somente o tipo no resumo, nao seus itens;
snapshots, documentos e descricoes originais nao sao alterados. A lista mostra
data de criacao em vez de expiracao. Mobile preserva as colunas por rolagem.

A lista limita os 100 lotes mais recentes, nao seus itens ou documentos. A
associacao do titulo e opcional e preserva o filtro de exclusao logica: quando
o titulo deixa de existir na consulta, o item e seu snapshot continuam no
historico. Isso evita uma juncao invalida na subquery paginada do Sequelize.
Lista e detalhe mantem as permissoes e regras de decisao existentes.

A justificativa e o texto atual da solicitacao de origem, consultado somente
para leitura pelo proprio endpoint de lotes, inclusive nos lotes antigos.
Nao usa a descricao do titulo nem revela itens de compra como alternativa.
Sem justificativa/origem disponivel, mostra `-`. Nao altera snapshots,
hashes, documentos, assinaturas, revisoes, status ou elegibilidade.

O trecho clicavel abre um modal com o texto integral e quebras de linha, sem
interpretar HTML. Fechar, Escape, clique no fundo e voltar do navegador/PWA
retornam a lista no mesmo lote e preservam a selecao. A entrada de historico
e temporaria na mesma rota; link direto sem historico fecha por substituicao
da query, sem sair da tela. O modal compartilhado nao muda o comportamento
de clique fora para seus outros consumidores.

Atualizar faz somente consultas e preserva lote/selecao ainda disponiveis.
O controle de sequencia ignora respostas antigas; nao prepara, autoriza ou
reenvia pagamentos. Revisao com `test:fila-autorizacao-convergencia-ui` e
`test:autorizacao-pwa` no frontend, com APIs simuladas. A consulta SQL real
simulada valida LEFT JOIN da solicitacao sem perder titulos avulsos/historico.

Validacao isolada com gerador SQL MySQL e hidratacao reais do Sequelize:
`npm run test:autorizacao-consulta-sql` no backend, tambem incluido em
`test:fila-instrumentos`. O transporte de banco e simulado, sem conexao ou
escrita. Nao requer migration ou mudanca de configuracao.

## Cheques de terceiros e baixa com multiplas fontes

Cheques recebidos de terceiros sao controlados em carteira de custodia, sem simular uma conta bancaria. O financeiro pode registrar/importar saldo legado, transferir a custodia entre empresas, depositar em conta da mesma empresa ou utilizar o cheque integralmente como um componente de uma baixa composta.

A baixa composta permite combinar Pix, transferencia, dinheiro, cartao e cheque conforme as formas ativas cadastradas, distribuindo cada fonte entre titulos `PAGAR` do mesmo credor e empresa. Preview, confirmacao e estorno sao atomicos, idempotentes e auditados. A baixa simples e a baixa em massa anteriores continuam disponiveis.

Regras, endpoints, permissoes e limites: [`CARTEIRA_CHEQUES_BAIXA_COMPOSTA.md`](./CARTEIRA_CHEQUES_BAIXA_COMPOSTA.md). Matriz operacional: [`MATRIZ_SMOKE_CHEQUES_BAIXA_COMPOSTA.md`](./MATRIZ_SMOKE_CHEQUES_BAIXA_COMPOSTA.md).

## Relatorios

- previsto: titulos `PREVISAO`, `ABERTO` ou `PARCIAL`, conforme periodo e data de corte;
- realizado: movimentos ativos;
- movimentos estornados nao compoem realizado;
- DRE por competencia e fluxo de caixa por movimento nao podem usar a mesma data sem regra explicita;
- Resultado de Obras deve refletir estorno imediatamente;
- toda agregacao deve permitir rastrear o lancamento de origem.

### Fluxo de caixa previsto x realizado

- historico planejado preserva o valor original do titulo para datas ja alcancadas;
- projecao futura usa o saldo ainda aberto e nao repete titulo quitado;
- realizado usa `data_movimento` e nunca trata data futura como baixa;
- comparativo limita previsto e realizado a mesma data de corte;
- datas futuras do realizado aparecem como indisponiveis, nao como zero acumulado;
- seletor oferece periodos historicos, atuais, futuros e intervalo personalizado;
- nas visoes por natureza, entradas sao verdes e saidas vermelhas; no comparativo,
  as cores distinguem previsto e realizado.

## Contrato de venda recebido por cheque

Quando a forma efetiva do contrato de venda e cheque, o titulo a receber deve nascer
quitado e o cheque permanece em carteira/custodia. A quitacao e o cadastro do cheque
sao atomicos e idempotentes. Devolucao do cheque reabre a obrigacao vinculada, sem
apagar a baixa ou a trilha anterior; os novos cheques podem compor nova baixa conforme
as regras da baixa composta.

## Conciliacao OFX

OFX serve para conferencia. Importacao bloqueia arquivo/transacao duplicada, sugere candidatos e exige confirmacao humana. Nao cria titulo nem baixa automaticamente.

Na conciliacao de transferencias, o sinal do OFX define o sentido financeiro: debito na conta atual significa conta atual para contraparte; credito significa contraparte para conta atual. Quando existir um unico lancamento pendente na outra conta, com mesma data e valor exatamente oposto, o sistema preseleciona a conta e vincula os dois OFX a uma unica transferencia. Empates permanecem manuais para evitar associacao indevida.

Conciliacoes podem ser estornadas pelo relatorio de Conciliacao bancaria quando o usuario possui `financeiro.conciliacao.estornar`. O fluxo reabre o lancamento OFX para conferencia manual e registra o motivo na auditoria. Transferencias sao canceladas, tarifas criadas pela conciliacao sao estornadas e vinculos com titulos, faturas ou movimentos preexistentes sao desfeitos sem apagar o registro financeiro original. O relatorio aceita filtros por periodo, conta, status, natureza, tipo de vinculo e texto do extrato.

Liberacoes e amortizacoes de credito rotativo sao registradas diretamente a partir do lancamento OFX pendente. Nao existe cadastro de linha de credito nesta fase: credito na conta gera `LIBERACAO_CREDITO_ROTATIVO` e debito gera `AMORTIZACAO_CREDITO_ROTATIVO`, sempre com valor e data derivados do extrato. Esses movimentos alteram o caixa, compoem o saldo de endividamento e aparecem nos relatorios de movimentacao, conciliacao e endividamento, mas nao recebem categoria financeira e nao compoem a DRE. O estorno devolve o OFX para `PENDENTE` e retira o movimento ativo dos saldos e relatorios.

Quando o banco credita a devolucao de uma tarifa ja registrada, o usuario usa `Acoes rapidas > Estorno de tarifa bancaria`. O sistema lista somente tarifas ativas da mesma conta, empresa e valor integral, com data igual ou anterior ao credito. A confirmacao cria `ESTORNO_TARIFA_BANCARIA` vinculado ao movimento original, reaproveita a categoria financeira e neutraliza caixa e DRE sem apagar nenhum dos dois registros. Uma tarifa nao pode receber dois estornos ativos; se houver mais de uma candidata, a escolha permanece manual e auditavel.

## Dependencias e risco

Recebe dimensoes de Parceiros, Empresas, Obras e Apropriacoes; recebe origens de Solicitacoes, Compras, Comercial e RH/DP; alimenta Obras, Provisionamento, Boletos, relatorios e Governanca. Qualquer mudanca em saldo, status ou movimento exige reconciliacao de todos esses consumidores.

## Idempotencia

Geracao de titulo, baixa, estorno, importacao OFX e conciliacao sao transacionais e protegidos contra repeticao. O frontend bloqueia duplo clique e o backend garante unicidade e estado valido.

## Fila: filtros e recebimento do DP (2026-10-15)

- Filtros combinaveis: origem RH/DP (folha/pagamento e Ticket) ou outras origens,
  empresa do titulo, credor e recebimento DP. Os filtros estruturados entram no
  SQL antes do limite de 500 e nos totais por situacao; a busca textual mantem
  seu comportamento anterior sobre a lista. O catalogo minimo vem de titulos da
  propria fila/situacao, sem liberar cadastro geral de empresas ou parceiros.
- No DP, empresa do titulo e a empresa do colaborador registrada na geracao,
  nao a empresa pagadora. Colunas distintas de empresa do colaborador,
  recebimento DP e empresa pagadora evitam confundir as duas dimensoes.
- Recebimento DP: conta salario, Pix, dinheiro, outra conta ou nao informado.
  Reflete a referencia/snapshot do titulo no pedido, nunca o cadastro atual.
  Referencias novas conservam modo explicitamente no JSON ja existente.
  Legados usam a linha de origem vinculada pelo id do titulo/pedido e empresa
  do vale; em revisao nao inferem modo de uma linha ainda nao reenviada.
  Sem origem suficiente, fica nao informado, sem adivinhar salario/outra conta.
- GET apenas projeta; nao executa backfill, migration ou reescrita de pagamentos.
  O recebimento solicitado nao escolhe nem registra automaticamente a baixa.
- Filtros ficam na URL/workspace, limpam a selecao para a baixa e preservam os
  campos em rascunho. Colunas novas usam o mesmo painel/ordem/largura da fila.
- Mesmas permissoes de leitura, baixa, comprovante e visibilidade anteriores.
  Validar com test:fila-filtros-dp e validarFilaInstrumentosUI.mjs --filtros-dp.

## PWA: datas, rejeicao do saldo em fila e observacoes - 2026-10-18

- Pacote para homologacao na refactor/frontend, sem deploy em producao. A
  rejeicao em fila depende da migration estrutural
  `202610180002_bloqueio_pagamento_proprietario.js`, coluna JSON nullable, sem
  backfill ou alteracao dos valores antigos. Aplicacao deve ocorrer no DEV
  com backup e identidade conferidos, antes de iniciar a nova versao backend.
- Datas no painel por obra usam edicao posicional opt-in do DateInputBR:
  DD/MM/AAAA, ano de quatro digitos, sem deslocar mes/ano ao editar dia.
  Dois vencimentos validos e ordenados aplicam os filtros com debounce de
  600 ms. Fim primeiro e datas parciais nao enviam um intervalo invalido.
  Outros consumidores do componente conservam o modo anterior.
- Selecao segue global por titulo entre paginas/obras. Total e limpeza ficam
  junto ao nome da obra. Na lista e no detalhe, a barra tem Anterior,
  Rejeitar, Autorizar e Proxima; navegar nao decide. Motivo abre sob demanda.
- Apenas pendentes podem ser autorizados. Autorizados/enfileirados com saldo
  aberto ou parcial podem ter o saldo rejeitado, com motivo e passkey nominal.
  Selecao mista e separada por lote/tipo de decisao em confirmacoes distintas.
  Permissoes, limites nominais, challenge/revisao e bloqueio de Testar usuario
  continuam vigentes; nao foi concedida permissao a usuario algum.
- `REJEITAR_FILA` termina o item em REJEITADO, encerra filas abertas como
  RESOLVIDO e grava bloqueio duravel no titulo, com evento atomico. Preserva
  valores pagos, movimentos, comprovantes, assinatura e historico originais.
  Em parcial bloqueia SOMENTE o saldo; nao faz estorno. Banco em andamento,
  revisao DP, ciclo mais recente ou titulo sem saldo impedem a operacao.
- O bloqueio vale tambem em PILOT/OFF para envio direto, baixa normal/OFX,
  baixa em massa e validacoes bancarias, via policy e hooks ORM. Nao pode
  transformar a divida bloqueada em novos titulos pela negociacao. Ajuste
  legitimo da medicao pode corrigir o valor, mas conserva o bloqueio.
- Para liberar: preparar NOVO ciclo de autorizacao do saldo e autorizar com
  passkey. Preparar/editar/reenviar diretamente nao libera. Nova autorizacao
  valida remove o bloqueio com evento SALDO_REAUTORIZADO. A funcao REVOGAR
  legada permanece separada e continua proibindo revogacao de baixas parciais.
- Modal de criacao na solicitacao: Observacoes do titulo junto ao Total das
  formas. Nota comum acompanha formas e parcelas sem perder instrucoes
  existentes; limite combinado validado antes de salvar favorecidos. Em
  multiplos favorecidos, instrucoes bancarias continuam do snapshot servidor.
  Coluna Observacoes aparece apos Titulo/documento na fila e no painel de
  colunas, com expansao de textos longos e preservacao de preferencias antigas.
- Testes locais: backend `test:pwa-rejeicao-fila`; frontend
  `test:pwa-rejeicao-datas` e `test:fila-instrumentos-ui`. Simulam modelos,
  banco, biometria e APIs; nao substituem homologacao com MySQL/passkey no DEV.

## PWA: periodo, situacao atual e envios diretos - 2026-10-18

- Implementacao local para posterior publicacao/homologacao na refactor/frontend;
  sem nova migration. Depende do schema existente (incluindo 202610180002).
- Antes das datas, escolher Vencimento (padrao anterior), Emissao do titulo ou
  Pagamento/baixa. Sem limites de data: todo o periodo do universo do painel.
  Limpar ambas as datas tambem autoaplica; texto parcial/invalido nao consulta.
  Inicio/fim isolado valido pode ser aplicado explicitamente. Datas nao mudam
  o estado financeiro: os filtros de situacao mostram o estado ATUAL do titulo.
- Pagamento usa movimentos BAIXA/ATIVO por data_movimento, inclusive parciais.
  O total e valor_quitacao realmente pago no periodo, com juros/multa/desconto;
  exclui movimentos estornados. Varios pagamentos de um titulo nao duplicam sua
  contagem. Rateios/compartilhados distribuem os centavos entre obras, sem
  multiplicar o total. O detalhe preserva a mesma base de data ao revalidar.
- Uma linha por titulo: ultimo item digital e ultima fila. Quem nunca teve item
  digital tambem aparece pela fila direta, com autor/data do envio (nao da baixa).
  Na fila corresponde a PENDENTE/EM_EDICAO; DIVERGENTE tem filtro proprio;
  NAO_PAGO consulta a ultima tentativa. Saldo parcial conserva o badge parcial e
  pode pertencer ao filtro da tentativa/Na fila. Bloqueados nao voltam a Na fila.
- Envio direto nao cria lote, snapshot assinado ou aprovacao ficticia. Identidade
  negativa existe somente na leitura/cursor; item_id digital continua positivo.
  Dados atuais minimos, sem liberar anexos genericos/conversas ou dados bancarios.
  Documentos digitais existentes permanecem sob as permissoes/origens anteriores.
- Saldo direto pode ser rejeitado com motivo e passkey do autorizador nominal.
  Contrato/challenge separado, hash de titulos/filas/versoes/motivo, consumo
  atomico Redis GETDEL (Redis 6.2+), locks canonicos, revalidacao e auditoria
  SecurityEventLog obrigatoria na mesma transacao. Se indisponivel, nao decide.
  Grupo direto: maximo50; selecao mista pede confirmacoes separadas do digital.
- Rejeitar direto encerra filas abertas em RESOLVIDO e bloqueia apenas o saldo,
  preservando pagamentos/comprovantes/status financeiro. Sem estorno. Revisao
  DP, banco ativo, saldo quitado ou novo ciclo impedem rejeicao obsoleta. Nova
  autorizacao digital REAL e valida e necessaria para liberar (item anterior0).
  OFF/PAUSED/Testar usuario nao autorizam nova rejeicao; ACL nao foi ampliada.
- Consulta agrega os ultimos IDs por titulo uma vez; nao usa subquery correlata
  por ciclo nem varre movimentos quando a base escolhida nao e pagamento.
- Testes: backend `test:pwa-periodo-fila-direta`, `test:pwa-rejeicao-fila`;
  frontend `test:autorizacoes-obras`. SQLite em memoria executa CTE real com
  JSON_ARRAYAGG adaptado; nao substitui o plano MySQL real. O operador pode usar
  `node scripts/verificarPainelAutorizacoesDev.js --verificar`, somente SELECT/
  EXPLAIN com identidade DEV, para tres bases de data e cursores digitais/diretos.
  Nao operar producao para homologar este pacote.

- Publicacao/homologacao DEV: roteiro `ops/deploy/atualizar-dev-pwa-periodo-20261018.sh`
  recebe SHA completo publicado, valida caminho/branch/PM2/watch/UUID/schema e
  sessao12h, confere MySQL e Redis antes de reiniciar somente backend-dev.
  `verificarRedisPasskeyDev.js --verificar` inspeciona suporte GETDEL com
  COMMAND INFO e RP/origens HTTPS; nao altera nenhuma chave/configuracao.
  Biometria/passkey real deve ser testada manualmente no PWA DEV, com usuario
  nominal, nunca Testar usuario. Roteiro nao aplica migration nem promove main.

- Promocao main do pacote957ebf85 homologado: roteiro separado
  `ops/deploy/atualizar-producao-pwa-periodo-20261018.sh` exige backup/timer,
  identidade/TLS/PM2/schema produtivos e zero alteracao funcional do pacote.
  `verificarPwaPeriodoProducao.js --verificar` e somente leitura, inclusive
  inspecao Redis/RP/origens. Sem novas migrations ou mudanca de flags/.env;
  restart somente backend-solicitacoes, sem --update-env. DEV nao e alterado.

## Cancelamento de titulo individual

- No detalhe do titulo, em Dados do titulo, a acao Cancelar titulo exige motivo
  e confirmacao. Aplica CANCELADO e saldo zero, sem excluir registro/anexos,
  alterar valores originais, registrar baixa ou estornar pagamentos.
- Nova chave `financeiro.titulos.cancelar`; operadores precisam de concessao
  explicita. Acesso de setor, editar ou excluir nao substitui essa chave.
  ACL e todas as obras do rateio sao revalidadas tambem no replay.
- Pagamentos, fila/autorizacao ativa, cartao/fatura, cobranca, conciliacao,
  integracao e fluxos especializados bloqueiam a acao; regularizar na origem.
  Compartilhados continuam usando o cancelamento integral do lote existente.
- Historico permanente guarda motivo/data/responsavel e recibo idempotente na
  trilha financeira ja existente, sem criar autoria de solicitacao. Exibicao
  no detalhe e auditoria financeira, mesmo apos retencao do log de seguranca.
- Sem migration nova. Testes `test:titulo-cancelamento` em backend e frontend.
  Handoff: `docs/handoffs/2026-10-19-cancelamento-titulo-financeiro.md`.

## Parcelamento do cartao na baixa (19/10/2026)

- Na fila e no modal Registrar baixa do titulo a pagar, selecionar credito e
  cartao, informar data real da compra/quantidade (1 a 60) e valor efetivo.
  Ver parcelas abre o OverlayModal amplo do sistema, apenas para conferencia.
  Voltar/Fechar/Escape mantem o preenchimento e nao registra baixa. Registrar
  baixa/Confirmar baixa continuam sendo as acoes de efetivacao e usam as mesmas
  permissoes atuais. Debito nao oferece parcelamento mensal nas faturas.
  A configuracao da forma efetiva que desabilita parcelas continua respeitada.
  Mudanca de fechamento/vencimento desde a consulta exige atualizar e conferir
  a previa novamente, sem lancamento silencioso em outra competencia.
- Cada baixa gera um movimento no titulo. As parcelas, com divisao exata dos
  centavos e encargos/desconto, alimentam as faturas mensais conforme fechamento
  e vencimento do cartao. Nao cria novos titulos, nao repete a despesa, nao altera
  vencimento/valor original do titulo nem registra saida da conta bancaria real
  antes de pagar a fatura. A conta de controle do cartao segue a regra existente.
- Mais de um cartao pode ter parcelamentos independentes. A liquidacao e o
  estorno do grupo continuam atomicos e com as protecoes/permissoes existentes.
  Baixa em massa preserva a configuracao comum/de cada cartao do lote; a previa
  soma os centavos das alocacoes de cada titulo, como as faturas efetivas.
  A restricao atual de credito integral/sem baixa anterior da fila foi mantida;
  no detalhe, a baixa parcial conserva o saldo do titulo e parcela somente o
  valor efetivo registrado. Nao amplia o fluxo de Multiplas Fontes para credito.
- Todas as faturas sao revalidadas com locks na confirmacao; fatura fechada,
  paga, conciliada ou com pagamento ativo bloqueia a operacao inteira. Estorno
  confere todas as parcelas/faturas antes de qualquer alteracao e preserva as
  alocacoes como ESTORNADA. Historico do titulo e detalhe da fatura mostram as
  parcelas; pagamentos de fatura nao baixam o titulo novamente.
- Integracao legada continua disponivel sem o campo novo. Um titulo com
  parcelas ativas nao pode voltar a vincular seu valor integral a outra fatura.
  Previsao antiga no detalhe precisa do fluxo existente de regularizacao antes
  de mudar o parcelamento; na fila a previsao e revalidada/corrigida atomicamente.
  Nenhum valor, parcela ou pagamento da SOL-6104 e corrigido automaticamente.
- Migration estrutural/idempotente: 202610190001_cartao_parcelamento_baixa.js.
  Cria financeiro_cartao_baixa_parcelas com FKs/indices e adiciona chave/hash
  de idempotencia nullable ao movimento. Nao possui backfill ou mudanca de dados
  antigos. O roteiro DEV anterior nao aplica esta migration; usar o novo
  `ops/deploy/atualizar-dev-cartao-parcelamento-20261019.sh` com SHA publicado
  e `--backup-dev-conferido`, somente depois de conferir backup do banco DEV.
  Confere host/UUID/porta/processo/watch/sessao/flags, atualiza por fast-forward,
  testa e autoriza exclusivamente esta migration; outra pendencia interrompe.
  A flag de schema fica apenas no processo de migration, nunca no .env/PM2.
  Reinicia somente backend-dev, sem importar variaveis do terminal.
- `backend/scripts/verificarCartaoParcelamentoMySqlDev.js --verificar` executa
  SELECT/EXPLAIN com transacao READ ONLY, limite de tempo e rollback final.
  Confere colunas, FKs, indices, alocacoes por movimento/fatura/titulo e soma
  das parcelas contra o valor da baixa, sem criar titulos ou pagamentos. Sem
  amostra, aprova schema/SQL mas nao substitui teste humano de baixa/estorno.
  Pode repetir apos homologacao, a partir de backend no checkout DEV.
- `backend/scripts/validarDeployCartaoParcelamentoDev.js` testa os guardas e
  caminhos de falha/repeticao com fixtures, sem conexao externa ou deploy.
- Testes: npm run test:cartao-parcelamento-baixa em backend/frontend. Banco e
  transporte isolados, calendario comparado entre frontend/backend em UTC/BR/NZ.
  Homologacao em MySQL DEV e operacao manual com cartao real ainda necessarias
  apos publicar/aplicar schema. Nunca testar essas escritas em producao.

## Pacote DEV financeiro/compras de 19/10/2026

- Inclui multiplas fontes na fila, cancelamento e compras em Centros de Custo
  pelas telas proprias, sem mudar o tipo fixo da Nova Solicitacao.
- Roteiro `ops/deploy/atualizar-dev-financeiro-20261019.sh` recebe SHA publicado,
  verifica identidade DEV/PM2/watch/schema/sessao, executa testes isolados e
  consultas SELECT/EXPLAIN de permutas em MySQL DEV, e reinicia so backend-dev.
  Nao aplica migration nem altera flags/configuracoes. Erro interrompe o fluxo.
- Frontend publicado pelo fluxo da branch na Vercel; nao construir frontend
  nem modificar Nginx na EC2 para este pacote. Homologar com usuarios reais DEV.

## Sobreposicoes, historico e resumo da solicitacao - 2026-10-19

- O card financeiro separa obrigacoes vigentes de titulos CANCELADO/ESTORNADO e
  originais RENEGOCIADO. Uma projecao de negociacao continua representando a
  participacao vigente, com seu original em historico e parcelas atuais
  expansivas abaixo da tabela. Nao oculta saldo ativo por suspeita de duplicidade.
- Indicadores: quantidade de obrigacoes, valor vigente, principal liquidado
  (inclui desconto, nao e apenas caixa) e saldo a pagar/receber. Participacoes
  compartilhadas permanecem restritas a solicitacao. Dados de outras origens
  nao sao acrescentados ao DTO operacional da Obra.
- Geracao por pedido e lote consulta titulos diretos sem vinculo conhecido em
  pedido/alocacao/frete. Avulsos, inclusive quitados ou renegociados sem esse
  vinculo, exigem revisao antes de gerar outra obrigacao. Pedidos distintos com
  vinculo conhecido nao sao bloqueados apenas por pertencerem a mesma solicitacao.
- A geracao individual de PAGAR nao contorna pedidos de compra. Compra Direta
  validada pelo servidor conserva seu fluxo especifico de fornecedor/frete.
  Confirmacao do lote revalida disponibilidade sob transacao; replay continua
  usando a chave e o hash existentes. Nao cancela registros automaticamente.
- Original renegociado projetado e participacao compartilhada nao sao enviados
  como um titulo integral para autorizacao/fila. As parcelas vigentes continuam
  acessiveis pelo detalhe conforme permissoes financeiras existentes.
- Cancelamento auditado existente aceita referencia opcional `substituicao`:
  `{ tipo: 'NEGOCIACAO' | 'LOTE_COMPARTILHADO', id: inteiro_positivo }`.
  O backend verifica parcelas validas, mesma solicitacao e mesmo credor sob
  bloqueio. Nao comprova identidade comercial: documentos devem ser conferidos.
  Mantem permissao `financeiro.titulos.cancelar`, escopo, versao, idempotencia,
  bloqueios de fila/banco/contrato/integracoes e auditoria permanente em LogExclusao.
  Nao apaga titulos, anexos, valores originais ou movimentos; nao gera pagamento.
- A referencia aparece no detalhe cancelado e no historico do card. Nao ha
  migration, seed, endpoint novo nem regularizacao automatica na inicializacao.

### Simulacao offline

A rotina abaixo le apenas arquivos locais e escreve um NOVO diretorio. Nao
importa models/env/driver SQL e nao possui modo de aplicar no banco:

```powershell
node backend/scripts/simularRegularizacaoTitulos.js --extracao outputs/analise-titulos-solicitacoes-20261019/extracao --saida outputs/simulacao-regularizacao-titulos-NOVA
```

O caso preparado propoe cancelar TIT-010200 com referencia ao lote 1 e
TIT-003948/003949/003950 com referencia a negociacao 3. Reducao simulada:
R$ 9.870,00. Fontes, negociacoes, baixas e participacoes nao sao alteradas.
A extracao nao contem todos os bloqueadores do cancelamento: uma operacao
real futura deve revalidar integralmente os vinculos e a identidade comercial.
Nao executar por atualizacao de codigo, deploy ou aprovacao desta simulacao.

Testes sem banco: `validarSobreposicaoTitulos.js`, `validarTitulosCompartilhados.js`,
`validarTituloCancelamento.js`, `validarTituloRenegociacaoVinculos.js`,
`validarTituloRenegociacaoSincronizacao.js`, `validarPedidoBoletoOpcional.js` e
`validarCompraDiretaFreteFinanceiro.js` em backend/scripts; resumo e UI real do
card/cancelamento em frontend/scripts, alem de build e teste de documentacao.
