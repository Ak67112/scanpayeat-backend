import { Prisma } from '@prisma/client';

/**
 * Generates an atomic sequential daily order token for a shop (e.g., A101, A102).
 * Uses PostgreSQL atomic upsert with increment on the TokenCounter model inside a Prisma transaction.
 */
export async function generateDailyToken(
  tx: Prisma.TransactionClient,
  shopId: number,
  shopPrefix = 'A'
): Promise<string> {
  const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
  const sanitizedPrefix = (shopPrefix.charAt(0) || 'A').toUpperCase();

  // Atomically increment or initialize the token counter for today
  const counter = await tx.tokenCounter.upsert({
    where: {
      shopId_date: {
        shopId,
        date: today,
      },
    },
    update: {
      lastSequence: {
        increment: 1,
      },
    },
    create: {
      shopId,
      date: today,
      lastSequence: 101, // Starts at 101 for the day
    },
  });

  return `${sanitizedPrefix}${counter.lastSequence}`;
}
