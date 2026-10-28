
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import Pedido from'/src/modules/solicitacao-compra/components/PedidoCompraFinanceiro.jsx';
import{AuthContext}from'/src/contexts/AuthContext.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';
const readOnly=new URLSearchParams(location.search).has('leitura');
const user=readOnly?{id:8,perfil:'USUARIO',areas_permissoes_configuradas:true,areas_permissoes:['compras.pedidos.financeiro.visualizar']}:{id:7,perfil:'SUPERADMIN'};
const initial={id:77,status:'FECHADO_FORNECEDOR',valor_total:100,valor_total_fornecedor:100,fornecedor:{nome:'Credor QA',parceiro_id:1},obra:{nome:'Obra QA'},fretes:[],
 financeiro:{legado:false,status:'CONCLUIDO',titulos:[{origem:'LEGADO_CONFIRMADO',titulo:{id:901,codigo:'TIT-QA-QUITADO',valor_original:60,status:'QUITADO'}}],
 opcoes:{categoria_padrao_id:1,categorias:[{id:1,nome:'Material QA'}],formas_pagamento:[{id:1,nome:'Transferencia'}],cartoes:[]}}};
const h=React.createElement;
function App(){const[p,setP]=useState(initial);const[n,setN]=useState('');return h(AuthContext.Provider,{value:{user}},h(ThemeContext.Provider,{value:{tema:TEMA_PADRAO}},h('main',{className:'p-4'},h('div',{role:'status'},n),h(Pedido,{pedido:p,user,avisar:{sucesso:setN,erro:setN,alerta:setN},onAtualizar:()=>setP(old=>({...old,financeiro:{...old.financeiro,titulos:[...old.financeiro.titulos,{origem:'NOVO_FLUXO',titulo:{id:902,codigo:'TIT-QA-NOVO',valor_original:100,status:'ABERTO'}}]}}))}))))}
createRoot(document.getElementById('root')).render(h(BrowserRouter,null,h(App)));
