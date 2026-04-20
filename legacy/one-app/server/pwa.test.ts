import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PWA Configuration", () => {
  const publicDir = path.join(__dirname, "..", "client", "public");

  describe("manifest.json", () => {
    it("exists in client/public", () => {
      const manifestPath = path.join(publicDir, "manifest.json");
      expect(fs.existsSync(manifestPath)).toBe(true);
    });

    it("has valid JSON content", () => {
      const manifestPath = path.join(publicDir, "manifest.json");
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(raw);
      expect(manifest).toBeDefined();
    });

    it("has required PWA fields", () => {
      const manifestPath = path.join(publicDir, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

      expect(manifest.name).toBe("ONE Command Center");
      expect(manifest.short_name).toBe("ONE");
      expect(manifest.display).toBe("standalone");
      expect(manifest.start_url).toBe("/");
      expect(manifest.background_color).toBeDefined();
      expect(manifest.theme_color).toBeDefined();
    });

    it("has icons with required sizes", () => {
      const manifestPath = path.join(publicDir, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

      expect(manifest.icons).toBeDefined();
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

      const sizes = manifest.icons.map((i: any) => i.sizes);
      expect(sizes).toContain("192x192");
      expect(sizes).toContain("512x512");
    });

    it("icons use the ONE logo CDN URL", () => {
      const manifestPath = path.join(publicDir, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

      for (const icon of manifest.icons) {
        expect(icon.src).toContain("rio-one-logo");
        expect(icon.src).toContain("cloudfront.net");
      }
    });

    it("has maskable icon for Android", () => {
      const manifestPath = path.join(publicDir, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

      const maskable = manifest.icons.find((i: any) => i.purpose === "maskable");
      expect(maskable).toBeDefined();
    });
  });

  describe("service worker (sw.js)", () => {
    it("exists in client/public", () => {
      const swPath = path.join(publicDir, "sw.js");
      expect(fs.existsSync(swPath)).toBe(true);
    });

    it("contains install event listener", () => {
      const swPath = path.join(publicDir, "sw.js");
      const content = fs.readFileSync(swPath, "utf-8");
      expect(content).toContain("addEventListener('install'");
    });

    it("contains activate event listener", () => {
      const swPath = path.join(publicDir, "sw.js");
      const content = fs.readFileSync(swPath, "utf-8");
      expect(content).toContain("addEventListener('activate'");
    });

    it("contains fetch event listener", () => {
      const swPath = path.join(publicDir, "sw.js");
      const content = fs.readFileSync(swPath, "utf-8");
      expect(content).toContain("addEventListener('fetch'");
    });

    it("skips API/tRPC routes (never caches them)", () => {
      const swPath = path.join(publicDir, "sw.js");
      const content = fs.readFileSync(swPath, "utf-8");
      expect(content).toContain("/api/");
      expect(content).toContain("trpc");
    });
  });

  describe("index.html PWA meta tags", () => {
    it("has manifest link", () => {
      const htmlPath = path.join(__dirname, "..", "client", "index.html");
      const html = fs.readFileSync(htmlPath, "utf-8");
      expect(html).toContain('rel="manifest"');
      expect(html).toContain("manifest.json");
    });

    it("has theme-color meta tag", () => {
      const htmlPath = path.join(__dirname, "..", "client", "index.html");
      const html = fs.readFileSync(htmlPath, "utf-8");
      expect(html).toContain('name="theme-color"');
    });

    it("has apple-mobile-web-app-capable meta tag", () => {
      const htmlPath = path.join(__dirname, "..", "client", "index.html");
      const html = fs.readFileSync(htmlPath, "utf-8");
      expect(html).toContain('name="apple-mobile-web-app-capable"');
      expect(html).toContain('content="yes"');
    });

    it("has apple-touch-icon link", () => {
      const htmlPath = path.join(__dirname, "..", "client", "index.html");
      const html = fs.readFileSync(htmlPath, "utf-8");
      expect(html).toContain('rel="apple-touch-icon"');
      expect(html).toContain("rio-one-logo");
    });

    it("has service worker registration script", () => {
      const htmlPath = path.join(__dirname, "..", "client", "index.html");
      const html = fs.readFileSync(htmlPath, "utf-8");
      expect(html).toContain("serviceWorker");
      expect(html).toContain("register");
      expect(html).toContain("sw.js");
    });

    it("title is ONE Command Center", () => {
      const htmlPath = path.join(__dirname, "..", "client", "index.html");
      const html = fs.readFileSync(htmlPath, "utf-8");
      expect(html).toContain("<title>ONE Command Center</title>");
    });
  });
});
