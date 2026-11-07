import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const files = new Map(), wire = [];
const hash = s => '"' + createHash('md5').update(s).digest('hex') + '"';
const err=(res,code,status)=>{res.writeHead(status,{'content-type':'application/xml'});res.end('<Error><Code>'+code+'</Code><Message>'+code+'</Message></Error>')};
const server=createServer(async(req,res)=>{
 const chunks=[];for await(const b of req)chunks.push(b);
 const body=Buffer.concat(chunks).toString(),key=new URL(req.url,'http://localhost').pathname,old=files.get(key);
 wire.push({method:req.method,key,ifMatch:req.headers['if-match']||null,ifNoneMatch:req.headers['if-none-match']||null,signed:req.headers.authorization||''});
 if(req.method==='GET'){if(!old)return err(res,'NoSuchKey',404);res.writeHead(200,{ETag:old.etag,'content-type':'application/json','content-length':Buffer.byteLength(old.body)});return res.end(old.body)}
 if(req.method!=='PUT')return err(res,'MethodNotAllowed',405);
 if(!req.headers['if-match']&&!req.headers['if-none-match'])return err(res,'UnsafeUnconditionalPut',400);
 if(req.headers['if-none-match']==='*'&&old)return err(res,'PreconditionFailed',412);
 if(req.headers['if-match']&&req.headers['if-match']!==old?.etag)return err(res,'PreconditionFailed',412);
 const fresh={body,etag:hash(body)};files.set(key,fresh);
 if(key.includes('lost-ack')){req.socket.destroy();return}
 res.writeHead(200,{ETag:fresh.etag});res.end('');
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const client=new S3Client({region:'auto',endpoint:'http://127.0.0.1:'+server.address().port,forcePathStyle:true,
 credentials:{accessKeyId:'FAKE_LOCAL_ACCESS_KEY',secretAccessKey:'FAKE_LOCAL_SECRET'},maxAttempts:1,
 requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
const bucket='stage12-fixture';
const put=(key,body,condition)=>client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:'application/json',...condition}));
const get=async key=>{const r=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));return {body:await r.Body.transformToString(),etag:r.ETag}};
let passed=0;
async function test(name,fn){await fn();passed++;console.log('OK '+name)}
try{
 await test('native IfNoneMatch is sent over HTTP and create succeeds',async()=>{
  const p=await put('hot/head.json','{"r":1}',{IfNoneMatch:'*'});
  assert.equal((await get('hot/head.json')).body,'{"r":1}');
  assert.equal(wire.find(x=>x.method==='PUT').ifNoneMatch,'*');assert.ok(p.ETag);
 });
 await test('duplicate conditional create yields 412',async()=>{
  await assert.rejects(()=>put('hot/head.json','bad',{IfNoneMatch:'*'}),e=>e?.$metadata?.httpStatusCode===412);
 });
 await test('native IfMatch uses returned ETag',async()=>{
  const e=(await get('hot/head.json')).etag;
  await put('hot/head.json','{"r":2}',{IfMatch:e});
  assert.equal((await get('hot/head.json')).body,'{"r":2}');
  assert.ok(wire.some(x=>x.ifMatch===e));
 });
 await test('stale IfMatch fails with 412 and preserves good state',async()=>{
  await assert.rejects(()=>put('hot/head.json','{"r":0}',{IfMatch:'"wrong"'}),e=>e?.$metadata?.httpStatusCode===412);
  assert.equal((await get('hot/head.json')).body,'{"r":2}');
 });
 await test('concurrent IfMatch CAS has exactly one winner',async()=>{
  const e=(await get('hot/head.json')).etag;
  const settled=await Promise.allSettled([put('hot/head.json','{"r":3,"writer":"A"}',{IfMatch:e}),put('hot/head.json','{"r":3,"writer":"B"}',{IfMatch:e})]);
  assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(settled.filter(x=>x.status==='rejected'&&x.reason?.$metadata?.httpStatusCode===412).length,1);
 });
 await test('concurrent IfNoneMatch has one winner',async()=>{
  const settled=await Promise.allSettled([put('hot/new.json','A',{IfNoneMatch:'*'}),put('hot/new.json','B',{IfNoneMatch:'*'})]);
  assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(settled.filter(x=>x.status==='rejected'&&x.reason?.$metadata?.httpStatusCode===412).length,1);
 });
 await test('unknown ACK: later read sees committed object, no blind overwrite',async()=>{
  await assert.rejects(()=>put('hot/lost-ack.json','{"r":1,"id":"batch7"}',{IfNoneMatch:'*'}));
  assert.equal((await get('hot/lost-ack.json')).body,'{"r":1,"id":"batch7"}');
 });
 await test('AWS4 signature covers conditional header',async()=>{
  const c=wire.find(x=>x.ifMatch);assert.match(c.signed,/AWS4-HMAC-SHA256/);
  assert.match(c.signed,/SignedHeaders=.*if-match/i);
 });
 await test('missing object returns 404',async()=>{
  await assert.rejects(()=>get('hot/missing.json'),e=>e?.$metadata?.httpStatusCode===404);
 });
 console.log('STAGE12_NODE24_CONTRACT '+JSON.stringify({node:process.version,tests:passed,realR2:false,
   endpoint:'local_test_server_only',signedConditionalHeaders:true,conditionalOperations:wire.filter(x=>x.method==='PUT').length}));
}finally{client.destroy();await new Promise((ok,err)=>server.close(e=>e?err(e):ok()))}
