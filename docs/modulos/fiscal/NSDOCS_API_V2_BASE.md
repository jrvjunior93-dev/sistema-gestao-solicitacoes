# NSDOCS API v2: base offline

Implementacao de 2026-10-24 na `refactor/frontend`. Etapa inicial autorizada:
dados ficticios, conector desligado por padrao e acompanhamento sem novos
bloqueios. Nenhuma credencial real foi recebida ou utilizada.

## Escopo entregue

- Configuracao local que exige ativacao explicita e restringe fixtures a
  `DEPLOYMENT_ENV=development`, com `NODE_ENV` diferente de `production`.
- Descritor puro do GET `/v2/documentos`, com origem fixa, empresa explicita,
  filtro por recebimento, status de utilizacao explicito e paginacao limitada.
- Respostas sinteticas de NF-e de materiais/equipamentos, incluindo documento
  autorizado e cancelado. Nenhum XML ficticio e apresentado como nota valida.
- Normalizacao de metadados com valores em centavos inteiros, datas verificadas,
  identidade estavel por empresa/chave e verificacao da participacao da empresa.
- Duplicatas identicas consolidadas dentro da pagina; conflito de metadados
  interrompe o processamento em vez de apagar uma mudanca de situacao fiscal.
- Gzip/deflate com limite de 1 MiB tanto no corpo recebido quanto descompactado;
  JSON, UTF-8 e respostas fora do contrato sao recusados com erros fixos.
- Diagnostico administrativo sem token, documentos, CNPJ ou dados brutos.

O conector **nao possui transporte HTTP**. Nenhuma flag libera chamadas reais.
Nao le `NSDOCS_V2_API_KEY`, nao aceita URL/client/token do usuario e nao usa
fetch, SDK, axios ou outro cliente de rede. O descritor nao tem Authorization;
e um contrato de consulta para a futura etapa de transporte, nao uma requisicao
pronta para executar com credenciais.

## Configuracao e verificacao local

Defaults documentados em `backend/.env.example`:

```dotenv
NSDOCS_V2_ENABLED=false
NSDOCS_V2_MODE=fixture
NSDOCS_V2_FIXTURES_ENABLED=false
```

O teste monta seu proprio ambiente ficticio em memoria, sem ler `.env`, e verifica
os cenarios ligado/desligado/producao/configuracao invalida. Para executar:

```bash
cd backend
npm run test:nsdocs-v2
```

Nao e necessario editar ambiente, informar chave, instalar dependencias, executar
migration, iniciar servidor nem conectar banco/S3/NSDOCS para esse teste.

A factory `createNsdocsV2Connector({ env })`, em `services/nsdocs/connector.js`,
tem apenas `diagnostics()` e `listDocuments(options)`. Fixtures exigem, juntos:

```js
const env = {
  DEPLOYMENT_ENV: 'development', NODE_ENV: 'test',
  FISCAL_MODULE_ENABLED: 'true', NSDOCS_V2_ENABLED: 'true',
  NSDOCS_V2_MODE: 'fixture', NSDOCS_V2_FIXTURES_ENABLED: 'true'
};
```

Somente o CNPJ sintetico `00000000000000` e aceito pela factory nesta etapa.
Esse identificador nao e um CNPJ valido para uma operacao fiscal real. Todas as
chaves, nomes, numeros e valores sao artificiais e nao devem ser importados no
cadastro fiscal. `persisted=false`, `real_calls=false` e
`validation_state=unverified_metadata` deixam essa fronteira explicita.

## Permissoes, historico e fronteiras

Nova rota: `GET /api/fiscal/diagnostics/nsdocs`, sob o mesmo mount Fiscal ja
autenticado, gates de modulo e `allowFiscalConfig` da rota de diagnostico existente.
Usa `canManageFiscalConfig` e `fiscal.config.manage`, preservando as excecoes
administrativas atuais. Permissao apenas para visualizar documentos nao concede
configuracao. Negacoes seguem o middleware de auditoria existente. Respostas
tem `Cache-Control: no-store`.

Nao existe endpoint novo de sincronizacao, importacao ou execucao de fixtures.
Nao foram alterados os endpoints fiscais atuais, o sync SEFAZ ou suas permissoes.
O conector nao importa models, banco, S3, pedidos, financeiro ou servicos de
historico. Nao grava nem transforma registros existentes. Repetir a leitura
ficticia nao cria registros; isto nao substitui a futura idempotencia transacional
de uma importacao persistente.

Compras continua dona dos pedidos, Financeiro dos titulos e Fiscal dos documentos.
Esta etapa nao cria/edita/cancela titulos, favorecidos, PIX, saldos, baixas,
apropriacoes, aprovacoes ou comprovantes. Nao adiciona exigencia de documento
fiscal antes do envio para autorizacao/pagamento.

## Contrato oficial e cuidados para a proxima etapa

Referencia: [documentacao oficial NSDOCS v2](https://developer.nsdocs.com.br/),
consultada em 2026-10-24. Origem do contrato: `https://api.nsdocs.com.br/v2`.
Autenticacao Bearer pertence ao futuro transporte restrito ao backend.

- `status=Pendente` e `status=Importado` indicam utilizacao no provedor, nao
  aprovacao financeira nem validade fiscal. A consulta exige escolha explicita;
  uma captura completa futura precisara considerar ambos. Nunca marcar utilizado
  via PUT automaticamente.
- `situacao` permanece separada em `fiscal_status`, inclusive quando cancelado.
  Metadados da lista nao substituem XML, protocolo, eventos e validacao fiscal.
- `quantidade` vai ate 100 e `quantidade + deslocamento` ate 2000. O normalizador
  recebe o total correspondente ao `X-Total-Registros`. Sinaliza particionamento
  ao chegar ao teto ou receber pagina curta ainda com registros anunciados;
  nao anuncia conclusao silenciosa nessas condicoes.
- O contrato de ordenacao por data nao garante snapshot estavel. Captura real
  precisara de sobreposicao controlada/reconciliacao e idempotencia entre paginas
  e execucoes, com isolamento por empresa e provedor.
- Campos nao reconhecidos sao descartados, nunca usados para modificar dados
  financeiros. Modelos diferentes de NF-e ficam separados como nao implementados;
  NFS-e/CT-e nao sao convertidos para NF-e.
- Arquivos XML/PDF, eventos, manifestacao, consultas por chave, limites de consumo,
  retentativas, rate limits, rotacao/armazenamento de chaves e homologacao de GETs
  reais ainda precisam de etapa propria. Nao presumir que uma chave de API tenha
  permissoes somente leitura: a tela apresentada nao demonstrou esse controle.

## Sequencia de evolucao

1. Homologar esta base offline no DEV, sem chave real.
2. Em tarefa autorizada separada, preparar transporte GET, segredo exclusivo do
   backend, escopo de empresa confirmado, limites de consumo, timeout e tratamento
   sanitizado de respostas/erros. DEV Fluxy nao implica sandbox da NSDOCS.
3. Captura manual de NF-e no DEV, com persistencia/auditoria/idempotencia e XML
   privado, sem agendamento nem alteracao do status utilizado no provedor.
4. Compras vincula documento a pedido e aos titulos existentes, com cobertura
   parcial, multiplos documentos e vinculo tardio, preservando baixas/historico.
5. Expandir eventos, NFS-e/CT-e e piloto operacional em acompanhamento. Servicos,
   transportes informais e compras sem nota apresentada permanecem visiveis como
   pendencias/justificativas, sem novos bloqueios nesta fase.

Nenhuma dessas etapas futuras esta ativada pelo codigo desta entrega.
