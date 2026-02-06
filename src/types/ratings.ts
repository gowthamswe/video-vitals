export interface Rating {
  id: string; // This will be the userId in our subcollection
  videoId: string;
  userId: string;
  clickbaitFlag: boolean;
  informationDensity: number;
  createdAt?: any; // serverTimestamp
  updatedAt?: any; // serverTimestamp
}
