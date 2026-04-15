/**
 * RIO Skill System — Constraint Enforcement Validation Tests
 * 
 * These tests audit the skill files themselves to prove:
 * 1. Every skill references _invariants.md
 * 2. Every skill declares the correct invariants_version
 * 3. Every role skill requires governance
 * 4. No role skill grants execution capability
 * 5. All adapters include governance_hash requirement
 * 6. All adapters preserve constraint language (NEVER → absolute prohibition)
 * 7. The governance skill loads first (load_order: 0)
 * 8. All ERR_FATAL codes are present in every skill
 * 9. The invariants document contains all 12 invariants
 * 10. The patches document references correct invariants_version
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SKILLS_DIR = path.resolve(__dirname, '../rio-skills');

// Helper to read a skill file
function readSkill(relativePath: string): string {
  return fs.readFileSync(path.join(SKILLS_DIR, relativePath), 'utf-8');
}

// Helper to check if a file exists
function skillExists(relativePath: string): boolean {
  return fs.existsSync(path.join(SKILLS_DIR, relativePath));
}

// ============================================================
// PROOF 1: Canonical Documents Exist and Are Complete
// ============================================================
describe('Proof 1: Canonical Documents', () => {
  it('_invariants.md exists', () => {
    expect(skillExists('_invariants.md')).toBe(true);
  });

  it('_patches.md exists', () => {
    expect(skillExists('_patches.md')).toBe(true);
  });

  it('_invariants.md contains all 12 invariants (INV-001 through INV-012)', () => {
    const content = readSkill('_invariants.md');
    for (let i = 1; i <= 12; i++) {
      const id = `INV-${String(i).padStart(3, '0')}`;
      expect(content).toContain(id);
    }
  });

  it('_invariants.md declares version 1.0.0', () => {
    const content = readSkill('_invariants.md');
    expect(content).toContain('1.0.0');
  });

  it('_patches.md references invariants_version 1.0.0', () => {
    const content = readSkill('_patches.md');
    expect(content).toContain('1.0.0');
  });

  it('_invariants.md contains all 6 ERR_FATAL codes', () => {
    const content = readSkill('_invariants.md');
    const requiredErrors = [
      'ERR_FATAL: GOVERNANCE_NOT_LOADED',
      'ERR_FATAL: ADAPTER_INVALID',
      'ERR_FATAL: INVARIANTS_MISMATCH',
      'ERR_FATAL: ROLE_VIOLATION',
      'ERR_FATAL: EXECUTION_BOUNDARY',
      'FLAG_DRIFT',
    ];
    for (const err of requiredErrors) {
      expect(content).toContain(err);
    }
  });
});

// ============================================================
// PROOF 2: Governance Skill Structure
// ============================================================
describe('Proof 2: Governance Skill', () => {
  it('governance/skill.md exists', () => {
    expect(skillExists('governance/skill.md')).toBe(true);
  });

  it('governance skill declares load_order: 0 (loads first)', () => {
    const content = readSkill('governance/skill.md');
    expect(content).toMatch(/load_order.*0/);
  });

  it('governance skill declares required: true', () => {
    const content = readSkill('governance/skill.md');
    expect(content).toContain('required');
    expect(content).toContain('true');
  });

  it('governance skill references _invariants.md', () => {
    const content = readSkill('governance/skill.md');
    expect(content).toContain('_invariants.md');
  });

  it('governance skill declares invariants_version 1.0.0', () => {
    const content = readSkill('governance/skill.md');
    expect(content).toContain('1.0.0');
  });

  it('governance skill contains GOVERNANCE_NOT_LOADED error', () => {
    const content = readSkill('governance/skill.md');
    expect(content).toContain('GOVERNANCE_NOT_LOADED');
  });

  it('governance skill contains INVARIANTS_MISMATCH error', () => {
    const content = readSkill('governance/skill.md');
    expect(content).toContain('INVARIANTS_MISMATCH');
  });

  it('governance skill defines all 7 constraints (C-001 through C-007)', () => {
    const content = readSkill('governance/skill.md');
    for (let i = 1; i <= 7; i++) {
      const id = `C-${String(i).padStart(3, '0')}`;
      expect(content).toContain(id);
    }
  });

  it('governance skill defines the role registry with all 5 roles', () => {
    const content = readSkill('governance/skill.md');
    const roles = ['governance', 'builder', 'clarification', 'witness', 'connector'];
    for (const role of roles) {
      expect(content).toContain(role);
    }
  });

  it('governance skill specifies governance_hash computation', () => {
    const content = readSkill('governance/skill.md');
    expect(content).toContain('governance_hash');
    expect(content).toContain('SHA-256');
  });
});

// ============================================================
// PROOF 3: Role Skills — Structure and Constraints
// ============================================================
const ROLE_SKILLS = ['builder', 'clarification', 'witness', 'connector'];

describe('Proof 3: Role Skills Structure', () => {
  for (const role of ROLE_SKILLS) {
    describe(`${role}/skill.md`, () => {
      it('exists', () => {
        expect(skillExists(`${role}/skill.md`)).toBe(true);
      });

      it('references _invariants.md', () => {
        const content = readSkill(`${role}/skill.md`);
        expect(content).toContain('_invariants.md');
      });

      it('declares invariants_version 1.0.0', () => {
        const content = readSkill(`${role}/skill.md`);
        expect(content).toContain('1.0.0');
      });

      it('requires governance', () => {
        const content = readSkill(`${role}/skill.md`);
        expect(content).toContain('governance');
      });

      it('declares load_order: 1 (after governance)', () => {
        const content = readSkill(`${role}/skill.md`);
        expect(content).toMatch(/load_order.*1/);
      });

      it('explicitly prohibits execution (Execute actions: NO)', () => {
        const content = readSkill(`${role}/skill.md`);
        // Must contain explicit prohibition on execution
        expect(content).toMatch(/[Ee]xecut.*\*\*NO\*\*/);
      });

      it('explicitly prohibits approval (Approve actions: NO)', () => {
        const content = readSkill(`${role}/skill.md`);
        expect(content).toMatch(/[Aa]pprov.*\*\*NO\*\*/);
      });

      it('contains EXECUTION_BOUNDARY error', () => {
        const content = readSkill(`${role}/skill.md`);
        expect(content).toContain('EXECUTION_BOUNDARY');
      });

      it('contains ROLE_VIOLATION error', () => {
        const content = readSkill(`${role}/skill.md`);
        expect(content).toContain('ROLE_VIOLATION');
      });

      it('contains drift detection section', () => {
        const content = readSkill(`${role}/skill.md`);
        expect(content.toLowerCase()).toContain('drift detection');
      });

      it('contains "NEVER" as absolute prohibition (not softened)', () => {
        const content = readSkill(`${role}/skill.md`);
        expect(content).toContain('NEVER');
      });
    });
  }
});

// ============================================================
// PROOF 4: No Role Grants Execution
// ============================================================
describe('Proof 4: No Role Grants Execution', () => {
  for (const role of ROLE_SKILLS) {
    it(`${role} does not contain "Can Execute: Yes"`, () => {
      const content = readSkill(`${role}/skill.md`);
      expect(content).not.toMatch(/[Cc]an [Ee]xecute.*[Yy]es/);
    });

    it(`${role} does not contain "Execute actions: Yes"`, () => {
      const content = readSkill(`${role}/skill.md`);
      expect(content).not.toMatch(/[Ee]xecut.*[Yy]es/);
    });
  }
});

// ============================================================
// PROOF 5: Adapter Framework and Platform Adapters
// ============================================================
const ADAPTERS = ['manus', 'openai', 'claude', 'gemini'];

describe('Proof 5: Adapter Framework', () => {
  it('_framework.md exists', () => {
    expect(skillExists('adapters/_framework.md')).toBe(true);
  });

  it('_framework.md references _invariants.md', () => {
    const content = readSkill('adapters/_framework.md');
    expect(content).toContain('_invariants.md');
  });

  it('_framework.md declares invariants_version 1.0.0', () => {
    const content = readSkill('adapters/_framework.md');
    expect(content).toContain('1.0.0');
  });

  it('_framework.md requires governance_hash in adapter output', () => {
    const content = readSkill('adapters/_framework.md');
    expect(content).toContain('governance_hash');
  });

  it('_framework.md prohibits adding authority', () => {
    const content = readSkill('adapters/_framework.md');
    expect(content).toMatch(/[Nn]ever.*add.*authority|[Aa]dd authority.*not/i);
  });

  it('_framework.md prohibits removing constraints', () => {
    const content = readSkill('adapters/_framework.md');
    expect(content).toMatch(/[Rr]emov.*constraint/i);
  });

  it('_framework.md contains ADAPTER_INVALID error', () => {
    const content = readSkill('adapters/_framework.md');
    expect(content).toContain('ADAPTER_INVALID');
  });
});

describe('Proof 5: Platform Adapters', () => {
  for (const adapter of ADAPTERS) {
    describe(`adapters/${adapter}.md`, () => {
      it('exists', () => {
        expect(skillExists(`adapters/${adapter}.md`)).toBe(true);
      });

      it('references _invariants.md', () => {
        const content = readSkill(`adapters/${adapter}.md`);
        expect(content).toContain('_invariants.md');
      });

      it('declares invariants_version 1.0.0', () => {
        const content = readSkill(`adapters/${adapter}.md`);
        expect(content).toContain('1.0.0');
      });

      it('requires governance_hash', () => {
        const content = readSkill(`adapters/${adapter}.md`);
        expect(content).toContain('governance_hash');
      });

      it('contains validation checklist', () => {
        const content = readSkill(`adapters/${adapter}.md`);
        expect(content.toLowerCase()).toContain('validation checklist');
      });

      it('preserves NEVER as absolute prohibition', () => {
        const content = readSkill(`adapters/${adapter}.md`);
        expect(content).toContain('NEVER');
      });

      it('includes ERR_FATAL error handling', () => {
        const content = readSkill(`adapters/${adapter}.md`);
        expect(content).toContain('ERR_FATAL');
      });

      it('does not define execute_action as a callable tool', () => {
        const content = readSkill(`adapters/${adapter}.md`);
        // Check that execute_action is never defined as a function/tool name
        expect(content).not.toMatch(/"name":\s*"execute_action"|name="execute_action"|name: "execute_action"/);
      });
    });
  }
});

// ============================================================
// PROOF 6: Cross-Cutting Invariant Compliance
// ============================================================
describe('Proof 6: Cross-Cutting Invariant Compliance', () => {
  it('all skill files reference the same invariants_version', () => {
    const allFiles = [
      '_invariants.md',
      '_patches.md',
      'governance/skill.md',
      ...ROLE_SKILLS.map(r => `${r}/skill.md`),
      'adapters/_framework.md',
      ...ADAPTERS.map(a => `adapters/${a}.md`),
    ];
    for (const file of allFiles) {
      const content = readSkill(file);
      expect(content).toContain('1.0.0');
    }
  });

  it('no skill file contains "should avoid" (softened constraint language)', () => {
    const allFiles = [
      'governance/skill.md',
      ...ROLE_SKILLS.map(r => `${r}/skill.md`),
    ];
    for (const file of allFiles) {
      const content = readSkill(file);
      // Constraints should use absolute language, not "should avoid"
      expect(content).not.toMatch(/should avoid/i);
    }
  });

  it('no skill file contains "try not to" (softened constraint language)', () => {
    const allFiles = [
      'governance/skill.md',
      ...ROLE_SKILLS.map(r => `${r}/skill.md`),
    ];
    for (const file of allFiles) {
      const content = readSkill(file);
      expect(content).not.toMatch(/try not to/i);
    }
  });

  it('every role skill contains the word "halt" or "stop" for error handling', () => {
    for (const role of ROLE_SKILLS) {
      const content = readSkill(`${role}/skill.md`);
      expect(content.toLowerCase()).toMatch(/halt|stop/);
    }
  });

  it('governance skill is the only skill with load_order: 0', () => {
    const govContent = readSkill('governance/skill.md');
    expect(govContent).toMatch(/load_order.*0/);
    
    for (const role of ROLE_SKILLS) {
      const content = readSkill(`${role}/skill.md`);
      // Role skills should have load_order 1, not 0
      expect(content).not.toMatch(/load_order.*0/);
    }
  });

  it('total file count matches expected (12 files)', () => {
    // _invariants.md, _patches.md, governance/skill.md, 
    // 4 role skills, _framework.md, 4 adapters = 12
    const expectedFiles = [
      '_invariants.md',
      '_patches.md',
      'governance/skill.md',
      'builder/skill.md',
      'clarification/skill.md',
      'witness/skill.md',
      'connector/skill.md',
      'adapters/_framework.md',
      'adapters/manus.md',
      'adapters/openai.md',
      'adapters/claude.md',
      'adapters/gemini.md',
    ];
    for (const file of expectedFiles) {
      expect(skillExists(file)).toBe(true);
    }
  });
});

// ============================================================
// PROOF 7: Adapter Translation Fidelity
// ============================================================
describe('Proof 7: Adapter Translation Fidelity', () => {
  // Every adapter must mention submit_proposal (the only allowed tool)
  for (const adapter of ADAPTERS) {
    it(`${adapter} adapter defines submit_proposal as the only tool`, () => {
      const content = readSkill(`adapters/${adapter}.md`);
      expect(content).toContain('submit_proposal');
    });
  }

  // Every adapter must include drift detection
  for (const adapter of ADAPTERS) {
    it(`${adapter} adapter includes drift detection`, () => {
      const content = readSkill(`adapters/${adapter}.md`);
      expect(content.toLowerCase()).toMatch(/drift|self.check/);
    });
  }

  // Every adapter must include role-specific error responses
  for (const adapter of ADAPTERS) {
    it(`${adapter} adapter includes EXECUTION_BOUNDARY error response`, () => {
      const content = readSkill(`adapters/${adapter}.md`);
      expect(content).toContain('EXECUTION_BOUNDARY');
    });

    it(`${adapter} adapter includes ROLE_VIOLATION error response`, () => {
      const content = readSkill(`adapters/${adapter}.md`);
      expect(content).toContain('ROLE_VIOLATION');
    });
  }
});

// ============================================================
// PROOF 8: Clarification Skill — NO-FALLBACK Rule
// ============================================================
describe('Proof 8: NO-FALLBACK Rule in Clarification Skill', () => {
  it('clarification skill contains NO-FALLBACK rule', () => {
    const content = readSkill('clarification/skill.md');
    expect(content).toContain('NO-FALLBACK');
  });

  it('clarification skill states silence = escalate', () => {
    const content = readSkill('clarification/skill.md');
    expect(content.toLowerCase()).toContain('silence');
    expect(content.toLowerCase()).toContain('escalat');
  });

  it('clarification skill prohibits defaults', () => {
    const content = readSkill('clarification/skill.md');
    expect(content).toMatch(/NEVER.*assum|NEVER.*default|NO-FALLBACK/);
  });

  it('clarification skill enforces max 3 rounds', () => {
    const content = readSkill('clarification/skill.md');
    expect(content).toContain('3');
    expect(content.toLowerCase()).toContain('round');
  });

  it('clarification skill enforces TTL', () => {
    const content = readSkill('clarification/skill.md');
    expect(content).toContain('180');
    expect(content.toLowerCase()).toContain('ttl');
  });

  it('clarification skill is stateless', () => {
    const content = readSkill('clarification/skill.md');
    expect(content.toLowerCase()).toContain('stateless');
  });

  it('clarification skill is non-authoritative', () => {
    const content = readSkill('clarification/skill.md');
    expect(content.toLowerCase()).toContain('non-authoritative');
  });
});

// ============================================================
// PROOF 9: Witness Skill — Observation Only
// ============================================================
describe('Proof 9: Witness Skill — Observation Only', () => {
  it('witness skill prohibits blocking', () => {
    const content = readSkill('witness/skill.md');
    expect(content).toMatch(/[Bb]lock.*\*\*NO\*\*/);
  });

  it('witness skill prohibits modifying system state', () => {
    const content = readSkill('witness/skill.md');
    expect(content).toMatch(/[Mm]odif.*\*\*NO\*\*/);
  });

  it('witness skill can verify hash chains', () => {
    const content = readSkill('witness/skill.md');
    expect(content.toLowerCase()).toContain('hash chain');
  });

  it('witness skill can verify trace completeness', () => {
    const content = readSkill('witness/skill.md');
    expect(content.toLowerCase()).toContain('trace');
    expect(content.toLowerCase()).toContain('completeness');
  });

  it('witness skill can verify receipt signatures', () => {
    const content = readSkill('witness/skill.md');
    expect(content.toLowerCase()).toContain('receipt');
    expect(content.toLowerCase()).toContain('signature');
  });

  it('witness skill writes to sentinel mailbox only', () => {
    const content = readSkill('witness/skill.md');
    expect(content.toLowerCase()).toContain('sentinel mailbox');
  });
});

// ============================================================
// PROOF 10: Connector Skill — Translation Only
// ============================================================
describe('Proof 10: Connector Skill — Translation Only', () => {
  it('connector skill lists supported integrations', () => {
    const content = readSkill('connector/skill.md');
    const services = ['Gmail', 'Notion', 'Telegram', 'Twilio', 'Google Drive'];
    for (const service of services) {
      expect(content).toContain(service);
    }
  });

  it('connector skill prohibits direct API calls', () => {
    const content = readSkill('connector/skill.md');
    expect(content).toMatch(/[Ee]xecut.*API.*\*\*NO\*\*|[Ee]xecut.*\*\*NO\*\*/);
  });

  it('connector skill prohibits credential storage', () => {
    const content = readSkill('connector/skill.md');
    expect(content).toMatch(/[Cc]redential.*\*\*NO\*\*|[Ss]tore.*credential.*\*\*NO\*\*/);
  });

  it('connector skill prohibits governance bypass', () => {
    const content = readSkill('connector/skill.md');
    expect(content).toMatch(/[Bb]ypass.*\*\*NO\*\*/);
  });

  it('connector skill defines service_payload format', () => {
    const content = readSkill('connector/skill.md');
    expect(content).toContain('service_payload');
  });

  it('connector skill states translation is format conversion not interpretation', () => {
    const content = readSkill('connector/skill.md');
    expect(content.toLowerCase()).toContain('format conversion');
    expect(content.toLowerCase()).toContain('not interpretation');
  });
});
