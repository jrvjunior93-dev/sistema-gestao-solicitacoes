# Promocao incremental Compras, Financeiro e DP para main

## Autorizacao e referencias

Usuario pediu promocao em 2026-10-13; confirmou backup recente conferido e
timer ativo, homologacao em dev de Ticket/cheques/multicartao/estorno e
autorizou somente as duas expansoes estruturais, sem seeds/backfills.
Nenhuma escrita EC2/banco ou reinicio sera executado pelo agente.

- Main base: 0efa82ce13ebaf475cb17891a04896cbfe18a630.
- Refactor aprovada: 447a1dcaf785bbf7cb3c05e0db400e1d9d3ecec5.
- Branch de integracao: codex/promocao-main-20261013, criada da main.
- Sete commits funcionais/documentais da refactor incorporados por merge;
  historias/hotfixes de main preservados, sem reset/force-push.

## Integracao

Conflitos somente em validarCartaoOpcionalSolicitacao e OWNERSHIP_ATIVO.
Mantidos o helper real de instrucao da main e o adapter substituivel de
fatura dos novos testes. Registros documentais dos dois lados preservados.
backend/src, frontend/src, migrations e manifests/lockfiles resultantes
identicos ao alvo refactor. Nenhuma mudanca de ACL ou regra funcional nova.
Outputs QA locais nao versionados.

## Schema e ordem obrigatoria

Codigo tem 266 migrations; main anterior tem 264. Somente leitura no banco
real ainda pendente; nao presumir que ambas estao pendentes/aplicadas:

- 202610130001_rh_ticket_pix_colaboradores.js: colunas opcionais/indice Ticket.
- 202610130002_fila_liquidacao_rateada.js: tabela de liquidacoes e coluna/indice
  nos movimentos. Nao regrava pagamentos/titulos/lotes existentes.

Runner releaseProducao20261013.js confere checkout/processo exclusivos de
producao, commit exato com ancestrais main/refactor, UUID de producao,
schema/porta e configuracao sem teste rapido dev; usa DB efetivo do PM2,
sem imprimir credenciais. Exige 266 arquivos e estado sem pendencias fora
das duas autorizadas, source de migration identico ao commit aprovado,
e guards schema-only. --preflight so le; --aplicar exige flags explicitas
de backup/autorizacao e registra migrations em schema_migrations.
Nao e importado pelo servidor nem executado pela Vercel.

1. Publicar candidato remoto sem mover main (evitar frontend antecipado).
2. Na EC2 atualizar checkout main por fast-forward ao SHA congelado do
   candidato, preservando .env e arquivos de auditoria nao rastreados.
3. Instalar dependencias, executar --preflight, depois --aplicar em janela
   acompanhada. DDL MySQL pode causar locks/commit por instrucao; se falhar,
   nao repetir cegamente nem marcar migrations manualmente.
4. Executar preflight novamente e reiniciar somente backend-solicitacoes;
   confirmar health 127.0.0.1:8000 e smoke autenticado do fluxo legado.
5. Usuario informa resultado; so entao integrar PR para main/Vercel.
   Nao ativar/mudar flags de autorizacao/jornada junto com este release.

## Validacoes locais

20 suites backend focadas em liquidacao/rateio/idempotencia/estorno,
instrumentos/carteira/fatura, Ticket/DP/escopo, documentos/titulos de pedido,
favorecido, comprovantes/interacoes, visibilidade/acesso direto/hardening
aprovadas. Testes do runner (gates positivos/negativos e source sem DML)
e sintaxe aprovados. Build aprovado, avisos existentes Browserslist/chunk.
UI real da fila desktop/mobile aprovada (APIs isoladas, sem baixa real).
Ticket, pedido e navegacao financeira desktop/mobile aprovados; rascunhos,
filtros, 403/conflitos e ausencia de replay preservados em APIs isoladas.

Homologacao MySQL em dev foi confirmada pelo usuario; nao executada nem
auditada pelo agente. Tests simulados nao comprovam concorrencia em RDS
nem ausencia absoluta de regressao. Smoke de producao permanece necessario.

## Rollback e continuidade

Referencia de retorno: main base 0efa82ce; preservar codigo e schema.
Nao executar down (ambas migrations tem down vazio), excluir movimentos,
restaurar banco de dev nem voltar codigo cegamente apos novas baixas/Ticket.
Se houver incidente financeiro, suspender novas operacoes e avaliar
compatibilidade dos novos registros antes de rollback de codigo.
Proximo passo exato: publicar candidato/PR draft, usuario executar roteiro
EC2 e retornar pendencias/schema/health; depois merge main sem antecipar Vercel.
