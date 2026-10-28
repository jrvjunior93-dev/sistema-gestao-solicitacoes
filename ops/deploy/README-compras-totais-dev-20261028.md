# DEV: totais de cotacao e Compra Direta - 28/10/2026

Publicacao por etapas em refactor/frontend. Agente nao acessa EC2; usuario
executa o pacote manualmente. Main2d6af625 e processos PROD preservados.

## Conteudo

- Backend:2 runtime, SolicitacaoCompraController.js (argumento do total do
  comparativo) e comprasCotacao.js (valor das mercadorias da oferta).
  Quantidade disponivel x preco; fallback legado de quantidade preservado.
  Base de rateio de pedidos, consultas, limites/ACL e PDFs nao mudam.
- Frontend preparado em commit LOCAL posterior: total da Compra Direta no
  bloco Itens, sem campo readOnly na forma unica; rateio entre varias formas
  preservado. Resposta interna/publica usa disponibilidade x preco, com
  tributos/frete/desconto anteriores. Nao publicar antes do backend PRONTO.
- Aplicador preserva heap4096 PROD, limite atual DEV, Experience, ambientes,
  Nodes, daemon, systemd e dumps. Confere automatico NSDOCS OFF.
  Sem SQL real, migration, install, operacao financeira ou chamada fiscal.

## Operador

1. Conferir backup DEV. No CMD entrar no worktree compras-paginacao-local-20261027/Fluxy.
2. Definir EC2_FLUXY=ubuntu@3.142.33.181, EC2_CHAVE com caminho local da chave
   e COMMIT_DEV com SHA completo do backend entregue no chat.
3. Conferir SHA256 de ops/deploy/atualizar-dev-compras-totais-20261028.cjs.
4. Enviar arquivo por stdin ao Node DEV24.22.1 no checkout
   /home/ubuntu/sistema-gestao-solicitacoes-dev com --backend COMMIT_DEV e
   CONFIRM_DEV_BACKUP=SIM CONFIRM_COMPRAS_TOTAIS_DEV=SIM.
5. Encadear --conferir COMMIT_DEV pelo aplicador instalado e enviar saida.

Esperado COMPRAS_TOTAIS_BACKEND_DEV_PRONTO, runtime_files2,
producao_heap_4096_preservado/heap_dev_preservado true, sql0/migrations0,
financial_data_writes0, operacoes_executadas0 e frontend_liberado false.
Executa6 QAs backend com rede bloqueada e8 testes do aplicador, depois um
restart somente backend-dev. Os dois JSONs representam aplicar/conferir.
Sem PM2 save/update/resurrect/update-env ou mudanca do HEAD/index EC2.

Agente publica frontend apos essa conferencia; entao recarregar DEV e
homologar total da Compra Direta, descontos/fretes/rateio e resposta da
cotacao com quantidade disponivel diferente da solicitada. Testar sem
criar pedidos/titulos ou sobrescrever respostas reais como ensaio.
Se interromper, enviar somente codigo sanitizado; preservar estado/locks
e nao repetir restart manualmente. Estado/backups de codigo em
/home/ubuntu/.config/fluxy-compras-totais-dev-20261028. Nunca enviar env/chave/dumps.
