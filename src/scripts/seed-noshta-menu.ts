import { prisma } from '../config/database';

async function seedNoshtaMenu() {
  console.log('--- Seeding Noshta Cafe Menu (Shop #25) ---');

  // Verify Shop #25 exists or find by slug 'noshtacafe'
  let shop = await prisma.shop.findUnique({
    where: { id: 25 },
  });

  if (!shop) {
    shop = await prisma.shop.findFirst({
      where: { slug: 'noshtacafe' },
    });
  }

  if (!shop) {
    console.error('Shop #25 (Noshta Cafe) not found!');
    process.exit(1);
  }

  console.log(`Found Shop: "${shop.name}" (ID: ${shop.id}, Slug: ${shop.slug})`);

  // Ensure shop has good branding info
  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      name: 'Noshta Cafe',
      slug: 'noshtacafe',
      subdomain: 'noshtacafe',
      description: 'Gourmet Smashed Burgers, Saucy Wings, Chimney Cones, Artisanal Coffee & OG Bubble Tea. Freshly prepared to order!',
      phone: shop.phone || '7200446380',
      address: shop.address || 'Madurai, Tamil Nadu',
      state: 'Tamil Nadu',
      district: 'Madurai',
      logoUrl: shop.logoUrl || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=300&auto=format&fit=crop&q=80',
      bannerUrl: shop.bannerUrl || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&auto=format&fit=crop&q=80',
    },
  });

  // Clear existing items for this shop to avoid duplicates if re-run
  const existingCategories = await prisma.category.findMany({
    where: { shopId: shop.id },
  });
  console.log(`Clearing ${existingCategories.length} existing categories for clean sync...`);
  await prisma.category.deleteMany({
    where: { shopId: shop.id },
  });

  // Define All Categories & Items from the 2-Page Noshta Menu PDF
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
      category: 'SANDWICH',
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
          name: 'Chettinadu Paneer Roll',
          price: 220,
          description: 'Spiced aromatic Chettinad pepper-roasted paneer wrapped in warm flatbread (Spicy 🌶️)',
          imageUrl: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Chettinadu Chicken Roll',
          price: 220,
          description: 'Authentic fiery Chettinad chicken tossed in freshly roasted spices and rolled in soft paratha (Spicy 🌶️)',
          imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Cheesy Paneer Roll',
          price: 220,
          description: 'Gooey melted mozzarella cheese and marinated paneer cubes rolled with signature drizzle',
          imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Cheesy Chicken Roll',
          price: 220,
          description: 'Tender seasoned chicken and gooey melted cheddar-mozzarella blend wrapped tight in paratha',
          imageUrl: 'https://images.unsplash.com/photo-1644781408892-d6ef7173e6a9?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Manchurian Paneer Roll',
          price: 220,
          description: 'Indo-Chinese tangy Manchurian paneer roll with crunchy scallions and bell peppers',
          imageUrl: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Manchurian Chicken Roll',
          price: 220,
          description: 'Indo-Chinese chicken Manchurian rolled with dark garlic soy glaze and shredded spring greens',
          imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Fried Chicken Roll',
          price: 240,
          description: 'Crispy buttermilk battered fried chicken strips with pickled onion and tangy house dressing',
          imageUrl: 'https://images.unsplash.com/photo-1644781408892-d6ef7173e6a9?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Pesto Paneer Roll',
          price: 240,
          description: 'Fragrant Italian basil pesto marinated paneer rolled in flaky warm paratha',
          imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Pesto Chicken Roll',
          price: 240,
          description: 'Juicy chicken tossed in aromatic herbal basil pesto and rolled with soft flatbread',
          imageUrl: 'https://images.unsplash.com/photo-1644781408892-d6ef7173e6a9?w=600&auto=format&fit=crop&q=80',
        },
      ],
    },
    {
      category: 'CHIMNEY CONES',
      description: 'Handcrafted Hungarian sweet & savory chimney bread cones stuffed to the brim (All ₹250)',
      sortOrder: 5,
      items: [
        {
          name: 'Chettinad Paneer Cone',
          price: 250,
          description: 'Golden baked chimney cone filled with spicy South-Indian Chettinad cottage cheese (Spicy 🌶️)',
          imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Chettinad Chicken Cone',
          price: 250,
          description: 'Crispy warm chimney cone loaded with fiery Chettinad chicken and aromatic curry spices (Spicy 🌶️)',
          imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Butter Paneer Cone',
          price: 250,
          description: 'Fresh chimney cone packed with rich and creamy butter makhani paneer',
          imageUrl: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&auto=format&fit=crop&q=80',
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
        {
          name: 'Cheesy Chicken Cone',
          price: 250,
          description: 'Chimney cone loaded with succulent seasoned chicken chunks and thick bubbling cheese sauce',
          imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Manchurian Paneer Cone',
          price: 250,
          description: 'Indo-Chinese garlic Manchurian spiced paneer served in a crunchy chimney cone',
          imageUrl: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Manchurian Chicken Cone',
          price: 250,
          description: 'Tangy and savory Manchurian chicken filling packed into a fresh warm chimney cone',
          imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Pesto Paneer Cone',
          price: 250,
          description: 'Aromatic basil pesto paneer and cherry tomatoes nestled inside a chimney cone',
          imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Pesto Chicken Cone',
          price: 250,
          description: 'Italian green herb pesto chicken with cream reduction inside a warm baked chimney cone',
          imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
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
          name: 'Ranch Wings',
          price: 260,
          description: 'Tossed in tangy, herbed buttermilk savory ranch dressing with parsley',
          imageUrl: 'https://images.unsplash.com/photo-1608039755401-742074f0548d?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Noshta Signature Wings',
          price: 290,
          description: 'Chef signature wings tossed in rich, velvety buttery & tangy secret glaze',
          imageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Butter Garlic Wings',
          price: 290,
          description: 'Wings tossed in rich, creamy, buttery roasted garlic and parmesan sauce',
          imageUrl: 'https://images.unsplash.com/photo-1527477321005-4d01d75bb2a6?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Spicy Jerk Wings',
          price: 270,
          description: 'Fiery Jamaican scotch-bonnet jerk seasoning with aromatic spices (Spicy 🌶️)',
          imageUrl: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Sweet Chilli Wings',
          price: 270,
          description: 'Sweet, sticky and tangy Thai sweet chilli glazed chicken wings',
          imageUrl: 'https://images.unsplash.com/photo-1608039755401-742074f0548d?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Dynamite Wings',
          price: 270,
          description: 'Tossed in creamy mayo-based Japanese hot dynamite sauce with mild spice kick',
          imageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Chilli Mango Wings',
          price: 270,
          description: 'Sweet ripe mango pulp infused with fiery Naga chilli pepper sauce (Spicy 🌶️)',
          imageUrl: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Hot n Spicy Wings',
          price: 270,
          description: 'Wings coated in blazing hot garlic red chili paste sauce (Spicy 🌶️)',
          imageUrl: 'https://images.unsplash.com/photo-1608039755401-742074f0548d?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Nashville Wings',
          price: 290,
          description: 'Wings dipped in hot seasoned cayenne oil & dusted with fiery Nashville spices (Spicy 🌶️)',
          imageUrl: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=600&auto=format&fit=crop&q=80',
        },
      ],
    },
    {
      category: 'BURGERS',
      description: 'Gourmet smashed chicken & mutton patties, fried fillets & vegetarian burger marvels',
      sortOrder: 7,
      items: [
        {
          name: 'Fried Paneer Burger',
          price: 270,
          description: 'Crispy golden crumb-fried paneer patty with lettuce, tomatoes and creamy house mayo',
          imageUrl: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Buffalo Mushroom Burger',
          price: 330,
          description: 'Juicy oyster mushrooms tossed in fiery tangy buffalo sauce on a toasted brioche bun',
          imageUrl: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Fried Chicken Burger',
          price: 270,
          description: 'Crispy battered buttermilk fried chicken breast, pickled gherkins and garlic mayonnaise',
          imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Nashville Chicken Burger',
          price: 310,
          description: 'Fried chicken fillet dipped in seasoned hot oil & dusted with fiery Nashville spices (Spicy 🌶️)',
          imageUrl: 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Signature Smashed Burger',
          price: 330,
          description: 'Double smashed crispy-edge chicken patties, melted cheese and signature Noshta sauce',
          imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Hot Devil Burger',
          price: 330,
          description: 'Our spiciest burger yet featuring ghost chili sauce and jalapeno relish (Double Spicy 🌶️🌶️)',
          imageUrl: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'NFS Burger',
          price: 450,
          description: 'The Monster Need-For-Speed burger: Crispy fried chicken fillet AND smashed patty with Noshta sauce',
          imageUrl: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Buffalo Ranch Burger',
          price: 330,
          description: 'Crispy fillet smothered in hot tangy buffalo sauce topped with cool creamy ranch dressing',
          imageUrl: 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Honey Chilli Burger',
          price: 320,
          description: 'Sweet clover hot honey drizzle crossed with rich mayo on crunchy fried chicken',
          imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Cheesy Chicken Burger',
          price: 330,
          description: 'Silky warm cheese sauce, yellow cheddar cheese slice and spicy jalapeno mayo',
          imageUrl: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'BBQ Cream Cheese Burger',
          price: 340,
          description: 'Cream cheese infused smoky hickory BBQ sauce with garlic mayo on toasted bun',
          imageUrl: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Korean Burger',
          price: 330,
          description: 'In-house made spicy Korean Gochujang glaze, kimchi crunch and spicy mayo (Spicy 🌶️)',
          imageUrl: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Madurai Mutton Smashed Burger',
          price: 450,
          description: 'Double smashed tender mutton patties packed with rich, aromatic local Madurai flavours & caramelized shallots',
          imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
        },
      ],
    },
    {
      category: 'PASTA (PENNE)',
      description: 'Imported durum wheat Penne cooked al dente in rich Italian red, white or green sauces',
      sortOrder: 8,
      items: [
        {
          name: 'Arrabbiata Pasta (Veg)',
          price: 300,
          description: 'Penne pasta tossed in spicy Italian garlic tomato Arrabbiata red sauce with herbs (Spicy 🌶️)',
          imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281699?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Arrabbiata Pasta (Chicken)',
          price: 310,
          description: 'Penne with tender seasoned chicken in fiery garlic tomato Arrabbiata sauce (Spicy 🌶️)',
          imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281699?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Alfredo Pasta (Veg)',
          price: 310,
          description: 'Penne tossed in silky, rich white cream, butter and parmesan cheese Alfredo sauce',
          imageUrl: 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Alfredo Pasta (Chicken)',
          price: 320,
          description: 'Penne with grilled juicy chicken in velvety creamy parmesan Alfredo sauce with black pepper',
          imageUrl: 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Creamy Pesto Pasta (Veg)',
          price: 340,
          description: 'Penne tossed in fresh Genovese basil pesto and dairy cream with roasted pine nuts',
          imageUrl: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Creamy Pesto Pasta (Chicken)',
          price: 350,
          description: 'Penne pasta with tender chicken in aromatic creamy green basil pesto sauce',
          imageUrl: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=600&auto=format&fit=crop&q=80',
        },
      ],
    },
    {
      category: 'MOJITOS & REFRESHERS',
      description: 'Sparkling ice coolers muddled with fresh mint, citrus & exotic fruit reductions',
      sortOrder: 9,
      items: [
        {
          name: 'Lemon & Mint Mojito',
          price: 120,
          description: 'Classic zesty lime and freshly muddled garden mint with crisp bubbly soda',
          imageUrl: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Blue Lagoon',
          price: 120,
          description: 'Vibrant blue curacao citrus cooler with chilled lemon soda and crushed ice',
          imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Green Apple Mojito',
          price: 120,
          description: 'Crisp green Granny Smith apple syrup, fresh garden mint leaves and bubbly soda',
          imageUrl: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Litchi Mojito',
          price: 120,
          description: 'Sweet floral litchi nectar muddled with cooling mint leaves, lime and sparkling soda',
          imageUrl: 'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600&auto=format&fit=crop&q=80',
        },
      ],
    },
    {
      category: 'MOCKTAILS & SPECIALS',
      description: 'Signature mocktails, Madurai jasmine coolers and rich Belgian hot chocolate',
      sortOrder: 10,
      items: [
        {
          name: 'Pink Cloud (Litchi, Guava)',
          price: 150,
          description: 'Dreamy dual-layer mocktail blending aromatic litchi and tropical sweet pink guava',
          imageUrl: 'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Madurai Paanam',
          price: 150,
          description: 'Signature traditional Madurai jasmine flower infused fragrant cooler with cooling herbs',
          imageUrl: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Ginger Fizz',
          price: 170,
          description: 'Freshly pressed spicy ginger essence fizzed with fresh lime and chilled sparkling soda',
          imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Rich Hot Chocolate',
          price: 220,
          description: 'Decadent, velvety thick melted Belgian cocoa hot chocolate with chocolate drizzle',
          imageUrl: 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=600&auto=format&fit=crop&q=80',
        },
      ],
    },
    {
      category: 'COFFEE (HOT & COLD)',
      description: 'Freshly extracted espresso brews, velvety hot lattes and iced coffees',
      sortOrder: 11,
      items: [
        {
          name: 'Espresso',
          price: 70,
          description: 'Bold, intense freshly pulled single shot of dark roasted espresso with golden crema',
          imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Americano (Hot)',
          price: 120,
          description: 'Rich freshly pulled espresso shot topped with steaming water for a clean, bold coffee',
          imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Cappuccino',
          price: 140,
          description: 'Espresso balanced with steamed milk and a dense crown of velvety textured micro-foam',
          imageUrl: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Latte',
          price: 140,
          description: 'Smooth espresso gently blended with silky steamed milk and a thin layer of foam',
          imageUrl: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Salted Caramel Latte (Hot)',
          price: 180,
          description: 'Steamed latte infused with buttery salted caramel and topped with caramel drizzle',
          imageUrl: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Iced Americano',
          price: 160,
          description: 'Chilled freshly extracted espresso poured over crystal ice and cold filtered water',
          imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Iced Salted Caramel Latte',
          price: 200,
          description: 'Cold milk and espresso swirled with rich salted caramel sauce over ice cubes',
          imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Iced Mocha',
          price: 180,
          description: 'Chilled espresso blended with decadent dark chocolate ganache and cold creamy milk',
          imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Iced Blackpink',
          price: 180,
          description: 'Noshta signature chilled rose-infused espresso drink with cold velvety milk foam',
          imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80',
        },
      ],
    },
    {
      category: 'MILKSHAKES & BUBBLE TEA',
      description: 'Thick hand-spun dessert milkshakes and authentic Taiwanese OG bubble teas with boba',
      sortOrder: 12,
      items: [
        {
          name: 'OG Oreo Shake',
          price: 180,
          description: 'Thick hand-spun shake blended with crunchy chocolate Oreo cookies and vanilla ice cream',
          imageUrl: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Hazelnut Shake',
          price: 180,
          description: 'Rich nutty milkshake blended with roasted hazelnut paste, cocoa and creamy milk',
          imageUrl: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Milo Shake',
          price: 200,
          description: 'Nostalgic malted chocolate Milo thick milkshake topped with extra crispy Milo crunch',
          imageUrl: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Biscoff Shake',
          price: 220,
          description: 'Creamy thick shake blended with spiced caramelized Lotus Biscoff spread and cookie crumbs',
          imageUrl: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Salted Caramel Shake',
          price: 200,
          description: 'Indulgent thick shake swirled with sweet buttery sea-salted caramel syrup',
          imageUrl: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Thai Red Tea (OG Bubble Tea)',
          price: 200,
          description: 'Authentic brewed Thai red milk tea served with Strawberry Nata de Coco and juicy Litchi popping boba',
          imageUrl: 'https://images.unsplash.com/photo-1553787499-6f9133860278?w=600&auto=format&fit=crop&q=80',
        },
        {
          name: 'Honeydew Fruit Tea (OG Bubble Tea)',
          price: 200,
          description: 'Crisp, fragrant honeydew melon tea served with Strawberry Nata de Coco and juicy Litchi popping boba',
          imageUrl: 'https://images.unsplash.com/photo-1553787499-6f9133860278?w=600&auto=format&fit=crop&q=80',
        },
      ],
    },
  ];

  let totalProductsAdded = 0;

  for (const catData of menuData) {
    const category = await prisma.category.create({
      data: {
        shopId: shop.id,
        name: catData.category,
        description: catData.description,
        sortOrder: catData.sortOrder,
        isActive: true,
      },
    });

    console.log(`Created Category: "${category.name}" (ID: ${category.id})`);

    for (const item of catData.items) {
      await prisma.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          name: item.name,
          price: item.price,
          description: item.description,
          imageUrl: item.imageUrl,
          isAvailable: true,
        },
      });
      totalProductsAdded++;
    }
  }

  console.log(`--- Seeding Completed Successfully! ---`);
  console.log(`Total Categories Created: ${menuData.length}`);
  console.log(`Total Menu Products Inserted: ${totalProductsAdded}`);
  console.log(`Shop Slug: ${shop.slug}`);
  console.log(`Live Menu URL: /shop/${shop.slug}`);
}

seedNoshtaMenu()
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
