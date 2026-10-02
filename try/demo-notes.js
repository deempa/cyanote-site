/**
 * The Notes view: the sheet, the live editor, the formatting toolbar, and the
 * walk that turns edited markup back into blocks.
 *
 * Owns everything inside the pane when `state.view === 'notes'` and nothing
 * outside it. The breadcrumb, the document tab and the status bar belong to
 * demo.js; this module signals them by letting the editor's `input` event
 * bubble, which is the one thing it is already doing anyway.
 *
 * ── the module cycle, for whoever writes demo-today.js next ────────────────
 * demo.js imports this module for `notesView`, and this module imports
 * `state` and `openNote` back from demo.js. ES modules resolve that, but only
 * under one rule: **a view module must not read an imported binding at module
 * top level.** By the time any function here runs, demo.js's body has finished
 * and `state` exists; a `const foo = state.notes` at the top of this file
 * would run first and throw. Declare, don't dereference.
 */
import { el, inlineFragment, inlineHtml } from './demo-dom.js'
import { state, openNote } from './demo.js'

/** A block's body: its allowlisted markup when it has any, its plain text otherwise. */
function fill(node, b) {
  node.append(b.html ? inlineFragment(b.html) : (b.text ?? ''))
  return node
}

/** One block as one direct child of the editor. Unknown types render as `p`. */
function blockEl(b) {
  if (b.type === 'todo') {
    return el('div', { className: 'demo-todo' },
      // contenteditable="false" so the box is a control rather than something
      // a backspace can half-delete.
      el('input', { type: 'checkbox', checked: b.done, contentEditable: 'false' }),
      fill(el('span', { className: 'demo-todo-text' }), b))
  }
  const tag = b.type === 'h1' || b.type === 'h2' || b.type === 'li' ? b.type : 'p'
  return fill(el(tag), b)
}

/**
 * Walk the edited DOM back into the block shape.
 *
 * Total by construction: every element child becomes exactly one block,
 * anything unrecognised degrades to a paragraph, and an emptied editor yields
 * `[]` rather than throwing. Real typing hands a contenteditable whatever the
 * browser's own editing engine feels like inserting — a bare `<div>`, a
 * `<span>`, a `<br>` — so "anything else is a paragraph" is the only rule
 * that survives contact with it.
 *
 * Two fields, not one. `text` is `textContent`, with no markup in it, and is
 * what the title sync and the word count read. `html` is the same body reduced
 * to the allowlist, and is what lets a bolded word still be bold after a trip
 * to another note. The two must always describe the same words: demo-seed.js
 * carries both for the one seeded block that ships bold, and demo.test.mjs
 * asserts they stay in step.
 */
export function readBlocks(ed) {
  const out = []
  for (const node of ed.children) {
    if (node.classList.contains('demo-todo')) {
      const body = node.querySelector('.demo-todo-text') ?? node
      out.push({
        type: 'todo',
        text: body.textContent,
        html: inlineHtml(body),
        done: node.querySelector('input')?.checked === true,
      })
      continue
    }
    const tag = node.tagName.toLowerCase()
    out.push({
      type: tag === 'h1' || tag === 'h2' || tag === 'li' ? tag : 'p',
      text: node.textContent,
      html: inlineHtml(node),
    })
  }
  return out
}

/**
 * The live editor, kept across renders.
 *
 * Typing must not re-render the editor. `render()` replaces the pane
 * wholesale, and replacing a contenteditable while someone is typing in it
 * destroys the caret — every keystroke would jump the cursor back to the
 * start of the note. So the editor writes back to state on `input` and is
 * *not* redrawn; it is rebuilt only when a different note is selected, and
 * `data-note` is how the next render knows which.
 */
let editor = null

/** Forget the cached editor. Reset calls this; nothing else should need to. */
export function dropEditor() { editor = null }

function buildEditor(note) {
  const ed = el('div', {
    className: 'demo-editor',
    contentEditable: 'true',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': 'Note body',
    // A contenteditable spell-checks by default, which would put red squiggles
    // under every word of the seeded note on the page's opening surface. `el()`
    // writes this despite the falsy value — see FALSE_IS_A_VALUE in demo-dom.js.
    spellcheck: false,
  }, note.blocks.map(blockEl))
  ed.dataset.note = note.id
  // Paste is the other door markup comes through, and it opens before any
  // write-back can filter anything: left alone, the browser inserts the
  // clipboard's own nodes — handlers, styles, tables and all — and an
  // `<img onerror>` among them fires the moment it lands. Sanitising only on
  // the way back out would stop the second execution, not the first. So take
  // the paste over: reduce the clipboard's html to the allowlist and insert
  // the sanitised *nodes* into the selection.
  //
  // Not `execCommand('insertHTML')`, which is what this used to do. The editor
  // carries a font-size of its own, and Chrome's insertHTML answers that by
  // wrapping everything it inserts in `<span style="font-size:…">` to preserve
  // the appearance of the source — so the one path whose whole purpose is to
  // guarantee that only b/strong/i/em reach the page was itself adding
  // attributed spans, a step behind the sanitiser it had just run. Writing the
  // fragment in through the Range is one line longer and has no second author.
  ed.addEventListener('paste', (e) => {
    if (!e.clipboardData) return
    e.preventDefault()
    const sel = getSelection()
    if (!sel?.rangeCount) return
    const html = e.clipboardData.getData('text/html')
    const frag = html
      ? inlineFragment(html)
      : document.createTextNode(e.clipboardData.getData('text/plain'))
    const tail = frag.lastChild ?? frag // a bare text node has no lastChild
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(frag)
    // Leave the caret after what was pasted rather than in front of it.
    range.setStartAfter(tail)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    // A scripted DOM change fires no `input` of its own, and the write-back is
    // what keeps state and the counts honest.
    ed.dispatchEvent(new Event('input', { bubbles: true }))
  })
  ed.addEventListener('input', () => {
    const n = state.notes.find((x) => x.id === ed.dataset.note)
    if (!n) return
    n.blocks = readBlocks(ed)
    n.updated_at = Date.now()
    // Keep the sidebar's title honest when the heading is edited — but never
    // let a half-deleted heading blank the row out.
    const h1 = n.blocks.find((b) => b.type === 'h1')
    if (h1 && h1.text.trim()) n.title = h1.text.trim()
    // Deliberately no render() here — see the comment on `editor` above. The
    // shell's three bits of text that have to keep up (breadcrumb, tab title,
    // word count) are demo.js's, and it updates them from this same event on
    // the way past: this listener is on the target, its one is on the pane, so
    // state is always written before the shell reads it.
  })
  return ed
}

/**
 * Bold and italic, via `document.execCommand`.
 *
 * It is deprecated, and it is also the only one-line way to apply formatting
 * to a selection without writing a selection model of our own. For a mock
 * whose job is to feel like the app for ninety seconds, that trade is right;
 * this is a decision, not an oversight. The `mousedown` preventDefault is the
 * load-bearing half — without it the click moves focus out of the editor and
 * the selection execCommand needs is gone before it runs.
 */
function toolbar(ed) {
  const btn = (cmd, label, cls) => el('button', {
    type: 'button', className: `demo-fmt ${cls}`, 'aria-label': label, title: label,
    onmousedown: (e) => e.preventDefault(),
    onclick: () => {
      ed.focus()
      document.execCommand(cmd)
      // execCommand fires `input` itself in current browsers; dispatching one
      // anyway costs a re-read of the blocks and removes the dependency.
      ed.dispatchEvent(new Event('input', { bubbles: true }))
    },
  }, label[0])
  return el('div', { className: 'demo-toolbar' },
    // Not "…— nothing is saved": the title bar's pill already says that, and
    // saying it twice in one window reads as nerves rather than reassurance.
    el('span', { className: 'demo-toolbar-hint' }, 'Click in and type — this note is live'),
    btn('bold', 'Bold', 'demo-fmt-b'),
    btn('italic', 'Italic', 'demo-fmt-i'))
}

/**
 * The Notes view. Zero arguments, returns one element — the contract every
 * key in demo.js's `views` table keeps.
 *
 * The pane does not scroll, so this view brings its own scroller: a flex
 * column with the toolbar pinned and `.demo-scroll` taking the rest. A
 * formatting control that scrolls off the top is one you have to go hunting
 * for, and a pane that scrolls would take the status bar with it.
 */
export function notesView() {
  const note = openNote()
  if (!note || !state.noteOpen) return closedView(note)
  if (!editor || editor.dataset.note !== note.id) editor = buildEditor(note)
  return el('div', { className: 'demo-notesview' },
    toolbar(editor),
    el('div', { className: 'demo-scroll' },
      el('div', { className: 'demo-sheet' },
        el('p', { className: 'demo-sheet-icon', 'aria-hidden': 'true' }, note.icon),
        editor)))
}

/** What the pane shows once the document tab is closed. */
function closedView(note) {
  return el('div', { className: 'demo-empty' },
    el('p', { className: 'demo-empty-title' }, 'No note open'),
    el('p', { className: 'demo-empty-body' },
      note
        ? 'Nothing was deleted — pick a note from the list to open it again.'
        : 'Press Reset to bring the demo’s notes back.'))
}
