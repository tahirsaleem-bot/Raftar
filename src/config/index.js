module.exports = {
  app: {
    port: process.env.PORT || 3000,
    timezone: process.env.TIMEZONE || 'Asia/Karachi',
    dailyCutoffTime: process.env.DAILY_CUTOFF_TIME || '17:00',
    kmMin: parseInt(process.env.KM_MIN || '0', 10),
    kmMax: parseInt(process.env.KM_MAX || '200', 10),
    reminderDelayHours: parseInt(process.env.REMINDER_DELAY_HOURS || '24', 10),
    duplicatePolicy: process.env.DUPLICATE_POLICY || 'average',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  },
  whatsapp: {
    apiBaseUrl: process.env.WHATSAPP_API_URL || 'http://localhost:3000',
    webhookVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'test-token',
  },
  google: {
    sheetId: process.env.GOOGLE_SHEET_ID || '',
    sheetName: process.env.GOOGLE_SHEET_NAME || 'KM Records',
  },
};
