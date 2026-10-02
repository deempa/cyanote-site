/**
 * The demo sandbox's DOM primitives: element building, lucide glyphs, and the
 * inline-markup allowlist.
 *
 * A leaf module — it imports nothing, and every view module can import it
 * without thinking about order. It holds the two things every view needs and
 * the one thing no view may be trusted to reimplement: the sanitiser.
 *
 * Nothing here persists and nothing here fetches. See demo.js for the render
 * loop and the state, demo-logic.js for the arithmetic.
 */

/**
 * Attributes where `false` is a value rather than an absence.
 *
 * Everywhere else in this demo a `false` means "leave it off" — `data-today:
 * isToday` and `aria-current: sel && 'date'` are written all over the views,
 * and writing `data-today="false"` would make the CSS match it. These three are
 * the HTML spec's tri-state attributes: absent means "inherit the default",
 * which for `spellcheck` is *on*. Dropping `spellcheck: false` therefore does
 * the opposite of what the call site asked for, and it has cost this codebase
 * two bugs — a search box and then the note editor, both underlining the
 * visitor's own typing in red. So they are written rather than skipped, and no
 * call site has to remember the trap.
 *
 * Compared against the lowercased key so that both `contentEditable` (the
 * property spelling) and `contenteditable` (the attribute spelling) land here.
 */
const FALSE_IS_A_VALUE = new Set(['spellcheck', 'contenteditable', 'draggable'])

/**
 * Build an element. `attrs` sets properties when the key exists on the node
 * (so `className`, `onclick`, `value` all work) and attributes otherwise (so
 * `data-view`, `aria-current`, `role` work too).
 *
 * `null`/`undefined` values are skipped, and so is `false` — except for the
 * tri-state attributes above, where the browser's default is the thing the
 * caller is trying to turn off.
 */
export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue
    if (v === false && !FALSE_IS_A_VALUE.has(k.toLowerCase())) continue
    if (k in n) n[k] = v
    else n.setAttribute(k, v)
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue
    n.append(typeof c === 'string' || typeof c === 'number' ? String(c) : c)
  }
  return n
}

/**
 * A one-path lucide glyph. Built with createElementNS rather than `el()`:
 * `document.createElement('svg')` makes an *HTML* element named svg, which
 * lays out as an unknown inline box and draws nothing at all.
 *
 * The stroke, fill, cap and width come from the single `.demo-window svg` rule
 * in demo.css, so a glyph here is a path and a viewBox and no more.
 */
export function glyph(d) {
  const NS = 'http://www.w3.org/2000/svg'
  const s = document.createElementNS(NS, 'svg')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS(NS, 'path')
  p.setAttribute('d', d)
  s.append(p)
  return s
}

/* ── the inline-markup allowlist ──────────────────────────────────────────
   This is the one part of the demo that has to be right rather than merely
   convincing, which is why it lives in the leaf module every view imports
   instead of in whichever view happened to need it first. */

/**
 * The only markup a block body may contain: bold and italic, and nothing else.
 *
 * The toolbar invites the visitor to bold a word, so the bold has to survive
 * switching notes — but a contenteditable is an open door. A paste can carry
 * an `<img onerror=...>`, a `<script>`, a styled `<span>`, a whole table, and
 * writing any of that back into the page would run it. Nothing here persists
 * and nothing is shared, so the only person a stray handler could reach is the
 * visitor themselves; that is still not a reason to ship a page that executes
 * pasted script. So: keep these four elements, strip every attribute off them
 * (there is no safe attribute on a `<b>`), and unwrap everything else down to
 * its text. A regex cannot do this correctly; a walk over the parsed nodes can.
 */
const INLINE_OK = new Set(['B', 'STRONG', 'I', 'EM'])

/**
 * Elements whose *text* is source, not prose.
 *
 * Everything else is unwrapped — a `<div>` or a `<td>` is a box around words
 * worth keeping. These are not: unwrapping a `<script>` cannot execute
 * anything (the text never becomes a script element again) but it does paste
 * the program's source into the note as a sentence, and unwrapping a `<style>`
 * pastes a stylesheet. Copying a paragraph out of a real web page routinely
 * drags one of these along, so they are dropped whole.
 */
const DROP_WHOLE = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'TITLE'])

/** `node`'s children, rebuilt as a fragment containing only allowlisted markup. */
function sanitiseInline(node) {
  const out = document.createDocumentFragment()
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.append(child.data)
    } else if (child.nodeType !== Node.ELEMENT_NODE) {
      continue // comments, processing instructions: not content
    } else if (DROP_WHOLE.has(child.tagName)) {
      continue // source, not content
    } else if (INLINE_OK.has(child.tagName)) {
      // A fresh element, never the original: cloning would bring the
      // attributes along, and stripping them afterwards is the kind of
      // "remove the bad ones" list that is only ever as good as its author.
      const keep = document.createElement(child.tagName.toLowerCase())
      keep.append(sanitiseInline(child))
      out.append(keep)
    } else {
      out.append(sanitiseInline(child)) // unwrap: keep the words, drop the tag
    }
  }
  return out
}

/** An html string, parsed inertly and reduced to the allowlist. */
export function inlineFragment(html) {
  // A <template> parses without fetching or running anything — its content
  // lives in an inert document, so an `<img onerror>` in the string never
  // loads and never fires. Parse there, sanitise, and only then let it near
  // the page. The allowlist runs on the way in as well as on the way out, so
  // it holds no matter where a block's `html` came from — the seed included.
  const t = document.createElement('template')
  t.innerHTML = html
  return sanitiseInline(t.content)
}

/** `node`'s body as an allowlisted html string. */
export function inlineHtml(node) {
  const holder = document.createElement('div')
  holder.append(sanitiseInline(node))
  return holder.innerHTML
}
