import { getSupabaseAdmin } from "../lib/admin-db";
import { audit } from "../lib/audit";
import { fetchAnalysis, type ScanOutcome } from "../lib/malware";
import type { ScanQueueMessage } from "../lib/queue";
import { deleteObject } from "../lib/r2";

export interface ScanDelivery {
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

function pollDelaySeconds(): number {
  return Math.max(5, Number(process.env.VT_POLL_INTERVAL_SECONDS ?? 15));
}

function maxPollAttempts(): number {
  return Math.max(1, Number(process.env.VT_MAX_POLL_ATTEMPTS ?? 80));
}

async function removeRejectedObject(path: string) {
  try {
    await deleteObject(path);
  } catch (error) {
    console.error("Failed to delete rejected upload object", error);
  }
}

async function failScan(message: ScanQueueMessage, reason: string) {
  const db = getSupabaseAdmin();
  await removeRejectedObject(message.storagePath);
  await db.from("product_files").update({
    scan_status: "failed",
    scan_provider: "virustotal",
    scan_result: { error: reason, analysisId: message.analysisId },
  }).eq("id", message.fileId);
  await db.from("products").update({
    status: "rejected",
    file_id: null,
    rejection_reason: "Automated malware scanning failed. Please contact support.",
  }).eq("id", message.productId);
  await audit({
    actorId: message.actorId,
    actorRole: message.actorRole,
    action: "upload.scan_failed",
    targetType: "product",
    targetId: message.productId,
    metadata: { reason, analysisId: message.analysisId },
  });
}

async function finalizeScan(message: ScanQueueMessage, outcome: ScanOutcome) {
  const db = getSupabaseAdmin();
  await db.from("product_files").update({
    scan_status: outcome.status,
    scan_provider: outcome.provider,
    scan_result: outcome.result,
  }).eq("id", message.fileId);

  if (outcome.status === "infected") {
    await removeRejectedObject(message.storagePath);
    await db.from("products").update({
      status: "rejected",
      file_id: null,
      rejection_reason: "Malware detected by automated security scanning.",
    }).eq("id", message.productId);
    await audit({
      actorId: message.actorId,
      actorRole: message.actorRole,
      action: "upload.malware_detected",
      targetType: "product",
      targetId: message.productId,
      metadata: outcome.result,
    });
    return;
  }

  await db.from("products").update({ status: "pending_review" }).eq("id", message.productId);
  await audit({
    actorId: message.actorId,
    actorRole: message.actorRole,
    action: "upload.scan_clean",
    targetType: "product",
    targetId: message.productId,
  });
}

/** Process one VirusTotal scan poll from the Cloudflare Queue. */
export async function processScanMessage(
  message: ScanQueueMessage,
  delivery: ScanDelivery,
): Promise<void> {
  const db = getSupabaseAdmin();
  const { data: file } = await db.from("product_files")
    .select("product_id,scan_status,scan_analysis_id")
    .eq("id", message.fileId)
    .single();

  // Stale/duplicate messages are safe to drop: DB state is the source of truth.
  if (!file || file.product_id !== message.productId || file.scan_analysis_id !== message.analysisId || file.scan_status !== "scanning") {
    delivery.ack();
    return;
  }

  if (delivery.attempts > maxPollAttempts()) {
    await failScan(message, "scan_timeout");
    delivery.ack();
    return;
  }

  let outcome: ScanOutcome | null;
  try {
    outcome = await fetchAnalysis(message.analysisId);
  } catch (error) {
    console.error("VirusTotal poll failed", error);
    delivery.retry({ delaySeconds: pollDelaySeconds() });
    return;
  }

  if (!outcome) {
    delivery.retry({ delaySeconds: pollDelaySeconds() });
    return;
  }

  await finalizeScan(message, outcome);
  delivery.ack();
}
