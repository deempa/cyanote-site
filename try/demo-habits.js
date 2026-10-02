/**
 * The Habits page: one row per habit, four weeks of record drawn along it, and
 * the tick for today at the end of the row.
 *
 * Owns everything inside the pane when `state.view === 'habits'` and nothing
 * outside it — the same arrangement demo-today.js keeps. It states its own
 * status line on `data-status` and demo.js reads it off the pane's first child,
 * so demo.js never learns this view's internals.
 *
 * ── the module cycle ──────────────────────────────────────────────────────
 * demo.js imports `habitsView` from here and this module imports `state` and
 * `render` back, which resolves under the one rule written at the top of
 * demo-notes.js: **a view module must not read an imported binding at module
 * top level.** Everything below that touches `state` is inside a function.
 *
 * ── what the arithmetic is not ────────────────────────────────────────────
 * `habitMatrix` and `streak` are demo-logic.js's, tested by `node
 * demo.test.mjs`, and nothing here recomputes either. The one number this file
 * works out for itself is how much of the current week a quota habit has done,
 * and it reads that off the *last row of the matrix it is already drawing* —
 * so the chip's "4/5 this week" and the seven squares beside it can never be
 * counting different days.
 *
 * ── where this differs from the app ───────────────────────────────────────
 * The app's row draws a fourth cell state: a day the habit was not *due* on
 * (Tuesday, for a Mon/Wed/Fri habit) is blank rather than a miss, and refuses
 * the click. That needs a cadence-aware streak to go with it —
 * `desktop/src/lib/habits.ts:habitStreak` counts due days only, and quota
 * habits in whole weeks — and demo-logic's `streak` is deliberately day-wise.
 * Half of that pair would be worse than neither: cadence-aware cells beside a
 * day-wise flame would put "🔥 0" on the two weekly rows and leave the reader
 * to work out why. So the cells here are kept/missed/not-yet, the click is
 * accepted on any elapsed day, and the divergence is written down rather than
 * hidden.
 */
import { el, glyph } from './demo-dom.js'
import { cadenceLabel, dueOn, habitMatrix, streak, todayStr } from './demo-logic.js'
import { state, render } from './demo.js'

/* ── glyphs ───────────────────────────────────────────────────────────────
   One lucide path each, for the reason given in demo-today.js: demo-dom's
   glyph() builds a single <path>, and the stroke and caps come from the one
   `.demo-window svg` rule in demo.css. */

/** lucide `flame` — the streak. */
const FLAME = 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6'
  + ' .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3'
  + 'a2.5 2.5 0 0 0 2.5 2.5'
/** lucide `repeat` — a daily cadence. */
const REPEAT = 'm17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3'
/** lucide `calendar-days` — a cadence that names its days. */
const CALENDAR_DAYS = 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2'
  + 'M8 2v4M16 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01'
/** lucide `hash` — a weekly quota. */
const HASH = 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18'
const PLUS = 'M12 5v14M5 12h14'
const CHECK = 'm20 6-11 11-5-5'

/**
 * How much record a row shows: three weeks of *elapsed* days, ending on today.
 *
 * Not four Monday-start weeks. The app's track is `lastDays(trackDays)`
 * (desktop/src/components/Habits.tsx:1359) — a flat run of days that have
 * actually happened, ending on today's column, as many whole weeks as fit — and
 * website/images/habits.webp is that: three week labels (Jul 18, Jul 25, Aug 1)
 * against an Aug 7 capture is twenty-one days ending on the capture date. A
 * calendar-aligned window instead ends on the Sunday of the current week, which
 * grows a block of cells for days nobody has lived yet; the app has never drawn
 * one, so neither does this.
 *
 * `habitMatrix` keeps its `future` flag — it is tested, and it is the right
 * answer for a calendar-shaped grid. This view simply asks it for one more week
 * than it needs and takes the last twenty-one days that are not in the future,
 * which is enough on every weekday (a Monday leaves twenty-two).
 */
const DAYS = 21
const MATRIX_WEEKS = Math.ceil(DAYS / 7) + 1

/** The days one row draws, taken out of a calendar matrix: the last `DAYS`
 *  elapsed ones, oldest first, ending on today. */
const elapsedWindow = (matrix) => matrix.flat().filter((c) => !c.future).slice(-DAYS)

/* ── reading the state ────────────────────────────────────────────────────── */

/** Whether a habit is ticked on `day`. */
const keptOn = (habitId, day) =>
  state.habitLogs.some((l) => l.habit_id === habitId && l.day === day)

/**
 * Tick or untick one day, in place.
 *
 * Nothing persists — this rewrites `state.habitLogs`, which `fresh()` replaces
 * wholesale, so Reset restores the original grid without this function knowing
 * anything about it.
 */
function toggle(habitId, day) {
  if (keptOn(habitId, day)) {
    state.habitLogs = state.habitLogs.filter((l) => !(l.habit_id === habitId && l.day === day))
  } else {
    state.habitLogs.push({ habit_id: habitId, day })
  }
}

/**
 * Re-render after a tick, and put the focus back on the control that was
 * pressed.
 *
 * A render replaces the pane, so the button that was just clicked no longer
 * exists; without this, every tick drops a keyboard user back to `<body>`.
 * Same fix demo-today.js makes, keyed off the same `data-tick` attribute — the
 * two views never coexist in the pane, so the ids cannot collide.
 */
function tickAndRender(button) {
  const refocus = document.activeElement === button ? button.dataset.tick : null
  render()
  if (!refocus) return
  const back = document.querySelector(`[data-tick="${CSS.escape(refocus)}"]`)
  // A grid cell takes the tab stop with it, so that tabbing out and back returns
  // to the square the visitor is standing on rather than to the default one.
  if (back?.classList.contains('demo-hb-cell')) roveTo(back)
  else back?.focus()
}

/* ── small local formatters ───────────────────────────────────────────────── */

/**
 * "Aug 24" from a `YYYY-MM-DD` day string, via a local Date — never
 * `Date.parse`, which reads a bare date as UTC and slides the label a day west
 * of Greenwich.
 *
 * demo-today.js has the same four lines. Local to each view on purpose:
 * demo-logic.js is the *tested* arithmetic module and this is locale
 * formatting, which has no stable answer to assert against; and a view module
 * importing another view module would make one of them a library it was never
 * written to be.
 */
function shortDate(day) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** "Thu, Aug 27" — the date on a cell's tooltip. */
function longCellDate(day) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

/**
 * Which of the three tints a cadence chip wears.
 *
 * The convention, lifted from `cadenceStyle` at desktop/src/components/
 * Habits.tsx:145: green means every day, violet means particular days, amber
 * means a quota to hit by the end of the week. It has to agree with
 * `cadenceLabel` — a habit whose `weekly` cadence names all seven days is
 * *daily*, says so, and must read green — so the seven-day case is repeated
 * here rather than assumed away.
 */
function cadenceKind(cadence) {
  if (cadence.type === 'times_per_week') return 'quota'
  if (cadence.type === 'weekly' && cadence.days.length !== 7) return 'days'
  return 'daily'
}

const CADENCE_GLYPH = { daily: REPEAT, days: CALENDAR_DAYS, quota: HASH }

/* ── new habits ───────────────────────────────────────────────────────────
   The header's button is the app's, and it has to do the thing it says. The
   app opens a naming dialog; this demo has none and inventing one here would
   ship a design the app has not made yet, so the button takes the next habit
   off a short starter list instead. Everything it needs already exists: the
   colour is one of the seed's own six (no new literal), and `created` is today,
   which is what makes the new row's four weeks draw blank rather than as a
   month of failure behind something a minute old.

   Nothing new goes into `fresh()` for this. A new habit lives in
   `state.habits`, which Reset replaces wholesale — so Reset takes it away
   exactly as it should. */
const STARTERS = [
  { name: 'Journal', icon: '✍️', cadence: { type: 'daily' } },
  { name: 'Call a friend', icon: '☎️', cadence: { type: 'times_per_week', target: 2 } },
  { name: 'Cook something new', icon: '🍳', cadence: { type: 'weekly', days: [0, 6] } },
  { name: 'Tidy the desk', icon: '🧹', cadence: { type: 'times_per_week', target: 3 } },
]

function newHabit(fromKeyboard) {
  const used = new Set(state.habits.map((h) => h.name))
  const next = STARTERS.find((s) => !used.has(s.name))
  const n = state.habits.length
  // The seeded six are always the first six — nothing here ever removes a
  // habit — so this reuses a seed colour rather than introducing a literal.
  const palette = state.habits.slice(0, 6).map((h) => h.color)
  const id = `habit-new-${n}`
  state.habits.push({
    id,
    name: next ? next.name : `New habit ${n + 1}`,
    icon: next ? next.icon : '🎯',
    color: palette[n % palette.length],
    cadence: next ? next.cadence : { type: 'daily' },
    created: todayStr(state.now),
  })
  render()
  // The button is still on the page after the render, so focus only moves when
  // it was a keyboard press — and then it goes to the new row's tick, which is
  // the thing the visitor just made.
  if (fromKeyboard) document.querySelector(`[data-tick="${CSS.escape(id)}"]`)?.focus()
}

/* ── pieces ───────────────────────────────────────────────────────────────── */

/**
 * One square of the record.
 *
 * Three states, which is the app's four minus the one this demo cannot reach:
 *
 *   done   the habit's own colour, at full strength
 *   miss   a shallow well with a hairline: a due day that went by
 *   blank  a fainter outline and no click — a day the cadence never asked for,
 *          or one before the habit existed
 *
 * The blank state is why the cadence had to be real before this page could be
 * honest. A Tuesday is not a failure for a Mon/Wed/Fri habit, and drawing it as
 * one turns every weekly row into a wall of holes; refusing the click there is
 * the same rule the tick keeps, and for the same reason — `streak` walks due
 * days, so a log written on a Tuesday moves nothing, and a control that changes
 * nothing is worse than one that is plainly not there.
 *
 * A day that is ticked but was not due is the app's fourth state and is drawn
 * the way the app draws it (Habits.tsx:170): the habit's colour, faded, and
 * still clickable so it can be undone. The seed no longer writes one and the
 * cells here refuse to make one — but the Today dashboard's habit card will tick
 * any habit on any day, so the state is reachable, and it has to read as what it
 * is: a bonus the streak does not count, not a full square claiming it did.
 */
function cell(habit, c, week, today, roved) {
  const due = dueOn(habit, c.day)
  const bonus = c.done && !due
  const before = c.day < habit.created
  const blank = before || (!due && !c.done)
  const note = c.done ? (due ? ' — done' : ' — done (bonus, not a due day)') : blank ? '' : ' — not done'
  const b = el('button', {
    type: 'button',
    className: 'demo-hb-cell',
    'data-week': week,
    'data-state': c.done ? 'done' : blank ? 'blank' : 'miss',
    'data-bonus': bonus ? 'true' : null,
    'data-today': c.day === today ? 'true' : null,
    'data-tick': `${habit.id}:${c.day}`,
    // `aria-disabled`, not `disabled`. A disabled button cannot take focus, and
    // the arrow keys below move across a *grid*: Gym has twelve blank squares in
    // twenty-one, so skipping them would make left/right jump unpredictably and
    // would leave up/down with no column to hold on to. Focusable and inert is
    // the composite-widget answer — the label says why the square is dead, and
    // the click handler refuses it.
    'aria-disabled': blank ? 'true' : null,
    // Exactly one cell in the whole matrix is in the page's tab order; see
    // `onGridKey`. The rest are reached with the arrows.
    tabIndex: roved ? 0 : -1,
    title: `${longCellDate(c.day)}${note}`,
    'aria-label': `${habit.name}, ${longCellDate(c.day)}${
      c.done ? (due ? ', done' : ', done as a bonus')
        : before ? ', before this habit was made' : due ? ', not done' : ', not due'}`,
    'aria-pressed': blank ? null : String(c.done),
  })
  b.addEventListener('click', () => {
    if (blank) return
    toggle(habit.id, c.day)
    tickAndRender(b)
  })
  return b
}

/* ── the grid's keyboard ──────────────────────────────────────────────────
   Six habits by twenty-one days is 126 buttons. Left in the tab order they are
   126 presses between the top of the page and the New habit button beside them,
   and rather more between a visitor and the buy block below the window — which
   is not a rough edge, it is a page a keyboard user cannot get past.

   So: a roving tabindex, the same pattern the sidebar nav already uses. The
   matrix costs one Tab to enter and one to leave, the arrows move inside it, and
   Home/End go to the ends of a row. Enter and Space need no handler at all —
   these are real buttons, and the browser turns both into the click.

   `Habits.tsx` has no keyboard model for this grid to copy: its cells are plain
   buttons in tab order, and the one arrow-key grid it does have (`gridMove`, for
   the starter-pack tiles) is eight tiles in a reflowing two-column layout, where
   whole-grid Home/End is the right answer and here it is not. The movement rules
   below are that function's otherwise — clamped at the edges, never wrapping. */

/** Put the single tab stop on `cell` and move focus to it. */
function roveTo(cell) {
  if (!cell) return
  for (const c of cell.closest('.demo-hb-rows').querySelectorAll('.demo-hb-cell[tabindex="0"]')) {
    c.tabIndex = -1
  }
  cell.tabIndex = 0
  cell.focus()
}

const clamp = (i, n) => Math.max(0, Math.min(n - 1, i))

/**
 * The cells of one track that are actually on screen.
 *
 * Read off the laid-out boxes rather than from the breakpoint, the way the app
 * reads its own column count: the width ladder hides whole weeks with
 * `display:none`, and a hidden cell cannot take focus.
 */
const shown = (track) => [...track.children].filter((c) => c.getClientRects().length)

function onGridKey(e) {
  const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!KEYS.includes(e.key)) return
  const cell = e.target.closest?.('.demo-hb-cell')
  if (!cell) return
  const tracks = [...e.currentTarget.querySelectorAll('.demo-hb-track')]
  const r = tracks.findIndex((t) => t.contains(cell))
  if (r < 0) return
  const row = shown(tracks[r])
  const c = row.indexOf(cell)
  if (c < 0) return
  e.preventDefault()
  if (e.key === 'ArrowLeft') roveTo(row[clamp(c - 1, row.length)])
  else if (e.key === 'ArrowRight') roveTo(row[clamp(c + 1, row.length)])
  else if (e.key === 'Home') roveTo(row[0])
  else if (e.key === 'End') roveTo(row[row.length - 1])
  else {
    const next = shown(tracks[clamp(r + (e.key === 'ArrowDown' ? 1 : -1), tracks.length)])
    roveTo(next[clamp(c, next.length)])
  }
}

/**
 * The row of dates above the grid: every seventh column, counted from the left.
 *
 * From the left, not back from today — the app's rule (Habits.tsx:TrackHeader).
 * Counting back would leave the opening week of the window unlabelled, which is
 * the run of squares you have to place before you can read any of it. Twenty-one
 * columns therefore give three dates, which is what habits.webp shows.
 */
function dateHeader(days) {
  return el('div', { className: 'demo-hb-dates' },
    // Flexible, so the grid below it is pushed to exactly where the rows put
    // theirs. The track and the tick are the last two members of both this row
    // and a habit row, both are fixed-width, and the gap between them is the
    // same — so the column a date labels is the column it sits over, without
    // this header knowing anything about the name or the chip beside it.
    el('span', { className: 'demo-hb-fill' }),
    el('div', { className: 'demo-hb-track' },
      days.map((c, i) => el('span', {
        className: 'demo-hb-datecell', 'data-week': Math.floor(i / 7),
      },
      // Absolutely positioned inside the cell: "Aug 24" is three times the
      // width of the square it labels, and letting it widen that square would
      // pull every row below out of alignment.
      i % 7 === 0 ? el('span', { className: 'demo-hb-datelabel' }, shortDate(c.day)) : null))),
    el('span', { className: 'demo-hb-tickspace' }))
}

function habitRow(h, today, first) {
  const matrix = habitMatrix(state.habitLogs, h.id, today, MATRIX_WEEKS)
  // The current week — the last row of the calendar-aligned matrix, which is
  // Monday-start, as `streak`'s quota weeks are. The strip of squares beside the
  // chip is a rolling twenty-one days and is not week-aligned at all, so this
  // number has to come from the calendar rather than from what is on screen.
  const keptThisWeek = matrix[matrix.length - 1].filter((c) => c.done).length
  const days = elapsedWindow(matrix)
  const n = streak(state.habitLogs, h.id, today, h)
  const quota = h.cadence?.type === 'times_per_week'
  const done = keptOn(h.id, today)
  const due = dueOn(h, today)
  const label = cadenceLabel(h.cadence, keptThisWeek)

  // Not due today, not tickable today. The app disables this button for the
  // reason the non-due cells are disabled (Habits.tsx:1744): `streak` counts due
  // days, so a log written on a day the habit was never asked for moves nothing,
  // and the tooltip names the days it is waiting for instead.
  const tick = el('button', {
    type: 'button',
    className: 'demo-hb-tick',
    'data-tick': h.id,
    disabled: !due,
    'aria-pressed': String(done),
    'aria-label': due ? `Mark done for today: ${h.name}` : `${h.name} — not due today`,
    title: due
      ? (done ? 'Done today — click to undo' : 'Mark done for today')
      : `Not due today · ${label}`,
  }, glyph(CHECK))
  tick.addEventListener('click', () => {
    toggle(h.id, today)
    tickAndRender(tick)
  })

  const row = el('div', { className: 'demo-hb-row' },
    el('span', { className: 'demo-hb-emoji', 'aria-hidden': 'true' }, h.icon),
    // The name and the chip, wrapped. At every width that has room for columns
    // the wrapper is `display:contents` and is not a box at all — these two stay
    // direct children of the row, in their own columns, exactly as before. On a
    // phone it becomes the one flexible cell and stacks them, which is the only
    // arrangement where both stay legible: see the note in demo.css.
    el('div', { className: 'demo-hb-id' },
      el('span', { className: 'demo-hb-name', title: h.name }, h.name),
      el('span', { className: 'demo-hb-cadence' },
        el('span', { className: 'demo-hb-chip', 'data-kind': cadenceKind(h.cadence), title: label },
          glyph(CADENCE_GLYPH[cadenceKind(h.cadence)]),
          el('span', { className: 'demo-hb-chiptext' }, label)))),
    // The unit follows the cadence, because the streak does: a quota habit is
    // counted in whole weeks it hit its target in, and a tooltip reading "4
    // days" over four weeks is the same lie the day-wise maths told.
    el('span', {
      className: 'demo-hb-streak',
      'data-on': n > 0 ? 'true' : null,
      title: quota
        ? `Current streak: ${n} week${n === 1 ? '' : 's'} on target`
        : `Current streak: ${n} day${n === 1 ? '' : 's'}`,
    }, glyph(FLAME), el('span', {}, String(n))),
    // A named group, so the run of squares is announced as one thing rather than
    // as twenty-one unrelated buttons.
    el('div', { className: 'demo-hb-track', role: 'group', 'aria-label': `${h.name} — recent days` },
      // The default tab stop is the first row's today column: the day you would
      // actually want to change, aligned with the tick beside it, and the one
      // cell the width ladder can never hide while the track is drawn at all.
      days.map((c, i) => cell(h, c, Math.floor(i / 7), today, first && c.day === today))),
    tick)

  // The habit's own colour, straight off the seed — the one colour in this file
  // that is not a --d-* token, for the reason demo-today.js gives: it is data
  // rather than theming, and the app paints the same hue in both themes. Set
  // once on the row, read by the filled squares and the tick.
  row.style.setProperty('--habit', h.color)
  return row
}

/* ── the view ─────────────────────────────────────────────────────────────── */

/**
 * The Habits page. Zero arguments, returns one element — the contract every key
 * in demo.js's `views` table keeps.
 *
 * It brings its own scroller (the pane is a fixed height and `overflow:hidden`)
 * and states its own status line on `data-status`.
 */
export function habitsView() {
  const today = todayStr(state.now)
  // What is actually left to do today, which is the question the page is opened
  // with. A habit not due today is not outstanding — it is not wanted — so it is
  // in neither half of the count, exactly as `dueTodayList` at
  // desktop/src/components/Habits.tsx:1545 has it. On a Saturday the two weekday
  // habits drop out and the denominator reads 4, which is the truth and is the
  // whole reason the cadence had to stop being decoration.
  const dueToday = state.habits.filter((h) => dueOn(h, today))
  const total = dueToday.length
  const kept = dueToday.filter((h) => keptOn(h.id, today)).length
  const left = total - kept
  const pct = total ? Math.round((kept / total) * 100) : 0
  // Every row draws the same twenty-one days, so the header's dates can be built
  // from an empty log — this is the days, not the record.
  const columns = elapsedWindow(habitMatrix([], 'none', today, MATRIX_WEEKS))

  const fill = el('span', { className: 'demo-hb-fill-bar' })
  fill.style.width = `${pct}%`

  const add = el('button', { type: 'button', className: 'demo-hb-new' },
    glyph(PLUS), el('span', {}, 'New habit'))
  // `detail` is 0 when a click came from Enter or Space and non-zero from a
  // pointer — the same test demo-today.js uses to tell a keyboard user (who
  // needs the focus moved) from a mouse user (for whom it would flash a ring).
  add.addEventListener('click', (e) => newHabit(e.detail === 0))

  const root = el('div', { className: 'demo-habits' },
    el('div', { className: 'demo-habits-head' },
      el('div', { className: 'demo-habits-hgroup' },
        el('h2', { className: 'demo-habits-title' }, 'Habits'),
        el('p', { className: 'demo-habits-sub' },
          left ? `${left} left today` : 'All done today 🎉')),
      el('div', { className: 'demo-habits-actions' },
        el('span', { className: 'demo-hb-progress', title: `${kept}/${total} done today` },
          el('span', { className: 'demo-hb-bar' }, fill),
          el('span', { className: 'demo-hb-count' }, `${kept}/${total}`)),
        add)),
    dateHeader(columns),
    el('div', { className: 'demo-hb-rows', onkeydown: onGridKey },
      state.habits.map((h, i) => habitRow(h, today, i === 0))))

  // Both halves are numbers the visitor can check against the rows in front of
  // them. The best streak is the one on the page, not a stored record: it is
  // recomputed from the logs every render, so a tick moves it.
  const best = state.habits.reduce((m, h) => Math.max(m, streak(state.habitLogs, h.id, today, h)), 0)
  // Named rather than given a unit: the longest run on the page may belong to a
  // quota habit, whose streak is counted in weeks and not in days, and one line
  // cannot honestly say "days" for six habits measured two ways.
  const leader = state.habits.find((h) => streak(state.habitLogs, h.id, today, h) === best)
  root.dataset.status = `${left
    ? `${left} habit${left === 1 ? '' : 's'} left today`
    : total ? 'All habits kept today' : 'Nothing due today'}${
    best && leader ? ` · longest run: ${leader.name}, ${best}` : ''}`
  return root
}
