// ---------- /community/login/：ログイン・新規登録・メールのリンク・パスワード再設定 ----------
(function authPage() {
  const box = $('[data-auth]');
  if (!box || !READY) return;
  const form = $('[data-auth-form]'), err = $('[data-auth-error]'), ok = $('[data-auth-ok]');
  const next = safePath(qs.get('next')) || '/community/';
  let mode = qs.get('mode') === 'signup' ? 'signup' : 'login';
  const say = (m, good = false) => { err.hidden = good || !m; ok.hidden = !good || !m; (good ? ok : err).textContent = m; };
  const done = () => { box.hidden = true; $('[data-auth-done]').hidden = false; };

  // パスワード再設定のリンクから来たとき
  if (authLinkType === 'recovery' && uid()) {
    mode = 'reset';
    form.email.closest('.field').hidden = true;
    $('[data-auth-submit-l]').textContent = '新しいパスワードを設定';
    $('.auth__mode').hidden = true; $('.auth__alt').hidden = true;
    form.password.autocomplete = 'new-password';
  } else if (uid()) {
    if (authLinkType) { location.replace(next); return; }
    done();
  }
  const setMode = (m) => {
    mode = m;
    $$('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    $('[data-only-signup]').hidden = m !== 'signup';
    $('[data-auth-submit-l]').textContent = m === 'signup' ? '登録する' : 'ログイン';
    form.password.autocomplete = m === 'signup' ? 'new-password' : 'current-password';
    say('');
  };
  if (mode !== 'reset') setMode(mode);
  $$('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  const AUTH_ERR = (e) => {
    const m = String(e?.message || '');
    if (/Invalid login credentials/i.test(m)) return 'メールアドレスかパスワードが違います。';
    if (/Email not confirmed/i.test(m)) return 'メールアドレスの確認が終わっていません。届いたメールのリンクを開いてください。';
    if (/already registered|already exists/i.test(m)) return 'このメールアドレスはすでに登録されています。ログインしてください。';
    if (/Password should be|weak/i.test(m)) return 'パスワードは8文字以上で、推測されにくいものにしてください。';
    if (/rate limit|too many/i.test(m) || e?.status === 429) return '試行が続いたため、しばらく時間をおいてからお試しください。';
    return errText(e);
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim(), pw = form.password.value;
    const btn = $('[data-auth-submit]');
    if (mode === 'reset') {
      if (pw.length < 8) return say('パスワードは8文字以上にしてください。');
      try { await busy(btn, () => auth.setPassword(pw)); say('パスワードを変更しました。', true); setTimeout(() => location.replace(next), 800); } catch (ex) { say(AUTH_ERR(ex)); }
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say('メールアドレスを正しく入力してください。');
    if (pw.length < 8) return say('パスワードは8文字以上にしてください。');
    if (mode === 'signup' && !(form.age.checked && form.rules.checked)) return say('18歳以上であることと、ルールへの同意の両方にチェックしてください。');
    try {
      if (mode === 'signup') {
        const r = await busy(btn, () => auth.signUp(email, pw));
        const id = r?.user?.id || r?.id;
        if (id) store.set('pendingAge', id);
        if (uid()) { await myProfile(true); location.replace('/community/me/#settings'); }
        else say('確認のメールを送りました。メールのリンクを開くと登録が完了します。', true);
      } else {
        await busy(btn, () => auth.signIn(email, pw));
        await myProfile(true).catch(() => {});
        location.replace(next);
      }
    } catch (ex) { say(AUTH_ERR(ex)); }
  });
  $('[data-magic]').addEventListener('click', async (e) => {
    const email = form.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say('先にメールアドレスを入力してください。');
    try { await busy(e.currentTarget, () => auth.magic(email)); say('ログイン用のリンクをメールで送りました（登録済みのアドレスの場合）。', true); } catch (ex) { say(AUTH_ERR(ex)); }
  });
  $('[data-forgot]').addEventListener('click', async (e) => {
    const email = form.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say('先にメールアドレスを入力してください。');
    try { await busy(e.currentTarget, () => auth.recover(email)); say('パスワード再設定のリンクをメールで送りました（登録済みのアドレスの場合）。', true); } catch (ex) { say(AUTH_ERR(ex)); }
  });
})();
