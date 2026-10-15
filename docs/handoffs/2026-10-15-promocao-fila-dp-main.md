# Promocao filtros da fila / recebimento DP para main - 2026-10-15

## Autorizacao e ownership

- Agente unico, sem delegacao. Reservados: integracao, script PROD, teste isolado,
  registro de ownership e este handoff; sem alteracoes funcionais adicionais.
- Usuario homologou em dev e autorizou promocao; backup recente no Drive cifrado
  conferido e timer ativo confirmados especificamente nesta promocao.
- Main congelada: 41e154f4c665ddd5bc1da88c384203de4d5c34ef.
- Refactor homologada: da9cf5696f0cff7ef9a8d7acf2480a3e1acbb851.
- EC2 no mesmo SHA main; consulta do usuario confirmou UUID de producao
  5ed4b970-009f-11f1-809c-0ad0e0c90c53, banco gestao_solicitacoes e nenhuma
  migration pendente. Delta nao altera backend/migrations.
- EC2 tem tres arquivos nao rastreados de auditoria/catalogo; preservar sem
  git clean, sobrescrita ou inclusao. Nenhuma mudanca rastreada informada.

## Plano e limites

- Integracao criada de origin/main; incorporar refactor por merge de historicos,
  preservando scripts, handoffs e correcoes exclusivos de producao.
- Filtros empresa/credor/origem/recebimento, DINHEIRO e relatorio DP exatamente
  como homologados. Nao mudar permissoes, escopo, pagamentos ou dados historicos.
- Script novo exclusivo PROD: validar checkout/main/ancestrais/mutex, testes,
  PM2/caminho/porta8000/flags, banco/schema somente leitura, restart exclusivo
  backend-solicitacoes e health. Sem migration/seed/backfill, .env ou flags.
- Nao executar deploy/DB/PM2/S3/Vercel pelo agente; comandos sao do operador.
- Rollback: codigo 41e154f4 e artefato Vercel anterior compativel, sem down,
  limpeza de dados ou reversao de pagamentos. Preservar auditoria e anexos.

## Integracao e recuperacao

- Branch de integracao criada da main congelada; merge preservou todos os
  arquivos exclusivos de producao. Conflito somente em OWNERSHIP_ATIVO,
  resolvido preservando ambos os historicos. Sem arquivos removidos de main.
- backend/src, frontend/src, manifestos/lockfiles e migrations iguais a refactor
  homologada. Dois testes mantiveram automaticamente seus adaptadores isolados
  exclusivos de main, alem do novo helper de filtros.
- Referencia remota backup/main-pre-fila-dp-20261015-41e154f4 aponta a main anterior.
  Tag anotada local de mesmo nome e bundle completo validado fora da EC2:
  outputs/main-41e154f4-pre-fila-dp-20261015.bundle, SHA256
  6F9191925C1F8449CBD5776785227F251940ABB0FFEE112573C98267223A48C0.
  Nao afirmar que o bundle foi enviado ao Drive; outputs/ fora do Git.

## Validacoes e operacao

- Backend: filtros/SQL gerado interceptado, relatorio/escopo/granular/duplicidade,
  DINHEIRO, pagamento por solicitacao/envio parcial, privacidade, comprovantes,
  baixa/estorno, cartao opcional, pessoal/escopo OBRA, PDFs e seguranca direta
  (2304 comparacoes, 48 rotas) aprovados, sem banco ou servicos reais.
- Deploy PROD: blocos reais em VM sem PM2/banco/rede, negativas de ambiente DEV,
  processo/caminho/porta, banco/UUID/host, schema pendente, flags divergentes,
  segredo redigido, troca autorizada preservada, modo proprietario OFF e health.
  Nenhuma funcao de escrita/schema autorizada; fluxo para antes de restart se falhar.
- Regressao dos scripts DEV e producao anteriores aprovada; Bash -n aprovado.
- Build, navegacao/abas, relatorio desktop/mobile e docs aprovados. Avisos
  preexistentes de Browserslist/chunk grande e trinco legado preservados.
- Script ops/deploy/atualizar-prod-fila-dp-20261015.sh; rodar somente no checkout
  main, sem copiar .env ou alterar flags. Schema consultado novamente no deploy;
  qualquer pendencia inesperada bloqueia, sem executar migrations para contornar.
- Aguardar backend saudavel e conferir Vercel Production/Ready no SHA final.
  Smoke: filtros DP/empresa/credor/recebimento, DINHEIRO e relatorio de status.
  Relatorio usa rh_dp.relatorios.visualizar e escopo existente; sem novo grant.

## Proximo passo

Regressao completa de fila/modal aprovada na integracao (desktop/mobile, filtros,
colunas/arquivos, contas/instrumentos, privacidade, fechamento sem escrita,
cancelamento/anexos compartilhados, DINHEIRO e mutex). Ownership liberado.
Publicar branch/PR e merge normal autorizado, conferir arvore/SHA remotos e
entregar comandos fixados.
EC2, migrations, PM2, S3 e Vercel nao foram executados pelo agente.
