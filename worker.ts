// OpenNext generates .open-next/worker.js at build time.
// @ts-expect-error generated at build time
import { default as nextHandler } from "./.open-next/worker.js";
import type { ScanQueueMessage } from "./src/lib/queue";
import { processScanMessage, type ScanDelivery } from "./src/server/scan-consumer";

interface QueueDelivery extends ScanDelivery {
  body: unknown;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

interface QueueBatch {
  messages: QueueDelivery[];
}

function isScanMessage(body: unknown): body is ScanQueueMessage {
  if (!body || typeof body !== "object") return false;
  const value = body as Partial<ScanQueueMessage>;
  return Boolean(
    value.fileId && value.productId && value.analysisId &&
    value.storagePath && value.originalFilename && value.expectedChecksum &&
    value.actorId && value.actorRole === "seller",
  );
}

function settle(message: QueueDelivery): ScanDelivery {
  let done = false;
  return {
    attempts: message.attempts,
    ack() {
      if (!done) { done = true; message.ack(); }
    },
    retry(options) {
      if (!done) { done = true; message.retry(options); }
    },
  };
}

const worker = {
  fetch: nextHandler.fetch,

  async queue(batch: QueueBatch): Promise<void> {
    for (const message of batch.messages) {
      if (!isScanMessage(message.body)) {
        message.ack();
        continue;
      }
      const delivery = settle(message);
      try {
        await processScanMessage(message.body, delivery);
        delivery.ack();
      } catch (error) {
        console.error("Scan queue message failed", error);
        delivery.retry({ delaySeconds: 15 });
      }
    }
  },
};

export default worker;
