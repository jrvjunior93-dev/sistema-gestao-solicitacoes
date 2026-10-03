# Ambiente local do Fluxy

Este documento descreve a execucao local sem registrar credenciais, segredos ou
enderecos privados. Valores reais permanecem exclusivamente em arquivos `.env` nao
versionados e nos gerenciadores de segredo dos ambientes.

## Pre-requisitos

- Node.js compativel com os `package-lock.json`;
- MySQL acessivel para o backend;
- variaveis baseadas em `backend/.env.example`;
- dependencias instaladas separadamente em `backend/`, `frontend/` e, quando
  necessario, `mobile/`.

## Backend

```bash
cd backend
npm install
npm run preflight:schema
npm run dev
```

O runtime nao aplica migrations. Se o preflight apontar pendencias, confirme que o
banco e realmente o ambiente local autorizado e aplique migrations apenas em uma
etapa separada:

```bash
ALLOW_SCHEMA_MIGRATIONS=true npm run migrate
npm run preflight:schema
```

No PowerShell, defina a variavel apenas para o processo/comando conforme a sintaxe do
shell. Nunca persista `ALLOW_SCHEMA_MIGRATIONS=true` no `.env`.

## Frontend web

```bash
cd frontend
npm install
npm run dev
```

O endereco/porta sao os exibidos pelo Vite e podem variar conforme a configuracao
local. A origem da API deve apontar para o backend local ou para um ambiente remoto
explicitamente autorizado.

## Mobile

O aplicativo Expo/React Native fica em `mobile/`. O frontend web tambem possui scripts
Capacitor para empacotamento controlado. Sao produtos de build diferentes; nao execute
`mobile:sync` presumindo que ele atualiza o projeto Expo.

## Integracoes externas

Em desenvolvimento local, mantenha pagamentos reais, webhooks, SMTP, bancos,
assinaturas, fiscal, anuncios e demais integracoes desativados ou em provider mock.
Ausencia de credencial deve falhar fechado. Nao use endpoints de producao para testes.

## Banco e seguranca

- confirme `DB_HOST` e `DB_NAME` sem imprimir senha;
- use banco isolado e usuario com menor privilegio;
- scripts com escrita devem possuir modo de simulacao e alvo validado;
- testes que gravam precisam limpar somente os registros criados por eles;
- nao copie chaves MFA, certificados, cookies ou tokens de producao;
- nunca documente credenciais reais no repositorio.

## Validacao

```bash
cd backend
npm run test:docs
```

```bash
cd frontend
npm run build
```

Consulte os scripts de teste especificos no `package.json` de cada pacote e os
documentos canonicos do modulo alterado.
