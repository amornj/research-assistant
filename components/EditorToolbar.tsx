'use client';

interface ToolbarButton {
  label: string;
  command: string;
  value?: string;
  title: string;
}

const buttons: ToolbarButton[] = [
  { label: 'B', command: 'bold', title: 'Bold' },
  { label: 'I', command: 'italic', title: 'Italic' },
  { label: 'U', command: 'underline', title: 'Underline' },
  { label: 'H1', command: 'formatBlock', value: 'h1', title: 'Heading 1' },
  { label: 'H2', command: 'formatBlock', value: 'h2', title: 'Heading 2' },
  { label: 'H3', command: 'formatBlock', value: 'h3', title: 'Heading 3' },
  { label: '• List', command: 'insertUnorderedList', title: 'Bullet List' },
  { label: '1. List', command: 'insertOrderedList', title: 'Numbered List' },
  { label: '" Quote', command: 'formatBlock', value: 'blockquote', title: 'Blockquote' },
];

export default function EditorToolbar() {
  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-[#1a1d27] border-b border-[#2d3140] flex-shrink-0 flex-wrap">
      {buttons.map((btn, i) => (
        <button
          key={i}
          title={btn.title}
          onMouseDown={e => {
            e.preventDefault(); // Don't lose focus
            execCommand(btn.command, btn.value);
          }}
          className="px-2 py-0.5 text-xs rounded hover:bg-[#2d3140] text-[#8b90a0] hover:text-[#e1e4ed] transition-colors font-medium"
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
