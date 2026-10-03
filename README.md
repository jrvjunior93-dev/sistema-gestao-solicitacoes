# FLUXY

Sistema operacional institucional para centralizar solicitacoes, obras, contratos, compras, financeiro, documentos, pessoas, seguranca do trabalho e governanca.

O FLUXY nasceu dentro de uma operacao real de construcao civil. A solicitacao e o principal hub do sistema e conecta os setores da empresa aos demais dominios, mantendo historico, anexos, permissoes e rastreabilidade.

## Estado do produto

- sistema interno em producao;
- uma instalacao institucional com suporte a multiempresa;
- backend como autoridade para regras, permissoes e valores criticos;
- modulos habilitaveis por configuracao;
- foco em estabilidade, governanca, testes, documentacao e continuidade operacional.

## Stack

- backend: Node.js, Express, Sequelize e MySQL;
- frontend: React, Vite, React Router e Tailwind CSS;
- arquivos: Amazon S3 com URLs assinadas;
- producao: EC2, PM2, Nginx e Vercel;
- mobile: aplicativo Expo/React Native em `mobile/` e empacotamento Capacitor do frontend web quando aplicavel;
- testes de interface: Playwright.

## Execucao local

```bash
cd backend
npm install
npm run migrate
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

Use `backend/.env.example` como referencia para o ambiente. O backend apenas confere, em
modo somente leitura, se existem migrations pendentes e falha fechado quando o schema esta
desatualizado. A aplicacao de migrations e um passo operacional explicito, protegido por
`ALLOW_SCHEMA_MIGRATIONS=true`; o runtime normal nao usa `sync({ alter: true })`.

## Documentacao

A entrada oficial e [docs/README.md](docs/README.md). Antes de alterar um fluxo, leia tambem:

1. [`LEIA-PRIMEIRO.md`](LEIA-PRIMEIRO.md);
2. [`docs/contexto/ESTADO_ATUAL_REFACTOR_FRONTEND.md`](docs/contexto/ESTADO_ATUAL_REFACTOR_FRONTEND.md);
3. `docs/arquitetura/MAPA_MODULOS.md`;
4. `docs/arquitetura/PROPRIEDADE_DADOS.md`;
5. `docs/arquitetura/FLUXOS_ENTRE_MODULOS.md`;
6. o `README.md` canonico do modulo afetado;
7. `AGENTS.md` e os arquivos de ownership quando houver mais de um agente.

## Regras estruturais

- o frontend orienta a experiencia; o backend decide autorizacao e consistencia;
- exclusoes sensiveis devem ser logicas e auditaveis;
- criacoes, aprovacoes, baixas, envios, compras e integracoes devem ser protegidas contra duplicidade;
- mudancas em entidades compartilhadas exigem validacao dos modulos consumidores;
- documentos de plano, fase, sprint e relatorio historico nao substituem a documentacao canonica atual.
