/** The fields a change log tracks, with the label people see. */
export const TRACKED_FIELDS = {
  title: "Title",
  year: "Year",
  medium: "Medium",
  category: "Category",
  description: "Description",
  priceUsd: "Price",
  width: "Width",
  height: "Height",
  depth: "Depth",
  unit: "Unit",
  soldAt: "Sold",
} as const;
export type TrackedField = keyof typeof TRACKED_FIELDS;
