import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight,
  Bold, CheckSquare, Code, FilePlus2,
  Heading1, Heading2, Heading3, Highlighter, Italic, List, ListOrdered,
  Loader2, Minus, Palette, Quote, Save, Strikethrough, Type,
  Underline as UnderlineIcon, WrapText, X,
  Link as LinkIcon, Unlink, Indent, Outdent,
  Subscript as SubIcon, Superscript as SuperIcon,
  Table as TableIcon, LayoutGrid, ListChecks,
  Upload, Image as ImageIcon, ZoomIn, ZoomOut, MessageSquare,
  Sparkles, MousePointer2, Wand2, Send, Download,
  Undo2, Redo2
} from 'lucide-react'
import { Extension, mergeAttributes } from '@tiptap/core'
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeSelection, Plugin, PluginKey } from 'prosemirror-state'
import StarterKit from '@tiptap/starter-kit'
// Underline is now included in StarterKit v3 — no explicit import needed
import { Highlight } from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import LinkExtension from '@tiptap/extension-link'
import { Placeholder } from '@tiptap/extension-placeholder'
import { CharacterCount } from '@tiptap/extension-character-count'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { FontFamily } from '@tiptap/extension-font-family'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { Typography } from '@tiptap/extension-typography'
import { Dropcursor } from '@tiptap/extension-dropcursor'
import { Gapcursor } from '@tiptap/extension-gapcursor'
import Focus from '@tiptap/extension-focus'
import Image from '@tiptap/extension-image'
import Mention from '@tiptap/extension-mention'
import YoutubeExtension, { getEmbedUrlFromYoutubeUrl } from '@tiptap/extension-youtube'
import { Markdown } from 'tiptap-markdown'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { FigureImageNode } from './editor/extensions'
import { SlashCommands } from './editor/SlashCommands'
import { SearchReplaceExtension, SearchReplacePanel } from './editor/SearchReplace'

const lowlight = createLowlight(common)
const EDITORIAL_MENTION_BASE_ITEMS = [
  'Leonardo Cardozo Vargas',
  'MainSite',
  'LCV',
  'SEO',
  'CTA',
  'Gemini',
  'Cloudflare',
]

const createMentionSuggestion = (rawItems: string[]) => ({
  char: '@',
  items: ({ query }: { query: string }) => {
    const normalizedQuery = query.trim().toLowerCase()
    return rawItems
      .filter((item) => item.toLowerCase().includes(normalizedQuery))
      .slice(0, 6)
      .map((item) => ({ id: item, label: item }))
  },
  render: () => {
    let popup: HTMLDivElement | null = null
    let command: ((item: { id: string; label: string }) => void) | null = null
    let itemsState: Array<{ id: string; label: string }> = []
    let selectedIndex = 0

    const mountPopup = (editorElement: HTMLElement) => {
      const ownerDoc = editorElement.ownerDocument
      popup = ownerDoc.createElement('div')
      popup.className = 'tiptap-mention-menu'
      ownerDoc.body.appendChild(popup)
    }

    const updatePosition = (props: { clientRect?: (() => DOMRect | null) | null; editor: { view: { dom: HTMLElement } } }) => {
      const rect = props.clientRect?.()
      if (!rect || !popup) return
      const ownerDoc = props.editor.view.dom.ownerDocument
      const popupWin = ownerDoc.defaultView || window
      const maxLeft = Math.max(8, popupWin.innerWidth - 260)
      const top = Math.min(rect.bottom + 8, popupWin.innerHeight - 120)
      const left = Math.min(rect.left, maxLeft)
      popup.style.top = `${top}px`
      popup.style.left = `${Math.max(8, left)}px`
    }

    const renderList = () => {
      if (!popup) return
      popup.innerHTML = ''

      if (!itemsState.length) {
        const emptyState = popup.ownerDocument.createElement('div')
        emptyState.className = 'tiptap-mention-menu__empty'
        emptyState.textContent = 'Nenhuma menção encontrada'
        popup.appendChild(emptyState)
        return
      }

      itemsState.forEach((item, index) => {
        const button = popup!.ownerDocument.createElement('button')
        button.type = 'button'
        button.className = `tiptap-mention-menu__item${index === selectedIndex ? ' is-selected' : ''}`
        button.textContent = `@${item.label}`
        button.onmousedown = (event) => {
          event.preventDefault()
          command?.(item)
        }
        popup!.appendChild(button)
      })
    }

    return {
      onStart: (props: { items: Array<{ id: string; label: string }>; command: (item: { id: string; label: string }) => void; editor: { view: { dom: HTMLElement } }; clientRect?: (() => DOMRect | null) | null }) => {
        command = props.command
        itemsState = props.items
        selectedIndex = 0
        mountPopup(props.editor.view.dom)
        renderList()
        updatePosition(props)
      },
      onUpdate: (props: { items: Array<{ id: string; label: string }>; command: (item: { id: string; label: string }) => void; editor: { view: { dom: HTMLElement } }; clientRect?: (() => DOMRect | null) | null }) => {
        command = props.command
        itemsState = props.items
        if (selectedIndex >= itemsState.length) selectedIndex = 0
        renderList()
        updatePosition(props)
      },
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (!itemsState.length) {
          return event.key === 'Escape'
        }
        if (event.key === 'ArrowDown') {
          selectedIndex = (selectedIndex + 1) % itemsState.length
          renderList()
          return true
        }
        if (event.key === 'ArrowUp') {
          selectedIndex = (selectedIndex + itemsState.length - 1) % itemsState.length
          renderList()
          return true
        }
        if (event.key === 'Enter') {
          command?.(itemsState[selectedIndex])
          return true
        }
        if (event.key === 'Escape') {
          popup?.remove()
          popup = null
          return true
        }
        return false
      },
      onExit: () => {
        popup?.remove()
        popup = null
      },
    }
  },
})

// ── Media utilities ──────────────────────────────────────────

const formatImageUrl = (url: string): string => {
  if (!url) return ''
  const driveRegex = /(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/
  const match = url.match(driveRegex)
  if (match && match[1]) return `https://drive.google.com/uc?export=view&id=${match[1]}`
  return url
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

// ── Custom Node Views Components ──────────────────────────────

const ResizableMediaHandle = ({ onStartResize, tone = 'neutral' }: { onStartResize: (e: React.MouseEvent | React.TouchEvent) => void, tone?: string }) => (
  <button
    type="button"
    className={`media-resize-handle tone-${tone}`}
    contentEditable={false}
    onMouseDown={onStartResize}
    onPointerDown={onStartResize}
    title="Arraste para redimensionar"
    aria-label="Arraste para redimensionar"
  />
)

const SelectMediaButton = ({ onSelect }: { onSelect: () => void }) => (
  <button
    type="button"
    className="media-select-btn"
    contentEditable={false}
    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(); }}
    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(); }}
    title="Selecionar mídia"
    aria-label="Selecionar mídia"
  >
    <MousePointer2 size={13} className="media-select-btn-icon" />
    <span className="media-select-btn-label">Selecionar</span>
  </button>
)

const IMAGE_SNAPS = [
  { label: '25%', v: '25%' },
  { label: '50%', v: '50%' },
  { label: '75%', v: '75%' },
  { label: '100%', v: '100%' },
]

const MediaSnapBar = ({ onSnap }: { onSnap: (v: string) => void }) => (
  <div className="media-snap-bar" contentEditable={false} onMouseDown={e => e.preventDefault()}>
    {IMAGE_SNAPS.map(({ label, v }) => (
      <button key={v} type="button" onClick={() => onSnap(v)} title={v}>{label}</button>
    ))}
  </div>
)

const VIDEO_SNAPS = [
  { label: '480p', w: 853, h: 480 },
  { label: '720p', w: 1280, h: 720 },
  { label: '840px', w: 840, h: 472 },
]

const YoutubeSnapBar = ({ onSnap }: { onSnap: (w: number, h: number) => void }) => (
  <div className="media-snap-bar" contentEditable={false} onMouseDown={e => e.preventDefault()}>
    {VIDEO_SNAPS.map(({ label, w, h }) => (
      <button key={label} type="button" onClick={() => onSnap(w, h)} title={`${w}×${h}`}>{label}</button>
    ))}
  </div>
)

const ResizableImageNodeView = ({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) => {
  const startXRef = useRef(0)
  const startWidthRef = useRef(100)
  const imageRef = useRef<HTMLImageElement>(null)
  const [localTone, setLocalTone] = useState('neutral')

  useEffect(() => {
    const img = imageRef.current
    if (!img) return

    const analyzeTone = () => {
      try {
        const sample = 24
        const canvas = document.createElement('canvas')
        canvas.width = sample
        canvas.height = sample
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          setLocalTone('neutral')
          return
        }

        ctx.drawImage(img, 0, 0, sample, sample)
        const { data } = ctx.getImageData(0, 0, sample, sample)
        let total = 0
        let count = 0

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]
          if (a < 32) continue
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          total += (0.299 * r) + (0.587 * g) + (0.114 * b)
          count += 1
        }

        if (!count) {
          setLocalTone('neutral')
          return
        }

        const luma = (total / count) / 255
        setLocalTone(luma >= 0.56 ? 'light' : 'dark')
      } catch {
        setLocalTone('neutral')
      }
    }

    if (img.complete) analyzeTone()
    img.addEventListener('load', analyzeTone)
    return () => img.removeEventListener('load', analyzeTone)
  }, [node.attrs.src])

  const onStartResize = (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const point = ('touches' in event) ? event.touches[0] : (event as React.MouseEvent)
    startXRef.current = point.clientX
    startWidthRef.current = Number(String(node.attrs.width || '100').replace('%', '')) || 100

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      const p = ('touches' in moveEvent) ? moveEvent.touches[0] : (moveEvent as MouseEvent)
      const deltaX = p.clientX - startXRef.current
      const next = clamp(Math.round(startWidthRef.current + (deltaX * 0.22)), 20, 100)
      updateAttributes({ width: `${next}%` })
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onUp)
  }

  const selectCurrentNode = () => {
    const pos = getPos?.()
    if (typeof pos !== 'number') return
    const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos))
    editor.view.dispatch(tr)
    editor.commands.focus()
  }

  return (
    <NodeViewWrapper
      className={`resizable-media media-image tone-${localTone} ${selected ? 'is-selected' : ''}`}
      contentEditable={false}
      style={{ width: node.attrs.width || '100%' }}
    >
      <MediaSnapBar onSnap={(size) => updateAttributes({ width: size })} />
      <SelectMediaButton onSelect={selectCurrentNode} />
      <img ref={imageRef} src={node.attrs.src} alt={node.attrs.alt || ''} title={node.attrs.title || ''} draggable="false" />
      <ResizableMediaHandle onStartResize={onStartResize} tone={localTone} />
    </NodeViewWrapper>
  )
}

const ResizableYoutubeNodeView = ({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) => {
  const startXRef = useRef(0)
  const startWidthRef = useRef(840)
  const currentW = Number(node.attrs.width) || 840
  const currentH = Number(node.attrs.height) || Math.round((currentW * 9) / 16)

  const onStartResize = (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const point = ('touches' in event) ? event.touches[0] : (event as React.MouseEvent)
    startXRef.current = point.clientX
    startWidthRef.current = currentW

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      const p = ('touches' in moveEvent) ? moveEvent.touches[0] : (moveEvent as MouseEvent)
      const deltaX = p.clientX - startXRef.current
      const nextW = clamp(Math.round(startWidthRef.current + (deltaX * 1.2)), 320, 1200)
      const nextH = Math.round((nextW * 9) / 16)
      updateAttributes({ width: nextW, height: nextH })
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onUp)
  }

  const selectCurrentNode = () => {
    const pos = getPos?.()
    if (typeof pos !== 'number') return
    const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos))
    editor.view.dispatch(tr)
    editor.commands.focus()
  }

  // Converte watch URL para embed URL (ReactNodeViewRenderer bypassa renderHTML do TipTap)
  const embedSrc = getEmbedUrlFromYoutubeUrl({
    url: node.attrs.src,
    allowFullscreen: true,
    autoplay: false,
    nocookie: true,
  }) || node.attrs.src

  return (
    <NodeViewWrapper className={`resizable-media media-youtube ${selected ? 'is-selected' : ''}`} contentEditable={false} style={{ width: `${currentW}px`, maxWidth: '100%' }}>
      <YoutubeSnapBar onSnap={(w, h) => updateAttributes({ width: w, height: h })} />
      <SelectMediaButton onSelect={selectCurrentNode} />
      <div data-youtube-video>
        <iframe
          src={embedSrc}
          width={currentW}
          height={currentH}
          title="YouTube video"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <ResizableMediaHandle onStartResize={onStartResize} tone="neutral" />
    </NodeViewWrapper>
  )
}

// ── TipTap extensions ─────────────────────────────────────────

const CustomResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        parseHTML: (element) => element.getAttribute('data-width') || element.style.width || element.getAttribute('width') || '100%',
        renderHTML: (attributes) => {
          if (!attributes.width) return {}
          const normalized = String(attributes.width).endsWith('%') ? attributes.width : `${attributes.width}`
          return {
            'data-width': normalized,
            style: `width: ${normalized}; height: auto;`,
          }
        },
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView)
  },
})

const CustomResizableYoutube = YoutubeExtension.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ResizableYoutubeNodeView)
  },
})

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] } },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize.replace(/['"]+/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFontSize: (fontSize: string) => ({ chain }: any) => chain().setMark('textStyle', { fontSize }).run(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unsetFontSize: () => ({ chain }: any) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  },
})

// TextIndent extension — stores text-indent as inline style on paragraph/heading
const TextIndent = Extension.create({
  name: 'textIndent',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        textIndent: {
          default: 0,
          parseHTML: el => {
            const v = el.style.textIndent
            if (!v) return 0
            const n = parseFloat(v)
            return isNaN(n) ? 0 : n
          },
          renderHTML: attrs => {
            if (!attrs.textIndent) return {}
            return { style: `text-indent: ${attrs.textIndent}rem` }
          },
        },
      },
    }]
  },
  addCommands() {
    const LEVELS = [0, 1.5, 2.5, 3.5]
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      increaseIndent: () => ({ tr, state, dispatch }: any) => {
        const { from, to } = state.selection
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state.doc.nodesBetween(from, to, (node: any, pos: number) => {
          if (!node.type.isTextblock) return
          const current = node.attrs.textIndent || 0
          const idx = LEVELS.findIndex(l => l >= current)
          const next = idx < LEVELS.length - 1 ? LEVELS[idx + 1] : LEVELS[LEVELS.length - 1]
          if (next !== current && dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, textIndent: next })
        })
        return true
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      decreaseIndent: () => ({ tr, state, dispatch }: any) => {
        const { from, to } = state.selection
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state.doc.nodesBetween(from, to, (node: any, pos: number) => {
          if (!node.type.isTextblock) return
          const current = node.attrs.textIndent || 0
          const idx = LEVELS.findIndex(l => l >= current)
          const next = idx > 0 ? LEVELS[idx - 1] : 0
          if (next !== current && dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, textIndent: next })
        })
        return true
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  },
})

// ── YouTube URL detection helper ─────────────────────────────
const isYoutubeUrl = (url: string): boolean =>
  /(?:youtube\.com|youtu\.be)\//i.test(url)

// ── Link extension that enforces target="_blank" on non-YouTube links ──
const autoTargetBlankPluginKey = new PluginKey('autoTargetBlank')

const AutoTargetBlankLink = LinkExtension.extend({
  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() ?? []
    return [
      ...parentPlugins,
      new Plugin({
        key: autoTargetBlankPluginKey,
        appendTransaction(_transactions, _oldState, newState) {
          const { tr, doc, schema } = newState
          const linkType = schema.marks.link
          if (!linkType) return null

          let modified = false
          doc.descendants((node, pos) => {
            if (!node.isText) return
            node.marks.forEach((mark) => {
              if (mark.type !== linkType) return
              const href = mark.attrs.href || ''
              // Skip YouTube links — they don't need target="_blank"
              if (isYoutubeUrl(href)) return
              // If target is already _blank, nothing to do
              if (mark.attrs.target === '_blank') return

              // Create a new mark with target="_blank" + secure rel
              const newMark = linkType.create({
                ...mark.attrs,
                target: '_blank',
                rel: 'noopener noreferrer',
              })
              tr.removeMark(pos, pos + node.nodeSize, mark)
              tr.addMark(pos, pos + node.nodeSize, newMark)
              modified = true
            })
          })

          return modified ? tr : null
        },
      }),
    ]
  },
})

const buildTiptapExtensions = (mentionItems: string[]) => [
  StarterKit.configure({ dropcursor: false, link: false, codeBlock: false }),
  CodeBlockLowlight.configure({ lowlight }),
  Markdown,
  Highlight,
  Subscript,
  Superscript,
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  TextIndent,
  Typography,
  Gapcursor,
  Focus.configure({ className: 'has-focus', mode: 'all' }),
  Mention.configure({
    HTMLAttributes: { class: 'editor-mention' },
    suggestion: createMentionSuggestion(mentionItems),
    renderText: ({ node, options }) => `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`,
    renderHTML: ({ node, options }) => [
      'span',
      mergeAttributes(options.HTMLAttributes, { class: 'editor-mention' }),
      `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`,
    ],
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Table.configure({ resizable: true }), TableRow, TableHeader, TableCell,
  TaskList, TaskItem.configure({ nested: true }),
  Dropcursor.configure({ color: '#4285f4', width: 2 }),
  CharacterCount,
  Placeholder.configure({ placeholder: 'Comece a escrever o conteúdo do post...' }),
  AutoTargetBlankLink.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
  CustomResizableImage.configure({ inline: false }),
  CustomResizableYoutube.configure({ inline: false, width: 840, height: 472, allowFullscreen: true, nocookie: true }),
  FigureImageNode,
  SlashCommands,
  SearchReplaceExtension,
]

// ── Prompt modal state type ───────────────────────────────────
type PromptModalState = {
  show: boolean
  title: string
  submitLabel: string
  primaryLabel: string
  placeholder: string
  value: string
  callback: ((payload: PromptModalSubmit) => void) | null
  isLink: boolean
  showLinkText: boolean
  linkText: string
  showCaption: boolean
  caption: string
  showAltText: boolean
  altText: string
  showTitleText: boolean
  titleText: string
}

type PromptModalSubmit = {
  value: string
  linkText: string
  caption: string
  altText: string
  titleText: string
}

const PROMPT_MODAL_INITIAL: PromptModalState = {
  show: false,
  title: '',
  submitLabel: 'Inserir',
  primaryLabel: 'Valor',
  placeholder: 'https://...',
  value: '',
  callback: null,
  isLink: false,
  showLinkText: false,
  linkText: '',
  showCaption: false,
  caption: '',
  showAltText: false,
  altText: '',
  showTitleText: false,
  titleText: '',
}

// ── Local save feedback (visible inside popup window) ────────
type SaveFeedback = { message: string; type: 'success' | 'error' } | null

// ── Component props ───────────────────────────────────────────
export type PostEditorProps = {
  editingPostId: number | null
  initialTitle: string
  initialAuthor: string
  initialContent: string
  savingPost: boolean
  adminActor: string
  showNotification: (msg: string, type: 'info' | 'success' | 'error') => void
  onSave: (title: string, author: string, htmlContent: string) => Promise<boolean>
  onClose: () => void
}

// ── PostEditor component ──────────────────────────────────────
export default function PostEditor({
  editingPostId, initialTitle, initialAuthor, initialContent,
  savingPost, showNotification,
  onSave, onClose,
}: PostEditorProps) {
  const [postTitle, setPostTitle] = useState(initialTitle)
  const [postAuthor, setPostAuthor] = useState(initialAuthor)
  const [promptModal, setPromptModal] = useState<PromptModalState>(PROMPT_MODAL_INITIAL)
  const [isUploading, setIsUploading] = useState(false)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [isImportingGemini, setIsImportingGemini] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>(null)
  const saveFeedbackTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // AI Freeform Command
  const [aiChatOpen, setAiChatOpen] = useState(false)
  const [aiChatInput, setAiChatInput] = useState('')
  const aiChatBtnRef = useRef<HTMLButtonElement>(null)
  const mentionItems = useMemo(() => {
    const baseItems = initialAuthor.trim()
      ? [initialAuthor.trim(), ...EDITORIAL_MENTION_BASE_ITEMS]
      : EDITORIAL_MENTION_BASE_ITEMS
    return Array.from(new Set(baseItems))
  }, [initialAuthor])
  const tiptapExtensions = useMemo(() => buildTiptapExtensions(mentionItems), [mentionItems])

  const editor = useEditor({
    extensions: tiptapExtensions,
    content: initialContent || '',
  })

  // Force re-render on transaction AND selection change for Word-like dynamic button state
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!editor) return
    const forceUpdate = () => { try { if (editor.view?.dom) setTick(t => t + 1) } catch { /* view not ready */ } }
    editor.on('transaction', forceUpdate)
    editor.on('selectionUpdate', forceUpdate)
    return () => { editor.off('transaction', forceUpdate); editor.off('selectionUpdate', forceUpdate) }
  }, [editor])

  // Sync initial content when editing a different post
  useEffect(() => {
    if (editor && initialContent) {
      editor.commands.setContent(initialContent)
    }
  }, [editor, initialContent])

  // Sync initial title
  useEffect(() => {
    setPostTitle(initialTitle)
  }, [initialTitle])

  useEffect(() => {
    setPostAuthor(initialAuthor)
  }, [initialAuthor])

  // ── AI handlers ─────────────────────────────────────────────

  const handleAIFreeform = async () => {
    if (!editor) return
    const instruction = aiChatInput.trim()
    if (!instruction) return
    const { from, to, empty } = editor.state.selection
    const text = empty ? editor.getHTML() : editor.state.doc.textBetween(from, to, ' ')
    if (!text) { showNotification('O editor está vazio.', 'error'); return }
    setIsGeneratingAI(true)
    setAiChatOpen(false)
    showNotification('Gemini está processando sua instrução...', 'info')
    try {
      const res = await fetch('/api/mainsite/ai/transform', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'freeform', text, instruction })
      })
      const data = await res.json() as { text?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Erro na geração por IA.')
      if (data.text) {
        if (empty) editor.commands.setContent(data.text)
        else editor.chain().focus().deleteSelection().insertContent(data.text).run()
      }
      showNotification('Instrução aplicada com sucesso.', 'success')
      setAiChatInput('')
    } catch (err) { showNotification(err instanceof Error ? err.message : 'Erro desconhecido na IA.', 'error') }
    finally { setIsGeneratingAI(false) }
  }

  const handleAITransform = async (action: string) => {
    if (!editor) return

    const { from, to, empty } = editor.state.selection
    if (empty) {
      showNotification("Por favor, selecione um trecho de texto no editor para aplicar a IA.", "error")
      return
    }

    const selectedText = editor.state.doc.textBetween(from, to, ' ')
    setIsGeneratingAI(true)
    showNotification("Processando transformação textual no Gemini...", "info")

    try {
      const res = await fetch(`/api/mainsite/ai/transform`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text: selectedText })
      })
      const data = await res.json() as { text?: string; error?: string }
      if (!res.ok) throw new Error(data.error || "Erro na geração por IA.")

      if (data.text) {
        editor.chain().focus().deleteSelection().insertContent(data.text).run()
      }
      showNotification("Transformação aplicada com sucesso.", "success")
    } catch (err) {
      showNotification(err instanceof Error ? err.message : "Erro desconhecido na IA.", "error")
    } finally {
      setIsGeneratingAI(false)
    }
  }

  // ── Media handler functions ─────────────────────────────────

  const insertCaptionBlock = useCallback((caption: string) => {
    const safeCaption = (caption || '').trim()
    if (!safeCaption || !editor) return
    // Resolve a posição imediatamente após o nó selecionado (imagem/vídeo)
    // para evitar que insertContent substitua o nó selecionado
    const { to } = editor.state.selection
    editor.chain().focus().insertContentAt(to, {
      type: 'paragraph',
      attrs: { textAlign: 'center' },
      content: [{ type: 'text', text: safeCaption, marks: [{ type: 'italic' }] }],
    }).run()
  }, [editor])

  const openPromptModal = useCallback((nextState: Partial<PromptModalState>) => {
    setPromptModal({
      ...PROMPT_MODAL_INITIAL,
      ...nextState,
      show: true,
    })
  }, [])

  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!editor) return
    const file = event.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    showNotification('Enviando arquivo...', 'info')
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/mainsite/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Falha na consolidação do arquivo.')
      const data = await res.json() as { url: string }
      showNotification('Upload concluído com sucesso.', 'success')
      openPromptModal({
        title: 'Finalizar inserção da imagem:',
        submitLabel: 'Inserir imagem',
        primaryLabel: 'URL',
        placeholder: data.url,
        value: data.url,
        showAltText: true,
        showTitleText: true,
        showCaption: true,
        callback: ({ value, altText, titleText, caption }) => {
          const imageUrl = formatImageUrl(value || data.url)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor.chain().focus().setImage({ src: imageUrl, alt: altText.trim(), title: titleText.trim(), width: '100%' } as any).run()
          insertCaptionBlock(caption)
        },
      })
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Erro no upload.', 'error')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [editor, showNotification, insertCaptionBlock, openPromptModal])

  const addImageUrl = useCallback(() => {
    if (!editor) return
    openPromptModal({
      title: 'URL da Imagem (Drive/Externa):',
      submitLabel: 'Inserir imagem',
      primaryLabel: 'URL da imagem',
      showCaption: true,
      showAltText: true,
      showTitleText: true,
      callback: ({ value, caption, altText, titleText }) => {
        if (!value) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.chain().focus().setImage({ src: formatImageUrl(value), alt: altText.trim(), title: titleText.trim(), width: '100%' } as any).run()
        insertCaptionBlock(caption)
      },
    })
  }, [editor, insertCaptionBlock, openPromptModal])

  const addYoutube = useCallback(() => {
    if (!editor) return
    openPromptModal({
      title: 'Código ou URL do vídeo (YouTube):',
      submitLabel: 'Inserir vídeo',
      primaryLabel: 'URL ou código',
      placeholder: 'Ex.: dQw4w9WgXcQ ou https://youtube.com/watch?v=...',
      showCaption: true,
      callback: ({ value, caption }) => {
        if (!value) return
        // Aceita código puro (sem barras nem protocolo) e converte para URL completa
        const isPlainCode = /^[\w-]+$/.test(value.trim())
        const src = isPlainCode ? `https://www.youtube.com/watch?v=${value.trim()}` : value.trim()
        editor.chain().focus().setYoutubeVideo({ src, width: 840, height: 472 }).run()
        insertCaptionBlock(caption)
      },
    })
  }, [editor, insertCaptionBlock, openPromptModal])

  const addLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href || ''
    openPromptModal({
      title: 'Inserir Link de Hipertexto:',
      submitLabel: 'Aplicar link',
      primaryLabel: 'URL',
      value: prev as string,
      isLink: true,
      showLinkText: editor.state.selection.empty,
      callback: ({ value, linkText }) => {
        const url = value.trim()
        const text = linkText.trim()
        if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
        const linkAttrs = isYoutubeUrl(url)
          ? { href: url }
          : { href: url, target: '_blank' as const, rel: 'noopener noreferrer' }
        if (editor.state.selection.empty && text) {
          editor.chain().focus().insertContent(`<a href="${url}"${isYoutubeUrl(url) ? '' : ' target="_blank" rel="noopener noreferrer"'}>${text}</a>`).run()
        } else {
          editor.chain().focus().extendMarkRange('link').setLink(linkAttrs).run()
        }
      },
    })
  }, [editor, openPromptModal])

  const adjustSelectedMediaSize = useCallback((direction: 1 | -1) => {
    if (!editor) return
    if (editor.isActive('image')) {
      const attrs = editor.getAttributes('image')
      const current = Number(String(attrs.width || '100').replace('%', '')) || 100
      const next = clamp(current + (direction * 10), 20, 100)
      editor.chain().focus().updateAttributes('image', { width: `${next}%` }).run()
      showNotification(`Imagem redimensionada para ${next}%`, 'success')
      return
    }
    if (editor.isActive('youtube')) {
      const attrs = editor.getAttributes('youtube')
      const currentW = Number(attrs.width) || 840
      const nextW = clamp(currentW + (direction * 80), 320, 1200)
      const nextH = Math.round((nextW * 9) / 16)
      editor.chain().focus().updateAttributes('youtube', { width: nextW, height: nextH }).run()
      showNotification(`Vídeo redimensionado para ${nextW}x${nextH}`, 'success')
      return
    }
    showNotification('Selecione uma imagem ou vídeo para redimensionar.', 'info')
  }, [editor, showNotification])

  const editCaption = useCallback(() => {
    if (!editor) return
    const isImg = editor.isActive('image')
    const isVid = editor.isActive('youtube')
    if (!isImg && !isVid) {
      showNotification('Selecione uma imagem ou vídeo para adicionar/editar a legenda.', 'info')
      return
    }
    const { selection, doc } = editor.state
    const nodeSize = (selection as unknown as { node?: { nodeSize: number } }).node?.nodeSize || 1
    const nodeEnd = selection.from + nodeSize
    
    let existingCaption = ''
    let captionFrom: number | null = null
    let captionTo: number | null = null
    const nextNode = doc.nodeAt(nodeEnd)
    if (nextNode && nextNode.type.name === 'paragraph' && nextNode.attrs?.textAlign === 'center' && nextNode.textContent) {
      let hasItalic = false
      nextNode.forEach(child => {
        if (child.isText && child.marks.some(m => m.type.name === 'italic')) hasItalic = true
      })
      if (hasItalic) {
        existingCaption = nextNode.textContent
        captionFrom = nodeEnd
        captionTo = nodeEnd + nextNode.nodeSize
      }
    }
    openPromptModal({
      title: existingCaption ? 'Editar legenda da mídia:' : 'Adicionar legenda à mídia:',
      submitLabel: 'Salvar legenda',
      primaryLabel: 'Legenda',
      placeholder: 'Texto da legenda...',
      value: existingCaption,
      callback: ({ value }) => {
        const trimmed = (value || '').trim()
        if (captionFrom !== null && captionTo !== null) {
          const tr = editor.state.tr.delete(captionFrom, captionTo)
          editor.view.dispatch(tr)
          if (trimmed) {
            editor.commands.insertContentAt(captionFrom, {
              type: 'paragraph',
              attrs: { textAlign: 'center' },
              content: [{ type: 'text', text: trimmed, marks: [{ type: 'italic' }] }],
            })
          }
        } else if (trimmed) {
          editor!.commands.setTextSelection(nodeEnd)
          insertCaptionBlock(trimmed)
        }
      },
    })
  }, [editor, showNotification, insertCaptionBlock, openPromptModal])

  // ── Local feedback helper (visible in popup window) ─────────
  const flashFeedback = useCallback((message: string, type: 'success' | 'error') => {
    if (saveFeedbackTimer.current) clearTimeout(saveFeedbackTimer.current)
    setSaveFeedback({ message, type })
    saveFeedbackTimer.current = setTimeout(() => setSaveFeedback(null), 5000)
  }, [])

  const runTableCommand = useCallback((command: (chain: ReturnType<typeof editor.chain>) => { run: () => boolean }, successMessage: string, errorMessage: string) => {
    if (!editor) return
    const chain = editor.chain().focus()
    if (!command(chain).run()) {
      showNotification(errorMessage, 'info')
      return
    }
    showNotification(successMessage, 'success')
  }, [editor, showNotification])

  // ── Deterministic link sanitizer at save-time ────────────────
  // Ensures ALL non-YouTube links get target="_blank" + secure rel,
  // regardless of whether the ProseMirror plugin had a chance to run.
  const sanitizeLinksTargetBlank = (html: string): string => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const anchors = doc.querySelectorAll('a[href]')
    let changed = false
    anchors.forEach((a) => {
      const href = a.getAttribute('href') || ''
      if (isYoutubeUrl(href)) return
      if (a.getAttribute('target') !== '_blank') {
        a.setAttribute('target', '_blank')
        changed = true
      }
      if (a.getAttribute('rel') !== 'noopener noreferrer') {
        a.setAttribute('rel', 'noopener noreferrer')
        changed = true
      }
    })
    return changed ? doc.body.innerHTML : html
  }

  // ── Form submission ─────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const title = postTitle.trim()
    const author = postAuthor.trim()
    const rawContent = editor?.getHTML()?.trim() ?? ''
    if (!title || !rawContent || rawContent === '<p></p>') {
      flashFeedback('Título e conteúdo são obrigatórios para salvar o post.', 'error')
      showNotification('Título e conteúdo são obrigatórios para salvar o post.', 'error')
      return
    }
    // Enforce target="_blank" on all non-YouTube links before persisting
    const content = sanitizeLinksTargetBlank(rawContent)
    const success = await onSave(title, author, content)
    if (success) {
      flashFeedback(editingPostId ? 'Post atualizado com sucesso ✓' : 'Post criado com sucesso ✓', 'success')
    } else {
      flashFeedback('Falha ao salvar o post. Verifique e tente novamente.', 'error')
    }
  }

  const handleClear = () => {
    setPostTitle('')
    setPostAuthor('')
    editor?.commands.clearContent()
  }

  const handleGeminiImport = useCallback(async (url: string) => {
    if (!url || !editor) return
    setIsImportingGemini(true)
    showNotification('Importando conteúdo do Gemini...', 'info')
    try {
      const res = await fetch('/api/mainsite/gemini-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json() as { html?: string; title?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Erro ao importar do Gemini.')
      if (data.html) {
        editor.chain().focus().insertContent(data.html).run()
        if (data.title && !postTitle.trim()) setPostTitle(data.title)
      }
      showNotification('Conteúdo importado com sucesso!', 'success')
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Erro desconhecido.', 'error')
    } finally {
      setIsImportingGemini(false)
    }
  }, [editor, showNotification, postTitle])

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <div className="result-toolbar">
        <div>
          <h4>{editingPostId ? `Editar post #${editingPostId}` : 'Novo post (NOVO)'}</h4>
          <p className="field-hint">Crie e edite posts com salvamento imediato.</p>
        </div>
        <div className="inline-actions">
          <button type="submit" className="primary-button" disabled={savingPost}>
            {savingPost ? <Loader2 size={16} className="spin" /> : editingPostId ? <Save size={16} /> : <FilePlus2 size={16} />}
            {editingPostId ? 'Salvar alterações' : 'Criar post'}
          </button>
          <button type="button" className="ghost-button" onClick={handleClear} disabled={savingPost}>
            <X size={16} />
            Limpar
          </button>
          <button type="button" className="ghost-button" onClick={onClose} disabled={savingPost}>
            <X size={16} />
            Fechar
          </button>
        </div>
      </div>

      {/* ── Inline save feedback (visible in popup window) ── */}
      {saveFeedback && (
        <div
          className={`post-editor-feedback post-editor-feedback--${saveFeedback.type}`}
          role="status"
          aria-live="polite"
        >
          {saveFeedback.type === 'success' ? <CheckSquare size={16} /> : <X size={16} />}
          <span>{saveFeedback.message}</span>
          <button type="button" className="post-editor-feedback__close" onClick={() => setSaveFeedback(null)} aria-label="Fechar">×</button>
        </div>
      )}

      <div className="field-group">
        <label htmlFor="mainsite-post-title">Título do post</label>
        <input
          id="mainsite-post-title"
          name="mainsitePostTitle"
          value={postTitle}
          onChange={(event) => setPostTitle(event.target.value)}
          disabled={savingPost}
        />
      </div>

      <div className="field-group">
        <label htmlFor="mainsite-post-author">Autor do post</label>
        <input
          id="mainsite-post-author"
          name="mainsitePostAuthor"
          value={postAuthor}
          onChange={(event) => setPostAuthor(event.target.value)}
          placeholder="Leonardo Cardozo Vargas"
          disabled={savingPost}
        />
      </div>

      {/* ── TipTap Editor ────────────────────────────────────────────── */}
      <div className="tiptap-container">
        {editor && (
          <div className="tiptap-toolbar">
            {/* Universal prompt modal (link / image URL / youtube / caption) */}
            {promptModal.show && ReactDOM.createPortal(
              <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-label="Entrada de dados">
                <div className="admin-modal-content">
                  <button type="button" title="Fechar diálogo" className="admin-modal-close" onClick={() => setPromptModal(PROMPT_MODAL_INITIAL)}>
                    <X size={24} />
                  </button>
                  <div className="admin-modal-header">
                    <div className="admin-modal-icon">
                      {promptModal.isLink ? <LinkIcon size={24} /> : promptModal.showCaption ? <ImageIcon size={24} /> : <Type size={24} />}
                    </div>
                    <h2 className="admin-modal-title">{promptModal.title}</h2>
                    <p className="admin-modal-subtitle">Insira as informações necessárias abaixo</p>
                  </div>
                  <div className="admin-modal-form">
                    <div className="admin-modal-input-group">
                      <label className="admin-modal-label" htmlFor="tiptap-prompt-url">{promptModal.primaryLabel}</label>
                      <input className="admin-modal-input" id="tiptap-prompt-url" name="tiptapPromptUrl" value={promptModal.value} onChange={(e) => setPromptModal({ ...promptModal, value: e.target.value })} placeholder={promptModal.placeholder} autoFocus />
                    </div>
                    {promptModal.showLinkText && (
                      <div className="admin-modal-input-group">
                        <label className="admin-modal-label" htmlFor="tiptap-prompt-text">Texto</label>
                        <input className="admin-modal-input" id="tiptap-prompt-text" name="tiptapPromptText" value={promptModal.linkText} onChange={(e) => setPromptModal({ ...promptModal, linkText: e.target.value })} placeholder="Texto de exibição" />
                      </div>
                    )}
                    {promptModal.showAltText && (
                      <div className="admin-modal-input-group">
                        <label className="admin-modal-label" htmlFor="tiptap-prompt-alt">Texto alternativo</label>
                        <input className="admin-modal-input" id="tiptap-prompt-alt" name="tiptapPromptAlt" value={promptModal.altText} onChange={(e) => setPromptModal({ ...promptModal, altText: e.target.value })} placeholder="Descreva a imagem para acessibilidade" />
                      </div>
                    )}
                    {promptModal.showTitleText && (
                      <div className="admin-modal-input-group">
                        <label className="admin-modal-label" htmlFor="tiptap-prompt-title">Título da mídia</label>
                        <input className="admin-modal-input" id="tiptap-prompt-title" name="tiptapPromptTitle" value={promptModal.titleText} onChange={(e) => setPromptModal({ ...promptModal, titleText: e.target.value })} placeholder="Opcional" />
                      </div>
                    )}
                    {promptModal.showCaption && (
                      <div className="admin-modal-input-group">
                        <label className="admin-modal-label" htmlFor="tiptap-prompt-caption">Legenda (opcional)</label>
                        <input className="admin-modal-input" id="tiptap-prompt-caption" name="tiptapPromptCaption" value={promptModal.caption} onChange={(e) => setPromptModal({ ...promptModal, caption: e.target.value })} placeholder="Ex.: Foto de março de 2026" />
                      </div>
                    )}
                    <div className="admin-modal-actions">
                      <button type="button" className="admin-modal-btn admin-modal-btn--ghost" onClick={() => setPromptModal(PROMPT_MODAL_INITIAL)}>
                        Cancelar
                      </button>
                      <button type="button" className="admin-modal-btn" onClick={() => {
                        promptModal.callback?.({
                          value: promptModal.value.trim(),
                          linkText: promptModal.linkText.trim(),
                          caption: promptModal.caption.trim(),
                          altText: promptModal.altText.trim(),
                          titleText: promptModal.titleText.trim(),
                        })
                        setPromptModal(PROMPT_MODAL_INITIAL)
                      }}>
                        {promptModal.submitLabel}
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              editor.view?.dom?.ownerDocument?.body || document.body
            )}

            {/* AI Action Tool */}
            <div className="tiptap-ai-group">
              <Sparkles size={14} color="#1a73e8" />
              <select id="ai-action" name="aiAction" title="Inteligência Artificial (Gemini 2.5 Pro)" autoComplete="off" onChange={(e) => { if (e.target.value) { handleAITransform(e.target.value); e.target.value = ''; } }} disabled={isGeneratingAI}>
                <option value="">{isGeneratingAI ? 'Processando...' : 'IA: Aprimorar Texto'}</option>
                <option value="grammar">Corrigir Gramática</option>
                <option value="summarize">Resumir Seleção</option>
                <option value="expand">Expandir Conteúdo</option>
                <option value="formal">Tornar Formal</option>
              </select>
            </div>
            <span className="tiptap-divider" />

            <button type="button" title="Desfazer (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={!editor.can().undo() ? 'disabled' : ''}><Undo2 size={15} /></button>
            <button type="button" title="Refazer (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={!editor.can().redo() ? 'disabled' : ''}><Redo2 size={15} /></button>
            <span className="tiptap-divider" />

            <button type="button" title="Negrito (Ctrl+B)" className={editor.isActive('bold') ? 'active' : ''} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></button>
            <button type="button" title="Itálico (Ctrl+I)" className={editor.isActive('italic') ? 'active' : ''} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></button>
            <button type="button" title="Sublinhado (Ctrl+U)" className={editor.isActive('underline') ? 'active' : ''} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></button>
            <button type="button" title="Tachado (Ctrl+Shift+X)" className={editor.isActive('strike') ? 'active' : ''} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></button>
            <button type="button" title="Marca-texto (Ctrl+Shift+H)" className={editor.isActive('highlight') ? 'active' : ''} onClick={() => editor.chain().focus().toggleHighlight().run()}><Highlighter size={15} /></button>
            <span className="tiptap-divider" />
            <button type="button" title="Subscrito (Ctrl+,)" className={editor.isActive('subscript') ? 'active' : ''} onClick={() => editor.chain().focus().toggleSubscript().run()}><SubIcon size={15} /></button>
            <button type="button" title="Sobrescrito (Ctrl+.)" className={editor.isActive('superscript') ? 'active' : ''} onClick={() => editor.chain().focus().toggleSuperscript().run()}><SuperIcon size={15} /></button>
            <button type="button" title="Bloco de código (Ctrl+Alt+C)" className={editor.isActive('codeBlock') ? 'active' : ''} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code size={15} /></button>
            <button type="button" title="Citação (Ctrl+Shift+B)" className={editor.isActive('blockquote') ? 'active' : ''} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={15} /></button>
            <span className="tiptap-divider" />
            <button type="button" title="Esquerda (Ctrl+Shift+L)" className={editor.isActive({ textAlign: 'left' }) ? 'active' : ''} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft size={15} /></button>
            <button type="button" title="Centro (Ctrl+Shift+E)" className={editor.isActive({ textAlign: 'center' }) ? 'active' : ''} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={15} /></button>
            <button type="button" title="Direita (Ctrl+Shift+R)" className={editor.isActive({ textAlign: 'right' }) ? 'active' : ''} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight size={15} /></button>
            <button type="button" title="Justificar (Ctrl+Shift+J)" className={editor.isActive({ textAlign: 'justify' }) ? 'active' : ''} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify size={15} /></button>
            <span className="tiptap-divider" />
            <button type="button" title="Título 1 (Ctrl+Alt+1)" className={editor.isActive('heading', { level: 1 }) ? 'active' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></button>
            <button type="button" title="Título 2 (Ctrl+Alt+2)" className={editor.isActive('heading', { level: 2 }) ? 'active' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></button>
            <button type="button" title="Título 3 (Ctrl+Alt+3)" className={editor.isActive('heading', { level: 3 }) ? 'active' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={15} /></button>
            <button type="button" title="Marcadores (Ctrl+Shift+8)" className={editor.isActive('bulletList') ? 'active' : ''} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={15} /></button>
            <button type="button" title="Numeração (Ctrl+Shift+7)" className={editor.isActive('orderedList') ? 'active' : ''} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></button>
            <button type="button" title="Tarefas (Ctrl+Shift+9)" className={editor.isActive('taskList') ? 'active' : ''} onClick={() => editor.chain().focus().toggleTaskList().run()}><CheckSquare size={15} /></button>
            <button type="button" title="Linha horizontal" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={15} /></button>
            <button type="button" title="Inserir tabela 3×3" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={15} /></button>
            {editor.isActive('table') && (
              <>
                <button type="button" className="tiptap-button-textual" title="Adicionar linha abaixo" onClick={() => runTableCommand((chain) => chain.addRowAfter(), 'Linha adicionada à tabela.', 'Posicione o cursor dentro da tabela para adicionar uma linha.')}><span className="tiptap-button-text">L+</span></button>
                <button type="button" className="tiptap-button-textual" title="Remover linha" onClick={() => runTableCommand((chain) => chain.deleteRow(), 'Linha removida da tabela.', 'Posicione o cursor dentro da tabela para remover uma linha.')}><span className="tiptap-button-text">L-</span></button>
                <button type="button" className="tiptap-button-textual" title="Adicionar coluna à direita" onClick={() => runTableCommand((chain) => chain.addColumnAfter(), 'Coluna adicionada à tabela.', 'Posicione o cursor dentro da tabela para adicionar uma coluna.')}><span className="tiptap-button-text">C+</span></button>
                <button type="button" className="tiptap-button-textual" title="Remover coluna" onClick={() => runTableCommand((chain) => chain.deleteColumn(), 'Coluna removida da tabela.', 'Posicione o cursor dentro da tabela para remover uma coluna.')}><span className="tiptap-button-text">C-</span></button>
                <button type="button" className="tiptap-button-textual" title="Alternar cabeçalho da linha" onClick={() => runTableCommand((chain) => chain.toggleHeaderRow(), 'Cabeçalho da tabela atualizado.', 'Posicione o cursor dentro da tabela para atualizar o cabeçalho.')}><span className="tiptap-button-text">Hdr</span></button>
                <button type="button" className="tiptap-button-textual" title="Mesclar ou dividir células" onClick={() => runTableCommand((chain) => chain.mergeOrSplit(), 'Estrutura de células atualizada.', 'Selecione células válidas para mesclar ou dividir.')}><span className="tiptap-button-text">Mix</span></button>
                <button type="button" className="tiptap-button-textual" title="Excluir tabela" onClick={() => runTableCommand((chain) => chain.deleteTable(), 'Tabela removida.', 'Posicione o cursor dentro da tabela para excluí-la.')}><span className="tiptap-button-text">Del</span></button>
              </>
            )}
            <button type="button" title="Quebra de linha (Shift+Enter)" onClick={() => editor.chain().focus().setHardBreak().run()}><WrapText size={15} /></button>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <button type="button" title="Aumentar recuo (Tab)" onClick={() => (editor.chain().focus() as any).increaseIndent().run()}><Indent size={15} /></button>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <button type="button" title="Diminuir recuo (Shift+Tab)" onClick={() => (editor.chain().focus() as any).decreaseIndent().run()}><Outdent size={15} /></button>
            <span className="tiptap-divider" />
            <button type="button" title="Link (Ctrl+K)" className={editor.isActive('link') ? 'active' : ''} onClick={addLink}><LinkIcon size={15} /></button>
            <button type="button" title="Remover link" onClick={() => editor.chain().focus().unsetLink().run()} disabled={!editor.isActive('link')} className={!editor.isActive('link') ? 'disabled' : ''}><Unlink size={15} /></button>
            <span className="tiptap-divider" />
            {/* ── Media toolbar ── */}
            <input id="tiptap-file-upload" ref={fileInputRef} name="tiptapFileUpload" type="file" accept="image/*" title="Upload de imagem" className="tiptap-hidden-input" onChange={handleImageUpload} />
            <button type="button" title="Upload de imagem (R2)" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>{isUploading ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}</button>
            <button type="button" title="Imagem por URL / Google Drive" onClick={addImageUrl}><ImageIcon size={15} /></button>
            <button type="button" title="Vídeo do YouTube" onClick={addYoutube}><span>YT</span></button>
            <button type="button" title="Reduzir mídia" onClick={() => adjustSelectedMediaSize(-1)} disabled={!editor.isActive('image') && !editor.isActive('youtube')}><ZoomOut size={15} /></button>
            <button type="button" title="Ampliar mídia" onClick={() => adjustSelectedMediaSize(1)} disabled={!editor.isActive('image') && !editor.isActive('youtube')}><ZoomIn size={15} /></button>
            <button type="button" title="Legenda da mídia" onClick={editCaption} disabled={!editor.isActive('image') && !editor.isActive('youtube')}><MessageSquare size={15} /></button>
            <button type="button" title="Importar do Gemini" onClick={() => openPromptModal({
              title: 'Importar do Gemini (link compartilhado):',
              submitLabel: 'Importar',
              primaryLabel: 'URL do compartilhamento',
              placeholder: 'https://gemini.google.com/share/...',
              callback: ({ value }) => handleGeminiImport(value),
            })} disabled={isImportingGemini}>{isImportingGemini ? <Loader2 size={15} className="spin" /> : <Download size={15} />}</button>
            
            <span className="tiptap-divider" />
            
            <div className="tiptap-color-group">
              <Palette size={14} />
              <input id="tiptap-text-color" name="tiptapTextColor" type="color" title="Cor do texto" onInput={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()} value={(editor.getAttributes('textStyle').color as string) || '#000000'} />
            </div>
            <div className="tiptap-select-group">
              <Type size={14} />
              <select id="tiptap-font-family" name="tiptapFontFamily" title="Família da fonte" onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()} value={(editor.getAttributes('textStyle').fontFamily as string) || 'inherit'}>
                <option value="inherit">Padrão</option>
                <option value="monospace">Monospace</option>
                <option value="Arial">Arial</option>
                <option value="'Times New Roman', Times, serif">Times</option>
              </select>
            </div>
            <div className="tiptap-select-group">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <select id="tiptap-font-size" name="tiptapFontSize" title="Tamanho da fonte" onChange={(e) => (editor.chain().focus() as any).setFontSize(e.target.value).run()} value={(editor.getAttributes('textStyle').fontSize as string) || ''}>
                <option value="">Tam.</option>
                <option value="12px">12px</option>
                <option value="14px">14px</option>
                <option value="16px">16px</option>
                <option value="18px">18px</option>
                <option value="20px">20px</option>
                <option value="24px">24px</option>
                <option value="30px">30px</option>
              </select>
            </div>

            <span className="tiptap-divider" />

            {/* AI Freeform Command (Wand2) */}
            <div style={{ position: 'relative' }}>
              <button ref={aiChatBtnRef} type="button" title="IA: Instrução Livre (Gemini)" onClick={() => setAiChatOpen(!aiChatOpen)} className={aiChatOpen ? 'active' : ''} disabled={isGeneratingAI}>
                {isGeneratingAI ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />}
              </button>
              {aiChatOpen && (() => {
                const btnRect = aiChatBtnRef.current?.getBoundingClientRect()
                const ownerDoc = aiChatBtnRef.current?.ownerDocument
                const popupWin = ownerDoc?.defaultView
                const vpW = popupWin?.innerWidth || 800
                let popLeft = btnRect ? btnRect.left : 0
                const popW = 340
                if (popLeft + popW > vpW - 8) popLeft = vpW - popW - 8
                if (popLeft < 8) popLeft = 8
                return ReactDOM.createPortal(
                  <div className="ai-freeform-popover" style={{ position: 'fixed', top: btnRect ? btnRect.bottom + 6 : 100, left: popLeft, width: `${popW}px`, zIndex: 99999 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <Wand2 size={14} color="#1a73e8" />
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#1a73e8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>IA: Instrução Livre</span>
                      <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: 'auto' }}>{editor?.state.selection.empty ? 'Texto inteiro' : 'Seleção'}</span>
                    </div>
                    <textarea
                      autoFocus
                      rows={3}
                      placeholder="Ex: Traduza para inglês, resuma em 3 bullets, torne poético..."
                      value={aiChatInput}
                      onChange={e => setAiChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAIFreeform() } if (e.key === 'Escape') setAiChatOpen(false) }}
                      style={{ width: '100%', resize: 'vertical', padding: '10px 12px', fontSize: '13px', lineHeight: '1.5', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: 'rgba(0,0,0,0.02)', color: 'inherit', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', gap: '8px' }}>
                      <button type="button" onClick={() => setAiChatOpen(false)} style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '600', border: 'none', borderRadius: '8px', cursor: 'pointer', background: 'transparent', color: 'inherit', opacity: 0.6 }}>Cancelar</button>
                      <button type="button" onClick={handleAIFreeform} disabled={!aiChatInput.trim()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', fontSize: '12px', fontWeight: '700', border: 'none', borderRadius: '8px', cursor: 'pointer', background: '#1a73e8', color: '#fff', opacity: aiChatInput.trim() ? 1 : 0.5, transition: 'opacity 0.15s' }}>
                        <Send size={12} /> Enviar
                      </button>
                    </div>
                  </div>,
                  ownerDoc?.body || document.body
                )
              })()}
            </div>
          </div>
        )}
        <EditorContent editor={editor} className="tiptap-editor" />
        {editor && <SearchReplacePanel editor={editor} />}
        {editor && <EditorBubbleMenu editor={editor} onLinkClick={addLink} />}
        {editor && <EditorFloatingMenu editor={editor} onInsertTable={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />}
        {editor && (
          <div className="tiptap-status-bar">
            {editor.storage.characterCount.characters()} caracteres &middot; {editor.storage.characterCount.words()} palavras
          </div>
        )}
      </div>


    </form>
  )
}

// ── BubbleMenu — contextual formatting toolbar on text selection (draggable + viewport-clamped) ──
function EditorBubbleMenu({ editor, onLinkClick }: { editor: ReturnType<typeof useEditor>; onLinkClick?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [autoPos, setAutoPos] = useState<{ top: number; left: number } | null>(null)
  const [dragPos, setDragPos] = useState<{ top: number; left: number } | null>(null)
  const dragRef = useRef({ active: false, offsetX: 0, offsetY: 0 })

  useEffect(() => {
    if (!editor) return
    const update = () => {
      const { from, to, empty } = editor.state.selection
      if (empty || editor.state.selection instanceof NodeSelection) { setAutoPos(null); setDragPos(null); return }
      try {
        const domRange = editor.view.domAtPos(from)
        const ownerDoc = editor.view.dom.ownerDocument
        const popupWin = ownerDoc.defaultView
        const range = ownerDoc.createRange()
        range.setStart(domRange.node, domRange.offset)
        const endDom = editor.view.domAtPos(to)
        range.setEnd(endDom.node, endDom.offset)
        const rect = range.getBoundingClientRect()
        if (rect.width === 0) { setAutoPos(null); return }
        const menuH = 44, menuW = 340
        const vpW = popupWin?.innerWidth || 800
        const vpH = popupWin?.innerHeight || 600
        let top = rect.top - menuH - 8
        let left = rect.left + rect.width / 2 - menuW / 2
        if (top < 4) top = rect.bottom + 8
        left = Math.max(4, Math.min(left, vpW - menuW - 4))
        top = Math.max(4, Math.min(top, vpH - menuH - 4))
        setAutoPos({ top, left })
        setDragPos(null)
      } catch { setAutoPos(null) }
    }
    editor.on('selectionUpdate', update)
    const onBlur = () => { setAutoPos(null); setDragPos(null) }
    editor.on('blur', onBlur)
    return () => { editor.off('selectionUpdate', update); editor.off('blur', onBlur) }
  }, [editor])

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const menuEl = ref.current
    if (!menuEl) return
    const rect = menuEl.getBoundingClientRect()
    dragRef.current = { active: true, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top }
    menuEl.classList.add('dragging')
    const ownerDoc = menuEl.ownerDocument
    const popupWin = ownerDoc.defaultView
    const menuW = rect.width, menuH = rect.height
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return
      const vpW = popupWin?.innerWidth || 800
      const vpH = popupWin?.innerHeight || 600
      let nx = ev.clientX - dragRef.current.offsetX
      let ny = ev.clientY - dragRef.current.offsetY
      nx = Math.max(0, Math.min(nx, vpW - menuW))
      ny = Math.max(0, Math.min(ny, vpH - menuH))
      setDragPos({ top: ny, left: nx })
    }
    const onUp = () => {
      dragRef.current.active = false
      menuEl.classList.remove('dragging')
      ownerDoc.removeEventListener('mousemove', onMove)
      ownerDoc.removeEventListener('mouseup', onUp)
    }
    ownerDoc.addEventListener('mousemove', onMove)
    ownerDoc.addEventListener('mouseup', onUp)
  }

  if (!autoPos || !editor) return null
  const pos = dragPos || autoPos
  const portalTarget = editor.view?.dom?.ownerDocument?.body || document.body
  return ReactDOM.createPortal(
    <div ref={ref} className="bubble-menu" onMouseDown={startDrag} style={{ position: 'fixed', top: `${pos.top}px`, left: `${pos.left}px`, zIndex: 99999, cursor: 'grab' }}>
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }} className={editor.isActive('bold') ? 'is-active' : ''} title="Negrito (Ctrl+B)"><Bold size={14} /></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }} className={editor.isActive('italic') ? 'is-active' : ''} title="Itálico (Ctrl+I)"><Italic size={14} /></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }} className={editor.isActive('underline') ? 'is-active' : ''} title="Sublinhado (Ctrl+U)"><UnderlineIcon size={14} /></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleStrike().run() }} className={editor.isActive('strike') ? 'is-active' : ''} title="Tachado (Ctrl+Shift+X)"><Strikethrough size={14} /></button>
      <span className="bubble-divider" />
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHighlight().run() }} className={editor.isActive('highlight') ? 'is-active' : ''} title="Marca-texto (Ctrl+Shift+H)"><Highlighter size={14} /></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleSubscript().run() }} className={editor.isActive('subscript') ? 'is-active' : ''} title="Subscrito (Ctrl+,)"><SubIcon size={14} /></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleSuperscript().run() }} className={editor.isActive('superscript') ? 'is-active' : ''} title="Sobrescrito (Ctrl+.)"><SuperIcon size={14} /></button>
      <span className="bubble-divider" />
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCode().run() }} className={editor.isActive('code') ? 'is-active' : ''} title="Código inline (Ctrl+E)"><Code size={14} /></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); if (editor.isActive('link')) { editor.chain().focus().unsetLink().run() } else { onLinkClick?.() } }} className={editor.isActive('link') ? 'is-active' : ''} title="Link (Ctrl+K)"><LinkIcon size={14} /></button>
    </div>,
    portalTarget
  )
}

// ── FloatingMenu — quick-insert toolbar on empty lines (draggable + viewport-clamped) ──
function EditorFloatingMenu({ editor, onInsertTable }: { editor: ReturnType<typeof useEditor>; onInsertTable: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [autoPos, setAutoPos] = useState<{ top: number; left: number } | null>(null)
  const [dragPos, setDragPos] = useState<{ top: number; left: number } | null>(null)
  const dragRef = useRef({ active: false, offsetX: 0, offsetY: 0 })

  useEffect(() => {
    if (!editor) return
    const update = () => {
      const { $anchor } = editor.state.selection
      const isEmptyTextBlock = $anchor.parent.isTextblock && $anchor.parent.content.size === 0
      if (!isEmptyTextBlock || !editor.state.selection.empty) { setAutoPos(null); setDragPos(null); return }
      try {
        const coords = editor.view.coordsAtPos($anchor.pos)
        const ownerDoc = editor.view.dom.ownerDocument
        const popupWin = ownerDoc.defaultView
        const vpW = popupWin?.innerWidth || 800
        const vpH = popupWin?.innerHeight || 600
        const menuW = 380, menuH = 40
        let left = coords.left - 16 - menuW
        let top = coords.top - 4
        if (left < 4) left = coords.left + 16
        left = Math.max(4, Math.min(left, vpW - menuW - 4))
        top = Math.max(4, Math.min(top, vpH - menuH - 4))
        setAutoPos({ top, left })
        setDragPos(null)
      } catch { setAutoPos(null) }
    }
    let wrapper: Element | null = null
    try { wrapper = editor.view?.dom?.closest('.tiptap-editor') } catch { /* view not mounted */ }
    const hideOnScroll = () => { setAutoPos(null); setDragPos(null) }
    editor.on('selectionUpdate', update)
    editor.on('focus', update)
    wrapper?.addEventListener('scroll', hideOnScroll)
    return () => { editor.off('selectionUpdate', update); editor.off('focus', update); wrapper?.removeEventListener('scroll', hideOnScroll) }
  }, [editor])

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const menuEl = menuRef.current
    if (!menuEl) return
    const rect = menuEl.getBoundingClientRect()
    dragRef.current = { active: true, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top }
    menuEl.classList.add('dragging')
    const ownerDoc = menuEl.ownerDocument
    const popupWin = ownerDoc.defaultView
    const menuW = rect.width, menuH = rect.height
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return
      const vpW = popupWin?.innerWidth || 800
      const vpH = popupWin?.innerHeight || 600
      let nx = ev.clientX - dragRef.current.offsetX
      let ny = ev.clientY - dragRef.current.offsetY
      nx = Math.max(0, Math.min(nx, vpW - menuW))
      ny = Math.max(0, Math.min(ny, vpH - menuH))
      setDragPos({ top: ny, left: nx })
    }
    const onUp = () => {
      dragRef.current.active = false
      menuEl.classList.remove('dragging')
      ownerDoc.removeEventListener('mousemove', onMove)
      ownerDoc.removeEventListener('mouseup', onUp)
    }
    ownerDoc.addEventListener('mousemove', onMove)
    ownerDoc.addEventListener('mouseup', onUp)
  }

  if (!autoPos || !editor) return null
  const pos = dragPos || autoPos
  const portalTarget = editor.view?.dom?.ownerDocument?.body || document.body
  return ReactDOM.createPortal(
    <div ref={menuRef} className="floating-menu" onMouseDown={startDrag} style={{ position: 'fixed', top: `${pos.top}px`, left: `${pos.left}px`, zIndex: 99999, cursor: 'grab' }}>
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run() }} className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''} title="Título 1"><Heading1 size={16} /></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run() }} className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''} title="Título 2"><Heading2 size={16} /></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run() }} className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''} title="Título 3"><Heading3 size={16} /></button>
      <span className="floating-divider" />
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBulletList().run() }} title="Marcadores"><List size={16} /></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run() }} title="Numeração"><ListOrdered size={16} /></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleTaskList().run() }} title="Tarefas"><ListChecks size={16} /></button>
      <span className="floating-divider" />
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBlockquote().run() }} title="Citação"><Quote size={16} /></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCodeBlock().run() }} title="Bloco de Código"><Code size={16} /></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().setHorizontalRule().run() }} title="Linha Horizontal"><Minus size={16} /></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); onInsertTable() }} title="Tabela"><LayoutGrid size={16} /></button>
    </div>,
    portalTarget
  )
}
