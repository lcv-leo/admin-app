/**
 * SearchReplace.tsx — In-editor Search & Replace panel with match highlighting
 * Features: Ctrl+H toggle, prev/next navigation, single or bulk replace,
 * ProseMirror Decoration-based highlighting (no external deps).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { X, ChevronUp, ChevronDown } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from 'prosemirror-model'

// -------------- ProseMirror plugin for search decorations ----------------

interface DecorationPluginState {
  decorations: DecorationSet
  term: string
  currentIndex: number
}

export const searchHighlightKey = new PluginKey<DecorationPluginState>('searchHighlight')

interface SearchState {
  term: string
  currentIndex: number
}

let globalSearchState: SearchState = { term: '', currentIndex: 0 }

function findAllMatches(doc: ProseMirrorNode, term: string): { from: number; to: number }[] {
  if (!term) return []
  const results: { from: number; to: number }[] = []
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, 'gi')
  doc.descendants((node, pos) => {
    if (!node.isText) return
    const text = node.text!
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      results.push({ from: pos + m.index, to: pos + m.index + m[0].length })
    }
  })
  return results
}

export const SearchHighlightPlugin = new Plugin({
  key: searchHighlightKey,
  state: {
    init(_config, state) {
      if (!globalSearchState.term) {
        return { decorations: DecorationSet.empty, term: '', currentIndex: 0 }
      }
      const matches = findAllMatches(state.doc, globalSearchState.term)
      const decos = matches.map((m, i) =>
        Decoration.inline(m.from, m.to, {
          class: i === globalSearchState.currentIndex
            ? 'search-current-highlight'
            : 'search-highlight',
        })
      )
      return {
        decorations: DecorationSet.create(state.doc, decos),
        term: globalSearchState.term,
        currentIndex: globalSearchState.currentIndex,
      }
    },
    apply(tr, oldPluginState: DecorationPluginState, _oldState, newState) {
      if (!globalSearchState.term) {
        return { decorations: DecorationSet.empty, term: '', currentIndex: 0 }
      }

      if (!tr.docChanged && oldPluginState.term === globalSearchState.term && oldPluginState.currentIndex === globalSearchState.currentIndex) {
        return oldPluginState
      }

      const matches = findAllMatches(newState.doc, globalSearchState.term)
      const decos = matches.map((m, i) =>
        Decoration.inline(m.from, m.to, {
          class: i === globalSearchState.currentIndex
            ? 'search-current-highlight'
            : 'search-highlight',
        })
      )
      return {
        decorations: DecorationSet.create(newState.doc, decos),
        term: globalSearchState.term,
        currentIndex: globalSearchState.currentIndex,
      }
    },
  },
  props: {
    decorations(state) {
      const pluginState = this.getState(state)
      return pluginState?.decorations ?? DecorationSet.empty
    },
  },
})

/**
 * SearchReplace TipTap Extension — registers highlight plugin and Find/Replace shortcuts.
 */
export const SearchReplaceExtension = Extension.create({
  name: 'searchReplace',

  addProseMirrorPlugins() {
    return [SearchHighlightPlugin]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-f': () => {
        const ownerDoc = this.editor.view.dom.ownerDocument
        ownerDoc.dispatchEvent(new CustomEvent('tiptap:search-toggle', { bubbles: true }))
        return true
      },
      'Mod-h': () => {
        const ownerDoc = this.editor.view.dom.ownerDocument
        ownerDoc.dispatchEvent(new CustomEvent('tiptap:search-toggle', { bubbles: true }))
        return true
      },
    }
  },
})

// -------------- React panel component ----------------

interface SearchReplacePanelProps {
  editor: Editor | null
}

export function SearchReplacePanel({ editor }: SearchReplacePanelProps) {
  const [visible, setVisible] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Listen for Ctrl+H toggle event from extension
  useEffect(() => {
    const ownerDoc = editor?.view?.dom?.ownerDocument
    if (!ownerDoc) return
    const toggle = () => {
      setVisible(v => {
        const next = !v
        if (next) setTimeout(() => searchInputRef.current?.focus(), 50)
        else {
          // Clear search decorations when closing
          globalSearchState = { term: '', currentIndex: 0 }
          editor?.view.dispatch(editor.state.tr)
        }
        return next
      })
    }
    ownerDoc.addEventListener('tiptap:search-toggle', toggle)
    return () => ownerDoc.removeEventListener('tiptap:search-toggle', toggle)
  }, [editor])

  // Recompute match list whenever searchTerm or doc changes
  const matches = useMemo(() => {
    if (!editor || !searchTerm) return []
    return findAllMatches(editor.state.doc, searchTerm)
  }, [editor, searchTerm, editor?.state.doc]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update global state + trigger re-decoration on every change
  useEffect(() => {
    if (!editor) return
    const safeIndex = matches.length > 0 ? Math.min(currentIndex, matches.length - 1) : 0
    globalSearchState = { term: searchTerm, currentIndex: safeIndex }
    editor.view.dispatch(editor.state.tr.setMeta(searchHighlightKey, {}))
  }, [searchTerm, currentIndex, matches.length, editor])

  // Scroll current match into view
  const scrollToMatch = useCallback((index: number) => {
    if (!editor || matches.length === 0) return
    const match = matches[index]
    if (!match) return
    try {
      const tr = editor.state.tr
        .setSelection(TextSelection.create(editor.state.doc, match.from, match.to))
        .scrollIntoView()
      editor.view.dispatch(tr)
    } catch { /* ignore */ }
  }, [editor, matches])

  const goNext = () => {
    if (matches.length === 0) return
    const next = (currentIndex + 1) % matches.length
    setCurrentIndex(next)
    scrollToMatch(next)
  }

  const goPrev = () => {
    if (matches.length === 0) return
    const prev = (currentIndex - 1 + matches.length) % matches.length
    setCurrentIndex(prev)
    scrollToMatch(prev)
  }

  const replaceCurrent = () => {
    if (!editor || matches.length === 0) return
    const safeIndex = Math.min(currentIndex, matches.length - 1)
    const match = matches[safeIndex]
    editor.chain()
      .focus()
      .deleteRange({ from: match.from, to: match.to })
      .insertContentAt(match.from, replaceTerm)
      .run()
  }

  const replaceAll = () => {
    if (!editor || matches.length === 0 || !searchTerm) return
    const tr = editor.state.tr
    let offset = 0
    matches.forEach((m) => {
      const from = m.from + offset
      const to = m.to + offset
      tr.replaceWith(from, to, editor.state.schema.text(replaceTerm))
      offset += replaceTerm.length - (m.to - m.from)
    })
    editor.view.dispatch(tr)
    setCurrentIndex(0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setVisible(false)
      globalSearchState = { term: '', currentIndex: 0 }
      editor?.view.dispatch(editor.state.tr)
      editor?.commands.focus()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      goNext()
    }
  }

  if (!visible) return null

  const matchLabel = matches.length > 0
    ? `${Math.min(currentIndex + 1, matches.length)} de ${matches.length}`
    : searchTerm
      ? '0 resultados'
      : ''

  return (
    <div className="search-replace-panel" role="dialog" aria-label="Localizar e substituir">
      <div className="search-replace-header">
        <span className="search-replace-title">Localizar e substituir</span>
        <button
          type="button"
          className="search-replace-close"
          onClick={() => {
            setVisible(false)
            globalSearchState = { term: '', currentIndex: 0 }
            editor?.view.dispatch(editor?.state.tr)
          }}
          title="Fechar (Esc)"
          aria-label="Fechar"
        >
          <X size={14} />
        </button>
      </div>

      <div className="search-replace-row">
        <input
          ref={searchInputRef}
          type="search"
          className="search-replace-input"
          placeholder="Localizar…"
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setCurrentIndex(0) }}
          onKeyDown={handleKeyDown}
          aria-label="Texto a localizar"
        />
        <span className="search-replace-count" aria-live="polite" aria-atomic="true">
          {matchLabel}
        </span>
        <button type="button" onClick={goPrev} disabled={matches.length === 0} title="Resultado anterior" aria-label="Resultado anterior">
          <ChevronUp size={14} />
        </button>
        <button type="button" onClick={goNext} disabled={matches.length === 0} title="Próximo resultado" aria-label="Próximo resultado">
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="search-replace-row">
        <input
          type="text"
          className="search-replace-input"
          placeholder="Substituir por…"
          value={replaceTerm}
          onChange={e => setReplaceTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Texto de substituição"
        />
        <button type="button" onClick={replaceCurrent} disabled={matches.length === 0} className="search-replace-btn" title="Substituir">
          Substituir
        </button>
        <button type="button" onClick={replaceAll} disabled={matches.length === 0} className="search-replace-btn" title="Substituir todos">
          Tudo
        </button>
      </div>
    </div>
  )
}
