/**
 * The starting world for the demo sandbox: five notes, eight todos, six
 * habits with ten weeks of logs, six calendar events and six clipboard
 * entries — one person's Thursday morning before a trip to Lisbon.
 *
 * Content is lifted from website/capture/seed.mjs so the demo, the
 * marketing screenshots and the app tell one story. Pure data: no DOM, no
 * storage, no network. See demo-logic.js for the arithmetic this is read
 * through.
 */
import { dayStr, dueOn } from './demo-logic.js'

const DAY = 86400000
const HOUR = 3600000
const MIN = 60000

/** Local time on `dayStr(now, offset)`, built via `new Date(y, m, d, h, min)`. */
function atLocal(now, offset, h, min = 0) {
  const [y, m, d] = dayStr(now, offset).split('-').map(Number)
  return new Date(y, m - 1, d, h, min).getTime()
}

export function buildSeed(now = Date.now()) {
  // Reset every call, not at module scope: buildSeed(now) has to return an
  // identical world each time it runs with the same `now`, and that only
  // holds if the LCG starts from the same state on every call rather than
  // drifting across them.
  let rndState = 0x9e3779b9
  const rnd = () => ((rndState = (rndState * 1664525 + 1013904223) >>> 0) / 4294967296)

  // ── Notes ── two lifted from the marketing capture, three more in the
  // same world: a flat inspection, a friend's birthday, settling into a new
  // place. `Weekend in Lisbon` is what the tab opens to, so it carries the
  // richest body — a heading per day and a mix of plain lines and open todos.
  const notes = [
    {
      id: 'note-1', icon: '✈️', title: 'Weekend in Lisbon', updated_at: now - HOUR,
      blocks: [
        { type: 'h1', text: 'Weekend in Lisbon' },
        // The one seeded block that carries markup, and the reason the block
        // shape has an `html` field at all. website/images/note.webp shows
        // this sentence with the tram-ticket clause bold, so the demo has to
        // as well — the first thing a visitor sees should not be flatter than
        // the screenshot on the marketing page above it.
        //
        // `text` is the same words with no markup, and the two have to stay
        // that way: `text` is what the word count and any snippet read, and a
        // `text` with angle brackets in it would put tag source into both.
        // demo.test.mjs asserts the pair. `html` is re-sanitised on its way
        // into the page by inlineFragment(), so the allowlist holds here
        // exactly as it does for a paste.
        { type: 'p',
          text: 'Three days, no rush. Book the tram tickets before Friday — they sell out.',
          html: 'Three days, no rush. <b>Book the tram tickets before Friday</b> — they sell out.' },
        { type: 'h2', text: 'Friday' },
        { type: 'li', text: 'Land at 14:35, drop bags at the hotel' },
        { type: 'li', text: 'Sunset at Miradouro da Senhora do Monte' },
        { type: 'li', text: 'Dinner in Alfama — the little place with the blue tiles' },
        { type: 'h2', text: 'Saturday' },
        { type: 'li', text: 'Tram 28 in the morning, before the queues' },
        { type: 'todo', text: 'Book the LX Factory market for lunch', done: false },
        { type: 'li', text: 'Belém — pastéis de nata at the original bakery' },
        { type: 'h2', text: 'Sunday' },
        { type: 'todo', text: 'Check out by 11', done: false },
        { type: 'todo', text: 'Leave for the airport by 12:30', done: false },
        { type: 'li', text: 'Flight home in the evening' },
      ],
    },
    {
      id: 'note-2', icon: '📚', title: 'Reading list', updated_at: now - 2 * DAY,
      blocks: [
        { type: 'h1', text: 'Reading list' },
        { type: 'p', text: 'Books to get through before the end of the year.' },
        { type: 'todo', text: 'Piranesi — Susanna Clarke', done: false },
        { type: 'todo', text: 'Klara and the Sun', done: true },
        { type: 'li', text: 'Ask Sarah for the sequel to the one she lent me' },
      ],
    },
    {
      id: 'note-3', icon: '🔧', title: 'Flat inspection — what to fix', updated_at: now - 5 * HOUR,
      blocks: [
        { type: 'h1', text: 'Flat inspection — what to fix' },
        { type: 'p', text: 'Landlord is coming Thursday. Walk the flat once before then.' },
        { type: 'todo', text: 'Tighten the loose kitchen tap', done: false },
        { type: 'todo', text: 'Patch the scuff by the front door', done: false },
        { type: 'li', text: 'Bathroom fan is louder than it used to be — mention it' },
        { type: 'li', text: 'Ask about the leak under the sink from last month' },
      ],
    },
    {
      id: 'note-4', icon: '🎁', title: "Sarah's birthday", updated_at: now - 26 * HOUR,
      blocks: [
        { type: 'h1', text: "Sarah's birthday" },
        { type: 'p', text: "She's turning 30 — worth doing properly." },
        { type: 'li', text: 'Dinner Saturday, the Italian place she likes' },
        { type: 'todo', text: 'Order the cake by Wednesday', done: false },
        { type: 'todo', text: 'Find her card from the drawer', done: true },
        { type: 'li', text: 'Ask what she actually wants — no more candles' },
      ],
    },
    {
      id: 'note-5', icon: '🏠', title: 'Things to do in the new place', updated_at: now - 6 * DAY,
      blocks: [
        { type: 'h1', text: 'Things to do in the new place' },
        { type: 'p', text: 'Slowly making it feel like home.' },
        { type: 'li', text: 'Hang the mirror in the hallway' },
        { type: 'li', text: 'Find a rug for the living room' },
        { type: 'todo', text: 'Get a spare key cut', done: false },
        { type: 'todo', text: 'Fix the sticky bedroom window', done: true },
      ],
    },
  ]

  // ── Todos ── one per shelf, two due today, two already ticked.
  const todos = [
    { text: 'Reply to the landlord', offset: -2, done: false },
    { text: 'Finish the Lisbon itinerary', offset: 0, done: false },
    { text: 'Pick up the dry cleaning', offset: 0, done: false },
    { text: 'Take the car in for its service', offset: 1, done: false },
    { text: 'Renew the gym membership', offset: 5, done: false },
    { text: 'Send Sarah the birthday invite', offset: null, done: false },
    { text: 'Water the plants', offset: 0, done: true },
    { text: 'Pay the electricity bill', offset: -1, done: true },
  ].map((t, i) => ({
    id: `todo-${i}`, text: t.text, done: t.done,
    due: t.offset === null ? null : dayStr(now, t.offset),
  }))

  // ── Habits ──
  //
  // How far back the record runs. Declared here rather than beside the
  // generator below because `created` reads it too, and a `const` read before
  // its declaration is a TDZ throw rather than an `undefined`.
  const WEEKS_BACK = 10
  const DAYS_BACK = WEEKS_BACK * 7

  // `cadence` is the shape the app stores (desktop/src/lib/types.ts) and the
  // values are the capture seed's, habit for habit (website/capture/seed.mjs:176).
  // It is what the row's chip reads, and there is one of each kind on purpose:
  // a page of six `Daily` chips would show a third of the feature. It was left
  // out of the first cut of this file as "not needed yet", which was wrong —
  // website/images/habits.webp draws a chip on every row.
  const HABITS = [
    { name: 'Morning walk', icon: '🚶', color: '#22c55e', since: 80, keep: 0.9, off: null, forceStreak: 11,
      cadence: { type: 'daily' } },
    { name: 'Gym', icon: '🏋️', color: '#f97316', since: 80, keep: 0.85, off: [15, 21], forceStreak: 0,
      cadence: { type: 'weekly', days: [1, 3, 5] } },
    { name: 'Stretch', icon: '🧘', color: '#14b8a6', since: 80, keep: 0.78, off: [12, 18], forceStreak: 0,
      cadence: { type: 'weekly', days: [1, 2, 3, 4, 5] } },
    { name: 'Drink water', icon: '💧', color: '#0ea5e9', since: 80, keep: 0.72, off: null, forceStreak: 0,
      cadence: { type: 'times_per_week', target: 5 } },
    { name: 'Read 20 pages', icon: '📖', color: '#8b5cf6', since: 80, keep: 0.5, off: [41, 52], forceStreak: 0,
      cadence: { type: 'daily' } },
    { name: 'Guitar practice', icon: '🎸', color: '#e11d48', since: 17, keep: 0.8, off: null, forceStreak: 0,
      cadence: { type: 'times_per_week', target: 3 } },
  ]
  // `since` is how long ago the habit was made, and `created` is that as a day.
  // The grid draws nothing at all before it — which is what makes Guitar
  // practice read as a new habit rather than as one with two blank weeks of
  // failure behind it (seed.mjs:167), and it is also what stops a habit made by
  // the page's own "New habit" button from opening with three weeks of misses
  // behind something a minute old. It bounds `streak` too: days a habit could
  // not have been done on are not days it missed.
  //
  // Five of the six are older than this file's ten-week horizon, so for them the
  // start is the horizon; only Guitar's seventeen days is shorter than it.
  const startBack = (h) => Math.min(h.since, DAYS_BACK) - 1
  const habits = HABITS.map((h, i) => ({
    id: `habit-${i}`, name: h.name, icon: h.icon, color: h.color, cadence: h.cadence,
    created: dayStr(now, -startBack(h)),
  }))

  // Ten weeks back, generated with the seeded LCG from the marketing capture
  // seed so the scatter is identical every run (website/capture/seed.mjs:207).
  //
  // A grid filled every day reads as fake, and one that thins out entirely
  // reads as abandoned (seed.mjs:144) — so each habit gets a `keep`
  // probability rather than a fixed pattern, and two carry a week-long `off`
  // gap so the holes read as a real interruption rather than noise.
  //
  // Both `off` windows have to land inside the *four weeks the Habits page
  // draws*, which is the only part of this record anything in the demo ever
  // shows. Gym's was 26–33 days back, lifted from a capture seed whose expanded
  // heat map shows twelve weeks: at 0.85 with its holiday just off the left
  // edge, the visible row came out 26 squares of 28 — a solid block, which is
  // the one thing this generator exists to avoid. The window is never shorter
  // than 22 days (a Monday: three whole weeks plus today), so an `off` inside
  // 0–21 is visible whichever weekday the page is opened on.
  //
  // `forceStreak` skips the roll for the most recent N days and marks them
  // done unconditionally, counting back from today as a plain integer offset
  // — never from a week boundary or a "yesterday" cutoff. That is what keeps
  // the streak length fixed at 11 no matter which weekday the page happens
  // to load on: a generator that instead forced "the rest of this calendar
  // week" would hand Morning walk a streak of 1 on a Monday and 7 on a
  // Sunday, passing the "on a streak" assertion on some days and failing it
  // on others.
  //
  // A quota habit — `times_per_week` — is the one kind the roll cannot be left
  // alone with, because its chip is a live count of the week in progress and
  // the dice will happily write "6/3 this week". Two rules, both lifted from
  // the capture seed (seed.mjs:210-235):
  //
  //   · no week is ever filled past its target, so the chip's numerator can
  //     never overtake its denominator on first paint;
  //   · the week in progress is written out by hand instead of rolled for —
  //     today is left open (there has to be something for the tick to do) and
  //     the days immediately before it are marked done, one short of the
  //     target. That is what makes the row read "4/5 this week": a quota being
  //     worked on, rather than one already spent or one at zero.
  //
  // Weeks are Monday-start here, where the capture seed's are Sunday-start,
  // because the chip sits beside `habitMatrix`'s squares and those are
  // Monday-start. A chip that counted a different seven days from the row of
  // cells under the reader's eye is worse than either convention.
  const mondayOffset = (ts) => {
    const d = new Date(ts)
    d.setHours(12, 0, 0, 0)
    return (d.getDay() + 6) % 7 // 0 on a Monday, 6 on a Sunday
  }
  const elapsed = mondayOffset(now)

  const habitLogs = []
  HABITS.forEach((h, i) => {
    const habitId = `habit-${i}`
    const target = h.cadence.type === 'times_per_week' ? h.cadence.target : 0
    let thisWeek = 0
    for (let back = startBack(h); back >= 0; back--) {
      const day = dayStr(now, -back)
      // `back` counts down, so this is the Monday that opens each week.
      if (((elapsed - back) % 7 + 7) % 7 === 0) thisWeek = 0
      if (h.off && back >= h.off[0] && back <= h.off[1]) continue
      // Nothing was ever asked of a day the cadence does not name, so nothing is
      // recorded on one — seed.mjs:240, and the reason the app's grid has the
      // texture it has. Without this line a Mon/Wed/Fri habit came out ticked on
      // twenty-six days out of twenty-eight, which is a daily habit wearing a
      // weekly chip, and `streak` (which now walks due days) had nothing to walk.
      if (!dueOn(h, day)) continue
      if (target && back <= elapsed) {
        // The week in progress, written rather than rolled.
        if (back === 0 || back > target - 1) continue
      } else if (target && thisWeek >= target) {
        continue // the quota for that week is already spent
      } else {
        const forced = back < h.forceStreak
        if (!forced && rnd() >= h.keep) continue
      }
      habitLogs.push({ habit_id: habitId, day })
      thisWeek++
    }
  })

  // ── Events ── local times, built via `new Date(y, m, d, h, min)`.
  const events = [
    { title: 'Standup', offset: 0, h: 9, m: 30, mins: 15 },
    { title: 'Dentist', offset: 0, h: 11, m: 0, mins: 60 },
    { title: 'Lunch with Sarah', offset: 0, h: 13, m: 0, mins: 60 },
    { title: 'Yoga class', offset: 1, h: 18, m: 30, mins: 60 },
    { title: 'Flight to Lisbon', offset: 2, h: 14, m: 35, mins: 190 },
    { title: 'Landlord — inspection', offset: 3, h: 10, m: 0, mins: 45 },
  ].map((e, i) => ({
    id: `event-${i}`, title: e.title, start_ts: atLocal(now, e.offset, e.h, e.m), mins: e.mins,
  }))

  // ── Clipboard ── one of each clipType branch. Each one ties back to a
  // note or a task — the flight number, Sarah, the guide link — which is
  // what makes the tab read as one person's morning rather than six samples.
  const clips = [
    { text: 'https://lisbon-guide.com/best-viewpoints', mins: 0 },
    { text: 'Wi-Fi password: sunflower-42', mins: 1 },
    { text: 'sarah.chen@example.com', mins: 2 },
    { text: 'Flight TP1234 · Sun 14:35 · Terminal 2', mins: 4 },
    { text: '#0E7CC4', mins: 5 },
    { text: '1Z999AA10123456784', mins: 7 },
  ].map((c, i) => ({ id: `clip-${i}`, text: c.text, created_at: now - c.mins * MIN }))

  return { notes, todos, habits, habitLogs, events, clips }
}
