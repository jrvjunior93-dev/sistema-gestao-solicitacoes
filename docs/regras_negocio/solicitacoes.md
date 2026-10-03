# Regras de Negocio - Solicitacoes

Este documento consolida as regras da V1 que devem continuar existindo na V2 do FLUXY.

## Principios

- Solicitacoes continua sendo o hub operacional entre obras, setores, financeiro, contratos e compras.
- O backend e a autoridade das regras. A interface apenas orienta o usuario.
- A V2 deve manter compatibilidade com regras usadas em producao na V1.
- Novos modulos podem estar desabilitados por instalacao sem quebrar o fluxo base de solicitacoes.

## Criacao de solicitacao

Toda solicitacao deve ter:

- obra ou centro de custo vinculado;
- area responsavel inicial definida pelo backend;
- tipo de solicitacao;
- valor e vencimento quando aplicavel;
- parceiro/credor quando a solicitacao precisar gerar titulo financeiro.

Quando os modulos `CONTRATOS` ou `OBRAS` estiverem desabilitados, os campos dependentes desses modulos ficam ocultos e deixam de ser obrigatorios.

## Destino inicial

A tela `Nova Solicitacao` nao oferece escolha de area responsavel. Toda solicitacao aberta por essa entrada nasce em `GEO`, com status `PENDENTE`. O backend resolve o setor pela capacidade `eh_setor_geo`; valores de `area_responsavel` enviados pelo navegador sao ignorados.

Depois da criacao, `area_responsavel` continua sendo usada para:

- controlar fila, permissao de interacao, retorno e movimentacao;
- aplicar regras operacionais e modo de recebimento do setor atual;
- registrar historico e destinatarios de notificacao.

## Tipo de solicitacao por Obra/Centro de Custo

O catalogo exibido depende primeiro do cadastro selecionado:

- registros classificados como `OBRA` compartilham os tipos marcados como disponiveis para todas as Obras;
- registros classificados como `CENTRO_CUSTO` usam somente vinculos administrativos explicitos;
- Centro de Custo sem vinculo nao herda todos os tipos e nao pode abrir solicitacao;
- subtipo ativo herda o mesmo escopo do tipo macro;
- ao mudar Obra/Centro de Custo, a tela recarrega o catalogo e limpa tipo/subtipo incompatível;
- o backend repete a validacao para impedir criacao por payload manual.

`Tipos por Setor (Recebimento)` permanece existente, mas sua responsabilidade e posterior a criacao: define quais tipos o setor recebe e se a notificacao inicial vai primeiro ao administrador ou a todos. Essa configuracao nao define mais o catalogo da Nova Solicitacao.

Tipos macro sao cadastrados globalmente. A configuracao `Tipos por Obra/Centro de Custo` define a disponibilidade de abertura.

## Encaminhamento direto e legado de diretoria

O fluxo vigente para novos registros nao possui aprovacao intermediaria por diretoria.

Fluxo oficial:

1. Usuario cria a solicitacao.
2. Usuario seleciona a Obra/Centro de Custo e um tipo permitido naquele catalogo.
3. O backend valida tipo, Obra/Centro de Custo e permissao.
4. A solicitacao nasce em `GEO / PENDENTE`.
5. `fluxo_aprovacao_diretoria` e gravado como `false`, e `diretoria_fluxo_codigo` e `setor_destino_pos_aprovacao` ficam nulos.

Os campos, regras de leitura e o endpoint de aprovacao por diretoria permanecem apenas para processar solicitacoes antigas que ja estejam formalmente marcadas com `fluxo_aprovacao_diretoria = true`. Compatibilidade de legado nao autoriza o frontend ou outro modulo a criar novos registros nesse fluxo.

## Prioridades da diretoria

A regra de prioridades da V1 foi mantida na V2.

Objetivo:

- permitir que a diretoria organize solicitacoes em lotes de prioridade;
- separar por classificacao de obra/diretoria;
- registrar solicitacoes priorizadas antes de enviar adiante.

Regras:

- usuario da diretoria cria lote;
- o lote lista solicitacoes elegiveis daquela diretoria;
- solicitacoes podem ser incluidas no lote;
- lote finalizado vira registro historico;
- lote aberto pode ser cancelado ou excluido conforme permissao.

## Usuarios com multiplos setores

A V2 mantem suporte a usuarios vinculados a mais de um setor.

Uso esperado:

- usuarios que atuam em mais de uma diretoria;
- usuarios administrativos com visibilidade operacional ampliada;
- regras de prioridade e aprovacao que dependem de pertencer a determinado setor.

O setor principal do usuario continua existindo, mas a tabela de vinculos complementares deve ser considerada nas regras de permissao.

## Envio livre entre setores

Por padrao, usuario comum so envia solicitacoes dentro das regras do proprio setor.

Excecoes:

- `SUPERADMIN`;
- usuario marcado com permissao `pode_enviar_qualquer_setor`.

Essa permissao deve ser concedida com cuidado, pois permite transitar solicitacoes fora da regra normal de origem/destino.

## Tipos compartilhados entre setores

A V2 mantem a configuracao de compartilhamento de tipos entre setores.

Uso esperado:

- permitir que um setor visualize ou utilize tipos de outro setor quando houver regra operacional definida;
- evitar duplicacao de tipos apenas para atender excecoes.

Essa configuracao deve ficar sob controle administrativo.

## Automacao por status

A V2 mantem a regra de automacao por status da V1.

Uso esperado:

- quando uma solicitacao chegar a determinado status em um setor, o sistema pode envia-la automaticamente para outro setor configurado;
- a automacao deve registrar historico da movimentacao;
- a automacao nao deve ignorar validacoes criticas de permissao ou consistencia.

## Pagamentos parciais na solicitacao

A V2 mantem registro de pagamentos vinculados a solicitacao.

Campos de leitura esperados:

- valor total;
- valor pago acumulado;
- saldo;
- historico de pagamentos.

Regras:

- pagamentos nao devem apagar o valor original da solicitacao;
- cada pagamento precisa de usuario, data e valor;
- o detalhe da solicitacao deve mostrar o resumo financeiro;
- a informacao serve para controle operacional e conciliacao com o financeiro.

## Modularidade com contratos e obras

Contratos:

- se `CONTRATOS` estiver ativo, campos contratuais podem aparecer;
- se estiver inativo, campos contratuais ficam ocultos e nao sao obrigatorios.

Obras/apropriacoes:

- apropriacao pertence ao dominio de `OBRAS`;
- solicitacoes podem consumir apropriacao quando `OBRAS` estiver ativo;
- compras e financeiro tambem podem consumir apropriacao, mas nao sao donos desse cadastro.

## Regras por setor preservadas

- Edicao de numero de pedido continua restrita ao setor/regra configurada.
- Status exibido e alteravel segue regra por setor.
- Usuarios assumem solicitacoes conforme setor/permissao.
- Setor `OBRA` permanece com restricoes especificas quando configurado.
- Backend decide visibilidade e acoes disponiveis.

## Configuracoes administrativas adicionadas/recuperadas

As seguintes telas/configuracoes fazem parte da operacao atual ou da compatibilidade V1 -> V2:

- `Prioridades Diretoria`;
- `Tipos Compartilhados`;
- `Automacao por Status`;
- `Envio Livre por Usuario`.

## Cuidados de implantacao da V2

Antes de subir em producao:

- aplicar migrations em copia/staging do banco de producao;
- revisar o catalogo comum de Obras;
- configurar explicitamente os tipos de cada Centro de Custo;
- revisar tipos por setor apenas quanto ao recebimento e notificacoes;
- revisar usuarios com multiplos setores;
- revisar usuarios com envio livre entre setores;
- testar criacao em `GEO / PENDENTE` e rejeicao de tipo fora do catalogo;
- testar leitura e conclusao segura de registros antigos ainda marcados com fluxo de diretoria;
- testar automacao por status;
- testar pagamentos parciais;
- forcar novo login dos usuarios apos deploy para renovar permissoes de sessao.
