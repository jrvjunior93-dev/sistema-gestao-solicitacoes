# Infra e deploy

## Ambientes

| Ambiente | Branch | Checkout EC2 | Processo backend | Porta local | API |
|---|---|---|---|---|---|
| Desenvolvimento | `refactor/frontend` | `~/sistema-gestao-solicitacoes-dev` | `backend-dev` | `8001` | `api-dev.jrfluxy.com.br` |
| Producao | `main` | `~/sistema-gestao-solicitacoes-main` | `backend-solicitacoes` | `8000` | `api.jrfluxy.com.br` |

O frontend fica na Vercel. `refactor-dev.jrfluxy.com.br` e o frontend de homologacao;
`csc.jrfluxy.com.br` e producao.

## Regras de seguranca

- nunca usar `git reset --hard` para atualizar um checkout com estado desconhecido;
- conferir branch, status, remoto e commits antes de puxar;
- usar `git pull --ff-only` para impedir merge acidental durante deploy;
- confirmar host e nome do banco antes de qualquer migration;
- executar preflight de schema em modo somente leitura antes e depois;
- migrations exigem `ALLOW_SCHEMA_MIGRATIONS=true` e alteram somente estrutura;
- reiniciar apenas o processo do ambiente em deploy;
- nao executar `npm audit fix --force` como parte de deploy;
- preservar uma referencia do commit anterior para rollback.
- antes de promover `refactor/frontend` para `main`, exigir snapshot do codigo
  de `main` e dump consistente do MySQL de producao, ambos com copia externa e
  restauracao/recuperacao testada; nao usar tag Git como substituto do dump;
- backup automatico para Google Drive deve estar ativo, cifrado e monitorado,
  com execucoes as 12h e 23h em `America/Sao_Paulo`, retencao de 30 dias e
  teste mensal de restauracao em ambiente isolado.

## Sequencia resumida

### Desenvolvimento

1. conferir que o checkout esta em `refactor/frontend` e sem mudanca desconhecida;
2. `git fetch origin` e revisar `HEAD..origin/refactor/frontend`;
3. `git pull --ff-only origin refactor/frontend`;
4. instalar dependencias somente nos pacotes alterados;
5. executar testes aplicaveis e `npm run preflight:schema` no backend;
6. aplicar migrations explicitamente autorizadas;
7. repetir o preflight;
8. reiniciar somente `backend-dev --update-env`;
9. validar `127.0.0.1:8001/health`, API dev e smoke funcional.

### Producao

1. promover e revisar o escopo aprovado em `main`;
2. conferir checkout, banco de producao, migrations pendentes e rollback;
3. atualizar com `git pull --ff-only origin main`;
4. instalar dependencias e executar as validacoes previstas;
5. parar o processo somente se a migration exigir janela controlada;
6. aplicar migrations estruturais autorizadas e repetir o preflight;
7. reiniciar somente `backend-solicitacoes --update-env`;
8. validar `127.0.0.1:8000/health`, API publica, logs e smokes criticos.

Os comandos completos e a fotografia de migrations ficam em
[`../deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`](../deploy/POS_DEPLOY_REFACTOR_FRONTEND.md).
A promocao segura esta em
[`promocao_refactor_frontend_para_main.md`](./promocao_refactor_frontend_para_main.md).
O procedimento de backup esta em
[`../deploy/BACKUP_PRODUCAO_GOOGLE_DRIVE.md`](../deploy/BACKUP_PRODUCAO_GOOGLE_DRIVE.md).

## Frontend

- push nao garante sozinho que o dominio recebeu o build correto;
- confirmar branch do projeto Vercel, variaveis e URL da API;
- usar redeploy com cache limpo quando necessario;
- validar login, navegacao, anexos e ao menos um fluxo critico depois da publicacao.

## Contingencia

Rollback de codigo nao desfaz schema nem configuracao de banco. Por isso, toda entrega
com migration precisa declarar compatibilidade reversa e procedimento especifico de
retorno antes do deploy.
