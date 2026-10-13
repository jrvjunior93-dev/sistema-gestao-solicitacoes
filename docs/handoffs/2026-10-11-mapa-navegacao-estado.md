# Mapa e plano de navegacao e estado das abas

## Resultado e escopo

Entrega diagnostica/documental em C:/Fluxy-refactor-frontend, branch
refactor/frontend, base ade1d5acf4eb9cfe47a5e625d13bac2d3ca7fbbc.
Sem alteracao do funcionamento do produto, commit/push, main, banco,
migration, deploy ou reinicio. Auditoria financeira de outra conversa
preservada. Ownership desta etapa liberado ao concluir as validacoes.

## Arquivos proprios

- frontend/scripts/mapearNavegacaoEstado.mjs: scanner AST somente leitura
  de fontes, rotas, estados/campos/actions, navegacao, permissoes, efeitos,
  storage, imports e candidatos a endpoints; --check valida hashes/cobertura.
- frontend/scripts/diagnosticarAbasEstado.mjs: prova local do hook real de
  abas com Outlet e formulario simulado, sem APIs ou dados de negocio.
- docs/arquitetura/2026-10-11-inventario-navegacao.md: todas as 221
  declaracoes de rota do App e sua etapa; aliases/indice/shell incluidos.
- docs/arquitetura/2026-10-11-plano-navegacao-estado.md: causas,
  comportamento, arquitetura, desempenho, contrato, etapas E0-E8 e testes.
- outputs/mapa-navegacao-estado-20261011/inventario.json: fonte completa,
  hashes/linhas/dependencias, 502 fontes frontend e 918 backend.
- Acrescimos proprios nos quatro paineis de docs/workspace; preservar
  trechos de outras conversas ao publicar futuramente.

## Evidencias e validacoes

- Scanner gerado e --check: 221/221 declaracoes, hashes de 1420 fontes,
  nenhum erro de parse. Cobertura estatica, nao homologacao funcional.
- Diagnostico local em Chromium, viewports 1366 e 390 px: duas abas
  conservadas, campo local perdido ao retornar e storage apenas de
  metadados. Nao reproduz a pagina de negocio inteira nem aparelho real.
- Validadores existentes de abas internas e navegacao aprovados:
  220 caminhos declarados sem indice e 217 destinos do menu; catalogo
  frontend/backend alinhado e rotas legadas preservadas.
- Sintaxe dos dois scripts, test:docs e git diff --check conferidos.
- Sem build de produto nesta etapa: nenhum arquivo de runtime alterado.

## Riscos e limites

O single Outlet desmonta componentes em rotas diferentes; abas nao tem
historico proprio, scroll e estados completos. Delegacao usa navigate
comum; codigo SOL do registro nao e publicado no titulo da aba. Ha drafts
e guards existentes, inclusive autosave/revisao do DP, a integrar.

Nao reter todas as paginas vivas nem persistir genericamente todo useState.
Abas inativas podem duplicar polling/autosave, consumir destaques ou usar
params da ativa. Snapshots devem ser pequenos, isolados por usuario/registro
e versionados; operacoes financeiras continuam explicitas e revalidadas.

URLs dinamicas, variantes de permissao e chamadas indiretas ainda exigem
contrato/teste por fluxo na E0 antes de alterar qualquer pagina. Importacao
backend SST nao resolvida registrada no inventario, sem correcao lateral.

Desempenho ainda nao medido em producao: obter baseline e limites antes de
implementar. Plano exige mediana/p95, memoria, requests/listeners/bundle,
uma/seis/12 abas, 30 ciclos e mobile; regressao impede ampliar o piloto.

## Proximo passo exato

Aguardar autorizacao de implementacao para E0/E1/E2: completar contratos e
baseline do piloto Solicitacoes, implementar base transversal com ativacao
reversivel e validar preservacao/historico/isolamento/desempenho antes de
aderir Compras, Financeiro, DP e demais modulos. Sem promover DP/main ou
testar escrita em banco real por inferencia desta autorizacao documental.
