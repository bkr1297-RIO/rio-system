import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Microsoft OAuth Integration", () => {
  const projectRoot = path.resolve(import.meta.dirname, "..");

  describe("Microsoft OAuth module", () => {
    it("should have microsoft.ts OAuth module", () => {
      const filePath = path.join(projectRoot, "server/oauth/microsoft.ts");
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("should export registerMicrosoftOAuthRoutes function", async () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/oauth/microsoft.ts"),
        "utf-8"
      );
      expect(content).toContain("export function registerMicrosoftOAuthRoutes");
    });

    it("should use Microsoft OAuth endpoints", async () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/oauth/microsoft.ts"),
        "utf-8"
      );
      expect(content).toContain("login.microsoftonline.com");
      expect(content).toContain("oauth2/v2.0/authorize");
      expect(content).toContain("oauth2/v2.0/token");
    });

    it("should request correct Microsoft Graph scopes", async () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/oauth/microsoft.ts"),
        "utf-8"
      );
      expect(content).toContain("Mail.ReadWrite");
      expect(content).toContain("Mail.Send");
      expect(content).toContain("Calendars.ReadWrite");
      expect(content).toContain("Files.ReadWrite");
      expect(content).toContain("User.Read");
    });

    it("should register start, callback, and disconnect routes", async () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/oauth/microsoft.ts"),
        "utf-8"
      );
      expect(content).toContain("/api/oauth/microsoft/start");
      expect(content).toContain("/api/oauth/microsoft/callback");
      expect(content).toContain("/api/oauth/microsoft/disconnect");
    });

    it("should store tokens for outlook_mail, outlook_calendar, and onedrive providers", async () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/oauth/microsoft.ts"),
        "utf-8"
      );
      expect(content).toContain("outlook_mail");
      expect(content).toContain("outlook_calendar");
      expect(content).toContain("onedrive");
    });

    it("should handle token refresh", async () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/oauth/microsoft.ts"),
        "utf-8"
      );
      expect(content).toContain("refresh_token");
    });
  });

  describe("Microsoft OAuth route registration", () => {
    it("should register Microsoft routes in oauth/index.ts", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/oauth/index.ts"),
        "utf-8"
      );
      expect(content).toContain("registerMicrosoftOAuthRoutes");
      expect(content).toContain("microsoft");
    });
  });

  describe("Microsoft Graph API helper", () => {
    it("should have microsoft-api.ts helper module", () => {
      const filePath = path.join(projectRoot, "server/connectors/microsoft-api.ts");
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("should use Microsoft Graph API base URL", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/connectors/microsoft-api.ts"),
        "utf-8"
      );
      expect(content).toContain("graph.microsoft.com");
    });

    it("should export helper functions for mail, calendar, and files", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/connectors/microsoft-api.ts"),
        "utf-8"
      );
      expect(content).toContain("export async function outlookSendMessage");
      expect(content).toContain("export async function outlookCreateEvent");
      expect(content).toContain("export async function onedriveUploadFile");
    });
  });

  describe("Microsoft connectors", () => {
    it("should have outlook-mail.ts connector", () => {
      const filePath = path.join(projectRoot, "server/connectors/outlook-mail.ts");
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("should have outlook-calendar.ts connector", () => {
      const filePath = path.join(projectRoot, "server/connectors/outlook-calendar.ts");
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("should have onedrive.ts connector", () => {
      const filePath = path.join(projectRoot, "server/connectors/onedrive.ts");
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("should register all three Microsoft connectors in registry", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/connectors/registry.ts"),
        "utf-8"
      );
      expect(content).toContain("OutlookMailConnector");
      expect(content).toContain("OutlookCalendarConnector");
      expect(content).toContain("OneDriveConnector");
    });

    it("Outlook Mail connector should implement RIOConnector interface", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/connectors/outlook-mail.ts"),
        "utf-8"
      );
      expect(content).toContain("implements RIOConnector");
      expect(content).toContain("execute(");
      expect(content).toContain("getInfo(");
    });

    it("Outlook Calendar connector should implement RIOConnector interface", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/connectors/outlook-calendar.ts"),
        "utf-8"
      );
      expect(content).toContain("implements RIOConnector");
      expect(content).toContain("execute(");
      expect(content).toContain("getInfo(");
    });

    it("OneDrive connector should implement RIOConnector interface", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/connectors/onedrive.ts"),
        "utf-8"
      );
      expect(content).toContain("implements RIOConnector");
      expect(content).toContain("execute(");
      expect(content).toContain("getInfo(");
    });
  });

  describe("Microsoft connection status procedure", () => {
    it("should have microsoftStatus procedure in connections router", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/routers/connections.ts"),
        "utf-8"
      );
      expect(content).toContain("microsoftStatus");
    });
  });

  describe("Connect page Microsoft UI", () => {
    it("should have Microsoft 365 connection card in Connect.tsx", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "client/src/pages/Connect.tsx"),
        "utf-8"
      );
      expect(content).toContain("Microsoft 365");
      expect(content).toContain("handleConnectMicrosoft");
      expect(content).toContain("handleDisconnectMicrosoft");
      expect(content).toContain("Connect Microsoft 365");
    });

    it("should have Microsoft OAuth success/error messages", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "client/src/pages/Connect.tsx"),
        "utf-8"
      );
      expect(content).toContain("microsoft_denied");
      expect(content).toContain("microsoft_callback_failed");
      expect(content).toContain("Microsoft apps connected successfully");
    });

    it("should have removed Outlook and OneDrive from Coming Soon", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "client/src/pages/Connect.tsx"),
        "utf-8"
      );
      // The Coming Soon section should NOT contain Outlook or OneDrive anymore
      const comingSoonMatch = content.match(/Coming Soon[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
      if (comingSoonMatch) {
        expect(comingSoonMatch[0]).not.toContain('"Outlook"');
        expect(comingSoonMatch[0]).not.toContain('"OneDrive"');
      }
    });

    it("should include MICROSOFT_PROVIDERS constant", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "client/src/pages/Connect.tsx"),
        "utf-8"
      );
      expect(content).toContain("MICROSOFT_PROVIDERS");
      expect(content).toContain("outlook_mail");
      expect(content).toContain("outlook_calendar");
      expect(content).toContain("onedrive");
    });
  });

  describe("BondiApp Microsoft scenarios", () => {
    it("should have Microsoft scenarios in BondiApp.tsx", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "client/src/pages/BondiApp.tsx"),
        "utf-8"
      );
      expect(content).toContain("outlook_send");
      expect(content).toContain("outlook_calendar_event");
      expect(content).toContain("onedrive_upload");
    });

    it("should have microsoft category in Scenario type", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "client/src/pages/BondiApp.tsx"),
        "utf-8"
      );
      expect(content).toContain('"microsoft"');
    });

    it("should include microsoft in availableScenarios filter", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "client/src/pages/BondiApp.tsx"),
        "utf-8"
      );
      expect(content).toContain('s.category === "microsoft"');
    });
  });

  describe("ENV configuration", () => {
    it("should have Microsoft OAuth env vars in env.ts", () => {
      const content = fs.readFileSync(
        path.join(projectRoot, "server/_core/env.ts"),
        "utf-8"
      );
      expect(content).toContain("microsoftOAuthClientId");
      expect(content).toContain("microsoftOAuthClientSecret");
      expect(content).toContain("microsoftOAuthTenantId");
    });
  });
});
