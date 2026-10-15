# Modulo FINANCEIRO

## Regularizar recarga de solicitacao excluida - 2026-10-15

- Menu Solicitacoes > Regularizar recargas, exclusivo de GEO/SUPERADMIN,
  com consulta/regularizacao global de recargas excluidas de todas as obras.
  Esta excecao NAO altera vinculos de obra, permissoes ou regras de visibilidade
  da lista/detalhe/anexos das solicitacoes. Nao concede acesso financeiro geral.
- GET /recargas-cartao/regularizacao lista solicitacoes excluidas com recarga;
  filtro exato codigo e pagina de 30 solicitacoes por cursor antes_de.
  GET /recargas-cartao/regularizacao/:id confere todos os cartoes e titulos.
  Consultar/abrir a tela nao grava dados.
- POST no mesmo caminho exige motivo, revisao atual e chave de idempotencia;
  uma transacao, mutex por cartao em ordem crescente e locks da solicitacao,
  recargas, titulos e prestacoes. LogExclusao, entidade REGULARIZACAO_RECARGA,
  guarda autor, motivo completo em payload_json, estado anterior, resultado
  e chave. Nao cria Historico, atribuicao, mencao ou envio ao setor que possa
  conceder visibilidade. Falha de auditoria desfaz a operacao; replay legado
  ainda consulta o Historico antigo, sem reescrever ou remover esses registros.
- Sem pagamento: cancela titulo aberto/previsao e encerra o ciclo; preserva
  exclusao da solicitacao, valor original, anexos e log de exclusao.
- Com pagamento quitado: recupera a solicitacao original preservando setor,
  status, IDs e titulos. Retoma a prestacao, sem resetar rateios/decisoes existentes;
  cria somente o formulario se estiver ausente. Nao valida gastos automaticamente.
  Em solicitacao mista, encerra os cartoes nao pagos e recupera os pagos,
  com o tratamento de todos exibido antes da confirmacao.
- Prestacao/detalhe continuam com os usuarios ja autorizados pela regra normal.
  A resposta do POST revalida assertPodeVisualizarSolicitacao, inclusive no
  replay; link operacional so aparece se pode_abrir_solicitacao=true. Negativa
  ou indisponibilidade da ACL omite o link e nao concede acesso por outro caminho.
- Nao altera baixas, pagamentos, titulos pagos, saldo informado nem ajuste do
  cartao. Despesa continua vindo apenas dos gastos reais validados.
- Fila/envio bancario/autorizacao ativa, negociacao/cobranca protegida,
  prestacao em processamento ou inconsistencia financeira impedem a acao
  e orientam conferencia pelo Financeiro. Nenhuma integracao externa e
  cancelada por este endpoint. Titulo pago excluido nao e restaurado por ele.
- Rotas operacionais e anexos de solicitacoes ainda excluidas permanecem
  bloqueados; nao foi criado bypass global da exclusao. Prazo operacional da
  obra continua sendo conferido, sem excecao nova para esta operacao.
- Testes isolados: backend/scripts/validarRecargaRegularizacao.js e
  frontend/scripts/validarRecargaRegularizacaoUI.mjs, mais regressoes de saldo,
  multicartoes, medicao, exclusao/ACL e prazos. Sem nova migration.

## Consulta de cartao com solicitacao excluida - 2026-10-15

- Ausencia de recarga e resposta normal: sem alerta vermelho e sem bloqueio
  quando os demais campos/vinculos estiverem validos.
- Busca da ultima recarga ignora referencias a solicitacoes excluidas/ausentes
  somente se nao restar titulo aberto/previsao, pagamento sem prestacao validada
  ou referencia financeira quebrada. Nao altera titulos nem pagamentos.
- A mesma busca protege contexto e POST de criacao, com lock e desempate por
  ID. Recarga excluida encerrada nao encobre uma anterior ainda ativa.
- Exclusao com pendencia retorna contexto 200, bloqueado, sem dados da
  solicitacao excluida e com orientacao de regularizacao pelo GEO. Nao tenta
  abrir o detalhe excluido, que permanece protegido por 404/ACL.
- UI distingue sem historico, consulta em andamento, falha real, historico
  restrito e recarga anterior indisponivel. Falha nao libera criacao nem
  aparece como ausencia de historico; retry preserva os valores digitados.
- Testes isolados: validarRecargasMultiplosCartoes.js e
  frontend/scripts/validarRecargaContextoExcluidoUI.mjs. Sem nova migration.

## Saldo dos cartoes e prestacao pelos gastos reais - 2026-10-15

- Saldo calculado por cartao = baixas efetivas nao estornadas + ajustes auditados
  - despesas declaradas. Previsoes/pedidos ainda nao pagos nao creditam saldo.
- A interface distingue saldo apos gastos validados, gastos enviados/rejeitados
  ainda a conferir e saldo disponivel estimado. Nao consulta a operadora.
- Prestacao aceita gasto inferior a recarga e uso de sobra anterior. Rateios
  somam os gastos reais, nao o credito; motivo e documento obrigatorios para
  declarar ausencia de gastos. Documento continua obrigatorio nos demais casos.
- Envio reserva o gasto e libera a proxima solicitacao pela regra existente;
  so a validacao GEO libera custo. Rejeicao nao disponibiliza o mesmo gasto de
  novo; a correcao substitui exclusivamente a propria reserva.
- Cartao bloqueado em transacao, revisao do saldo no formulario e CAS de status
  protegem cliques/envios concorrentes. Excesso e saldo negativo sao bloqueados.
- GEO/SUPERADMIN pode ajustar o saldo disponivel real pelo detalhe da recarga,
  com motivo, extrato enviado pelo proprio usuario e chave idempotente. Ajuste
  nao altera titulos, pagamentos nem despesas/prestacoes antigas; trilha registra
  usuario, data, antes/depois e documento. Extrato utilizado nao pode ser removido.
- Cartoes existentes usam calculo historico, sem seed/backfill. Historico
  anteriormente inflado permanece preservado; GEO pode reconciliar o saldo,
  mas corrigir despesas antigas exige procedimento distinto e autorizacao.
- Apropriacao/Gestao de Obras, Resultado/Painel, Financeiro de Obras, DRE e
  Custos e Recebiveis usam gasto efetivo por destino. Sobra nao e custo. Fluxo
  de caixa/Contas a Pagar continuam mostrando a baixa integral da recarga.
  Financeiro de Obras e relatorio de custo, nao extrato bancario.
- Migration estrutural `202610150001_cartoes_recarga_saldo.js`: tres campos
  nullable de snapshot na prestacao e tabela imutavel de ajustes, sem reescrita
  de negocio. Aplicar com backup e preflight no ambiente autorizado antes do
  backend novo. Rollback automatico bloqueado para preservar auditoria.

Testes isolados: `validarRecargasMultiplosCartoes.js`,
`validarSaldoCartaoSchemaLimiteDp.js`, `validarFinanceiroObrasComprometido.js`,
`validarAdiantamentoFinanceiro.js`; UI `validarSaldoCartoesUI.mjs` e
`validarRecargasMultiplasUI.mjs`. Banco real/migration nao executados nesta entrega.

## Compra Direta: frete apos geracao do titulo - 2026-10-15

Salvar frete na gestao da Compra Direta sincroniza a obrigacao financeira na
mesma transacao: embutido ajusta somente o delta nos titulos abertos sem baixa;
havendo pagamento, cria complemento e preserva originais. Terceiro gera titulo
separado, com origem `COMPRA_DIRETA_FRETE`, sem duplicar na geracao inicial do
fornecedor. Complemento embutido usa `COMPRA_DIRETA_COMPLEMENTO`.

Nenhuma baixa, debito, envio a fila ou autorizacao e automatico. Titulos pagos
nao sao reescritos. Reducoes pagas e titulos protegidos por cobranca/integracao/
autorizacao exigem regularizacao no fluxo financeiro. Titulos novos devem ser
conferidos e classificados; frete a terceiro automatico nasce sem categoria e
fora da DRE ate classificacao pelo Financeiro. Se a solicitacao estava PAGA,
um novo titulo pendente muda para PARCIALMENTE PAGO, sem trocar setor.

A permissao `compras.compra_direta.gerenciar_frete` autoriza somente esse efeito
restrito na propria compra/obra, nao a edicao financeira geral. Detalhes,
locks, rateios e excecoes no [canonico de Compras](../compras/README.md) e no
[handoff](../../handoffs/2026-10-15-compra-direta-frete-financeiro.md).

## Fila: carteira de terceiros sem conta na massa - 2026-10-13

- Conta pagadora exigida somente para cheques proprios do conjunto. Terceiros
  usam a empresa do cheque cadastrado na carteira, sem debito bancario, inclusive
  em lote misto. Trocar a conta dos proprios nao limpa os cheques da carteira.
- Carteira legada sem empresa pede selecao explicita da empresa entre as opcoes
  ja presentes nas contas/cheques acessiveis da fila. Nao infere empresa da conta
  nem altera o cadastro legado. Empresa existente nao pode ser substituida.
- Backend resolve carteira/empresa sob lock; excecao de conta apenas no grupo
  interno validado. Pix, boleto, cartao, proprio e baixa individual conservam
  validacoes anteriores. Conta null no snapshot/movimento de terceiro; empresa
  e componentes preservados no grupo. Carteira consumida uma vez por documento.
- Sem nova migration ou mudanca de ACL. Testes locais backend/UI e build;
  homologacao integrada MySQL/EC2 continua separada. Detalhes no
  [handoff](../../handoffs/2026-10-13-fila-carteira-sem-conta.md).

## Fila: cabecalho unico da baixa em massa - 2026-10-13

- Forma de pagamento do lote vale para todos os titulos; nao existe mais
  Aplicar forma nem edicao individual de forma/instrumento dentro deste modal.
  As linhas sao somente conferencia de titulo, descricao e valor pago.
  Edicao individual continua na tabela da fila, fora da baixa em massa.
- Selecionar Cheque abre o editor do conjunto unico imediatamente, mesmo
  antes de selecionar conta. O editor permite escolher conta pagadora,
  quantidade e origem explicita de cada cheque (proprio/carteira).
  Conta pagadora se refere somente aos cheques proprios; empresa da carteira
  independe dela. O conjunto confirmado precisa ser reconferido apos trocar conta.
- Um cartao usa automaticamente sua conta vinculada; varios cartoes usam
  suas respectivas contas. Forma/instrumentos so alteram os rascunhos da fila
  na confirmacao da baixa. Cancelar nao aplica alteracoes nem registra pagamento.
- Preservados valores/encargos, ACL por titulo, soma em centavos, conjunto
  compartilhado sem duplicar documentos e estorno do grupo completo.
  Esta correcao nao cria migration nem modifica o motor financeiro.
- Testes locais de fila desktop/mobile, rateio/estorno, navegacao de pedido
  e build aprovados, sem banco/rede externos. Homologacao real continua separada.
  [Handoff](../../handoffs/2026-10-13-pedido-anexos-fila-cabecalho.md).

## Fila: origem explicita, instrumentos compartilhados e multicartao - 2026-10-13

- Escolher forma Cheque nao presume cheque proprio nem abre seu editor.
  Origem inicia vazia; escolher Proprio abre dados, Carteira mostra somente
  cheques disponiveis da empresa. Novas linhas de cheques tambem exigem origem.
  Dados de cheques ja confirmados continuam reconhecidos por compatibilidade.
- Modal em massa define forma/cartao no cabecalho para todos os selecionados.
  Tipos credito/debito filtrados pelo mesmo helper das linhas. Edicao por titulo
  continua disponivel somente fora do modal em massa.
- Selecionar Cheque no cabecalho abre o editor para um conjunto unico que
  paga o total do lote. Quantidade gera campos automaticamente; origem deve
  ser escolhida em cada linha. Terceiro precisa existir na carteira e seu
  valor integral e utilizado uma unica vez, mesmo pagando varios titulos.
- Mais de um cartao permite informar cartao e valor por parte, por titulo
  ou pelo total do lote. A soma deve fechar exatamente em centavos. Cada
  cartao usa sua conta vinculada; credito entra apenas com sua parte na
  fatura e debito registra a saida na respectiva conta. O titulo conserva
  seus vinculos anteriores, sem multiplicar a compra nas faturas.
- Backend aceita instrumentos_lote no endpoint existente de baixa em massa
  ou parcelas_cartao por item. Grupo exige chave de idempotencia, transacao,
  locks e validacao dos instrumentos; falha reverte todas as partes. Limites:
  200 titulos, 60 cheques, 20 cartoes e 1000 movimentos por grupo. Pagamento
  compartilhado acima do saldo ou parte sem principal positivo e recusado.
- Estornar uma linha de grupo estorna o conjunto inteiro, com aviso previo.
  Exige as permissoes/escopos existentes para todos os titulos; reabre a fila
  preservando historico/autorizacao valida e devolve terceiros uma unica vez.
  Fatura nao aberta ou cheque com processamento posterior bloqueia o grupo.
  Estorno individual de movimento pertencente ao grupo e bloqueado.
- Migration aditiva 202610130002_fila_liquidacao_rateada.js cria o grupo e
  referencia nullable no movimento, sem DML/backfill de registros de negocio.
  Foi preparada/testada em simulacao, NAO aplicada. Schema deve preceder o
  backend atualizado; frontend somente apos backend compativel. Nenhuma
  operacao na EC2, commit/push ou mudanca de visibilidade nesta tarefa.
- Testes isolados de rateio, servicos, faturas, estorno/ACL e UI desktop/mobile
  aprovados, incluindo navegacao e build. MySQL real, concorrencia entre
  processos e homologacao financeira em dev continuam como gate de deploy.
  [Handoff](../../handoffs/2026-10-13-fila-origem-instrumentos-massa.md).

## Fila: modal somente boletos da solicitacao - 2026-10-13

- Modal de arquivos da solicitacao lista apenas anexos ativos classificados
  como BOLETO, enviados pelo campo de boleto. Aceita multiplos PDF/imagens;
  nao infere origem por nome ou extensao. Sem boleto, exibe mensagem especifica.
- Backend filtra na consulta; frontend tambem filtra respostas antigas/mistas.
  Preservados ACL da fila, presign sob demanda, preview interno, download,
  foco e rolagem. Demais anexos continuam no detalhe da solicitacao;
  comprovantes de pagamento continuam nos botoes proprios da fila.
- Sem exclusao/reclassificacao de arquivos, migration, banco real ou deploy.
  Testes isolados de acesso, modal, fila desktop/mobile e build aprovados.
  [Handoff](../../handoffs/2026-10-13-fila-modal-somente-boletos.md).

## Fila: baixa em massa, desconto, cheques e estorno - 2026-10-13

- Baixa em massa abre modal de conta pagadora e data efetiva. Aplica esses
  dados aos selecionados (maximo 200), preservando valor/encargos por
  titulo. A forma efetivamente paga e unica no cabecalho do modal; trocar forma
  limpa instrumentos anteriores. A tabela da fila permite baixa individual.
  Cheques proprios/da carteira e seu parcelamento sao editaveis no mesmo
  fluxo, com quantidade de 1 a 60 e dados por cheque. A quantidade valida gera
  os campos automaticamente, sem aplicar/adicionar um a um; reducoes mantem
  os dados ocultados em memoria somente enquanto o modal estiver aberto.
  Apenas cheques visiveis/confirmados entram no payload. Exige conferencia final;
  cancelar o modal descarta suas alteracoes, sem registrar baixa. Cartao deve
  continuar compativel com a conta. Falha em uma linha reverte o lote inteiro.
- Coluna Desconto, inicialmente antes de Juros, aceita valor nao negativo.
  Total esperado = saldo + juros + multa - desconto. Principal liquidado =
  valor pago - juros - multa + desconto. Preferencias existentes recebem a
  coluna sem resetar a ordem; permanece configuravel/ocultavel. Regras proprias
  de adiantamento/devolucao continuam recusando desconto na baixa.
- Cheque aceita editor de 1 a 60 parcelas por titulo, misturando proprios e
  terceiros disponiveis da carteira. Soma exata em centavos; juros/multa/desconto
  rateados com residuo no ultimo cheque. Terceiro deve estar previamente
  cadastrado e seu valor e usado integralmente; a conta/empresa e disponibilidade
  sao novamente verificadas pelo fluxo existente. Link de cadastro somente
  para quem ja possui permissao. Nao gera novos titulos/autorizacoes; registra
  um movimento por cheque na mesma transacao. Repeticao no lote e bloqueada.
- Baixados inclui pagamentos registrados em pendencias resolvidas. Estornar
  baixa exige motivo e as permissoes existentes de resolver fila E estornar
  titulos; aplica a mesma ACL/escopo do estorno do titulo. Reverte os movimentos
  do pagamento completo, devolve terceiros a carteira e reabre o saldo na fila.
  Registro antigo fica resolvido, preservando movimentos/comprovantes/historico.
  Nao exige comprovante de pagamento ja estornado. Fatura aberta e recalculada;
  fatura com processamento posterior e baixa composta exigem reversao no fluxo
  proprio, sem bypass. Conciliacoes seguem a rotina existente de reabertura.
- Devolver para fila em Nao pagos preserva a autorizacao do mesmo ciclo:
  transfere somente o vinculo operacional, com evento auditado. Autorizacao
  revogada/substituida/pendente ou titulo bloqueado pelo DP impede o retorno.
  Fila direta/legada nao recebe aprovacao digital fabricada.
- Mutex de UI, payload estrito, chave de estorno, locks e transacao protegem
  contra duplo envio. Sem nova migration, mudanca de visibilidade, banco real
  ou deploy nesta implementacao. Testes locais isolados backend/UI desktop e
  celular, build e negativos de escopo aprovados; homologacao MySQL/EC2 e
  concorrencia entre processos ainda precisam de janela de staging.
  [Handoff](../../handoffs/2026-10-13-fila-baixa-cheques-estorno-desconto.md).
  Complemento de UI: [formas e cheques no modal](../../handoffs/2026-10-13-fila-massa-formas-cheques-modal.md).

## Motivo de ajuste nas autorizacoes - 2026-10-11

- Historico do detalhe mostra observacao de STATUS_ALTERADO (incluindo motivos
  digitais ja gravados), sem repetir descricao identica ou alterar o registro.
- A lista de lotes identifica SOL/TIT e resume motivos dos itens REJEITADO ou
  INVALIDADO. Coluna Motivo abre texto completo; fechar/Escape/fundo/voltar do
  navegador retorna ao lote, como a justificativa. Consulta nao decide pagamentos.
- Cada nova recusa grava seu motivo mesmo se outro titulo ja mudou o status
  da mesma solicitacao. Sem nova troca global registra evento proprio; motivos
  de medicao antiga nao sobrescrevem o fluxo da medicao mais recente.
- Sem migration/backfill: textos salvos passam a aparecer; motivos antigos
  ausentes do historico nao sao inventados nem regravados nesta alteracao.
  [Handoff](../../handoffs/2026-10-11-motivo-ajuste-autorizacao.md).

## Pix longo e dados da fila - 2026-10-11

- Copia e Cola aceita texto livre com limite operacional de 8192 caracteres.
  Campos sem seletor preservam o codigo; cadastros que inferem tipo reconhecem
  o prefixo 000201. CPF/CNPJ/telefone conservam suas validacoes especificas.
- Tres inputs de Compras (pedido, solicitacao e frete) ainda limitavam a chave
  a 255 no navegador; agora usam PIX_TEXTO_MAX = 8192, ja aceito pelo backend.
  Demais inputs Pix auditados nao tinham corte de 180/255; o RH ja usa 8192.
- Persistencia usa TEXT nas 12 colunas da migration existente
  202610090001_pix_copia_cola_texto.js. Conferir sua aplicacao em cada ambiente;
  a revisao local nao confirma schema/deploy de producao. Nenhuma nova migration.
- Na fila, dados acima de 120 caracteres ou com mais de duas linhas ganham
  Ver dados completos. Modal somente leitura, texto selecionavel, Copiar dados,
  fechamento por botao/Escape/fundo e preservacao de foco, rolagem, selecao e
  rascunho. Copiar dados copia a instrucao inteira exibida, nao extrai uma chave.
- Usa OverlayModal/useRolagemModal; sem endpoint, permissao de baixa nova,
  alteracao financeira ou consulta bancaria. Testes isolados Pix/backend/UI,
  fila/colunas/preview/baixa em massa e build. Handoff:
  [Pix e dados completos da fila](../../handoffs/2026-10-11-pix-dados-pagamento-fila.md).

## Adiantamento e forma de pagamento - 2026-10-11

O detalhe da solicitacao lista a forma de pagamento do proprio titulo,
inclusive na leitura resumida autorizada, sem ampliar dados bancarios.
A fila conserva a coluna Forma / instrumento existente.

ADIANTAMENTO nasce PAGAR/ABERTO com categoria definida pelo GEO antes do
pagamento, sem reconhecimento de custo antecipado. A conferencia aprovada
preenche valor_despesa_prestacao e rateios efetivos no titulo pago; nao gera
outro titulo de despesa. Sobra gera RECEBER/DEVOLUCAO_ADIANTAMENTO, nao DRE.
Caixa mantem o principal; DRE/obras/custos usam somente a despesa aprovada.
Pagamento 1000, despesa 800 e devolucao 200 resultam em custo 800.

Unicidade e decisoes usam transacao/bloqueios. Edicao de valor/status da
principal apos titulo, renegociacao, exclusao em massa e estorno original
apos envio da prestacao sao bloqueados. Homologacao MySQL real ainda pendente.
Detalhes: [handoff de adiantamento](../../handoffs/2026-10-11-adiantamento-centros-custo.md).

## Preview interno de arquivos da fila - 2026-10-11

- Visualizar PDFs e imagens (JPG/JPEG/PNG/GIF/WebP) na lista de arquivos abre
  um segundo modal, amplo e responsivo (ate 1200px). Reutiliza PreviewAnexoModal
  com dimensoes opcionais; os demais chamadores mantem dimensoes anteriores.
- Presign/acesso seguro e download existentes preservados; nao cria vinculos,
  nao altera pagamento e nao amplia permissoes. Formatos sem preview seguem
  abertura externa. SVG nao e embutido.
- Fechar/Escape retorna a lista de arquivos, com foco no botao e sem perder a
  rolagem da fila. Abertura concorrente e resposta atrasada apos fechar bloqueadas.
- PDF usa viewer nativo com selecao/copia de texto quando o documento permite.
  Nao ha OCR de imagem/PDF escaneado; suporte nativo pode variar por navegador.
- Teste: test:fila-instrumentos-ui inclui filaArquivosPreviewQA.mjs, com
  APIs/arquivos simulados e viewport desktop/mobile, sem banco real.
  Handoff: docs/handoffs/2026-10-11-fila-preview-arquivos.md.

## Colunas da fila por usuario - 2026-10-11

- O botao Colunas permite escolher as colunas visiveis e reordenar por arrasto
  no painel/cabecalho. Setas no painel atendem teclado e celular.
- Reutiliza preferencias do usuario no servidor, com espelho local e chave
  `financeiro-fila-pagamentos`, tipo `colunas`. Ordem/visibilidade sao recuperadas
  na sessao; Restaurar padrao nao apaga larguras ou filtros.
- Selecao, titulo e status/acoes permanecem visiveis. Ocultar/mover nao apaga
  valores digitados, nao altera permissoes e nao muda a elegibilidade de baixa.
  Erros de validacao revelam a coluna necessaria ao voltar para corrigir.
- Sem migration/backend novo. Teste: `test:fila-instrumentos-ui` e
  `backend/scripts/validarListaPreferencias.js` (APIs/banco reais nao utilizados).
  Handoff: `docs/handoffs/2026-10-11-fila-colunas-usuario.md`.

## Fila e comprovantes - 2026-10-11

- Coluna Obra/Centro de Custo usa o local do titulo (catalogo compartilhado),
  sem mudar rateios, empresa pagadora ou permissoes.
- Baixa em massa: selecao individual ou todos os pendentes da lista carregada,
  inclusive no filtro Todos. Limite existente da consulta: 500 entradas; nao
  inclui registros fora dos filtros, baixados, somente consulta ou em edicao DP.
  Divergencias continuam na autorizacao separada. Mesma validacao, transacao e
  idempotencia da baixa individual, comprovante opcional e encargos separados.
- Encargos atuais do titulo sao projetados para filas antigas pendentes sem baixa;
  pagamentos ja executados preservam snapshots. Encargos nao sao repetidos
  no saldo restante apos pagamento parcial. Edicoes manuais na fila continuam
  sendo enviadas explicitamente no payload e valores divergentes exigem motivo.
  Divergencias preservam os encargos informados na tentativa de baixa; edicao
  posterior do titulo usa a sincronizacao transacional ja existente.
- Modal de arquivos guarda a rolagem vertical/horizontal da pagina/tabela ao
  abrir e fechar (botao/Esc), sem alterar o comportamento global dos modais.
- Financeiro da solicitacao usa apenas um include da fila, sem filtro de ativos:
  alias duplicado no ORM preservava filtro que podia esconder filas baixadas.
  Principal e adicionais sao deduplicados por hash na apresentacao existente.
- Importacao pelo nome SOL-xxxx fica vinculada a solicitacao: arquivos ativos
  tambem aparecem na coluna, com prefixo Solicitação. Nao presume um vinculo
  individual ao titulo, nao registra nova baixa e nao muda conciliacao/historico.
- Diagnostico opt-in: `conferirComprovantesSolicitacao.js --somente-leitura`.
  Handoff: `docs/handoffs/2026-10-11-fila-local-massa-comprovantes.md`.

## Papel e propriedade

Financeiro e dono de titulos a pagar/receber, parcelas financeiras, movimentos, baixas, estornos, contas bancarias, categorias, conciliacao e calculos de previsto/realizado. Modulos de origem nao podem criar movimentos diretamente.

## Titulos

Tipos Pix incluem `COPIA_COLA` (rotulo **Copia e Cola**) nos cadastros,
criacao/edicao de titulo, preparar Pix da solicitacao, RH/DP e fretes. Aceita
texto livre ate 8192 caracteres, preservando caixa, simbolos e espacos internos;
apenas espacos nas extremidades sao removidos como nos campos existentes.
Nao validar esse texto como CPF/CNPJ/email/UUID nem corta-lo. Os tipos antigos
mantem as validacoes existentes. A fila manual usa o dado cadastrado; o lote
automatico BB atual por chave Pix rejeita Copia e Cola antes de gerar intents.

Migration `202610090001_pix_copia_cola_texto.js`: expansao de 12 colunas para
TEXT, preservando nulabilidade, dados e indice Pix com prefixo MySQL; nenhum
backfill ou mudanca de status. Aplicar antes de usar codigos longos. Cadastro
simplificado usa SHA-256 do texto em `pix_chave_canonica` apenas para este novo
tipo, preservando unicidade sem reduzir ou alterar o codigo armazenado.
Validacoes locais: `npm run test:pix-copia-cola` em backend e frontend.

- tipo obrigatorio `PAGAR` ou `RECEBER`;
- origem pode ser solicitacao, compra, comercial, RH/DP ou lancamento manual;
- parceiro, empresa, categoria, vencimento e valor devem ser consistentes;
- referencia de origem deve impedir titulo duplicado;
- status e saldo derivam dos movimentos ativos;
- edicao de titulo movimentado possui restricoes e auditoria.

## Recarga de cartao e envio independente

Novas recargas criam um titulo `ABERTO` por cartao, com a obra/centro de custo
da solicitacao como origem. Reabrir uma recarga ainda sem baixa preserva essa
origem e o estado aberto. A obrigacao a pagar e o movimento de caixa continuam
visiveis; nao sao custos apropriados antes da prestacao validada por cartao.
`considera_dre=false`, sem rateios financeiros, ate a validacao existente.

Resultado de Obras exclui a recarga do agregado direto; o custo entra somente
pelos rateios classificados da prestacao, sem somar a origem outra vez. Gestao
de Obras tambem nao usa a origem nem rateios da solicitacao como fallback de
custo antes dessa classificacao. O relatorio Financeiro Obras tambem exclui
recargas ainda sem essa classificacao, preservando filtros de obra, periodo e
busca. Pagamentos e anexos separados por cartao, status parcialmente pago/PAGA
e regras de prestacao permanecem existentes.

No card Financeiro dos detalhes, preparar autorizacao e enviar para fila sao
botoes separados. Cada permissao habilita apenas sua acao; a fila nao exige
permissao de preparar autorizacao, mesmo em PILOT/ENFORCED. A autorizacao
digital precisa estar disponivel, conforme regras do modulo. Selecoes e
destino sao congelados antes da confirmacao; trava e chave de idempotencia
sao compartilhadas com o modal de medicao e preservadas ao repetir uma falha.

## Juros e multa na edicao e na fila

Juros e multa sao valores em reais, nao percentuais. Na edicao do titulo ficam
em campos distintos e o total previsto e o valor liquido/base mais esses dois
encargos. O principal, os impostos e os rateios nao sao capitalizados pelos
encargos. Na Fila de Pagamentos ha uma coluna para cada encargo; o valor pago
e o desembolso total. A baixa abate apenas o principal do saldo e grava juros
e multa separadamente no movimento financeiro existente.

Exemplo: saldo de R$ 200,00, juros de R$ 10,00 e multa de R$ 3,00 esperam
pagamento de R$ 213,00, sem divergencia. Valor pago acima/abaixo desse total
continua seguindo o fluxo de divergencia justificada. Cartao de credito
continua exigindo quitacao integral, e sua fatura inclui os encargos efetivos.
Cheque de terceiro cobre o desembolso total, nao somente o principal.

Salvar uma edicao sincroniza saldo, vencimento e encargos com itens ativos da
fila ainda sem movimento, na mesma transacao (lock titulo antes de fila).
Nao altera pagamentos anteriores, comprovantes, valor pago informado, motivo
ou status de divergencia. Corrigir um titulo divergente nao autoriza sua baixa
automaticamente: a aprovacao existente permanece obrigatoria. Titulos ja
movimentados continuam sujeitos aos bloqueios de edicao anteriores.

Atualizar a tela busca o saldo/encargos novos, preservando valores de pagamento
digitados manualmente. Encargos configurados no titulo so sao copiados na
entrada/reabertura sem baixa anterior, evitando repeti-los numa segunda baixa
parcial. O dossie digital inclui encargos nao zerados no total e na revalidacao
material; titulos sem encargos mantem o formato/hash legado.

Reutiliza as rotas/permissoes de edicao de titulos, registro de baixas e
aprovacao de divergencias; nenhuma permissao nova. Requer aplicar a migration
estrutural `202610080002_fila_pagamentos_juros_multa.js` antes de iniciar o
backend atualizado. Adiciona `juros`/`multa` DECIMAL(14,2), default zero, em
`titulos_financeiros` e `pagamentos_manuais_fila`, sem DML/backfill. Os dados
ficam separados para evolucao dos relatorios; layouts de relatorios nao foram
alterados nesta entrega.

Validacoes isoladas no backend: `test:fila-juros-multa`,
`test:fila-instrumentos`, `test:fila-comprovante-pendente`.
No frontend: `test:fila-instrumentos-ui`, `test:titulo-juros-multa-ui` e build.
Os testes UI usam a pagina real com APIs simuladas, em desktop/mobile.

## Relatorio PDF de titulos

O botao Gerar relatorio em Contas a Pagar gera somente os titulos selecionados
quando ha selecao. Sem selecao, gera todos os titulos dos filtros aplicados,
incluindo todas as paginas da consulta. O botao indica a quantidade selecionada.
Ambos os casos preservam os filtros e o escopo financeiro autorizado.

Sem selecao, usa `GET /financeiro/titulos/relatorio.pdf`. Com selecao, usa `POST`
na mesma rota, com `titulo_ids` no JSON e os filtros na query. A permissao
continua sendo `financeiro.titulos.exportar`. O POST aceita ate 5000 IDs e nao
altera registros. Se algum titulo selecionado nao estiver mais disponivel nos
filtros ou no acesso atual, retorna erro e pede nova selecao; nunca gera todos
os filtrados como alternativa silenciosa. O bloqueio operacional de obras
mantem esse POST disponivel como consulta, sem liberar escritas. O controle
diario de caixa permanece inalterado para GET e POST.

A coluna Solicitacao fica imediatamente apos Titulo e mostra
`solicitacao.codigo` (por exemplo, `SOL-6240`), nunca o ID interno. Sem codigo
vinculado, mostra `-`. O renderer compartilhado de Contas a Receber segue a mesma
ordem. Totais, datas e filtros permanecem inalterados.

Validacao isolada: `npm run test:relatorio-titulos-solicitacao` no backend.
Selecao, filtros e acesso: `npm run test:relatorio-titulos-selecao` no backend;
handler, botao e HTTP reais com APIs simuladas: comando de mesmo nome no frontend,
com Playwright e Chrome disponiveis.
Nao requer migration ou nova permissao.

## Cartao na geracao pela solicitacao

Na aba Financeiro dos detalhes da solicitacao, o cartao utilizado e opcional
para as formas Cartao de Credito e Cartao de Debito. Sem cartao informado,
o titulo nasce em `ABERTO`, sem baixa, movimento, fatura ou quitacao automatica.
Com cartao informado, continuam as validacoes de atividade, tipo e conta
pagadora e a quitacao automatica existente (credito com fatura ou debito).
A escolha explicita de `PREVISAO` preserva o comportamento de previsao.

A baixa posterior pelo Financeiro exige informar o cartao efetivamente
utilizado e registra o pagamento no titulo original. Parcelamento, datas,
rateios, empresa e permissoes existentes permanecem inalterados. Esta
dispensa pertence somente ao servico `criarTituloPorSolicitacao`, chamado
por `POST /solicitacoes/:id/gerar-conta` com `financeiro.titulos.criar`;
nao e flag de payload e nao dispensa cartao no lancamento manual nem na baixa.
Nao requer nova permissao, variavel ou migration.

Validacao sem banco: `npm run test:cartao-opcional-solicitacao` no backend.
Formulario real com APIs simuladas: `npm run test:cartao-opcional-solicitacao-ui`
no frontend, com Playwright e Chrome disponiveis.

## Recargas de cartoes

Uma solicitacao de recarga pode conter varios cartoes. Cada cartao gera seu
proprio titulo PAGAR em PREVISAO, com fornecedor, empresa e categoria do
cadastro do cartao. A liberacao da solicitacao abre todos os titulos ainda em
previsao; baixa e prestacao de contas continuam separadas por cartao.

O status agregado fica `PARCIALMENTE PAGO` enquanto houver cartao com valor
pendente e muda para `PAGA` quando todos estiverem integralmente pagos. A
regra anterior de recarga parcial permanece: a baixa encerra o titulo pelo
valor efetivamente pago e registra o valor nao recarregado no ciclo; esse caso
mantem o agregado parcial. Estornos nao foram ampliados nesta entrega e devem
seguir as restricoes financeiras existentes.

A primeira baixa nao retira do Financeiro uma solicitacao com outros cartoes
aguardando pagamento. Quando todos os ciclos estiverem pagos ou cancelados,
o retorno ocorre para OBRA ou, em Centro de Custo, para o setor criador.
Prestacao validada grava somente os rateios do titulo daquele cartao e libera
sua classificacao de custo. Repetir a sincronizacao sem nova baixa nao desfaz
o status ATENDIDO/APROVADA da prestacao.

Configuracao, documentos e escopo:
[Recarga de cartoes por origem](../solicitacoes/README.md#recarga-de-cartoes-por-obra-e-centro-de-custo).
Implementacao: `recargaCartaoService` e `solicitacaoFinanceiroStatusService`.
Validacao sem banco: `npm run test:recargas-multiplas` no backend.

## Importacao em massa de contas a pagar

A importacao em massa esta implementada no repositorio e depende da migration `202607200001_financeiro_titulos_importacao.js` no ambiente de destino. O fluxo e exclusivo para `PAGAR`: o usuario exporta o modelo versionado em Contas a Pagar, envia o `.xlsx`, revisa o preview persistido e confirma a criacao atomica.

- permissao especifica `financeiro.titulos.importar`;
- `empresa_codigo` + `obra_codigo` identificam a obra pela referencia operacional conhecida pelo usuario; `apropriacao_codigo`, quando informado, identifica a apropriacao dentro dessa obra; o backend resolve os IDs internos e deriva da obra a empresa e a DRE do titulo;
- `credor_cpf_cnpj` identifica o parceiro pelo documento visivel na tela, com ou sem mascara, e `categoria_nome` usa o nome exibido no cadastro;
- o modelo de importacao nao expoe IDs internos de obra, credor, categoria ou apropriacao e bloqueia referencias inexistentes, ambiguas, inativas ou fora do escopo;
- o credor e global e pode representar colaborador cadastrado em outra empresa;
- em Contas a Pagar, o filtro de credor pesquisa todos os parceiros ativos do cadastro central, incluindo credores e fornecedores de Compras ja vinculados; a lupa abre a listagem completa com busca por nome ou CPF/CNPJ e rolagem responsiva;
- o modelo `1.4` separa as referencias em `EMPRESAS`, `OBRAS`, `APROPRIACOES`, `CREDORES`, `CATEGORIAS`, `FORMAS_PAGAMENTO` e `DOMINIOS`, todas com filtro e pesquisa do Excel; `CREDORES` informa se o favorecido bancario/PIX esta pronto;
- as listas suspensas usam essas abas, mas a planilha representa um retrato dos cadastros no momento da exportacao; para incluir referencias criadas depois, o usuario deve exportar um novo modelo;
- referencias sao revalidadas no preview e na confirmacao;
- parcelas, rateios e impostos usam abas relacionadas por `chave_importacao`;
- formulas, macros, linhas ocultas e colunas ocultas com dados sao rejeitadas;
- confirmacao exige `Idempotency-Key`, bloqueio transacional e rollback integral em erro;
- titulos recebem origem `IMPORTACAO` e nao criam baixas, movimentos, intents, faturas ou vinculos operacionais.

Detalhes tecnicos e cenarios de aceite estao em [`PLANO_IMPORTACAO_TITULOS_PAGAR.md`](./PLANO_IMPORTACAO_TITULOS_PAGAR.md).

## Baixa e estorno

- baixa pode ser parcial ou total;
- a baixa em massa lista somente formas ativas de `financeiro_formas_pagamento` e grava
  `forma_pagamento_id` no movimento, preservando `forma_recebimento` como classificacao
  tecnica retrocompativel;
- o tipo cadastrado dirige as regras existentes: `CARTAO_CREDITO` e `CARTAO_DEBITO`
  executam a regra `CARTAO`; formas como `FOPAG` podem permanecer distintas no cadastro
  e executar a regra `TRANSFERENCIA`;
- movimentos legados sem `forma_pagamento_id` continuam validos e as APIs antigas ainda
  podem enviar apenas a classificacao tecnica aceita;
- exige conta, data, valor base e ajustes de juros, multa ou desconto;
- transacao bloqueia pagamento acima do saldo;
- estorno marca o movimento como `ESTORNADO` e recalcula o titulo;
- estorno nunca remove a trilha;
- nova baixa depois do estorno e uma nova operacao auditada;
- comprovantes e conciliacoes vinculados precisam ser revistos.

## Fila manual de pagamentos

A Fila de Pagamentos separa a preparacao da carteira da execucao no banco. Em Contas a Pagar, quem possui `financeiro.fila_pagamentos.preparar` seleciona titulos abertos e os encaminha para a fila; o operador pode ter acesso somente a essa tela pelas permissoes do grupo `financeiro.fila_pagamentos`.

- a tela operacional e uma tabela responsiva com rolagem horizontal, sem modal de baixa;
- cada linha mostra titulo, credor/favorecido, documento, PIX ou codigo do boleto, vencimento, saldo e forma de pagamento;
- o operador informa a forma efetiva, data da baixa, conta pagadora e valor pago; a empresa e derivada da conta e as regras existentes de caixa e intercompany continuam aplicadas;
- valor exato registra baixa total, valor menor registra baixa parcial e cria alerta de divergencia, valor maior nao baixa e permanece divergente;
- `NAO_PAGO` mantem o titulo aberto e exige motivo;
- a grade de Contas a Pagar mostra na propria linha os estados `Em fila de pagamento`, `Pagamento nao realizado` e `Pagamento divergente`;
- previsao de pagamento por cartao sem vinculo a fatura pode entrar na fila: o cartao e informado ao registrar a baixa. Credito quita o titulo e vincula a compra a uma fatura aberta; debito usa a conta vinculada. Titulos ja vinculados a fatura continuam no fluxo da fatura, sem segunda baixa;
- credito exige quitacao integral sem baixa anterior, pois a fatura soma o valor integral do titulo. Cartao, conta e forma devem ser compativeis;
- cheque proprio registra numero, emitente e demais dados do documento. Cheque de terceiro consome um cheque disponivel da carteira, com valor exato e empresa compativel, sem duplicar saida bancaria;
- rejeicoes atuais do proprietario aparecem em Nao pagos com motivo, somente para consulta; nao viram pagamentos executaveis nem permitem reabrir pela fila;
- o lote usa uma unica transacao e locks por titulo/item: se uma linha falhar, nenhuma baixa do lote e confirmada;
- uma chave de idempotencia protege criacao e processamento contra clique ou envio repetido.

Na tabela, trocar a forma de pagamento limpa a conta pagadora, que volta a
Selecione. Escolher um cartao continua preenchendo sua conta vinculada.
Cheque proprio usa modal com os campos compartilhados: Confirmar aplica os
dados ao rascunho da linha; Cancelar/Escape descartam somente a edicao do
modal, sem efetuar baixa. O botao de editar reabre os dados confirmados.
Cheque de terceiro continua sendo selecionado da carteira por empresa.
Acoes de abrir solicitacao/arquivos, consultar e anexar comprovantes usam
icones com tooltip e nomes acessiveis, preservando rotas e permissoes.

Permissoes independentes: `visualizar`, `preparar`, `baixar`, `reportar` e `resolver`. Elas nao liberam as demais telas do Financeiro.

Autorizadores nominais com `financeiro.autorizacoes_pagamento.decidir` podem revogar itens ou todas as autorizacoes de um lote, com motivo e passkey. A revogacao retira as entradas ativas da fila e retorna os itens a pendentes, preservando comprovantes, dossie e eventos. Baixa parcial/total, movimento financeiro registrado, pagamento bancario ativo ou ciclo mais recente impedem a operacao. Nao e um estorno.

A migration `202610080001_fila_pagamentos_instrumento.js` adiciona o instrumento efetivo na fila e a revisao da autorizacao no lote. Deve ser aplicada antes do backend atualizado. Nao insere cadastros ou pagamentos e nao deve ter suas colunas removidas depois do uso.

### Baixa com comprovante posterior

Registrar a baixa de um item pendente nao exige PDF. Conta, data, valor,
instrumento e justificativa de divergencia continuam obrigatorios conforme
as regras existentes. A baixa registra o movimento e atualiza o titulo e a
solicitacao pelo fluxo financeiro normal; faltar comprovante nao deixa o
pagamento aberto nem cria outro movimento.

O card Pendentes de comprovante fica imediatamente apos Pendentes. E um
recorte virtual `PENDENTE_COMPROVANTE`, nao um status gravado no banco:
lista itens BAIXADO, DIVERGENTE ou RESOLVIDO com movimento registrado e sem
hash/URL do primeiro PDF. O card pode sobrepor Baixados ou Divergentes;
os numeros nao devem ser somados como categorias exclusivas. Divergencia
acima do saldo sem movimento nao entra nessa pendencia. Uma baixa parcial
continua sendo divergente e aparece tambem na pendencia de comprovante.

O usuario pode anexar o primeiro PDF depois da baixa, pela linha com
`financeiro.fila_pagamentos.baixar` ou pela importacao com
`financeiro.fila_pagamentos.importar_comprovantes`. Esses caminhos gravam
somente o anexo: nao mudam valor, data, conta, instrumento, saldo, fatura ou
movimento ja registrado. O importador identifica o valor pago para itens
baixados, em vez de mostrar apenas o saldo zerado. Locks, hash de arquivo
e revalidacao do estado impedem vinculos repetidos; rejeicoes somente
consulta nao recebem anexos nem nova baixa. Consultar a fila continua
exigindo `financeiro.fila_pagamentos.visualizar`.

Anexar o comprovante retira o item desse recorte, sem remover o historico.
O PDF tambem e vinculado ao historico e aos anexos da solicitacao do titulo,
reutilizando a URL permanente no S3. Isso ocorre na transacao da baixa
quando o comprovante ja existe, ou na transacao de upload/importacao tardia.
Cada arquivo tem uma entrada `COMPROVANTE_ADICIONADO`, com IDs da fila,
titulo e movimento. Baixa parcial tambem recebe comprovante; divergencia
sem movimento so publica o arquivo quando a baixa for de fato autorizada.
Titulos sem solicitacao continuam somente na fila. Replay nao duplica
historico/anexo nem ressuscita arquivos removidos.

Registros antigos nao recebem backfill durante o deploy. O script
`backend/scripts/reconciliarHistoricoComprovantesFila.js` prepara conferencia
somente leitura por padrao, em lotes de ate 100 itens. A aplicacao separada
exige IDs revisados, hash da conferencia, superadmin ativo e opt-in
`ALLOW_PAYMENT_RECEIPT_HISTORY_RECONCILIATION=true`. Revalida sob locks e
registra auditoria na mesma transacao; nao altera valores, saldos, status,
datas ou movimentos. A execucao de escrita precisa de autorizacao propria.

Reabrir uma divergencia cria outro ciclo para o saldo, preservando o
pagamento e eventual pendencia de comprovante do ciclo anterior. A aprovacao
de baixa divergente acima do saldo continua exigindo comprovante; esta
entrega dispensa PDF apenas no registro regular dos itens pendentes.

Nao requer migration, variavel ou permissao nova. Testes sem banco:
`npm run test:fila-instrumentos` e `npm run test:fila-comprovante-pendente`
no backend; `npm run test:fila-instrumentos-ui` no frontend (Chrome/Playwright,
APIs simuladas). Homologar PDF real e baixa no ambiente dev antes de producao.

### Analise do proprietario e envio independente

Solicitar autorizacao exige `financeiro.autorizacoes_pagamento.preparar`.
Enviar para pagamento exige somente `financeiro.fila_pagamentos.preparar`,
em OFF, PILOT, ENFORCED e PAUSED. As permissoes sao independentes: quem
possui ambas ve os dois botoes. O envio direto usa a confirmacao habitual,
sem declaracao de autorizacao em papel ou permissao adicional. A auditoria
registra o responsavel pelo envio, sem simular assinatura do proprietario.

O status interno nativo `EM ANÁLISE DO PROPRIETÁRIO` pode ser aplicado
individualmente ou em massa com `financeiro.titulos.status_interno`.
Preparar um dossie digital aplica o mesmo status e atualiza as solicitacoes
vinculadas, sem mudar o setor, saldo ou status financeiro. Analise nao
significa autorizacao nem baixa. O ingresso efetivo na fila muda o status
interno para `ENVIADO PARA PAGAMENTO` e encaminha a solicitacao ao Financeiro.
Rejeicao ou invalidacao digital sinaliza ajuste; estados finais sao preservados.

A camada digital usa PWA, passkey, dossie isolado, segregacao entre preparador
e autorizador, revalidacao material e reuso transacional da fila atual.
Dossie ativo nao impede o envio direto pela permissao da fila. Os dois
caminhos reutilizam a entrada ativa do titulo, sem duplicar fila, baixa ou
comprovantes. Na mesma transacao do envio, o item do dossie recebe
`ENFILEIRADO` e `fila_item_id`; a auditoria distingue `ENVIO_DIRETO` de
`AUTORIZACAO_DIGITAL`, sem atribuir uma decisao por passkey ao envio direto.
Lotes com pendencias continuam `AGUARDANDO`; sem pendencias nem itens
autorizados por enfileirar, ficam `CONCLUIDO` quando existe item na fila.

A tela de autorizacoes mostra `Na fila de pagamento` e a referencia da fila.
Atualiza pelo botao Atualizar, ao retornar a janela e a cada 30 segundos
enquanto visivel e sem operacao em andamento. A atualizacao preserva as
desmarcacoes dos itens ainda pendentes e descarta respostas antigas. O aviso
do envio direto informa quantos titulos foram criados, ja estavam na fila
ou ja foram processados no replay da mesma chave, sem anunciar novo envio.

Validacoes isoladas: `npm run test:fila-autorizacao-convergencia` no backend
e `npm run test:fila-autorizacao-convergencia-ui` no frontend (Playwright e
Chrome). Nao requer migration, variavel ou permissao nova.
O contrato, configuracoes e limites estao em
[`AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md`](./AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md).

Em OFF ou PAUSED, o botao de solicitar autorizacao permanece visivel para
quem tem a permissao, mas desabilitado. A marcacao manual de analise e o
envio direto continuam disponiveis pelas suas proprias permissoes. Este
ajuste nao exige migration, variavel nova ou seed de status em producao.

### Consulta dos lotes de autorizacao

Os lotes novos recebem `LOTE-<id>` na mesma transacao da criacao, usando o ID
auto-incrementado, sem contador paralelo ou `MAX+1`. Replay conserva o lote;
rollback pode deixar lacunas naturais na sequencia. A tela tambem usa esse
rotulo para legados, sem reescrever seus codigos, documentos ou hashes. Data,
criador e codigo persistido ficam acessiveis em Registro do lote.

No PWA instalado (standalone Android ou iOS), um autorizador nominal com
`enabled` e `can_decide` entra diretamente nas autorizacoes, tanto apos login
como ao acessar Inicio. O preparo de MFA continua prioritario. Navegador
comum e usuarios somente preparadores conservam a preferencia de tela inicial.
Somente essa rota usa o shell compacto: Conta mantem tema, perfil, notificacoes,
busca, modulos e saida; Opcoes mantem avisos e passkey. Sem passkey, o cadastro
fica visivel e a assinatura continua bloqueada. Dispositivos ficam recolhidos.
Guardas operacionais e auditoria continuam ativos; nenhuma permissao mudou.
Validar com `test:tela-inicial`, `test:autorizacao-pwa` e a suite da fila.

Lotes nao expiram operacionalmente: pendencias continuam aguardando decisao,
inclusive lotes antigos cujo `expira_em` esteja no passado. Esse campo e o TTL
de lote permanecem apenas como metadados de compatibilidade, sem migration ou
atualizacao em massa. A passkey continua exigindo um challenge valido de cinco
minutos, de uso unico; saldo, documentos, hash e elegibilidade sao revalidados.

A tabela destaca o codigo SOL e mantem TIT como referencia secundaria (ou
principal para titulo avulso). JUSTIFICATIVA fica apos STATUS e antes de
MOTIVO. Titulos de Solicitacao
de Compra e Compra Direta mostram somente o tipo no resumo, nao seus itens;
snapshots, documentos e descricoes originais nao sao alterados. A lista mostra
data de criacao em vez de expiracao. Mobile preserva as colunas por rolagem.

A lista limita os 100 lotes mais recentes, nao seus itens ou documentos. A
associacao do titulo e opcional e preserva o filtro de exclusao logica: quando
o titulo deixa de existir na consulta, o item e seu snapshot continuam no
historico. Isso evita uma juncao invalida na subquery paginada do Sequelize.
Lista e detalhe mantem as permissoes e regras de decisao existentes.

A justificativa e o texto atual da solicitacao de origem, consultado somente
para leitura pelo proprio endpoint de lotes, inclusive nos lotes antigos.
Nao usa a descricao do titulo nem revela itens de compra como alternativa.
Sem justificativa/origem disponivel, mostra `-`. Nao altera snapshots,
hashes, documentos, assinaturas, revisoes, status ou elegibilidade.

O trecho clicavel abre um modal com o texto integral e quebras de linha, sem
interpretar HTML. Fechar, Escape, clique no fundo e voltar do navegador/PWA
retornam a lista no mesmo lote e preservam a selecao. A entrada de historico
e temporaria na mesma rota; link direto sem historico fecha por substituicao
da query, sem sair da tela. O modal compartilhado nao muda o comportamento
de clique fora para seus outros consumidores.

Atualizar faz somente consultas e preserva lote/selecao ainda disponiveis.
O controle de sequencia ignora respostas antigas; nao prepara, autoriza ou
reenvia pagamentos. Revisao com `test:fila-autorizacao-convergencia-ui` e
`test:autorizacao-pwa` no frontend, com APIs simuladas. A consulta SQL real
simulada valida LEFT JOIN da solicitacao sem perder titulos avulsos/historico.

Validacao isolada com gerador SQL MySQL e hidratacao reais do Sequelize:
`npm run test:autorizacao-consulta-sql` no backend, tambem incluido em
`test:fila-instrumentos`. O transporte de banco e simulado, sem conexao ou
escrita. Nao requer migration ou mudanca de configuracao.

## Cheques de terceiros e baixa com multiplas fontes

Cheques recebidos de terceiros sao controlados em carteira de custodia, sem simular uma conta bancaria. O financeiro pode registrar/importar saldo legado, transferir a custodia entre empresas, depositar em conta da mesma empresa ou utilizar o cheque integralmente como um componente de uma baixa composta.

A baixa composta permite combinar Pix, transferencia, dinheiro, cartao e cheque conforme as formas ativas cadastradas, distribuindo cada fonte entre titulos `PAGAR` do mesmo credor e empresa. Preview, confirmacao e estorno sao atomicos, idempotentes e auditados. A baixa simples e a baixa em massa anteriores continuam disponiveis.

Regras, endpoints, permissoes e limites: [`CARTEIRA_CHEQUES_BAIXA_COMPOSTA.md`](./CARTEIRA_CHEQUES_BAIXA_COMPOSTA.md). Matriz operacional: [`MATRIZ_SMOKE_CHEQUES_BAIXA_COMPOSTA.md`](./MATRIZ_SMOKE_CHEQUES_BAIXA_COMPOSTA.md).

## Relatorios

- previsto: titulos `PREVISAO`, `ABERTO` ou `PARCIAL`, conforme periodo e data de corte;
- realizado: movimentos ativos;
- movimentos estornados nao compoem realizado;
- DRE por competencia e fluxo de caixa por movimento nao podem usar a mesma data sem regra explicita;
- Resultado de Obras deve refletir estorno imediatamente;
- toda agregacao deve permitir rastrear o lancamento de origem.

### Fluxo de caixa previsto x realizado

- historico planejado preserva o valor original do titulo para datas ja alcancadas;
- projecao futura usa o saldo ainda aberto e nao repete titulo quitado;
- realizado usa `data_movimento` e nunca trata data futura como baixa;
- comparativo limita previsto e realizado a mesma data de corte;
- datas futuras do realizado aparecem como indisponiveis, nao como zero acumulado;
- seletor oferece periodos historicos, atuais, futuros e intervalo personalizado;
- nas visoes por natureza, entradas sao verdes e saidas vermelhas; no comparativo,
  as cores distinguem previsto e realizado.

## Contrato de venda recebido por cheque

Quando a forma efetiva do contrato de venda e cheque, o titulo a receber deve nascer
quitado e o cheque permanece em carteira/custodia. A quitacao e o cadastro do cheque
sao atomicos e idempotentes. Devolucao do cheque reabre a obrigacao vinculada, sem
apagar a baixa ou a trilha anterior; os novos cheques podem compor nova baixa conforme
as regras da baixa composta.

## Conciliacao OFX

OFX serve para conferencia. Importacao bloqueia arquivo/transacao duplicada, sugere candidatos e exige confirmacao humana. Nao cria titulo nem baixa automaticamente.

Na conciliacao de transferencias, o sinal do OFX define o sentido financeiro: debito na conta atual significa conta atual para contraparte; credito significa contraparte para conta atual. Quando existir um unico lancamento pendente na outra conta, com mesma data e valor exatamente oposto, o sistema preseleciona a conta e vincula os dois OFX a uma unica transferencia. Empates permanecem manuais para evitar associacao indevida.

Conciliacoes podem ser estornadas pelo relatorio de Conciliacao bancaria quando o usuario possui `financeiro.conciliacao.estornar`. O fluxo reabre o lancamento OFX para conferencia manual e registra o motivo na auditoria. Transferencias sao canceladas, tarifas criadas pela conciliacao sao estornadas e vinculos com titulos, faturas ou movimentos preexistentes sao desfeitos sem apagar o registro financeiro original. O relatorio aceita filtros por periodo, conta, status, natureza, tipo de vinculo e texto do extrato.

Liberacoes e amortizacoes de credito rotativo sao registradas diretamente a partir do lancamento OFX pendente. Nao existe cadastro de linha de credito nesta fase: credito na conta gera `LIBERACAO_CREDITO_ROTATIVO` e debito gera `AMORTIZACAO_CREDITO_ROTATIVO`, sempre com valor e data derivados do extrato. Esses movimentos alteram o caixa, compoem o saldo de endividamento e aparecem nos relatorios de movimentacao, conciliacao e endividamento, mas nao recebem categoria financeira e nao compoem a DRE. O estorno devolve o OFX para `PENDENTE` e retira o movimento ativo dos saldos e relatorios.

Quando o banco credita a devolucao de uma tarifa ja registrada, o usuario usa `Acoes rapidas > Estorno de tarifa bancaria`. O sistema lista somente tarifas ativas da mesma conta, empresa e valor integral, com data igual ou anterior ao credito. A confirmacao cria `ESTORNO_TARIFA_BANCARIA` vinculado ao movimento original, reaproveita a categoria financeira e neutraliza caixa e DRE sem apagar nenhum dos dois registros. Uma tarifa nao pode receber dois estornos ativos; se houver mais de uma candidata, a escolha permanece manual e auditavel.

## Dependencias e risco

Recebe dimensoes de Parceiros, Empresas, Obras e Apropriacoes; recebe origens de Solicitacoes, Compras, Comercial e RH/DP; alimenta Obras, Provisionamento, Boletos, relatorios e Governanca. Qualquer mudanca em saldo, status ou movimento exige reconciliacao de todos esses consumidores.

## Idempotencia

Geracao de titulo, baixa, estorno, importacao OFX e conciliacao sao transacionais e protegidos contra repeticao. O frontend bloqueia duplo clique e o backend garante unicidade e estado valido.
