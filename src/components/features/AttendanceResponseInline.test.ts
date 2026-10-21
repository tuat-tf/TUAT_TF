import {createElement,type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach,expect,it,vi} from "vitest";
import type {AttendanceChange,AttendancePending} from "@/lib/attendance-save";

const state=vi.hoisted(()=>({values:[] as unknown[],cursor:0}));
type ButtonProps={children:ReactNode;disabled?:boolean;onClick:()=>void;"aria-label"?:string;"aria-expanded"?:boolean;"aria-controls"?:string};
type InputProps={value:string;onChange:(event:{target:{value:string}})=>void};
const capture=vi.hoisted(()=>({buttons:new Map<string,ButtonProps>(),input:null as InputProps|null,save:vi.fn(),changed:vi.fn()}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useState(initial:unknown){const i=state.cursor++;if(!(i in state.values))state.values[i]=initial;return[state.values[i],(next:unknown)=>{state.values[i]=typeof next==="function"?next(state.values[i]):next;}];},useRef(initial:unknown){const i=state.cursor++;if(!(i in state.values))state.values[i]={current:initial};return state.values[i];}}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({})}));
vi.mock("@/lib/attendance-save",async original=>({...await original<typeof import("@/lib/attendance-save")>(),saveAttendance:capture.save}));
vi.mock("@/components/ui/button",()=>({Button:(props:ButtonProps)=>{const name=props["aria-label"]??(typeof props.children==="string"?props.children:"");if(name)capture.buttons.set(name,props);return createElement("button",{disabled:props.disabled,"aria-expanded":props["aria-expanded"],"aria-controls":props["aria-controls"]},props.children);}}));
vi.mock("@/components/ui/input",()=>({Input:(props:InputProps)=>{capture.input=props;return createElement("input",{value:props.value,readOnly:true});}}));
vi.mock("@/components/ui/confirm-dialog",()=>({ConfirmDialog:()=>null}));
import {AttendanceToggle} from "./AttendanceResponse";

const initial:AttendanceChange={status:"present",isLate:false,lateNote:"保存済みの連絡",absenceNote:null};
function render(value=initial){state.cursor=0;capture.buttons.clear();capture.input=null;return renderToStaticMarkup(createElement(AttendanceToggle,{scheduleId:"schedule",attendDate:"2099-11-15",userId:"me",initial:value.status,initialLate:value.isLate,initialLateNote:value.lateNote,initialAbsenceNote:value.absenceNote,onChanged:capture.changed,summary:createElement("button",null,"人数")}));}
async function click(name:string){capture.buttons.get(name)!.onClick();await Promise.resolve();}
beforeEach(()=>{state.values=[];state.cursor=0;vi.clearAllMocks();capture.save.mockImplementation(async(_client:unknown,_key:unknown,pending:AttendancePending)=>({ok:true,value:pending.after}));});

it.each(["present","absent"] as const)("edits a saved %s contact inline and keeps the editor open after saving",async status=>{
 const value={...initial,status,lateNote:status==="present"?initial.lateNote:null,absenceNote:status==="absent"?initial.lateNote:null};
 render(value);expect(capture.input).toBeNull();await click("連絡を編集");let html=render(value);
 expect(capture.input!.value).toBe(initial.lateNote);expect(html).not.toContain('role="dialog"');
 capture.input!.onChange({target:{value:"変更した連絡"}});render(value);await click("保存する");html=render(value);
 expect(capture.input!.value).toBe("変更した連絡");expect(capture.buttons.get("連絡を編集")!["aria-expanded"]).toBe(true);expect(html).toContain("保存しました");expect(capture.buttons.get("保存する")!.disabled).toBe(true);
 expect(capture.changed).toHaveBeenCalledWith(expect.objectContaining(status==="present"?{lateNote:"変更した連絡"}:{absenceNote:"変更した連絡"}));
});
it("retains an unsent draft through closing the editor and cancelling lateness",async()=>{
 const value={...initial,isLate:true};render(value);await click("連絡を編集");render(value);capture.input!.onChange({target:{value:"未送信の連絡"}});render(value);
 await click("連絡を編集");render(value);expect(capture.input).toBeNull();await click("遅刻を取り消す");render(value);await click("連絡を編集");render(value);
 expect(capture.input!.value).toBe("未送信の連絡");expect(capture.save.mock.lastCall![2].after).toMatchObject({isLate:false,lateNote:initial.lateNote});
});
it("checks an uncertain lateness save without replacing the open contact draft",async()=>{
 render();await click("連絡を編集");render();capture.input!.onChange({target:{value:"未送信の連絡"}});render();
 capture.save.mockImplementationOnce(async(_client:unknown,_key:unknown,pending:AttendancePending)=>{pending.uncertain=true;return {ok:false,reason:"unknown"};});
 await click("遅刻を連絡");let html=render();const pending=capture.save.mock.lastCall![2];expect(html).toContain('fieldset disabled=""');
 await click("保存結果を確認");html=render();
 expect(capture.save.mock.lastCall![2]).toBe(pending);expect(pending.after).toMatchObject({isLate:true,lateNote:initial.lateNote});expect(capture.input!.value).toBe("未送信の連絡");expect(html).not.toContain("保存しました");
});
it("checks an uncertain contact save using the same pending request and confirms the saved note",async()=>{
 render();await click("連絡を編集");render();capture.input!.onChange({target:{value:"送信した連絡"}});render();
 capture.save.mockImplementationOnce(async(_client:unknown,_key:unknown,pending:AttendancePending)=>{pending.uncertain=true;return {ok:false,reason:"unknown"};});
 await click("保存する");render();const pending=capture.save.mock.lastCall![2];await click("保存結果を確認");const html=render();
 expect(capture.save.mock.lastCall![2]).toBe(pending);expect(capture.input!.value).toBe("送信した連絡");expect(html).toContain("保存しました");
});
it.each(["failed","conflict"])("keeps the inline draft when contact saving returns %s",async reason=>{
 render();await click("連絡を編集");render();capture.input!.onChange({target:{value:"残す連絡"}});render();capture.save.mockResolvedValueOnce({ok:false,reason});await click("保存する");const html=render();
 expect(capture.input!.value).toBe("残す連絡");expect(capture.buttons.get("保存する")!.disabled).toBe(false);expect(html).toContain('role="alert"');expect(capture.changed).not.toHaveBeenCalled();
});
it("guards repeated sends and editor toggles while the note is saving",async()=>{
 render();await click("連絡を編集");render();capture.input!.onChange({target:{value:"一度だけ送信"}});render();
 let finish!:(result:{ok:true;value:AttendanceChange})=>void;capture.save.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const save=capture.buttons.get("保存する")!.onClick,contact=capture.buttons.get("連絡を編集")!.onClick;save();save();contact();let html=render();
 expect(capture.save).toHaveBeenCalledOnce();expect(html).toContain('fieldset disabled=""');expect(capture.buttons.get("連絡を編集")!.disabled).toBe(true);expect(capture.input!.value).toBe("一度だけ送信");
 finish({ok:true,value:capture.save.mock.lastCall![2].after});await Promise.resolve();html=render();expect(html).toContain("保存しました");expect(capture.input!.value).toBe("一度だけ送信");
});
