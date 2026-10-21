/* Maren — "Never Miss a Customer" demo chat engine (hotel edition).
   100% client-side. No network calls, no tracking. Works from file:// .
   Leads are persisted to localStorage (simulated owner dashboard).
   Test hooks: ?fast=1 skips delays; window.__maya exposes state + send();
   window.__getLeads/__clearLeads expose and reset the persisted leads. */
(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);
  var FAST = qs.get('fast') === '1';

  /* ---------- business profile (personalizable via ?biz= etc.) ---------- */
  var BIZ = {
    name:    qs.get('biz')     || 'Willowmere Hotel',
    tagline: qs.get('tagline') || 'Boutique Stays & Riverwalk Retreat',
    city:    qs.get('city')    || 'San Antonio, TX',
    address: qs.get('addr') || qs.get('address') || '718 E Commerce St, San Antonio, TX 78205',
    phone:   qs.get('phone')   || '(210) 555-0147',
    host: 'Maren'
  };
  // short ref prefix from the name's initials, e.g. "Willowmere Hotel" -> "WH"
  BIZ.refPrefix = (BIZ.name.split(/\s+/).map(function (w) { return w.charAt(0); }).filter(function (c) { return /[A-Za-z]/.test(c); }).join('').slice(0, 2).toUpperCase()) || 'WH';

  /* apply personalization to the page */
  function personalize() {
    document.querySelectorAll('[data-biz="name"]').forEach(function (el) { el.textContent = BIZ.name; });
    document.querySelectorAll('[data-biz="tagline"]').forEach(function (el) { el.textContent = BIZ.tagline; });
    document.querySelectorAll('[data-biz="city"]').forEach(function (el) { el.textContent = BIZ.city; });
    document.querySelectorAll('[data-biz="address"]').forEach(function (el) { el.textContent = BIZ.address; });
    document.querySelectorAll('[data-biz="phone"]').forEach(function (el) { el.textContent = BIZ.phone; });
    /* tap-to-call binding (fleet standard, 2026-10-15): every tel: CTA follows ?phone=,
       digits-only in the href so an injected param can't smuggle markup/JS. */
    document.querySelectorAll('#call-cta, a[data-biz="phone"]').forEach(function (el) {
      el.setAttribute('href', 'tel:' + String(BIZ.phone).replace(/[^+\d]/g, ''));
    });
    document.querySelectorAll('[data-biz="host"]').forEach(function (el) { el.textContent = BIZ.host; });
    document.querySelectorAll('[data-biz="host-initial"]').forEach(function (el) { el.textContent = BIZ.host.charAt(0); });
    document.title = BIZ.name + ' — ' + BIZ.tagline + ' | ' + BIZ.city;
  }
  /* ---------- deep personalization: ?services= ?hours= ----------
     services: pipe-separated REAL service names -> rendered into the services grid (max 8).
     hours: pipe-separated "Day(s): time" pairs -> rendered into the hours table (max 6).
     Graceful fallback: the page keeps its built-in fictional content when a param is absent. */
  function dpEsc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function deepPersonalize() {
    var svc = qs.get('services');
    if (svc) {
      var items = svc.split('|').map(function (s) { return s.trim(); }).filter(function (s) { return s; }).slice(0, 8);
      var grid = document.querySelector('#services .menu-grid, #menu .menu-grid, #rooms .menu-grid, #practice .menu-grid, #services .cards');
      if (grid && items.length) {
        var isCards = grid.classList.contains('cards');
        grid.innerHTML = items.map(function (name) {
          var n = dpEsc(name);
          if (isCards) {
            return '<div class="card"><div class="ico">&#10003;</div><h3>' + n + '</h3>' +
              '<p>Offered at ' + dpEsc(BIZ.name) + ' &mdash; chat below for details &amp; pricing.</p></div>';
          }
          return '<div class="menu-card"><div class="cat">Service</div><h3>' + n + '</h3>' +
            '<p>Offered at ' + dpEsc(BIZ.name) + ' &mdash; ask ' + dpEsc(BIZ.host) + ' below for details &amp; pricing.</p></div>';
        }).join('');
      }
    }
    var hrs = qs.get('hours');
    if (hrs) {
      var rows = hrs.split('|').map(function (s) { return s.trim(); }).filter(function (s) { return s; }).slice(0, 6);
      var table = document.querySelector('table.hours') || document.querySelector('#visit table');
      if (table && rows.length) {
        var chatCell = null;
        Array.prototype.forEach.call(table.rows, function (r) {
          if (/chat/i.test(r.textContent) && r.cells[1]) chatCell = r.cells[1].innerHTML;
        });
        var html = rows.map(function (r) {
          var i = r.indexOf(':');
          var day = (i > 0 ? r.slice(0, i) : r).trim();
          var time = (i > 0 ? r.slice(i + 1) : '').trim();
          return '<tr><td>' + dpEsc(day) + '</td><td>' + dpEsc(time) + '</td></tr>';
        }).join('');
        if (chatCell) html += '<tr><td>Chat with ' + dpEsc(BIZ.host) + '</td><td>' + chatCell + '</td></tr>';
        table.innerHTML = html;
      }
    }
  }


  /* ---------- dom ---------- */
  var panel, msgs, chipsBox, input, bubble, unread, closeBtn;
  var opened = false, autoOpened = false, greeted = false;

  /* conversation state */
  var S = {
    mode: 'idle',          // idle | booking | afterhours | review | quiz
    step: 0,
    booking: {},
    ah: {},
    quiz: {},
    lastTopic: null
  };

  function $(id) { return document.getElementById(id); }

  function delay(ms) {
    return new Promise(function (res) { setTimeout(res, FAST ? 0 : ms); });
  }

  function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  }

  /* ---------- rendering ---------- */
  function addUser(text) {
    var row = el('div', 'mrow user');
    row.appendChild(el('div', 'bubble', escapeHtml(text)));
    msgs.appendChild(row); scrollDown();
  }

  function addBot(html, opts) {
    var row = el('div', 'mrow bot');
    row.appendChild(el('div', 'mavatar', BIZ.host.charAt(0)));
    var b = el('div', 'bubble', html);
    row.appendChild(b);
    msgs.appendChild(row);
    if (opts && opts.notice) b.classList.add('notice');
    scrollDown();
    return b;
  }

  function addNotice(html) {
    var row = el('div', 'mrow bot');
    row.appendChild(el('div', 'notice', html));
    row.style.maxWidth = '100%';
    msgs.appendChild(row); scrollDown();
  }

  function addDashCard(rows) {
    var row = el('div', 'mrow bot');
    var card = el('div', 'dashcard');
    card.appendChild(el('div', 'dl-head', '&#128203; Saved to your dashboard'));
    rows.forEach(function (r) {
      card.appendChild(el('div', 'dl-row', '<span>' + r[0] + ':</span> <b>' + escapeHtml(r[1]) + '</b>'));
    });
    row.appendChild(card);
    row.style.maxWidth = '100%';
    msgs.appendChild(row); scrollDown();
  }

  function showTyping() {
    var row = el('div', 'mrow bot', '');
    row.id = 'maya-typing-row';
    row.appendChild(el('div', 'mavatar', BIZ.host.charAt(0)));
    var b = el('div', 'bubble typing', '<i></i><i></i><i></i>');
    row.appendChild(b);
    msgs.appendChild(row); scrollDown();
  }
  function hideTyping() {
    var t = $('maya-typing-row');
    if (t) t.remove();
  }

  function setChips(list) {
    chipsBox.innerHTML = '';
    (list || []).forEach(function (c) {
      var btn = el('button', 'chip', c.label);
      btn.type = 'button';
      btn.addEventListener('click', function () { userSays(c.value || c.label, c.silent); });
      chipsBox.appendChild(btn);
    });
    scrollDown();
  }

  function showStars() {
    chipsBox.innerHTML = '';
    var wrap = el('div', 'stars-row');
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var s = el('button', 'star-btn', '&#11088;');
        s.type = 'button';
        s.setAttribute('aria-label', n + ' star' + (n > 1 ? 's' : ''));
        s.addEventListener('click', function () { pickStars(n); });
        wrap.appendChild(s);
      })(i);
    }
    chipsBox.appendChild(wrap);
    scrollDown();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- bot speech ---------- */
  function say(html, chips, opts) {
    showTyping();
    var wait = Math.min(700 + html.length * 6, 1900);
    return delay(wait).then(function () {
      hideTyping();
      addBot(html);
      setChips(chips);
    });
  }

  function sayMany(items) {
    // items: [{html, chips, notice}]
    var p = Promise.resolve();
    items.forEach(function (it) {
      p = p.then(function () {
        showTyping();
        var wait = Math.min(600 + (it.html || '').length * 5, 1700);
        return delay(wait).then(function () {
          hideTyping();
          if (it.dash) { addDashCard(it.dash); }
          else if (it.notice) { addNotice(it.html); }
          else { addBot(it.html); }
          setChips(it.chips);
        });
      });
    });
    return p;
  }

  /* ---------- helpers ---------- */
  function makeRef() {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var r = '';
    for (var i = 0; i < 5; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return BIZ.refPrefix + '-' + r;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* tap-to-call link for chat flows — href bound to ?phone= (digits-only, XSS-safe),
     display text escaped like everything else. */
  function callLinkHtml() {
    var href = 'tel:' + String(BIZ.phone).replace(/[^+\d]/g, '');
    return '<a class="call-link" href="' + escapeHtml(href) + '">&#128222; Call ' + escapeHtml(BIZ.phone) + '</a>';
  }

  /* word-start keyword match: "parking" must not trigger the "king" room
     keyword, "located" must not trigger the "cat" amenities keyword.
     Prefix keywords like 'reserv'/'schedul'/'availab' still match
     'reservation'/'schedule'/'availability'; phrases keep substring match. */
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function has(t) {
    var words = Array.prototype.slice.call(arguments, 1);
    return words.some(function (w) {
      return new RegExp('(^|[^a-z])' + escRe(w)).test(t);
    });
  }

  /* Simulated owner dashboard: leads persist in the browser (localStorage).
     A real client build syncs these to the hotel's CRM / booking system. */
  var LEAD_KEY = 'nmc_hotel_leads';
  var leads = [];
  try { leads = JSON.parse(localStorage.getItem(LEAD_KEY) || '[]'); } catch (e) { leads = []; }
  function saveLead(l) {
    l.at = new Date().toISOString(); l.biz = BIZ.name;
    leads.push(l);
    try { localStorage.setItem(LEAD_KEY, JSON.stringify(leads)); } catch (e) {}
    renderInbox(); /* keep the prospect-visible inbox panel live */
  }

  /* ---------- captured-leads inbox preview (prospect-visible panel) ----------
     The after-hours card promises "Saved to your dashboard" — this panel makes
     that claim visible on the page. Reads localStorage only, everything escaped. */
  var inboxEls = null;
  function inboxDom() {
    if (!inboxEls) {
      var panel = document.getElementById('inbox-panel');
      var list = document.getElementById('inbox-list');
      var toggle = document.getElementById('inbox-toggle');
      var count = document.getElementById('inbox-count');
      if (!panel || !list || !toggle) return null;
      inboxEls = { panel: panel, list: list, toggle: toggle, count: count };
    }
    return inboxEls;
  }
  function fmtLeadTime(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso || '';
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) { return iso || ''; }
  }
  function renderInbox() {
    var dom = inboxDom();
    if (!dom) return;
    if (dom.count) dom.count.textContent = String(leads.length);
    if (!leads.length) {
      dom.list.innerHTML = '<div class="inbox-empty"><b>No leads yet.</b><br>' +
        'Try the &#127769; 11:42 PM after-hours flow in the chat &mdash; the captured lead will appear right here.</div>';
      return;
    }
    dom.list.innerHTML = leads.slice().reverse().map(function (l) {
      var when = l.at
        ? '<time datetime="' + escapeHtml(l.at) + '">' + escapeHtml(fmtLeadTime(l.at)) + '</time>'
        : '&mdash;';
      var detail = (l.details && l.details !== '—' && l.details !== '-')
        ? '<div class="lead-detail">&ldquo;' + escapeHtml(l.details) + '&rdquo;</div>'
        : '';
      return '<div class="lead-row">' +
        '<span class="lead-name">' + escapeHtml(l.name || '—') + '</span>' +
        '<span class="lead-tag">' + escapeHtml(l.topic || 'Lead') + '</span>' +
        '<span class="lead-phone">' + escapeHtml(l.phone || '—') + '</span>' +
        '<span class="lead-src">' + escapeHtml(l.source || '') + '</span>' +
        '<div class="lead-when">Captured ' + when + '</div>' +
        detail +
        '</div>';
    }).join('');
  }

  /* ---------- intent answers ---------- */
  function roomsHtml() {
    return 'Here\'s what we have &mdash; no resort fees, ever: &#127976;<br><br>' +
      '<b>Rooms:</b><br>&middot; Standard Queen &mdash; from <b>$119</b>/night<br>' +
      '&middot; <b>Deluxe King</b> &mdash; from <b>$149</b>/night (our most-loved)<br>' +
      '&middot; Patio Room (pet-friendly) &mdash; from <b>$159</b>/night<br>' +
      '&middot; Courtyard Loft &mdash; from <b>$179</b>/night<br>' +
      '&middot; Family Suite &mdash; from <b>$219</b>/night<br>' +
      '&middot; <b>Riverwalk Suite</b> &mdash; from <b>$289</b>/night<br><br>' +
      'Every room includes free Wi-Fi, smart TV, rain shower, and coffee. Which one catches your eye?';
  }

  function amenitiesHtml() {
    return 'Plenty to enjoy here: &#127774;<br><br>' +
      '&middot; <b>Rooftop pool</b> (open till 10 PM)<br>' +
      '&middot; Fitness center, open 24/7<br>' +
      '&middot; <b>Hot breakfast included</b> &mdash; 6:30 to 10 AM<br>' +
      '&middot; <b>Free parking</b> on site<br>' +
      '&middot; <b>Pet-friendly</b> rooms (Patio Rooms)<br>' +
      '&middot; Front desk 7 AM &ndash; 10 PM, and I\'m here 24/7<br><br>' +
      'Want me to check tonight\'s availability?';
  }

  function policiesHtml() {
    return 'The fine print &mdash; without the fine print: &#128220;<br><br>' +
      '<b>Check-in:</b> 3 PM &middot; <b>Check-out:</b> 11 AM<br>' +
      '<b>Cancellation:</b> free until 24 hours before arrival<br>' +
      '<b>Pets:</b> welcome in Patio Rooms ($35/night pet fee)<br>' +
      '<b>Parking:</b> free &middot; <b>Wi-Fi:</b> free &middot; <b>Resort fees:</b> none, ever.<br><br>' +
      'Ready to lock in your dates?';
  }

  function defaultChips() {
    return [
      { label: '&#127976; Rooms & rates' },
      { label: '&#128197; Book a room' },
      { label: '&#127769; After-hours demo' },
      { label: '&#11088; Rate your stay' },
      { label: '&#129512; 60-sec room match quiz', value: 'quiz' }
    ];
  }

  function greet() {
    greeted = true;
    return say(
      'Welcome to <b>' + escapeHtml(BIZ.name) + '</b>! I\'m <b>' + escapeHtml(BIZ.host) + '</b>, your concierge. &#127976;<br><br>' +
      'Ask me about <b>rooms</b>, <b>rates</b>, <b>amenities</b> or <b>policies</b> &mdash; or I can <b>book your room</b> right now. How can I help?',
      defaultChips()
    );
  }

  /* ---------- flows ---------- */
  var ROOMS = ['Standard Queen', 'Deluxe King', 'Riverwalk Suite', 'Family Suite', 'Patio Room', 'Courtyard Loft'];

  function startBooking() {
    S.mode = 'booking'; S.step = 0; S.booking = {};
    return say('Wonderful &mdash; let\'s find your room. <b>Which room type</b> would you like?',
      ROOMS.map(function (r) { return { label: r }; }));
  }

  function bookingStep(text) {
    var t = text.toLowerCase().trim();
    if (S.step === 0) {
      var room = 'Deluxe King';
      for (var i = 0; i < ROOMS.length; i++) {
        if (t.indexOf(ROOMS[i].toLowerCase().split(' ')[0]) !== -1 || t.indexOf(ROOMS[i].toLowerCase()) !== -1) { room = ROOMS[i]; break; }
      }
      S.booking.room = room; S.step = 1;
      return say('<b>' + escapeHtml(room) + '</b> &mdash; excellent choice. <b>What name</b> should I hold it under?');
    }
    if (S.step === 1) {
      var name = text.trim();
      if (name.length < 2 || name.length > 40) {
        return say('And the <b>name</b> for the reservation?');
      }
      S.booking.name = name; S.step = 2;
      return say('Thanks, ' + escapeHtml(cap(name.split(' ')[0])) +
        '! Want a <b>text reminder</b> before check-in? Drop your number &mdash; or skip it.',
        [{ label: 'Skip', value: 'skip' }]);
    }
    if (S.step === 2) {
      var digits = t.replace(/\D/g, '');
      if (t !== 'skip' && digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(or tap Skip)</i>',
          [{ label: 'Skip', value: 'skip' }]);
      }
      if (t !== 'skip') S.booking.phone = text.trim();
      S.step = 3;
      return say('<b>When are you checking in?</b>',
        [{ label: 'Tonight' }, { label: 'Tomorrow' }, { label: 'This Friday' }, { label: 'Next Saturday' }]);
    }
    if (S.step === 3) {
      var day = 'Tomorrow';
      var dm = t.match(/tonight|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday/);
      if (dm) day = cap(dm[0]);
      S.booking.day = day; S.step = 4;
      return say('<b>' + escapeHtml(day) + '</b> &mdash; noted. And <b>how many nights?</b>',
        [{ label: '1 night' }, { label: '2 nights' }, { label: '3 nights' }, { label: '5 nights' }]);
    }
    if (S.step === 4) {
      var nm = t.match(/\d+/);
      if (!nm) {
        return say('How many <b>nights</b> will you be staying? <i>(e.g. 2 nights)</i>',
          [{ label: '1 night' }, { label: '2 nights' }, { label: '3 nights' }]);
      }
      var nights = nm[0];
      var ref = makeRef();
      S.booking.ref = ref;
      var line = '<b>&#9989; You\'re booked!</b><br><br><b>' + escapeHtml(S.booking.room) + '</b> &middot; ' +
        escapeHtml(S.booking.day) + ' &middot; <b>' + escapeHtml(nights) + ' night' + (nights === '1' ? '' : 's') + '</b><br>Guest: <b>' + escapeHtml(S.booking.name) + '</b><br>' +
        'Reservation: <span class="ref">' + ref + '</span><br><br>';
      if (S.booking.phone) line += 'We\'ll text your reminder. ';
      line += 'Check-in is at 3 PM &mdash; we\'ll have everything ready. Anything else I can help with?<br><br>Prefer to talk it through? ' + callLinkHtml();
      S.mode = 'idle'; S.step = 0;
      return say(line, [{ label: '&#127976; Rooms & rates' }, { label: '&#128220; Policies' }]);
    }
  }

  function startAfterHours() {
    S.mode = 'afterhours'; S.step = 0; S.ah = {};
    return sayMany([
      {
        notice: true,
        html: '&#127769; <b>It\'s 11:42 PM</b> &mdash; we\'re closed right now, but I\'m ' + escapeHtml(BIZ.host) +
          ', ' + escapeHtml(BIZ.name) + '\'s concierge, and I\'m still here. <b>No traveler waits till morning.</b>'
      },
      { html: 'Looking for a room tonight? Leave your <b>name</b> and I\'ll make sure the morning team follows up first thing &mdash; late arrivals always get priority.' }
    ]);
  }

  function afterHoursStep(text) {
    var t = text.trim();
    if (S.step === 0) {
      if (t.length < 2 || t.length > 40 || /\d/.test(t)) {
        return say('What <b>name</b> should I save this under?');
      }
      S.ah.name = t; S.step = 1;
      return say('Thanks, ' + escapeHtml(cap(t.split(' ')[0])) + '! And the best <b>number</b> for the morning team to reach you?');
    }
    if (S.step === 1) {
      var digits = t.replace(/\D/g, '');
      if (digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(digits only is fine)</i>');
      }
      S.ah.phone = t; S.step = 2;
      return say('Got it. Briefly &mdash; <b>what do you need?</b> <i>(e.g. "room tonight", "late check-in")</i>',
        [{ label: 'Room tonight', value: 'Room tonight' }, { label: 'Late check-in', value: 'Late check-in' }, { label: 'Skip', value: 'skip' }]);
    }
    if (S.step === 2) {
      S.ah.need = (t === 'skip') ? 'General inquiry' : t;
      /* persist the captured lead — the "Saved to your dashboard" card is real */
      saveLead({ name: S.ah.name, phone: S.ah.phone, need: S.ah.need, captured: '11:42 PM (after hours)', topic: 'After-hours lead', details: S.ah.need, source: 'after-hours 11:42 PM' });
      S.mode = 'idle'; S.step = 0;
      return sayMany([
        { html: '<b>&#9989; Saved!</b> The morning team will reach out <b>first thing</b> &mdash; late-night inquiries get first pick of available rooms. No need to refresh booking sites till dawn wondering if anyone saw your message.' },
        {
          dash: [
            ['New lead', S.ah.name],
            ['Phone', S.ah.phone],
            ['Need', S.ah.need],
            ['Captured', '11:42 PM (after hours)']
          ]
        },
        {
          html: 'That\'s the whole point &mdash; <b>every midnight booking inquiry becomes a morning reservation</b>, not a guest lost to the hotel down the street. Anything else tonight?',
          chips: defaultChips()
        }
      ]);
    }
  }

  function startReview() {
    S.mode = 'review'; S.step = 0;
    return say('We\'d love to hear it &mdash; <b>how was your stay?</b> Tap the stars:').then(function () {
      showStars();
    });
  }

  function pickStars(n) {
    chipsBox.innerHTML = '';
    addUser('\u2B50'.repeat(n));
    if (n === 5) {
      S.mode = 'idle';
      say('That made our whole team smile! &#128525;<br><br>Would you <b>share that on Google</b>? It genuinely keeps a local hotel like ours thriving.',
        [{ label: 'Not now', value: 'not now' }]).then(function () {
          var row = document.querySelector('#maya-msgs .mrow.bot:last-child .bubble');
          if (row) {
            var a = document.createElement('a');
            a.className = 'gbtn'; a.href = 'https://www.google.com/maps'; a.target = '_blank'; a.rel = 'noopener';
            a.textContent = '\u2B50 Leave a Google review';
            row.appendChild(document.createElement('br'));
            row.appendChild(a); scrollDown();
          }
        });
    } else {
      S.mode = 'review'; S.step = 1;
      say('Thank you for being honest &mdash; that\'s how we get better. <b>What could we do better</b> next time?');
    }
  }

  function reviewStep(text) {
    S.mode = 'idle'; S.step = 0;
    /* 1-4 star feedback is private — persisted as a lead, like the salon/dental/med-spa standard */
    saveLead({ name: '(review feedback)', phone: '\u2014', topic: 'Private feedback', details: text.trim(), source: 'review routing' });
    return say('<b>Noted &mdash; truly.</b> Our general manager will personally follow up on this.<br><br>' +
      'We\'d love a second chance to earn those last stars. Can I book you a room for your next visit?',
      [{ label: '&#128197; Book a room' }, { label: 'No thanks', value: 'no thanks' }]);
  }

  /* ---------- 60-second room match quiz (lead-capture pilot, fleet pattern 2026-10-20) ----------
     HONESTY (hard rule): Maren NEVER invents room numbers, availability, or nightly rates —
     the quiz promises a handpicked room shortlist + best-rate quote, never a fabricated room. */
  var QUIZ_OCCASIONS = ['Business trip', 'Family getaway', 'Romantic escape', 'Event / wedding'];
  var QUIZ_ROOMS = ['Standard', 'Deluxe king', 'Family suite', 'Top-floor suite'];

  function canonChoice(t, options) {
    var tl = t.toLowerCase();
    for (var i = 0; i < options.length; i++) {
      if (tl === options[i].toLowerCase()) return options[i];
    }
    return t.trim().slice(0, 60); /* free text accepted, length-capped */
  }

  function startQuiz() {
    S.mode = 'quiz'; S.step = 0; S.quiz = {};
    return say('<b>&#129512; The 60-second room match quiz!</b><br><br>' +
      'Tell me how you travel and I&rsquo;ll build your <b>room profile</b> &mdash; then Maren will handpick rooms that fit plus a best-rate quote, sent straight to your phone. No spam, no guesswork.<br><br>' +
      '<b>First: what brings you to ' + escapeHtml(BIZ.name) + '?</b>',
      QUIZ_OCCASIONS.map(function (o) { return { label: o }; }));
  }

  function quizStep(text) {
    var t = text.trim();
    if (S.step === 0) {
      S.quiz.occasion = canonChoice(t, QUIZ_OCCASIONS); S.step = 1;
      return say('Got it &mdash; <b>' + escapeHtml(S.quiz.occasion) + '</b>. &#129512;<br><br><b>When are you thinking of visiting?</b> <i>(e.g. Dec 12&ndash;15)</i>');
    }
    if (S.step === 1) {
      S.quiz.dates = canonChoice(t, []); S.step = 2;
      return say('<b>' + escapeHtml(S.quiz.dates) + '</b> &mdash; noted. &#129512;<br><br><b>Which room style sounds like you?</b>',
        QUIZ_ROOMS.map(function (r) { return { label: r }; }));
    }
    if (S.step === 2) {
      S.quiz.style = canonChoice(t, QUIZ_ROOMS); S.step = 3;
      return say('Love it &mdash; <b>' + escapeHtml(S.quiz.style) + '</b> it is. &#129512;<br><br><b>What&rsquo;s your name</b> for the room profile?');
    }
    if (S.step === 3) {
      if (t.length < 2 || t.length > 40) {
        return say('And your <b>name</b> for the room profile?');
      }
      S.quiz.name = t; S.step = 4;
      return say('Thanks, ' + escapeHtml(cap(t.split(' ')[0])) + '! And the best <b>number</b> to send your handpicked rooms to?');
    }
    if (S.step === 4) {
      var digits = t.replace(/\D/g, '');
      if (digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(digits only is fine)</i>');
      }
      S.quiz.phone = t; S.step = 5;
      return finishQuiz();
    }
  }

  function finishQuiz() {
    var q = S.quiz;
    saveLead({
      name: q.name,
      phone: q.phone,
      topic: 'Room-match quiz — qualified lead',
      details: 'Occasion ' + q.occasion + ' · Dates ' + q.dates + ' · Room style ' + q.style,
      source: 'room quiz'
    });
    S.mode = 'idle'; S.step = 0; S.quiz = {};
    return sayMany([
      { html: '<b>&#9989; Quiz complete!</b> &#129512;<br><br>Here&rsquo;s your room profile:' },
      {
        dash: [
          ['Occasion', q.occasion],
          ['Dates', q.dates],
          ['Room style', q.style]
        ]
      },
      {
        html: '<b>Maren</b> will handpick rooms that fit + a best-rate quote &mdash; straight to your phone. ' +
          'That&rsquo;s the whole point &mdash; <b>every late-night inquiry becomes a booked stay</b>, not a guest lost to the hotel down the street. Anything else I can help with?',
        chips: defaultChips()
      }
    ]);
  }

  /* ---------- main router ---------- */
  function route(text) {
    var t = text.toLowerCase().trim();

    if (S.mode === 'booking') return bookingStep(text);
    if (S.mode === 'afterhours') return afterHoursStep(text);
    if (S.mode === 'quiz') return quizStep(text);
    if (S.mode === 'review' && S.step === 1) return reviewStep(text);

    if (has(t, 'book', 'reserv', 'schedul', 'room for', 'availab', 'stay tonight')) return startBooking();
    if (has(t, 'after hour', 'after-hour', 'closed', 'late night', 'midnight', '11:42')) return startAfterHours();
    if (has(t, 'review', 'rate', 'stars', 'feedback')) return startReview();
    /* 60-sec room match quiz: word-start keywords only ("room for tonight" still hits booking above) */
    if (has(t, 'quiz', 'room match', 'match me', 'find my room', 'match quiz')) return startQuiz();
    if (has(t, 'where', 'address', 'location', 'direction', 'find you', 'river walk', 'riverwalk')) {
      return say('Find us at <b>' + escapeHtml(BIZ.address) + '</b> &mdash; right in the heart of ' + escapeHtml(BIZ.city) + ', with free parking right outside. &#128205;<br><br>' + callLinkHtml() + ' &mdash; we&rsquo;re happy to help anytime.',
        [{ label: '&#128197; Book a room' }]);
    }
    if (has(t, 'room', 'rate', 'price', 'cost', 'how much', 'suite', 'king', 'queen', 'deluxe', 'family suite', 'patio room', 'loft')) return say(roomsHtml(), [{ label: '&#128197; Book a room' }]);
    if (has(t, 'amenit', 'pool', 'gym', 'fitness', 'breakfast', 'parking', 'wifi', 'pet', 'dog', 'cat', 'swim')) return say(amenitiesHtml(), [{ label: '&#128197; Book a room' }]);
    if (has(t, 'check-in', 'check in', 'check-out', 'check out', 'checkout', 'checkin', 'cancel', 'refund', 'policy', 'policies', 'late check')) return say(policiesHtml(), [{ label: '&#128197; Book a room' }]);
    if (has(t, 'hour', 'open', 'close', 'when do you', 'front desk')) return say('Our front desk runs <b>7 AM to 10 PM</b> &mdash; and I\'m here <b>24/7</b> for bookings, questions, and late-night check-ins. &#127769;<br><br>Check-in is at 3 PM, check-out at 11 AM. Want me to book your room?', [{ label: '&#128197; Book a room' }]);
    if (has(t, 'human', 'person', 'real person', 'call you', 'phone number', 'speak to', 'manager')) return say('Of course &mdash; ' + callLinkHtml() + ' between 7 AM and 10 PM and a real human picks up. But honestly? I can handle <b>bookings, rates, and policies</b> right here, even at 2 AM. &#128521;', defaultChips());
    if (has(t, 'thank', 'thanks', 'thx', 'great', 'awesome', 'perfect')) return say('Anytime! That\'s what I\'m here for. &#127976;', defaultChips());
    if (has(t, 'bye', 'goodbye', 'see you', 'later')) { S.mode = 'idle'; return say('Safe travels &mdash; see you at ' + escapeHtml(BIZ.name) + '! &#127976;'); }
    if (/\b(hi+|hello|hey+|hola|yo)\b/.test(t) || has(t, 'good morning', 'good evening')) return say('Hey hey! &#128075; What can I do for you &mdash; <b>rooms</b>, <b>rates</b>, or shall I <b>book your stay</b>?', defaultChips());
    if (has(t, 'no thanks', 'not now', 'nope', "i'm good", 'im good')) { S.mode = 'idle'; return say('No worries at all! I\'m here whenever you need me. &#127976;', defaultChips()); }

    /* graceful fallback — never dead-ends */
    S.lastTopic = text;
    return say('Great question &mdash; let me have the team confirm that for you. &#128172;<br><br>Meanwhile, can I help with a <b>room booking</b>, our <b>rates</b>, or <b>amenities</b>?',
      [{ label: '&#128197; Book a room' }, { label: '&#127976; Rooms & rates' }, { label: '&#128220; Policies' }]);
  }

  function userSays(text, silent) {
    if (!text || !text.trim()) return Promise.resolve();
    text = text.trim();
    setChips([]);
    if (!silent) addUser(text);
    return route(text);
  }

  /* ---------- open / close ---------- */
  function openPanel(silent) {
    opened = true;
    panel.classList.add('open');
    bubble.classList.add('hidden');
    unread.classList.add('hidden');
    if (!greeted && !silent) greet();
  }
  function closePanel() {
    opened = false;
    panel.classList.remove('open');
    bubble.classList.remove('hidden');
  }

  function init() {
    panel = $('maya-panel'); msgs = $('maya-msgs'); chipsBox = $('maya-chips');
    input = $('maya-input'); bubble = $('maya-bubble'); unread = $('maya-unread'); closeBtn = $('maya-close');
    personalize();
    deepPersonalize();

    /* bubble click greets normally; hero CTA passes silent=true to skip straight to booking */
    bubble.addEventListener('click', function () { openPanel(); });
    closeBtn.addEventListener('click', closePanel);
    $('maya-send').addEventListener('click', function () { userSays(input.value); input.value = ''; input.focus(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { userSays(input.value); input.value = ''; }
    });

    /* hero CTA opens widget straight into booking */
    document.querySelectorAll('[data-action="book"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openPanel(true); /* silent: goes straight to booking, no greeting */
        setTimeout(function () { if (S.mode === 'idle') startBooking(); }, FAST ? 50 : 600);
      });
    });

    /* captured-leads inbox toggle (prospect-visible "Saved to your dashboard") */
    var idom = inboxDom();
    if (idom) {
      renderInbox();
      idom.toggle.addEventListener('click', function () {
        var isHidden = idom.panel.hasAttribute('hidden');
        if (isHidden) { idom.panel.removeAttribute('hidden'); renderInbox(); }
        else { idom.panel.setAttribute('hidden', ''); }
        idom.toggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      });
    }

    /* proactive nudge — once, ~8s in */
    setTimeout(function () {
      if (!opened && !autoOpened) {
        autoOpened = true;
        unread.classList.remove('hidden');
        bubble.classList.add('hidden');
        panel.classList.add('open');
        opened = true;
        if (!greeted) greet();
      }
    }, FAST ? 600 : 8000);

    /* test hooks */
    window.__maya = {
      BIZ: BIZ, S: S,
      send: function (t) { openPanel(); return userSays(t); },
      open: openPanel, close: closePanel,
      pickStars: pickStars,
      saveLead: saveLead,
      renderInbox: renderInbox,
      getLeads: function () { return leads; },
      clearLeads: function () { leads = []; try { localStorage.removeItem(LEAD_KEY); } catch (e) {} renderInbox(); }
    };
    window.__getLeads = function () { return leads; };
    window.__clearLeads = function () { leads = []; try { localStorage.removeItem(LEAD_KEY); } catch (e) {} renderInbox(); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
