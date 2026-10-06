import { prisma, disconnectDatabase } from '../config/database';
import { hashPassword } from '../utils/password';

async function seed() {
  console.log('🌱 Starting Scan-Pay-Eat Database Seed...\n');

  try {
    // 1. Seed Platform Admin
    const adminPassword = await hashPassword('Admin@123');
    const admin = await prisma.admin.upsert({
      where: { email: 'admin@scanpayeat.com' },
      update: {},
      create: {
        name: 'Super Admin',
        email: 'admin@scanpayeat.com',
        passwordHash: adminPassword,
        isActive: true,
      },
    });
    console.log('👑 Admin seeded:', admin.email);

    // 2. Seed Demo Shop: "ABC Restaurant"
    const shop = await prisma.shop.upsert({
      where: { slug: 'abc' },
      update: {},
      create: {
        name: 'ABC Restaurant',
        slug: 'abc',
        subdomain: 'abc',
        address: '101 Food Street, Indiranagar, Bengaluru',
        phone: '+91 98765 43210',
        qrUrl: 'https://abc.scanpayeat.com',
        isActive: true,
      },
    });
    console.log('🏪 Shop seeded:', shop.name, `(${shop.slug})`);

    // 3. Seed Shopkeeper for ABC Restaurant
    const shopkeeperPassword = await hashPassword('Shop@123');
    const shopkeeper = await prisma.shopkeeper.upsert({
      where: { email: 'shop@abc.com' },
      update: { shopId: shop.id },
      create: {
        name: 'John ABC',
        email: 'shop@abc.com',
        mobile: '9876543210',
        shopId: shop.id,
        passwordHash: shopkeeperPassword,
        isActive: true,
      },
    });
    console.log('🧑‍🍳 Shopkeeper seeded:', shopkeeper.email, `(Shop ID: ${shopkeeper.shopId})`);

    // 4. Seed Categories
    const categoriesData = [
      { name: 'Burgers', description: 'Juicy handcrafted burgers', sortOrder: 1 },
      { name: 'Sides', description: 'Crispy snacks and sides', sortOrder: 2 },
      { name: 'Beverages', description: 'Refreshing drinks and shakes', sortOrder: 3 },
    ];

    const categories = [];
    for (const c of categoriesData) {
      const cat = await prisma.category.upsert({
        where: { shopId_name: { shopId: shop.id, name: c.name } },
        update: {},
        create: {
          shopId: shop.id,
          name: c.name,
          description: c.description,
          sortOrder: c.sortOrder,
        },
      });
      categories.push(cat);
    }
    console.log(`📂 Seeded ${categories.length} categories.`);

    // 5. Seed Products
    const burgerCat = categories.find((c) => c.name === 'Burgers')!;
    const sidesCat = categories.find((c) => c.name === 'Sides')!;
    const bevCat = categories.find((c) => c.name === 'Beverages')!;

    const productsData = [
      {
        categoryId: burgerCat.id,
        name: 'Classic Chicken Burger',
        description: 'Crisp chicken patty with secret mayonnaise and pickles',
        price: 180,
        imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600',
        isAvailable: true,
      },
      {
        categoryId: burgerCat.id,
        name: 'Veggie Supreme Burger',
        description: 'Loaded vegetable and cheese patty with chipotle sauce',
        price: 150,
        imageUrl: 'https://images.unsplash.com/photo-1585238342024-78d387f4a707?w=600',
        isAvailable: true,
      },
      {
        categoryId: sidesCat.id,
        name: 'Peri-Peri French Fries',
        description: 'Golden potato fries seasoned with peri-peri spice mix',
        price: 90,
        imageUrl: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600',
        isAvailable: true,
      },
      {
        categoryId: sidesCat.id,
        name: 'Mozzarella Cheese Sticks',
        description: '6 pcs breaded molten mozzarella with marinara dip',
        price: 140,
        imageUrl: 'https://images.unsplash.com/photo-1548340748-6d2b7d7da280?w=600',
        isAvailable: true,
      },
      {
        categoryId: bevCat.id,
        name: 'Masala Chai',
        description: 'Freshly brewed aromatic tea with ginger and cardamom',
        price: 40,
        imageUrl: 'https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?w=600',
        isAvailable: true,
      },
      {
        categoryId: bevCat.id,
        name: 'Iced Cold Coffee',
        description: 'Rich dark espresso blended with creamy chilled milk',
        price: 90,
        imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600',
        isAvailable: true,
      },
    ];

    for (const p of productsData) {
      const existing = await prisma.product.findFirst({
        where: { shopId: shop.id, name: p.name },
      });
      if (!existing) {
        await prisma.product.create({
          data: {
            shopId: shop.id,
            categoryId: p.categoryId,
            name: p.name,
            description: p.description,
            price: p.price,
            imageUrl: p.imageUrl,
            isAvailable: p.isAvailable,
          },
        });
      }
    }
    console.log('🍔 Seeded menu products successfully.');

    // 6. Seed Demo Customer
    const custPassword = await hashPassword('Customer@123');
    const customer = await prisma.customer.upsert({
      where: { email: 'customer@demo.com' },
      update: {},
      create: {
        name: 'Demo Customer',
        email: 'customer@demo.com',
        mobile: '9876543210',
        passwordHash: custPassword,
      },
    });
    console.log('👤 Demo customer seeded:', customer.email);

    console.log('\n🎉 Seeding completed successfully!');
    console.log('Credentials Summary:');
    console.log('Admin:       admin@scanpayeat.com / Admin@123');
    console.log('Shopkeeper:  shop@abc.com        / Shop@123');
    console.log('Customer:    customer@demo.com   / Customer@123');
    console.log('Shop Slug:   abc');
    console.log('Public Menu: GET /api/public/shops/abc/menu\n');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

seed();
