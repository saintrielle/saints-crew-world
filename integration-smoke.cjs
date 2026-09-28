// Real Electron main/preload/renderer integration; Codex model transport is stubbed.
// No API calls, account reads, or user project changes are made by this test.
const {app,ipcMain,dialog,shell}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'crew-integration-'));app.setPath('userData',path.join(root,'profile'));const fixture=path.join(root,'fixture');fs.mkdirSync(fixture);
let client,opened=0,account=null,lastEnter;
class FakeCodex extends EventEmitter{
 constructor(){super();client=this;this.child=true;}
 async start(){} async account(){return account;} async models(){return [{id:'test-first',name:'First'},{id:'gpt-6-astra',name:'Astra'}];}
 async login(){return {authUrl:'https://auth.openai.com/test-only'};}
 async enter(params){lastEnter=params;return {threadId:'offline-thread'};}
 async send(){return new Promise(resolve=>{this.resolve=resolve;setTimeout(()=>{this.emit('event',{type:'text',text:'<b>Literal test text</b>'});this.emit('event',{type:'approval',id:'42',title:'Offline approval',detail:'No command will run.'});},10);});}
 respond(id,allow){assert.equal(id,'42');this.resolve(allow?'Approved':'Denied');}
 async stop(){this.resolve?.('Stopped');}close(){}
}
require.cache[require.resolve('./codex-engine')]={id:require.resolve('./codex-engine'),filename:require.resolve('./codex-engine'),loaded:true,exports:{CodexEngine:FakeCodex}};
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});dialog.showMessageBox=async()=>({response:0});shell.openExternal=async()=>{opened++;};
process.argv.push('--smoke');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_event,win)=>win.webContents.once('did-finish-load',async()=>{try{
 const js=source=>win.webContents.executeJavaScript(source);await wait(100);
 const initial=await js('window.crew.status()');assert.equal(initial.connected,false);
 await js('window.crew.chooseProject()');const pending=await js('window.crew.connect({provider:"codex"})');assert.equal(pending.authPending,true);assert.equal(opened,1);
 account={type:'chatgpt'};client.emit('event',{type:'auth',success:true});await wait(30);assert.equal((await js('window.crew.status()')).connected,true);
 await js('document.getElementById("mode").value="workspace-write";document.getElementById("model").value="gpt-6-astra";document.getElementById("enter").click()');await wait(80);assert.equal(lastEnter.model,'gpt-6-astra');assert.equal(lastEnter.mode,'read-only');assert.equal(await js('document.getElementById("modeBadge").textContent'),'Read only');
 await js('document.getElementById("prompt").value="Offline fixture request";document.getElementById("composer").requestSubmit()');await wait(70);assert.equal(await js('document.getElementById("approval").open'),true);assert.equal((await js('window.crew.status()')).busy,true);
 assert.equal(await js('document.querySelector(".message.assistant .body").textContent'),'<b>Literal test text</b>');assert.equal(await js('document.querySelector(".message.assistant .body b")===null'),true);
 await js('document.getElementById("allow").click()');await wait(80);const done=await js('window.crew.status()');assert.equal(done.busy,false);assert.equal(done.messages.length,2);assert.equal(done.messages[1].text,'<b>Literal test text</b>');assert.equal(await js('document.getElementById("approval").open'),false);assert.equal(await js('crewUIDiagnostics().messages'),2);
 await js('document.getElementById("prompt").value="Stop fixture";document.getElementById("composer").requestSubmit()');await wait(40);await js('window.crew.stop()');await wait(50);assert.equal((await js('window.crew.status()')).busy,false);assert.equal(await js('document.getElementById("approval").open'),false);
 const handler=ipcMain._invokeHandlers.get('crew:status');assert.throws(()=>handler({sender:{},senderFrame:{url:'file:///evil'}}),/Untrusted request/);
 console.log('INTEGRATION_OK: trusted IPC, pending auth, model, declined write mode, streaming text safety, approvals, stop, persisted transcript');app.exit(0);
 }catch(error){console.error(error);app.exit(1);}}));
require('./main');
