# Auditoria documental de 30/09/2026

## Escopo

A revisao partiu de 432 arquivos Markdown versionados. Ao final, o conjunto auditado
somava 438 documentos: os 432 existentes e seis novos documentos de contexto,
promocao e planejamento. O objetivo foi reconciliar as fontes de verdade com o codigo
da `refactor/frontend`, sem reescrever evidencias historicas.

## Metodo

1. conferência do SHA e da divergencia entre `main` e `refactor/frontend`;
2. inventario de runtime, rotas, migrations, models, controllers e modulos;
3. leitura dos documentos canonicos de arquitetura, seguranca e modulos;
4. revisao aprofundada dos handoffs recentes e classificacao dos demais como evidencia
   historica datada;
5. confrontacao com os arquivos funcionais e scripts do `package.json`;
6. substituicao de entradas antigas que descreviam uma copia V4 isolada;
7. classificacao explicita entre canonico, operacional, historico e workspace;
8. execucao de `npm run test:docs` no escopo oficial do validador e auditoria adicional
   dos links locais de todos os 438 documentos.

## Fontes atualizadas

- entradas raiz: README, LEIA PRIMEIRO, ambiente, mapa do sistema, migrations e
  protocolo de agentes;
- indice geral e contexto;
- arquitetura, runtime, dependencias e fluxos entre modulos;
- Solicitacoes, Obras, Contratos, Compras, Cotacoes e Pedidos, Financeiro, RH/DP,
  Comercial e Painel do Gestor;
- autenticacao/autorizacao e metricas do registro central;
- deploy/promocao e fotografia da branch;
- AGENTS, workspace e handoffs das mudancas recentes.

Tambem foram corrigidos os guias ativos de colaboracao e infraestrutura que ainda
orientavam promocao obrigatoria para `dev-v2` ou atualizacao destrutiva de checkout.

## Tratamento do historico

Handoffs, planos, mapas de impacto, logs e relatorios de QA foram preservados como
fotografias datadas. Atualizar seus resultados para o estado atual falsificaria a
evidencia. Eles passam a ser explicitamente subordinados aos canonicos pelo indice
`docs/README.md`.

Excecoes: referencias que quebravam o validador ou apontavam para nomenclatura
descontinuada foram ajustadas sem mudar o resultado historico documentado.

## Limites

- a revisao nao executou consultas em banco, deploy, migrations ou integracoes;
- configuracoes efetivas armazenadas no banco podem variar por ambiente;
- contagens de rotas/arquivos sao fotografias do SHA e devem ser recalculadas;
- codigo posterior a `ca6ac22a` precisa de revisao incremental;
- documentacao nao substitui homologacao funcional.

## Validacoes executadas

- `cd backend && npm run test:docs`: aprovado, com 366 arquivos no escopo do
  validador e 19 documentos canonicos;
- auditoria complementar: 438 Markdown e zero links locais quebrados;
- `git diff --check`: aprovado;
- nenhuma migration, banco, API externa, deploy ou processo PM2 foi acionado.

## Regra para continuidade

Toda nova entrega deve atualizar o README canonico do modulo no mesmo commit. Handoff
registra a entrega, mas nao pode ser a unica documentacao. Depois, executar
`cd backend && npm run test:docs`.
