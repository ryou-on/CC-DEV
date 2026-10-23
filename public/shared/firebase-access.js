// The backend Rules enforce scope membership. This UI only signs in and attests the app.
const sessions = new WeakMap();

export function connectFirebase(app, options = {}) {
  if (!sessions.has(app)) sessions.set(app, connect(app, options));
  return sessions.get(app);
}

async function connect(app, { sdkVersion = '10.13.0', compat = false, required = true } = {}) {
  const response = await fetch('/shared/cost-access-config.json', { cache: 'no-cache' });
  if (!response.ok) throw Error('共有機能の保護設定を確認できませんでした。');
  const config = await response.json();
  if (!config.recaptchaEnterpriseSiteKey) throw Error('共有機能の安全設定を準備中です。');
  let auth, watch, signIn, signOut, attestation;
  if (compat) {
    const f = window.firebase;
    f.appCheck(app).activate(new f.appCheck.ReCaptchaEnterpriseProvider(config.recaptchaEnterpriseSiteKey), true);
    auth = f.auth(app);
    attestation = () => f.appCheck(app).getToken();
    watch = cb => auth.onAuthStateChanged(cb);
    signIn = () => auth.signInWithPopup(new f.auth.GoogleAuthProvider());
    signOut = () => auth.signOut();
  } else {
    const base = `https://www.gstatic.com/firebasejs/${sdkVersion}/`;
    const [a, c] = await Promise.all([import(base + 'firebase-auth.js'), import(base + 'firebase-app-check.js')]);
    const check = c.initializeAppCheck(app, { provider: new c.ReCaptchaEnterpriseProvider(config.recaptchaEnterpriseSiteKey), isTokenAutoRefreshEnabled: true });
    auth = a.getAuth(app);
    attestation = () => c.getToken(check);
    watch = cb => a.onAuthStateChanged(auth, cb);
    signIn = () => a.signInWithPopup(auth, new a.GoogleAuthProvider());
    signOut = () => a.signOut(auth);
  }
  window.ccDevSharedHeaders = async () => {
    const user=auth.currentUser;
    if (!user || user.isAnonymous || !user.emailVerified) throw Error('Googleでログインしてください。');
    const [id, token]=await Promise.all([user.getIdToken(),attestation()]);
    return {Authorization:'Bearer '+id,'X-Firebase-AppCheck':token.token};
  };
  if (!document.body) await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  const bar = document.createElement('section');
  bar.id = 'sharing-access-bar';
  bar.style.cssText = 'position:relative;z-index:10001;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 16px;background:#eef4ff;color:#172554;font:14px sans-serif';
  const label = document.createElement('span');
  const login = document.createElement('button'); login.type='button'; login.textContent='Googleでログイン';
  const logout = document.createElement('button'); logout.type='button'; logout.textContent='ログアウト';
  login.onclick=async()=>{login.disabled=true;try{await signIn();}catch{label.textContent='ログインできませんでした。もう一度お試しください。';}finally{login.disabled=false;}};
  logout.onclick=async()=>{await signOut(); location.reload();};
  bar.append(label,login,logout);document.body.prepend(bar);
  return new Promise(resolve=>{
    let previous;
    watch(user=>{
      const verified=user && !user.isAnonymous && user.emailVerified;
      label.textContent=verified?'共有機能にログイン済み（利用には管理者の許可が必要です）':'クラウド共有にはGoogleログインと管理者の許可が必要です';
      login.hidden=!!verified;logout.hidden=!user;
      if(previous && previous!==user?.uid){ location.reload(); return; }
      previous=user?.uid;
      if(verified || !required) resolve({ auth, user: verified ? user : null });
    });
  });
}
