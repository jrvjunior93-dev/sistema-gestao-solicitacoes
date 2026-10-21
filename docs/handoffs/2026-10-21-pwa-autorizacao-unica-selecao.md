# PWA: autorizacao unica da selecao - 2026-10-21

## Escopo e causa

Usuario autorizou implementar/testar para refactor/frontend, sem producao.
Base DEV771f804189a7559c05df3f6bc1fd06fe17a65e50, no checkout isolado
promocao-financeiro-20261019/Fluxy (branch local codex/permutas-obras-case-20261020).
Agente unico. Nenhum acesso EC2/DB/Redis/S3/passkey reais, commit/push/deploy,
migration, dependencia ou alteracao de flags/.env nesta etapa.

Mapeamento anterior a mudanca: AutorizacoesPorObra conserva selecao entre obras
e paginas, confere estados atuais e agrupa decisoes por lote. Antes executava
um challenge/passkey/POST por grupo; interromper um grupo posterior deixava
decisoes anteriores confirmadas. A API legada tambem permite decisao commitada
e envio pendente com alerta/reenvio. Isso explica um caminho de resultado parcial,
mas nao prova a causa do episodio de hoje: usuario nao forneceu IDs/horarios.
Logs antigos de lock timeout de evento de seguranca nao identificam o episodio.

Dependencias mapeadas: capabilities/ACL nominal DECIDE, escopo financeiro e
origens compartilhadas, restricao preparador, limite nominal por lote, dossie/
snapshot/revisao/anexos, WebAuthn/Redis/challenge/counter, fila canonica/transacao,
historico por item/lote, bloqueio de saldo/reautorizacao, banco, feature OFF/PAUSED,
trava de clique/navegacao e reconciliacao de selecao. Rejeicao/reenvio separados.

## Implementacao

- Novo pagamentoAutorizacaoSelecaoService.js: validacao estrita de payload,
  ate1.000 IDs numericos unicos, max200 por lote e limite financeiro original;
  uma autenticacao para UUID de selecao, hash de todos os IDs/valores/snapshots/
  hashes/revisoes, challenge por usuario/finalidade com GETDEL/TTL300 existente.
- Confirmacao em uma transacao: trava credencial/autorizador ativo, titulos/
  lotes/itens em ordem estavel, revalida contexto e material integral (incluindo
  documentos das origens compartilhadas), decide so selecionados, enfileira pela
  funcao canonica na mesma transacao e confere todos ENFILEIRADO antes do counter.
  Qualquer erro desfaz filas, decisoes, historico e counter desta tentativa.
- pagamentoManualFilaService.js: wrapper interno aceita transaction opcional;
  mecanismo canonico ja suportava transacao externa e auditoria afterCommit.
  Chamadas legadas de quatro argumentos permanecem compativeis.
- pagamentoAutorizacaoService.js: adaptador/exportacoes; diagnostico seguro
  SELECTION_AUTHORIZE_AND_ENQUEUE com contagem/amostra20 IDs, sem assinaturas,
  challenge ou credenciais. Controller/routes: dois POSTs autenticados com
  criticalRateLimit, opcoes e autorizar sob painel/selecao.
- Frontend services/pagamentoAutorizacao.js e AutorizacoesPorObra.jsx: uma
  options/passkey/POST para AUTORIZAR; resposta deve confirmar todos os itens.
  Limpa somente confirmados, mantem selecao no cancelamento. Se resposta falhar,
  GETs em blocos50 por toda a selecao retiram itens ja decididos e reconhecem
  commit completo sem repetir POST. GET indisponivel preserva selecao/aviso.
  Busy/ref e bloqueio workspace existentes continuam ativos durante a operacao.
- Rejeicao/revogacao/reenvio e endpoints legados nao foram migrados; mantem
  comportamento/permissoes anteriores. Material divergente nesta nova API
  rejeita selecao inteira sem mutacao, em vez de invalidar um item e continuar.
- Skill frontend-design usada para preservar conferencia compacta operacional
  existente; sem CSS novo, redesenho da tela ou mudanca estetica transversal.

## Arquivos de QA e provas executadas

Backend/scripts: novo validarAutorizacaoSelecao.js e extensao do harness
validarAnaliseProprietario.js (modelos/memoria, desafios por UUID, mocks de
WebAuthn/Redis/S3, afterCommit). Executam os servicos reais e rollback em memoria.

- validarAutorizacaoSelecao.js e validarAnaliseProprietario.js: uma passkey para
  dois lotes, somente selecionados, remanescente pendente, eventos/counter,
  hash/revisao/material/documentos/estado/banco, ACL/escopo/preparador/nominal,
  limite por lote, flags/testar usuario/credencial/UV, replay/duplo envio e abas
  concorrentes. Falha no segundo lote e no counter apos TODAS as filas causa
  rollback total. Compartilhado com anexos de duas origens aprovado; anexo
  alterado em qualquer origem negado. Store real com Redis falso valida TTL,
  GETDEL, isolamento por usuario/finalidade/aba e indisponibilidade503.
- Regressoes aprovadas: validarFilaDiretaProprietario.js,
  validarAutorizacaoProprietarioPagamentos.js, validarBloqueioProprietario.js,
  validarPainelAutorizacoes.js, validarTitulosExcluidosAutorizacao.js,
  validarReenvioAutorizacaoPush.js e validarCartaoParcelamentoBaixa.js.
- frontend/scripts/validarAutorizacoesPorObra.mjs: componente real/API simulada;
  uma passkey/POST para130 titulos entre paginas/obras/lotes, clique repetido,
  cancelamento sem escrita, falha sem parcial, resposta perdida reconciliada;
  regressoes filtros/periodo/ACL/detalhe/rejeicao/historico/reenvio preservadas.
  Viewports320/390/1366 sem overflow e capturas inspecionadas.
- validarReenvioAutorizacao.mjs, validarAutorizacaoPwa.mjs e
  validarFilaAutorizacaoConvergencia.mjs aprovados. Executados sequencialmente;
  Chromium do pacote ausente: usado Chrome local ja instalado com
  PLAYWRIGHT_EXECUTABLE_PATH, sem baixar browser ou alterar dependencias.
- npm run build aprovado:631 modulos/16,04s; avisos preexistentes de Browserslist
  e chunks grandes. Sem delta no catalogo de navegacao gerado.
- Fechamento aprovado: sintaxe Node de todos os JS/MJS alterados,
  npm run test:docs (592 Markdown/19 canonicos) e git diff --check.

## Riscos residuais e proximo passo

Testes isolados NAO comprovam latencia/locks reais do MySQL nem passkey fisica
ou Redis do DEV. Selecao grande e revalidacao completa podem levar mais tempo:
precisa homologar concorrencia/timeout com volume real no DEV. Nenhum resultado
financeiro real foi criado, nem consultas de producao executadas pelo agente.
Challenge consumido numa falha requer nova confirmacao, sem repetir assinatura
automaticamente. Snapshot antigo divergente deve ser conferido no financeiro
pelo fluxo existente; nao contornar validacoes para forcar aprovacao.

## Publicacao DEV autorizada

Usuario autorizou commit/push deste pacote para refactor/frontend e comandos
para atualizar/testar DEV, sem producao. Remotos conferidos na abertura:
refactor/frontend771f804189a7559c05df3f6bc1fd06fe17a65e50,
main60f327d7d7dc7f68d8e2eb8b3e232d6d649edc85. Publicar somente delta/QA/docs/
roteiro, excluindo outputs privados. Sem merge/push main e sem EC2 pelo agente.

Novo ops/deploy/atualizar-dev-autorizacao-unica-20261021.sh e
backend/scripts/validarDeployAutorizacaoUnicaDev.js: SHA completo/branch/caminho,
lock de deploy, PM2/8001/online/sem watch, sessao12h/schema/UUID DEV em leitura,
base instalada93f75 ou posterior, alvo descendente771f8041, apenas fast-forward,
dependencias/migrations identicas e delta backend limitado aos cinco arquivos.
Nao referencia novo modulo antes do merge (evita MODULE_NOT_FOUND). Suites
isoladas e sintaxe antes do restart exclusivo backend-dev, health e pos-check
readonly; .env por hash, flags preservadas, sem instalacao de pacotes ou DDL.
Guardas textuais, sintaxe Bash/Node e diff de runtime/dependencias aprovados.
O roteiro periodo-registro anterior NAO serve para este pacote novo.
Suites backend do roteiro e UI130 titulos repetidas e aprovadas antes do commit;
novo build11,72s/631 modulos aprovado, sem delta gerado. Docs592/19/diff aprovados.

Homologacao pelo operador, depois de atualizar EC2 DEV e frontend DEV do mesmo SHA:

1. Entrar com autorizador nominal real (nao Testar usuario), no dominio DEV
   ja habilitado para a passkey; nao alterar origin/RPID ou flags neste deploy.
2. Preparar titulos de teste de ao menos dois lotes, preferencialmente obras
   distintas, com dossies atuais. Deixar outro item nao selecionado num dos lotes.
3. Selecionar itens entre paginas/obras e Conferir/Autorizar: uma unica passkey;
   todos os selecionados entram na fila, nenhum outro titulo e enviado.
4. Conferir fila sem duplicados e historico dos itens com autor/data/decisao/
   envio; selecao limpa somente os confirmados. Recarregar nao duplica nada.
5. Outra selecao: cancelar passkey, conferir que itens continuam marcados e
   pendentes. Repetir com clique duplo: somente uma confirmacao/um envio.
6. Operador sem ACL nominal deve continuar sem autorizar. Conferir rejeicao e
   reenvio legados separadamente, com dados exclusivamente de teste DEV.

Esses testes humanos geram autorizacoes/filas reais SOMENTE no banco DEV.
Nao executar em producao, nao fazer regularizacao/cancelamento automatico.
MySQL/Redis/passkey reais permanecem para homologacao do operador. Ownership
liberado ao fechamento/publicacao; nao incluir outputs privados no commit.
