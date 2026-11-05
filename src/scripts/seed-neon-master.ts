import { prisma } from '../config/database';
import { hashPassword } from '../utils/password';

async function seedNeonMaster() {
  console.log('🚀 Starting Full Database Seeding on Neon PostgreSQL...\n');

  try {
    // 1. Seed Platform Admins
    const adminPassword = await hashPassword('Admin@123');

    const admin1 = await prisma.admin.upsert({
      where: { email: 'admin@hotelkada.com' },
      update: { passwordHash: adminPassword, isActive: true },
      create: {
        name: 'Super Admin',
        email: 'admin@hotelkada.com',
        passwordHash: adminPassword,
        isActive: true,
      },
    });
    console.log('👑 Admin seeded:', admin1.email);

    const admin2 = await prisma.admin.upsert({
      where: { email: 'admin@scanpayeat.com' },
      update: { passwordHash: adminPassword, isActive: true },
      create: {
        name: 'Super Admin',
        email: 'admin@scanpayeat.com',
        passwordHash: adminPassword,
        isActive: true,
      },
    });
    console.log('👑 Admin seeded:', admin2.email);

    // 2. Seed Global Platform Coupons
    const couponsData = [
      {
        code: 'WELCOME50',
        discountType: 'PERCENT',
        discountValue: 50,
        minOrderAmount: 150,
        maxDiscount: 100,
      },
      {
        code: 'HOTELKADA20',
        discountType: 'PERCENT',
        discountValue: 20,
        minOrderAmount: 300,
        maxDiscount: 200,
      },
      {
        code: 'FLAT50',
        discountType: 'FIXED',
        discountValue: 50,
        minOrderAmount: 200,
        maxDiscount: 50,
      },
    ];

    for (const c of couponsData) {
      await prisma.coupon.upsert({
        where: { code: c.code },
        update: {
          discountType: c.discountType,
          discountValue: c.discountValue,
          minOrderAmount: c.minOrderAmount,
          maxDiscount: c.maxDiscount,
          isActive: true,
        },
        create: {
          code: c.code,
          discountType: c.discountType,
          discountValue: c.discountValue,
          minOrderAmount: c.minOrderAmount,
          maxDiscount: c.maxDiscount,
          isActive: true,
        },
      });
    }
    console.log('🎟️ Seeded platform coupons:', couponsData.map((c) => c.code).join(', '));

    // 3. Seed Sample Shop: Noshta Cafe
    const shop = await prisma.shop.upsert({
      where: { slug: 'noshtacafe' },
      update: {
        name: 'Noshta Cafe',
        subdomain: 'noshtacafe',
        phone: '7200446380',
        address: '12 Heritage Boulevard, Near City Center, Madurai, Tamil Nadu',
        state: 'Tamil Nadu',
        district: 'Madurai',
        description:
          'Gourmet Smashed Burgers, Saucy Wings, Chimney Cones, Artisanal Coffee & OG Bubble Tea. Freshly prepared to order!',
        logoUrl:
          'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&auto=format&fit=crop&q=80',
        bannerUrl:
          'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&auto=format&fit=crop&q=80',
        ambienceImages: [
          'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=800&auto=format&fit=crop&q=80',
        ],
        hasDining: true,
        tableCount: 6,
        isOrderingEnabled: true,
        isActive: true,
        qrUrl: 'https://www.hotelkada.com/shop/noshtacafe',
        gstEnabled: true,
        cgstRate: 2.5,
        sgstRate: 2.5,
        gstNumber: '33AAAAA0000A1Z5',
      },
      create: {
        name: 'Noshta Cafe',
        slug: 'noshtacafe',
        subdomain: 'noshtacafe',
        phone: '7200446380',
        address: '12 Heritage Boulevard, Near City Center, Madurai, Tamil Nadu',
        state: 'Tamil Nadu',
        district: 'Madurai',
        description:
          'Gourmet Smashed Burgers, Saucy Wings, Chimney Cones, Artisanal Coffee & OG Bubble Tea. Freshly prepared to order!',
        logoUrl:
          'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&auto=format&fit=crop&q=80',
        bannerUrl:
          'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&auto=format&fit=crop&q=80',
        ambienceImages: [
          'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=800&auto=format&fit=crop&q=80',
        ],
        hasDining: true,
        tableCount: 6,
        isOrderingEnabled: true,
        isActive: true,
        qrUrl: 'https://www.hotelkada.com/shop/noshtacafe',
        gstEnabled: true,
        cgstRate: 2.5,
        sgstRate: 2.5,
        gstNumber: '33AAAAA0000A1Z5',
      },
    });
    console.log(`🏪 Shop seeded: ${shop.name} (ID: ${shop.id}, Slug: ${shop.slug})`);

    // 4. Seed Shopkeeper User for Noshta Cafe
    const shopkeeperPassword = await hashPassword('Shop@123');

    const keeper1 = await prisma.shopkeeper.upsert({
      where: { email: 'noshta@hotelkada.com' },
      update: { shopId: shop.id, passwordHash: shopkeeperPassword, isActive: true },
      create: {
        name: 'Noshta Kitchen Manager',
        email: 'noshta@hotelkada.com',
        mobile: '7200446380',
        shopId: shop.id,
        passwordHash: shopkeeperPassword,
        isActive: true,
      },
    });

    const keeper2 = await prisma.shopkeeper.upsert({
      where: { email: 'keeper@noshta.com' },
      update: { shopId: shop.id, passwordHash: shopkeeperPassword, isActive: true },
      create: {
        name: 'Noshta Kitchen Staff',
        email: 'keeper@noshta.com',
        mobile: '7200446380',
        shopId: shop.id,
        passwordHash: shopkeeperPassword,
        isActive: true,
      },
    });
    console.log('🧑‍🍳 Shopkeepers seeded:', keeper1.email, keeper2.email);

    // 5. Seed Wallet for Shopkeeper
    const wallet1 = await prisma.shopkeeperWallet.upsert({
      where: { shopkeeperId: keeper1.id },
      update: {
        balance: 5100.0,
        minWalletLimit: -1000.0,
        isQrEnabled: true,
        totalCredits: 15500.0,
        totalDebits: 10400.0,
      },
      create: {
        shopkeeperId: keeper1.id,
        balance: 5100.0,
        minWalletLimit: -1000.0,
        isQrEnabled: true,
        totalCredits: 15500.0,
        totalDebits: 10400.0,
      },
    });

    await prisma.shopkeeperWallet.upsert({
      where: { shopkeeperId: keeper2.id },
      update: {
        balance: 0.0,
        minWalletLimit: 0.0,
        isQrEnabled: true,
        totalCredits: 0.0,
        totalDebits: 0.0,
      },
      create: {
        shopkeeperId: keeper2.id,
        balance: 0.0,
        minWalletLimit: 0.0,
        isQrEnabled: true,
        totalCredits: 0.0,
        totalDebits: 0.0,
      },
    });

    // Seed audit-compliant Ledger Transactions for wallet1 (Noshta Kitchen Manager)
    const seedTransactions = [
      {
        idempotencyKey: 'TX_SEED_ONBOARDING_TOPUP',
        walletId: wallet1.id,
        type: 'CREDIT' as const,
        amount: 5000.0,
        previousBalance: 0.0,
        newBalance: 5000.0,
        reference: 'ADM-CR-HK90214',
        notes: 'Initial platform wallet credit by Admin upon restaurant onboarding',
        createdAt: new Date('2026-10-25T10:00:00.000Z'),
      },
      {
        idempotencyKey: 'TX_SEED_SETTLE_T14820',
        walletId: wallet1.id,
        type: 'CREDIT' as const,
        amount: 4200.0,
        previousBalance: 5000.0,
        newBalance: 9200.0,
        reference: 'ORD-SETTLE-T14820',
        notes: 'QR Dine-in Orders Daily Settlement (Tables #1, #2, #4)',
        createdAt: new Date('2026-10-28T14:30:00.000Z'),
      },
      {
        idempotencyKey: 'TX_SEED_FEE_OCT_W4',
        walletId: wallet1.id,
        type: 'DEBIT' as const,
        amount: 3200.0,
        previousBalance: 9200.0,
        newBalance: 6000.0,
        reference: 'PLT-FEE-OCT-W4',
        notes: 'Platform commission (2%) & Razorpay gateway processing fees',
        createdAt: new Date('2026-10-29T23:59:00.000Z'),
      },
      {
        idempotencyKey: 'TX_SEED_SETTLE_T29310',
        walletId: wallet1.id,
        type: 'CREDIT' as const,
        amount: 6200.0,
        previousBalance: 6000.0,
        newBalance: 12200.0,
        reference: 'ORD-SETTLE-T29310',
        notes: 'Weekend QR dining batch settlement (Tables #1 to #6)',
        createdAt: new Date('2026-11-01T12:15:00.000Z'),
      },
      {
        idempotencyKey: 'TX_SEED_FEE_NOV_W1',
        walletId: wallet1.id,
        type: 'DEBIT' as const,
        amount: 7200.0,
        previousBalance: 12200.0,
        newBalance: 5000.0,
        reference: 'PLT-FEE-NOV-W1',
        notes: 'Monthly KDS software licence & platform convenience charge',
        createdAt: new Date('2026-11-02T23:59:00.000Z'),
      },
      {
        idempotencyKey: 'RCH_pay_Tw2WmFfzDtU8Uf',
        walletId: wallet1.id,
        type: 'CREDIT' as const,
        amount: 100.0,
        previousBalance: 5000.0,
        newBalance: 5100.0,
        reference: 'pay_Tw2WmFfzDtU8Uf',
        notes: 'Online Wallet Recharge via Razorpay (pay_Tw2WmFfzDtU8Uf)',
        createdAt: new Date('2026-11-04T08:55:59.273Z'),
      },
    ];

    for (const tx of seedTransactions) {
      await prisma.walletTransaction.upsert({
        where: { idempotencyKey: tx.idempotencyKey },
        update: {
          walletId: tx.walletId,
          type: tx.type,
          amount: tx.amount,
          previousBalance: tx.previousBalance,
          newBalance: tx.newBalance,
          reference: tx.reference,
          notes: tx.notes,
          createdAt: tx.createdAt,
        },
        create: {
          idempotencyKey: tx.idempotencyKey,
          walletId: tx.walletId,
          type: tx.type,
          amount: tx.amount,
          previousBalance: tx.previousBalance,
          newBalance: tx.newBalance,
          reference: tx.reference,
          notes: tx.notes,
          createdAt: tx.createdAt,
        },
      });
    }
    console.log('💰 Seeded Shopkeeper Wallet and 6 Ledger Transactions with balance ₹5,100.00');

    // 6. Seed All Categories & Menu Products for Noshta Cafe
    const menuData = [
      {
        category: 'STARTERS',
        description: 'Crisp, golden sides & crunchy popcorn appetizers to kickstart your meal',
        sortOrder: 1,
        items: [
          {
            name: 'Classic Fries',
            price: 150,
            description: 'Golden crispy classic salted french fries, fried to perfection',
            imageUrl: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Masala Fries',
            price: 170,
            description: 'Crispy french fries tossed with special Indian spice seasoning blend',
            imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Chicken Popcorn',
            price: 200,
            description: 'Bite-sized tender crispy fried chicken popcorn with herbs & dip',
            imageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Chicken Loaded Fries',
            price: 280,
            description: 'Hot crispy fries heavily loaded with seasoned chicken chunks, creamy sauces & melted cheese',
            imageUrl: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Oyster Mushroom Pops',
            price: 230,
            description: 'Crispy bite-sized battered oyster mushroom pops seasoned with fragrant herbs',
            imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281699?w=600&auto=format&fit=crop&q=80',
          },
        ],
      },
      {
        category: 'SAUCY FRIES',
        description: 'Crisp fries smothered and tossed in rich chef-crafted sauces & gourmet toppings',
        sortOrder: 2,
        items: [
          {
            name: 'Chilli Mayo Fries',
            price: 200,
            description: 'Crispy french fries generously drizzled with zesty garlic chilli mayo sauce',
            imageUrl: 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'BBQ Cheese Fries',
            price: 200,
            description: 'Crispy golden fries smothered in smoky barbecue sauce and warm cheese drizzle',
            imageUrl: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Schezwan Fries',
            price: 200,
            description: 'Hot wok-tossed spicy and tangy Schezwan french fries (Spicy 🌶️)',
            imageUrl: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Maggi Magic Fries',
            price: 200,
            description: 'Crispy fries tossed with aromatic, nostalgic Maggi magic masala spice blend',
            imageUrl: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Peri Peri Fries',
            price: 200,
            description: 'Hot & tangy African bird eye peri peri seasoned crispy fries (Spicy 🌶️)',
            imageUrl: 'https://images.unsplash.com/photo-1605333396915-47ed6b68a00e?w=600&auto=format&fit=crop&q=80',
          },
        ],
      },
      {
        category: 'SANDWICHES',
        description: 'Artisanal grilled sandwiches with generous fillings, spiced cottage cheese & marinated chicken',
        sortOrder: 3,
        items: [
          {
            name: 'Spicy Paneer Sandwich',
            price: 240,
            description: 'Toasted gourmet sandwich packed with spiced tandoori paneer, peppers and melted cheese',
            imageUrl: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Creamy Chicken Sandwich',
            price: 240,
            description: 'Succulent pulled chicken breast folded in velvety mayonnaise, fresh cracked black pepper and herbs',
            imageUrl: 'https://images.unsplash.com/photo-1554433607-66b5efe9d304?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Cajun Chicken Sandwich',
            price: 240,
            description: 'Smoky New Orleans Cajun-spiced grilled chicken layered with lettuce, onions and creamy ranch',
            imageUrl: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Spicy Chicken Sandwich',
            price: 240,
            description: 'Fiery grilled chicken sandwich with spicy chili marinade and crisp toasted bread (Spicy 🌶️)',
            imageUrl: 'https://images.unsplash.com/photo-1619860860774-1e2e17343432?w=600&auto=format&fit=crop&q=80',
          },
        ],
      },
      {
        category: 'KATHI ROLLS',
        description: 'Flaky golden paratha rolls stuffed with cottage cheese or marinated chicken and signature seasonings',
        sortOrder: 4,
        items: [
          {
            name: 'Butter Paneer Roll',
            price: 220,
            description: 'Soft layered roll stuffed with rich, buttery makhani gravy cottage cheese & crisp onions',
            imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Butter Chicken Roll',
            price: 220,
            description: 'Flaky warm paratha wrap loaded with tender chicken in rich makhani butter sauce',
            imageUrl: 'https://images.unsplash.com/photo-1644781408892-d6ef7173e6a9?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Chettinadu Chicken Roll',
            price: 220,
            description: 'Authentic fiery Chettinad chicken tossed in freshly roasted spices and rolled in soft paratha (Spicy 🌶️)',
            imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Cheesy Chicken Roll',
            price: 220,
            description: 'Tender seasoned chicken and gooey melted cheddar-mozzarella blend wrapped tight in paratha',
            imageUrl: 'https://images.unsplash.com/photo-1644781408892-d6ef7173e6a9?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Fried Chicken Roll',
            price: 240,
            description: 'Crispy buttermilk battered fried chicken strips with pickled onion and tangy house dressing',
            imageUrl: 'https://images.unsplash.com/photo-1644781408892-d6ef7173e6a9?w=600&auto=format&fit=crop&q=80',
          },
        ],
      },
      {
        category: 'CHIMNEY CONES',
        description: 'Handcrafted Hungarian sweet & savory chimney bread cones stuffed to the brim',
        sortOrder: 5,
        items: [
          {
            name: 'Chettinad Chicken Cone',
            price: 250,
            description: 'Crispy warm chimney cone loaded with fiery Chettinad chicken and aromatic curry spices (Spicy 🌶️)',
            imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Butter Chicken Cone',
            price: 250,
            description: 'Savory chimney bread cone filled with decadent creamy butter chicken and a dash of cream',
            imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Cheesy Paneer Cone',
            price: 250,
            description: 'Warm chimney cone overflowing with melted mozzarella cheese and marinated paneer cubes',
            imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80',
          },
        ],
      },
      {
        category: 'CHICKEN WINGS',
        description: 'Crispy, jumbo bone-in wings tossed in sweet, buttery, garlic, or flaming hot sauces',
        sortOrder: 6,
        items: [
          {
            name: 'Classic Fried Wings',
            price: 210,
            description: 'Crispy golden batter-fried chicken wings served with creamy dipping sauce',
            imageUrl: 'https://images.unsplash.com/photo-1527477321005-4d01d75bb2a6?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'BBQ Wings',
            price: 260,
            description: 'Crispy wings glazed in authentic sweet & smoky Kansas-style BBQ sauce',
            imageUrl: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Noshta Signature Wings',
            price: 290,
            description: 'Chef signature wings tossed in rich, velvety buttery & tangy secret glaze',
            imageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Nashville Hot Wings',
            price: 290,
            description: 'Wings dipped in hot seasoned cayenne oil & dusted with fiery Nashville spices (Spicy 🌶️)',
            imageUrl: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=600&auto=format&fit=crop&q=80',
          },
        ],
      },
      {
        category: 'GOURMET BURGERS',
        description: 'Gourmet smashed chicken & mutton patties, fried fillets & vegetarian burger marvels',
        sortOrder: 7,
        items: [
          {
            name: 'Signature Smashed Burger',
            price: 330,
            description: 'Double smashed crispy-edge chicken patties, melted cheese and signature Noshta sauce',
            imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Nashville Chicken Burger',
            price: 310,
            description: 'Fried chicken fillet dipped in seasoned hot oil & dusted with fiery Nashville spices (Spicy 🌶️)',
            imageUrl: 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Madurai Mutton Smashed Burger',
            price: 450,
            description: 'Double smashed tender mutton patties packed with rich, aromatic local Madurai flavours & caramelized shallots',
            imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Fried Paneer Burger',
            price: 270,
            description: 'Crispy golden crumb-fried paneer patty with lettuce, tomatoes and creamy house mayo',
            imageUrl: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80',
          },
        ],
      },
      {
        category: 'PASTA & ITALIAN',
        description: 'Imported durum wheat Penne cooked al dente in rich Italian red or white sauces',
        sortOrder: 8,
        items: [
          {
            name: 'Alfredo Pasta (Chicken)',
            price: 320,
            description: 'Penne with grilled juicy chicken in velvety creamy parmesan Alfredo sauce with black pepper',
            imageUrl: 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Arrabbiata Pasta (Veg)',
            price: 300,
            description: 'Penne pasta tossed in spicy Italian garlic tomato Arrabbiata red sauce with herbs (Spicy 🌶️)',
            imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281699?w=600&auto=format&fit=crop&q=80',
          },
        ],
      },
      {
        category: 'BEVERAGES & SHAKES',
        description: 'Signature coolers, artisanal coffees, dessert shakes, and bubble teas',
        sortOrder: 9,
        items: [
          {
            name: 'Iced Salted Caramel Latte',
            price: 200,
            description: 'Cold milk and espresso swirled with rich salted caramel sauce over ice cubes',
            imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Lemon & Mint Mojito',
            price: 120,
            description: 'Classic zesty lime and freshly muddled garden mint with crisp bubbly soda',
            imageUrl: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Biscoff Shake',
            price: 220,
            description: 'Creamy thick shake blended with spiced caramelized Lotus Biscoff spread and cookie crumbs',
            imageUrl: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80',
          },
          {
            name: 'Thai Red Tea (OG Bubble Tea)',
            price: 200,
            description: 'Authentic brewed Thai red milk tea served with Strawberry Nata de Coco and juicy Litchi popping boba',
            imageUrl: 'https://images.unsplash.com/photo-1553787499-6f9133860278?w=600&auto=format&fit=crop&q=80',
          },
        ],
      },
    ];

    let totalProducts = 0;
    for (const cat of menuData) {
      let createdCat = await prisma.category.findFirst({
        where: { shopId: shop.id, name: cat.category },
      });

      if (!createdCat) {
        createdCat = await prisma.category.create({
          data: {
            shopId: shop.id,
            name: cat.category,
            description: cat.description,
            sortOrder: cat.sortOrder,
            isActive: true,
          },
        });
      } else {
        createdCat = await prisma.category.update({
          where: { id: createdCat.id },
          data: {
            description: cat.description,
            sortOrder: cat.sortOrder,
            isActive: true,
          },
        });
      }

      for (const item of cat.items) {
        const existingProd = await prisma.product.findFirst({
          where: { shopId: shop.id, name: item.name },
        });

        if (existingProd) {
          await prisma.product.update({
            where: { id: existingProd.id },
            data: {
              categoryId: createdCat.id,
              price: item.price,
              description: item.description,
              imageUrl: item.imageUrl,
              isAvailable: true,
            },
          });
        } else {
          await prisma.product.create({
            data: {
              shopId: shop.id,
              categoryId: createdCat.id,
              name: item.name,
              price: item.price,
              description: item.description,
              imageUrl: item.imageUrl,
              isAvailable: true,
            },
          });
        }
        totalProducts++;
      }
    }

    console.log(`✅ Seeded ${menuData.length} Categories and ${totalProducts} Products for Noshta Cafe`);

    // 7. Seed Initial Realistic QR Scans for Noshta Cafe
    const existingScansCount = await prisma.qrScan.count({ where: { shopId: shop.id } });
    if (existingScansCount === 0) {
      console.log('📲 Seeding initial QR scan history for Noshta Cafe...');
      const tableScanDistribution = [
        { table: null, qrType: 'COUNTER', count: 18 },  // Counter / Takeaway QR
        { table: '1', qrType: 'TABLE', count: 28 },    // Table #1
        { table: '2', qrType: 'TABLE', count: 35 },    // Table #2
        { table: '3', qrType: 'TABLE', count: 19 },    // Table #3
        { table: '4', qrType: 'TABLE', count: 24 },    // Table #4
        { table: '5', qrType: 'TABLE', count: 31 },    // Table #5
        { table: '6', qrType: 'TABLE', count: 22 },    // Table #6
      ];

      const now = Date.now();
      const mockIps = ['152.58.12.44', '157.48.91.102', '49.37.210.88', '106.198.45.12', '27.5.112.99'];
      const mockAgents = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
      ];

      const scansToCreate = [];
      for (const dist of tableScanDistribution) {
        for (let i = 0; i < dist.count; i++) {
          const hoursAgo = Math.floor(Math.random() * 120);
          const scanTime = new Date(now - hoursAgo * 3600 * 1000 - Math.floor(Math.random() * 3600 * 1000));
          scansToCreate.push({
            shopId: shop.id,
            tableNumber: dist.table,
            qrType: dist.qrType,
            ipAddress: mockIps[i % mockIps.length],
            userAgent: mockAgents[i % mockAgents.length],
            createdAt: scanTime,
          });
        }
      }

      await prisma.qrScan.createMany({
        data: scansToCreate,
      });
      console.log(`✅ Seeded ${scansToCreate.length} QR scans across 6 tables + Counter QR`);
    }
    console.log('\n🎉 Database Configuration & Sample Shop Setup Completed Successfully!');
    console.log('----------------------------------------------------');
    console.log('📌 Platform Admin:');
    console.log('   Email: admin@hotelkada.com');
    console.log('   Password: Admin@123');
    console.log('📌 Shopkeeper (Noshta Cafe):');
    console.log('   Email: noshta@hotelkada.com (or keeper@noshta.com)');
    console.log('   Password: Shop@123');
    console.log('📌 Sample Shop:');
    console.log('   Name: Noshta Cafe');
    console.log('   Slug: noshtacafe');
    console.log('   Tables: 6 Dining Tables with QR enabled');
    console.log('   Live Customer Menu URL: /shop/noshtacafe');
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error('❌ Seeding failed with error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedNeonMaster();
