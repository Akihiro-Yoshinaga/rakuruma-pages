// くらしのマーケット口コミ実績の自動反映（サイト共通）
// GASのcuramaStats APIから最新の件数・評価を取得し、
// [data-curama-count] / [data-curama-rating] のテキストを書き換える。
// 取得失敗時は何もしない（HTMLに書かれた値がそのまま表示される）。
(function () {
    var els = document.querySelectorAll('[data-curama-count],[data-curama-rating]');
    if (!els.length) return;
    var API = 'https://script.google.com/macros/s/AKfycbyAqquwyC0b-2MeriwzDH1b5W4x9ol7CjmDWssq_F1ijo-8HR9C81OSqM_Mtcjsd_Gw/exec?action=curamaStats';
    fetch(API).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.ok || !d.count || !d.rating) return;
        document.querySelectorAll('[data-curama-count]').forEach(function (el) { el.textContent = d.count; });
        document.querySelectorAll('[data-curama-rating]').forEach(function (el) { el.textContent = d.rating; });
    }).catch(function () {});
})();
