import request from 'supertest';
import app from '../app';
import { prisma, disconnectDatabase } from '../config/database';

async function testPhase5() {
  console.log('🧪 Starting Phase 5 (Public Shop Menu & QR Flow) Verification...\n');

  let shop: any;

  try {
    const slug = `taste-${Date.now()}`;
    shop = await prisma.shop.create({
      data: {
        name: 'Taste of India',
        slug,
        subdomain: slug,
        address: '42 Spice Ave',
        phone: '9988776655',
      },
    });

    const category = await prisma.category.create({
      data: {
        shopId: shop.id,
        name: 'Beverages',
      },
    });

    // Create 1 available product and 1 unavailable product
    await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        name: 'Masala Chai',
        price: 30.0,
        isAvailable: true,
      },
    });

    await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        name: 'Mango Lassi (Sold Out)',
        price: 80.0,
        isAvailable: false,
      },
    });

    // 1. Test Public Shop Details
    console.log('1️⃣ Fetching public shop info without token...');
    const shopRes = await request(app).get(`/api/public/shops/${slug}`);
    if (shopRes.status !== 200) {
      throw new Error(`Failed to fetch shop: ${shopRes.status}`);
    }
    console.log('✅ Public shop resolved:', shopRes.body.data.shop.name);

    // 2. Test Public Shop Menu
    console.log('\n2️⃣ Fetching public menu (categories & available products)...');
    const menuRes = await request(app).get(`/api/public/shops/${slug}/menu`);
    if (menuRes.status !== 200) {
      throw new Error(`Failed to fetch menu: ${menuRes.status}`);
    }
    const categories = menuRes.body.data.categories;
    console.log(`✅ Retrieved ${categories.length} categories.`);
    const products = categories[0].products;
    console.log(`✅ Products in category: ${products.length}`);
    if (products.length !== 1 || products[0].name !== 'Masala Chai') {
      throw new Error('Unavailable products should be filtered out from public menu!');
    }
    console.log('✅ Only available products returned in public menu');

    // 3. Test Non-existent Slug
    console.log('\n3️⃣ Testing non-existent slug returns 404...');
    const notFoundRes = await request(app).get('/api/public/shops/nonexistent-slug');
    if (notFoundRes.status !== 404) {
      throw new Error(`Expected 404, got ${notFoundRes.status}`);
    }
    console.log('✅ Non-existent shop returned 404');

    console.log('\n🎉 Phase 5 (Public Shop Menu & QR Flow) passed all tests successfully!\n');
  } catch (error) {
    console.error('❌ Phase 5 test failure:', error);
    process.exit(1);
  } finally {
    if (shop?.id) {
      await prisma.shop.delete({ where: { id: shop.id } }).catch(() => {});
    }
    await disconnectDatabase();
  }
}

testPhase5();
