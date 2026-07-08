# UI/UX Specification — Compact Restaurant SaaS SPA

## 1. UX Direction

Design a compact, fast, easy restaurant operations UI for cashiers, captains, kitchen staff, managers, and owners.

The UI should feel like a professional restaurant POS, not like a generic admin dashboard.

Core UX words:

- Fast
- Compact
- Touch-friendly
- Clear
- Low training
- Real-time
- Minimal clicks
- High contrast
- No clutter

## 2. Device Targets

### Primary

- Android tablet at counter
- Desktop/laptop at counter/admin
- Kitchen display monitor/tablet
- Captain Android phone/tablet

### Responsive breakpoints

- Mobile: 360–767 px
- Tablet: 768–1199 px
- Desktop: 1200+ px

## 3. Visual Style

Use clean SaaS design with a restaurant POS feel.

Recommended palette:

```txt
Background:      #F8FAFC
Surface:         #FFFFFF
Surface muted:   #F1F5F9
Primary:         #0F766E  (teal)
Primary dark:    #115E59
Accent:          #F59E0B  (amber for active food/order actions)
Danger:          #DC2626
Success:         #16A34A
Warning:         #D97706
Text:            #0F172A
Text muted:      #64748B
Border:          #E2E8F0
```

Dark mode can be added later for kitchen display.

## 4. Typography

Use system fonts for performance:

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

If using external font, self-host it, do not block app load.

## 5. Layout Shell

### Desktop/tablet shell

```txt
+--------------------------------------------------------------------------------+
| Top Bar                                                                        |
| Logo | Outlet | Shift | Search | Live Status | User | Quick Actions           |
+-------------+------------------------------------------------------------------+
| Sidebar     | Active Screen                                                     |
| Billing     |                                                                  |
| Tables      |                                                                  |
| Captain     |                                                                  |
| Kitchen     |                                                                  |
| Orders      |                                                                  |
| Menu        |                                                                  |
| Inventory   |                                                                  |
| Reports     |                                                                  |
| Admin       |                                                                  |
| Settings    |                                                                  |
+-------------+------------------------------------------------------------------+
```

### Mobile shell

```txt
+------------------------------------------------+
| Top Bar: Outlet + Live Status + User           |
+------------------------------------------------+
| Active Screen                                  |
+------------------------------------------------+
| Bottom Nav: Billing | Tables | Kitchen | More  |
+------------------------------------------------+
```

## 6. Top Bar Requirements

Top bar must show:

- Current outlet
- Active shift
- Current user/role
- Realtime status: Live / Reconnecting / Offline
- Current business date
- Quick command/search box

Quick actions:

- New Bill
- New Table Order
- Open KDS
- Day Close

## 7. Sidebar Requirements

Sidebar should be icon + label.

Collapsed width: 64 px.
Expanded width: 180 px.

Main items:

1. Billing
2. Tables
3. Captain
4. Kitchen
5. Orders
6. Menu
7. Inventory
8. Customers
9. Reports
10. Admin
11. Settings

Use role-based visibility.

Cashier sees: Billing, Tables, Orders, Customers.
Captain sees: Captain, Tables, Orders.
Kitchen sees: Kitchen only.
Manager sees: all operational tabs.
Owner sees: Dashboard, Reports, Admin, Settings.

## 8. Billing Screen UI

### Purpose

This is the most important screen. It must be extremely fast.

### Layout

```txt
+--------------------------------------------------------------------------------+
| Billing Top: Dine-in | Takeaway | Delivery | Table | Customer | Search          |
+----------------------+--------------------------------+------------------------+
| Category List        | Menu Grid                      | Current Order          |
| Starters             | [Paneer Tikka] [Tea] [Dosa]   | Table A4               |
| Main Course          | [Coffee] [Burger] [Biryani]   | Items                  |
| Beverages            |                                | Qty +/-                |
| Desserts             |                                | Notes                  |
|                      |                                | Subtotal/Tax/Total     |
+----------------------+--------------------------------+------------------------+
| Bottom Actions: Hold | Send KOT | Print KOT | Discount | Settle | Print Bill       |
+--------------------------------------------------------------------------------+
```

### Billing UX rules

- Menu item cards must be large enough for touch.
- Show category chips horizontally on mobile.
- Search should focus with `/` keyboard shortcut.
- Quantity change should require one tap.
- Modifier/note dialog should be quick.
- Send KOT must be prominent.
- Settle bill must be visually separate from KOT.
- Cancel/Void must require reason and manager PIN.

### Menu item card

Display:

- Item name
- Price
- Veg/non-veg marker if enabled
- Short availability state: Available / 86 / Low stock

### Cart item row

Display:

- Item name
- Variant/modifiers
- Quantity controls
- Item note
- Price
- Remove button

## 9. Table/Floor Screen UI

### Purpose

Show live status of restaurant tables.

### Layout

```txt
+--------------------------------------------------------------------------------+
| Floor Tabs: Ground | AC Hall | Rooftop | Family Room                            |
+--------------------------------------------------------------------------------+
| [T1 Available] [T2 Occupied 12m] [T3 KOT Sent] [T4 Ready] [T5 Bill Requested]   |
| [T6 Payment Due] [T7 Reserved] [T8 Dirty]                                      |
+--------------------------------------------------------------------------------+
| Right Drawer on table click:                                                    |
| Table info, active order, captain, KOT status, total, actions                   |
+--------------------------------------------------------------------------------+
```

### Table statuses

- Available: white/gray
- Occupied: blue
- KOT sent: amber
- Preparing: orange
- Ready: green
- Bill requested: purple
- Payment pending: red
- Reserved: cyan
- Dirty: gray striped

### Table actions

- Start order
- Add items
- Send KOT
- Print bill
- Settle payment
- Transfer table
- Merge tables
- Split bill
- Mark dirty/clean

## 10. Captain Screen UI

### Purpose

Fast mobile/tablet table-side ordering.

### Layout

```txt
+------------------------------------------------+
| Captain: Assigned Tables | Search              |
+------------------------------------------------+
| Table Cards: A1, A2, B4, C3                    |
+------------------------------------------------+
| Selected Table                                 |
| Category chips                                 |
| Item list                                      |
| Current order drawer                           |
+------------------------------------------------+
| Send KOT | Request Bill                        |
+------------------------------------------------+
```

### Captain rules

- Optimized for one-hand mobile use.
- Large touch targets.
- Minimal typing.
- Recent/frequent items at top.
- Notes via quick tags: Less Spicy, No Onion, Jain, Extra Cheese, Parcel.
- Captain cannot settle payment unless permission enabled.

## 11. Kitchen Display/KDS UI

### Purpose

Replace paper KOT confusion with real-time display.

### Layout

```txt
+--------------------------------------------------------------------------------+
| KDS Top: Station filter | All / New / Preparing / Ready | Fullscreen | Sound     |
+--------------------------------------------------------------------------------+
| KOT Card 1              | KOT Card 2                    | KOT Card 3             |
| Table A4                | Takeaway #18                  | Delivery Manual #21    |
| 12:34 PM | 8 min age    | 12:36 PM | 6 min age            | 12:39 PM | 3 min age |
| 2x Paneer Tikka         | 1x Coffee                     | 1x Biryani             |
| Note: Less spicy        |                              | Note: No onion         |
| [Preparing] [Ready]     | [Preparing] [Ready]           | [Preparing] [Ready]    |
+--------------------------------------------------------------------------------+
```

### KDS rules

- Use large font.
- No tiny admin details.
- Show order age clearly.
- New orders should have sound/visual pulse.
- Allow station filtering.
- Allow item-level ready marking.
- Fullscreen mode is required.
- Kitchen staff should not see money totals unless permission enabled.

## 12. Orders Screen UI

Purpose: searchable history and live order control.

Filters:

- Running
- KOT sent
- Preparing
- Ready
- Billed
- Paid
- Cancelled
- Today
- Date range
- Order type
- Staff

Order row:

- Order number
- Table/source
- Customer
- Status
- Amount
- Payment status
- Time
- Staff

## 13. Menu Management UI

### Layout

```txt
+--------------------------------------------------------------------------------+
| Menu Top: Search | Add Item | Import | Export | Availability Mode             |
+-------------------+------------------------------------------------------------+
| Categories        | Item Table / Cards                                           |
| Starters          | Item | Price | Tax | Category | Available | Actions          |
| Mains             |                                                              |
+-------------------+------------------------------------------------------------+
```

### Item fields

- Name
- Category
- Price
- Tax slab
- Item type: veg/non-veg/egg/other
- SKU/code
- Availability
- Preparation station
- Modifiers/add-ons
- Image optional
- Description optional

## 14. Inventory UI

MVP inventory should be simple.

Screens:

- Stock items
- Stock adjustments
- Low stock alerts
- Purchase entries later
- Recipe mapping later

Stock item fields:

- Name
- Unit
- Current stock
- Minimum stock
- Cost per unit
- Supplier optional

## 15. Reports UI

Owner/manager dashboard cards:

- Today sales
- Orders count
- Average order value
- Payment mode split
- Top 5 selling items
- Open tables
- Cancelled amount
- Discounts

Charts can be simple. Do not overuse charts in MVP.

## 16. Admin UI

Admin tabs:

- Staff/users
- Roles/permissions
- Floors/tables
- Taxes/charges
- Printer settings
- Outlet settings
- Audit logs
- Subscription/billing later

## 17. Forms and Modals

Rules:

- Use drawer for large edit forms.
- Use modal for confirmation.
- Keep delete/cancel actions protected.
- For manager approval, use PIN modal.
- Always show success/error toast.

## 18. Keyboard Shortcuts

Desktop billing shortcuts:

```txt
/        Focus search
F2       New order
F4       Send KOT
F6       Print bill
F8       Settle payment
Esc      Close drawer/modal
+        Increase selected item quantity
-        Decrease selected item quantity
Ctrl+K   Command palette
```

## 19. Empty States

Examples:

- No menu items: “Add your first menu item to start billing.”
- No running orders: “No active orders right now.”
- Kitchen no orders: “Kitchen is clear.”
- No tables: “Create your first floor and table layout.”

## 20. Error States

Realtime failure:

```txt
Reconnecting… Orders are safe. New changes will retry automatically.
```

Offline mode MVP:

```txt
You are offline. Viewing cached data only. New orders are disabled until connection returns.
```

Later offline-first mode:

```txt
Offline mode. 3 changes pending sync.
```

## 21. Accessibility

- Minimum touch target: 44x44 px.
- Clear color + label; do not rely only on color.
- Support keyboard navigation for billing.
- Use aria labels on icon buttons.
- Use high contrast on KDS.

## 22. Component List

Build reusable components:

- AppShell
- SidebarNav
- TopStatusBar
- RoleGuard
- OutletSwitcher
- LiveStatusBadge
- BillingMenuGrid
- CategoryRail
- OrderCart
- CartItemRow
- TableGrid
- TableCard
- KOTCard
- KDSBoard
- PaymentDrawer
- ModifierDialog
- ManagerPinDialog
- DataTable
- ReportCard
- EmptyState
- ConfirmDialog
- ToastProvider

## 23. AI IDE Instructions For UI

Ask AI IDE to build UI in this order:

1. Static app shell with role-based nav.
2. Billing screen mock with local state.
3. Table screen mock with statuses.
4. KDS screen mock with realtime-ready state shape.
5. Admin/menu CRUD UI.
6. Reports UI.
7. Connect to API after UI flow is clean.

## 24. UI Quality Bar

Before backend integration, the UI must satisfy:

- Cashier can create a dummy order in less than 20 seconds.
- Captain can add 3 items to a table in less than 15 seconds.
- Kitchen can mark order ready in one tap.
- Manager can find today's sales in one click.
- No screen feels like a generic spreadsheet unless it is a report/admin table.
