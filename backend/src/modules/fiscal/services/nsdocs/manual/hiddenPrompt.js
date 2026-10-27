'use strict';
const readline = require('node:readline');
const { Writable } = require('node:stream');
const { check } = require('./policy');

async function readHiddenKey({ input = process.stdin, output = process.stdout, signal } = {}) {
  check(input.isTTY && output.isTTY, 'NSDOCS_EXIGE_TERMINAL_INTERATIVO');
  check(!signal?.aborted, 'NSDOCS_ENTRADA_CANCELADA');
  output.write('Cole a chave NSDOCS DEV (entrada oculta) e pressione Enter: ');
  const muted = new Writable({ write(chunk, encoding, callback) { callback(); } });
  const rl = readline.createInterface({ input, output: muted, terminal: true, historySize: 0 });
  let cancel;
  try {
    return await new Promise((resolve, reject) => {
      cancel = () => { const error = new Error('NSDOCS_ENTRADA_CANCELADA'); error.code = error.message; reject(error); };
      signal?.addEventListener('abort', cancel, { once: true });
      rl.on('SIGINT', cancel); rl.on('close', cancel);
      rl.question('', value => { rl.removeListener('SIGINT', cancel); rl.removeListener('close', cancel); resolve(value); });
    });
  } finally { signal?.removeEventListener('abort', cancel); rl.close(); muted.end(); output.write('\n'); }
}
module.exports = { readHiddenKey };
