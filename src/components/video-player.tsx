import Image from 'next/image';
import { PlayCircle } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

type VideoPlayerProps = {
    imageUrl: string;
}

export function VideoPlayer({ imageUrl }: VideoPlayerProps) {
  const videoThumbnail = PlaceHolderImages.find(p => p.id === "video-thumbnail");

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl group">
      <Image 
        src={imageUrl} 
        alt="Video placeholder"
        fill
        className="object-cover transition-transform duration-500 group-hover:scale-105"
        data-ai-hint={videoThumbnail?.imageHint}
        priority
      />
      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
        <PlayCircle className="w-20 h-20 text-white/70 transform transition-all group-hover:scale-110 group-hover:text-white" />
      </div>
    </div>
  );
}
