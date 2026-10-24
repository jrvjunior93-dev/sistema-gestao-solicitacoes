# Publicacao da correcao de emissao fiscal no DEV

Escopo: refactor/frontend, baseado em7d3a29a567aa39bd506772584e6afd9975d9eb4e.
Somente frontend (duas telas, utilitario, QA e scriptpackage) e documentacao.
Sem backend, banco, XML, dependencias novas, credenciais, PM2 ou alteracaoNode.

O frontend e servido pela Vercel. Atualizar o Git da EC2 alinha o checkout DEV,
mas nao publica a interface. Usar o deployment Vercel da branch refactor/frontend
associado a https://refactor-dev.jrfluxy.com.br e ao SHA informado nesta publicacao.
Se a integracao nao iniciar o build, fazer Redeploy desse deployment DEV.
Main e o projeto/dominio de producao permanecem fora desta atualizacao.

## Terminal Ubuntu na EC2

Substituir COLE_O_SHA_PUBLICADO pelo SHA completo informado na resposta.
O bloco para se o checkout nao estiver na base esperada ou ja no alvo, se houver
arquivos rastreados modificados, se o alvo nao estiver no remoto ou se tiver
mudanca de backend/locks. Nao contornar guardas nem usar reset/force.

```bash
(
  set -euo pipefail
  trap 'echo "Atualizacao DEV interrompida. Envie a saida sem segredos; nao contorne as protecoes." >&2' ERR
  cd /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(git rev-parse --show-toplevel)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(git branch --show-current)" = refactor/frontend
  test -z "$(git status --porcelain --untracked-files=no)"

  BASE_DEV=7d3a29a567aa39bd506772584e6afd9975d9eb4e
  VERSAO_DEV=COLE_O_SHA_PUBLICADO
  git fetch origin refactor/frontend
  git merge-base --is-ancestor "$VERSAO_DEV" origin/refactor/frontend
  test "$(git rev-parse "$VERSAO_DEV^")" = "$BASE_DEV"
  test "$(git rev-parse HEAD)" = "$BASE_DEV" || test "$(git rev-parse HEAD)" = "$VERSAO_DEV"
  git diff --quiet "$BASE_DEV" "$VERSAO_DEV" -- backend package.json package-lock.json frontend/package-lock.json
  git merge --ff-only "$VERSAO_DEV"

  NODE_DEV=/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node
  test "$("$NODE_DEV" --version)" = v24.22.1
  for FUSO_QA in America/Sao_Paulo UTC Pacific/Kiritimati; do
    TZ="$FUSO_QA" "$NODE_DEV" frontend/scripts/validarEmissaoFiscal.mjs --tz
  done
  git log -1 --oneline
  curl --fail --silent --show-error --max-time 10 --output /dev/null \
    --write-out 'Health DEV: HTTP %{http_code}\n' http://127.0.0.1:8001/health
)
```

O modo --tz testa apenas funcoes com dados ficticios, sem importar app, env,
Vite/Playwright ou banco. O QA completo com Chrome nas paginas reais e build
ja foi executado localmente, em tres fusos. Nao instalar dependencias na EC2
nem reiniciar processos para esta alteracao de apresentacao.

## Conferir frontend publicado

Na pagina DEV, atualizar com Ctrl+Shift+R. Em F12 > Console (nao no Ubuntu),
executar este bloco. O resultado nao deve conter vazio nem SHA antigo:

```javascript
(() => {
  if (location.origin !== 'https://refactor-dev.jrfluxy.com.br') {
    console.log('CONFERENCIA_EXCLUSIVA_FRONTEND_DEV');
    return;
  }
  const sha = String(window.__FLUXY_BUILD__ || '');
  console.log(JSON.stringify({
    outcome: 'VERSAO_FRONTEND_DEV',
    commit: /^[0-9a-f]{40}$/.test(sha) ? sha : null
  }));
})();
```

Comparar commit com VERSAO_DEV. Se nao corresponder, aguardar/conferir o deployment
VercelDEV correto e recarregar; nao modificar banco para compensar frontend antigo.

Homologar com a nota ja capturada:

1. Documentos fiscais: Emissao16/10/2026 na lista.
2. Detalhes do mesmo documento: Emissao16/10/2026, horarios em Criado em e
   historico continuam visiveis e com conversao local.
3. Abrir XML continua funcionando. Conferir tambem uma nota de origem legada:
   a conversao de timestamps reais deve manter o comportamento anterior.

Nenhum teste exige recriar captura, baixar XML via NSDOCS, mudar status,
manifestar, gerar DANFE, vincular pedido/titulo ou registrar movimento financeiro.

## Retorno

Se houver problema de interface, selecionar o deployment DEV anterior na Vercel
para esse mesmo dominioDEV. O rollback do checkout deve ser preparado por commit
revisado, sem reset/force. Preservar captura, historico, XML e Nodes isolados.
