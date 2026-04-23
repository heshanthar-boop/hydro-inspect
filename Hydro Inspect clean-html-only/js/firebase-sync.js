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
    if (_user) {
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
      if (_user) _showAccountMenu(btn);
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
    if (!isSignedIn()) return false;
    if (!navigator.onLine) return false;
    const col = _userCol('hydro_inspections');
    if (!col) return false;
    try {
      const clean = _stripPhotos(inspection);
      // Don't ship internal queue flag to Firestore
      delete clean._pendingSync;
      await col.doc(String(inspection.id)).set({
        ...clean,
        _syncedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
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
      // Pull remote first so we can do per-record conflict resolution by updatedAt.
      const remote = await pullInspections();
      if (!remote) {
        App.toast('Sync error — check connection', 'error');
        _setSyncBadge('cloud');
        return;
      }

      const local = await Store.getInspections();
      const localById = new Map(local.map(i => [String(i.id), i]));

      let pushed = 0, pulled = 0, failed = 0, skipped = 0, conflicts = 0;

      // Direction 1: push local records whose local copy is newer (or not in cloud)
      for (const l of local) {
        const remoteRec = remote[String(l.id)];
        const newer = _newerSide(l, remoteRec);
        if (!remoteRec || newer === 'local') {
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
        if (!localRec || newer === 'remote') {
          // Strip Firestore internal field. Save silently so the auto-sync hook
          // doesn't bounce the record straight back to Firebase.
          delete data._syncedAt;
          data._pendingSync = false;
          await Store.saveInspection(data, { silent: true });
          pulled++;
          if (localRec && newer === 'remote') conflicts++;
        }
      }

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
    if (!isSignedIn() || !navigator.onLine) return;
    saveInspection(inspection).then(ok => {
      if (ok) _setSyncBadge('cloud');
    });
  }

  return {
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
