import Image from 'next/image';

export type IllustrationName = 'poster' | 'manual' | 'speed' | 'ranking' | 'tracks' | 'cover';

interface IllustrationProps {
  name: IllustrationName;
  size: number;
  className?: string;
  alt?: string;
}

export default function Illustration({ name, size, className, alt = '' }: IllustrationProps) {
  return (
    <Image
      src={`/illustrations/${name}.webp`}
      alt={alt}
      width={size}
      height={size}
      className={className}
      unoptimized
    />
  );
}
