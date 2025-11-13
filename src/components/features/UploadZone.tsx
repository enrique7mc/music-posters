import { useRef, DragEvent } from 'react';
import { motion } from 'framer-motion';
import Button from '../ui/Button';
import { cn } from '@/lib/utils';
import { scaleIn } from '@/lib/animations';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export default function UploadZone({ onFileSelect, disabled }: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onFileSelect(file);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
  };

  return (
    <motion.div
      className={cn(
        'relative border-2 border-dashed rounded-lg transition-colors',
        'border-dark-700 hover:border-accent-500/50',
        'bg-dark-900/50 hover:bg-dark-900',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      variants={scaleIn}
      initial="hidden"
      animate="visible"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />

      <div className="p-12 lg:p-16 text-center">
        {/* Icon */}
        <motion.div
          className="text-7xl mb-6"
          animate={{
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          🎸
        </motion.div>

        <h3 className="text-2xl font-bold text-dark-100 mb-3">Upload Festival Poster</h3>
        <p className="text-dark-400 mb-8 max-w-md mx-auto">
          Drag and drop your poster here, or click to browse. We support any festival or concert
          lineup image.
        </p>

        <Button
          variant="primary"
          size="lg"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          Choose Image
        </Button>

        <p className="mt-6 text-xs text-dark-500">
          Supports JPG, PNG, and other image formats • Max 10MB
        </p>
      </div>
    </motion.div>
  );
}
