# Fotografia de configuracoes e inventario de telas — 2026-08-28

Escopo: banco local `fluxy_main_copia`, `C:\Fluxy` somente leitura e
`C:\Users\Ricardo\Documents\Fluxy-V4`. Valores sensiveis nao foram copiados; a fotografia usa
identificador, tamanho e SHA-256 do valor efetivo.

## Configuracoes compartilhadas relevantes

| ID efetivo | Chave | Bytes | SHA-256 |
|---:|---|---:|---|
| 12 | `AREAS_OBRA_VISIVEIS` | 33 | `ABD539AEACA1BEA2BC37316A523D1BA715339206FCE33FAE6F68EC47DC666A35` |
| 848 | `PERMISSOES_AREAS_USUARIOS` | 29630 | `13F0BDD97A3C13793D272A41BD84C65DF23C7524AE884F5E9275B56F75D2CCE6` |
| 38 | `NOVA_SOLICITACAO_CAMPOS_POR_TIPO` | 4724 | `7F4C85E22A3F35F39C8C470F8BBC8E49600596FA91BBAFFB4856F1B806D19B93` |
| 39 | `NOVA_SOLICITACAO_AUTOMACAO_DESTINO` | 166 | `9B4C082B308BF60C4B064152EF3BB5C6D6156D6CB6D3C89A32E292A019DCD704` |
| 44 | `COMERCIAL_CATEGORIAS_CONTRATO_VENDA` | 2071 | `F8FF914B8057646559D6D36E1913366B0ABF00B7B54A76796636C5825DC7E3B8` |
| 104 | `CONTRATO_OBRA_CATEGORIAS_PERMITIDAS` | 28 | `8FC8813AC4539ED80ACF43D601273493EC286AE282B803734E7AEC5B7D06AE2A` |
| 563 | `FORMAS_PAGAMENTO_MEDICAO` | 13 | `F66284BB276D1670594D8DDEEBBCA3EAC7B1953E9E5C65F675990FE59ABB170F` |
| 829 | `CONTRATO_ADITIVO_TIPO_SOLICITACAO` | 2 | `86E50149658661312A9E0B35558D84F6C6D3DA797F552A9657FE0558CA40CDEF` |

Foram encontradas 36 chaves efetivas em `configuracoes_sistema`; oito pertencem diretamente aos
fluxos desta matriz.

### Valores resolvidos pelos servicos

- limite juridico do contrato: R$ 50.000,00, usando o padrao de codigo porque a chave ainda nao foi
  gravada;
- Despesa Eventual: R$ 5.000,00 por solicitacao e R$ 30.000,00 por obra, ambos usando o padrao de
  codigo porque as chaves ainda nao foram gravadas;
- formas de pagamento: configuracao em modo `todas`, resolvendo nove cadastros ativos — Boleto,
  Cartao de credito, Cartao de debito, Cheque, Dinheiro, FOPAG, Outros, Pix e Transferencia bancaria.

Na migracao para producao, a ausencia das tres chaves de limite preserva estes padroes. Se o
superadmin gravar valores na tela, a linha efetiva do ambiente de producao passa a prevalecer.

## Inventario de telas e componentes Fluxy x V4

O inventario foi gerado com `rg --files` em `frontend/src/pages` e `frontend/src/modules`:

- `C:\Fluxy`: 243 arquivos;
- Fluxy-V4: 260 arquivos;
- 18 caminhos presentes apenas na V4, dos quais 17 sao codigo funcional e um e copia `.orig` sem
  rota/importacao;
- um componente antigo ausente na V4: `SolicitacaoDetalhe/Anexos.jsx`, cuja exibicao foi integrada
  ao detalhe atual e permanece coberta pelos casos de anexos, comentarios, medicao e contratos.

Classificacao dos 17 caminhos funcionais novos:

| Grupo da matriz | Caminhos novos classificados |
|---|---|
| Compras/catalogacao | `ItemCompraExpansivel.jsx`, `TratamentoItemManual.jsx` |
| Recarga de cartao | `CartoesRecarga.jsx`, `RecargaCartaoDetalhe.jsx` |
| Contratos/medicao | `ConfiguracoesContratoAlertasEFormas.jsx`, `ContratoFluxoNovo.jsx`, `ContratoObraCategorias.jsx`, `AcoesContrato.jsx`, `AditivosDoContrato.jsx`, `ApropriacoesDoContrato.jsx`, `ModalMedicao.jsx`, `PrevisoesContrato.jsx` |
| ADM/Locacao | `ObraTipoApropriacao.jsx` |
| Retorno por setor | `RetornoSolicitacaoBar.jsx` |
| RH/DP | `RhDpJornada.jsx`, `RhDpPessoal.jsx`, `RhDpPessoalSolicitacoes.jsx` |

O arquivo `SolicitacaoDetalhe/FinanceiroCard.jsx.orig` nao e tela nem dependencia de runtime e foi
excluido da contagem funcional. Nao foi removido nesta auditoria porque o worktree e compartilhado
e ha outros artefatos `.orig` pertencentes a trabalhos paralelos.

Conclusao: toda diferenca funcional de tela encontrada esta associada a um bloco/caso desta matriz;
nao foi encontrada tela nova sem classificacao.
