# Modulo CONTRATOS

## Download de arquivo da medicao - 2026-10-24

- O botao Baixar pede novo link autorizado/assinado com attachment e nome UTF8.
  O arquivo S3 e entregue por navegacao, sem fetch ou dependencia do CORS do bucket.
- Preview continua separado e inline. Sem mudanca de permissoes de consulta,
  aprovacao, rejeicao, pagamentos ou historico. Uploads locais passam pela mesma
  verificacao de acesso e mantem download autenticado no dominio da API.
- Bloqueio sincrono de clique repetido, botao disabled durante preparo e mensagem
  de erro sem URL/token cru. Detalhes em ../../seguranca/anexos.md.
- Backend deve suportar download=1 ANTES de liberar o frontend novo: atualizar
  backend DEV e depois liberar a versao Vercel DEV correspondente. Sem migration.

## Reenviar parcela de medicao rejeitada - 2026-10-23

- Corrige o conflito do indice antigo `medicao_parcelas_unico`: a mesma
  solicitacao/parcela agora pode ter varios eventos historicos devolvidos,
  mas apenas um vinculo ativo global por parcela, inclusive entre solicitacoes.
- Migration `202610230002_medicao_vinculos_ativos.js` troca o indice em um unico
  ALTER por unicidade ativa e identidade do evento, preservando tambem a
  identidade legada sem medicao_id e o suporte das FKs. Nao altera/apaga
  linhas antigas, valores, pagamentos, anexos ou o recibo de rejeicao.
- A guarda do servico, transacao/lock do contrato, ACL e sequencial da nova
  medicao continuam intactos. Historico devolvido nao volta a comprometer saldo.
- Preflight somente leitura recusa ativas/eventos duplicados, schema divergente
  ou engine/versao nao suportados, sem corrigir dados automaticamente. ALTER
  utiliza COPY; planejar janela de DEV, pois pode bloquear escritas na tabela.
- Registro informa conflito409 em vez de apenas Validation error; log seguro
  guarda operacao/IDs/indice conhecido, sem SQL, chave PIX ou valores de erro.
- Testes, limite do ambiente local e homologacao no
  [handoff](../../handoffs/2026-10-23-medicao-reenvio-vinculo-ativo.md).

## Medicao pendente: rejeicao e favorecido - 2026-10-23

- No detalhe da solicitacao, Financeiro > Medicao N, GEO autorizado/SUPERADMIN
  pode corrigir o favorecido e seus dados antes da aprovacao, ou rejeitar com
  motivo e confirmacao. Novas permissoes nominais independentes:
  `contratos.medicao.editar_pagamento` e `contratos.medicao.rejeitar`.
  O backend revalida escopo do contrato/obra, acesso/interacao da solicitacao
  e todas as operacoes financeiras; nao ha concessao automatica a perfis comuns.
- Rejeitar cancela as previsoes originais da medicao e libera seus vinculos
  de comprometimento na mesma transacao. Titulos, medicoes, numeros, anexos e
  historicos anteriores permanecem. Novas previsoes substituem as canceladas
  nas mesmas parcelas, SEM baixa, acrescimo contratual ou parcela adicional.
  Assim outra medicao pode ser solicitada inclusive no limite de24parcelas.
- A solicitacao volta a OBRA, resolvida por capacidade, se nao houver outra
  medicao pendente. A rejeitada nao governa mais o ciclo atual, e nao pode ser
  aprovada/editada depois. Nova medicao recebe novo numero e novos dados de
  pagamento; nao reutiliza a instrucao cancelada.
- Medicao aprovada, previsao alterada/negociada, baixa, fila/autorizacao ativa,
  remessa/boleto/cartao/cheque/conciliacao e demais vinculos especializados
  impedem a operacao; regularizar primeiro, sem desfazer pagamentos aqui.
- Edicao de uma parte favorecida preserva valores/divisao; a primeira tambem
  atualiza os dados principais da medicao. Mudar recebedor limpa a chave/dados
  antigos na UI e exige nova conferencia. Credor e forma prevista nao mudam.
- Migration aditiva nao aplicada pelo agente, testes e roteiro de homologacao
  no [handoff](../../handoffs/2026-10-23-medicao-rejeicao-favorecido.md).

## Valor medido e valor autorizado para pagamento - 2026-10-16

No Financeiro da solicitacao, abrir uma medicao estruturada aprovada e usar
`Ajustar valor para pagamento`. Exige GEO com permissoes nominais
`contratos.medicao.editar_valor` e `financeiro.titulos.editar`, ou SUPERADMIN;
escopos de Contratos/Financeiro e acesso ao titulo sao revalidados no backend.
Nao cria permissao ou amplia visibilidade. A leitura requer acesso financeiro.

- Informar valor positivo menor que o titulo, motivo e destino obrigatorio:
  `Pagamento futuro` cria titulo PREVISAO da diferenca, vinculado a origem;
  `Abatimento definitivo` registra a reducao sem criar divida futura.
- Medicao, parcela medida e saldo contratual para novas medicoes nao mudam.
  O financeiro mostra Medido, Valor dos titulos, Diferenca futura e Abatimento.
  Abatimento reduz o saldo financeiro, mas nunca aparece como valor pago.
- Dossie anterior fica INVALIDADO com eventos e snapshots preservados; entrada
  nao processada da fila e encerrada sem baixa. Reenviar explicitamente pelo
  ciclo atual de autorizacao/fila; aprovacao informal nao vira decisao digital.
- A diferenca futura exige `Liberar diferenca futura` e motivo, depois novo
  envio normal. Pode ser liberada apos quitar o titulo original sem altera-lo.
- Baixados/parciais, movimento ativo ou pagamento bancario em andamento sao
  protegidos. Titulos compartilhados/negociados, de outro fluxo, com encargos,
  retencoes ou cobranca bancaria emitida exigem regularizacao especifica.
  Fatura de cartao exige consentimento expresso e nao pode estar paga.
- Conferir/reemitir boleto apos reduzir o principal. Documentos e comprovantes
  antigos nao sao apagados nem convertidos para o novo valor automaticamente.
- Operacao transacional, revisao otimista, lock de titulo, chave idempotente e
  recibo permanente. Edicao generica/renegociacao nao substitui esse fluxo.

Pacote de homologacao DEV. Migration estrutural aditiva
`202610160002_medicao_pagamento_autorizado.js` (JSON nullable e FK indexada)
precisa ser aplicada no DEV antes do backend novo; sem backfill ou escrita em
dados existentes. Nao aplicar em producao nesta etapa. Testes isolados:
`npm run test:medicao-valor-pagamento` em backend e frontend. O helper
`node scripts/aplicarMigrationMedicaoPagamentoDev.js --verificar` permite
preflight somente leitura com a migration pendente; `--aplicar` exige
`CONFIRM_DEV_BACKUP=SIM`, banco/checkout/processo DEV corretos e nenhuma outra
pendencia. Nao persiste flags. Teste: `npm run test:deploy-medicao-pagamento-dev`.
Handoff:
`docs/handoffs/2026-10-16-medicao-valor-autorizado.md`.

## Papel

Contratos mantem o contexto contratual operacional, seus vinculos, referencias e arquivos. Contrato operacional nao e titulo financeiro e nao se confunde com contrato de venda do modulo Comercial.

## Regras

- contratos podem ser vinculados a parceiro, obra e solicitacoes;
- referencias de contrato so aparecem quando o modulo estiver habilitado;
- desabilitar o modulo remove exigencias de interface e validacao, mas nao apaga dados existentes;
- anexos usam armazenamento privado e autorizacao do contrato;
- alteracao ou encerramento nao pode apagar historico nem invalidar silenciosamente solicitacoes existentes;
- exclusao deve ser logica quando houver qualquer vinculo.

## Representante legal e limite juridico

No cadastro geral de Pessoas, credores e fornecedores, nome e CPF do
representante legal sao opcionais. Para novas solicitacoes de contrato,
qualificacao e exigida somente quando o valor ultrapassa o limite juridico
configurado. Valor igual ao limite nao exige qualificacao. A regra usa o
limite vigente, nao um valor fixo de R$ 50 mil, e e revalidada pelo backend.
Nome, CPF valido e demais dados da qualificacao obrigatoria permanecem no
fluxo contratual, separados do cadastro geral. Contratos legados sem essa
fotografia nao se tornam retroativamente invalidos.

## Fluxos coexistentes

### Legado

- cada medicao pode existir como solicitacao propria;
- `solicitacoes.contrato_id` e a referencia confiavel quando preenchida;
- titulos e movimentos financeiros prevalecem sobre inferencia por texto ou comprovante;
- status historico `PAGA` e apenas fallback auditavel quando nao existe fonte financeira melhor.

### Novo

- parcelas, medicoes e titulos usam vinculos explicitos;
- contrato nasce sem realizado e so gera obrigacao no ponto definido pelo fluxo;
- medicao respeita saldo, vigencia, parcelas ja medidas e titulos movimentados;
- edicao/redistribuicao nunca pode reduzir silenciosamente valor ja pago.

## Gestao operacional

### Reprogramar saldo sem parcela

Na Nova Solicitacao de Medicao, selecionar contrato ativo do fluxo novo com saldo
nao comprometido e sem parcela que o represente habilita Reprogramar saldo.
O usuario da Obra com acesso ao contrato e permissao de criar solicitacoes nao
precisa de Editar contratos. SUPERADMIN e usuarios autorizados a editar contratos
tambem podem executar a acao, respeitando modulo e escopo de obras.

Informar quantidade, valores, vencimentos e justificativa. A soma precisa fechar
exatamente o saldo disponivel, descontando parcelas livres ja existentes; respeita
o limite atual de 24 parcelas do contrato. Cria apenas novas parcelas e titulos
PREVISAO, vinculados a solicitacao do contrato e suas apropriacoes. Depois, selecionar
a nova parcela para medir pelo fluxo normal, com aprovacao antes de liberar pagamento.

Nao aumenta valor/aditivos nem altera medicoes, parcelas pagas, baixas ou a referencia
prevista das parcelas anteriores. Contrato encerrado, legado ou sem categoria/solicitacao
nao aceita a operacao. Lock/transacao, referencia de saldo e replay persistente no
historico impedem duplicacao e gravacao parcial. Sem migration ou backfill.

Endpoints GET/POST `/contratos/:id/saldo-reprogramacao`; validacoes locais:
`node backend/scripts/validarContratoSaldoReprogramacao.js` e, no frontend,
`node scripts/validarContratoSaldoReprogramacaoUI.mjs`. MySQL real sera homologado
em dev; o agente nao executou operacoes de negocio em banco real.

A listagem usa `Contratado`, `Saldo` e `Aditivos`. O status e calculado em consulta:

- `ATIVO`: parcialmente medido ou ainda com saldo operacional;
- `TOTALMENTE_MEDIDO`: valor contratado integralmente medido;
- `CONCLUIDO`: ciclo encerrado conforme as regras vigentes;
- `RESCINDIDO`: rescisao registrada com motivo, usuario, data e saldo cancelado.

O detalhe reune medicoes, solicitacoes, titulos, valores movimentados, saldo contratual
e saldo financeiro.

## Marcacao manual de totalmente medido

GEO com a permissao existente de editar contratos e SUPERADMIN podem marcar ou
desfazer **Totalmente medido**, tanto no contrato novo quanto no legado, na gestao
ou na solicitacao vinculada. Motivo obrigatorio, autor/data/revisao e auditoria
atomica em ambos os fluxos. Recibo duravel em LogExclusao, entidade propria e
solicitacao_id nulo, complementado por SecurityEventLog. Nao cria autoria ou
interacao na solicitacao-mae, preservando suas regras de visibilidade.

Esta e uma marcacao administrativa distinta da rescisao: mesmo com saldo positivo,
retira o contrato das listas operacionais da Obra e das opcoes de nova solicitacao.
Impede novas medicoes e reprogramacao; chamadas diretas/formularios antigos tambem
sao validados sob lock. Medicoes anteriores seguem consultaveis/processaveis.
Nao altera `ativo`, `status_contrato`, valores medidos, saldos, parcelas, titulos,
baixas ou pagamentos. O resumo mostra Totalmente medido por marcacao e conserva
tambem o status calculado e os valores reais, sem fabricar medicao ou despesa.

GEO mantem acesso para consulta/reversao; desfazer nao reabre contrato rescindido
nem dispensa as demais regras de saldo, prazo e aprovacao. A UI mostra os 50
eventos mais recentes; a trilha completa permanece na auditoria. Controle de
revisao e mutex impedem repeticao/concorrencia; replay anterior a reversao nao
pode remarcar o contrato. Sem ampliar escopo ou conceder permissoes.

GET/POST `/contratos/:id/medicao-encerramento`, com sessao/modulo/escopo e validacao
de ator no backend. Migration estrutural nullable
`202610150003_contrato_medicao_encerramento.js`, sem seed/backfill. Necessita
aplicacao explicita antes de usar o novo backend; nao executada pelo agente.
Testes isolados: `npm run test:contrato-medicao-marcacao` em backend e frontend.

## Rescisao

Rescisao e transacional e protegida contra repeticao. Ela cancela somente saldo nao
medido. Titulo/parcela com medicao ou movimento financeiro permanece preservado. No
fluxo novo, apenas previsoes futuras sem medicao e sem movimento podem ser excluidas.

Nao existe classificacao em massa no deploy: os status sao calculados com os dados
atuais, e a migration de rastreabilidade adiciona apenas colunas anulaveis.

## Termo aditivo

Novo pedido exige Negociacao Detalhada em `.pdf` ou `.docx`. O arquivo e validado pelo
perfil seguro de upload, vinculado ao aditivo e nao substitui a negociacao original do
contrato. Aditivos historicos sem documento continuam validos. Criacao usa idempotencia
para impedir duplicidade por retry/duplo clique.

## Edicao cadastral da vigencia

Em Gestao de Contratos, selecionar o contrato e clicar em Editar permite corrigir
Inicio da vigencia e Fim da vigencia (DD/MM/AAAA). Mantem a permissao de edicao de
contratos e o escopo de obras atuais. Datas inexistentes, incompletas ou fim anterior
ao inicio sao rejeitados. Datas ausentes continuam permitidas para compatibilidade
com cadastros existentes; limpar um campo remove aquela data.

O PATCH `/contratos/:id` aceita `vigencia_inicio` e `vigencia_fim` em ISO, ou `null`
para limpar. Campos omitidos sao preservados. A interface envia somente as datas
alteradas, evitando sobrescrever a vigencia ao editar outro dado cadastral.
O backend bloqueia o contrato na transacao e valida o intervalo com os valores
atuais. Havendo solicitacao vinculada, grava `CONTRATO_VIGENCIA_ALTERADA` no historico
com autor e periodo anterior/novo, na mesma transacao. Repetir a mesma alteracao nao
duplica esse evento; o evento geral `CONTRACT_UPDATED` da rota permanece existente.

Esta correcao cadastral nao cria termo aditivo nem recalcula parcelas, medicoes,
titulos, pagamentos ou vencimentos. O fluxo formal de prorrogacao por aditivo
continua com suas regras e documentos. Nao requer migration: as colunas ja existem.

Validacoes locais, sem banco real: `node backend/scripts/validarContratoVigenciaEdicao.js`
e, na pasta frontend, `node scripts/validarContratoVigenciaEdicao.mjs` (Playwright;
aceita `PLAYWRIGHT_EXECUTABLE_PATH` para usar navegador instalado).

## Integracoes

### Medicao e envio de pagamento por GEO

Aprovar a medicao abre somente seus titulos medidos e devolve a solicitacao
a Obra para novas medicoes, conforme decisao do usuario em 08/10/2026. O modal
permanece aberto apos aprovar e oferece enviar para autorizacao ou para fila,
cada acao com sua permissao independente. Nenhuma delas inclui previsoes ou
titulos de outras medicoes. Titulos ja em fila ativa nao permitem novo envio.

A preparacao atualiza a solicitacao para `EM ANALISE DO PROPRIETARIO` (com
acentuacao cadastrada); o envio a fila usa `ENVIADO PARA PAGAMENTO` e o
registro no Financeiro seguido do retorno a Obra para novas medicoes.
A medicao mais recente por numero/ID de registro governa o status da solicitacao:
pendente -> `NEC. DE MEDICAO`; aprovada -> `LIBERADO`; analise ->
`EM ANALISE DO PROPRIETARIO`; rejeicao -> `AGUARDANDO AJUSTE`; fila ->
`ENVIADO PARA PAGAMENTO`. Mantem-se a acentuacao dos status existentes.
Enviar, aprovar, rejeitar, revogar ou baixar uma medicao anterior nao substitui
status/setor da atual. O titulo anterior conserva seu pagamento e auditoria;
o Financeiro acompanha seu envio pelo historico, sem assumir o ciclo atual.
`PAGA` continua exigindo quitacao de todas as medicoes e nada positivo por medir.
Nao ha recalculo com escrita em GET nem regularizacao automatica no deploy.
Os contratos legados continuam com solicitacoes de medicao proprias.

Testes isolados: `npm run test:medicao-recarga-envio` no backend e
`npm run test:medicao-recarga-envio-ui` no frontend. Sem migration ou backfill.

Solicitacoes consome o contrato como contexto. Obras pode consolidar contratos relacionados. Arquivos fornece o objeto fisico; o modulo Contratos decide quem pode acessa-lo. Comercial possui seus proprios contratos de venda e apenas integra quando houver regra explicita.

## Mudanca segura

Validar criacao, edicao, anexos, pesquisa, solicitacoes vinculadas, filtros, exportacao,
permissoes, legado, fluxo novo, status calculado, rescisao, aditivo, titulos movimentados
e comportamento com o modulo desabilitado.
