'use strict';
// Handlers reais em memoria; nao carrega app, modelos, .env ou banco.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateSolicitacaoValorBody, validateSolicitacaoDataVencimentoBody } = require('../src/validators/operationalValidators');
const fonte = fs.readFileSync(path.join(__dirname, '../src/controllers/SolicitacaoController.js'), 'utf8');

async function verificar(nome, campo, acao) {
  const match = fonte.match(new RegExp(`async ${nome}\\(req, res\\) \\{[\\s\\S]*?\\n  \\},`));
  assert.ok(match);
  for (const perfil of ['SUPERADMIN', 'ADMIN', 'USUARIO']) {
    for (const autorizado of [false, true]) {
      for (const acesso of [false, true]) {
        const alteracoes=[],historicos=[],notificacoes=[],eventos=[];
        const registro={id:90,codigo:'SOL-QA90',valor:1000,data_vencimento:'2099-10-10',
          update:async data=>alteracoes.push(data)};
        const context={
          isSetorGeo:async()=>perfil==='ADMIN',
          userHasAreaPermissionWhenConfigured:async(user,keys)=>{
            assert.deepEqual(Array.from(keys),[campo==='valor'?'solicitacoes.acoes.alterar_valor':'solicitacoes.acoes.alterar_data_vencimento']);
            return autorizado;
          },
          Solicitacao:{findByPk:async()=>registro},validarAcessoObra:async()=>acesso,
          User:{findByPk:async()=>({nome:'Usuario QA'})},
          Historico:{create:async data=>historicos.push(data)},
          criarNotificacao:async data=>notificacoes.push(data),
          publishSolicitacaoRealtimeEvent:async data=>eventos.push(data),console
        };
        const handler=vm.runInNewContext(`({${match[0].slice(0,-1)}}).${nome}`,context);
        const req={params:{id:90},user:{id:1,perfil,area:'GEO'},body:{[campo]:campo==='valor'?2000:'2099-12-31'}};
        const res={statusCode:200,status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;},sendStatus(code){this.statusCode=code;return this;}};
        await handler(req,res);
        const permitido=acesso&&(perfil==='SUPERADMIN'||perfil==='ADMIN'||autorizado);
        assert.equal(res.statusCode,permitido?204:403);
        assert.equal(alteracoes.length,permitido?1:0);
        assert.equal(historicos.length,permitido?1:0);
        assert.equal(notificacoes.length,permitido?1:0);
        assert.equal(eventos.length,permitido?1:0);
        if(permitido){
          assert.deepEqual(Object.keys(alteracoes[0]),[campo]);assert.equal(historicos[0].acao,acao);
          req.body={[campo]:campo==='valor'?null:undefined};await handler(req,res);
          assert.equal(res.statusCode,204);assert.equal(alteracoes[1][campo],null);
        }
      }
    }
  }
}
(async()=>{
  assert.equal(validateSolicitacaoValorBody({valor:0}).valor,0);
  assert.equal(validateSolicitacaoValorBody({valor:null}).valor,null);
  assert.throws(()=>validateSolicitacaoValorBody({valor:-1}));
  assert.throws(()=>validateSolicitacaoValorBody({valor:Infinity}));
  assert.throws(()=>validateSolicitacaoValorBody({valor:2000,status:'PAGA'}));
  assert.equal(validateSolicitacaoDataVencimentoBody({data_vencimento:null}).data_vencimento,undefined);
  assert.throws(()=>validateSolicitacaoDataVencimentoBody({data_vencimento:'2000-01-01'}));
  await verificar('atualizarValor','valor','VALOR_ATUALIZADO');
  await verificar('atualizarDataVencimento','data_vencimento','DATA_VENCIMENTO_ATUALIZADA');
  console.log('Edicao validada: controllers/validadores reais, ACL, obra, campos isolados, historico, notificacao e realtime. Sem banco/rede.');
})().catch(error=>{console.error(error);process.exitCode=1;});
