# Promocao MAIN dos tres pacotes DEV pendentes - 2026-10-21

## Autorizacao e escopo

Usuario pediu migrar os tres commits pendentes preservando main e receber
comandos para executar na EC2 PROD. Confirmou backup recente no Drive cifrado
e timer ativo especificamente para esta promocao. Agente unico, sem EC2/SSH,
banco/Redis/S3/passkey reais, escrita financeira, .env/flags ou dependencias.

SHAs congelados: main eb12d9d73114caa0eb7368c9b855b4aa7c152355 e
DEV828ed2ecd6478df54ff859c306b2ffac1a9ea9c9. Branch de integracao
codex/promocao-pendencias-main-20261021 nasce da main. Merge revisado do DEV
preserva ambos historicos; somente tres deltas funcionais ainda faltavam:

- `5dbdd55a`: uma lista para titulos diretos e compras/parcelas da fatura, data de
  compra/parcela/valor nesta fatura; sem recalcular total oficial ou duplicar
  entidades. Identidade por parcela/movimento, nao apenas titulo.
- `44ee71b2`: quitar saldo integral com cartao parcelado apos PIX anterior,
  preservando PIX, desconto/historico; legado sem parcelamento continua travado.
  JOIN Obras respeita casing MySQL no relatorio de permutas; mesmos filtros/ACL.
- `771f8041`: registro inicial/final via data_inicio/fim/createdAt, independente
  de Resposta/Pagamento; legado/sessao/URL/limpeza/exportacao/live update e escopo
  preservados. Guarda Symbol corrigida por Reflect.ownKeys no controller.

Mapa de impacto mantido nos handoffs originais de cada pacote: lista de fatura
e sua baixa/ACL/busy/revisao nao mudam financas; fila canonica/parcelas/estorno/
contas/limites/replay/rollback preservados; consulta de solicitacoes usa mesmo
escopo antes do periodo, sem alterar criar/enviar/assumir/arquivar. Nenhuma regra
adicional ou redesenho de UI introduzido nesta promocao.

Sem conflito runtime; cinco documentos em conflito resolvidos mantendo os
registros main e DEV, com homologacao da passkey atualizada mantida. Codigo
backend/src e frontend/src final identico ao DEV828; package.json/main e scripts
produtivos exclusivos preservados. Autorizacao unica/rollback/locks continuam.
Schema, lockfiles e dependencias identicos a main anterior. Outputs privados
nao publicados.

## Backup preventivo do codigo e recuperacao

Tag backup/main-pre-pendencias-20261021-eb12d9d7 no SHA anterior; bundle completo
privado outputs/promocao-pendencias-main-20261021/main-eb12d9d7.bundle aprovado
por git bundle verify e conservado localmente fora da EC2. Nao substitui backup
cifrado MySQL. Publicar tag sem alterar snapshot e conservar hotfixes main.

Em incidente, interromper novas baixas e conferir movimentos existentes antes
de repetir. Nao estornar PIX antigo, excluir filas/parcelas ou restaurar DB
automaticamente. Reversao de codigo aprovada para baseeb12 deve ser coordenada
com Vercel e restart somente PROD; sem migration down ou rollback de dados.

## Roteiro produtivo

ops/deploy/atualizar-producao-pendencias-20261021.sh recebe SHA main completo,
exige confirmacao backup/timer e timer ativo. Guarda caminho/main/clean/lock,
PM2 PROD online8000/sem watch/migration automatica, SQLite do Node disponivel,
alvo descendente eb12 e instalado minimo60f327d7 com ff-only, schema/dependencias
intactos e runtime restrito aos tres backend/cinco frontend do pacote.

Se instalado ainda na main60, o alvo inclui autorizacao unica ja aprovada; nao
exigir dois deploys sequenciais nem carregar modulo novo antes do merge. Antes
do merge chama verificarFinanceiroProducao20261019 e verificarReenvioAutorizacao
Producao --verificar (JA instalados): UUID/TLS/schema/12h/flags/push em leitura.
Depois do merge roda sintaxe/suites isoladas e unidades frontend sem browser,
revalida guardas, reinicia apenas backend-solicitacoes, health8000 e pos-check.
.env por hash; sem npm install/ci, DDL, .env/flags/permissoes ou dados alterados.

As consultas produtivas dos verificadores sao de prontidao/schema/consistencia,
nao teste financeiro com escrita nem prova de permissao de um usuario. Validar
relatorio e filtros na UI em leitura apos deploy; nao afirmar teste MySQL real
do relatorio executado pelo agente. Os servicos/testes locais usam memoria/SQLite.

Atualizar backend/health antes de usar frontend/PWA novo; conferir Vercel main
do SHA entregue. Nao criar baixa real para smoke: conferir fatura/parcelas e
permutas em leitura e registro inicial/final, uma ponta/sem datas/mesmo dia,
combinacao de filtros e retorno/F5. Fluxo PIX/desconto/cartao foi comprovado em
teste isolado; proxima operacao legitima permite acompanhar historico/faturas.

## Validacao e continuidade

Resultados finais em controles workspace. Backend real/isolado cobre PIX4956,70
preservado, saldo35853,30, desconto6853,30, cartao29000/6x, centavos, replay,
estorno e rollback/ACL/faturas processadas; SQL permutas e casing; controller
periodo inclusivo/UTC-BR-NZ e escopo; regressao passkey unica e baixas compostas.
UI real/API simulada e build repetidos; nao substituem integracoes reais no DEV.

QA do roteiro verifica guardas/ordem/escopo/nenhuma mutacao automatica. Proximo:
commit de merge da integracao, PR/merge main autorizado, entregar SHA e comando
pinado. Se guarda falhar, parar e enviar saida sem segredos; nao contornar
identidade, schema ou fast-forward. EC2 executada exclusivamente pelo operador.

Fechamento local: suites backend/cartao/saldo/permuta SQL/periodo/ACL/edicao/
preferencias/passkey/baixas compostas e carteiras aprovadas, sem banco externo.
UI cartao/saldo/desconto/6x, fatura unificada e consulta1366/390 aprovadas.
Workspace/legado/retorno/sessionStorage/URL/403/troca de usuario/escopo/limpeza/
janela/ordenacao aprovados; p95 medio31,75ms tanto baseline como piloto. Build
13,55s/631 modulos aprovado, sem delta no catalogo gerado; avisos preexistentes
de Browserslist/chunk grande/SQLite experimental. Node/Bash/guardas/docs603/19/
diff/escopo e preservacao dos scripts main aprovados. Nenhuma operacao EC2 real.
UI passkey repetida na integracao:130 titulos entre lotes/paginas/obras, uma
assinatura/POST, cancelamento/replay/resposta perdida e320/390/1366 aprovados.
Ownership liberado para commit/PR/merge autorizado.
