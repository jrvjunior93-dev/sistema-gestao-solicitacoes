/**
 * MANIFESTO DO HARNESS DE QA VISUAL — as telas verificadas no PREVIEW
 * PUBLICADO (docs/DEFINICAO-DE-PRONTO.md). Começa com as 22 telas já
 * entregues; cada leva nova adiciona as suas aqui.
 *
 * Campos:
 * - id: nome curto (vira pasta de captura e linha da matriz)
 * - arquivo: o .jsx correspondente (rastreabilidade com telas-reformadas.json)
 * - rota: caminho fixo, OU resolver: 'tituloDetalhe' | 'obraGestao' para
 *   telas de registro cujo id vem da própria base (o harness navega pela
 *   listagem e abre o registro de PIOR CASO — maior valor/nome real).
 * - tipo: 'listagem' | 'detalhe' | 'form' | 'mista' | 'pivo'
 *   (detalhe/form exigem C3/C4; listagem reprova seta de voltar)
 * - naoAplica: { ITEM: 'motivo' } — N/A registrado, nunca silencioso.
 * - semDado: { ITEM: 'motivo' } — SEM DADO registrado (03/09): a tela TEM a
 *   capacidade e o harness a exercitaria, mas o ambiente compartilhado não
 *   oferece o registro necessário e o harness é SOMENTE LEITURA (não cria,
 *   não altera, não apaga). NÃO É APROVAÇÃO e não vira aprovação por
 *   equivalência com outra tela — é lacuna de evidência, declarada.
 * - semSessao: true — medida em contexto anônimo, sem login. É o caso das
 *   telas fora do shell, que existem justamente para quem não está logado.
 * - tambemCobre: ['src/pages/X.jsx'] — outros arquivos do manifesto estático
 *   que ESTA entrada mede, porque eles só existem DENTRO dela (aba, painel,
 *   bloco). Precisa ser DECLARADO: o check de cobertura compara as duas
 *   listas de telas e cobertura por dentro é invisível para ele. Cobertura
 *   silenciosa é o mesmo defeito que o check existe para pegar — por isso
 *   ela se escreve, não se infere.
 */
export const TELAS = [
  {
    id: 'usuarios',
    arquivo: 'src/pages/Usuarios.jsx',
    rota: '/usuarios',
    tipo: 'listagem'
  },
  {
    id: 'usuario-novo',
    arquivo: 'src/pages/UsuarioNovo.jsx',
    rota: '/usuarios/novo',
    tipo: 'form',
    naoAplica: {
      R1: 'cadastro de usuário é fluxo frequente com página própria (decisão registrada)',
      B4: 'formulário de criação não tem campos de leitura vazios a recolher'
    }
  },
  {
    id: 'parceiros',
    arquivo: 'src/pages/Parceiros.jsx',
    rota: '/parceiros',
    tipo: 'mista',
    naoAplica: {
      R1: 'cadastro de uso FREQUENTE mantém painel acima da lista (decisão registrada em R9)'
    }
  },
  {
    id: 'parceiro-categorias',
    arquivo: 'src/pages/ParceiroCategorias.jsx',
    rota: '/parceiros-categorias',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-titulo-detalhe',
    arquivo: 'src/pages/FinanceiroTituloDetalhe.jsx',
    resolver: 'tituloDetalhe',
    tipo: 'detalhe'
    /*
      A exceção de C6 saiu em 04/09: o cliente decidiu a terceira linha da
      regra de navegação (link para registro relacionado mora no corpo), o
      "Abrir solicitação" foi removido da faixa — onde era duplicata do link
      que já existia no campo "Solicitacao" — e não há mais o que excetuar.
    */
  },
  {
    id: 'obras',
    arquivo: 'src/pages/Obras.jsx',
    rota: '/obras',
    tipo: 'listagem'
  },
  {
    id: 'obra-gestao',
    arquivo: 'src/pages/ObraGestao.jsx',
    resolver: 'obraGestao',
    tipo: 'detalhe',
    // As tabelas da tela vivem nas ABAS — verificar só o dashboard seria
    // "implementado no componente" sem cobertura (proibido pela DoD).
    variantes: ['?aba=orcamento', '?aba=custos', '?aba=parcelas', '?aba=arquivos', '?aba=relatorio-final']
  },
  {
    id: 'obra-tipo-apropriacao',
    arquivo: 'src/pages/ObraTipoApropriacao.jsx',
    rota: '/obra-tipo-apropriacao',
    tipo: 'pivo',
    naoAplica: {
      T2: 'pivô de colunas dinâmicas — exceção registrada no manifesto (decisão do cliente pendente)',
      T3: 'pivô de colunas dinâmicas — exceção registrada no manifesto (decisão do cliente pendente)'
    }
  },
  {
    id: 'setores',
    arquivo: 'src/pages/Setores.jsx',
    rota: '/setores',
    tipo: 'listagem'
  },
  {
    id: 'tipos-solicitacao',
    arquivo: 'src/pages/TiposSolicitacao.jsx',
    rota: '/tipos-solicitacao',
    tipo: 'listagem'
  },
  {
    id: 'tipos-sub-contrato',
    arquivo: 'src/pages/TiposSubContrato.jsx',
    rota: '/tipos-sub-contrato',
    tipo: 'listagem'
  },
  {
    id: 'empresas-grupo',
    arquivo: 'src/pages/EmpresasGrupo.jsx',
    rota: '/empresas-grupo',
    tipo: 'listagem'
  },
  {
    id: 'areas-obra',
    arquivo: 'src/pages/AreasObra.jsx',
    rota: '/areas-obra',
    tipo: 'listagem'
  },
  {
    id: 'setores-visiveis-usuario',
    arquivo: 'src/pages/SetoresVisiveisUsuario.jsx',
    rota: '/setores-visiveis-usuario',
    tipo: 'listagem'
  },
  {
    id: 'tipos-solicitacao-por-setor',
    arquivo: 'src/pages/TiposSolicitacaoPorSetor.jsx',
    rota: '/tipos-solicitacao-por-setor',
    tipo: 'listagem'
  },
  {
    id: 'tipos-compartilhados-setor',
    arquivo: 'src/pages/TiposCompartilhadosSetor.jsx',
    rota: '/tipos-compartilhados-setor',
    tipo: 'listagem'
  },
  {
    id: 'setores-criacao-todas-obras',
    arquivo: 'src/pages/SetoresCriacaoTodasObras.jsx',
    rota: '/setores-criacao-todas-obras',
    tipo: 'listagem'
  },
  {
    id: 'setores-acesso-todas-obras',
    arquivo: 'src/pages/SetoresAcessoTodasObras.jsx',
    rota: '/setores-acesso-todas-obras',
    tipo: 'listagem'
  },
  {
    id: 'usuarios-envio-qualquer-setor',
    arquivo: 'src/pages/UsuariosEnvioQualquerSetor.jsx',
    rota: '/usuarios-envio-qualquer-setor',
    tipo: 'listagem'
  },
  {
    id: 'usuarios-acesso-financeiro',
    arquivo: 'src/pages/UsuariosAcessoFinanceiro.jsx',
    rota: '/usuarios-acesso-financeiro',
    tipo: 'listagem'
  },
  {
    id: 'usuarios-acesso-prioridade-diretoria',
    arquivo: 'src/pages/UsuariosAcessoPrioridadeDiretoria.jsx',
    rota: '/usuarios-acesso-prioridade-diretoria',
    tipo: 'listagem'
  },
  {
    id: 'usuarios-permissoes-rh-dp',
    arquivo: 'src/pages/UsuariosPermissoesRhDp.jsx',
    rota: '/usuarios-permissoes-rh-dp',
    tipo: 'listagem'
  },

  /* ---------------------------------------------------------------------
     ETAPA B — MÓDULO RH/DP (02/09). Nenhuma destas telas tinha sido medida
     contra a DoD até esta leva: o módulo inteiro estava fora do manifesto,
     e a matriz de 22 telas que fechou 100% não o cobria.

     Duas telas do levantamento NÃO entram porque deixaram de existir:
     RhDpInicio (D3 — o hub do módulo já é o índice) e RhDpEmpresas (D2 —
     Empresas do grupo passou a existir uma vez só, em Cadastros). Jornada e
     Apuração também não têm linha própria: viraram ABAS do Pessoal (D1) e
     são medidas como variantes dele.
     --------------------------------------------------------------------- */
  {
    id: 'rhdp-pessoal',
    arquivo: 'src/pages/RhDpPessoal.jsx',
    rota: '/rh-dp/pessoal',
    tipo: 'mista',
    // As quatro abas da porta única do DP (D1). Jornada e Apuração são
    // arquivos próprios (RhDpJornada.jsx, RhDpApuracao.jsx) medidos aqui —
    // é onde o usuário os encontra.
    variantes: ['?aba=colaboradores', '?aba=jornada', '?aba=apuracao'],
    /*
      EXCEÇÃO DECLARADA — T4, com dono e destino (decisão do cliente, 04/09).

      Na aba de apuração, "OBRA" e "EMPRESA" precisam AS DUAS de espaço nesta
      base. A `TabelaPadrao` distribui a sobra para UMA coluna só, e escolhe
      pela declaração — não tem como saber qual texto é mais longo nos dados.
      Dar o peso à Empresa consertou a Empresa e quebrou a Obra (medido: a
      folga passou de 215px na Obra para 247px na Empresa, e o defeito trocou
      de lado). Não há declaração de tela que resolva: o conserto é o
      componente REPARTIR a sobra entre as colunas que a pedem.

      Por isso a causa não é desta tela, e a exceção tem destino: leva do
      `TabelaPadrao`, a mesma que vai tratar o alternador entre rolagem
      infinita e páginas. Exceção com dono e prazo é diferente de célula
      vermelha esquecida — esta some quando aquela leva entregar.
    */
    naoAplica: {
      T4: 'sobra distribuída para UMA coluna só é limite do TabelaPadrao, não da tela: Obra e Empresa precisam as duas de espaço e dar peso a uma inverte o defeito (medido em 04/09). Exceção com dono: leva do TabelaPadrao'
    },
    // Os três só existem DENTRO desta porta (RhDpPessoal.jsx os renderiza
    // por aba); não têm rota própria. Declarado para o check de cobertura,
    // que compara arquivo a arquivo e não enxerga o que mora numa aba.
    tambemCobre: [
      'src/pages/RhDpPessoalSolicitacoes.jsx',
      'src/pages/RhDpJornada.jsx',
      'src/pages/RhDpApuracao.jsx'
    ]
  },
  {
    id: 'rhdp-colaboradores',
    arquivo: 'src/pages/RhDpColaboradores.jsx',
    rota: '/rh-dp/colaboradores',
    tipo: 'listagem'
  },
  {
    id: 'rhdp-documentos',
    arquivo: 'src/pages/RhDpDocumentos.jsx',
    rota: '/rh-dp/documentos',
    tipo: 'listagem'
  },
  {
    id: 'rhdp-importacoes',
    arquivo: 'src/pages/RhDpImportacoes.jsx',
    rota: '/rh-dp/importacoes',
    tipo: 'mista'
  },
  {
    id: 'rhdp-fechamentos',
    arquivo: 'src/pages/RhDpFechamentos.jsx',
    rota: '/rh-dp/fechamentos',
    tipo: 'listagem'
  },
  /*
    CATEGORIA "TELAS COMPARTILHADAS" (03/09) — ver docs/TELAS-COMPARTILHADAS.md.

    Oito telas do sistema não pertencem a leva de módulo nenhuma: duas são
    servidas por VÁRIOS módulos (ModuloRelatorios por nove; Relatórios
    Administrativos por dois), duas têm uma segunda família de rota fora do
    menu, e quatro renderizam fora do shell (login, recuperação e definição
    de senha, e a cotação pública do fornecedor). Organizado por módulo, o
    inventário não reivindicava nenhuma delas — escapavam de todas as levas.
    Entram no manifesto na leva própria; as de fora do shell só depois de
    ganharem DoD própria, porque a régua atual pressupõe topbar, menu e
    breadcrumb.

    A primeira delas — retirada deste manifesto em 02/09, com justificativa
    (decisão do cliente).

    `/rh-dp/relatorios` renderiza `ModuloRelatorios.jsx`, que é um hub
    COMPARTILHADO por seis módulos (solicitações, financeiro, CRM, SST,
    comercial e RH/DP) — cada um com seu próprio bloco de configuração
    dentro do mesmo arquivo. Ele nunca foi migrado: não usa `Pagina`,
    `PageHeader` nem `.app-bloco`; é Tailwind à mão.

    Eu a coloquei no manifesto por engano ao abrir a Etapa B: a rota começa
    com /rh-dp, mas o arquivo não é do RH/DP e ninguém o reescreveu nesta
    leva. O resultado foram cinco células FALHOU (C1, C2, C5, B1, X2) que
    não pertenciam à leva e que a matriz apresentava como se pertencessem.

    Reescrevê-la muda a cara dos relatórios de TODOS os módulos ao mesmo
    tempo — é leva própria, não um apêndice do RH/DP. Volta ao manifesto
    quando essa leva acontecer. Enquanto isso, fica registrado em
    docs/PENDENCIAS-REGISTRADAS.md, com um achado extra: o título renderiza
    "Relatorios de RH/DP", ou seja, o prefixo que a D7 mandou tirar
    sobrevive nesta tela por ela estar fora do escopo.
  */
  {
    id: 'rhdp-relatorio-operacional',
    arquivo: 'src/pages/RhDpRelatorioOperacional.jsx',
    rota: '/rh-dp/relatorios/operacional',
    tipo: 'listagem'
  },

  /* =================================================================
     TELAS COMPARTILHADAS (leva de 03/09) — categoria própria.
     Servidas por VÁRIOS módulos, ou por nenhum. Não pertencem a leva de
     módulo nenhuma e por isso escapavam de todas — o ponto cego exposto
     quando a ModuloRelatorios entrou por engano no manifesto do RH/DP.
     Dono: leva-compartilhadas. Ver docs/TELAS-COMPARTILHADAS.md.
     ================================================================= */

  {
    id: 'modulo-relatorios',
    arquivo: 'src/pages/ModuloRelatorios.jsx',
    // Um arquivo, nove módulos. A rota do RH/DP é a que o usuário de QA
    // alcança; as outras oito renderizam o MESMO componente com outro
    // bloco de configuração.
    rota: '/rh-dp/relatorios',
    tipo: 'mista',
    naoAplica: {
      F1: 'hub de cartões: não há listagem com recorte',
      F2: 'idem F1',
      F3: 'idem F1',
      F4: 'idem F1',
      C3: 'hub de entrada do módulo, não é tela de detalhe',
      C4: 'idem C3'
    }
  },
  {
    id: 'relatorios-administrativos',
    arquivo: 'src/pages/RelatoriosAdministrativos.jsx',
    // A rota mudou em 04/09. A /relatorios/administrativos era a segunda
    // rota do MESMO componente, sem porta no menu, e saiu na consolidacao.
    // O harness ficou apontando para ela — teria dado 404 na proxima matriz,
    // e o pior: 404 e uma tela que carrega, entao os checks reprovariam por
    // ausencia de elemento e eu iria procurar defeito onde nao ha.
    rota: '/compras/relatorios/auditoria',
    tipo: 'listagem'
  },
  {
    id: 'comunicacao-interna',
    arquivo: 'src/pages/ComunicacaoInterna.jsx',
    rota: '/comunicacao-interna',
    tipo: 'mista',
    naoAplica: {
      C3: 'painel de trabalho em duas colunas, não é tela de detalhe com retorno hierárquico',
      C4: 'idem C3'
    }
  },
  {
    id: 'config-contrato-alertas-formas',
    arquivo: 'src/pages/ConfiguracoesContratoAlertasEFormas.jsx',
    // A rota do MENU, assunto "formas de pagamento". A irma
    // (/configuracoes-contrato-alertas) ganhou porta propria em 04/09 e tem
    // entrada SEPARADA nesta lista: a tela le o pathname e anuncia outro
    // assunto — titulo, apoio e qual bloco recebe a barra de cor. Medir uma
    // e declarar a outra coberta seria declarar sem medir justamente o que
    // difere entre as duas.
    rota: '/configuracoes-formas-pagamento-solicitacao',
    tipo: 'form',
    naoAplica: {
      F1: 'tela de configuração: não há listagem com recorte',
      F2: 'idem F1',
      F3: 'idem F1',
      F4: 'idem F1',
      C3: 'configuração de sistema, não é tela de detalhe de registro',
      C4: 'idem C3'
    }
  },

  /* =================================================================
     BURACOS DE COBERTURA ACHADOS AO ABRIR A RODADA 2 (04/09)

     As duas rotas abaixo renderizam componentes que o harness JA mede em
     outra rota. Nao foram declaradas cobertas: foram medidas. O criterio e
     o mesmo que ja custou caro aqui — declaracao conforta, medicao prova.
     ================================================================= */

  {
    id: 'config-contrato-alertas-assunto',
    arquivo: 'src/pages/ConfiguracoesContratoAlertasEFormas.jsx',
    // Mesmo componente da config-contrato-alertas-formas, OUTRO assunto: a
    // tela le o pathname e troca titulo, apoio e o bloco que recebe a barra
    // de cor (B2). E exatamente o que muda entre as duas que precisa ser
    // visto, entao a rota entra com medicao propria.
    rota: '/configuracoes-contrato-alertas',
    tipo: 'form',
    naoAplica: {
      F1: 'tela de configuração: não há listagem com recorte',
      F2: 'idem F1',
      F3: 'idem F1',
      F4: 'idem F1',
      C3: 'configuração de sistema, não é tela de detalhe de registro',
      C4: 'idem C3'
    }
  },
  {
    id: 'modulo-relatorios-solicitacoes',
    arquivo: 'src/pages/ModuloRelatorios.jsx',
    // Mesmo hub da modulo-relatorios (medida em /rh-dp/relatorios), com
    // outro bloco de configuracao. O componente e um so, mas a quantidade e
    // o tamanho dos cartoes mudam por modulo, e X3 (estouro em 390px) e
    // exatamente um item que depende disso. Declarar coberto seria supor o
    // que nao foi visto.
    rota: '/solicitacoes/relatorios',
    tipo: 'mista',
    naoAplica: {
      F1: 'hub de cartões: não há listagem com recorte',
      F2: 'idem F1',
      F3: 'idem F1',
      F4: 'idem F1',
      C3: 'hub de entrada do módulo, não é tela de detalhe',
      C4: 'idem C3'
    }
  },

  /* =================================================================
     LEVA DO FINANCEIRO (fatias 1 a 4, 04/09) — as 29 telas do módulo.

     Elas entraram no manifesto ESTÁTICO fatia a fatia e ficaram fora
     DESTA lista o tempo todo: o harness nunca as abriu no preview. O
     buraco só apareceu no fechamento, quando a matriz imprimiu "6
     células FALHOU" sobre 36 telas e eu disse que eram 68. Ver o check
     [COBERTURA] no validarLayout.mjs, que agora reprova a divergência.
     ================================================================= */

  {
    id: 'financeiro-titulos',
    arquivo: 'src/pages/FinanceiroTitulos.jsx',
    rota: '/financeiro/titulos',
    tipo: 'listagem',
    // D2: porta única com o recorte na URL. Os dois recortes são destinos
    // distintos no menu e precisam ser medidos como o usuário os abre.
    variantes: ['?tipo=pagar', '?tipo=receber']
  },
  {
    id: 'financeiro-titulo-novo',
    arquivo: 'src/pages/FinanceiroTituloNovo.jsx',
    rota: '/financeiro/titulos/novo',
    tipo: 'form',
    naoAplica: {
      R1: 'cadastro de título tem página própria (destino "Novo Título" no menu do módulo)'
    }
  },
  {
    id: 'financeiro-titulo-editar',
    arquivo: 'src/pages/FinanceiroTituloEditar.jsx',
    resolver: 'tituloEditar',
    tipo: 'form',
    naoAplica: {
      R1: 'edição de registro existente não é ação de cadastro'
    }
  },
  {
    id: 'financeiro-baixas',
    arquivo: 'src/pages/FinanceiroBaixas.jsx',
    rota: '/financeiro/baixas',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-baixas-compostas',
    arquivo: 'src/pages/FinanceiroBaixasCompostas.jsx',
    rota: '/financeiro/baixas-compostas',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-bancos',
    arquivo: 'src/pages/FinanceiroBancos.jsx',
    rota: '/financeiro/bancos',
    tipo: 'mista'
  },
  {
    id: 'financeiro-boletos',
    arquivo: 'src/pages/FinanceiroBoletos.jsx',
    rota: '/financeiro/boletos',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-cadastros',
    arquivo: 'src/pages/FinanceiroCadastros.jsx',
    rota: '/financeiro/cadastros',
    tipo: 'mista'
  },
  {
    id: 'financeiro-caixas',
    arquivo: 'src/pages/FinanceiroCaixas.jsx',
    rota: '/financeiro/caixas',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-cheques-terceiros',
    arquivo: 'src/pages/FinanceiroChequesTerceiros.jsx',
    rota: '/financeiro/cheques-terceiros',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-conciliacao',
    arquivo: 'src/pages/FinanceiroConciliacao.jsx',
    rota: '/financeiro/conciliacao',
    tipo: 'mista'
  },
  {
    id: 'financeiro-dda',
    arquivo: 'src/pages/FinanceiroDda.jsx',
    rota: '/financeiro/dda',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-faturas-cartao',
    arquivo: 'src/pages/FinanceiroFaturasCartao.jsx',
    rota: '/financeiro/faturas-cartao',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-fatura-cartao-detalhe',
    arquivo: 'src/pages/FinanceiroFaturaCartaoDetalhe.jsx',
    resolver: 'faturaCartaoDetalhe',
    tipo: 'detalhe'
  },
  {
    id: 'financeiro-financiamentos-bancarios',
    arquivo: 'src/pages/FinanceiroFinanciamentosBancarios.jsx',
    rota: '/financeiro/financiamentos-bancarios',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-pagamentos',
    arquivo: 'src/pages/FinanceiroPagamentos.jsx',
    rota: '/financeiro/pagamentos',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-relatorios',
    arquivo: 'src/pages/FinanceiroRelatorios.jsx',
    rota: '/financeiro/relatorios',
    tipo: 'mista',
    naoAplica: {
      C3: 'hub de entrada dos relatórios do módulo, não é tela de detalhe',
      C4: 'idem C3'
    }
  },
  {
    id: 'financeiro-dre',
    arquivo: 'src/pages/FinanceiroDre.jsx',
    rota: '/financeiro/relatorios/dre',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-diagnostico-dre',
    arquivo: 'src/pages/FinanceiroDiagnosticoDre.jsx',
    rota: '/financeiro/relatorios/dre/diagnostico',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-endividamento',
    arquivo: 'src/pages/FinanceiroEndividamento.jsx',
    rota: '/financeiro/relatorios/endividamento',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-executivo-grupo',
    arquivo: 'src/pages/FinanceiroExecutivoGrupo.jsx',
    rota: '/financeiro/relatorios/grupo-consolidado',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-fluxo-consolidado',
    arquivo: 'src/pages/FinanceiroFluxoConsolidado.jsx',
    rota: '/financeiro/relatorios/fluxo-consolidado',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-intercompany',
    arquivo: 'src/pages/FinanceiroIntercompany.jsx',
    rota: '/financeiro/relatorios/intercompany',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-obras',
    arquivo: 'src/pages/FinanceiroObras.jsx',
    rota: '/financeiro/relatorios/financeiro-obras',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-relatorio-analitico',
    arquivo: 'src/pages/FinanceiroRelatorioAnalitico.jsx',
    rota: '/financeiro/relatorios/analitico',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-resultado-centros-custo',
    arquivo: 'src/pages/FinanceiroResultadoCentrosCusto.jsx',
    rota: '/financeiro/relatorios/centros-custo',
    tipo: 'listagem'
  },
  {
    id: 'financeiro-resultado-obras',
    arquivo: 'src/pages/FinanceiroResultadoObras.jsx',
    rota: '/financeiro/relatorios/resultado-obras',
    tipo: 'listagem'
  },
  {
    id: 'comprovantes-pendentes',
    arquivo: 'src/pages/ComprovantesPendentes.jsx',
    rota: '/comprovantes/pendentes',
    tipo: 'mista'
  },
  {
    id: 'upload-comprovantes',
    arquivo: 'src/pages/UploadComprovantes.jsx',
    rota: '/comprovantes/upload',
    tipo: 'form',
    naoAplica: {
      R1: 'envio de arquivo tem página própria (destino de ação "Upload Comprovantes" no menu)'
    }
  },

  /* =================================================================
     FORA DO SHELL — renderizam sem o Layout: sem topbar, sem menu, sem
     breadcrumb. Medidas em SESSÃO ANÔNIMA (semSessao), porque é assim
     que o usuário real as vê. DoD própria: docs/DEFINICAO-DE-PRONTO.md,
     seção "TELAS FORA DO SHELL".

     O que sai (C1/C2/C3/X2/F1–F4) sai porque pressupõe o shell. O que
     INVERTE (C6/R11) está declarado como ESCOPO da regra, não exceção:
     ali o link de navegação é a única saída e é obrigatório.
     ================================================================= */

  {
    id: 'login',
    arquivo: 'src/pages/Login/index.jsx',
    rota: '/login',
    tipo: 'form',
    semSessao: true,
    naoAplica: {
      C1: 'fora do shell: não há topbar para a faixa grudar',
      C2: 'idem C1',
      C3: 'não é tela de detalhe',
      C4: 'idem C3',
      C6: 'ESCOPO da R11 (03/09): sem menu e sem breadcrumb, "Esqueci minha senha" é a única navegação e é obrigatória',
      X2: 'idem C1',
      F1: 'não há listagem', F2: 'não há listagem', F3: 'não há listagem', F4: 'não há listagem'
    }
  },
  {
    id: 'recuperar-senha',
    arquivo: 'src/pages/RecuperarSenha.jsx',
    rota: '/recuperar-senha',
    tipo: 'form',
    semSessao: true,
    naoAplica: {
      C1: 'fora do shell: não há topbar para a faixa grudar',
      C2: 'idem C1',
      C3: 'não é tela de detalhe',
      C4: 'idem C3',
      C6: 'ESCOPO da R11 (03/09): "Voltar ao login" é a única navegação disponível e é obrigatória',
      X2: 'idem C1',
      F1: 'não há listagem', F2: 'não há listagem', F3: 'não há listagem', F4: 'não há listagem'
    }
  },
  {
    id: 'definir-senha',
    arquivo: 'src/pages/DefinirSenha.jsx',
    // SEM token na URL — de propósito. O harness é SOMENTE LEITURA e não
    // dispara e-mail de recuperação para conseguir um token válido. Então
    // o que se mede aqui é o estado "endereço veio sem o código do link",
    // que é um estado REAL e importante. O formulário preenchido fica
    // NÃO PROVADO, e isso está declarado abaixo — não vira PASSOU por
    // equivalência com a tela irmã.
    rota: '/definir-senha',
    tipo: 'form',
    semSessao: true,
    naoAplica: {
      C1: 'fora do shell: não há topbar para a faixa grudar',
      C2: 'idem C1',
      C3: 'não é tela de detalhe',
      C4: 'idem C3',
      X2: 'idem C1',
      F1: 'não há listagem', F2: 'não há listagem', F3: 'não há listagem', F4: 'não há listagem'
    },
    semDado: {
      R1: 'medida SEM token na URL: o harness não dispara e-mail de recuperação no ambiente compartilhado (somente leitura). O formulário de senha habilitado, as etiquetas de requisito ao vivo e o caminho de sucesso NÃO FORAM PROVADOS',
      R2: 'idem R1: os campos de senha ficam desabilitados no estado sem token',
      A1: 'idem R1: o percurso de teclado pelo formulário habilitado não foi exercitado'
    }
  },
  {
    id: 'cotacao-publica',
    arquivo: 'src/modules/solicitacao-compra/pages/CotacaoFornecedorPublica.jsx',
    // Token inválido de propósito, pelo mesmo motivo da definir-senha: um
    // token válido só existe criando/abrindo cotação no ambiente
    // compartilhado, e o harness não cria registro. O estado medido é o
    // "este link não abre mais uma cotação em aberto" — que é justamente
    // o texto que esta leva reescreveu, e o que mais aparece na vida real
    // (link copiado pela metade, prazo vencido).
    rota: '/cotacao/harness-sem-token-valido',
    tipo: 'form',
    semSessao: true,
    naoAplica: {
      C1: 'fora do shell: não há topbar para a faixa grudar',
      C2: 'idem C1',
      C3: 'não é tela de detalhe',
      C4: 'idem C3',
      X2: 'idem C1',
      F1: 'não há listagem com recorte', F2: 'idem F1', F3: 'idem F1', F4: 'idem F1'
    },
    semDado: {
      T1: 'medida com token INVÁLIDO: um token válido só existe criando ou abrindo cotação no ambiente compartilhado, e o harness não cria registro. A tabela de itens NÃO FOI PROVADA',
      T2: 'idem T1', T3: 'idem T1', T4: 'idem T1', T5: 'idem T1', T6: 'idem T1', T7: 'idem T1',
      T8: 'idem T1: sem tabela carregada não há linha de cabeçalho para medir',
      X1: 'idem T1: a virada da tabela para cards em 390px não foi exercitada',
      R1: 'idem T1: o formulário de proposta não renderiza sem cotação carregada',
      R2: 'idem T1',
      A1: 'idem T1: o percurso de teclado pelo formulário e pelo anexo não foi exercitado',
      B4: 'idem T1: os campos de contexto (fornecedor, obra, situação) não renderizam sem cotação'
    }
  },

  /* =================================================================
     RODADA 2 — CONFIGURAÇÕES (04/09): as 25 telas migradas.

     Elas entram AQUI e no manifesto estático no MESMO commit. Entrar só
     num dos dois é meia migração — e a metade que fica de fora é
     justamente a que decide "PRONTO", porque PRONTO se verifica no
     preview publicado, não no código.

     Eu mesmo tropecei nisso hoje: adiantei UMA tela para o manifesto
     estático e o check de cobertura reprovou na hora, com o nome dela.
     O check está certo e a pressa era minha.
     ================================================================= */

  {
    id: 'config-hub-status-setor',
    cadastroInline: 'a tela existe PARA cadastrar status por setor: tirando o formulário sobra uma fila que ninguém abriria por si só (R9 revista em 04/09)',
    arquivo: 'src/pages/StatusSetor.jsx',
    rota: '/status-setor',
    tipo: 'listagem',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-permissoes-setor',
    arquivo: 'src/pages/PermissoesSetor.jsx',
    rota: '/permissoes-setor',
    tipo: 'listagem',
    naoAplica: {
      // A RECUSA É INTENCIONAL, E ESTAVA ESCRITA SÓ NO CÓDIGO (declarada
      // aqui em 06/09, depois de conferida em `PermissoesSetor.jsx:83`).
      // A tela passa `colunasConfiguraveis={false}` com o motivo por
      // extenso: das 3 colunas, DUAS são campos de digitação ("Usuario pode
      // assumir" e "Usuario pode atribuir" são caixas de marcação que
      // GRAVAM permissão). É grade de lançamento, não lista de consulta —
      // esconder a coluna aqui é esconder o campo que a pessoa precisa
      // preencher, e ela não descobre por que o lançamento parou de
      // funcionar. O check não tem como ler essa intenção do silêncio, e
      // ele mesmo diz onde ela se declara: é aqui.
      P1: "grade de LANÇAMENTO: 2 das 3 colunas são campos de digitação que gravam permissão, e a tela recusa a escolha em `colunasConfiguraveis={false}` (motivo escrito em PermissoesSetor.jsx, 05/09) — esconder coluna aqui é esconder o campo que a pessoa precisa preencher",
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-cores-sistema',
    arquivo: 'src/pages/CoresSistema.jsx',
    rota: '/cores-sistema',
    tipo: 'form',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-contrato-obra-categorias',
    arquivo: 'src/pages/ContratoObraCategorias.jsx',
    rota: '/contrato-obra-categorias',
    tipo: 'mista',
    naoAplica: {
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-areas-por-setor-origem',
    arquivo: 'src/pages/AreasPorSetorOrigem.jsx',
    rota: '/areas-por-setor-origem',
    tipo: 'mista',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-automacao-status-setor',
    arquivo: 'src/pages/AutomacaoStatusSetor.jsx',
    rota: '/automacao-status-setor',
    tipo: 'mista',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-aprovacao-solicitacao-por-tipo',
    arquivo: 'src/pages/AprovacaoSolicitacaoPorTipo.jsx',
    rota: '/aprovacao-solicitacao-por-tipo',
    tipo: 'mista',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-arquivos-modelos',
    arquivo: 'src/pages/ArquivosModelosConfig.jsx',
    rota: '/arquivos-modelos-config',
    tipo: 'mista',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-comercial-categorias',
    arquivo: 'src/pages/ConfiguracoesComercialCategorias.jsx',
    rota: '/configuracoes-comercial-categorias',
    tipo: 'form',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-provisionamento-fluxo',
    arquivo: 'src/pages/ConfiguracoesProvisionamentoFluxo.jsx',
    rota: '/configuracoes-provisionamento-fluxo',
    tipo: 'form',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-acoes-principais',
    arquivo: 'src/pages/ConfiguracoesAcoesPrincipais.jsx',
    rota: '/configuracoes-acoes-principais',
    tipo: 'listagem',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-atalhos-setor',
    arquivo: 'src/pages/ConfiguracoesAtalhosSetor.jsx',
    rota: '/configuracoes-atalhos-setor',
    tipo: 'listagem',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-detalhe-layout',
    arquivo: 'src/pages/ConfiguracoesDetalheLayout.jsx',
    rota: '/configuracoes-detalhe-layout',
    tipo: 'mista',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-cotacao',
    arquivo: 'src/pages/ConfiguracoesCotacao.jsx',
    rota: '/configuracoes-cotacao',
    tipo: 'form',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-status-pedido-compra',
    cadastroInline: 'a tela existe PARA cadastrar os status do pedido de compra (R9 revista em 04/09)',
    arquivo: 'src/pages/ConfiguracoesStatusPedidoCompra.jsx',
    rota: '/configuracoes-status-pedidos-compra',
    tipo: 'listagem',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-sla-setor',
    arquivo: 'src/pages/SolicitacoesSlaSetor.jsx',
    rota: '/solicitacoes-sla-setor',
    tipo: 'listagem',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-recebimento-setor',
    arquivo: 'src/pages/ComportamentoRecebimentoSetor.jsx',
    rota: '/comportamento-recebimento-setor',
    tipo: 'listagem',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-nova-solicitacao-campos',
    arquivo: 'src/pages/NovaSolicitacaoCamposConfig.jsx',
    rota: '/nova-solicitacao-campos',
    tipo: 'listagem',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-nova-solicitacao-destino',
    arquivo: 'src/pages/NovaSolicitacaoAutomacaoDestinoConfig.jsx',
    rota: '/nova-solicitacao-automacao-destino',
    /*
      TIPO CORRIGIDO EM 05/09 — `mista` -> `form`.

      Eu classifiquei o tipo destas telas MECANICAMENTE ao promove-las:
      "tem TabelaPadrao e contagem -> listagem; tem contagem sem tabela ->
      mista". O criterio certo e o que a tela E, nao quais props ela passa.

      Esta e um painel de UMA regra por tipo de solicitacao — a contagem dela
      e textual de proposito ("Regra ativa neste tipo" / "Sem regra neste
      tipo"), porque nao ha o que contar. Declarada `mista`, o check de C2
      exigia digito no apoio e a celula reprovava por uma classificacao
      minha, nao por defeito da tela.

      Reclassificar para fazer vermelho virar verde e o movimento que este
      projeto mais desconfia — entao o teste foi outro: esta tela lista
      registros? Nao. Lista uma regra so, do tipo escolhido no seletor de
      contexto. E formulario.
    */
    tipo: 'form',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-suporte',
    arquivo: 'src/pages/ConfiguracoesSuporte.jsx',
    rota: '/configuracoes-suporte',
    tipo: 'form',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-visibilidade-ui',
    arquivo: 'src/pages/ConfiguracoesVisibilidadeUi.jsx',
    rota: '/configuracoes-visibilidade-ui',
    tipo: 'mista',
    naoAplica: {
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-notificacoes-sistema',
    arquivo: 'src/pages/ConfiguracoesNotificacoesSistema.jsx',
    rota: '/configuracoes-notificacoes-sistema',
    tipo: 'mista',
    naoAplica: {
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-modulos',
    arquivo: 'src/pages/ConfiguracoesModulos.jsx',
    rota: '/configuracoes-modulos',
    tipo: 'mista',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-timeout-inatividade',
    arquivo: 'src/pages/TimeoutInatividade.jsx',
    rota: '/timeout-inatividade',
    tipo: 'form',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-permissoes-areas-padroes',
    arquivo: 'src/pages/PermissoesAreasPadroes.jsx',
    rota: '/permissoes-areas-padroes',
    // Mesma correcao de 05/09: e a MATRIZ de marcacao de um par
    // setor+perfil, escolhido em dois seletores de contexto — nao uma
    // listagem de registros. Ver o comentario na config-nova-solicitacao-destino.
    tipo: 'form',
    naoAplica: {
      F1: "tela de configuração sem caixa de busca — não há duas a conciliar",
      F2: "idem F1: não há recorte de lista por filtro",
      F3: "idem F1",
      F4: "idem F1",
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'config-permissoes-areas',
    arquivo: 'src/pages/PermissoesAreas.jsx',
    rota: '/permissoes-areas',
    tipo: 'mista',
    naoAplica: {
      C3: "configuração de sistema, não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  /* Rodada 2 — as duas telas que ficaram sem dono na onda de correção. */
  {
    id: 'config-hub',
    arquivo: 'src/pages/Configuracoes.jsx',
    rota: '/configuracoes',
    tipo: 'mista',
    naoAplica: {
      F1: 'hub de cartões: não há listagem com recorte nem caixa de busca',
      F2: 'idem F1',
      F3: 'idem F1',
      F4: 'idem F1',
      C3: 'hub de entrada, não é tela de detalhe de registro',
      C4: 'idem C3'
    }
  },
  {
    id: 'config-cartoes-recarga',
    cadastroInline: "ninguém abre 'Cartões de recarga' para consultar quantos existem — abre para cadastrar um ou mudar quem pode usá-lo (R9 revista em 04/09)",
    arquivo: 'src/pages/CartoesRecarga.jsx',
    rota: '/configuracoes-cartoes-recarga',
    tipo: 'listagem',
    naoAplica: {
      F1: 'tela de configuração sem caixa de busca — não há duas a conciliar',
      F2: 'idem F1: não há recorte de lista por filtro',
      F3: 'idem F1',
      F4: 'idem F1',
      C3: 'configuração de sistema, não é tela de detalhe de registro',
      C4: 'idem C3'
    }
  },


  /* ============ RODADA 3 — COMERCIAL E CONTRATOS (05/09): 8 telas.
     Entram aqui e no manifesto estático no MESMO commit. ============ */

  {
    id: 'contratos-gestao',
    arquivo: 'src/pages/GestaoContratos.jsx',
    rota: '/gestao-contratos',
    tipo: 'listagem'
  },
  {
    id: 'comercial-contratos',
    arquivo: 'src/pages/ComercialContratos.jsx',
    rota: '/comercial/contratos',
    tipo: 'listagem',
    cadastroInline: "a tela anuncia \"Contratos de venda\" e o formulário é o que ela existe para fazer"
  },
  {
    id: 'comercial-empreendimentos',
    arquivo: 'src/pages/ComercialEmpreendimentos.jsx',
    rota: '/comercial/empreendimentos',
    tipo: 'listagem',
    cadastroInline: "a tela existe PARA cadastrar empreendimento (R9 revista em 04/09)"
  },
  {
    id: 'comercial-unidades',
    arquivo: 'src/pages/ComercialUnidades.jsx',
    rota: '/comercial/unidades',
    tipo: 'listagem',
    cadastroInline: "a tela existe PARA cadastrar unidade comercial (R9 revista em 04/09)",
    // A única dimensão de filtro é "Empreendimento", e ela sai de
    // getEmpreendimentosComerciais(): sem empreendimento na base, não há o que
    // oferecer. Declarado aqui para a F3 poder dizer SEM DADO em vez de
    // FALHOU — e a F3 ainda exige que a tela DIGA isso a quem clicou.
    filtroSemOpcoesNaBase: 'a dimensão Empreendimento sai da base de empreendimentos comerciais, vazia no preview'
  },
  {
    id: 'comercial-modelos-contrato',
    arquivo: 'src/pages/ComercialModelosContrato.jsx',
    rota: '/comercial/modelos-contrato',
    tipo: 'listagem',
    cadastroInline: "páginas de modelo é o exemplo literal da tabela da R9 revista"
  },
  {
    id: 'comercial-tabelas-preco',
    arquivo: 'src/pages/ComercialTabelasPreco.jsx',
    rota: '/comercial/tabelas-preco',
    tipo: 'listagem',
    cadastroInline: "a tela existe PARA montar tabela de preço (R9 revista em 04/09)"
  },
  {
    id: 'comercial-mapa-unidades',
    arquivo: 'src/pages/ComercialMapaUnidades.jsx',
    rota: '/comercial/mapa-unidades',
    tipo: 'mista',
    naoAplica: {
      F1: "mapa de cards por agrupamento: não há listagem com recorte",
      F2: "idem F1",
      F3: "idem F1",
      F4: "idem F1",
      C3: "não é tela de detalhe de registro",
      C4: "idem C3"
    }
  },
  {
    id: 'contratos-novo',
    arquivo: 'src/pages/ContratoFluxoNovo.jsx',
    rota: '/contratos/novo',
    tipo: 'form',
    naoAplica: {
      F1: "tela de registro sem listagem",
      F2: "idem F1",
      F3: "idem F1",
      F4: "idem F1",
      C4: "não é tela de detalhe de registro"
    }
  },
  // ---- Rodada 4: CRM, 16 telas (05/09) ----
  {
    id: 'crm-dashboard',
    arquivo: 'src/modules/crm/pages/CrmDashboard.jsx',
    rota: '/crm/dashboard',
    tipo: 'painel'
  },
  {
    id: 'crm-dashboard-gerencial',
    arquivo: 'src/modules/crm/pages/CrmDashboardGerencial.jsx',
    rota: '/crm/dashboard-gerencial',
    tipo: 'painel'
  },
  {
    id: 'crm-dashboard-sla',
    arquivo: 'src/modules/crm/pages/CrmDashboardSla.jsx',
    rota: '/crm/dashboard-sla',
    tipo: 'painel'
  },
  {
    id: 'crm-dashboard-distribuicao',
    arquivo: 'src/modules/crm/pages/CrmDashboardDistribuicao.jsx',
    rota: '/crm/dashboard-distribuicao',
    tipo: 'painel'
  },
  {
    id: 'crm-relatorio-executivo',
    arquivo: 'src/pages/CrmRelatorioExecutivo.jsx',
    rota: '/crm/relatorios/executivo',
    tipo: 'painel'
  },
  {
    id: 'crm-leads',
    arquivo: 'src/modules/crm/pages/CrmLeads.jsx',
    rota: '/crm/leads',
    tipo: 'listagem'
  },
  {
    id: 'crm-novo-lead',
    arquivo: 'src/modules/crm/pages/CrmNovoLead.jsx',
    rota: '/crm/leads/novo',
    tipo: 'form',
    cadastroInline: "a rota existe PARA cadastrar lead — tirando o formulario nao sobra tela (R9 revista em 04/09)"
  },
  {
    id: 'crm-lead-detalhe',
    arquivo: 'src/modules/crm/pages/CrmLeadDetalhe.jsx',
    resolver: 'crmLeadDetalhe',
    tipo: 'detalhe'
  },
  {
    id: 'crm-carteira',
    arquivo: 'src/modules/crm/pages/CrmCarteira.jsx',
    rota: '/crm/carteira',
    tipo: 'listagem'
  },
  {
    id: 'crm-kanban',
    arquivo: 'src/modules/crm/pages/CrmKanban.jsx',
    rota: '/crm/kanban',
    tipo: 'listagem'
  },
  {
    id: 'crm-tarefas',
    arquivo: 'src/modules/crm/pages/CrmTarefas.jsx',
    rota: '/crm/tarefas',
    tipo: 'listagem'
  },
  {
    id: 'crm-inbox',
    arquivo: 'src/modules/crm/pages/CrmInbox.jsx',
    rota: '/crm/inbox',
    tipo: 'mista'
  },
  {
    id: 'crm-automacoes',
    arquivo: 'src/modules/crm/pages/CrmAutomacoes.jsx',
    rota: '/crm/automacoes',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA cadastrar regra de automacao (R9 revista em 04/09)"
  },
  {
    id: 'crm-admin-canais',
    arquivo: 'src/modules/crm/pages/CrmAdminCanais.jsx',
    rota: '/crm/admin/canais',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA cadastrar canal (R9 revista em 04/09)"
  },
  {
    id: 'crm-admin-numeros',
    arquivo: 'src/modules/crm/pages/CrmAdminNumeros.jsx',
    rota: '/crm/admin/numeros',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA cadastrar numero (R9 revista em 04/09)"
  },
  {
    id: 'crm-admin-integracoes',
    arquivo: 'src/modules/crm/pages/CrmAdminIntegracoes.jsx',
    rota: '/crm/admin/integracoes',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA configurar a integracao (R9 revista em 04/09)"
  },
  // ---- Rodada 5: relatorios de Compras, cadastros de Compras, SST e Solicitacoes (05/09) ----
  {
    id: 'compras-rel-categorias-insumos',
    arquivo: 'src/pages/ComprasRelatorioCategoriasInsumos.jsx',
    rota: '/compras/relatorios/categorias-insumos',
    tipo: 'painel'
  },
  {
    id: 'compras-rel-ciclo',
    arquivo: 'src/pages/ComprasRelatorioCiclo.jsx',
    rota: '/compras/relatorios/ciclo',
    tipo: 'painel'
  },
  {
    id: 'compras-rel-compras-diretas',
    arquivo: 'src/pages/ComprasRelatorioComprasDiretas.jsx',
    rota: '/compras/relatorios/compras-diretas',
    tipo: 'painel'
  },
  {
    id: 'compras-rel-compras-fornecedor',
    arquivo: 'src/pages/ComprasRelatorioComprasFornecedor.jsx',
    rota: '/compras/relatorios/compras-fornecedor',
    tipo: 'painel'
  },
  {
    id: 'compras-rel-demanda-pedidos',
    arquivo: 'src/pages/ComprasRelatorioDemandaPedidos.jsx',
    rota: '/compras/relatorios/demanda-pedidos',
    tipo: 'painel'
  },
  {
    id: 'compras-rel-economia-cotacoes',
    arquivo: 'src/pages/ComprasRelatorioEconomiaCotacoes.jsx',
    rota: '/compras/relatorios/economia-cotacoes',
    tipo: 'painel'
  },
  {
    id: 'compras-rel-evolucao',
    arquivo: 'src/pages/ComprasRelatorioEvolucao.jsx',
    rota: '/compras/relatorios/evolucao',
    tipo: 'painel'
  },
  {
    id: 'compras-rel-fornecedores',
    arquivo: 'src/pages/ComprasRelatorioFornecedores.jsx',
    rota: '/compras/relatorios/fornecedores',
    tipo: 'painel'
  },
  {
    id: 'compras-rel-pendencias-cotacoes',
    arquivo: 'src/pages/ComprasRelatorioPendenciasCotacoes.jsx',
    rota: '/compras/relatorios/pendencias-cotacoes',
    tipo: 'painel'
  },
  {
    id: 'compras-rel-precos-insumos',
    arquivo: 'src/pages/ComprasRelatorioPrecosInsumos.jsx',
    rota: '/compras/relatorios/precos-insumos',
    tipo: 'painel'
  },
  {
    id: 'gestao-categorias',
    arquivo: 'src/modules/solicitacao-compra/pages/GestaoCategorias.jsx',
    rota: '/gestao-categorias',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA cadastrar categoria de insumo (R9 revista em 04/09)"
  },
  {
    id: 'gestao-unidades',
    arquivo: 'src/modules/solicitacao-compra/pages/GestaoUnidades.jsx',
    rota: '/gestao-unidades',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA cadastrar unidade de medida (R9 revista em 04/09)"
  },
  {
    id: 'gestao-apropriacoes',
    arquivo: 'src/modules/solicitacao-compra/pages/GestaoApropriacoes.jsx',
    rota: '/gestao-apropriacoes',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA cadastrar apropriacao (R9 revista em 04/09)"
  },
  {
    id: 'sst-dashboard',
    arquivo: 'src/modules/sst/pages/SstDashboard.jsx',
    rota: '/sst',
    tipo: 'painel'
  },
  {
    id: 'sst-rel-operacional',
    arquivo: 'src/modules/sst/pages/SstRelatorioOperacional.jsx',
    rota: '/sst/relatorios/operacional',
    tipo: 'painel'
  },
  {
    id: 'sst-executivo',
    arquivo: 'src/modules/sst/pages/SstExecutivo.jsx',
    rota: '/sst/relatorios/executivo',
    tipo: 'painel'
  },
  {
    id: 'sst-centro-operacional',
    arquivo: 'src/modules/sst/pages/SstCentroOperacional.jsx',
    rota: '/sst/relatorios/centro-operacional',
    tipo: 'painel'
  },
  {
    id: 'sst-heatmap',
    arquivo: 'src/modules/sst/pages/SstHeatmap.jsx',
    rota: '/sst/relatorios/heatmap',
    tipo: 'painel'
  },
  {
    id: 'sst-observabilidade',
    arquivo: 'src/modules/sst/pages/SstObservabilidade.jsx',
    rota: '/sst/observabilidade',
    tipo: 'painel'
  },
  {
    id: 'sst-producao',
    arquivo: 'src/modules/sst/pages/SstProducaoMonitoramento.jsx',
    rota: '/sst/producao',
    tipo: 'painel'
  },
  {
    id: 'sst-observabilidade-avancada',
    arquivo: 'src/modules/sst/pages/SstObservabilidadeAvancada.jsx',
    rota: '/sst/observabilidade-avancada',
    tipo: 'painel'
  },
  {
    id: 'sst-timeline',
    arquivo: 'src/modules/sst/pages/SstTimeline.jsx',
    rota: '/sst/timeline',
    tipo: 'listagem'
  },
  {
    id: 'sst-esocial',
    arquivo: 'src/modules/sst/pages/SstEsocial.jsx',
    rota: '/sst/esocial',
    tipo: 'listagem'
  },
  {
    id: 'sst-configuracoes',
    arquivo: 'src/modules/sst/pages/SstConfiguracoes.jsx',
    rota: '/sst/configuracoes',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA configurar o modulo (R9 revista em 04/09)"
  },
  {
    id: 'sst-crud',
    arquivo: 'src/modules/sst/pages/SstCrudPage.jsx',
    // /sst/colaboradores e escondido pelo modo simplificado — eu tinha apontado
    // o harness para um recurso que a configuracao nao mostra. /sst/pgr esta na
    // lista visivel e exercita a MESMA tela (SstCrudPage e uma so, por recurso).
    rota: '/sst/pgr',
    tipo: 'listagem'
  },
  {
    id: 'solicitacoes',
    arquivo: 'src/pages/Solicitacoes/index.jsx',
    rota: '/solicitacoes',
    tipo: 'listagem'
  },
  {
    id: 'nova-solicitacao',
    arquivo: 'src/pages/NovaSolicitacao.jsx',
    rota: '/nova-solicitacao',
    tipo: 'form',
    cadastroInline: "a rota existe PARA abrir solicitacao — tirando o formulario nao sobra tela (R9 revista em 04/09)"
  },
  // ---- Rodada 6: Fiscal, Provisionamento, Governanca e Custos&Recebiveis (05/09) ----
  {
    id: 'fiscal-dashboard',
    arquivo: 'src/modules/fiscal/pages/FiscalDashboard.jsx',
    rota: '/fiscal',
    tipo: 'painel'
  },
  {
    id: 'fiscal-documentos',
    arquivo: 'src/modules/fiscal/pages/FiscalDocuments.jsx',
    rota: '/fiscal/documentos',
    tipo: 'listagem'
  },
  {
    id: 'fiscal-documento-detalhe',
    arquivo: 'src/modules/fiscal/pages/FiscalDocumentDetail.jsx',
    resolver: 'fiscalDocumentoDetalhe',
    tipo: 'detalhe'
  },
  {
    id: 'fiscal-divergencias',
    arquivo: 'src/modules/fiscal/pages/FiscalDivergences.jsx',
    rota: '/fiscal/divergencias',
    tipo: 'listagem'
  },
  {
    id: 'fiscal-empresas',
    arquivo: 'src/modules/fiscal/pages/FiscalCompanies.jsx',
    rota: '/fiscal/empresas',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA cadastrar empresa e certificado (R9 revista em 04/09)"
  },
  {
    id: 'fiscal-rel-operacional',
    arquivo: 'src/modules/fiscal/pages/FiscalOperationalReport.jsx',
    rota: '/fiscal/relatorios/operacional',
    tipo: 'painel'
  },
  {
    id: 'fiscal-logs',
    arquivo: 'src/modules/fiscal/pages/FiscalLogs.jsx',
    rota: '/fiscal/logs',
    tipo: 'listagem'
  },
  {
    id: 'fiscal-diagnostico',
    arquivo: 'src/modules/fiscal/pages/FiscalDiagnostics.jsx',
    rota: '/fiscal/diagnostico',
    tipo: 'painel'
  },
  {
    id: 'fiscal-exportacao-contabil',
    arquivo: 'src/modules/fiscal/pages/FiscalAccountingBatches.jsx',
    rota: '/fiscal/exportacao-contabil',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA montar o lote contabil (R9 revista em 04/09)"
  },
  {
    id: 'provisoes',
    arquivo: 'src/modules/provisionamento-financeiro/pages/ProvisionamentosFinanceiros.jsx',
    rota: '/provisoes-financeiras',
    tipo: 'listagem'
  },
  {
    id: 'provisoes-dashboard',
    arquivo: 'src/modules/provisionamento-financeiro/pages/DashboardProvisionamentoFinanceiro.jsx',
    rota: '/provisoes-financeiras/dashboard',
    tipo: 'painel'
  },
  {
    id: 'provisoes-rel-operacional',
    arquivo: 'src/modules/provisionamento-financeiro/pages/ProvisionamentoRelatorioOperacional.jsx',
    rota: '/provisoes-financeiras/relatorios/operacional',
    tipo: 'painel'
  },
  {
    id: 'provisao-detalhe',
    arquivo: 'src/modules/provisionamento-financeiro/pages/ProvisionamentoFinanceiroDetalhe.jsx',
    resolver: 'provisaoDetalhe',
    tipo: 'detalhe'
  },
  {
    id: 'provisao-nova',
    arquivo: 'src/modules/provisionamento-financeiro/pages/NovaProvisaoFinanceira.jsx',
    rota: '/provisoes-financeiras/nova',
    tipo: 'form',
    cadastroInline: "a rota existe PARA cadastrar provisao (R9 revista em 04/09)"
  },
  {
    id: 'provisoes-categorias-macro',
    arquivo: 'src/modules/provisionamento-financeiro/pages/GestaoCategoriasMacro.jsx',
    rota: '/provisoes-financeiras/categorias',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA cadastrar categoria macro (R9 revista em 04/09)"
  },
  {
    id: 'governanca-sistema',
    arquivo: 'src/modules/governanca/pages/GovernancaSistema.jsx',
    rota: '/governanca',
    tipo: 'painel'
  },
  {
    id: 'governanca-auditoria',
    arquivo: 'src/modules/governanca/pages/AuditoriaOperacional.jsx',
    rota: '/governanca/auditoria-operacional',
    tipo: 'listagem'
  },
  {
    id: 'custos-recebiveis',
    arquivo: 'src/modules/custosRecebiveis/pages/CustosRecebiveis.jsx',
    rota: '/custos-recebiveis',
    tipo: 'mista'
  },
  {
    id: 'solicitacao-detalhe',
    arquivo: 'src/pages/SolicitacaoDetalhe/index.jsx',
    resolver: 'solicitacaoDetalhe',
    tipo: 'detalhe'
  },
  // ---- Rodada 7 (final): nucleo de Compras, relatorios restantes e avulsas (05/09) ----
  {
    /*
      A TELA QUE TODO MUNDO VE PRIMEIRO, E QUE PASSOU 200 TELAS INVISIVEL.

      `/` e servida pelo HomeHub, nao pelo Dashboard. Ele nunca foi migrado e
      nunca entrou neste manifesto: a minha varredura de "telas pendentes"
      procurava por padrao de nome de arquivo (`*Page`, `pages/*`) e o HomeHub
      mora em `src/navigation/`. Filtro de nome nao e inventario — foi assim
      que a PRIMEIRA tela do sistema ficou de fora da refatoracao inteira.
    */
    id: 'inicio',
    arquivo: 'src/navigation/HomeHub.jsx',
    rota: '/',
    tipo: 'painel'
  },
  {
    id: 'dashboard',
    arquivo: 'src/pages/Dashboard.jsx',
    // ERRO MEU, pego pela matriz (05/09): declarei a rota como `/`, que e
    // servida pelo HomeHub — nao pelo Dashboard. A matriz mediu o HomeHub e
    // reportou as falhas dele como se fossem do Dashboard, que esta migrado.
    // Apontar o harness para a tela errada e a terceira vez nesta leva
    // (antes: /sst/colaboradores, escondido pelo modo simplificado).
    rota: '/dashboard',
    tipo: 'painel'
  },
  {
    id: 'treinamento',
    arquivo: 'src/pages/Treinamento.jsx',
    rota: '/treinamento',
    tipo: 'listagem',
    cadastroInline: "\"Novo guia\" abre o formulario na propria tela: o guia e escrito ali, com o conteudo a vista. Tirando o formulario sobra a lista, mas escrever um guia num modal seria redigir texto longo numa caixa (R9 revista em 04/09)"
  },
  {
    id: 'prioridades-diretoria',
    arquivo: 'src/pages/PrioridadesDiretoria.jsx',
    rota: '/prioridades-diretoria',
    tipo: 'listagem'
  },
  {
    id: 'perfil',
    arquivo: 'src/pages/Perfil.jsx',
    rota: '/perfil',
    tipo: 'form',
    naoAplica: {
      // A C3 pede seta de voltar em tela de DETALHE DE REGISTRO — a seta
      // existe para devolver a pessoa ao registro-pai. O perfil nao tem
      // pai: chega-se por ele pelo menu do usuario, de qualquer tela. Uma
      // seta ali teria de inventar um destino.
      C3: 'tela do proprio usuario, alcancada pelo menu de qualquer lugar — nao ha registro-pai a que voltar'
    }
  },
  {
    id: 'arquivos-modelos',
    arquivo: 'src/pages/ArquivosModelos.jsx',
    rota: '/arquivos-modelos',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA cadastrar arquivo modelo (R9 revista em 04/09)"
  },
  {
    id: 'solicitacoes-rel-operacional',
    arquivo: 'src/pages/SolicitacoesRelatorioOperacional.jsx',
    rota: '/solicitacoes/relatorios/operacional',
    tipo: 'painel'
  },
  {
    id: 'contratos-rel-operacional',
    arquivo: 'src/pages/ContratosRelatorioOperacional.jsx',
    rota: '/contratos/relatorios/operacional',
    tipo: 'painel'
  },
  {
    id: 'comercial-rel-operacional',
    arquivo: 'src/pages/ComercialRelatorioOperacional.jsx',
    rota: '/comercial/relatorios/operacional',
    tipo: 'painel'
  },
  {
    id: 'solicitacoes-compra',
    arquivo: 'src/modules/solicitacao-compra/pages/SolicitacoesCompra.jsx',
    rota: '/solicitacoes-compra',
    tipo: 'listagem'
  },
  {
    id: 'cotacoes',
    arquivo: 'src/modules/solicitacao-compra/pages/ListaCotacoes.jsx',
    rota: '/cotacoes',
    tipo: 'listagem'
  },
  {
    id: 'pedidos-compra',
    arquivo: 'src/modules/solicitacao-compra/pages/PedidosCompra.jsx',
    rota: '/pedidos-compra',
    tipo: 'listagem'
  },
  {
    id: 'compras-delegacao',
    arquivo: 'src/modules/solicitacao-compra/pages/ComprasDelegacao.jsx',
    rota: '/compras/delegacao',
    tipo: 'painel'
  },
  {
    id: 'gestao-fornecedores',
    arquivo: 'src/modules/solicitacao-compra/pages/GestaoFornecedores.jsx',
    rota: '/gestao-fornecedores',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA cadastrar fornecedor (R9 revista em 04/09)"
  },
  {
    id: 'gestao-insumos',
    arquivo: 'src/modules/solicitacao-compra/pages/GestaoInsumos.jsx',
    rota: '/gestao-insumos',
    tipo: 'mista',
    cadastroInline: "a tela existe PARA cadastrar insumo (R9 revista em 04/09)"
  },
  {
    id: 'nova-solicitacao-compra',
    arquivo: 'src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx',
    rota: '/solicitacoes-compra/nova',
    tipo: 'form',
    cadastroInline: "a rota existe PARA abrir solicitacao de compra — tirando o formulario nao sobra tela (R9)"
  },
  {
    id: 'nova-compra-direta',
    arquivo: 'src/modules/solicitacao-compra/pages/NovaCompraDireta.jsx',
    rota: '/solicitacoes-compra-direta/nova',
    tipo: 'form',
    cadastroInline: "mesma tela do pai com a flag modoCompraDireta; a rota existe PARA cadastrar (R9)"
  },
  {
    id: 'revisar-solicitacao-compra',
    arquivo: 'src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompra.jsx',
    rota: '/solicitacoes-compra/revisar',
    tipo: 'detalhe',
    naoAlcancavel: {
      destino: '/solicitacoes-compra/nova',
      motivo: 'etapa de fluxo: os dados vêm do rascunho que a tela "nova" grava no NAVEGADOR, não do servidor — sem rascunho a tela devolve a pessoa para a "nova", que é o comportamento certo. Não é medida por URL porque o passo seguinte dela CRIA a solicitação no ambiente compartilhado, e esta bateria clica em botões'
    }
  },
  {
    id: 'revisar-compra-direta',
    arquivo: 'src/modules/solicitacao-compra/pages/RevisarCompraDireta.jsx',
    rota: '/solicitacoes-compra-direta/revisar',
    tipo: 'detalhe',
    naoAlcancavel: {
      destino: '/solicitacoes-compra-direta/nova',
      motivo: 'mesma coisa da revisão de solicitação: o rascunho da compra direta vive no navegador e o passo seguinte CRIA a compra no ambiente compartilhado'
    }
  },
  {
    id: 'solicitacao-compra-detalhe',
    arquivo: 'src/modules/solicitacao-compra/pages/SolicitacaoCompraDetalheView.jsx',
    resolver: 'solicitacaoCompraDetalhe',
    tipo: 'detalhe'
  },
  /*
    ---- Rodada 8 (05/09): as QUATRO rotas que ninguem media ----

    Sairam do trinco de cobertura depois que ele parou de contar caminho
    errado como rota nao medida. Nao sao sobras de nenhuma rodada: sao telas
    com rota no App.jsx que nunca estiveram em nenhuma das duas listas —
    entre elas o detalhe do PEDIDO DE COMPRA, com 2859 linhas, que e onde a
    compra vira compromisso de pagamento.
  */
  {
    id: 'hub-modulo',
    arquivo: 'src/navigation/ModuleHub.jsx',
    rota: '/hub/compras',
    tipo: 'painel'
  },
  {
    id: 'solicitacoes-arquivadas',
    arquivo: 'src/pages/SolicitacoesArquivadas.jsx',
    rota: '/solicitacoes-arquivadas',
    tipo: 'listagem',
    /*
      A BASE DO PREVIEW NAO TEM SOLICITACAO ARQUIVADA (05/09, medido na
      captura: "0 solicitacao(oes)" na faixa e "Nenhum registro para os
      filtros atuais" na tabela).

      As dimensoes de filtro desta listagem saem dos REGISTROS carregados —
      sem registro, nao ha opcao para marcar, e a tela diz isso a pessoa com
      todas as letras. Nao e filtro quebrado: e falta de dado. O F3 so
      aceita esta declaracao se encontrar a frase na tela (`data-vazio`),
      entao ela nao dispensa a medicao, ela a completa.
    */
    filtroSemOpcoesNaBase: 'as dimensoes saem dos registros carregados e a base do preview nao tem nenhuma solicitacao arquivada'
  },
  {
    id: 'pedido-compra-detalhe',
    arquivo: 'src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx',
    resolver: 'pedidoCompraDetalhe',
    tipo: 'detalhe'
  },
  {
    id: 'compra-finalizada',
    arquivo: 'src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompraFinal.jsx',
    /*
      DECLAREI 'so pelo fluxo' E A MEDICAO ME DESMENTIU (05/09).

      Escrevi que esta tela so existiria depois de criar a solicitacao, e que
      chegar por URL seria impossivel. A matriz abriu /solicitacoes-compra/
      finalizada/1 sem redirecionamento nenhum e mediu a tela — a declaracao
      era uma SUPOSICAO minha sobre o guarda da rota, nao um fato. Declaracao
      que dispensa medicao tem de ser verificada como qualquer outra: esta foi
      removida assim que o preview mostrou o contrario.
    */
    rota: '/solicitacoes-compra/finalizada/1',
    /*
      E TELA DE CONFIRMACAO, NAO DE REGISTRO — e por isso nao tem seta.

      Declarei 'detalhe' e o C3 cobrou a seta de voltar, com razao dentro da
      classificacao. Mas voltar daqui seria devolver a pessoa a revisao de
      uma solicitacao que JA FOI CRIADA: o caminho de volta nao existe, e a
      tela oferece os tres caminhos para frente que fazem sentido (abrir o
      PDF, ir para as solicitacoes, comecar outra). Poe-se a seta e ela leva
      a lugar nenhum; tira-se a regra e ela para de valer para as telas de
      registro de verdade. O que estava errado era a etiqueta.
    */
    tipo: 'painel',
  },
  {
    id: 'gerenciar-cotacao',
    arquivo: 'src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx',
    resolver: 'gerenciarCotacao',
    /*
      DECLARADA COMO 'mista' ATE 05/09, E ESTAVA ERRADO.

      A tela e a gestao da cotacao DE UMA solicitacao: chega-se por
      /solicitacoes-compra/:id/cotacao, o titulo traz o codigo da
      solicitacao e a seta volta para o detalhe dela. A seta ali nao e
      redundante (R11) — ela e o caminho de volta ao registro, que o menu
      nao oferece. Com 'mista' o C3 reprovava a tela por ter a seta, e o
      conserto pela mensagem seria TIRAR a seta: deixar a pessoa sem volta
      para consertar uma classificacao minha.
    */
    tipo: 'detalhe'
  },
];

/** Itens da DoD, na ordem da matriz. */
export const ITENS_DOD = [
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6',
  'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7',
  // Leva do cabeçalho de tabela (05/09): os títulos da MESMA tabela têm de
  // assentar na mesma linha de base. Item próprio, e não um ramo da T1,
  // porque o eixo é outro (vertical), o sujeito é outro (os títulos entre
  // si, não o par th × td) e a célula da matriz precisa continuar dizendo
  // QUAL capacidade quebrou — a justificativa longa está em checks.mjs.
  'T8',
  'F1', 'F2', 'F3', 'F4',
  'B1', 'B2', 'B3', 'B4', 'B5',
  'M1', 'M2', 'M3', 'M4',
  'R1', 'R2',
  // Leva RH/DP (02/09): nenhuma caixa do navegador — aviso e confirmação
  // usam o componente do sistema.
  'R3',
  'X1', 'X2', 'X3',
  // Leva do componente (02/09): sticky sequestrado por overflow hidden e
  // acessibilidade por teclado da linha acionável.
  'R18', 'A1',
  /*
    LEVA DE PREFERÊNCIAS DO USUÁRIO (06/09) — os quatro itens que medem o
    que ESTA leva construiu.

    Os 35 acima provam, com rigor, que o que existia antes não quebrou.
    Nenhum deles olha para as quatro capacidades novas: escolher colunas,
    escolher quais filtros aparecem, recolher bloco que sobrevive ao F5 e
    camada flutuante que fecha sem perder a seleção. Sem estes quatro, a
    leva fecharia com "eu acho que funciona" — 189 linhas verdes falando
    de outra coisa.

    Eles ficam no fim da fileira de propósito: são os únicos que MEXEM em
    preferência gravada (e restauram), e a matriz lida da esquerda para a
    direita conta primeiro a regressão e depois a capacidade nova.
  */
  'P1', 'P2', 'P3', 'P4'
];
