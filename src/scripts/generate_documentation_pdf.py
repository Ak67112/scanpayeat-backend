#!/usr/bin/env python3
"""
Scan-Pay-Eat PDF Documentation Generator
Produces a production-grade, beautifully formatted PDF document detailing:
1. Architectural Overview & Security Rules
2. Database Schema (All 13 Models, Fields, Types, and Constraints)
3. How Each Flow Works (Auth, Scoping, QR, Checkout, Razorpay, Tokens, Webhooks, Realtime)
4. Complete API Reference Directory
5. Swagger UI Guide
"""

import os
import sys
import zlib

class PDFDocument:
    def __init__(self, filename="Scan-Pay-Eat-API-and-Database-Documentation.pdf"):
        self.filename = filename
        self.width = 612.0
        self.height = 792.0
        self.left_margin = 45.0
        self.right_margin = 45.0
        self.top_margin = 45.0
        self.bottom_margin = 45.0
        self.content_width = self.width - self.left_margin - self.right_margin

        self.pages = []
        self.current_page_commands = []
        self.y = self.height - self.top_margin
        self.current_section = ""

    def new_page(self):
        if self.current_page_commands:
            self.pages.append(self.current_page_commands)
            self.current_page_commands = []
        self.y = self.height - self.top_margin

    def ensure_space(self, height_needed):
        if self.y - height_needed < self.bottom_margin:
            self.new_page()

    def escape_text(self, text):
        clean = (
            str(text)
            .replace('\u2014', ' -- ')
            .replace('\u2013', '-')
            .replace('\u2018', "'")
            .replace('\u2019', "'")
            .replace('\u201c', '"')
            .replace('\u201d', '"')
            .replace('\u2022', '*')
            .replace('\u2192', '->')
            .replace('\\', '\\\\')
            .replace('(', '\\(')
            .replace(')', '\\)')
        )
        return clean.encode('latin-1', 'replace').decode('latin-1')

    def set_fill_color(self, r, g, b):
        self.current_page_commands.append(f"{r:.3f} {g:.3f} {b:.3f} rg")

    def set_stroke_color(self, r, g, b):
        self.current_page_commands.append(f"{r:.3f} {g:.3f} {b:.3f} RG")

    def draw_rect(self, x, y, w, h, fill=True, stroke=False, r=0.95, g=0.95, b=0.95, sr=0.8, sg=0.8, sb=0.8, lw=0.5):
        if fill:
            self.set_fill_color(r, g, b)
        if stroke:
            self.set_stroke_color(sr, sg, sb)
            self.current_page_commands.append(f"{lw:.2f} w")
        op = "B" if (fill and stroke) else ("f" if fill else "S")
        self.current_page_commands.append(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re {op}")

    def draw_text(self, x, y, text, font="/F1", size=10, r=0.2, g=0.25, b=0.35):
        self.set_fill_color(r, g, b)
        escaped = self.escape_text(str(text))
        cmd = f"BT {font} {size:.1f} Tf {x:.2f} {y:.2f} Td ({escaped}) Tj ET"
        self.current_page_commands.append(cmd)

    def draw_line(self, x1, y1, x2, y2, r=0.8, g=0.85, b=0.9, lw=0.5):
        self.set_stroke_color(r, g, b)
        self.current_page_commands.append(f"{lw:.2f} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S")

    def add_header(self, text):
        self.current_section = text
        self.ensure_space(45)
        self.y -= 10
        # Dark Navy Header Banner
        self.draw_rect(self.left_margin, self.y - 24, self.content_width, 28, fill=True, stroke=False, r=0.06, g=0.09, b=0.16)
        self.draw_text(self.left_margin + 12, self.y - 17, text.upper(), font="/F2", size=12, r=0.95, g=0.97, b=1.0)
        self.y -= 38

    def add_subheader(self, text):
        self.ensure_space(32)
        self.y -= 6
        self.draw_text(self.left_margin, self.y, text, font="/F2", size=12, r=0.09, g=0.15, b=0.28)
        self.draw_line(self.left_margin, self.y - 4, self.left_margin + self.content_width, self.y - 4, r=0.2, g=0.4, b=0.8, lw=1.2)
        self.y -= 18

    def add_h3(self, text):
        self.ensure_space(24)
        self.y -= 4
        self.draw_text(self.left_margin, self.y, text, font="/F2", size=10.5, r=0.15, g=0.23, b=0.36)
        self.y -= 14

    def add_paragraph(self, text, size=9, r=0.2, g=0.25, b=0.35, indent=0):
        words = text.split()
        line = []
        max_chars = int((self.content_width - indent) / (size * 0.52))

        for word in words:
            if len(" ".join(line + [word])) <= max_chars:
                line.append(word)
            else:
                self.ensure_space(14)
                self.draw_text(self.left_margin + indent, self.y, " ".join(line), font="/F1", size=size, r=r, g=g, b=b)
                self.y -= 13
                line = [word]
        if line:
            self.ensure_space(14)
            self.draw_text(self.left_margin + indent, self.y, " ".join(line), font="/F1", size=size, r=r, g=g, b=b)
            self.y -= 15

    def add_callout(self, title, text, r_bar=0.15, g_bar=0.4, b_bar=0.85):
        words = text.split()
        max_chars = int((self.content_width - 24) / (8.5 * 0.52))
        lines = []
        current = []
        for word in words:
            if len(" ".join(current + [word])) <= max_chars:
                current.append(word)
            else:
                lines.append(" ".join(current))
                current = [word]
        if current:
            lines.append(" ".join(current))

        box_height = 24 + len(lines) * 12
        self.ensure_space(box_height + 10)
        self.y -= 4

        # Background box
        self.draw_rect(self.left_margin, self.y - box_height, self.content_width, box_height, fill=True, stroke=True, r=0.96, g=0.97, b=0.99, sr=0.88, sg=0.91, sb=0.95)
        # Left accent stripe
        self.draw_rect(self.left_margin, self.y - box_height, 4, box_height, fill=True, stroke=False, r=r_bar, g=g_bar, b=b_bar)

        self.draw_text(self.left_margin + 12, self.y - 12, title, font="/F2", size=9.5, r=r_bar, g=g_bar, b=b_bar)
        text_y = self.y - 24
        for l in lines:
            self.draw_text(self.left_margin + 12, text_y, l, font="/F1", size=8.5, r=0.25, g=0.3, b=0.4)
            text_y -= 12

        self.y -= (box_height + 12)

    def add_table(self, headers, rows, col_widths=None):
        num_cols = len(headers)
        if col_widths is None:
            col_widths = [self.content_width / num_cols] * num_cols

        # Header height
        row_height = 18
        total_header_h = 22
        self.ensure_space(total_header_h + row_height * min(len(rows), 3))

        # Render Header
        self.draw_rect(self.left_margin, self.y - total_header_h, self.content_width, total_header_h, fill=True, stroke=True, r=0.1, g=0.15, b=0.25, sr=0.1, sg=0.15, sb=0.25)
        curr_x = self.left_margin
        for i, h in enumerate(headers):
            self.draw_text(curr_x + 6, self.y - 14, h, font="/F2", size=8.5, r=1.0, g=1.0, b=1.0)
            curr_x += col_widths[i]
        self.y -= total_header_h

        # Render Rows
        for r_idx, row in enumerate(rows):
            # Compute row height based on text wrapping
            cell_lines_per_col = []
            for c_idx, cell in enumerate(row):
                cell_text = str(cell)
                max_chars = max(8, int((col_widths[c_idx] - 12) / 4.4))
                words = cell_text.split()
                c_lines = []
                curr_l = []
                for w in words:
                    if len(" ".join(curr_l + [w])) <= max_chars:
                        curr_l.append(w)
                    else:
                        c_lines.append(" ".join(curr_l))
                        curr_l = [w]
                if curr_l:
                    c_lines.append(" ".join(curr_l))
                cell_lines_per_col.append(c_lines if c_lines else [""])

            max_lines = max(len(cl) for cl in cell_lines_per_col)
            row_h = max(18, max_lines * 11 + 6)

            self.ensure_space(row_h)

            bg_r, bg_g, bg_b = (0.97, 0.98, 1.0) if (r_idx % 2 == 1) else (1.0, 1.0, 1.0)
            self.draw_rect(self.left_margin, self.y - row_h, self.content_width, row_h, fill=True, stroke=True, r=bg_r, g=bg_g, b=bg_b, sr=0.88, sg=0.9, sb=0.94)

            curr_x = self.left_margin
            for c_idx, cl in enumerate(cell_lines_per_col):
                line_y = self.y - 12
                is_bold = (c_idx == 0)
                font = "/F2" if is_bold else "/F1"
                txt_r, txt_g, txt_b = (0.1, 0.15, 0.25) if is_bold else (0.25, 0.3, 0.38)
                for l in cl:
                    self.draw_text(curr_x + 6, line_y, l, font=font, size=8, r=txt_r, g=txt_g, b=txt_b)
                    line_y -= 10
                curr_x += col_widths[c_idx]

            self.y -= row_h

        self.y -= 10

    def render_decorations(self):
        total_p = len(self.pages)
        for idx, page in enumerate(self.pages):
            p_num = idx + 1
            # Top Running Header (except first page)
            if p_num > 1:
                cmd_hdr = f"BT /F1 7.5 Tf {self.left_margin:.2f} {self.height - 25:.2f} Td 0.5 0.55 0.65 rg (SCAN-PAY-EAT BACKEND — TECHNICAL & DATABASE SPECIFICATION) Tj ET"
                page.append(cmd_hdr)
                page.append(f"0.85 0.88 0.92 RG 0.5 w {self.left_margin:.2f} {self.height - 30:.2f} m {self.width - self.right_margin:.2f} {self.height - 30:.2f} l S")

            # Bottom Running Footer
            cmd_ftr_l = f"BT /F1 7.5 Tf {self.left_margin:.2f} 25 Td 0.5 0.55 0.65 rg (Scan-Pay-Eat | Confidential & Proprietary) Tj ET"
            cmd_ftr_r = f"BT /F2 7.5 Tf {self.width - self.right_margin - 65:.2f} 25 Td 0.3 0.35 0.45 rg (Page {p_num} of {total_p}) Tj ET"
            page.append(f"0.85 0.88 0.92 RG 0.5 w {self.left_margin:.2f} 35 m {self.width - self.right_margin:.2f} 35 l S")
            page.append(cmd_ftr_l)
            page.append(cmd_ftr_r)

    def save(self):
        if self.current_page_commands:
            self.pages.append(self.current_page_commands)
            self.current_page_commands = []

        self.render_decorations()

        objects = []
        # obj 1: Catalog
        # obj 2: Pages
        # obj 3: Font Helvetica
        # obj 4: Font Helvetica-Bold
        # obj 5: Font Courier

        catalog = "<< /Type /Catalog /Pages 2 0 R >>"
        objects.append(catalog)

        # Pages placeholder
        objects.append("")

        font1 = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        font2 = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
        font3 = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"
        objects.append(font1) # 3
        objects.append(font2) # 4
        objects.append(font3) # 5

        page_objs_refs = []
        next_obj_id = 6

        # Create Page and Content objects
        for page_cmds in self.pages:
            content_str = "\n".join(page_cmds)
            compressed = zlib.compress(content_str.encode('latin1', 'replace'))

            page_id = next_obj_id
            content_id = next_obj_id + 1
            next_obj_id += 2

            page_objs_refs.append(f"{page_id} 0 R")

            page_dict = f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {self.width:.1f} {self.height:.1f}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents {content_id} 0 R >>"
            content_obj = f"<< /Length {len(compressed)} /Filter /FlateDecode >>\nstream\n"
            content_end = "\nendstream"

            objects.append(page_dict)
            objects.append((content_obj, compressed, content_end))

        # Fill in Pages object
        pages_dict = f"<< /Type /Pages /Kids [{' '.join(page_objs_refs)}] /Count {len(self.pages)} >>"
        objects[1] = pages_dict

        # Compile PDF binary
        out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        xref_offsets = [0]

        for i, obj in enumerate(objects):
            obj_num = i + 1
            xref_offsets.append(len(out))
            out.extend(f"{obj_num} 0 obj\n".encode('latin1'))
            if isinstance(obj, tuple):
                header, data, footer = obj
                out.extend(header.encode('latin1'))
                out.extend(data)
                out.extend(footer.encode('latin1'))
            else:
                out.extend(obj.encode('latin1'))
            out.extend(b"\nendobj\n")

        xref_start = len(out)
        out.extend(f"xref\n0 {len(objects) + 1}\n".encode('latin1'))
        out.extend(b"0000000000 65535 f \n")
        for offset in xref_offsets[1:]:
            out.extend(f"{offset:010d} 00000 n \n".encode('latin1'))

        trailer = f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF"
        out.extend(trailer.encode('latin1'))

        with open(self.filename, 'wb') as f:
            f.write(out)
        print(f"✅ Generated {self.filename} ({len(out):,} bytes, {len(self.pages)} pages)")


def build_documentation_pdf():
    pdf = PDFDocument("Scan-Pay-Eat-API-and-Database-Documentation.pdf")

    # ================= PAGE 1: TITLE & EXECUTIVE SUMMARY =================
    pdf.y -= 20
    # Hero Title Banner
    pdf.draw_rect(pdf.left_margin, pdf.y - 70, pdf.content_width, 70, fill=True, stroke=False, r=0.06, g=0.09, b=0.16)
    pdf.draw_text(pdf.left_margin + 16, pdf.y - 28, "SCAN-PAY-EAT PLATFORM", font="/F2", size=20, r=1.0, g=1.0, b=1.0)
    pdf.draw_text(pdf.left_margin + 16, pdf.y - 48, "Complete API, Database Schema & Workflow Technical Specification", font="/F1", size=11, r=0.7, g=0.8, b=0.95)
    pdf.draw_text(pdf.left_margin + 16, pdf.y - 62, "Version 1.0.0 | PostgreSQL (Aiven) + Prisma + Express + TypeScript", font="/F1", size=8.5, r=0.55, g=0.65, b=0.8)
    pdf.y -= 90

    pdf.add_subheader("1. System Overview & Technology Stack")
    pdf.add_paragraph("Scan-Pay-Eat is a high-performance, multi-tenant QR food ordering backend designed for food courts, restaurants, and cloud kitchens. The platform guarantees strict shop data isolation, server-side anti-tampering price snapshots, atomic daily token sequence counters, and real-time dashboard order alerts.")

    tech_headers = ["Layer", "Technology", "Purpose & Operational Role"]
    tech_rows = [
        ["Runtime & Language", "Node.js (v26) + TypeScript (v5.7)", "Strictly typed asynchronous server with NodeNext module resolution."],
        ["Web Framework", "Express.js (v4.21)", "High-throughput REST API with central error handling & middleware pipelines."],
        ["Database & ORM", "Aiven PostgreSQL + Prisma ORM (v6)", "Fully relational multi-tenant database with connection pool management."],
        ["Security & Crypto", "Bcrypt + JSON Web Tokens (JWT)", "Hashed credentials with rotating refresh tokens in httpOnly SameSite cookies."],
        ["Payment Gateway", "Razorpay SDK + HMAC-SHA256", "Server-side payment order generation and cryptographic signature audits."],
        ["Real-Time Gateway", "Socket.io (v4.8)", "Pub/sub event broadcasting to shopkeeper dashboards & live customer screens."],
        ["Validation Engine", "Zod (v3.24)", "Strict runtime type checking of headers, params, query, and request payloads."],
        ["Media Storage", "Cloudinary SDK + Multer", "Direct cloud image uploads for products with memory buffer streaming."]
    ]
    pdf.add_table(tech_headers, tech_rows, [110, 160, 252])

    pdf.add_subheader("2. Platform User Roles & Security Matrix")
    role_headers = ["Role", "Access Scope", "Key Permissions & Boundaries"]
    role_rows = [
        ["ADMIN", "Platform-Wide", "Creates and provisions shops, manages shopkeepers, inspects platform revenue, audits all orders & transactions."],
        ["SHOPKEEPER", "Shop-Scoped (shopId)", "Manages shop categories, products, inventory availability, images, and moves order statuses (CONFIRMED -> COMPLETED)."],
        ["CUSTOMER", "Global Account", "Single login across all shops. Can order from any restaurant, view order items, and track live status."]
    ]
    pdf.add_table(role_headers, role_rows, [85, 120, 317])

    pdf.add_callout(
        "CRITICAL MULTI-TENANCY SECURITY INVARIANT",
        "Every shop-owned entity (Product, Category, Order, Payment, Shopkeeper) is linked by shopId. Shopkeepers can NEVER pass shopId in request bodies; the backend extracts shopId directly from the verified JWT session and injects req.shopId, preventing all horizontal cross-tenant access."
    )

    # ================= PAGE 2: DATABASE SCHEMA (PART 1) =================
    pdf.new_page()
    pdf.add_header("DATABASE SCHEMA SPECIFICATIONS (PRISMA & POSTGRESQL)")
    pdf.add_paragraph("The database is engineered in PostgreSQL with strict foreign key constraints, composite unique indexes for idempotency, and decimal precision for financial integrity.")

    pdf.add_subheader("Model: Shop (Table: shops)")
    pdf.add_paragraph("Represents independent restaurant tenants operating on subdomains or slugs (e.g., abc.scanpayeat.com).")
    shop_fields = [
        ["Field", "Type", "Constraints", "Description"],
        ["id", "Int", "PRIMARY KEY, AUTO", "Unique shop surrogate identifier."],
        ["name", "String", "NOT NULL", "Public trading name of the restaurant."],
        ["slug", "String", "UNIQUE, INDEX", "URL slug used for subdomain routing (e.g. 'abc')."],
        ["subdomain", "String", "UNIQUE, INDEX", "Canonical subdomain for customer QR links."],
        ["address", "String?", "NULLABLE", "Physical address for receipt & customer display."],
        ["phone", "String?", "NULLABLE", "Direct contact phone number."],
        ["qrUrl", "String?", "NULLABLE", "Generated QR ordering URL (https://{subdomain}.scanpayeat.com)."],
        ["isActive", "Boolean", "DEFAULT true", "Controls tenant accessibility. If false, shopkeeper login & ordering are rejected."],
        ["createdAt", "DateTime", "DEFAULT now()", "Timestamp of initial creation."],
        ["updatedAt", "DateTime", "UPDATED AT", "Timestamp of most recent modification."]
    ]
    pdf.add_table(shop_fields[0], shop_fields[1:], [75, 75, 120, 252])

    pdf.add_subheader("Model: Shopkeeper (Table: shopkeepers)")
    pdf.add_paragraph("Staff account credential bound to a single shopId. Must be provisioned by an Admin.")
    sk_fields = [
        ["Field", "Type", "Constraints", "Description"],
        ["id", "Int", "PRIMARY KEY, AUTO", "Unique shopkeeper identifier."],
        ["shopId", "Int", "FOREIGN KEY (shops.id)", "Mandatory tenant reference. Cannot be modified by shopkeeper."],
        ["name", "String", "NOT NULL", "Manager or staff member name."],
        ["email", "String", "UNIQUE, INDEX", "Unique login email address."],
        ["mobile", "String?", "NULLABLE", "Contact mobile number."],
        ["passwordHash", "String", "NOT NULL", "Bcrypt hashed password (10 salt rounds). Plaintext is never stored."],
        ["isActive", "Boolean", "DEFAULT true", "Deactivatable by Admin to immediately revoke access."]
    ]
    pdf.add_table(sk_fields[0], sk_fields[1:], [80, 75, 130, 237])

    pdf.add_subheader("Model: Customer (Table: customers)")
    pdf.add_paragraph("Global consumer account capable of ordering from any restaurant on the platform.")
    cust_fields = [
        ["Field", "Type", "Constraints", "Description"],
        ["id", "Int", "PRIMARY KEY, AUTO", "Unique customer identifier."],
        ["name", "String", "NOT NULL", "Customer display name."],
        ["email", "String", "UNIQUE, INDEX", "Customer login email."],
        ["mobile", "String?", "NULLABLE", "10-digit mobile number for order notifications."],
        ["passwordHash", "String", "NOT NULL", "Bcrypt password hash."],
        ["isActive", "Boolean", "DEFAULT true", "Account active flag."]
    ]
    pdf.add_table(cust_fields[0], cust_fields[1:], [80, 75, 120, 247])

    # ================= PAGE 3: DATABASE SCHEMA (PART 2) =================
    pdf.new_page()
    pdf.add_header("DATABASE SCHEMA SPECIFICATIONS (PRISMA & POSTGRESQL)")

    pdf.add_subheader("Model: Category (Table: categories)")
    cat_fields = [
        ["Field", "Type", "Constraints", "Description"],
        ["id", "Int", "PRIMARY KEY, AUTO", "Unique category identifier."],
        ["shopId", "Int", "FOREIGN KEY (shops.id)", "Shop scope. Composite unique on [shopId, name]."],
        ["name", "String", "NOT NULL", "Category title (e.g., 'Burgers', 'Beverages')."],
        ["description", "String?", "NULLABLE", "Brief category overview."],
        ["sortOrder", "Int", "DEFAULT 0", "Ordering priority in public menu display."],
        ["isActive", "Boolean", "DEFAULT true", "Toggle to show or hide category."]
    ]
    pdf.add_table(cat_fields[0], cat_fields[1:], [75, 75, 135, 237])

    pdf.add_subheader("Model: Product (Table: products)")
    prod_fields = [
        ["Field", "Type", "Constraints", "Description"],
        ["id", "Int", "PRIMARY KEY, AUTO", "Unique product identifier."],
        ["shopId", "Int", "FOREIGN KEY (shops.id)", "Shop scope. Enforces tenant boundary."],
        ["categoryId", "Int", "FOREIGN KEY (categories.id)", "Parent category. Must belong to the same shopId."],
        ["name", "String", "NOT NULL", "Food item name (e.g. 'Chicken Burger')."],
        ["description", "String?", "NULLABLE", "Item ingredients & culinary description."],
        ["price", "Decimal(10,2)", "NOT NULL", "Current live retail price in INR."],
        ["imageUrl", "String?", "NULLABLE", "Cloudinary CDN image URL."],
        ["isAvailable", "Boolean", "DEFAULT true", "Live availability toggle (true = In Stock, false = Sold Out)."]
    ]
    pdf.add_table(prod_fields[0], prod_fields[1:], [75, 80, 135, 232])

    pdf.add_subheader("Model: Order (Table: orders)")
    pdf.add_paragraph("Central transactional entity linking customer, items, and status transitions.")
    order_fields = [
        ["Field", "Type", "Constraints", "Description"],
        ["id", "Int", "PRIMARY KEY, AUTO", "Order internal surrogate key."],
        ["orderCode", "String", "UNIQUE, INDEX", "Human-readable order tracking code (e.g. ORD1790954944)."],
        ["shopId", "Int", "FOREIGN KEY (shops.id)", "Restaurant where the order was placed."],
        ["customerId", "Int?", "NULLABLE, FOREIGN KEY", "Customer account reference (or null for guest checkout)."],
        ["tokenNumber", "String?", "NULLABLE, INDEX", "Daily shop sequential token (e.g. A101, A102). Assigned upon payment."],
        ["orderStatus", "OrderStatus", "ENUM", "PENDING | CONFIRMED | PREPARING | READY | COMPLETED | CANCELLED."],
        ["paymentStatus", "PaymentStatus", "ENUM", "PENDING | PAID | FAILED | REFUNDED."],
        ["subtotal", "Decimal(10,2)", "NOT NULL", "Sum of all order items calculated strictly by backend from DB."],
        ["tax", "Decimal(10,2)", "DEFAULT 0.00", "Tax amount."],
        ["totalAmount", "Decimal(10,2)", "NOT NULL", "Total payable amount (subtotal + tax)."],
        ["notes", "String?", "NULLABLE", "Customer preparation instructions (e.g. 'No onions')."]
    ]
    pdf.add_table(order_fields[0], order_fields[1:], [80, 80, 130, 232])

    pdf.add_subheader("Model: OrderItem (Table: order_items) — Historical Snapshot")
    pdf.add_paragraph("Immutable price and name snapshot. If product prices change later, past order receipts remain exact.")
    oi_fields = [
        ["Field", "Type", "Constraints", "Description"],
        ["id", "Int", "PRIMARY KEY, AUTO", "Order item line identifier."],
        ["orderId", "Int", "FOREIGN KEY (orders.id)", "Parent order reference with CASCADE on delete."],
        ["productId", "Int", "FOREIGN KEY (products.id)", "Original product catalog reference."],
        ["productName", "String", "NOT NULL", "Snapshotted product name at time of checkout."],
        ["unitPrice", "Decimal(10,2)", "NOT NULL", "Snapshotted unit price at time of purchase."],
        ["quantity", "Int", "NOT NULL, >= 1", "Purchased count."],
        ["lineTotal", "Decimal(10,2)", "NOT NULL", "Computed as unitPrice * quantity."]
    ]
    pdf.add_table(oi_fields[0], oi_fields[1:], [80, 80, 130, 232])

    # ================= PAGE 4: DATABASE SCHEMA (PART 3) =================
    pdf.new_page()
    pdf.add_header("DATABASE SCHEMA SPECIFICATIONS (PRISMA & POSTGRESQL)")

    pdf.add_subheader("Model: Payment (Table: payments)")
    pay_fields = [
        ["Field", "Type", "Constraints", "Description"],
        ["id", "Int", "PRIMARY KEY, AUTO", "Internal payment ID."],
        ["orderId", "Int", "FOREIGN KEY (orders.id)", "Associated order."],
        ["shopId", "Int", "FOREIGN KEY (shops.id)", "Recipient shop ID."],
        ["customerId", "Int?", "NULLABLE", "Payer customer ID."],
        ["amount", "Decimal(10,2)", "NOT NULL", "Authorized charge amount in INR."],
        ["currency", "String", "DEFAULT 'INR'", "Transaction currency."],
        ["provider", "String", "DEFAULT 'RAZORPAY'", "Payment gateway provider."],
        ["razorpayOrderId", "String?", "UNIQUE, INDEX", "Gateway order ID returned by Razorpay API."],
        ["razorpayPaymentId", "String?", "UNIQUE, INDEX", "Capture ID returned upon successful customer authorization."],
        ["razorpaySignature", "String?", "NULLABLE", "HMAC-SHA256 signature generated by Razorpay."],
        ["status", "PaymentStatus", "ENUM", "PENDING | PAID | FAILED | REFUNDED."]
    ]
    pdf.add_table(pay_fields[0], pay_fields[1:], [95, 80, 130, 217])

    pdf.add_subheader("Model: TokenCounter (Table: token_counters) — Concurrency Protection")
    pdf.add_paragraph("Maintains daily per-shop sequence counters. Prevents duplicate token collisions during high-concurrency checkout.")
    tc_fields = [
        ["Field", "Type", "Constraints", "Description"],
        ["id", "Int", "PRIMARY KEY, AUTO", "Counter surrogate key."],
        ["shopId", "Int", "FOREIGN KEY (shops.id)", "Shop scope. Composite unique on [shopId, date]."],
        ["date", "String", "NOT NULL", "Calendar date in 'YYYY-MM-DD' format (UTC/IST)."],
        ["lastSequence", "Int", "DEFAULT 100", "Last assigned sequential integer (starts at 101 each day)."],
        ["updatedAt", "DateTime", "UPDATED AT", "Timestamp of last sequence increment."]
    ]
    pdf.add_table(tc_fields[0], tc_fields[1:], [80, 80, 130, 232])

    pdf.add_subheader("Model: OrderStatusHistory (Table: order_status_history)")
    pdf.add_paragraph("Immutable audit trail tracking every lifecycle transition for an order with actor attribution.")
    osh_fields = [
        ["Field", "Type", "Constraints", "Description"],
        ["id", "Int", "PRIMARY KEY, AUTO", "History log ID."],
        ["orderId", "Int", "FOREIGN KEY (orders.id)", "Parent order reference."],
        ["status", "OrderStatus", "ENUM", "Order state (CONFIRMED, PREPARING, READY, etc.)."],
        ["notes", "String?", "NULLABLE", "Reason or descriptive kitchen remarks."],
        ["changedByRole", "UserRole?", "NULLABLE", "Role who triggered change (ADMIN, SHOPKEEPER, SYSTEM)."],
        ["changedById", "Int?", "NULLABLE", "User ID of the actor."],
        ["createdAt", "DateTime", "DEFAULT now()", "Timestamp when state transition took effect."]
    ]
    pdf.add_table(osh_fields[0], osh_fields[1:], [85, 80, 130, 227])

    pdf.add_subheader("Model: PaymentWebhookEvent (Table: payment_webhook_events)")
    pdf.add_paragraph("Guarantees idempotent webhook processing. Ensures Razorpay duplicate delivery does not re-process orders.")
    pwe_fields = [
        ["Field", "Type", "Constraints", "Description"],
        ["id", "Int", "PRIMARY KEY, AUTO", "Internal event ID."],
        ["eventId", "String", "UNIQUE, INDEX", "Razorpay event identifier (e.g. 'evt_100245')."],
        ["eventType", "String", "NOT NULL", "Event name (e.g., 'payment.captured', 'payment.failed')."],
        ["payload", "Json", "NOT NULL", "Raw JSON payload delivered by gateway."],
        ["status", "String", "DEFAULT 'PROCESSED'", "Processing disposition."],
        ["processedAt", "DateTime", "DEFAULT now()", "Time recorded."]
    ]
    pdf.add_table(pwe_fields[0], pwe_fields[1:], [85, 80, 130, 227])

    # ================= PAGE 5: COMPLETE ARCHITECTURAL FLOWS =================
    pdf.new_page()
    pdf.add_header("HOW EACH FLOW WORKS (END-TO-END TECHNICAL EXECUTION)")

    pdf.add_subheader("Flow 1: Customer Registration & Unified Authentication")
    pdf.add_paragraph("1. Registration (POST /api/auth/register): The client submits name, email, mobile, and password. Zod validates the schema. The backend verifies email uniqueness, hashes the password via Bcrypt (10 salt rounds), creates the Customer in PostgreSQL, and generates an access token (15m expiry) and refresh token (7d expiry).")
    pdf.add_paragraph("2. Token Storage: The SHA-256 hash of the refresh token is stored in the refresh_tokens table. Both tokens are delivered to the client as secure, httpOnly, SameSite cookies with an optional Bearer header for mobile apps.")
    pdf.add_paragraph("3. Unified Login (POST /api/auth/login): Single login endpoint for all three roles (Admin, Shopkeeper, Customer). The backend checks the Admin table, then Shopkeeper (verifying shop.isActive), then Customer. Once password verification passes, claims are bundled: { sub: userId, role, email, shopId }.")
    pdf.add_paragraph("4. Token Rotation (POST /api/auth/refresh): When an access token expires, the client sends the refresh token. The backend verifies signature, checks DB for active/non-revoked status, revokes the old token, and issues a fresh pair. If an already revoked token is used, all tokens for that user are revoked (replay attack defense).")

    pdf.add_subheader("Flow 2: Admin Multi-Tenant Provisioning")
    pdf.add_paragraph("1. Shop Creation (POST /api/admin/shops): Admin creates a shop by providing name, slug, subdomain, address, and phone. The backend enforces alphanumeric/hyphen slug uniqueness and automatically constructs the public QR URL (https://{subdomain}.scanpayeat.com).")
    pdf.add_paragraph("2. Shopkeeper Creation (POST /api/admin/shopkeepers): Admin provisions a shopkeeper, assigning them to a specific shopId. Public registration for shopkeepers is disabled.")
    pdf.add_paragraph("3. Tenant Kill-Switch (PATCH /api/admin/shops/:id/status): When an Admin marks a shop inactive, all subsequent shopkeeper logins and customer menu access for that shop are blocked immediately.")

    pdf.add_subheader("Flow 3: Shopkeeper Menu & Multi-Tenant Scoping")
    pdf.add_paragraph("1. Zero-Trust shopId Rule: All requests to /api/shop/* execute authenticate and shopScope middlewares. The backend strictly resolves req.shopId = req.user.shopId from the verified JWT. Frontend-submitted shopId values are completely ignored.")
    pdf.add_paragraph("2. Category & Product CRUD: Shopkeepers create categories and products. When creating a product, the backend checks that the referenced categoryId belongs to req.shopId, preventing foreign category contamination.")
    pdf.add_paragraph("3. Availability & Images: Shopkeepers can toggle products available/sold-out (PATCH /api/shop/products/:id/availability) or upload images (POST /api/shop/upload) via Multer buffer stream to Cloudinary.")

    pdf.add_subheader("Flow 4: Public QR Menu Resolution")
    pdf.add_paragraph("1. QR Scan: When a diner scans a table QR code, their browser navigates to https://abc.scanpayeat.com.")
    pdf.add_paragraph("2. Slug Resolution: The Next.js frontend calls GET /api/public/shops/abc and GET /api/public/shops/abc/menu.")
    pdf.add_paragraph("3. Public Filtering: No login is required. The backend checks shop.isActive, returning categories and only products where isAvailable == true.")

    # ================= PAGE 6: CHECKOUT, PAYMENT & TOKENS =================
    pdf.new_page()
    pdf.add_header("HOW EACH FLOW WORKS (CHECKOUT, PAYMENTS & TOKENS)")

    pdf.add_subheader("Flow 5: Anti-Tampering Order Checkout (POST /api/orders/checkout)")
    pdf.add_paragraph("1. Payload: Client submits only product IDs and quantities: { shopSlug: 'abc', items: [{ productId: 10, quantity: 2 }] }.")
    pdf.add_paragraph("2. Server Price Recalculation: The backend queries PostgreSQL for all requested product IDs within that shop. If any product is missing, belongs to another shop, or is marked unavailable, checkout is rejected with 400 Bad Request.")
    pdf.add_paragraph("3. Snapshot Generation: Database prices are read directly: lineTotal = unitPrice * quantity; subtotal = sum(lineTotals).")
    pdf.add_paragraph("4. Pending Order: In a single database transaction, the backend creates an Order (status PENDING, paymentStatus PENDING), inserts OrderItem snapshot rows (productName, unitPrice, quantity, lineTotal), creates a Razorpay gateway order, and creates a Payment record (status PENDING).")
    pdf.add_paragraph("5. Gateway Response: Returns { orderId, orderCode, totalAmount, razorpayOrderId, currency: 'INR', key: RAZORPAY_KEY_ID } to the frontend to initialize checkout.")

    pdf.add_subheader("Flow 6: Razorpay Payment Verification & Atomic Transaction")
    pdf.add_paragraph("1. Customer Pays: Customer completes payment on Razorpay checkout modal. Gateway returns razorpay_order_id, razorpay_payment_id, and razorpay_signature.")
    pdf.add_paragraph("2. Signature Audit: Client posts tokens to POST /api/payments/verify. Backend computes HMAC_SHA256(order_id + '|' + payment_id, RAZORPAY_KEY_SECRET) and uses crypto.timingSafeEqual to verify the signature.")
    pdf.add_paragraph("3. Atomic Transaction: If valid, the backend executes an atomic PostgreSQL transaction with a 15-second pool timeout:")
    pdf.add_callout(
        "ATOMIC PAYMENT COMMITMENT SEQUENCE",
        "1. Mark Payment status = PAID with razorpayPaymentId and signature.\n2. Atomically upsert & increment TokenCounter for (shopId, date) -> yields tokenNumber (e.g. A101).\n3. Update Order: paymentStatus = PAID, orderStatus = CONFIRMED, tokenNumber = 'A101'.\n4. Insert OrderStatusHistory log: status = CONFIRMED, notes = 'Payment verified via Razorpay'.\n5. COMMIT transaction."
    )
    pdf.add_paragraph("4. Real-Time Alert: The backend emits a 'new_order' event over Socket.io to room shop:{shopId} containing the order code, token number, and items. The shopkeeper's tablet sounds an alert and updates the queue.")

    pdf.add_subheader("Flow 7: Daily Token Counter Concurrency Protection")
    pdf.add_paragraph("Every shop has a distinct token sequence (e.g., Shop 'ABC' uses 'A101', 'A102'; Shop 'Burger' uses 'B101', 'B102'). In PostgreSQL, Prisma executes an atomic upsert with { increment: 1 } on the token_counters table with a composite key [shopId, date]. PostgreSQL locks the counter row for the microsecond duration of the update, completely preventing duplicate tokens when multiple customers pay simultaneously.")

    pdf.add_subheader("Flow 8: Webhook Idempotency (POST /api/webhooks/razorpay)")
    pdf.add_paragraph("1. Raw Body Signature Audit: Preserves raw request bytes and verifies x-razorpay-signature with RAZORPAY_WEBHOOK_SECRET.")
    pdf.add_paragraph("2. Deduplication: Checks payment_webhook_events table for eventId. If already present, immediately returns 200 { status: 'already_processed' }.")
    pdf.add_paragraph("3. Event Handling: On payment.captured, executes the same atomic confirmation transaction if the order was not already confirmed. On payment.failed, marks Payment and Order as FAILED.")

    # ================= PAGE 7: REALTIME, HISTORY & API DIRECTORY =================
    pdf.new_page()
    pdf.add_header("HOW EACH FLOW WORKS & API REFERENCE DIRECTORY")

    pdf.add_subheader("Flow 9: Shopkeeper Status Flow & Socket.io Realtime")
    pdf.add_paragraph("1. Order Lifecycle: Orders move sequentially: CONFIRMED -> PREPARING -> READY -> COMPLETED (or CANCELLED).")
    pdf.add_paragraph("2. PATCH /api/shop/orders/:id/status: Validates that the order belongs to req.shopId, updates orderStatus, logs an OrderStatusHistory record with actor ID and timestamp, and broadcasts 'order_status_updated' to shop:{shopId} and order:{orderId}.")

    pdf.add_subheader("Flow 10: Customer Order Tracking & History")
    pdf.add_paragraph("1. Global Order History (GET /api/me/orders): Filters strictly by authenticated customerId = req.user.id. Customers see orders from all visited shops.")
    pdf.add_paragraph("2. Real-Time Tracking (GET /api/me/orders/:orderCode): Customer order screen subscribes to Socket.io room order:{orderId} to receive live status updates without refreshing.")

    pdf.add_subheader("Complete API Endpoint Reference Directory")
    api_headers = ["Method", "Endpoint Route", "Auth / Roles", "Summary & Response"]
    api_rows = [
        ["POST", "/api/auth/register", "Public", "Registers customer, sets httpOnly cookies. Returns user."],
        ["POST", "/api/auth/login", "Public", "Unified login (Admin/Shopkeeper/Customer). Sets cookies."],
        ["POST", "/api/auth/refresh", "Public (Cookie)", "Rotates refresh token and returns new access token."],
        ["POST", "/api/auth/logout", "Public", "Revokes refresh token in DB and clears cookies."],
        ["GET",  "/api/auth/me", "All Roles", "Returns fresh authenticated user profile and permissions."],
        ["POST", "/api/admin/shops", "ADMIN", "Creates shop with slug/subdomain and generates QR URL."],
        ["GET",  "/api/admin/shops", "ADMIN", "Lists all shops with search, active filters, and pagination."],
        ["GET",  "/api/admin/shops/:id", "ADMIN", "Fetches single shop details with staff counts."],
        ["PUT",  "/api/admin/shops/:id", "ADMIN", "Updates shop name, slug, address, or phone."],
        ["PATCH","/api/admin/shops/:id/status", "ADMIN", "Activates/deactivates shop (disables staff logins)."],
        ["POST", "/api/admin/shopkeepers", "ADMIN", "Provisions a shopkeeper account linked to a shopId."],
        ["GET",  "/api/admin/shopkeepers", "ADMIN", "Lists shopkeepers with shopId filter and pagination."],
        ["GET",  "/api/admin/dashboard", "ADMIN", "Aggregates total shops, staff, customers, orders, revenue."],
        ["GET",  "/api/admin/orders", "ADMIN", "Global filterable order listing across all restaurants."],
        ["GET",  "/api/admin/transactions", "ADMIN", "Global payment audit logs with status filters."],
        ["POST", "/api/shop/categories", "SHOPKEEPER", "Creates category scoped strictly to req.shopId."],
        ["GET",  "/api/shop/categories", "SHOPKEEPER", "Lists all categories for the authenticated shop."],
        ["POST", "/api/shop/products", "SHOPKEEPER", "Creates product with price, description, and image."],
        ["GET",  "/api/shop/products", "SHOPKEEPER", "Lists shop products with category & availability filters."],
        ["PATCH","/api/shop/products/:id/availability", "SHOPKEEPER", "Toggles product available (true) or sold-out (false)."],
        ["POST", "/api/shop/upload", "SHOPKEEPER", "Uploads food photo via Multer stream to Cloudinary."],
        ["GET",  "/api/shop/orders", "SHOPKEEPER", "Lists incoming orders for the authenticated shop."],
        ["PATCH","/api/shop/orders/:id/status", "SHOPKEEPER", "Advances order status (CONFIRMED -> COMPLETED)."],
        ["GET",  "/api/public/shops/:slug", "Public", "Resolves shop metadata by subdomain or slug."],
        ["GET",  "/api/public/shops/:slug/menu", "Public", "Returns live categories and available products."],
        ["POST", "/api/orders/checkout", "Public / Cust", "Validates DB prices, creates pending order & Razorpay ID."],
        ["POST", "/api/payments/verify", "Public / Cust", "Verifies HMAC signature, assigns daily token atomically."],
        ["POST", "/api/webhooks/razorpay", "Public (Gateway)", "Processes payment.captured & failed with idempotency."],
        ["GET",  "/api/me/orders", "CUSTOMER", "Customer order history across all restaurants."],
        ["GET",  "/api/me/orders/:orderCode", "CUSTOMER", "Fetches single order details and lifecycle status history."],
        ["GET",  "/api-docs", "Public", "Interactive Swagger UI documentation page."],
        ["GET",  "/api-docs/openapi.json", "Public", "Raw OpenAPI 3.0 JSON specification."]
    ]
    pdf.add_table(api_headers, api_rows, [55, 175, 95, 197])

    # ================= PAGE 8: SWAGGER GUIDE & DEMO CREDENTIALS =================
    pdf.new_page()
    pdf.add_header("SWAGGER UI GUIDE & SEED CREDENTIALS")

    pdf.add_subheader("1. Interactive Swagger UI Access")
    pdf.add_paragraph("The backend embeds an interactive OpenAPI 3.0 Swagger UI interface:")
    pdf.add_callout(
        "SWAGGER UI ENDPOINT",
        "URL: http://localhost:5001/api-docs\nOpenAPI Spec: http://localhost:5001/api-docs/openapi.json\n\nYou can execute live API requests directly from Swagger UI by clicking 'Try it out'. For protected routes, obtain a token from POST /api/auth/login and click the 'Authorize' button in Swagger UI."
    )

    pdf.add_subheader("2. Seeded Test Accounts & Demo Credentials")
    pdf.add_paragraph("Run 'npm run seed' to initialize the database with standard demo accounts:")
    seed_headers = ["Account Type", "Email / Identifier", "Password", "Permissions & Assigned Tenant"]
    seed_rows = [
        ["Platform Admin", "admin@scanpayeat.com", "Admin@123", "Full access to /api/admin/* dashboard and management."],
        ["Shopkeeper", "shop@abc.com", "Shop@123", "Managing 'ABC Restaurant' (Shop ID: 1, Slug: 'abc')."],
        ["Customer", "customer@demo.com", "Customer@123", "Customer ordering account with access to /api/me/*."],
        ["Demo Shop Slug", "abc", "N/A", "Public menu at /api/public/shops/abc/menu."]
    ]
    pdf.add_table(seed_headers, seed_rows, [100, 140, 95, 187])

    pdf.add_subheader("3. Production Deployment & Readiness Checklist")
    check_headers = ["Security Control", "Status", "Implementation Detail"]
    check_rows = [
        ["Anti-Tampering Prices", "ACTIVE", "Prices recalculated strictly from PostgreSQL database."],
        ["Multi-Tenant Isolation", "ACTIVE", "req.shopId enforced via JWT middleware on every shop query."],
        ["Concurrency Protection", "ACTIVE", "TokenCounter atomic upsert prevents duplicate order tokens."],
        ["Signature Verification", "ACTIVE", "Cryptographic HMAC-SHA256 verification on payments & webhooks."],
        ["Webhook Idempotency", "ACTIVE", "payment_webhook_events table blocks duplicate processing."],
        ["Rate Limiting", "ACTIVE", "Express rate limiters on auth, checkout, and payment routes."],
        ["Strict Input Validation", "ACTIVE", "Zod schemas validate all body, query, and path parameters."],
        ["CORS & Cookie Security", "ACTIVE", "HttpOnly SameSite cookies with credentials enabled."]
    ]
    pdf.add_table(check_headers, check_rows, [130, 70, 322])

    pdf.save()

if __name__ == "__main__":
    build_documentation_pdf()
