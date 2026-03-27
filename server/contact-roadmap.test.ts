import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Contact page", () => {
  const contactSrc = readFileSync(
    resolve(__dirname, "../client/src/pages/Contact.tsx"),
    "utf-8"
  );

  it("renders Brian K. Rasmussen as the contact", () => {
    expect(contactSrc).toContain("Brian K. Rasmussen");
  });

  it("includes the correct email address", () => {
    expect(contactSrc).toContain("Riomethod5@gmail.com");
    expect(contactSrc).toContain("mailto:Riomethod5@gmail.com");
  });

  it("includes the correct LinkedIn URL", () => {
    expect(contactSrc).toContain("https://www.linkedin.com/in/bkr-rio");
  });

  it("includes the GitHub repo link", () => {
    expect(contactSrc).toContain("https://github.com/bkr1297-RIO/rio-protocol");
  });

  it("imports NavBar for consistent navigation", () => {
    expect(contactSrc).toContain('import NavBar from "@/components/NavBar"');
  });

  it("lists inquiry types for visitors", () => {
    expect(contactSrc).toContain("Protocol implementation questions");
    expect(contactSrc).toContain("Regulatory alignment");
    expect(contactSrc).toContain("Partnership and collaboration");
    expect(contactSrc).toContain("Contributing to the open protocol");
    expect(contactSrc).toContain("Enterprise deployment");
  });
});

describe("Roadmap page", () => {
  const roadmapSrc = readFileSync(
    resolve(__dirname, "../client/src/pages/Roadmap.tsx"),
    "utf-8"
  );

  it("contains all 6 phases", () => {
    expect(roadmapSrc).toContain("Phase 1");
    expect(roadmapSrc).toContain("Phase 2");
    expect(roadmapSrc).toContain("Phase 3");
    expect(roadmapSrc).toContain("Phase 4");
    expect(roadmapSrc).toContain("Phase 5");
    expect(roadmapSrc).toContain("Phase 6");
  });

  it("has correct phase titles", () => {
    expect(roadmapSrc).toContain("Protocol Foundation");
    expect(roadmapSrc).toContain("Reference Implementation");
    expect(roadmapSrc).toContain("Developer Ecosystem");
    expect(roadmapSrc).toContain("Standards and Certification");
    expect(roadmapSrc).toContain("Production Hardening");
    expect(roadmapSrc).toContain("Ecosystem Growth");
  });

  it("marks phases 1-3 as complete", () => {
    // The milestones array has first 3 with status: "complete"
    const completeMatches = roadmapSrc.match(/status:\s*"complete"/g);
    expect(completeMatches).not.toBeNull();
    // 3 milestones + 1 in StatusBadge config = 4 matches
    expect(completeMatches!.length).toBeGreaterThanOrEqual(3);
  });

  it("marks phase 4 as in-progress", () => {
    const inProgressMatches = roadmapSrc.match(/status:\s*"in-progress"/g);
    expect(inProgressMatches).not.toBeNull();
    expect(inProgressMatches!.length).toBe(1);
  });

  it("marks phases 5-6 as planned", () => {
    const plannedMatches = roadmapSrc.match(/status:\s*"planned"/g);
    expect(plannedMatches).not.toBeNull();
    expect(plannedMatches!.length).toBe(2);
  });

  it("imports NavBar for consistent navigation", () => {
    expect(roadmapSrc).toContain('import NavBar from "@/components/NavBar"');
  });
});

describe("NavBar includes Contact and Roadmap", () => {
  const navSrc = readFileSync(
    resolve(__dirname, "../client/src/components/NavBar.tsx"),
    "utf-8"
  );

  it("has Contact in Resources dropdown", () => {
    expect(navSrc).toContain('"Contact"');
    expect(navSrc).toContain('"/contact"');
  });

  it("has Roadmap in Resources dropdown", () => {
    expect(navSrc).toContain('"Roadmap"');
    expect(navSrc).toContain('"/roadmap"');
  });
});

describe("App.tsx routes", () => {
  const appSrc = readFileSync(
    resolve(__dirname, "../client/src/App.tsx"),
    "utf-8"
  );

  it("imports Contact page", () => {
    expect(appSrc).toContain('import Contact from "./pages/Contact"');
  });

  it("imports Roadmap page", () => {
    expect(appSrc).toContain('import Roadmap from "./pages/Roadmap"');
  });

  it("registers /contact route", () => {
    expect(appSrc).toContain('/contact');
  });

  it("registers /roadmap route", () => {
    expect(appSrc).toContain('/roadmap');
  });
});

describe("OG meta tags", () => {
  const htmlSrc = readFileSync(
    resolve(__dirname, "../client/index.html"),
    "utf-8"
  );

  it("uses the landscape banner image for og:image", () => {
    expect(htmlSrc).toContain("rio-og-banner");
    expect(htmlSrc).not.toContain(
      'og:image" content="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-logo-new_8049c497.png'
    );
  });

  it("includes og:image:width and og:image:height", () => {
    expect(htmlSrc).toContain('og:image:width');
    expect(htmlSrc).toContain('og:image:height');
  });

  it("uses summary_large_image for Twitter card", () => {
    expect(htmlSrc).toContain('content="summary_large_image"');
  });

  it("uses the banner image for twitter:image", () => {
    expect(htmlSrc).toContain('twitter:image');
    // Should use the banner, not the old logo
    const twitterImageMatch = htmlSrc.match(/twitter:image.*?content="([^"]+)"/);
    expect(twitterImageMatch).not.toBeNull();
    expect(twitterImageMatch![1]).toContain("rio-og-banner");
  });
});
