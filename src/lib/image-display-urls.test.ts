import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avatarDisplayUrl } from "./avatar-image";
import { tweetImageDisplayUrl } from "./tweet-image";
import { noteImageDisplayUrl } from "./note-image";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_IMAGE_DELIVERY_VERSION", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("authenticated thumbnail URLs", () => {
  it("keeps original URLs as the default for enlargement and editing", () => {
    expect(avatarDisplayUrl("user-1/avatar.webp")).toBe("/api/avatar/image?path=user-1%2Favatar.webp");
    expect(tweetImageDisplayUrl("user-1/photo.webp")).toBe("/api/tweet-image?path=user-1%2Fphoto.webp");
    expect(noteImageDisplayUrl("photo")).toBe("/api/note-image?id=photo");
  });

  it("adds only the thumbnail variant to the existing image endpoint", () => {
    expect(avatarDisplayUrl("user-1/avatar.webp", "thumbnail")).toBe("/api/avatar/image?path=user-1%2Favatar.webp&variant=thumbnail");
    expect(tweetImageDisplayUrl("user-1/photo.webp", "thumbnail")).toBe("/api/tweet-image?path=user-1%2Fphoto.webp&variant=thumbnail");
    expect(noteImageDisplayUrl("photo", "thumbnail")).toBe("/api/note-image?id=photo&variant=thumbnail");
  });

  it("preserves the avatar delivery version for legacy JPEG storage URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGE_DELIVERY_VERSION", "release/2");
    expect(avatarDisplayUrl(
      "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg",
      "thumbnail",
    )).toBe("/api/avatar/image?path=user-1%2Favatar.jpg&v=release%2F2&variant=thumbnail");
  });

  it("supports authenticated avatar URLs without duplicate variant parameters", () => {
    const value = "/api/avatar/image?path=user-1%2Favatar.webp&v=release&variant=original#photo";
    expect(avatarDisplayUrl(value, "thumbnail"))
      .toBe("/api/avatar/image?path=user-1%2Favatar.webp&v=release&variant=thumbnail#photo");
  });

  it.each([
    "https://images.example.com/avatar.jpg",
    "https://other.supabase.co/storage/v1/object/public/avatars/user-1/avatar.webp",
    "https://external.example/api/avatar/image?path=user-1%2Favatar.webp",
    "blob:https://app.example/temporary",
    "data:image/png;base64,aGVsbG8=",
    "/legacy/avatar.png",
    "/api/avatar/image?path=..%2Fprivate.webp",
    "../private/avatar.webp",
  ])("leaves an external, temporary or unrecognized avatar unchanged: %s", value => {
    expect(avatarDisplayUrl(value, "thumbnail")).toBe(value);
  });

  it("does not turn absent avatars into requests", () => {
    expect(avatarDisplayUrl(null, "thumbnail")).toBeNull();
    expect(avatarDisplayUrl(undefined, "thumbnail")).toBeNull();
    expect(avatarDisplayUrl("", "thumbnail")).toBeNull();
  });

  it("encodes image identifiers so they cannot replace the variant", () => {
    expect(tweetImageDisplayUrl("user/photo.webp&variant=original", "thumbnail"))
      .toBe("/api/tweet-image?path=user%2Fphoto.webp%26variant%3Doriginal&variant=thumbnail");
    expect(noteImageDisplayUrl("photo&variant=original", "thumbnail"))
      .toBe("/api/note-image?id=photo%26variant%3Doriginal&variant=thumbnail");
  });
});
