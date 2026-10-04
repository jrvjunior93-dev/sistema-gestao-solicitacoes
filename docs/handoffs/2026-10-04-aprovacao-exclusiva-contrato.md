# Aprovacao exclusiva do contrato novo - 04/10/2026

## Contexto

Na solicitacao propria de um contrato do fluxo novo, a acao generica
`Aprovar solicitacao` aparecia junto da acao `Aprovar` no card do contrato.
A primeira apenas aplicava a regra de aprovacao por tipo (status e setor), sem
validar categoria financeira, ativar contrato ou criar titulos. Isso podia
produzir um estado de solicitacao aprovado com contrato ainda aguardando
aprovacao.

## Arquivos alterados

- `backend/src/services/solicitacao/aprovacaoTipoConfig.js`: identifica apenas
  a solicitacao propria de um contrato `fluxo_novo`, sem atingir medicoes ou
  aditivos legados que referenciem o contrato.
- `backend/src/controllers/SolicitacaoController.js`: desativa a acao generica
  no detalhe e rejeita o endpoint generico com HTTP 409 antes de qualquer
  mutacao para esse fluxo.
- `frontend/src/pages/SolicitacaoDetalhe/index.jsx`: omite a acao generica
  quando o backend identifica o fluxo ou quando o card contratual foi carregado.
- `backend/scripts/validarAprovacaoExclusivaContrato.js` e
  `backend/package.json`: teste local sem consulta ao banco.
- `backend/src/services/contratoFluxoNovoService.js`: contrato novo de uma obra,
  ao ficar ATIVO, direciona a solicitacao a OBRA independentemente do setor
  de quem a criou. A transicao gera o historico de envio ja existente.
- `backend/scripts/validarRetornoContratoAprovadoObra.js`: verifica o retorno
  para OBRA nos caminhos direto e posterior ao Juridico, inclusive quando o
  autor esta no GEO ou nao esta disponivel. Centro de custo preserva a regra
  anterior.
- `docs/workspace/OWNERSHIP_ATIVO.md`: reserva temporaria desta tarefa.

## Validacoes

- `npm run test:contrato-aprovacao-exclusiva`: passou, sem acesso ao banco.
- `npm run test:contratos-operacional`: passou.
- `npm run test:contrato-retorno-obra`: passou, sem acesso ao banco.
- `npm run build` em `frontend/`: passou, com avisos preexistentes de
  Browserslist e tamanho de chunks.
- `node --check` nos arquivos backend alterados e `git diff --check`: passaram.

## Roteamento e risco residual

Por decisao do proprietario, somente o contrato novo de destino classificado
como OBRA passa a retornar para o setor OBRA ao ficar ATIVO; o setor de quem
criou deixa de determinar esta etapa. A ida ao Juridico acima do limite e as
etapas de rejeicao/assinatura permanecem como antes, bem como o fallback para
CENTRO_CUSTO. O ajuste nao reencaminha automaticamente solicitacoes ja ativas
em producao, como o caso relatado. Nao houve escrita em banco, migration,
reinicio ou deploy.

## Proximo passo

Revisar o diff e, mediante pedido de promocao, integrar as alteracoes na
branch pretendida. Validar em ambiente de ensaio os dois lados do limite:
o botao generico oculto e a rota rejeitando a chamada direta, a aprovacao no
card gerando categoria/titulos, e o destino final em OBRA para contratos de
obra. Para eventual correcao de um registro ja aprovado em producao, primeiro
fazer diagnostico somente de leitura e obter autorizacao especifica;
nao corrigir a linha diretamente no banco.
