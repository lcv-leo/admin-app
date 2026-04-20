/**
 * BubbleMenu.tsx — Contextual formatting toolbar on text selection
 * Extracted from PostEditor.tsx for structural decomposition.
 * Features: drag-and-drop, viewport clamping, dynamic active state.
 */

import type { useEditor } from '@tiptap/react';
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link as LinkIcon,
  Strikethrough,
  Subscript as SubIcon,
  Superscript as SuperIcon,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { NodeSelection } from 'prosemirror-state';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

interface EditorBubbleMenuProps {
  editor: ReturnType<typeof useEditor>;
  onLinkClick?: () => void;
}

export function EditorBubbleMenu({ editor, onLinkClick }: EditorBubbleMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [autoPos, setAutoPos] = useState<{ top: number; left: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ top: number; left: number } | null>(null);
  const dragRef = useRef({ active: false, offsetX: 0, offsetY: 0 });

  const getPortalTarget = () => {
    try {
      return editor?.view?.dom?.ownerDocument?.body || document.body;
    } catch {
      return document.body;
    }
  };

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      const { from, to, empty } = editor.state.selection;
      // Hidden when no selection or when a node is selected (e.g. image)
      if (empty || editor.state.selection instanceof NodeSelection) {
        setAutoPos(null);
        setDragPos(null);
        return;
      }
      try {
        const domRange = editor.view.domAtPos(from);
        const ownerDoc = editor.view.dom.ownerDocument;
        const popupWin = ownerDoc.defaultView;
        const range = ownerDoc.createRange();
        range.setStart(domRange.node, domRange.offset);
        const endDom = editor.view.domAtPos(to);
        range.setEnd(endDom.node, endDom.offset);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0) {
          setAutoPos(null);
          return;
        }
        const menuH = 44,
          menuW = 340;
        const vpW = popupWin?.innerWidth || 800;
        const vpH = popupWin?.innerHeight || 600;
        let top = rect.top - menuH - 8;
        let left = rect.left + rect.width / 2 - menuW / 2;
        if (top < 4) top = rect.bottom + 8;
        left = Math.max(4, Math.min(left, vpW - menuW - 4));
        top = Math.max(4, Math.min(top, vpH - menuH - 4));
        setAutoPos({ top, left });
        setDragPos(null);
      } catch {
        setAutoPos(null);
      }
    };

    const onBlur = () => {
      setAutoPos(null);
      setDragPos(null);
    };
    editor.on('selectionUpdate', update);
    editor.on('blur', onBlur);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('blur', onBlur);
    };
  }, [editor]);

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const menuEl = ref.current;
    if (!menuEl) return;
    const rect = menuEl.getBoundingClientRect();
    dragRef.current = { active: true, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    menuEl.classList.add('dragging');
    const ownerDoc = menuEl.ownerDocument;
    const popupWin = ownerDoc.defaultView;
    const menuW = rect.width,
      menuH = rect.height;
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return;
      const vpW = popupWin?.innerWidth || 800;
      const vpH = popupWin?.innerHeight || 600;
      let nx = ev.clientX - dragRef.current.offsetX;
      let ny = ev.clientY - dragRef.current.offsetY;
      nx = Math.max(0, Math.min(nx, vpW - menuW));
      ny = Math.max(0, Math.min(ny, vpH - menuH));
      setDragPos({ top: ny, left: nx });
    };
    const onUp = () => {
      dragRef.current.active = false;
      menuEl.classList.remove('dragging');
      ownerDoc.removeEventListener('mousemove', onMove);
      ownerDoc.removeEventListener('mouseup', onUp);
    };
    ownerDoc.addEventListener('mousemove', onMove);
    ownerDoc.addEventListener('mouseup', onUp);
  };

  if (!autoPos || !editor) return null;
  const pos = dragPos || autoPos;
  const portalTarget = getPortalTarget();

  return ReactDOM.createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: drag handle for floating TipTap menu — mouse-only affordance
    <div
      ref={ref}
      className="bubble-menu"
      onMouseDown={startDrag}
      style={{ position: 'fixed', top: `${pos.top}px`, left: `${pos.left}px`, zIndex: 99999, cursor: 'grab' }}
    >
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleBold().run();
        }}
        className={editor.isActive('bold') ? 'is-active' : ''}
        title="Negrito (Ctrl+B)"
      >
        <Bold size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleItalic().run();
        }}
        className={editor.isActive('italic') ? 'is-active' : ''}
        title="Itálico (Ctrl+I)"
      >
        <Italic size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleUnderline().run();
        }}
        className={editor.isActive('underline') ? 'is-active' : ''}
        title="Sublinhado (Ctrl+U)"
      >
        <UnderlineIcon size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleStrike().run();
        }}
        className={editor.isActive('strike') ? 'is-active' : ''}
        title="Tachado (Ctrl+Shift+X)"
      >
        <Strikethrough size={14} />
      </button>
      <span className="bubble-divider" />
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleHighlight().run();
        }}
        className={editor.isActive('highlight') ? 'is-active' : ''}
        title="Marca-texto (Ctrl+Shift+H)"
      >
        <Highlighter size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleSubscript().run();
        }}
        className={editor.isActive('subscript') ? 'is-active' : ''}
        title="Subscrito (Ctrl+,)"
      >
        <SubIcon size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleSuperscript().run();
        }}
        className={editor.isActive('superscript') ? 'is-active' : ''}
        title="Sobrescrito (Ctrl+.)"
      >
        <SuperIcon size={14} />
      </button>
      <span className="bubble-divider" />
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleCode().run();
        }}
        className={editor.isActive('code') ? 'is-active' : ''}
        title="Código inline (Ctrl+E)"
      >
        <Code size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          if (editor.isActive('link')) editor.chain().focus().unsetLink().run();
          else onLinkClick?.();
        }}
        className={editor.isActive('link') ? 'is-active' : ''}
        title="Link (Ctrl+K)"
      >
        <LinkIcon size={14} />
      </button>
    </div>,
    portalTarget,
  );
}
