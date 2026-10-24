"use client";

import { createClient } from "@/lib/supabase/client";
import { PollView, type PollApi } from "@/components/features/PollView";
import type { TweetPollOption } from "@/types";

/** つぶやきの投票。表示と操作は PollView と共通で、保存先だけがここで決まる。 */
export function TweetPoll({
  tweetId,
  userId,
  userName,
  userAvatarUrl,
  userBlocks,
  userGrade,
  options,
  multiple,
  anonymous,
  allowOptions,
}: {
  tweetId: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  userBlocks: import("@/types").Block[];
  userGrade: string | null;
  options: TweetPollOption[];
  multiple: boolean;
  anonymous: boolean;
  allowOptions: boolean;
}) {
  const api: PollApi = {
    async addVote(optionId) {
      // Already voted (another tab, an older screen) is success, not an error.
      const { error } = await createClient()
        .from("tweet_poll_votes")
        .upsert({ option_id: optionId, user_id: userId }, { onConflict: "option_id,user_id", ignoreDuplicates: true });
      return !error;
    },
    async myVotes(optionIds) {
      const { data, error } = await createClient()
        .from("tweet_poll_votes")
        .select("option_id")
        .in("option_id", optionIds)
        .eq("user_id", userId);
      return error || !data ? null : new Set(data.map(row => row.option_id));
    },
    async removeVotes(optionIds) {
      const { error } = await createClient()
        .from("tweet_poll_votes")
        .delete()
        .in("option_id", optionIds)
        .eq("user_id", userId);
      return !error;
    },
    async addOption(text, sortOrder) {
      const { data, error } = await createClient()
        .from("tweet_poll_options")
        .insert({ tweet_id: tweetId, text, created_by: userId, sort_order: sortOrder })
        .select("*")
        .single();
      if (error || !data) return null;
      return { ...data, vote_count: 0, voted_by_me: false, voters: [] };
    },
  };

  return (
    <PollView
      api={api}
      userId={userId}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
      userBlocks={userBlocks}
      userGrade={userGrade}
      options={options}
      multiple={multiple}
      anonymous={anonymous}
      allowOptions={allowOptions}
    />
  );
}
