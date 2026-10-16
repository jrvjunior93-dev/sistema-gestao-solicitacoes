# Performance da fila e consultas DP - 2026-10-15

## Escopo e isolamento

Usuario autorizou implementar/publicar em refactor/frontend, manter permissoes e
regras e fornecer comandos EC2 DEV. Depois autorizou paginacao da fila e selecao
entre paginas e pediu aplicar a TODOS os cards, inclusive Baixados/Resolvidos.
Agente unico, sem delegacao. Worktree gerenciado performance-fila-dp-20261015,
branch codex/performance-fila-dp-20261015, base da9cf569.

Nao acessar ou alterar producao/main, executar migrations, alterar flags/pool,
reiniciar EC2/PM2 real ou usar banco/S3 reais. Contratos totalmente medidos de
outro worktree foram preservados e NAO estao incluidos. outputs/ de QA nao publica.

## Implementacao

- Fila: pagina/limite opcionais; UI usa 50, API maximo 100. Todas as situacoes
  e historico acumulado acessiveis; consumidores antigos conservam contrato.
  SQL filtra antes do limite e busca usa WHERE externo aos JOINs. Comprovantes
  separados evitam multiplicacao 1:N. Contagens sem busca evitam JOINs extras.
- Rejeicoes: ultima decisao real de cada titulo, sem fila ativa; IDs negativos
  apenas de consulta. Paginas podem conter fila real + rejeicoes sem perder IDs.
- Recebimento DP: snapshot por solicitacao em lotes de 100, apenas modo do titulo
  solicitado no DTO. Legacy/reembolso por empresa/EM_EDICAO/PIX preservados.
  Expansao JSON de linhas somente no fallback do filtro, nao na exibicao por titulo.
- Selecao mantida entre paginas do mesmo recorte, cache somente em memoria;
  marcar/desmarcar todos afeta a pagina atual. Troca de filtros/status limpa.
  GET por fila_ids (maximo 100 por consulta) revalida selecao antes de mutar.
  Mudanca fora da pagina bloqueia o lote; backend conserva locks, ACL e auditoria.
  Baixa continua limitada a 200/operacao e comprovante compartilhado a 100.
- Relatorio: universo leve autorizado para duplicidades/catalogos, filtros e
  contagens no SQL, historico/DTOs apenas da pagina. Nao perde alerta entre paginas.
- Solicitacoes DP: metadados compactos antes da paginacao para preservar estado
  legado normalizado e privacidade; snapshots completos apenas da pagina.
  Booleano selecionado conserva JSON true/false, nao converte false em inteiro 0.
  Primeira lotacao/origem sem obra continuam distinguindo transferencias.
- Polling serial em solicitacoes/transferencias/sino/popup, pausa oculto,
  backoff 60/120/240s; respostas obsoletas ignoradas. Secao Todos Colaboradores
  desativa polling da lista de transferencias. Contador DP usa evento do sino
  com usuario_id, sem consulta periodica duplicada ou cache global entre usuarios.

## Validacoes

- Backend: test:performance-fila-dp (640 salarios/1 leitura de snapshot;
  533 pedidos/11 paginas; relatorio 613 titulos/13 paginas; SQL MySQL real gerado
  com execucao interceptada; 530 itens + 30 rejeicoes em paginas mistas;
  todos os 8 status com pagina depois de 500; negativas de IDs/paginacao/escopo).
- Regressoes: baixa/estorno, comprovantes individual/lote, juros/multa, cartao,
  instrumentos, analise do proprietario/revogacao, pagamento/envio parcial DP,
  hardening e seguranca de acesso direto (2304 comparacoes, 66 escopos e 48 rotas).
- Navegador real/APIs em memoria: fila e instrumentos/filtros, 650 titulos e
  13 paginas em todos os status, selecao multipagina, anexo sem baixa, stale
  fora da pagina bloqueado, desktop/mobile; relatorio e solicitacoes paginados;
  transferencias com filtros/respostas obsoletas; sino/popup; polling com React
  real e timers simulados. Nenhuma chamada a API externa.
- Build, navegacao/abas e documentacao verificados; avisos preexistentes de
  Browserslist e chunk grande nao foram tratados nesta tarefa.
- Fixture antiga validarRhPessoalPorLocal aguardava criacao em path vazio,
  embora o modal ja usasse /preparar na base. Atualizada somente a fixture para
  permitir a verificacao do fluxo atual; sem alteracao do modal de pagamento.

## Limites da conclusao

Nao houve benchmark, EXPLAIN nem consulta no RDS real. Paginar reduz transferencia
e materializacao; contagens, filtros JSON e metadados de duplicidade ainda trabalham
sobre o universo autorizado e devem ser medidos com historico/carga reais em DEV.
Estas correcoes mitigam carga/timeouts, mas NAO comprovam nem garantem resolver a
causa dos reinicios do RDS de 15/10. Nenhum dado/historico foi removido.

## Proximo passo exato

Publicar somente este delta em refactor/frontend (sem main/contratos/outputs).
Usuario atualiza exclusivamente /home/ubuntu/sistema-gestao-solicitacoes-dev e
executa bash ops/deploy/atualizar-dev-performance-fila-dp-20261015.sh.
Script confere branch/checkout limpo, roda testes, valida ambiente/processo
backend-dev, porta 8001, host/UUID/banco DEV, flags e schema em somente leitura.
Sem migration nova; schema pendente aborta, nao aplica automaticamente. Reinicia
somente backend-dev e verifica health. Depois homologar 500+ titulos, todos os
cards/status, filtros/empresa/credor/recebimento, paginas, selecoes/limites e DP.
Comparar tempos da aba Network, logs de acquire timeout e recursos do banco DEV.
Se erro ou latencia alta, enviar evidencias e nao promover para producao.
