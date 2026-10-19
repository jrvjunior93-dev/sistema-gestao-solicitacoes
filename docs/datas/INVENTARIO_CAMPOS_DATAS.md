# Inventario estatico dos campos de data

Gerado por `node frontend/scripts/mapearCamposDatas.mjs`. Nao altera campos ou registros.

Arquivos analisados: 1834. Erros de parser: 0. Conversoes identificadas: 2289.

- CAMPO_COMPARTILHADO: 161
- CAMPO_NATIVO: 19
- COLUNA_BANCO: 875
- CONFIGURACAO_DINAMICA_DATA: 83
- TIPO_DINAMICO_REVISAR: 14

## Cobertura e leitura

Cada linha aponta um controle, configuracao dinamica ou coluna do modelo/schema. Um controle reutilizado em uma lista pode representar varios campos em execucao. Tipos dinamicos precisam ser cruzados com suas configuracoes; nao sao automaticamente datas. Linhas de migrations sao historicas, nao colunas adicionais. Rotulos e nomes sao expressoes extraidas, nao interpretacoes de regras de negocio.

O JSON inclui todas as linhas e referencias de conversao/validacao identificadas. O levantamento nao executa imports, consultas, navegador ou migracoes. Relacoes campo -> API -> coluna precisam de revisao dos fluxos antes de uma migracao global; nao inferir que nomes iguais significam a mesma data.

## Entradas e configuracoes do frontend

| Arquivo:linha | Tipo / componente | Campo / valor | Limites / edicao segmentada |
|---|---|---|---|
| frontend/src/components/CompetenciaInputBR.jsx:107 | CAMPO_NATIVO / input | {/^\d{4}-\d{2}$/.test(String(value \|\| '')) ? value : ''} | nao declarado |
| frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx:459 | CAMPO_COMPARTILHADO / DateInputBR | {campos.vigencia_inicio} | nao declarado |
| frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx:464 | CAMPO_COMPARTILHADO / DateInputBR | {campos.vigencia_fim} | nao declarado |
| frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx:764 | CAMPO_COMPARTILHADO / DateInputBR | {p.vencimento \|\| ''} | nao declarado |
| frontend/src/components/contratos/BlocoMedicaoContrato.jsx:336 | CAMPO_COMPARTILHADO / DateInputBR | "data_inicio_medicao" | nao declarado |
| frontend/src/components/contratos/BlocoMedicaoContrato.jsx:346 | CAMPO_COMPARTILHADO / DateInputBR | "data_fim_medicao" | nao declarado |
| frontend/src/components/contratos/BlocoMedicaoContrato.jsx:470 | CAMPO_COMPARTILHADO / DateInputBR | {`vencimento_parcela_${p.id}`} | nao declarado |
| frontend/src/components/contratos/ModalAditivoContrato.jsx:543 | CAMPO_COMPARTILHADO / DateInputBR | "aditivo_nova_vigencia_fim" | {dataMinimaVigencia} / nao declarado |
| frontend/src/components/contratos/ModalAditivoContrato.jsx:647 | CAMPO_COMPARTILHADO / DateInputBR | {parcela.vencimento \|\| ''} | nao declarado |
| frontend/src/components/contratos/ReprogramarSaldoContrato.jsx:90 | CAMPO_COMPARTILHADO / DateInputBR | {l.vencimento} | nao declarado |
| frontend/src/components/financeiro/AutorizacoesPorObra.jsx:176 | CAMPO_COMPARTILHADO / DateInputBR | {rascunho.vencimento_inicio} | true |
| frontend/src/components/financeiro/AutorizacoesPorObra.jsx:177 | CAMPO_COMPARTILHADO / DateInputBR | {rascunho.vencimento_fim} | true |
| frontend/src/components/financeiro/BaixaCompostaModal.jsx:312 | CAMPO_COMPARTILHADO / DateInputBR | {dataMovimento} | nao declarado |
| frontend/src/components/financeiro/BaixaMassaFilaModal.jsx:124 | CAMPO_COMPARTILHADO / DateInputBR | {data} | nao declarado |
| frontend/src/components/financeiro/ChequePagamentoFields.jsx:46 | TIPO_DINAMICO_REVISAR / input | {field === 'titular_documento' ? maskCpfCnpj(value?.[field]) : (value?.[field] \|\| '')} | nao declarado |
| frontend/src/components/financeiro/ParcelamentoCartaoCampos.jsx:30 | CAMPO_COMPARTILHADO / DateInputBR | {config.data_compra \|\| ''} | true |
| frontend/src/components/financeiro/TituloNegociacaoModal.jsx:135 | CAMPO_COMPARTILHADO / DateInputBR | {form.primeiro} | {hoje()} / nao declarado |
| frontend/src/components/financeiro/TituloNegociacaoModal.jsx:150 | CAMPO_COMPARTILHADO / DateInputBR | {p.vencimento} | {hoje()} / nao declarado |
| frontend/src/components/financeiro/TitulosCompartilhadosModal.jsx:126 | CAMPO_COMPARTILHADO / DateInputBR | {p.data_vencimento} | nao declarado |
| frontend/src/components/lista-avancada/ListaAvancada.jsx:1285 | TIPO_DINAMICO_REVISAR / input | {dim.unico ? `filtro-${dim.id}` : undefined} | nao declarado |
| frontend/src/components/padrao/BarraFiltros.jsx:216 | CAMPO_COMPARTILHADO / DateInputBR | {campo.id} | {campo.min} / {campo.max} / nao declarado |
| frontend/src/components/padrao/BarraFiltros.jsx:229 | TIPO_DINAMICO_REVISAR / input | {campo.valor ?? ''} | {campo.min} / {campo.max} / nao declarado |
| frontend/src/components/padrao/TabelaPadrao.jsx:1444 | TIPO_DINAMICO_REVISAR / input | {selecao.unica ? `selecao:${storageKey \|\| 'tabela'}` : undefined} | nao declarado |
| frontend/src/components/recarga-cartao/RecargaCartaoFields.jsx:371 | CAMPO_COMPARTILHADO / DateInputBR | {edicao.data_vencimento} | nao declarado |
| frontend/src/components/rh/ParcelasEventoEditor.jsx:143 | CAMPO_COMPARTILHADO / CompetenciaInputBR | {valor.competencia_inicio} | nao declarado |
| frontend/src/components/rh/RhDpPagamentoModal.jsx:384 | CAMPO_NATIVO / input | {form.competencia} | nao declarado |
| frontend/src/components/rh/RhDpPagamentoModal.jsx:385 | CAMPO_NATIVO / input | {form.data_vencimento} | nao declarado |
| frontend/src/components/solicitacoes/ModalEditarDadosSolicitacao.jsx:78 | CAMPO_COMPARTILHADO / DateInputBR | {entrada} | {hojeSolicitacaoSP()} / nao declarado |
| frontend/src/modules/crm/pages/CrmLeadDetalhe.jsx:568 | CAMPO_COMPARTILHADO / DateInputBR | {form.proximo_followup_at \|\| ''} | nao declarado |
| frontend/src/modules/crm/pages/CrmLeadDetalhe.jsx:774 | CAMPO_NATIVO / input | {taskForm.due_at} | nao declarado |
| frontend/src/modules/custosRecebiveis/components/CrAuditoriaView.jsx:163 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'de', rotulo: 'De', tipo: 'date', valor: de, aoMudar: (valor) => reiniciar(() => setDe(valor \|\| '')) } |  |
| frontend/src/modules/custosRecebiveis/components/CrAuditoriaView.jsx:164 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'ate', rotulo: 'Até', tipo: 'date', valor: ate, aoMudar: (valor) => reiniciar(() => setAte(valor \|\| '')) } |  |
| frontend/src/modules/custosRecebiveis/components/CrConfiguracoesView.jsx:206 | CAMPO_NATIVO / input | {form.competencia_inicial} | {currentMonth()} / nao declarado |
| frontend/src/modules/custosRecebiveis/components/CrConfiguracoesView.jsx:220 | CAMPO_COMPARTILHADO / DateInputBR | {form.vigencia_inicio} | {today()} / nao declarado |
| frontend/src/modules/custosRecebiveis/components/CrExecutiveFilters.jsx:211 | CAMPO_NATIVO / input | {periodStart} | {periodEnd} / nao declarado |
| frontend/src/modules/custosRecebiveis/components/CrExecutiveFilters.jsx:220 | CAMPO_NATIVO / input | {periodEnd} | {periodStart} / nao declarado |
| frontend/src/modules/custosRecebiveis/components/CrExecutiveFilters.jsx:250 | CAMPO_NATIVO / input | {competenciaReferencia} | nao declarado |
| frontend/src/modules/custosRecebiveis/components/CrExportacoesView.jsx:70 | CAMPO_NATIVO / input | {competencia} | nao declarado |
| frontend/src/modules/custosRecebiveis/components/CrLiberacoesTemporarias.jsx:156 | CAMPO_NATIVO / input | {form.expira_em} | {minBypassDate()} / {maxBypassDate()} / nao declarado |
| frontend/src/modules/custosRecebiveis/components/CrPlanejamentoView.jsx:2195 | CAMPO_COMPARTILHADO / DateInputBR | {item.data_medicao \|\| ''} | nao declarado |
| frontend/src/modules/custosRecebiveis/pages/CustosRecebiveis.jsx:844 | CAMPO_NATIVO / input | {competencia} | nao declarado |
| frontend/src/modules/fiscal/pages/FiscalCompanies.jsx:535 | CAMPO_COMPARTILHADO / DateInputBR | {certificateForm.valid_from} | nao declarado |
| frontend/src/modules/fiscal/pages/FiscalCompanies.jsx:543 | CAMPO_COMPARTILHADO / DateInputBR | {certificateForm.valid_until} | nao declarado |
| frontend/src/modules/fiscal/pages/FiscalDocuments.jsx:488 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'emission_start', rotulo: 'Emissão de', tipo: 'date', valor: filters.emission_start, aoMudar: (valor) => updateFilter('emission_start', valor) } |  |
| frontend/src/modules/fiscal/pages/FiscalDocuments.jsx:489 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'emission_end', rotulo: 'Emissão até', tipo: 'date', valor: filters.emission_end, aoMudar: (valor) => updateFilter('emission_end', valor) } |  |
| frontend/src/modules/fiscal/pages/FiscalOperationalReport.jsx:406 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Data inicial', tipo: 'date', valor: filters.data_inicio, aoMudar: (valor) => updateFilter('data_inicio', valor) } |  |
| frontend/src/modules/fiscal/pages/FiscalOperationalReport.jsx:413 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Data final', tipo: 'date', valor: filters.data_fim, aoMudar: (valor) => updateFilter('data_fim', valor) } |  |
| frontend/src/modules/governanca/pages/AuditoriaOperacional.jsx:525 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'De', tipo: 'date', valor: filters.data_inicio, aoMudar: (valor) => setFilters((old) => ({ ...old, data_inicio: valor })) } |  |
| frontend/src/modules/governanca/pages/AuditoriaOperacional.jsx:532 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Até', tipo: 'date', valor: filters.data_fim, aoMudar: (valor) => setFilters((old) => ({ ...old, data_fim: valor })) } |  |
| frontend/src/modules/provisionamento-financeiro/pages/DashboardProvisionamentoFinanceiro.jsx:466 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicial', rotulo: 'Data inicial', tipo: 'date', chaveWorkspace: 'provisoes:dashboard:inicial', revisaoWorkspace: revisoesData.data_inicial \|\| 0, valor: filtros.data_inicial, aoMudar: (valor) => atualizarCampo |  |
| frontend/src/modules/provisionamento-financeiro/pages/DashboardProvisionamentoFinanceiro.jsx:475 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_final', rotulo: 'Data final', tipo: 'date', chaveWorkspace: 'provisoes:dashboard:final', revisaoWorkspace: revisoesData.data_final \|\| 0, valor: filtros.data_final, aoMudar: (valor) => atualizarCampo('data_fin |  |
| frontend/src/modules/provisionamento-financeiro/pages/NovaProvisaoFinanceira.jsx:247 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_prevista_desembolso} | nao declarado |
| frontend/src/modules/provisionamento-financeiro/pages/ProvisionamentoFinanceiroDetalhe.jsx:414 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_prevista_desembolso} | nao declarado |
| frontend/src/modules/provisionamento-financeiro/pages/ProvisionamentoRelatorioOperacional.jsx:429 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicial', rotulo: 'Data inicial', tipo: 'date', chaveWorkspace: 'provisoes:relatorio:inicial', revisaoWorkspace: revisoesData.data_inicial \|\| 0, valor: filtros.data_inicial, aoMudar: (valor) => atualizarCampo |  |
| frontend/src/modules/provisionamento-financeiro/pages/ProvisionamentoRelatorioOperacional.jsx:438 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_final', rotulo: 'Data final', tipo: 'date', chaveWorkspace: 'provisoes:relatorio:final', revisaoWorkspace: revisoesData.data_final \|\| 0, valor: filtros.data_final, aoMudar: (valor) => atualizarCampo('data_fin |  |
| frontend/src/modules/provisionamento-financeiro/pages/ProvisionamentosFinanceiros.jsx:480 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicial', chaveWorkspace: 'provisoes:lista:inicial', revisaoWorkspace: revisoesData.data_inicial \|\| 0, rotulo: 'Data inicial', tipo: 'date', valor: filtros.data_inicial, aoMudar: (valor) => atualizarFiltro('d |  |
| frontend/src/modules/provisionamento-financeiro/pages/ProvisionamentosFinanceiros.jsx:489 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_final', chaveWorkspace: 'provisoes:lista:final', revisaoWorkspace: revisoesData.data_final \|\| 0, rotulo: 'Data final', tipo: 'date', valor: filtros.data_final, aoMudar: (valor) => atualizarFiltro('data_final' |  |
| frontend/src/modules/solicitacao-compra/components/ConfirmarEntregasPedidos.jsx:39 | CAMPO_COMPARTILHADO / DateInputBR | {linha.previsao} | {linha.data_base} / nao declarado |
| frontend/src/modules/solicitacao-compra/components/PedidoCompraFinanceiro.jsx:142 | CAMPO_COMPARTILHADO / DateInputBR | {config.primeiro_vencimento} | nao declarado |
| frontend/src/modules/solicitacao-compra/components/PedidoCompraFinanceiro.jsx:155 | CAMPO_COMPARTILHADO / DateInputBR | {config.data_compra} | nao declarado |
| frontend/src/modules/solicitacao-compra/components/PedidoCompraFinanceiro.jsx:177 | CAMPO_COMPARTILHADO / DateInputBR | {parcela.data_vencimento} | nao declarado |
| frontend/src/modules/solicitacao-compra/pages/ComprasDelegacao.jsx:395 | CAMPO_COMPARTILHADO / DateInputBR | {edicao.prazo_compra \|\| ''} | nao declarado |
| frontend/src/modules/solicitacao-compra/pages/CotacaoFornecedorPublica.jsx:975 | CAMPO_COMPARTILHADO / DateInputBR | {freteDataVencimento} | nao declarado |
| frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx:584 | CAMPO_COMPARTILHADO / DateInputBR | {form.frete_data_vencimento} | nao declarado |
| frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx:2057 | CAMPO_COMPARTILHADO / DateInputBR | {necessarioPara} | nao declarado |
| frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx:2529 | CAMPO_COMPARTILHADO / DateInputBR | {freteDataVencimento} | nao declarado |
| frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx:2957 | CAMPO_COMPARTILHADO / DateInputBR | {item.necessario_para} | nao declarado |
| frontend/src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx:2705 | CAMPO_COMPARTILHADO / DateInputBR | {freteForm.data_vencimento} | nao declarado |
| frontend/src/modules/sst/constants/sstResources.js:101 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'data_inicio', label: 'Início', type: 'date', required: true } |  |
| frontend/src/modules/sst/constants/sstResources.js:102 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'data_fim', label: 'Fim', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:135 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'data_exame', label: 'Data do exame', type: 'date', required: true } |  |
| frontend/src/modules/sst/constants/sstResources.js:136 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'validade', label: 'Validade', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:155 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'data_exame', label: 'Data', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:156 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'validade', label: 'Validade', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:173 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'entrega_em', label: 'Entrega', type: 'date', required: true } |  |
| frontend/src/modules/sst/constants/sstResources.js:174 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'validade', label: 'Validade', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:191 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'data_inicio', label: 'Início', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:192 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'data_fim', label: 'Fim', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:193 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'validade', label: 'Validade', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:212 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'data_ocorrencia', label: 'Data', type: 'date', required: true } |  |
| frontend/src/modules/sst/constants/sstResources.js:308 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'prazo_limite', label: 'Prazo', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:586 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'validade', label: 'Validade', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:600 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'vigencia_inicio', label: 'Início', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:601 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'vigencia_fim', label: 'Fim', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:615 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'vigencia_inicio', label: 'Início', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:616 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'vigencia_fim', label: 'Fim', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:630 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'data_emissao', label: 'Emissão', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:631 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'vigencia_inicio', label: 'Início', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:632 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'vigencia_fim', label: 'Fim', type: 'date' } |  |
| frontend/src/modules/sst/constants/sstResources.js:657 | CONFIGURACAO_DINAMICA_DATA /  | { key: 'data_avaliacao', label: 'Data da avaliacao', type: 'date' } |  |
| frontend/src/modules/sst/pages/SstCrudPage.jsx:533 | TIPO_DINAMICO_REVISAR / input | {form[field.key] \|\| ''} | nao declarado |
| frontend/src/pages/ComercialContratos.jsx:2438 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_assinatura} | nao declarado |
| frontend/src/pages/ComercialContratos.jsx:2621 | CAMPO_COMPARTILHADO / DateInputBR | {generator.primeiro_vencimento} | nao declarado |
| frontend/src/pages/ComercialContratos.jsx:2642 | CAMPO_COMPARTILHADO / DateInputBR | {generator.primeiro_vencimento} | nao declarado |
| frontend/src/pages/ComercialContratos.jsx:2684 | CAMPO_COMPARTILHADO / DateInputBR | {item.data_vencimento} | nao declarado |
| frontend/src/pages/ComercialContratos.jsx:2816 | CAMPO_COMPARTILHADO / DateInputBR | {item.data_vencimento} | nao declarado |
| frontend/src/pages/ComercialContratos.jsx:2943 | CAMPO_COMPARTILHADO / DateInputBR | {item.data_vencimento} | nao declarado |
| frontend/src/pages/ComercialContratos.jsx:3050 | CAMPO_COMPARTILHADO / DateInputBR | {item.cheque_data_emissao \|\| ''} | nao declarado |
| frontend/src/pages/ComercialContratos.jsx:3402 | CAMPO_COMPARTILHADO / DateInputBR | {trocaForm.data_efetiva} | nao declarado |
| frontend/src/pages/ComercialContratos.jsx:3406 | CAMPO_COMPARTILHADO / DateInputBR | {trocaForm.competencia_data} | nao declarado |
| frontend/src/pages/ComercialContratos.jsx:3424 | CAMPO_COMPARTILHADO / DateInputBR | {distratoForm.data_distrato} | nao declarado |
| frontend/src/pages/ComercialContratos.jsx:3774 | CAMPO_COMPARTILHADO / DateInputBR | {pessoaRapidaForm.data_nascimento} | nao declarado |
| frontend/src/pages/ComercialContratos.jsx:3955 | CAMPO_COMPARTILHADO / DateInputBR | {pessoaRapidaForm.conjuge.data_nascimento} | nao declarado |
| frontend/src/pages/ComercialRelatorioOperacional.jsx:321 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicial', rotulo: 'Data inicial', tipo: 'date', valor: filters.data_inicial, aoMudar: (valor) => updateFilter('data_inicial', valor) } |  |
| frontend/src/pages/ComercialRelatorioOperacional.jsx:328 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_final', rotulo: 'Data final', tipo: 'date', valor: filters.data_final, aoMudar: (valor) => updateFilter('data_final', valor) } |  |
| frontend/src/pages/ComercialTabelasPreco.jsx:471 | CAMPO_COMPARTILHADO / DateInputBR | {form.vigencia_inicio} | nao declarado |
| frontend/src/pages/ComercialTabelasPreco.jsx:478 | CAMPO_COMPARTILHADO / DateInputBR | {form.vigencia_fim} | nao declarado |
| frontend/src/pages/ComercialUnidades.jsx:608 | CAMPO_COMPARTILHADO / DateInputBR | {form.reservado_ate} | nao declarado |
| frontend/src/pages/ComprasRelatorioCategoriasInsumos.jsx:283 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Pedido criado de', tipo: 'date', valor: filtros.data_inicio, aoMudar: (valor) => atualizarCampo('data_inicio', valor) } |  |
| frontend/src/pages/ComprasRelatorioCategoriasInsumos.jsx:290 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Pedido criado até', tipo: 'date', valor: filtros.data_fim, aoMudar: (valor) => atualizarCampo('data_fim', valor) } |  |
| frontend/src/pages/ComprasRelatorioCiclo.jsx:338 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Criação inicial', tipo: 'date', valor: filtros.data_inicio, aoMudar: (valor) => atualizarCampo('data_inicio', valor) } |  |
| frontend/src/pages/ComprasRelatorioCiclo.jsx:345 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Criação final', tipo: 'date', valor: filtros.data_fim, aoMudar: (valor) => atualizarCampo('data_fim', valor) } |  |
| frontend/src/pages/ComprasRelatorioComprasDiretas.jsx:359 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Criada de', tipo: 'date', valor: filtros.data_inicio, aoMudar: (valor) => atualizarCampo('data_inicio', valor) } |  |
| frontend/src/pages/ComprasRelatorioComprasDiretas.jsx:366 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Criada até', tipo: 'date', valor: filtros.data_fim, aoMudar: (valor) => atualizarCampo('data_fim', valor) } |  |
| frontend/src/pages/ComprasRelatorioComprasFornecedor.jsx:288 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Pedido criado de', tipo: 'date', valor: filtros.data_inicio, aoMudar: (valor) => mudarCampo('data_inicio', valor) } |  |
| frontend/src/pages/ComprasRelatorioComprasFornecedor.jsx:295 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Pedido criado até', tipo: 'date', valor: filtros.data_fim, aoMudar: (valor) => mudarCampo('data_fim', valor) } |  |
| frontend/src/pages/ComprasRelatorioDemandaPedidos.jsx:318 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Criação inicial', tipo: 'date', valor: filtros.data_inicio, aoMudar: (valor) => mudarCampo('data_inicio', valor) } |  |
| frontend/src/pages/ComprasRelatorioDemandaPedidos.jsx:325 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Criação final', tipo: 'date', valor: filtros.data_fim, aoMudar: (valor) => mudarCampo('data_fim', valor) } |  |
| frontend/src/pages/ComprasRelatorioEconomiaCotacoes.jsx:376 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Encerramento inicial', tipo: 'date', valor: filtros.data_inicio, aoMudar: (valor) => mudarCampo('data_inicio', valor) } |  |
| frontend/src/pages/ComprasRelatorioEconomiaCotacoes.jsx:383 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Encerramento final', tipo: 'date', valor: filtros.data_fim, aoMudar: (valor) => mudarCampo('data_fim', valor) } |  |
| frontend/src/pages/ComprasRelatorioEvolucao.jsx:283 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Pedido criado de', tipo: 'date', valor: filtros.data_inicio, aoMudar: (valor) => atualizarCampo('data_inicio', valor) } |  |
| frontend/src/pages/ComprasRelatorioEvolucao.jsx:290 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Pedido criado até', tipo: 'date', valor: filtros.data_fim, aoMudar: (valor) => atualizarCampo('data_fim', valor) } |  |
| frontend/src/pages/ComprasRelatorioFornecedores.jsx:307 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Data inicial', tipo: 'date', valor: filtros.data_inicio, aoMudar: (valor) => atualizarCampo('data_inicio', valor) } |  |
| frontend/src/pages/ComprasRelatorioFornecedores.jsx:314 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Data final', tipo: 'date', valor: filtros.data_fim, aoMudar: (valor) => atualizarCampo('data_fim', valor) } |  |
| frontend/src/pages/ComprasRelatorioPendenciasCotacoes.jsx:278 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Cotação criada de', tipo: 'date', valor: filtros.data_inicio, aoMudar: (valor) => mudarCampo('data_inicio', valor) } |  |
| frontend/src/pages/ComprasRelatorioPendenciasCotacoes.jsx:285 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Cotação criada até', tipo: 'date', valor: filtros.data_fim, aoMudar: (valor) => mudarCampo('data_fim', valor) } |  |
| frontend/src/pages/ComprasRelatorioPrecosInsumos.jsx:286 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Pedido criado de', tipo: 'date', valor: filtros.data_inicio, aoMudar: (valor) => mudarCampo('data_inicio', valor) } |  |
| frontend/src/pages/ComprasRelatorioPrecosInsumos.jsx:293 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Pedido criado até', tipo: 'date', valor: filtros.data_fim, aoMudar: (valor) => mudarCampo('data_fim', valor) } |  |
| frontend/src/pages/ContratoFluxoNovo.jsx:476 | CAMPO_COMPARTILHADO / DateInputBR | {form.primeiro_vencimento} | nao declarado |
| frontend/src/pages/ContratosRelatorioOperacional.jsx:316 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Data inicial', tipo: 'date', valor: filtros.data_inicio, aoMudar: (valor) => atualizarCampo('data_inicio', valor) } |  |
| frontend/src/pages/ContratosRelatorioOperacional.jsx:323 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Data final', tipo: 'date', valor: filtros.data_fim, aoMudar: (valor) => atualizarCampo('data_fim', valor) } |  |
| frontend/src/pages/DefinirSenha.jsx:193 | TIPO_DINAMICO_REVISAR / input | {senha} | nao declarado |
| frontend/src/pages/DefinirSenha.jsx:230 | TIPO_DINAMICO_REVISAR / input | {confirmacao} | nao declarado |
| frontend/src/pages/FinanceiroBaixas.jsx:364 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_inicial} | nao declarado |
| frontend/src/pages/FinanceiroBaixas.jsx:368 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_final} | nao declarado |
| frontend/src/pages/FinanceiroBancos.jsx:372 | CAMPO_COMPARTILHADO / DateInputBR | {dataPagamento} | nao declarado |
| frontend/src/pages/FinanceiroBoletos.jsx:1170 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'vencimento_inicial', rotulo: 'Vencimento início', tipo: 'date', valor: filters.vencimento_inicial, aoMudar: (valor) => updateFilter('vencimento_inicial', valor) } |  |
| frontend/src/pages/FinanceiroBoletos.jsx:1171 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'vencimento_final', rotulo: 'Vencimento fim', tipo: 'date', valor: filters.vencimento_final, aoMudar: (valor) => updateFilter('vencimento_final', valor) } |  |
| frontend/src/pages/FinanceiroCaixas.jsx:562 | CAMPO_COMPARTILHADO / DateInputBR | {abrirForm.data_abertura} | nao declarado |
| frontend/src/pages/FinanceiroCaixas.jsx:611 | CAMPO_COMPARTILHADO / DateInputBR | {fecharForm.data_fechamento} | {dataMinimaFechamento} / nao declarado |
| frontend/src/pages/FinanceiroCaixas.jsx:647 | CAMPO_COMPARTILHADO / DateInputBR | {movimentoForm.data_movimento} | nao declarado |
| frontend/src/pages/FinanceiroCaixas.jsx:671 | CAMPO_COMPARTILHADO / DateInputBR | {dataPainel} | nao declarado |
| frontend/src/pages/FinanceiroChequesTerceiros.jsx:487 | TIPO_DINAMICO_REVISAR / input | {form[key]} | nao declarado |
| frontend/src/pages/FinanceiroChequesTerceiros.jsx:544 | TIPO_DINAMICO_REVISAR / input | {form[key]} | nao declarado |
| frontend/src/pages/FinanceiroChequesTerceiros.jsx:723 | CAMPO_COMPARTILHADO / DateInputBR | {row.data_vencimento \|\| ''} | nao declarado |
| frontend/src/pages/FinanceiroChequesTerceiros.jsx:825 | CAMPO_COMPARTILHADO / DateInputBR | {actionForm.data_evento} | nao declarado |
| frontend/src/pages/FinanceiroConciliacao.jsx:776 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_vencimento} | nao declarado |
| frontend/src/pages/FinanceiroConciliacao.jsx:781 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_pagamento} | nao declarado |
| frontend/src/pages/FinanceiroConciliacao.jsx:2885 | CAMPO_COMPARTILHADO / DateInputBR | {dashboardFilters.data_inicial} | nao declarado |
| frontend/src/pages/FinanceiroConciliacao.jsx:2893 | CAMPO_COMPARTILHADO / DateInputBR | {dashboardFilters.data_final} | nao declarado |
| frontend/src/pages/FinanceiroConciliacao.jsx:3026 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_inicial} | nao declarado |
| frontend/src/pages/FinanceiroConciliacao.jsx:3031 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_final} | nao declarado |
| frontend/src/pages/FinanceiroConciliacao.jsx:3412 | CONFIGURACAO_DINAMICA_DATA /  | { label: 'Data inicial', field: 'data_inicial', type: 'date' } |  |
| frontend/src/pages/FinanceiroConciliacao.jsx:3413 | CONFIGURACAO_DINAMICA_DATA /  | { label: 'Data final', field: 'data_final', type: 'date' } |  |
| frontend/src/pages/FinanceiroConciliacao.jsx:3421 | TIPO_DINAMICO_REVISAR / input | {associacaoModal.filters[field]} | nao declarado |
| frontend/src/pages/FinanceiroConciliacao.jsx:3525 | CONFIGURACAO_DINAMICA_DATA /  | { label: 'Data inicial', field: 'data_inicial', type: 'date' } |  |
| frontend/src/pages/FinanceiroConciliacao.jsx:3526 | CONFIGURACAO_DINAMICA_DATA /  | { label: 'Data final', field: 'data_final', type: 'date' } |  |
| frontend/src/pages/FinanceiroConciliacao.jsx:3533 | TIPO_DINAMICO_REVISAR / input | {faturaModal.filters[field] \|\| ''} | nao declarado |
| frontend/src/pages/FinanceiroDda.jsx:321 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Vencimento de', tipo: 'date', valor: filters.data_inicio, aoMudar: (valor) => setFilters((prior) => ({ ...prior, data_inicio: valor, page: 1 })) } |  |
| frontend/src/pages/FinanceiroDda.jsx:328 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Vencimento até', tipo: 'date', valor: filters.data_fim, aoMudar: (valor) => setFilters((prior) => ({ ...prior, data_fim: valor, page: 1 })) } |  |
| frontend/src/pages/FinanceiroDistribuicaoCentrosCusto.jsx:74 | CAMPO_COMPARTILHADO / DateInputBR | {rascunho.data_inicio} | nao declarado |
| frontend/src/pages/FinanceiroDistribuicaoCentrosCusto.jsx:78 | CAMPO_COMPARTILHADO / DateInputBR | {rascunho.data_fim} | nao declarado |
| frontend/src/pages/FinanceiroDre.jsx:622 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_inicial} | nao declarado |
| frontend/src/pages/FinanceiroDre.jsx:626 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_final} | nao declarado |
| frontend/src/pages/FinanceiroEndividamento.jsx:234 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_inicial} | nao declarado |
| frontend/src/pages/FinanceiroEndividamento.jsx:238 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_final} | nao declarado |
| frontend/src/pages/FinanceiroFaturaCartaoDetalhe.jsx:298 | CAMPO_COMPARTILHADO / DateInputBR | {baixaForm.data_pagamento} | nao declarado |
| frontend/src/pages/FinanceiroFilaPagamentos.jsx:1596 | CAMPO_COMPARTILHADO / DateInputBR | {drafts[row.id]?.data_baixa \|\| row.data_baixa \|\| ''} | nao declarado |
| frontend/src/pages/FinanceiroFinanciamentosBancarios.jsx:723 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_contrato} | nao declarado |
| frontend/src/pages/FinanceiroFinanciamentosBancarios.jsx:726 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_credito} | nao declarado |
| frontend/src/pages/FinanceiroFinanciamentosBancarios.jsx:729 | CAMPO_COMPARTILHADO / DateInputBR | {form.primeiro_vencimento} | nao declarado |
| frontend/src/pages/FinanceiroFluxoConsolidado.jsx:246 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_inicial} | nao declarado |
| frontend/src/pages/FinanceiroFluxoConsolidado.jsx:250 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_final} | nao declarado |
| frontend/src/pages/FinanceiroIntercompany.jsx:258 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_inicial} | nao declarado |
| frontend/src/pages/FinanceiroIntercompany.jsx:262 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_final} | nao declarado |
| frontend/src/pages/FinanceiroObras.jsx:628 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_inicial} | nao declarado |
| frontend/src/pages/FinanceiroObras.jsx:632 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_final} | nao declarado |
| frontend/src/pages/FinanceiroPagamentos.jsx:1015 | CAMPO_COMPARTILHADO / DateInputBR | {filters.vencimento_inicial} | nao declarado |
| frontend/src/pages/FinanceiroPagamentos.jsx:1019 | CAMPO_COMPARTILHADO / DateInputBR | {filters.vencimento_final} | nao declarado |
| frontend/src/pages/FinanceiroPagamentos.jsx:1100 | CAMPO_COMPARTILHADO / DateInputBR | {batchForm.data_programada} | {today()} / nao declarado |
| frontend/src/pages/FinanceiroPagamentos.jsx:1572 | CAMPO_COMPARTILHADO / DateInputBR | {eventFilters.data_inicio} | nao declarado |
| frontend/src/pages/FinanceiroPagamentos.jsx:1576 | CAMPO_COMPARTILHADO / DateInputBR | {eventFilters.data_fim} | nao declarado |
| frontend/src/pages/FinanceiroPermutas.jsx:25 | CAMPO_COMPARTILHADO / DateInputBR | {rascunho.data_inicio} | true |
| frontend/src/pages/FinanceiroPermutas.jsx:26 | CAMPO_COMPARTILHADO / DateInputBR | {rascunho.data_fim} | true |
| frontend/src/pages/FinanceiroRelatorioAnalitico.jsx:426 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_inicial} | nao declarado |
| frontend/src/pages/FinanceiroRelatorioAnalitico.jsx:430 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_final} | nao declarado |
| frontend/src/pages/FinanceiroRelatorioAnalitico.jsx:434 | CAMPO_COMPARTILHADO / DateInputBR | {filters.vencimento_inicial} | nao declarado |
| frontend/src/pages/FinanceiroRelatorioAnalitico.jsx:438 | CAMPO_COMPARTILHADO / DateInputBR | {filters.vencimento_final} | nao declarado |
| frontend/src/pages/FinanceiroRelatorios.jsx:755 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_inicial} | nao declarado |
| frontend/src/pages/FinanceiroRelatorios.jsx:761 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_final} | nao declarado |
| frontend/src/pages/FinanceiroRelatorios.jsx:1065 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_inicial} | nao declarado |
| frontend/src/pages/FinanceiroRelatorios.jsx:1073 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_final} | nao declarado |
| frontend/src/pages/FinanceiroTituloDetalhe.jsx:1005 | CAMPO_COMPARTILHADO / DateInputBR | {cobrancaForm.boleto_emitido_em} | nao declarado |
| frontend/src/pages/FinanceiroTituloDetalhe.jsx:1611 | CAMPO_COMPARTILHADO / DateInputBR | {baixaForm.data_emissao} | nao declarado |
| frontend/src/pages/FinanceiroTituloDetalhe.jsx:1619 | CAMPO_COMPARTILHADO / DateInputBR | {baixaForm.data_vencimento} | nao declarado |
| frontend/src/pages/FinanceiroTituloDetalhe.jsx:1663 | CAMPO_COMPARTILHADO / DateInputBR | {baixaForm.data_movimento} | nao declarado |
| frontend/src/pages/FinanceiroTituloEditar.jsx:1221 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_emissao} | nao declarado |
| frontend/src/pages/FinanceiroTituloEditar.jsx:1230 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_vencimento} | nao declarado |
| frontend/src/pages/FinanceiroTituloEditar.jsx:1243 | CAMPO_COMPARTILHADO / DateInputBR | {form.competencia_data} | nao declarado |
| frontend/src/pages/FinanceiroTituloNovo.jsx:1865 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_emissao} | nao declarado |
| frontend/src/pages/FinanceiroTituloNovo.jsx:2052 | CAMPO_COMPARTILHADO / DateInputBR | {pagamento.data_compra} | nao declarado |
| frontend/src/pages/FinanceiroTituloNovo.jsx:2064 | CAMPO_COMPARTILHADO / DateInputBR | {pagamento.data_vencimento} | nao declarado |
| frontend/src/pages/FinanceiroTituloNovo.jsx:2139 | CAMPO_COMPARTILHADO / DateInputBR | {parcela.data_vencimento \|\| ''} | nao declarado |
| frontend/src/pages/FinanceiroTituloNovo.jsx:2258 | CAMPO_COMPARTILHADO / DateInputBR | {form.boleto_emitido_em} | nao declarado |
| frontend/src/pages/FinanceiroTituloNovo.jsx:2766 | CAMPO_COMPARTILHADO / DateInputBR | {paymentDraft.data_pagamento \|\| form.data_vencimento} | nao declarado |
| frontend/src/pages/FinanceiroTitulos.jsx:2737 | CAMPO_COMPARTILHADO / DateInputBR | {draftFilters.data_emissao_inicial} | nao declarado |
| frontend/src/pages/FinanceiroTitulos.jsx:2748 | CAMPO_COMPARTILHADO / DateInputBR | {draftFilters.data_emissao_final} | nao declarado |
| frontend/src/pages/FinanceiroTitulos.jsx:2821 | CAMPO_COMPARTILHADO / DateInputBR | {draftFilters.vencimento_inicial} | nao declarado |
| frontend/src/pages/FinanceiroTitulos.jsx:2832 | CAMPO_COMPARTILHADO / DateInputBR | {draftFilters.vencimento_final} | nao declarado |
| frontend/src/pages/FinanceiroTitulos.jsx:3708 | CAMPO_COMPARTILHADO / DateInputBR | {baixaMassaForm.data_movimento} | nao declarado |
| frontend/src/pages/FinanceiroTitulos.jsx:4068 | CAMPO_COMPARTILHADO / DateInputBR | {parcela.data_movimento} | nao declarado |
| frontend/src/pages/GestaoContratos.jsx:2064 | CAMPO_COMPARTILHADO / DateInputBR | "vigencia_inicio" | nao declarado |
| frontend/src/pages/GestaoContratos.jsx:2074 | CAMPO_COMPARTILHADO / DateInputBR | "vigencia_fim" | nao declarado |
| frontend/src/pages/Login/index.jsx:338 | TIPO_DINAMICO_REVISAR / input | {senha} | nao declarado |
| frontend/src/pages/NovaSolicitacao.jsx:3657 | CAMPO_COMPARTILHADO / DateInputBR | "data_vencimento" | {hojeInput} / nao declarado |
| frontend/src/pages/NovaSolicitacao.jsx:3674 | CAMPO_COMPARTILHADO / DateInputBR | "data_demissao" | nao declarado |
| frontend/src/pages/NovaSolicitacao.jsx:3695 | CAMPO_COMPARTILHADO / DateInputBR | "data_inicio_medicao" | nao declarado |
| frontend/src/pages/NovaSolicitacao.jsx:3704 | CAMPO_COMPARTILHADO / DateInputBR | "data_fim_medicao" | nao declarado |
| frontend/src/pages/PainelGestor.jsx:271 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_inicial} | {filters.data_final} / nao declarado |
| frontend/src/pages/PainelGestor.jsx:272 | CAMPO_COMPARTILHADO / DateInputBR | {filters.data_final} | {filters.data_inicial} / {localDate()} / nao declarado |
| frontend/src/pages/PainelGestorSaldosRegistro.jsx:109 | CAMPO_COMPARTILHADO / DateInputBR | {data} | {localDate()} / nao declarado |
| frontend/src/pages/Parceiros.jsx:687 | CAMPO_COMPARTILHADO / DateInputBR | {parceiroForm.data_nascimento} | nao declarado |
| frontend/src/pages/PermissoesAreas.jsx:208 | TIPO_DINAMICO_REVISAR / input | {inputName} | nao declarado |
| frontend/src/pages/PermissoesAreasPadroes.jsx:110 | TIPO_DINAMICO_REVISAR / input | {inputName} | nao declarado |
| frontend/src/pages/PrazosOperacionaisConfig.jsx:53 | CONFIGURACAO_DINAMICA_DATA /  | { type: 'date', required: regra.ativo } |  |
| frontend/src/pages/PrazosOperacionaisConfig.jsx:56 | CONFIGURACAO_DINAMICA_DATA /  | { type: 'time', required: true } |  |
| frontend/src/pages/PrazosOperacionaisConfig.jsx:62 | CONFIGURACAO_DINAMICA_DATA /  | { type: 'time', required: true } |  |
| frontend/src/pages/PrazosOperacionaisConfig.jsx:63 | CONFIGURACAO_DINAMICA_DATA /  | { type: 'time', required: true } |  |
| frontend/src/pages/PrazosOperacionaisConfig.jsx:83 | CAMPO_NATIVO / input | {liberacao.ate} | nao declarado |
| frontend/src/pages/RhDpApuracao.jsx:977 | CAMPO_NATIVO / input | {form.competencia} | nao declarado |
| frontend/src/pages/RhDpApuracao.jsx:1144 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'competencia', rotulo: 'Competência', tipo: 'month', valor: filtros.competencia, aoMudar: (valor) => setFiltros((atuais) => ({ ...atuais, competencia: valor })) } |  |
| frontend/src/pages/RhDpApuracao.jsx:1375 | CAMPO_COMPARTILHADO / DateInputBR | {fechamentoForm.data_fechamento} | nao declarado |
| frontend/src/pages/RhDpApuracao.jsx:1384 | CAMPO_COMPARTILHADO / DateInputBR | {fechamentoForm.data_vencimento} | nao declarado |
| frontend/src/pages/RhDpColaboradores.jsx:1162 | CAMPO_NATIVO / input | {ticketForm.competencia} | nao declarado |
| frontend/src/pages/RhDpColaboradores.jsx:1174 | CAMPO_COMPARTILHADO / DateInputBR | {ticketForm.data_vencimento} | nao declarado |
| frontend/src/pages/RhDpColaboradores.jsx:1284 | CAMPO_COMPARTILHADO / DateInputBR | {form.obra_vigencia_inicio} | {form.data_admissao \|\| undefined} / {new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())} / nao declarado |
| frontend/src/pages/RhDpColaboradores.jsx:1380 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_admissao} | nao declarado |
| frontend/src/pages/RhDpColaboradores.jsx:1388 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_inicio_efetivo_obra} | nao declarado |
| frontend/src/pages/RhDpColaboradores.jsx:1393 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_demissao} | nao declarado |
| frontend/src/pages/RhDpColaboradores.jsx:1401 | CAMPO_COMPARTILHADO / DateInputBR | {form.data_nascimento} | nao declarado |
| frontend/src/pages/RhDpColaboradores.jsx:1437 | CAMPO_COMPARTILHADO / DateInputBR | {form.salario_vigencia_inicio} | nao declarado |
| frontend/src/pages/RhDpColaboradores.jsx:1475 | CAMPO_NATIVO / input | {form.calculo_vigencia_inicio} | nao declarado |
| frontend/src/pages/RhDpColaboradores.jsx:1717 | CAMPO_COMPARTILHADO / DateInputBR | {novoDocumento.validade} | nao declarado |
| frontend/src/pages/RhDpFechamentos.jsx:423 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'competencia', rotulo: 'Competência', tipo: 'month', valor: filtros.competencia, aoMudar: (valor) => setFiltros((atuais) => ({ ...atuais, competencia: valor })) } |  |
| frontend/src/pages/RhDpImportacoes.jsx:545 | CAMPO_NATIVO / input | {form.competencia} | nao declarado |
| frontend/src/pages/RhDpImportacoes.jsx:640 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'competencia', rotulo: 'Competência', tipo: 'month', valor: filtros.competencia, aoMudar: (valor) => setFiltros((atuais) => ({ ...atuais, competencia: valor })) } |  |
| frontend/src/pages/RhDpJornada.jsx:1297 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'competencia', rotulo: 'Competência', tipo: 'month', valor: competencia, aoMudar: mudarCompetencia, disabled: carregando \|\| salvando \|\| importandoPlanilha } |  |
| frontend/src/pages/RhDpJornadaGerencial.jsx:225 | CAMPO_NATIVO / input | {competencia} | nao declarado |
| frontend/src/pages/RhDpPessoal.jsx:1779 | CAMPO_COMPARTILHADO / DateInputBR | {formulario.data_admissao} | nao declarado |
| frontend/src/pages/RhDpPessoal.jsx:1785 | CAMPO_COMPARTILHADO / DateInputBR | {formulario.data_inicio_efetivo_obra \|\| ''} | nao declarado |
| frontend/src/pages/RhDpPessoal.jsx:1945 | CAMPO_COMPARTILHADO / DateInputBR | {formulario.data_inicial \|\| ''} | nao declarado |
| frontend/src/pages/RhDpPessoal.jsx:1951 | CAMPO_COMPARTILHADO / DateInputBR | {formulario.data_final \|\| ''} | nao declarado |
| frontend/src/pages/RhDpPessoal.jsx:1974 | CAMPO_COMPARTILHADO / DateInputBR | {formulario.data_retorno \|\| ''} | nao declarado |
| frontend/src/pages/RhDpPessoal.jsx:2003 | CAMPO_COMPARTILHADO / DateInputBR | {formulario.data_vigencia \|\| ''} | nao declarado |
| frontend/src/pages/RhDpPessoal.jsx:2036 | CAMPO_COMPARTILHADO / DateInputBR | {formulario.data_vigencia \|\| ''} | nao declarado |
| frontend/src/pages/RhDpPessoal.jsx:2100 | CAMPO_COMPARTILHADO / DateInputBR | {formulario.data_vigencia} | nao declarado |
| frontend/src/pages/RhDpPessoal.jsx:2170 | CAMPO_COMPARTILHADO / DateInputBR | {formulario.ultimo_dia_trabalhado \|\| ''} | nao declarado |
| frontend/src/pages/RhDpPessoal.jsx:2209 | CAMPO_COMPARTILHADO / DateInputBR | {formulario.data_desligamento} | nao declarado |
| frontend/src/pages/RhDpPessoal.jsx:2302 | CAMPO_COMPARTILHADO / DateInputBR | {formulario.data_vigencia} | nao declarado |
| frontend/src/pages/RhDpRelatorioOperacional.jsx:294 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicial', rotulo: 'Data inicial', tipo: 'date', valor: filters.data_inicial, aoMudar: (valor) => updateFilter('data_inicial', valor) } |  |
| frontend/src/pages/RhDpRelatorioOperacional.jsx:301 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_final', rotulo: 'Data final', tipo: 'date', valor: filters.data_final, aoMudar: (valor) => updateFilter('data_final', valor) } |  |
| frontend/src/pages/RhDpTitulosEnviados.jsx:43 | CAMPO_NATIVO / input | {filtros.competencia} | nao declarado |
| frontend/src/pages/SolicitacaoDetalhe/AdiantamentoDetalhe.jsx:108 | CAMPO_NATIVO / input | {dataDevolucao} | nao declarado |
| frontend/src/pages/SolicitacaoDetalhe/CompraDiretaFreteForm.jsx:96 | CAMPO_COMPARTILHADO / DateInputBR | {form.frete_data_vencimento} | nao declarado |
| frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx:3676 | CAMPO_COMPARTILHADO / DateInputBR | {pagamento.data_compra} | nao declarado |
| frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx:3690 | CAMPO_COMPARTILHADO / DateInputBR | {pagamento.data_vencimento} | nao declarado |
| frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx:3769 | CAMPO_COMPARTILHADO / DateInputBR | {parcela.data_vencimento \|\| ''} | nao declarado |
| frontend/src/pages/SolicitacaoDetalhe/ModalMedicao.jsx:532 | CAMPO_COMPARTILHADO / DateInputBR | {`vencimento_medicao_${p.id}`} | nao declarado |
| frontend/src/pages/SolicitacaoDetalhe/PedidoEntrega.jsx:118 | CAMPO_COMPARTILHADO / DateInputBR | {dataLote} | nao declarado |
| frontend/src/pages/SolicitacaoDetalhe/PedidoEntrega.jsx:145 | CAMPO_COMPARTILHADO / DateInputBR | {datas[item.id] \|\| ''} | nao declarado |
| frontend/src/pages/Solicitacoes/Filtros.jsx:347 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_registro', rotulo: 'Data de registro', tipo: 'date', min: '1900-01-01', max: '2200-12-31', valor: filtros.data_registro \|\| '', aoMudar: (valor) => definirCampo('data_registro', valor) } |  |
| frontend/src/pages/Solicitacoes/Filtros.jsx:356 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_vencimento_inicio', rotulo: 'Data Resposta/Pagamento de', tipo: 'date', min: '1900-01-01', max: '2200-12-31', valor: filtros.data_vencimento_inicio \|\| '', aoMudar: (valor) => definirCampo('data_vencimento_ini |  |
| frontend/src/pages/Solicitacoes/Filtros.jsx:365 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_vencimento_fim', rotulo: 'Data Resposta/Pagamento até', tipo: 'date', min: '1900-01-01', max: '2200-12-31', valor: filtros.data_vencimento_fim \|\| '', aoMudar: (valor) => definirCampo('data_vencimento_fim', va |  |
| frontend/src/pages/Solicitacoes/LinhaSolicitacao.jsx:236 | CAMPO_COMPARTILHADO / DateInputBR | {dataEditada \|\| ''} | nao declarado |
| frontend/src/pages/Solicitacoes/ModalAtribuirResponsavel.jsx:175 | CAMPO_COMPARTILHADO / DateInputBR | {prazoCompra} | nao declarado |
| frontend/src/pages/SolicitacoesRelatorioOperacional.jsx:435 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_inicio', rotulo: 'Data inicial', tipo: 'date', valor: filtros.data_inicio, aoMudar: (valor) => atualizarCampo('data_inicio', valor) } |  |
| frontend/src/pages/SolicitacoesRelatorioOperacional.jsx:442 | CONFIGURACAO_DINAMICA_DATA /  | { id: 'data_fim', rotulo: 'Data final', tipo: 'date', valor: filtros.data_fim, aoMudar: (valor) => atualizarCampo('data_fim', valor) } |  |

## Colunas e configuracoes backend

| Arquivo:linha | Tipo | Campo | Formato |
|---|---|---|---|
| backend/migrations/202604090001_auth_cookies_mfa_users.js:32 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202604110008_cotacao_resposta_disponibilidade.js:15 | COLUNA_BANCO | data_chegada | DataTypes.DATEONLY |
| backend/migrations/202604200008_comunicacao_interna_chat.js:40 | COLUNA_BANCO | last_message_at | DataTypes.DATE |
| backend/migrations/202604200008_comunicacao_interna_chat.js:75 | COLUNA_BANCO | lida_em | DataTypes.DATE |
| backend/migrations/202604210001_comunicacao_interna_chat_schema_fix.js:33 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202604210001_comunicacao_interna_chat_schema_fix.js:49 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202604250001_comercial_contrato_documentos_d4sign.js:82 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202604250001_comercial_contrato_documentos_d4sign.js:87 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202604250001_comercial_contrato_documentos_d4sign.js:155 | COLUNA_BANCO | d4sign_enviado_em | DataTypes.DATE |
| backend/migrations/202604250001_comercial_contrato_documentos_d4sign.js:159 | COLUNA_BANCO | d4sign_finalizado_em | DataTypes.DATE |
| backend/migrations/202604250001_comercial_contrato_documentos_d4sign.js:179 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202604250001_comercial_contrato_documentos_d4sign.js:184 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605040001_titulos_financeiros_codigo.js:62 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605040001_titulos_financeiros_codigo.js:67 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605040002_contrato_comercial_quadro_resumo_campos.js:42 | COLUNA_BANCO | dinamico | DataTypes.DATEONLY |
| backend/migrations/202605100002_contrato_comercial_compradores.js:56 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605100002_contrato_comercial_compradores.js:61 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605110001_financeiro_formas_cartoes_faturas.js:34 | COLUNA_BANCO | createdAt | Sequelize.DATE |
| backend/migrations/202605110001_financeiro_formas_cartoes_faturas.js:35 | COLUNA_BANCO | updatedAt | Sequelize.DATE |
| backend/migrations/202605110001_financeiro_formas_cartoes_faturas.js:53 | COLUNA_BANCO | createdAt | Sequelize.DATE |
| backend/migrations/202605110001_financeiro_formas_cartoes_faturas.js:54 | COLUNA_BANCO | updatedAt | Sequelize.DATE |
| backend/migrations/202605110001_financeiro_formas_cartoes_faturas.js:63 | COLUNA_BANCO | data_inicio | Sequelize.DATEONLY |
| backend/migrations/202605110001_financeiro_formas_cartoes_faturas.js:64 | COLUNA_BANCO | data_fechamento | Sequelize.DATEONLY |
| backend/migrations/202605110001_financeiro_formas_cartoes_faturas.js:65 | COLUNA_BANCO | data_vencimento | Sequelize.DATEONLY |
| backend/migrations/202605110001_financeiro_formas_cartoes_faturas.js:69 | COLUNA_BANCO | data_pagamento | Sequelize.DATEONLY |
| backend/migrations/202605110001_financeiro_formas_cartoes_faturas.js:75 | COLUNA_BANCO | createdAt | Sequelize.DATE |
| backend/migrations/202605110001_financeiro_formas_cartoes_faturas.js:76 | COLUNA_BANCO | updatedAt | Sequelize.DATE |
| backend/migrations/202605110001_financeiro_formas_cartoes_faturas.js:89 | COLUNA_BANCO | createdAt | Sequelize.DATE |
| backend/migrations/202605110001_financeiro_formas_cartoes_faturas.js:90 | COLUNA_BANCO | updatedAt | Sequelize.DATE |
| backend/migrations/202605110001_financeiro_formas_cartoes_faturas.js:100 | COLUNA_BANCO | dinamico | Sequelize.DATEONLY |
| backend/migrations/202605190001_empresas_grupo_financeiro_base.js:55 | COLUNA_BANCO | createdAt | Sequelize.DATE |
| backend/migrations/202605190001_empresas_grupo_financeiro_base.js:56 | COLUNA_BANCO | updatedAt | Sequelize.DATE |
| backend/migrations/202605190002_financeiro_caixa_sessoes.js:18 | COLUNA_BANCO | data_abertura | Sequelize.DATEONLY |
| backend/migrations/202605190002_financeiro_caixa_sessoes.js:19 | COLUNA_BANCO | data_fechamento | Sequelize.DATEONLY |
| backend/migrations/202605190002_financeiro_caixa_sessoes.js:31 | COLUNA_BANCO | fechado_em | Sequelize.DATE |
| backend/migrations/202605190002_financeiro_caixa_sessoes.js:32 | COLUNA_BANCO | createdAt | Sequelize.DATE |
| backend/migrations/202605190002_financeiro_caixa_sessoes.js:33 | COLUNA_BANCO | updatedAt | Sequelize.DATE |
| backend/migrations/202605190003_financeiro_transferencias.js:41 | COLUNA_BANCO | data_transferencia | Sequelize.DATEONLY |
| backend/migrations/202605190003_financeiro_transferencias.js:47 | COLUNA_BANCO | cancelado_em | Sequelize.DATE |
| backend/migrations/202605190003_financeiro_transferencias.js:49 | COLUNA_BANCO | createdAt | Sequelize.DATE |
| backend/migrations/202605190003_financeiro_transferencias.js:50 | COLUNA_BANCO | updatedAt | Sequelize.DATE |
| backend/migrations/202605190005_fiscal_base.js:43 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:44 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:60 | COLUNA_BANCO | last_success_at | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:61 | COLUNA_BANCO | last_attempt_at | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:62 | COLUNA_BANCO | next_allowed_sync_at | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:68 | COLUNA_BANCO | locked_until | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:69 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:70 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:90 | COLUNA_BANCO | emission_date | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:91 | COLUNA_BANCO | received_at | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:109 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:110 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:124 | COLUNA_BANCO | started_at | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:125 | COLUNA_BANCO | finished_at | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:138 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:139 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:166 | COLUNA_BANCO | confirmed_at | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:167 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:168 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:194 | COLUNA_BANCO | resolved_at | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:195 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605190005_fiscal_base.js:196 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605190006_fiscal_complemento.js:29 | COLUNA_BANCO | valid_from | DataTypes.DATE |
| backend/migrations/202605190006_fiscal_complemento.js:30 | COLUNA_BANCO | valid_until | DataTypes.DATE |
| backend/migrations/202605190006_fiscal_complemento.js:35 | COLUNA_BANCO | last_validated_at | DataTypes.DATE |
| backend/migrations/202605190006_fiscal_complemento.js:39 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605190006_fiscal_complemento.js:40 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605190006_fiscal_complemento.js:55 | COLUNA_BANCO | event_date | DataTypes.DATE |
| backend/migrations/202605190006_fiscal_complemento.js:59 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605190006_fiscal_complemento.js:60 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605190006_fiscal_complemento.js:74 | COLUNA_BANCO | period_start | DataTypes.DATEONLY |
| backend/migrations/202605190006_fiscal_complemento.js:75 | COLUNA_BANCO | period_end | DataTypes.DATEONLY |
| backend/migrations/202605190006_fiscal_complemento.js:82 | COLUNA_BANCO | generated_at | DataTypes.DATE |
| backend/migrations/202605190006_fiscal_complemento.js:83 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605190006_fiscal_complemento.js:84 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605190006_fiscal_complemento.js:106 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605190006_fiscal_complemento.js:107 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605200001_boletos_caixa_cnab_base.js:30 | COLUNA_BANCO | createdAt | Sequelize.DATE |
| backend/migrations/202605200001_boletos_caixa_cnab_base.js:31 | COLUNA_BANCO | updatedAt | Sequelize.DATE |
| backend/migrations/202605200001_boletos_caixa_cnab_base.js:84 | COLUNA_BANCO | data_emissao | Sequelize.DATEONLY |
| backend/migrations/202605200001_boletos_caixa_cnab_base.js:85 | COLUNA_BANCO | data_vencimento | Sequelize.DATEONLY |
| backend/migrations/202605200001_boletos_caixa_cnab_base.js:86 | COLUNA_BANCO | data_registro | Sequelize.DATEONLY |
| backend/migrations/202605200001_boletos_caixa_cnab_base.js:87 | COLUNA_BANCO | data_liquidacao | Sequelize.DATEONLY |
| backend/migrations/202605200001_boletos_caixa_cnab_base.js:88 | COLUNA_BANCO | data_baixa | Sequelize.DATEONLY |
| backend/migrations/202605200001_boletos_caixa_cnab_base.js:116 | COLUNA_BANCO | gerado_em | Sequelize.DATE |
| backend/migrations/202605200001_boletos_caixa_cnab_base.js:117 | COLUNA_BANCO | enviado_em | Sequelize.DATE |
| backend/migrations/202605200001_boletos_caixa_cnab_base.js:151 | COLUNA_BANCO | processado_em | Sequelize.DATE |
| backend/migrations/202605200001_boletos_caixa_cnab_base.js:169 | COLUNA_BANCO | data_ocorrencia | Sequelize.DATEONLY |
| backend/migrations/202605200001_boletos_caixa_cnab_base.js:170 | COLUNA_BANCO | data_credito | Sequelize.DATEONLY |
| backend/migrations/202605200002_empresas_obras_dre_base.js:98 | COLUNA_BANCO | dinamico | Sequelize.DATEONLY |
| backend/migrations/202605210006_comercial_parcelas_competencia_dre.js:18 | COLUNA_BANCO | dinamico | DataTypes.DATEONLY |
| backend/migrations/202605210006_comercial_parcelas_competencia_dre.js:31 | COLUNA_BANCO | dinamico | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:30 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605230001_sst_base.js:31 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605230001_sst_base.js:72 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:73 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:83 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:84 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:96 | COLUNA_BANCO | data_exame | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:97 | COLUNA_BANCO | validade | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:110 | COLUNA_BANCO | data_exame | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:111 | COLUNA_BANCO | validade | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:124 | COLUNA_BANCO | entrega_em | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:125 | COLUNA_BANCO | validade | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:137 | COLUNA_BANCO | data_inicio | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:138 | COLUNA_BANCO | data_fim | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:139 | COLUNA_BANCO | validade | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:152 | COLUNA_BANCO | data_ocorrencia | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:170 | COLUNA_BANCO | validade | DataTypes.DATEONLY |
| backend/migrations/202605230001_sst_base.js:184 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/migrations/202605230002_sst_historico_relatorio_operacional.js:35 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605230002_sst_historico_relatorio_operacional.js:36 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605250001_treinamento_base.js:38 | COLUNA_BANCO | publicado_em | DataTypes.DATE |
| backend/migrations/202605250001_treinamento_base.js:42 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605250001_treinamento_base.js:43 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605250001_treinamento_base.js:51 | COLUNA_BANCO | visualizado_em | DataTypes.DATE |
| backend/migrations/202605250001_treinamento_base.js:52 | COLUNA_BANCO | concluido_em | DataTypes.DATE |
| backend/migrations/202605250001_treinamento_base.js:53 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605250001_treinamento_base.js:54 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:26 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:27 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:56 | COLUNA_BANCO | data_inicio | DataTypes.DATEONLY |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:57 | COLUNA_BANCO | data_fim | DataTypes.DATEONLY |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:88 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:89 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:101 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:102 | COLUNA_BANCO | processado_em | DataTypes.DATE |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:125 | COLUNA_BANCO | preparado_em | DataTypes.DATE |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:126 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:127 | COLUNA_BANCO | processado_em | DataTypes.DATE |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:140 | COLUNA_BANCO | recebido_em | DataTypes.DATE |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:141 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605260001_sst_esocial_base_versionada.js:142 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605260002_sst_operacional_fase2.js:30 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605260002_sst_operacional_fase2.js:31 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605260003_sst_inteligencia_operacional_fase3.js:21 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605260003_sst_inteligencia_operacional_fase3.js:22 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605260003_sst_inteligencia_operacional_fase3.js:58 | COLUNA_BANCO | resolvido_em | DataTypes.DATE |
| backend/migrations/202605260003_sst_inteligencia_operacional_fase3.js:79 | COLUNA_BANCO | lida_em | DataTypes.DATE |
| backend/migrations/202605260003_sst_inteligencia_operacional_fase3.js:97 | COLUNA_BANCO | prazo_limite | DataTypes.DATEONLY |
| backend/migrations/202605260003_sst_inteligencia_operacional_fase3.js:98 | COLUNA_BANCO | resolvida_em | DataTypes.DATE |
| backend/migrations/202605260003_sst_inteligencia_operacional_fase3.js:114 | COLUNA_BANCO | calculado_em | DataTypes.DATE |
| backend/migrations/202605260004_sst_orquestracao_operacional_fase4.js:21 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605260004_sst_orquestracao_operacional_fase4.js:22 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605260004_sst_orquestracao_operacional_fase4.js:52 | COLUNA_BANCO | iniciado_em | DataTypes.DATE |
| backend/migrations/202605260004_sst_orquestracao_operacional_fase4.js:53 | COLUNA_BANCO | finalizado_em | DataTypes.DATE |
| backend/migrations/202605260004_sst_orquestracao_operacional_fase4.js:113 | COLUNA_BANCO | processado_em | DataTypes.DATE |
| backend/migrations/202605260005_sst_homologacao_operacional_fase5.js:21 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605260005_sst_homologacao_operacional_fase5.js:22 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605260006_sst_operacao_real_assistida_fase6.js:21 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605260006_sst_operacao_real_assistida_fase6.js:22 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605260006_sst_operacao_real_assistida_fase6.js:51 | COLUNA_BANCO | iniciado_em | DataTypes.DATE |
| backend/migrations/202605260006_sst_operacao_real_assistida_fase6.js:52 | COLUNA_BANCO | encerrado_em | DataTypes.DATE |
| backend/migrations/202605260006_sst_operacao_real_assistida_fase6.js:53 | COLUNA_BANCO | rollback_em | DataTypes.DATE |
| backend/migrations/202605260006_sst_operacao_real_assistida_fase6.js:86 | COLUNA_BANCO | resolvido_em | DataTypes.DATE |
| backend/migrations/202605260007_sst_enterprise_go_live_fase7.js:21 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605260007_sst_enterprise_go_live_fase7.js:22 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605260007_sst_enterprise_go_live_fase7.js:44 | COLUNA_BANCO | next_run_at | DataTypes.DATE |
| backend/migrations/202605260007_sst_enterprise_go_live_fase7.js:45 | COLUNA_BANCO | started_at | DataTypes.DATE |
| backend/migrations/202605260007_sst_enterprise_go_live_fase7.js:46 | COLUNA_BANCO | finished_at | DataTypes.DATE |
| backend/migrations/202605260007_sst_enterprise_go_live_fase7.js:47 | COLUNA_BANCO | locked_at | DataTypes.DATE |
| backend/migrations/202605260007_sst_enterprise_go_live_fase7.js:69 | COLUNA_BANCO | sampled_at | DataTypes.DATE |
| backend/migrations/202605260007_sst_enterprise_go_live_fase7.js:81 | COLUNA_BANCO | sampled_at | DataTypes.DATE |
| backend/migrations/202605260007_sst_enterprise_go_live_fase7.js:92 | COLUNA_BANCO | expires_at | DataTypes.DATE |
| backend/migrations/202605260007_sst_enterprise_go_live_fase7.js:93 | COLUNA_BANCO | last_hit_at | DataTypes.DATE |
| backend/migrations/202605260007_sst_enterprise_go_live_fase7.js:109 | COLUNA_BANCO | resolvido_em | DataTypes.DATE |
| backend/migrations/202605260008_sst_ia_documental_esocial_controlado_fase8.js:27 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202605260008_sst_ia_documental_esocial_controlado_fase8.js:28 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202605260008_sst_ia_documental_esocial_controlado_fase8.js:45 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202605260008_sst_ia_documental_esocial_controlado_fase8.js:47 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202605260008_sst_ia_documental_esocial_controlado_fase8.js:66 | COLUNA_BANCO | dinamico | DataTypes.DATEONLY |
| backend/migrations/202605260008_sst_ia_documental_esocial_controlado_fase8.js:98 | COLUNA_BANCO | valid_from | DataTypes.DATE |
| backend/migrations/202605260008_sst_ia_documental_esocial_controlado_fase8.js:99 | COLUNA_BANCO | valid_to | DataTypes.DATE |
| backend/migrations/202606030001_financiamentos_bancarios.js:67 | COLUNA_BANCO | data_contrato | DataTypes.DATEONLY |
| backend/migrations/202606030001_financiamentos_bancarios.js:71 | COLUNA_BANCO | data_credito | DataTypes.DATEONLY |
| backend/migrations/202606030001_financiamentos_bancarios.js:75 | COLUNA_BANCO | primeiro_vencimento | DataTypes.DATEONLY |
| backend/migrations/202606030001_financiamentos_bancarios.js:110 | COLUNA_BANCO | titulos_gerados_em | DataTypes.DATE |
| backend/migrations/202606030001_financiamentos_bancarios.js:124 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606030001_financiamentos_bancarios.js:129 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606030001_financiamentos_bancarios.js:158 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/migrations/202606030001_financiamentos_bancarios.js:194 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606030001_financiamentos_bancarios.js:199 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606110001_caixa_pagamentos_cnab240.js:35 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606110001_caixa_pagamentos_cnab240.js:36 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606110001_caixa_pagamentos_cnab240.js:63 | COLUNA_BANCO | data_pagamento | DataTypes.DATEONLY |
| backend/migrations/202606110001_caixa_pagamentos_cnab240.js:68 | COLUNA_BANCO | gerado_em | DataTypes.DATE |
| backend/migrations/202606110001_caixa_pagamentos_cnab240.js:69 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/migrations/202606110001_caixa_pagamentos_cnab240.js:71 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606110001_caixa_pagamentos_cnab240.js:72 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606110001_caixa_pagamentos_cnab240.js:93 | COLUNA_BANCO | data_pagamento | DataTypes.DATEONLY |
| backend/migrations/202606110001_caixa_pagamentos_cnab240.js:96 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606110001_caixa_pagamentos_cnab240.js:97 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606130001_governanca_sistema.js:10 | COLUNA_BANCO | data_referencia | DataTypes.DATEONLY |
| backend/migrations/202606130001_governanca_sistema.js:19 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606130001_governanca_sistema.js:20 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606130001_governanca_sistema.js:39 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606130001_governanca_sistema.js:40 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606160002_compras_operacao_avancada.js:91 | COLUNA_BANCO | realizado_em | DataTypes.DATE |
| backend/migrations/202606160002_compras_operacao_avancada.js:111 | COLUNA_BANCO | cancelado_em | DataTypes.DATE |
| backend/migrations/202606160002_compras_operacao_avancada.js:119 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606160002_compras_operacao_avancada.js:124 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606160002_compras_operacao_avancada.js:162 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606160002_compras_operacao_avancada.js:179 | COLUNA_BANCO | dinamico | DataTypes.DATEONLY |
| backend/migrations/202606160002_compras_operacao_avancada.js:187 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606160002_compras_operacao_avancada.js:195 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606160002_compras_operacao_avancada.js:203 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606160002_compras_operacao_avancada.js:219 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606160002_compras_operacao_avancada.js:233 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606160002_compras_operacao_avancada.js:246 | COLUNA_BANCO | dinamico | DataTypes.DATEONLY |
| backend/migrations/202606160002_compras_operacao_avancada.js:254 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606160002_compras_operacao_avancada.js:262 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606180001_exclusao_logica_crm_channels.js:18 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606180001_exclusao_logica_crm_channels.js:23 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606180002_exclusao_logica_anexos_comprovantes.js:20 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606180002_exclusao_logica_anexos_comprovantes.js:25 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606180003_exclusao_logica_conversa_interna.js:18 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606180003_exclusao_logica_conversa_interna.js:23 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606180004_exclusao_logica_prioridade_lote_itens.js:18 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606180005_exclusao_logica_cotacao_resposta_itens.js:18 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606200001_financeiro_rateio_impostos_cheques.js:71 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606200001_financeiro_rateio_impostos_cheques.js:72 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606200001_financeiro_rateio_impostos_cheques.js:93 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606200001_financeiro_rateio_impostos_cheques.js:94 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606200001_financeiro_rateio_impostos_cheques.js:129 | COLUNA_BANCO | data_emissao | DataTypes.DATEONLY |
| backend/migrations/202606200001_financeiro_rateio_impostos_cheques.js:130 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/migrations/202606200001_financeiro_rateio_impostos_cheques.js:136 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606200001_financeiro_rateio_impostos_cheques.js:137 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606200002_conciliacao_soft_delete_caixa_travas.js:16 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606200002_conciliacao_soft_delete_caixa_travas.js:45 | COLUNA_BANCO | data_referencia | DataTypes.DATEONLY |
| backend/migrations/202606200002_conciliacao_soft_delete_caixa_travas.js:72 | COLUNA_BANCO | confirmado_em | DataTypes.DATE |
| backend/migrations/202606200002_conciliacao_soft_delete_caixa_travas.js:77 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606200002_conciliacao_soft_delete_caixa_travas.js:82 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606200003_solicitacao_pendencia_financeira.js:35 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606200003_solicitacao_pendencia_financeira.js:45 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606210003_password_reset_invites.js:23 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606210003_password_reset_invites.js:28 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606210003_password_reset_invites.js:33 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606260002_cotacao_fornecedor_itens.js:54 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606260002_cotacao_fornecedor_itens.js:59 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606280001_pedido_compra_fretes.js:75 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/migrations/202606280001_pedido_compra_fretes.js:119 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606280001_pedido_compra_fretes.js:124 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606280001_pedido_compra_fretes.js:202 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202606280001_pedido_compra_fretes.js:207 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202606280002_pedido_compra_fretes_vencimento.js:11 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/migrations/202606300001_delegacao_compra_motivo_vencido.js:23 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606300002_payment_batch_item_comprovante.js:26 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202606300003_payment_batch_item_retorno_banco.js:26 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202607060001_comprovantes_deleted_at_compat.js:10 | COLUNA_BANCO | deleted_at | DataTypes.DATE |
| backend/migrations/202607160001_compras_fechamento_parcial.js:29 | COLUNA_BANCO | fechado_em | DataTypes.DATE |
| backend/migrations/202607160001_compras_fechamento_parcial.js:30 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202607160001_compras_fechamento_parcial.js:31 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202607200001_financeiro_titulos_importacao.js:33 | COLUNA_BANCO | expira_em | DataTypes.DATE |
| backend/migrations/202607200001_financeiro_titulos_importacao.js:34 | COLUNA_BANCO | confirmado_em | DataTypes.DATE |
| backend/migrations/202607200001_financeiro_titulos_importacao.js:35 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202607200001_financeiro_titulos_importacao.js:36 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202607200001_financeiro_titulos_importacao.js:52 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202607200001_financeiro_titulos_importacao.js:53 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202607200001_financeiro_titulos_importacao.js:65 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202607200001_financeiro_titulos_importacao.js:66 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202607210001_cotacao_custos_disponibilidade.js:39 | COLUNA_BANCO | dinamico | DataTypes.DATEONLY |
| backend/migrations/202607210001_cotacao_custos_disponibilidade.js:58 | COLUNA_BANCO | dinamico | DataTypes.DATEONLY |
| backend/migrations/202607210003_sst_ltcat_simplificacao.js:21 | COLUNA_BANCO | data_emissao | DataTypes.DATEONLY |
| backend/migrations/202607210003_sst_ltcat_simplificacao.js:22 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/migrations/202607210003_sst_ltcat_simplificacao.js:23 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/migrations/202607210003_sst_ltcat_simplificacao.js:31 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202607210003_sst_ltcat_simplificacao.js:32 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202607210003_sst_ltcat_simplificacao.js:54 | COLUNA_BANCO | data_avaliacao | DataTypes.DATEONLY |
| backend/migrations/202607210003_sst_ltcat_simplificacao.js:59 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202607210003_sst_ltcat_simplificacao.js:60 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:37 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:42 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:86 | COLUNA_BANCO | publicado_em | DataTypes.DATE |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:164 | COLUNA_BANCO | finalizado_em | DataTypes.DATE |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:205 | COLUNA_BANCO | data_prevista | DataTypes.DATEONLY |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:224 | COLUNA_BANCO | data_medicao | DataTypes.DATEONLY |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:247 | COLUNA_BANCO | processado_em | DataTypes.DATE |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:267 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:268 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:289 | COLUNA_BANCO | prazo_em | DataTypes.DATE |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:295 | COLUNA_BANCO | cumprida_em | DataTypes.DATE |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:317 | COLUNA_BANCO | aprovado_em | DataTypes.DATE |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:318 | COLUNA_BANCO | expira_em | DataTypes.DATE |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:331 | COLUNA_BANCO | concedido_em | DataTypes.DATE |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:332 | COLUNA_BANCO | expira_em | DataTypes.DATE |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:334 | COLUNA_BANCO | revogado_em | DataTypes.DATE |
| backend/migrations/202607280002_custos_recebiveis_fundacao.js:355 | COLUNA_BANCO | criado_em | DataTypes.DATE |
| backend/migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js:61 | COLUNA_BANCO | sequelize | DataTypes.DATEONLY |
| backend/migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js:65 | COLUNA_BANCO | sequelize | DataTypes.DATEONLY |
| backend/migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js:93 | COLUNA_BANCO | data_movimento | DataTypes.DATEONLY |
| backend/migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js:100 | COLUNA_BANCO | estornado_em | DataTypes.DATE |
| backend/migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js:101 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js:102 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js:153 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js:154 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js:190 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js:191 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js:214 | COLUNA_BANCO | data_evento | DataTypes.DATEONLY |
| backend/migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js:218 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js:219 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608120001_dados_cheque_movimentos_baixas.js:23 | COLUNA_BANCO | name | definition.type === 'DATEONLY' ? DataTypes.DATEONLY : DataTypes.STRING(definition.length) |
| backend/migrations/202608120003_governanca_auditoria_operacional.js:12 | COLUNA_BANCO | ocorrido_em | DataTypes.DATE |
| backend/migrations/202608120003_governanca_auditoria_operacional.js:35 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608130001_compra_direta_frete.js:27 | COLUNA_BANCO | frete_data_vencimento | DataTypes.DATEONLY |
| backend/migrations/202608160001_financeiro_dda_base.js:23 | COLUNA_BANCO | iniciado_em | DataTypes.DATE |
| backend/migrations/202608160001_financeiro_dda_base.js:24 | COLUNA_BANCO | finalizado_em | DataTypes.DATE |
| backend/migrations/202608160001_financeiro_dda_base.js:26 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608160001_financeiro_dda_base.js:27 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608160001_financeiro_dda_base.js:50 | COLUNA_BANCO | data_emissao | DataTypes.DATEONLY |
| backend/migrations/202608160001_financeiro_dda_base.js:51 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/migrations/202608160001_financeiro_dda_base.js:61 | COLUNA_BANCO | primeira_consulta_em | DataTypes.DATE |
| backend/migrations/202608160001_financeiro_dda_base.js:62 | COLUNA_BANCO | ultima_consulta_em | DataTypes.DATE |
| backend/migrations/202608160001_financeiro_dda_base.js:63 | COLUNA_BANCO | vinculado_em | DataTypes.DATE |
| backend/migrations/202608160001_financeiro_dda_base.js:65 | COLUNA_BANCO | ignorado_em | DataTypes.DATE |
| backend/migrations/202608160001_financeiro_dda_base.js:68 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608160001_financeiro_dda_base.js:69 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608160001_financeiro_dda_base.js:92 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608160050_obra_tipo_apropriacao_padrao.js:48 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608160050_obra_tipo_apropriacao_padrao.js:49 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608160051_contrato_fluxo_novo.js:68 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608160051_contrato_fluxo_novo.js:69 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608160053_contrato_parcelas.js:29 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/migrations/202608160053_contrato_parcelas.js:53 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608160053_contrato_parcelas.js:54 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608170051_medicao_parcelas.js:42 | COLUNA_BANCO | vencimento_anterior | DataTypes.DATEONLY |
| backend/migrations/202608170051_medicao_parcelas.js:43 | COLUNA_BANCO | vencimento_aplicado | DataTypes.DATEONLY |
| backend/migrations/202608170051_medicao_parcelas.js:46 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608170051_medicao_parcelas.js:47 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608180051_medicao_parcelas_devolucao.js:19 | COLUNA_BANCO | devolvido_em | DataTypes.DATE |
| backend/migrations/202608180054_contrato_aditivos.js:33 | COLUNA_BANCO | nova_vigencia_fim | DataTypes.DATEONLY |
| backend/migrations/202608180054_contrato_aditivos.js:41 | COLUNA_BANCO | aprovado_em | DataTypes.DATE |
| backend/migrations/202608180054_contrato_aditivos.js:44 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608180054_contrato_aditivos.js:45 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608190051_contrato_medicoes.js:40 | COLUNA_BANCO | periodo_inicio | DataTypes.DATEONLY |
| backend/migrations/202608190051_contrato_medicoes.js:41 | COLUNA_BANCO | periodo_fim | DataTypes.DATEONLY |
| backend/migrations/202608190051_contrato_medicoes.js:47 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608190051_contrato_medicoes.js:48 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608200051_catalogacao_itens_manuais.js:71 | COLUNA_BANCO | catalogado_em | DataTypes.DATE |
| backend/migrations/202608200051_catalogacao_itens_manuais.js:94 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608200051_catalogacao_itens_manuais.js:95 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608200051_catalogacao_itens_manuais.js:119 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608200051_catalogacao_itens_manuais.js:120 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608230051_medicao_pagamento_e_aprovacao.js:44 | COLUNA_BANCO | DATE | DataTypes.DATE |
| backend/migrations/202608250050_rh_colaborador_vinculos.js:69 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/migrations/202608250050_rh_colaborador_vinculos.js:71 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/migrations/202608250050_rh_colaborador_vinculos.js:80 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608250050_rh_colaborador_vinculos.js:81 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608250051_rh_solicitacoes.js:90 | COLUNA_BANCO | decidida_em | DataTypes.DATE |
| backend/migrations/202608250051_rh_solicitacoes.js:92 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608250051_rh_solicitacoes.js:93 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608250051_rh_solicitacoes.js:138 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608250051_rh_solicitacoes.js:139 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608250052_rh_solicitacao_anexos.js:62 | COLUNA_BANCO | validade | DataTypes.DATEONLY |
| backend/migrations/202608250052_rh_solicitacao_anexos.js:70 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608250052_rh_solicitacao_anexos.js:71 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608260050_rh_eventos_recorrentes.js:109 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608260050_rh_eventos_recorrentes.js:110 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608260050_rh_eventos_recorrentes.js:150 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608260050_rh_eventos_recorrentes.js:151 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608260053_rh_colaborador_salarios.js:53 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/migrations/202608260053_rh_colaborador_salarios.js:55 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/migrations/202608260053_rh_colaborador_salarios.js:65 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608260053_rh_colaborador_salarios.js:66 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608260055_rh_anexo_validacao.js:55 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202608270001_conciliacao_estornos_bancarios.js:21 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202608270050_solicitacao_pedidos_retorno.js:30 | COLUNA_BANCO | decidido_em | DataTypes.DATE |
| backend/migrations/202608270050_solicitacao_pedidos_retorno.js:32 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608270050_solicitacao_pedidos_retorno.js:33 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608270051_rh_catalogo_cargos_e_documentos.js:126 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608270051_rh_catalogo_cargos_e_documentos.js:127 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608270051_rh_catalogo_cargos_e_documentos.js:178 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608270051_rh_catalogo_cargos_e_documentos.js:179 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608270051_rh_catalogo_cargos_e_documentos.js:196 | COLUNA_BANCO | marcado_em | DataTypes.DATE |
| backend/migrations/202608270051_rh_catalogo_cargos_e_documentos.js:197 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608270051_rh_catalogo_cargos_e_documentos.js:198 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608270055_recarga_cartao_fluxo.js:50 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608270055_recarga_cartao_fluxo.js:51 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608270055_recarga_cartao_fluxo.js:62 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608270055_recarga_cartao_fluxo.js:63 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608270055_recarga_cartao_fluxo.js:79 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608270055_recarga_cartao_fluxo.js:80 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608270055_recarga_cartao_fluxo.js:93 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/migrations/202608270055_recarga_cartao_fluxo.js:95 | COLUNA_BANCO | validado_em | DataTypes.DATE |
| backend/migrations/202608270055_recarga_cartao_fluxo.js:96 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608270055_recarga_cartao_fluxo.js:97 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202608270055_recarga_cartao_fluxo.js:110 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202608270055_recarga_cartao_fluxo.js:111 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609020050_lista_preferencias_filtros.js:63 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609020050_lista_preferencias_filtros.js:64 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609020050_lista_preferencias_filtros.js:78 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609020050_lista_preferencias_filtros.js:79 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609020052_configuracao_por_setor.js:59 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609020052_configuracao_por_setor.js:60 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609020052_configuracao_por_setor.js:73 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609020052_configuracao_por_setor.js:74 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609020052_configuracao_por_setor.js:87 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609020052_configuracao_por_setor.js:88 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609030052_titulo_bloqueio_retorno_obra.js:36 | COLUNA_BANCO | bloqueio_retorno_em | DataTypes.DATE |
| backend/migrations/202609030053_comercial_multiunidade_importacao_sienge.js:66 | COLUNA_BANCO | confirmado_em | DataTypes.DATE |
| backend/migrations/202609030053_comercial_multiunidade_importacao_sienge.js:67 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609030053_comercial_multiunidade_importacao_sienge.js:68 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609030053_comercial_multiunidade_importacao_sienge.js:107 | COLUNA_BANCO | expira_em | DataTypes.DATE |
| backend/migrations/202609030053_comercial_multiunidade_importacao_sienge.js:108 | COLUNA_BANCO | confirmado_em | DataTypes.DATE |
| backend/migrations/202609030053_comercial_multiunidade_importacao_sienge.js:109 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609030053_comercial_multiunidade_importacao_sienge.js:110 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609030053_comercial_multiunidade_importacao_sienge.js:132 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609030053_comercial_multiunidade_importacao_sienge.js:133 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609030053_comercial_multiunidade_importacao_sienge.js:161 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609030053_comercial_multiunidade_importacao_sienge.js:162 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609070050_pedido_compra_gestao_financeira_geo.js:30 | COLUNA_BANCO | financeiro_encaminhado_em | DataTypes.DATE |
| backend/migrations/202609070050_pedido_compra_gestao_financeira_geo.js:36 | COLUNA_BANCO | financeiro_atualizado_em | DataTypes.DATE |
| backend/migrations/202609070050_pedido_compra_gestao_financeira_geo.js:66 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/migrations/202609070050_pedido_compra_gestao_financeira_geo.js:72 | COLUNA_BANCO | liberado_em | DataTypes.DATE |
| backend/migrations/202609070050_pedido_compra_gestao_financeira_geo.js:74 | COLUNA_BANCO | cancelado_em | DataTypes.DATE |
| backend/migrations/202609070050_pedido_compra_gestao_financeira_geo.js:76 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609070050_pedido_compra_gestao_financeira_geo.js:77 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609070050_pedido_compra_gestao_financeira_geo.js:108 | COLUNA_BANCO | solicitado_em | DataTypes.DATE |
| backend/migrations/202609070050_pedido_compra_gestao_financeira_geo.js:110 | COLUNA_BANCO | decidido_em | DataTypes.DATE |
| backend/migrations/202609070050_pedido_compra_gestao_financeira_geo.js:113 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609070050_pedido_compra_gestao_financeira_geo.js:114 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609070050_pedido_compra_gestao_financeira_geo.js:142 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609070050_pedido_compra_gestao_financeira_geo.js:143 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609070051_tipos_solicitacao_por_destino.js:42 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609070051_tipos_solicitacao_por_destino.js:43 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609070052_rh_jornada_periodos_edicao.js:28 | COLUNA_BANCO | periodo_inicio | DataTypes.DATEONLY |
| backend/migrations/202609070052_rh_jornada_periodos_edicao.js:34 | COLUNA_BANCO | periodo_fim | DataTypes.DATEONLY |
| backend/migrations/202609070052_rh_jornada_periodos_edicao.js:73 | COLUNA_BANCO | periodo_inicio | DataTypes.DATEONLY |
| backend/migrations/202609070052_rh_jornada_periodos_edicao.js:74 | COLUNA_BANCO | periodo_fim | DataTypes.DATEONLY |
| backend/migrations/202609070052_rh_jornada_periodos_edicao.js:85 | COLUNA_BANCO | solicitada_em | DataTypes.DATE |
| backend/migrations/202609070052_rh_jornada_periodos_edicao.js:93 | COLUNA_BANCO | decidida_em | DataTypes.DATE |
| backend/migrations/202609070052_rh_jornada_periodos_edicao.js:94 | COLUNA_BANCO | utilizada_em | DataTypes.DATE |
| backend/migrations/202609070052_rh_jornada_periodos_edicao.js:95 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609070052_rh_jornada_periodos_edicao.js:96 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609150001_comercial_unidade_exclusao_logica.js:11 | COLUNA_BANCO | excluido_em | DataTypes.DATE |
| backend/migrations/202609150002_cheques_ciclo_compensacao.js:44 | COLUNA_BANCO | dinamico | DataTypes.DATEONLY |
| backend/migrations/202609150002_cheques_ciclo_compensacao.js:48 | COLUNA_BANCO | dinamico | DataTypes.DATEONLY |
| backend/migrations/202609150002_cheques_ciclo_compensacao.js:52 | COLUNA_BANCO | dinamico | DataTypes.DATEONLY |
| backend/migrations/202609180006_fila_pagamentos_multiplos_comprovantes.js:23 | COLUNA_BANCO | vinculado_em | DataTypes.DATE |
| backend/migrations/202609180006_fila_pagamentos_multiplos_comprovantes.js:24 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609180006_fila_pagamentos_multiplos_comprovantes.js:25 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609200001_controle_diario_contas_divergencias.js:21 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202609200001_controle_diario_contas_divergencias.js:29 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202609240001_painel_gestor_saldos_diarios.js:12 | COLUNA_BANCO | data_referencia | Sequelize.DATEONLY |
| backend/migrations/202609240001_painel_gestor_saldos_diarios.js:18 | COLUNA_BANCO | createdAt | Sequelize.DATE |
| backend/migrations/202609240001_painel_gestor_saldos_diarios.js:19 | COLUNA_BANCO | updatedAt | Sequelize.DATE |
| backend/migrations/202609240001_painel_gestor_saldos_diarios.js:59 | COLUNA_BANCO | data_referencia | Sequelize.DATEONLY |
| backend/migrations/202609240001_painel_gestor_saldos_diarios.js:65 | COLUNA_BANCO | createdAt | Sequelize.DATE |
| backend/migrations/202609240001_painel_gestor_saldos_diarios.js:66 | COLUNA_BANCO | updatedAt | Sequelize.DATE |
| backend/migrations/202609240004_subtipos_multiplos_tipos_solicitacao.js:32 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609240004_subtipos_multiplos_tipos_solicitacao.js:33 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609250001_rh_ticket_beneficio_e_lotes.js:28 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/migrations/202609250001_rh_ticket_beneficio_e_lotes.js:34 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609250001_rh_ticket_beneficio_e_lotes.js:39 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609250001_rh_ticket_beneficio_e_lotes.js:59 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609250001_rh_ticket_beneficio_e_lotes.js:64 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609250002_solicitacao_centro_custo_distribuicoes.js:19 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609250002_solicitacao_centro_custo_distribuicoes.js:24 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609290001_custos_recebiveis_prazos_dilatacao.js:23 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609290001_custos_recebiveis_prazos_dilatacao.js:24 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609290001_custos_recebiveis_prazos_dilatacao.js:75 | COLUNA_BANCO | decidido_em | DataTypes.DATE |
| backend/migrations/202609290001_custos_recebiveis_prazos_dilatacao.js:77 | COLUNA_BANCO | prazo_anterior | DataTypes.DATE |
| backend/migrations/202609290001_custos_recebiveis_prazos_dilatacao.js:78 | COLUNA_BANCO | prazo_novo | DataTypes.DATE |
| backend/migrations/202609290001_custos_recebiveis_prazos_dilatacao.js:99 | COLUNA_BANCO | registrado_em | DataTypes.DATE |
| backend/migrations/202609290002_contrato_rescisao_rastreabilidade.js:10 | COLUNA_BANCO | dinamico | DataTypes.DATE |
| backend/migrations/202609290003_cadastro_obra_solicitacao.js:34 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609290003_cadastro_obra_solicitacao.js:39 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609300002_cadastro_obra_fluxo_independente.js:93 | COLUNA_BANCO | obra_cadastrada_em | DataTypes.DATE |
| backend/migrations/202609300002_cadastro_obra_fluxo_independente.js:95 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609300002_cadastro_obra_fluxo_independente.js:96 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:15 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:16 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:32 | COLUNA_BANCO | decidido_em | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:33 | COLUNA_BANCO | expira_em | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:35 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:36 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:48 | COLUNA_BANCO | vencimento_snapshot | DataTypes.DATEONLY |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:52 | COLUNA_BANCO | decidido_em | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:54 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:55 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:70 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:71 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:85 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:86 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:103 | COLUNA_BANCO | ultimo_uso_em | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:104 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:105 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:119 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202609300004_pagamento_autorizacao_proprietario.js:120 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202610020002_rh_jornada_etapas_pagamento.js:42 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/migrations/202610020002_rh_jornada_etapas_pagamento.js:43 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/migrations/202610020002_rh_jornada_etapas_pagamento.js:45 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202610020002_rh_jornada_etapas_pagamento.js:46 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202610070004_recargas_multiplos_cartoes_origens.js:14 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202610070004_recargas_multiplos_cartoes_origens.js:15 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202610110001_adiantamento_prestacao.js:20 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/migrations/202610110001_adiantamento_prestacao.js:21 | COLUNA_BANCO | validado_em | DataTypes.DATE |
| backend/migrations/202610110001_adiantamento_prestacao.js:22 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202610110001_adiantamento_prestacao.js:22 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202610120001_solicitacao_favorecidos.js:27 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202610120001_solicitacao_favorecidos.js:28 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202610130002_fila_liquidacao_rateada.js:15 | COLUNA_BANCO | estornado_em | DataTypes.DATE |
| backend/migrations/202610130002_fila_liquidacao_rateada.js:16 | COLUNA_BANCO | createdAt | DataTypes.DATE |
| backend/migrations/202610130002_fila_liquidacao_rateada.js:17 | COLUNA_BANCO | updatedAt | DataTypes.DATE |
| backend/migrations/202610180001_rh_inicio_efetivo_obra.js:7 | COLUNA_BANCO | data_inicio_efetivo_obra | DataTypes.DATEONLY |
| backend/src/models/Anexo.js:48 | COLUNA_BANCO | deleted_at | DataTypes.DATE |
| backend/src/models/BaixaFinanceiraComponente.js:23 | COLUNA_BANCO | cheque_data_emissao | DataTypes.DATEONLY |
| backend/src/models/BaixaFinanceiraComponente.js:24 | COLUNA_BANCO | cheque_data_vencimento | DataTypes.DATEONLY |
| backend/src/models/BaixaFinanceiraGrupo.js:8 | COLUNA_BANCO | data_movimento | DataTypes.DATEONLY |
| backend/src/models/BaixaFinanceiraGrupo.js:15 | COLUNA_BANCO | estornado_em | DataTypes.DATE |
| backend/src/models/BoletoCaixa.js:18 | COLUNA_BANCO | data_emissao | DataTypes.DATEONLY |
| backend/src/models/BoletoCaixa.js:19 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/BoletoCaixa.js:20 | COLUNA_BANCO | data_registro | DataTypes.DATEONLY |
| backend/src/models/BoletoCaixa.js:21 | COLUNA_BANCO | data_liquidacao | DataTypes.DATEONLY |
| backend/src/models/BoletoCaixa.js:22 | COLUNA_BANCO | data_baixa | DataTypes.DATEONLY |
| backend/src/models/BoletoCaixaOcorrencia.js:15 | COLUNA_BANCO | data_ocorrencia | DataTypes.DATEONLY |
| backend/src/models/BoletoCaixaOcorrencia.js:16 | COLUNA_BANCO | data_credito | DataTypes.DATEONLY |
| backend/src/models/BoletoCaixaRemessa.js:17 | COLUNA_BANCO | gerado_em | DataTypes.DATE |
| backend/src/models/BoletoCaixaRemessa.js:18 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/src/models/BoletoCaixaRetorno.js:16 | COLUNA_BANCO | processado_em | DataTypes.DATE |
| backend/src/models/CaixaConciliacaoConfirmacao.js:18 | COLUNA_BANCO | data_referencia | DataTypes.DATEONLY |
| backend/src/models/CaixaConciliacaoConfirmacao.js:45 | COLUNA_BANCO | confirmado_em | DataTypes.DATE |
| backend/src/models/CaixaFinanceiroSessao.js:18 | COLUNA_BANCO | data_abertura | DataTypes.DATEONLY |
| backend/src/models/CaixaFinanceiroSessao.js:22 | COLUNA_BANCO | data_fechamento | DataTypes.DATEONLY |
| backend/src/models/CaixaFinanceiroSessao.js:75 | COLUNA_BANCO | fechado_em | DataTypes.DATE |
| backend/src/models/CaixaFinanceiroSessao.js:87 | COLUNA_BANCO | divergencia_solicitada_em | DataTypes.DATE |
| backend/src/models/CaixaFinanceiroSessao.js:95 | COLUNA_BANCO | divergencia_decidida_em | DataTypes.DATE |
| backend/src/models/CaixaPagamentoRemessa.js:15 | COLUNA_BANCO | data_pagamento | DataTypes.DATEONLY |
| backend/src/models/CaixaPagamentoRemessa.js:20 | COLUNA_BANCO | gerado_em | DataTypes.DATE |
| backend/src/models/CaixaPagamentoRemessa.js:21 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/src/models/CaixaPagamentoRemessaItem.js:12 | COLUNA_BANCO | data_pagamento | DataTypes.DATEONLY |
| backend/src/models/CartaoRecargaPrestacao.js:12 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/src/models/CartaoRecargaPrestacao.js:14 | COLUNA_BANCO | validado_em | DataTypes.DATE |
| backend/src/models/ChequeTerceiro.js:39 | COLUNA_BANCO | data_entrada | DataTypes.DATEONLY |
| backend/src/models/ChequeTerceiro.js:40 | COLUNA_BANCO | data_saida | DataTypes.DATEONLY |
| backend/src/models/ChequeTerceiro.js:41 | COLUNA_BANCO | data_deposito | DataTypes.DATEONLY |
| backend/src/models/ChequeTerceiro.js:42 | COLUNA_BANCO | data_compensacao | DataTypes.DATEONLY |
| backend/src/models/ChequeTerceiro.js:43 | COLUNA_BANCO | data_devolucao | DataTypes.DATEONLY |
| backend/src/models/ChequeTerceiro.js:80 | COLUNA_BANCO | data_emissao | DataTypes.DATEONLY |
| backend/src/models/ChequeTerceiro.js:84 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/ChequeTerceiroMovimento.js:13 | COLUNA_BANCO | data_evento | DataTypes.DATEONLY |
| backend/src/models/ComercialContratoImportacao.js:25 | COLUNA_BANCO | expira_em | DataTypes.DATE |
| backend/src/models/ComercialContratoImportacao.js:26 | COLUNA_BANCO | confirmado_em | DataTypes.DATE |
| backend/src/models/Comprovante.js:34 | COLUNA_BANCO | deleted_at | DataTypes.DATE |
| backend/src/models/ConciliacaoBancaria.js:54 | COLUNA_BANCO | data_movimento | DataTypes.DATEONLY |
| backend/src/models/ConciliacaoBancaria.js:75 | COLUNA_BANCO | match_inicial_avaliado_em | DataTypes.DATE |
| backend/src/models/ConciliacaoBancaria.js:99 | COLUNA_BANCO | estorno_avaliado_em | DataTypes.DATE |
| backend/src/models/ConciliacaoBancaria.js:107 | COLUNA_BANCO | confirmado_em | DataTypes.DATE |
| backend/src/models/ConciliacaoBancaria.js:111 | COLUNA_BANCO | deleted_at | DataTypes.DATE |
| backend/src/models/Contrato.js:100 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/src/models/Contrato.js:104 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/src/models/Contrato.js:148 | COLUNA_BANCO | aprovado_em | DataTypes.DATE |
| backend/src/models/Contrato.js:156 | COLUNA_BANCO | rejeitado_em | DataTypes.DATE |
| backend/src/models/Contrato.js:168 | COLUNA_BANCO | rescindido_em | DataTypes.DATE |
| backend/src/models/ContratoAditivo.js:9 | COLUNA_BANCO | nova_vigencia_fim | DataTypes.DATEONLY |
| backend/src/models/ContratoAditivo.js:26 | COLUNA_BANCO | aprovado_em | DataTypes.DATE |
| backend/src/models/ContratoComercial.js:60 | COLUNA_BANCO | data_contrato | DataTypes.DATEONLY |
| backend/src/models/ContratoComercial.js:91 | COLUNA_BANCO | competencia_comissao_data | DataTypes.DATEONLY |
| backend/src/models/ContratoComercial.js:112 | COLUNA_BANCO | data_assinatura | DataTypes.DATEONLY |
| backend/src/models/ContratoComercial.js:136 | COLUNA_BANCO | data_distrato | DataTypes.DATEONLY |
| backend/src/models/ContratoComercialDocumento.js:51 | COLUNA_BANCO | d4sign_enviado_em | DataTypes.DATE |
| backend/src/models/ContratoComercialDocumento.js:55 | COLUNA_BANCO | d4sign_finalizado_em | DataTypes.DATE |
| backend/src/models/ContratoComercialEvento.js:18 | COLUNA_BANCO | data_evento | DataTypes.DATEONLY |
| backend/src/models/ContratoComercialParcela.js:44 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/ContratoComercialParcela.js:48 | COLUNA_BANCO | competencia_data | DataTypes.DATEONLY |
| backend/src/models/ContratoComercialUnidade.js:12 | COLUNA_BANCO | confirmado_em | DataTypes.DATE |
| backend/src/models/ContratoMedicao.js:25 | COLUNA_BANCO | periodo_inicio | DataTypes.DATEONLY |
| backend/src/models/ContratoMedicao.js:26 | COLUNA_BANCO | periodo_fim | DataTypes.DATEONLY |
| backend/src/models/ContratoMedicao.js:39 | COLUNA_BANCO | dados_confirmados_em | DataTypes.DATE |
| backend/src/models/ContratoMedicao.js:43 | COLUNA_BANCO | aprovada_em | DataTypes.DATE |
| backend/src/models/ContratoParcela.js:29 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/ConversaInterna.js:42 | COLUNA_BANCO | last_message_at | DataTypes.DATE |
| backend/src/models/ConversaInterna.js:57 | COLUNA_BANCO | concluida_em | DataTypes.DATE |
| backend/src/models/ConversaInternaAnexo.js:40 | COLUNA_BANCO | deleted_at | DataTypes.DATE |
| backend/src/models/ConversaInternaArquivoUsuario.js:17 | COLUNA_BANCO | arquivada_em | DataTypes.DATE |
| backend/src/models/ConversaInternaMensagem.js:25 | COLUNA_BANCO | editada_em | DataTypes.DATE |
| backend/src/models/ConversaInternaMensagem.js:35 | COLUNA_BANCO | deleted_at | DataTypes.DATE |
| backend/src/models/ConversaInternaParticipante.js:25 | COLUNA_BANCO | lida_em | DataTypes.DATE |
| backend/src/models/CrmAutomationExecution.js:28 | COLUNA_BANCO | processed_at | DataTypes.DATE |
| backend/src/models/CrmAutomationRule.js:21 | COLUNA_BANCO | last_run_at | DataTypes.DATE |
| backend/src/models/CrmChannel.js:25 | COLUNA_BANCO | deleted_at | DataTypes.DATE |
| backend/src/models/CrmConversation.js:28 | COLUNA_BANCO | last_message_at | DataTypes.DATE |
| backend/src/models/CrmConversation.js:30 | COLUNA_BANCO | closed_at | DataTypes.DATE |
| backend/src/models/CrmConversationParticipant.js:11 | COLUNA_BANCO | last_read_at | DataTypes.DATE |
| backend/src/models/CrmIntegrationGoogleEvent.js:21 | COLUNA_BANCO | received_at | DataTypes.DATE |
| backend/src/models/CrmIntegrationGoogleEvent.js:22 | COLUNA_BANCO | processed_at | DataTypes.DATE |
| backend/src/models/CrmIntegrationMetaEvent.js:26 | COLUNA_BANCO | received_at | DataTypes.DATE |
| backend/src/models/CrmIntegrationMetaEvent.js:27 | COLUNA_BANCO | processed_at | DataTypes.DATE |
| backend/src/models/CrmLead.js:51 | COLUNA_BANCO | primeiro_contato_at | DataTypes.DATE |
| backend/src/models/CrmLead.js:52 | COLUNA_BANCO | ultima_interacao_at | DataTypes.DATE |
| backend/src/models/CrmLead.js:53 | COLUNA_BANCO | proximo_followup_at | DataTypes.DATE |
| backend/src/models/CrmLead.js:54 | COLUNA_BANCO | convertido_at | DataTypes.DATE |
| backend/src/models/CrmLead.js:55 | COLUNA_BANCO | archived_at | DataTypes.DATE |
| backend/src/models/CrmMessage.js:24 | COLUNA_BANCO | read_at | DataTypes.DATE |
| backend/src/models/CrmPhoneAsset.js:30 | COLUNA_BANCO | deleted_at | DataTypes.DATE |
| backend/src/models/CrmTask.js:13 | COLUNA_BANCO | due_at | DataTypes.DATE |
| backend/src/models/CrmTask.js:14 | COLUNA_BANCO | completed_at | DataTypes.DATE |
| backend/src/models/FaturaCartaoFinanceiro.js:18 | COLUNA_BANCO | data_inicio | DataTypes.DATEONLY |
| backend/src/models/FaturaCartaoFinanceiro.js:22 | COLUNA_BANCO | data_fechamento | DataTypes.DATEONLY |
| backend/src/models/FaturaCartaoFinanceiro.js:26 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/FaturaCartaoFinanceiro.js:44 | COLUNA_BANCO | data_pagamento | DataTypes.DATEONLY |
| backend/src/models/FinanceiroDdaBoleto.js:17 | COLUNA_BANCO | data_emissao | DataTypes.DATEONLY |
| backend/src/models/FinanceiroDdaBoleto.js:18 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/FinanceiroDdaBoleto.js:28 | COLUNA_BANCO | primeira_consulta_em | DataTypes.DATE |
| backend/src/models/FinanceiroDdaBoleto.js:29 | COLUNA_BANCO | ultima_consulta_em | DataTypes.DATE |
| backend/src/models/FinanceiroDdaBoleto.js:30 | COLUNA_BANCO | vinculado_em | DataTypes.DATE |
| backend/src/models/FinanceiroDdaBoleto.js:32 | COLUNA_BANCO | ignorado_em | DataTypes.DATE |
| backend/src/models/FinanceiroDdaSincronizacao.js:16 | COLUNA_BANCO | iniciado_em | DataTypes.DATE |
| backend/src/models/FinanceiroDdaSincronizacao.js:17 | COLUNA_BANCO | finalizado_em | DataTypes.DATE |
| backend/src/models/FinanceiroTituloImportacao.js:22 | COLUNA_BANCO | expira_em | DataTypes.DATE |
| backend/src/models/FinanceiroTituloImportacao.js:23 | COLUNA_BANCO | confirmado_em | DataTypes.DATE |
| backend/src/models/FinanciamentoBancario.js:61 | COLUNA_BANCO | data_contrato | DataTypes.DATEONLY |
| backend/src/models/FinanciamentoBancario.js:65 | COLUNA_BANCO | data_credito | DataTypes.DATEONLY |
| backend/src/models/FinanciamentoBancario.js:69 | COLUNA_BANCO | primeiro_vencimento | DataTypes.DATEONLY |
| backend/src/models/FinanciamentoBancario.js:104 | COLUNA_BANCO | titulos_gerados_em | DataTypes.DATE |
| backend/src/models/FinanciamentoBancarioParcela.js:22 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/IntegracaoSiengeFila.js:29 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/src/models/MedicaoParcela.js:14 | COLUNA_BANCO | vencimento_anterior | DataTypes.DATEONLY |
| backend/src/models/MedicaoParcela.js:15 | COLUNA_BANCO | vencimento_aplicado | DataTypes.DATEONLY |
| backend/src/models/MedicaoParcela.js:19 | COLUNA_BANCO | devolvido_em | DataTypes.DATE |
| backend/src/models/MovimentoFinanceiro.js:120 | COLUNA_BANCO | cheque_data_emissao | DataTypes.DATEONLY |
| backend/src/models/MovimentoFinanceiro.js:121 | COLUNA_BANCO | cheque_data_vencimento | DataTypes.DATEONLY |
| backend/src/models/MovimentoFinanceiro.js:155 | COLUNA_BANCO | data_movimento | DataTypes.DATEONLY |
| backend/src/models/MovimentoFinanceiro.js:173 | COLUNA_BANCO | estornado_em | DataTypes.DATE |
| backend/src/models/NotificacaoDestinatario.js:20 | COLUNA_BANCO | lida_em | DataTypes.DATE |
| backend/src/models/ObraCustoHistorico.js:35 | COLUNA_BANCO | data_pagamento | DataTypes.DATEONLY |
| backend/src/models/ObraCustoHistorico.js:39 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/PagamentoAutorizacaoItem.js:7 | COLUNA_BANCO | vencimento_snapshot | DataTypes.DATEONLY |
| backend/src/models/PagamentoAutorizacaoItem.js:11 | COLUNA_BANCO | decidido_em | DataTypes.DATE |
| backend/src/models/PagamentoAutorizacaoLote.js:13 | COLUNA_BANCO | decidido_em | DataTypes.DATE |
| backend/src/models/PagamentoAutorizacaoLote.js:14 | COLUNA_BANCO | expira_em | DataTypes.DATE |
| backend/src/models/PagamentoFilaLiquidacao.js:9 | COLUNA_BANCO | estornado_em | DataTypes.DATE |
| backend/src/models/PagamentoManualFilaComprovante.js:12 | COLUNA_BANCO | vinculado_em | DataTypes.DATE |
| backend/src/models/PagamentoManualFilaItem.js:30 | COLUNA_BANCO | data_vencimento_prevista | DataTypes.DATEONLY |
| backend/src/models/PagamentoManualFilaItem.js:34 | COLUNA_BANCO | data_baixa | DataTypes.DATEONLY |
| backend/src/models/PagamentoManualFilaItem.js:54 | COLUNA_BANCO | selecionado_em | DataTypes.DATE |
| backend/src/models/PagamentoManualFilaItem.js:63 | COLUNA_BANCO | processado_em | DataTypes.DATE |
| backend/src/models/PagamentoManualFilaItem.js:71 | COLUNA_BANCO | resolvido_em | DataTypes.DATE |
| backend/src/models/PagamentoManualFilaItem.js:112 | COLUNA_BANCO | comprovante_vinculado_em | DataTypes.DATE |
| backend/src/models/PainelGestorSaldoDiario.js:7 | COLUNA_BANCO | data_referencia | DataTypes.DATEONLY |
| backend/src/models/PainelGestorSaldoHistorico.js:7 | COLUNA_BANCO | data_referencia | DataTypes.DATEONLY |
| backend/src/models/Parceiro.js:32 | COLUNA_BANCO | data_nascimento | DataTypes.DATEONLY |
| backend/src/models/PaymentApproval.js:37 | COLUNA_BANCO | aprovado_em | DataTypes.DATE |
| backend/src/models/PaymentApproval.js:45 | COLUNA_BANCO | mfa_verified_at | DataTypes.DATE |
| backend/src/models/PaymentBatch.js:42 | COLUNA_BANCO | data_programada | DataTypes.DATEONLY |
| backend/src/models/PaymentBatch.js:82 | COLUNA_BANCO | submitted_at | DataTypes.DATE |
| backend/src/models/PaymentBatch.js:90 | COLUNA_BANCO | sent_at | DataTypes.DATE |
| backend/src/models/PaymentBatch.js:94 | COLUNA_BANCO | closed_at | DataTypes.DATE |
| backend/src/models/PaymentBatchItem.js:47 | COLUNA_BANCO | comprovante_gerado_em | DataTypes.DATE |
| backend/src/models/PaymentBatchItem.js:59 | COLUNA_BANCO | confirmado_banco_em | DataTypes.DATE |
| backend/src/models/PaymentBeneficiary.js:64 | COLUNA_BANCO | validado_em | DataTypes.DATE |
| backend/src/models/PaymentBeneficiaryAuditLog.js:46 | COLUNA_BANCO | alterado_em | DataTypes.DATE |
| backend/src/models/PaymentEvent.js:39 | COLUNA_BANCO | received_at | DataTypes.DATE |
| backend/src/models/PaymentEvent.js:44 | COLUNA_BANCO | processed_at | DataTypes.DATE |
| backend/src/models/PaymentIntent.js:35 | COLUNA_BANCO | data_pagamento | DataTypes.DATEONLY |
| backend/src/models/PaymentIntent.js:66 | COLUNA_BANCO | aprovado_em | DataTypes.DATE |
| backend/src/models/PaymentIntent.js:74 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/src/models/PaymentIntent.js:78 | COLUNA_BANCO | confirmado_banco_em | DataTypes.DATE |
| backend/src/models/PaymentIntent.js:82 | COLUNA_BANCO | baixa_confirmada_em | DataTypes.DATE |
| backend/src/models/PaymentIntent.js:90 | COLUNA_BANCO | cancelado_em | DataTypes.DATE |
| backend/src/models/PaymentJob.js:46 | COLUNA_BANCO | next_run_at | DataTypes.DATE |
| backend/src/models/PaymentJob.js:50 | COLUNA_BANCO | locked_at | DataTypes.DATE |
| backend/src/models/PaymentReconciliation.js:31 | COLUNA_BANCO | matched_at | DataTypes.DATE |
| backend/src/models/PaymentTransaction.js:67 | COLUNA_BANCO | started_at | DataTypes.DATE |
| backend/src/models/PaymentTransaction.js:71 | COLUNA_BANCO | finished_at | DataTypes.DATE |
| backend/src/models/PedidoCompra.js:107 | COLUNA_BANCO | frete_data_vencimento | DataTypes.DATEONLY |
| backend/src/models/PedidoCompra.js:132 | COLUNA_BANCO | prazo_finalizacao | DataTypes.DATEONLY |
| backend/src/models/PedidoCompra.js:140 | COLUNA_BANCO | delegado_em | DataTypes.DATE |
| backend/src/models/PedidoCompra.js:148 | COLUNA_BANCO | motivo_atraso_em | DataTypes.DATE |
| backend/src/models/PedidoCompra.js:156 | COLUNA_BANCO | motivo_delegacao_vencida_em | DataTypes.DATE |
| backend/src/models/PedidoCompra.js:164 | COLUNA_BANCO | cancelado_em | DataTypes.DATE |
| backend/src/models/PedidoCompra.js:180 | COLUNA_BANCO | espelho_fornecedor_em | DataTypes.DATE |
| backend/src/models/PedidoCompra.js:184 | COLUNA_BANCO | encerrado_em | DataTypes.DATE |
| backend/src/models/PedidoCompra.js:196 | COLUNA_BANCO | financeiro_encaminhado_em | DataTypes.DATE |
| backend/src/models/PedidoCompra.js:200 | COLUNA_BANCO | financeiro_atualizado_em | DataTypes.DATE |
| backend/src/models/PedidoCompraFrete.js:56 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/PedidoCompraItem.js:112 | COLUNA_BANCO | cancelado_em | DataTypes.DATE |
| backend/src/models/PedidoCompraItemRecebimento.js:5 | COLUNA_BANCO | recebido_em | DataTypes.DATE |
| backend/src/models/PedidoCompraReabertura.js:12 | COLUNA_BANCO | solicitado_em | DataTypes.DATE |
| backend/src/models/PedidoCompraReabertura.js:14 | COLUNA_BANCO | decidido_em | DataTypes.DATE |
| backend/src/models/PedidoCompraTitulo.js:10 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/PedidoCompraTitulo.js:16 | COLUNA_BANCO | liberado_em | DataTypes.DATE |
| backend/src/models/PedidoCompraTitulo.js:18 | COLUNA_BANCO | cancelado_em | DataTypes.DATE |
| backend/src/models/PrioridadeLote.js:57 | COLUNA_BANCO | finalizado_em | DataTypes.DATE |
| backend/src/models/PrioridadeLoteItem.js:30 | COLUNA_BANCO | autorizado_em | DataTypes.DATE |
| backend/src/models/PrioridadeLoteItem.js:34 | COLUNA_BANCO | deleted_at | DataTypes.DATE |
| backend/src/models/ProvisaoFinanceira.js:35 | COLUNA_BANCO | data_prevista_desembolso | DataTypes.DATEONLY |
| backend/src/models/ProvisaoFinanceira.js:68 | COLUNA_BANCO | aprovado_em | DataTypes.DATE |
| backend/src/models/ProvisaoFinanceira.js:76 | COLUNA_BANCO | cancelado_em | DataTypes.DATE |
| backend/src/models/ProvisaoFinanceira.js:80 | COLUNA_BANCO | realizado_em | DataTypes.DATE |
| backend/src/models/RhApuracao.js:40 | COLUNA_BANCO | periodo_inicio | DataTypes.DATEONLY |
| backend/src/models/RhApuracao.js:41 | COLUNA_BANCO | periodo_fim | DataTypes.DATEONLY |
| backend/src/models/RhApuracao.js:42 | COLUNA_BANCO | data_prevista_pagamento | DataTypes.DATEONLY |
| backend/src/models/RhApuracaoEvento.js:90 | COLUNA_BANCO | ajustado_em | DataTypes.DATE |
| backend/src/models/RhColaborador.js:72 | COLUNA_BANCO | data_inicio | DataTypes.DATEONLY |
| backend/src/models/RhColaborador.js:76 | COLUNA_BANCO | data_inicio_efetivo_obra | DataTypes.DATEONLY |
| backend/src/models/RhColaborador.js:80 | COLUNA_BANCO | data_admissao | DataTypes.DATEONLY |
| backend/src/models/RhColaborador.js:84 | COLUNA_BANCO | data_demissao | DataTypes.DATEONLY |
| backend/src/models/RhColaborador.js:88 | COLUNA_BANCO | data_nascimento | DataTypes.DATEONLY |
| backend/src/models/RhColaboradorCalculoHistorico.js:9 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/src/models/RhColaboradorCalculoHistorico.js:10 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/src/models/RhColaboradorSalario.js:7 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/src/models/RhColaboradorSalario.js:9 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/src/models/RhColaboradorVinculo.js:22 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/src/models/RhColaboradorVinculo.js:27 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/src/models/RhDocumento.js:38 | COLUNA_BANCO | validade | DataTypes.DATEONLY |
| backend/src/models/RhFechamento.js:23 | COLUNA_BANCO | data_fechamento | DataTypes.DATEONLY |
| backend/src/models/RhFechamento.js:27 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/RhImportacao.js:29 | COLUNA_BANCO | periodo_inicio | DataTypes.DATEONLY |
| backend/src/models/RhImportacao.js:33 | COLUNA_BANCO | periodo_fim | DataTypes.DATEONLY |
| backend/src/models/RhImportacao.js:91 | COLUNA_BANCO | confirmado_em | DataTypes.DATE |
| backend/src/models/RhJornadaEdicao.js:10 | COLUNA_BANCO | periodo_inicio | DataTypes.DATEONLY |
| backend/src/models/RhJornadaEdicao.js:11 | COLUNA_BANCO | periodo_fim | DataTypes.DATEONLY |
| backend/src/models/RhJornadaEdicao.js:16 | COLUNA_BANCO | solicitada_em | DataTypes.DATE |
| backend/src/models/RhJornadaEdicao.js:18 | COLUNA_BANCO | decidida_em | DataTypes.DATE |
| backend/src/models/RhJornadaEdicao.js:19 | COLUNA_BANCO | utilizada_em | DataTypes.DATE |
| backend/src/models/RhSolicitacao.js:24 | COLUNA_BANCO | decidida_em | DataTypes.DATE |
| backend/src/models/RhSolicitacaoAnexo.js:12 | COLUNA_BANCO | validade | DataTypes.DATEONLY |
| backend/src/models/RhSolicitacaoAnexo.js:19 | COLUNA_BANCO | validado_em | DataTypes.DATE |
| backend/src/models/RhSolicitacaoChecklist.js:14 | COLUNA_BANCO | marcado_em | DataTypes.DATE |
| backend/src/models/RhTicketLote.js:12 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/Solicitacao.js:116 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/Solicitacao.js:120 | COLUNA_BANCO | data_demissao | DataTypes.DATEONLY |
| backend/src/models/Solicitacao.js:124 | COLUNA_BANCO | data_inicio_medicao | DataTypes.DATEONLY |
| backend/src/models/Solicitacao.js:128 | COLUNA_BANCO | data_fim_medicao | DataTypes.DATEONLY |
| backend/src/models/Solicitacao.js:149 | COLUNA_BANCO | aprovada_diretoria_em | DataTypes.DATE |
| backend/src/models/Solicitacao.js:158 | COLUNA_BANCO | prioridade_diretoria_em | DataTypes.DATE |
| backend/src/models/Solicitacao.js:188 | COLUNA_BANCO | financeiro_pendencia_marcado_em | DataTypes.DATE |
| backend/src/models/Solicitacao.js:196 | COLUNA_BANCO | financeiro_pendencia_regularizado_em | DataTypes.DATE |
| backend/src/models/SolicitacaoAdiantamento.js:13 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/src/models/SolicitacaoAdiantamento.js:15 | COLUNA_BANCO | validado_em | DataTypes.DATE |
| backend/src/models/SolicitacaoAtencaoUsuario.js:6 | COLUNA_BANCO | evento_em | DataTypes.DATE |
| backend/src/models/SolicitacaoAtencaoUsuario.js:7 | COLUNA_BANCO | lido_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCadastroObraDados.js:13 | COLUNA_BANCO | obra_cadastrada_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCompra.js:46 | COLUNA_BANCO | data_integracao_sienge | DataTypes.DATE |
| backend/src/models/SolicitacaoCompra.js:50 | COLUNA_BANCO | liberado_para_compra_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCompra.js:54 | COLUNA_BANCO | encerrado_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCompra.js:62 | COLUNA_BANCO | necessario_para | DataTypes.DATEONLY |
| backend/src/models/SolicitacaoCompra.js:74 | COLUNA_BANCO | prazo_compra | DataTypes.DATEONLY |
| backend/src/models/SolicitacaoCompra.js:82 | COLUNA_BANCO | delegado_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCompra.js:90 | COLUNA_BANCO | motivo_atraso_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCompra.js:98 | COLUNA_BANCO | motivo_delegacao_vencida_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCompra.js:127 | COLUNA_BANCO | frete_data_vencimento | DataTypes.DATEONLY |
| backend/src/models/SolicitacaoCompraAlocacao.js:107 | COLUNA_BANCO | realizado_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCompraAlocacao.js:127 | COLUNA_BANCO | cancelado_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCompraFechamento.js:18 | COLUNA_BANCO | fechado_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCompraFornecedor.js:28 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCompraFornecedor.js:32 | COLUNA_BANCO | visualizado_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCompraFornecedor.js:36 | COLUNA_BANCO | respondido_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCompraFornecedor.js:40 | COLUNA_BANCO | prazo_resposta | DataTypes.DATEONLY |
| backend/src/models/SolicitacaoCompraFornecedor.js:85 | COLUNA_BANCO | frete_data_vencimento | DataTypes.DATEONLY |
| backend/src/models/SolicitacaoCompraItem.js:63 | COLUNA_BANCO | necessario_para | DataTypes.DATEONLY |
| backend/src/models/SolicitacaoCompraItemManual.js:59 | COLUNA_BANCO | necessario_para | DataTypes.DATEONLY |
| backend/src/models/SolicitacaoCompraItemManual.js:83 | COLUNA_BANCO | catalogado_em | DataTypes.DATE |
| backend/src/models/SolicitacaoCompraRespostaItem.js:81 | COLUNA_BANCO | data_chegada | DataTypes.DATEONLY |
| backend/src/models/SolicitacaoCompraRespostaItem.js:90 | COLUNA_BANCO | deleted_at | DataTypes.DATE |
| backend/src/models/SolicitacaoInteracaoUsuario.js:6 | COLUNA_BANCO | evento_em | DataTypes.DATE |
| backend/src/models/SolicitacaoInteracaoUsuario.js:7 | COLUNA_BANCO | lido_em | DataTypes.DATE |
| backend/src/models/SolicitacaoPagamento.js:18 | COLUNA_BANCO | data_pagamento | DataTypes.DATEONLY |
| backend/src/models/SolicitacaoPedidoRetorno.js:12 | COLUNA_BANCO | decidido_em | DataTypes.DATE |
| backend/src/models/TabelaPrecoComercial.js:27 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/src/models/TabelaPrecoComercial.js:31 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/src/models/TituloFinanceiro.js:116 | COLUNA_BANCO | data_compra | DataTypes.DATEONLY |
| backend/src/models/TituloFinanceiro.js:120 | COLUNA_BANCO | competencia_data | DataTypes.DATEONLY |
| backend/src/models/TituloFinanceiro.js:210 | COLUNA_BANCO | boleto_emitido_em | DataTypes.DATEONLY |
| backend/src/models/TituloFinanceiro.js:240 | COLUNA_BANCO | data_emissao | DataTypes.DATEONLY |
| backend/src/models/TituloFinanceiro.js:244 | COLUNA_BANCO | data_vencimento | DataTypes.DATEONLY |
| backend/src/models/TituloFinanceiro.js:248 | COLUNA_BANCO | data_quitacao | DataTypes.DATEONLY |
| backend/src/models/TituloFinanceiro.js:281 | COLUNA_BANCO | bloqueio_retorno_em | DataTypes.DATE |
| backend/src/models/TituloFinanceiro.js:285 | COLUNA_BANCO | deleted_at | DataTypes.DATE |
| backend/src/models/TransferenciaFinanceira.js:50 | COLUNA_BANCO | data_transferencia | DataTypes.DATEONLY |
| backend/src/models/TransferenciaFinanceira.js:93 | COLUNA_BANCO | cancelado_em | DataTypes.DATE |
| backend/src/models/TreinamentoConteudo.js:21 | COLUNA_BANCO | publicado_em | DataTypes.DATE |
| backend/src/models/TreinamentoLeituraUsuario.js:7 | COLUNA_BANCO | visualizado_em | DataTypes.DATE |
| backend/src/models/TreinamentoLeituraUsuario.js:8 | COLUNA_BANCO | concluido_em | DataTypes.DATE |
| backend/src/models/UnidadeComercial.js:63 | COLUNA_BANCO | reservado_ate | DataTypes.DATEONLY |
| backend/src/models/UnidadeComercial.js:76 | COLUNA_BANCO | excluido_em | DataTypes.DATE |
| backend/src/models/User.js:50 | COLUNA_BANCO | ultimo_acesso_em | DataTypes.DATE |
| backend/src/models/User.js:78 | COLUNA_BANCO | password_reset_expires_at | DataTypes.DATE |
| backend/src/models/User.js:83 | COLUNA_BANCO | password_changed_at | DataTypes.DATE |
| backend/src/models/User.js:88 | COLUNA_BANCO | password_setup_sent_at | DataTypes.DATE |
| backend/src/models/User.js:121 | COLUNA_BANCO | mfa_totp_last_verified_at | DataTypes.DATE |
| backend/src/models/WebauthnCredential.js:12 | COLUNA_BANCO | ultimo_uso_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrAuditoria.js:14 | COLUNA_BANCO | criado_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrCompetencia.js:14 | COLUNA_BANCO | finalizado_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrDilatacao.js:12 | COLUNA_BANCO | decidido_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrDilatacao.js:14 | COLUNA_BANCO | prazo_anterior | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrDilatacao.js:15 | COLUNA_BANCO | prazo_novo | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrGuardBypass.js:9 | COLUNA_BANCO | concedido_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrGuardBypass.js:10 | COLUNA_BANCO | expira_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrGuardBypass.js:12 | COLUNA_BANCO | revogado_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrMedicaoConsolidada.js:12 | COLUNA_BANCO | data_medicao | DataTypes.DATEONLY |
| backend/src/modules/custosRecebiveis/models/CrMedicaoSemRegistro.js:8 | COLUNA_BANCO | registrado_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrObrigacaoUsuario.js:13 | COLUNA_BANCO | prazo_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrObrigacaoUsuario.js:15 | COLUNA_BANCO | cumprida_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrPlanoObra.js:12 | COLUNA_BANCO | publicado_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrPrevisaoReceita.js:13 | COLUNA_BANCO | data_prevista | DataTypes.DATEONLY |
| backend/src/modules/custosRecebiveis/models/CrReabertura.js:10 | COLUNA_BANCO | aprovado_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrReabertura.js:11 | COLUNA_BANCO | expira_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrRealizado.js:13 | COLUNA_BANCO | processado_em | DataTypes.DATE |
| backend/src/modules/custosRecebiveis/models/CrResponsavelObra.js:13 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/src/modules/custosRecebiveis/models/CrResponsavelObra.js:14 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/src/modules/esocial/models/EsocialCertificateLog.js:12 | COLUNA_BANCO | valid_from | DataTypes.DATE |
| backend/src/modules/esocial/models/EsocialCertificateLog.js:13 | COLUNA_BANCO | valid_to | DataTypes.DATE |
| backend/src/modules/esocial/models/EsocialEvento.js:16 | COLUNA_BANCO | data_referencia | DataTypes.DATEONLY |
| backend/src/modules/esocial/models/EsocialEvento.js:26 | COLUNA_BANCO | preparado_em | DataTypes.DATE |
| backend/src/modules/esocial/models/EsocialEvento.js:27 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/src/modules/esocial/models/EsocialEvento.js:28 | COLUNA_BANCO | processado_em | DataTypes.DATE |
| backend/src/modules/esocial/models/EsocialLote.js:16 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/src/modules/esocial/models/EsocialLote.js:17 | COLUNA_BANCO | processado_em | DataTypes.DATE |
| backend/src/modules/esocial/models/EsocialRetorno.js:12 | COLUNA_BANCO | recebido_em | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalAccountingBatch.js:8 | COLUNA_BANCO | period_start | DataTypes.DATEONLY |
| backend/src/modules/fiscal/models/FiscalAccountingBatch.js:9 | COLUNA_BANCO | period_end | DataTypes.DATEONLY |
| backend/src/modules/fiscal/models/FiscalAccountingBatch.js:16 | COLUNA_BANCO | generated_at | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalCertificate.js:11 | COLUNA_BANCO | valid_from | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalCertificate.js:12 | COLUNA_BANCO | valid_until | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalCertificate.js:17 | COLUNA_BANCO | last_validated_at | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalDfeDocument.js:14 | COLUNA_BANCO | emission_date | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalDfeDocument.js:15 | COLUNA_BANCO | received_at | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalDfeEvent.js:9 | COLUNA_BANCO | event_date | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalDfeSyncState.js:10 | COLUNA_BANCO | last_success_at | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalDfeSyncState.js:11 | COLUNA_BANCO | last_attempt_at | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalDfeSyncState.js:12 | COLUNA_BANCO | next_allowed_sync_at | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalDfeSyncState.js:18 | COLUNA_BANCO | locked_until | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalDivergence.js:14 | COLUNA_BANCO | resolved_at | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalDocumentLink.js:22 | COLUNA_BANCO | confirmed_at | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalSyncLog.js:8 | COLUNA_BANCO | started_at | DataTypes.DATE |
| backend/src/modules/fiscal/models/FiscalSyncLog.js:9 | COLUNA_BANCO | finished_at | DataTypes.DATE |
| backend/src/modules/governanca/models/GovernancaEventoOperacional.js:6 | COLUNA_BANCO | ocorrido_em | DataTypes.DATE |
| backend/src/modules/governanca/models/GovernancaSnapshot.js:5 | COLUNA_BANCO | data_referencia | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstAcidente.js:11 | COLUNA_BANCO | data_ocorrencia | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstAso.js:11 | COLUNA_BANCO | data_exame | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstAso.js:12 | COLUNA_BANCO | validade | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstBloqueioOperacional.js:15 | COLUNA_BANCO | resolvido_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstCacheEntry.js:9 | COLUNA_BANCO | expires_at | DataTypes.DATE |
| backend/src/modules/sst/models/SstCacheEntry.js:10 | COLUNA_BANCO | last_hit_at | DataTypes.DATE |
| backend/src/modules/sst/models/SstComplianceScore.js:13 | COLUNA_BANCO | calculado_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstDocumento.js:14 | COLUNA_BANCO | validade | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstDocumentoAnaliseIa.js:19 | COLUNA_BANCO | processado_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstDocumentoAnaliseIa.js:20 | COLUNA_BANCO | aprovado_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstDocumentoAnaliseIa.js:22 | COLUNA_BANCO | rejeitado_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstEpiEntrega.js:11 | COLUNA_BANCO | entrega_em | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstEpiEntrega.js:12 | COLUNA_BANCO | validade | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstEventoEsocial.js:15 | COLUNA_BANCO | enviado_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstExame.js:11 | COLUNA_BANCO | data_exame | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstExame.js:12 | COLUNA_BANCO | validade | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstExposicao.js:11 | COLUNA_BANCO | data_inicio | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstExposicao.js:12 | COLUNA_BANCO | data_fim | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstJob.js:11 | COLUNA_BANCO | next_run_at | DataTypes.DATE |
| backend/src/modules/sst/models/SstJob.js:12 | COLUNA_BANCO | started_at | DataTypes.DATE |
| backend/src/modules/sst/models/SstJob.js:13 | COLUNA_BANCO | finished_at | DataTypes.DATE |
| backend/src/modules/sst/models/SstJob.js:14 | COLUNA_BANCO | locked_at | DataTypes.DATE |
| backend/src/modules/sst/models/SstLtcat.js:9 | COLUNA_BANCO | data_emissao | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstLtcat.js:10 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstLtcat.js:11 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstLtcatAvaliacao.js:18 | COLUNA_BANCO | data_avaliacao | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstNotificacao.js:18 | COLUNA_BANCO | lida_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstOperationalAlert.js:16 | COLUNA_BANCO | resolvido_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstPcmso.js:9 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstPcmso.js:10 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstPendenciaOperacional.js:16 | COLUNA_BANCO | prazo_limite | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstPendenciaOperacional.js:17 | COLUNA_BANCO | resolvida_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstPerformanceMetric.js:12 | COLUNA_BANCO | sampled_at | DataTypes.DATE |
| backend/src/modules/sst/models/SstPgr.js:8 | COLUNA_BANCO | vigencia_inicio | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstPgr.js:9 | COLUNA_BANCO | vigencia_fim | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstQualityIssue.js:16 | COLUNA_BANCO | resolvido_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstQueueMetric.js:13 | COLUNA_BANCO | sampled_at | DataTypes.DATE |
| backend/src/modules/sst/models/SstRolloutPlano.js:18 | COLUNA_BANCO | iniciado_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstRolloutPlano.js:19 | COLUNA_BANCO | encerrado_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstRolloutPlano.js:20 | COLUNA_BANCO | rollback_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstTreinamento.js:10 | COLUNA_BANCO | data_inicio | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstTreinamento.js:11 | COLUNA_BANCO | data_fim | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstTreinamento.js:12 | COLUNA_BANCO | validade | DataTypes.DATEONLY |
| backend/src/modules/sst/models/SstWorkflowExecucao.js:12 | COLUNA_BANCO | iniciado_em | DataTypes.DATE |
| backend/src/modules/sst/models/SstWorkflowExecucao.js:13 | COLUNA_BANCO | finalizado_em | DataTypes.DATE |

## Erros de leitura

Nenhum arquivo deixou de ser analisado pelo parser.
