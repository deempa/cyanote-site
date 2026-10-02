/**
 * The arithmetic behind the demo sandbox. No DOM, no state, no imports —
 * which is what lets `node demo.test.mjs` run it without a browser or a build.
 */

/**
 * A day string, in *local* time.
 *
 * Anchored at noon rather than midnight so no DST changeover can round a day
 * the wrong way. The UTC version of this function is a real bug with a real
 * symptom — the whole grid slides one column east or west of Greenwich — and
 * it is written up at website/capture/seed.mjs:14.
 */
export function dayStr(base, offset = 0) {
  const x = new Date(base)
  x.setHours(12, 0, 0, 0)
  x.setDate(x.getDate() + offset)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export const todayStr = (now) => dayStr(now)

/** Midday on a day string, as a timestamp. The inverse of `dayStr`. */
const atNoon = (day) => Date.parse(day + 'T12:00:00')

/**
 * "4m ago". Floors rather than rounds at every step: 90 minutes is an hour
 * ago, not two, and a reader who has just copied something and sees "2h ago"
 * stops trusting the whole list. Clamped at zero so clock skew cannot produce
 * "-1m ago".
 */
export function relativeTime(ts, now) {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'yesterday' : `${d}d ago`
}

/**
 * What kind of thing a clipboard entry is, read off the content.
 *
 * Every seeded clip is plain text — the app stores a `kind` but the seed only
 * ever sets 'text' — so the icon has to be derived. Each pattern is anchored
 * at both ends: a sentence that merely contains a URL is a note to self, not
 * a link, and showing it with a link icon is a small lie the reader catches.
 */
export function clipType(text) {
  const t = text.trim()
  if (/^https?:\/\/\S+$/i.test(t)) return 'link'
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return 'colour'
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return 'email'
  return 'text'
}

/**
 * Sort tasks into the shelves the Today page shows.
 *
 * Every task lands in exactly one group and no group is ever missing, even
 * when empty — the page renders a heading only for a non-empty shelf, so the
 * shape has to be complete and the lengths have to be the truth. An undated
 * task goes to `upcoming` rather than nowhere: the app shipped a version where
 * ticking a task looked like deleting it, and the lesson is that a list which
 * quietly drops rows is worse than one that shows too many.
 */
export function groupTodos(todos, today) {
  const g = { overdue: [], today: [], upcoming: [], done: [] }
  for (const t of todos) {
    if (t.done) g.done.push(t)
    else if (!t.due) g.upcoming.push(t)
    else if (t.due < today) g.overdue.push(t)
    else if (t.due === today) g.today.push(t)
    else g.upcoming.push(t)
  }
  return g
}

/** The days this habit was kept, as a set. */
const daysFor = (logs, habitId) =>
  new Set(logs.filter((l) => l.habit_id === habitId).map((l) => l.day))

/** Day of the week (0 = Sunday … 6 = Saturday) for a day string, in local time. */
const dowOf = (day) => new Date(atNoon(day)).getDay()

/** The Monday that opens the week containing `day`. */
const weekStart = (day) => dayStr(atNoon(day), -((dowOf(day) + 6) % 7))

/** How many of the seven days from `monday` are ticked. */
const weekCount = (days, monday) => {
  const base = atNoon(monday)
  let n = 0
  for (let i = 0; i < 7; i++) if (days.has(dayStr(base, i))) n++
  return n
}

/**
 * Whether a habit's cadence asks for this day.
 *
 * `habitDueOn` at desktop/src/lib/habits.ts:33, on the demo's habit shape. A
 * `weekly` habit is due on the weekdays it names and on no others; a `daily`
 * one is due every day; and a `times_per_week` one is due every day too —
 * deliberately, and it is the only clause worth arguing about. A quota is an
 * obligation on the *week*, not on any particular day of it, so there is no day
 * it can be refused on: the app accepts a tick on any day for that cadence and
 * counts the week, and a demo that instead nominated some days as "the" quota
 * days would be inventing a rule the product does not have.
 *
 * A habit with no cadence at all is due — the answer that keeps a missing field
 * a cosmetic problem rather than a row that can never be ticked.
 */
export function dueOn(habit, day) {
  const c = habit?.cadence
  if (!c || c.type !== 'weekly') return true
  return c.days.includes(dowOf(day))
}

/**
 * The current run: consecutive kept due-days ending today, or — for a quota
 * habit — consecutive weeks that hit their target.
 *
 * `habitStreak` at desktop/src/lib/habits.ts:57, and the two rules it is built
 * on are both about not calling something a failure yet:
 *
 *   - **Today is given grace.** If today has not been ticked the walk carries on
 *     to yesterday rather than returning zero. The day is not over, and showing
 *     someone a 0 at breakfast for a habit they have kept for three weeks is how
 *     a tracker loses a user. Only a missed *past* due-day breaks a run.
 *   - **A day the habit was never due on is not a miss.** Without that clause a
 *     Mon/Wed/Fri habit's flame can never read above 1, because Tuesday breaks
 *     every run — and once the record itself only holds due days, which is what
 *     the demo's seed now generates, that is what every weekly row would show.
 *
 * A `times_per_week` habit is counted **in whole weeks on target**, because its
 * unit has to be the week or the number is meaningless: `dueOn` says yes to
 * every day for that cadence, so counting days scores a perfect 3×/week habit as
 * a daily one that misses four days out of seven. The week in progress gets the
 * same grace today gets. Weeks here open on Monday, as `habitMatrix`'s do — the
 * app's open on Sunday, and the demo keeps one convention throughout rather than
 * two that disagree by a day.
 *
 * `habit` is required, and loudly. It was optional for one revision and the
 * default was the old day-wise walk, which is a trap rather than a convenience:
 * a quota habit answered day-wise reads 1 where it should read 6, a weekly one
 * reads 1 where it should read 7, and nothing anywhere would flag it — the
 * number is plausible, just wrong. The next caller works from a brief, so the
 * failure has to be a throw rather than a plausible number.
 */
export function streak(logs, habitId, today, habit) {
  if (!habit) {
    throw new TypeError('streak(logs, habitId, today, habit): habit is required — '
      + 'the cadence decides which days count, and guessing it silently returns a wrong number')
  }
  const days = daysFor(logs, habitId)
  const cadence = habit.cadence ?? null
  // The day the habit began. The walk stops there so that days before a habit
  // existed cannot be scored as misses — and so a cadence that names no days at
  // all cannot spin this loop forever.
  const from = habit.created ?? dayStr(atNoon(today), -400)

  if (cadence?.type === 'times_per_week') {
    const current = weekStart(today)
    const first = weekStart(from)
    let n = 0
    for (let w = current; w >= first; w = dayStr(atNoon(w), -7)) {
      if (weekCount(days, w) >= cadence.target) n++
      else if (w !== current) break
    }
    return n
  }

  const base = atNoon(today)
  let n = 0
  for (let i = 0; ; i++) {
    const day = dayStr(base, -i)
    if (day < from) break
    if (!dueOn(habit, day)) continue // never asked for: not a miss
    if (days.has(day)) n++
    else if (i > 0) break // a missed past due-day ends the run
  }
  return n
}

/**
 * The last `weeks` Monday-start weeks for one habit, oldest row first.
 *
 * `future` marks days that have not happened yet. Without it the current week
 * renders as a run of misses and the grid reads as a week of failure rather
 * than a week in progress.
 */
export function habitMatrix(logs, habitId, today, weeks = 4) {
  const days = daysFor(logs, habitId)
  const base = atNoon(today)
  const toMonday = (new Date(base).getDay() + 6) % 7
  const out = []
  for (let w = weeks - 1; w >= 0; w--) {
    const row = []
    for (let d = 0; d < 7; d++) {
      const day = dayStr(base, -toMonday - w * 7 + d)
      row.push({ day, done: days.has(day), future: day > today })
    }
    out.push(row)
  }
  return out
}

/**
 * Day names, Sunday first — the indices a `weekly` cadence's `days` array uses,
 * so `days:[1,3,5]` is Mon, Wed, Fri. Three letters, because the chip they end
 * up in is a fixed-width column on every row.
 */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * The words on a habit's cadence chip.
 *
 * The app's own `cadenceText` (desktop/src/lib/habits.ts:196) with one
 * deliberate difference, which is what the Habits page already does with it:
 * a quota habit's chip shows the week's progress — "4/5 this week" — rather
 * than the bare rule, because for that kind "5× / week" on its own is half the
 * answer. `kept` is how many days of the current week are ticked, so the chip
 * moves as days are toggled.
 *
 * The two named runs are the point of the rest. Five weekday names in a row is
 * a wall of text where one word says the same thing, and a `weekly` habit that
 * happens to name all seven days *is* daily and has to say so — the chip's
 * colour is keyed off the same answer, so a label and a tint that disagreed
 * would be two different claims about one habit.
 */
export function cadenceLabel(cadence, kept = 0) {
  if (cadence.type === 'times_per_week') return `${kept}/${cadence.target} this week`
  if (cadence.type !== 'weekly') return 'Daily'
  const days = [...cadence.days].sort((a, b) => a - b)
  if (days.length === 7) return 'Daily'
  if (days.length === 0) return 'No days'
  const key = days.join(',')
  if (key === '1,2,3,4,5') return 'Weekdays'
  if (key === '0,6') return 'Weekends'
  return days.map((d) => DAY_NAMES[d]).join(', ')
}

/**
 * Six weeks covering `month` (0-indexed), from the weekday `weekStart` opens on.
 *
 * Always 42 cells, never 35. A grid that sizes itself to the month makes the
 * window jump height when you page from February to August, which looks like
 * a bug in a demo whose whole job is to look solid.
 *
 * `weekStart` is 0 for Sunday … 6 for Saturday, and it defaults to Monday
 * because that is what the rest of this file counts in — `habitMatrix`'s rows
 * and `streak`'s quota weeks both open on Monday, and they had this function to
 * themselves first. The Calendar's mini month passes 0: the app's calendar opens
 * its weeks on Sunday (`Calendar.tsx:weekDays`) and website/images/calendar.webp
 * shows that grid lettered S M T W T F S. The two conventions never meet on
 * screen — a habit track is a rolling strip of squares with no weekday written
 * on it — but they do meet here, which is why the caller says which it wants
 * rather than this function guessing.
 */
export function monthGrid(year, month, today, weekStart = 1) {
  const first = new Date(year, month, 1, 12)
  const lead = (first.getDay() - weekStart + 7) % 7
  const start = new Date(year, month, 1 - lead, 12).getTime()
  const cells = []
  for (let i = 0; i < 42; i++) {
    const day = dayStr(start, i)
    cells.push({ day, inMonth: Number(day.slice(5, 7)) - 1 === month, isToday: day === today })
  }
  return cells
}

/** Everything starting on `day`, earliest first. */
export const eventsOn = (events, day) =>
  events.filter((e) => dayStr(e.start_ts) === day).sort((a, b) => a.start_ts - b.start_ts)

/** Substring search, case-insensitive. An empty query matches everything. */
export function matchesClip(clip, q) {
  const n = q.trim().toLowerCase()
  return !n || clip.text.toLowerCase().includes(n)
}
