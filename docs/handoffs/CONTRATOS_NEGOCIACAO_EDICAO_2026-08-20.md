# Handoff - Negociacao detalhada na edicao do contrato

## Escopo

Em 20/08, foi incluido no modal `Editar contrato` da tela `/gestao-contratos` um campo para anexar
o documento da negociacao detalhada. O objetivo e permitir corrigir contratos criados sem esse
arquivo antes da aprovacao que o exige acima do limite do Juridico.

## Comportamento

- o campo aceita um arquivo `.docx` ou `.pdf`;
- o nome escolhido aparece no modal e pode ser removido ou trocado antes do envio;
- `Salvar contrato` compara o formulario com o contrato carregado;
- quando somente o documento mudou, chama apenas `POST /contratos/:id/negociacao` e nao executa
  o `PATCH /contratos/:id` cadastral;
- quando documento e dados mudaram juntos, envia primeiro o documento e depois atualiza os dados,
  preservando o anexo mesmo se a atualizacao cadastral falhar;
- a rota registra o anexo com tipo `NEGOCIACAO_DETALHADA`, portanto o documento passa a satisfazer
  a validacao usada na aprovacao;
- um novo documento substitui a negociacao detalhada anterior, conforme a regra existente;
- o botao permanece bloqueado durante atualizacao e upload, protegendo contra duplo envio;
- falhas parciais sao informadas conforme a operacao que efetivamente foi concluida, e o modal
  permanece aberto quando ainda ha dados cadastrais a salvar.

## Diagnostico do acesso de Breno

- usuario local: id `35`, Breno Lopes;
- contrato testado: id `2548`, codigo `CT-0003`, obra id `15` (FORUM CARANGOLA);
- a configuracao persistida contem `contratos.geral.visualizar`, `contratos.geral.criar` e
  `contratos.geral.editar` para o usuario;
- Breno nao possui vinculo individual em `usuarios_obras`;
- a regra granular atual considera `contratos.geral.editar` acesso global de Contratos;
- o log de seguranca registrou o 403 antes do controller, em `requireContratoAccess`, com a descricao
  `Usuario tentou acessar contrato fora do seu escopo`;
- com o codigo atual e a configuracao persistida, a avaliacao isolada de `requireContratoAccess`
  para Breno e para o contrato 2548 passou e anexou o recurso ao request;
- o modal antigo sempre executava o `PATCH` antes do upload. Por isso o 403/500 cadastral impedia
  que a tentativa chegasse ao endpoint da negociacao.

## Arquivos

- `frontend/src/pages/GestaoContratos.jsx`

O backend e `frontend/src/services/contratos.js` nao foram alterados. Foram reutilizados o endpoint,
o perfil seguro de upload e a funcao `uploadNegociacaoContrato` ja implementados pelo fluxo de
Contratos.

## Validacoes

- `npm run test:responsive`: passou, 198 rotas verificadas;
- `npm run build`: passou novamente apos o desacoplamento, 362 modulos transformados;
- verificacao direta, somente leitura, de `canAccessContratos`, `canAccessContratosGlobal` e
  `canManageContratos` para Breno: todas retornaram `true`;
- verificacao isolada, somente leitura, de `requireContratoAccess` para contrato 2548: passou;
- verificacao estatica da importacao, campo, chamada de upload e tratamento de falha parcial:
  passou;
- `git diff --check`: sem erro; apenas aviso de normalizacao futura CRLF/LF no arquivo preexistente;
- nenhuma suite que escreve no banco foi executada;
- uma tentativa de iniciar o backend foi recusada porque a porta 8100 ja havia sido ocupada por
  outra instancia; nao houve segunda instancia nem reinicio;
- nao houve acesso a GitHub, EC2 ou producao.

## Risco residual

A rota de upload ja possui testes proprios no fluxo de Medicao/Contratos, mas eles nao foram
reexecutados nesta tarefa porque escrevem no banco local compartilhado. Fazer o smoke test manual
com Breno em um contrato sem negociacao antes de publicar. O erro 401 do canal de live updates e
independente do upload e indica sessao/token ausente ou expirado naquele canal.
