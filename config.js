window.CW_CONFIG = Object.freeze({
  appName: 'Cabinet Workshop OS',
  version: '2.3.0',
  workerUrl: 'https://cabinet-backup-worker.game-developer-mb.workers.dev',
  workerBackupPath: '/backup',
  workerTestPath: '/test-telegram',
  workerHealthPath: '/health',
  autosaveMs: 650,
  snapshotLimit: 30,
  ui: { compactTypography: true, touchTargetMinPx: 42 },
  drawing: { units: 'mm', defaultCanvasWidthMm: 2400, defaultCanvasHeightMm: 1400, majorGridMm: 100, minorGridMm: 10, snapMm: 5, zoomMin: 0.15, zoomMax: 8 }
});
