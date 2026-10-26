import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'vite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const server=await createServer({root,logLevel:'error',server:{middlewareMode:true}});
try {
  const acesso=await server.ssrLoadModule('/src/utils/acessoProduto.js');
  const nav=await server.ssrLoadModule('/src/navigation/navigationConfig.jsx');
  const generated=createRequire(import.meta.url)('../../backend/src/generated/navegacaoFonteUnica.cjs');
  const modules=[{key:'OBRAS',enabled:true}];
  const user=(perfil,keys=[])=>({perfil,setor:{codigo:'GEO',eh_setor_geo:true},areas_permissoes_configuradas:true,areas_permissoes:keys,modulos_habilitados:modules});
  const cases=[
    ['ADMIN GEO com permissao especifica',user('ADMIN',['obras.gestao.apropriacoes']),true],
    ['Usuario com permissao especifica',user('USUARIO',['obras.gestao.apropriacoes']),true],
    ['Somente configuracoes nao concede gestao',user('ADMIN',['configuracoes.geral.gerenciar','configuracoes.cadastros.gerenciar']),false],
    ['Visualizacao de gestao nao concede edicao',user('ADMIN',['obras.gestao.visualizar']),false],
    ['Sem permissao nao concede gestao',user('ADMIN'),false],
    ['Permissao financeira nao concede gestao',user('USUARIO',['financeiro.titulos.visualizar']),false],
    ['OBRAS desabilitado bloqueia permissao especifica',{...user('ADMIN',['obras.gestao.apropriacoes']),modulos_habilitados:[{key:'OBRAS',enabled:false}]},false],
    ['Administrador preservado',user('ADMINISTRADOR'),true],
    ['Superadmin preservado',user('SUPERADMIN'),true]
  ];
  for(const [label,u,expected]of cases){
    assert.equal(acesso.canManageGestaoObrasApropriacoes(u),expected,label);
    for(const catalog of [nav,generated]){
      const mod=catalog.NAV_MODULES.find(m=>m.id==='cadastros');
      const visible=catalog.getVisibleItems(u).some(item=>item.id==='cad-apropriacoes');
      assert.equal(visible,expected,label+' menu/catalogo');
      assert.equal(catalog.getSecoesConfiguracoes(u).some(section=>section.itens.some(item=>item.id==='cad-apropriacoes')),expected,label+' hub de configuracoes');
      if(expected)assert.equal(mod.gate(u),true,label+' modulo pai');
    }
  }
  const item=nav.NAV_MODULES.find(m=>m.id==='cadastros').children.find(i=>i.id==='cad-apropriacoes');
  assert.equal(item.secaoConfig,'cadastros','A pagina precisa estar no hub de Configuracoes');
  const app=readFileSync(path.join(root,'src/App.jsx'),'utf8');
  assert.match(app,/function GestaoApropriacoesRoute\(\{ children \}\)\s*\{[\s\S]*?!canManageGestaoObrasApropriacoes\(user\)/);
  assert.match(app,/<Route path="gestao-apropriacoes" element=\{<GestaoApropriacoesRoute><GestaoApropriacoes \/><\/GestaoApropriacoesRoute>\}/);
  assert.doesNotMatch(app,/<Route path="gestao-apropriacoes"[^\n]*BusinessAdminRoute/);
  console.log('OK: permissao especifica, ADMIN/USUARIO, negativas de configuracao/leitura/modulo, perfis administrativos, menu pai, hub e catalogo backend. Nenhum banco acessado.');
} finally {await server.close();}
