# Contraste dos previews de Compras no tema escuro

## Alteracao

O visualizador de anexos da solicitacao mostrado na imagem usa
`PreviewAnexoModal`; o formulario e outras telas de Compras tambem usam
`CompraPreviewModal`. Ambos agora usam a classe compartilhada
`app-file-preview`, com cores locais de titulo, subtitulo e botoes no tema
escuro. Isso evita texto escuro herdado de um tema personalizado sobre o
painel escuro. O texto do estado sem visualizador sobre fundo branco tambem
recebe uma cor legivel.

Arquivos: `frontend/src/index.css`,
`frontend/src/pages/SolicitacaoDetalhe/PreviewAnexoModal.jsx`,
`frontend/src/modules/solicitacao-compra/components/CompraPreviewModal.jsx`,
`frontend/scripts/validarContrastePreviewCompras.mjs` e ownership da tarefa.

## Validacao

- Contraste calculado no navegador Edge usando o CSS real e tokens de texto
  escuros de tema personalizado: passou para titulo, subtitulo e botoes.
- Estado hover distinto: passou.
- `npx vite build` em `frontend/`: passou.
- `git diff --check`: passou.
- Alteracao de classes/CSS; handlers de fechar, Escape, link/download e
  atributos de cabecalho/rodape fixos permanecem intactos.

## Estado e proximo passo

Correcao validada; o proprietario autorizou commit e push para `main` no
pedido seguinte. O worktree ja esta em `main`, sem merge adicional. Apos o
push, conferir o deploy do frontend na Vercel. Nao requer alteracao de
backend, banco ou ambiente.
