import { useEffect, useRef, useState, DragEvent } from 'react';
import Button from '../ui/Button';
import { cn } from '@/lib/utils';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

// Mirrors MAX_FILE_SIZE in src/lib/validation.ts. That module pulls in
// server-only dependencies, so it is not imported into this client component.
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const NO_IMAGE_MESSAGE = 'No image found on the clipboard. Copy a poster image, then try again.';
const TOO_LARGE_MESSAGE = 'That image is larger than 10MB. Try a smaller image.';
const PASTE_BLOCKED_MESSAGE =
  "Couldn't read the clipboard. Allow clipboard access or choose the image instead.";

function extensionFor(mimeType: string): string {
  const subtype = mimeType.split('/')[1] ?? 'png';
  return subtype === 'jpeg' ? 'jpg' : subtype;
}

/** Reads the first image from the async clipboard, or null when it has none. */
export async function readClipboardImage(clipboard: Clipboard): Promise<File | null> {
  const items = await clipboard.read();
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    return new File([blob], `pasted-poster.${extensionFor(imageType)}`, { type: imageType });
  }
  return null;
}

/** Returns the first image file in a paste event's data, or null. */
function imageFromDataTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const file of Array.from(data.files)) {
    if (file.type.startsWith('image/')) return file;
  }
  return null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
}

export default function UploadZone({ onFileSelect, disabled }: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [canPaste, setCanPaste] = useState(false);
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);

  // Keep the latest props for the document-level paste listener and for
  // clipboard reads that resolve after a re-render.
  const acceptRef = useRef<(file: File | null) => void>(() => {});
  // Bumped by every new input and on unmount. A clipboard read that resolves
  // after the counter moved on is stale and gets dropped.
  const inputGenerationRef = useRef(0);

  const acceptFile = (file: File | null) => {
    inputGenerationRef.current += 1;
    if (disabled) return;
    if (!file || !file.type.startsWith('image/')) {
      setPasteMessage(NO_IMAGE_MESSAGE);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setPasteMessage(TOO_LARGE_MESSAGE);
      return;
    }
    setPasteMessage(null);
    onFileSelect(file);
  };
  acceptRef.current = acceptFile;

  // Feature-detect after mount so server and client markup match.
  useEffect(() => {
    setCanPaste(
      typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function'
    );
  }, []);

  // Invalidate any pending clipboard read when the zone unmounts (for
  // example, when the user switches to manual artist entry).
  useEffect(() => {
    const generation = inputGenerationRef;
    return () => {
      generation.current += 1;
    };
  }, []);

  // Desktop: Cmd/Ctrl+V anywhere on the page pastes a copied image.
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const file = imageFromDataTransfer(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      acceptRef.current(file);
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  const handlePasteClick = async () => {
    setPasteMessage(null);
    const generation = ++inputGenerationRef.current;
    let file: File | null;
    try {
      file = await readClipboardImage(navigator.clipboard);
    } catch {
      if (generation === inputGenerationRef.current) setPasteMessage(PASTE_BLOCKED_MESSAGE);
      return;
    }
    // A newer input or an unmount happened while the clipboard read was pending.
    if (generation !== inputGenerationRef.current) return;
    // Use the latest props, not the ones captured when the tap happened.
    acceptRef.current(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) acceptFile(file);
    // Choosing the same file again should still trigger a new analysis.
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) acceptFile(file);
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.75rem] border border-dashed bg-dark-900 p-6 transition-colors sm:p-8',
        isDragging
          ? 'border-accent-500 bg-accent-500/10'
          : 'border-dark-600 hover:border-accent-500/70',
        disabled && 'cursor-not-allowed opacity-50'
      )}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="sr-only"
        disabled={disabled}
        aria-label="Choose a festival poster image"
      />
      <div className="grid gap-7 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
        <div>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-accent-400">
            Drop or paste your image here
          </p>
          <h3 className="font-display text-3xl font-black tracking-tight text-dark-50 sm:text-4xl">
            Upload Festival Poster
          </h3>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-dark-300 sm:text-base">
            A festival flyer, concert poster, or screenshot works. We&apos;ll find the artists and
            help you build a playlist from the lineup.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="rounded-xl px-7 text-base font-bold"
            >
              Choose Image{' '}
              <span aria-hidden="true" className="ml-3">
                ↗
              </span>
            </Button>
            {canPaste && (
              <Button
                variant="secondary"
                size="lg"
                onClick={handlePasteClick}
                disabled={disabled}
                className="rounded-xl px-7 text-base font-bold"
              >
                Paste Image
              </Button>
            )}
          </div>
          {pasteMessage && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {pasteMessage}
            </p>
          )}
          <p className="mt-4 text-xs text-dark-300">JPG, PNG, and other image formats · Max 10MB</p>
        </div>
        <div
          className="relative mx-auto flex h-48 w-40 rotate-[5deg] flex-col justify-between border-[8px] border-[#e5d6b9] bg-accent-500 p-4 text-dark-950 shadow-[0_18px_36px_rgba(0,0,0,0.3)] sm:mx-0 sm:h-56 sm:w-44"
          aria-hidden="true"
        >
          <span className="border-b border-dark-950/60 pb-2 text-[9px] font-black uppercase tracking-widest">
            The lineup
          </span>
          <span className="font-display text-3xl font-black uppercase leading-[0.85] tracking-tighter">
            YOUR
            <br />
            NEXT
            <br />
            FAVE.
          </span>
          <span className="border-t border-dark-950/60 pt-2 text-[8px] font-black uppercase tracking-widest">
            A playlist starts here
          </span>
        </div>
      </div>
    </div>
  );
}
