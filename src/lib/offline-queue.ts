import { openDB, DBSchema, IDBPDatabase } from 'idb'

interface PodQueueItem {
  id: string
  orderId: string
  deliveryData: {
    gps_location: { lat: number; lng: number; accuracy: number }
    table_bottles_returned: number
    table_bottles_notes: string
    pod_type: 'signature' | 'photo'
    delivered_at: string
    notes: string
  }
  podBlob: Blob
  podFileName: string
  createdAt: string
}

interface SPikaCRMDB extends DBSchema {
  pod_queue: {
    key: string
    value: PodQueueItem
  }
}

let db: IDBPDatabase<SPikaCRMDB> | null = null

async function getDB() {
  if (!db) {
    db = await openDB<SPikaCRMDB>('spika-crm', 1, {
      upgrade(database) {
        database.createObjectStore('pod_queue', { keyPath: 'id' })
      },
    })
  }
  return db
}

export async function queuePodUpload(item: Omit<PodQueueItem, 'createdAt'>) {
  const database = await getDB()
  await database.put('pod_queue', { ...item, createdAt: new Date().toISOString() })
}

export async function getPendingQueue(): Promise<PodQueueItem[]> {
  const database = await getDB()
  return database.getAll('pod_queue')
}

export async function removeFromQueue(id: string) {
  const database = await getDB()
  await database.delete('pod_queue', id)
}

export async function processQueue(
  uploadFn: (item: PodQueueItem) => Promise<void>
) {
  const items = await getPendingQueue()
  for (const item of items) {
    try {
      await uploadFn(item)
      await removeFromQueue(item.id)
    } catch {
      // Keep in queue and retry later
    }
  }
}
