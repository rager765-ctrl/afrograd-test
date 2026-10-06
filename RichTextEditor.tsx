import React, { useCallback, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Youtube from '@tiptap/extension-youtube';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Link as LinkIcon,
  Image as ImageIcon,
  Youtube as YoutubeIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Code,
  Minus,
} from 'lucide-react';

interface RichTextEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onImageUpload?: (file: File) => Promise<string | null>;
}

const Btn = ({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded-control transition-colors ${
      active
        ? 'bg-brand-100 text-brand-700'
        : 'text-fg-muted hover:bg-surface-active hover:text-fg'
    }`}
  >
    {children}
  </button>
);

const Sep = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-hairline" />;

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  label,
  value,
  onChange,
  placeholder = 'Start writing...',
  onImageUpload,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-brand-600 underline' },
      }),
      Placeholder.configure({ placeholder }),
      Youtube.configure({ height: 480, nocookie: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      TextStyle,
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: 'tiptap' },
    },
    // React 19 StrictMode double-invokes the initial render; TipTap v3 wants
    // the editor created in an effect rather than during render.
    immediatelyRender: false,
  });

  // `content` above is the INITIAL value only. Without this the editor keeps
  // showing whatever it was created with, so selecting a lesson whose body
  // arrives asynchronously left the previous document (or an empty one) on
  // screen. Compared whitespace-insensitively because TipTap normalises the
  // HTML it round-trips, which would otherwise loop.
  useEffect(() => {
    if (!editor) return;
    const incoming = value || '';
    const current = editor.getHTML();
    if (current.replace(/\s+/g, '') !== incoming.replace(/\s+/g, '')) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [editor, value]);

  const insertYoutube = useCallback(() => {
    const url = window.prompt('Paste a YouTube or Vimeo URL:');
    if (!url || !editor) return;
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      editor.commands.setYoutubeVideo({ src: url });
    } else {
      editor.commands.insertContent(
        `<p><a href="${url}" target="_blank" rel="noreferrer">${url}</a></p>`
      );
    }
  }, [editor]);

  const insertImageUrl = useCallback(() => {
    const url = window.prompt('Paste an image or GIF URL:');
    if (!url || !editor) return;
    editor.commands.setImage({ src: url, alt: '' });
  }, [editor]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !editor || !onImageUpload) return;
      const url = await onImageUpload(file);
      if (url) editor.commands.setImage({ src: url, alt: file.name });
    },
    [editor, onImageUpload]
  );

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL:', prev ?? '');
    if (url === null) return;
    if (!url) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  const ic = 'w-4 h-4';

  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-semibold text-fg-muted">{label}</span>

      <div className="rounded-card border border-hairline bg-surface overflow-hidden focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 transition-colors">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-hairline bg-surface-inset">
          <Btn onClick={() => editor.chain().focus().undo().run()} title="Undo"><Undo className={ic} /></Btn>
          <Btn onClick={() => editor.chain().focus().redo().run()} title="Redo"><Redo className={ic} /></Btn>
          <Sep />
          <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1"><Heading1 className={ic} /></Btn>
          <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2"><Heading2 className={ic} /></Btn>
          <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3"><Heading3 className={ic} /></Btn>
          <Sep />
          <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold"><Bold className={ic} /></Btn>
          <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><Italic className={ic} /></Btn>
          <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline"><UnderlineIcon className={ic} /></Btn>
          <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough"><Strikethrough className={ic} /></Btn>
          <Btn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline code"><Code className={ic} /></Btn>
          <Sep />
          <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left"><AlignLeft className={ic} /></Btn>
          <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align center"><AlignCenter className={ic} /></Btn>
          <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right"><AlignRight className={ic} /></Btn>
          <Sep />
          <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list"><List className={ic} /></Btn>
          <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list"><ListOrdered className={ic} /></Btn>
          <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote"><Quote className={ic} /></Btn>
          <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider"><Minus className={ic} /></Btn>
          <Sep />
          <Btn onClick={setLink} active={editor.isActive('link')} title="Insert / edit link"><LinkIcon className={ic} /></Btn>
          <Btn onClick={insertImageUrl} title="Insert image or GIF by URL"><ImageIcon className={ic} /></Btn>
          {onImageUpload && (
            <>
              <button
                type="button"
                title="Upload image from device"
                onClick={() => fileInputRef.current?.click()}
                className="px-2 py-1 rounded-control text-[10px] font-bold text-fg-muted hover:bg-surface-active hover:text-fg transition-colors leading-none"
              >
                ↑img
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </>
          )}
          <Btn onClick={insertYoutube} title="Embed YouTube / Vimeo video"><YoutubeIcon className={ic} /></Btn>
        </div>

        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
