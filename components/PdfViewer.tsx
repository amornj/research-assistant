'use client';

interface PdfViewerProps {
  url: string;
  filename?: string;
  disablePointerEvents?: boolean;
}

export default function PdfViewer({ url, filename, disablePointerEvents }: PdfViewerProps) {
  return (
    <div className="h-full w-full flex flex-col bg-[#0f1117] relative">
      <iframe
        src={url}
        title={filename || 'PDF Viewer'}
        className="flex-1 w-full border-0"
        style={{ minHeight: 0, pointerEvents: disablePointerEvents ? 'none' : 'auto' }}
      />
    </div>
  );
}
