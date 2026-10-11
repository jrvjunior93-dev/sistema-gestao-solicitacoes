# DP - dias informativos e salvamento discreto - 10/10/2026

## Escopo e autorizacao

Usuario pediu passo de um dia, faltas apenas informativas e dias calculados
somente para diaristas; tambem pediu eliminar a sensacao de pequenas recargas
ao salvar. Base refactor/frontend bea8b8e2. Usuario autorizou commit e push
das pendencias na refactor/frontend em 10/10/2026. Sem main, deploy, migration
ou acesso/escrita em banco real. Pessoal/DP
continua excluido de producao ate autorizacao separada.

## Mapeamento e causa

- Componente RhDpPagamentoModal.jsx nas acoes individuais/coletivas de Pessoal
  e na abertura pelo DP. Mesmo PUT /rh/pagamentos-solicitacao/:id e POST
  /rh/pagamentos-solicitacao/:id/enviar; nenhuma rota/permissao foi alterada.
- Autosave antigo chamava operacao(salvar), que desabilitava o fieldset e a
  toolbar. receber(result) substituia o formulario em toda gravacao.
- Calculo independente em rhPagamentoSolicitacaoDomain.js era proporcional
  por dias e descontava faltas. Corrigido no backend e no frontend.

## Regras implementadas

- Dias e faltas com step 1, limites 0..31; faltas nao limitadas aos dias, pois
  sao informativas. Valores fracionarios legados nao sao truncados/regravados
  automaticamente; o passo do controle e inteiro.
- Mensalista: bruto = salario_base * percentual / 100, independente de dias
  e faltas. Diarista: bruto = valor_diaria * dias, independente de faltas.
- Liquido = bruto + acrescimos - descontos; regras de vale, classificacao,
  reembolso agrupado, beneficiario e conferencia continuam vigentes.
- Autosave permanece com debounce 900ms; mostra estado apenas no rodape
  existente e nao bloqueia inputs. Campos mantem foco/texto/rolagem; resposta
  atualiza revisao/metadados sem substituir edicoes feitas durante o request.
- Uma gravacao por vez. Fechar/salvar/enviar esperam a gravacao em andamento
  e persistem as edicoes posteriores antes de prosseguir. Falha conserva
  formulario e estado pendente, informa erro e interrompe retry automatico.
- Geracao financeira continua bloqueada durante a acao explicita, com a
  protecao contra cliques repetidos e transacao/lock/revisao do backend.
- Solicitacoes APROVADA mostram bruto/liquido do snapshot armazenado, nao
  aplicam a nova regra retrospectivamente; titulos ja gerados nao mudam.
- Nenhum calculo de jornada/apuracao/fechamento legado foi alterado.

## Arquivos

- frontend/src/components/rh/RhDpPagamentoModal.jsx
- backend/src/services/rhPagamentoSolicitacaoDomain.js
- frontend/scripts/validarRhPagamentoSolicitacaoUI.mjs
- backend/scripts/validarRhPagamentoSolicitacao.js
- docs/modulos/rh-dp/README.md
- docs/workspace/OWNERSHIP_ATIVO.md e este handoff

## Validacoes concluidas

- Dominio/servico real em memoria: 40/60/100, dias 0/1/15/30/31 e faltas
  0/10/31 sem alterar mensalista, diaria apenas por dias, limites/negativos,
  persistencia de dias/faltas, titulo mensal correto e titulo diario 470
  (5 * 100 + 20 - 50, mesmo com 10 faltas); pagamentos existentes preservados.
- Regressao vales agrupados, discriminacao, dados bancarios, isolamento de
  empresas, rollback, escopo, conferencia, idempotencia e governanca.
- Chrome/Playwright, modal real e API isolada: passo de 1 com ArrowUp/Down;
  calculos imediatos; autosave lento sem desabilitar, perder foco/rolagem ou
  sobrescrever digitacao; maximo de um PUT em voo; fechar/enviar durante PUT
  persiste a ultima edicao e usa revisao correta; falha automatica/manual
  recuperavel sem retry infinito; snapshot aprovado preservado.
- Regressao UI 100%, conferencia Obra/DP, vales, conta salario, envio com
  duplo clique, desconto adiado por Escape, permissoes e viewport 390px.
- Backend test:rhdp-pessoal-solicitacao, test:rhdp-regras-pagamento e
  test:fila-pagamentos aprovados; sintaxe e git diff --check aprovados.
- npm run build frontend aprovado (551 modulos); apenas avisos existentes
  Browserslist desatualizado e chunk >500k. Captura desktop inspecionada,
  layout corporativo compacto preservado com a skill frontend-design.

## Riscos e proximo passo

Sem migration. Homologacao real pendente. Frontend/backend precisam ser
publicados juntos para nao divergir valor exibido e titulo gerado. Pedidos
nao concluidos passam a usar a nova regra ao editar/conferir/gerar; rever seus
valores antes do envio. Ja concluidos nao sofrem ajustes financeiros.

Ownership liberado; commit/push DEV autorizados. Depois da publicacao,
fornecer comandos DEV se solicitado. Na homologacao, mudar dias/faltas
de mensalista, mudar dias de diarista, editar continuamente com rede lenta,
fechar/reabrir e enviar Obra -> DP -> fila. Nao reconciliar titulos existentes.
