# Promocao RH/DP e Treinamento para main - 14/10/2026

## Gates e bases

Usuario aprovou testes em dev, autorizou migrar todos estes ajustes para main
e pediu comandos de producao com a migration. Backup recente no Drive cifrado
conferido e timer ativo confirmados. Nenhuma EC2 ou banco acessado pelo agente.
Consulta real fornecida pelo operador confirmou UUID/banco esperados, EC2 no
commit b3a602fe9c700d8577bac1c22e5f43368470bd0d e unica migration pendente
202610140003_treinamento_video_rastreio.js. Consulta somente leitura.

- main congelada: b3a602fe9c700d8577bac1c22e5f43368470bd0d
- dev homologada: 8cb03a029592d1f16516277235200ee55ceefac0
- divergencia de historico: 52 commits exclusivos main e 3 exclusivos dev
- integracao: codex/promocao-rhdp-treinamento-main-20261014, criada de main
- snapshot local: codex/snapshot-main-rhdp-treinamento-20261014-195738
- bundle recuperavel: outputs/releases/main-antes-rhdp-treinamento-20261014-195738.bundle
- SHA256 bundle: F4B252A50591D264457E3DC7DAFF2C4CE041041B8069FB3883C86A2CFC98029E
- git bundle verify confirmou historico completo; artefato fica fora do release.

## Escopo autorizado

Pagamento RH 50% nos tres modos; DP solicita transferencia administrativa com
efetivacao automatica; saida da obra vinculada para destino ativo com aprovacao
da outra obra/DP/SUPERADMIN; filtros; previa sem criar rascunho ao abrir/fechar,
Salvar/Conferido persistem e autor exclui seu rascunho. Treinamento com edicao/
arquivamento, troca de arquivo, player MP4/WebM interno e relatorio granular de
reproducao por versao/usuario, sem conclusao automatica ou percentual minimo.
Detalhes nos cinco handoffs funcionais e READMEs canonicos dos dois modulos.

Somente migration estrutural nova de rastreio (duas tabelas/indices), sem seeds,
backfills ou alteracao de registros de negocio. Nao alterar flags de usuario
assumido ou autorizacao de pagamentos, dependencias, .env, responsaveis e usuarios.
Nao incluir tarefa de caixa em outro worktree nem outputs/.

## Estado

Integracao e validacoes locais concluidas; publicacao autorizada aguardando PR.
Merge teve somente conflito documental no ownership; ambos os blocos preservados.
Backend/src e frontend/src identicos ao codigo homologado. Helpers de release
e hotfixes de testes exclusivos da main preservados; nenhuma dependencia/.env
alterada, somente a migration nova na diferenca de schema. Sem exclusao de arquivos.

Script versionado ops/deploy/atualizar-prod-rhdp-treinamento-20261014.sh exige
checkout main limpo, ancestrais main/dev aprovados, PM2 backend-solicitacoes,
porta8000 em PM2 e .env/terminal, flags/config DB consistentes, UUID/banco/host
de producao e somente a migration aprovada. Flag de autorizacao de schema
apenas no processo Node, nunca persistida no PM2/.env. Sem seeds/backfills.
Migration aditiva nao apaga dados; preflight final antes do restart e health
local8000. Nenhum processo backend-dev e tocado. Arquivos existentes do S3,
permissoes de usuarios e flags de troca de usuario/autorizacao permanecem intactos.

## Validacoes

- Backend: calculos50/tres modos, previa sem escrita/primeiro save atomico,
  replay/concorrencia/rollback/exclusao propria, envio parcial, consulta/escopo,
  lotacao/salario/ticket e negativos; transferencias/filtros com --transferencias.
- Treinamento: troca/arquivamento/player, registro por usuario/ator/versao,
  cobertura/saltos/idempotencia e ACL granular/controller HTTP.
- UI real desktop/mobile: 50%/previa/Excluir rascunho, fluxo de pagamento completo,
  autosave/workspace, transferencias/filtros, tracker/relatorio/player WebM real.
  Visualizador compartilhado:11 handlers anteriores/ACL/pilha/foco preservados.
- Seguranca direta, sintaxe, build/navegacao/docs/diff aprovados. Avisos existentes
  de Browserslist/chunks grandes; nenhum banco real usado nos testes do agente.
- Deploy producao simulado: identifica processo/porta/ambiente/banco corretos,
  bloqueia dev, migrations extras, inconsistencias de flags; permite retry com
  schema ja aplicado. Bash -n aprovado; nao executar script no laptop.
- Teste historico de release13/10 inicialmente tinha inventario atual e contador
  congelado266. Fixture agora usa a arvore SOURCE congelada e testa negativamente
  schema futuro; helper operacional/allowlist de duas migrations antigas intactos.
- UUID e migrations reais foram conferidos somente pelo operador conforme acima.
- URLs GitHub antigas/alias fluxyintegracao-dev conferidas: mesmo repository ID
  1148559590, mesmos heads; conexao autenticada usa nome canonico jrvjunior93-dev.

## Publicacao e operacao

Publicar branch de integracao/PR para main, sem force e com SHA esperado. Caso Git
local aguarde GCM, usar conexao GitHub com hashes de blobs/arvore comparados ao Git;
commit remoto preserva main b3a602fe e dev8cb03a02 como pais. Branches locais de
preparacao preservadas, sem reset. Conferir main remoto e ambos os ancestrais apos
merge, entao fornecer ao operador bloco com SHA final congelado e script acima.
Esta promocao inclui todos os ajustes homologados de RH/DP e Treinamento; nao
inclui caixa de outro worktree. outputs/ permanece fora do release.

EC2 sera atualizada apenas pelo operador. Se script parar em algum gate, nao
forcar migracao/flags nem reiniciar; enviar saida sem segredos para conferencia.
Rollback: voltar artefato Vercel e codigo compativel b3a602fe em janela aprovada,
reiniciando apenas backend-solicitacoes; preservar schema e registros novos,
nunca executar down destrutivo automaticamente. Backup/snapshot permanecem.
Ownership liberado apos validacoes. Nenhuma escrita/reinicio/EC2 pelo agente.
