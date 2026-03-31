/**
 * SlashCommands.ts — Slash-command popup for quick block insertion
 * Triggered by typing '/' at the start of an empty text block.
 * Uses vanilla-DOM popup (same pattern as Mention) — no extra deps.
 */
import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'

interface SlashCommand {
  label: string
  description: string
  icon: string
  keywords: string[]
  command: (editor: Editor) => void
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    label: 'Parágrafo',
    description: 'Texto simples',
    icon: '¶',
    keywords: ['parágrafo', 'texto', 'p', 'paragraph', 'text'],
    command: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    label: 'Título 1',
    description: 'Cabeçalho grande',
    icon: 'H1',
    keywords: ['h1', 'título', 'title', 'heading 1', 'cabeçalho'],
    command: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    label: 'Título 2',
    description: 'Cabeçalho médio',
    icon: 'H2',
    keywords: ['h2', 'título', 'heading 2', 'cabeçalho'],
    command: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Título 3',
    description: 'Cabeçalho pequeno',
    icon: 'H3',
    keywords: ['h3', 'título', 'heading 3', 'cabeçalho'],
    command: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: 'Lista com marcadores',
    description: 'Lista não ordenada',
    icon: '•',
    keywords: ['lista', 'bullet', 'ul', 'marcadores'],
    command: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: 'Lista numerada',
    description: 'Lista ordenada',
    icon: '1.',
    keywords: ['numerada', 'ordered', 'ol', 'numeração'],
    command: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: 'Lista de tarefas',
    description: 'Checklist interativo',
    icon: '☑',
    keywords: ['tarefas', 'checklist', 'todo', 'task'],
    command: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    label: 'Citação',
    description: 'Bloco de citação',
    icon: '"',
    keywords: ['citação', 'blockquote', 'quote', 'aspas'],
    command: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    label: 'Bloco de código',
    description: 'Código com syntax highlight',
    icon: '</>',
    keywords: ['código', 'code', 'pre', 'programação'],
    command: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    label: 'Linha horizontal',
    description: 'Separador de seções',
    icon: '—',
    keywords: ['linha', 'hr', 'separador', 'divider', 'horizontal'],
    command: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    label: 'Tabela',
    description: 'Tabela 3×3',
    icon: '⊞',
    keywords: ['tabela', 'table', 'grid'],
    command: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    label: 'Imagem com legenda',
    description: 'Figura semântica com figcaption',
    icon: '🖼',
    keywords: ['imagem', 'figura', 'legenda', 'image', 'figure', 'figcaption'],
    command: (e) => {
      // Opens a prompt for src — deferred to PostEditor which can use PromptModal
      // For slash command path, a simple inline prompt via the browser is acceptable
      // as a fallback; PostEditor can override this with its own modal handler.
      const src = window.prompt('URL da imagem:')
      if (src) {
        ;(e.commands as unknown as Record<string, (attrs: Record<string, unknown>) => boolean>)
          .setFigureImage?.({ src, alt: '', caption: '' })
      }
    },
  },
]

/**
 * Creates a vanilla-DOM slash-command popup anchored to the editor view.
 */
function createSlashPopup(
  editor: Editor,
  query: string,
  triggerPos: number
): (() => void) | null {
  const ownerDoc = editor.view.dom.ownerDocument
  const coords = editor.view.coordsAtPos(triggerPos)

  const filtered = SLASH_COMMANDS.filter((cmd) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      cmd.keywords.some((k) => k.includes(q))
    )
  })

  if (filtered.length === 0) return null

  const menu = ownerDoc.createElement('div')
  menu.className = 'slash-commands-menu'
  menu.setAttribute('role', 'listbox')
  menu.setAttribute('aria-label', 'Comandos')
  Object.assign(menu.style, {
    position: 'fixed',
    top: `${coords.bottom + 4}px`,
    left: `${coords.left}px`,
    zIndex: '999999',
    maxHeight: '320px',
    overflowY: 'auto',
  })

  let selectedIndex = 0

  const renderItems = () => {
    menu.innerHTML = ''
    filtered.forEach((cmd, i) => {
      const item = ownerDoc.createElement('div')
      item.className = 'slash-commands-item' + (i === selectedIndex ? ' is-selected' : '')
      item.setAttribute('role', 'option')
      item.setAttribute('aria-selected', String(i === selectedIndex))
      item.innerHTML = `
        <span class="slash-cmd-icon">${cmd.icon}</span>
        <span class="slash-cmd-text">
          <span class="slash-cmd-label">${cmd.label}</span>
          <span class="slash-cmd-desc">${cmd.description}</span>
        </span>
      `
      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        selectCommand(i)
      })
      menu.appendChild(item)
    })
    // Scroll selected into view
    const selectedEl = menu.querySelector('.is-selected') as HTMLElement | null
    selectedEl?.scrollIntoView({ block: 'nearest' })
  }

  const selectCommand = (index: number) => {
    // Delete the '/' + query
    const { from } = editor.state.selection
    editor.chain()
      .deleteRange({ from: triggerPos, to: from })
      .run()
    filtered[index].command(editor)
    cleanup()
  }

  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      selectedIndex = (selectedIndex + 1) % filtered.length
      renderItems()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length
      renderItems()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      selectCommand(selectedIndex)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cleanup()
    }
  }

  const cleanup = () => {
    menu.remove()
    ownerDoc.removeEventListener('keydown', keyHandler, true)
  }

  renderItems()
  ownerDoc.body.appendChild(menu)
  ownerDoc.addEventListener('keydown', keyHandler, true)

  return cleanup
}

/**
 * SlashCommands TipTap Extension.
 * Intercepts '/' on an empty text block and shows the command popup.
 */
export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addKeyboardShortcuts() {
    let cleanup: (() => void) | null = null
    let triggerPos = -1
    let isActive = false

    const handleSelectionUpdate = () => {
      if (!isActive) return
      const { empty } = this.editor.state.selection
      if (!empty) { cleanup?.(); cleanup = null; isActive = false; return }
      const $from = this.editor.state.selection.$from
      const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
      if (!textBefore.startsWith('/')) { cleanup?.(); cleanup = null; isActive = false; return }
      const query = textBefore.slice(1)
      cleanup?.()
      cleanup = createSlashPopup(this.editor, query, triggerPos)
    }

    // Listen for selection updates to re-render popup with updated query
    this.editor.on('selectionUpdate', handleSelectionUpdate)
    this.editor.on('update', handleSelectionUpdate)

    return {
      '/': () => {
        const { empty, $from } = this.editor.state.selection
        if (!empty) return false
        const isEmptyBlock = $from.parent.textContent === '' && $from.parent.type.isTextblock
        if (!isEmptyBlock) return false
        isActive = true
        triggerPos = this.editor.state.selection.from
        // Let the character be inserted first, then show popup
        setTimeout(() => {
          cleanup?.()
          cleanup = createSlashPopup(this.editor, '', triggerPos)
        }, 0)
        return false // don't prevent default — let '/' be typed
      },
    }
  },
})
