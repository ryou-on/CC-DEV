/* Shared sign-in and App Check for protected paid APIs. No provider secret belongs here. */
(() => {
  'use strict';
  const sdk = 'https://www.gstatic.com/firebasejs/10.12.2/';
  let auth, check, authSdk, checkSdk, startup;
  const messages = {
    SIGN_IN_REQUIRED: '先にGoogleでログインしてください。',
    ACCOUNT_NOT_ALLOWED: 'このアカウントは利用を許可されていません。',
    USAGE_LIMIT: '利用上限に達しました。しばらく待つか、管理者にご連絡ください。',
    SERVICE_PAUSED: '安全確認のため、この機能は現在停止しています。',
    QUOTA_UNAVAILABLE: '利用上限を確認できないため処理を停止しました。再実行せず、時間をおいてください。',
    EXPIRY_QUEUE_NOT_READY: '通訳の安全設定を準備しています。',
  };
  async function initialize() {
    const [appSdk, a, c, configResponse] = await Promise.all([
      import(sdk + 'firebase-app.js'), import(sdk + 'firebase-auth.js'),
      import(sdk + 'firebase-app-check.js'), fetch('/shared/cost-access-config.json', {cache:'no-cache'}),
    ]);
    if (!configResponse.ok) throw Error('保護設定を読み込めませんでした。');
    const config = await configResponse.json();
    const app = appSdk.getApps().find(x => x.name === 'cost-access') || appSdk.initializeApp(config.firebase, 'cost-access');
    authSdk = a; checkSdk = c;
    auth = a.getAuth(app);
    if (typeof config.recaptchaEnterpriseSiteKey === 'string' && config.recaptchaEnterpriseSiteKey.trim()) {
      check = c.initializeAppCheck(app, {
        provider: new c.ReCaptchaEnterpriseProvider(config.recaptchaEnterpriseSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
    await new Promise(resolve => {
      const unsubscribe = a.onAuthStateChanged(auth, user => {
        const label = document.getElementById('cost-access-status');
        if (label) label.textContent = user ? 'ログイン済み' : '有料機能はログインが必要です';
        resolve();
      });
      // Keep the observer to update the bar after sign-in/out.
      void unsubscribe;
    });
  }
  function ready() {
    if (!startup) startup = initialize().catch(e => { startup = null; throw e; });
    return startup;
  }
  async function headers() {
    await ready();
    if (!auth.currentUser) throw Error(messages.SIGN_IN_REQUIRED);
    if (!check) throw Error('安全設定の準備中です。管理者にご連絡ください。');
    const [id, attestation] = await Promise.all([auth.currentUser.getIdToken(), checkSdk.getToken(check)]);
    return {Authorization:'Bearer ' + id, 'X-Firebase-AppCheck':attestation.token};
  }
  async function protectedFetch(url, options = {}) {
    const target = new URL(url, location.href);
    const sameOriginApi = target.origin === location.origin && ['/api/realtime-token', '/api/interpreter-call', '/api/mini-me-generate'].includes(target.pathname);
    const cloudProxy = target.origin === 'https://asia-northeast1-cc-dev-ps7.cloudfunctions.net' && /^\/anthropicProxy(?:\/v1\/messages)?$/.test(target.pathname);
    if (!sameOriginApi && !cloudProxy) throw Error('許可されていない通信先です。');
    const h = new Headers(options.headers || {});
    for (const [k,v] of Object.entries(await headers())) h.set(k,v);
    return fetch(url, {...options, headers:h, redirect:'error'});
  }
  async function error(response) {
    const body = await response.text();
    let code = body;
    try { code = JSON.parse(body).error || body; } catch (_) {}
    return new Error(messages[code] || (response.status === 403 ? '利用権限またはアプリの安全確認に失敗しました。' : '処理できませんでした。時間をおいてお試しください。'));
  }
  function mount() {
    if (document.getElementById('cost-access-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'cost-access-bar';
    bar.style.cssText = 'padding:10px 16px;background:#eef4ff;color:#172554;font:14px sans-serif;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
    const label = document.createElement('span'); label.id='cost-access-status';label.textContent='有料機能はログインが必要です';
    const login = document.createElement('button'); login.type='button';login.textContent='Googleでログイン';
    login.onclick = async () => {
      login.disabled=true;
      try { await ready(); await authSdk.signInWithPopup(auth,new authSdk.GoogleAuthProvider()); }
      catch { label.textContent='ログインできませんでした。もう一度お試しください。'; }
      finally {login.disabled=false;}
    };
    const logout = document.createElement('button');logout.type='button';logout.textContent='ログアウト';
    logout.onclick=async()=>{try{await ready();await authSdk.signOut(auth);}catch{label.textContent='ログアウトできませんでした。';}};
    bar.append(label,login,logout);document.body.prepend(bar);
    ready().catch(()=>{label.textContent='ログインの準備ができませんでした。ページを再読み込みしてください。';});
  }
  window.CostAccess={headers,fetch:protectedFetch,error};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else mount();
})();
