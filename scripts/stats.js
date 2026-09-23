// くらしのマーケット口コミ実績の自動反映（サイト共通）
// GASのcuramaStats APIから最新の件数・評価を取得し、
// [data-curama-count] / [data-curama-rating] のテキストを書き換える。
// Google口コミは [data-google-count] / [data-google-rating]（囲みの [data-google-stat] は値が来るまで hidden）。
// 取得失敗時は何もしない（HTMLに書かれた値がそのまま表示される）。
(function () {
    var els = document.querySelectorAll('[data-curama-count],[data-curama-rating]');
    if (!els.length) return;
    var API = 'https://script.google.com/macros/s/AKfycbyAqquwyC0b-2MeriwzDH1b5W4x9ol7CjmDWssq_F1ijo-8HR9C81OSqM_Mtcjsd_Gw/exec?action=curamaStats';
    fetch(API).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.ok || !d.count || !d.rating) return;
        document.querySelectorAll('[data-curama-count]').forEach(function (el) { el.textContent = d.count; });
        document.querySelectorAll('[data-curama-rating]').forEach(function (el) { el.textContent = d.rating; });
        // 洗車の口コミ（店舗口コミ一覧を毎日巡回した値）。件数・「すべて★5」か「★5が◯件」か・平均
        if (d.washCount) {
            document.querySelectorAll('[data-curama-wash-count]').forEach(function (el) { el.textContent = d.washCount; });
            document.querySelectorAll('[data-curama-wash-claim]').forEach(function (el) { el.textContent = (d.washFive === d.washCount) ? 'すべて★5' : ('★5が' + d.washFive + '件'); });
            if (d.washAvg) document.querySelectorAll('[data-curama-wash-avg]').forEach(function (el) { el.textContent = Number(d.washAvg).toFixed(1); });
        }
        // Googleビジネスプロフィールの口コミ（件数・平均評価）。HTMLには数字を書かず、値が来たときだけ [data-google-stat] を表示する
        if (d.googleCount && d.googleRating) {
            document.querySelectorAll('[data-google-count]').forEach(function (el) { el.textContent = d.googleCount; });
            document.querySelectorAll('[data-google-rating]').forEach(function (el) { el.textContent = d.googleRating; });
            document.querySelectorAll('[data-google-stat]').forEach(function (el) { el.hidden = false; });
        }
    }).catch(function () {});
})();
