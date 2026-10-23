# Reprogramacao parcial de saldo de contrato - 23/10/2026

## Escopo

Usuario pediu explicacao sobre Compra Direta/pagamentos da negociacao e
permitir programar somente parte do saldo contratual, mantendo sobra para
novas programacoes. Relatou cursor saltando na digitacao de valores.
Agente unico, base origin/refactor/frontend d64137c7, branch local
codex/contrato-reprogramacao-parcial-20261023 no checkout de trabalho ja
existente. Sem alterar main/producao, EC2, banco real, flags ou dependencias.
Inicialmente sem commit/push. Em seguida usuario autorizou commit/push DEV
e comandos EC2 para homologacao, sem alterar producao. Outputs privados preservados.

## Mapeamento e alteracao

- ReprogramarSaldoContrato e usado dentro de BlocoMedicaoContrato na Nova
  Solicitacao. GET/POST /contratos/:id/saldo-reprogramacao continuam sob modulo
  CONTRATOS, requireContratoAccess e limite critico no POST. Service exige
  editar contratos estrito ou criar solicitacao pelo setor OBRA com vinculo.
- Tela e validarCronograma exigiam igualdade da soma com o saldo. Agora
  permitem soma positiva ate o saldo livre calculado no contexto bloqueado.
  Nenhuma mudanca em calcularDisponivel/calcularSaldoDoContrato. Parcela
  anterior livre continua reservada e nao gera dinheiro duplicado.
- Criar somente as novas parcelas/titulos PREVISAO no fluxo atual e rateios
  existentes; devolver valor_reprogramado real e saldo_disponivel_restante.
  Historico usa os valores reais desta operacao, preserva registros anteriores.
- ACL, lock do contrato/parcelas, referencia stale, replay persistente,
  rollback atomico, cronograma limite24, contrato ativo/fluxo novo e bloqueio
  de totalmente medido pelo GEO permanecem.
- Input monetario guarda texto durante digitacao, formatando apenas no blur,
  sem alterar formatadores globais. UI mostra sobra ou excesso, nao exige
  consumir todo o saldo. Reconsulta parcelas E saldo depois de criar; permite
  segunda reprogramacao na mesma tela com nova referencia. Falha de consulta
  mantem modo recarregar sem repetir POST, mesmo ao fechar/reabrir o painel.
- Skill frontend-design usada exclusivamente para interacao/estados do
  formulario operacional compacto; sem alteracao de identidade visual.

## Arquivos

- backend/src/services/contratoSaldoReprogramacaoService.js
- frontend/src/components/contratos/ReprogramarSaldoContrato.jsx
- backend/scripts/validarContratoSaldoReprogramacao.js
- frontend/scripts/validarContratoSaldoReprogramacaoUI.mjs
- docs/modulos/financeiro/README.md e ownership desta tarefa.

## Validacao e estado

Backend parcial/total, sobra e segunda programacao, reserva, centavos,
negativos/zero/excesso, replay concorrente, conflito stale, ACL/obra, limite24,
rollback e pagamentos/parcelas/contrato anteriores intactos aprovados em
modelos simulados, sem banco/rede. Exemplo do print:49000 livres,2800 programados,
46200 livres; nova programacao1200,01 deixa44999,99, ate consumir totalmente.

UI local em Chrome1366/390: teclado sequencial, cursor/edicao no meio,
backspace/colar/BRL/decimal, formatacao no blur, parcial, sobra, segunda
programacao com referencia nova, total, negativo/zero/excesso, duplo clique,
Enter sem enviar formulario principal, previsao selecionavel, ACL e falhas de
gravacao/consulta com retomada sem segundo POST aprovados.

Regressoes aprovadas: contrato totalmente medido (backend/UI), gestao operacional,
vigencia/negociacao de aditivos, aprovacao exclusiva/retorno Obra, favorecidos,
valor medido/pagamento (backend/UI), recarga/medicao, pagamento negociado e
Compra Direta. Build final:637modulos/17,49s; apenas avisos preexistentes de
Browserslist/chunk grande. Documentacao e diff conferidos. Captura mobile390
inspecionada, sem transbordamento e mantendo interface operacional anterior.
Testes isolados nao substituem homologacao MySQL real. Sem migration nova.

## Proximo passo

Implementacao/testes locais concluidos; publicacao DEV autorizada em seguida.
Sem migration nova. Operador deve usar SHA publicado exato e roteiro abaixo.
Homologar DEV com contrato de teste e saldo livre, programando somente parte,
conferir nova previsao e sobra; nunca repetir baixa/estorno real como teste.

## Publicacao exclusiva DEV

Roteiro ops/deploy/atualizar-dev-contrato-reprogramacao-20261023.sh e QA
backend/scripts/validarDeployContratoReprogramacaoDev.js reservados nesta etapa.
Exige base d64137c7 ou descendente ate o SHA alvo, branch/check-out DEV limpos,
flock, PM2 DEV8001 online sem watch/DDL automatico, sessao12h/UUID/banco/schema
conferidos somente por leitura antes e depois. Comparacao Git exige somente
os dois runtimes desta correcao, packages/locks/migrations sem alteracoes.
Merge ff-only, QAs isolados antes do restart somente backend-dev sem update-env,
hash .env preservado e health8001. Nao cria parcelas/baixas reais no deploy.
Sem npm install, migration, mudanca de sessao/flags/TLS, EC2 pelo agente ou main.
Se interromper, nao contornar as guardas; enviar saida sem segredos.
QA cobre blocos Node reais em VM, positivos/negativos de PM2/DDL/inventario,
ordem preflight/testes/restart/health e preservacao da configuracao.
Validacoes repetidas para publicacao:12 suites backend (incluindo QA roteiro e
seguranca2304comparacoes/48rotas), tres suites UI desktop/mobile, build637/13,68s,
documentacao606/19, Bash -n/diff e inventario de dois runtimes aprovados.
Packages/dependencias/locks/migrations intactos. Pronto para commit/push
exclusivo DEV; publicacao nao equivale a EC2 atualizada ou homologacao MySQL real.
