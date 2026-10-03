# Promocao de `refactor/frontend` para `main`

## Objetivo

Levar a linha homologada para producao sem perder hotfixes exclusivos de `main`, sem
misturar ambientes e sem executar mutacao de dados como efeito colateral do deploy.

## Regra principal

As branches divergem. A promocao nao e substituicao de historico nem `reset` de `main`.
Crie uma branch de integracao a partir de `main`, incorpore a refatoracao, resolva
conflitos por dominio e valide o resultado completo antes do merge.

## Fotografia de 30/09/2026

- base comum: `6e620310`;
- `main`: `e2b8d3db`;
- `refactor/frontend`: `ca6ac22a`;
- 49 commits exclusivos de `main` e 562 exclusivos da refatoracao.

## Adendo de preparacao em 03/10/2026

Referencias remotas observadas: `main=250b6520` e
`refactor/frontend=8e2afc13`; base comum `6e620310`. Ha 52 commits
exclusivos de `main` e 580 de `refactor/frontend`. O nome da branch de
refatoracao nao restringe o escopo: o delta inclui backend, frontend,
migrations, dependencias e documentacao. Estes numeros sao uma fotografia,
nao uma autorizacao para merge ou deploy.

**Gate zero: nenhum merge para `main`, migration ou deploy de producao antes
de concluir e evidenciar todos os itens abaixo:**

1. definir a conta Google empresarial proprietaria dos backups e os
   administradores/recovery; configurar remoto cifrado com credenciais fora
   do repositorio e da EC2 como unica copia da chave;
2. congelar SHAs, criar referencia imutavel para o codigo atual de `main` e
   guardar um `git bundle` recuperavel fora da EC2; copiar separadamente
   configuracoes operacionais necessarias, sem expo-las no Git;
3. gerar dump consistente do MySQL de producao, cobrir procedures, triggers
   e events, conferir checksum e recuperar uma amostra em instancia isolada;
4. comprovar a rotina das 12h e 23h (`America/Sao_Paulo`), retencao de 30
   dias, monitoramento de falhas e teste mensal de restauracao;
5. inventariar migrations pendentes **na producao real** com
   `npm run preflight:schema`; revisar cada `up`, inclusive referencias FK,
   privilegios e compatibilidade de rollback;
6. integrar em branch criada de `main`, resolver conflitos preservando seus
   52 commits exclusivos e homologar a matriz funcional completa. Nao fazer
   `reset`, force-push, cherry-pick em massa ou copiar o banco de dev.

O procedimento e as evidencias de backup estao em
`../deploy/BACKUP_PRODUCAO_GOOGLE_DRIVE.md`. O checklist de migracao e
pos-deploy esta em `../deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`.

Recalcule sempre:

```bash
git fetch origin --prune
git rev-parse origin/main
git rev-parse origin/refactor/frontend
git merge-base origin/main origin/refactor/frontend
git rev-list --left-right --count origin/main...origin/refactor/frontend
```

## Integracao recomendada

1. cumprir o gate zero de backup e congelar os SHAs que serao integrados;
2. criar branch de integracao a partir de `origin/main`;
3. incorporar `origin/refactor/frontend` sem descartar commits de `main`;
4. resolver conflitos por propriedade de dados, nao apenas pela versao mais nova;
5. revisar `.env.example`, migrations, rotas, permissoes e contratos de API;
6. executar testes backend, build/verificadores frontend e `npm run test:docs`;
7. aplicar migrations em copia/homologacao com preflight antes/depois;
8. homologar a matriz do guia pos-deploy;
9. abrir PR para `main` com plano de rollback;
10. fazer deploy de producao em janela aprovada.

## Ambientes

Homologacao:

- checkout/diretorio de desenvolvimento;
- branch `refactor/frontend` ou branch de integracao aprovada;
- processo `backend-dev`;
- banco staging confirmado pelas variaveis de protecao;
- frontend dev na Vercel.

Producao:

- checkout de producao;
- branch `main`;
- processo `backend-solicitacoes`;
- banco de producao;
- frontend/domínios oficiais.

Nunca copie `.env` entre ambientes. Compare apenas nomes de variaveis e mantenha
valores/segredos proprios.

## Schema

```bash
cd backend
npm install
npm run preflight:schema
ALLOW_SCHEMA_MIGRATIONS=true npm run migrate
npm run preflight:schema
```

O runner aceita somente schema. Se houver erro, nao marque migration manualmente como
concluida e nao reinicie o novo codigo antes de entender o estado estrutural.

## Ordem de publicacao

Quando frontend depende de endpoint/coluna nova:

1. migration compativel;
2. backend;
3. health e smoke da API;
4. frontend;
5. smoke autenticado no navegador.

Mudanca aditiva deve permitir que o backend antigo continue atendendo durante a etapa
de migration sempre que possivel.

## Rollback

- frontend: reverter o artefato Vercel;
- backend: voltar ao SHA anterior compativel e reiniciar somente
  `backend-solicitacoes`;
- schema: nao executar `down` destrutivo automaticamente;
- preservar dados criados por fluxos novos e registrar o incidente;
- feature nova ativada por flag deve possuir modo seguro documentado.

O checklist funcional completo esta em
`../deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`.
