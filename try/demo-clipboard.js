/**
 * The clipboard manager: a floating, Spotlight-style window summoned *over*
 * the app.
 *
 * It is not a section, and that is the whole point of it. In the real app this
 * is a separate always-loaded window that a global hotkey throws on screen in
 * front of whatever you were doing (`desktop/src/spotlight/Spotlight.tsx`), so
 * here it is an overlay inside `.demo-window` rather than another key in
 * demo.js's `views` table — the pane never learns it exists.
 *
 * ── the module cycle ──────────────────────────────────────────────────────
 * demo.js imports `openClipboard` and `clipboardHotkey` from here and this
 * module imports `state` back, which resolves under the rule written at the
 * top of demo-notes.js: **a view module must not read an imported binding at
 * module top level.** Everything below that touches `state` is inside a
 * function. This module deliberately does *not* import `render`: the overlay
 * draws itself and changes nothing in the window behind it.
 *
 * ── where the behaviour comes from ────────────────────────────────────────
 * `Spotlight.tsx`, line for line where it has an answer:
 *
 *   · the two pills, the magnifier, the placeholder and the Esc badge are its
 *     header (`Spotlight.tsx:585-603`);
 *   · the selected row takes a tint *and* a full accent border — the app's
 *     `bg-accent/15 ring-1 ring-inset ring-accent` (`:653`);
 *   · the day group label appears only when nothing has been typed (`:638`),
 *     because a search returns rows from any day and a header over them would
 *     be claiming a grouping the results do not have;
 *   · every open resets the query, the selection and the tab (`applyOpen`,
 *     `:285-294`), which is why none of those three live in demo.js's
 *     `fresh()`: there is nothing for Reset to put back. Reset is also
 *     unreachable while this is up — the scrim covers the title bar and focus
 *     is trapped in the panel — so it cannot be pressed behind the overlay;
 *   · a failed copy keeps the window open and says so (`:496-498`) rather than
 *     closing on a paste that never happened;
 *   · Pinned is a real tab with a real empty state (`:629`). See `pinnedEmpty`.
 *
 * Two things here the app has no answer for, both written down where they are
 * made: the scrim (the app's popup is an OS window, so it has nothing to dim)
 * and the clickable Esc badge (see `escButton`).
 *
 * Nothing persists. `navigator.clipboard.writeText` is the one call that leaves
 * the page, and it only ever writes *out* — see `copy`.
 */
import { el, glyph } from './demo-dom.js'
import { clipType, dayStr, matchesClip, relativeTime, todayStr } from './demo-logic.js'
import { state } from './demo.js'

/* ── glyphs ───────────────────────────────────────────────────────────────
   One lucide path each, as everywhere else in this demo: demo-dom's glyph()
   builds a single <path>, and the stroke, caps and width come from the one
   `.demo-window svg` rule in demo.css. A `d` may hold several subpaths, which
   is how the two-shape icons (the chain, the envelope, the magnifier) fit. */

/** lucide `clipboard-list` — the History pill, and the summons in the sidebar. */
const CLIPBOARD = 'M9.5 2.5h5a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z'
  + 'M15.5 4.5H18a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2.5M8 11h8M8 15h5'
/** lucide `star` — the Pinned pill. The same path the sidebar's scope row draws. */
const STAR = 'm12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3Z'
/** lucide `search` — the magnifier in front of the field. */
const SEARCH = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14m9 16-3.6-3.6'
/** lucide `link` — a link clip. */
const LINK = 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'
  + 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'
/** lucide `mail` — an email clip. */
const MAIL = 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'
  + 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'
/** lucide `file-text` — a plain-text clip, the fallback `clipType` falls to. */
const FILE = 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'
  + 'M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8'

/** The glyph and the spoken name for each of `clipType`'s four answers. */
const KINDS = {
  link: { path: LINK, name: 'Link' },
  email: { path: MAIL, name: 'Email address' },
  text: { path: FILE, name: 'Text' },
  colour: { path: null, name: 'Colour' },
}

/** How long a `Copied` line stands before the hint comes back — Spotlight.tsx:234. */
const FLASH_MS = 2200

/** The foot's standing line, verbatim from `Spotlight.tsx:736`. */
const HINT = '↑↓ navigate · Enter to copy & paste · hover an image to preview · Esc to close'

/* ── what is on screen ────────────────────────────────────────────────────
   Module-level rather than in `state`, and for the reason demo-calendar.js
   keeps its scroll position here: this is where the visitor is standing, not
   part of the world Reset replaces. Every open puts all three back anyway (see
   `openClipboard`), which is exactly what the app does. The query is the one
   exception — it lives in `state.clipQuery`, where demo.js already declared it
   and already clears it on Reset. */

/** The backdrop, or `null` when the overlay is closed. */
let wrap = null
/** The panel inside it, replaced wholesale on every draw. */
let panel = null
/** Which of the two pills is filled: 'history' or 'pinned'. */
let tab = 'history'
/** The index of the selected row within the rows currently listed. */
let sel = 0
/** A transient line shown in place of the hint, or '' for the hint itself. */
let flash = ''
let flashTimer = 0

/* ── the rows ─────────────────────────────────────────────────────────────── */

/**
 * The clips the list is showing, newest first.
 *
 * Pinned is empty in this seed by construction — see `pinnedEmpty` — so this is
 * the history, filtered. `matchesClip` is demo-logic's and is tested there.
 */
function rows() {
  if (tab === 'pinned') return []
  return state.clips
    .filter((c) => matchesClip(c, state.clipQuery))
    .sort((a, b) => b.created_at - a.created_at)
}

/**
 * The group a clip belongs to: `Spotlight.tsx:dayGroup`, cut to the two answers
 * this seed can produce.
 *
 * Every seeded clip is between zero and seven minutes old, so only two of the
 * app's four buckets are reachable — and the second one is reachable: open this
 * page at 00:03 and a seven-minute-old clip really did happen yesterday. A
 * hardcoded `TODAY` would be a label that is wrong for three minutes a day, and
 * this costs one comparison to be right for all of them. Day strings, in local
 * time, via demo-logic's `dayStr` — never a UTC date.
 */
const groupOf = (clip) => (dayStr(clip.created_at) === todayStr(state.now) ? 'Today' : 'Yesterday')

/* ── copying ──────────────────────────────────────────────────────────────── */

/**
 * Put a clip on the real clipboard, and say what happened either way.
 *
 * `navigator.clipboard` is permission-gated and is absent outside a secure
 * context, so the whole call is wrapped: a demo that throws into the console
 * because someone pressed Enter is worse than one that cannot reach the
 * clipboard. The message distinguishes the two outcomes rather than claiming
 * success in both — `Spotlight.tsx:496` keeps its window open and names the
 * failure for the same reason, and its reason is stronger than a demo's: there,
 * a copy that silently failed pasted the *previous* entry into someone's
 * document.
 *
 * This writes out and stores nothing, which is the one reason it is allowed in
 * a page whose rule is that nothing persists.
 */
async function copy(clip) {
  let ok = false
  try {
    await navigator.clipboard.writeText(clip.text)
    ok = true
  } catch { /* no permission, no secure context, no clipboard: say so below */ }
  say(ok ? 'Copied ✓' : 'Your browser would not let the page reach the clipboard')
}

/**
 * Show a line in the hint bar for a moment, then put the hint back.
 *
 * Written into the existing element rather than through `draw()`, and that is
 * the difference between this being announced and not: the foot is the panel's
 * live region, and a live region that is *replaced* along with everything
 * around it is a new node rather than a changed one — which most screen readers
 * do not read out. Changing the text of the node already on screen is the case
 * they all handle.
 */
function say(message) {
  flash = message
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flash = ''; paintHint() }, FLASH_MS)
  paintHint()
}

/** Put `flash` (or the standing hint) into the foot that is already on screen. */
function paintHint() {
  const hint = panel?.querySelector('.demo-clip-hint')
  if (!hint) return
  hint.replaceChildren(flash || HINT)
  if (flash) hint.dataset.flash = 'true'
  else delete hint.dataset.flash
}

/* ── the keyboard ─────────────────────────────────────────────────────────
   One handler on the panel, because the panel is where focus is: the overlay
   is a modal and `trapTab` below keeps every tab stop inside it. Escape,
   the arrows and Enter therefore reach this wherever the visitor is standing —
   which is the arrangement `Spotlight.tsx:558` and its window-level Escape
   listener add up to. */

/** The controls inside the panel, in tab order. */
const stops = () => [...panel.querySelectorAll('button, input')].filter((n) => !n.disabled)

/**
 * Keep Tab inside the dialog.
 *
 * A modal that leaks focus to the page behind it is worse than no modal: the
 * reader tabs on into a document they cannot see, and nothing tells them they
 * have left. Four stops — the two pills, the field, the Esc badge — so the
 * cycle is short and obvious.
 */
function trapTab(e) {
  const all = stops()
  if (!all.length) return
  const i = all.indexOf(document.activeElement)
  const next = e.shiftKey
    ? all[(i <= 0 ? all.length : i) - 1]
    : all[(i + 1) % all.length]
  e.preventDefault()
  next.focus()
}

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeClipboard(); return }
  if (e.key === 'Tab') { trapTab(e); return }
  // Below the two that do not need it: this walks the whole history on every
  // keystroke, and typing is what most of them are.
  const list = rows()
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!list.length) return
    e.preventDefault()
    // Clamped, never wrapping — the rule every other arrow-navigable list in
    // this demo keeps (the habit matrix, the calendar's all-day band).
    sel = Math.max(0, Math.min(list.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)))
    draw()
    return
  }
  if (e.key === 'Enter') {
    // Enter on one of the buttons is that button's click, and the browser is
    // about to deliver it. Copying here as well would both switch the tab and
    // copy a row in one press.
    if (e.target.closest('button')) return
    e.preventDefault()
    if (list[sel]) void copy(list[sel])
  }
}

/* ── pieces ───────────────────────────────────────────────────────────────── */

/**
 * One of the two pills. Toggle buttons rather than `role="tab"`: a tablist
 * wants a tabpanel, and the thing under these is a listbox that already names
 * which set it is holding.
 */
function pill(id, path, label) {
  const on = tab === id
  const b = el('button', {
    type: 'button',
    className: 'demo-clip-tab',
    'data-focus': `tab:${id}`,
    'data-on': on ? 'true' : null,
    'aria-pressed': String(on),
  }, glyph(path), el('span', {}, label))
  b.addEventListener('click', () => {
    if (tab === id) return
    tab = id
    sel = 0
    draw()
  })
  return b
}

/**
 * The Esc badge, as a button.
 *
 * The app draws a `<kbd>` here, and for a window summoned and dismissed by
 * hotkey that is the whole truth. This one is reached with the mouse as often
 * as with the keyboard, and a modal whose only pointer exit is "click the dark
 * part" is a modal a lot of people cannot leave. It is the same 10px outlined
 * badge — the deviation is that pressing it does what it says.
 */
function escButton() {
  const b = el('button', {
    type: 'button',
    className: 'demo-clip-esc',
    'data-focus': 'esc',
    title: 'Close the clipboard (Esc)',
    'aria-label': 'Close the clipboard',
  }, 'Esc')
  b.addEventListener('click', closeClipboard)
  return b
}

/** The pills, the magnifier and the field. */
function topBar() {
  const input = el('input', {
    type: 'text',
    className: 'demo-clip-search',
    'data-focus': 'search',
    id: 'demo-clip-search',
    value: state.clipQuery,
    placeholder: tab === 'history' ? 'Search clipboard history…' : 'Search pinned snippets…',
    autocomplete: 'off',
    // Off, or the search box underlines the visitor's typing in red. `el()`
    // writes this one even though the value is falsy — see FALSE_IS_A_VALUE in
    // demo-dom.js for why it has to.
    spellcheck: false,
    'aria-label': tab === 'history' ? 'Search clipboard history' : 'Search pinned snippets',
    // The field drives the list below it without focus ever leaving the field,
    // which is a combobox. `aria-activedescendant` is what tells a screen reader
    // which row the arrows are on while the caret stays here.
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'demo-clip-list',
    'aria-autocomplete': 'list',
  })
  input.addEventListener('input', () => {
    state.clipQuery = input.value
    // Back to the top on every keystroke — `Spotlight.tsx:455` resets the
    // selection on a query change, because row 3 of the old list is not row 3
    // of the new one and a selection that stayed put would wander.
    sel = 0
    draw()
  })
  return el('div', { className: 'demo-clip-top' },
    pill('history', CLIPBOARD, 'History'),
    pill('pinned', STAR, 'Pinned'),
    el('div', { className: 'demo-clip-field' }, glyph(SEARCH), input),
    escButton())
}

/** One clip. A listbox option, so the field above can point the arrows at it. */
function row(clip, i, selected) {
  const kind = clipType(clip.text)
  const when = relativeTime(clip.created_at, state.now)
  const r = el('div', {
    className: 'demo-clip-row',
    role: 'option',
    id: `demo-clip-row-${i}`,
    'data-kind': kind,
    'data-sel': selected ? 'true' : null,
    'aria-selected': String(selected),
    title: `${clip.text} — copied ${when}`,
    'aria-label': `${KINDS[kind].name}: ${clip.text}, ${when}`,
  },
  el('span', { className: 'demo-clip-glyph', 'aria-hidden': 'true' },
    kind === 'colour' ? el('span', { className: 'demo-clip-swatch' }) : glyph(KINDS[kind].path)),
  el('span', { className: 'demo-clip-text' }, clip.text),
  el('span', { className: 'demo-clip-time' }, when))
  if (kind === 'colour') {
    // The literal colour the clip *is*. Data, not theming — the one value in
    // this file that is not a --d-* token, for the reason demo-calendar.js
    // gives about a habit's hue. `clipType` has already proved it is a three-
    // or six-digit hex, so nothing else can reach this property.
    r.querySelector('.demo-clip-swatch').style.setProperty('background', clip.text)
  }
  // A row is not focusable — the field keeps the focus and points the arrows at
  // the list, which is what makes this a combobox rather than six tab stops. So
  // a press on one must not take the focus away either: without this the caret
  // leaves the search box the first time anyone clicks a row, and the arrows
  // stop working for the rest of the session.
  r.addEventListener('mousedown', (e) => e.preventDefault())
  r.addEventListener('click', () => {
    sel = i
    // Before the copy, not after: the copy is a promise, and the selection
    // moving to the row that was clicked is the immediate half of the answer.
    draw()
    void copy(clip)
  })
  return r
}

/**
 * What the Pinned tab shows.
 *
 * The pill filters, rather than being a drawing, because the app answers this:
 * Pinned is a real tab there (`Spotlight.tsx:189`) and an empty one says so in
 * a sentence (`:629`). Nothing in this seed is pinned, so this is the state it
 * lands on — and a panel that emptied itself with no explanation would read as
 * broken, which is the one outcome worse than a drawn-on pill.
 */
function pinnedEmpty() {
  return el('div', { className: 'demo-clip-none' },
    el('p', { className: 'demo-clip-none-title' }, 'No pinned snippets.'),
    el('p', {}, 'In the app a clip’s star keeps it here for good, above the history. '
      + 'Nothing in this demo is pinned.'))
}

/** The list, or the line that says why there is none. */
function listBox() {
  const list = rows()
  const box = el('div', {
    className: 'demo-clip-list',
    id: 'demo-clip-list',
    role: 'listbox',
    'aria-label': tab === 'history' ? 'Clipboard history' : 'Pinned snippets',
  })
  if (!list.length) {
    box.append(tab === 'pinned'
      ? pinnedEmpty()
      : el('div', { className: 'demo-clip-none' },
        el('p', {}, 'Nothing in the clipboard matches ',
          el('strong', {}, `“${state.clipQuery.trim()}”`), '.')))
    return box
  }
  let group = ''
  list.forEach((clip, i) => {
    // The group label only when nothing has been typed — Spotlight.tsx:638.
    if (!state.clipQuery.trim()) {
      const g = groupOf(clip)
      if (g !== group) {
        group = g
        box.append(el('p', { className: 'demo-clip-group' }, g))
      }
    }
    box.append(row(clip, i, i === sel))
  })
  return box
}

/**
 * The foot: the app's hint line, or whatever `say()` last put there.
 *
 * Verbatim, image preview and all. This demo seeds no image clips — the app's
 * clipboard does, and this is its line.
 */
function hintBar() {
  return el('p', {
    className: 'demo-clip-hint',
    'data-flash': flash ? 'true' : null,
    // Polite, so "Copied ✓" is announced without interrupting anything. The
    // hint itself is read when the dialog opens, as part of the panel.
    'aria-live': 'polite',
  }, flash || HINT)
}

/* ── drawing ──────────────────────────────────────────────────────────────── */

/**
 * Redraw the panel.
 *
 * The whole panel, on every keystroke, which is the shape the rest of this demo
 * is written in — and which destroys the field the visitor is typing into
 * unless the focus is carried across. That is not a hypothetical: without the
 * three lines below you can type exactly one character before the box goes
 * dead, because the element holding the caret is replaced between the keydown
 * and the next one. So every focusable carries a `data-focus` key, the key and
 * the caret are read *before* the replace, and both are put back after it.
 */
function draw() {
  if (!wrap) return
  const was = document.activeElement?.dataset?.focus ?? null
  const caret = was === 'search'
    ? [document.activeElement.selectionStart, document.activeElement.selectionEnd]
    : null

  // Clamp before drawing: a query that narrows the list can leave the selection
  // past its end, and a row that does not exist cannot be shown as selected.
  const list = rows()
  sel = list.length ? Math.max(0, Math.min(list.length - 1, sel)) : 0

  panel.replaceChildren(topBar(), listBox(), hintBar())

  const back = was ? panel.querySelector(`[data-focus="${was}"]`) : null
  if (back) {
    back.focus()
    // A restored caret, not a re-selected word: focus() on an input selects all
    // of it in some browsers, so typing the next letter would replace the query
    // instead of extending it.
    if (caret) back.setSelectionRange(caret[0], caret[1])
  }

  const box = panel.querySelector('.demo-clip-list')
  const chosen = panel.querySelector('[data-sel="true"]')
  if (chosen) {
    // The field keeps the focus, so the selected row has to be scrolled into
    // view by hand. Deliberately not scrollIntoView(): this list sits inside a
    // window that is itself inside a scrolling page, and "nearest" is entitled
    // to move any ancestor that can scroll — including the page under the
    // overlay, which the visitor did not ask to move.
    if (chosen.offsetTop < box.scrollTop) box.scrollTop = chosen.offsetTop
    const bottom = chosen.offsetTop + chosen.offsetHeight
    if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight
  }
  const field = panel.querySelector('.demo-clip-search')
  if (chosen) field.setAttribute('aria-activedescendant', chosen.id)
  else field.removeAttribute('aria-activedescendant')
}

/* ── opening and closing ──────────────────────────────────────────────────── */

/**
 * Summon the overlay. Idempotent: a second press while it is up is a no-op
 * rather than a second panel.
 *
 * Query, selection and tab are reset here and nowhere else, which is
 * `applyOpen` at Spotlight.tsx:285 — the window always comes back at the top of
 * the newest clips rather than wherever it was left.
 */
export function openClipboard() {
  if (wrap) return
  state.clipQuery = ''
  tab = 'history'
  sel = 0
  flash = ''
  clearTimeout(flashTimer)

  panel = el('div', {
    className: 'demo-clippanel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Clipboard manager',
    onkeydown: onKey,
  })
  wrap = el('div', { className: 'demo-clipwrap' }, panel)
  // Clicking the dark part closes, as it does for every modal. mousedown rather
  // than click, and prevented: a press on the backdrop would otherwise take
  // focus off the field before the close runs, and `closeClipboard` would be
  // handing focus back from <body>.
  wrap.addEventListener('mousedown', (e) => {
    if (panel.contains(e.target)) return
    e.preventDefault()
    closeClipboard()
  })
  document.getElementById('demo-root').append(wrap)
  document.getElementById('demo-clip-open')?.setAttribute('aria-expanded', 'true')

  draw()
  panel.querySelector('.demo-clip-search').focus()

  // The panel centres itself in the *window*, and on a phone that window is
  // taller than the screen it is being read on — so it can open below the fold,
  // or behind the site's sticky header, depending on where the page happens to
  // be scrolled. Measured at 375px: an 864px window in an 812px viewport, and
  // the panel's search field opened underneath the nav.
  //
  // The header is why the test is not simply `top < 0`. It is sticky and 67px
  // tall (style.css:137), so the first 67 pixels of the viewport are not a
  // place anything can be seen — "on screen" and "not covered" are two
  // different questions and this is the one worth asking.
  //
  // Only when it does not already fit, so a press on a window that is fully in
  // view never moves the page. Instant, not `auto`: `auto` inherits
  // /style.css's `scroll-behavior:smooth` and would slide the page while the
  // panel is still popping, which is two motions for one press.
  const header = document.querySelector('nav[aria-label="Main"]')
  const ceiling = header ? header.getBoundingClientRect().bottom : 0
  const box = panel.getBoundingClientRect()
  if (box.top < ceiling || box.bottom > window.innerHeight) {
    panel.scrollIntoView({ block: 'center', behavior: 'instant' })
  }
}

/** Dismiss it, and give the focus back to the control that summoned it. */
export function closeClipboard() {
  if (!wrap) return
  clearTimeout(flashTimer)
  flash = ''
  wrap.remove()
  wrap = null
  panel = null
  const opener = document.getElementById('demo-clip-open')
  opener?.setAttribute('aria-expanded', 'false')
  // Focus was inside the thing that has just been removed, so something has to
  // catch it or it falls to <body> and a keyboard user is returned to the top
  // of the document — the same rule the tab bar's × keeps in demo.js.
  opener?.focus()
}

/**
 * The two hotkeys, as a document-level handler demo.js wires up.
 *
 * A web page has no business claiming a key globally, so both are gated on the
 * demo *having focus* — `#demo-root` containing the active element, which is
 * true once the visitor has touched any control in the window and false while
 * they are reading the page around it. Hovering is not enough: `/` is a
 * quick-find key in more than one browser, and swallowing it from a visitor who
 * is not in the app would be exactly the kind of hijack this gate exists to
 * prevent.
 *
 * `/` additionally stands down inside anything editable, where it is a
 * character someone is typing. Cmd/Ctrl+Shift+V does not: it is the app's own
 * clipboard hotkey (Shift+Alt+V there, and the browser will not give a page
 * Alt+V), and a modifier chord pressed inside the demo's editor is being
 * pressed at the demo.
 */
export function clipboardHotkey(e) {
  if (wrap) return // the panel owns the keyboard while it is up
  // The key tests come first because this listener is on `document` and runs on
  // every keystroke anywhere on the page. Answering "not one of my two" from
  // the event itself keeps the common case free of DOM work.
  const target = e.target
  const editing = target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '')
  const combo = (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')
  const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !editing
  if (!combo && !slash) return
  const root = document.getElementById('demo-root')
  if (!root || !root.contains(document.activeElement)) return
  e.preventDefault()
  openClipboard()
}
