'use strict';
// Core administrativo; nenhum conector automatico, rota ou agenda.
const BASE_URL='https://api.nsdocs.com.br/v2';
function fail(code){const e=Error(code);e.code=code;throw e;}
module.exports={BASE_URL,fail};
