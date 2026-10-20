/** The default URL stays original for enlargement and editing. */
export function noteImageDisplayUrl(id: string, variant: "original" | "thumbnail" = "original") {
  return `/api/note-image?id=${encodeURIComponent(id)}${variant === "thumbnail" ? "&variant=thumbnail" : ""}`;
}
