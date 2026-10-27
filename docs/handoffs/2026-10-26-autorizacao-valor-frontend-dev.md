# Frontend DEV aguardando backend

Usuario autorizou commit e push do pacote em refactor/frontend. Backend em `fc369151f81b7fc7801207a10ae43cfec84ce79a`. Frontend em commit separado, pronto localmente; publicar somente depois da saida `AUTORIZACAO_VALOR_BACKEND_DEV_PRONTO` do aplicador de 26/10/2026 e sua conferencia.

Contem editor de montante na selecao por obra, detalhe e lote; total/valor/restante na conferencia assinada; valor autorizado/observacao e teto na fila; filtro por codigo/descricao da solicitacao no painel. Preserva ACL, biometria, selecao/paginacao, rascunhos, baixas parciais e instrumentos existentes.

QA funcional completo registrado no worktree original `outputs/worktree-autorizacao-valor-parcial/outputs`: backend, browser individual/coletivo/130 selecionados, cancelamento/replay, PWA Android/iOS/desktop, fila com limite e build. Os arquivos funcionais tocados possuem base identica em f05705e3 e 920f639c. Build foi repetido nesta branch DEV; doctor/aplicador testados offline (11 casos), QA dos 15 scripts do aplicador aprovado sem rede.

Depois da conferencia do usuario: validar remoto refactor/frontend ainda aponta para o commit de backend, publicar o commit local deste frontend por fast-forward (sem force), conferir deploy Vercel e orientar homologacao com fixtures DEV. Nao executar migration/reinicio adicional nem tocar main/producao/carga NSDOCS por inferencia.

Roteiro backend/schema/teste em `ops/deploy/README-autorizacao-valor-dev-20261026.md`. Biometria real e MySQL/concorrencia real continuam pendentes da homologacao autorizada.
