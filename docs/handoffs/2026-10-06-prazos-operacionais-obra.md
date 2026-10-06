# Handoff — prazos operacionais da Obra

## Autorização e estado

Proprietário confirmou a estrutura extensível e primeira etapa somente para informação de entregas. Implementação local no worktree `promocao-main-20261003/Fluxy`, baseado na main `d2b602b6`. Sem banco real, migration aplicada, ativação, commit/push ou deploy.
Preservadas as alterações anteriores de quantidades BR e pagamento de medição legada, ainda não publicadas.

Pedido seguinte em 06/10/2026 autorizou commit e push deste conjunto junto das
correções anteriores. Worktree já em main; publicação pelo commit que contém
este registro. Banco, migration, reinício da EC2 e ativação continuam pendentes.

## Arquivos e integrações

- Migration `202610060001_prazos_operacionais.js`, models `ObrigacaoOperacional`/`ObrigacaoOperacionalLiberacao` e registro no index: ciclos com snapshots e liberações idempotentes, sem backfill e configuração inicialmente off.
- `prazosOperacionaisDomain/Service/RotaService`: configuração com revisão, cálculo São Paulo, horas/dias úteis/corridos, tolerância, aviso, feriados, geração e encerramento na transação, estado por usuário/obra, resolvedores de recursos/lotes e exceções temporárias.
- `controlePrazosOperacionais`, controller e routes: guarda de mutações, consulta e regularização livres sem ampliar permissões, configuração Status/Vínculos e liberação SUPERADMIN. Importação de apropriações repete a guarda após multipart.
- `pedidoCompraService` registra obrigações na previsão inicial; `pedidoEntregaService` abre ciclos em reprogramação e encerra em entrega/parcial/não entrega/cancelamento. Itens novos não ficam sujeitos ao bloqueio legado antes do prazo/tolerância.
- `SolicitacaoController` enriquece listas com prazo e substitui alerta legado conflitante dos itens adotados.
- `PrazosOperacionaisConfig`, service frontend, App/nav/catálogo gerado, Layout e eventos de API; contador na **lista atual** `Solicitacoes/index.jsx` (tabela/cards), e na linha legada. `PedidoEntrega` não promete o bloqueio antigo antecipado.
- Scripts `validarPrazosOperacionais.js/.mjs`, scripts npm e teste existente de entregas ampliado para hooks transacionais e replay.
- Manual de operação/mapeamento: `docs/PRAZOS_OPERACIONAIS_OBRA.md`.

## Verificações executadas

- Testes isolados de prazos: off, início futuro, datas inválidas, referências Brasil, horas/dias, fins de semana/feriado, tolerância, snapshots, CAS da configuração, geração/encerramento/reprogramação, setor/vínculo, expiração/liberação/retry, lotes, origem persistida, capitalização de URL, multipart e indisponibilidade fechada.
- Entregas backend (domínio, transação simulada, versão, parcial/não entrega, histórico, replay, rollback de lote e contexto de acesso). Fluxos de Compras não transferem atraso do fornecedor de volta à Obra sem nova previsão.
- Navegador local com página, services HTTP reais e APIs simuladas: off, configuração horas úteis, transporte JSON, liberação/retry, correção do relógio, aviso e consulta, página real da lista com contador desktop/mobile; 375/768/1366px e tema escuro. Capturas em `outputs/prazos-operacionais-qa/`, inspecionadas.
- UI de entrega real, navegação/catalogos, remanejamento de compras, bloqueio financeiro por retorno e 72 rotas granulares financeiras.
- Regressões das alterações locais anteriores: quantidades/rateio/rascunho/total CD e pagamento medição legada.
- Build frontend e verificação sintática/diff conforme resultado final da sessão. Avisos existentes de Browserslist antigo e chunks grandes não são falhas.

## Riscos e condições

Primeira configuração permanece desligada. Não prometemos que pedidos antigos serão bloqueados: não há backfill. Modo/cobrança podem pausar ciclos existentes; durações não os reescrevem.
Mutações em módulo protegido cujo contexto não puder ser identificado são recusadas para usuário com obra bloqueada, evitando `obra_id` forjado. Mapear recursos indiretos/importações multiorigem antes de conceder novas ações à Obra e confirmar esses endpoints na homologação. Não usar esse fallback para anunciar que qualquer mutação global sempre será permitida em outra obra.
GET/HEAD ficam disponíveis; POSTs de preview/importação ainda são operações protegidas. Cadastros globais independentes e comunicação continuam livres. Não há overlay total/redirect, pois isso impediria consulta e regularização.
Uma liberação temporária desta regra não remove controle de caixa, permissões ou custos/recebíveis. O usuário precisa ter consulta/vínculo para acessar a regularização. Administrativos e SUPERADMIN não são alcançados pela nova guarda.
Outros tipos são somente candidatos desativados com estrutura genérica de persistência; gatilhos de cobrança dessas futuras regras ainda não foram implementados.

## Correção de compatibilidade com o runner — 06/10/2026

Ao preparar os comandos da EC2, identificado que o seed da configuração era
recusado pela política estrutural do runner. Proprietário autorizou corrigir,
validar e publicar, sem qualquer inserção direta em produção.

- Seed removido de `202610060001_prazos_operacionais.js`: somente CREATE TABLE.
- Ausência da configuração continua retornando padrão desligado em memória.
- `salvarConfig` passa a criar a chave exclusivamente no salvamento autorizado
  da tela, com validação, revisão, autor e auditoria do controller existente.
- Transação SERIALIZABLE/leitura bloqueante cobre chave ausente, sem depender
  de índice único que ConfiguracaoSistema não garante; concorrência, deadlock
  e timeout retornam 409 para recarregar, sem sobrescrita silenciosa.
- Validador ampliado executa o runner real com banco/SQL simulados, incluindo
  política do fonte/SQL, registro técnico de execução, reexecução idempotente,
  ausência de gravação nas consultas, concorrência da primeira configuração
  e auditoria do primeiro salvamento pelo controller. Entregas e UI revalidadas;
  nenhuma conexão/env de produção ou migration real.
- Runner/política não alterados. Publicação autorizada em main pelo commit
  desta correção. Deploy, backup, migration e ativação seguem pendentes na EC2.

## Próximo passo após a correção

Após autorização, publicar este conjunto junto das correções anteriores pendentes. Aplicar a migration pelo runner do backend no ambiente correto, sem ativação automática. Publicar frontend e reiniciar exclusivamente o processo PM2 correspondente.
Abrir Configurações → Status e Vínculos → Prazos operacionais, definir início/calendário/horário/duração e começar em Observar. Homologar previsão nova, contador, atraso, duas obras, dois responsáveis, regularização parcial/não entrega e nova previsão. Somente então passar a Bloquear. Não alterar dados de produção para criar retroatividade.
