# Mapa atual do sistema Fluxy

Fotografia do commit `ca6ac22a`, em 30/09/2026. Este arquivo orienta localizacao; as
regras de negocio vigentes ficam nos READMEs canonicos de `docs/modulos/`.

## Inventario tecnico

- 218 declaracoes `Route` no router principal do frontend;
- 886 declaracoes de rota no arquivo central do backend, alem dos routers modulares;
- 252 migrations;
- 223 models e 115 controllers no backend;
- modulos backend especializados: Banking, Core Gateway, Custos e Recebiveis,
  eSocial legado, Fiscal, Governanca e SST;
- modulos frontend especializados: CRM, Custos e Recebiveis, Fiscal, Governanca,
  Provisionamento, Solicitacao de Compra e SST.

Contagens mudam com o codigo e devem ser recalculadas quando usadas em auditoria.

## Entrypoints

| Camada | Arquivos principais |
|---|---|
| Backend | `backend/server.js`, `backend/src/app.js`, `backend/src/routes.js` |
| Banco | `backend/src/database/index.js`, `backend/src/database/runMigrations.js`, `backend/migrations/` |
| Frontend | `frontend/src/main.jsx`, `frontend/src/App.jsx`, `frontend/src/layout/Layout.jsx` |
| Sessao | `backend/src/middlewares/auth.js`, `frontend/src/contexts/AuthContext.jsx` |
| Navegacao | `frontend/src/navigation/navigationConfig.jsx` |
| Mobile | `mobile/app/`, `mobile/src/`, `mobile/app.json` |

## Dominios

| Dominio | Responsabilidade | Documento canonico |
|---|---|---|
| Solicitacoes | abertura, destino, status, historico e anexos | `docs/modulos/solicitacoes/README.md` |
| Obras | cadastro, acesso, classificacao e apropriacoes | `docs/modulos/obras/README.md` |
| Contratos | contrato operacional, medicao, aditivo e rescisao | `docs/modulos/contratos/README.md` |
| Compras | solicitacao, itens, catalogacao e apropriacao | `docs/modulos/compras/README.md` |
| Cotacoes/Pedidos | fornecedores, respostas, fechamento e pedidos | `docs/modulos/cotacoes-pedidos/README.md` |
| Financeiro | titulos, movimentos, fila, caixa, conciliacao e relatorios | `docs/modulos/financeiro/README.md` |
| Comercial | empreendimentos, unidades e contratos de venda | `docs/modulos/comercial/README.md` |
| RH/DP | pessoas, jornada, apuracao, eventos e pagamentos | `docs/modulos/rh-dp/README.md` |
| Custos e Recebiveis | planejamento, bloqueios, medicao e visao executiva | `docs/modulos/custos-recebiveis/README.md` |
| Fiscal | documentos fiscais e vinculos controlados | `docs/modulos/fiscal/README.md` |
| Boletos | emissao, remessa, retorno e liquidacao | `docs/modulos/boletos/README.md` |
| Provisionamento | previsao gerencial sem criar realizado | `docs/modulos/provisionamento/README.md` |
| CRM | leads, oportunidades e conversao | `docs/modulos/crm/README.md` |
| SST | escopo documental simplificado e legados em transicao | `docs/modulos/sst/README.md` |
| Governanca | auditoria e saude sem mutar dominios operacionais | `docs/modulos/governanca/README.md` |

## Superficies transversais

- configuracoes de modulo, setores, status, tipos e campos;
- permissoes granulares e escopo de obra;
- parceiros, empresas e usuarios;
- anexos privados/S3 e compatibilidade de uploads antigos;
- notificacoes e live updates;
- preferencias de lista por usuario;
- auditoria operacional e logs de seguranca;
- Painel do Gestor.

## Fluxos criticos

1. Solicitacao comum nasce em `GEO / PENDENTE` e segue regras configuradas.
2. Cadastro de Obra e excecao explicita: nasce sem obra/centro de custo preexistente.
3. Compras recebe solicitacao revisada, cota, fecha pedidos e origina previsoes/titulos.
4. Financeiro e o unico dono da baixa e do realizado.
5. Contratos legado e novo coexistem; rescisao e medicao usam regras diferentes, mas
   convergem no resumo operacional.
6. RH/DP gera obrigacoes somente apos as etapas de decisao/homologacao previstas.
7. Custos e Recebiveis pode bloquear operacoes de obra conforme os prazos documentais;
   esse bloqueio deve ser validado no backend consumidor.

Detalhes e dependencias: `docs/arquitetura/MAPA_MODULOS.md` e
`docs/arquitetura/FLUXOS_ENTRE_MODULOS.md`.
