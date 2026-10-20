import { Prisma } from '@prisma/client';

/**
 * Returns the current business date string (YYYY-MM-DD) based on local restaurant timezone.
 * Defaults to Asia/Kolkata (IST).
 */
export function getBusinessDate(timeZone = 'Asia/Kolkata'): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now); // "YYYY-MM-DD" e.g. "2026-10-20"
}

/**
 * Generates a strictly unique daily sequential order counter token for a restaurant shop.
 * Requirement:
 * - Starts each new business day at 01.
 * - Increments sequentially for every new order created that day (01, 02, 03, ...).
 * - Resets to 01 on the next business day.
 * - Removes old prefixes (such as J101 or A101).
 * - Safe atomic sequence generation inside Prisma transaction.
 * - Cancelled orders retain their tokens for that day; issued tokens are never reused.
 */
export async function generateDailyToken(
  tx: Prisma.TransactionClient,
  shopId: number,
  _shopPrefix?: string,
  timeZone = 'Asia/Kolkata'
): Promise<string> {
  const businessDate = getBusinessDate(timeZone);

  // Atomically find or upsert the counter for this shop and businessDate
  const counter = await tx.tokenCounter.upsert({
    where: {
      shopId_date: {
        shopId,
        date: businessDate,
      },
    },
    create: {
      shopId,
      date: businessDate,
      lastSequence: 1,
    },
    update: {
      lastSequence: {
        increment: 1,
      },
    },
  });

  let seq = counter.lastSequence;
  // Pad with leading zero (01, 02, ... 99, 100)
  let candidateToken = String(seq).padStart(2, '0');

  // Verify uniqueness for today's business date
  const startOfDay = new Date(`${businessDate}T00:00:00+05:30`);
  const endOfDay = new Date(`${businessDate}T23:59:59.999+05:30`);

  let collision = await tx.order.findFirst({
    where: {
      shopId,
      tokenNumber: candidateToken,
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  while (collision) {
    seq += 1;
    candidateToken = String(seq).padStart(2, '0');
    await tx.tokenCounter.update({
      where: {
        shopId_date: {
          shopId,
          date: businessDate,
        },
      },
      data: {
        lastSequence: seq,
      },
    });
    collision = await tx.order.findFirst({
      where: {
        shopId,
        tokenNumber: candidateToken,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });
  }

  return candidateToken;
}
