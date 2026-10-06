/** Timing-only synthetic sources stay at this edge. Only FieldSignals leave it. */
import { extractCalendarSignals } from '../meteorology/calendar-edge.mjs';
import { extractGitSignals } from '../meteorology/git-edge.mjs';
import { freezeData } from '../meteorology/evaluator.mjs';
export function referenceSignals(now=new Date().toISOString()) {
 if(typeof now!=='string')throw new Error('REFERENCE_TIME_INVALID');
 const end=Date.parse(now);if(!Number.isFinite(end))throw new Error('REFERENCE_TIME_INVALID');
 const day=86400000,at=(n,h=0)=>new Date(end+n*day+h*3600000).toISOString();
 const window=n=>({start:at(n-1),end:at(n)});
 function calendar(n,tight=false){const start=end+(n-1)*day+9*3600000;
  return {window:window(n),work_start:new Date(start).toISOString(),work_end:new Date(start+8*3600000).toISOString(),minimum_buffer_minutes:15,
   events:(tight?[[0,2.3466666667],[2.3466666667,4.6933333333],[4.6933333333,7.04]]:[[0,1],[2,3],[5,7]])
    .map(([a,b])=>({start:new Date(start+a*3600000).toISOString(),end:new Date(start+b*3600000).toISOString()}))};}
 function git(n,tight=false){return {window:window(n),pull_requests:[tight?{created_at:at(n,-84),first_review_at:null}:{created_at:at(n-1),first_review_at:at(n-1,6)}],
  commits:Array.from({length:tight?40:10},(_,i)=>({timestamp:at(n-1,1+i/60)}))};}
 const signals=(n,tight)=>[...extractCalendarSignals({current:calendar(n,tight),previous:calendar(n-1)}),
  ...extractGitSignals({current:git(n,tight),previous:git(n-1),rolling_daily_commit_median:10})];
 return freezeData({kind:'ReferenceSignalReplay',source_contract:'Timing-only synthetic Calendar/Git replay; no live source connection',
  initial:signals(-1,false),changed:signals(0,true),initial_timestamp:at(-1),changed_timestamp:at(0)});
}
