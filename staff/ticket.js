/* スタッフの入場券（2026-09-30）
 * 入場券（st1.…・90日）はこの端末の中（localStorage）にだけ置き、URLには載せない。
 * 予約管理GASのページへは、押した瞬間に5分券（sl1.…）を作ってから飛ぶ（/staff/go/）。
 * ホーム画面のアプリ（iPhoneはSafariと保存場所が別）には、30分・1回きりの受け渡し番号（#p=…）で本券を渡す。
 * 旧式（LINE IDそのもの・#t=U…）は、切り替えまでのあいだ読み込むだけ受け付ける。
 */
(function (w) {
  var KEY = 'rakuruma_staff_token';
  var VPS = 'https://133-167-93-192.sslip.io/ticket';
  var RSV_GAS = 'https://script.google.com/macros/s/AKfycbyAqquwyC0b-2MeriwzDH1b5W4x9ol7CjmDWssq_F1ijo-8HR9C81OSqM_Mtcjsd_Gw/exec';
  function get() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function set(t) { try { localStorage.setItem(KEY, t); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function post(body, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var tm = ctl ? setTimeout(function () { ctl.abort(); }, ms || 15000) : null;
    return fetch(VPS, { method: 'POST', body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (tm) clearTimeout(tm); return r.json(); }, function (e) { if (tm) clearTimeout(tm); throw e; });
  }
  // URLの #p=（受け渡し番号）/ #t=（ログイン直後・旧式）を読み、端末に保存して、アドレスバーからは消す
  function init() {
    var h = w.location.hash || '';
    // 受け渡し番号は ?p=（ChromeからiPhoneのホーム画面に追加すると #… が落ちることがあるため・2026-10-02）。旧 #p= も読む
    var mp = (w.location.search || '').match(/[?&]p=([^&]+)/) || h.match(/[#&]p=([^&]+)/), mt = h.match(/[#&]t=([^&]+)/);
    var done = Promise.resolve(get());
    if (mt) { set(decodeURIComponent(mt[1])); done = Promise.resolve(get()); }
    // 番号の受け取りは、この端末に本券がまだ無いとき（＝ホーム画面のアイコンの初回）だけ。ブラウザ側で番号を使い切らない
    if (mp && !/^st1\./.test(get())) {
      var code = decodeURIComponent(mp[1]);
      done = post({ op: 'pair', code: code }).then(function (r) { if (r && r.ok && r.token) set(r.token); return get(); }, function () { return get(); });
    }
    // ホーム画面アプリの起動URL（#p=…）は残す（アプリの起動URLになっているため）。#t= は消す
    if (mt && !mp) { try { history.replaceState(null, '', w.location.pathname + w.location.search); } catch (e) {} }
    return done;
  }
  // 5分券を作る（VPS → 届かなければ予約管理GAS）
  function linkTicket() {
    var t = get();
    // 旧式（LINE IDそのもの）を持っている端末は、切り替えまではそのまま渡す（予約管理GASが通すかどうか決める）
    if (/^U[0-9a-f]{32}$/.test(t)) return Promise.resolve({ ok: true, ticket: t, legacy: true });
    if (!/^st1\./.test(t)) return Promise.resolve({ ok: false, relogin: true });
    return post({ op: 'link', token: t }, 10000).catch(function () {
      return fetch(RSV_GAS + '?action=staffLinkTicket&token=' + encodeURIComponent(t)).then(function (r) { return r.json(); });
    });
  }
  // ホーム画面に追加する準備：受け渡し番号をURLに付ける（この状態で「ホーム画面に追加」する）
  function homeScreenPrep() {
    var t = get();
    if (!/^st1\./.test(t)) return Promise.resolve({ ok: false, error: 'いったんログインし直してから、もう一度押してください' });
    return post({ op: 'pairNew', token: t }).then(function (r) {
      if (r && r.ok && r.code) { try { history.replaceState(null, '', w.location.pathname + '?p=' + encodeURIComponent(r.code)); } catch (e) {} }
      return r;
    });
  }
  // iPhone/iPadのブラウザ（Chrome・Safari）で開いているあいだは、受け渡し番号を先に用意してURLに付けておく。
  // こうすると、共有 →「ホーム画面に追加」だけで、ログイン済みのアイコンができる（ボタンを押す手順が要らない・2026-10-01）。
  // 番号は30分・1回きりなので、25分ごとに作り直す。アプリとして開いているときやパソコンでは何もしない
  function isAppMode() { return !!(w.navigator.standalone || (w.matchMedia && w.matchMedia('(display-mode: standalone)').matches)); }
  // Chromeは「ページを読み込んだときのURL」でアイコンを作る（表示だけ書き換えても入らない・2026-10-02 実測）。
  // そこで番号を付けたURLで読み込み直す。読み込み直しは番号を作ったときだけ（25分たつまで同じ番号を使う）
  function autoHomePrep() {
    return; // 2026-10-02 見切り：ChromeからiPhoneのホーム画面に追加するとURLの番号が落ちる → 4桁の承認方式（appCodeFlow）に
    if (isAppMode() || !/iPhone|iPad|iPod/.test(w.navigator.userAgent || '')) return;
    if (!/^st1\./.test(get())) return;
    var cur = (w.location.search || '').match(/[?&]p=([^&]+)/);
    var madeAt = 0; try { madeAt = Number(sessionStorage.getItem('staffPairAt') || 0); } catch (e) {}
    function renew() {
      post({ op: 'pairNew', token: get() }).then(function (r) {
        if (!r || !r.ok || !r.code) return;
        try { sessionStorage.setItem('staffPairAt', String(Date.now())); } catch (e) {}
        w.location.replace(w.location.pathname + '?p=' + encodeURIComponent(r.code));
      }).catch(function () {});
    }
    if (!cur || Date.now() - madeAt > 25 * 60000) renew();
    setInterval(function () { if (document.visibilityState === 'visible') { var m = 0; try { m = Number(sessionStorage.getItem('staffPairAt') || 0); } catch (e) {} if (Date.now() - m > 25 * 60000) renew(); } }, 60000);
  }
  // ---- ホーム画面のアイコンを4桁で承認（2026-10-02）
  // アイコン側（入場券なし）：4桁を出して、承認されるまで3秒おきに受け取りに行く。受け取れたら保存して読み込み直す
  function appCodeFlow(box) {
    var stop = false;
    function render(html) { if (box) box.innerHTML = html; }
    function start() {
      render('<div style="text-align:center;padding:28px 16px;color:#4A5568">番号を用意しています…</div>');
      post({ op: 'appCode' }).then(function (r) {
        if (!r || !r.ok) { render('<div style="text-align:center;padding:28px 16px;color:#C53030">' + ((r && r.error) || '番号を用意できませんでした') + '<br><a href="" onclick="location.reload();return false;">もう一度</a></div>'); return; }
        var until = Date.now() + (r.expiresIn || 300) * 1000;
        render('<div style="text-align:center;padding:24px 16px;color:#1A202C;line-height:1.7">'
          + '<div style="font-weight:800;font-size:16px">このアイコンを使えるようにします</div>'
          + '<div style="font-size:13px;color:#4A5568;margin-top:6px">ログイン済みのブラウザ（ChromeやSafari）でスタッフ用トップか受信箱を開き、いちばん下の「アイコンを承認する」に、この番号を入れてください</div>'
          + '<div style="font-size:44px;font-weight:800;letter-spacing:12px;margin:18px 0 6px;color:#182F66">' + r.code + '</div>'
          + '<div style="font-size:12px;color:#718096">5分で切れます。承認されると自動で開きます</div></div>');
        (function poll() {
          if (stop) return;
          if (Date.now() > until) { render('<div style="text-align:center;padding:28px 16px;color:#4A5568">番号の期限が切れました<br><a href="" onclick="location.reload();return false;">新しい番号を出す</a></div>'); return; }
          post({ op: 'appPoll', pollId: r.pollId }, 10000).then(function (q) {
            if (q && q.ok && q.token) { set(q.token); stop = true; render('<div style="text-align:center;padding:28px 16px;color:#2F855A;font-weight:700">承認されました。開いています…</div>'); setTimeout(function () { w.location.replace(w.location.pathname); }, 600); return; }
            if (q && q.expired) { render('<div style="text-align:center;padding:28px 16px;color:#4A5568">番号の期限が切れました<br><a href="" onclick="location.reload();return false;">新しい番号を出す</a></div>'); return; }
            setTimeout(poll, 3000);
          }, function () { setTimeout(poll, 5000); });
        })();
      }, function () { render('<div style="text-align:center;padding:28px 16px;color:#C53030">通信できませんでした<br><a href="" onclick="location.reload();return false;">もう一度</a></div>'); });
    }
    start();
  }
  // ログイン済みのブラウザ側：4桁を入れてアイコンを承認する
  function approveApp() {
    var t = get();
    if (!/^st1\./.test(t)) { alert('いったんログインし直してから、もう一度押してください'); return; }
    var code = (w.prompt('ホーム画面のアイコンに出ている4桁の番号を入れてください') || '').replace(/\D/g, '');
    if (!code) return;
    post({ op: 'appApprove', token: t, code: code }).then(function (r) {
      if (r && r.ok) alert('承認しました。アイコンの画面が数秒で開きます。');
      else alert((r && r.error) || '承認できませんでした');
    }, function () { alert('通信できませんでした'); });
  }
  w.StaffTicket = { KEY: KEY, isAppMode: isAppMode, autoHomePrep: autoHomePrep, appCodeFlow: appCodeFlow, approveApp: approveApp, RSV_GAS: RSV_GAS, get: get, set: set, clear: clear, init: init, linkTicket: linkTicket, homeScreenPrep: homeScreenPrep,
    goUrl: function (q) { return '/staff/go/?q=' + encodeURIComponent(q); } };
})(window);
