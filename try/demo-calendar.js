/**
 * The Calendar page: one week, seven columns, an all-day band across the top
 * and an hour grid under it.
 *
 * Owns everything inside the pane when `state.view === 'calendar'` and nothing
 * outside it — the same arrangement demo-today.js and demo-habits.js keep. It
 * states its own status line on `data-status` and demo.js reads it off the
 * pane's first child, so demo.js never learns this view's internals.
 *
 * ── the module cycle ──────────────────────────────────────────────────────
 * demo.js imports `calendarView` from here and this module imports `state` and
 * `render` back, which resolves under the one rule written at the top of
 * demo-notes.js: **a view module must not read an imported binding at module
 * top level.** Every constant below is a literal; everything that touches
 * `state` is inside a function.
 *
 * ── the week, not the month ───────────────────────────────────────────────
 * `Calendar.tsx:57` opens on `'week'`, and the file says why: "a calendar is
 * mostly asked 'what is happening today and tomorrow', and a month grid answers
 * a different question". website/images/calendar.webp is that week. The Day,
 * Month and Agenda buttons are drawn because a segmented control is what tells
 * you which view you are in, and they are disabled because this demo has one.
 *
 * ── where the geometry comes from ─────────────────────────────────────────
 * `desktop/src/components/calendar/layout.ts`, value for value: an hour is 48px
 * (`HOUR_PX`), a block is never shorter than 20px (`MIN_EVENT_PX`), and a block
 * under 34px tall shows its time and title on one line rather than two
 * (`EventBlock.tsx:twoLine`). Three chips per day before the rest become
 * "+N more" is `AllDayRow.tsx:MAX_CHIPS`.
 *
 * ── weeks open on Sunday here ─────────────────────────────────────────────
 * The app's do (`Calendar.tsx:weekDays` counts back from `getDay()`), and
 * calendar.webp's columns run SUN…SAT with its mini month lettered S M T W T F
 * S. demo-logic's `habitMatrix` and `streak` count Monday-start weeks and go on
 * doing so — that is arithmetic behind a rolling strip of squares with no
 * weekday written on it anywhere, so the two conventions never meet on screen.
 * The mini month is drawn from `monthGrid(y, m, today, 0)`, which takes the
 * week start precisely so this view and that arithmetic can differ without
 * either one guessing.
 *
 * ── what "now" means ──────────────────────────────────────────────────────
 * `state.now` — the instant the seed was built from, which every other view
 * already reads. The red line, the "next up" in the status bar and the events
 * themselves therefore cannot disagree with each other, and Reset moves all
 * three forward together. There is no timer: a minute hand that moved while the
 * rest of the window stayed at `state.now` would be the one part of this demo
 * that lies about what it is.
 */
import { el, glyph } from './demo-dom.js'
import { dayStr, dueOn, eventsOn, monthGrid, todayStr } from './demo-logic.js'
import { state, render } from './demo.js'

const MIN = 60000
/** Height of one hour row, in CSS pixels — layout.ts:HOUR_PX. */
const HOUR_PX = 48
/** Floor on a block's drawn height, so a 15-minute event stays legible. */
const MIN_BLOCK_PX = 20
/** Below this a block says its time and title on one line — EventBlock.tsx. */
const TWO_LINE_PX = 34
/** Chips a day shows before the rest are counted — AllDayRow.tsx:MAX_CHIPS. */
const MAX_CHIPS = 3
/** Where the hour grid opens: 08:00, as calendar.webp does. */
const OPEN_HOUR = 8
/** A hair above the hour line, so the 08:00 label is not clipped by the edge. */
const OPEN_SLACK = 10

/* ── glyphs ───────────────────────────────────────────────────────────────
   One lucide path each, for the reason given in demo-today.js: demo-dom's
   glyph() builds a single <path>, and the stroke, caps and width come from the
   one `.demo-window svg` rule in demo.css. */

/** lucide `chevron-left` / `chevron-right` — the week and month steppers. */
const CHEVRON_LEFT = 'm15 18-6-6 6-6'
const CHEVRON_RIGHT = 'm9 18 6-6-6-6'
const PLUS = 'M12 5v14M5 12h14'
const CHECK = 'm20 6-11 11-5-5'

/* ── day strings ──────────────────────────────────────────────────────────
   Every date here is a `YYYY-MM-DD` day string and every conversion back to a
   Date is anchored at noon — never `Date.parse('2026-09-06')`, which reads a
   bare date as UTC and lands on the day before for everyone west of Greenwich.
   Same rule, same reason, as demo-logic's own `atNoon`. */

/** Local midday on a day string, as a Date. */
function noon(day) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

/** 0 = Sunday … 6 = Saturday, in local time. */
const dowOf = (day) => noon(day).getDay()

/** The seven day strings of the Sunday-start week containing `day`. */
function weekOf(day) {
  const sunday = dayStr(noon(day), -dowOf(day))
  return Array.from({ length: 7 }, (_, i) => dayStr(noon(sunday), i))
}

/**
 * "Sep 6 – 12, 2026" — and "Aug 30 – Sep 5, 2026" across a month boundary.
 *
 * `formatRange` collapses the shared parts itself, which is exactly the
 * behaviour `Calendar.tsx:weekLabel` went out of its way to get; the fallback
 * is there for the same reason it is there, a runtime without it.
 */
function weekLabel(days) {
  const a = noon(days[0])
  const b = noon(days[6])
  const opts = { month: 'short', day: 'numeric', year: 'numeric' }
  try {
    return new Intl.DateTimeFormat(undefined, opts).formatRange(a, b)
  } catch {
    return `${a.toLocaleDateString(undefined, opts)} – ${b.toLocaleDateString(undefined, opts)}`
  }
}

/** 24-hour clock time, built by hand so no locale renders it as 1:30 PM. */
function hhmm(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "Thu" — the weekday of a day string, in the reader's own locale. */
const shortDow = (day) => noon(day).toLocaleDateString(undefined, { weekday: 'short' })

/** "Thursday, 10 September" — a chip's and a mini-month cell's tooltip. */
const longDate = (day) =>
  noon(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

/* ── reading the state ────────────────────────────────────────────────────── */

/** Whether a habit is ticked on `day`. */
const keptOn = (habitId, day) =>
  state.habitLogs.some((l) => l.habit_id === habitId && l.day === day)

/**
 * What the ALL DAY band carries for one day: dated open tasks first, then the
 * habits the day asks for.
 *
 * The order and the membership are `AllDayRow.tsx`'s — `dueByDate` filtered to
 * the unfinished, then `habitsOn` — with one clause the app has no need of: a
 * habit is not shown before the day it was made. The demo's Habits page already
 * draws nothing before `created` (a habit a minute old must not open with three
 * weeks of failure behind it), and paging back a month here would otherwise
 * contradict it inside one window.
 */
function chipsFor(day) {
  const dues = state.todos.filter((t) => t.due === day && !t.done)
  const habits = state.habits.filter((h) => dueOn(h, day) && (!h.created || h.created <= day))
  return [
    ...dues.map((t) => ({ kind: 'task', id: t.id, text: t.text })),
    ...habits.map((h) => ({ kind: 'habit', id: h.id, text: h.name, icon: h.icon, color: h.color })),
  ]
}

/**
 * Where each of a day's events is drawn, and how wide.
 *
 * The seeded events never overlap, so on first paint every block is the full
 * width of its column — but the New event button can put one anywhere, and two
 * blocks stacked on the same pixels would read as one event with a ghost. This
 * is the shape of `layout.ts:layoutOverlaps` reduced to what a demo needs:
 * events in start order, grouped into clusters that actually touch, each taking
 * the first column its cluster has free. A pure local helper rather than an
 * addition to demo-logic.js — that module is the *tested* arithmetic and this
 * is the placement of boxes on screen.
 */
function place(events) {
  const spans = events.map((e) => {
    const d = new Date(e.start_ts)
    const start = d.getHours() * 60 + d.getMinutes()
    return { ev: e, start, end: Math.min(1440, start + Math.max(15, e.mins)) }
  })
  const out = []
  let cluster = []
  let clusterEnd = -Infinity
  const close = () => {
    const cols = cluster.reduce((n, p) => Math.max(n, p.col + 1), 0)
    for (const p of cluster) out.push({ ...p, cols })
    cluster = []
  }
  for (const s of spans) {
    if (s.start >= clusterEnd) { close(); clusterEnd = -Infinity }
    const taken = new Set(cluster.filter((p) => p.end > s.start).map((p) => p.col))
    let col = 0
    while (taken.has(col)) col++
    cluster.push({ ...s, col })
    clusterEnd = Math.max(clusterEnd, s.end)
  }
  close()
  return out
}

/* ── ink on a coloured chip ───────────────────────────────────────────────
   A ticked habit chip is filled with the habit's own colour, which is data and
   comes in six hues from mid green to deep rose. White reads on some of them
   and black on the others, so the foreground is *measured* rather than chosen:
   WCAG 2.1 relative luminance, the two candidates scored, the better one used.
   That is `desktop/src/lib/contrast.ts:fgFor`, which exists because the app
   spent a long time writing white on everything and failing at 1.98:1. */

const linearize = (c) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a `#rrggbb`, 0 (black) → 1 (white). */
function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

/**
 * The better of the two inks on a fill — the token, not a literal.
 *
 * `(L+0.05)` against white is `1.05/(L+0.05)` and against black is
 * `(L+0.05)/0.05`; they cross at L ≈ 0.1791, which is the whole of this
 * function.
 */
const inkOn = (hex) => (luminance(hex) > 0.1791 ? 'var(--d-on-tone-dark)' : 'var(--d-on-tone)')

/* ── moving about ─────────────────────────────────────────────────────────
   `state.selectedDay` is the week anchor and `state.calMonth` is the mini
   month's own position. Both already live in `fresh()`, so Reset puts the
   calendar back on today's week without this module adding anything to it.

   The mini month follows the grid on every move the grid makes — which is
   `Calendar.tsx:go` and `goToday`, where the comment reads "there are only
   three places the grid moves, and this is one of them". Its own ‹ › steps it
   alone, leaving the week where it is, exactly as the app's does. */

function syncMonth() {
  const d = noon(state.selectedDay)
  state.calMonth = [d.getFullYear(), d.getMonth()]
}

/** Step the week, and bring the mini month with it. */
function goWeek(delta, fromKeyboard) {
  state.selectedDay = dayStr(noon(state.selectedDay), delta * 7)
  syncMonth()
  render()
  // The stepper is still on the page after the render, but it is a *new*
  // element, so a keyboard press has to be handed back to it or focus falls to
  // <body> and the visitor is returned to the top of the document.
  if (fromKeyboard) {
    document.querySelector(`.demo-cal-step[data-step="${delta < 0 ? 'prev' : 'next'}"]`)?.focus()
  }
}

function goToday(fromKeyboard) {
  state.selectedDay = todayStr(state.now)
  syncMonth()
  render()
  if (fromKeyboard) document.querySelector('.demo-cal-today')?.focus()
}

/** Step the mini month on its own. The week does not move. */
function stepMonth(delta, fromKeyboard) {
  const [y, m] = state.calMonth
  const d = new Date(y, m + delta, 1)
  state.calMonth = [d.getFullYear(), d.getMonth()]
  render()
  if (fromKeyboard) {
    document.querySelector(`.demo-cal-mstep[data-step="${delta < 0 ? 'prev' : 'next'}"]`)?.focus()
  }
}

/** A day picked in the mini month: the week goes there. */
function pickDay(day) {
  state.selectedDay = day
  syncMonth()
  render()
  // The cell that was pressed has been replaced; the one for the same day is
  // where the visitor is standing, and it takes the grid's single tab stop with
  // it so tabbing out and back returns there.
  roveTo(document.querySelector(`.demo-cal-mday[data-day="${CSS.escape(day)}"]`))
}

/* ── new events ───────────────────────────────────────────────────────────
   The header's button is the app's and it has to do the thing it says. The app
   opens an event dialog; this demo has none, and inventing one would ship a
   design the app has not made — so the button takes the next event off a short
   starter list, the same answer demo-habits.js gives for New habit.

   It lands on `state.selectedDay` (the day the mini month is pointing at, which
   is always inside the week on screen) in the first free hour from 09:00, so a
   new block never appears behind an existing one and never off the bottom of
   the opening view. Nothing goes into `fresh()` for this: the event lives in
   `state.events`, which Reset replaces wholesale, so Reset takes it away. */

const STARTERS = [
  { title: 'Coffee with Ben', mins: 45 },
  { title: 'Physio', mins: 60 },
  { title: 'Team sync', mins: 30 },
  { title: 'Pick up the keys', mins: 30 },
]

/** The first hour from 09:00 to 20:00 with nothing already on it. */
function freeHour(day) {
  const busy = eventsOn(state.events, day).map((e) => {
    const d = new Date(e.start_ts)
    const start = d.getHours() * 60 + d.getMinutes()
    return [start, start + e.mins]
  })
  for (let h = 9; h <= 20; h++) {
    const start = h * 60
    if (!busy.some(([s, e]) => s < start + 60 && e > start)) return h
  }
  return 9 // every hour taken: `place()` draws them side by side rather than stacked
}

function newEvent(fromKeyboard) {
  const day = state.selectedDay
  const used = new Set(state.events.map((e) => e.title))
  const next = STARTERS.find((s) => !used.has(s.title)) ?? { title: 'New event', mins: 60 }
  const [y, m, d] = day.split('-').map(Number)
  state.events.push({
    id: `event-new-${state.events.length}`,
    title: next.title,
    // Local, via `new Date(y, m, d, h, min)` — the one way this demo builds an
    // instant from a date, so no timezone can move the block a column.
    start_ts: new Date(y, m - 1, d, freeHour(day), 0).getTime(),
    mins: next.mins,
  })
  render()
  if (fromKeyboard) document.querySelector('.demo-cal-new')?.focus()
}

/* ── ticking a habit off the band ─────────────────────────────────────────── */

function toggleHabit(habitId, day) {
  if (keptOn(habitId, day)) {
    state.habitLogs = state.habitLogs.filter((l) => !(l.habit_id === habitId && l.day === day))
  } else {
    state.habitLogs.push({ habit_id: habitId, day })
  }
}

/**
 * Re-render after a tick and put the tab stop — and the focus — back on the
 * chip that was pressed. Same `data-tick` convention demo-today.js and
 * demo-habits.js use; the three views never coexist in the pane, so the keys
 * cannot collide.
 */
function tickAndRender(chip) {
  const refocus = document.activeElement === chip ? chip.dataset.tick : null
  render()
  if (!refocus) return
  roveTo(document.querySelector(`[data-tick="${CSS.escape(refocus)}"]`))
}

/* ── the keyboard model ───────────────────────────────────────────────────
   A week is seven columns of chips over a grid of hour lines, and the last
   page to be built here shipped 126 buttons in tab order and had to be rebuilt.
   So the model was decided before the markup: **two composite widgets, one tab
   stop each**, which is the roving tabindex the sidebar nav and the habit
   matrix already use.

     · the ALL DAY band — up to 21 chips in seven ragged columns. Left/Right
       move a day, Up/Down move down a day's chips, Home/End go to the ends of
       the column. One Tab in, one Tab out.
     · the mini month — 42 cells. Left/Right a day, Up/Down a week, Home/End the
       ends of the row.

   Everything else is a plain control: the two week steppers, Today, the one
   live segment, New event, and the mini month's two steppers. Eight tab stops
   for the whole page, against the 70-odd a naive week view costs.

   The hour grid itself holds no focusable thing at all. That is not an
   omission: in the app a block opens an event dialog, and this demo has no
   dialogs — so a block here is a drawing with a tooltip, and a "button" that
   did nothing would be worse than the drawing. `Calendar.tsx` has no keyboard
   model for the grid to copy either; `TimeGrid` is pointer gestures throughout,
   and `EventBlock`'s only key handler opens that dialog.

   Enter and Space need no handler anywhere below: every one of these is a real
   button, and the browser turns both into the click. */

/** Put the single tab stop on `node` and move focus to it. */
function roveTo(node) {
  if (!node) return
  const group = node.closest('[data-rove]')
  if (!group) { node.focus(); return }
  for (const c of group.querySelectorAll('[tabindex="0"]')) c.tabIndex = -1
  node.tabIndex = 0
  node.focus()
}

const clamp = (i, n) => Math.max(0, Math.min(n - 1, i))

/** Arrow keys across the ALL DAY band: columns are days, rows are chips. */
function onBandKey(e) {
  const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!KEYS.includes(e.key)) return
  const chip = e.target.closest?.('.demo-cal-chip')
  if (!chip) return
  const cols = [...e.currentTarget.querySelectorAll('.demo-cal-chips')]
  const c = cols.findIndex((col) => col.contains(chip))
  if (c < 0) return
  const rows = [...cols[c].querySelectorAll('.demo-cal-chip')]
  const r = rows.indexOf(chip)
  if (r < 0) return
  e.preventDefault()
  if (e.key === 'ArrowUp') roveTo(rows[clamp(r - 1, rows.length)])
  else if (e.key === 'ArrowDown') roveTo(rows[clamp(r + 1, rows.length)])
  else if (e.key === 'Home') roveTo(rows[0])
  else if (e.key === 'End') roveTo(rows[rows.length - 1])
  else {
    // A day with fewer chips than the one being left keeps the last of them
    // rather than swallowing the move: clamped, never wrapping, which is the
    // rule the habit matrix keeps.
    const next = [...cols[clamp(c + (e.key === 'ArrowRight' ? 1 : -1), cols.length)]
      .querySelectorAll('.demo-cal-chip')]
    roveTo(next[clamp(r, next.length)])
  }
}

/** Arrow keys across the mini month: ±1 day, ±7 days, the ends of a row. */
function onMiniKey(e) {
  const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!KEYS.includes(e.key)) return
  const cell = e.target.closest?.('.demo-cal-mday')
  if (!cell) return
  const all = [...e.currentTarget.querySelectorAll('.demo-cal-mday')]
  const i = all.indexOf(cell)
  if (i < 0) return
  e.preventDefault()
  const row = Math.floor(i / 7)
  const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1
    : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0
  if (e.key === 'Home') roveTo(all[row * 7])
  else if (e.key === 'End') roveTo(all[row * 7 + 6])
  else roveTo(all[clamp(i + step, all.length)])
}

/* ── pieces ───────────────────────────────────────────────────────────────── */

/** The header's ‹ › steppers and its Today button. */
function headControls() {
  const step = (dir, path) => {
    const b = el('button', {
      type: 'button', className: 'demo-cal-step', 'data-step': dir,
      title: dir === 'prev' ? 'Previous week' : 'Next week',
      'aria-label': dir === 'prev' ? 'Previous week' : 'Next week',
    }, glyph(path))
    // `detail` is 0 when a click came from Enter or Space and non-zero from a
    // pointer — the test demo-today.js and demo-habits.js already use to tell a
    // keyboard user (who needs the focus moved) from a mouse user (for whom it
    // would flash a ring nobody asked for).
    b.addEventListener('click', (e) => goWeek(dir === 'prev' ? -1 : 1, e.detail === 0))
    return b
  }
  const today = el('button', {
    type: 'button', className: 'demo-cal-today', title: 'Back to this week',
  }, 'Today')
  today.addEventListener('click', (e) => goToday(e.detail === 0))
  return el('div', { className: 'demo-cal-nav' }, step('prev', CHEVRON_LEFT), today, step('next', CHEVRON_RIGHT))
}

/**
 * Day | Week | Month | Agenda.
 *
 * Week is filled and current; the other three are drawn and disabled, with a
 * title that says why. A segmented control is how an app tells you which view
 * you are in, so leaving them out would misrepresent the page — and wiring them
 * to nothing would be worse than saying so.
 */
function segmented() {
  return el('div', { className: 'demo-cal-seg', role: 'group', 'aria-label': 'Calendar view' },
    ['Day', 'Week', 'Month', 'Agenda'].map((name) => {
      const on = name === 'Week'
      return el('button', {
        type: 'button',
        className: 'demo-cal-segbtn',
        disabled: !on,
        'aria-current': on ? 'true' : null,
        title: on ? 'The week view' : `${name} view — the app has it, this demo shows the week`,
      }, name)
    }))
}

/**
 * The row of day headers: weekday, then the date, today's in a filled disc.
 *
 * A ring marks the selected day when it is not today. The app has no such mark
 * — its `sel` shows up in the dialog it opens — but this demo's New event
 * button writes straight onto that day with no dialog in between, and a button
 * whose effect lands somewhere unnamed is a button that looks broken. On first
 * paint the selected day *is* today, so nothing is drawn until the visitor has
 * picked a date in the mini month.
 */
function dayHeads(days, today) {
  return el('div', { className: 'demo-cal-days' },
    el('div', { className: 'demo-cal-corner' }),
    days.map((day) => {
      const isToday = day === today
      const sel = day === state.selectedDay && !isToday
      return el('div', { className: 'demo-cal-dayhead' },
        el('span', { className: 'demo-cal-dow' }, shortDow(day)),
        el('span', {
          className: 'demo-cal-date',
          'data-today': isToday ? 'true' : null,
          'data-sel': sel ? 'true' : null,
          'aria-current': isToday ? 'date' : null,
          title: `${longDate(day)}${isToday ? ' · today' : sel ? ' · selected' : ''}`,
        }, String(Number(day.slice(8)))))
    }))
}

/**
 * One chip in the ALL DAY band.
 *
 * A habit chip is a button and ticks the habit off, which is what
 * `AllDayRow.tsx` makes it — and a task chip is not, which is also what that
 * file makes it. But every chip is *focusable*, because the band is one
 * arrow-navigable grid and a hole in a column would make Up and Down jump
 * unpredictably: the inert ones carry `aria-disabled` and refuse the click,
 * which is the same answer the habit matrix's blank squares already give.
 *
 * A future day refuses a tick for the reason the Habits page refuses one: the
 * app gates it on `ds <= todayStr` (AllDayRow.tsx), and a tick on a day that has
 * not happened is a record of something that has not happened.
 */
function chip(c, day, today, roved) {
  const done = c.kind === 'habit' && keptOn(c.id, day)
  const inert = c.kind !== 'habit' || day > today
  const b = el('button', {
    type: 'button',
    className: 'demo-cal-chip',
    'data-kind': c.kind,
    'data-done': done ? 'true' : null,
    'aria-disabled': inert ? 'true' : null,
    'aria-pressed': c.kind === 'habit' ? String(done) : null,
    'data-tick': `${c.kind}:${c.id}:${day}`,
    tabIndex: roved ? 0 : -1,
    title: c.kind === 'task'
      ? `${c.text} — due ${longDate(day)}`
      : `${c.text} — ${longDate(day)}${done ? ' · done' : day > today ? ' · not yet' : ''}`,
    'aria-label': c.kind === 'task'
      ? `Task due ${longDate(day)}: ${c.text}`
      : `${c.text}, ${longDate(day)}${done ? ', done' : day > today ? ', not yet' : ', not done'}`,
  },
  el('span', { className: 'demo-cal-chipicon', 'aria-hidden': 'true' },
    c.kind === 'task' ? glyph(CHECK) : c.icon || '🎯'),
  el('span', { className: 'demo-cal-chiptext' }, c.text),
  done ? el('span', { className: 'demo-cal-chipdone', 'aria-hidden': 'true' }, glyph(CHECK)) : null)
  if (c.kind === 'habit') {
    // The habit's own colour, straight off the seed — the one colour in this
    // file that is not a --d-* token, for the reason demo-today.js gives: it is
    // data rather than theming, and the app paints the same hue in both themes.
    b.style.setProperty('--habit', c.color)
    if (done) b.style.setProperty('--habit-ink', inkOn(c.color))
  }
  if (!inert) {
    b.addEventListener('click', () => {
      toggleHabit(c.id, day)
      tickAndRender(b)
    })
  }
  return b
}

/** The ALL DAY band: a label, then one column of chips per day. */
function allDayBand(days, today) {
  // Chips first, anchor second. The preferred tab stop is today's first chip
  // where today is on screen and Sunday's otherwise — the day you would
  // actually want to change — but a week can have no chips on that day at all
  // (page back past every habit's `created` and the whole band empties), and an
  // anchor on a day with nothing in it puts *zero* cells in the page's tab
  // order. `onBandKey` only runs once focus is already inside the band, so
  // there would be no way back in. Fall back to the first chip that exists.
  const cols = days.map((day) => ({ day, all: chipsFor(day) }))
  const preferred = days.includes(today) ? today : days[0]
  const anchor = (cols.find((c) => c.day === preferred && c.all.length)
    || cols.find((c) => c.all.length))?.day
  return el('div', { className: 'demo-cal-allday', 'data-rove': 'band', onkeydown: onBandKey },
    el('div', { className: 'demo-cal-alllabel' }, 'All day'),
    el('div', { className: 'demo-cal-allcols' },
      cols.map(({ day, all }) => {
        const shown = all.slice(0, MAX_CHIPS)
        const extra = all.length - shown.length
        return el('div', {
          className: 'demo-cal-chips',
          role: 'group',
          'aria-label': `${longDate(day)} — all day`,
        },
        shown.map((c, i) => chip(c, day, today, day === anchor && i === 0)),
        // "+2 more" narrows to "+2" rather than to "+2 m…": the number is the
        // whole message and the word is what a 37px column cannot afford. The
        // word is a span of its own so the width ladder can drop it, which a
        // single string could only do by ellipsising it.
        extra > 0
          ? el('span', { className: 'demo-cal-more', title: `${extra} more on ${longDate(day)}` },
            `+${extra}`, el('span', { className: 'demo-cal-moreword' }, ' more'))
          : null)
      })))
}

/** One event, drawn where its start puts it and as tall as it runs. */
function block(p) {
  const { ev, start, end, col, cols } = p
  const height = Math.max(MIN_BLOCK_PX, ((end - start) / 60) * HOUR_PX)
  const endTs = ev.start_ts + ev.mins * MIN
  const time = `${hhmm(ev.start_ts)} – ${hhmm(endTs)}`
  const twoLine = height >= TWO_LINE_PX
  const width = 100 / cols
  // No past/future styling: `EventBlock.tsx` draws every block the same, and
  // an event is not a task — one that has already happened did not fail to. The
  // Today card's struck-through rows are a different question ("what is left")
  // asked of a different list.
  const b = el('div', { className: 'demo-cal-ev', title: `${ev.title} · ${time}` },
    el('span', { className: 'demo-cal-ev-title' }, ev.title),
    // A block too short for two lines keeps the title and drops the time —
    // where EventBlock.tsx draws "09:30 Standup" on that line, because its
    // columns are never narrower than 88px and these are between 37 and 75.
    // The long note in demo.css says what that cost when it was copied as-is.
    // The start, not the range `EventBlock.tsx` prints. "11:00 – 12:00"
    // measures 62px and the widest box this window can give it is 60 — a column
    // beside the mini month is 64 to 75px where the app's floor is 88 — so the
    // range could only ever render as "13:00 – 14:0…". A time is not a word: an
    // ellipsised one does not read short, it reads wrong. The end is the half
    // the block already draws, in its own height, and the tooltip says the
    // range in full.
    twoLine ? el('span', { className: 'demo-cal-ev-time' }, hhmm(ev.start_ts)) : null)
  b.style.top = `${(start / 60) * HOUR_PX}px`
  b.style.height = `${height}px`
  // A small inset on the right so a block underneath peeks out and reads as a
  // separate event rather than a continuation — EventBlock.tsx's `inset`.
  b.style.left = `${col * width}%`
  b.style.width = `calc(${width}% - ${cols > 1 ? 4 : 3}px)`
  return b
}

/**
 * The hour grid: a 24-hour axis and seven columns, scrolled to the working day.
 *
 * The hour lines are a repeating gradient rather than 48 elements — the grid is
 * decoration, and 48 divs of nothing is 48 divs a screen reader has to walk
 * past. The labels are elements because they carry text.
 */
function hourGrid(days, today) {
  const axis = el('div', { className: 'demo-cal-axis' },
    Array.from({ length: 23 }, (_, i) => {
      const h = i + 1
      const label = el('span', { className: 'demo-cal-hour' }, `${String(h).padStart(2, '0')}:00`)
      label.style.top = `${h * HOUR_PX}px`
      return label
    }))

  const cols = el('div', { className: 'demo-cal-cols' },
    days.map((day) => {
      const col = el('div', { className: 'demo-cal-col' },
        place(eventsOn(state.events, day)).map(block))
      if (day === today) {
        const d = new Date(state.now)
        const line = el('div', { className: 'demo-cal-now', 'aria-hidden': 'true' })
        line.style.top = `${((d.getHours() * 60 + d.getMinutes()) / 60) * HOUR_PX}px`
        col.append(line)
      }
      return col
    }))

  const body = el('div', { className: 'demo-cal-hourbody' }, axis, cols)
  body.style.height = `${24 * HOUR_PX}px`
  // A scrollable box takes a tab stop of its own in every browser, because a
  // keyboard user has to be able to scroll it — so it is named rather than left
  // as an unlabelled stop. That stop is the eleventh and last of this page's,
  // and it is the one that reaches the twelve hours below the fold.
  const scroller = el('div', {
    className: 'demo-cal-hours',
    role: 'group',
    'aria-label': 'Hour grid — scroll for the rest of the day',
  }, body)

  // The scroll position is set after this element reaches the page — a detached
  // node's scrollTop does not stick — and a microtask is enough, because
  // render() appends synchronously and this runs when it returns. Deliberately
  // not requestAnimationFrame: a hidden or backgrounded pane parks rAF, and the
  // grid would open at midnight for anyone whose tab was not in front.
  queueMicrotask(() => { scroller.scrollTop = hourScroll ?? OPEN_HOUR * HOUR_PX - OPEN_SLACK })
  scroller.addEventListener('scroll', () => { hourScroll = scroller.scrollTop })
  return scroller
}

/**
 * Where the hour grid is scrolled to, kept across renders.
 *
 * Module-level rather than in `state`, and deliberately: this is where the
 * visitor is looking, not part of the world Reset replaces — being thrown back
 * to 08:00 because you ticked a habit is the same jolt demo.js avoids by
 * keeping `view` outside `fresh()`.
 */
let hourScroll = null

/** The mini month: a navigator, and nothing else — `MiniMonth.tsx` says so. */
function miniMonth(days, today) {
  const [y, m] = state.calMonth
  const cells = monthGrid(y, m, today, 0)
  const inWeek = new Set(days)
  // Exactly one cell in this grid is in the page's tab order and the arrows
  // reach the rest, so that one cell has to be a cell that exists. The week on
  // screen is the preferred anchor — it is the row the band is drawn across —
  // but `stepMonth` moves the month and deliberately leaves the week alone, so
  // one press of `›` can page to a grid that holds none of the week's days.
  // Anchoring on a day that is not in `cells` leaves the grid with *no* tab
  // stop, and `onMiniKey` needs focus already inside it, so there is no way
  // back in — and the mini month is the only control that moves
  // `state.selectedDay`, which is what "New event" writes onto. Fall back to
  // the first cell in the grid, which is always there.
  const anchorDay = (cells.find((c) => c.day === days[0])
    || cells.find((c) => inWeek.has(c.day)) || cells[0]).day
  const title = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  // Sunday-first, matching the grid beside it. 2023-01-01 was a Sunday.
  const dows = Array.from({ length: 7 }, (_, i) =>
    new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }))

  const step = (dir, path) => {
    const b = el('button', {
      type: 'button', className: 'demo-cal-mstep', 'data-step': dir,
      title: dir === 'prev' ? 'Previous month' : 'Next month',
      'aria-label': dir === 'prev' ? 'Previous month' : 'Next month',
    }, glyph(path))
    b.addEventListener('click', (e) => stepMonth(dir === 'prev' ? -1 : 1, e.detail === 0))
    return b
  }

  return el('aside', { className: 'demo-cal-mini', 'aria-label': 'Jump to a date' },
    el('div', { className: 'demo-cal-minihead' },
      el('h3', { className: 'demo-cal-minititle' }, title),
      step('prev', CHEVRON_LEFT), step('next', CHEVRON_RIGHT)),
    el('div', { className: 'demo-cal-minigrid', 'data-rove': 'mini', onkeydown: onMiniKey },
      dows.map((d, i) => el('span', {
        className: 'demo-cal-mdow', 'aria-hidden': 'true',
        // Two of the seven narrow names repeat (S, T), so the key cannot be the
        // letter; the column index is what actually distinguishes them.
        'data-col': i,
      }, d)),
      cells.map((c) => {
        // The band is drawn on the cell rather than on the disc, so a whole week
        // joins up into one stripe — `MiniMonth.tsx` does the same, and the two
        // highlights stay different in kind: today is a filled disc, the visible
        // week is a shaded band behind it.
        const on = inWeek.has(c.day)
        const b = el('button', {
          type: 'button',
          className: 'demo-cal-mday',
          'data-day': c.day,
          'data-today': c.isToday ? 'true' : null,
          'data-out': c.inMonth ? null : 'true',
          'aria-current': c.isToday ? 'date' : null,
          tabIndex: c.day === anchorDay ? 0 : -1,
          title: longDate(c.day),
        }, String(Number(c.day.slice(8))))
        b.addEventListener('click', () => pickDay(c.day))
        return el('span', { className: 'demo-cal-mcell', 'data-in': on ? 'true' : null }, b)
      })))
}

/* ── the view ─────────────────────────────────────────────────────────────── */

/**
 * The Calendar page. Zero arguments, returns one element — the contract every
 * key in demo.js's `views` table keeps.
 *
 * The pane is a fixed height and `overflow:hidden`, so the only thing that
 * scrolls is the hour grid inside the frame. That is also what makes paging a
 * week unable to change the window's height: the header, the day row and the
 * ALL DAY band are all `flex:none` with stated heights, and whatever a week
 * holds is drawn inside them.
 */
export function calendarView() {
  const today = todayStr(state.now)
  const days = weekOf(state.selectedDay)

  const add = el('button', {
    type: 'button', className: 'demo-cal-new',
    // Named, not "the selected day": the button writes an event straight onto a
    // date, and the tooltip is where it says which.
    title: `Add an event to ${longDate(state.selectedDay)}`,
  }, glyph(PLUS), el('span', {}, 'New event'))
  add.addEventListener('click', (e) => newEvent(e.detail === 0))

  const root = el('div', { className: 'demo-cal' },
    el('div', { className: 'demo-cal-head' },
      el('h2', { className: 'demo-cal-title' }, weekLabel(days)),
      headControls(),
      segmented(),
      add),
    el('div', { className: 'demo-cal-body' },
      el('div', { className: 'demo-cal-frame' },
        dayHeads(days, today),
        allDayBand(days, today),
        hourGrid(days, today)),
      miniMonth(days, today)))

  // Both halves are things the visitor can check against the grid in front of
  // them: how much is on this week, and which block is next. "Next" is the first
  // event that has not finished yet, so one in progress still counts — the same
  // rule demo-today.js's SCHEDULE card keeps.
  const week = days.flatMap((d) => eventsOn(state.events, d))
  const next = week.find((e) => e.start_ts + e.mins * MIN > state.now)
  const count = week.length
    ? `${week.length} event${week.length === 1 ? '' : 's'} this week`
    : 'Nothing scheduled this week'
  root.dataset.status = next
    ? `${count} · next: ${next.title}, ${shortDow(dayStr(next.start_ts))} ${hhmm(next.start_ts)}`
    : count
  return root
}
