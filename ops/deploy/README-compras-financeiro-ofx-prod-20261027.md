# Promocao Compras/Financeiro/OFX para producao - 27/10/2026

Somente o operador executa SSH. Agente nao acessa EC2. Backend antes frontend.
Base main46ac88de; origem funcional DEV6701ee7b, com OFX DEV conferido pelo
operador e sem SQL/migrations/escritas financeiras. Promocao seletiva; nao
incorpora rotas, telas, captura ou configuracao NSDOCS exclusivas do DEV.

## Escopo promovido

1. Compras: pagina de50 SCs no SQL; filtros, totais e escopo no servidor;
   detalhes/colecoes somente ao abrir a SC, preservando delegacao legada.
2. Cartoes: passagens repetidas do mesmo cartao, com valor/data/parcelas por
   componente e chaves idempotentes; cheques continuam sem repeticao.
3. Fila: abrir filtro Forma de pagamento lista formas disponiveis na fila
   autorizada, inclusive fora da pagina; busca digitada preservada.
4. Contas a Pagar/Receber: filtro pelo codigo da solicitacao, incluindo
   titulos diretos/compartilhados/negociados, sem ampliar permissoes.
5. Retorno para a carteira correta, pagina/filtros e escolhas de visibilidade;
   preferencias atrasadas nao desfazem a ultima escolha do usuario.
6. OFX manual: Todos/Credito/Debito antes totais/contagem/paginacao; lote segue
   natureza aplicada. Backend anuncia suporte para compatibilidade de versoes.

Instalacao nao executa INSERT/UPDATE/DELETE, DDL, migration, seed, integracoes,
importacao OFX, conciliacao, captura fiscal, cancelamento de SC ou operacao
financeira. SELECT/LIMIT/OFFSET sao usados quando a interface e consultada.
Preferencias e baixas continuam com gravacoes normais somente pela operacao
habitual autorizada no sistema; instalar codigo nao executa essas operacoes.

## Precondicoes e preservacao

- Backup recente conferido, timer ativo e breve janela de manutencao para
  um restart exclusivo backend-solicitacoes. Usuarios devem salvar formularios.
- Producao online com --max-old-space-size=4096 em PM2 e processo. O titulo PM2
  pode ocultar argv: conferir metadado node_args4096 e titulo exato, sem inspector.
- DEV/Experience/daemon, Nodes, envs e dumps PM2 preservados por hashes/snapshot.
  Nao usar save/update/resurrect/update-env nem alterar limite Node.
- Automatico NSDOCS permanece OFF, plano/fonte/historico preservados. Se houver
  carga/captura ativa ou locks existentes, o aplicador bloqueia sem interromper.
- HEAD main46ac88de e checkout limpo. Atualizacao faz apenas fast-forward para
  commit fechado por manifesto, com nove arquivos runtime e QAs/docs associados.
  Conteudo fora do inventario ou arquivos excluidos sao recusados.
- Nao executar git pull/reset/clean, install, migrations gerais ou SQL manual.
  QA usa mocks/SQLite :memory: sob semRedeQa; nao conecta ao banco do sistema.

## Comandos Windows CMD

Defina COMMIT_PROMOCAO com o SHA completo publicado informado na entrega.
Confira tambem o SHA256 entregue do aplicador antes de enviar para EC2.

```cmd
cd /d "C:\Users\Ricardo\.codex\worktrees\compras-paginacao-local-20261027\Fluxy"
set "EC2_FLUXY=ubuntu@3.142.33.181"
set "EC2_CHAVE=C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem"
certutil -hashfile "ops\deploy\atualizar-prod-compras-financeiro-ofx-20261027.cjs" SHA256
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "%EC2_CHAVE%" "%EC2_FLUXY%" "cd /home/ubuntu/sistema-gestao-solicitacoes-main && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - preparar %COMMIT_PROMOCAO%" < "ops\deploy\atualizar-prod-compras-financeiro-ofx-20261027.cjs"
```

Esperado COMPRAS_FINANCEIRO_OFX_PROD_PREPARADO. Backups privados apenas de codigo.
Depois de conferir backup/timer/janela, aplicar e conferir:

```cmd
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "%EC2_CHAVE%" "%EC2_FLUXY%" "cd /home/ubuntu/sistema-gestao-solicitacoes-main && CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_PROD_MAINTENANCE=SIM CONFIRM_COMPRAS_FINANCEIRO_OFX_PROD=SIM /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - aplicar && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node ops/deploy/atualizar-prod-compras-financeiro-ofx-20261027.cjs conferir" < "ops\deploy\atualizar-prod-compras-financeiro-ofx-20261027.cjs"
```

Esperado COMPRAS_FINANCEIRO_OFX_BACKEND_PROD_PRONTO, runtime_files9,
old_space_mib4096, migrations0, direct_database_writes0 e frontend_alteradofalse.
Dois JSONs representam aplicar/conferir; nao dois reinicios. Envie essa saida
para publicar o frontend completo ja preparado. Nao e necessario recompilar
frontend na EC2. Vercel publica a revisao frontend posterior na main.

## Falhas e recuperacao

Se parar, enviar somente o codigo sanitizado. Nao remover estado/locks,
reiniciar manualmente, repetir aumento de heap ou restaurar banco/dump PM2.
Estado/backups de codigo ficam em .git/fluxy-compras-financeiro-ofx-prod-20261027.
Retomada revalida se o unico restart ocorreu antes de emitir outro. QA bloqueia
antes de reiniciar. Reversao de codigo exige procedimento especifico revisado.
