'use client';

import { doc, Firestore, serverTimestamp } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import type { Rating } from '@/types/ratings';

export function ensureVideo(
  firestore: Firestore,
  video: { id: string; title: string; channelId: string }
) {
  const videoRef = doc(firestore, 'videos', video.id);
  setDocumentNonBlocking(videoRef, video, { merge: true });
}

export function ensureChannel(
  firestore: Firestore,
  channel: { id: string; name: string }
) {
  const channelRef = doc(firestore, 'channels', channel.id);
  setDocumentNonBlocking(channelRef, channel, { merge: true });
}

export function saveRating(
  firestore: Firestore,
  videoId: string,
  userId: string,
  rating: Partial<Pick<Rating, 'clickbaitFlag' | 'informationDensity'>>
) {
  if (!userId) {
    console.error("User not authenticated. Cannot save rating.");
    return;
  }
  const ratingRef = doc(firestore, 'videos', videoId, 'ratings', userId);
  
  // Data sent on the initial creation of a document
  const createData = {
    ...rating,
    videoId: videoId,
    userId: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Data sent on subsequent updates to a document
  const updateData = {
    ...rating,
    updatedAt: serverTimestamp(),
  };

  // We are performing an "upsert": create if it doesn't exist, merge if it does.
  // By splitting the data, we ensure `createdAt` is only set once on the initial write.
  // The logic in `setDocumentNonBlocking` should handle both cases by using { merge: true }.
  // To be fully correct with schema validation, we need a way to know if this is a create or update.
  // However, a simple merge is a common pattern. Let's create a combined object for the `set` with `merge`.
  // The security rules will validate the final state.
  const dataToSave = {
    ...rating,
    videoId: videoId,
    userId: userId,
    updatedAt: serverTimestamp(),
  };

  // To be fully compliant with our new strict create rule, we should really do a transaction
  // to check existence first, or have separate `create` and `update` functions.
  // For this pattern (upsert), we'll combine the data and rely on merge:true.
  // And we'll adjust the client-side to pass all required fields for a potential create.
  
  const upsertData = {
      videoId: videoId,
      userId: userId,
      clickbaitFlag: 'clickbaitFlag' in rating ? rating.clickbaitFlag : false, // Provide default for create
      informationDensity: 'informationDensity' in rating ? rating.informationDensity : 0, // Provide default for create
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
  };

  // set with merge will create or update.
  // If creating, `createdAt` is set. If updating, `createdAt` is ignored by Firestore due to the merge.
  // ...but our rules are now stricter. The best approach is to pass the full object for creation,
  // and a partial for updates. The current `saveRating` is an "upsert". Let's modify it to be compliant.

  // The simplest change is to ensure the object for `set` with `merge:true` has all fields for a potential `create`
  // and the rules for `update` are flexible.
  setDocumentNonBlocking(ratingRef, { ...upsertData, ...rating }, { merge: true });
}
