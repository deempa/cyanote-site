/**
 * The Today dashboard: the greeting, the daily-note prompt, and the three
 * cards that say what the day looks like.
 *
 * Owns everything inside the pane when `state.view === 'today'` and nothing
 * outside it. The breadcrumb and the status bar belong to demo.js; this module
 * reaches neither — it puts its status line on its own root element as
 * `data-status` and demo.js reads it from there, which is the same arrangement
 * any later view can use without demo.js learning that view's internals.
 *
 * ── the module cycle ──────────────────────────────────────────────────────
 * demo.js imports `todayView` from here and this module imports `state`,
 * `render` and `goToView` back. That resolves under one rule, the same one
 * written at the top of demo-notes.js: **a view module must not read an
 * imported binding at module top level.** The glyph strings below are literals,
 * not dereferences, so they are safe where they are; everything that touches
 * `state` is inside a function.
 *
 * ── ROUTINES is absent on purpose ────────────────────────────────────────
 * website/images/today.webp shows a fourth card, ROUTINES, beside HABITS. It is
 * not here and its absence is a decision, not an oversight: demo-seed.js seeds
 * no routines and this demo builds no Routines section, so the card could only
 * ever render empty or fabricate rows the rest of the demo cannot open. An
 * empty card is worse than an absent one — it reads as a section that broke
 * rather than a section that is not part of this demo.
 */
import { el, glyph } from './demo-dom.js'
import { dueOn, eventsOn, groupTodos, todayStr } from './demo-logic.js'
import { state, render, goToView } from './demo.js'

const MIN = 60000

/* ── glyphs ───────────────────────────────────────────────────────────────
   One lucide path each, written as a single `d` because demo-dom's glyph()
   builds one <path>. Circles are arcs rather than <circle> elements for the
   same reason. Stroke, width and caps come from the one `.demo-window svg`
   rule in demo.css. */

/** lucide `sun` — the header square. */
const SUN = 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M4.93 4.93l1.41 1.41'
  + 'M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41'
/** lucide `calendar-days` — DAILY NOTE. */
const CALENDAR = 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2'
  + 'M8 2v4M16 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01'
/** lucide `calendar-clock` — SCHEDULE. */
const CALENDAR_CLOCK = 'M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5'
  + 'M16 2v4M8 2v4M3 10h5M17.5 17.5 16 16.25V14M22 16a6 6 0 1 0-12 0a6 6 0 1 0 12 0'
/** lucide `list-checks` — DUE TODAY. */
const LIST_CHECKS = 'm3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8'
/** lucide `target` — HABITS. Same three radii as the sidebar's Habits icon. */
const TARGET = 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10'
  + 'M12 10.4a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2'
/** lucide `file-text` — the daily-note row. */
const FILE_TEXT = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'
  + 'M14 2v6h6M16 13H8M16 17H8M10 9H8'
const PLUS = 'M12 5v14M5 12h14'
const CHEVRON = 'm9 18 6-6-6-6'

/* ── the clock ────────────────────────────────────────────────────────────
   One clock for the whole view: `state.now`, the instant the seed was built
   from. The events, the greeting and the "in 47 min" chip all read it, so they
   can never disagree with each other or with the day the seed put them on.
   Reset re-reads the real clock, which is what moves the demo's "now" forward.
   Reading Date.now() here instead would make the chip a minute truer and the
   view internally inconsistent — the wrong half of that trade. */

/** 24-hour clock time, built by hand so no locale can render it as 1:30 PM. */
function hhmm(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * "in 47 min" for the next event up.
 *
 * demo-logic's `relativeTime` is the past-tense twin of this and is not a fit:
 * it answers "how long ago", floors to whole hours, and has no word for an
 * event that has already started. This is a pure local helper rather than an
 * addition to demo-logic.js, which this task may not edit.
 */
function untilLabel(mins) {
  if (mins < 1) return 'now'
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `in ${h}h ${m}m` : `in ${h}h`
}

/** morning / afternoon / evening, by the hour on the clock above. */
function greeting(now) {
  const h = new Date(now).getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** "Friday, August 7" — the reader's own locale, not a hardcoded en-US string. */
function longDate(now) {
  return new Date(now).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

/** "Aug 5" from a `YYYY-MM-DD` day string, via a local Date — never Date.parse. */
function shortDate(day) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/* ── the daily note ───────────────────────────────────────────────────────
   Titled with today's long date and keyed by today's day string, so pressing
   the row twice opens the note it made the first time instead of stacking up
   duplicates. Nothing new is added to `fresh()` for this: the note lives in
   `state.notes`, which Reset already replaces wholesale, so a Reset takes the
   daily note with it exactly as it should. */

const dailyId = () => `daily-${todayStr(state.now)}`

const dailyNote = () => state.notes.find((n) => n.id === dailyId()) ?? null

function openDaily(fromKeyboard) {
  const id = dailyId()
  if (!dailyNote()) {
    const title = longDate(state.now)
    state.notes.push({
      id,
      icon: '📅',
      title,
      // Date.now(), not state.now: this one really is happening now, and the
      // sidebar sorts on it. Same call demo-notes.js makes on every keystroke.
      updated_at: Date.now(),
      blocks: [{ type: 'h1', text: title }, { type: 'p', text: '' }],
    })
  }
  state.view = 'notes'
  state.noteOpen = true
  state.selectedNoteId = id
  render()
  // This button has just removed itself from the page. On a mouse click that
  // is fine; on Enter or Space it would drop a keyboard user back to <body>,
  // so hand focus to the note's row in the sidebar — the same place the
  // document tab's × hands it.
  if (fromKeyboard) {
    document.querySelector(`.demo-note[data-note="${CSS.escape(id)}"]`)?.focus()
  }
}

/* ── what the cards show ──────────────────────────────────────────────────── */

/**
 * The tasks DUE TODAY draws, in the order the app draws them.
 *
 * **Membership:** everything overdue, everything due today, and the ones already
 * ticked that were due by today — which is what `today.webp` shows (one open and
 * overdue, two open today, two struck through) and what it leaves out (the three
 * due later or not dated at all). Taken from `groupTodos`, whose whole point is
 * that every task lands in exactly one group and none is ever dropped: the bug
 * this app shipped for real was `!t.done` filtering a completed task off the
 * list, and deriving membership from a total grouping is what makes that
 * unavailable here rather than merely absent.
 *
 * **Order:** by due date ascending, then finished work sunk to the bottom. That
 * is `dueToday()` at desktop/src/lib/todos.ts:107-113 — the app's own function
 * for this exact card — composed with `sinkDone()` at :47, and it is why the
 * capture reads `Pay the electricity bill` (Aug 6) above `Water the plants`
 * (Aug 7) beneath the three open ones.
 *
 * A ticked task therefore **moves, and stays on screen.** Those are different
 * claims and only the second one is the rule: `desktop/test/todos.test.ts:172`
 * asserts "completing one keeps it on the card, at the bottom". Sinking is what
 * the visitor wants — the row they just ticked is struck through where they can
 * see what they did and untick it again — and it is what the product already
 * does. The sort is stable, so open tasks sharing a due date keep the store's
 * order and only the open/done split can move a row.
 *
 * (The app additionally drops a task finished on an *earlier* day, via
 * `completed_at`. demo-seed.js stores no such field, and every tick in this demo
 * happens today, so that clause would be unreachable here and is not written.)
 */
function dueToday(today) {
  const g = groupTodos(state.todos, today)
  const shown = new Set([
    ...g.overdue,
    ...g.today,
    ...g.done.filter((t) => t.due && t.due <= today),
  ])
  const due = state.todos.filter((t) => shown.has(t))
  due.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
  return [...due.filter((t) => !t.done), ...due.filter((t) => t.done)]
}

/** Whether a habit is ticked for `day`. */
const keptOn = (habitId, day) =>
  state.habitLogs.some((l) => l.habit_id === habitId && l.day === day)

/**
 * The habits this card shows: the ones actually due today, and no others.
 *
 * `Today.tsx:57` — `hb.filter((h) => !h.archived && habitDueOn(h, today))` — and
 * today.webp is that list, plain rows with no cadence marking on them. Omitted
 * rather than shown disabled, which is the app's choice and the better one here:
 * this card has no room for a cadence chip to explain *why* a row cannot be
 * ticked, so a greyed-out row with no reason attached would read as a bug.
 *
 * It also has to be the same gate the Habits page uses, or the two pages
 * contradict each other inside one window: on a Saturday this card said "2 of 6
 * habits done" while Habits said "2/4", and a tick made here on a habit that was
 * not due landed over there as a faded bonus square the streak refuses to count.
 * Two views of one dataset disagreeing is worse than either being wrong alone.
 */
const habitsDue = (today) => state.habits.filter((h) => dueOn(h, today))

/* ── ticking ──────────────────────────────────────────────────────────────
   A tick writes to state and re-renders. Unlike the editor there is no caret
   to protect, so a full render is the honest thing — the strike-through, the
   card's own count and the status bar all move together and cannot drift apart.
   What a render does destroy is the checkbox that was just clicked, so focus is
   carried back to its replacement. Losing focus to <body> on every tick is the
   same defect the note list had before Task 4 fixed it. */

function tickAndRender(box) {
  const refocus = document.activeElement === box ? box.dataset.tick : null
  render()
  if (refocus) document.querySelector(`[data-tick="${CSS.escape(refocus)}"]`)?.focus()
}

/* ── pieces ───────────────────────────────────────────────────────────────── */

/** A card: the coloured icon, the uppercase label, whatever sits at the right. */
function card(tone, path, label, right, rows, wide = false) {
  return el('section', { className: `demo-card${wide ? ' demo-card-wide' : ''}` },
    el('div', { className: 'demo-cardhead' },
      el('span', { className: 'demo-cardicon', 'data-tone': tone }, glyph(path)),
      el('h3', { className: 'demo-cardlabel' }, label),
      right),
    el('div', { className: 'demo-cardbody' }, rows))
}

/** A card's right-hand link. Navigates; focuses the nav item on a keyboard press. */
const cardLink = (label, view) => el('button', {
  type: 'button',
  className: 'demo-cardlink',
  // `detail` is 0 when a click came from Enter or Space on the button and
  // non-zero when it came from a pointer, which is how this tells a keyboard
  // user (who needs focus moved) from a mouse user (for whom moving it would
  // flash a focus ring they did not ask for).
  onclick: (e) => goToView(view, e.detail === 0),
}, label)

function dailyRow() {
  const open = dailyNote()
  return el('button', {
    type: 'button',
    className: 'demo-daily',
    onclick: (e) => openDaily(e.detail === 0),
  },
  el('span', { className: 'demo-daily-icon', 'aria-hidden': 'true' }, glyph(FILE_TEXT)),
  el('span', { className: 'demo-daily-text' },
    el('span', { className: 'demo-daily-title' }, open ? 'Open today’s note' : 'Start today’s note'),
    el('span', { className: 'demo-daily-sub' },
      open ? 'Pick up today’s daily note where you left it' : 'Create a fresh daily note')),
  el('span', { className: 'demo-daily-plus', 'aria-hidden': 'true' }, glyph(open ? CHEVRON : PLUS)))
}

function eventRows(today) {
  const evs = eventsOn(state.events, today)
  // The next one up is the first that has not finished yet — so an event in
  // progress is still "next", with "now" on its chip, rather than being struck
  // through ten minutes before it ends.
  const next = evs.findIndex((e) => e.start_ts + e.mins * MIN > state.now)
  return evs.map((e, i) => {
    const end = e.start_ts + e.mins * MIN
    const past = end <= state.now
    return el('div', { className: `demo-ev${past ? ' is-past' : ''}${i === next ? ' is-next' : ''}` },
      el('span', { className: 'demo-ev-time' }, `${hhmm(e.start_ts)}–${hhmm(end)}`),
      el('span', { className: 'demo-ev-title' }, e.title),
      i === next
        ? el('span', { className: 'demo-ev-chip' }, untilLabel(Math.round((e.start_ts - state.now) / MIN)))
        : null)
  })
}

function taskRow(t, today) {
  const box = el('input', {
    type: 'checkbox', className: 'demo-task-box', checked: t.done, 'data-tick': t.id,
  })
  box.addEventListener('change', () => {
    t.done = box.checked
    tickAndRender(box)
  })
  // A <label> around the box and its text: the whole row is the hit area, and
  // the checkbox takes its accessible name from the text beside it for free.
  return el('label', { className: `demo-task${t.done ? ' is-done' : ''}` },
    box,
    el('span', { className: 'demo-task-text' }, t.text),
    // No date on a finished task — today.webp shows the column empty there, and
    // a due date on something already done is noise.
    t.done
      ? null
      : el('span', { className: `demo-task-due${t.due < today ? ' is-overdue' : ''}` },
        t.due === today ? 'Today' : shortDate(t.due)))
}

function habitRow(h, today) {
  const done = keptOn(h.id, today)
  const box = el('input', {
    type: 'checkbox', className: 'demo-habit-box', checked: done, 'data-tick': h.id,
  })
  // The habit's own colour, straight off the seed. It is the one colour in this
  // file that is not a --d-* token, because it is data rather than theming —
  // demo-seed.js gives each habit a fixed hue and the app paints that same hue
  // in both themes.
  box.style.setProperty('--habit', h.color)
  box.addEventListener('change', () => {
    if (box.checked) state.habitLogs.push({ habit_id: h.id, day: today })
    else state.habitLogs = state.habitLogs.filter((l) => !(l.habit_id === h.id && l.day === today))
    tickAndRender(box)
  })
  return el('label', { className: `demo-habit${done ? ' is-done' : ''}` },
    box,
    el('span', { className: 'demo-habit-emoji', 'aria-hidden': 'true' }, h.icon),
    el('span', { className: 'demo-habit-name' }, h.name))
}

/* ── the view ─────────────────────────────────────────────────────────────── */

/**
 * The Today dashboard. Zero arguments, returns one element — the contract every
 * key in demo.js's `views` table keeps.
 *
 * It brings its own scroller (the pane is `overflow:hidden` and a fixed height,
 * so a view taller than the pane has to), and it states its own status line on
 * `data-status`, which demo.js reads on its way past.
 */
export function todayView() {
  const today = todayStr(state.now)
  const tasks = dueToday(today)
  const left = tasks.filter((t) => !t.done).length
  const habits = habitsDue(today)
  const kept = habits.filter((h) => keptOn(h.id, today)).length

  const root = el('div', { className: 'demo-today' },
    el('div', { className: 'demo-today-head' },
      el('span', { className: 'demo-today-sun', 'aria-hidden': 'true' }, glyph(SUN)),
      el('div', { className: 'demo-today-hgroup' },
        el('h2', { className: 'demo-today-greet' }, greeting(state.now)),
        el('p', { className: 'demo-today-date' }, longDate(state.now)))),
    el('div', { className: 'demo-cards' },
      card('note', CALENDAR, 'Daily note', null, dailyRow(), true),
      card('schedule', CALENDAR_CLOCK, 'Schedule', cardLink('Open calendar', 'calendar'),
        eventRows(today)),
      // No `All tasks` link. The screenshot's points at the app's To-Do
      // section, and this demo has three sections and no To-Do — a link to
      // nowhere and a dead lookalike of a link are both worse than the truth,
      // so the slot carries a count instead. It is honest, it moves when you
      // tick something, and it keeps the three card headers the same shape.
      card('tasks', LIST_CHECKS, 'Due today',
        el('span', { className: 'demo-cardnote' }, `${tasks.length - left} of ${tasks.length} done`),
        tasks.map((t) => taskRow(t, today))),
      // "No habits for today." rather than an empty box — Today.tsx:275. Nothing
      // in this seed makes the list empty (the two daily and the two quota
      // habits are due every day), but a card that can render to nothing is one
      // that will, and a blank rectangle reads as a section that broke.
      card('habits', TARGET, 'Habits', cardLink('All habits', 'habits'),
        habits.length
          ? habits.map((h) => habitRow(h, today))
          : el('p', { className: 'demo-cardempty' }, 'No habits for today.'))))

  // demo.js's status bar reads this off the pane's first child. Both halves are
  // counts the visitor can check against the cards in front of them, which is
  // the only kind of status line worth writing.
  // The habit half counts what is due today, which is what the card above it
  // lists and what the Habits page's own header counts. One denominator.
  root.dataset.status = left
    ? `${left} task${left === 1 ? '' : 's'} left today · ${kept} of ${habits.length} habits done`
    : `All caught up for today · ${kept} of ${habits.length} habits done`
  return root
}
