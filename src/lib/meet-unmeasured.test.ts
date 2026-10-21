import {expect,it} from "vitest";
import {emptyPerformance,MeetEvent,MeetMark} from "./meet-operations";
import {obResultRanks} from "./ob-result-ranking";
import {emptyRelayResults,relayRanks,validateRelayResults} from "./competition-meet-relay";
import {fixtureMeet} from "./__fixtures__/competition-meet";
import {meetResultRows} from "./competition-meet-results";
import {competitionMeetObExport} from "./competition-meet-export";

it("saves an unmeasured appearance through confirmation without awarding a place",()=>{
 const rule={name:"1500m",discipline:"track" as const,wind:false};
 const unmeasured={...emptyPerformance("pacer"),trials:[{mark:"-",status:"valid" as const,wind:""}]};
 const timed={...emptyPerformance("runner"),trials:[{mark:"4:30.00",status:"valid" as const,wind:""}]};
 const event=new MeetEvent(rule,{participants:[unmeasured,timed],confirmed:true});
 expect(event.validate()).toBeNull();expect(event.best(unmeasured)).toBe("-");
 expect(MeetMark.parse("-","track")).toBeNull();
 expect([...obResultRanks(rule,event.data.participants)]).toEqual([["runner",1]]);
 expect(new MeetEvent(rule,{participants:[{...unmeasured,trials:[]}],confirmed:true}).validate()).not.toBeNull();
 expect(new MeetEvent(rule,{participants:[{...unmeasured,trials:[{...unmeasured.trials[0],mark:"abc"}]}],confirmed:false}).validate()).not.toBeNull();
});
it("accepts an unmeasured relay team and keeps it out of the numeric rankings",()=>{
 const teams=emptyRelayResults();teams[0].name="引っ張り";teams[0].time="-";
 teams[1].name="計測済み";teams[1].time="2:45.67";
 expect(validateRelayResults(teams,true)).toBeNull();expect([...relayRanks(teams)]).toEqual([[2,1]]);
 teams[0].name="";expect(validateRelayResults(teams)).not.toBeNull();
});
it("retains the hyphen in published results and exported performance data",()=>{
 const meet=fixtureMeet();
 meet.appearances[0].performance.trials=[{mark:"-",status:"valid",wind:""}];
 const row=meetResultRows(meet,"2026-10-21")[0];
 expect(row.tuatEntries.find(entry=>entry.id==="a")?.result).toEqual({place:null,record:"-"});
 expect(row.tuatEntries.find(entry=>entry.id==="b")?.result?.place).toBe("1");
 expect(competitionMeetObExport(meet).operations[0].data.participants[0].trials[0].mark).toBe("-");
});
