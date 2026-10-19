# Datas dos cheques e preservacao da baixa em massa

## Pedido e limites

Usuario relatou Emissao do cheque excede o tamanho permitido em lote de cheques
proprios. Autorizou correcao na base refactor/frontend, sem producao; preservar
preenchimento, permissoes e protecoes. Nao quer avisos antecipados, apenas saber
o que falhou apos tentativa de confirmar/enviar. Agente unico, sem delegacao.
Base1393a446 em branch isolada codex/cheques-datas-20261019 no worktree reutilizado.
Sem EC2/SSH, banco real, migration, commit/push ou deploy pelo agente.

## Causa e mapeamento anterior a mudanca

ChequePagamentoFields usava input date nativo sem limite de ano. Chromium local
aceitou 202610-10-19 como valido. paymentValidators.parseDateOnly limitava10 e
produzia exatamente a mensagem relatada, antes do controller/transacao. Nao
foi lido o payload real do operador: a reproducao explica o caminho, nao prova
qual texto foi digitado naquele caso.

Consumidores do componente: cheque individual da fila, parcelas/conjunto de
cheques do lote, baixa simples/parcelada em Contas a Pagar/Receber e fontes
compostas. API POST /financeiro/fila-pagamentos/baixar exige permissao de baixa,
limita200 itens/60 cheques, valida antes de registrarBaixasFila, que usa locks
de titulos e transacao. Proprio exige conta; carteira segue suas regras atuais.
Nao mudar essas regras nem a data geral da baixa/emissao de titulos.

Falha do POST desmontava BaixaMassaFilaModal via setBaixaMassa(null), perdendo
estado local dos instrumentos. Manter o componente montado em falha e necessario
para corrigir o cheque sem preencher o lote novamente.

## Alteracoes

- ChequePagamentoFields: datas em DateInputBR segmentado, min1000/max9999 (DATE
  MySQL), rotulo de erro por cheque quando fornecido. Layout/required preservados.
- DateInputBR: prop opt-in rotuloErro somente compoe mensagem de validacao;
  comportamento/rotulos dos demais consumidores inalterados. Validacao nativa
  se manifesta no submit, sem alertas novos na digitacao/blur.
- ChequesParceladosFilaModal informa posicao do cheque ao componente; nao
  altera valores, origens, empresa, cadastro de carteira ou quantidade.
- Novo chequeDataValidator puro: ISO exato/calendario/ano1000..9999 para novas
  datas de cheque. Rejeita timestamp, ano longo, tipos inesperados e dias
  inexistentes sem truncar ou inferir. Campos vazios continuam opcionais.
- paymentValidators: mensagens por item/cheque real do lote; financialValidators:
  somente datas de cheque da baixa simples/parcelada. Sem validacao global nova
  em datas de titulos/pedidos/cartao ou conversao de dados antigos.
- FinanceiroFilaPagamentos: callback do mutex devolve resultado, massa retorna
  erro ao proprio formulario sem desmontar em falha; sucesso fecha/limpa como
  antes. Caminho individual e demais modais mantidos. Orientacao especifica de
  cheque/data apenas quando a tentativa falha; nao cria etapa preventiva.

## Validacao

Novo backend/scripts/validarDatasCheques.js: datas validas/leapyear/limites,
invalidas/ano longo/timestamp/tipos, opcional/carteira, campo/cheque2, payload
imutavel e middleware rejeitando antes do controller. Individual/lote/parcelas
e protecoes de duplicidade/limite cobertas sem banco/rede.

Novo frontend/scripts/datasChequesFilaQA.mjs, acionado por
`node frontend/scripts/validarFilaInstrumentosUI.mjs --datas-cheques`: pagina
e componentes reais com APIs simuladas; desktop1366/mobile390, ano4/edicao de
mes/ano, calendario invalido somente apos submit, data invalida visivel para
correcao, reduce/aumenta quantidade, falha backend preserva campos/conta/data,
reabertura/correcao e retry/duplo clique com uma chamada, permissao negativa.
Teste direcionado aprovado; screenshots privados outputs/cheques-datas-*.png.

Regressao backend: rateio/liquidacao de cheques compartilhados, carteira/composta,
fila multiplas fontes, cartao parcelado e bloqueio do proprietario aprovados.
Suite UI completa da fila aprovada: cabecalho/massa, quantidades/proprio/carteira,
cancelamento/mutex, desconto/estorno, dados/copia, anexos, selecao/colunas,
paginacao650/13paginas e responsividade desktop/mobile. Build aprovado somente
com avisos existentes Browserslist/chunks; documentacao583/19, sintaxe Node e
diff-check aprovados. Componente padrao/contratos da skill de frontend orientaram
a reutilizacao e a mensagem contextual, sem redesign ou mudanca de densidade.

## Proximo passo

QA concluido, ownership liberado e delta local pronto, sem publicar. Commit/push e
deploy DEV requerem pedido separado; nada vai para main nesta tarefa. Homologar
no DEV com usuario operador, lote proprio e misto com carteira; corrigir erro
sem perder instrumentos, confirmar uma vez e conferir rateio/historico.
Sem necessidade de migration. Nao contornar validacao ou alterar producao.

## Publicacao DEV autorizada

Usuario pediu commit/push para refactor/frontend e comandos para EC2 DEV.
Base remota1393a446 e main9e4faf4e conferidas; publicar fast-forward somente
o pacote desta correcao. Sem incluir outputs/auditorias/arquivos alheios.

Novo roteiro ops/deploy/atualizar-dev-datas-cheques-20261019.sh recebe SHA
completo. Exige caminho/branch DEV, tracked limpos, flock e PM2/watch/porta8001;
usa o verificador existente de ambiente/UUID/schema/12h/flags ANTES do merge.
Exige base139 no checkout e delta sem migrations/dependencias/lockfiles. Merge
ff-only, .env por hash, npm ci omitdev, testes isolados de datas/rateios/carteira/
composta/cartao/bloqueios e guardas de schema novamente. Sem DDL ou mudanca
de configuracao. Restart apenas backend-dev sem update-env, health8001 e
conferencia final de ambiente/schema/sessao/.env. Produzir HTTP200 e SHA alvo.
Pendencia de schema interrompe; nao aplicar migrations antigas para contornar.

Teste validarDeployDatasChequesDev valida caminho/branch/limpeza/lock/base/SHA,
bootstrap antes do merge, hash.env, ausencia de escrita/schema e restart unico.
Na publicacao foram repetidos backend/guardas, UI direcionada desktop/mobile,
build, docs583/19, Node/Bash e diff-check. Suite completa da fila aprovada na
implementacao. Sem EC2/SQL/push real pelo agente; operador executa o roteiro.
Ownership liberado para commit/push autorizado, sem alteracao da main.

Homologacao DEV: atualizar/reabrir frontend/PWA, entrar como operador, criar
lote apenas de teste com dois cheques proprios, conferir DD/MM/AAAA e edicao
de segmentos. Erro aparece so na tentativa de confirmar/enviar. Corrigir data
invalida sem perder numero, emitente e valor; confirmar e conferir rateio e
historico. Repetir com cheque da carteira e usuario sem permissao. Nao provocar
falha artificial em producao. A falha de API preservando o modal foi simulada
localmente, sem desligar banco/servidor para gerar erro financeiro real.
