'use strict';
// Preload exclusivo de QA: qualquer tentativa de conexao causa falha imediata.
const net=require('node:net'),tls=require('node:tls');
const deny=()=>{throw Error('QA_CONEXAO_EXTERNA_PROIBIDA');};
net.Socket.prototype.connect=deny;net.connect=deny;net.createConnection=deny;tls.connect=deny;
