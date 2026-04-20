/**
 * Resonance Feed — Vitest tests
 *
 * Tests the GitHub fallback path (since Drive API may not be available through Forge).
 * Verifies the resonance.feed tRPC endpoint returns structured data.
 */
import { describe, it, expect } from "vitest";
import { fetchResonanceFeedFromGitHub, type ResonanceFeed } from "./resonance";

describe("resonance", () => {
  const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";

  it("fetchResonanceFeedFromGitHub returns structured feed", async () => {
    if (!ghToken) {
      console.warn("Skipping: GH_TOKEN not set");
      return;
    }

    const feed: ResonanceFeed = await fetchResonanceFeedFromGitHub(ghToken, 10);

    // Must have the correct shape
    expect(feed).toHaveProperty("events");
    expect(feed).toHaveProperty("totalEvents");
    expect(feed).toHaveProperty("fetchedAt");
    expect(feed).toHaveProperty("errors");
    expect(Array.isArray(feed.events)).toBe(true);
    expect(typeof feed.fetchedAt).toBe("number");

    // Should have at least some commits from rio-system
    expect(feed.events.length).toBeGreaterThan(0);

    // Each event should have required fields
    for (const event of feed.events) {
      expect(event).toHaveProperty("fileId");
      expect(event).toHaveProperty("name");
      expect(event).toHaveProperty("mimeType");
      expect(event).toHaveProperty("modifiedTime");
      expect(event).toHaveProperty("folderPath");
      expect(event).toHaveProperty("tags");
      expect(Array.isArray(event.tags)).toBe(true);
      expect(event.tags.length).toBeGreaterThan(0);
    }
  });

  it("events are sorted by modifiedTime descending", async () => {
    if (!ghToken) {
      console.warn("Skipping: GH_TOKEN not set");
      return;
    }

    const feed = await fetchResonanceFeedFromGitHub(ghToken, 20);

    for (let i = 1; i < feed.events.length; i++) {
      const prev = new Date(feed.events[i - 1].modifiedTime).getTime();
      const curr = new Date(feed.events[i].modifiedTime).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it("events include #GitCommit tag", async () => {
    if (!ghToken) {
      console.warn("Skipping: GH_TOKEN not set");
      return;
    }

    const feed = await fetchResonanceFeedFromGitHub(ghToken, 5);

    // All GitHub-sourced events should have #GitCommit tag
    for (const event of feed.events) {
      expect(event.tags).toContain("#GitCommit");
    }
  });

  it("events include folder path", async () => {
    if (!ghToken) {
      console.warn("Skipping: GH_TOKEN not set");
      return;
    }

    const feed = await fetchResonanceFeedFromGitHub(ghToken, 5);

    for (const event of feed.events) {
      expect(event.folderPath).toMatch(/^\/rio-(system|protocol)$/);
    }
  });

  it("returns empty feed gracefully with invalid token", async () => {
    const feed = await fetchResonanceFeedFromGitHub("invalid-token-xxx", 5);

    expect(feed.events).toHaveLength(0);
    expect(feed.errors.length).toBeGreaterThan(0);
  });
});
