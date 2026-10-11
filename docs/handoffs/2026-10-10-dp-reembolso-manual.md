# DP - reembolso manual e retorno para obras - 10/10/2026

## Escopo e autorizacao

Usuario pediu eliminar abertura automatica durante digitacao do desconto,
considerando suficiente a acao manual `Solicitar reembolso`, e renomear
`Voltar aos locais` para `Voltar para Obras`. Base refactor/frontend c406f18f.
Implementacao autorizada para commit/push em refactor/frontend e entrega de
comandos da EC2 dev. Sem main, deploy, migration ou banco real pelo agente.
Pessoal/DP continua excluido da producao sem autorizacao separada.

## Mapeamento e implementacao

- Modal RhDpPagamentoModal.jsx: removidos timer 650ms, abertura no blur,
  pergunta previa e guarda de classificacao ao enviar. Nenhuma abertura
  automatica ao digitar/pausar/sair do campo ou enviar a solicitacao.
- Desconto positivo mostra `Solicitar reembolso`; clique abre diretamente
  editor de reembolso com colaborador/valor, responsavel e dados de pagamento.
  Reembolso ja informado usa `Reembolso de vale` para revisao.
- Voltar/Cancelar/Escape fecha somente editor, sem solicitar reembolso novo
  nem remover o desconto. `Sem reembolso` permite remover uma escolha anterior.
- Ao alterar o valor do desconto, limpa o reembolso anterior e exige nova
  acao manual para reembolso; evita reaproveitar uma decisao para outro valor.
- Backend normaliza desconto comum automaticamente, sem exigir classificacao
  explicita para enviar. O flag legado desconto_sem_reembolso permanece para
  compatibilidade. Solicitacoes anteriores sem flag podem seguir normalmente.
- Opcao manual de reembolso persiste mesmo antes da selecao do colaborador;
  enviar/gerar titulos continua restrito a linhas selecionadas/conferidas.
- Mesmos endpoints PUT/POST /rh/pagamentos-solicitacao/:id[/enviar]. Nenhuma
  mudanca nas permissoes, lock/revisao, vigencia de responsaveis, conta/PIX,
  categoria salarial, empresa, agrupamento, idempotencia ou transacao da fila.
- Autosave discreto e calculos de dias/faltas publicados em c406f18f preservados.
  Descontos maiores que o pagamento continuam proibidos; nao houve dispensa
  dessa validacao financeira nem alteracao de titulos ja gerados.
- RhDpPessoal.jsx: apenas rotulo `Voltar para Obras`; callback e parametros
  de navegacao preservados, inclusive obras e centros de custo.

## Arquivos

- frontend/src/components/rh/RhDpPagamentoModal.jsx
- frontend/src/pages/RhDpPessoal.jsx
- backend/src/services/rhPagamentoSolicitacaoService.js
- backend/scripts/validarRhPagamentoSolicitacao.js
- frontend/scripts/validarRhPagamentoSolicitacaoUI.mjs
- frontend/scripts/validarRhPessoalPorLocal.mjs
- docs/modulos/rh-dp/README.md, docs/workspace/OWNERSHIP_ATIVO.md e este handoff

## Validacoes

- Servico real com modelos em memoria: desconto comum reduz salario e gera
  apenas um titulo salarial (3000 - 75 = 2925), sem reembolso implicito;
  pedido anterior sem classificacao segue; reembolso manual conserva dados
  antes de selecionar linha e rejeita responsavel fora da vigencia/local.
- Regressao calculos, conferencia, escopo, vales agrupados/discriminados,
  conta salario/outra conta/PIX, conflito, atomicidade, replay e governanca.
- Chrome/Playwright real/API isolada: pausa na digitacao e blur nao abrem modal;
  link abre direto; cancelar/Voltar/Escape conserva desconto; envio comum
  passa sem pergunta e mostra liquido correto; agrupamento/prefill continuam.
- Regressao do modal em desktop/mobile: 100%, dias/faltas, diaria, autosave
  com rede lenta, edicoes em voo, fechar/enviar serializados, falha recuperavel,
  double click, permissoes e snapshot aprovado.
- Backend test:rhdp-pessoal-solicitacao, test:rhdp-regras-pagamento e
  test:fila-pagamentos aprovados; sintaxe e diff check aprovados.
- Frontend build aprovado (551 modulos, somente avisos existentes de
  Browserslist/chunk >500k). Captura desktop inspecionada; layout compacto
  preservado usando a skill frontend-design.
- UI Pessoal nos tres modos (legado, etapas e gerencial) aprovada: novo rotulo
  retorna aos cards e permite abrir obras/centros sem alterar escopo ou abas.

## Proximo passo e riscos

Commit/push DEV autorizado pelo usuario; conferir hash remoto e entregar
comandos fixados no commit publicado. Nenhum deploy executado pelo agente.
Frontend e backend precisam ser publicados juntos para que
o backend antigo nao exija a classificacao removida da tela. Sem migration.
Homologar manualmente digitar desconto, usar outro campo, abrir/cancelar e
confirmar reembolso, conferir, enviar e consultar titulo agrupado na fila.
Nao alterar main, titulos existentes ou banco real nesta etapa.
