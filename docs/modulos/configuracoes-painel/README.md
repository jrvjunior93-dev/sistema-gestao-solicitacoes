# Configuracoes e Painel

## Configuracoes

Configuracoes e o dominio administrativo das chaves de runtime persistidas, modulos habilitados, permissoes, setores, tipos, status e regras parametrizaveis. Alteracoes precisam de validacao de schema, auditoria e recarregamento controlado.

Modulos obrigatorios nao podem ser desabilitados. Dependencias (`requiresAll` e `requiresAny`) devem ser aplicadas no backend. Permissoes vazias por compatibilidade precisam ser tratadas conforme a regra vigente, sem ampliar acesso por erro de serializacao.

## Painel

O Painel agrega indicadores e atalhos. Ele nao e fonte de verdade e nao pode implementar calculos diferentes dos services de relatorio. Cards, filtros e totais devem respeitar modulos habilitados, permissoes e escopo.

O Painel do Gestor possui tres visoes principais: Resultado de Obras, Custos e
Recebiveis e Saldos. Preferencias de Modo TV e ordenacao sao gravadas por usuario e,
quando aplicavel, por aba.

O olho de privacidade usa PIN unico de quatro digitos armazenado como hash em
`configuracoes_sistema`. Quando fechado, endpoints do painel retornam valores nulos,
`Cache-Control: no-store` e bloqueiam gravacao de saldo. O PIN e uma protecao visual
adicional; nao substitui login, MFA, permissao ou escopo. Tentativas possuem rate limit
e eventos de seguranca.

## Mudanca segura

Testar sessao renovada, habilitacao/desabilitacao, menu, rotas backend, permissoes,
filtros, totais, preferencias, Modo TV, ordenacao, olho aberto/fechado, rate limit do
PIN e comportamento quando um modulo dependente estiver indisponivel.
