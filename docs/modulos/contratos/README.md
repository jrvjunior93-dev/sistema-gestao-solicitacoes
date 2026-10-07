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

## Integracoes

Solicitacoes consome o contrato como contexto. Obras pode consolidar contratos relacionados. Arquivos fornece o objeto fisico; o modulo Contratos decide quem pode acessa-lo. Comercial possui seus proprios contratos de venda e apenas integra quando houver regra explicita.

## Mudanca segura

Validar criacao, edicao, anexos, pesquisa, solicitacoes vinculadas, filtros, exportacao,
permissoes, legado, fluxo novo, status calculado, rescisao, aditivo, titulos movimentados
e comportamento com o modulo desabilitado.
