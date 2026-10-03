# Handoff - Custos e Recebíveis V3 Completo

## Objetivo

Consolidar V2, V3 e plano original em um mockup navegável para aprovação antes
da implementação no Fluxy.

## Arquivos

- `.codex-previews/custos-recebiveis-fluxy-v3-completo.html`
- `docs/modulos/custos_recebiveis_mockup_v3_completo.md`
- `docs/handoffs/HANDOFF_CUSTOS_RECEBIVEIS_V3_COMPLETO.md`

## Entregue

- seleção entre obras públicas e privadas;
- navegação funcional em todas as páginas;
- fluxo mensal público com medição e custos;
- fluxo mensal privado com recebíveis e custos;
- títulos a receber, recebimentos, inadimplência e contratos de venda;
- realizado financeiro, importações, exportações, prazos e permissões;
- download CSV demonstrativo, modais e ações simuladas;
- layout responsivo com rolagem horizontal nas tabelas.

## Limites

É um protótipo local sem persistência e sem chamadas às APIs do Fluxy. Nenhum
arquivo de runtime do frontend ou backend foi alterado.

## Próximo passo

1. Validar o protótipo com a diretoria.
2. Confirmar campos obrigatórios e datas-limite por classificação de obra.
3. Fechar a matriz granular de permissões.
4. Transformar o protótipo aprovado em especificação de models, endpoints,
   migrations e componentes React.
## Estado atual

Mockup V3 completo consolidado para aprovacao. A referencia incorpora as jornadas da V2 e separa os fluxos de obras publicas e privadas sem alterar o runtime do Fluxy.

## Artefatos

- `.codex-previews/custos-recebiveis-fluxy-v3-completo.html`
- `docs/modulos/custos_recebiveis_mockup_v3_completo.md`
- `docs/handoffs/HANDOFF_CUSTOS_RECEBIVEIS_V3_COMPLETO.md`

## Cobertura validada

- jornada publica: planejamento mensal, medicao prevista, consolidacao, aprovacao, recebivel medido e custo realizado;
- jornada privada: planejamento, contratos de venda, unidades, parcelas, titulos a receber, recebimentos e cobranca;
- recursos comuns: dashboard, comparativo, obras, importacoes, exportacoes, prazos, bloqueios e permissoes;
- fontes financeiras separadas entre medicao publica e contas a receber privadas;
- acoes de tabela priorizadas para nao serem capturadas pelo clique de navegacao da linha;
- navegacao implementada em um unico arquivo HTML, sem dependencia do backend.

## Arquivos de runtime

Nenhum arquivo de backend ou frontend do sistema foi alterado nesta etapa.

## Proximo passo exato

1. Abrir e navegar pelo mockup completo.
2. Registrar ajustes de nomenclatura, ordem das telas e campos obrigatorios.
3. Apos aprovacao, transformar a referencia em backlog tecnico por dominio:
   - models e migrations;
   - services e fontes oficiais;
   - controllers e rotas;
   - permissoes granulares e escopo de obras;
   - frontend;
   - obrigacoes, notificacoes e bloqueio progressivo;
   - testes de regressao e implantacao em dev.
