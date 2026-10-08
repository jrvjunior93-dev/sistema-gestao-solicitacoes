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
