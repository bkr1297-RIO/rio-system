import NavBar from "@/components/NavBar";
import {
  DollarSign,
  Trash2,
  Rocket,
  UserPlus,
  Bot,
} from "lucide-react";

const useCases = [
  {
    icon: DollarSign,
    title: "Invoice Payment Approval",
    industry: "Finance, Accounts Payable",
    scenario:
      "An AI agent integrated with the accounts payable system identifies an invoice due for payment and submits a transfer_funds request to RIO for a $48,250 wire transfer to a vendor.",
    stages: [
      { stage: "Intake", detail: "Request received with user_id: ai_agent_ap, action: transfer_funds, amount: $48,250." },
      { stage: "Classification", detail: "Classified as transfer_funds with risk category HIGH (financial action above $10,000)." },
      { stage: "Policy", detail: "Rule RULE-003 matches: Transfers over $10,000 require manager or admin approval. Decision: REQUIRE_APPROVAL." },
      { stage: "Risk", detail: "Risk score: base(5) + role(2) + amount(3) = 10. Risk level: HIGH." },
      { stage: "Authorization", detail: "Escalated to approval queue. CFO reviews full context — who, what, how much, why — and approves. Token issued." },
      { stage: "Execution", detail: "Token verified, nonce consumed, kill switch clear. HTTP adapter calls payment gateway." },
      { stage: "Receipt + Ledger", detail: "Signed receipt generated. Hash-linked ledger entry appended." },
    ],
    value:
      "Without RIO, the AI agent would have initiated a $48,250 wire transfer with no human review, no audit trail, and no proof of authorization.",
  },
  {
    icon: Trash2,
    title: "Data Deletion (GDPR Compliance)",
    industry: "Technology, Data Management",
    scenario:
      "A data management system receives a GDPR right to erasure request. An automated workflow submits a delete_data request to permanently remove a customer's personal data from the production database.",
    stages: [
      { stage: "Intake", detail: "Request received: action: delete_data, target: customer_db, scope: user_id=12345, reason: GDPR erasure." },
      { stage: "Classification", detail: "Classified as delete_data with risk category HIGH (irreversible data operation)." },
      { stage: "Policy", detail: "Rule matches: Data deletion requires admin approval. Decision: REQUIRE_APPROVAL." },
      { stage: "Risk", detail: "Risk score: base(6) + role(1) + target(3) = 10. Risk level: HIGH." },
      { stage: "Authorization", detail: "Data protection officer reviews the request, confirms GDPR basis, approves." },
      { stage: "Execution", detail: "File adapter executes database deletion with confirmed parameters." },
      { stage: "Receipt + Ledger", detail: "Receipt serves as proof of compliant data deletion for GDPR audit." },
    ],
    value:
      "The receipt provides legally defensible proof that the deletion was authorized by a qualified individual, followed a governed process, and was recorded in a tamper-evident ledger.",
  },
  {
    icon: Rocket,
    title: "Production Deployment Approval",
    industry: "Software Engineering, DevOps",
    scenario:
      "A CI/CD pipeline completes a build and submits a deploy_code request to push a new release to the production environment. The deployment affects customer-facing services.",
    stages: [
      { stage: "Intake", detail: "Request received: action: deploy_code, target: production, version: v2.4.1, services: 3." },
      { stage: "Classification", detail: "Classified as deploy_code with risk category CRITICAL (production infrastructure)." },
      { stage: "Policy", detail: "Rule matches: Production deployments require admin approval during business hours. Decision: REQUIRE_APPROVAL." },
      { stage: "Risk", detail: "Risk score: base(7) + role(1) + target(4) = 12. Risk level: CRITICAL." },
      { stage: "Authorization", detail: "VP of Engineering reviews deployment scope, test results, and rollback plan. Approves with conditions." },
      { stage: "Execution", detail: "HTTP adapter triggers deployment pipeline with verified parameters." },
      { stage: "Receipt + Ledger", detail: "Receipt records exactly what was deployed, by whom, and who authorized it." },
    ],
    value:
      "If the deployment causes an incident, the receipt and ledger provide a complete chain of accountability: what was deployed, who authorized it, what risk score it carried, and when it happened.",
  },
  {
    icon: UserPlus,
    title: "Access Provisioning",
    industry: "IT, Identity Management",
    scenario:
      "An onboarding automation system submits a grant_access request to provision a new employee with access to internal systems, including source code repositories and production monitoring.",
    stages: [
      { stage: "Intake", detail: "Request received: action: grant_access, target_user: new_hire_42, systems: [repo, monitoring, wiki]." },
      { stage: "Classification", detail: "Classified as grant_access with risk category MEDIUM (identity change)." },
      { stage: "Policy", detail: "Rule matches: Access grants to production systems require manager approval. Decision: REQUIRE_APPROVAL." },
      { stage: "Risk", detail: "Risk score: base(4) + role(1) + target(2) = 7. Risk level: MEDIUM." },
      { stage: "Authorization", detail: "Hiring manager reviews the access request, confirms role requirements, approves." },
      { stage: "Execution", detail: "HTTP adapter provisions access across all specified systems." },
      { stage: "Receipt + Ledger", detail: "Receipt records the exact permissions granted and who authorized them." },
    ],
    value:
      "Every access grant is traceable. During security audits, the organization can prove exactly who authorized each access grant, when, and under what policy.",
  },
  {
    icon: Bot,
    title: "Agent-to-Agent Governance",
    industry: "AI Operations, Multi-Agent Systems",
    scenario:
      "An orchestrator AI agent delegates a task to a specialist agent. The specialist agent needs to send an email to a customer. Instead of acting directly, it submits the request through RIO.",
    stages: [
      { stage: "Intake", detail: "Request received: user_id: specialist_agent_7, action: send_email, delegated_by: orchestrator_agent_1." },
      { stage: "Classification", detail: "Classified as send_email with risk category MEDIUM (external communication by AI)." },
      { stage: "Policy", detail: "Rule matches: AI-initiated external communications require human approval. Decision: REQUIRE_APPROVAL." },
      { stage: "Risk", detail: "Risk score: base(3) + role(2) + delegation_chain(2) = 7. Risk level: MEDIUM." },
      { stage: "Authorization", detail: "Human supervisor reviews the email content, recipient, and delegation chain. Approves." },
      { stage: "Execution", detail: "Email adapter sends the message with verified content." },
      { stage: "Receipt + Ledger", detail: "Receipt records the full delegation chain: which agent requested, which agent delegated, and which human approved." },
    ],
    value:
      "In multi-agent systems, RIO ensures that no agent — regardless of how many layers of delegation exist — can take a consequential action without human authorization and a complete audit trail.",
  },
];

export default function UseCases() {
  return (
    <div className="min-h-screen" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <NavBar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <h1
            className="text-3xl sm:text-4xl font-bold mb-3"
            style={{ color: "#b8963e" }}
          >
            Enterprise Use Cases
          </h1>
          <p
            className="text-xs sm:text-sm font-semibold tracking-[0.25em] uppercase mb-4"
            style={{ color: "#60a5fa" }}
          >
            Runtime Governance and Execution Control Plane for AI Systems
          </p>
          <p
            className="text-base sm:text-lg leading-relaxed max-w-2xl mx-auto"
            style={{ color: "#d1d5db" }}
          >
            RIO governs any consequential action taken by AI agents, automated
            workflows, or software systems on behalf of humans. Each use case
            follows the same governed execution pipeline.
          </p>
        </div>

        {/* Use Case Cards */}
        <div className="space-y-8">
          {useCases.map((uc) => {
            const Icon = uc.icon;
            return (
              <div
                key={uc.title}
                className="rounded-lg border overflow-hidden"
                style={{
                  backgroundColor: "oklch(0.18 0.03 260)",
                  borderColor: "oklch(0.72 0.1 85 / 15%)",
                }}
              >
                {/* Header */}
                <div
                  className="px-5 sm:px-6 py-4 border-b flex items-center gap-3"
                  style={{ borderColor: "oklch(0.72 0.1 85 / 10%)" }}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" style={{ color: "#b8963e" }} />
                  <div>
                    <h3
                      className="text-lg font-bold"
                      style={{ color: "#b8963e" }}
                    >
                      {uc.title}
                    </h3>
                    <span className="text-xs" style={{ color: "#6b7280" }}>
                      {uc.industry}
                    </span>
                  </div>
                </div>

                {/* Scenario */}
                <div className="px-5 sm:px-6 py-4">
                  <p
                    className="text-sm sm:text-base leading-relaxed mb-4"
                    style={{ color: "#d1d5db" }}
                  >
                    {uc.scenario}
                  </p>

                  {/* Pipeline Stages */}
                  <div className="space-y-2 mb-4">
                    {uc.stages.map((s) => (
                      <div
                        key={s.stage}
                        className="rounded px-3 py-2 text-xs sm:text-sm"
                        style={{
                          backgroundColor: "oklch(0.15 0.03 260)",
                        }}
                      >
                        <span
                          className="font-semibold mr-2"
                          style={{ color: "#b8963e" }}
                        >
                          {s.stage}:
                        </span>
                        <span style={{ color: "#9ca3af" }}>{s.detail}</span>
                      </div>
                    ))}
                  </div>

                  {/* Governance Value */}
                  <div
                    className="rounded-lg px-4 py-3 border-l-2"
                    style={{
                      backgroundColor: "oklch(0.72 0.1 85 / 8%)",
                      borderColor: "#b8963e",
                    }}
                  >
                    <span
                      className="text-xs font-bold uppercase tracking-wide block mb-1"
                      style={{ color: "#b8963e" }}
                    >
                      Governance Value
                    </span>
                    <p className="text-xs sm:text-sm" style={{ color: "#d1d5db" }}>
                      {uc.value}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 sm:mt-16 text-center">
          <p className="text-sm mb-4" style={{ color: "#9ca3af" }}>
            See RIO enforce these governance patterns in real time.
          </p>
          <a
            href="/demo1"
            className="inline-block py-3 px-8 text-sm font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5"
            style={{
              borderColor: "#b8963e",
              borderWidth: "1.5px",
            }}
          >
            Try the Live Demos
          </a>
        </div>
      </div>
    </div>
  );
}
