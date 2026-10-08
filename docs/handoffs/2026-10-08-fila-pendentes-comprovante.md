# Fila: baixa sem PDF e comprovante posterior

## Pedido e impacto

Usuario autorizou o card Pendentes de comprovante apos Pendentes, baixa
regular sem PDF, commit/push na refactor/frontend e comandos para EC2 dev.
Inclui a entrega local anterior de LOTE-ID/PWA compacto. Main e producao
nao estao autorizadas; nenhum banco real foi alterado ou deploy executado.

Mapeados listagem, contadores, validator, baixa atomica, idempotencia,
instrumentos/faturas/cheques, anexos individuais e importador PDF. Regras de
caixa, escopo e permissoes existentes preservadas. Pendencia de comprovante
e virtual e exige movimento registrado; nao altera status financeiro.

## Implementacao

- pagamentoFilaComprovanteDomain centraliza recorte e elegibilidade de anexo.
- pagamentoManualFilaService lista/conta pendencias, remove exigencia de PDF
  na baixa regular, aceita primeiro PDF tardio e informa pendencias na resposta.
- pagamentoComprovantePdfService inclui baixados sem PDF e preserva dados
  financeiros ao anexar depois; valores pagos aparecem no preview.
- paymentValidators aceita apenas na consulta o filtro virtual.
- FinanceiroFilaPagamentos mostra sexto card, aviso e upload posterior;
  pagamentos baixados nao sao selecionaveis para baixa nem editaveis.
- Adicao do usuario: InstrumentoPagamentoFila move cheque proprio para
  OverlayModal com confirmar/cancelar/Escape, rascunho isolado e campos
  compartilhados. Trocar forma limpa a conta (inclusive com conta ja salva
  na linha); escolher cartao mantem derivacao da conta vinculada. Acoes sob
  o titulo usam icones com nomes acessiveis, sem alterar destinos/guardas.
- Tests backend offline, SQL MySQL sem transporte e UI real com APIs
  simuladas cobrem filtro, replay, duplicados e anexo sem nova baixa.

A aprovacao de valores acima do saldo continua exigindo comprovante.
Pendentes de comprovante pode sobrepor os cards Baixados/Divergentes.
Nao houve migration ou seed. outputs/ permanece fora do Git.

## Validacao e proximo passo

Backend: test:fila-instrumentos e test:fila-comprovante-pendente aprovados.
Frontend: test:fila-instrumentos-ui aprovado, incluindo baixa sem PDF,
card/URL, upload, permissoes readonly e rolagem limitada a tabela mobile.
Tambem cobre modal de cheque com confirmar/cancelar/Escape e payload
preservado, limpeza da conta, icones/link e abertura real do modal de arquivos.
Captura do modal: outputs/fila-cheque-modal-mobile.png, nao versionar.
Capturas em outputs/fila-comprovante-*.png; nao versionar.
Build, docs, navegacao/abas e testes de PWA/tela inicial/convergencia aprovados.
Capturas dos cards claro/escuro inspecionadas; testes usam APIs/sessao simuladas,
nao substituem homologacao financeira externa. Avisos preexistentes de
Browserslist antigo e chunk acima de 500 kB permanecem.

Depois do push, atualizar somente backend-dev pelo checkout dev e executar
preflight:schema. Nao rodar migration automaticamente. Homologar PDFs reais,
pagamento parcial, credito/fatura, importacao posterior e PWA Android/iOS.
Nao reiniciar backend-solicitacoes nesta atualizacao.
