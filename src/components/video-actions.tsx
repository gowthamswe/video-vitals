"use client";

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { doc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { saveRating } from '@/firebase/services';
import type { Rating } from '@/types/ratings';

export function VideoActions({ videoId }: { videoId: string }) {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  // Create a memoized reference to the specific rating document for the current user and video.
  const ratingRef = useMemoFirebase(() => {
    if (!user || !videoId) return null;
    return doc(firestore, 'videos', videoId, 'ratings', user.uid);
  }, [firestore, user, videoId]);

  // Use the useDoc hook to get real-time data for this user's rating.
  const { data: userRating, isLoading } = useDoc<Rating>(ratingRef);

  // Derive UI state from the fetched data.
  const isClickbait = userRating?.clickbaitFlag ?? false;
  const density = userRating?.informationDensity; // Can be number or undefined.

  const [clickbaitVotes, setClickbaitVotes] = useState(12); // Mocked for UI

  const handleToggleClickbait = () => {
    if (!user) {
      toast({ variant: "destructive", title: "You must be signed in to rate." });
      return;
    }
    const newValue = !isClickbait;
    saveRating(firestore, videoId, user.uid, { clickbaitFlag: newValue });

    // This is just for local UI feedback, the real number would come from an aggregation.
    setClickbaitVotes(v => newValue ? v + 1 : v - 1);
    toast({ title: "Rating Submitted!", description: "Your feedback helps the community." });
  };
  
  const handleDensityCommit = (newDensity: number[]) => {
    if (!user) {
      toast({ variant: "destructive", title: "You must be signed in to rate." });
      return;
    }
    saveRating(firestore, videoId, user.uid, { informationDensity: newDensity[0] });
    toast({ title: "Rating Submitted!", description: "Your feedback has been recorded." });
  };
  
  const displayedDensity = density;

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <Button
        variant={isClickbait ? "destructive" : "outline"}
        onClick={handleToggleClickbait}
        className="transition-all active:scale-95"
        disabled={isLoading}
      >
        <Flag />
        <span>
          Clickbait <span className="text-muted-foreground/80 font-normal">({clickbaitVotes})</span>
        </span>
      </Button>
      <div className="flex items-center gap-3 w-full sm:w-56">
        <Label htmlFor="info-density" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          Info Density
        </Label>
        <Slider
          id="info-density"
          min={0}
          max={10}
          step={1}
          value={[displayedDensity ?? 0]}
          onValueCommit={handleDensityCommit}
          className="w-full"
          disabled={isLoading}
        />
        {displayedDensity === undefined ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-semibold w-6 h-6 flex items-center justify-center rounded-full bg-muted text-muted-foreground cursor-help">?</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>No density score yet. Be the first to rate it!</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-sm font-semibold w-6 text-center text-foreground">{displayedDensity}</span>
        )}
      </div>
    </div>
  );
}
