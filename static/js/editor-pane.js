/**
 * TipTap editor setup with citation insertion.
 * Loads TipTap from esm.sh CDN — no build step needed.
 */

let editor = null;

export async function init() {
  const [
    { Editor },
    { default: StarterKit },
    { default: Placeholder },
    { default: Underline },
    { Node: TiptapNode },
    { mergeAttributes },
  ] = await Promise.all([
    import('https://esm.sh/@tiptap/core@2.11.5'),
    import('https://esm.sh/@tiptap/starter-kit@2.11.5'),
    import('https://esm.sh/@tiptap/extension-placeholder@2.11.5'),
    import('https://esm.sh/@tiptap/extension-underline@2.11.5'),
    import('https://esm.sh/@tiptap/core@2.11.5'),
    import('https://esm.sh/@tiptap/core@2.11.5'),
  ]);

  // Custom Citation node
  const Citation = TiptapNode.create({
    name: 'citation',
    group: 'inline',
    inline: true,
    atom: true,

    addAttributes() {
      return {
        label: { default: '' },
        citekey: { default: '' },
      };
    },

    parseHTML() {
      return [{ tag: 'span[data-citation]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['span', mergeAttributes(HTMLAttributes, {
        'data-citation': '',
        class: 'citation-node',
      }), `[${HTMLAttributes.label}]`];
    },
  });

  editor = new Editor({
    element: document.getElementById('editor-mount'),
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: 'Start writing your research document...' }),
      Citation,
    ],
    content: '',
  });

  // Toolbar wiring
  const actions = {
    'btn-bold': () => editor.chain().focus().toggleBold().run(),
    'btn-italic': () => editor.chain().focus().toggleItalic().run(),
    'btn-underline': () => editor.chain().focus().toggleUnderline().run(),
    'btn-h1': () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    'btn-h2': () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    'btn-h3': () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    'btn-ul': () => editor.chain().focus().toggleBulletList().run(),
    'btn-ol': () => editor.chain().focus().toggleOrderedList().run(),
    'btn-quote': () => editor.chain().focus().toggleBlockquote().run(),
  };

  for (const [id, fn] of Object.entries(actions)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  return editor;
}

export function insertCitation({ label, citekey }) {
  if (!editor) return;
  editor.chain().focus().insertContent({
    type: 'citation',
    attrs: { label, citekey },
  }).run();
}

export function insertText(text) {
  if (!editor) return;
  editor.chain().focus().insertContent(text).run();
}

export function getHTML() {
  return editor ? editor.getHTML() : '';
}

export function setContent(html) {
  if (editor && html) {
    editor.commands.setContent(html);
  }
}

export function getEditor() { return editor; }
