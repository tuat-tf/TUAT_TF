import { describe, expect, it } from "vitest";
import { atomicSave } from "./atomic-save";
import { notePollSaveConfirmed } from "./note-poll-save";

const a = { id: "a", text: "A", created_by: "author" };
const b = { id: "b", text: "B", created_by: "author" };
const c = { id: "c", text: "C", created_by: "member" };
describe("note poll result confirmation", () => {
  it("does not claim a removal succeeded when the request never reached the DB", async () => {
    const result = await atomicSave({ uncertain: false }, async () => { throw Error("offline"); }, async () =>
      notePollSaveConfirmed([a,b,c], [a,c], ["b"], true) ? "confirmed" : null);
    expect(result).toEqual({ ok: false, reason: "unknown" });
  });
  it("confirms submitted options with a legal member or author addition", () => {
    expect(notePollSaveConfirmed([a,c], [a], ["b"], true)).toBe(true);
    expect(notePollSaveConfirmed([a,{...c,created_by:"author"}], [a], ["b"], true)).toBe(true);
  });
  it("requires each new option's content and author, not only a matching id", () => {
    expect(notePollSaveConfirmed([a], [a,b], [], true)).toBe(false);
    expect(notePollSaveConfirmed([a,{...b,text:"Different"}], [a,b], [], true)).toBe(false);
    expect(notePollSaveConfirmed([a,{...b,created_by:"member"}], [a,b], [], true)).toBe(false);
  });
  it("only confirms whole-poll removal when no options remain", () => {
    expect(notePollSaveConfirmed([], [], ["a","b"], false)).toBe(true);
    expect(notePollSaveConfirmed([c], [], ["a","b"], false)).toBe(false);
  });
});
