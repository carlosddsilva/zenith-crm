import { pgTable, text, timestamp, uuid, integer, customType } from "drizzle-orm/pg-core";
import { accounts } from "./identity";

// Custom Drizzle type to map PostgreSQL 'bytea' to Node.js 'Buffer'
export const bytea = customType<{ data: Buffer; driverData: string | Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(val: Buffer): string {
    return "\\x" + val.toString("hex");
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (typeof value === "string") {
      if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
      return Buffer.from(value);
    }
    throw new Error("Expected Buffer or string for bytea column");
  },
});

export const mediaObjects = pgTable("media_objects", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
    
  filename: text("filename").notNull(),
  
  mimeType: text("mime_type").notNull(),
  
  size: integer("size").notNull(),
  
  content: bytea("content").notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
