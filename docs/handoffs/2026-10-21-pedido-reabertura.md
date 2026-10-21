# Reabertura de pedido e fechar novamente com fornecedor

## Autorizacao e limites

- Implementar/testar sobre refactor/frontend2d161b85, branch isolada
  codex/pedido-reabertura-20261021. Usuario acrescentou logs seguros de falha.
- Agente unico. Sem producao/main, EC2, banco/S3/Redis reais, restart, alteracao
  de memoria, dependencias/migrations, commit/push/deploy nesta etapa.
- Logs anteriores comprovam OOM Node, mas nao o gatilho PC-00271. O codigo
  tinha risco concreto de produto cartesiano e rollback apos commit; corrigidos
  localmente, sem afirmar que todos os OOM do sistema foram eliminados.

## Arquivos e mudancas

- pedidoCompraService: separar hasMany dos dois loaders, inclusive aninhadas;
  leitura enxuta para sincronizar status por saldo, sem ofertas/logs/PDFs/itens
  dos demais pedidos. Mesmo DTO, filtros, quantidades, escopo e transacoes.
- atualizarStatusPedido recebe o mesmo lock UPDATE usado na reabertura para
  serializar fechamento/replay e manter um so historico por mudanca efetiva.
- PedidoCompraController: guardas atuais intactas; recibo202 quando commit
  confirmou mas detalhe falhou;503 quando commit nao confirmou. Sem rollback
  de transacao concluida. Etapas de diagnostico com finally para registrar fim.
- observability/pedidoCompraOperacao: logs pequenos de inicio/marcos/falhas/fim,
  operacao_id/PID/pedido/duracao/memoria/causa classificada. Nao imprime corpo,
  mensagem/stack SQL, senha, documentos, nomes ou justificativa. Logger protegido.
- PedidoCompraDetalhe: acao secundaria Fechar com o fornecedor no status
  editavel, com permissao alterar_status, mesmo PATCH/validacoes. Trava sincrona
  compartilhada com reabertura; rascunhos impedem fechar e sao preservados.
- Recibo ou resposta perdida: bloquear a tela antiga para escrita e consultar
  estado por GET explicito; erro na consulta continua permitindo so consultar.
  Respostas da rota anterior ignoradas. Caminho GEO e motivo continuam iguais.
- Novos validarPedidoReabertura.js/mjs e dois comandos npm. Nenhum lockfile.
- Mock de validarPrevisaoEntregaCotacao recebe apenas configuracao de prazos
  inativa. Falha de dependencia ausente foi reproduzida tambem no source HEAD
  anterior; todas as assertivas funcionais foram preservadas e agora passam.
- Canonico Compras e quatro controles atualizados. Outputs privados excluidos.

## Validacao

- Backend real em VM/modelos/transacao em memoria: reabrir/fechar, motivo,
  cancelado, financeira historica pelas tres origens, GEO aprovado/invalido,
  entrega, sincronizacao por saldo, rollback do historico na reabertura e no
  fechamento, replay sem duplicacao e sem mudar valor total ou criar titulos.
- Controller real: sucesso, escrita falha, permissao/escopo negados, commit
  incerto503 e leitura pos-commit202 sem rollback. Logging com segredo/SQL
  simulados nao vaza; logger que lanca erro nao impede a operacao.
- SQL MySQL gerado offline com Sequelize instalado/associacoes do registro:
  todas as hasMany nos planos novos usam separate; consultas principais nao
  juntam colecoes; lock FOR UPDATE suportado. Sem medir pico de RAM em EC2.
- UI real/API interceptada:26 itens,1366/390 sem overflow, reabertura/motivo/
  cancelar, novo fechamento, duplo clique, entrega400/retry,202, leitura falha,
  rede perdida sem repetir PATCH, rascunho/comentario preservados, troca de rota,
  acesso somente leitura, pedido cancelado e reabertura enviada ao GEO.
- Regressoes backend aprovadas: CompraCotacaoEnvio, ComprasPerformanceFases,
  CompraRemanejamento, PrevisaoEntregaCotacao, AcessoPedidosEscopo,
  PedidoCompraFinanceiroGeo, PedidoEntregas/PedidoEntregasAcesso,
  CompraOfertaSaldoMesmoFornecedor, ComprasDelegacao, EncerramentoSemPedidoHistorico.
- Regressoes UI aprovadas: ContinuidadeComentariosCompra e PedidoEntregaUI.
- Build final631 modulos/12,68s aprovado; somente avisos preexistentes Browserslist e
  chunk grande. Sintaxe Node, diff e documentacao conferidos ao finalizar.
- Limite conhecido: validarAcessoPedidos.mjs falha na linha41, esperando quatro
  portas RH enquanto catalogo da base ja oferece tambem solicitacoes globais.
  git diff HEAD desses arquivos/navegacao/acessoProduto vazio. Nao alterar RH
  fora do escopo; ACL de pedidos testada separadamente. Nao afirmar suite total.
- Documentacao596/19, sintaxe Node e diff --check aprovados. Skill frontend-design
  aplicada na acao secundaria compacta/rotulo/estados, sem redesign ou sucesso
  otimista de operacao critica. Entrega local concluida, ownership liberado.

## Proximo passo

- Publicar exclusivamente DEV somente se solicitado. Nunca incluir outputs.
- Operador homologa PC-00271 ou copia equivalente em DEV: reabrir com motivo,
  salvar ajuste, fechar pelo botao, verificar status/entrega/historico, fretes/
  saldos/financeiro intactos; repetir clique/erro/releitura e negativas de ACL.
- Com historico financeiro manter fluxo de aprovacao GEO; nao apagar vinculos.
- Para diagnostico DEV apos publicacao: `pm2 logs backend-dev --lines 200 --nostream`
  e localizar `[PEDIDO_OPERACAO]`, pedido_id, operacao_id, causa e etapa.
- Nao acessar logs brutos contendo dados pessoais no commit. Logs fatais sem
  FIM exigem correlacionar PID/data com PM2/Node. Resize/memoria fica separado.

## Publicacao DEV autorizada posteriormente

- Usuario autorizou commit/push refactor/frontend e comandos EC2 DEV, sem producao.
- Remotos conferidos: DEV2d161b85/main80df6534. Sem divergencia na base DEV.
- Novo roteiro ops/deploy/atualizar-dev-pedido-reabertura-20261021.sh e guarda
  backend/scripts/validarDeployPedidoReaberturaDev.js. SHA completo, ancestralidade/
  ff-only, caminho/branch limpos, lock de deploy, PM2DEV online/8001/sem watch,
  migracoes automaticas desligadas, identidade/schema readonly, .env preservado,
  runtime restrito aos tres arquivos backend e pagina. Nao altera memoria.
- Aceita DEV instalado desde828ed2ec, incluindo DP/centros ja publicados se
  ainda nao aplicados. Pacotes permitem apenas os tres comandos QA novos desde
  essa base. Sem dependencias/migrations/lockfiles alterados ou npm install.
- Testes isolados de pedidos/entregas/historico e regressao RH/centros antes do
  restart exclusivo backend-dev, seguido de health8001 e verificacao readonly.
- QA backend/regressoes e UI26 itens1366/390 repetidos nesta publicacao;
  build12,68s da entrega permanece valido, sem novo delta funcional.
- Guardas Node/Bash/pacotes (incluindo negativas de dependencia/script antigo/
  postinstall), docs596/19 e diff aprovados. Ownership liberado para publicar.
- Publicar HEAD:refs/heads/refactor/frontend sem force, conferir SHA remoto,
  fornecer comandos pinned ao operador. Nenhuma execucao real na EC2 pelo agente.
