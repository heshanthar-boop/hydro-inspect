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
      App.showToast('Sign-in failed: ' + err.message, 'error');
    });
  }

  function signOut() {
    if (!_auth) return;
    _auth.signOut().then(() => App.showToast('Signed out'));
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
    menu.innerHTML = `
      <div class="fb-account-email">${_user.email}</div>
      <button id="fb-sync-now-btn" class="fb-menu-item">&#8635; Sync Now</button>
      <button id="fb-signout-btn"  class="fb-menu-item fb-menu-danger">&#128274; Sign Out</button>
    `;
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
    const col = _userCol('hydro_inspections');
    if (!col) return false;
    try {
      const clean = _stripPhotos(inspection);
      await col.doc(String(inspection.id)).set({
        ...clean,
        _syncedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
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

  async function syncAll() {
    if (!isSignedIn()) {
      App.showToast('Sign in to sync data', 'warning');
      return;
    }

    _setSyncBadge('syncing');

    try {
      // Push all local inspections → Firestore
      const local = await Store.getInspections();
      await Promise.all(local.map(insp => saveInspection(insp)));

      // Pull all remote
      const remote = await pullInspections();
      if (!remote) {
        App.showToast('Sync error — check connection', 'error');
        _setSyncBadge('cloud');
        return;
      }

      // Merge: save remote records that aren't in local IndexedDB
      const localIds = new Set(local.map(i => String(i.id)));
      let newCount = 0;
      for (const [id, data] of Object.entries(remote)) {
        if (!localIds.has(id)) {
          // Remove Firestore metadata before saving locally
          delete data._syncedAt;
          await Store.saveInspection(data);
          newCount++;
        }
      }

      _setSyncBadge('cloud');
      App.showToast(`Sync complete — ${local.length} inspections${newCount ? `, ${newCount} new from cloud` : ''}`, 'success');
    } catch (e) {
      console.error('FirebaseSync.syncAll:', e);
      App.showToast('Sync failed', 'error');
      _setSyncBadge('cloud');
    }
  }

  // -------------------------------------------------------------------------
  // AUTO-SYNC HOOK — called by store.js after saving an inspection
  // -------------------------------------------------------------------------

  function onInspectionSaved(inspection) {
    if (isSignedIn()) {
      saveInspection(inspection).then(ok => {
        if (ok) _setSyncBadge('cloud');
      });
    }
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
