/* デザイン集と業種一覧で共有する版・取扱説明・診断コピー。
   表示バージョンは APP_VERSION。リリースノートの先頭と一致させる。 */
(function () {
  var APP_ID = "otsuka-ai-support";
  var APP_VERSION = "1.1.0";
  var HOME = "https://cc-dev-ps7.web.app/";
  var NOTES = [
    {
      ver: "1.1.0",
      date: "2026-10-19",
      items: [
        "飲食・美容・整体・建設のライト1ページ下書きを追加した。",
        "品質基準、業種別の設計、一覧ページを追加した。",
        "破壊的変更はない。目安箱、App Registry、本番でのスモークテストは未実装。"
      ]
    },
    {
      ver: "1.0.0",
      date: "2026-09-12",
      items: [
        "社内デザイン集の初版。ライト6テーマと、スタンダード、プレミアムの見本への導線。"
      ]
    }
  ];
  var errors = [];
  var lastFocus = null;

  window.addEventListener("error", function (e) {
    if (errors.length >= 20) return;
    errors.push(String(e.message || "error").slice(0, 180));
  });

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === "class") node.className = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function installStyle() {
    var style = el("style");
    style.textContent = [
      ".meta-btn{background:transparent;color:inherit;font:inherit;cursor:pointer;border:0;padding:0;text-align:inherit;}",
      ".meta-btn:focus-visible{outline:2px solid #e8722a;outline-offset:3px;}",
      ".meta-tools{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;margin-top:12px;}",
      ".meta-ver{font-family:IBM Plex Sans JP,sans-serif;font-size:12px;letter-spacing:.06em;border-bottom:1px solid rgba(232,114,42,.8);}",
      "dialog.meta-dialog{border:1px solid #e6e1d5;border-radius:14px;padding:22px 22px 18px;max-width:36em;width:calc(100% - 32px);color:#2b2f38;background:#fff;}",
      "dialog.meta-dialog::backdrop{background:rgba(16,24,42,.48);}",
      "dialog.meta-dialog h2{font-size:18px;margin:0 0 12px;}",
      "dialog.meta-dialog h3{font-size:14px;margin:14px 0 4px;}",
      "dialog.meta-dialog p,dialog.meta-dialog li{font-size:14px;line-height:1.7;}",
      "dialog.meta-dialog ul{margin:6px 0 14px;padding-left:1.2em;}",
      ".meta-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;margin-top:16px;}",
      ".meta-actions a,.meta-actions button{font:inherit;font-size:13px;font-weight:700;text-decoration:none;border-radius:999px;padding:8px 14px;}",
      ".meta-actions a{background:#10182a;color:#fff;}",
      ".meta-actions button{background:#fff;border:1px solid #e6e1d5;color:#2b2f38;cursor:pointer;}",
      "#metaToast{position:fixed;left:12px;bottom:12px;z-index:300;background:#10182a;color:#fff;font-size:13px;padding:10px 14px;border-radius:10px;max-width:min(360px,calc(100% - 24px));}",
      "#debugFallback{margin:28px auto;max-width:1080px;padding:12px 16px;background:#fff;border:1px solid #e6e1d5;white-space:pre-wrap;font-size:12px;}"
    ].join("");
    document.head.appendChild(style);
  }

  function makeDialog(id, label) {
    var dialog = el("dialog", { id: id, class: "meta-dialog", "aria-labelledby": id + "-title" });
    dialog.appendChild(el("h2", { id: id + "-title" }, label));
    var body = el("div");
    var actions = el("div", { class: "meta-actions" });
    var home = el("a", { href: HOME }, "ホームへ戻る");
    var close = el("button", { type: "button" }, "閉じる");
    close.addEventListener("click", function () { dialog.close(); });
    actions.appendChild(home);
    actions.appendChild(close);
    dialog.appendChild(body);
    dialog.appendChild(actions);
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("keydown", function (event) {
      if (event.key !== "Tab" || !dialog.open) return;
      var items = Array.prototype.filter.call(
        dialog.querySelectorAll("a[href], button:not([disabled])"),
        function (node) { return node.offsetParent !== null || node === document.activeElement; }
      );
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      var active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    });
    dialog.addEventListener("close", function () {
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    });
    document.body.appendChild(dialog);
    return { dialog: dialog, body: body };
  }

  function show(dialog) {
    lastFocus = document.activeElement;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    var close = dialog.querySelector(".meta-actions button");
    if (close) close.focus();
  }

  function fillNotes(body) {
    body.replaceChildren();
    NOTES.forEach(function (note) {
      var block = el("section");
      var head = el("p");
      head.appendChild(el("strong", null, "v" + note.ver));
      head.appendChild(document.createTextNode("　公開日 " + note.date));
      var list = el("ul");
      note.items.forEach(function (item) { list.appendChild(el("li", null, item)); });
      block.appendChild(head);
      block.appendChild(list);
      body.appendChild(block);
    });
  }

  function fillManual(body) {
    body.replaceChildren();
    [
      ["目的", "社内で、飲食・美容・整体・建設のライト1ページ下書きを比べて選ぶ。"],
      ["基本的な使い方", "一覧のカードからプレビューを開く。店名・料金・電話は架空の例。"],
      ["主な操作", "品質基準を読む。業種の設計を読む。プレビューをPC幅とスマホ幅で見る。"],
      ["注意", "番地のXXと03-0000-は納品前に、地図の表示と突き合わせて消す。この一覧は検索に出さない。"]
    ].forEach(function (row) {
      body.appendChild(el("h3", null, row[0]));
      body.appendChild(el("p", null, row[1]));
    });
  }

  function diagnosticText() {
    var coarse = (navigator.platform || "unknown") + " / " + (navigator.language || "");
    return [
      "appId: " + APP_ID,
      "version: " + APP_VERSION,
      "url: " + location.origin + location.pathname,
      "browser: " + coarse,
      "datetime: " + new Date().toISOString(),
      "screen: " + document.title,
      "logs: " + (errors.join(" | ") || "(none)"),
      "errorCode: (none)"
    ].join("\n");
  }

  function toast(message) {
    var node = document.getElementById("metaToast");
    if (!node) {
      node = el("div", { id: "metaToast", role: "status" });
      document.body.appendChild(node);
    }
    node.textContent = message;
  }

  function showFallback(text) {
    var box = document.getElementById("debugFallback");
    if (!box) {
      box = el("pre", { id: "debugFallback", tabindex: "0" });
      document.body.appendChild(box);
    }
    box.hidden = false;
    box.textContent = text;
    var range = document.createRange();
    range.selectNodeContents(box);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  document.addEventListener("DOMContentLoaded", function () {
    installStyle();
    var notes = makeDialog("notesDialog", "リリースノート");
    var manual = makeDialog("manualDialog", "取扱説明書");
    fillNotes(notes.body);
    fillManual(manual.body);
    var ver = document.getElementById("openNotes");
    var name = document.getElementById("openManual");
    var debug = document.getElementById("debugCopy");
    if (ver) {
      ver.textContent = "v" + APP_VERSION;
      ver.addEventListener("click", function () { show(notes.dialog); });
    }
    if (name) name.addEventListener("click", function () { show(manual.dialog); });
    if (debug) {
      debug.addEventListener("click", function () {
        var text = diagnosticText();
        var writer = navigator.clipboard && navigator.clipboard.writeText;
        if (!writer) {
          showFallback(text);
          toast("コピーできませんでした。下の文字を選択してコピーしてください");
          return;
        }
        writer.call(navigator.clipboard, text).then(function () {
          toast("診断情報をコピーしました");
        }).catch(function () {
          showFallback(text);
          toast("コピーできませんでした。下の文字を選択してコピーしてください");
        });
      });
    }
  });
})();
