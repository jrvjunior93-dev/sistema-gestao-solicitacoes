# Compras: criacao em todas as obras sem ampliar visualizacao

Data: 01/10/2026. Estado: correcao na main e incorporada na refactor/frontend;
deploy de producao confirmado pela saida enviada pelo usuario.

## Incorporacao na refactor/frontend

O usuario autorizou levar a mesma correcao para `refactor/frontend`. Os trechos
funcionais e o teste ja estavam aplicados nesse checkout, base `64f9414e`; foram
selecionados para commit isolado com a documentacao especifica de Compras.
Referencia de origem: `093daa2cd56571c4d74e5c9f81061d2bf265647f` na main.
Nao incorporar o ownership misto nem alteracoes locais de pagamentos, PWA/push,
auditoria de tempos ou outputs. Nenhum merge da main inteira e necessario.

O usuario executou o deploy de producao e forneceu a saida: fast-forward para
`093daa2c`, 14 cenarios aprovados, verificacao de integridade do package-lock sem
alteracao, reinicio somente de `backend-solicitacoes` e health `ok: true`.
Validacao funcional final pela usuaria ainda nao foi informada. Nenhum agente
acessou EC2 ou banco; o deploy do backend de dev permanece fora desta tarefa.

## Atualizacao de publicacao

Por pedido explicito do usuario, a correcao foi reaplicada em worktree limpo da
main, base `e2b8d3db`, sem copiar arquivos inteiros da refactor ou fazer merge dela.
Commit `093daa2cd56571c4d74e5c9f81061d2bf265647f`, enviado a `origin/main` por
fast-forward e confirmado com `git ls-remote`. Sete arquivos: tres de runtime,
teste, comando de teste e dois registros documentais. Nenhum frontend, PWA/push,
auditoria de tempos ou migration foi incluido. O checkout refactor permaneceu
em `64f9414e`, com os trabalhos locais preservados.

Na base main, passaram os 14 cenarios especificos, importacao normal, compra
direta, sintaxe e diff. A validacao documental geral encontrou um link preexistente
em `docs/modulos/solicitacoes/README.md` para `./FLUXOS_INICIAIS_OBRA.md`, ausente
na main; confirmado na base e preservado para nao misturar outra correcao.

Sem acesso a EC2, banco ou deploy operacional. O historico abaixo descreve a etapa
local inicial; a publicacao Git acima substitui sua pendencia de envio do codigo.

## Problema e pedido

Usuaria do Comercial nao conseguia enviar compra para obra/centro de custo sem
vinculo, embora Comercial estivesse marcado em Criacao em Todas as Obras, conforme
imagem fornecida. A selecao de obras em modo CRIACAO respeitava a configuracao;
`requireCompraBodyObraAccess` ignorava essa excecao no POST e devolvia 403.
O usuario quer criar sem abrir acesso a todas as solicitacoes do centro de custo.

## Alteracoes

- `backend/src/services/authorizationService.js`: nova verificacao exclusiva de
  criacao pela configuracao existente. Leitura sem cache novo, normalizacao dos
  setores, sem usar perfil como setor e sem presumir permissao se JSON invalido.
- `backend/src/middlewares/resourceAccess.js`: guarda de criacao aceita essa
  excecao antes da restricao de vinculo; nova variante para a query do modelo XLSX.
  Guards de lista, detalhes, pedidos e contratos permanecem com o escopo anterior.
- `backend/src/routes.js`: download do modelo da compra normal usa guarda de
  criacao, mantendo permissao funcional. POSTs de compra normal/direta e importacao
  normal ja usam a guarda de body corrigida.
- `backend/scripts/validarCompraCriacaoTodasObras.js` e `backend/package.json`:
  regressao offline executa services/middlewares reais com models simulados.
- `docs/modulos/compras/README.md` e ownership: regra e validacao documentadas.

Nenhuma configuracao, usuario ou vinculo foi alterado. A marcacao vale para todos
os usuarios do setor que tenham permissao funcional de criar; nao e uma concessao
individual nova. Sem alteracao de frontend, schema, idempotencia ou transacoes de
criacao. Trabalhos preexistentes de PWA/push e auditoria/outputs foram preservados.

## Validacao

- 14 cenarios especificos sem banco: criacao com/sem vinculos; negacao sem setor
  habilitado; revogacao; falha de configuracao; payload/perfil sem forjar setor;
  obra invalida; SUPERADMIN; lista restrita; compra de terceiros negada em
  GET/POST/PATCH/DELETE; acesso ao proprio recurso; contratos/pedidos protegidos;
  modelo XLSX; permissao funcional obrigatoria e ligacao nas rotas.
- Testes relacionados de importacao de itens e compra direta, catalogo de
  permissoes, documentacao (369 Markdown / 19 canonicos), sintaxe e diff: aprovados.

## Limites e proximo passo

Nao houve acesso a banco, EC2 dev/producao, SSH, migration, commit, push ou deploy.
A proibicao do usuario de acessar EC2 e guardar chaves/acessos permanece vigente.
Publicacao e homologacao operacional ainda pendentes: apos publicar o backend por
procedimento autorizado, validar uma compra do Comercial sem vinculo com a obra,
mantendo as listas e compras de terceiros restritas. A imagem comprova a marcacao
na tela; os testes validam o codigo local, sem consulta ao estado da producao.

A auditoria de tempos segue independente, aguardando extracao completa offline.
