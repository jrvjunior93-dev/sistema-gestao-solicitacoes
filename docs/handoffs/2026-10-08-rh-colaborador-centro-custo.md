# RH/DP: obra e centro de custo no cadastro de colaborador

## Pedido e impacto

Incluir centros de custo na lista de lotacao do cadastro e permitir pesquisa
com autocomplete. Mapeados: GET /obras, cadastro/lista de colaboradores,
payload obra_id, permissoes de consulta/edicao, admissao e vinculo temporal,
transferencia formal, filtro da lista e combo em modal/portal.

Obra e centro de custo compartilham o modelo Obra. A consulta sem escopo
filtrava apenas tipo OBRA; o backend de RH ja valida ambos pelo mesmo ID.
Nao foi necessario mudar modelos, API, validadores ou migrations.

## Arquivos

- frontend/src/pages/RhDpColaboradores.jsx: GET /obras com escopo TODOS,
  autocomplete existente, rotulos do campo/filtro incluindo centro de custo,
  bloqueio durante carregamento/save e para consulta sem edicao. Esc fecha
  primeiro as sugestoes, sem fechar o formulario.
- frontend/src/components/ui/ObraAutocomplete.jsx: permite personalizar a
  mensagem vazia; padrao dos demais consumidores preservado.
- frontend/scripts/validarRhColaboradorCentroCusto.mjs: tela real, combo real,
  catalogo HTTP local e servicos RH simulados, sem banco ou rede externa.
- docs/modulos/rh-dp/README.md: comportamento e comando de teste.
- docs/workspace/OWNERSHIP_ATIVO.md: reserva temporaria desta tarefa.

## Validacoes

- Frontend: validarRhColaboradorCentroCusto.mjs aprovado (obras/centros,
  codigo/nome sem acento, clique/Enter/Esc, limpar, criar/reabrir, IDs e datas,
  usuario de consulta sem edicao, lista desktop 1366px e celular 390px).
- Frontend: validarRhColaboradoresPlanilha.mjs aprovado, incluindo permissao,
  locks de exportacao/importacao, temas e acoes responsivas.
- Backend: validarRhPrimeiraLotacao.js e validarEscopoRhDpUsuarioObra.js
  aprovados, sem escrita em banco.
- Build do frontend aprovado; avisos existentes de Browserslist e chunks.
- Imagem do autocomplete no celular inspecionada; menu dentro do viewport.

## Limites e proximo passo

Sem banco real, commit, push ou deploy. Dados salvos nas provas sao apenas
fixtures em memoria do navegador. outputs/ contem imagens locais, fora do Git.
Permissoes e escopo das consultas de colaboradores nao foram ampliados.
A troca de lotacao de colaborador existente continua exigindo o fluxo formal
de transferencia no backend. Validar em dev com cadastro autorizado e, se
aprovado pelo usuario, publicar a alteracao.

## Publicacao autorizada em 08/10/2026

Usuario autorizou commit na refactor/frontend, promocao para main e comandos
da EC2. Base refactor congelada: c0a3b00ddd99b77769525686cfad08ae93e094c9.
Base main congelada: 2fee98ae96e201ecdf856e3611ed6aadb140024d.
O delta anterior entre as branches e somente documental; preservar as
evidencias e a integracao contratual existentes em main.
Nao executar deploy ou migrations. Backup/timer aguardam confirmacao atual
antes da promocao. Nenhuma migration nova ou alteracao de backend nesta tarefa.

## Estado da publicacao

- Commit funcional local: 13967624e505f93b7d72c6368ad3f478a126cc1c.
- Teste especifico repetido apos o commit: aprovado.
- Push de refactor/frontend bloqueado por autenticacao do GitHub:
  `Cannot prompt because user interactivity has been disabled`.
  Tentativas interativas sem resposta canceladas; nao houve force-push.
- Snapshot local main: tag backup/main-pre-rh-centros-20261008-2fee98ae;
  bundle completo verificado em outputs/main-pre-rh-centros-20261008-2fee98ae.bundle,
  SHA256 92D75289C81940BA240391B51BA1A0009AB594EEAE6C6F9AFA750AEEAC511240.
  Tag ainda nao publicada; bundle fora da EC2, em copia local Windows.
- Main nao alterada; integracao, push e comandos definitivos EC2 pendentes.
- Proximo passo exato: usuario autenticar GitHub no terminal Windows usando
  `git push origin refactor/frontend`, sem compartilhar tokens. Confirmar
  backup/timer atual; reconsultar refs, publicar snapshot, integrar a partir
  de origin/main, validar, publicar main e fornecer SHA final para EC2.
- Reserva documental encerrada; ownership liberado. Sem deploy/banco real.

## Retomada apos resposta "Feito"

Fetch confirmou origin/refactor/frontend=c7e3d31a8f69bc2caf638e5bbd947d5a3fc4a44f
e origin/main=2fee98ae96e201ecdf856e3611ed6aadb140024d. A resposta do usuario
ao pedido de push e confirmacao backup/timer foi "Feito"; considerada aceite
das duas etapas, sem verificacao direta da EC2 pelo agente.
Autenticacao nao interativa do agente continua bloqueando pushes, inclusive
da tag de snapshot. Nao alegar main publicada.

Integracao local em codex/promocao-rh-centros-main-20261008, criada da main
congelada; merge sem conflitos preserva todo o historico/documentacao de main.
Delta integrado somente nos seis arquivos da tarefa RH; nenhuma alteracao
de backend, migration, dependencias, contratos, GEO ou financeiro.

Proximo passo: publicar tag de snapshot e branch de integracao em main usando
push atomico pelo terminal autenticado do usuario. Depois atualizar checkout
EC2 via fast-forward com SHA exato. Como o delta e apenas frontend/documentacao,
nao precisa npm ci, migration ou reinicio PM2 nesta janela; frontend e Vercel.
Se a EC2 estiver atrasada e houver delta backend, interromper esse bloco e
avaliar as pendencias separadamente. Sem deploy ou escrita de dados pelo agente.

Validacao do merge: teste da tela RH, primeira lotacao, escopo usuario OBRA,
documentacao (442 Markdown/19 canonicos), diff e build frontend aprovados.
Snapshot main revalidado pelo bundle/hash. Ownership documental liberado;
merge local pronto para publicacao manual, sem mudanca na main remota pelo agente.
