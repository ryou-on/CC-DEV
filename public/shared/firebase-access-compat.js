// Called after initializeApp; preserves each application's existing SDK and Auth instance.
(() => {
  let ready;
  const load = src => new Promise((resolve,reject) => {
    const script=document.createElement('script');script.src=src;script.onload=resolve;
    script.onerror=()=>reject(Error('ログイン機能を読み込めませんでした。'));document.head.append(script);
  });
  window.requireCCDevLogin = () => ready || (ready=(async()=>{
    const src=[...document.scripts].map(s=>s.src).find(s=>s.includes('/firebase-app-compat.js'));
    if(!src)throw Error('Firebase SDKを確認できませんでした。');
    const base=src.slice(0,src.lastIndexOf('/')+1);
    if(!firebase.auth)await load(base+'firebase-auth-compat.js');
    if(!firebase.appCheck)await load(base+'firebase-app-check-compat.js');
    const {connectFirebase}=await import('/shared/firebase-access.js');
    return connectFirebase(firebase.app(),{compat:true});
  })());
})();
