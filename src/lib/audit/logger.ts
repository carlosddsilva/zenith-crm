import { db } from "@/lib/db/client";
import { auditLogs } from "@/lib/db/schema";
import { ZenithAccountContext } from "@/lib/auth/zenith-account";

export type AuditAction = 
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "EXPORT"
  | "ANONYMIZE"
  | "BLOCK"
  | "UNBLOCK"
  | "OPT_OUT"
  | "OPT_IN"
  | "CONNECT_INTEGRATION"
  | "DISCONNECT_INTEGRATION"
  | "RESOLVE_CONFLICT"
  | "AI_CONFIGURE"
  | "AI_SOURCE_INGEST"
  | "AI_SOURCE_REMOVE"
  | "AI_MEMORY_CLEAR"
  | "AI_PAUSE"
  | "AI_RESUME";

export interface LogAuditParams {
  context: ZenithAccountContext;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, any>;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "secret",
  "sdp", // WebRTC SDP
  "credential",
  "apikey",
  "access_token",
  "refresh_token",
]);

export function sanitizeAuditMetadata(metadata: any): any {
  if (!metadata) return null;
  if (typeof metadata !== "object") return metadata;

  if (Array.isArray(metadata)) {
    return metadata.map(sanitizeAuditMetadata);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeAuditMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export async function logAuditAction(params: LogAuditParams) {
  const { context, action, entityType, entityId, metadata } = params;
  
  const sanitizedMetadata = sanitizeAuditMetadata(metadata);

  try {
    await db.insert(auditLogs).values({
      accountId: context.accountId,
      actorUserId: context.userId,
      action,
      entityType,
      entityId,
      metadata: sanitizedMetadata,
    });
  } catch (error) {
    // Audit failure should not crash the app, but should be logged to stderr/monitoring.
    // For extreme compliance, you might want to fail the transaction, but generally
    // non-blocking is preferred unless strict financial ledger.
    console.error("[AUDIT LOG FAILURE]", error);
  }
}
