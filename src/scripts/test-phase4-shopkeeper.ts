import request from 'supertest';
import app from '../app';
import { prisma, disconnectDatabase } from '../config/database';
import { hashPassword } from '../utils/password';

async function testPhase4() {
  console.log('🧪 Starting Phase 4 (Shopkeeper: Categories & Products) Verification...\n');

  let shop1: any;
  let shop2: any;
  let sk1Token: string;
  let sk2Token: string;

  try {
    // 1. Setup two distinct shops and shopkeepers to verify isolation
    console.log('1️⃣ Setting up Shop 1 and Shop 2 in PostgreSQL...');
    const now = Date.now();
    shop1 = await prisma.shop.create({
      data: {
        name: 'Burger Palace',
        slug: `bp-${now}`,
        subdomain: `bp-${now}`,
      },
    });

    shop2 = await prisma.shop.create({
      data: {
        name: 'Pizza Corner',
        slug: `pc-${now}`,
        subdomain: `pc-${now}`,
      },
    });

    const passHash = await hashPassword('Secret123');
    const sk1 = await prisma.shopkeeper.create({
      data: {
        name: 'Burger Boss',
        email: `sk1_${now}@test.com`,
        shopId: shop1.id,
        passwordHash: passHash,
      },
    });

    const sk2 = await prisma.shopkeeper.create({
      data: {
        name: 'Pizza Master',
        email: `sk2_${now}@test.com`,
        shopId: shop2.id,
        passwordHash: passHash,
      },
    });

    // Login sk1
    const sk1Login = await request(app)
      .post('/api/auth/login')
      .send({ email: sk1.email, password: 'Secret123' });
    sk1Token = sk1Login.body.data.accessToken;

    // Login sk2
    const sk2Login = await request(app)
      .post('/api/auth/login')
      .send({ email: sk2.email, password: 'Secret123' });
    sk2Token = sk2Login.body.data.accessToken;

    console.log('✅ Shopkeeper 1 & 2 authenticated.');

    // 2. Shopkeeper 1 creates category
    console.log('\n2️⃣ Testing Shopkeeper Category Creation...');
    const catRes = await request(app)
      .post('/api/shop/categories')
      .set('Authorization', `Bearer ${sk1Token}`)
      .send({
        name: 'Burgers',
        description: 'Juicy and delicious burgers',
      });

    if (catRes.status !== 201) {
      throw new Error(`Category creation failed: ${catRes.status} ${JSON.stringify(catRes.body)}`);
    }
    const category = catRes.body.data.category;
    console.log('✅ Category created:', category);
    if (category.shopId !== shop1.id) {
      throw new Error(`shopId mismatch: expected ${shop1.id}, got ${category.shopId}`);
    }

    // 3. Shopkeeper 1 creates product
    console.log('\n3️⃣ Testing Shopkeeper Product Creation...');
    const prodRes = await request(app)
      .post('/api/shop/products')
      .set('Authorization', `Bearer ${sk1Token}`)
      .send({
        categoryId: category.id,
        name: 'Chicken Burger',
        description: 'Crispy fried chicken fillet',
        price: 180.0,
        imageUrl: 'https://images.example.com/chicken-burger.jpg',
        isAvailable: true,
      });

    if (prodRes.status !== 201) {
      throw new Error(`Product creation failed: ${prodRes.status} ${JSON.stringify(prodRes.body)}`);
    }
    const product = prodRes.body.data.product;
    console.log('✅ Product created:', product);
    if (product.shopId !== shop1.id) {
      throw new Error(`Product shopId mismatch: expected ${shop1.id}, got ${product.shopId}`);
    }

    // 4. Test Product Availability Toggle
    console.log('\n4️⃣ Testing Product Availability Toggle...');
    const availRes = await request(app)
      .patch(`/api/shop/products/${product.id}/availability`)
      .set('Authorization', `Bearer ${sk1Token}`)
      .send({ isAvailable: false });

    if (availRes.status !== 200 || availRes.body.data.product.isAvailable !== false) {
      throw new Error('Failed to update product availability');
    }
    console.log('✅ Product marked unavailable successfully');

    // 5. Test Image Upload with a valid 1x1 PNG
    console.log('\n5️⃣ Testing Image Upload...');
    const validPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    const uploadRes = await request(app)
      .post('/api/shop/upload')
      .set('Authorization', `Bearer ${sk1Token}`)
      .attach('image', validPngBuffer, 'sample-food.png');

    if (uploadRes.status !== 200) {
      throw new Error(`Upload failed: ${uploadRes.status} ${JSON.stringify(uploadRes.body)}`);
    }
    console.log('✅ Image uploaded successfully, URL:', uploadRes.body.data.imageUrl);

    // 6. Cross-Tenant Isolation Test!
    // Shopkeeper 2 must NOT be able to view, update, or delete Shopkeeper 1's products
    console.log('\n6️⃣ Testing Multi-Tenant Shop Isolation (Shopkeeper 2 accessing Shopkeeper 1)...');
    const crossFetchRes = await request(app)
      .get(`/api/shop/products/${product.id}`)
      .set('Authorization', `Bearer ${sk2Token}`);

    if (crossFetchRes.status !== 404) {
      throw new Error(`Expected 404 for cross-shop product access, got ${crossFetchRes.status}`);
    }
    console.log('✅ Cross-shop product access correctly denied with 404');

    const crossUpdateRes = await request(app)
      .put(`/api/shop/products/${product.id}`)
      .set('Authorization', `Bearer ${sk2Token}`)
      .send({ name: 'Hacked Burger', price: 10 });

    if (crossUpdateRes.status !== 404) {
      throw new Error(`Expected 404 for cross-shop product edit, got ${crossUpdateRes.status}`);
    }
    console.log('✅ Cross-shop product edit correctly denied with 404');

    console.log('\n🎉 Phase 4 (Shopkeeper: Categories & Products) passed all tests successfully!\n');
  } catch (error) {
    console.error('❌ Phase 4 test failure:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (shop1?.id) await prisma.shop.delete({ where: { id: shop1.id } }).catch(() => {});
    if (shop2?.id) await prisma.shop.delete({ where: { id: shop2.id } }).catch(() => {});
    await disconnectDatabase();
  }
}

testPhase4();
