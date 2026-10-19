# Permutas realizadas e mapa de datas

## Autoridade e isolamento

Usuario autorizou implementar na base refactor/frontend, preservar legado e
permissoes, sem producao. Confirmou posteriormente a reducao de escopo: nesta
PRIMEIRA ETAPA registrar valores realizados, sem limite/saldo de acordo, sem
saldo inicial e sem depender de recebimentos anteriores. A empresa controla o
limite negociado externamente ate alinhar a proxima etapa. Nao inventar saldo.

Branch local isolada codex/permutas-saldo-mapa-datas-20261018 baseada em2e146629.
Nao houve commit/push, EC2/SSH, banco ou Redis reais, PM2, .env ou deploy. Main,
outros worktrees e outputs/ preservados. Nao criar goal ou delegar agentes.

## Duas frentes

### Operacao e relatorio

- Registro PERMUTA em Cadastros Financeiros, sem seed/migration de dados.
  Flags de fatura/boleto/cartao/cheque proibidas. Tipo novo pode ser cadastrado
  pela tela existente, nao precisa de conta bancaria ficticia.
- Granulares independentes: financeiro.permutas.cadastrar, .usar, .relatorio.
  Servidor usa verificacao estrita e exige acesso financeiro existente;
  SUPERADMIN conserva excecao global. Frontend usa a mesma lista explicita.
  Nao substitui permissoes atuais de cadastrar/baixar/estornar nem amplia obra.
  Sessao expoe permutas_permissoes com somente as tres concessoes efetivas,
  inclusive para ADMINISTRADOR, cujo areas_permissoes e vazio por bypass nas
  demais areas. Nao muda o bypass existente nem concede granular automaticamente.
- Baixa simples PERMUTA pelo detalhe/massa e multiplas fontes aproveitam o
  servico canonico. Legado nao recebe FK, acordo ou movimentos duplicados.
  Novo tipo_permuta nao pode marcar um PIX como se fosse permuta. BENS com
  tipo_permuta explicito exige a mesma permissao. Consultas antigas intocadas.
- Fila: forma integral PERMUTA dispensa conta e usa empresa do titulo ou empresa
  explicitamente selecionada, inclusive titulo compartilhado sem devedor unico.
  Catalogo de instrumentos inclui empresas ativas id/nome para essa escolha,
  sem liberar endpoint administrativo. Empresa e validada no servico de baixa.
- Composicao da fila: escolher forma monetaria e informar Parte em permuta.
  O Valor pago continua TOTAL da operacao, nao so dinheiro. Exemplo200total:
 60permuta +140PIX. Outra parte: PIX/transferencia/boleto/dinheiro. Cartoes e
  cheques mantem seus fluxos proprios; nao permitir mistura silenciosa com
  instrumentos rateados/cartoes de credito ou parcelas compartilhadas.
  Baixa em massa preserva parte/referencia/categoria preparadas em cada linha
  quando a forma comum e compativel. Troca incompativel e bloqueada, sem apagar
  a composicao silenciosamente. PERMUTA integral usa o total explicitamente.
- Usar principal e quitacao separados: juros/multa/desconto ficam na parte
  monetaria. Parte permuta deve ser menor que principal/quitacao. Para integral,
  selecionar PERMUTA. Valor acima do saldo em permuta exige ajustar titulo
  antes de baixar; nao criar divergencia sem fonte bancaria para aprovar depois.
- Duas baixas dentro da transacao atual da fila, protegidas por locks e pela
  idempotencia existente. Novo PagamentoFilaLiquidacao referencia as duas
  alocacoes; nao cria novo schema. Estorno direto de um componente e impedido;
  estorno pela fila reverte o grupo, reabre saldo uma vez e preserva remetente.
  Chave do grupo e hash64, compativel com coluna80, distinta por item mesmo com
  chave publica de80caracteres e varias composicoes no mesmo lote.
- SecurityEventLog de PERMUTA gravado na mesma transacao do movimento, alem
  da auditoria existente. Se indisponivel, nenhuma parte deve ser confirmada.
- Relatorio /financeiro/permutas, endpoint /financeiro/permutas/relatorio,
  paginado50/limite100, datas opcionais por data_movimento. Buscar titulo,
  parceiro, empresa, obra e referencia. Tipos pagar/receber; ativo/estornado.
  Totais separados, sem saldo ficticio/netar recebimentos contra pagamentos.
  Inclui PERMUTA legado e BENS/tipo_permuta, titulo excluido permanece historico.
  Respeita obras e todas as participacoes de compartilhados; sem duplicar joins.
- UX compacta orientada a campos/valores, sem novos textos explicativos. Skill
  frontend-design usada para reutilizacao, progressao dos campos e mobile.

Arquivos: permutaOperacionalDomain/permutaRelatorioService, AuthController, routes,
moduloPermissoes, financeiroCadastroService, tituloFinanceiroService,
pagamentoManualFilaService/InstrumentoDomain, paymentValidators; helper
frontend permuta, InstrumentoPagamentoFila/BaixaMassaFilaModal/BaixaCompostaModal,
FinanceiroTituloDetalhe/Titulos/Cadastros/FilaPagamentos/Permutas, cliente API,
whitelist de rascunho, App/navigation e catalogo backend gerado.

### Mapa de datas

- Primeiro mapa, sem padronizacao global ou correcao automatica do ano0226.
- Parser Babel existente analisa frontend/src, backend/src e migrations;
  enumera controles, aliases, configuracoes e inputs dinamicos, colunas e
  conversores. Nao executa codigo da aplicacao nem conecta banco.
- docs/datas/INVENTARIO_CAMPOS_DATAS.md e inventario-campos-datas.json sao
  reproduziveis. MAPA_E_PLANO_PADRONIZACAO.md explica riscos, caminhos de baixa,
  fila, PWA, RH, compras e contratos, prioridades e criterio de rollout.
-1821arquivos analisados sem erro;160controles compartilhados,19nativos,
 83configs,14dinamicos.875declaracoes schema/modelo nao sao875colunas distintas;
 2262referencias de conversao. Timestamps implicitos, campos externos e
  cruzamento manual de todos os endpoints/dinamicos exigem etapa posterior.
- Segmentar dia/mes/ano e opt-in:2filtros PWA anteriores e2novos do relatorio.
  Nao ativar globalmente sem testar rascunho/obrigatoriedade/submit/API/import.
- A saida do usuario retornou0226-05-22 no movimento2602; usuario informou2026
  pretendido. Causa ainda nao determinada; nao atribuir a digito errado nem
  reescrever dados apenas pela aparencia da tela.

## Validacoes locais

- validarPermutasOperacionais: servicos reais com fronteiras em memoria;
  integral pagar/receber, sem conta, negacao sem permissao, outra forma exige
  conta, duas partes, juros/desconto, parcial, replay, estorno integral/parcial/
  repetido, rollback em falha da segunda parte ou auditoria. Granulares
  independentes, sessao administrativa e chave maxima/multiplos grupos.
- validarPermutasRelatorio: SQL real em SQLite memoria; PERMUTA/BENS legado,
  data0226, ativos/estornos separados, PIX nao contado como permuta, datas,
  pagina, escopo completo compartilhado e ACL antes da primeira query.
- validarCartaoOpcionalSolicitacao, validarFilaInstrumentos,
  validarFilaPrevisaoCartao e validarAnaliseProprietario aprovados, sem DB real.
- validarPermutasUI: componentes/relatorio reais, APIs/sessao isoladas, payload
  integral/misto, ACL independente/negada, filtros/limpeza e390/768/1366 sem
  overflow de pagina. Captura mobile inspecionada: filtros compactos, tabela
  com rolagem horizontal e totais realizados/estornados, nao saldo.
- validarFilaInstrumentosUI completo e navegacao/abas aprovados. Fixture de
  sessao atualizada para componentes filhos que agora consultam permissao.
- validarTrocaUsuarioProducao aprovado em HTTP local isolado, sem acessar
  producao. Build final aprovado; avisos existentes de Browserslist/chunk grande
  e aviso de catalogo de relatorios preservados, sem instalar dependencias.
- validarMapaCamposDatas: AST sem erros, arquivo/linha, nao confundir icones
  com controles, configuracoes/dinamicos/modelos e reproducibilidade.
- Nao substitui homologacao MySQL/EXPLAIN, empresas/obras reais ou perfis no DEV.

## Proximo passo exato

Implementacao, QA/build e revisao de diff concluidos. Manter pacote LOCAL ate
usuario pedir commit/push. Nenhum teste real MySQL/Redis foi executado.
Publicar somente refactor/frontend quando autorizado. Sem migration nova;
exigir schema anterior completo no deploy. Usuario executa EC2; nunca acessa-la
pelo agente. Homologar no DEV com operador, gestor apenas-relatorio e usuario
sem acesso, cadastro da forma, empresa propria/compartilhado, integral/mista,
estornos/replay, legado e relatorio. Nao testar pagamentos ficticios em producao.

Operacao a orientar no chat: conceder granulares junto aos acessos atuais;
cadastrar nome/codigo/tipo PERMUTA uma vez; integral selecionar PERMUTA, empresa
e valor; mista na fila selecionar PIX/conta, TOTAL e Parte em permuta; nos
titulos usar Multiplas fontes para os dois componentes. Relatorio requer so
sua granular, sem liberar baixa. Nao prometer controle de limite nesta etapa.

## Publicacao autorizada posteriormente

Usuario solicitou commit/push deste pacote na refactor/frontend e roteiro DEV
com MySQL somente leitura. Esta autorizacao substitui a espera de publicacao
acima, sem ampliar para main/producao ou acesso EC2 pelo agente. Roteiro,
guardas, QA da publicacao e homologacao em
[Publicacao DEV permutas](2026-10-18-publicacao-dev-permutas.md).
