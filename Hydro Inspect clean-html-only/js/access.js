/** Roles and per-browser provenance. Server rules enforce shared writes. */
const Access = {
  OWNER_EMAIL:'heshantha.pcl@gmail.com',
  isOwner() { const u=FirebaseSync.getUser();return !!u && u.emailVerified===true && u.email?.toLowerCase()===this.OWNER_EMAIL; },
  actor() {
    let id=localStorage.getItem('hydro-device-id');if(!id){id=crypto.randomUUID();localStorage.setItem('hydro-device-id',id);}
    const u=FirebaseSync.getUser();
    return {uid:u?.uid || '',email:u?.email || '',visitor:!u || !!u.isAnonymous,deviceId:id,deviceLabel:navigator.userAgentData?.platform || navigator.platform || 'Browser',userAgent:navigator.userAgent,clientTime:new Date().toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
  },
  canEditDaily(record) {return this.isOwner() || (!!record?.audit?.created?.uid && record.audit.created.uid===FirebaseSync.getUser()?.uid) || (!record?.audit?.created?.uid && record?.audit?.created?.deviceId===this.actor().deviceId && !record._shared);},
  updateUI() {
    document.querySelectorAll('[data-page="new-inspection"],[data-page="settings"]').forEach(el=>el.hidden=!this.isOwner());
  }
};
