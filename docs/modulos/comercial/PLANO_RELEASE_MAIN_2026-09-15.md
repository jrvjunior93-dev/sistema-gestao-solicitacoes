# Plano da release isolada do Comercial para a main

## Objetivo

Levar para producao somente a evolucao do modulo Comercial relacionada a contratos com mais de uma unidade, importacao historica do sistema legado e sincronizacao de vencimentos, sem incluir as demais alteracoes da `refactor/frontend`.

## Branch e limites

- base: `origin/main` no commit `31aaaae4`;
- branch de preparacao: `codex/release-comercial-main`;
- a `main` nao deve receber merge antes da homologacao e da autorizacao expressa;
- ficam fora da release: fila de pagamentos, Compras, Solicitacoes, padronizacao global de modais, abas internas e recursos exclusivos de desenvolvimento.

## Conteudo da release

- relacao normalizada entre contrato comercial e varias unidades;
- `Valor da Unidade` sugerido pelo cadastro, editavel, e total calculado pela soma das unidades;
- geracao de documentos, relatorios e portal compativel com varias unidades;
- importacao XLSX de contratos, compradores, unidades, parcelas e recebimentos historicos do sistema legado;
- preview sem criar dados funcionais, confirmacao atomica e chave de idempotencia;
- cadastro minimo de cliente importado marcado como incompleto;
- upload controlado do contrato assinado;
- permissao granular `comercial.vendas.importar`;
- sincronizacao do vencimento editado no Financeiro com a parcela, os indicadores e o status sugerido do contrato comercial;
- organizacao responsiva da tela `Contratos de venda` sobre os componentes existentes na `main`.

## Migration e dados existentes

A migration estrutural comercial desta release e aditiva e deve ser aplicada antes do restart do backend novo. Ela nao executa seed nem backfill funcional.

Depois da migration, o backfill dos contratos antigos possui dois comandos separados:

1. `npm run comercial:multiunidade:simular-backfill` apenas lista o que seria criado;
2. `npm run comercial:multiunidade:aplicar-backfill` grava os vinculos e exige autorizacao operacional depois da revisao da simulacao.

O backfill nao deve ser aplicado automaticamente junto ao deploy.

## Ordem segura para a futura producao

1. confirmar backup recente do banco;
2. confirmar que a EC2 esta na `main` e no commit autorizado;
3. instalar dependencias do backend;
4. executar os testes dedicados da release;
5. aplicar a migration com a protecao de schema explicitamente autorizada;
6. simular o backfill e guardar a saida para conferencia;
7. aplicar o backfill somente depois da conferencia;
8. reiniciar apenas `backend-solicitacoes` com as variaveis atualizadas;
9. publicar o frontend na Vercel a partir da `main`;
10. conceder `comercial.vendas.importar` somente aos usuarios responsaveis;
11. homologar um contrato novo multiunidade e uma planilha controlada antes da carga completa.

## Validacao e rollback operacional

- conferir contrato, unidades, valor total, parcelas, titulos, recebimentos, documentos, relatorio e portal;
- confirmar que a edicao do vencimento de um titulo atualiza o valor vencido e a sugestao de inadimplencia;
- em falha antes da importacao, voltar o codigo ao commit anterior e investigar sem executar o backfill;
- depois de dados multiunidade ou importacoes confirmadas, nao remover as tabelas: a migration possui `down` intencionalmente vazio para proteger os dados;
- uma importacao com erro e atomica e deve ser corrigida por novo preview, sem limpeza manual parcial.
