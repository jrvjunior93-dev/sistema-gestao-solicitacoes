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

Main nao publicada nesta preparacao. Ordem: validar integracao local; testar
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
Docker instalado mas daemon inativo, nao iniciado. Falta evidenciar execucao
das cinco migrations em homologacao/copia isolada antes de producao.

## Estado e proximo passo exato

Integracao pronta para commit/push na branch de preparacao, com tag de backup.
Nao mover main antes de schema/backend compativeis. Conferir na EC2 dev,
somente leitura, identidade diferente de producao, SHA do backend e registros
das cinco migrations. Se faltarem, homologar o DDL em staging na janela
autorizada antes de fornecer bloco de aplicacao em producao.

Depois: conferir backup recente/restauravel, identidade prod UUID
5ed4b970-009f-11f1-809c-0ad0e0c90c53/banco gestao_solicitacoes, SHA/processo e
lista exata de cinco pendentes. Aplicar expansoes e exigir preflight zero;
atualizar/reiniciar somente backend-solicitacoes, health e smoke; somente entao
publicar main/frontend. Nao ativar PAYMENT_OWNER_APPROVAL_MODE no deploy.
Falha estrutural interrompe fluxo, sem marcar migrations manualmente nem down.

Nenhuma migration/banco, restart, main remota ou Vercel de producao alterados
por esta etapa. Bundle local precisa de copia externa; backup Drive recente
foi confirmado pelo usuario, nao testado novamente pelo agente.
