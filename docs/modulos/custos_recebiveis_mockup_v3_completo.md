# Custos e Recebíveis - Mockup V3 Completo

## Artefato

Arquivo navegável:

`/.codex-previews/custos-recebiveis-fluxy-v3-completo.html`

Esta versão preserva a V2 e reúne em um único protótipo os fluxos de obras
públicas e privadas.

## Cobertura funcional

### Obras públicas

- dashboard e comparativo por competência;
- cadastro de obras habilitadas;
- detalhe da obra e histórico mensal;
- abertura de competência em três etapas;
- medição prevista por item da planilha micro;
- planejamento de custos por etapa e subitem;
- consolidação e aprovação de medições;
- custo realizado por títulos a pagar e baixas ativas;
- importação versionada da planilha micro;
- exportações, prazos, bloqueios e permissões.

### Obras privadas

- dashboard e comparativo próprios;
- planejamento mensal de custos;
- previsão de recebíveis por contrato, unidade e parcela;
- contratos de venda como origem operacional;
- títulos de contas a receber, recebimentos e baixas;
- carteira, vencimentos e inadimplência;
- custo realizado, importações, exportações, prazos e permissões.

## Fontes oficiais

| Informação | Obras públicas | Obras privadas |
| --- | --- | --- |
| Cadastro da obra | `Obras` | `Obras` |
| Orçamento macro | Gerenciamento de Obra | Gerenciamento de Obra |
| Planejamento micro | Importação versionada do módulo | Importação versionada do módulo |
| Recebível previsto | Medição prevista/consolidada | Contrato de venda, unidade e parcelas |
| Recebível realizado | Medição aprovada vinculada ao financeiro | Título a receber com baixa ativa |
| Custo realizado | Título a pagar com baixa ativa | Título a pagar com baixa ativa |
| Ajuste manual | Valor, motivo, usuário e auditoria | Valor, motivo, usuário e auditoria |

## Segurança e escopo

- A permissão de ação não concede visibilidade de obra.
- Por padrão, o usuário opera apenas obras vinculadas.
- Visão global exige permissão independente e explícita.
- Diretoria, Financeiro e Superadmin não recebem acesso global implicitamente
  pelo nome do setor.
- Finalização, aprovação, importação, exportação e gestão de bloqueios possuem
  permissões próprias.
- O bloqueio global deve começar em modo de observação e nunca bloquear usuário
  por obra que não esteja vinculada a ele.

## Decisões preservadas

- O módulo é independente do Provisionamento.
- A planilha micro não sobrescreve o orçamento macro de Obras.
- Competências finalizadas são imutáveis; correções geram revisão auditada.
- Status de solicitação não comprova pagamento.
- Realizado financeiro usa exclusivamente baixas ativas.
## Cobertura consolidada da V3 completa

Esta versao substitui os mockups anteriores como referencia visual de aprovacao. Ela preserva as funcoes operacionais da V2 e acrescenta a separacao explicita entre obras publicas e privadas.

### Obras publicas

- dashboard por competencia;
- cadastro e abertura da obra;
- criacao do planejamento mensal;
- previsao de medicao por item da planilha micro;
- planejamento de custos por etapa e subitem;
- consolidacao e aprovacao de medicoes;
- comparativo previsto, medido, recebido e saldo;
- custo realizado originado de titulos a pagar com baixas ativas;
- historico de solicitacoes e titulos que compoem o realizado.

### Obras privadas

- dashboard por competencia;
- planejamento geral e mensal de custos;
- cadastro e acompanhamento de contratos de venda;
- unidades vinculadas aos contratos;
- previsao de recebiveis pelas parcelas dos contratos;
- titulos de contas a receber vinculados;
- acompanhamento de aberto, vencido, recebido e inadimplencia;
- realizado originado exclusivamente de baixas ativas dos titulos a receber;
- visao de cobranca e aging.

### Recursos compartilhados

- comparativo entre obras e competencias;
- lista de obras respeitando classificacao e escopo do usuario;
- importacao versionada da planilha micro;
- exportacoes operacionais;
- prazos, pendencias e bloqueios;
- configuracao de permissoes granulares;
- trilha de auditoria para registros manuais e mudancas de estado.

### Regra de separacao das fontes

- Obra publica: recebivel previsto e realizado vem do fluxo de medicoes.
- Obra privada: recebivel previsto vem dos contratos de venda e o realizado vem das baixas dos titulos de contas a receber.
- Custo realizado: em ambos os tipos, vem de titulos a pagar com baixas ativas e apropriacao na obra.
- Status isolado de solicitacao ou titulo nunca representa valor realizado.

### Limite desta entrega

O mockup e navegavel e serve para aprovacao funcional e visual. Nenhum controller, service, model, migration, rota ou componente de producao foi alterado nesta etapa.
