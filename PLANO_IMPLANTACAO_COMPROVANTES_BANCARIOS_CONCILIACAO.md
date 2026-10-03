# Plano de Implantacao - Comprovantes Bancarios na Conciliacao

**Status:** proposta tecnica para implantacao em copia isolada do sistema
**Objetivo:** adicionar uma terceira fonte de evidencia na conciliacao: `OFX importado -> titulo/movimento financeiro -> comprovante/extrato bancario normalizado`.
**Regra central:** o comprovante e opcional. A conciliacao atual continua funcionando mesmo sem arquivo, sem linha importada e sem confirmacao adicional.

## 1. Contexto auditado

Na auditoria de 20/08/2026 para `financeiro3@cscconstrutora.com`, foram analisadas 547 conciliacoes, totalizando R$ 1.241.688,44:

- 371 foram classificadas como `AUTO_LOTE`;
- 176 como `MANUAL_EXISTENTE`;
- nao foram encontrados vinculos sem movimento, valores divergentes, associacoes multiplas indevidas ou troca entre sugestao inicial e movimento final;
- 69 registros tinham favorecido identificavel no texto do OFX;
- 478 possuíam descricao OFX generica e exigem comprovante externo para confirmar o favorecido real;
- 452 titulos tinham vinculo formal com solicitacao e 95 eram registros historicos sem esse vinculo.

O OFX atual e suficiente para validar data, valor, conta, empresa, tipo e o movimento financeiro selecionado. Ele nao e suficiente para provar o favorecido de todos os PIX/transferencias, pois alguns bancos disponibilizam descricoes como `DEB PIX CH`, `PIX ENVIADO` ou equivalentes.

## 2. Resultado esperado

A tela de conciliacao devera permitir que o financeiro veja, na mesma linha:

| Fonte | Informacao principal | Obrigatoriedade |
|---|---|---|
| OFX | data, valor, documento e descricao do banco | ja existente |
| Sistema | movimento, titulo, credor, solicitacao e obra | ja existente |
| Comprovante/extrato padronizado | favorecido, CPF/CNPJ/chave, autenticacao, E2E/NSU e descricao original | opcional |

O operador podera comparar os tres dados e registrar uma confirmacao explicita de que o favorecido e o titulo correspondem. A ausencia do comprovante nao impedira importar OFX, sugerir movimento, confirmar conciliacao, baixar titulo ou encerrar o fluxo atual.

## 3. Fora de escopo desta primeira implantacao

- nao substituir o importador OFX atual;
- nao alterar ou estornar conciliacoes ja feitas;
- nao exigir comprovante para concluir uma conciliacao;
- nao criar baixa financeira a partir da planilha de comprovantes;
- nao fazer match automatico definitivo por nome aproximado;
- nao obrigar padronizacao manual de arquivos historicos.

## 4. Modelo padrao de importacao

### 4.1 Template canonico

O sistema deve aceitar CSV e XLSX. Cada banco pode fornecer nomes e formatos diferentes; o importador converte tudo para o modelo abaixo.

| Campo canonico | Obrigatorio no arquivo | Uso |
|---|---:|---|
| `data_movimento` | sim | data do pagamento/transferencia |
| `valor` | sim | valor absoluto; sinal ou `natureza` define entrada/saida |
| `natureza` | recomendado | `DEBITO` ou `CREDITO` |
| `descricao_original` | sim | texto integral do banco |
| `documento_referencia` | nao | numero do documento, cheque, NSU ou referencia |
| `favorecido_nome` | nao | nome exibido no comprovante |
| `favorecido_cpf_cnpj` | nao | CPF/CNPJ normalizado, somente digitos |
| `favorecido_chave_pix` | nao | chave PIX, se existir |
| `banco_favorecido` | nao | banco/destino |
| `agencia_favorecido` | nao | agencia/destino |
| `conta_favorecido` | nao | conta/destino; mascarar na tela quando aplicavel |
| `autenticacao` | nao | codigo de autenticacao/comprovante |
| `e2e_id` | nao | identificador PIX E2E, melhor chave de cruzamento |
| `id_externo` | recomendado | identificador univoco do banco |
| `data_hora_movimento` | nao | melhora cruzamentos no mesmo dia |
| `observacao` | nao | informacao complementar |

Campos obrigatorios devem permanecer somente os quatro primeiros. Caso o banco nao informe favorecido ou documento, a linha deve ser aceita e marcada como `DADOS_PARCIAIS`, sem bloquear a importacao.

### 4.2 Regras de normalizacao

- datas: aceitar `dd/MM/yyyy`, `yyyy-MM-dd` e data/hora; salvar UTC quando houver horario e `DATEONLY` quando nao houver;
- valor: aceitar notacao brasileira e internacional; salvar decimal com duas casas;
- CPF/CNPJ, chave e identificadores: manter versao original e versao normalizada para busca;
- descricoes: preservar texto original e armazenar texto normalizado apenas para comparacao;
- linhas invalidas: nao descartar silenciosamente. Exibir linha, coluna, motivo e permitir baixar relatorio de erros;
- duplicidade: usar `id_externo`/`e2e_id` quando disponivel; como fallback, usar fingerprint de conta + data + valor + documento + descricao. O mesmo arquivo deve ser idempotente por hash.

## 5. Persistencia proposta

Criar tabelas novas; nao sobrecarregar `conciliacoes_bancarias` com dados variaveis de cada banco.

### 5.1 `comprovante_bancario_importacoes`

Cabecalho da remessa importada.

- `id`, `empresa_id`, `conta_bancaria_id`, `banco_codigo`, `layout_codigo`, `layout_versao`;
- `arquivo_nome`, `arquivo_hash`, `arquivo_s3_key` opcional, `total_lidos`, `importados`, `ignorados`, `invalidos`;
- `mapeamento_snapshot` JSON, `status`, `criado_por`, timestamps e soft delete quando aplicavel.

### 5.2 `comprovante_bancario_linhas`

Representa uma transacao/comprovante normalizado.

- chaves: `id`, `importacao_id`, `empresa_id`, `conta_bancaria_id`, `linha_origem`;
- dados canonicos da secao 4.1;
- `valor`, `natureza`, `data_movimento`, `data_hora_movimento`;
- `fingerprint`, `raw_payload` JSON, `qualidade_dados` (`COMPLETO`, `PARCIAL`, `INVALIDO`);
- `criado_por`, timestamps e soft delete.

Indices recomendados: `(conta_bancaria_id, data_movimento, valor)`, `e2e_id`, `id_externo`, `favorecido_cpf_cnpj_normalizado`, `fingerprint` e `(importacao_id, linha_origem)` unico.

### 5.3 `conciliacao_bancaria_comprovantes`

Tabela de associacao e decisao humana. Evita sobrescrever a conciliacao existente e mantem candidatos/rejeicoes auditaveis.

- `id`, `conciliacao_bancaria_id`, `comprovante_bancario_linha_id`;
- `tipo_match` (`EXATO_ID`, `VALOR_DATA`, `DOCUMENTO`, `FAVORECIDO`, `MANUAL`);
- `score_match`, `status` (`CANDIDATO`, `CONFIRMADO`, `REJEITADO`, `SUBSTITUIDO`);
- `confirmado_por`, `confirmado_em`, `observacao`, timestamps.

Regra de integridade: uma linha de comprovante pode ter no maximo uma associacao `CONFIRMADO`; uma conciliacao pode ter candidatos, mas apenas um comprovante principal confirmado por vez. Garantir isto em transacao com bloqueio de linha e validacao de aplicacao, pois indice parcial nao esta disponivel no MySQL.

### 5.4 Configuracao de layouts

Usar `configuracoes_sistema` ou tabela dedicada `comprovante_bancario_layouts` para salvar mapeamentos reutilizaveis:

- banco, conta opcional, nome do layout, versao e delimitador/aba;
- campo canonico -> cabecalho ou indice da coluna;
- formato de data, formato de valor, cabecalho inicial e regras de limpeza;
- ativo, criado/atualizado por e auditoria de alteracao.

Somente FINANCEIRO autorizado ou SUPERADMIN pode criar/alterar layouts. O mapeamento usado em cada importacao deve ficar congelado no `mapeamento_snapshot`.

## 6. Fluxo de usuario

### 6.1 Importacao

1. Financeiro escolhe conta bancaria e faz upload de CSV/XLSX.
2. Sistema tenta identificar layout salvo para banco/conta; se nao encontrar, abre mapeamento de colunas.
3. Mostra preview de no minimo 20 linhas, totais, colunas reconhecidas, erros e duplicidades.
4. Operador confirma a importacao. Linhas validas sao persistidas; invalidas ficam no relatorio sem interromper as validas.
5. O arquivo e armazenado no S3 com hash e origem auditavel, seguindo o padrao de anexos existente.

### 6.2 Comparacao na conciliacao

Adicionar coluna/acao compacta **Comprovante bancario** na lista/modal de conciliacao:

- `Nao informado`: nenhum candidato encontrado ou nenhum arquivo importado;
- `Candidato`: mostra favorecido, CPF/CNPJ mascarado, valor, data e score;
- `Confirmado`: mostra favorecido, autenticacao/E2E, usuario e horario da confirmacao;
- `Divergente`: valor/data compativeis, mas favorecido ou documento conflita; exige revisao;
- `Rejeitado`: candidato avaliado e descartado, com motivo.

Na confirmacao, mostrar os tres blocos lado a lado: OFX, titulo/movimento e comprovante. A acao explicita deve ser **Confirmar comprovante e correspondencia do titulo**. Esta acao registra evidencia; nao executa nova baixa e nao muda o status financeiro alem do que a conciliacao atual ja faz.

### 6.3 Compatibilidade com o fluxo atual

- A tela e os endpoints atuais continuam aceitando conciliacao sem comprovante.
- Nenhuma coluna nova deve ser `NOT NULL` em dados existentes.
- O botao atual de confirmar conciliacao nao deve exigir confirmacao de comprovante.
- O lote automatico atual continua apenas com o criterio ja existente. O comprovante pode gerar candidato, nunca conciliacao automatica definitiva nesta fase.

## 7. Regra de matching de comprovante

Ordem de confianca sugerida:

1. `e2e_id`, autenticacao, `id_externo` ou documento exatamente igual;
2. mesma conta + mesma natureza + mesmo valor + mesma data;
3. mesma conta + valor + data proxima dentro de janela configuravel;
4. CPF/CNPJ do favorecido igual ao parceiro do titulo;
5. nome do favorecido semelhante ao parceiro do titulo;
6. descricao/documento com trecho coincidente.

O resultado deve ser apenas candidato. Se existirem dois candidatos no mesmo nivel, marcar `AMBIGUO`; se houver diferenca de valor, conta ou sinal, marcar `DIVERGENTE`. Nunca usar similaridade de nome como decisao automatica.

## 8. Seguranca, privacidade e auditoria

- Restringir importacao, visualizacao de dados sensiveis e confirmacao ao escopo FINANCEIRO e SUPERADMIN; aplicar escopo de empresa/obra ja utilizado pelo sistema.
- CPF/CNPJ, chave PIX, agencia e conta devem ser mascarados por padrao em listagens; revelar somente para permissao financeira adequada.
- Registrar em `security_event_logs`: importacao, preview, erro, exclusao logica, candidato criado, candidato rejeitado, comprovante confirmado e substituido.
- Nao permitir exclusao fisica de importacao vinculada. Usar cancelamento/soft delete com motivo.
- Armazenar arquivo original no S3 e exibir por URL assinada, sem expor caminho publico.
- Validar extensao, MIME, tamanho, planilha com formulas maliciosas e colunas inesperadas. Processar como dados, nunca executar formula de arquivo enviado.

## 9. Plano de implantacao em copia isolada

### Fase 0 - Preparacao

- Criar branch exclusiva e registrar ownership de migrations, models, service de comprovantes, controller/rotas e componentes de conciliacao.
- Levantar tres arquivos reais anonimizados: pelo menos um CSV, um XLSX e dois bancos distintos.
- Definir os primeiros layouts suportados e o responsavel financeiro por homologacao.

### Fase 1 - Base de dados e dominio

- Criar migrations idempotentes para as tres tabelas e seus indices.
- Criar models, associacoes, validadores e service transacional.
- Criar testes de duplicidade, confirmacao concorrente, soft delete e escopo empresa/conta.

### Fase 2 - Importador canonico

- Implementar parser CSV/XLSX com preview, mapeamento manual e validacao por linha.
- Implementar layouts salvos por banco/conta e snapshot na importacao.
- Implementar hash idempotente de arquivo e fingerprint de linha.
- Salvar arquivo no S3 apenas depois de validar upload e permissao.

### Fase 3 - Matching e API

- Criar endpoint de candidatos por conciliacao, sem mutacao automatica.
- Criar endpoints para confirmar, rejeitar e substituir comprovante com transacao e trilha de auditoria.
- Garantir que os endpoints atuais de conciliacao nao tenham mudanca de contrato obrigatoria.

### Fase 4 - Interface

- Adicionar a coluna compacta e o modal de comparacao tripla.
- Usar carregamento sob demanda para nao tornar a lista de conciliacoes pesada.
- Exibir estado opcional sem alertas bloqueantes; destacar apenas candidatos divergentes ou ambiguos.
- Bloquear duplo clique/envio durante importacao e confirmacao.

### Fase 5 - Homologacao

- Importar arquivos reais de dois bancos em ambiente copia.
- Conferir totais, quantidade de linhas, duplicidades e pelo menos 30 amostras por banco.
- Validar PIX, boleto, transferencia, cheque, tarifa e linhas sem favorecido.
- Testar permissao, reversao/rejeicao e historico de cada decisao.

### Fase 6 - Deploy controlado

- Publicar primeiro em `dev-v2` com migration e feature desligada/oculta por configuracao se necessario.
- Homologar com financeiro usando arquivos nao produtivos ou remessa limitada.
- Migrar para `main` somente apos aceite. A feature deve entrar vazia e opcional, sem backfill automatico.
- Monitorar logs, volume de erros por banco, candidatos ambiguos e tempo de carregamento.

## 10. Testes obrigatorios

| Categoria | Casos minimos |
|---|---|
| Importacao | CSV/XLSX, datas brasileiras, valores negativos, aba errada, cabecalho ausente, linha invalida e arquivo duplicado |
| Layout | dois bancos com nomes de coluna diferentes e mapeamento salvo por conta |
| Matching | E2E exato, valor/data exato, mais de um candidato, valor diferente, conta diferente, favorecido diferente e sem favorecido |
| Integridade | duas confirmacoes simultaneas, substituicao, rejeicao, importacao repetida e soft delete |
| Permissao | usuario sem financeiro, financeiro de outra empresa e SUPERADMIN |
| Regressao | importacao OFX, conciliacao manual, lote automatico, estorno e listagem atual sem comprovante |
| UI | tela com nenhum comprovante, candidato, confirmado, divergente e arquivo grande |

## 11. Criterios de aceite

- Todos os fluxos atuais de conciliacao funcionam quando nao existe comprovante importado.
- Um arquivo de cada banco homologado importa sem ajuste manual depois de ter layout salvo.
- A planilha mostra preview, erros por linha, totais e nao duplica remessa.
- Cada comprovante confirmado exibe favorecido, campos de prova disponiveis, usuario, data/hora e titulo relacionado.
- Um candidato ambiguo ou divergente nunca e confirmado automaticamente.
- Arquivo, mapeamento e decisao humana ficam auditaveis.
- A tela de conciliacao continua responsiva com comprovantes ausentes e com centenas de registros.

## 12. Riscos e decisoes para o agente implementador

1. **Amostras reais sao indispensaveis.** Nao criar parser fixo baseado em um unico banco; usar adaptador/mapeamento configuravel.
2. **O comprovante e evidencia, nao origem financeira.** Ele nao pode gerar titulo ou baixa nesta fase.
3. **Nao confundir solicitacao com favorecido.** Uma solicitacao pode agrupar multiplos pagamentos para parceiros distintos.
4. **Nao usar nome aproximado como automacao definitiva.** E2E, autenticacao, CPF/CNPJ e documento tem prioridade.
5. **Preservar os dados brutos.** A normalizacao ajuda o cruzamento, mas o texto original e necessario para auditoria.
6. **Implementar de modo incremental.** Primeiro importacao e confirmacao manual; depois, se homologado, aperfeicoar pontuacao e layouts.

## 13. Handoff para o proximo agente

- Comecar em uma copia isolada, sem alterar a base produtiva.
- Antes de escrever migration ou tela, confirmar com o financeiro os tres primeiros layouts de banco e obter arquivos de exemplo anonimizados.
- Implementar primeiro os contratos de dados e os testes; somente depois a tela.
- Nenhuma alteracao deve tornar o comprovante obrigatorio ou modificar conciliacoes existentes.
- Ao finalizar cada fase, registrar arquivos alterados, migrations aplicadas, testes, dados de homologacao e risco pendente em `docs/handoffs/`.
