# Publicacao DEV do validador de Compras - 28/10/2026

## Autorizacao e base

Usuario autorizou commit/push refactor/frontend e codigos para EC2 DEV.
Base2b1d3e7a078d1d89301dd0b08163340ca7ef599e, branch local
codex/reabertura-favorecido-dev-20261028. Remoto DEV estava nessa base;
main ece109c93f62268bb3f4108d658e9a817bff80f5 permanece fora da publicacao.
Sem acesso EC2, SQL externo, operacao financeira ou migration pelo agente.

## Pacote fechado

- Runtime: somente operationalValidators.js, funcao validateCompraQuery.
- QA de paginacao ampliado com middleware real capturado da rota; documentacao
  e handoff local 2026-10-28-compras-query-paginacao-local.md preservam diagnostico.
- Novo aplicador/teste/manifesto/README compras-query-dev-20261028. Nao foram
  alterados pacotes fechados anteriores. Confere PROD4096/DEV/Experience/env/
  Nodes/daemon/dumps/unit e reinicia somente backend-dev pelo operador.
- Novas flags CONFIRM_DEV_BACKUP=SIM e CONFIRM_COMPRAS_QUERY_DEV=SIM.
  Estado privado proprio, snapshots e inventario por hash, sem trocar HEAD.
- Nenhum arquivo frontend modificado; o bundle ja chama o contrato correto.
  Nao ha necessidade de liberar frontend em etapa posterior ao backend.

## Validacao

Seis scripts QA backend PASS sob semRedeQa: paginacao (8casos), fases de
performance, colecoes sem produto cartesiano, Compra Direta GEO, acesso
entregas, envio cotacao. Oito testes do aplicador PASS: inventario/hashes,
delta runtime, dependencia, limite4096, preservacao dos pares/ambientes,
retomada sem restart duplicado e bloqueio de operacao global/destrutiva.
Tela/hook/servico reais ja validados com API ficticia no handoff local.
Sintaxe/diff aprovados. test:docs e inventario a partir dos objetos Git
conferidos no fechamento antes de push; sem alteracao de dependencias.

## Proximo passo

Publicar o commit somente em refactor/frontend e conferir remoto. Entregar
SHA/hash e comando manual DEV; usuario confere backup e executa. Depois de
COMPRAS_QUERY_BACKEND_DEV_PRONTO, recarregar lista DEV, pagina2, busca e
filtros, sem escrita real. A main tambem possui o defeito, mas sua promocao
e atualizacao de producao nao estao incluidas neste pedido DEV.
