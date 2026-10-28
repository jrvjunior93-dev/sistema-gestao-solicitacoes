# DEV: criacao adicional de titulos de Compras

Publicacao somente na refactor/frontend, sobre a35a2139. O usuario autorizou
novas criacoes pela solicitacao e pelo pedido mesmo quando ja houver titulos
suficientes, preservando registros anteriores. Frontend manteve os ajustes de
favorecido/PIX existentes no DEV. Nenhum commit/push na main nesta publicacao.

## Operacao manual

Somente o usuario acessa EC2. No CMD do Windows definir EC2_FLUXY,
EC2_CHAVE e COMMIT_TITULOS_DEV com o SHA completo publicado no chat.
Conferir SHA256 de atualizar-dev-titulos-adicionais-20261028.cjs.
Enviar o arquivo por stdin ao Node DEV24.22.1 em
/home/ubuntu/sistema-gestao-solicitacoes-dev com --backend COMMIT_TITULOS_DEV,
CONFIRM_DEV_BACKUP=SIM e CONFIRM_TITULOS_ADICIONAIS_DEV=SIM.
Encadear o aplicador instalado com --conferir COMMIT_TITULOS_DEV.

Esperado TITULOS_ADICIONAIS_BACKEND_DEV_PRONTO, runtime_files3, sql0,
migrations0, financial_data_writes0, business_data_writes0, titulos_criados0,
producao_heap_4096_preservado:true e frontend_compativel:true.
O aplicador faz somente um restart de backend-dev. Uma interrupcao na fase de
restart permite observar a conclusao, sem emitir outro restart incerto.

Frontend usa o mesmo contrato de API e header de idempotencia ja aceito pelo
servidor. Pode seguir a publicacao normal do DEV na Vercel junto ao commit;
enquanto o backend nao for atualizado, o recurso novo continua sujeito ao bloqueio
antigo. Depois do PRONTO e da Vercel concluida, atualizar a pagina DEV.

## Preservacao

Tres runtimes: pedidoCompraFinanceiroService.js, tituloFinanceiroService.js e
compraTitulosAdicionaisService.js. Sem alterar pedidoCompraService.js,
controllers, rotas, modelos, schemas ou dependencias. Mantidos ACL, fechamento,
valores/parcelamento e pagamentos especializados. Repetir a chave devolve a mesma
operacao; chave nova permite uma nova obrigacao intencional. Nao confundir essa
possibilidade com um processo de cancelar ou substituir titulos existentes.

Sem SQL real, migrations, install, baixa, titulo, upload/S3 ou NSDOCS pelo
instalador. QA usa modelos simulados e SQLite :memory:, com conexoes externas
bloqueadas. O teste de precisao no servidor usa --backend-only, sem exigir
arquivos frontend novos no checkout EC2. Nenhum XML/plano fiscal e modificado.

Backup privado de codigo em /home/ubuntu/.config/fluxy-titulos-adicionais-dev-20261028.
HEAD/index do DEV preservados; fontes conhecidas por hash da base revisada ou da
release alvo. HEAD antigo pode existir pelos overlays anteriores, mas nao autoriza
copiar uma fonte antiga desconhecida. Divergencia interrompe para revisao.
PM2 ja existente com Node isolado; snapshot confere os tres processos, PROD4096,
limite DEV, env, dumps e systemd. Sem PM2 save/update/resurrect/update-env global.
Nao executar git pull/reset/checkout amplo nem remover locks/estados anteriores.

Homologar usando dados ficticios no DEV. Nenhuma criacao financeira real faz
parte da atualizacao de codigo ou desta entrega do agente.
