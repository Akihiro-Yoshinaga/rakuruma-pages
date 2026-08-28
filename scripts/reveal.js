// スクロールリビール（サイト共通）
// 見出し・カードが14px下から0.7sで静かに現れる。兄弟要素は90ms時差。
// - 初期表示領域にある要素はスキップ（チラつき防止）
// - prefers-reduced-motion の場合は何もしない
(function () {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;

    var SELECTORS = [
        'section h2', '.headline',
        '.sec-eyebrow', '.pain-eyebrow', '.sol-eyebrow', '.loc-eyebrow', '.pt-eyebrow',
        '.pain-card', '.sol-card', '#points .flexbox', '.point .flexbox',
        '.loc-card', '.rkb', '.pcard', '.pfx-card',
        '.step_list li', '.service_list li', '.plan_box', '.plan-perk',
        '[data-reveal]'
    ];

    var css = '.rv-fade{opacity:0;transform:translateY(14px);transition:opacity .7s ease-out,transform .7s ease-out}' +
        '.rv-fade.is-in{opacity:1;transform:translateY(0)}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    function init() {
        var els = Array.prototype.slice.call(document.querySelectorAll(SELECTORS.join(',')));
        var vh = window.innerHeight;
        var targets = [];
        els.forEach(function (el) {
            var r = el.getBoundingClientRect();
            if (r.top < vh * 0.85) return; // 開いた瞬間に見えている要素は動かさない
            el.classList.add('rv-fade');
            targets.push(el);
        });
        if (!targets.length) return;
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        targets.forEach(function (el) {
            var sibs = Array.prototype.filter.call(el.parentElement.children, function (c) {
                return c.classList.contains('rv-fade');
            });
            var idx = sibs.indexOf(el);
            if (idx > 0) { el.style.transitionDelay = Math.min(idx * 90, 360) + 'ms'; }
            io.observe(el);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
