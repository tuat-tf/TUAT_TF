import { unstable_cache } from "next/cache";
import { fetchBlogIndex, getBlogPage as readBlogPage, getBlogArticle as readBlogArticle, getLatestBlogRevision as readLatestBlogRevision } from "@/lib/blog-feed";

// The badge and paginated list share the same public source-page cache.
// Authentication and per-user read markers stay outside this cache.
const getBlogIndex = unstable_cache(fetchBlogIndex, ["official-blog-index-ipv4-v1"], { revalidate: 15 * 60 });
export const getBlogPage = (page: number) => readBlogPage(page, getBlogIndex);
export const getLatestBlogRevision = () => readLatestBlogRevision(getBlogIndex);
export const getBlogArticle = unstable_cache(readBlogArticle, ["official-blog-article-ipv4-v1"], { revalidate: 15 * 60 });
