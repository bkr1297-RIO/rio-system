import type {ReportingAccountSettlement,ReportingInheritance,ResearchCompilation} from '../../local-field/ica/f1-profile.mjs';
import type {Permission,Attempt,ReturnArtifact} from '../../local-field/consequence/account.mjs';
declare const s:ReportingAccountSettlement,i:ReportingInheritance,c:ResearchCompilation;
// @ts-expect-error accepted reporting is not permission
const p:Permission=s;
// @ts-expect-error separate inheritance creates no attempt
const a:Attempt=i;
// @ts-expect-error successful compilation is not a Return
const r:ReturnArtifact=c;
// @ts-expect-error Return does not construct settlement
const settlement:ReportingAccountSettlement=r;
void p;void a;void r;void settlement;
