# Pagamento DP por solicitacao - 10/10/2026

## Autorizacao e estado

Implementacao local autorizada pelo usuario apos confirmar: descontos reduzem o
liquido inclusive em 40%; geracao de titulos somente pelo DP; uma nova solicitacao
independe de pagamentos anteriores do colaborador, que apenas geram aviso.
Base: refactor/frontend, 34fa7c5b. Usuario autorizou commit e push das pendencias
na refactor/frontend em 10/10/2026; esta publicacao inclui frontend e backend.
Sem main, deploy, migration ou banco real.
O pacote de Pessoal/DP segue separado da producao ate autorizacao explicita.

## Fluxo implementado

- Modal unico nas acoes individual/coletiva de Pessoal e na abertura das novas
  solicitacoes de pagamento. Nao exige etapa de "Montar lista".
- Colaboradores ativos do local, selecao individual/todos; 40%, 60% ou 100%
  (ambos/nenhum marcado); percentual inativo para diaria. Dias/faltas,
  acrescimos, descontos, bruto/liquido, observacoes e recebimento por linha.
- Mensal: salario_base * (dias - faltas) / 30 * percentual. Diaria:
  valor_diaria * (dias - faltas). Acrescimos/descontos entram integralmente.
  Descontos iniciam zerados, inclusive no 40%.
- Ao sair do campo de desconto, pergunta sobre vale/reembolso. Confirmado,
  seleciona responsavel/substituto vigente do cadastro de responsaveis da obra
  (CrResponsavelObra) e informa CPF/CNPJ e recebimento do favorecido.
- Recebimento Pix/Copia e Cola, conta salario cadastrada ou outra conta.
  Alteracoes sao snapshots deste pagamento: nao sobrescrevem cadastro global.
- Rascunho privado do criador por local/acao individual ou coletiva, salvo no
  servidor automaticamente e ao fechar. Conferencia Obra e DP separadas;
  editar dados limpa a marcacao correspondente. Revisao impede sobrescrita
  de outra aba. Erro de gravacao mantem modal aberto e nao gera retries infinitos.
- Obra envia ao DP sem criar titulos. DP abre o mesmo modal, confere e envia
  para a fila. Criacao dos titulos, auditoria, conclusao e fila na mesma transacao.
- Salario liquido e reembolso de vale geram titulos distintos PAGAR, categoria
  canonica 2.01.02.01 - Salarios e Ordenados, obra e empresa do colaborador.
  A soma nao duplica o vale: ele e subtraido do salario e pago ao responsavel.
- Lock da solicitacao evita repeticao/double-click; documento inclui id da
  solicitacao. Pagamentos anteriores nao sao reaproveitados/acumulados/editados.
- Permissoes de apuracao, fechamento e envio nominal para fila continuam
  obrigatorias. Governanca da fila (pausa/autorizacao do proprietario) preservada:
  se recusar o envio, reverte a geracao inteira. Nao ha bypass.

## Compatibilidade e dados

Novos registros usam RhSolicitacao tipo JORNADA, subtipo/fluxo
PAGAMENTO_POR_SOLICITACAO, solicitacao_independente=true e dados_json.
Nao ha migration nova. Anexos, historico e registros existentes nao foram
regravados. Titulos vao aos relatorios financeiros pela categoria/obra/empresa.
Nao sao acumulados em fechamento mensal legado; a nova unidade de conferencia
e geracao e a solicitacao. Jornadas/importacoes e fechamentos antigos conservam
seus servicos e telas de consulta/conferencia, sem conversao automatica.

## Arquivos

- backend/src/services/rhPagamentoSolicitacaoDomain.js e Service.js;
  controllers/RhPagamentoSolicitacaoController.js; routes.js.
- rhFechamentoService.js: exporta primitivas de favorecido/categoria/payload,
  sem mudar calculo/acumulo/reconciliacao legados.
- pagamentoManualFilaService.js: aceita transacao interna fornecida pelo
  chamador; sucesso posterior ao commit. Via existente mantem transacao propria.
- RhSolicitacaoController.js: lista/detalhe preservam privacidade do novo rascunho.
- frontend/src/components/rh/RhDpPagamentoModal.jsx; pages/RhDpPessoal.jsx e
  RhDpPessoalSolicitacoes.jsx; services/rhDp.js; rh-pagamento-solicitacao.css.
- Scripts backend/scripts/validarRhPagamentoSolicitacao.js,
  frontend/scripts/validarRhPagamentoSolicitacaoUI.mjs e validarRhPessoalPorLocal.mjs.

## Validacoes executadas (sem banco/rede externa)

- Novo dominio/servico real com modelos transacionais em memoria: calculos,
  diaria, descontos no 40%, rascunho, escopo/privacidade, revisao, conferencia,
  reembolso, pagamentos independentes, replay simultaneo, permissao e rollback.
- Funcao canonica de enfileirar executada com modelos em memoria: transacao
  externa/propria, auditoria apos commit, negativas nominal e proprietario.
- UI real Playwright/Chrome: percentuais, diaria, selecao, vale, recebimento,
  conta salario, retomada, invalidacao, envio Obra/DP, double-click, falha de
  gravacao sem fechamento/retry, permissao, desktop e 390px. Capturas em outputs/.
- Pessoal por local: legado, etapas e gerencial; centros de custo, ativos,
  cadastro global, permissoes e conferencia/fechamento antigos aprovados.
- Backend: pessoal-solicitacao, fila-pagamentos, fila-instrumentos,
  rhdp-regras-pagamento, sintaxe e git diff --check aprovados.
- Build frontend aprovado (avisos existentes Browserslist/chunk >500k).

## Proximo passo

Commit e push DEV autorizados pelo usuario, com revalidacao do dominio/servico,
modal desktop/mobile, Pessoal nos tres modos, pessoal-solicitacao,
fila-pagamentos/instrumentos/governanca, regras RH/DP, sintaxe, diff e build.
Depois de atualizar frontend e backend em DEV, testar uma solicitacao real Obra -> DP -> fila,
mais uma criada diretamente pelo DP, com Pix, conta salario e reembolso.
Conferir os relatorios e dados reais de responsaveis/categoria/formas cadastradas.
Nao promover Pessoal/DP para main sem novo pedido explicito do usuario.
