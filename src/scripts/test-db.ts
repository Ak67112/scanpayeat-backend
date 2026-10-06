import { prisma, connectDatabase, disconnectDatabase } from '../config/database';

async function main() {
  console.log('Testing PostgreSQL connection...');
  const connected = await connectDatabase();
  if (!connected) {
    console.error('❌ Database connection failed. Please check your DATABASE_URL in .env');
    process.exit(1);
  }

  try {
    // Run a lightweight raw query
    const result = await prisma.$queryRaw`SELECT 1 as connected, current_database() as db, version() as version;`;
    console.log('✅ Query test successful:', result);

    // Check count of admins, shops, etc.
    const shopCount = await prisma.shop.count();
    const customerCount = await prisma.customer.count();
    console.log(`📊 Current DB Stats -> Shops: ${shopCount}, Customers: ${customerCount}`);
  } catch (error) {
    console.error('❌ Query execution failed:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

main();
