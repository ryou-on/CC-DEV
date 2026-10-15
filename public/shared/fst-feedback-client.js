/* Flight Strip 目安箱。Firestore へは書かず、Hosting の /api/fst-feedback を呼ぶ。 */
(function () {
  'use strict';
  const MESSAGES = {
    SIGN_IN_REQUIRED: '先にログインしてください。',
    VERIFIED_ACCOUNT_REQUIRED: 'メール確認済みのアカウントでログインしてください。',
    APP_CHECK_REQUIRED: 'アプリの確認ができませんでした。ページを再読み込みしてください。',
    INVALID_APP_CHECK: 'アプリの確認ができませんでした。ページを再読み込みしてください。',
    RATE_LIMIT: '送信回数の上限に達しました。しばらく待ってから再度お試しください。',
    DUPLICATE: '同じ内容を短時間に連続送信できません。',
    REJECTED: '送信できませんでした。時間をおいてお試しください。',
    INVALID_MESSAGE: 'メッセージは1〜2,000文字で入力してください。',
    INVALID_SUBJECT: '件名は1〜200文字で入力してください。',
    EDITOR_REQUIRED: 'この操作は編集者だけが実行できます。',
  };
  let appCheckReady;

  function load(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(Error(MESSAGES.APP_CHECK_REQUIRED));
      document.head.append(script);
    });
  }

  async function headers() {
    const user = firebase.auth().currentUser;
    if (!user) throw Error(MESSAGES.SIGN_IN_REQUIRED);
    if (!appCheckReady) {
      appCheckReady = (async () => {
        if (!firebase.appCheck) await load('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check-compat.js');
        const res = await fetch('/shared/cost-access-config.json', { cache: 'no-cache' });
        if (!res.ok) throw Error(MESSAGES.APP_CHECK_REQUIRED);
        const config = await res.json();
        if (typeof config.recaptchaEnterpriseSiteKey !== 'string' || !config.recaptchaEnterpriseSiteKey.trim()) {
          throw Error(MESSAGES.APP_CHECK_REQUIRED);
        }
        firebase.appCheck().activate(
          new firebase.appCheck.ReCaptchaEnterpriseProvider(config.recaptchaEnterpriseSiteKey),
          true
        );
      })().catch(error => { appCheckReady = null; throw error; });
    }
    await appCheckReady;
    const [id, attestation] = await Promise.all([user.getIdToken(), firebase.appCheck().getToken(false)]);
    return {
      Authorization: 'Bearer ' + id,
      'X-Firebase-AppCheck': attestation.token,
      'Content-Type': 'application/json',
    };
  }

  async function post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify(body),
      redirect: 'error',
    });
    let payload = {};
    try { payload = await res.json(); } catch (_) { payload = {}; }
    if (!res.ok || payload.ok !== true) {
      throw Error(MESSAGES[payload.error] || '送信できませんでした。時間をおいてお試しください。');
    }
    return payload;
  }

  window.FstFeedback = {
    submit: body => post('/api/fst-feedback', body),
    update: body => post('/api/fst-feedback-update', body),
  };
})();
