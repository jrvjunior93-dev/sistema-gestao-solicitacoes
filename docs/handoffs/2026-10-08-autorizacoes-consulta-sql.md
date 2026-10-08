# Consulta dos lotes de autorizacao de pagamento

Correcao local na branch `refactor/frontend`, autorizada em 08/10/2026.
Lista e detalhe usam uma associacao opcional com o titulo, sem alterar
decisoes, pagamentos, permissoes, passkeys ou envio para a fila.

## Causa e impacto

O `defaultScope` de TituloFinanceiro filtra `deleted_at`. Sem `required: false`,
o Sequelize transforma a associacao em INNER JOIN e, ao aplicar o limite de
100 lotes, gera uma subquery que referencia `itens.titulo_financeiro_id` antes
de incluir o alias `itens` nesse escopo. O SQL invalido foi reproduzido com
os modelos e o gerador MySQL reais, sem banco. Os logs enviados da EC2 nao
registraram a excecao da rota; a confirmacao no ambiente depende de homologacao.

O LEFT JOIN explicito preserva o filtro de exclusao logica, os snapshots e
documentos historicos. Mantem a leitura dos campos atuais status e valor
baixado, quando o titulo existe. O helper e compartilhado pela listagem e
abertura do lote, inclusive pelas respostas de criar/decidir/reprocessar;
nenhuma dessas operacoes de escrita foi modificada.

## Arquivos alterados

- `backend/src/services/pagamentoAutorizacaoService.js`: juncao opcional do titulo.
- `backend/scripts/validarAutorizacaoConsultaSql.js`: geracao SQL e hidratacao reais,
  com transporte simulado e tentativa de conexao real proibida.
- `backend/package.json`: comando especifico e inclusao no teste da fila.
- `docs/modulos/financeiro/README.md`: regra da consulta e comando de validacao.
- Este handoff e registros da sessao nos arquivos de coordenacao do workspace.

## Validacoes

- `npm run test:autorizacao-consulta-sql`: aprovado; lista, detalhe, filtro,
  limite por lote, titulo ausente, snapshots, documentos sem duplicidade,
  403 sem permissao, OFF, consulta em PAUSED e prova negativa da versao anterior.
- `npm run test:fila-instrumentos`: aprovado; regras de instrumentos, convergencia,
  idempotencia, revogacao e protecoes de pagamentos preservadas.
- `node --check` no servico e no teste, `git diff --check` e `npm run test:docs`:
  aprovados novamente antes da publicacao autorizada. Ownership desta sessao liberado.

## Proximo passo

Usuario autorizou commit na `refactor/frontend` e instrucoes para EC2 dev;
o commit sera disponibilizado no remoto para essa atualizacao. Apos atualizar somente o backend dev,
abrir a pagina de autorizacoes no desktop e no celular e confirmar HTTP 200
na lista e no detalhe. Esta correcao nao exige migration, variavel ou
alteracao de dados. Nao repetir a migration ja aplicada para tratar este erro.

Nenhum banco real, EC2, processo PM2 ou producao foi alterado por esta sessao.
Nao ha promocao para main neste pedido. Os erros de custos, cartao e JSON de anexos
vistos no log nao foram tratados neste escopo.
