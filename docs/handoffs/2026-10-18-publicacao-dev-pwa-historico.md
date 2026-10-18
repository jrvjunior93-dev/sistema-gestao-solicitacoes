# Publicacao DEV: remetente, filtros e historico excluido

## Autorizacao / destino

Usuario autorizou commit e push de todos os ajustes destas tarefas na
refactor/frontend, com comandos para ele atualizar a EC2 DEV. Nao promover main
nem acessar EC2 pelo agente. Trabalho em branch local isolada
codex/remetente-fila-ciclo-20261018, base957ebf85. Fetch confirmou origem DEV
na mesma base e main5e9b1ef1 antes da publicacao. outputs/ e outros worktrees
preservados, nenhum dado/configuracao real alterado pelo agente.

## Pacote

- Remetente/data originais mantidos na projecao de estornos por vinculo explicito.
  Rejeicao seguida de novo envio direto/digital inicia outra origem. Fluxo de
  estorno/baixa e registros persistidos permanecem intocados.
- Filtros PWA automaticos combinados; Situacao atual imediata, texto/datas com
  debounce, Limpar filtros preservado. Sem Aplicar filtros. Sem datas: todo periodo.
- Responsividade WEB do formulario e configuracao corrigida sem redesenho.
- Titulo excluido identificado com data/conta/motivo e filtro historico, sem
  disponibilidade para decidir/baixar e sem restaurar registros. Snapshots,
  anexos, assinaturas e valores historicos preservados.
- Sem migration, dependencia ou alteracao de permissoes, TLS, PILOT ou sessao.

Detalhes funcionais, arquivos e limites nas entregas anteriores:

- docs/handoffs/2026-10-18-remetente-fila-filtros-automaticos.md
- docs/handoffs/2026-10-18-pwa-titulos-excluidos-historico.md

## Comandos DEV

Roteiro: ops/deploy/atualizar-dev-pwa-historico-20261018.sh SHA_COMPLETO.
Executar pelo usuario exclusivamente no checkout DEV conhecido. O roteiro
confere caminho/branch/checkout limpo, lock, PM2 exclusivo/watch/porta, UUID e
host DEV, schema e sessao antes da atualizacao. Usa fetch e merge ff-only do
SHA publicado; npm ci somente backend. Nao escreve .env nem aplica migrations.

Executa testes isolados e SELECT/EXPLAIN no MySQL DEV, incluindo EXCLUIDO sem
titulo operacional ou versao de decisao. Amostra vazia e valida: nao fabrica
registros. Redis usa somente PING e COMMAND INFO GETDEL, sem ler/criar/consumir
challenges. Passkey real continua teste humano no PWA DEV com conta nominal.
Reinicia somente backend-dev sem update-env e exige health HTTP200 na8001.
Schema pendente, guard divergente ou teste falho interrompe antes do restart;
trazer saida para analise, nao contornar guard nem aplicar migration generica.
Frontend e publicado pelo fluxo Vercel da branch; confirmar ambiente DEV.

## Validacoes locais repetidas para publicacao

- Backend test:pwa-titulos-excluidos, test:fila-remetente,
  test:pwa-periodo-fila-direta, validarAnaliseProprietario e permissoes de rotas.
- Frontend test:pwa-titulos-excluidos (helpers/UI/shell reais com APIs simuladas),
  test:polling-seguro e build. Chrome instalado, sem instalar outro navegador.
- Novo validarDeployPwaHistoricoDev: guardas do roteiro, restart exclusivo,
  ausencia de migration/configuracao, DTO excluido nao operacional e amostra
  vazia. Teste antigo deploy-pwa-periodo-dev repetido; bash -n aprovado.
- Avisos preexistentes: Browserslist desatualizado, bundle maior que500kB e
  SQLite experimental. Nao houve falha nesses testes/build.
- Suite antiga validarAutorizacaoConsultaSql.js permanece com falha preexistente
  do sandbox, descrita nos handoffs anteriores; nao faz parte deste roteiro.
- MySQL/Redis/passkey reais nao foram executados pelo agente. A homologacao
  real e o deploy DEV sao tarefas do operador, nao confirmados por testes locais.

## Homologacao manual DEV

1. Entrar na URL DEV e confirmar o frontend atualizado.
2. Filtros de situacao/obra/tipo de data devem combinar automaticamente;
   testar datas parciais, final antes da inicial e limpar. Sem datas: todo periodo.
3. Com titulo DEV de teste, conferir remetente antes/depois do estorno de baixa:
   origem/data devem permanecer. Novo envio apos rejeicao deve ter nova origem.
4. Em historico Títulos excluidos, conferir data/conta/motivo, snapshot original,
   obra e ausencia de selecao/aprovacao/rejeicao/reenvio. Testar lote misto.
5. Conferir notebook/celular, anterior/proxima e voltar nativo, selecao preservada.
6. Passkey: cancelar sem enviar decisao, depois testar decisao real apenas em
   dados DEV. Nenhum teste deve usar ou alterar titulos de producao.

Se houver falha antes do restart, o processo em memoria pode continuar com a
versao anterior mesmo com checkout atualizado. Nao assumir que concluiu pelo
Git; conferir health e saida completa. Nao usar reset ou rollback de banco.
