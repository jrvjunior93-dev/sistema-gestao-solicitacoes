# Colaboradores por local e seletores Obra/Centro

## Pedido e plano

Usuario autorizou aplicacao completa do mapa da branch refactor/frontend.
Pedido posterior autorizou commit e push das pendencias na refactor/frontend.
Main, deploy e escrita em banco real continuam fora do escopo.

1. Menu Colaboradores: quatro portas Obras/Centros, Documentos, Relatorios,
   Importacoes; preservar cadastro e fechamentos via rotas/acoes legadas.
2. Pessoal: cards para DP e Obra conforme escopo existente; seis abas por local,
   documentos/relatorios com obra_id fixo; edicao cadastral reutiliza modal
   existente, permissao granular e retorna ao local.
3. Eventos/transferencias: aplicar filtro local no servidor, sem ampliar
   escopo; transferencias continuam obras apenas, sem nova regra de aprovacao.
4. Seletores mistos: consultas explicitas TODOS e rotulos Obra/Centro; manter
   /obras default intacto, apropriacao/planejamento/resultado/VGV obras apenas.
5. Comercial: lista de empreendimentos somente obras; impedir novos vinculos
   com centros administrativos, preservar vinculos legados e nao modificar
   obrigacoes/valores ou a geracao financeira.
6. Validacoes: UI desktop/mobile/Obra/DP, filtros locais/globais, edicao,
   negativas de permissao, dominio/servico em memoria, navegacao/catalogo,
   pagamentos/reembolso, compras/SST/comercial, build, docs e diff.

## Estado

Implementacao e conferencias concluidas. Nenhuma migration.
Publicacao na refactor/frontend autorizada e preparada; ownership liberado.
Sem banco real, main/EC2. outputs/ preservado fora do Git.

## Aplicacao do mapa

| Escopo | Telas/regras |
| --- | --- |
| Obras e centros de custo | Pessoal/cadastro, documentos, jornada, apuracao, fechamentos e importacoes RH; criacao/filtros de solicitacoes e compras; pedidos/cotacoes; contratos administrativos; titulos, pagamentos, conciliacao e relatorios financeiros; provisionamento; seletores SST existentes |
| Somente obras | Apropriacoes estruturais, planejamento/Custos e Recebiveis, Resultado de Obras, Painel Gestor, responsaveis e transferencias entre obras; empreendimentos fisicos do Comercial |
| Somente centros | Resultado de Centros de Custo e origem de distribuicao; regras existentes de destinos e tipos de solicitacao mantidas |
| Sem origem obrigatoria | Contas bancarias, empresas, parceiros/categorias, comunicacao/biblioteca/configuracoes globais: nao foram alterados |

- Consultas `getObras` mistas ganharam TODOS explicitamente, sem mudar
  `ObraController`, seus defaults ou o escopo de usuario. Conciliacao conserva
  getMinhasObras sem mudar para modo FINANCEIRO. Relatorios ja mistos mantiveram
  suas consultas; os rotulos passam a indicar Obra / Centro de Custo.
- Eventos e transferencias recebem filtro opcional local; o servidor intersecta
  esse filtro com a leitura autorizada. A leitura local nao consome avisos de
  outros locais. Diretorio global continua apenas com identificacao profissional.
- Novo empreendimento comercial recusa centro de custo; editar um vinculo
  legado sem troca continua permitido e a UI mostra o vinculo atual.
- Cadastro reutilizado como editor: mesma validacao/PATCH, sem reescrever a URL
  local, retorno apos salvar e bloqueio sincrono de envio duplicado.
- Cadastro e fechamentos movidos para acoes/Ctrl+K conservam IDs fixaveis,
  favoritos e tela inicial. Quatro cards principais ordenados na fonte unica.
- Documentos/relatorios locais usam o mesmo conteudo global com origem fixa e
  toolbar compacta, sem criar cabecalho sticky sobreposto ao da tela principal.
- Recorte de colaboradores tambem protegido na renderizacao: nunca mostrar
  linhas globais/da obra anterior enquanto aguarda a consulta local.

## Validacoes executadas

- `node backend/scripts/validarColaboradoresLocaisEscopos.js`: VM dos servicos
  reais, negativas de acesso/local invalido, origem/destino, notificacoes,
  centros nos eventos e preservacao do Comercial legado; sem banco/rede.
- UI real `validarRhPessoalPorLocal.mjs` (legado, --etapas, --gerencial): DP/Obra,
  seis abas, locais/globais, edicao, cargo salvo, duplo submit, centros/obras,
  somente ativos, mobile, leitura restrita e geracao/conferencia no modal.
- UI `validarRhPagamentoSolicitacaoUI.mjs`: moeda, autosave, dias/faltas,
  percentuais, dados de pagamento, reembolso parcial/agrupado e conferencias.
- UI `npm run test:pix-copia-cola`: oito telas e preparar Pix real no detalhe,
  texto longo/payload preservado, desktop e celular, API externa bloqueada.
- `validarAcessoPedidos.mjs`, `npm run test:navegacao`: quatro portas, controles
  de acesso, links legados, favoritos/Ctrl+K, nenhum destino perdido.
- Backend: validarRhPagamentoSolicitacao, test:rhdp-pessoal-solicitacao,
  test:rhdp-regras-pagamento, validarEscopoRhDpUsuarioObra,
  validarEventosRecorrentesDp, validarCompraCriacaoTodasObras,
  smoke-sst-simplificacao e validarComercialUnidadeExclusao aprovados.
- Build de producao e catalogo backend aprovados; warnings existentes de
  Browserslist desatualizado e chunk >500 kB. test:docs e diff --check aprovados.
- Screenshots desktop/mobile em outputs/rh-pessoal-locais; sem versionamento.

## Limites

Nao houve homologacao em EC2, Vercel ou banco real. Permissoes existentes de
Documentos/Relatorios/Eventos continuam obrigatorias; nenhum perfil ganhou
permissoes por este ajuste. Transferencias de centro de custo nao foram criadas.

## Riscos e protecoes

- Nao trocar o escopo geral de /obras: telas tecnicas dependem de OBRA.
- Documentos/relatorios locais nao podem limpar ou sobrescrever obra_id fixo.
- Backend precisa intersectar local com escopo do usuario (nao substitui-lo).
- Reutilizar cadastro, sem duplicar validacoes ou criar edicao privilegiada.
- Legado Jornada/Apuracao/Fechamentos conserva URLs e acesso autorizado.
- Promocao DP para main continua dependente de autorizacao separada.

## Proximo passo

Publicar somente este escopo na refactor/frontend, sem incluir outputs/.
Promocao para main depende de novo pedido do usuario. Apos a publicacao,
homologar em dev. O cadastro unico nao exige migration; atualizar backend e
frontend juntos na homologacao, pois filtros locais de eventos/transferencias
dependem dos dois lados. Nenhum dado existente foi reconciliado/alterado.
