import { useRef, useState, DragEvent } from 'react';
import Button from '../ui/Button';
import { cn } from '@/lib/utils';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export default function UploadZone({ onFileSelect, disabled }: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) onFileSelect(file);
    // Choosing the same file again should still trigger a new analysis.
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) onFileSelect(file);
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
            Drop your image here
          </p>
          <h3 className="font-display text-3xl font-black tracking-tight text-dark-50 sm:text-4xl">
            Upload Festival Poster
          </h3>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-dark-300 sm:text-base">
            A festival flyer, concert poster, or screenshot works. We&apos;ll find the artists and
            help you build a playlist from the lineup.
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="mt-7 rounded-xl px-7 text-base font-bold"
          >
            Choose Image{' '}
            <span aria-hidden="true" className="ml-3">
              ↗
            </span>
          </Button>
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
