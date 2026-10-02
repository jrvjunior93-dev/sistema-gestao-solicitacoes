const assert = require('node:assert/strict');
const express = require('express');
const multer = require('multer');
const mysql2 = require('mysql2');
const nodemailer = require('nodemailer');
const puppeteer = require('puppeteer-core');
const {
  findBrowserExecutablePath,
  generatePedidoCompraPdfBufferFromHtml
} = require('../src/services/pedidoCompraPdfPuppeteer');

async function validarUploadEmMemoria() {
  const app = express();
  app.post('/teste', multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 } }).single('arquivo'), (req, res) => {
    res.json({ nome: req.file?.originalname, conteudo: req.file?.buffer?.toString('utf8') });
  });
  const servidor = await new Promise((resolve) => {
    const instancia = app.listen(0, '127.0.0.1', () => resolve(instancia));
  });

  try {
    const formulario = new FormData();
    formulario.append('arquivo', new Blob(['arquivo de teste']), 'teste.txt');
    const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}/teste`, {
      method: 'POST',
      body: formulario
    });
    assert.equal(resposta.status, 200);
    assert.deepEqual(await resposta.json(), { nome: 'teste.txt', conteudo: 'arquivo de teste' });
  } finally {
    await new Promise((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()));
  }
}

async function validarPdfHtml() {
  assert.equal(typeof puppeteer.launch, 'function');
  if (!findBrowserExecutablePath()) {
    console.log('PDF HTML: navegador nao encontrado; fallback da aplicacao permanece disponivel.');
    return;
  }

  const pdf = await generatePedidoCompraPdfBufferFromHtml(
    { id: 1, itens: [], solicitacao: {}, fornecedor: {} },
    { generatedAt: new Date('2026-10-02T12:00:00Z') }
  );
  assert.ok(pdf?.length > 1000, 'PDF HTML vazio');
  assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), '%PDF');
}

async function executar() {
  assert.equal(typeof mysql2.createConnection, 'function');
  const mensagem = await nodemailer.createTransport({ jsonTransport: true }).sendMail({
    from: 'fluxy@example.test',
    to: 'teste@example.test',
    subject: 'Teste local',
    text: 'Sem envio externo'
  });
  assert.ok(mensagem.messageId);
  await validarUploadEmMemoria();
  await validarPdfHtml();
  console.log('Dependencias backend validadas: mysql2, Nodemailer, Multer e Puppeteer.');
}

executar().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
