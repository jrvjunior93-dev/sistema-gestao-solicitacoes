'use strict';
// Compatibilidade de teste: SQL real do Sequelize em node:sqlite, apenas :memory:.
const {DatabaseSync}=require('node:sqlite');
class Database{
 constructor(file,_mode,callback){if(file!==':memory:')throw Error('TESTE_SOMENTE_SQLITE_MEMORIA');this.filename=file;this.db=new DatabaseSync(':memory:');queueMicrotask(()=>callback?.(null));}
 serialize(fn){fn();return this;}
 configure(){return this;}
 bind(value){if(Array.isArray(value))return value.map(v=>typeof v==='boolean'?Number(v):v);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,typeof v==='boolean'?Number(v):v]));return [];}
 execute(sql,params,callback,method){
  if(typeof params==='function'){callback=params;params=[];}let error,data,context={};
  try{const stmt=this.db.prepare(sql),bound=this.bind(params);data=method==='run'?stmt.run(bound):stmt.all(bound).map(r=>({...r}));if(method==='run')context={lastID:Number(data.lastInsertRowid),changes:Number(data.changes)};}
  catch(e){error=e;if(e.errcode===19||String(e.message).includes('constraint failed'))e.code='SQLITE_CONSTRAINT';}
  queueMicrotask(()=>callback?.call(context,error,data));return this;
 }
 all(sql,params,callback){return this.execute(sql,params,callback,'all');}
 run(sql,params,callback){return this.execute(sql,params,callback,'run');}
 get(sql,params,callback){if(typeof params==='function'){callback=params;params=[];}return this.all(sql,params,(e,rows)=>callback?.(e,rows?.[0]));}
 exec(sql,callback){let error;try{this.db.exec(sql);}catch(e){error=e;}queueMicrotask(()=>callback?.(error));return this;}
 close(callback){if(!this.closed){this.db.close();this.closed=true;}queueMicrotask(()=>callback?.(null));}
}
module.exports={Database,OPEN_READWRITE:2,OPEN_CREATE:4,OPEN_READONLY:1};
