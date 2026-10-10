const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
(async()=>{
 let local=new Map(),remote=new Map(),reads=0,writes=0,scans=0;
 const user={uid:'visitor-1',isAnonymous:true};
 const db={enablePersistence:()=>Promise.resolve(),collection:()=>({get:()=>{scans++;throw Error('Unexpected history scan');},doc:id=>({id})}),runTransaction:async fn=>fn({get:async ref=>{reads++;return {exists:remote.has(ref.id),data:()=>structuredClone(remote.get(ref.id))};},set:(ref,value)=>{writes++;remote.set(ref.id,structuredClone(value));}})};
 const firestore=()=>db;firestore.FieldValue={serverTimestamp:()=> 'SERVER_TIME'};
 const context=vm.createContext({console,navigator:{onLine:true},document:{getElementById:()=>null},firebase:{apps:[{}],auth:()=>({onAuthStateChanged:cb=>cb(user)}),firestore},App:{toast:()=>{}},Access:{isOwner:()=>false,actor:()=>({uid:user.uid,deviceId:'device-1'})},Store:{getDailyReadings:async()=>[...local.values()].map(r=>structuredClone(r)),saveDailyReading:async r=>local.set(r.id,structuredClone(r))}});
 vm.runInContext(fs.readFileSync('js/firebase-sync.js','utf8')+'\nglobalThis.Sync=FirebaseSync;',context);context.Sync.init();
 const record={id:'daily-test',updatedAt:'2026-10-11T00:00:00Z',readings:{cebImport:'100'},audit:{created:{uid:user.uid,deviceId:'device-1'},lastEdited:{uid:user.uid}},_pendingSync:true};local.set(record.id,structuredClone(record));
 await context.Sync.pushDailyReading(record);assert.equal(reads,1);assert.equal(writes,1);assert.equal(scans,0);assert.equal(local.get(record.id)._pendingSync,false);assert.equal(remote.get(record.id)._shared,true);
 const newer={...record,updatedAt:'2026-10-11T02:00:00Z',readings:{cebImport:'150'},_pendingSync:true};local.set(record.id,newer);await context.Sync.pushDailyReading(record);assert.equal(local.get(record.id).readings.cebImport,'150');assert.equal(local.get(record.id)._pendingSync,true);
 const originalDevice=remote.get(record.id).audit.created.deviceId;const changed={...newer,audit:{created:{uid:user.uid,deviceId:'changed'},lastEdited:{uid:user.uid}}};local.set(record.id,changed);await context.Sync.pushDailyReading(changed);assert.equal(remote.get(record.id).audit.created.deviceId,originalDevice);
 console.log('Changed-document sync, provenance preservation and newer-local-edit checks passed');
})().catch(e=>{console.error(e);process.exit(1)});

