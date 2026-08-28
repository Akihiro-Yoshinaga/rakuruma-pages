/* 回遊トラッキング（2026-08-28 追加）
 * 「最後に押したLINEボタン」しか分からなかった導線計測に、
 * 「最初にどこへ着地して、どこを回ってから押したか」を足すための共通スクリプト。
 *
 * 保存先は localStorage の rk_journey（自社ドメイン内のみ・個人情報は持たない）。
 *   ft   初回LP（最初に着地したページのパス）
 *   ref  初回の参照元ホスト（google / instagram / curama など。無ければ direct）
 *   ts   初回訪問日時（ISO）
 *   n    このウィンドウ内で見たページ数
 *   p    直近に見たページのパス（最大8件・重複連続は畳む）
 * 30日で初回接触をリセットする（古い流入が永遠に貼り付くのを防ぐ）。
 */
(function () {
  var KEY = 'rk_journey';
  var WINDOW_DAYS = 30;
  var MAX_PATH = 8;

  // 中継ページ（/p/...）は「見たページ」に数えない。押した瞬間の踏み台なので経路が汚れる
  if (location.pathname.indexOf('/p/') === 0) return;

  function refHost() {
    var r = document.referrer || '';
    if (!r) return 'direct';
    var h = '';
    try { h = new URL(r).hostname.replace(/^www\./, ''); } catch (e) { return 'direct'; }
    if (!h || h === location.hostname) return 'internal';
    if (/(^|\.)google\./.test(h))            return 'google';
    if (/(^|\.)(bing|yahoo)\./.test(h))      return h.split('.')[0];
    if (/instagram\.com$/.test(h))           return 'instagram';
    if (/^(t\.co|x\.com|twitter\.com)$/.test(h)) return 'x';
    if (/(lin\.ee|line\.me)$/.test(h))       return 'line';
    if (/curama\.jp$/.test(h))               return 'curama';
    if (/note\.com$/.test(h))                return 'note';
    if (/facebook\.com$/.test(h))            return 'facebook';
    return h.slice(0, 40);
  }

  try {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }

    // 30日を過ぎた初回接触は捨てて、この訪問を新しい初回として数え直す
    if (s.ts && (Date.now() - Date.parse(s.ts)) > WINDOW_DAYS * 864e5) s = {};

    var path = location.pathname;
    if (!s.ft) {
      s.ft  = path;
      s.ref = refHost();
      s.ts  = new Date().toISOString();
      s.n   = 0;
      s.p   = [];
    }
    s.n = (s.n || 0) + 1;
    s.p = s.p || [];
    if (s.p[s.p.length - 1] !== path) s.p.push(path);
    if (s.p.length > MAX_PATH) s.p = s.p.slice(-MAX_PATH);

    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) { /* プライベートブラウズ等でlocalStorageが使えない場合は黙って諦める */ }
})();
