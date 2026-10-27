# NSDOCS v2 - preparacao da consulta manual DEV

## Autorizacao

Usuario confirmou atualizacao offline DEV f2167ff7, PID669982, Node24.22.1 isolado,
conector desligado e peers/daemon/dumps preservados. Agora autorizou preparar
consulta manual DEV, chave somente backend e conferencia da empresa, sem producao
ou bloqueios financeiros. Nao autorizou neste pedido commit/push/deploy/EC2 ou
chamadas reais pelo agente; nenhuma dessas acoes foi executada.

Worktree ativo: promocao-financeiro-20261019/Fluxy, base f2167ff7. Branch local
de preparacao codex/retirada-envios-dev-20261023, destino futuro refactor/frontend.
Preservar registros/scripts Node nao rastreados e ownership anterior misturado.

## Arquivos

- `backend/src/modules/fiscal/services/nsdocs/manual/policy.js`: guardas DEV,
  CNPJ valido, limites, formatos e rejeicao de segredo em respostas.
- `manual/privateStore.js`: chave/metadata600 fora do repo, diretorio700,
  validacao de owner/hardlink/symlink, criacao exclusiva, lock/cooldown e journal
  sanitizado com limite sem apagar historico.
- `manual/runtime.js`: Linux/uid1000/cwd/branch/Node DEV exatos; host/porta/CA/UUID;
  consulta MySQL em START TRANSACTION READ ONLY com rollback/end para cadastro.
- `manual/hiddenPrompt.js`: entrada TTY oculta, sem historico; Ctrl+C/abort/EOF.
- `manual/transport.js`: HTTPS GET fixo /v2/documentos, Bearer somente no header,
  TLS verificado, sem redirect/proxy/retry, timeout/limites/erros sanitizados.
- `manual/query.js`: empresa configurada versus cadastro/corpo retornado,
  confirmacao explicita, normalizacao e historico privado sem escrita de negocio.
- `backend/scripts/nsdocsDevManual.js`: listar empresas locais/configurar/conferir/
  consultar; resumo padrao e previa opcional limitada, sem nova rota/UI.
- `backend/scripts/validarNsdocsManualDev.js` e `backend/package.json` (so script QA).
- `nsdocs/normalize.js`: aceitar ID opaco seguro do provedor alem de numeros,
  preservando rejeicao de path/controle e demais validacoes da base.
- README fiscal, `NSDOCS_V2_CONSULTA_MANUAL_DEV.md`, este handoff e secao propria
  no ownership (nao incluir inteiro num commit futuro).

## Validacoes

- 18 testes manuais DEV aprovados: politica, arquivo privado, concorrencia,
  cooldown, HTTPS/TLS/Bearer, redirects/status/rede/timeouts, tamanho/compactacao,
  eco/escape de segredo, cancelamento, cadastro e empresa/retorno vazio, CLI,
  prompt TTY, SQL readonly/rollback/UUID divergente e zero chamadas reais.
- 11 testes da base offline aprovados: configuracao/normalizacao e ACL fiscal
  real isolada preservadas. Reexecutar apos qualquer alteracao de normalizador.
- Sintaxe JS, Bash dos exemplos, diff e regressao de permissoes financeiras
  conferidos ao encerrar a preparacao.

## Limites e proximo passo

Nao ha tela, endpoint ou concessao de permissao nova. E um comando administrativo
para quem possui acesso SSH ubuntu; nao concede a usuarios comuns uma consulta
que eles nao tinham. O conector automatico continua desligado e sem importar
este transporte manual. Chave fora do .env/PM2/dumps; arquivo privado nao e cofre
criptografado. Setup/conferir nao chamam NSDOCS; consultar exige flag de
confirmacao de uma chamada real. Nao executamos nenhum desses comandos na EC2.

Conferencia via documentos nao prova que a chave tenha escopo exclusivo/GET nem
valida nota fiscal. Lista vazia deixa empresa explicitamente nao comprovada.
Escopo/consumo reais precisam homologacao pelo usuario. Nao implementar endpoint
de empresa NSDOCS por suposicao; o contrato confirmado foi a listagem documental.
Cada GET pode envolver limites/consumo do plano. Sem PUT/POST externo/XML/PDF,
manifestacao, agendamento, persistencia fiscal ou vinculos de pedido/titulo.

Proximo passo exato: revisar/publicar somente este delta na refactor/frontend,
quando solicitado, com roteiro DEV proprio. Nao reutilizar o operador offline
f2167ff7 para um commit novo: ele exige inventario fechado do pacote anterior.
Depois da publicacao, usuario lista empresas DEV, configura chave no prompt
oculto, confere arquivo e realiza uma consulta curta com empresa confirmada.
Sem npm install/migration/PM2 restart ou producao; nenhum backend em execucao
carrega automaticamente esses arquivos de CLI.
