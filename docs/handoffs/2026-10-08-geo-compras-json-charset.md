# GEO Compras - charset JSON - 2026-10-08

## Evidencia e autorizacao

Usuario relatou lista vazia apos atualizacao e forneceu log de producao com
ER_INVALID_JSON_CHARSET/3144 nas consultas do SolicitacaoController (index,
lista de obras e count). SQL publicado usava CONCAT(CHAR(36), '.area_anterior')
e area_nova. CHAR retorna binary por padrao; MySQL rejeita esse caminho JSON.
Usuario autorizou aplicar o hotfix, sem nova autorizacao de publicacao/deploy.

## Escopo

- Helper passa a usar CHAR(36 USING utf8mb4), sem reintroduzir caminho `$` que
  pode ser interpretado como bind pelo Sequelize.
- Regressoes offline impedem CHAR(36) sem charset no SQL gerado.
- Novo teste integrado opt-in reproduz o erro antigo e exige execucao aprovada
  do fragmento corrigido, listagem/count, setores, acentos, JSON invalido,
  metadata nula/incompleta e ausencia de tokens. Somente SELECT com fixtures
  constantes: nao consulta tabelas de negocio, nao grava dados, nao faz DDL.
- Regras de permissao, escrita por setor, historico e anexos preservadas.

## Validacao e limitacoes

- Acompanhamento GEO/SQL gerado, negativas de permissao/escrita, mensagem apos
  envio/duplo clique, Compra Direta, anexos, resumo de pedidos e retorno passaram.
- Sintaxe do helper/teste integrado, documentacao (440 Markdown/19 canonicos) e
  git diff --check aprovados. Teste MySQL bloqueia uso sem opt-in antes de abrir
  conexao. Frontend nao foi alterado; sem novo build necessario neste hotfix.
- Docker Desktop nao esta ativo neste computador; nao foi iniciado servico nem
  conectado banco externo/real. Teste integrado MySQL pendente na EC2; nao alegar
  execucao MySQL aprovada com base apenas na geracao de SQL.
- Implementacao local concluida, ownership liberado. Nenhuma publicacao/deploy
  foi executada nesta etapa.

## Proximo passo

Usuario autorizou em seguida commit/publicacao na refactor/frontend e promocao
para main, com comandos de atualizacao da EC2. Bases congeladas desta janela:
main ef5329f1f2cb0cb33b45fbe50e82c98111646f55 e refactor/frontend
9554372db6253be26ea7399c7e31faca78e30db9. O teste integrado continua pendente e
e obrigatorio no bloco de deploy antes do reinicio. Nao confundir sua
disponibilidade com uma execucao MySQL ja aprovada.

Backup recente no Drive cifrado e timer ativo confirmados pelo usuario nesta
janela. Tag de recuperacao: backup/main-pre-geo-charset-20261008-ef5329f1.
Bundle local fora da EC2 verificado:
outputs/main-pre-geo-charset-20261008-ef5329f1.bundle, SHA-256
B62B6111DEB63E78BA5F86C548AEDF45EAAF2E9BA16243A1A50013C4369AD336.
Bundle nao foi enviado ao Drive; outputs/ preservado fora do Git.

Depois de autorizacao explicita, publicar na refactor/frontend e promover para
main com backup conferido. Antes de reiniciar backend-solicitacoes na EC2:

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes-main/backend
node scripts/validarAcompanhamentoGeoComprasMysql.js --somente-leitura
```

O comando precisa aprovar a execucao real no MySQL. Schema nao muda, nao executar
migrations. Homologar lista da Liz, contador/filtros, SOL-6265, itens e anexos;
validar que edicao fora de GEO continua negada. Sem commit/push/deploy nesta
etapa; outputs/ preexistente preservado.

## Referencia tecnica

[MySQL 8.4 CHAR e CONCAT](https://dev.mysql.com/doc/refman/8.4/en/string-functions.html#function_char):
CHAR sem USING retorna binary; USING utf8mb4 define o charset textual.
