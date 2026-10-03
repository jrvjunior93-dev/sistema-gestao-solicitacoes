# Importacao de contratos e extratos legados

## Objetivo

Importar contratos de venda, multiplas unidades, compradores, parcelas e recebimentos historicos com previa obrigatoria, confirmacao atomica e rastreabilidade. A previa nao altera cadastros.

## Modelo XLSX v1.0

A tela `Comercial > Contratos de venda` gera o modelo com dados de referencia do ambiente. As abas editaveis sao:

1. `CONTRATOS`: identificacao, empreendimento, comprador principal, categoria, valor contratado e saldo atual;
2. `COMPRADORES`: um ou mais compradores por contrato;
3. `UNIDADES_CONTRATO`: uma ou mais unidades, valor cadastrado de referencia e valor real atribuido;
4. `PARCELAS`: composicao original e saldo atual por parcela;
5. `RECEBIMENTOS`: principal historico e componentes separados de juros, multa e desconto.

As demais abas sao instrucoes ou referencias. Cabecalhos alterados, formulas, macros, planilhas ocultas e arquivos fora dos limites de seguranca sao rejeitados.

## Escopo empresarial aprovado

Todos os empreendimentos pertencem a empresa codigo `1`, `CONSTRUTORA TALISMA LTDA`, CNPJ `27.123.008/0001-00`.

| Empreendimento | Codigo | Obra vinculada |
| --- | --- | --- |
| EDIFICIO AREIA PRETA | EDAP | EDIFICIO AREIA PRETA |
| EDIFICIO BELLA MARE | RCM-EBL | EDIFICIO BELLA MARE |
| EDIFICIO BRISA MAR | RCM-EBM | EDIFICIO FLORENCA AB |
| EDIFICIO FLORENCA | RCM-EFL | EDIFICIO FLORENCA AB |
| EDIFICIO ITALIA | 02 | EDIFICIO ITALIA |
| EDIFICIO PEDRA MENINA | EPME | ED. PEDRA MENINA |

O modelo gerado pelo sistema usa os cadastros reais como autoridade. Se codigo, obra ou empresa estiver divergente, a previa bloqueia a importacao.

## Regras aprovadas

- contrato pode possuir varias unidades do mesmo empreendimento;
- o valor cadastrado da unidade e apenas referencia; o usuario informa o valor real antes de salvar;
- a soma dos valores reais das unidades deve fechar o valor total do contrato, com tolerancia de `R$ 0,02`;
- unidade `VENDIDA` sem contrato pode ser vinculada; unidade inexistente nao e criada automaticamente;
- unidade bloqueada, ambigua ou vinculada a outro contrato ativo bloqueia a carga;
- cliente inexistente e criado com CPF/CNPJ e nome como cadastro incompleto, sem sobrescrever cliente existente;
- categoria e escolhida por empreendimento entre `1.01.01.02 - Receitas de Vendas de Imoveis` e `1.01.01.04 - Receitas de Vendas de Lotes`;
- recebimentos historicos geram movimentos de legado, sem conta bancaria, sem conciliacao e sem movimentar caixa atual;
- status do titulo e do contrato e derivado dos saldos e vencimentos;
- nao existe indice de correcao nesta etapa;
- a carga nao gera PDF e nao envia ao D4Sign; o PDF assinado pode ser anexado posteriormente no contrato.

## Mapeamento de parcelas

| Origem | Fluxy | Periodicidade |
| --- | --- | --- |
| Ato | ENTRADA | UNICA |
| Parcelas Iniciais | OUTRA | UNICA |
| Parcelas Mensais | PARCELA | MENSAL |
| Parcelas Semestrais | INTERMEDIARIA | SEMESTRAL |
| Parcela anual | BALAO | ANUAL |
| Entrega das chaves | CHAVES | UNICA |
| Permuta | OUTRA | PERMUTA |

## Seguranca e idempotencia

- somente usuarios com `comercial.vendas.importar` ou administradores podem operar a carga;
- a previa expira em 24 horas e guarda hash, linhas, erros e avisos;
- avisos exigem aceite explicito;
- a confirmacao exige `Idempotency-Key` e executa todos os contratos em uma transacao;
- unidades sao relidas e bloqueadas durante a confirmacao;
- contrato ja importado com a mesma origem/identificador e tratado sem duplicar dados;
- qualquer falha desfaz a confirmacao completa.

## Ativacao em desenvolvimento

1. aplicar a migration estrutural protegida em `dev-v2`;
2. executar `npm run comercial:multiunidade:simular-backfill` no backend;
3. revisar a lista e, somente com autorizacao operacional, executar `npm run comercial:multiunidade:aplicar-backfill` em desenvolvimento;
4. conceder a permissao `comercial.vendas.importar` aos usuarios homologadores;
5. baixar um modelo novo pela tela e executar uma carga de homologacao;
6. conferir contratos, unidades, clientes incompletos, titulos, movimentos historicos, relatorios e portal.

Nenhuma dessas operacoes deve ser executada em producao sem uma autorizacao separada.
