# LEIA PRIMEIRO — Fluxy

Ponto de entrada para qualquer pessoa ou agente que atuar no repositorio.

Atualizado em **30/09/2026** para o commit `ca6ac22a` da branch
`refactor/frontend`. Se o SHA mudou, confirme os commits posteriores antes de usar
este documento como fotografia.

## 1. O que e este repositorio

O Fluxy e o sistema operacional interno da CSC. A solicitacao conecta setores,
obras, contratos, compras, financeiro, RH/DP, documentos e auditoria. O sistema esta
em uso real; mudancas devem preservar compatibilidade, historico e continuidade.

Linhas atuais:

- `main`: producao;
- `refactor/frontend`: homologacao ampla do produto e fonte deste checkout;
- ambiente EC2 dev: processo `backend-dev`, banco staging e API dev;
- producao: processo `backend-solicitacoes`, banco de producao e API oficial.

O nome historico `dev-v2` ainda aparece em documentos antigos e no contexto do
ambiente, mas nao deve ser assumido como a branch Git atual de homologacao.

## 2. Ordem de leitura obrigatoria

1. `AGENTS.md`;
2. `docs/README.md`;
3. `docs/contexto/ESTADO_ATUAL_REFACTOR_FRONTEND.md`;
4. `docs/arquitetura/MAPA_MODULOS.md`;
5. `docs/arquitetura/PROPRIEDADE_DADOS.md`;
6. `docs/arquitetura/FLUXOS_ENTRE_MODULOS.md`;
7. `docs/seguranca/autenticacao_autorizacao.md`;
8. `docs/modulos/<modulo>/README.md` do dominio alterado.

Se houver mais de um agente:

1. ler `docs/COLABORACAO_CODEX.md`;
2. ler `docs/workspace/PROTOCOLO_AGENTES.md`;
3. registrar sessao e ownership antes de editar;
4. nunca editar arquivo reservado por outra sessao.

## 3. Estado atual resumido

- backend: Node.js/Express/Sequelize/MySQL;
- frontend web: React/Vite;
- aplicativo: Expo/React Native em `mobile/`;
- arquivos: S3 com URL assinada e compatibilidade controlada para uploads antigos;
- backend dev/producao: EC2, PM2 e Nginx;
- frontend: Vercel;
- schema: 252 migrations versionadas nesta fotografia;
- runtime: 17 modulos documentados mais uma integracao legada desabilitada;
- permissoes: 19 grupos, 105 areas e 367 chaves no registro central;
- frontend: 218 declaracoes de `Route` em `frontend/src/App.jsx`;
- backend: 886 declaracoes de rota no arquivo central, alem dos routers modulares.

Esses numeros sao indicadores de inventario, nao contratos. Execute novamente a
auditoria quando o SHA mudar.

## 4. Mudancas mais recentes da branch

### Cadastro de Obra

`CADASTRO DE OBRA` e um fluxo independente na Nova Solicitacao: nao exige obra ou
centro de custo preexistente, segue internamente para GEO e coleta nome, tipo, fase,
valor, responsavel tecnico em texto, endereco, usuarios ativos com acesso e documentos.
Planilha orcamentaria e obrigatoria quando a fase e `OBRA_INICIADA`. O detalhe permite
criar a obra definitiva de forma transacional e idempotente.

### Contratos

A gestao operacional diferencia legado e fluxo novo, calcula status (`ATIVO`,
`TOTALMENTE_MEDIDO`, `CONCLUIDO`, `RESCINDIDO`) e permite rescisao preservando valores
medidos/movimentados. Novo termo aditivo exige Negociacao Detalhada em PDF ou DOCX.

### Financeiro

O fluxo de caixa separa previsto e realizado, possui periodos historicos e projecoes,
usa movimentos ativos no realizado e titulos `PREVISAO`, `ABERTO` e `PARCIAL` no
planejado. Entradas usam verde e saidas vermelho nas visoes por natureza.

A autorizacao do proprietario antes da fila esta apenas planejada. Ler
`docs/modulos/financeiro/AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md`. Ela nao esta
implementada nem ativa.

### Painel do Gestor

Possui Modo TV, ordenacao por usuario/aba e protecao visual dos valores por PIN de
quatro digitos. O PIN oculta valores; nao substitui autenticacao nem permissao.

### Custos e Recebiveis

O modulo possui autorizacao fechada, prazos, bloqueios operacionais de obra, telas de
engenheiro/administrador, importacoes, exportacoes e suites proprias. A documentacao
canonica detalhada esta em `docs/modulos/custos-recebiveis/README.md`.

## 5. Regras que nao podem ser esquecidas

- backend decide autorizacao, escopo, status e consistencia;
- frontend bloqueia duplo clique, mas idempotencia deve existir no backend;
- migration altera apenas schema; DML, seed e backfill sao bloqueados pelo runner;
- o processo nao aplica migration automaticamente ao iniciar;
- nunca misturar banco dev e producao;
- nunca reiniciar `backend-solicitacoes` em atualizacao exclusiva de dev;
- nunca reiniciar `backend-dev` em deploy exclusivo de producao;
- anexos privados exigem autorizacao antes do presign;
- `SUPERADMIN` e compatibilidades legadas nao devem ser generalizados para novas
  autorizacoes sensiveis;
- mudanca em Financeiro, Compras, Contratos, Obras ou Solicitacoes exige revisar os
  consumidores apontados no mapa de modulos.

## 6. Documentacao atual versus historica

Fontes vigentes:

- `docs/arquitetura/`;
- `docs/modulos/*/README.md`;
- `docs/seguranca/`;
- `docs/regras_negocio/`;
- `docs/deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`;
- documentos de contexto indicados por `docs/contexto/README.md`.

Handoffs, mapas de impacto, planos, relatorios de QA e logs registram decisoes e
evidencias da epoca. Eles nao substituem codigo e canones atuais. Quando houver
divergencia, siga a ordem de autoridade de `docs/README.md`.

## 7. Validacao minima

Antes de entregar mudanca:

```bash
cd backend
npm run test:docs
npm run preflight:schema
```

O preflight exige acesso ao banco configurado e e somente leitura. Para frontend:

```bash
cd frontend
npm run build
```

Execute tambem os testes especificos listados no `package.json` e no README do
modulo afetado.

## 8. Proximo trabalho planejado

O plano de autorizacao do proprietario para pagamentos com PWA, passkey e push deve
comecar pela Fase 0, totalmente desligada por
`PAYMENT_OWNER_APPROVAL_MODE=OFF`. O agente executor deve registrar ownership novo e
ler o handoff `docs/handoffs/2026-09-30-autorizacao-proprietario-pagamentos-pwa.md`.
