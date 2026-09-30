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
    var mp = h.match(/[#&]p=([^&]+)/), mt = h.match(/[#&]t=([^&]+)/);
    var done = Promise.resolve(get());
    if (mt) { set(decodeURIComponent(mt[1])); done = Promise.resolve(get()); }
    if (mp) {
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
      if (r && r.ok && r.code) { try { history.replaceState(null, '', w.location.pathname + w.location.search + '#p=' + encodeURIComponent(r.code)); } catch (e) {} }
      return r;
    });
  }
  w.StaffTicket = { KEY: KEY, RSV_GAS: RSV_GAS, get: get, set: set, clear: clear, init: init, linkTicket: linkTicket, homeScreenPrep: homeScreenPrep,
    goUrl: function (q) { return '/staff/go/?q=' + encodeURIComponent(q); } };
})(window);
