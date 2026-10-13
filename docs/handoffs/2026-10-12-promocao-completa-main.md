# Promocao completa para main incluindo DP — 2026-10-12

## Autorizacao e referencias

Usuario autorizou migrar todas as alteracoes publicadas para main, agora
incluindo DP. Backup recente conferido no Drive cifrado e timer ativo confirmados.
Main: 528e8c838a383c71be76f00b21fa8fe54d6c4e8d; refactor/frontend:
1d7951b9da9abf41c0b7dfab0b685ae55b76b53c. Integracao isolada em
codex/promocao-completa-main-20261012. Nao substituir historico da main.

## Schema e ordem de publicacao

Consulta somente leitura na EC2 confirmou identidade de producao esperada e
259 migrations registradas frente a 264 do alvo. Pendentes:

- 202610090001_pix_copia_cola_texto.js
- 202610110001_adiantamento_prestacao.js
- 202610110002_solicitacao_interacoes_usuario.js
- 202610120001_solicitacao_favorecidos.js
- 202610120002_adiantamento_favorecidos.js

O primeiro comando de preflight fornecido tinha path Git relativo incorreto e
produziu lista vazia. Resultado descartado; comando corrigido exige 264 arquivos.
Nao confundir o falso zero com aprovacao do schema.

Main nao publicada durante a preparacao inicial. Ordem: validar integracao local; testar
migrations em copia isolada; aplicar expansoes compativeis com backup/janela;
backend integrado e health; somente entao publicar main/frontend e smoke real.
Nao copiar .env entre ambientes nem executar down destrutivo.

## Preservacao

Tag local backup/main-pre-completa-20261012-528e8c83 e bundle completo
verificado em outputs/promocao-completa-20261012/main-528e8c83.bundle.
Bundle local nao substitui copia externa; nenhuma credencial foi copiada.
Preservar tres arquivos locais de auditoria da EC2 e alteracoes de outros
trabalhos no checkout refactor. Outputs fora de commit.

## Integracao e validacoes

Merge iniciado com --no-commit --no-ff do alvo congelado, sem substituir
historico. Os 36 conflitos foram revisados por dominio e resolvidos. Codigo
backend/src, frontend/src, mobile, migrations e manifests/lockfiles identicos
ao alvo refactor/frontend: os hotfixes funcionais da main ja estavam incorporados.
Documentacao historica exclusiva da main preservada. Nenhum ajuste visual novo.

Dois testes antigos precisaram atualizar dependencias simuladas dos novos
servicos: backend/scripts/validarCartaoOpcionalSolicitacao.js e
backend/scripts/validarFilaComprovantePendente.js. Mantidas as assercoes antigas;
helper de instrucao financeira real executado com models simulados, sem banco.

Validacoes locais concluidas:

- 24 suites backend: seguranca/acesso direto, Pix longo, favorecidos e medicao,
  adiantamento, interacoes, DP/pagamento parcial/contatos, recargas, apropriacoes,
  analise proprietario, encargos, instrumentos, comprovante tardio/importado,
  edicao de solicitacoes, contratos e documentacao.
- Seguranca: 2304 comparacoes de visibilidade, 66 casos de escopo por ID,
  47 rotas HTTP, token/identidade/revogacao e exclusao. Sem flexibilizar regras.
- Build frontend aprovado (581 modulos); navegacao 220 rotas/217 destinos.
- Workspace completo desktop/mobile (1366/390), filtros/preenchimentos,
  datas parciais, permissoes/403, selecoes/revalidacao, mutex e idempotencia.
  Medicao isolada p95 baseline 32,15 ms e piloto 32,05 ms; nao e benchmark EC2.
- Sete suites UI adicionais: pagamento/contatos DP, medicao legada,
  adiantamento, medicao/recarga, fila/preview/dados/colunas/baixa em massa e
  edicao de juros/multa. APIs simuladas; sem operacoes financeiras reais.
- Sintaxe de 114 arquivos JS e git diff --check aprovados.
- Verificador visual continua com 87 pendencias preexistentes no alvo;
  codigo frontend identico comprova ausencia de nova pendencia pela integracao.
  R22/useAvisos e falso positivo: import nomeado existe em Layout.jsx:43.
  Avisos de Browserslist/chunk permanecem; nao alteradas dependencias.

## Condicao da autorizacao de schema

Usuario autorizou a janela acompanhada, com comandos operados por ele, desde
que as migrations nao alterem dados de negocio diretamente. Os cinco up foram
lidos integralmente: somente DDL; sem seeds/backfills/INSERT/UPDATE/DELETE de
negocio, sem criacao de titulos, baixas ou conversao dos registros historicos.
A coluna nova usa_fluxo_adiantamento recebe default false; campos opcionais
novos ficam nulos. A ampliacao Pix preserva conteudo; indices/FKs sao alterados.
O runner bloqueia DML em migrations e registra somente metadados tecnicos em
schema_migrations. DDL pode bloquear/reconstruir tabelas no MySQL: schema-only
nao significa operacao sem risco ou sem escrita fisica no banco.

Testes de migrations locais simulam o banco. MySQL real local nao disponivel;
Docker instalado mas daemon inativo, nao iniciado. Usuario forneceu depois
conferencia real de staging: UUID 60f043e9-4025-11f1-9a61-06d8a063012d,
banco gestao_solicitacoes, checkout ae27d3e3f5c987874b81c9e88359bd2a6c7a46d9,
264 arquivos, 264 registradas, zero pendentes. Backend/src, migrations e
dependencias/lockfile desse SHA identicos ao alvo 1d7951b9; unico commit
posterior e posicionamento visual do icone +. Evidencia fornecida pelo usuario,
nao execucao direta do agente. Nao significa smoke autenticado de producao.

O nome gestao_solicitacoes e igual em staging e producao, mas as instancias
tem UUIDs distintos. Guarda anterior por nome isolado bloqueou apenas a
consulta; corrigida para identidade composta UUID/banco. O manual operacional
DOCX fornecido pelo usuario confirma a separacao de pastas/processos/portas
e hosts RDS; orientacoes dev-v2 e migration automatica estao desatualizadas.
Documento consultado com trechos sensiveis omitidos; nao copiado ao Git.

## Estado e proximo passo exato

Integracao commitada como 918b3b2b0b424af6083642aca2c85e7af4807f07 e publicada
na branch codex/promocao-completa-main-20261012, junto da tag de backup, em push
atomico. Ambas as historias sao ancestrais do merge. Main remota continua no
SHA congelado 528e8c838a383c71be76f00b21fa8fe54d6c4e8d antes da publicacao final.
Conferencia de staging concluida pelo usuario: identidade, SHA/backend
compativel e zero pendentes. Bloco guardado de producao executado pelo usuario
na janela aprovada: atualizou main LOCAL da EC2 para
29ba20318569b9464fb4a207a5ddee350a78a7f6, aplicou exatamente as cinco migrations,
preflight zero e restart somente backend-solicitacoes. Health local terminou
OK apos recusas de conexao iniciais durante subida; outros processos online.

Agente confirmou, por HTTP publico somente leitura em api.jrfluxy.com.br:
health {ok:true} em duas consultas e /api/solicitacoes, /api/usuarios,
/api/financeiro/titulos retornando 401 sem sessao. Nao e smoke autenticado nem
validacao completa de estabilidade/permissoes em producao. Sondagem inicial
sem prefixo /api retornou 404 e foi descartada como URL de teste incorreta.

Proximo passo: publicar integracao por PR para main preservando ambos os
historicos, apos registro documental desta evidencia. Commits documentais
posteriores a 29ba2031 nao alteram o backend em execucao. Acompanhar deploy
Vercel do SHA publicado; depois smoke autenticado pelo usuario em Solicitacoes,
Compras, Fila/Financeiro e Colaboradores/DP, incluindo filtros/abas/favorecidos,
sem escrita financeira de teste em producao. Nao ativar
PAYMENT_OWNER_APPROVAL_MODE no deploy. Se houver incidente, rollback de codigo
compativel, sem down destrutivo nem marcar migrations manualmente.

Nenhuma migration/banco ou restart executados pelo agente: operacao na EC2
foi do usuario. Publicacao main/frontend e autorizada pelo pedido de promocao
completa e condicionada ao backend/schema, agora conferidos. Bundle local
precisa de copia externa; backup Drive recente foi confirmado pelo usuario,
nao testado novamente pelo agente. Outputs/auditorias preservados.
