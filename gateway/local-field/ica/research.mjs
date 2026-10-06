/** Pure bounded investigation. Findings describe scoped signals, never private source content. */
import {randomUUID} from 'node:crypto';
import {freezeData,validateReading} from '../meteorology/evaluator.mjs';
export const RESEARCH_OFFICE=freezeData({kind:'Office',office_id:'Research',name:'Research',charter_version:'ica-research.f0.1',
 permitted_sources:['CALENDAR','GIT'],permitted_programs:['bounded-reading-investigation.f0.1'],permitted_instruments:['Metascope'],
 permitted_consequences:[{action:'create_document',target:'research-return.json',max_bytes:4096,max_effects:1}],
 non_jurisdiction:['production','messaging','scheduling','funds','extra_sources','subdelegation','standing','settlement'],
 authority_supplied:false});
export function investigate(readings,delegation){
 if(!Array.isArray(readings)||readings.length<1||readings.length>3||!delegation||delegation.office!=='Research')throw new Error('RESEARCH_INPUT_BOUND');
 for(const r of readings){validateReading(r);if(!delegation.reading_refs.includes(r.reading_id))throw new Error('READING_NOT_DELEGATED');}
 const ordered=[...new Map(readings.map(r=>[r.reading_id,r])).values()].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)),first=ordered[0],last=ordered.at(-1);
 const metric=(r,n)=>r.signal_manifest.find(s=>s.signal_type===n),refs=ordered.map(r=>r.reading_id);
 const findings=[];
 function finding(question,status,text,metrics){findings.push({finding_id:randomUUID(),question,status,text,
  provenance:{reading_refs:refs,signal_refs:ordered.flatMap(r=>r.signal_manifest.filter(s=>metrics.includes(s.signal_type)).map(s=>s.signal_id)),
   source_contract:'SCOPED_SYNTHETIC_SIGNALS',scope:'Derived timing signals within the authorized replay; no claim about private content or future events'},
  constitutional_standing:'NOT_SUPPLIED'});}
 const pair=metrics=>{const frames=ordered.filter(r=>metrics.every(n=>metric(r,n)));return frames.length>=2&&Date.parse(frames[0].timestamp)<Date.parse(frames.at(-1).timestamp)?[frames[0],frames.at(-1)]:null;};
 const calendar=pair(['available_time_margin']),git=pair(['commit_velocity','review_latency']);
 finding('CALENDAR_CHANGE',calendar?'ESTABLISHED':'UNKNOWN',calendar?
  `Available time changed from ${metric(calendar[0],'available_time_margin').magnitude.toFixed(2)} to ${metric(calendar[1],'available_time_margin').magnitude.toFixed(2)} in the authorized frames.`:'Two distinct authorized Calendar frames with available-time measurements are missing.',['available_time_margin','meeting_density','buffer_compression']);
 finding('GIT_CHANGE',git?'ESTABLISHED':'UNKNOWN',git?
  `Commit activity changed from ${metric(git[0],'commit_velocity').magnitude.toFixed(2)} to ${metric(git[1],'commit_velocity').magnitude.toFixed(2)}; review wait changed from ${metric(git[0],'review_latency').magnitude.toFixed(2)} to ${metric(git[1],'review_latency').magnitude.toFixed(2)}.`:'Two distinct authorized Git frames with commit activity and review wait are missing.',['commit_velocity','review_latency','open_pr_age']);
 const recurrence=ordered.some(r=>r.reading_id!==last.reading_id&&Date.parse(r.timestamp)<Date.parse(last.timestamp)&&r.atmospheric_regime==='PRESSURE_DIFFERENTIAL');
 finding('PRIOR_RECURRENCE',recurrence?'ESTABLISHED':'UNKNOWN',recurrence?'An earlier authorized frame also contains a candidate pressure differential. This establishes recurrence in this replay only.':
  'The available earlier frame does not establish a prior pressure differential. Earlier history is absent; we cannot tell whether this has happened before.',['available_time_margin','commit_velocity','review_latency']);
 return freezeData({kind:'ResearchFindings',research_id:randomUUID(),delegation_id:delegation.delegation_id,subject:delegation.subject,
  findings,knowledge:recurrence?'ESTABLISHED':'UNKNOWN',outcome:recurrence?'ESTABLISHED_IN_REPLAY':'UNRESOLVED',
  observation_coverage:{frames:ordered.length,from:first.timestamp,to:last.timestamp,source_contract:'SCOPED_SYNTHETIC_SIGNALS'},
  authorization_supplied:false});
}
