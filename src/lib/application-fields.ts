/** Shared by the application form (browser) and its server action. */
export const CATEGORIES = ["Painting", "Sculpture", "Drawing", "Photography", "Fiber", "Mixed Media", "Collage", "Digital Work", "Ceramic", "Print", "Other"] as const;
export const MAX_WORKS = 3;
export const PRICE_MIN = 100;
export const PRICE_MAX = 10000;
export const BIO_MIN = 500;
export const BIO_MAX = 1500;

export type ApplicationWork = {
  workId: string;
  title: string;
  year: string;
  height: string;
  width: string;
  depth: string;
  unit: string;
  category: string;
  medium: string;
  description: string;
  price: string;
  processVideo: string;
  images: { path: string; thumbPath: string | null; w: number | null; h: number | null }[];
};

export type ApplicationInput = {
  showId: string;
  name: string;
  phone: string;
  bio: string;
  social: string;
  website: string;
  education: string;
  photoPath: string;
  cvPath: string | null;
  works: ApplicationWork[];
};
