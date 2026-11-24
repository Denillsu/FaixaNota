export type RatingMode = 'auto-mean' | 'weighted-duration' | 'manual';

export type ViewMode = 'grid' | 'chart';

export type ActiveSection = 'catalog' | 'search' | 'watchlist' | 'reviews' | 'profile';

export type ScoreTierFilter = 'all' | 'must-hear' | 'acclaimed' | 'mixed' | 'low' | 'unrated';

export type LibraryStatusTab = 'all' | 'rated' | 'listened' | 'liked';

export type AlbumStatusField = 'isListened' | 'isLiked' | 'isFavorite' | 'inWatchlist';

export type ReleaseTypeFilter = 'album' | 'ep' | 'all';

export type SortOption = 'score-desc' | 'recent' | 'year-desc' | 'title-asc';

export type CatalogSource = 'deezer' | 'musicbrainz' | 'itunes';

export interface AotyCriticReview {
  publication: string;
  author: string;
  score: number | null;
  text: string;
  date?: string;
}

export interface AotyUserReview {
  reviewId?: number | null;
  username: string;
  avatar?: string | null;
  rating: number | null;
  text: string;
  likes: number;
  comments: number;
  date?: string | null;
  url?: string;
}

export interface AotyCriticListEntry {
  title: string;
  publication: string;
  publicationUrl?: string | null;
  rank?: number | null;
  url: string;
  cover?: string | null;
}

export interface AotyUserListEntry {
  title: string;
  username: string;
  userUrl?: string;
  avatar?: string | null;
  description?: string | null;
  likes?: number | null;
  comments?: number | null;
  albumCount?: number | null;
  ranked: boolean;
  updatedAgo?: string | null;
  url: string;
}

export interface AotyTrackRating {
  trackNumber: number;
  title: string;
  durationMs: number;
  rating: number | null;
  ratingCount: number;
  songUrl?: string;
}

export interface AotyData {
  aotyId: string;
  aotyUrl: string;
  criticScore: number | null;
  criticCount: number | null;
  userScore: number | null;
  userCount: string | null;
  listsCount?: number | null;
  label?: string;
  format?: string;
  genres: string[];
  tags: string[];
  criticReviews: AotyCriticReview[];
  userReviews?: AotyUserReview[];
  trackRatings: AotyTrackRating[];
  syncedAt: string;
}

export interface Track {
  id: string;
  trackNumber: number;
  title: string;
  durationMs: number;
  score: number | null;
  rankOrder: number;
  isFavorite: boolean;
  previewUrl?: string;
  note?: string;
  aotyRating?: number | null;
  aotyRatingCount?: number;
  aotySongUrl?: string;
}

export interface Album {
  id: string;
  externalCatalogId?: string;
  itunesCollectionId?: number;
  title: string;
  artist: string;
  releaseYear: number;
  genre: string;
  coverUrl: string;
  ratingMode: RatingMode;
  manualScore: number | null;
  mustHear: boolean;
  isListened: boolean;
  isLiked: boolean;
  isFavorite: boolean;
  inWatchlist: boolean;
  reviewText: string;
  moodTags: string[];
  tracks: Track[];
  aotyData?: AotyData;
  createdAt: string;
  updatedAt: string;
}

export interface CustomListItem {
  albumId: string;
  position: number;
  commentary: string;
}

export interface CustomList {
  id: string;
  title: string;
  description: string;
  category: 'Ano' | 'Gênero' | 'Geral';
  items: CustomListItem[];
  updatedAt: string;
}

export interface CatalogSearchResult {
  catalogId: string;
  providerId: string;
  source: CatalogSource;
  collectionId?: number;
  title: string;
  artist: string;
  releaseYear?: number;
  genre: string;
  coverUrl: string;
  trackCount: number;
  releaseType: 'album' | 'ep' | 'single';
}

export interface CatalogAlbumDetail {
  catalogId: string;
  providerId: string;
  source: CatalogSource;
  collectionId?: number;
  title: string;
  artist: string;
  releaseYear: number;
  genre: string;
  coverUrl: string;
  tracks: Array<{
    trackNumber: number;
    title: string;
    durationMs: number;
    previewUrl?: string;
  }>;
}

export interface AotyLookupPayload {
  found: boolean;
  message?: string;
  album?: {
    title: string;
    artist: string;
    releaseYear: number;
    genre: string;
    coverUrl: string;
    aotyData: AotyData;
    tracks: Array<{
      trackNumber: number;
      title: string;
      durationMs: number;
      aotyRating: number | null;
      aotyRatingCount: number;
    }>;
  };
}

export interface AotyAlbumUserReviewsPayload {
  available: boolean;
  blocked?: boolean;
  message?: string;
  totalPages?: number | null;
  reviews: AotyUserReview[];
}

export interface AotyAlbumListsPayload {
  available: boolean;
  blocked?: boolean;
  message?: string;
  type: 'critic' | 'user';
  criticLists: AotyCriticListEntry[];
  userLists: AotyUserListEntry[];
}

export interface AotySongDetailPayload {
  available: boolean;
  blocked?: boolean;
  message?: string;
  song?: {
    title: string;
    url: string;
    userScore: number | null;
    ratingCount: number | null;
    likePercentage: number | null;
    topRatings: Array<{
      username: string;
      avatar?: string | null;
      rating: number | null;
      date?: string | null;
    }>;
    comments: Array<{
      username: string;
      avatar?: string | null;
      text: string;
      date?: string | null;
      likes: number;
    }>;
  };
}

export interface AotyUserProfilePayload {
  available: boolean;
  blocked?: boolean;
  username: string;
  profileUrl: string;
  message?: string;
  profile?: {
    username: string;
    displayName: string;
    url: string;
    avatar: string | null;
    bio: string | null;
    location: string | null;
    stats: {
      ratings?: number | null;
      reviews?: number | null;
      lists?: number | null;
      followers?: number | null;
      following?: number | null;
    } | null;
    following: Array<{ username: string; avatar: string | null; url: string }>;
    recentReviews: Array<{
      album: string;
      artist: string;
      rating: number | null;
      text: string;
      date?: string | null;
      albumUrl?: string;
      cover?: string | null;
    }>;
    recentlyRated: Array<{
      album: string;
      artist: string;
      rating: number | null;
      albumUrl?: string;
      cover?: string | null;
    }>;
  };
}

export interface AudioPreviewState {
  trackId: string;
  trackTitle: string;
  artist: string;
  albumTitle: string;
  previewUrl: string;
  isPlaying: boolean;
}

export interface UserProfile {
  displayName: string;
  handle: string;
  bio: string;
  avatarUrl?: string;
  aotyUsername?: string;
}
