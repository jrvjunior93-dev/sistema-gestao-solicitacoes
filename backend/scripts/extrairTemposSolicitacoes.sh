#!/usr/bin/env bash
# Executado pelo operador. Nao importa .env, models ou servidor do Fluxy.
set +x
set -euo pipefail
umask 077

FLUXY_PACOTE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
FLUXY_BACKEND=${1:-"$HOME/sistema-gestao-solicitacoes-main/backend"}
cd "$FLUXY_PACOTE"

export NODE_PATH="$FLUXY_BACKEND/node_modules"
node -e "require.resolve('mysql2/promise'); console.log('Driver MySQL disponivel. Nenhuma conexao aberta ainda.');"

limpar_acessos() {
  unset AUDIT_DB_HOST AUDIT_DB_NAME AUDIT_DB_USER AUDIT_DB_PASSWORD AUDIT_DB_PORT AUDIT_DB_CA_FILE
}
trap limpar_acessos EXIT

echo 'Extracao completa, somente leitura. Informe os acessos apenas neste terminal.'
echo 'Use preferencialmente uma conta com permissao SELECT. Campos de acesso ficam ocultos.'
IFS= read -r -s -p 'Host do banco: ' AUDIT_DB_HOST; printf '\n'
IFS= read -r -s -p 'Nome do banco: ' AUDIT_DB_NAME; printf '\n'
IFS= read -r -s -p 'Usuario do banco: ' AUDIT_DB_USER; printf '\n'
IFS= read -r -s -p 'Senha do banco: ' AUDIT_DB_PASSWORD; printf '\n'
IFS= read -r -p 'Porta [3306]: ' AUDIT_DB_PORT
AUDIT_DB_PORT=${AUDIT_DB_PORT:-3306}
IFS= read -r -p 'Caminho do certificado CA PEM, se necessario [Enter para CA do sistema]: ' AUDIT_DB_CA_FILE
export AUDIT_DB_HOST AUDIT_DB_NAME AUDIT_DB_USER AUDIT_DB_PASSWORD AUDIT_DB_PORT AUDIT_DB_CA_FILE

FLUXY_SAIDA="outputs/extracao-completa-$(date -u +%Y%m%dT%H%M%SZ)-$$"
node backend/scripts/auditarTemposSolicitacoes.js \
  --consultar-banco \
  --confirmar-banco="$AUDIT_DB_NAME" \
  --historico-completo \
  --fuso-banco=servidor \
  --somente-extrair \
  --max-solicitacoes="${AUDIT_MAX_SOLICITACOES:-20000}" \
  --max-linhas="${AUDIT_MAX_LINHAS:-500000}" \
  --saida="$FLUXY_SAIDA"

limpar_acessos
test -f "$FLUXY_SAIDA/CONCLUIDO.txt"
(cd "$FLUXY_SAIDA" && sha256sum -c SHA256SUMS.txt)
tar -czf "$FLUXY_SAIDA.tar.gz" -C "$FLUXY_SAIDA" \
  historico.json manifesto.json consultas.json SHA256SUMS.txt CONCLUIDO.txt
echo 'Arquivo para baixar e enviar para analise:'
printf '%s/%s.tar.gz\n' "$FLUXY_PACOTE" "$FLUXY_SAIDA"
sha256sum "$FLUXY_SAIDA.tar.gz"
