# Handoff — troca rápida de usuários exclusiva de desenvolvimento

Data: 14/09/2026

## Objetivo

Permitir que um SUPERADMIN do ambiente de desenvolvimento valide rapidamente como telas,
solicitações, permissões e ações são apresentadas a usuários predefinidos, sem conhecer ou
alterar suas senhas. O recurso não pode operar em produção.

## Implementação

- nova página **Configurações → Usuários para Teste Rápido**, limitada a 20 usuários ativos
  que não sejam SUPERADMIN;
- seletor compacto no topo para assumir um usuário, trocar diretamente entre os usuários
  configurados e retornar ao SUPERADMIN;
- a sessão assumida usa setor, perfil e permissões reais do usuário escolhido;
- MFA e a pendência obrigatória do SUPERADMIN são verificados antes de iniciar a troca;
- alteração da versão de sessão, inativação ou perda do perfil SUPERADMIN do ator original
  revoga imediatamente a sessão de teste;
- ações continuam registradas no usuário simulado e recebem na auditoria os campos
  `actor_id`, `target_id` e `dev_user_switch` para identificar o SUPERADMIN real;
- logout durante o teste não revoga as sessões legítimas do usuário simulado;
- configuração persistida em `configuracoes_sistema`, chave
  `DEV_USER_SWITCH_USER_IDS`, sem migration estrutural;
- correção paralela no teste de Recarga de Cartão: `JOIN Obras`, respeitando a capitalização
  da tabela no Linux.

## Barreira de ambiente

O backend exige simultaneamente:

```text
DEPLOYMENT_ENV=development
DEV_USER_SWITCH_ENABLED=true
```

Qualquer outro valor devolve o recurso como indisponível. O frontend não decide a liberação:
ele só mostra a configuração e o seletor depois da confirmação do backend. Portanto, o mesmo
código pode existir na branch promovida sem disponibilizar a funcionalidade em produção.

## Configuração do ambiente dev

Adicionar ao `.env` usado por `backend-dev`:

```text
DEPLOYMENT_ENV=development
DEV_USER_SWITCH_ENABLED=true
```

Reiniciar exclusivamente `backend-dev` com atualização das variáveis. Não adicionar essas
duas linhas com a combinação acima ao processo `backend-solicitacoes`.

## Validações executadas

- `npm run test:dev-user-switch`: aprovado;
- `npm run test:auditoria-operacional`: aprovado;
- `npm run build` no frontend: aprovado, 430 módulos transformados;
- `node --check` nos controladores, serviços, middlewares e rotas alterados: aprovado;
- `git diff --check`: aprovado;
- `npm run test:recarga-cartao`: não executou localmente porque o workspace não possui
  credenciais do banco; deve ser repetido na EC2 dev, onde o `JOIN Obras` corrige o erro de
  capitalização observado;
- `npm run test:security-hardening`: apontou falha preexistente no teste do botão
  **Cadastros** do Financeiro, fora dos arquivos desta entrega. A troca rápida não alterou
  esse botão nem sua permissão.

## Smoke recomendado na EC2 dev

1. entrar como SUPERADMIN com MFA concluído;
2. abrir **Configurações → Usuários para Teste Rápido** e selecionar ao menos um usuário de
   GEO, um de Compras e um do Financeiro;
3. usar o seletor no topo para assumir cada perfil e confirmar menus, solicitações e botões;
4. trocar diretamente de um usuário simulado para outro;
5. usar **Voltar ao SUPERADMIN** e confirmar o retorno;
6. conferir os eventos de segurança e a auditoria operacional;
7. desabilitar temporariamente `DEV_USER_SWITCH_ENABLED`, reiniciar `backend-dev` e confirmar
   que seletor, página e sessão assumida deixam de funcionar; reabilitar depois do teste.

## Riscos e rollback

- não há migration nem alteração de senha;
- para desabilitar imediatamente, definir `DEV_USER_SWITCH_ENABLED=false` e reiniciar apenas
  `backend-dev`;
- rollback de código pode ser feito revertendo o commit desta entrega; a chave de
  configuração remanescente é inerte sem o código e sem as variáveis de ambiente.
