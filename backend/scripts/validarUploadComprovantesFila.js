'use strict';
// HTTP apenas em loopback/porta efemera. Multer, assinatura e middleware reais;
// antivirus/log isolados, sem env/models/S3/banco externos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
let scans = 0, logs = 0, bloquearScanner = false, destinos = 0;
function load(relativo, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src', relativo), 'utf8'), {
    module, Buffer, require(id) { if (!(id in deps)) throw Error(`Dependencia nao isolada: ${id}`); return deps[id]; }
  });
  return module.exports;
}
const security = load('middlewares/uploadFileSecurity.js', {
  '../services/securityLogService': { registrarEventoSeguranca: async () => { logs++; } },
  '../services/clamavService': { scanFileBufferIfEnabled: async () => {
    scans++; if (bloquearScanner) throw Object.assign(Error('Scanner bloqueou arquivo QA'), { statusCode: 422 });
  } },
  '../services/uploadBinaryValidationService': require('../src/services/uploadBinaryValidationService')
});
const secure = load('config/createSecureUpload.js', { '../middlewares/uploadFileSecurity': security });
const upload = load('config/uploadComprovantesPagamento.js', {
  multer: require('multer'), path: require('node:path'), './createSecureUpload': secure,
  '../services/comprovanteFilaArquivoDomain': require('../src/services/comprovanteFilaArquivoDomain')
});
const app = express();
const acesso = (req, res, next) => req.headers['x-negado'] ? res.status(403).json({ error: 'Acesso negado' }) : next();
const destino = (req, res) => { destinos++; res.json({ nome: req.file?.originalname, total: req.files?.length }); };
app.post('/individual', acesso, upload.manual.single('file'), destino);
app.post('/compartilhado', acesso, upload.manual.single('file'), destino);
app.post('/importacao', acesso, upload.array('files', 10), destino);
app.use((e, req, res, next) => res.status(e.statusCode || 400).json({ error: e.code || e.message }));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=', 'base64');
const jpg = Buffer.from([255,216,255,224,0,16]);
const pdf = Buffer.from('%PDF-1.7\nQA');
(async () => {
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    async function enviar(rota, nome, tipo, bytes, headers = {}, quantidade = 1) {
      const form = new FormData();
      for (let i = 0; i < quantidade; i++) form.append(rota === 'importacao' ? 'files' : 'file', new Blob([bytes], { type: tipo }), nome);
      return fetch(`http://127.0.0.1:${server.address().port}/${rota}`, { method: 'POST', body: form, headers });
    }
    for (const rota of ['individual', 'compartilhado']) {
      for (const [nome, tipo, bytes] of [['doc.pdf','application/pdf',pdf],['foto.JPG','image/jpeg',jpg],
        ['foto.jpeg','',jpg],['foto.png','image/png',png]]) {
        const anterior = scans;
        const res = await enviar(rota,nome,tipo,bytes); assert.equal(res.status,200);
        assert.equal(scans,anterior+1,'Assinatura aprovada ainda passa pelo antivirus');
      }
      const anterior = destinos;
      for (const [nome,tipo,bytes] of [['foto.svg','image/svg+xml',Buffer.from('<svg/>')],
        ['foto.webp','image/webp',png],['foto.png','application/pdf',png],
        ['foto.jpg','image/jpeg',pdf],['foto.png','image/png',jpg]]) {
        assert.equal((await enviar(rota,nome,tipo,bytes)).status,400);
      }
      assert.equal((await enviar(rota,'grande.png','image/png',Buffer.alloc(12*1024*1024+1))).status,400);
      assert.equal((await enviar(rota,'foto.png','image/png',png,{},2)).status,400);
      assert.equal(destinos,anterior,'Recusa acontece antes do servico');
      const scansAntes = scans;
      assert.equal((await enviar(rota,'foto.png','image/png',png,{'x-negado':'1'})).status,403);
      assert.equal(scans,scansAntes,'Permissao antecede upload e antivirus');
      bloquearScanner = true;
      assert.equal((await enviar(rota,'foto.png','image/png',png)).status,422);
      bloquearScanner = false; assert.equal(destinos,anterior);
    }
    assert.equal((await enviar('importacao','doc.pdf','application/pdf',pdf)).status,200);
    for (const [nome,tipo,bytes] of [['foto.jpg','image/jpeg',jpg],['foto.png','image/png',png],['doc.pdf','application/pdf',png]]) {
      assert.equal((await enviar('importacao',nome,tipo,bytes)).status,400);
    }
    assert.equal((await enviar('importacao','doc.pdf','application/pdf',pdf,{},11)).status,400);
    assert(logs>=5,'Seguranca registra assinatura invalida e bloqueio do scanner');
    const rotas=fs.readFileSync(path.join(__dirname,'../src/routes.js'),'utf8').split(/\r?\n/);
    for (const endpoint of ['/financeiro/fila-pagamentos/:id/comprovante','/financeiro/fila-pagamentos/comprovantes/compartilhar']) {
      const linha=rotas.find(l=>l.startsWith('router.post(')&&l.includes(`'${endpoint}'`));
      assert(linha.includes("allowFilaPagamentosBaixa, uploadRateLimit, uploadComprovantesPagamento.manual.single('file')"));
    }
    for (const acao of ['preview','vincular']) {
      const linha=rotas.find(l=>l.includes(`'/financeiro/fila-pagamentos/comprovantes/${acao}'`));
      assert(linha.includes("uploadComprovantesPagamento.array('files', 10)")); assert(!linha.includes('.manual'));
      assert(linha.includes('allowFilaPagamentosImportarComprovantes'));
    }
    console.log('Upload real loopback: manual PDF/JPG/JPEG/PNG, importador so PDF, MIME/extensao/assinatura, 12MB/quantidade, ACL antes do upload, antivirus/log e rotas preservados. Sem banco/S3/antivirus externo.');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode=1; });
