import { unstable_cache } from "next/cache";
import { getClubRecordHtml as fetchClubRecordHtml } from "@/lib/club-records";

// Public official records only. Authentication remains outside this cache.
export const getClubRecordHtml = unstable_cache(fetchClubRecordHtml, ["official-club-records-v1"], { revalidate: 15 * 60 });
