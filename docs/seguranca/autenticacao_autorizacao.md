# Seguranca - Autenticacao e Autorizacao

## Autenticacao

- JWT com expiracao configuravel;
- login protegido por rate limit;
- MFA e controles de sessao sao aplicados pelo backend quando configurados.

## Principio de autorizacao

A autorizacao efetiva combina modulo habilitado, perfil, permissoes granulares, capacidades de setor, escopo de obra e acesso ao recurso. O frontend usa as mesmas informacoes para navegacao e visibilidade, mas somente o backend autoriza a operacao.

## Perfis

Os perfis centrais aceitos pela importacao de usuarios sao `USUARIO`, `ESTAGIARIO`, `ADMIN`, `ADMINISTRADOR` e `SUPERADMIN`.

- `SUPERADMIN`: excecao tecnica ampla; por padrao pode atravessar o bloqueio de modulo em rotas autenticadas. Rotas publicas sensiveis podem desativar expressamente esse bypass.
- `ADMINISTRADOR`: junto com `SUPERADMIN`, forma o conceito `BusinessAdmin` e ignora a matriz granular de areas. Nao recebe automaticamente o bypass de modulo reservado ao `SUPERADMIN`.
- `ADMIN`: nao e administrador global; suas excecoes dependem de permissoes e capacidades do setor, como `eh_setor_geo`.
- `USUARIO` e `ESTAGIARIO`: seguem permissoes e escopos atribuídos.

O codigo ainda reconhece perfis especializados em fluxos especificos, como `FINANCEIRO`, `ADMIN_CRM`, `GESTOR_COMERCIAL`, `COORDENADOR_CRM` e `DIRETORIA`. Eles sao compatibilidades de dominio, nao substituem a matriz central e nao devem ser generalizados sem revisar cadastro, importacao, sessao e todos os consumidores.

## Camadas de decisao

1. Modulo habilitado
   - configuracao `MODULOS_HABILITADOS`;
   - middleware `requireEnabledModule` no backend;
   - `hasEnabledModule` no frontend;
   - dependencias entre modulos sao aplicadas pelo catalogo.

2. Perfil e permissao de area
   - registro central em `backend/src/constants/moduloPermissoes.js`;
   - estado atualizado em 2026-09-10: 19 grupos, 100 areas e 349 permissoes;
   - formato `modulo.area.acao`, por exemplo `financeiro.titulos.criar`;
   - configuracao `PERMISSOES_AREAS_USUARIOS` contem permissoes por usuario, bloqueios por usuario e padroes por setor/perfil;
   - a permissao efetiva e a uniao de padrao do setor/perfil, sessao e concessao individual, menos os bloqueios;
   - sem permissoes configuradas, o backend preserva o acesso legado permitido pelo perfil e setor;
   - com permissoes configuradas, a chave explicita governa os fluxos que usam a matriz.

3. Compatibilidades especificas
   - `USUARIOS_ACESSO_FINANCEIRO` libera acesso financeiro adicional;
   - perfil ou capacidade do setor financeiro tambem podem conceder acesso quando a matriz nao esta configurada;
   - `USUARIOS_PERMISSOES_RH_DP` permanece como fallback granular de RH/DP quando nao ha matriz central configurada.

4. Escopo do recurso
   - setor principal e setores adicionais;
   - obra e configuracao de acesso a todas as obras;
   - autoria, atribuicao, diretoria e historico do fluxo;
   - middlewares de recurso revalidam o registro solicitado, inclusive Compras, Pedidos e Contratos.

## Objeto de sessao

Campos relevantes entregues ao frontend:

- `perfil`;
- `modulos_habilitados`;
- `financeiro_liberado`;
- `rh_dp_capacidades`;
- `areas_permissoes`;
- setor principal, setores/vinculos adicionais e escopos de obra quando aplicaveis.

Lista vazia de `areas_permissoes` representa compatibilidade sem restricao granular, nao negacao total. Uma chave desconhecida de modulo tambem possui fallback permissivo; consulte `../arquitetura/visao_geral.md` antes de criar ou renomear modulos.

Excecao segura para modulo novo: `CUSTOS_RECEBIVEIS` nao usa esse fallback legado.
Seu backend resolve as concessoes explicitas diretamente da matriz central, aplica os
bloqueios individuais e concede bypass somente a `SUPERADMIN`. Sem
`custos_recebiveis.modulo.acessar`, o acesso permanece negado.
