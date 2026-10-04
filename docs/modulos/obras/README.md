# Modulo OBRAS

## Papel e propriedade

Obras e dono do cadastro da obra, classificacao, dimensoes financeiras da obra e apropriacoes. Apropriacao e uma estrutura de classificacao de custo compartilhada; nao pertence a Compras nem ao Financeiro.

## Regras

- obra deve estar vinculada a empresa e aos usuarios autorizados;
- responsavel tecnico e uma informacao cadastral textual; usuarios com acesso sao
  vinculos separados e podem ser multiplos;
- classificacao publica/privada pode determinar diretoria de aprovacao;
- apropriacoes usadas por outros modulos nao podem ser removidas fisicamente;
- rateios precisam referenciar apropriacoes analiticas ativas da mesma obra;
- em Solicitacoes/Financeiro, rateio percentual fecha 100% ou o rateio por valor fecha o total; em Compras, a soma das quantidades apropriadas fecha a quantidade do item;
- o orcamento de custo do Resultado de Obras usa a referencia efetiva e a margem cadastrada; nao inferir margem nem criar referencia fora das fontes aprovadas abaixo;
- para obra publica, a Planilha geral cadastrada tem prioridade; quando ausente ou zero, a referencia financeira exibida e a soma de `valor_orcado` das apropriacoes analiticas ativas, sem linhas somadoras; o campo cadastral nao e preenchido automaticamente;
- para obra privada, o VGV cadastrado tem prioridade; quando ausente ou zero, a referencia e a soma dos valores base das unidades ativas nao excluidas. Unidades sem valor nao entram na soma e o VGV e sinalizado como parcial; sem valores conhecidos, a referencia permanece zero;
- card do cadastro, Resultado de Obras e Painel do Gestor devem consumir a mesma referencia efetiva. Volume/orcamento usam azul, executado/gasto vermelho, recebido verde, pendencias ambar e lucro/prejuizo conforme o sinal; com o olho fechado, nenhuma cor deve revelar valor;
- custo realizado vem de movimentos financeiros ativos;
- previsto vem de titulos em aberto ou parciais;
- estornos financeiros devem refletir imediatamente no resultado da obra;
- pedidos representam compromisso operacional e nao substituem realizado financeiro.
- novas obras classificadas como `OBRA` recebem, na mesma transacao da criacao, as apropriacoes analiticas `1 — ADM LOCAL DE OBRA`, `2 — LOCAÇÃO DE MAQ. e EQ.` e `3 — PRÉ-OBRA`, todas ativas, sem apropriacao pai e com valor orcado inicial zero;
- cada apropriacao automatica e vinculada ao tipo de solicitacao correspondente por `codigo_interno`: `ADM_LOCAL_DE_OBRA`, `LOCACAO_DE_MAQ_EQ` e `PRE_OBRA`;
- o tipo `PRE_OBRA` precisa existir e estar ativo antes da criacao da obra. Seu nome visivel pode ser alterado, mas o `codigo_interno` deve permanecer `PRE_OBRA` para preservar o vinculo automatico;
- a pagina `Apropriacao padrao por obra` exibe `PRE_OBRA` junto de `ADM_LOCAL_DE_OBRA` e `LOCACAO_DE_MAQ_EQ`, permitindo definir ou corrigir qual apropriacao corresponde a cada etapa em cada obra, inclusive nas obras anteriores a esta automacao;
- centros de custo do tipo `CENTRO_CUSTO` nao recebem essas apropriacoes automaticas.

## Cadastro originado por solicitacao

Uma obra pode nascer do fluxo `CADASTRO DE OBRA` sem existir como origem da solicitacao.
A solicitacao preserva tipo, fase, valor, responsavel tecnico, endereco, usuarios e
documentos. O modal definitivo reutiliza esses dados e exige apenas o complemento
operacional que ainda faltar.

Regras:

- uma solicitacao gera no maximo uma obra;
- criacao e vinculos de acesso ocorrem na mesma transacao;
- repetir a requisicao nao duplica obra;
- `OBRA_INICIADA` exige planilha orcamentaria;
- `PRE_OBRA` pode nascer com pendencia documental, regularizada antes da mudanca de fase;
- documentos permanecem consultaveis durante o ciclo de vida;
- solicitacoes e obras antigas nao sao classificadas por migration/backfill automatico.

## Consumidores

- Solicitacoes usa obra, classificacao e apropriacao principal;
- Compras usa apropriacao por item;
- Financeiro classifica titulos e movimentos;
- Provisionamento projeta desembolsos;
- Contratos vincula contexto operacional;
- RH/DP e SST usam lotacao/local de trabalho.

## Riscos de alteracao

Trocar IDs, regras de classificacao, margem, valor de referencia ou formula de orcamento afeta diretorias, rateios, relatorios, DRE e Resultado de Obras. Toda mudanca exige reconciliar valores antes/depois e testar registros sem apropriacao legados.

## Exclusao e auditoria

Obra ou apropriacao referenciada deve ser inativada. Ajustes de orcamento, margem, classificacao e importacoes de custo precisam registrar usuario, origem e valores anteriores.
