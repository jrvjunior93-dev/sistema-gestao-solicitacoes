# Documentacao Canonica do FLUXY

Esta pasta descreve o sistema institucional em operacao. A documentacao deve refletir o codigo atual e deixar explicitas as dependencias que podem causar efeitos entre modulos.

Fotografia documental revisada em **30/09/2026** contra o commit `ca6ac22a` da
`refactor/frontend`. Consulte
[`contexto/ESTADO_ATUAL_REFACTOR_FRONTEND.md`](./contexto/ESTADO_ATUAL_REFACTOR_FRONTEND.md)
para a entrada operacional e
[`contexto/AUDITORIA_DOCUMENTAL_2026-09-30.md`](./contexto/AUDITORIA_DOCUMENTAL_2026-09-30.md)
para o escopo da revisao.

## Ordem de autoridade

Em caso de divergencia, use esta ordem:

1. regras obrigatorias de `AGENTS.md`;
2. codigo, migrations e configuracoes do runtime atual;
3. documentos de arquitetura e regras transversais;
4. `README.md` canonico do modulo;
5. ADRs ainda vigentes;
6. logs, handoffs, planos e relatorios historicos.

Planos, fases, sprints e relatorios de entrega registram contexto historico. Eles nao definem sozinhos o comportamento atual.

## Classificacao dos documentos

- **canonicos atuais**: `arquitetura/`, `seguranca/`, `regras_negocio/` e os
  `modulos/*/README.md`;
- **operacionais atuais**: `deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`, arquivos de
  colaboracao e o contexto indicado acima;
- **historicos**: `handoffs/`, `logs_desenvolvimento/`, mapas de impacto, planos,
  relatorios de QA e evidencias datadas;
- **workspace mutavel**: `workspace/OWNERSHIP_ATIVO.md`, `SESSOES_ATIVAS.md`,
  `QUADRO_AGENTES.md` e `HANDOFF_GLOBAL.md`.

Documentos historicos nao devem ser reescritos para parecer atuais. Eles preservam
decisoes e resultados da epoca; quando divergirem do codigo, os canonicos e o codigo
tem precedencia.

## Leitura obrigatoria antes de alterar codigo

- `arquitetura/visao_geral.md`: topologia e principios;
- `arquitetura/ESTADO_RUNTIME_E_LEGADOS.md`: diferenca entre regra vigente, compatibilidade temporaria e codigo descontinuado;
- `arquitetura/MAPA_MODULOS.md`: dependencias entre dominios;
- `arquitetura/PROPRIEDADE_DADOS.md`: dono de cada dado compartilhado;
- `arquitetura/FLUXOS_ENTRE_MODULOS.md`: efeitos de uma operacao em outros modulos;
- `arquitetura/IDEMPOTENCIA_TRANSACOES.md`: protecoes de operacoes criticas;
- `seguranca/autenticacao_autorizacao.md`: precedencia de permissoes;
- `contexto/ESTADO_ATUAL_REFACTOR_FRONTEND.md`: fotografia da branch de homologacao;
- documento canonico do modulo afetado.

## Modulos documentados

- `modulos/solicitacoes/README.md`
- `modulos/comunicacao-interna/README.md`
- `modulos/biblioteca-modelos/README.md`
- `modulos/treinamento/README.md`
- `modulos/compras/README.md`
- `modulos/cotacoes-pedidos/README.md`
- `modulos/financeiro/README.md`
- `modulos/boletos/README.md`
- `modulos/fiscal/README.md`
- `modulos/obras/README.md`
- `modulos/provisionamento/README.md`
- `modulos/contratos/README.md`
- `modulos/comercial/README.md`
- `modulos/crm/README.md`
- `modulos/rh-dp/README.md`
- `modulos/sst/README.md`
- `modulos/governanca/README.md`
- `modulos/configuracoes-painel/README.md`

## Dominios transversais

Parceiros, usuarios, setores, empresas, anexos, notificacoes, auditoria, configuracoes e permissoes sao compartilhados. A propriedade e as regras de consumo estao registradas nos documentos de arquitetura.

## Manutencao

Toda mudanca relevante deve atualizar, no mesmo fluxo:

- regras do modulo;
- dependencias de entrada e saida;
- endpoints, services, models e migrations afetados;
- permissoes e configuracoes;
- testes e validacoes;
- changelog quando houver mudanca operacional percebida pelo usuario.

Nao criar um novo documento de fase para representar o estado atual. Atualize o documento canonico e use o changelog para registrar a entrega.

Antes de encerrar uma revisao documental, execute `cd backend && npm run test:docs`.
O validador percorre todo o acervo Markdown, confere links, termos descontinuados,
catalogo de modulos e metricas do registro central de permissoes.
