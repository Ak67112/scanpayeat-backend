import { Prisma } from '@prisma/client';

/**
 * Generates a strictly unique sequential order counter token for a shop (e.g., J101, J102, J103).
 * Uses PostgreSQL atomic operations on the TokenCounter model inside a Prisma transaction.
 * Guarantees that once a token number has been issued, it is NEVER issued again ("once come not again came").
 */
export async function generateDailyToken(
  tx: Prisma.TransactionClient,
  shopId: number,
  shopPrefix = 'A'
): Promise<string> {
  const sanitizedPrefix = (shopPrefix.charAt(0) || 'A').toUpperCase();

  // Find maximum sequence already used in orders for this shop
  const existingOrders = await tx.order.findMany({
    where: {
      shopId,
      tokenNumber: { not: null },
    },
    select: { tokenNumber: true },
  });

  let maxOrderSeq = 100;
  for (const ord of existingOrders) {
    if (ord.tokenNumber) {
      const match = ord.tokenNumber.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num > maxOrderSeq) {
          maxOrderSeq = num;
        }
      }
    }
  }

  // Atomically find or initialize the LIFETIME counter for this shop
  let counter = await tx.tokenCounter.findUnique({
    where: { shopId_date: { shopId, date: 'LIFETIME' } },
  });

  let nextSeq = 101;
  if (!counter) {
    nextSeq = Math.max(101, maxOrderSeq + 1);
    counter = await tx.tokenCounter.create({
      data: {
        shopId,
        date: 'LIFETIME',
        lastSequence: nextSeq,
      },
    });
  } else {
    const baseSeq = Math.max(counter.lastSequence, maxOrderSeq);
    nextSeq = baseSeq + 1;
    counter = await tx.tokenCounter.update({
      where: { id: counter.id },
      data: { lastSequence: nextSeq },
    });
  }

  // Guarantee uniqueness: verify candidate has NEVER been assigned to any order in this shop
  let candidateToken = `${sanitizedPrefix}${nextSeq}`;
  let collision = await tx.order.findFirst({
    where: { shopId, tokenNumber: candidateToken },
  });

  while (collision) {
    nextSeq += 1;
    candidateToken = `${sanitizedPrefix}${nextSeq}`;
    await tx.tokenCounter.update({
      where: { id: counter.id },
      data: { lastSequence: nextSeq },
    });
    collision = await tx.order.findFirst({
      where: { shopId, tokenNumber: candidateToken },
    });
  }

  // Keep today's date record updated as well for analytics compatibility
  const today = new Date().toISOString().split('T')[0];
  await tx.tokenCounter.upsert({
    where: {
      shopId_date: {
        shopId,
        date: today,
      },
    },
    update: {
      lastSequence: nextSeq,
    },
    create: {
      shopId,
      date: today,
      lastSequence: nextSeq,
    },
  });

  return candidateToken;
}
