# Mockup responsivo do modulo de Compras

Artefato visual isolado para aprovacao da proposta responsiva antes de qualquer alteracao no frontend do sistema.

## Como abrir

Abra `index.html` diretamente no navegador ou sirva a raiz do repositorio por um servidor HTTP local.

Exemplo:

```powershell
cd C:\Fluxy
npx.cmd --yes http-server . -p 4178 -c-1
```

Depois acesse:

`http://127.0.0.1:4178/docs/mockups/compras-responsive/`

## Caracteristicas

- dados totalmente ficticios;
- nenhuma chamada ao backend;
- navegacao por hash, sem dependencias externas;
- telas de notebook, tablet e smartphone;
- tema claro/escuro e densidade confortavel/compacta;
- sidebar desktop recolhivel e menu sobreposto em dispositivos menores;
- tabelas com rolagem local e representacao alternativa em cards no smartphone;
- modais adaptados para tela cheia no smartphone;
- cobertura de solicitacoes, cotacoes, pedidos, cadastros, configuracoes e relatorios.

## Cobertura navegavel

- operacao: lista, criacao, compra direta, revisao, confirmacao e detalhe de solicitacao;
- cotacao: lista, comparativo, fechamento, resposta interna e portal do fornecedor;
- pedidos: lista, indicadores, detalhe, alteracao de status e delegacao;
- cadastros: fornecedores, insumos, categorias, unidades e apropriacoes;
- gestao: central com 11 relatorios e suas telas de resultado;
- configuracoes: regras de cotacao e status de pedidos.

No total, o mockup possui 32 rotas navegaveis por hash. Os botoes demonstrativos exibem modais, confirmacoes ou mensagens locais, sempre sem persistencia.

## Matriz validada

Todas as 32 rotas foram verificadas sem rolagem horizontal da pagina e com titulo principal presente nos seguintes tamanhos:

- notebook: 1366 x 768 e 1280 x 720;
- tablet: 1024 x 768 e 820 x 1180;
- smartphone: 390 x 844, 360 x 800 e 320 x 568.

Tambem foram testados o menu movel, filtros recolhiveis, navegacao lateral, modal de resposta da cotacao em tela cheia, troca entre cards e tabela, tema e densidade visual.

## Observacao

O mockup serve para aprovacao visual e de comportamento responsivo. Ele nao implementa regras de negocio, persistencia, permissoes reais ou integracoes.
