import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "./db";
import { scheduledStatus, statusRotation, statusRotationItems } from "@shared/schema";
import { getSessions } from "./whatsapp";
import { messageQueueService } from "./messageQueueService";

const CHECK_INTERVAL_MS = 60 * 1000;
const RETRY_DELAY_MINUTES = 15;

type RotationMode = "sequential" | "random";

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function computeNextSchedule(base: Date, recurrenceType: string, interval: number): Date | null {
  const safeInterval = Math.max(1, interval || 1);
  if (recurrenceType === "daily") {
    return addDays(base, safeInterval);
  }
  if (recurrenceType === "weekly") {
    return addDays(base, safeInterval * 7);
  }
  if (recurrenceType === "monthly") {
    const next = new Date(base);
    next.setMonth(next.getMonth() + safeInterval);
    return next;
  }
  return null;
}

function pickSequentialItem<T extends { id: string }>(
  items: T[],
  lastItemId: string | null | undefined
): T {
  if (items.length === 0) {
    throw new Error("No items to rotate");
  }
  if (!lastItemId) {
    return items[0];
  }
  const idx = items.findIndex((item) => item.id === lastItemId);
  if (idx === -1) {
    return items[0];
  }
  return items[(idx + 1) % items.length];
}

function pickWeightedRandomItem<T extends { id: string; weight: number | null }>(
  items: T[],
  lastItemId: string | null | undefined
): T {
  const pool = items.length > 1 ? items.filter((item) => item.id !== lastItemId) : items;
  const total = pool.reduce((sum, item) => sum + Math.max(1, item.weight || 1), 0);
  let rand = Math.random() * total;
  for (const item of pool) {
    rand -= Math.max(1, item.weight || 1);
    if (rand <= 0) return item;
  }
  return pool[0];
}

export class StatusSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[STATUS SCHEDULER] Service started");
    this.timer = setInterval(() => this.process(), CHECK_INTERVAL_MS);
    setTimeout(() => this.process(), 15 * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  private async process(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      await this.processScheduledStatus();
      await this.processRotations();
    } catch (error) {
      console.error("[STATUS SCHEDULER] Error:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processScheduledStatus(): Promise<void> {
    const now = new Date();
    const pending = await db
      .select()
      .from(scheduledStatus)
      .where(and(eq(scheduledStatus.status, "pending"), lte(scheduledStatus.scheduledFor, now)))
      .orderBy(asc(scheduledStatus.scheduledFor));

    for (const item of pending) {
      const session = getSessions().get(item.userId);
      if (!session?.socket) {
        await db
          .update(scheduledStatus)
          .set({
            errorMessage: "WhatsApp not connected",
            scheduledFor: addMinutes(now, RETRY_DELAY_MINUTES),
            updatedAt: now,
          })
          .where(eq(scheduledStatus.id, item.id));
        continue;
      }

      try {
        await messageQueueService.executeWithDelay(item.userId, "status scheduled", async () => {
          return await session.socket.sendMessage("status@broadcast", { text: item.statusText });
        });

        const nextSchedule = computeNextSchedule(now, item.recurrenceType, item.recurrenceInterval);
        if (nextSchedule) {
          await db
            .update(scheduledStatus)
            .set({
              status: "pending",
              scheduledFor: nextSchedule,
              lastSentAt: now,
              errorMessage: null,
              updatedAt: now,
            })
            .where(eq(scheduledStatus.id, item.id));
        } else {
          await db
            .update(scheduledStatus)
            .set({
              status: "sent",
              lastSentAt: now,
              errorMessage: null,
              updatedAt: now,
            })
            .where(eq(scheduledStatus.id, item.id));
        }
      } catch (error: any) {
        await db
          .update(scheduledStatus)
          .set({
            errorMessage: error?.message || "Send failed",
            scheduledFor: addMinutes(now, RETRY_DELAY_MINUTES),
            updatedAt: now,
          })
          .where(eq(scheduledStatus.id, item.id));
      }
    }
  }

  private async processRotations(): Promise<void> {
    const now = new Date();
    const rotations = await db
      .select()
      .from(statusRotation)
      .where(
        and(
          eq(statusRotation.isActive, true),
          or(isNull(statusRotation.nextRunAt), lte(statusRotation.nextRunAt, now))
        )
      )
      .orderBy(asc(statusRotation.nextRunAt));

    for (const rotation of rotations) {
      const session = getSessions().get(rotation.userId);
      if (!session?.socket) {
        await db
          .update(statusRotation)
          .set({
            nextRunAt: addMinutes(now, RETRY_DELAY_MINUTES),
            updatedAt: now,
          })
          .where(eq(statusRotation.id, rotation.id));
        continue;
      }

      const items = await db
        .select()
        .from(statusRotationItems)
        .where(and(eq(statusRotationItems.rotationId, rotation.id), eq(statusRotationItems.isActive, true)))
        .orderBy(asc(statusRotationItems.displayOrder));

      if (items.length === 0) {
        await db
          .update(statusRotation)
          .set({
            nextRunAt: addMinutes(now, RETRY_DELAY_MINUTES),
            updatedAt: now,
          })
          .where(eq(statusRotation.id, rotation.id));
        continue;
      }

      const mode = (rotation.mode || "sequential") as RotationMode;
      const selected =
        mode === "random"
          ? pickWeightedRandomItem(items, rotation.lastItemId)
          : pickSequentialItem(items, rotation.lastItemId);

      try {
        await messageQueueService.executeWithDelay(rotation.userId, "status rotation", async () => {
          return await session.socket.sendMessage("status@broadcast", { text: selected.statusText });
        });

        const intervalMinutes = Math.max(1, rotation.intervalMinutes || 240);
        const nextRunAt = addMinutes(now, intervalMinutes);

        await db
          .update(statusRotation)
          .set({
            lastSentAt: now,
            nextRunAt,
            lastItemId: selected.id,
            updatedAt: now,
          })
          .where(eq(statusRotation.id, rotation.id));

        await db
          .update(statusRotationItems)
          .set({
            lastSentAt: now,
            updatedAt: now,
          })
          .where(eq(statusRotationItems.id, selected.id));
      } catch (error: any) {
        await db
          .update(statusRotation)
          .set({
            nextRunAt: addMinutes(now, RETRY_DELAY_MINUTES),
            updatedAt: now,
          })
          .where(eq(statusRotation.id, rotation.id));
      }
    }
  }
}

export const statusSchedulerService = new StatusSchedulerService();
