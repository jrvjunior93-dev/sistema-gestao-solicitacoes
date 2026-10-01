# Handoff — autorização do proprietário para pagamentos

## Estado em 30/09/2026

- Branch: `refactor/frontend`.
- Implementação local: concluída, ainda sem commit/push nesta tarefa.
- Flag efetiva padrão: `PAYMENT_OWNER_APPROVAL_MODE=OFF`.
- Banco, EC2, Vercel, Redis e S3 externos: não acessados nem alterados.
- Migration: criada, não executada.
- Deploy/ativação: não realizados.
- `outputs/` e alterações documentais preexistentes foram preservados.

## Entrega funcional

O Financeiro pode selecionar títulos elegíveis em Contas a Pagar ou no detalhe da
solicitação e, quando a política exigir, criar um lote para decisão do proprietário. O
proprietário acessa a PWA no celular, revisa o dossiê somente leitura, abre cópias
isoladas dos anexos e autoriza/rejeita itens com passkey. Antes de enfileirar, o backend
revalida título, saldo, vencimento, credor/favorecido, forma de pagamento e anexos. Só
itens autorizados usam o serviço transacional/idempotente já existente da fila.

Incluído:

- modos `OFF`, `PILOT`, `ENFORCED` e `PAUSED`, com valor inválido convertido em `OFF`;
- migration schema-only `202609300004_pagamento_autorizacao_proprietario.js`;
- lotes, itens, documentos isolados, eventos encadeados, autorizadores nominais,
  credenciais WebAuthn e assinaturas Web Push;
- permissões granulares `visualizar`, `preparar`, `decidir`, `configurar` e `auditar`;
- bypass de `SUPERADMIN` para acesso/configuração, mantendo cadastro nominal e passkey
  obrigatórios quando ele próprio atuar como signatário, além do bloqueio do modo
  `Testar usuário`;
- separação obrigatória: preparador não decide o próprio lote;
- challenge Redis de cinco minutos, consumido uma vez e vinculado às decisões e ao hash
  do dossiê;
- passkeys com verificação de usuário, múltiplos aparelhos e revogação;
- manifest/service worker PWA, sem cache de API/dossiê, e push opt-in sem dados
  financeiros no aviso;
- reprocessamento idempotente quando a decisão foi gravada mas o enqueue falhou;
- preflight somente leitura e teste de contrato específico.

## Compatibilidade e rollback

Em `OFF`, a sessão não consulta as tabelas novas, a tela não aparece e o endpoint atual
`POST /financeiro/fila-pagamentos` mantém o fluxo legado. As rotas novas respondem como
funcionalidade indisponível. Depois de uso real, usar `PAUSED` para congelar novas
decisões/envios; não voltar automaticamente para `OFF`, pois isso reabriria o atalho
legado. Rollback de código não deve executar `down` nem apagar lotes, eventos, passkeys
ou snapshots.

## Arquivos centrais

- domínio: `backend/src/services/pagamentoAutorizacaoService.js`;
- gate/reuso da fila: `backend/src/services/pagamentoManualFilaService.js` e
  `backend/src/services/paymentOwnerApprovalPolicy.js`;
- passkeys/challenge: `backend/src/services/webauthnChallengeStore.js`;
- push: `backend/src/services/webPushService.js`;
- API: `backend/src/controllers/PagamentoAutorizacaoController.js` e
  `backend/src/routes.js`;
- PWA: `frontend/src/pages/FinanceiroAutorizacoesPagamento.jsx`,
  `frontend/public/sw.js` e `frontend/public/manifest.webmanifest`;
- especificação: `docs/modulos/financeiro/AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md`.

## Validações executadas

```text
cd backend
npm run test:autorizacao-proprietario
node --check dos serviços/controller/rotas novos

cd frontend
npm run build

git diff --check
```

Resultados: teste específico aprovado, checagens sintáticas aprovadas, build Vite
aprovado e diff sem erro de whitespace. O build manteve apenas os avisos preexistentes
de `caniuse-lite` desatualizado e chunk principal acima de 500 kB.

## Próximo passo seguro em dev

1. revisar/commitar o conjunto quando o usuário autorizar;
2. promover o código mantendo `PAYMENT_OWNER_APPROVAL_MODE=OFF`;
3. confirmar banco dev e executar a migration estrutural;
4. configurar Redis, RP ID/origins WebAuthn e, se push for homologado, chaves VAPID;
5. executar `npm run preflight:autorizacao-proprietario`;
6. conceder permissões granulares ao preparador/configurador e ao proprietário;
7. cadastrar o proprietário como autorizador nominal, ativar `PILOT`, cadastrar duas
   passkeys e testar iOS/Android;
8. validar mudança de título/anexo, autorização parcial, concorrência, retry, `PAUSED`
   e ausência de cache/dados no push;
9. manter `ENFORCED` bloqueado até aceite formal da matriz.

## Limites conhecidos antes de `ENFORCED`

- não há dupla autorização por alçada nem delegação temporária;
- a expiração é aplicada na decisão, mas ainda não há job que persista `EXPIRADO`;
- a cópia do documento é isolada pela aplicação e a referência é hasheada, porém hash
  binário/Object Lock do S3 ainda é hardening futuro;
- faltam testes E2E reais com MySQL, Redis, S3, iOS e Android;
- WhatsApp não foi implementado e não deve aprovar pagamentos por mensagem.
