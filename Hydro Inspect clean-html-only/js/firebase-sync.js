/**
 * firebase-sync.js — Google Sign-In + Firestore sync for HydroInspect
 * Reuses the same solarpv-field-tool Firebase project.
 * Data path: users/{uid}/hydro_inspections/{inspectionId}
 *             users/{uid}/hydro_settings
 * Photos are NOT synced (too large for Firestore — stored locally only).
 */

const FirebaseSync = (() => {

  const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyBlkxXy72Bj9tpH62MQiBo8eqZaynZSfXA",
    authDomain:        "solarpv-field-tool.firebaseapp.com",
    projectId:         "solarpv-field-tool",
    storageBucket:     "solarpv-field-tool.firebasestorage.app",
    messagingSenderId: "956132048124",
    appId:             "1:956132048124:web:a075541517ec3ceb152b79"
  };

  let _auth = null;
  let _db   = null;
  let _user = null;
  let _onAuthChange = null;

  // -------------------------------------------------------------------------
  // INIT
  // -------------------------------------------------------------------------

  function init(onAuthChange) {
    _onAuthChange = onAuthChange || null;

    if (typeof firebase === 'undefined') {
      console.warn('FirebaseSync: Firebase SDK not loaded');
      return;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }

    _auth = firebase.auth();
    _db   = firebase.firestore();

    _db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

    _auth.onAuthStateChanged(user => {
      _user = user;
      _updateSignInUI();
      if (_onAuthChange) _onAuthChange(user);
      if(!user) _auth.signInAnonymously().catch(error=>console.warn('Visitor cloud access requires Anonymous Authentication to be enabled',error.code));
    });
  }

  // -------------------------------------------------------------------------
  // AUTH
  // -------------------------------------------------------------------------

  function signIn() {
    if (!_auth) return;
    const provider = new firebase.auth.GoogleAuthProvider();
    _auth.signInWithPopup(provider).catch(err => {
      App.toast('Sign-in failed: ' + err.message, 'error');
    });
  }

  function signOut() {
    if (!_auth) return;
    _auth.signOut().then(() => App.toast('Signed out'));
  }

  function getUser()    { return _user; }
  function isSignedIn() { return !!_user; }

  // -------------------------------------------------------------------------
  // SIGN-IN UI
  // -------------------------------------------------------------------------

  function _updateSignInUI() {
    const btn = document.getElementById('fb-signin-btn');
    if (!btn) return;
    if (_user && !_user.isAnonymous) {
      const name  = _user.displayName ? _user.displayName.split(' ')[0] : 'User';
      const photo = _user.photoURL;
      btn.innerHTML = photo
        ? `<img src="${photo}" style="width:22px;height:22px;border-radius:50%;vertical-align:middle;margin-right:4px">${name}`
        : `&#128100; ${name}`;
      btn.title = `Signed in as ${_user.email}\nClick to sign out`;
      btn.classList.add('signed-in');
      // Update sync badge
      _setSyncBadge('cloud');
    } else {
      btn.innerHTML = '&#128274; Sign In';
      btn.title = 'Sign in with Google to sync across devices';
      btn.classList.remove('signed-in');
      _setSyncBadge('offline');
    }
  }

  function _setSyncBadge(state) {
    const badge = document.getElementById('sync-status');
    if (!badge) return;
    if (state === 'cloud') {
      badge.textContent = 'Cloud';
      badge.style.background = '#16a34a';
      badge.style.color = '#fff';
    } else if (state === 'syncing') {
      badge.textContent = 'Syncing...';
      badge.style.background = '#d97706';
      badge.style.color = '#fff';
    } else {
      badge.textContent = 'Local';
      badge.style.background = '';
      badge.style.color = '';
    }
  }

  function renderSignInButton(container) {
    const btn = document.createElement('button');
    btn.id = 'fb-signin-btn';
    btn.className = 'fb-signin-btn';
    btn.innerHTML = '&#128274; Sign In';
    btn.title = 'Sign in with Google to sync your data';
    btn.addEventListener('click', () => {
      if (_user && !_user.isAnonymous) _showAccountMenu(btn);
      else signIn();
    });
    container.appendChild(btn);
    _updateSignInUI();
    return btn;
  }

  function _showAccountMenu(anchor) {
    const old = document.getElementById('fb-account-menu');
    if (old) { old.remove(); return; }

    const menu = document.createElement('div');
    menu.id = 'fb-account-menu';
    menu.className = 'fb-account-menu';

    const emailDiv = document.createElement('div');
    emailDiv.className = 'fb-account-email';
    emailDiv.textContent = _user.email || '';

    const syncBtn = document.createElement('button');
    syncBtn.id = 'fb-sync-now-btn';
    syncBtn.className = 'fb-menu-item';
    syncBtn.innerHTML = '&#8635; Sync Now';

    const signOutBtn = document.createElement('button');
    signOutBtn.id = 'fb-signout-btn';
    signOutBtn.className = 'fb-menu-item fb-menu-danger';
    signOutBtn.innerHTML = '&#128274; Sign Out';

    menu.appendChild(emailDiv);
    menu.appendChild(syncBtn);
    menu.appendChild(signOutBtn);
    document.body.appendChild(menu);

    const rect = anchor.getBoundingClientRect();
    menu.style.top   = (rect.bottom + 6) + 'px';
    menu.style.right = (window.innerWidth - rect.right) + 'px';

    menu.querySelector('#fb-sync-now-btn').addEventListener('click', () => { menu.remove(); syncAll(); });
    menu.querySelector('#fb-signout-btn').addEventListener('click',  () => { menu.remove(); signOut(); });

    setTimeout(() => {
      document.addEventListener('click', function _close(e) {
        if (!menu.contains(e.target) && e.target !== anchor) {
          menu.remove();
          document.removeEventListener('click', _close);
        }
      });
    }, 50);
  }

  // -------------------------------------------------------------------------
  // FIRESTORE HELPERS
  // -------------------------------------------------------------------------

  function _userCol(path) {
    if (!_user || !_db) return null;
    if(['hydro_inspections','hydro_daily_readings'].includes(path)) return _db.collection(`hydro_workspaces/main/${path}`);
    return _db.collection(`users/${_user.uid}/${path}`);
  }

  function _userDoc(path) {
    if (!_user || !_db) return null;
    return _db.doc(`users/${_user.uid}/${path}`);
  }

  // -------------------------------------------------------------------------
  // INSPECTION SYNC
  // Strip photos from inspection before saving (Firestore 1MB doc limit)
  // -------------------------------------------------------------------------

  function _stripPhotos(inspection) {
    const clean = JSON.parse(JSON.stringify(inspection));
    // Remove any embedded photo data
    if (clean.incidents) {
      clean.incidents = clean.incidents.map(inc => {
        const i = { ...inc };
        delete i.photos;
        delete i.photoDataUrls;
        return i;
      });
    }
    return clean;
  }

  async function saveInspection(inspection) {
    if (!isSignedIn() || !Access.isOwner()) return false;
    if (!navigator.onLine) return false;
    const col = _userCol('hydro_inspections');
    if (!col) return false;
    try {
      const clean = _stripPhotos(inspection);
      // Don't ship internal queue flag to Firestore
      delete clean._pendingSync;
      const ref=col.doc(String(inspection.id));
      const deleted=await _db.runTransaction(async tx=>{
        const snapshot=await tx.get(ref);const remote=snapshot.exists?snapshot.data():null;
        if(remote?._deleted && !clean._deleted)return remote;
        tx.set(ref,{...clean,_syncedAt:firebase.firestore.FieldValue.serverTimestamp()});return null;
      });
      if(deleted) {await Store.saveInspection(deleted,{silent:true});return true;}
      // Clear the pending flag locally so the UI can show "synced"
      if (typeof Store !== 'undefined' && Store.markSynced) {
        try { await Store.markSynced(inspection.id); } catch (_) {}
      }
      return true;
    } catch (e) {
      console.error('FirebaseSync.saveInspection:', e);
      return false;
    }
  }

  async function pullInspections() {
    if (!isSignedIn()) return null;
    const col = _userCol('hydro_inspections');
    if (!col) return null;
    try {
      const snap = await col.get();
      const remote = {};
      snap.forEach(doc => { remote[doc.id] = doc.data(); });
      if(Access.isOwner()) {
        const legacy=await _db.collection(`users/${_user.uid}/hydro_inspections`).get();
        for(const doc of legacy.docs) if(!remote[doc.id]) {
          const data=doc.data();if(await saveInspection(data)) remote[doc.id]=data;
        }
      }
      return remote;
    } catch (e) {
      console.error('FirebaseSync.pullInspections:', e);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // FULL SYNC
  // -------------------------------------------------------------------------

  // Compare two inspection records by updatedAt timestamp.
  // Returns 'local', 'remote', or 'equal' — which side is newer.
  function _newerSide(localRec, remoteRec) {
    const lt = localRec && localRec.updatedAt ? Date.parse(localRec.updatedAt) : 0;
    const rt = remoteRec && remoteRec.updatedAt ? Date.parse(remoteRec.updatedAt) : 0;
    if (!lt && !rt) return 'equal';
    if (lt > rt) return 'local';
    if (rt > lt) return 'remote';
    return 'equal';
  }

  async function syncAll() {
    if (!isSignedIn()) {
      App.toast('Sign in to sync data', 'warning');
      return;
    }
    if (!navigator.onLine) {
      App.toast('Offline — will sync automatically when back online', 'warning');
      return;
    }

    _setSyncBadge('syncing');

    try {
      const settingsDoc=_db.doc('hydro_workspaces/main/config/meters');
      const settingsSnapshot=await settingsDoc.get();
      const settings=await Store.getSettings();
      if(Access.isOwner() && (!settingsSnapshot.exists || settings._sharedPending)) {
        await settingsDoc.set({plantName:settings.plantName,plantLocation:settings.plantLocation,meterChanges:settings.meterChanges || []});
        settings._sharedPending=false;await Store.saveSettings(settings,{silent:true});
      } else if(settingsSnapshot.exists) await Store.saveSettings({...settings,...settingsSnapshot.data()},{silent:true});
      // Pull remote first so we can do per-record conflict resolution by updatedAt.
      const remote = await pullInspections();
      if (!remote) {
        App.toast('Sync error — check connection', 'error');
        _setSyncBadge('cloud');
        return;
      }

      const local = await Store.getInspections({includeDeleted:true});
      const localById = new Map(local.map(i => [String(i.id), i]));

      let pushed = 0, pulled = 0, failed = 0, skipped = 0, conflicts = 0;

      // Direction 1: push local records whose local copy is newer (or not in cloud)
      for (const l of local) {
        const remoteRec = remote[String(l.id)];
        const newer = _newerSide(l, remoteRec);
        if (Access.isOwner() && (!remoteRec || newer === 'local')) {
          const ok = await saveInspection(l);
          if (ok) pushed++;
          else    failed++;
          if (remoteRec && newer === 'local') conflicts++;
        } else if (newer === 'remote') {
          // Remote is newer — will be pulled below
          skipped++;
        } else {
          // Equal timestamps — already in sync
          if (l._pendingSync && Store.markSynced) {
            try { await Store.markSynced(l.id); } catch (_) {}
          }
        }
      }

      // Direction 2: pull remote records that are new locally, or remote-newer
      for (const [id, data] of Object.entries(remote)) {
        const localRec = localById.get(String(id));
        const newer = _newerSide(localRec, data);
        if (!localRec || newer === 'remote' || data._deleted) {
          // Strip Firestore internal field. Save silently so the auto-sync hook
          // doesn't bounce the record straight back to Firebase.
          delete data._syncedAt;
          data._pendingSync = false;
          await Store.saveInspection(data, { silent: true });
          pulled++;
          if (localRec && newer === 'remote') conflicts++;
        }
      }

      await syncDailyReadings();
      window.dispatchEvent(new Event('hydro-daily-synced'));
      _setSyncBadge('cloud');
      const parts = [];
      if (pushed)    parts.push(`${pushed} pushed`);
      if (pulled)    parts.push(`${pulled} pulled`);
      if (conflicts) parts.push(`${conflicts} conflicts resolved (newest wins)`);
      if (failed)    parts.push(`${failed} failed`);
      if (!parts.length) parts.push('already up to date');
      App.toast('Sync — ' + parts.join(', '), failed ? 'warning' : 'success');
    } catch (e) {
      console.error('FirebaseSync.syncAll:', e);
      App.toast('Sync failed', 'error');
      _setSyncBadge('cloud');
    }
  }

  // -------------------------------------------------------------------------
  // AUTO-SYNC HOOK — called by store.js after saving an inspection
  // -------------------------------------------------------------------------

  function onInspectionSaved(inspection) {
    // If offline or not signed in, the record stays marked _pendingSync in IndexedDB
    // and will be flushed by the 'online' listener in app.js calling syncAll().
    if (!isSignedIn() || !navigator.onLine || !Access.isOwner()) return;
    saveInspection(inspection).then(ok => {
      if (ok) _setSyncBadge('cloud');
    });
  }

  async function syncDailyReadings() {
    if(!isSignedIn() || !navigator.onLine) return;
    const col=_userCol('hydro_daily_readings');
    const snapshot=await col.get();
    const remote=new Map(snapshot.docs.map(d=>[d.id,d.data()]));
    const local=await Store.getDailyReadings({includeDeleted:true});
    const seen=new Set();
    for(const record of local) {
      seen.add(record.id); if(record._remoteRemoved)continue; const r=remote.get(record.id);
      if(record.audit && !record._shared && !record.audit.created.uid && record.audit.created.deviceId===Access.actor().deviceId) {record.audit.created.uid=_user.uid;record.audit.lastEdited=Access.actor();}
      if(!record.audit && Access.isOwner()) {const actor=Access.actor();record.audit={created:actor,lastEdited:actor};}
      const editable=Access.isOwner() || record.audit?.created?.uid===_user.uid;
      if(editable && (!r || _newerSide(record,r)==='local')) {
        await pushDailyReading(record);
      } else if(r && (r._deleted || _newerSide(record,r)==='remote' || record._pendingSync || !editable)) await Store.saveDailyReading({...r,_shared:true,_pendingSync:false},{silent:true});
    }
    for(const [id,r] of remote) if(!seen.has(id)) await Store.saveDailyReading({...r,id,_shared:true,_pendingSync:false},{silent:true});
  }

  function watchDailyReadings(onChange,onError) {
    if(!isSignedIn() || !_db)return ()=>{};
    let stopped=false,updates=Promise.resolve();
    const unsubscribe=_userCol('hydro_daily_readings').onSnapshot(snapshot=>{
      updates=updates.catch(()=>{}).then(async()=>{
        if(stopped)return;
        const local=new Map((await Store.getDailyReadings({includeDeleted:true})).map(r=>[r.id,r]));
        let changed=false;
        for(const change of snapshot.docChanges()){
          if(change.doc.metadata.hasPendingWrites)continue;
          const data={...change.doc.data(),id:change.doc.id,_shared:true,_pendingSync:false};
          if(change.type==='removed') {data._deleted=true;data._remoteRemoved=true;data.readings={};data.draft=true;}
          const existing=local.get(data.id);
          if(existing?._pendingSync && !data._deleted && _newerSide(existing,data)==='local')continue;
          await Store.saveDailyReading(data,{silent:true});changed=true;
        }
        if(changed && !stopped)await onChange();
      }).catch(error=>{if(!stopped)onError?.(error);});
    },error=>{if(!stopped)onError?.(error);});
    return ()=>{stopped=true;unsubscribe();};
  }

  let dailyPushQueue=Promise.resolve();
  async function pushDailyReading(record) {
    if(!isSignedIn() || !navigator.onLine) return;
    const uid=_user.uid, owner=Access.isOwner();
    const clean=JSON.parse(JSON.stringify(record));
    if(!clean.audit && owner) {const actor=Access.actor();clean.audit={created:actor,lastEdited:actor};}
    if(clean.audit && !clean._shared && !clean.audit.created.uid && clean.audit.created.deviceId===Access.actor().deviceId) {
      clean.audit.created.uid=uid;clean.audit.lastEdited=Access.actor();
    }
    if(!owner && clean.audit?.created?.uid!==uid) return;
    const ref=_userCol('hydro_daily_readings').doc(clean.id);
    const result=await _db.runTransaction(async tx=>{
      const snapshot=await tx.get(ref),remote=snapshot.exists ? snapshot.data() : null;
      if(remote && (remote._deleted || (!owner && !remote.draft) || _newerSide(clean,remote)==='remote')) return remote;
      if(remote) clean.audit.created=remote.audit.created;
      if(owner && remote?.readingAt && clean.date===remote.date && clean.time===remote.time) clean.readingAt=remote.readingAt;
      if(!owner) clean.readingAt=remote && !remote.draft && remote.readingAt ? remote.readingAt : firebase.firestore.FieldValue.serverTimestamp();
      tx.set(ref,{...clean,_pendingSync:false,_shared:true,_serverEditedAt:firebase.firestore.FieldValue.serverTimestamp()});
      return {...clean,_pendingSync:false,_shared:true};
    });
    // Never replace a newer local edit with the result of an older upload.
    const current=(await Store.getDailyReadings({includeDeleted:true})).find(r=>r.id===clean.id);
    if(current && current.updatedAt===record.updatedAt) {
      const acknowledged=await ref.get();
      if(acknowledged.exists) await Store.saveDailyReading({...acknowledged.data(),_pendingSync:false,_shared:true},{silent:true});
    }
  }

  function onDailyReadingSaved(record) {
    if(!isSignedIn() || !navigator.onLine) return;
    const snapshot=JSON.parse(JSON.stringify(record));
    // Upload one changed document instead of reading the entire history per field.
    dailyPushQueue=dailyPushQueue.catch(()=>{}).then(()=>pushDailyReading(snapshot)).catch(error=>{
      console.warn('Daily upload failed; record remains queued locally',error.code || error.message);
    });
  }

  return {
    watchDailyReadings,
    pushDailyReading,
    syncDailyReadings,
    onDailyReadingSaved,
    init,
    signIn,
    signOut,
    getUser,
    isSignedIn,
    renderSignInButton,
    saveInspection,
    pullInspections,
    syncAll,
    onInspectionSaved
  };

})();
