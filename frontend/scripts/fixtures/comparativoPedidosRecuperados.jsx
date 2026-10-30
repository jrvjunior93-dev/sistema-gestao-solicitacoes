import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {SecaoComparativo} from '../../src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao';
import {AuthContext} from '../../src/contexts/AuthContext';
import {ThemeContext,TEMA_PADRAO} from '../../src/contexts/ThemeContext';
import '../../src/index.css';
import '../../src/styles/design-tokens.css';
import '../../src/styles/escala.css';
import '../../src/styles/componentes-padrao.css';
import '../../src/styles/responsive-system.css';
import '../../src/modules/solicitacao-compra/compras-responsive.css';
const pedidoItem=(id,tipo,origem,quantidade,preco,total)=>({pedido_item_id:id,item_tipo:tipo,
  solicitacao_compra_item_manual_id:tipo==='MANUAL'?origem:null,solicitacao_compra_item_id:tipo==='CADASTRADO'?origem:null,
  descricao:'Registro <script>window.indevido=true</script>',quantidade,preco_unitario:preco,valor_total:total,unidade:'un'});
const pedido=(id,status,itens)=>({pedido_id:id,status_pedido:status,fornecedor_nome:'Mercado Pago',valor_atual_pedido:status==='CANCELADO'?'0.00':itens[0].valor_total,condicao_pagamento_pedido:'Cartão em 10 parcelas',itens});
const pedidos=[pedido(313,'CANCELADO',[pedidoItem(906,'MANUAL',2,10,'25.1820000000','251.82'),pedidoItem(907,'MANUAL',4,50,'2.3998000000','119.99')]),
  pedido(314,'FECHADO_FORNECEDOR',[pedidoItem(908,'MANUAL',4,50,'2.3998000000','119.99')]),
  pedido(315,'FECHADO_FORNECEDOR',[pedidoItem(909,'MANUAL',2,10,'25.1820000000','251.82')]),
  pedido(316,'FECHADO_FORNECEDOR',[pedidoItem(910,'MANUAL',3,4,'154.3980000000','617.59')])];
// Cenário de QA: registros sem vinculo e IDs iguais em tipos distintos nunca sao ligados por descricao.
pedidos[0].itens.push(pedidoItem(911,'MANUAL',null,null,null,null));
pedidos[0].itens.push(pedidoItem(912,'CADASTRADO',2,1,'9.0000000000','9.00'));
const atual={resposta_item_id:2115,cotacao_fornecedor_id:327,fornecedor_id:11,fornecedor_nome:'Mercado Pago',preco:'154.3980000000',quantidade_disponivel:4,saldo_disponivel_fornecedor:4,disponivel:true,valor_total_cotado:926.39};
const comparativo={fornecedores:[{id:327,fornecedor_id:11,nome:'Mercado Pago',status:'RESPONDIDO'}],pedidos_recuperados:pedidos,
  itens:['Placa obra','Cones','Placa cavalete','Tela'].map((nome,index)=>({id:index+1,item_referencia_id:index+1,item_tipo:'MANUAL',nome,quantidade:10,saldo_disponivel:6,quantidade_fechada:0,respostas:index===2?[atual]:[]}))};
function App(){const [selecionados,setSelecionados]=useState({});
  window.qaSelecao=selecionados;
  return <MemoryRouter><AuthContext.Provider value={{user:{perfil:'SUPERADMIN'}}}><ThemeContext.Provider value={{tema:TEMA_PADRAO}}>
    <div className="layout-shell compras-responsive-scope"><main className="layout-main app-page p-3 bg-[var(--c-bg)] text-[var(--c-text)]"><SecaoComparativo comparativo={comparativo} solicitacao={{id:724,alocacoes:[],pedidos:[]}}
      podeComprar podeEncerrar podeEditarResposta vencedoresSelecionados={selecionados}
      onVencedorChange={({resposta,quantidade})=>setSelecionados(s=>({...s,[resposta.resposta_item_id]:{quantidade_alocada:quantidade,quantidade_alocada_input:String(quantidade)}}))}
      onEditarRespostaFornecedor={()=>{window.qaEditou=true;}} onEncerrar={()=>{window.qaGerou=true;}} /></main></div>
  </ThemeContext.Provider></AuthContext.Provider></MemoryRouter>;
}
createRoot(document.getElementById('root')).render(<App/>);
