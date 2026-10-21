# Filtro por periodo de registro - 2026-10-21

## Pedido e mapa de impacto

Usuario pediu registro inicial/final nos filtros da lista, no padrao existente
de Resposta/Pagamento. Implementacao local baseada em refactor/frontend44ee71b2,
sem autorizacao de commit/push/deploy nesta etapa. Agente unico; nao acessa EC2.

Mapa antes das alteracoes: Filtros.jsx define campos DateInputBR via BarraFiltros,
visibilidade persistida e limpeza; index.jsx valida datas, consulta GET com
debounce, pagina/acumula/exporta, restaura workspace/storage/URL e filtra live
updates; consultaSessao.js projeta campos permitidos por usuario/escopo/lista.
SolicitacaoController.index ja recebe data_inicio/fim para createdAt e valida
datas reais1900..2200/ordem, apos montar o escopo autorizado. Nenhuma acao de
criar/enviar/assumir/arquivar/editar ou permissao foi modificada.

## Alteracoes e causa comprovada

- Filtros.jsx: Data de registro de/ate, chave de preferencia data_registro
  mantida; esconder limpa data_registro/data_inicio/data_fim. Limpar filtros
  zera ambas. Mesmo estilo/componente e layout operacional, sem CSS novo.
- consultaSessao.js: normalizarPeriodoRegistro converte legado exato em dia
  unico e remove sua precedencia na API. Datas novas entram na allowlist de
  sessao e nos parametros URL explicitos que prevalecem sobre o salvo.
- index.jsx: estado normalizado em todas as entradas (workspace, storage,
  sessao, URL e mudancas de campo); valida os dois periodos independentemente;
  URLs de registro limpam pontas anteriores antes de sobrepor. GET/consulta
  silenciosa/exportacao usam os mesmos filtros; live updates comparam limites
  inclusivos. Sem datas continua periodo integral de registro.
- SolicitacaoController.js: uma linha, Object.keys(intervaloData) trocado por
  Reflect.ownKeys. Teste novo falhou antes e passou depois: operadores Sequelize
  sao Symbols e Object.keys retornava0, descartando o intervalo da consulta.
  Legado exato e respostas/pagamentos preservados. Nenhuma migration.

Skill frontend-design usada para manter o par de campos no padrao compacto
existente do Fluxy, sem redesenhar barra/tabela ou criar componentes paralelos.

## Validacoes

- validarPeriodoRegistroSolicitacoes.js extrai validador e predicado reais do
  controller, usa Op real Sequelize e confere inicio/fim/dia completo, uma ponta,
  nenhuma data, legado, datas impossiveis/invertidas e escopo previo preservado.
  UTC/BR/NZ, sem importar DB/.env/models ou abrir conexao. Nao substitui teste
  completo do endpoint com MySQL; exercita a construcao real do predicado.
- validarPeriodoRegistroSolicitacoes.mjs: migracao de filtro legado, dois
  periodos independentes, inversao/datas invalidas, sessao/allowlist/URL,
  separacao de usuario/escopo/arquivadas. Extrai filtro live update real e
  exportacao real com fetch simulado, conferindo parametros de periodo.
- validarWorkspacePiloto.mjs --solicitacoes-filtros-only integra o QA novo na
  tela real e mantem os casos de navegacao/usuario/403 ja existentes. Transporte
  interceptado local, nenhuma baixa/escrita de negocio. Capturas privadas em
  outputs/solicitacoes-periodo-registro-20261021.
- validarSolicitacaoDataVencimento.js, validarEdicaoDadosSolicitacao.js e
  validarListaPreferencias.js aprovados. Node/diff conferidos.

- UI1366/390 aprovada: periodos combinados, uma ponta, dia unico, erro de
  inversao sem GET, campos dentro da largura, sessao, URL legado, URL de uma
  ponta sem herdar a outra, esconder/limpar. Capturas inspecionadas nas duas larguras.
  Ajustes durante autoria do QA: nome do checkbox inclui aviso de preenchido;
  fechar menu Filtrar mobile antes de clicar Filtros visiveis. Sem force-click
  nem mudanca de UI fora do pedido para contornar o teste.
- Suite existente aprovada em1366/390, com workspace e legado: retorno,
  sessionStorage/F5, Ctrl/clique/meio, popup, consulta403 nao restaura registros,
  troca de usuario/escopo descarta consulta, janela/ordenacao/expansao de tabela.
  Transporte interceptado, nenhuma escrita de negocio.
- Build aprovado12,90s/631 modulos. Warnings preexistentes Browserslist/chunk500kB.
- Node --check backend/controller/QA e consultaSessao, git diff --check;
  test:docs aprovado591 Markdown/19 canonicos. Ownership liberado.

## Riscos e continuidade

Sem EC2/DB real, main/producao, dados/configuracoes/financeiro, migration,
commit/push nesta etapa. Homologacao em aparelho/DEV permanece separada.
Testes de UI verificam datas e comportamento da tela com API simulada; nao
afirmam validar volume/plano MySQL real. O periodo corrige a consulta na origem,
nao filtra somente a pagina ja carregada.

Apos eventual autorizacao de publicacao, preparar roteiro DEV que admita a
mudanca do controller (o roteiro anterior saldo/cartao limita runtime a outros
dois servicos e nao e apropriado). Publicar refactor/frontend e operador testar
com datas inicial/final, mesmo dia, somente uma data, sem datas, filtros
combinados, filtro antigo salvo, ocultar/limpar e retorno. Produzir comandos,
nunca acessar a EC2 pelo agente.

## Publicacao autorizada posteriormente

Usuario autorizou commit/push refactor/frontend e comandos de atualizacao/teste
DEV. Preparado ops/deploy/atualizar-dev-periodo-registro-20261021.sh e teste
estatico backend/scripts/validarDeployPeriodoRegistroDev.js. Alvo SHA completo,
ff-only, base publicada44ee71b2 e base instalada minima93f75; se checkout estiver
atrasado, acompanha os pacotes DEV ja publicados e autorizados, sem cherry-pick
nem descarte de alteracoes. Delta novo runtime backend limitado ao controller;
dependencias e migrations devem permanecer iguais a base instalada conhecida.

Antes do merge, verifica PM2 online/porta8001/sem watch, identidadeDEV/UUID/schema
e sessao12h por script ja instalado. Depois do merge, QA de guardas/periodo/
vencimento/edicao/preferencias, regressao cartao/permutas e unidade frontend.
Revalida schema e .env antes de restart somente backend-dev; health8001 e nova
verificacao. Sem npm install/ci, DDL, .env ou flags alteradas. Nao acessar EC2
pelo agente. Nenhuma consulta automatica nova de dados de solicitacoes no MySQL;
testes de periodo em memoria, preflight/schema somente leitura.

Operador homologa no frontend DEV apos deploy Vercel, em Mais filtros:
Filtros visiveis > Periodo de registro, de01/10/2026 ate02/10/2026; confirmar
registros dos dias completos, combinar status/obra e Resposta/Pagamento,
testar dia unico, uma ponta, ambas vazias, ordem invertida, limpar/ocultar e
retorno/F5 com mesmo usuario. Nenhum teste de escrita financeira e necessario.

Outputs privados permanecem fora do commit. Main/producao inalteradas.

Fechamento de publicacao: testes de periodo backend/frontend, regressoes de
vencimento/edicao/preferencias/cartao/permutas e guardas do roteiro aprovados.
Suite UI1366/390 com workspace/legado, filtros combinados, sessao/URL/limpeza,
retorno/403/troca de usuario/escopo repetida e aprovada. Build16,42s/631 modulos,
Node/Bash/diff e docs591/19 aprovados, warnings preexistentes sem erro de build.
Ownership liberado para commit/push autorizado; homologacao real DEV pelo operador.
