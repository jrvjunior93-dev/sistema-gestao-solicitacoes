# Remediacao das dependencias do backend - 02/10/2026

## Escopo e resultado

O `npm ci` na EC2 dev apontou 20 vulnerabilidades (8 moderadas, 12 altas).
Esta tarefa altera somente dependencias do backend e acrescenta um teste local,
sem migracao, escrita em banco, alteracao de ambiente, reinicio ou deploy.

| Etapa | Mudanca | Auditoria apos a etapa |
| --- | --- | --- |
| Base | Lockfile anterior, `npm ci` | 20: 8 moderadas, 12 altas |
| 1 | `npm audit fix` sem `--force`, limitado a versoes compativeis | 11: 3 moderadas, 8 altas |
| 2 | Nodemailer 10.0.13 e Puppeteer Core 25.12.0 | 3 moderadas, 0 altas |

O Node da EC2 dev informado pelo usuario e 24.13.0, compativel com as novas
versoes. Nao aplicar `npm audit fix --force` no servidor: a sugestao automatica
inclui mudancas de versao potencialmente incompativeis em Sequelize/ExcelJS.

## Risco residual

Os tres avisos moderados sao a mesma dependencia `uuid@8.3.2`, trazida por
`sequelize@6.37.8` e `exceljs@4.4.0`. O alerta de `uuid` diz respeito a chamadas
v3/v5/v6 com buffer fornecido pelo chamador. Na versao instalada, os usos
inspecionados nesses dois pacotes sao v1/v4, sem esse buffer. Isso reduz a
exposicao identificada, mas nao elimina o aviso nem equivale a uma correcao
upstream. Nao forcar `uuid@11` por override enquanto essas bibliotecas declararem
dependencia `^8`: uma resolucao artificial pode quebrar funcionalidades de banco
e planilhas. Reavaliar quando os mantenedores publicarem atualizacao compativel
ou quando houver migracao planejada dessas bibliotecas.

Referencia: https://github.com/advisories/GHSA-w5hq-g745-h8pq

## Validacoes locais

- `npm ci` com o novo lockfile: concluido.
- `npm audit --audit-level=high`: aprovacao esperada; os 3 avisos moderados permanecem.
- `npm run test:dependencias-backend`: cobre API do MySQL, envio Nodemailer em
  transporte JSON (sem SMTP externo), upload multipart com Multer e PDF com
  Puppeteer/Chrome quando o navegador esta disponivel.
- Aprovados: `verificar:regras`, `test:payments`, `test:pedido-financeiro-geo`,
  `test:financeiro-obras-pdf`, `test:anexos-acesso`, `test:compra-cotacao-envio`,
  `test:docs`, `test:pedido-entregas` e `test:fila-pagamentos`.
- `test:security-hardening` falha na assercao preexistente
  `Botao Cadastros nao respeita permissao granular.` A mesma falha foi
  reproduzida no checkout sem esta remediacao; tratar separadamente.

## Publicacao e EC2 dev

Somente apos revisao, commit e push destas alteracoes para `refactor/frontend`:

```bash
(
set -e
cd ~/sistema-gestao-solicitacoes-dev
git status --short
test "$(git branch --show-current)" = "refactor/frontend" || { echo 'Branch incorreta; pare.'; exit 1; }
test -z "$(git status --porcelain)" || { echo 'Ha alteracoes locais; preserve e revise antes do pull.'; exit 1; }
git pull --ff-only origin refactor/frontend
git log -1 --oneline
node -v

cd backend
npm ci
npm run test:dependencias-backend
npm run verificar:regras
npm run test:anexos-acesso
npm audit --audit-level=high
npm run preflight:schema

pm2 restart backend-dev --update-env
curl -fsS http://127.0.0.1:8001/health
curl -fsS https://api-dev.jrfluxy.com.br/health
pm2 logs backend-dev --lines 80 --nostream
)
```

Parar antes do `git pull` se `git status --short` mostrar alteracoes locais que
possam conflitar; preserva-las e revisar caso a caso. Parar antes do reinicio se
qualquer teste ou preflight falhar. O preflight nao substitui migracoes pendentes
de outras funcionalidades, que exigem avaliacao separada. Nao executar migracao
para esta remediacao. Nao reiniciar `backend-solicitacoes` (producao).

Apos o reinicio, conferir o fluxo de PDF de pedido e o envio real de e-mail
somente por operacao controlada/autorizada. O smoke local nao transmite e-mail.
Se houver regressao, manter a versao anterior em servico e preparar reversao
versionada do commit/lockfile; nao usar `git reset --hard` no servidor.
