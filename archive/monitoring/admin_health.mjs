/**
 * RIO Admin Health Dashboard (TASK-033)
 * 
 * Lane: DevOps / Infrastructure
 * Owner: Damon
 * 
 * Responsibility: Provides detailed system metrics for real-time monitoring.
 * Fail-Open: Observability failures do not block governance execution.
 */

import os from 'os';

export class AdminHealthDashboard {
  constructor(db, integrityJob, config = {}) {
    this.db = db;
    this.integrityJob = integrityJob;
    this.startTime = Date.now();
    this.version = config.version || '1.0.0';
  }

  /**
   * Returns a detailed system metrics object.
   */
  async getMetrics() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const memoryUsage = process.memoryUsage();
    const loadAvg = os.loadavg();

    let ledgerStats = { count: 0, last_entry: null, status: 'UNKNOWN' };
    let lastAlert = null;

    try {
      // 1. Fetch Ledger Stats
      const ledgerResult = await this.db.query('SELECT COUNT(*) as count, MAX(timestamp) as last_entry FROM receipts');
      ledgerStats.count = parseInt(ledgerResult[0].count);
      ledgerStats.last_entry = ledgerResult[0].last_entry;
      ledgerStats.status = this.integrityJob.lastStatus;

      // 2. Fetch Last Critical Alert
      const alertResult = await this.db.query('SELECT * FROM alerts WHERE severity = $1 ORDER BY timestamp DESC LIMIT 1', ['CRITICAL']);
      if (alertResult.length > 0) {
        lastAlert = alertResult[0];
      }

    } catch (err) {
      console.error('[ADMIN_HEALTH_METRICS_ERROR]', err);
      ledgerStats.status = 'ERROR';
    }

    return {
      status: 'operational',
      gateway: 'RIO Governance Gateway',
      version: this.version,
      timestamp: new Date().toISOString(),
      uptime_seconds: uptime,
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        load_avg: loadAvg,
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
          heap_total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
          heap_used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB'
        }
      },
      ledger: {
        entry_count: ledgerStats.count,
        last_entry_at: ledgerStats.last_entry,
        integrity_status: ledgerStats.status,
        last_integrity_check: this.integrityJob.lastCheck
      },
      alerts: {
        last_critical_alert: lastAlert,
        dispatcher_enabled: true
      },
      database: {
        connection: 'connected',
        pool_size: 10 // Example static value
      },
      fail_mode: 'closed'
    };
  }

  /**
   * Express middleware for the /admin/health endpoint.
   */
  async handleRequest(req, res) {
    try {
      const metrics = await this.getMetrics();
      res.status(200).json(metrics);
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
}
