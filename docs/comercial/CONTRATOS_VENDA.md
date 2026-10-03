# Contratos de venda comercial

## Fluxo oficial

1. Cadastre ou atualize o cliente, incluindo conjuge quando houver.
2. Cadastre o empreendimento com a obra vinculada.
3. Cadastre a unidade com metragem privativa, fracao ideal e situacao disponivel.
4. Cadastre os modelos do empreendimento:
   - Contrato padrao
   - Quadro Resumo
5. Crie o contrato de venda.
6. Gere o PDF completo em `Comercial > Contratos`.
7. Envie para D4Sign somente depois de conferir o PDF.

O PDF oficial e sempre gerado com o Quadro Resumo primeiro e o Contrato Padrao na sequencia.

## Campos automaticos do Quadro Resumo

- Comprador: dados do parceiro cliente.
- Conjuge: dados do parceiro vinculado ao cliente.
- Unidade: codigo, nome, torre, pavimento, metragem privativa e fracao ideal; no item III o nome e o numero da unidade entram no formato `Nome: Numero`.
- Garagem: quantidade e posicao, quando informadas no contrato.
- Preco: valor total, entrada, desconto e indice de reajuste.
- Parcelas: agrupadas por elemento, periodicidade e tipo de reajuste, com `F` para fixa e `R` para reajustavel.
- Corretor: parceiro corretor vinculado ao contrato, com CPF e CRECI rotulados no item VI.b.
- Item XI: local e data de assinatura preenchidos pelo contrato.
- Item XII e assinaturas do Contrato/Memorial: assinatura da incorporadora traz nome, CNPJ e representante legal quando o modelo informa esses dados; comprador, conjuge e testemunhas entram pelo cadastro do contrato.

## Regras finais antes de producao

- Contrato assinado digitalmente nao deve ser gerado novamente.
- Contrato nao assinado pode gerar novo PDF completo.
- O sistema valida que o PDF final contem paginas do Quadro Resumo e do Contrato Padrao.
- A tela exibe somente PDF completo, Abrir PDF e Enviar D4Sign para evitar confusao com documentos parciais.

## Checklist por empreendimento

Para cada empreendimento, testar:

- Piemonte
- Areia Preta
- Pedra Menina
- Residencial Costa do Mar

Conferir no PDF:

- Quadro Resumo vem antes do Contrato Padrao.
- Papel/modelo corresponde ao empreendimento.
- Item III exibe unidade, area privativa, fracao ideal e vagas.
- Item VI agrupa corretamente as parcelas.
- Item XI exibe local e data corretos.
- Item XII possui incorporadora com representante legal, comprador/conjuge e testemunhas, sem assinatura do corretor.

## Carga inicial dos modelos oficiais

Os arquivos da pasta `Contratos/` nao entram no cadastro apenas por existirem no repositorio. Em
cada ambiente, depois que os empreendimentos estiverem cadastrados, execute a partir da raiz:

```bash
node backend/scripts/dados/configurarModelosContratosComerciais.js
```

O carregador e idempotente: mantem um modelo oficial ja cadastrado com o mesmo nome e nao substitui
outro modelo ativo por engano. A opcao `--replace` so deve ser usada depois de revisar o modelo que
sera desativado. Empreendimentos ausentes sao informados e ficam pendentes ate o cadastro existir.

O servidor que gera o PDF precisa do LibreOffice. Quando `soffice` nao estiver no `PATH`, configure
`LIBREOFFICE_BIN` com o caminho absoluto do executavel antes de iniciar ou reiniciar o backend.
