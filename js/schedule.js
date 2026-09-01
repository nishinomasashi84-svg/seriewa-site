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

  function renderScheduleList(root) {
    var upcoming = getUpcoming();
    root.innerHTML = "";
    root.setAttribute("aria-label", "SERIE Wの開催日程一覧");

    if (upcoming.length === 0) {
      var empty = el("div", "schedule-page-empty");
      empty.innerHTML = "<strong>次回日程は調整中です</strong><p>決まり次第、このページでお知らせします。LINEでもお気軽にお問い合わせください。</p>";
      root.appendChild(empty);
      return;
    }

    upcoming.forEach(function (session, index) {
      var d = getDateParts(session.date);
      var item = el("article", "schedule-event-card");
      item.innerHTML =
        "<div class=\"schedule-event-number\">" + String(index + 1).padStart(2, "0") + "</div>" +
        "<div class=\"schedule-event-date\"><small>" + d.year + "</small><strong>" + d.month + "/" + d.day + "</strong><span>（" + d.weekday + "）</span></div>" +
        "<dl>" +
          "<div><dt>時間</dt><dd>" + session.startTime + "–" + session.endTime + "</dd></div>" +
          "<div><dt>会場</dt><dd>" + session.venue + "</dd></div>" +
          "<div><dt>参加費</dt><dd>" + session.fee + "</dd></div>" +
        "</dl>" +
        "<a href=\"https://lin.ee/b8IfUOO\" target=\"_blank\" rel=\"noreferrer\">この日程に参加する <span>↗</span></a>";
      root.appendChild(item);
    });
  }

  function addEventStructuredData() {
    if (!document.querySelector("[data-schedule-page]")) return;
    var upcoming = getUpcoming();
    var existing = document.querySelector("script[data-seriewa-event-data]");
    if (existing) existing.remove();
    if (upcoming.length === 0) return;

    var data = {
      "@context": "https://schema.org",
      "@graph": upcoming.map(function (session) {
        return {
          "@type": "SportsEvent",
          "name": "SERIE W 個人参加型フットサル",
          "startDate": session.date + "T" + session.startTime + ":00+09:00",
          "endDate": session.date + "T" + session.endTime + ":00+09:00",
          "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
          "eventStatus": "https://schema.org/EventScheduled",
          "location": {
            "@type": "Place",
            "name": session.venue
          },
          "organizer": { "@id": "https://seriew.com/#organization" },
          "url": "https://seriew.com/schedule/"
        };
      })
    };
    var script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-seriewa-event-data", "");
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function init() {
    document.querySelectorAll("[data-schedule-board]").forEach(renderScheduleBoard);
    document.querySelectorAll("[data-next-session-ticket]").forEach(renderNextSessionTicket);
    document.querySelectorAll("[data-schedule-list]").forEach(renderScheduleList);
    addEventStructuredData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
