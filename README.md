# "Never Miss a Customer" — Interactive Demo (HOTEL)

A fictional US boutique hotel website (**Willowmere Hotel — Boutique Stays & Riverwalk
Retreat, San Antonio TX**) with an embedded AI concierge (**Maren**) that demonstrates
Tameer Ali's **"Never Miss a Customer"** automation system to a hotel owner in
~60 seconds.

**100% static. No backend, no build step, zero external requests, zero tracking.**
Works from `file://` and any static host.

Part of the multi-niche demo factory (see `~/workspace/outreach/demo-links.md`) —
the **7th and final niche** (dental → med spa → salon → HVAC → legal → real estate → hotel).

## What it demonstrates (the 4 flows)

1. **Rooms / rates / policies Q&A** — ask about the Deluxe King (from $149/night),
   Riverwalk Suite (from $289), Family Suite (from $219), amenities (rooftop pool,
   gym, free hot breakfast, free parking, Wi-Fi, pet-friendly rooms), check-in
   (3 PM) / check-out (11 AM) times, and the free-until-24-hrs cancellation policy.
2. **Room booking** — room type → name → optional text reminder → check-in date →
   nights → confirmation card with booking reference (e.g. `WH-KT9X2`).
3. **After-hours lead capture** *(the money flow)* — tap "🌙 After-hours demo":
   a notice reads *"It's 11:42 PM — we're closed right now, but I'm Maren,
   Willowmere Hotel's concierge, and I'm still here."* A midnight
   room-tonight inquiry → name + phone + need → "Saved! The morning team will
   reach out first thing" → a mini **"Saved to your dashboard"** card appears.
   This is the moment that sells the system: *every midnight booking inquiry
   becomes a morning reservation, not a guest lost to the hotel down the street.*
4. **Review request** — tap "⭐ Rate your stay" → tap the stars:
   - **5 stars** → "Would you share that on Google?" + Google review button.
   - **1–4 stars** → "What could we do better?" → feedback captured →
     "Our general manager will personally follow up."

Plus: graceful fallbacks for off-script input (never dead-ends), quick-reply chips,
typing indicator with realistic delays, auto-open nudge after ~8s, and the site's
"Book a room" buttons jump straight into the booking flow.

Copy is in **buyer language** ("never miss a guest", "after-hours", "late arrivals
get priority") — never "AI chatbot" jargon. Widget header/footer carries a small
credit: *"Live demo by Tameer Ali · AI Automation"*.

## Fictional-business check

Name chosen: **Willowmere Hotel**, San Antonio, TX. Web-searched 2026-10-01:
no real US hotel uses this name — the only "Willowmere Hotel" found is a small
property in Port Sorell, **Australia**. ("Copper Canyon Lodge" was checked first
and rejected — a real B&B in Rapid City, SD plus lodges in Mexico use it.)

## Personalize per prospect

Append query params — the hotel name, tagline, city, address and phone swap
everywhere (page + widget + booking-reference prefix):

```
index.html?biz=Riverbend%20Suites&tagline=Boutique%20Stay%20%26%20Spa&city=Denver%2C%20CO&address=88%20Blake%20St%2C%20Denver%2C%20CO%2080202&phone=%28303%29%20555-0119
```

| Param     | Default                          |
|-----------|----------------------------------|
| `biz`     | Willowmere Hotel                 |
| `tagline` | Boutique Stays & Riverwalk Retreat |
| `city`    | San Antonio, TX                  |
| `address` | 718 E Commerce St, San Antonio, TX 78205 |
| `phone`   | (210) 555-0147                   |

`?fast=1` skips animation delays (used by the automated test harness).

**Outreach workflow:** for each hotel prospect, generate their link with
`?biz=<Their Hotel Name>` so the demo greets them as *their own* hotel.
The personalized demo is the outreach hook — audit opens, demo closes.

## Hosting options

- **Fastest (recommended):** Netlify Drop / Vercel / Cloudflare Pages / GitHub Pages —
  drag the `demo-hotel/` folder, get a public HTTPS link in ~1 minute.
- **Any static host** works — it's plain HTML/CSS/JS.
- **Local preview:** `python3 -m http.server` inside `demo-hotel/`, or just double-click
  `index.html` (works from `file://`).

Hosting is handled by the parent agent — this subagent builds and verifies only.

## Verification

End-to-end harness at `/tmp/verify/verify-hotel.js` (puppeteer-core + local Chromium):
walks all 4 flows, the 5-star and 3-star review branches, bad-phone rejection,
graceful fallback, `?biz=` personalization (incl. multi-word name with `&`),
hero-CTA booking jump, and a mobile viewport — and fails on **any** console/page error.

Last run: **39/39 checks passed, zero console errors** (2026-10-01).

## 2026-10-03 honesty + router upgrade (nightly-demo-build)
- Removed invented testimonials + fake "4.8 stars / 2,300+ Google reviews" claims →
  honest "How it works" block; hero badges now describe the demo; OG + Twitter Card tags added.
- Personalization leaks fixed: hero paragraph + widget location answer follow `?city=`.
- **Router bug fixed:** "where are you located" answered with the amenities block
  ("located" contains "cat"). Keywords now match at word starts only.
- After-hours leads now persist to localStorage (`nmc_hotel_leads`) — the
  "Saved to your dashboard" card is real.
- New harness: `~/workspace/outreach/demo-deploy-zips/hotel-verify-2026-10-03.js` —
  **59/59 checks passed** (2026-10-03), zero console errors, zero external requests.
- Deploy zip rebuilt: `~/workspace/outreach/demo-deploy-zips/hotel.zip` (14,759 B) —
  deploy PENDING behind the parked Netlify-session refresh (same block as dental/med-spa/salon).

## Files

- `index.html` — hotel site + widget markup
- `assets/style.css` — all styling (system fonts only, no external requests)
- `assets/widget.js` — Maren conversation engine (intents, booking/after-hours/review
  state machines, personalization, test hooks via `window.__maya`)

*Note: bookings, leads and reviews in this demo are simulated in the browser —
the footer says so. A real client build wires these to the hotel's actual
reservation/CRM/notification stack.*
