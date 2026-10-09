# Modulo CONTRATOS

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

A listagem usa `Contratado`, `Saldo` e `Aditivos`. O status e calculado em consulta:

- `ATIVO`: parcialmente medido ou ainda com saldo operacional;
- `TOTALMENTE_MEDIDO`: valor contratado integralmente medido;
- `CONCLUIDO`: ciclo encerrado conforme as regras vigentes;
- `RESCINDIDO`: rescisao registrada com motivo, usuario, data e saldo cancelado.

O detalhe reune medicoes, solicitacoes, titulos, valores movimentados, saldo contratual
e saldo financeiro.

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
