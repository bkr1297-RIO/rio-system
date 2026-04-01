import NavBar from "@/components/NavBar";
import { useState } from "react";

interface FAQItem {
  question: string;
  answer: React.ReactNode;
}

const faqs: FAQItem[] = [
  {
    question: "Are there additional capabilities with RIO in the future?",
    answer: (
      <>
        <p className="mb-3">
          Yes. RIO is designed as a foundation that other systems can build on top of.
          Because it sits between AI/automation and real-world systems, it can become a
          central place for approval workflows, audit logs, simulations, and orchestration
          across many tools.
        </p>
        <p className="mb-3">Over time, this can include things like:</p>
        <ul className="list-disc list-inside space-y-1 mb-3 ml-2">
          <li>Simulating actions before they happen</li>
          <li>Learning from past decisions to improve policies</li>
          <li>Orchestrating workflows across multiple systems</li>
          <li>Providing a single audit trail across many tools and agents</li>
          <li>Standardizing how AI and software request permission to act</li>
        </ul>
        <p>
          RIO starts as a governance and approval layer, but it can grow into a broader
          coordination and oversight layer for AI and automation.
        </p>
      </>
    ),
  },
  {
    question: "What problem does RIO solve?",
    answer: (
      <>
        <p className="mb-3">
          RIO solves the problem of AI and automation being able to take real-world actions
          without enough control, approval, or visibility.
        </p>
        <ul className="list-disc list-inside space-y-2 mb-3 ml-2">
          <li>
            <strong style={{ color: "#ffffff" }}>For enterprises:</strong> It prevents AI or
            automation from sending money, deleting data, deploying code, or taking other
            high-impact actions without the right approval.
          </li>
          <li>
            <strong style={{ color: "#ffffff" }}>For compliance and regulators:</strong> It
            creates a permanent record showing what happened, who approved it, and why.
          </li>
          <li>
            <strong style={{ color: "#ffffff" }}>For developers and AI teams:</strong> It
            provides a safer way to deploy powerful AI systems without worrying that one
            mistake or prompt injection will cause a real-world incident.
          </li>
        </ul>
        <p>
          In simple terms, RIO lets AI and automation act, but under controlled rules with
          approval and a full audit trail.
        </p>
      </>
    ),
  },
  {
    question: "Does this only work with AI?",
    answer: (
      <p>
        No. RIO works with AI agents, scripts, automations, APIs, and even human-triggered
        actions. Anything that can send a request to another system can be routed through RIO
        and governed the same way.
      </p>
    ),
  },
  {
    question: "Does RIO approve every single action?",
    answer: (
      <>
        <p className="mb-3">
          No. You decide which actions require approval and which can run automatically. For
          example, you might allow AI to send normal emails automatically, but require approval
          for payments, production deployments, or deleting data.
        </p>
        <p>RIO enforces the rules you define, and those rules can change over time.</p>
      </>
    ),
  },
  {
    question: "Can AI act on its own in this system?",
    answer: (
      <p>
        AI can propose actions, but it cannot execute high-impact actions unless the rules
        allow it or a human approves it. The AI does not have final authority — the system
        enforces the rules and approvals.
      </p>
    ),
  },
  {
    question: "Is this a blockchain?",
    answer: (
      <p>
        No. RIO uses a tamper-evident ledger (a hash-chained log) to record what happened,
        but it does not require a public blockchain. It can run on a normal database while
        still making tampering detectable.
      </p>
    ),
  },
  {
    question: "Does RIO replace my existing tools or AI models?",
    answer: (
      <p>
        No. RIO sits between your AI or automation and the systems they interact with. It
        works with your existing tools, APIs, and models — it's a control and audit layer,
        not a replacement.
      </p>
    ),
  },
  {
    question: 'What is a "receipt" in RIO?',
    answer: (
      <>
        <p className="mb-3">A receipt is a signed proof that shows:</p>
        <ul className="list-disc list-inside space-y-1 mb-3 ml-2">
          <li>What action was requested</li>
          <li>Who approved it</li>
          <li>What system executed it</li>
          <li>What the result was</li>
          <li>When it happened</li>
        </ul>
        <p>It's like a digital receipt for an action, not a purchase.</p>
      </>
    ),
  },
  {
    question: "What kinds of actions would companies typically control with RIO?",
    answer: (
      <>
        <p className="mb-3">Common examples:</p>
        <ul className="list-disc list-inside space-y-1 mb-3 ml-2">
          <li>Sending payments</li>
          <li>Deploying code to production</li>
          <li>Deleting or exporting sensitive data</li>
          <li>Granting system access</li>
          <li>Sending external communications</li>
          <li>Running large automated workflows</li>
        </ul>
        <p>RIO is mainly for high-impact actions, not small everyday tasks.</p>
      </>
    ),
  },
  {
    question: "Who is this for?",
    answer: (
      <>
        <p className="mb-3">Typically:</p>
        <ul className="list-disc list-inside space-y-1 mb-3 ml-2">
          <li>Companies using AI agents or automation</li>
          <li>Developers building AI tools</li>
          <li>Finance and operations teams</li>
          <li>Security and compliance teams</li>
          <li>Any organization where software can take real-world actions</li>
        </ul>
        <p>
          If software can move money, change data, or affect customers, RIO is relevant.
        </p>
      </>
    ),
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      <NavBar />

      <div className="flex-1 px-4 sm:px-6 py-10 sm:py-16">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <h1
            className="text-3xl sm:text-4xl font-bold mb-2 text-center"
            style={{ color: "#b8963e" }}
          >
            Frequently Asked Questions
          </h1>
          <p
            className="text-sm sm:text-base text-center mb-10 sm:mb-14"
            style={{ color: "#9ca3af" }}
          >
            Common questions about RIO, how it works, and who it's for.
          </p>

          {/* FAQ Accordion */}
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="rounded-lg border overflow-hidden transition-colors"
                style={{
                  borderColor:
                    openIndex === index
                      ? "rgba(184,150,62,0.4)"
                      : "rgba(55,65,81,0.5)",
                  backgroundColor:
                    openIndex === index
                      ? "rgba(184,150,62,0.04)"
                      : "rgba(17,24,39,0.4)",
                }}
              >
                <button
                  onClick={() => toggle(index)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer"
                >
                  <span
                    className="text-sm sm:text-base font-medium pr-4"
                    style={{ color: openIndex === index ? "#b8963e" : "#e5e7eb" }}
                  >
                    {index + 1}. {faq.question}
                  </span>
                  <span
                    className="text-lg flex-shrink-0 transition-transform duration-200"
                    style={{
                      color: "#b8963e",
                      transform: openIndex === index ? "rotate(45deg)" : "rotate(0deg)",
                    }}
                  >
                    +
                  </span>
                </button>

                {openIndex === index && (
                  <div
                    className="px-5 pb-5 text-sm sm:text-base leading-relaxed"
                    style={{ color: "#d1d5db" }}
                  >
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="mt-12 text-center">
            <p className="text-sm mb-4" style={{ color: "#9ca3af" }}>
              Have more questions? Explore the documentation or try the demos.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="/docs"
                className="text-xs font-medium py-2 px-5 border rounded transition-colors hover:bg-white/5"
                style={{ borderColor: "#b8963e", color: "#b8963e" }}
              >
                View Documentation
              </a>
              <a
                href="/demo1"
                className="text-xs font-medium py-2 px-5 border rounded transition-colors hover:bg-white/5"
                style={{ borderColor: "#374151", color: "#9ca3af" }}
              >
                Try the Demos
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
