const test=require('node:test');const assert=require('node:assert/strict');const {CodexEngine}=require('./codex-engine');
test('Stop requested before turn/start response still interrupts that turn',async()=>{
 const engine=new CodexEngine();engine.threadId='thread';const calls=[];let start;
 engine.rpc=(method,params)=>{calls.push({method,params});if(method==='turn/start')return new Promise(resolve=>{start=resolve;});return Promise.resolve({});};
 const result=engine.send('test');await engine.stop();start({turn:{id:'late-turn'}});await new Promise(r=>setImmediate(r));
 const interrupted=calls.some(c=>c.method==='turn/interrupt'&&c.params.turnId==='late-turn');engine.receive({method:'turn/completed',params:{threadId:'thread',turn:{id:'late-turn',status:'interrupted'}}});await result;
 assert.equal(interrupted,true);
});
test('A completed non-streamed message is not lost',async()=>{
 const engine=new CodexEngine();engine.threadId='thread';engine.rpc=async()=>({turn:{id:'turn'}});const result=engine.send('test');await new Promise(r=>setImmediate(r));
 engine.receive({method:'item/completed',params:{threadId:'thread',item:{id:'message',type:'agentMessage',text:'Final response without deltas.'}}});
 engine.receive({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed'}}});assert.equal(await result,'Final response without deltas.');
});
test('An approval can be denied with the original RPC id',()=>{const engine=new CodexEngine();let response;engine.write=value=>{response=value;};engine.receive({id:42,method:'item/commandExecution/requestApproval',params:{command:'echo test'}});engine.respond('42',false);assert.deepEqual(response,{id:42,result:{decision:'decline'}});assert.throws(()=>engine.respond('42',true),/expired/);});
