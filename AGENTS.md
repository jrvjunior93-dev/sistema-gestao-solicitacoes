# AGENTS.md

## Objetivo
Guia rapido para colaboradores e agentes automatizados.

## Regras
- Autorizacao funcional do proprietario registrada em 2026-08-25: agentes podem analisar e atuar em qualquer area funcional deste sistema, sem divisao fixa por modulo. Essa autorizacao amplia o alcance possivel, mas nao autoriza automaticamente mutacoes fora da tarefa atual. Cada implementacao, teste com escrita, migration, reinicio, integracao externa, deploy ou operacao destrutiva continua limitado ao pedido e as autorizacoes explicitas do usuario para a tarefa em curso.
- O sistema esta funcionando e pronto para deploy dentro dos objetivos pretendidos. Tudo o que for criado precisa levar em conta todo o contexto criado ate o momento para nao quebrar o sistema.
- Nao alterar arquivos fora deste repositorio, exceto em sessoes explicitamente abertas para colaboracao multirrepositorio no workspace e seguindo obrigatoriamente `docs/COLABORACAO_WORKSPACE.md` e o `AGENTS.md` do repositorio alvo.
- Evitar mudancas destrutivas.
- Sempre explicar as alteracoes.
- Mudancas de frontend devem priorizar estabilidade operacional: antes de alterar telas, botoes, menus, filtros, tabelas ou fluxos, mapear quais acoes, permissoes, endpoints e regras de negocio dependem daquele trecho.
- O padrao visual do Fluxy deve ser de sistema corporativo operacional: compacto, escaneavel, utilitario e consistente. Evitar excesso de cards, botoes grandes sem necessidade, decoracao visual sem funcao e alteracoes esteticas que reduzam densidade util ou clareza.
- Nao aplicar automaticamente padroes visuais genericos de landing page, hero, grids de cards ou botoes primarios em excesso nas telas internas do sistema.
- Em ajustes de UI, preservar a logica existente dos botoes e fluxos. Se uma mudanca visual puder afetar clique, navegacao, permissao, envio de formulario, status, anexos, financeiro, compras ou solicitacoes, validar o comportamento antes de considerar concluido.
- Preferir evoluir o frontend com componentes e padroes reutilizaveis, como filtros, tabelas, botoes de acao, toolbars e shells de pagina, em vez de correcoes isoladas que aumentem risco de efeito cascata.
- Operacoes criticas devem considerar idempotencia e protecao contra multiplos cliques/envios simultaneos. Criacao de registros, envio de solicitacoes, aprovacoes, mudancas de status, anexos, geracao/baixa/exclusao de titulos, compras, cotacoes e integracoes externas nao podem gerar registros duplicados em sequencia sem validacao. Sempre que aplicavel, usar bloqueio de botao no frontend, chave de idempotencia, validacao no backend e transacao/bloqueio no banco.

## Fluxo
1. Ler este arquivo antes de qualquer mudanca.
2. Pedir confirmacao antes de alteracoes grandes.
3. Ler `docs/COLABORACAO_CODEX.md` antes de iniciar trabalho compartilhado entre dois agentes.
4. Em sessoes com mais de um repositorio no mesmo workspace, ler `docs/COLABORACAO_WORKSPACE.md` e registrar ownership em `docs/workspace/OWNERSHIP_ATIVO.md`.
5. Antes de pausar um fluxo sensivel ainda nao commitado, criar ou atualizar o handoff correspondente em `docs/handoffs/`, informando arquivos alterados, validacoes executadas, riscos e proximo passo exato.

## Estado Atual (resumo das mudancas feitas)

### Infra / Deploy
- Os ambientes usam processos PM2 distintos na EC2:
  - desenvolvimento (`dev-v2`): `backend-dev`;
  - producao (`main`): `backend-solicitacoes`.
- Nunca reiniciar `backend-solicitacoes` durante uma atualizacao exclusiva de dev; nunca reiniciar `backend-dev` durante um deploy exclusivo de producao.
- O backend de producao usa Nginx proxy em `api.jrfluxy.com.br` para `127.0.0.1:8000`.
- Frontend hospedado na Vercel (root `frontend/`).
- Dominios configurados: `jrfluxy.com.br`, `www.jrfluxy.com.br`, `csc.jrfluxy.com.br` (apontando para Vercel).
- CORS do backend ajustado para aceitar dominios Vercel (preview) e dominios customizados.
- S3 usado para anexos/comprovantes com URLs assinadas e CORS liberado (atual: `AllowedOrigins: ["*"]`).
- O repositorio nao possui mais `python-service`; o runtime ativo e apenas Node/React (`backend/` + `frontend/`).

### Uploads / S3
- Uploads migram para S3 via `uploadToS3`.
- Backend gera URL assinada para download/preview (`/anexos/presign`).
- Ajuste no `fileUrl` do frontend para usar origem da API em paths relativos `/uploads/...`.
- Correcoes de encoding no presign (decode do key antes de assinar).

### CORS
- Backend (`backend/src/app.js`) usa allowlist com:
  - `https://sistema-gestao-solicitacoes.vercel.app`
  - `https://api.jrfluxy.com.br`
  - `https://jrfluxy.com.br`
  - `https://www.jrfluxy.com.br`
  - `https://csc.jrfluxy.com.br`
  - previews Vercel nao usam wildcard; quando necessarios, devem ser cadastrados por origem exata

### Frontend (UX/UI)
- Menu lateral inicia oculto e abre por hover na borda esquerda; fecha ao sair do mouse.
- Menu com rolagem (`overflow-y-auto`) e dimensoes reduzidas para caber em notebook.
- Tabela de solicitacoes com coluna "Data" e melhorias visuais.
- Login com logo CSC (em `frontend/public/CSC_logo_colorida.png`) e tamanho aumentado.
- Rewrites SPA via `frontend/vercel.json`.

### Permissoes / Regras de Negocio
- Numero do pedido: somente setor GEO pode editar.
  - Backend valida setor GEO no endpoint `PATCH /solicitacoes/:id/pedido`.
  - Frontend exibe componente Pedido apenas para GEO.
- Status por setor: na tela de detalhe, usuarios veem lista de status do proprio setor.
  - `SUPERADMIN` permanece como excecao administrativa.
  - Backend e frontend estao alinhados para usar o setor do usuario nas trocas de status.
- Assumir e enviar solicitacoes:
  - Usuarios so podem assumir solicitacoes que estejam atualmente no proprio setor.
  - Usuarios so podem enviar para outro setor solicitacoes que estejam atualmente no proprio setor.
  - `SUPERADMIN` permanece como excecao administrativa.
  - Setor `OBRA` continua sem poder enviar para outros setores e o frontend apenas oculta o botao, sem mensagem explicativa.
- Configuracao de areas visiveis para OBRA:
  - Nova config salva em `configuracoes_sistema` (chave `AREAS_OBRA_VISIVEIS`).
  - Nova pagina `AreasObra` em Configuracoes para SUPERADMIN.
  - NovaSolicitacao filtra `Area Responsavel` para setor OBRA.

### Correcoes importantes (hist?rico)
- Corrigido case-sensitivity no Linux: `CargoController.js`.
- Corrigido regex no `s3.js` (parse key).
- Corrigido `src` da logo no login.

### Modulo de Cotacoes (RFQ)
- Modulo completo e funcional integrado ao modulo de compras.
- Fluxo: SolicitacaoCompra -> enviar para fornecedores -> link publico por token -> fornecedor responde online ou via CSV -> comparativo automatico -> selecao de vencedor -> encerramento.
- Pagina publica `/cotacao/:token` sem autenticacao (fornecedor acessa pelo link).
- Botao WhatsApp: gera link `wa.me` com mensagem padrao + link de cotacao.
- Prazo de resposta por fornecedor (campo `prazo_resposta` em `solicitacao_compra_fornecedores`).
- Configuracoes de cotacao via SUPERADMIN em `/configuracoes-cotacao`:
  - `min_cotacoes`, `criterio_vencedor`, `prazo_resposta_padrao_dias`, `permitir_aprovar_sem_minimo`, `exigir_justificativa_se_nao_menor_preco`.
  - Chaves armazenadas em `configuracoes_sistema` com prefixo `COTACOES_`.
- Endpoints publicos (sem auth): `GET/POST /cotacoes/:token`, `POST /cotacoes/upload`, `GET /cotacoes/:token/modelo`.
- Endpoints protegidos: `GET/PATCH /configuracoes/cotacoes` (SUPERADMIN).
- Migrations aplicadas em: `202603310001_cotacao_prazo_resposta.js`, `202603310002_cotacoes_config_seed.js`.

### Obras / Financeiro / Permissoes (2026-04-12)
- classificacao de obras (PRIVADA/PUBLICA) com campos `vgv`, `planilha_geral`, `margem_custo_esperada`
  - migration `202604120002_obras_classificacao_orcamento.js` ja aplicada em producao
  - orcamento calculado: valor_referencia * (1 - margem / 100)
- pagina `Resultado de Obras` em `/financeiro/relatorios/resultado-obras`
  - agrega titulos financeiros por obra: executado (PAGAR baixado) e recebido (RECEBER baixado)
- sistema de permissoes de areas por usuario:
  - registro central em `backend/src/constants/moduloPermissoes.js`
  - 19 grupos, 100 areas e 349 permissoes no formato `modulo.area.acao` (as areas sao derivadas do registro central)
  - armazenado em `ConfiguracaoSistema` chave `PERMISSOES_AREAS_USUARIOS`
  - sessao do usuario: campo `areas_permissoes`
  - helper: `hasPermissao(user, 'chave')` em `frontend/src/utils/acessoProduto.js`
  - UI: Configuracoes > Permissoes de Areas por Usuario (`/permissoes-areas`)
  - o grupo SST ainda contem permissoes de funcionalidades legadas; nao ampliar esse conjunto antes da simplificacao descrita em `docs/sst/PLANO_SIMPLIFICACAO_SEGURA.md`

## Checklist de Deploy
- Backend dev (`dev-v2`): `git pull` -> `npm install` (backend) -> migrations/testes aplicaveis -> `pm2 restart backend-dev --update-env`.
- Backend producao (`main`): `git pull` -> `npm install` (backend) -> migrations/testes aplicaveis -> `pm2 restart backend-solicitacoes --update-env`.
- Frontend: `git push` -> Redeploy na Vercel (cache limpo).

## Observacoes
- Se o backend nao responde em `127.0.0.1:8000`, Nginx retorna 502.
- Se anexos antigos ainda estiverem em `/uploads`, o frontend usa a origem da API para baixar.

## Colaboracao entre agentes
- Quando houver dois agentes trabalhando no repositorio, seguir obrigatoriamente `docs/COLABORACAO_CODEX.md`.
- Nenhum agente deve editar o mesmo arquivo que esteja explicitamente reservado por outro agente.
- Antes de iniciar qualquer tarefa, registrar ownership temporario dos arquivos que serao alterados.

## Colaboracao multirrepositorio
- Este repositorio pode participar de sessoes compartilhadas com outros repositorios do mesmo workspace, desde que a sessao seja aberta explicitamente para esse fim.
- A colaboracao multirrepositorio deve seguir `docs/COLABORACAO_WORKSPACE.md`.
- Antes de editar outro repositorio, o agente deve ler o `AGENTS.md` e as regras locais do repositorio alvo.
- O contexto compartilhado deve ser registrado em `docs/workspace/`.
