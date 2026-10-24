import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
import { PollView, type PollApi, type PollOption } from "./PollView";

const api: PollApi = { addVote: async () => true, removeVotes: async () => true, myVotes: async () => new Set(), addOption: async () => null };
const option = (id: string, text: string, voted: boolean): PollOption => ({ id, text, created_by: "u", sort_order: 0, vote_count: voted ? 1 : 0, voted_by_me: voted, voters: [] });
const render = (options: PollOption[]) => renderToStaticMarkup(createElement(PollView, {
  api, userId: "me", userName: "合成", userAvatarUrl: null, userBlocks: [], userGrade: null, options, multiple: false, anonymous: true, allowOptions: false }));

it("marks only the chosen option, with a check and no extra text", () => {
  const html = render([option("a", "朝練", true), option("b", "夕練", false)]);
  expect(html.match(/aria-label="投票済み"/g)).toHaveLength(1);
  expect(html).not.toContain("あなたの投票");
  expect(render([option("a", "朝練", false), option("b", "夕練", false)])).not.toContain("投票済み");
});
