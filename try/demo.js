/**
 * The demo sandbox's render loop: the state, the shell, and the registry of
 * views that fill the pane.
 *
 * This module owns everything outside the pane — the sidebar nav, the note
 * list, the breadcrumb, the document tab bar, the status bar, Reset — and
 * nothing inside it. Each section's contents live in their own module and
 * plug into `views` below; `render()` never names one individually, so adding
 * a section is adding a key.
 *
 * demo-logic.js stays pure so `node demo.test.mjs` can run the arithmetic
 * without a browser, demo-seed.js is data, and demo-dom.js holds the element
 * helpers and the markup allowlist every view shares. Nothing anywhere here
 * persists — no storage, no cookies, no network. Reload is the real Reset,
 * and Reset is the polite one.
 */
import { buildSeed } from './demo-seed.js'
// Only what this file reads today. Later sections bring their own imports
// along with the view that needs them — an import standing in for a view that
// does not exist yet is dead code, and dead code reads like a mistake.
import { todayStr } from './demo-logic.js'
import { el, glyph } from './demo-dom.js'
import { notesView, dropEditor } from './demo-notes.js'
import { todayView } from './demo-today.js'
import { habitsView } from './demo-habits.js'
import { calendarView } from './demo-calendar.js'
import { clipboardHotkey, openClipboard } from './demo-clipboard.js'

/**
 * `view` and `clipQuery` sit outside `fresh()` deliberately: Reset restores the
 * *world*, not the visitor's place in it. Being thrown back to Notes because
 * you pressed Reset while reading Habits would read as a crash, not a reset.
 * Everything else — every note, task, habit, log, event and clip, and every
 * selection that points into them — comes from `fresh()`, which is the whole
 * of what Reset replaces.
 *
 * Exported because the view modules read it. They must only ever read it from
 * *inside* a function: see the cycle note at the top of demo-notes.js.
 */
export const state = { view: 'notes', clipQuery: '', ...fresh() }

function fresh() {
  const now = Date.now()
  const seed = buildSeed(now)
  const d = new Date(now)
  return {
    ...seed, now,
    selectedNoteId: seed.notes[0].id,
    // The document tab bar is a bar with a document in it or it is not there.
    // Closing the tab is the one thing its × can honestly do, so the flag it
    // toggles lives here and Reset opens the note back up.
    noteOpen: true,
    selectedDay: todayStr(now),
    calMonth: [d.getFullYear(), d.getMonth()],
  }
}

/**
 * The note the Notes view is showing, or `null` if the store is empty.
 * Exported so the view and the shell can never disagree about which note that
 * is — there is one answer and one place that gives it.
 */
export function openNote() {
  // Fall back to the first note rather than rendering an empty column, and put
  // the selection back where the fallback landed.
  const note = state.notes.find((n) => n.id === state.selectedNoteId) ?? state.notes[0] ?? null
  if (note) state.selectedNoteId = note.id
  return note
}

/** The section name shown in the breadcrumb bar when that section is open. */
const VIEW_LABEL = { notes: 'Notes', today: 'Today', calendar: 'Calendar', habits: 'Habits' }

const pane = document.getElementById('demo-pane')
const crumb = document.getElementById('demo-crumb')
const tabbar = document.getElementById('demo-tabbar')
const nav = document.querySelector('.demo-nav')
const sideList = document.querySelector('.demo-notelist')
const statusLeft = document.querySelector('#demo-status .demo-status-left')

/**
 * Redraw the window.
 *
 * Exported because a view module's own event handlers are what drive most of
 * the changes in this demo — a ticked task, a created note, a followed link —
 * and every one of them has to bring the whole shell back into step. A view
 * function itself must never call this: it is running *inside* it, and calling
 * it would recurse. Handlers, not renders.
 */
export function render() {
  pane.replaceChildren(views[state.view]())
  // The blueprint grid belongs behind the editor and nowhere else; the pane
  // switches it on by data-view, so the attribute has to track the state.
  pane.dataset.view = state.view

  const note = openNote()
  crumb.textContent = state.view === 'notes' && state.noteOpen && note
    ? note.title
    : VIEW_LABEL[state.view] ?? 'Notes'

  renderTabbar(note)
  renderNav()
  renderSideList()
  updateStatus()
}

/* ── sidebar ─────────────────────────────────────────────────────────────── */

function renderNav() {
  const items = [...nav.querySelectorAll('[data-view]')]
  let roved = false
  for (const b of items) {
    const on = b.dataset.view === state.view
    if (on) b.setAttribute('aria-current', 'page')
    else b.removeAttribute('aria-current')
    // Roving tabindex: exactly one nav item sits in the page's tab order and
    // the arrow keys move between the rest. Notes has no nav item — it is
    // reached through the note list — so when it is the open view the first
    // item takes the rove, which keeps the list reachable in one Tab instead
    // of none.
    b.tabIndex = on ? 0 : -1
    roved ||= on
  }
  if (!roved && items[0]) items[0].tabIndex = 0
}

/**
 * The note list, rendered over the shell's static copy of it.
 *
 * Most recently touched first, which is the app's own order and the order the
 * no-script markup is already written in — so the list does not reshuffle the
 * instant the module arrives. Icon and title only: this row is one line in the
 * app and in the shell's CSS, and a snippet added here would wrap it.
 *
 * Rebuilt only when the rows themselves change. Selecting a note changes no
 * row's text and no row's position, so the common case moves one attribute and
 * touches nothing else. Replacing the list on every render — which is what
 * this did first — cost two things that both looked like CSS problems:
 *
 *   - **Focus.** Tab to a note, press Enter, and the button you were standing
 *     on was destroyed mid-click; focus fell to <body> and a keyboard user was
 *     returned to the top of the page every time they opened a note.
 *   - **The selection bar never animated.** A freshly-inserted element paints
 *     at its final computed style, so the accent bar on the new row was simply
 *     already there. The transition was real and correct and could never run.
 */
let listKey = ''

/** Mark (or unmark) one row as the open note. */
function markRow(button, on) {
  if (on) button.setAttribute('aria-current', 'true')
  else button.removeAttribute('aria-current')
}

function renderSideList() {
  const notes = [...state.notes].sort((a, b) => b.updated_at - a.updated_at)
  const showing = state.view === 'notes' && state.noteOpen
  // Identity, order, and the two strings a row draws. Not `updated_at`: that
  // ticks on every keystroke, and only the ordering it produces is visible.
  const key = notes.map((n) => `${n.id}${n.icon}${n.title}`).join('')
  const rows = [...sideList.querySelectorAll('.demo-note')]

  if (key === listKey && rows.length === notes.length) {
    for (const b of rows) markRow(b, showing && b.dataset.note === state.selectedNoteId)
    return
  }
  listKey = key

  // A rebuild is unavoidable here (the rows really did change), so carry focus
  // across it rather than dropping it: same row, same place in the tab order.
  const refocus = document.activeElement?.closest?.('.demo-note')?.dataset.note

  sideList.replaceChildren(...notes.map((note) => {
    const b = el('button', {
      type: 'button',
      className: 'demo-note',
      'data-note': note.id,
      // Worth having at every width — a long title ellipsises in a 280px
      // sidebar — and the only thing a pointer has to go on between 768 and
      // 999, where the rail keeps the emoji and clips the title. Assistive
      // tech never needs it: the title is clipped, not removed, so the row
      // keeps its accessible name.
      title: note.title,
      onclick: () => {
        state.view = 'notes'
        state.noteOpen = true
        state.selectedNoteId = note.id
        render()
        // Choosing a note is what the drawer was opened for, so it closes —
        // and the focus goes to the control that opened it rather than staying
        // on this row, which is about to be inert.
        closeDrawer(true)
      },
    },
    el('span', { className: 'demo-note-icon', 'aria-hidden': 'true' }, note.icon),
    el('span', { className: 'demo-note-title' }, note.title))
    markRow(b, showing && note.id === state.selectedNoteId)
    return el('li', {}, b)
  }))

  if (refocus) sideList.querySelector(`.demo-note[data-note="${CSS.escape(refocus)}"]`)?.focus()
}

/* ── the drawer ───────────────────────────────────────────────────────────
   Below 768px the sidebar is a panel that slides in over the pane rather than
   a column beside it. demo.css owns the layout; this owns the two halves of it
   that CSS cannot do — the control that opens the panel, and the focus
   handling that makes it a modal rather than a pane that happens to be on top.
   Neither the rail (768–999) nor the full shell needs anything from here:
   those are media queries and nothing else.

   The pattern is Task 8's, not a second one. demo-clipboard.js established it
   for the overlay and it holds here: Tab cycles inside the panel, Escape
   closes, a press on the backdrop closes, and the control that opened it gets
   the focus back. Two differences, both from the panel being part of the page
   rather than built on open:

     - A closed drawer is still in the layout, merely translated off the left
       edge, so it has to be marked `inert` or a reader tabs out of the pane
       and into a panel that is not on screen. CSS could do that with
       `visibility:hidden`, but only on a delay long enough to let the slide
       finish — which is a window in which the thing is off screen and still
       focusable. The attribute has no such window, and it blocks pointers too.
     - The drawer range is a width, so growing the window past it has to close
       the drawer. Otherwise the backdrop stays over an app that no longer has
       anything in front of it.

   The clipboard is deliberately *not* closed on the way in. It is summoned
   from a button inside this panel, it is drawn above it (z-index 5 over 3),
   and leaving the drawer standing underneath means Escape gives the focus back
   to the button that was pressed rather than to a control that has just been
   made inert. Two Escapes, in the order they were opened.

   Open-or-shut is a class on `#demo-root` and not a field of `state`, which is
   the same call `view` and `clipQuery` get at the top of this file and for the
   same reason: Reset restores the world, not the visitor's place in it. Being
   thrown out of the panel you had just opened because you pressed Reset — a
   button in the title bar, which is not even behind the backdrop — would read
   as a crash. So Reset leaves the drawer exactly as it found it, and there is
   nothing for `fresh()` to hold. */
const root = document.getElementById('demo-root')
const sidebar = document.getElementById('demo-sidebar')
const bodyEl = document.querySelector('.demo-body')
const crumbbar = document.querySelector('.demo-crumbbar')
/* The drawer range, asked of the browser rather than computed from
   innerWidth — a resize listener measuring pixels would have to know about the
   page's gutters and would fire on every frame of a drag. This 767 and the one
   in demo.css's drawer block are the same edge written twice, which is the
   single coupling between the two files: move one and move the other. */
const narrow = matchMedia('(max-width:767px)')

let drawerScrim = null
const drawerOpen = () => root.classList.contains('is-drawer-open')

const drawerBtn = el('button', {
  type: 'button',
  className: 'demo-drawerbtn',
  // Not "Menu": what is behind it is the app's sections and the note list, and
  // the panel it opens is the sidebar rather than a menu of commands.
  'aria-label': 'Sections and notes',
  'aria-expanded': 'false',
  'aria-controls': 'demo-sidebar',
  title: 'Sections and notes',
  onclick: () => (drawerOpen() ? closeDrawer() : openDrawer()),
}, glyph('M4 7h16M4 12h16M4 17h16'))
crumbbar.prepend(drawerBtn)

/* The class demo.css hangs the whole drawer arrangement off. Set from here and
   nowhere else, because this file is what has just supplied the control: with
   no module the stacked shell stands instead, and a drawer with no way to open
   it is the one thing worse than a tall window. */
root.classList.add('has-drawer')

/** The controls inside the panel, in tab order. */
const drawerStops = () => [...sidebar.querySelectorAll('button')].filter((n) => !n.disabled)

/**
 * Keep Tab inside the panel, exactly as `trapTab` does for the overlay.
 *
 * A modal that leaks focus to the page behind it is worse than no modal: the
 * reader tabs on into a document they cannot see, and nothing tells them they
 * have left.
 */
function trapDrawerTab(e) {
  const all = drawerStops()
  if (!all.length) return
  const i = all.indexOf(document.activeElement)
  const next = e.shiftKey ? all[(i <= 0 ? all.length : i) - 1] : all[(i + 1) % all.length]
  e.preventDefault()
  next.focus()
}

/** Mark the panel inert whenever it is in drawer range and shut. */
function syncDrawerInert() {
  sidebar.inert = narrow.matches && !drawerOpen()
}

function openDrawer() {
  if (drawerOpen() || !narrow.matches) return
  root.classList.add('is-drawer-open')
  drawerBtn.setAttribute('aria-expanded', 'true')
  // Before the focus move below, not after: focus() into inert content is a
  // no-op and would drop the caret on <body>.
  sidebar.inert = false
  drawerScrim = el('div', { className: 'demo-drawerscrim' })
  // mousedown rather than click, and prevented, for the reason
  // demo-clipboard.js sets out: a press on the backdrop would otherwise take
  // the focus off the panel before the close runs, and the close would be
  // handing it back from <body>.
  drawerScrim.addEventListener('mousedown', (e) => { e.preventDefault(); closeDrawer() })
  bodyEl.append(drawerScrim)
  drawerStops()[0]?.focus()
}

/**
 * Shut it, and give the focus back to the control that summoned it.
 *
 * `restoreFocus` defaults to "the focus is in there now", which is the only
 * case where something has to catch it. The resize path passes false: the
 * panel is a column of the layout again by then, and moving the focus out of a
 * sidebar that is visibly still on screen would read as the page jumping.
 */
function closeDrawer(restoreFocus = sidebar.contains(document.activeElement)) {
  if (!drawerOpen()) return
  root.classList.remove('is-drawer-open')
  drawerBtn.setAttribute('aria-expanded', 'false')
  drawerScrim?.remove()
  drawerScrim = null
  // Focus first, inert second, for the reason openDrawer states in reverse.
  if (restoreFocus) drawerBtn.focus()
  syncDrawerInert()
}

sidebar.addEventListener('keydown', (e) => {
  // Only while it is a modal. Above 768 this is an ordinary sidebar and
  // trapping Tab in it would be a bug with no way out.
  if (!drawerOpen()) return
  if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); return }
  if (e.key === 'Tab') trapDrawerTab(e)
})

/**
 * Bring the drawer back into agreement with the width.
 *
 * Growing the window past the drawer's edge has to shut it, or the state says
 * open while the sidebar is a column of the layout again — and shrinking back
 * would then show a panel and a backdrop nobody asked for.
 *
 * Wired to `change` *and* to `resize`, which is one listener more than a
 * correct browser needs: both fire on a real window resize and the second call
 * is a no-op. It is here because the belt matters more than its weight — the
 * failure it guards against is silent, and this reconcile is three property
 * reads. The visual half of the problem is not left to either of them: the
 * backdrop is `display:none` above 768 in demo.css, so even with neither event
 * delivered nothing is ever painted over the rail.
 */
function reconcileDrawer() {
  if (!narrow.matches) closeDrawer(false)
  syncDrawerInert()
}
narrow.addEventListener('change', reconcileDrawer)
addEventListener('resize', reconcileDrawer)
reconcileDrawer()

/* ── document tab bar ─────────────────────────────────────────────────────
   One tab, because this demo opens one document at a time. The × is a real
   button rather than a drawn glyph: it closes the note, and a control that
   does something and cannot be reached with a keyboard is a control that does
   not exist for part of the audience. */

function renderTabbar(note) {
  const show = state.view === 'notes' && state.noteOpen && note
  tabbar.hidden = !show
  if (!show) { tabbar.replaceChildren(); return }
  tabbar.replaceChildren(el('div', { className: 'demo-tab' },
    el('span', { className: 'demo-tab-icon', 'aria-hidden': 'true' }, note.icon),
    el('span', { className: 'demo-tab-title' }, note.title),
    el('button', {
      type: 'button',
      className: 'demo-tab-close',
      'aria-label': `Close ${note.title}`,
      title: 'Close',
      onclick: () => {
        state.noteOpen = false
        render()
        // This button has just removed itself from the page, so something has
        // to catch the focus or it falls to <body> and a keyboard user is
        // returned to the top of the document. The row that reopens the note
        // is the nearest thing to where they were.
        sideList.querySelector(`.demo-note[data-note="${CSS.escape(note.id)}"]`)?.focus()
      },
    }, glyph('M6 6l12 12M18 6 6 18'))))
}

/* ── status bar ───────────────────────────────────────────────────────────
   Live counts, recomputed from the editor on every keystroke. It is the
   cheapest proof this window is running rather than a picture of one. */

/**
 * Words, characters and a reading time for one note's text.
 *
 * Local to this file on purpose: demo-logic.js is the tested arithmetic module
 * and this task may not add to it. If a later view wants these numbers too,
 * lift this across with a test rather than copying it.
 */
function stats(text) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  // Ceil, not round: a 40-word note is "~1 min read", never "~0 min read".
  // Ceil alone is also enough to keep the floor at one — it is only an *empty*
  // editor that reads 0, which is the honest number for nothing to read.
  return { words, chars: text.length, mins: Math.ceil(words / 200) }
}

function updateStatus() {
  if (!statusLeft) return
  const ed = pane.querySelector('.demo-editor')
  if (state.view === 'notes' && state.noteOpen && ed) {
    // One line per block, so the last word of a heading and the first word of
    // the paragraph under it are not counted as one. textContent alone
    // concatenates them.
    const text = [...ed.children].map((n) => n.textContent).join('\n')
    const s = stats(text)
    statusLeft.textContent = `${s.words} words · ${s.chars} chars · ~${s.mins} min read`
    return
  }
  // Every other view states its own status by putting it on the element it
  // returns. Notes is the branch above only because its number has to be
  // recounted on every keystroke, without a render — not because it is special.
  // Reading the rest off one attribute means this function never learns a
  // view's internals, and a later section gets a status line by setting that
  // attribute rather than by adding a case here that someone has to remember.
  statusLeft.textContent = pane.firstElementChild?.dataset.status ?? ''
}

/**
 * The registry. One key per section, each a zero-argument function returning
 * one element. `render()` never names a key, so a later task adds a section by
 * importing its module and adding it here — and changes nothing else.
 */
const views = { notes: notesView, today: todayView, calendar: calendarView, habits: habitsView }

/**
 * Open a section from somewhere other than the sidebar — a card's "Open
 * calendar" link, say.
 *
 * `fromKeyboard` moves focus onto the matching nav item, because the control
 * that was clicked has just been destroyed by the render and a keyboard user
 * would otherwise be dropped back to <body>. It is a parameter rather than
 * something worked out here: only the caller's own event knows whether a click
 * came from a pointer or from Enter on a button, and moving focus after a mouse
 * click would flash a focus ring nobody asked for.
 */
export function goToView(view, fromKeyboard = false) {
  state.view = view
  render()
  // Choosing a section is the drawer's job done. The focus goes back to the
  // control that opened it and *not* to the nav item that was just pressed:
  // that item is inside the panel and is about to be inert, so focusing it
  // would drop the caret on <body>.
  if (drawerOpen()) { closeDrawer(true); return }
  if (fromKeyboard) nav.querySelector(`[data-view="${view}"]`)?.focus()
}

/* ── wiring ──────────────────────────────────────────────────────────────── */

nav.addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]')
  if (!b) return
  // No focus move: the button that was clicked is still on the page afterwards,
  // because render() replaces the pane and not the sidebar.
  goToView(b.dataset.view)
})

// Arrow keys move between sections and switching follows the focus, which is
// what a vertical list of section buttons is expected to do. Enter and Space
// need no handler: these are real buttons, so the browser turns both into the
// click above.
nav.addEventListener('keydown', (e) => {
  const all = [...nav.querySelectorAll('[data-view]')]
  const i = all.indexOf(document.activeElement)
  if (i < 0) return
  const next = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? all[(i + 1) % all.length]
    : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? all[(i - 1 + all.length) % all.length]
      : e.key === 'Home' ? all[0]
        : e.key === 'End' ? all[all.length - 1]
          : null
  if (!next) return
  e.preventDefault()
  goToView(next.dataset.view, true)
})

// The shell's half of an edit, delegated.
//
// The editor cannot re-render — that is the caret rule — so the three bits of
// shell text that have to keep up with typing are written in place from the
// event on its way past. Delegated rather than wired into demo-notes.js
// because the breadcrumb, the tab title and the word count are this module's
// elements: a view module reaching out to touch them would be a second author
// for the shell. The editor's own listener is on the target and this one is on
// the pane, so the write-back always lands before this reads it.
pane.addEventListener('input', () => {
  if (state.view !== 'notes') return
  const note = openNote()
  if (note) {
    crumb.textContent = note.title
    const tabTitle = tabbar.querySelector('.demo-tab-title')
    if (tabTitle) tabTitle.textContent = note.title
  }
  updateStatus()
})

/* The clipboard manager is the one part of the app that is not a section: it is
   a window summoned over the top of whatever you were doing. demo-clipboard.js
   owns all of it — the button here, and the two hotkeys. The key handler is on
   `document` because that is where a hotkey belongs, and it decides for itself
   whether the press was meant for the demo: it stands down unless the focus is
   inside the window. A web page must not swallow `/` from someone who is
   reading the page around it. */
document.getElementById('demo-clip-open').addEventListener('click', openClipboard)
document.addEventListener('keydown', clipboardHotkey)

document.getElementById('demo-reset').addEventListener('click', () => {
  // Drop the cached editor first. Reset hands `state` a brand-new world, but
  // the editor is reused whenever `data-note` still matches — so without this
  // a reset would restore every other view and leave the edited text sitting
  // on screen, which is the one bug the cache can cause.
  dropEditor()
  Object.assign(state, { view: state.view, clipQuery: '', ...fresh() })
  render()
})

render()
