# Handoff — Recarga de Cartao — 27/08/2026

## Resultado

Implementado o fluxo de `RECARGA DE CARTÃO` para a Gerencia de Processos:

- cadastro administrativo de cartoes Flash e vinculo com um ou mais usuarios;
- selecao apenas dos cartoes vinculados ao solicitante;
- `data_vencimento` reutilizada como data prevista para recarga;
- titulo `PREVISAO` criado na mesma transacao da solicitacao, sem obra, apropriacao ou DRE;
- liberacao da solicitacao abre o titulo;
- titulo em aberto bloqueia nova recarga;
- baixa parcial encerra o titulo pelo valor efetivamente pago e abre a prestacao apenas desse valor;
- baixa integral tambem abre a prestacao;
- prestacao independe de conciliacao bancaria;
- rateio exige obra vinculada ao solicitante e apropriacao analitica daquela obra;
- validacao pela Gerencia de Processos grava o rateio financeiro e so entao libera o custo para
  Gerencia de Obras e Resultado de Obras;
- nova recarga so e liberada depois da validacao da prestacao anterior;
- media das seis ultimas recargas validadas aparece para a Gerencia de Processos.

## Banco e dados

- Migration: `backend/migrations/202608270055_recarga_cartao_fluxo.js`.
- Tabelas: `cartoes_recarga`, `cartoes_recarga_usuarios`, `solicitacoes_recarga_cartao`,
  `cartoes_recarga_prestacoes`, `cartoes_recarga_prestacao_rateios`.
- Todas as FKs possuem nomes explicitos menores que 64 caracteres.
- A migration foi encontrada ja aplicada pelo backend local em `27/08/2026 16:03` e as cinco
  tabelas foram conferidas.
- Script de dados: `backend/scripts/dados/configurarFluxoRecargaCartao.js`.
- O script foi aplicado localmente e a reconferencia retornou `Linhas a corrigir agora: 0`.
- Nenhuma solicitacao legada foi convertida automaticamente.

## Principais arquivos

- Backend: modelos `*RecargaCartao*`, `recargaCartaoService.js`, `RecargaCartaoController.js`,
  `SolicitacaoController.js`, `solicitacaoFinanceiroStatusService.js`, `tituloFinanceiroService.js`,
  `obraGestaoService.js`, `ResultadoObrasController.js`, rotas e validator operacional.
- Frontend: `CartoesRecarga.jsx`, componentes em `components/recarga-cartao/`, integracao em
  `NovaSolicitacao.jsx` e `SolicitacaoDetalhe/RecargaCartaoDetalhe.jsx`.

## Validacoes executadas

- sintaxe Node dos arquivos backend: aprovada;
- importacao real dos modelos/servicos: aprovada;
- `npm run build` no frontend: aprovado, 372 modulos;
- `npm run test:recarga-cartao`: aprovado em transacao unica com rollback e conferencia da
  sequencia de titulos;
- consulta real somente leitura de Resultado de Obras: 58 obras, sem erro;
- consulta real somente leitura de Gerencia de Obras: detalhe e lista, sem erro;
- rota local nova respondeu `401`, provando que foi carregada e esta protegida por autenticacao.

## Producao

1. conferir o numero da migration e aplicar as migrations;
2. executar `node backend/scripts/dados/configurarFluxoRecargaCartao.js --conferir`;
3. executar o mesmo script sem `--conferir`;
4. cadastrar os cartoes em Configuracoes > Cartoes de Recarga;
5. conceder os vinculos de usuario no proprio cadastro do cartao;
6. reiniciar apenas o processo do ambiente em implantacao.

Nao ha variavel de ambiente nem permissao granular nova. O cadastro usa o papel SUPERADMIN ja
existente; a validacao da prestacao usa o setor Gerencia de Processos/SUPERADMIN.

## Ajuste posterior — edicao explicita

- A tabela de cartoes passou a ter coluna `Acao` e botao `Editar`.
- Ao editar, o formulario carrega fornecedor, identificacao, quatro digitos, situacao, observacoes
  e todos os usuarios atualmente vinculados.
- O rodape diferencia `Salvar alteracoes`, `Cancelar edicao` e `Cadastrar cartao`.
- O salvamento continua usando `PATCH /configuracoes/cartoes-recarga/:id`, preservando o mesmo ID.
- Build do frontend aprovado com 372 modulos.

## Correcao posterior — criacao sem forma de pagamento

- Corrigido o erro `Cannot read properties of null (reading 'codigo')` ao criar Recarga de Cartao.
- Causa: o classificador compartilhado de PIX/Boleto recebia `null` nos fluxos que nao exibem forma
  de pagamento e acessava `forma.codigo` diretamente.
- Os classificadores agora tratam forma ausente como "nao e PIX/Boleto/Transferencia".
- `salvarCartao` passou a aceitar transacao externa opcional para permitir QA reversivel da edicao.
- O QA de recarga agora cobre forma ausente e edicao do cartao, alem do ciclo financeiro completo.
- A tentativa que retornou 500 nao deixou solicitacao, titulo ou ciclo parcial no banco.
- O cartao `#3`, nome `Aloisio`, esta corretamente vinculado ao usuario Jose Ricardo; o nome do
  cartao e independente do nome do usuario vinculado.
- Validacoes aprovadas: sintaxe Node, controller ate resposta 201 sem gravacao, QA transacional com
  rollback, edicao real do cartao #3 dentro de rollback e conferencia do estado restaurado.
- O processo antigo da porta 8100, iniciado antes da correcao, foi encerrado e o backend da V4 foi
  iniciado novamente em 27/08/2026 16:55:48.
- Health check sem autenticacao respondeu 401 e uma chamada autenticada, usando cartao ficticio,
  respondeu 404 antes de qualquer gravacao. Isso prova que o processo novo ultrapassa a validacao
  de forma de pagamento que antes retornava 500.
