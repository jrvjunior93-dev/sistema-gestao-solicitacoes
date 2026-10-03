# Permissoes granulares: auditoria, catalogo e deploy

Data da auditoria: 27/08/2026.

## Resultado

- Registro central: 19 modulos e 338 chaves, sem duplicidade e sem chave malformada.
- Politica ativa: 282 chaves. As outras 56 pertencem aos fluxos SST ocultos/desativados pelo modo simplificado.
- Entre as 282 chaves ativas: nenhuma ficou somente no frontend e nenhuma ficou sem uso operacional detectavel.
- Configuracao local auditada: registro `PERMISSOES_AREAS_USUARIOS` id 848, 67 usuarios ativos e nenhuma chave desconhecida.
- A auditoria foi somente de leitura. Nenhuma permissao do banco foi alterada.

O comando reproduzivel e:

```powershell
cd backend
node scripts/auditarPermissoesGranulares.js --db
```

## Semantica corrigida

Existem agora tres estados distintos:

1. `SUPERADMIN` ou `ADMINISTRADOR`: bypass administrativo total.
2. Usuario sem configuracao individual/padrao: compatibilidade legada, mantendo as regras antigas.
3. Usuario com matriz configurada: somente as permissoes efetivas concedidas.

Uma lista vazia explicitamente configurada passou a significar **nenhuma permissao**. Antes, lista vazia e ausencia de configuracao eram confundidas; remover a ultima permissao podia devolver acesso legado irrestrito.

O frontend recebe `areas_permissoes_configuradas` da sessao e aplica a mesma distincao do backend. A tela de permissoes identifica usuarios em modo `legado` e oferece o botao **Ativar matriz granular**.

Perfil `ADMIN` nao tem bypass. Ele precisa de matriz como qualquer usuario operacional. Apenas `SUPERADMIN` e `ADMINISTRADOR` possuem bypass.

Setores de Obra continuam recebendo implicitamente `solicitacoes.lista.visualizar_minhas`, conforme regra anterior.

## Correcoes funcionais

| Area | Permissao | Efeito apos a correcao |
|---|---|---|
| Solicitacoes | `solicitacoes.lista.visualizar_todas` | Abre lista, resumo e detalhe de qualquer obra. Nao concede interacao nem escrita fora do setor/obra. |
| Solicitacoes | `solicitacoes.acoes.aprovar` | Passou a controlar a aprovacao generica por diretoria para usuarios com matriz configurada. |
| Solicitacoes | `solicitacoes.acoes.alterar_valor` | Frontend e backend usam a mesma verificacao explicita. |
| Solicitacoes | `solicitacoes.acoes.alterar_data_vencimento` | Frontend e backend usam a mesma verificacao explicita. |
| Solicitacoes | `solicitacoes.acoes.alterar_status_qualquer_setor` | Backend usa a verificacao central, sem ler o array da sessao manualmente. |
| Compras | `compras.pedidos.anexar_espelho` | Separada de criar/aprovar pedido; controla o botao e o endpoint do espelho, sem exigir permissao de frete. Para abrir o pedido, combinar com `compras.pedidos.visualizar` e com o escopo de compras adequado (`compras.escopo.minhas_atribuidas`, `compras.escopo.setor` ou `compras.escopo.todas`). |
| Obras | `obras.cadastro.visualizar` | Controla o acesso a tela de cadastro. A listagem operacional compartilhada de obras continua disponivel aos fluxos que precisam dela. |
| Obras | `obras.cadastro.gerenciar` | Controla criar, editar, ativar e desativar obra no frontend e backend. |
| Obras | `obras.gestao.visualizar` | Controla os endpoints e a tela de Gestao de Obras. |
| Obras | `obras.gestao.apropriacoes` | Controla a edicao de orcamento/apropriacoes na Gestao de Obras. |
| Biblioteca | `biblioteca.geral.visualizar` | Controla contexto, lista, link e download. |
| Biblioteca | `biblioteca.geral.gerenciar` | Controla upload e exclusao, ainda respeitando a lista de uploaders por pagina. |
| Comunicacao | `comunicacao.geral.visualizar` | Permite ler conversas e operar estado pessoal de leitura/arquivo. |
| Comunicacao | `comunicacao.geral.enviar` | Controla todos os pontos de entrada de escrita, inclusive `+ Nova`, criar/responder, participantes, concluir/reabrir e editar/excluir mensagens. O frontend vira somente leitura sem esta chave e o backend recusa escrita com 403. |

## O que configurar em producao

Nao existe migration para esta entrega. A configuracao `PERMISSOES_AREAS_USUARIOS` existente e preservada.

Para cada usuario que ja possui matriz, confirme somente as funcoes que ele realmente exerce:

- consulta global de solicitacoes: `solicitacoes.lista.visualizar_todas`;
- aprovacao generica de solicitacao pela diretoria: `solicitacoes.acoes.aprovar`;
- alterar valor/vencimento/status fora da regra normal: as tres chaves especificas de `solicitacoes.acoes`;
- anexar espelho de pedido: `compras.pedidos.anexar_espelho`;
- cadastrar obras: `obras.cadastro.visualizar` e, para escrita, `obras.cadastro.gerenciar`;
- consultar Gestao de Obras: `obras.gestao.visualizar`; para editar orcamento/apropriacoes, tambem `obras.gestao.apropriacoes`;
- Biblioteca: `biblioteca.geral.visualizar`; para upload/exclusao, tambem `biblioteca.geral.gerenciar`;
- Comunicacao: `comunicacao.geral.visualizar`; para enviar/alterar mensagens, tambem `comunicacao.geral.enviar`.

No banco local, tres usuarios ativos ainda estao em compatibilidade legada irrestrita e precisam de decisao individual antes da migracao:

- id 8, Renan Leal, `ADMIN/JURIDICO`;
- id 19, Jose Ricardo, `ADMIN/BRAPE`;
- id 32, Fisco CSC, `ADMIN/FISCAL`.

Na producao, execute a auditoria para obter a lista real daquele banco. Para cada usuario listado como legado:

1. abra **Configuracoes > Permissoes de Areas por Usuario**;
2. selecione o usuario;
3. clique **Ativar matriz granular**;
4. marque somente as funcoes necessarias;
5. salve;
6. nunca deixe tudo desmarcado, a menos que a intencao seja bloquear todas as areas granulares.

Usuarios ja configurados nao precisam ser recriados e nao perdem suas chaves existentes. Depois do deploy conjunto, recarregue a aplicacao para renovar `/auth/me` e receber o indicador de matriz configurada.

## Ordem do deploy

1. Publicar backend e frontend da mesma versao.
2. Nao executar migration: esta entrega nao possui alteracao de schema.
3. Reiniciar apenas o processo do ambiente correto.
4. Recarregar as sessoes dos usuarios.
5. Executar `node scripts/auditarPermissoesGranulares.js --db`.
6. Confirmar que ha zero chave desconhecida, zero risco somente-frontend e revisar a lista de usuarios legados.
7. Fazer smoke com um usuario configurado: rota permitida retorna 200; acao nao concedida retorna 403 e o botao nao aparece.

## Separacoes catalogadas para uma segunda etapa

Estas chaves ainda sao deliberadamente amplas. Nao foram divididas nesta entrega porque criar novas chaves sem definir os titulares em producao causaria bloqueios silenciosos:

- `solicitacoes.acoes.aprovar`: separar aprovar de rejeitar;
- `comunicacao.geral.enviar`: separar enviar, editar/excluir mensagem, gerenciar participantes e concluir/reabrir;
- `biblioteca.geral.gerenciar`: separar upload de exclusao;
- `obras.gestao.apropriacoes`: separar edicao manual de importacao em massa; importacao permanece administrativa;
- `compras.solicitacoes.gerenciar`: separar comentario, encaminhamento e geracao de pedido quando a hierarquia atual for revista;
- `compras.pedidos.criar`/`aprovar`: revisar herancas sobre edicao, cancelamento, remanejamento e frete;
- `configuracoes.geral.gerenciar`: hoje funciona como chave guarda-chuva das areas de configuracao;
- `contratos.geral.editar`: separar dados cadastrais, anexos e operacoes de fluxo.

Antes de criar essas novas chaves, deve ser aprovada uma matriz nominal informando quais usuarios recebem cada acao.
