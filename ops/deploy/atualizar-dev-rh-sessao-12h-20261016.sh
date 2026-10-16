#!/usr/bin/env bash
# Exclusivo DEV: movimentacoes RH e sessao 12h; nenhuma migration.
set -euo pipefail
cd /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(git branch --show-current)" = refactor/frontend
test -z "$(git status --porcelain --untracked-files=no)"
git merge-base --is-ancestor c6b91b4ea48b97b772aeede8e76f8a99f77cdb86 HEAD
exec 9>.git/fluxy-dev-deploy.lock
flock -n 9 || { printf 'Outro deploy DEV esta em andamento.\n' >&2; exit 1; }

cd backend
npm ci --omit=dev
node --check src/config/env.js
node --check src/services/rhSolicitacaoService.js
npm run test:sessao-12h
npm run test:rh-movimentacoes-documentais
node scripts/validarRhPrimeiraLotacao.js
node scripts/validarEscopoRhDpUsuarioObra.js
node scripts/validarRhPessoalPorSolicitacao.js
node scripts/validarRhConsultaSalario.js
node scripts/validarSegurancaAcessoDireto.js
node scripts/validarTrocaUsuarioProducao.js
node scripts/validarDeployRhSessao12hDev.js

# Confere identidade/schema antes de editar exclusivamente .env do DEV, com backup.
node scripts/configurarSessao12hDev.js --aplicar
JWT_EXPIRES_IN=12h pm2 restart backend-dev --update-env
JWT_EXPIRES_IN=12h node scripts/configurarSessao12hDev.js --verificar

node <<'NODE'
(async () => {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    try {
      const r = await fetch('http://127.0.0.1:8001/health', { signal: AbortSignal.timeout(2000) });
      if (r.ok) { console.log('backend-dev saudavel na porta 8001.'); return; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw Error('Health DEV nao respondeu. Consulte pm2 logs backend-dev --lines 60 --nostream.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
NODE

git log -1 --oneline
printf '\nDEV atualizado: Contra-cheque, Folha de ponto, CAT interna e login 12h. Faca novo login. Nenhuma migration ou reinicio de producao.\n'
