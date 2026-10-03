# Arquitetura - Stack e Componentes

## Backend

Stack principal:

- Node.js
- Express
- Sequelize
- MySQL
- JWT
- bcryptjs
- multer
- PDFKit
- AWS SDK S3

Blocos principais em `backend/src`:

- `controllers/`
  Orquestram request/response.

- `services/`
  Concentram regra de negocio e montagem de fluxos.

- `models/`
  Definem entidades e relacionamentos Sequelize.

- `middlewares/`
  Cobrem auth, permissions, validation, rate limit e auditoria.

- `validators/`
  Garantem consistencia de `body`, `params` e `query`.

- `database/`
  Cuida da conexao e da verificacao/aplicacao explicitamente autorizada de migrations.

## Frontend

Stack principal:

- React 18
- Vite
- React Router
- Tailwind CSS
- React Icons
- Capacitor para empacotamento controlado do frontend web

Blocos principais em `frontend/src`:

- `pages/`
  Telas administrativas e operacionais.

- `modules/solicitacao-compra/`
  Fluxo especializado de compras, cotacao e pedidos.

- `modules/custosRecebiveis/`, `crm/`, `fiscal/`, `governanca/`,
  `provisionamento-financeiro/` e `sst/`
  Dominios especializados carregados conforme modulo/permissao.

- `components/`
  Componentes reutilizaveis, UI base e blocos de solicitacoes.

- `services/`
  Cliente HTTP por dominio funcional.

- `contexts/`
  Auth e tema.

- `layout/`
  Shell principal, menu e navegacao por perfil.

## Mobile

Stack principal em `mobile/`:

- Expo SDK 54 e Expo Router
- React Native 0.81
- React Query
- React Hook Form e Zod
- Secure Store para sessao

O app mobile possui cliente e navegacao proprios, mas consome a mesma API e deve respeitar os mesmos modulos, permissoes e escopos do backend. O escopo publicado e as pendencias de lojas ficam em `publicacao-mobile-stores.md`.

O projeto Expo e o empacotamento Capacitor sao trilhas distintas. Alterar uma nao
sincroniza automaticamente a outra.

## Infra e Runtime

- backend em EC2 com PM2
- Nginx como reverse proxy
- frontend em Vercel
- S3 para anexos
- configuracao de instalacao lida por runtime config

## Convencoes Atuais

- produto configurado por instalacao
- upload protegido por validacao e tamanho maximo
- leitura de arquivo por link controlado
- documentacao mantida em `docs/`
