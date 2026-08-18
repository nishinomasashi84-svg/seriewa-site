// SERIE W schedule data + renderer (plain JS port of the original React ScheduleBoard/NextSessionTicket)
// 開催予定はここだけ更新すれば、トップページ・ブログ記事内のすべてのスケジュール表示に反映されます。
(function () {
  var sessions = [
    { date: "2026-08-30", startTime: "17:00", endTime: "19:00", venue: "泉佐野市オークアリーナ", fee: "1名 ¥1,000" },
    { date: "2026-09-13", startTime: "17:00", endTime: "19:00", venue: "泉佐野市オークアリーナ", fee: "1名 ¥1,000" },
    { date: "2026-09-27", startTime: "15:00", endTime: "17:00", venue: "泉佐野市オークアリーナ", fee: "1名 ¥1,000" }
  ];

  var weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  function getTodayInJapan() {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  function getDateParts(date) {
    var parts = date.split("-").map(Number);
    var weekday = weekdays[new Date(date + "T12:00:00+09:00").getDay()];
    return {
      year: parts[0],
      month: String(parts[1]).padStart(2, "0"),
      day: String(parts[2]).padStart(2, "0"),
      weekday: weekday
    };
  }

  function getUpcoming() {
    var today = getTodayInJapan();
    return sessions
      .filter(function (s) { return s.date >= today; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
  }

  function el(tag, className, html) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function renderScheduleBoard(root) {
    var upcoming = getUpcoming();
    root.innerHTML = "";
    root.classList.add("schedule-board");
    root.setAttribute("aria-label", "今後の開催予定");

    var label = el("div", "schedule-label");
    label.innerHTML = "<span>UPCOMING</span><b>今後の開催予定</b>";
    root.appendChild(label);

    if (upcoming.length > 0) {
      upcoming.forEach(function (session, index) {
        var d = getDateParts(session.date);
        var row = el("div", "schedule-row");
        row.innerHTML =
          "<small>" + String(index + 1).padStart(2, "0") + "</small>" +
          "<strong><span>" + d.month + "</span>/" + d.day + "</strong>" +
          "<em>（" + d.weekday + "）</em>" +
          "<b>" + session.startTime + "–" + session.endTime + "</b>";
        root.appendChild(row);
      });
    } else {
      var empty = el("div", "schedule-empty");
      empty.innerHTML = "<strong>次回日程は調整中です</strong><span>決まり次第、こちらでお知らせします。</span>";
      root.appendChild(empty);
    }
  }

  function renderNextSessionTicket(root) {
    var upcoming = getUpcoming();
    var next = upcoming[0];
    root.innerHTML = "";
    root.classList.add("session-ticket");

    var top = el("div", "ticket-top");
    top.innerHTML = "<span>NEXT SESSION</span><b>" + (next ? "ENTRY OPEN" : "COMING SOON") + "</b>";
    root.appendChild(top);

    var main = el("div", "ticket-main");
    var w = el("div", "ticket-w", "W");
    main.appendChild(w);

    if (next) {
      var d = getDateParts(next.date);
      var rows = [
        ["DATE", next.date.replaceAll("-", ".") + "（" + d.weekday + "）"],
        ["TIME", next.startTime + "–" + next.endTime],
        ["VENUE", next.venue],
        ["FEE", next.fee]
      ];
      rows.forEach(function (r) {
        var row = el("div", "", "<small>" + r[0] + "</small><strong>" + r[1] + "</strong>");
        main.appendChild(row);
      });
    } else {
      var pending = el("div", "ticket-pending", "<small>NEXT DATE</small><strong>次回日程は調整中</strong>");
      main.appendChild(pending);
    }
    root.appendChild(main);

    var link = el("a", "", "LINEで開催日を確認 <span>↗</span>");
    link.href = "https://lin.ee/b8IfUOO";
    link.target = "_blank";
    link.rel = "noreferrer";
    root.appendChild(link);
  }

  function init() {
    document.querySelectorAll("[data-schedule-board]").forEach(renderScheduleBoard);
    document.querySelectorAll("[data-next-session-ticket]").forEach(renderNextSessionTicket);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
