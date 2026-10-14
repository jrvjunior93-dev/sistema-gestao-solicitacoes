# Cadastro RH: salario DP, lotacao SUPERADMIN e centros em transferencias

## Autorizacao e escopo

- Cliente 14/10/2026, America/Sao_Paulo, sem delegacao.
- Usuario autorizou DP alterar salario direto, com vigencia/motivo/historico,
  e SUPERADMIN alterar obra/centro pelo cadastro com a mesma rastreabilidade.
- Transferencias devem incluir centros de custo. Permissoes/responsaveis/escopo
  existentes preservados; nao alterar permissoes de Luana ou usuarios no banco.
- Branch codex/rhdp-cadastro-salario-lotacao-20261014 sobre refactor/frontend
  9bc50308, worktree promocao-dp-main-20261014/Fluxy reutilizado.
- Usuario autorizou commit/push destes ajustes na refactor/frontend e comandos
  de atualizacao dev. Remoto conferido em 9bc50308 antes da publicacao.
  Sem main, execucao EC2, migration, .env, configuracao real, seeds/backfills
  ou reinicio pelo agente. outputs/ e caixa em outro worktree excluidos.

## Implementacao

- Salario: DP sem setor operacional OBRA, com concessoes nominais de
  rh_dp.colaboradores.editar E rh_dp.salario.aprovar. SUPERADMIN mantido.
  Backend consulta autorizacao efetiva; frontend helper correspondente.
  Historico/salario vigente preservados, motivo/autor inclusive no ajuste no
  mesmo dia. Vigencia futura nao antecipa salario e titulos nao recalculados.
- Lotacao: apenas SUPERADMIN; ativos/sem desligamento, destino ativo Obra/Centro,
  vigencia/motivo obrigatorios, ate hoje e nao anterior a admissao/vinculo atual.
  Sem lotacao futura antecipada; historico incoerente/transferencia pendente bloqueiam.
- Reutiliza RhColaboradorVinculo: fecha anterior no dia precedente e cria AJUSTE,
  mesmo dia atualiza registro com evidencia anterior/autor/motivo nas observacoes.
  Lock do colaborador/transacao serializa, rollback de cadastro/historico integral.
- Cadastro aceita limpar local (obra_id null) pela mesma regra. Demais perfis
  visualizam lotacao bloqueada, evitando formulario editavel recusado no save.
- Transferencias configuracao/abrir/efetivar e frontend aceitam OBRA/CENTRO_CUSTO
  ativos; mesmo criterio de responsabilidade/aprovacao e escopo, inclusive origem.
- UI compacta existente, mesmos componentes/combobox/datas e bloqueio de envio,
  seguindo frontend-design sem redesenho, novos modais ou decoracao.

## Arquivos

- rhService.js, rhVinculoObraService.js, rhTransferenciaService.js e rhValidators.js.
- RhDpColaboradores.jsx, RhDpTransferencias.jsx e acessoProduto.js.
- Novo validarRhLotacaoCadastro.js; consulta salarial, fluxo/escopo de transferencia
  e fixtures UI de contatos/cadastro e transferencia. README RH/DP/ownership/handoff.
- outputs/ e caixa nao commitado em outro worktree ficam fora de publicacao.

## Validacoes e limitacoes

- Backend lotacao: negativas DP/ADMIN/ADMINISTRADOR, data/motivo, mesmo dia,
  retroatividade/futuro, demissao/inativo, centro, sem local, pending, replay,
  concorrencia simulada e rollback de erro posterior aprovados.
- Consulta/salario: DP nominal positivo, sem aprovar/sem DP/OBRA acumulada e
  bypass ADMINISTRADOR negativos; historico, futuro, autor e rollback aprovados.
- Transferencias Obra->Centro/Centro->Obra, ativo/inativo, DP/outro responsavel
  e negativos aprovados. Escopo, seguranca direta e primeira lotacao aprovados.
- Contatos/importacao/planilha RH aprovados. UI cadastro DP autorizado/negado,
  lotacao SUPERADMIN, desktop/mobile e payload de vigencia/motivo aprovados;
  remount/revisao/403/rascunho e contatos preservados. Capturas inspecionadas.
- UI transferencia com Centro destino e permissoes aprovada. Build aprovado,
  avisos preexistentes de Browserslist/bundle. Autocomplete/cadastro de centros,
  navegacao 220 rotas/218 destinos, docs 513 Markdown/19 canonicos e diff aprovados.
- O teste antigo de escopo tinha regra obsoleta que excluia centros e fixture
  sem permissao Abrir. Ao alcancar novo gate tentou SELECT local sem credenciais
  e falhou; nenhuma operacao de negocio executada. Fixture agora simula config/
  vinculos/permissao e bloqueia query nao simulada, sem conectar ao banco.
- UI fixture corrigida: autocomplete real usa buttons, nao option; payload
  bruto em memoria conserva undefined que o JSON HTTP omite. Runtime nao
  alterado para contornar teste. Testes finais de UI aprovados apos correcao.
- Nenhuma migration/dependencia/flag nova. Testes com modelos/APIs simulados,
  sem homologacao real de Luana ou concorrencia entre processos/MySQL.

## Proximo passo

- Implementacao/testes concluidos, ownership liberado. Publicacao autorizada na
  refactor/frontend; stagear somente arquivos desta tarefa, sem outputs/.
- Comandos dev conferem branch/SHA/limpeza versionados, ausencia de delta
  schema/dependencias, UUID 60f043e9-4025-11f1-9a61-06d8a063012d e banco
  gestao_solicitacoes, processo backend-dev/checkout/porta distinta de 8000.
  Schema somente leitura; sem migrations e reinicio somente de backend-dev.
- Homologar Luana com as duas permissoes, salario/motivo/vigencia, negativos,
  SUPERADMIN lotacao e transferencia envolvendo Centro. Aprovar dev antes de main.
- Nao alterar registros reais por script nem instalar migration para esta entrega.
