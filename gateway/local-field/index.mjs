import { ConstitutionalMedium } from './medium/index.mjs';
import { WAIST_PROFILE, HOLD_ACTIONS, NODE_FIELDS, ROOT_FIELDS, exactFields, passageContract, blockedDisposition } from './waist.mjs';
import { randomUUID,createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { LocalStore } from '../ledger/local-store.mjs';
import { OpenArrow } from './open-arrow.mjs';
import {REPORTING_PROFILE,evaluateReportingSettlement,inheritMaterial,verifyResearchCompilation} from './ica/f1-profile.mjs';
import {validateReturnArtifact} from './consequence/account.mjs';
import {validateResearchReturn} from './ica/journey.mjs';
import { ProjectionRuntime } from './projection.mjs';
import { Bilateral, MAX_RECORD_BYTES } from './bilateral.mjs';
import { RelationRuntime } from './relations/profile.mjs';
import { PROFILE as RELATION_PROFILE } from './relations/types.mjs';
import { isSimulationContent, guardSimulationCandidate, verifySimulationReturn } from './relations/transduction.mjs';
import { SIMULATION_DEPENDENCY } from './relations/possibility.mjs';
import { fixedSubstrate } from './relations/substrate.mjs';
import { fingerprint as formationHash } from './relations/types.mjs';
import {
  canonicalizeArgs,
  issueExecutionToken,
  validateAndBurnToken,
} from '../security/token-manager.mjs';
import { signPayload, verifySignature } from '../security/ed25519.mjs';
import {
  hash,
  requireValue,
  fresh,
  verifySigned,
  validateNode,
  nodeAt,
  verifyNodeRecord,
  resolveGrant,
} from '../security/local-field-authority.mjs';
import { evaluatePolicy } from '../governance/policy-engine.mjs';
import {
  createFilesystemExecutor,
  validateArtifactOperation,
} from '../execution/filesystem-executor.mjs';
import {
  generateReceipt,
  verifyLocalFieldReceipt,
  sealLocalFieldReceipt,
  sealLocalFieldReturn,
  verifyLocalFieldReturn,
  hashIntent,
  hashGovernance,
  hashAuthorization,
  hashExecution,
} from '../receipts/receipts.mjs';

const stamp = () => new Date().toISOString();
const clone = (x) => structuredClone(x);

/** Coordinates existing gateway owners; transport carries records, never permission. */
export class LocalField {
  static readRetainedRoom(root,record){
    const store=new LocalStore(resolve(root),{readOnly:true});
    try{
      const anchor=store.get('anchor','sourcepoint'),definition=store.get('field','definition'),b=record?.body;
      requireValue(anchor?.actor_type==='human' && anchor.primary_role==='root_authority','SOURCEPOINT_ROOT_REQUIRED');
      requireValue(store.ledger().some(e=>e.action==='field.constitute' && hash(JSON.parse(e.detail))===hash(definition)),'ROOM_CONSTITUTION_CUSTODY');
      verifySigned(definition,anchor.public_key_hex);
      requireValue(b?.type==='room_checkpoint' && b.field_id===definition.body.field_id && b.profile==='ica-rr-001.f1' && b.view?.kind==='ICAView' && b.view_hash===hash(b.view),'ROOM_CHECKPOINT_CUSTODY');
      verifySigned(record,anchor.public_key_hex);return clone(b.view);
    }finally{store.close();}
  }
  #store;
  #anchor;
  #field;
  #receiver;
  #signingKey;
  #executor;
  #tokens = new Map();
  #closed = false;
  #arrow;
  #projection;
  #bilateral;
  #relations;
  #medium;
  #waist = false;
  constructor({ root, anchor, receiver, signingKey, definition, openArrow, peers }) {
    requireValue(
      root &&
        anchor?.actor_type === 'human' &&
        anchor.primary_role === 'root_authority' &&
        /^[0-9a-f]{64}$/.test(anchor.public_key_hex),
      'SOURCEPOINT_ROOT_REQUIRED',
    );
    this.#anchor = clone(anchor);
    this.#receiver = receiver;
    this.#signingKey = signingKey;
    this.#store = new LocalStore(resolve(root));
    try {
      let saved = this.#store.get('field', 'definition');
      if (!saved) {
        requireValue(
          definition?.body?.type === 'field' &&
            definition.body.sourcepoint === anchor.principal_id &&
            definition.body.receiver_node === receiver,
          'FIELD_DEFINITION_REQUIRED',
        );
        verifySigned(definition, anchor.public_key_hex);
        fresh(definition.body);
        requireValue(
          definition.body.policy?.status === 'active' &&
            definition.body.dependencies &&
            typeof definition.body.dependencies === 'object',
          'FIELD_POLICY_REQUIRED',
        );
        this.#store.transaction(() => {
          this.#store.insert('anchor', 'sourcepoint', anchor);
          this.#store.insert('field', 'definition', definition);
          for (const [key, value] of Object.entries(
            definition.body.dependencies,
          ))
            this.#store.state('dependency', key, value);
          this.#store.append({
            intent_id: definition.body.record_id,
            action: 'field.constitute',
            agent_id: anchor.principal_id,
            status: 'constituted',
            detail: JSON.stringify(definition),
          });
        });
        saved = definition;
      }
      requireValue(
        hash(this.#store.get('anchor', 'sourcepoint')) === hash(anchor),
        'ROOT_SUBSTITUTION',
      );
      verifySigned(saved, anchor.public_key_hex);
      requireValue(
        saved.body.receiver_node === receiver,
        'RECEIVER_SUBSTITUTION',
      );
      this.#field = clone(saved.body);
      if (Object.hasOwn(this.#field.dependencies, 'si-specimen-001'))
        this.#relations = new RelationRuntime({
          store: this.#store, field: this.#field, anchor: this.#anchor, receiver, signingKey,
          record: (...args) => this.#record(...args),
        });
      if (this.#field.bilateral_profile !== undefined) {
        requireValue(this.#field.bilateral_profile === 'local-field-bilateral-v0.1', 'FIELD_PROFILE_UNSUPPORTED');
        this.#bilateral = new Bilateral({ store: this.#store, field: this.#field, anchor: this.#anchor, receiver, signingKey, peers,
          decide: (r, options) => this.#decision(r, options), record: (...args) => this.#record(...args),
          verifyReturn: chain => {
            this.#relations?.verifyReceiverRun(chain);
            this.#verifySimulation(chain);
          } });
      }
      if (this.#field.projection_runtime)
        this.#projection = new ProjectionRuntime({
          store: this.#store, field: this.#field, anchor: this.#anchor, receiver, signingKey,
        });
      if (this.#field.open_arrow)
        this.#arrow = new OpenArrow({
          store: this.#store,
          field: this.#field,
          anchor: this.#anchor,
          receiver,
          signingKey,
          library: openArrow,
        });
      for (const enrolled of this.#store.all('enrollment'))
        verifySigned(enrolled, anchor.public_key_hex);
      const receiverEnrollment = this.#store.get('enrollment', receiver);
      if (receiverEnrollment)
        requireValue(
          verifySignature(
            'local-field-receiver',
            signPayload('local-field-receiver', signingKey),
            receiverEnrollment.body.node.public_key_hex,
          ),
          'RECEIVER_KEY_MISMATCH',
        );
      // Enable trace verification before CCM replays any captured native Return.
      if (Object.hasOwn(this.#field.dependencies, 'constitutional-waist')) {
        requireValue(this.#field.dependencies['ccm-001']==='ccm-001.f0.1' &&
          this.#field.dependencies['constitutional-waist']===WAIST_PROFILE,'WAIST_PROFILE_REQUIRED');
        this.#waist=true;
      }
      if (Object.hasOwn(this.#field.dependencies, 'ccm-001'))
        this.#medium = new ConstitutionalMedium({ store: this.#store, field: this.#field, anchor: this.#anchor,
          rootCheck: record => this.#controlSignature(record),
          inspect: id => ({ ...this.inspect(id), denials: this.#store.all('denial').filter(d => d.passage_id === id) }),
          preflight: record => this.#decision(record),
          verify: id => {
            const chain = this.inspect(id);
            if (chain.receipt) return this.verify(id);
            if (!chain.return) return { valid: true, status: 'NO_NATIVE_RETURN' };
            const key = this.#store.get('enrollment', this.#receiver)?.body.node.public_key_hex;
            return { valid: verifyLocalFieldReturn(chain.return, key, { field_id: this.#field.field_id, signer_id: this.#receiver }) &&
              chain.return.passage_id === id && !chain.return.receipt_id &&
              this.#store.ledger().some(e => e.action === 'return' && hash(JSON.parse(e.detail)) === hash(chain.return)) };
          } });
      this.#store.acquireLease();
      this.#executor = createFilesystemExecutor({
        root: join(resolve(root), 'artifacts'),
        guard: (operation, permit) =>
          this.#store.transaction(() => this.#release(operation, permit)),
      });
      this.#recover();
      this.#bilateral?.recover();
      if (this.#arrow)
        for (const r of this.#store.all('passage'))
          this.#arrow.capture(this.inspect(r.body.passage_id));
      if (this.#projection)
        for (const r of this.#store.all('passage'))
          this.#projection.capture(this.inspect(r.body.passage_id));
      if (this.#relations)
        for (const r of this.#store.all('passage'))
          this.#relations.capture(this.inspect(r.body.passage_id));
      if (this.#relations)
        for (const r of this.#store.all('outgoing'))
          this.#relations.captureReturn(this.inspect(r.body.passage_id));
    } catch (e) {
      this.#store.close();
      throw e;
    }
  }
  #record(kind, id, value, status = kind) {
    this.#store.insert(kind, id, value);
    return this.#store.append({
      intent_id:
        value.passage_id ||
        value.body?.passage_id ||
        value.body?.record_id ||
        id,
      action: kind,
      agent_id: this.#receiver,
      status,
      detail: JSON.stringify(value),
    });
  }
  #controlSignature(record) {
    const b = record?.body;
    requireValue(b?.field_id === this.#field.field_id, 'FIELD_MISMATCH');
    fresh(b);
    const issuer =
      b.issuer === this.#anchor.principal_id
        ? this.#anchor
        : nodeAt(this.#store, b.issuer);
    verifySigned(record, issuer.public_key_hex);
    requireValue(
      typeof b.record_id === 'string' && b.record_id.length >= 16,
      'CONTROL_ID_REQUIRED',
    );
    return b;
  }
  control(record) {
    if (record?.body?.type === 'ccm_command') return this.ccmCommand(record);
    if (record?.body?.type === 'invocation_commit') return this.#commitInvocation(record);
    if (this.#bilateral) requireValue(Buffer.byteLength(JSON.stringify(record)) <= MAX_RECORD_BYTES, 'CONTROL_RESOURCE_LIMIT');
    canonicalizeArgs(record);
    if(record.body?.type==='reporting_capture'){
      validateReturnArtifact(record.body.content?.returned,{field_id:this.#field.field_id,sourcepoint:this.#anchor.principal_id,receiver:this.#receiver});validateResearchReturn(record.body.content?.research);
    }
    record = clone(record);
    const b = this.#controlSignature(record),
      root = b.issuer === this.#anchor.principal_id;
    const recorded = this.#store.transaction(() => {
      this.#store.useNonce('control', b.record_id);
      if(b.type==='reporting_capture'){
        exactFields(b,[...ROOT_FIELDS,'profile','candidate_id','content'],'REPORTING_CAPTURE_FIELDS');
        requireValue(root && b.profile===REPORTING_PROFILE && b.content?.profile===REPORTING_PROFILE && typeof b.candidate_id==='string','REPORTING_CAPTURE_ROOT_REQUIRED');
        const r=b.content.returned,rr=b.content.research;
        requireValue(r?.kind==='ReturnArtifact' && rr?.kind==='ResearchReturnArtifact' && rr.provenance.native_return_ref===r.return_id && this.#store.get('passage',r.passage_id),'REPORTING_RETURN_LINK_REQUIRED');
        const artifact={...record,content_hash:hash({content:b.content}),authority_effect:'NONE'};this.#record('reporting_account',b.candidate_id,artifact);return artifact;
      }
      if (['reporting_review','reporting_admission'].includes(b.type)) {
        exactFields(b,[...ROOT_FIELDS,'profile','human_choice_ref','scope',...(b.type==='reporting_review'?['candidate_id','account_digest','review_status']:['settlement_ref','target_context_ref'])],'REPORTING_CONTROL_FIELDS');
        requireValue(root && this.#store.state('dependency','f1-reporting-account')===REPORTING_PROFILE && b.profile===REPORTING_PROFILE, 'REPORTING_ROOT_PROFILE_REQUIRED');
        requireValue(typeof b.human_choice_ref==='string' && b.human_choice_ref.length>0, 'FRESH_HUMAN_CHOICE_REQUIRED');
        this.#store.useNonce('reporting-human-choice',b.human_choice_ref);
        if(b.type==='reporting_review'){
          requireValue(b.scope==='REPORTING_ACCOUNT_ONLY' && b.review_status==='accepted','REPORTING_SCOPE_REQUIRED');
          const candidate=this.#custody('reporting_account',b.candidate_id),content=candidate?.body?.content,r=content?.returned,rr=content?.research;
          requireValue(candidate && content.profile===REPORTING_PROFILE && candidate.content_hash===b.account_digest,'REPORTING_ACCOUNT_BINDING');
          requireValue(r?.kind==='ReturnArtifact' && rr?.kind==='ResearchReturnArtifact' && rr.provenance.native_return_ref===r.return_id && rr.return_completeness===r.return_completeness && rr.occurrence_knowledge===r.occurrence_knowledge,'REPORTING_RETURN_LINK_REQUIRED');
          const native=this.inspect(r.passage_id);requireValue(native.passage && native.decision,'NATIVE_REPORTING_PASSAGE_REQUIRED');
          requireValue(!native.attempt || native.attempt.attempt_id===r.execution_attempt.attempt_ref,'REPORTING_ATTEMPT_BINDING');
          if(r.occurrence_knowledge==='KNOWN_OCCURRED')requireValue(native.observation?.measurement?.status==='OBSERVED' && native.observation.measurement.content_hash===createHash('sha256').update(native.passage.body.payload.content).digest('hex') && native.observation.observation_id===r.provenance.observation_ref,'REPORTING_OCCURRENCE_BASIS_REQUIRED');
          const account={profile:REPORTING_PROFILE,return_id:r.return_id,research_return_id:rr.return_id,return_completeness:r.return_completeness,required_reports:r.required_reports,reports:r.reporting_accounts.map(x=>x.coordinate),
            occurrence_knowledge:r.occurrence_knowledge,outcome_assessment:rr.outcome_assessment,residue_refs:rr.residue,account_digest:b.account_digest,external_side_effects:!!native.attempt,hash_valid:true,lifecycle_ref:r.passage_id,sourcepoint_ref:this.#anchor.principal_id};
          const evaluation=evaluateReportingSettlement(account,{lifecycle_id:r.passage_id,sourcepoint_id:this.#anchor.principal_id},{review_status:b.review_status,sourcepoint_ref:this.#anchor.principal_id,account_digest:b.account_digest},{scope:b.scope,human_discernment_status:'ratified'});
          requireValue(evaluation.status==='SETTLED_RETURN',`REPORTING_${evaluation.status}:${evaluation.reason_code}`);
          requireValue(!this.#store.get('reporting_settlement',b.candidate_id),'REPORTING_ALREADY_ACCEPTED');
          const result={kind:'ReportingAccountSettlement',settlement_id:b.record_id,...evaluation,profile:REPORTING_PROFILE,scope:b.scope,account_digest:b.account_digest,return_ref:r.return_id,research_return_ref:rr.return_id,candidate_ref:b.candidate_id,human_review:record,
            occurrence_knowledge:r.occurrence_knowledge,outcome_assessment:rr.outcome_assessment,residue_refs:rr.residue,outstanding_obligations:rr.outstanding_obligations,authority_effect:'NONE',standing_effect:'NONE'};
          this.#record('reporting_settlement',b.candidate_id,result);this.#store.state('reporting_settlement',b.record_id,result);return result;
        }
        requireValue(b.scope==='REPORTING_ACCOUNT_MATERIAL_ONLY' && b.target_context_ref===`ica:${this.#field.field_id}:orientation`,'REPORTING_ADMISSION_SCOPE');
        const settled=this.#store.state('reporting_settlement',b.settlement_ref);requireValue(settled?.status==='SETTLED_RETURN','SETTLED_REPORTING_ACCOUNT_REQUIRED');
        requireValue(settled.settlement_id===b.settlement_ref && hash(settled)===hash(this.#custody('reporting_settlement',settled.candidate_ref)),'REPORTING_SETTLEMENT_CUSTODY');
        requireValue(!this.#store.get('reporting_inheritance',b.settlement_ref),'REPORTING_ALREADY_INHERITED');
        const version=this.#store.state('reporting_context',b.target_context_ref)??0;
        const inherited=inheritMaterial({id:b.record_id,candidate:{id:settled.candidate_ref,type:'ICA_REPORTING_ACCOUNT',sourceRef:settled.return_ref,standing:'SETTLED_REPORTING_ACCOUNT_ONLY',lineageRefs:[settled.return_ref,settled.research_return_ref,settled.settlement_id]},
          predecessorContext:{ref:b.target_context_ref,version,itemRefs:[]},admissionBasis:{id:b.record_id,valid:true,targetContextRef:b.target_context_ref,permittedTypes:['ICA_REPORTING_ACCOUNT']}});
        requireValue(inherited.ok,'NATIVE_INHERITANCE_REQUIRED');const result={...inherited.artifact,human_admission:record,settlement_ref:settled.settlement_id,residue_refs:settled.residue_refs};
        this.#record('reporting_inheritance',b.settlement_ref,result);this.#store.state('reporting_context',b.target_context_ref,version+1);return result;
      }
      if (b.type === 'enrollment') {
        requireValue(root, 'ROOT_REQUIRED');
        validateNode(b.node);
        requireValue(
          b.node.node_id !== this.#anchor.principal_id,
          'SOURCE_IS_NOT_NODE',
        );
        requireValue(
          !this.#store.get('enrollment', b.node.node_id),
          'NODE_ALREADY_ENROLLED',
        );
        requireValue(
          !this.#store
            .all('enrollment')
            .some((e) => e.body.node.public_key_hex === b.node.public_key_hex),
          'NODE_KEY_MUST_BE_DISTINCT',
        );
        requireValue(
          b.node.public_key_hex !== this.#anchor.public_key_hex,
          'ROOT_KEY_IS_NOT_NODE_KEY',
        );
        this.#record('enrollment', b.node.node_id, record);
      } else if (b.type === 'grant') {
        const g = b.grant;
        requireValue(
          g && typeof g.grant_id === 'string' && g.grant_id.length >= 16,
          'GRANT_ID_REQUIRED',
        );
        for (const key of [
          'subject',
          'action',
          'target',
          'target_node',
          'scope',
          'purpose',
        ])
          requireValue(
            typeof g[key] === 'string' && g[key].length > 0,
            'GRANT_SCOPE_REQUIRED',
          );
        requireValue(
          g.conditions && hash(g.conditions) === hash({}),
          'UNSUPPORTED_CONDITIONS',
        );
        requireValue(
          g.dependencies &&
            typeof g.dependencies === 'object' &&
            !Array.isArray(g.dependencies),
          'GRANT_DEPENDENCIES_REQUIRED',
        );
        requireValue(
          g.max_uses === null ||
            (Number.isInteger(g.max_uses) && g.max_uses > 0),
          'GRANT_USE_LIMIT_INVALID',
        );
        requireValue(
          typeof g.allow_delegation === 'boolean' &&
            (g.parent === null || typeof g.parent === 'string'),
          'GRANT_LINEAGE_INVALID',
        );
        nodeAt(this.#store, g.subject);
        nodeAt(this.#store, g.target_node);
        if (g.parent) {
          const p = this.#store.get('grant', g.parent);
          requireValue(
            p?.body.grant.allow_delegation && p.body.grant.subject === b.issuer,
            'DELEGATION_NOT_ALLOWED',
          );
          requireValue(
            Date.parse(b.expires_at) <= Date.parse(p.body.expires_at),
            'DELEGATION_EXPIRY_EXPANSION',
          );
          resolveGrant(
            this.#store,
            g.parent,
            { ...g, subject: b.issuer },
            this.#anchor,
            this.#field.field_id,
          );
        } else requireValue(root, 'ROOT_REQUIRED');
        this.#record('grant', g.grant_id, record);
      } else if (b.type === 'revocation' || b.type === 'supersession') {
        const prior = this.#store.get('grant', b.grant_id);
        requireValue(
          prior && (root || prior.body.issuer === b.issuer),
          'REVOCATION_AUTHORITY_REQUIRED',
        );
        this.#store.state(
          b.type === 'revocation' ? 'grant_revoked' : 'grant_superseded',
          b.grant_id,
          b.record_id,
        );
        this.#record('revocation', b.record_id, record);
      } else if (b.type === 'invocation_revoke') {
        this.#waistCurrent();
        exactFields(b,[...ROOT_FIELDS,'commitment_id'],'COMMITMENT_REVOCATION_FIELDS');
        requireValue(root, 'ROOT_REQUIRED');
        requireValue(this.#store.get('commitment',b.commitment_id),'COMMITMENT_UNKNOWN');
        this.#store.state('commitment_revoked',b.commitment_id,b.record_id);
        this.#record('commitment_revocation',b.record_id,record);
      } else if (b.type === 'node_revocation') {
        requireValue(root, 'ROOT_REQUIRED');
        nodeAt(this.#store, b.node_id);
        this.#store.state('node_revoked', b.node_id, b.record_id);
        this.#record('revocation', b.record_id, record);
      } else if (b.type === 'dependency') {
        requireValue(
          root && typeof b.name === 'string' && typeof b.value === 'string',
          'DEPENDENCY_CONTROL_INVALID',
        );
        this.#store.state('dependency', b.name, b.value);
        this.#record('dependency', b.record_id, record);
      } else throw new Error('CONTROL_TYPE_INVALID');
      return {
        status: 'RECORDED',
        record_id: b.record_id,
        authority_effect: b.type === 'enrollment' ? 'membership_only' : b.type,
      };
    });
    if (b.type === 'dependency') this.#medium?.dependencyChanged(record);
    return recorded;
  }
  candidate(record) {
    requireValue(record?.body?.type === 'candidate', 'CANDIDATE_REQUIRED');
    canonicalizeArgs(record);
    record = clone(record);
    verifyNodeRecord(this.#store, record, this.#field.field_id);
    if(record.body.compiler_input){verifyResearchCompilation(record.body.compiler_input,record.body.compilation);}
    requireValue(
      [
        'proposal',
        'candidate',
        'inference',
        'draft',
        'observation_claim',
        'recommended_action',
      ].includes(record.body.kind),
      'CANDIDATE_KIND_INVALID',
    );
    requireValue(
      typeof record.body.candidate_id === 'string' &&
        record.body.candidate_id.length >= 16,
      'CANDIDATE_ID_REQUIRED',
    );
    const artifact = {
      ...record,
      authority_effect: 'none',
      content_hash: hash({ content: record.body.content }),
    };
    this.#store.transaction(() => {
      this.#store.useNonce('candidate', record.body.record_id);
      this.#record('candidate', record.body.candidate_id, artifact);
    });
    return clone(artifact);
  }
  verifyRoomCheckpoint(record){
    const b=record?.body;requireValue(b?.type==='room_checkpoint' && b.field_id===this.#field.field_id && b.profile==='ica-rr-001.f1' && b.view?.kind==='ICAView' && b.view_hash===hash(b.view),'ROOM_CHECKPOINT_CUSTODY');
    verifySigned(record,this.#anchor.public_key_hex);return clone(b.view);
  }
  #request(record, { egress = false } = {}) {
    requireValue(record?.body?.type === 'passage', 'PASSAGE_REQUIRED');
    canonicalizeArgs(record);
    const p = record.body,
      node = verifyNodeRecord(this.#store, record, this.#field.field_id);
    this.#bilateral?.envelope(p);
    requireValue(p.subject === p.source_node, 'SUBJECT_BINDING');
    requireValue(
      [node.primary_role, ...node.secondary_roles].includes('proposer'),
      'PROPOSER_ROLE_REQUIRED',
    );
    requireValue(egress ? p.source_node === this.#receiver : p.target_node === this.#receiver, 'TARGET_NODE_MISMATCH');
    const receiver = nodeAt(this.#store, this.#receiver);
    const target = nodeAt(this.#store, p.target_node);
    requireValue(
      target.primary_role === 'executor' &&
        target.capabilities.includes(p.action) &&
        node.capabilities.includes(p.action),
      'CAPABILITY_MISSING',
    );
    requireValue(
      verifySignature(
        'local-field-receiver',
        signPayload('local-field-receiver', this.#signingKey),
        receiver.public_key_hex,
      ),
      'RECEIVER_KEY_MISMATCH',
    );
    for (const key of ['passage_id', 'intent_id', 'nonce', 'correlation_id'])
      requireValue(
        typeof p[key] === 'string' && p[key].length >= 16,
        `PASSAGE_${key.toUpperCase()}_REQUIRED`,
      );
    requireValue(
      p.return_requirement?.required === true &&
        p.return_requirement.to === (this.#bilateral ? p.source_node : this.#anchor.principal_id),
      'RETURN_REQUIRED',
    );
    requireValue(
      p.dependencies &&
        typeof p.dependencies === 'object' &&
        !Array.isArray(p.dependencies) &&
        p.conditions,
      'DEPENDENCIES_REQUIRED',
    );
    requireValue(p.payload_hash === hash(p.payload), 'PAYLOAD_HASH_MISMATCH');
    requireValue(
      p.origin &&
        typeof p.origin.intent === 'string' &&
        p.origin.intent.length > 0,
      'SOURCE_INTENT_REQUIRED',
    );
    if (
      ['model_runtime', 'agent_runtime'].includes(node.node_type) ||
      node.actor_type === 'ai_agent'
    )
      requireValue(p.origin.candidate_id, 'MODEL_CANDIDATE_REQUIRED');
    if (p.origin.candidate_id) {
      const c = this.#store.get('candidate', p.origin.candidate_id);
      requireValue(
        c && c.body.source_node === p.source_node,
        'CANDIDATE_ORIGIN_MISMATCH',
      );
      if (c.body.content?.profile === RELATION_PROFILE && !this.#relations)
        throw new Error('RELATION_NOT_CONFIGURED');
    }
    validateArtifactOperation(p);
    this.#medium?.guard(p);
    this.#arrow?.guard(p);
    if (p.projection && !this.#projection)
      throw new Error('PROJECTION_NOT_CONFIGURED');
    this.#projection?.guard(p);
    return p;
  }
  #decision(record, options) {
    if (this.#waist) { this.#waistCurrent(); this.#waistContract(record?.body); }
    const p = this.#request(record, options);
    const relation_binding = this.#relations?.guard(p);
    const candidate = p.origin.candidate_id ? this.#store.get('candidate', p.origin.candidate_id) : null;
    if(candidate?.body?.compiler_input){
      const input=candidate.body.compiler_input;
      requireValue(input.field_id===this.#field.field_id && input.sourcepoint===this.#anchor.principal_id && input.proposal_id===candidate.body.candidate_id && input.policy_hash===hash(this.#field.policy) && input.policy_id===this.#field.policy.policy_id,'COMPILED_CONTEXT_BINDING');
      verifyResearchCompilation(input,candidate.body.compilation);
      const request=candidate.body.compilation.oa_ir.request,actual=Object.fromEntries(Object.keys(request).map(k=>[k,p[k]]));
      requireValue(hash(request)===hash(actual),'COMPILED_PASSAGE_BINDING');
    }
    let simulation_binding;
    const simulation_config = this.#field.dependencies[SIMULATION_DEPENDENCY];
    if (simulation_config !== undefined || isSimulationContent(candidate?.body?.content)) {
      requireValue(simulation_config !== undefined, 'SIMULATION_NOT_CONFIGURED');
      requireValue(simulation_config === formationHash(fixedSubstrate()) &&
        this.#store.state('dependency', SIMULATION_DEPENDENCY) === simulation_config, 'SUBSTRATE_DRIFT');
      verifyNodeRecord(this.#store, candidate, this.#field.field_id);
      simulation_binding = guardSimulationCandidate(p, candidate, { anchor: this.#anchor, field: this.#field });
    }
    const lineage = resolveGrant(
      this.#store,
      p.authority_basis,
      p,
      this.#anchor,
      this.#field.field_id,
    );
    const intent = {
      intent_id: p.intent_id,
      action: p.action,
      agent_id: p.subject,
      parameters: { ...p.payload, target: p.target, passage: p,
        ...(simulation_binding ? { decision_surface: { ...candidate.body.content.decision_surface, expiry: {
          passage: p.expires_at, candidate: candidate.body.expires_at,
          formation_review: candidate.body.content.human_review.body.expires_at,
          effective: simulation_binding.effective_expires_at,
        } } } : {}) },
      timestamp: p.issued_at,
      target_environment: 'local',
    };
    const policy = evaluatePolicy(
      intent,
      { ...this.#field.policy, policy_hash: hash(this.#field.policy) },
      { systemMode: 'NORMAL' },
    );
    if (!['REQUIRE_HUMAN', 'AUTO_APPROVE'].includes(policy.governance_decision))
      throw Object.assign(new Error('RIO_DENIED_OR_HELD'),{ policy });
    return { intent, lineage, policy, relation_binding, simulation_binding };
  }
  admit(record, transit = null) {
    if (this.#waist) return this.#consider(record, transit);
    return this.#admitNative(record,transit);
  }
  #issueToken(p) {
    return issueExecutionToken({ intent_id:p.intent_id, approval_id:p.authority_basis, tool_name:p.action,
      args_hash:hash(p), environment:this.#field.field_id, signFn:s=>signPayload(s,this.#signingKey) });
  }
  #admitNative(record, transit = null) {
    canonicalizeArgs(record);
    record = clone(record);
    const p = record.body;
    let createdToken = false;
    try {
      return this.#store.transaction(() => {
        this.#bilateral?.transit(record, transit);
        const { intent, lineage, policy, relation_binding, simulation_binding } = this.#decision(record);
        const returnBudget = this.#bilateral?.returnBudget({ record, transit, intent, lineage, policy });
        this.#store.useNonce(`passage:${p.source_node}`, p.nonce);
        requireValue(
          !this.#store.get('passage', p.passage_id),
          'REPLAY_PASSAGE_ID',
        );
        const decision = {
          decision_id: randomUUID(),
          passage_id: p.passage_id,
          status: 'ADMITTED',
          context: 'INGRESS',
          passage_hash: hash(p),
          policy,
          authority_lineage: lineage.map((g) => g.body.grant.grant_id),
          issued_at: stamp(),
          owner: 'gateway/governance/policy-engine.mjs',
          ...(relation_binding ? { relation_binding } : {}),
          ...(simulation_binding ? { simulation_binding } : {}),
        };
        if (!this.#waist) {
          this.#tokens.set(p.passage_id, this.#issueToken(p));
          createdToken = true;
        }
        this.#record('passage', p.passage_id, record);
        this.#record('intent', p.passage_id, intent);
        this.#record('decision', p.passage_id, decision);
        if (returnBudget) this.#record('return_budget', p.passage_id, returnBudget);
        if (transit) this.#record('ingress_transit', p.passage_id, transit);
        this.#store.state('phase', p.passage_id, 'ADMITTED');
        this.#arrow?.admitted(p, decision);
        this.#projection?.admitted(p, decision);
        if (relation_binding) this.#relations.admitted(p, relation_binding);
        if (this.#waist) return this.#recordDisposition(record,'ADMIT',null,decision);
        return clone(decision);
      });
    } catch (e) {
      if (createdToken) this.#tokens.delete(p?.passage_id);
      // Invalid/unknown-node traffic is bounded diagnostic data, not an admitted passage.
      const denial = {
        denial_id: randomUUID(),
        passage_id: typeof p?.passage_id === 'string' ? p.passage_id : null,
        status: 'DENIED',
        reason: e.message,
        at: stamp(),
      };
      this.#store.transaction(() =>
        this.#record('denial', denial.denial_id, denial),
      );
      throw e;
    }
  }
  #release(operation, permit) {
    const id = permit?.passage_id,
      record = permit?.record;
    requireValue(
      id && this.#store.state('phase', id) === (this.#waist ? 'INVOKED' : 'ADMITTED'),
      'NOT_ADMITTED',
    );
    const decision = this.#store.get('decision', id),
      p = record?.body;
    let commitment, invocation;
    if (this.#waist) {
      commitment=this.#currentCommitment(id, permit.commitment_id);
      invocation=this.#custody('invocation',id);
      const b=invocation.request.body;
      verifyNodeRecord(this.#store,invocation.request,this.#field.field_id);
      requireValue(b.type==='invocation'&&b.passage_id===id&&b.source_node===p.source_node&&
        b.commitment_id===commitment.commitment_id&&b.passage_hash===hash(p)&&hash(b.passage)===hash(record),'INVOCATION_BINDING');
    }
    // Current authority concerns the immutable admitted request. A different
    // submitted operation never becomes the object authorized by this check.
    const authority = {
      decision_id: randomUUID(), passage_id: id,
      ingress_decision_id: decision.decision_id,
      passage_hash: decision.passage_hash, status: 'AUTHORIZED',
      checked_at: stamp(), owner: 'gateway/governance/policy-engine.mjs',
    };
    permit.execution_authority = authority;
    let lineage, policy, relation_binding, simulation_binding;
    try {
      ({ lineage, policy, relation_binding, simulation_binding } = this.#decision(this.#store.get('passage', id)));
      authority.authority_lineage = lineage.map(g => g.body.grant.grant_id);
      authority.policy = policy;
      if (relation_binding) authority.relation_binding = relation_binding;
      if (simulation_binding) authority.simulation_binding = simulation_binding;
    } catch (e) {
      authority.status = 'DENIED';
      authority.reason = e.message;
      throw e;
    }
    this.#record('execution_authority', id, authority);
    requireValue(
      p?.passage_id === id &&
        hash(p) === decision.passage_hash &&
        hash(operation) === hash(p),
      'FIDELITY_MUTATION',
    );
    requireValue(
      hash(policy) === hash(decision.policy),
      'FIDELITY_POLICY_CHANGED',
    );
    const token = this.#tokens.get(id);
    requireValue(token, 'FIDELITY_TOKEN_MISSING');
    const receiver = nodeAt(this.#store, this.#receiver);
    const check = validateAndBurnToken(p.intent_id, token.token, {
      tool_name: p.action,
      args_hash: hash(operation),
      environment: this.#field.field_id,
      signature: token.signature,
      verifyFn: (message, signature) =>
        verifySignature(message, signature, receiver.public_key_hex),
    });
    requireValue(check.valid, `FIDELITY_TOKEN:${check.reason}`);
    if(this.#waist) {
      // Recheck temporal burdens after cryptographic/current-authority work,
      // immediately before the durable attempt and descriptor mutation.
      fresh(invocation.request.body);fresh(commitment);fresh(commitment.warrant.body);
      fresh(this.#store.get('candidate',p.origin.candidate_id).body);
      for(const g of lineage)fresh(g.body);
    }
    for (const g of lineage) {
      const gid = g.body.grant.grant_id;
      this.#store.state('uses', gid, (this.#store.state('uses', gid) || 0) + 1);
    }
    const fidelity = {
      fidelity_id: randomUUID(),
      passage_id: id,
      status: 'PASS',
      decision_id: decision.decision_id,
      passage_hash: hash(operation),
      checks: check.checks,
      checked_at: stamp(),
    };
    this.#record('fidelity', id, fidelity);
    this.#record('attempt', id, {
      attempt_id: randomUUID(),
      passage_id: id,
      action: p.action,
      target: p.target,
      payload_hash: p.payload_hash,
      attempted_at: stamp(),
      executor_node: this.#receiver,
    });
    this.#store.state('phase', id, 'ATTEMPTED');
    this.#tokens.delete(id);
  }
  execute(id, record) {
    requireValue(!this.#waist,'WAIST_EXPLICIT_INVOCATION_REQUIRED');
    return this.#executeNative(id,record);
  }
  #executeNative(id, record, commitmentId = null) {
    requireValue(this.#store.state('phase', id) === (this.#waist ? 'INVOKED' : 'ADMITTED'), 'NOT_ADMITTED');
    canonicalizeArgs(record);
    record = clone(record);
    // Authenticate the original signer before a failure may alter that passage.
    // An unrelated enrolled node must not be able to force someone else's HOLD.
    const original = this.#store.get('passage', id).body;
    requireValue(
      record?.body?.source_node === original.source_node &&
        record.body.passage_id === id,
      'EXECUTION_CALLER_MISMATCH',
    );
    verifySigned(
      record,
      this.#store.get('enrollment', original.source_node).body.node
        .public_key_hex,
    );
    // The adapter calls its guard immediately before open/create. The guard commits
    // the durable attempt and consumes standing before any external mutation.
    const permit = { passage_id: id, record, commitment_id: commitmentId };
    const operation = clone(record.body);
    let result, occurrence;
    try {
      result = this.#executor.execute(operation, permit);
      if (!this.#waist) occurrence = this.#executor.observe(operation);
    } catch (e) {
      if (this.#store.state('phase', id) !== 'ATTEMPTED') {
        this.#store.transaction(() => {
          if (permit.execution_authority && !this.#store.get('execution_authority', id))
            this.#record('execution_authority', id, permit.execution_authority);
          this.#record('fidelity_failure', randomUUID(), {
            passage_id: id,
            status: 'FAIL',
            reason: e.message,
            checked_at: stamp(),
          });
          this.#store.state('phase', id, 'HELD');
          this.#return(id, 'FIDELITY_HOLD', null, e.message);
        });
        this.#arrow?.capture(this.inspect(id));
        this.#projection?.capture(this.inspect(id));
        this.#relations?.capture(this.inspect(id));
        throw e;
      }
      result = { status: 'FAILED', reason: e.message };
      occurrence = {
        occurrence_id: randomUUID(),
        status: 'UNKNOWN',
        target: operation.target,
        observed_at: stamp(),
        reason:
          'Execution or observation failed; non-occurrence is not inferred',
      };
    }
    if (this.#waist) {
      return this.#store.transaction(()=>{
        const execution={kind:'Execution',execution_id:randomUUID(),passage_id:id,
          attempt_id:this.#store.get('attempt',id).attempt_id,status:result.status,result,
          completed_at:stamp(),owner:'gateway/execution/filesystem-executor.mjs'};
        this.#record('execution',id,execution);
        this.#store.state('phase',id,'EXECUTED');
        return clone(execution);
      });
    }
    const returned = this.#complete(id, result, occurrence);
    this.#arrow?.capture(this.inspect(id));
    this.#projection?.capture(this.inspect(id));
    this.#relations?.capture(this.inspect(id));
    return returned;
  }
  #complete(id, result, occurrence) {
    return this.#store.transaction(() => {
      const record = this.#store.get('passage', id),
        p = record.body,
        decision = this.#store.get('decision', id),
        intent = this.#store.get('intent', id);
      this.#record('occurrence', id, occurrence);
      const governance = {
        intent_id: p.intent_id,
        status: decision.status,
        risk_level: decision.policy.risk_tier,
        requires_approval: true,
        checks: { decision },
      };
      const authorization = {
        intent_id: p.intent_id,
        decision: 'approved',
        authorized_by: this.#anchor.principal_id,
        timestamp: decision.issued_at,
        conditions: {
          lineage: decision.authority_lineage.map((g) =>
            this.#store.get('grant', g),
          ),
          passage_hash: decision.passage_hash,
        },
      };
      const execution = {
        intent_id: p.intent_id,
        action: p.action,
        connector: 'gateway/execution/filesystem-executor.mjs',
        timestamp: stamp(),
        result: {
          adapter: result,
          attempt: this.#store.get('attempt', id),
          occurrence,
          fidelity: this.#store.get('fidelity', id),
          execution_authority: this.#store.get('execution_authority', id),
          provenance: {
            proposed: p.source_node,
            admitted: this.#receiver,
            attempted: this.#receiver,
            observed: this.#receiver,
            returned: this.#receiver,
          },
          correlation_id: p.correlation_id,
          ...(this.#waist ? {waist_trace:this.#waistTrace(id)} : {}),
        },
      };
      const receipt = sealLocalFieldReceipt(
        generateReceipt({
          intent_hash: hashIntent(intent),
          governance_hash: hashGovernance(governance),
          authorization_hash: hashAuthorization(authorization),
          execution_hash: hashExecution(execution),
          intent_id: p.intent_id,
          action: p.action,
          agent_id: p.subject,
          authorized_by: this.#anchor.principal_id,
          ingestion: {
            source: 'local-field',
            channel: 'signed-passage',
            source_message_id: id,
          },
          policy: {
            evaluated: true,
            decision: 'ALLOW',
            policy_pack: this.#field.policy.policy_id,
            rules_triggered: ['EXACT_HUMAN_GRANT', 'POINT_OF_USE_FIDELITY'],
          },
        }),
        {
          field_id: this.#field.field_id,
          passage_id: id,
          signer_id: this.#receiver,
        },
        this.#signingKey,
      );
      const artifacts = { intent, governance, authorization, execution };
      this.#record('receipt_artifacts', id, artifacts);
      this.#record('receipt', id, receipt);
      const outcome =
        result.status === 'COMPLETED' && occurrence.status === 'OBSERVED'
          ? 'OBSERVED'
          : 'FAILED';
      this.#store.state('phase', id, 'COMPLETED');
      return this.#return(id, outcome, receipt.receipt_id);
    });
  }
  #return(id, outcome, receiptId = null, reason = null) {
    const p = this.#store.get('passage', id).body;
    const returned = sealLocalFieldReturn(
      {
        return_id: randomUUID(),
        passage_id: id,
        intent_id: p.intent_id,
        correlation_id: p.correlation_id,
        to: p.return_requirement.to,
        status: 'RETURNED',
        outcome,
        receipt_id: receiptId,
        reason,
        returned_at: stamp(),
      },
      { field_id: this.#field.field_id, signer_id: this.#receiver },
      this.#signingKey,
    );
    this.#record('return', id, returned);
    return clone(returned);
  }
  #recover() {
    this.#store.transaction(() => {
      for (const signed of this.#store.all('passage')) {
        const id = signed.body.passage_id,
          phase = this.#store.state('phase', id);
        if (['ADMITTED', 'COMMITTED', 'INVOKED', 'ATTEMPTED', 'EXECUTED'].includes(phase)) {
          this.#store.state('phase', id, 'HELD');
          this.#return(
            id,
            ['INVOKED','ATTEMPTED','EXECUTED'].includes(phase) ? 'UNSETTLED_ATTEMPT' : 'RESTART_HOLD',
            null,
            'No permission regenerated and no effect replayed',
          );
        }
      }
    });
  }
  inspect(id) {
    const kinds = [
      'passage',
      'intent',
      'decision',
      'execution_authority',
      'fidelity',
      'attempt',
      'occurrence',
      'receipt_artifacts',
      'receipt',
      'return',
      'ingress_transit',
      'return_egress',
      'return_transit',
      'outgoing',
      'egress',
      'outgoing_transit',
      'dispatch_attempt',
      'dispatch_residue',
      'incoming_return',
      'return_ingress',
      'return_budget',
      'relation_run',
    ];
    if (this.#waist) kinds.push('invocation','execution','observation');
    return Object.fromEntries(kinds.map((k) => [k, this.#store.get(k, id)]));
  }
  #verifySimulation(chain) {
    const p = chain.passage?.body;
    const candidate = p?.origin?.candidate_id ? this.#store.get('candidate', p.origin.candidate_id) : null;
    if (this.#field.dependencies[SIMULATION_DEPENDENCY] === undefined && !isSimulationContent(candidate?.body?.content)) {
      requireValue(!chain.decision?.simulation_binding, 'SIMULATION_RETURN_CONFORMANCE');
      return true;
    }
    verifySigned(candidate, this.#store.get('enrollment', p.source_node).body.node.public_key_hex);
    return verifySimulationReturn(chain, candidate, { anchor: this.#anchor, field: this.#field });
  }
  verify(id, supplied = null) {
    try {
      const saved = this.inspect(id),
        c = supplied || saved,
        a = c.receipt_artifacts,
        r = c.receipt;
      const key = this.#store.get('enrollment', this.#receiver).body.node
        .public_key_hex;
      const valid =
        hash(c) === hash(saved) &&
        verifyLocalFieldReceipt(r, key, {
          field_id: this.#field.field_id,
          passage_id: id,
          signer_id: this.#receiver,
        }) &&
        verifyLocalFieldReturn(c.return, key, {
          field_id: this.#field.field_id,
          signer_id: this.#receiver,
        }) &&
        r.hash_chain.intent_hash === hashIntent(a.intent) &&
        r.hash_chain.governance_hash === hashGovernance(a.governance) &&
        r.hash_chain.authorization_hash ===
          hashAuthorization(a.authorization) &&
        r.hash_chain.execution_hash === hashExecution(a.execution) &&
        hash(c.intent) === hash(a.intent) &&
        hash(c.decision) === hash(a.governance.checks.decision) &&
        hash(c.occurrence) === hash(a.execution.result.occurrence) &&
        c.return.passage_id === c.passage.body.passage_id &&
        c.return.receipt_id === r.receipt_id &&
        (!c.decision.relation_binding || this.#relations?.verify(c) === true) && this.#verifySimulation(c);
      const waistValid = !this.#waist || hash(a.execution.result.waist_trace)===hash(this.#waistTrace(id));
      return { valid:valid&&waistValid, passage_id: id };
    } catch {
      return { valid: false, passage_id: id };
    }
  }
  status() {
    return {
      open_arrows: this.#arrow?.status() || [],
      projections: this.#projection?.status() || [],
      relations: this.#relations?.status() || null,
      field: {
        field_id: this.#field.field_id,
        sourcepoint: this.#anchor.principal_id,
        receiver: this.#receiver,
      },
      nodes: this.#store.all('enrollment').map((r) => {
        let validTime = true;
        try { fresh(r.body); } catch { validTime = false; }
        return {
        ...r.body.node,
        created_at: r.body.issued_at,
        revoked_at:
          this.#store.get(
            'revocation',
            this.#store.state('node_revoked', r.body.node.node_id),
          )?.body.issued_at || null,
        status: this.#store.state('node_revoked', r.body.node.node_id)
          ? 'revoked'
          : validTime ? 'active' : 'expired',
        };
      }),
      bindings: this.#store.all('grant').map((r) => ({
        grant_id: r.body.grant.grant_id,
        subject: r.body.grant.subject,
        target_node: r.body.grant.target_node,
        parent: r.body.grant.parent,
        revoked: Boolean(
          this.#store.state('grant_revoked', r.body.grant.grant_id),
        ),
        superseded: Boolean(
          this.#store.state('grant_superseded', r.body.grant.grant_id),
        ),
        uses: this.#store.state('uses', r.body.grant.grant_id) || 0,
        ...this.#bindingState(r),
        expires_at: r.body.expires_at,
      })),
      passages: this.#store.all('passage').map((r) => ({
        passage_id: r.body.passage_id,
        phase: this.#store.state('phase', r.body.passage_id),
      })),
      decisions: this.#store.all('decision'),
      execution_authorities: this.#store.all('execution_authority'),
      holds: this.#store.all('denial'),
      fidelity: this.#store.all('fidelity'),
      fidelity_failures: this.#store.all('fidelity_failure'),
      occurrences: this.#store.all('occurrence'),
      attempts: this.#store.all('attempt'),
      receipts: this.#store.all('receipt'),
      revocations: this.#store.all('revocation'),
      returns: this.#store.all('return'),
      outgoing: this.#store.all('outgoing').map(r => ({ passage_id: r.body.passage_id, phase: this.#store.state('outgoing_phase', r.body.passage_id) })),
      egress: this.#store.all('egress'),
      egress_holds: this.#store.all('egress_hold'),
      return_egress: this.#store.all('return_egress'),
      return_ingress: this.#store.all('return_ingress'),
      return_ingress_holds: this.#store.all('return_ingress_hold'),
      dispatch_residue: this.#store.all('dispatch_residue'),
    };
  }
  #bindingState(record) {
    try {
      nodeAt(this.#store, record.body.grant.subject);
      nodeAt(this.#store, record.body.grant.target_node);
      resolveGrant(
        this.#store,
        record.body.grant.grant_id,
        record.body.grant,
        this.#anchor,
        this.#field.field_id,
      );
      return { status: 'active', reason: null };
    } catch (e) {
      return { status: 'inactive', reason: e.message };
    }
  }
  query(record) {
    const b = record?.body;
    requireValue(
      b?.type === 'query' && b.field_id === this.#field.field_id,
      'QUERY_INVALID',
    );
    fresh(b);
    const key =
      b.issuer === this.#anchor.principal_id
        ? this.#anchor.public_key_hex
        : nodeAt(this.#store, b.issuer).public_key_hex;
    verifySigned(record, key);
    requireValue(b.issuer === this.#anchor.principal_id, 'QUERY_ROOT_REQUIRED');
    if (b.view === 'ccm') {
      requireValue(Array.isArray(b.args), 'CCM_QUERY_ARGS');
      return this.ccmQuery(b.query, ...b.args);
    }
    if (b.view === 'waist') return this.waistQuery(b.passage_id);
    if (b.view === 'arrow') {
      requireValue(this.#arrow, 'OPEN_ARROW_NOT_CONFIGURED');
      return this.#arrow.view(b.arrow_id);
    }
    if (b.view === 'projection') {
      requireValue(this.#projection, 'PROJECTION_NOT_CONFIGURED');
      return this.#projection.view(b.projection_id);
    }
    if (b.view === 'ledger') return this.#store.ledger();
    return b.passage_id ? this.inspect(b.passage_id) : this.status();
  }
  assertTransport(record, surface) {
    const node = verifyNodeRecord(this.#store, record, this.#field.field_id);
    requireValue(
      node.interfaces.includes(surface),
      'NODE_INTERFACE_NOT_ALLOWED',
    );
  }
  async dispatch(record) {
    requireValue(!this.#waist,'WAIST_EXPLICIT_DISPATCH_SEQUENCE_REQUIRED');
    requireValue(this.#bilateral, 'BILATERAL_PROFILE_REQUIRED');
    const admitted = await this.#bilateral.dispatch(record);
    this.#relations?.captureReturn(this.inspect(admitted.passage_id));
    return admitted;
  }
  #waistCurrent() {
    requireValue(this.#waist,'WAIST_NOT_CONFIGURED');
    fresh(this.#field);
    requireValue(this.#store.state('dependency','constitutional-waist')===WAIST_PROFILE,'WAIST_PROFILE_CHANGED');
    requireValue(this.#store.state('dependency','ccm-001')==='ccm-001.f0.1','CCM_PROFILE_CHANGED');
  }
  #waistContract(p) {
    const candidate=this.#custody('candidate',p?.origin?.candidate_id);
    requireValue(candidate.body.type==='candidate'&&candidate.body.candidate_id===p.origin.candidate_id&&
      candidate.body.source_node===p.source_node,'WAIST_FORMATION_BINDING');
    verifyNodeRecord(this.#store,candidate,this.#field.field_id);
    return passageContract(p,candidate.body.content);
  }
  #custody(kind,id) {
    const value=this.#store.get(kind,id);
    requireValue(value && this.#store.ledger().some(e=>e.action===kind && hash(JSON.parse(e.detail))===hash(value)), 'WAIST_RECORD_CUSTODY');
    return value;
  }
  #latestDisposition(id) {
    const key=this.#store.state('waist_latest',id);
    if (!key) return null;
    const decisions=this.#store.all('waist_decision').filter(x=>x.passage_id===id);
    requireValue(decisions.at(-1)?.decision_id===key,'WAIST_DECISION_CUSTODY');
    return this.#custody('waist_decision',key);
  }
  #recordDisposition(record,disposition,reason,native=null) {
    const p=record.body,id=p.passage_id, prior=this.#latestDisposition(id);
    if(!this.#store.get('waist_candidate',id)) this.#record('waist_candidate',id,record);
    const w=this.#waistContract(p),formation=this.#store.get('candidate',p.origin.candidate_id);
    const result={kind:'Disposition',decision_id:native?.decision_id||randomUUID(),passage_id:id,passage_hash:hash(p),
      disposition,reason,previous_decision_id:prior?.decision_id||null,issued_at:stamp(),
      source_authority:this.#anchor.principal_id,interval_id:w.interval_id,formation_ref:p.origin.candidate_id,formation_hash:hash(formation.body),
      standing:this.#medium.query('UnderWhoseAuthority',w.interval_id),
      native_decision_id:native?.decision_id||null,owner:'gateway/local-field/index.mjs'};
    this.#record('waist_decision',result.decision_id,result);
    this.#store.state('waist_latest',id,result.decision_id);
    return clone(result);
  }
  #consider(record,transit) {
    this.#waistCurrent(); canonicalizeArgs(record); record=clone(record);
    requireValue(Buffer.byteLength(JSON.stringify(record))<=MAX_RECORD_BYTES,'WAIST_RESOURCE_LIMIT');
    const p=record?.body;
    verifyNodeRecord(this.#store,record,this.#field.field_id);
    requireValue(p.type==='passage'&&p.source_node===p.subject && typeof p.passage_id==='string'&&p.passage_id.length>=16,'WAIST_CANDIDATE');
    this.#waistContract(p);
    const prior=this.#latestDisposition(p.passage_id);
    if(prior) {
      requireValue(prior.passage_hash===hash(p),'WAIST_CANDIDATE_IMMUTABLE');
      this.#custody('waist_candidate',p.passage_id);
      if(prior.disposition!=='HOLD') return clone({...prior,decision_time_basis:'HISTORICAL_RECORDED_DECISION',
        current_eligibility:prior.disposition==='ADMIT'?this.#medium.query('WhatMayRightfullyFollow',prior.interval_id,p):
          {status:prior.disposition,reason:'TERMINAL_CANDIDATE_DISPOSITION'}});
      requireValue(!this.#store.state('waist_withdrawn',p.passage_id),'CANDIDATE_WITHDRAWN');
      requireValue(this.#store.all('hold_step').some(x=>x.decision_id===prior.decision_id),'HOLD_STEP_REQUIRED');
      requireValue(this.#store.all('waist_decision').filter(x=>x.passage_id===p.passage_id).length<16,'HOLD_BUDGET');
    }
    try { this.#decision(record); }
    catch(error) {
      return this.#store.transaction(()=>this.#recordDisposition(record,blockedDisposition(error),error.message));
    }
    return this.#admitNative(record,transit);
  }
  #commitInvocation(record) {
    this.#waistCurrent(); canonicalizeArgs(record); record=clone(record);
    const b=this.#controlSignature(record);
    requireValue(b.issuer===this.#anchor.principal_id,'ROOT_REQUIRED');
    exactFields(b,[...ROOT_FIELDS,'passage_id','passage_hash','decision_id'],'COMMITMENT_FIELDS');
    const d=this.#latestDisposition(b.passage_id);
    requireValue(d?.disposition==='ADMIT'&&this.#store.state('phase',b.passage_id)==='ADMITTED','NOT_ADMITTED');
    requireValue(d.decision_id===b.decision_id&&d.passage_hash===b.passage_hash,'DECISION_BINDING');
    const p=this.#store.get('passage',b.passage_id).body;
    const {policy,lineage}=this.#decision(this.#store.get('passage',b.passage_id));
    requireValue(hash(policy)===hash(this.#store.get('decision',b.passage_id).policy),'FIDELITY_POLICY_CHANGED');
    let token;
    try {
      const committed=this.#store.transaction(()=>{
        this.#store.useNonce('control',b.record_id);
        token=this.#issueToken(p);
        const expires_at=new Date(Math.min(Date.parse(b.expires_at),Date.parse(p.expires_at),Date.parse(this.#field.expires_at),
          Date.parse(this.#store.get('candidate',p.origin.candidate_id).body.expires_at),
          Date.parse(token.expires_at),...lineage.map(g=>Date.parse(g.body.expires_at)))).toISOString();
        const c={kind:'InvocationCommitment',commitment_id:b.record_id,passage_id:p.passage_id,passage_hash:hash(p),
          decision_id:d.decision_id,warrant:record,issued_at:b.issued_at,expires_at,
          token_id:token.token_id,authority_basis:p.authority_basis,owner:'gateway/security/token-manager.mjs'};
        this.#record('commitment',c.commitment_id,c);
        this.#store.state('waist_commitment',p.passage_id,c.commitment_id);
        this.#store.state('phase',p.passage_id,'COMMITTED'); return c;
      });
      this.#tokens.set(p.passage_id,token);
      return clone(committed);
    } catch(e) { this.#tokens.delete(p.passage_id); throw e; }
  }
  #currentCommitment(id,commitmentId) {
    this.#waistCurrent();
    requireValue(commitmentId&&this.#store.state('waist_commitment',id)===commitmentId,'COMMITMENT_BINDING');
    const c=this.#custody('commitment',commitmentId);
    verifySigned(c.warrant,this.#anchor.public_key_hex);fresh(c.warrant.body);fresh(c);
    requireValue(c.warrant.body.issuer===this.#anchor.principal_id && c.warrant.body.type==='invocation_commit' &&
      c.warrant.body.passage_id===id && c.warrant.body.record_id===c.commitment_id &&
      c.warrant.body.decision_id===c.decision_id && c.warrant.body.passage_hash===c.passage_hash,'COMMITMENT_BINDING');
    requireValue(!this.#store.state('commitment_revoked',commitmentId),'COMMITMENT_REVOKED');
    const d=this.#latestDisposition(id);
    requireValue(d?.disposition==='ADMIT'&&d.decision_id===c.decision_id&&d.passage_hash===c.passage_hash,'DECISION_BINDING');
    requireValue(this.#tokens.get(id)?.token_id===c.token_id,'FIDELITY_TOKEN_MISSING');
    return c;
  }
  #waistCaller(record,id) {
    const node=verifyNodeRecord(this.#store,record,this.#field.field_id);
    const p=this.#custody('waist_candidate',id).body;
    requireValue(node.node_id===p.source_node&&record.body.passage_id===id,'WAIST_CALLER_MISMATCH');
    requireValue(typeof record.body.record_id==='string'&&record.body.record_id.length>=16,'CONTROL_ID_REQUIRED');
    return p;
  }
  invoke(record) {
    this.#waistCurrent();canonicalizeArgs(record);record=clone(record);
    requireValue(Buffer.byteLength(JSON.stringify(record))<=MAX_RECORD_BYTES,'WAIST_RESOURCE_LIMIT');
    const b=record?.body;
    exactFields(b,[...NODE_FIELDS,'passage_id','passage_hash','commitment_id','passage'],'INVOCATION_FIELDS');
    requireValue(b.type==='invocation','INVOCATION_FIELDS');
    const p=this.#waistCaller(record,b.passage_id);
    requireValue(this.#store.state('phase',b.passage_id)==='COMMITTED','NOT_COMMITTED');
    const c=this.#currentCommitment(b.passage_id,b.commitment_id);
    requireValue(b.passage_hash===c.passage_hash&&hash(b.passage?.body)===c.passage_hash&&hash(p)===c.passage_hash,'INVOCATION_BINDING');
    verifySigned(b.passage,nodeAt(this.#store,p.source_node).public_key_hex);
    this.#decision(this.#store.get('passage',b.passage_id));
    this.#store.transaction(()=>{
      this.#store.useNonce('waist-action',b.record_id);
      this.#record('invocation',b.passage_id,{kind:'Invocation',invocation_id:b.record_id,passage_id:b.passage_id,
        commitment_id:c.commitment_id,decision_id:c.decision_id,request:record,invoked_at:stamp()});
      this.#store.state('phase',b.passage_id,'INVOKED');
    });
    return this.#executeNative(b.passage_id,b.passage,c.commitment_id);
  }
  observe(record) {
    this.#waistCurrent();canonicalizeArgs(record);record=clone(record);
    const b=record?.body;
    exactFields(b,[...NODE_FIELDS,'passage_id','execution_id'],'OBSERVATION_FIELDS');
    requireValue(b.type==='observation_request','OBSERVATION_FIELDS');
    const p=this.#waistCaller(record,b.passage_id);
    requireValue(this.#store.state('phase',b.passage_id)==='EXECUTED','NOT_EXECUTED');
    const e=this.#custody('execution',b.passage_id);
    requireValue(e.execution_id===b.execution_id,'EXECUTION_BINDING');
    this.#waistTrace(b.passage_id);
    let measurement,status='RECORDED';
    try { measurement=this.#executor.observe(p); }
    catch(error) { status='FAILED';measurement={occurrence_id:randomUUID(),status:'UNKNOWN',target:p.target,observed_at:stamp(),
      reason:`Independent readback failed (${error.code||error.message}); execution success does not establish occurrence`}; }
    const observation={kind:'Observation',observation_id:randomUUID(),passage_id:b.passage_id,execution_id:e.execution_id,
      status,request:record,measurement,owner:'gateway/execution/filesystem-executor.mjs'};
    this.#store.transaction(()=>{this.#store.useNonce('waist-action',b.record_id);this.#record('observation',b.passage_id,observation);});
    const returned=this.#complete(b.passage_id,e.result,{...measurement,observation_ref:observation.observation_id});
    this.#arrow?.capture(this.inspect(b.passage_id));this.#projection?.capture(this.inspect(b.passage_id));this.#relations?.capture(this.inspect(b.passage_id));
    return returned;
  }
  hold(record) {
    this.#waistCurrent();canonicalizeArgs(record);record=clone(record);
    const b=record?.body;
    exactFields(b,[...NODE_FIELDS,'passage_id','decision_id','action'],'HOLD_FIELDS');
    requireValue(b.type==='hold_action'&&HOLD_ACTIONS.includes(b.action),'HOLD_ACTION_INVALID');
    const p=this.#waistCaller(record,b.passage_id), d=this.#latestDisposition(b.passage_id);
    requireValue(d?.disposition==='HOLD'&&d.decision_id===b.decision_id&&!this.#store.state('waist_withdrawn',b.passage_id),'NOT_HELD');
    requireValue(this.#store.all('hold_step').filter(x=>x.passage_id===b.passage_id).length<32,'HOLD_BUDGET');
    const result={kind:'HoldStep',step_id:b.record_id,passage_id:b.passage_id,decision_id:d.decision_id,action:b.action,
      consequential:false,request:record,performed_at:stamp(),
      result:{standing:this.#medium.query('UnderWhoseAuthority',d.interval_id),
        eligibility:this.#medium.query('WhatMayRightfullyFollow',d.interval_id,p),
        next:b.action==='REQUEST_SOURCEPOINT'?'LOCAL_REQUEST_RECORDED':b.action==='WITHDRAW'?'WITHDRAWN':'FRESH_DECISION_REQUIRED'}};
    this.#store.transaction(()=>{this.#store.useNonce('waist-action',b.record_id);this.#record('hold_step',result.step_id,result);
      if(b.action==='WITHDRAW')this.#store.state('waist_withdrawn',b.passage_id,true);});
    return clone(result);
  }
  #waistTrace(id) {
    const decisions=this.#store.all('waist_decision').filter(x=>x.passage_id===id).map(x=>this.#custody('waist_decision',x.decision_id));
    const steps=this.#store.all('hold_step').filter(x=>x.passage_id===id).map(x=>this.#custody('hold_step',x.step_id));
    const key=this.#store.state('waist_commitment',id);
    const get=kind=>this.#store.get(kind,id)?this.#custody(kind,id):null;
    const candidate=get('waist_candidate'),p=candidate?.body;
    const formation=p?this.#custody('candidate',p.origin.candidate_id):null;
    const commitment=key?this.#custody('commitment',key):null,invocation=get('invocation'),execution=get('execution'),observation=get('observation');
    const historical=r=>{
      requireValue(r.body.field_id===this.#field.field_id&&r.body.source_node===p.source_node,'WAIST_TRACE_BINDING');
      verifySigned(r,this.#store.get('enrollment',p.source_node).body.node.public_key_hex);
    };
    if(p) {
      historical(candidate);historical(formation);passageContract(p,formation.body.content);
      requireValue(formation.body.candidate_id===p.origin.candidate_id,'WAIST_TRACE_BINDING');
      for(const d of decisions)requireValue(d.passage_hash===hash(p)&&d.formation_ref===p.origin.candidate_id&&
        d.formation_hash===hash(formation.body),'WAIST_TRACE_BINDING');
    }
    if(commitment) {
      verifySigned(commitment.warrant,this.#anchor.public_key_hex);
      requireValue(commitment.warrant.body.issuer===this.#anchor.principal_id&&commitment.passage_id===id&&
        commitment.passage_hash===hash(p)&&commitment.warrant.body.passage_hash===hash(p)&&
        commitment.warrant.body.record_id===commitment.commitment_id&&commitment.warrant.body.passage_id===id&&
        commitment.warrant.body.decision_id===commitment.decision_id&&
        decisions.some(d=>d.decision_id===commitment.decision_id&&d.disposition==='ADMIT'),'WAIST_TRACE_BINDING');
    }
    if(invocation) {
      historical(invocation.request);const b=invocation.request.body;
      requireValue(b.passage_id===id&&b.commitment_id===commitment?.commitment_id&&b.passage_hash===hash(p)&&
        hash(b.passage)===hash(candidate)&&invocation.commitment_id===commitment.commitment_id,'WAIST_TRACE_BINDING');
    }
    if(execution) requireValue(invocation&&execution.passage_id===id&&execution.attempt_id===this.#custody('attempt',id).attempt_id&&
      execution.status===execution.result.status,'WAIST_TRACE_BINDING');
    if(observation) {
      historical(observation.request);
      requireValue(execution&&observation.request.body.execution_id===execution.execution_id&&
        observation.execution_id===execution.execution_id&&observation.request.body.passage_id===id&&
        observation.measurement.target===p.target,'WAIST_TRACE_BINDING');
    }
    for(const step of steps){historical(step.request);requireValue(step.passage_id===id&&step.request.body.passage_id===id&&
      step.request.body.action===step.action&&step.request.body.decision_id===step.decision_id&&
      decisions.some(d=>d.decision_id===step.decision_id&&d.disposition==='HOLD'),'WAIST_TRACE_BINDING');}
    return {profile:WAIST_PROFILE,candidate,formation,decisions,hold_steps:steps,commitment,invocation,execution,observation};
  }
  waistQuery(id) {
    requireValue(this.#waist,'WAIST_NOT_CONFIGURED');
    const trace=this.#waistTrace(id), chain=this.inspect(id);
    return clone({...trace,latest:this.#latestDisposition(id),latest_time_basis:'HISTORICAL_RECORDED_DECISION',phase:this.#store.state('phase',id),attempt:chain.attempt,
      occurrence:chain.occurrence,return:chain.return,receipt:chain.receipt,actuator:chain.attempt?1:0,
      evidence:null,settlement:'UNESTABLISHED',home_mutation:'NOT_INVOKED',source_authority:this.#anchor.principal_id});
  }
  receive(transit) {
    requireValue(this.#bilateral, 'BILATERAL_PROFILE_REQUIRED');
    requireValue(!this.#waist,'WAIST_EXPLICIT_RECEIVE_SEQUENCE_REQUIRED');
    const record = transit?.body?.passage;
    this.admit(record, transit);
    try { this.execute(record.body.passage_id, record); }
    catch (e) { if (!this.#store.get('return', record.body.passage_id)) throw e; }
    return this.#bilateral.emitReturn(this.inspect(record.body.passage_id));
  }
  admitReturn(transit) {
    requireValue(this.#bilateral, 'BILATERAL_PROFILE_REQUIRED');
    const admitted = this.#bilateral.admitReturn(transit);
    this.#relations?.captureReturn(this.inspect(admitted.passage_id));
    return admitted;
  }
  ccmCommand(record) {
    requireValue(this.#medium, 'CCM_NOT_CONFIGURED');
    return this.#medium.apply(record);
  }
  ccmQuery(name, ...args) {
    requireValue(this.#medium, 'CCM_NOT_CONFIGURED');
    return this.#medium.query(name, ...args);
  }
  arrow(record) {
    requireValue(this.#arrow, 'OPEN_ARROW_NOT_CONFIGURED');
    return clone(this.#arrow.handle(record));
  }
  projection(record) {
    requireValue(this.#projection, 'PROJECTION_NOT_CONFIGURED');
    return clone(this.#projection.handle(record));
  }
  operateProjection(record) {
    requireValue(this.#projection, 'PROJECTION_NOT_CONFIGURED');
    this.admit(record);
    return this.execute(record.body.passage_id, record);
  }
  assertControlTransport(record, surface) {
    const body = this.#controlSignature(record);
    if (body.issuer !== this.#anchor.principal_id)
      requireValue(
        nodeAt(this.#store, body.issuer).interfaces.includes(surface),
        'NODE_INTERFACE_NOT_ALLOWED',
      );
  }
  close() {
    if (!this.#closed) {
      this.#executor?.close();
      this.#store.close();
      this.#closed = true;
    }
  }
}
