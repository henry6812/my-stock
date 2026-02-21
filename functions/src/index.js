import { onSchedule } from 'firebase-functions/v2/scheduler'
import { initializeApp } from 'firebase-admin/app'
import { runDailyPriceUpdate } from './jobs/dailyPriceUpdate.js'

initializeApp()

export const updateAllUsersPricesDaily = onSchedule(
  {
    schedule: '0 14 * * *',
    timeZone: 'Asia/Taipei',
    region: 'asia-east1',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => runDailyPriceUpdate(),
)
