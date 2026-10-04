import { describe, expect, it, vi } from "vitest";
import { saveCompetitionOrder } from "./competition-order";

function mockClient(result: { data: object | null; error: object | null } = { data: { id: "saved" }, error: null }) {
  const update = vi.fn(() => query);
  const query = { eq: vi.fn(() => query), select: vi.fn(() => query), single: vi.fn(async () => result) };
  const from = vi.fn(() => ({ update }));
  return { client: { from } as unknown as Parameters<typeof saveCompetitionOrder>[0], from, update, query };
}

describe("competition order", () => {
  it.each(["competitions", "competition_events"] as const)("changes only the order in %s, retaining independently edited fields", async (table) => {
    const mock = mockClient();
    expect(await saveCompetitionOrder(mock.client, table, ["b", "a"])).toBe(true);
    expect(mock.update.mock.calls).toEqual([[{ sort_order: 10 }], [{ sort_order: 20 }]]);
    expect(mock.query.eq.mock.calls).toEqual([
      [table === "competitions" ? "id" : "name", "b"],
      [table === "competitions" ? "id" : "name", "a"],
    ]);
  });

  it("reports a blocked or missing row as failure", async () => {
    const mock = mockClient({ data: null, error: null });
    expect(await saveCompetitionOrder(mock.client, "competitions", ["a"])).toBe(false);
    expect(mock.update).toHaveBeenCalledTimes(1);
  });

  it("does not replay an uncertain write", async () => {
    const mock = mockClient();
    mock.query.single.mockRejectedValueOnce(new Error("connection lost"));
    expect(await saveCompetitionOrder(mock.client, "competition_events", ["a"])).toBe(false);
    expect(mock.update).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate identities before writing", async () => {
    const mock = mockClient();
    expect(await saveCompetitionOrder(mock.client, "competitions", ["a", "a"])).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
  });
});
