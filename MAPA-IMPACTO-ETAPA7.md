# Mapa de impacto — etapa 7 (endpoints HTTP do fluxo novo)

## Fatos verificados
- `router.use('/contratos', requireEnabledModule('CONTRATOS'))` na linha 563 — módulo gateia tudo sob o prefixo
- `POST /contratos` (linha 2074) usa `validateContratoCreateBody` + `requireContratoBodyObraAccess` — é o fluxo ANTIGO e não muda
- `criticalRateLimit` existe e é usado em ações sensíveis
- Permissões do serviço já embutidas: criação valida curadoria/apropriações; aprovação/rejeição impõem a permissão estrita internamente

## Rotas novas (sob o mesmo prefixo, ganham o gate de módulo de graça)
| Rota | Middleware | Serviço |
|---|---|---|
| `POST /contratos/fluxo-novo` | `criticalRateLimit` + acesso à obra do body | `criarContrato` |
| `POST /contratos/fluxo-novo/:id/aprovar` | `criticalRateLimit` | `aprovarContrato` (permissão estrita interna) |
| `POST /contratos/fluxo-novo/:id/rejeitar` | `criticalRateLimit` | `rejeitarContrato` (idem) |

## O que NÃO é afetado
Fluxo antigo (`POST /contratos`), todas as rotas existentes, validadores atuais.

## Decisões de desenho
- Erros do serviço já trazem `statusCode` — controller fino, só traduz
- `usuario` = `req.user`; `req` repassado inteiro (guardas do serviço cobrem divergência)
- Verificação: 401 sem token, 403 sem permissão (aprovar), 400 payload inválido, 201/200 felizes, CSRF automático pelo app
