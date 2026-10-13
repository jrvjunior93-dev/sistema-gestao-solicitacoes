# Cadastro de favorecido na Nova Solicitacao: obra_id recusado

## Estado

Correcao local solicitada em 2026-10-13 apos erro no cadastro de favorecido
de Medicao. Base 310358a7, checkout promocao-main-20261003,
branch codex/pedido-boleto-opcional-refactor. Sem delegacao, banco real,
migration, EC2, commit ou push. Pendencias anteriores da fila preservadas.

## Diagnostico e mapa

CadastroRapidoFavorecidoButton envia obra_id, tipo_solicitacao_id, tipo_sub_id
e area_responsavel. Service parceiros transmite POST /solicitacoes/favorecidos
com Idempotency-Key. A rota valida allowlist antes do controller; obra_id era
rejeitado. O controller ja usa obra_id para obter configuracoes da origem,
valida tipo ativo/campos/fluxo Medicao e cria/reutiliza parceiro em transacao.

Corrigida apenas a allowlist de validateSolicitacaoFavorecidoCreateBody:
obra_id opcional, escalar, inteiro positivo seguro; vazio/null omitido no
contexto como antes. Nao remover contexto do frontend (isso perderia regras
por origem). Nao alterar ACL, controller, modulo financeiro, cadastro geral
nem fluxo de contrato. Servico de parceiro mantem allowlist cadastral propria,
sem persistir contexto nem conceder privilegios do payload.

## Arquivos

- backend/src/validators/operationalValidators.js
- backend/scripts/validarCadastroFavorecidoOrigem.js (modelos em memoria)
- backend/package.json: test:cadastro-favorecido-origem
- README de Solicitacoes, ownership e este handoff

## Validacoes

- Novo teste executa handler real do modal e toda cadeia de validacao,
  controller, configuracao, parceiro e idempotencia. Cobre Medicao, ID/origem
  OBRA e centro administrativo, subtipo bloqueado, legado sem contexto,
  tipo inativo, campos desconhecidos/privilegios, IDs invalidos, obrigatorios,
  PIX longo, reutilizacao e replay sem criar novo parceiro.
- validarCadastroCredorTipoSubtipo, validarPixCopiaCola e frontend
  validarCredorNovaSolicitacao aprovados; sem banco/rede externos.
- validarPagamentoMedicaoLegada aprovado desktop 1366/mobile 390: pagamento
  PIX/transferencia/boleto, varios favorecidos, anexos multiplos, fluxos legado
  e novo. Sintaxe, documentacao e git diff --check aprovados. Nao houve mudanca
  em bundle/JSX nem migration nova. Ownership desta correcao liberado.

## Proximo passo

Commit e push em refactor/frontend autorizados pelo usuario nesta etapa;
validacoes focadas reexecutadas e aprovadas antes da publicacao.
Depois atualizar backend dev
e homologar cadastro na Medicao com o usuario afetado. A correcao deste erro
exige backend atualizado, nao apenas refresh/redeploy do frontend. Alteracoes
da carteira/fila tem handoff separado e compoem a mesma publicacao autorizada.
Testes isolados nao substituem homologacao MySQL nem concorrencia multi-processo.
