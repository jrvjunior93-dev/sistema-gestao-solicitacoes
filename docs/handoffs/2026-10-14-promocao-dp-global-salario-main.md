# Promocao DP: consulta global, navegacao e salario

## Escopo e autorizacao

- Data do cliente: 14/10/2026, America/Sao_Paulo.
- Usuario autorizou migrar commits pendentes para main e fornecer comandos EC2;
  confirmou backup recente no Drive cifrado, timer ativo e homologacao em dev.
- Base producao: 4fd60afcd3028a66e095228919abb4ccdfd015f5.
- Refactor homologada: 208ae8e2b2503cfe3a317014eec504643656ac09.
- Branch codex/promocao-dp-global-salario-main-20261014 criada da main;
  integracao por merge preservando ambos os historicos e hotfixes de producao.
- Dois commits funcionais novos: 22120eaa e 208ae8e2. Alteracoes de modal,
  troca de usuario e transferencias ja promovidas nao foram reaplicadas.

## Resultado funcional

- Consulta global DP, rascunhos privados e destaque coerente com a lista;
  pagamentos coletivos reconhecidos pelos snapshots. OBRA permanece estrita.
- Card Solicitacoes globais no hub; Obras/Centros de Custo abre cards de locais,
  com colaboradores e solicitacoes do local. Catalogo backend regenerado.
- Moeda no pedido salarial enviada como numero. Ajuste direto exclusivo do
  SUPERADMIN com vigencia/motivo, historico, lock, idempotencia e auditoria.
- Nao recalcular titulos ou fechamentos existentes nem enviar rascunhos.
- Conflitos resolvidos somente em documentacao e catalogo gerado. Codigo
  backend/src e frontend/src coincide com a refactor homologada.
- Scripts, evidencias e hotfixes exclusivos da main preservados; nenhum arquivo
  removido. Caixa/obra nao commitado em outro worktree e outputs/ ficam fora.
- Sem nova migration, dependencia, flag ou .env. Nenhum banco real, EC2,
  seed/backfill, migration ou reinicio executado pelo agente.

## Validacoes

- Backend: consulta/salario, pagamento por solicitacao, transferencias,
  escopo OBRA, envio parcial, Ticket Boleto/Pix/Conta, estorno granular,
  troca de usuario producao, seguranca/ACL, primeira lotacao, contatos e planilha.
- Hub/navegacao: negativos de permissao, escopo OBRA, breadcrumb/atalhos,
  220 rotas e 218 destinos sem link morto, catalogos front/back consistentes.
- Build frontend aprovado; avisos existentes de Browserslist e bundle >500 kB.
- UI de Pessoal desktop/mobile aprovada: hub global/local, obra e centro,
  reload/retorno, salario, documentos, negativos e pagamento/conferencia/fechamento.
- Sintaxe, documentacao, diff/check e ausencia de delta de schema/dependencias
  conferidos. Candidato validado; ownership liberado para publicacao autorizada.

## Recuperacao e proximo passo

- Tag publicada: backup/main-pre-dp-global-salario-20261014-4fd60afc.
- Bundle completo verificado fora da EC2:
  tmp/main-code-backup-20261014-dp-global/main-4fd60afc.bundle no worktree
  C:/Users/Ricardo/.codex/worktrees/promocao-dp-main-20261014/Fluxy.
- SHA256: 93784D5C9CB4A290217E59B32205A5A5C49318AF31F9422503C4CAE96FE3E8AF.
- Publicar PR para main apos testes; conferir checks e merge sem force/squash.
- Usuario atualiza checkout de producao por fast-forward, com SHA congelado,
  arquivos versionados limpos, UUID 5ed4b970-009f-11f1-809c-0ad0e0c90c53,
  banco gestao_solicitacoes, processo backend-solicitacoes e porta 8000.
- Conferir schema somente leitura e preservar flags/configuracoes; nao aplicar
  migrations ou instalar pacotes sem diferenca prevista nesta promocao.
- Reiniciar somente backend-solicitacoes; conferir health local/publico e
  smoke autenticado de DP, SUPERADMIN e OBRA. Nunca reiniciar backend-dev.
- Merge/Vercel nao prova atualizacao EC2. Backend atualizado e health precisam
  preceder o teste dos fluxos novos; frontend pode ser publicado automaticamente.
- Rollback por revert do PR/artefato anterior e codigo compativel com 4fd60afc;
  preservar historicos/operacoes novas, sem down ou restauracao automatica de dados.
