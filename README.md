# Scan-Pay-Eat Backend

Multi-tenant QR food ordering backend for **Scan-Pay-Eat**, built with **Node.js, Express, TypeScript, Prisma ORM, and Aiven PostgreSQL**.

---

## 🌟 Architecture & Features

- **Multi-Tenant Shop Isolation**:
  - Each shop has its own categories, products, orders, token sequences, and payments.
  - Shopkeeper queries strictly enforce `shopId` derived securely from the authenticated JWT session.
  - Subdomain & slug resolution for customer QR menu browsing (`https://abc.scanpayeat.com`).
- **Role-Based Access Control (RBAC)**:
  - `ADMIN`: Platform superadmin managing shops, shopkeepers, analytics, and platform orders.
  - `SHOPKEEPER`: Shop managers handling categories, products, image uploads, and order status transitions.
  - `CUSTOMER`: Global customer accounts able to order from any shop and track order history.
- **Atomic Concurrency Protection**:
  - Daily per-shop order tokens (`A101`, `A102`...) incremented using PostgreSQL atomic upsert within transactions.
  - Order checkout with strict database-level price snapshots in `OrderItem` (never trusting client prices).
- **Payment & Webhooks**:
  - Razorpay order creation and server-side HMAC SHA-256 signature verification.
  - Idempotent webhook event processing via dedicated `payment_webhook_events` table.
- **Real-Time Communication**:
  - Socket.io integration with shop-scoped rooms (`shop:{shopId}`) and customer order tracking rooms (`order:{orderId}`).
- **Security & Quality**:
  - Zod validation for every request payload.
  - Rate limiting on authentication, checkout, and payment verification endpoints.
  - Bcrypt password hashing and JWT access & refresh token rotation with httpOnly cookies.
  - Helmet security headers and configured CORS with credential support.

---

## 📁 Project Structure

```text
├── src/
│   ├── config/
│   │   ├── env.ts          # Zod-validated environment config
│   │   ├── database.ts     # PrismaClient singleton & connection management
│   │   └── razorpay.ts     # Razorpay client & cryptographic HMAC verification
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts      # JWT extraction & active account validation
│   │   ├── role.middleware.ts      # RBAC authorization (ADMIN, SHOPKEEPER, CUSTOMER)
│   │   ├── shopScope.middleware.ts # Multi-tenant shopId scoping
│   │   ├── validate.middleware.ts  # Zod schema validation
│   │   └── error.middleware.ts     # Global centralized error handler
│   │
│   ├── modules/
│   │   ├── auth/         # Register, Login, Token Refresh Rotation, Logout, Me
│   │   ├── admin/        # Shop creation, Shopkeeper management, Dashboard stats
│   │   ├── categories/   # Shop-scoped categories CRUD
│   │   ├── products/     # Shop-scoped products CRUD, availability toggle
│   │   ├── shopkeepers/  # Unified /api/shop routes (categories, products, orders, uploads)
│   │   ├── public/       # Public QR menu & shop resolution by slug
│   │   ├── orders/       # Checkout, price recalculation, order items snapshots
│   │   ├── payments/     # Razorpay verification, atomic confirmation transaction
│   │   ├── webhooks/     # Razorpay webhooks with idempotency
│   │   └── customers/    # Customer order history & live order tracking
│   │
│   ├── socket/
│   │   └── socket.server.ts # Socket.io server with room-based pub/sub
│   │
│   ├── utils/
│   │   ├── jwt.ts            # Token signing, verification, hashing & cookies
│   │   ├── password.ts       # Bcrypt hashing
│   │   ├── tokenGenerator.ts # Atomic daily sequential token counter
│   │   ├── uploader.ts       # Multer & Cloudinary image uploader
│   │   └── response.ts       # Standardized API response format
│   │
│   ├── scripts/
│   │   ├── seed.ts           # Demo database seeder
│   │   ├── test-db.ts        # Database connection tester
│   │   ├── test-phase2-auth.ts
│   │   ├── test-phase3-admin.ts
│   │   ├── test-phase4-shopkeeper.ts
│   │   ├── test-phase5-public.ts
│   │   ├── test-phase6-to-10.ts
│   │   └── test-phase11-admin-analytics.ts
│   │
│   ├── app.ts            # Express application setup
│   └── server.ts         # HTTP and Socket.io server startup
│
├── prisma/
│   └── schema.prisma     # Relational PostgreSQL schema
├── .env                  # Environment configuration
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- PostgreSQL (Aiven PostgreSQL or local instance)

### 2. Environment Setup
Configure your `.env` file (see `.env.example`):
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require&connect_timeout=30"
JWT_ACCESS_SECRET="super_secret_access_jwt_key_scanpayeat_32_chars_min"
JWT_REFRESH_SECRET="super_secret_refresh_jwt_key_scanpayeat_32_chars_min"
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="..."
RAZORPAY_WEBHOOK_SECRET="..."
COOKIE_DOMAIN="localhost"
FRONTEND_URL="http://localhost:3000"
```

### 3. Sync Database Schema
```bash
npm run prisma:push
```

### 4. Seed Demo Data
```bash
npm run seed
```

This creates:
- **Admin**: `admin@scanpayeat.com` / `Admin@123`
- **Shop**: `ABC Restaurant` (slug: `abc`)
- **Shopkeeper**: `shop@abc.com` / `Shop@123`
- **Customer**: `customer@demo.com` / `Customer@123`
- **Categories & Menu Items**: Burgers, Sides, Beverages with images

### 5. Start Development Server
```bash
npm run dev
```

### 6. Build for Production
```bash
npm run build
npm start
```

---

## 📡 API Reference

### 🔐 Authentication (`/api/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register customer account |
| `POST` | `/api/auth/login` | Login (Admin, Shopkeeper, or Customer) |
| `POST` | `/api/auth/refresh` | Rotate and issue new access token |
| `POST` | `/api/auth/logout` | Revoke refresh token and clear cookies |
| `GET`  | `/api/auth/me` | Fetch authenticated user profile |

### 👑 Admin (`/api/admin`) *(Requires ADMIN role)*
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/admin/shops` | Create shop & generate QR URL |
| `GET`  | `/api/admin/shops` | List all shops with filters |
| `GET`  | `/api/admin/shops/:id` | Get shop details |
| `PUT`  | `/api/admin/shops/:id` | Update shop information |
| `PATCH`| `/api/admin/shops/:id/status` | Activate / deactivate shop |
| `POST` | `/api/admin/shopkeepers` | Provision shopkeeper account for a shop |
| `GET`  | `/api/admin/shopkeepers` | List shopkeepers |
| `PUT`  | `/api/admin/shopkeepers/:id` | Update shopkeeper |
| `PATCH`| `/api/admin/shopkeepers/:id/status` | Activate / deactivate shopkeeper |
| `GET`  | `/api/admin/dashboard` | Dashboard analytics (orders, revenue, counts) |
| `GET`  | `/api/admin/orders` | Global orders across all shops |
| `GET`  | `/api/admin/transactions` | Global payment transactions |

### 🧑‍🍳 Shopkeeper (`/api/shop`) *(Requires SHOPKEEPER role & shop scope)*
| Method | Endpoint | Description |
|---|---|---|
| `POST`   | `/api/shop/categories` | Create category |
| `GET`    | `/api/shop/categories` | List categories in shop |
| `PUT`    | `/api/shop/categories/:id` | Update category |
| `DELETE` | `/api/shop/categories/:id` | Delete category |
| `POST`   | `/api/shop/products` | Create product (enforces shop category) |
| `GET`    | `/api/shop/products` | List products with availability filter |
| `GET`    | `/api/shop/products/:id` | Get product details |
| `PUT`    | `/api/shop/products/:id` | Update product |
| `PATCH`  | `/api/shop/products/:id/availability` | Toggle product available/sold out |
| `DELETE` | `/api/shop/products/:id` | Delete product |
| `POST`   | `/api/shop/upload` | Multipart image upload (Cloudinary/Storage) |
| `GET`    | `/api/shop/orders` | List shop orders with status filters |
| `GET`    | `/api/shop/orders/:id` | Get order details with items and status history |
| `PATCH`  | `/api/shop/orders/:id/status` | Advance status (`CONFIRMED` -> `PREPARING` -> `READY` -> `COMPLETED`) |

### 📱 Public QR Customer Menu (`/api/public`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/public/shops/:slug` | Get shop details by subdomain/slug |
| `GET` | `/api/public/shops/:slug/menu` | Get available categories & products |

### 🛒 Orders & Checkout (`/api/orders`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/orders/checkout` | Validates DB prices, creates pending order & Razorpay order |

### 💳 Payments (`/api/payments`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/payments/verify` | HMAC verification, marks PAID, generates daily token atomically |

### ⚡ Webhooks (`/api/webhooks`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/webhooks/razorpay` | Handles `payment.captured` & `payment.failed` with idempotency |

### 👤 Customer (`/api/me`) *(Requires CUSTOMER role)*
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/me/orders` | Customer global order history across all shops |
| `GET` | `/api/me/orders/:orderCode` | Customer single order details & tracking history |

---

## 🔌 Socket.io Real-Time Events

- **Join Rooms**:
  - `join_shop` with `{ shopId: number }` (Shopkeeper dashboard)
  - `join_order` with `{ orderId: number }` (Customer live tracking)
- **Emitted Events**:
  - `new_order` -> Broadcast to `shop:{shopId}` room on confirmed payment
  - `order_status_updated` -> Broadcast to `shop:{shopId}` and `order:{orderId}` on status transitions

---

## 💻 Frontend Application (Next.js 16 + React 19 + Tailwind CSS)

A full-stack, responsive frontend is implemented in `frontend/` covering all 3 roles:

### 1. Running the Full Stack
- **Backend**:
  ```bash
  npm run dev
  # Runs Express + Prisma + Socket.io on http://localhost:5001
  ```
- **Frontend**:
  ```bash
  npm run dev:frontend
  # Runs Next.js on http://localhost:3000
  ```

### 2. Frontend Role Portals & Routes
| Portal / Role | URL | Features |
|---|---|---|
| **Home Landing** | `/` | Platform architecture overview, transaction flow, demo quick links |
| **Unified Login** | `/login` | 1-Click demo logins for Admin, Shopkeeper, and Customer |
| **Customer Register** | `/register` | Public self-registration for global customer accounts |
| **Customer QR Menu** | `/shop/[slug]` | Slug resolution (`/shop/abc`), category tabs, search, item drawer, Razorpay checkout |
| **Live Order Tracking** | `/order/[orderId]` | Real-time Socket.io status updates, daily token badge (`A101`), audio chime when ready |
| **Customer Orders** | `/my-orders` | Historical receipts and active orders across shops |
| **Shopkeeper KDS** | `/shopkeeper` | Real-time audio ding on `new_order`, ticket state progression (`CONFIRMED` -> `PREPARING` -> `READY` -> `COMPLETED`), menu creation & 1-click in-stock switch, daily stats |
| **Admin Console** | `/admin` | Platform KPI overview, shop registration & table QR generator, shopkeeper provisioning, orders audit |

