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

export interface EditorToolbarProps {
  showSplitToggle?: boolean;
  splitActive?: boolean;
  onSplitToggle?: () => void;
  onOpenPdf?: () => void;
  onClosePdf?: () => void;
  paneMode?: 'editor' | 'pdf';
  pdfFilename?: string;
}

export default function EditorToolbar({
  showSplitToggle,
  splitActive,
  onSplitToggle,
  onOpenPdf,
  onClosePdf,
  paneMode = 'editor',
  pdfFilename,
}: EditorToolbarProps) {
  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-[#1a1d27] border-b border-[#2d3140] flex-shrink-0 flex-wrap">
      {paneMode === 'editor' ? (
        <>
          {buttons.map((btn, i) => (
            <button
              key={i}
              title={btn.title}
              onMouseDown={e => {
                e.preventDefault();
                execCommand(btn.command, btn.value);
              }}
              className="px-2 py-0.5 text-xs rounded hover:bg-[#2d3140] text-[#8b90a0] hover:text-[#e1e4ed] transition-colors font-medium"
            >
              {btn.label}
            </button>
          ))}
        </>
      ) : (
        <span className="text-xs text-[#8b90a0] truncate max-w-[220px]" title={pdfFilename}>
          📄 {pdfFilename || 'PDF Viewer'}
        </span>
      )}

      <div className="flex-1" />

      {paneMode === 'pdf' && onClosePdf && (
        <button
          onClick={onClosePdf}
          title="Close PDF and return to editor"
          className="px-2 py-0.5 text-xs rounded hover:bg-[#2d3140] text-[#8b90a0] hover:text-[#e1e4ed] transition-colors"
        >
          ✕ Close
        </button>
      )}

      {paneMode === 'editor' && onOpenPdf && (
        <button
          onClick={onOpenPdf}
          title="Open a PDF in this pane"
          className="px-2 py-0.5 text-xs rounded hover:bg-[#2d3140] text-[#8b90a0] hover:text-[#e1e4ed] transition-colors"
        >
          📄 PDF
        </button>
      )}

      {showSplitToggle && onSplitToggle && (
        <button
          onClick={onSplitToggle}
          title={splitActive ? 'Close split view' : 'Split editor view'}
          className={`px-2 py-0.5 text-xs rounded transition-colors font-medium ${
            splitActive
              ? 'bg-[#6c8aff] text-white hover:bg-[#5a78ed]'
              : 'hover:bg-[#2d3140] text-[#8b90a0] hover:text-[#e1e4ed]'
          }`}
        >
          ⊞ Split
        </button>
      )}
    </div>
  );
}
