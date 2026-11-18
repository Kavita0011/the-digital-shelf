import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface ScanQueueMessage {
  fileId: string;
  productId: string;
  analysisId: string;
  storagePath: string;
  originalFilename: string;
  expectedChecksum: string;
  actorId: string;
  actorRole: "seller";
}

interface QueueLike {
  send(message: ScanQueueMessage, options?: { delaySeconds?: number }): Promise<void>;
}

function scanQueue(): QueueLike | null {
  try {
    const { env } = getCloudflareContext();
    const queue = (env as Record<string, unknown> | undefined)?.SCAN_QUEUE as QueueLike | undefined;
    if (queue && typeof queue.send === "function") return queue;
  } catch {
    // Not running inside a Cloudflare Worker (e.g. next dev).
  }
  return null;
}

/**
 * Queue a background VT poll when running on Workers.
 * Returns false outside Workers so callers can fall back to synchronous polling.
 */
export async function enqueueScan(message: ScanQueueMessage): Promise<boolean> {
  const queue = scanQueue();
  if (!queue) return false;
  await queue.send(message);
  return true;
}
