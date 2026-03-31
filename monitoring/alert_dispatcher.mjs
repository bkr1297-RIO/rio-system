/**
 * RIO Alert Dispatcher (TASK-031)
 * 
 * Lane: DevOps / Infrastructure
 * Owner: Damon
 * 
 * Responsibility: Dispatches JSON-formatted alerts via Email and Webhooks.
 * Fail-Open: Observability failures do not block governance execution.
 */

import fetch from 'node-fetch';
import crypto from 'crypto';

export class AlertDispatcher {
  constructor(config = {}) {
    this.emailRecipient = config.emailRecipient || process.env.ALERT_EMAIL || 'bkr1297@gmail.com';
    this.webhookUrl = config.webhookUrl || process.env.ALERT_WEBHOOK_URL;
    this.source = config.source || 'rio-gateway-prod';
    this.enabled = config.enabled !== false;
  }

  /**
   * Dispatch an alert based on severity and category.
   * @param {Object} alert - The alert payload.
   */
  async dispatch(alert) {
    if (!this.enabled) return;

    const payload = {
      alert_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: this.source,
      ...alert
    };

    console.log(`[ALERT][${payload.severity}] ${payload.event_type}: ${payload.details}`);

    const tasks = [];

    // 1. Webhook Dispatch (All Severities >= MEDIUM)
    if (this.webhookUrl && ['CRITICAL', 'HIGH', 'MEDIUM'].includes(payload.severity)) {
      tasks.push(this.sendWebhook(payload));
    }

    // 2. Email Dispatch (All Severities >= HIGH)
    if (this.emailRecipient && ['CRITICAL', 'HIGH'].includes(payload.severity)) {
      tasks.push(this.sendEmail(payload));
    }

    // Fail-Open: We wait for dispatches but don't throw if they fail.
    try {
      await Promise.allSettled(tasks);
    } catch (err) {
      console.error('[ALERT_DISPATCH_ERROR]', err);
    }
  }

  async sendWebhook(payload) {
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      console.error(`[WEBHOOK_FAILED] ${this.webhookUrl}: ${err.message}`);
    }
  }

  async sendEmail(payload) {
    // Note: In Phase 2, this will use the RIO Gmail Connector.
    // For now, we log the intent to send.
    console.log(`[EMAIL_INTENT] To: ${this.emailRecipient} | Subject: RIO ${payload.severity} ALERT: ${payload.event_type}`);
  }
}

export const defaultDispatcher = new AlertDispatcher();
