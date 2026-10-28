# Compra Direta: favorecido e PIX lado a lado

## Pedido e alcance

Remover a mensagem sobre valor calculado nos itens. Na forma unica, levar o favorecido para a esquerda e colocar chave PIX ao lado; no celular empilhar os campos. Base local 79531e10, frontend DEV dos totais ja publicado.

## Alteracoes

- NovaSolicitacaoCompra.jsx: somente distribuicao visual dos campos, cabecalho de forma unica e remocao da mensagem. Grade alinhada pelo topo para evitar esticar o autocomplete por causa do hint PIX.
- validarCompraDiretaCredorObrigatorio.mjs: ampliar QA existente para conferir posicao real dos campos em 1366/390, ausencia da mensagem e troca do favorecido/limpeza da chave.
- Valores de varias formas, total nos itens, boleto/upload, validacoes, callbacks, payload, permissao e rascunho preservados. Nenhum backend alterado.

## Validacao

- QA da pagina real com HTTP interceptado e dados ficticios: PASS em desktop/mobile; totais, rateio/payload, credor obrigatorio/opcional, rascunho e erros da regra preservados.
- Capturas favorecido-pix-1366.png e favorecido-pix-390.png em outputs/compra-direta-credor-obrigatorio inspecionadas.
- Build frontend e git diff --check aprovados; avisos existentes de Browserslist/chunks.

## Estado e proximo passo

Usuario autorizou commit/push na refactor/frontend. Publicar somente frontend/teste/docs sobre79531e10 e conferir conclusao da Vercel. Nenhum comando/reinicio/migration EC2 necessario para este layout; backend cfe6 ja conferido em DEV pelo operador. Sem acesso EC2, banco real ou operacoes de pagamento pelo agente. Main2d6af625 e producao4096 permanecem intactas. Ownership funcional liberado apos QA; fechamento documental nesta publicacao.
