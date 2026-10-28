# DEV: reabertura sem titulo e favorecido explicito - 28/10/2026

Somente o operador executa SSH. O agente nao acessa EC2. Publicacao exclusiva
refactor/frontend, preservando main e recursos fiscais exclusivos DEV.

## Escopo e preservacao

- Backend: um arquivo, pedidoCompraService.js. Consulta titulos existentes pela
  mesma leitura do resumo; vinculos de titulos excluidos nao bloqueiam sozinhos.
  Titulos existentes continuam exigindo GEO. ACL/motivo/locks/historico mantidos.
- Frontend: Card e Novo Titulo abrem PIX ativo e vazio; dados do credor apenas
  por escolha explicita; dados da propria solicitacao/medicao preservados.
  Publicacao pela Vercel, sem schema ou reinicio por essa alteracao de tela.
- Instalador nao executa reabertura, cadastro de favorecido, baixa, conciliacao,
  captura fiscal ou operacao financeira. Sem SQL real/migration/install.
  QA usa mocks e SQLite :memory: sob semRedeQa, sem banco/S3/NSDOCS.
- Confere PROD4096 em configuracao e metadado do processo e preserva o limite.
  Mantem limite atual DEV, processos pares, Nodes, ambientes, daemon, unit
  systemd e dumps. Um restart so backend-dev, sem update-env/save/resurrect.
- Backup privado de codigo e copia seletiva por hash; HEAD/index da EC2
  preservados. Nao usar pull/reset/checkout/install ou migrations gerais.
  Automatico NSDOCS permanece OFF; nenhum recurso fiscal DEV substituido.

## Executar pelo operador

1. Conferir backup DEV. No Windows CMD, entrar neste worktree e definir
   EC2_FLUXY/EC2_CHAVE/COMMIT_DEV com os valores completos entregues no chat.
2. Conferir SHA256 de ops/deploy/atualizar-dev-reabertura-favorecido-20261028.cjs.
3. Enviar esse arquivo por stdin ao Node DEV24.22.1, no checkout
   /home/ubuntu/sistema-gestao-solicitacoes-dev, com --backend COMMIT_DEV,
   CONFIRM_DEV_BACKUP=SIM e CONFIRM_REABERTURA_FAVORECIDO_DEV=SIM.
4. Encadear --conferir COMMIT_DEV pelo aplicador ja instalado. Os comandos SSH
   completos e o SHA/hash estao na entrega desta publicacao.

Esperado REABERTURA_FAVORECIDO_BACKEND_DEV_PRONTO, runtime_files1,
producao_heap_4096_preservado/heap_dev_preservado true, sql0/migrations0,
financial_data_writes0/reaberturas_executadas0/favorecidos_alterados0.
Dois JSONs sao aplicar/conferir, nao dois reinicios.
Enviar somente saida sanitizada; nunca env/chave/credenciais/dumps/XML.

## Homologacao e interrupcao

Recarregar DEV apos PRONTO. Conferir bloco vazio, escolha do credor, limpeza,
troca de credor e dados de origem, sem salvar titulos/pagamentos reais como teste.
Instalador nao reabre pedidos: teste com escrita somente em pedido ficticio DEV
autorizado. Correcao de reabertura so entra na EC2 quando operador aplica.

Se interromper, enviar codigo; nao remover estado/locks nem reiniciar manualmente.
Estado/backups em .config/fluxy-reabertura-favorecido-dev-20261028.
Retomada de restarting apenas confere, sem segundo restart. QA falha antes
do restart. Reversao exige procedimento especifico; nao restaurar banco/env/dumps.
