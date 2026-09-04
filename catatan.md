# MINGLEBOOTH — Product & Development Specification

## 1. PRODUCT

MINGLEBOOTH adalah software photobooth profesional untuk vendor event, wedding, corporate, birthday, coffee shop, dan event lainnya.

Positioning:

> MINGLEBOOTH — Professional Photobooth Software

MINGLEBOOTH adalah platform photobooth, bukan sekadar aplikasi kamera.

Core:
- Professional camera integration
- Mingle / Roaming Booth
- Photo
- GIF
- PNG template
- QR delivery
- Offline-first
- Local storage
- Cloud synchronization
- Cloud gallery
- Gallery retention 30 hari
- Annual subscription
- Device-based licensing
- Vendor dashboard
- Admin / Owner backend

---

# 2. PRODUCT ECOSYSTEM

## MingleBooth Studio

Desktop application untuk operator.

Fungsi:
- Camera connection
- Camera status
- Live preview
- Countdown
- Capture
- Mingle / Roaming mode
- PNG template
- Photo processing
- GIF processing
- QR generation
- Local storage
- Offline operation
- Sync queue
- Cloud synchronization
- Printer support

## MingleBooth Cloud

Web dashboard vendor.

Fungsi:
- Login
- Events
- Templates
- Gallery
- Subscription
- Billing
- Licenses
- Devices
- Analytics
- Team management
- Cloud sync

## MingleBooth Gallery

Guest-facing web page.

Fungsi:
- View photo
- Download photo
- View/download GIF
- QR access
- Mobile-first
- Event branding
- Expiration information

---

# 3. SUPPORTED PLATFORMS

MINGLEBOOTH harus dirancang multi-platform.

## Desktop / Laptop

Platform utama untuk:
- Sony/Canon professional camera
- USB camera
- Live preview
- Camera control
- Capture
- Local processing
- Local storage
- Offline mode
- Cloud sync
- Printer

## iPad / Tablet

Untuk:
- Portable photobooth
- Roaming booth
- Device camera
- Touch interface
- Capture
- Template processing
- GIF
- QR delivery
- Offline mode
- Cloud sync

## Mobile

Terutama untuk guest.

Guest tidak perlu install aplikasi.

Flow:

QR
→ Mobile Browser
→ MingleBooth Gallery
→ View
→ Download / Share

## Web Browser

Untuk:
- Vendor Dashboard
- Admin Backend
- Guest Gallery

---

# 4. ARCHITECTURE

Gunakan modular architecture.

Recommended:

apps/
- desktop
- tablet
- web

packages/
- camera
- photo-engine
- template-engine
- gif-engine
- sync-engine
- license
- event-core
- shared

Business logic harus dipisahkan dari platform-specific code.

Jangan menduplikasi business logic jika dapat digunakan bersama.

---

# 5. CAMERA ARCHITECTURE

Gunakan camera abstraction layer.

Camera interface:

- connect()
- disconnect()
- getStatus()
- capture()
- getPreview()

Adapters:

- Sony
- Canon
- Webcam
- Tablet/Mobile Camera

Jangan membuat seluruh aplikasi bergantung pada satu camera brand.

License dihitung berdasarkan device, bukan kamera.

---

# 6. MINGLE / ROAMING BOOTH

Flow:

Operator
→ Camera
→ Capture
→ Photo Processing
→ Template
→ Final Photo
→ Local Save
→ Cloud Sync jika online
→ QR
→ Guest Download

Tidak membutuhkan booth fisik.

---

# 7. PHOTO / TEMPLATE ENGINE

Layer:

Background
→ Photo
→ PNG Frame / Overlay
→ Logo / Text
→ Final Output

Template configuration harus mendukung:
- Canvas width
- Canvas height
- Photo position
- Photo size
- Crop
- Overlay PNG
- Background
- Text
- Output format

Contoh:

{
  "canvas": {
    "width": 1080,
    "height": 1350
  },
  "photo": {
    "x": 0,
    "y": 0,
    "width": 1080,
    "height": 1350,
    "fit": "cover"
  },
  "overlay": "frame.png"
}

---

# 8. GIF

MINGLEBOOTH mendukung GIF.

Flow:

Capture multiple frames
→ Combine
→ Generate GIF
→ Save locally
→ Upload when online
→ Gallery

GIF mengikuti retention 30 hari.

---

# 9. OFFLINE-FIRST

Internet bukan dependency utama untuk photobooth.

ONLINE:

Capture
→ Process
→ Local Save
→ Cloud Upload
→ Gallery
→ QR

OFFLINE:

Capture
→ Process
→ Local Save
→ Sync Queue
→ Continue Event

RECONNECT:

Internet detected
→ Sync Queue
→ Upload
→ Cloud
→ Gallery

Requirements:
- Capture tetap bekerja tanpa internet
- Template tersedia lokal
- Event configuration tersedia lokal
- Local storage
- Retry
- Resume upload
- Duplicate prevention
- Network detection
- Sync status

Status:

Offline
Syncing
Synced
Sync Failed

Tidak boleh kehilangan foto karena internet putus.

---

# 10. LOCAL STORAGE

Desktop/tablet photobooth harus dapat menyimpan data secara lokal.

Recommended:
- SQLite untuk local database
- Local filesystem untuk media

Contoh:

data/
- database.sqlite
- events/
- photos/
- gifs/
- templates/
- queue/

Cloud bukan dependency untuk capture.

---

# 11. CLOUD

Recommended:
- Supabase
- PostgreSQL
- Supabase Storage

Cloud menyimpan:
- Users
- Organizations
- Subscriptions
- Licenses
- Devices
- Event metadata
- Templates
- Gallery metadata
- Photos
- GIFs
- Analytics
- Sync data

---

# 12. GALLERY RETENTION — 30 DAYS

Photo dan GIF di cloud disimpan maksimal 30 hari.

Yang dihapus otomatis:
- Final photo
- GIF
- Thumbnail
- Temporary processed files

Flow:

Upload
→ expiration_at
→ 30 days
→ Gallery Expired
→ Cleanup Job
→ Delete cloud files

Event metadata dan statistik boleh tetap disimpan.

Subscription expired tidak boleh menghapus local photos vendor.

---

# 13. QR GALLERY

Setiap photo/GIF memiliki unique ID.

Contoh:

Event ID:
evt_123

Photo ID:
photo_456

QR:

gallery.minglebooth.com/p/photo_456

Domain harus configurable melalui environment variable.

---

# 14. VENDOR ACCOUNT

Vendor flow:

Create Account
→ Login
→ Dashboard
→ View Plans
→ Choose Plan
→ Create Order
→ Payment
→ Subscription Active
→ License Active
→ Download Studio
→ Activate Device
→ Create Event
→ Prepare Event
→ Run Photobooth

Vendor hanya boleh melihat data milik organisasinya.

Vendor tidak boleh melihat vendor lain.

---

# 15. SUBSCRIPTION

Annual subscription.

## STARTER

Rp1.499.000 / tahun

- 1 device
- Unlimited events
- Camera integration
- Mingle / Roaming Booth
- PNG templates
- Photo
- Basic GIF
- QR delivery
- Offline mode
- Cloud sync
- Gallery 30 hari
- Basic event management
- Software updates
- Basic support

## PRO

Rp2.999.000 / tahun

- 3 devices
- Unlimited events
- Unlimited templates
- Advanced GIF
- Custom branding
- Gallery branding
- Advanced analytics
- Download entire gallery
- Automatic backup
- Team/user management
- Priority support
- Early access

## BUSINESS

Rp5.999.000 / tahun

- 10 devices
- Multi-user
- Role management
- Centralized dashboard
- Multi-event management
- Multi-brand
- White-label option
- Custom gallery domain
- Advanced analytics
- API access
- Device management
- License management
- Dedicated support

Harga di atas adalah proposal awal dan dapat diubah.

---

# 16. LICENSE

License berdasarkan device, bukan kamera.

Example Pro:

3 devices:
- MacBook
- iPad
- Windows Laptop

Vendor dapat:
- Activate device
- Deactivate device
- Replace device
- Manage devices

Jangan memaksa vendor membeli license baru hanya karena mengganti laptop.

---

# 17. OFFLINE LICENSE

Initial activation membutuhkan internet.

Setelah aktivasi:
- License token disimpan lokal
- Software dapat berjalan offline
- Verification dilakukan saat internet tersedia
- Offline grace period

Internet OFF:

Check local license token
→ Valid
→ Continue Booth

Internet tidak boleh menjadi alasan photobooth gagal beroperasi.

---

# 18. SUBSCRIPTION EXPIRATION

30 hari sebelum expired:
- Reminder

7 hari sebelum expired:
- Strong reminder

Expired:
- Limited Mode

Tetap boleh:
- Membuka software
- Melihat event lama
- Membuka local photos
- Export local data

Tidak boleh:
- Membuat event production baru
- Aktivasi event baru
- Cloud gallery baru
- Premium features

Jangan menghapus local photos karena subscription expired.

---

# 19. RENEWAL

Renewal menambahkan 365 hari dari tanggal expiration saat ini.

Contoh:

20 hari tersisa
+
365 hari
=
385 hari

Sisa subscription tidak boleh hilang.

Initial:
- Manual renewal

Future:
- Auto renewal

---

# 20. PAYMENT

Pembayaran dilakukan dari Vendor Dashboard.

Flow:

Vendor Dashboard
→ Subscription
→ Choose Plan
→ Checkout
→ Payment Provider / Payment Link

Untuk MVP, gunakan payment-link provider seperti LinkIn jika tersedia API/webhook yang sesuai.

Payment tidak boleh langsung mengaktifkan subscription hanya berdasarkan frontend redirect.

Correct flow:

Vendor
→ Payment Link
→ Payment Provider
→ Payment Confirmed
→ Webhook
→ Mingle Backend
→ Verify Order
→ Subscription ACTIVE
→ License ACTIVE

Setiap order memiliki Order ID unik.

Contoh:

MB-2026-000001
MB-2026-000002

---

# 21. ADMIN / OWNER BACKEND

MINGLEBOOTH wajib memiliki Admin / Owner Backend terpisah dari Vendor Dashboard.

Structure:

MINGLEBOOTH
├── ADMIN / OWNER BACKEND
└── VENDOR DASHBOARD

Admin memiliki FULL ACCESS.

Admin dapat mengatur:

- Vendors
- Users
- Organizations
- Plans
- Subscriptions
- Licenses
- Devices
- Events
- Templates
- Gallery
- Payments
- Analytics
- Storage
- System settings
- Test mode
- Error logs
- Suspend vendor
- Reactivate vendor
- Extend subscription
- Reset device
- Cleanup
- Revenue

Admin dapat mengontrol seluruh sistem.

---

# 22. ROLE SYSTEM

Role:

SUPER_ADMIN
ADMIN
VENDOR_OWNER
VENDOR_STAFF

Initial owner:

SUPER_ADMIN

Authorization harus dilakukan di backend.

Jangan hanya menyembunyikan menu Admin di frontend.

---

# 23. ADMIN / TEST ACCOUNT

Sediakan tepat 1 akun Admin/Test Account untuk development.

Admin memiliki full access untuk testing:

- Semua plans
- Semua fitur
- Camera
- Capture
- GIF
- Template
- QR
- Offline
- Sync
- Gallery
- Cleanup
- License
- Subscription
- Device management

Admin account tidak boleh menjadi bypass yang dapat digunakan vendor.

Admin credentials:
- Jangan hardcode
- Jangan commit ke Git
- Gunakan environment/secrets

Example:

ADMIN_EMAIL
ADMIN_PASSWORD

---

# 24. DEVELOPMENT MODE

Jangan langsung memaksa payment saat development.

Configuration:

SUBSCRIPTION_ENABLED=false

Saat false:
- Payment tidak wajib
- Subscription enforcement OFF
- Admin full access
- Test user dapat menguji core features
- License test mode

Production:

SUBSCRIPTION_ENABLED=true

Baru aktif:
- Starter
- Pro
- Business
- Payment
- License enforcement

---

# 25. ENVIRONMENTS

Support:

development
staging
production

Development:
- Subscription OFF
- Payment TEST
- License TEST
- Cloud ON
- Cleanup TEST

Staging:
- Subscription TEST
- Payment SANDBOX
- License TEST
- Cloud ON
- Cleanup TEST

Production:
- Subscription ON
- Payment LIVE
- License LIVE
- Cloud ON
- Cleanup LIVE

---

# 26. ADMIN TESTING DASHBOARD

Admin harus dapat melihat:

SYSTEM TESTING

Environment
Development

Subscription
OFF

Payment
TEST MODE

License
TEST MODE

Cloud
CONNECTED

Storage
CONNECTED

Camera
CONNECTED

Sync Queue
12

Gallery Cleanup
READY

Test actions:

TEST CAMERA
TEST CAPTURE
TEST TEMPLATE
TEST GIF
TEST QR
TEST OFFLINE
TEST SYNC
TEST LICENSE
TEST SUBSCRIPTION
TEST GALLERY EXPIRATION
TEST CLEANUP

---

# 27. DATABASE

Minimum tables:

users
organizations
plans
subscriptions
licenses
devices
events
event_templates
photos
gifs
gallery_assets
sync_queue
payments

Vendor data must be isolated.

Vendor A tidak boleh mengakses Vendor B.

---

# 28. SYNC ENGINE

Support:
- Queue
- Retry
- Resume
- Duplicate prevention
- Upload progress
- Failed state
- Manual retry
- Automatic retry
- Network detection

States:

LOCAL
→ PENDING
→ UPLOADING
→ SYNCED

Failure:

UPLOADING
→ FAILED
→ RETRY

---

# 29. SECURITY

Requirements:
- Never expose Supabase service role key in client
- Never commit secrets
- Use environment variables
- Server-side authorization
- Signed URLs
- Webhook validation
- Payment verification server-side
- Rate limiting
- Audit logs
- Secure license tokens
- Device authorization
- Tenant isolation
- Secure admin role

---

# 30. RECOMMENDED TECH STACK

Desktop:
- Electron
- Node.js
- TypeScript
- SQLite
- Local filesystem

Web:
- Next.js
- TypeScript
- Tailwind CSS

Cloud:
- Supabase
- PostgreSQL
- Supabase Storage

Version control:
- Git

---

# 31. PROJECT STRUCTURE

Recommended:

MingleBooth/
├── apps/
│   ├── desktop/
│   ├── tablet/
│   └── web/
│
├── packages/
│   ├── camera/
│   ├── photo-engine/
│   ├── template-engine/
│   ├── gif-engine/
│   ├── sync-engine/
│   ├── license/
│   ├── event-core/
│   └── shared/
│
├── supabase/
├── docs/
├── catatan.md
├── .env.example
├── README.md
└── package.json

---

# 32. EVENT MANAGEMENT

Vendor dapat membuat:

- Event name
- Event date
- Template
- Output
- Gallery
- Branding

Example:

Wedding Bayu & Irma
29 August 2026
Photo
GIF
QR

---

# 33. EVENT PACKAGE

Vendor dapat menyiapkan event untuk offline operation.

Event package berisi:
- Event configuration
- Templates
- Branding
- Output configuration
- License data
- Gallery configuration

Flow:

Create Event
→ Prepare Event Offline
→ Download Event Package
→ Venue
→ Run Offline

---

# 34. MULTI-DEVICE

Vendor dapat memiliki beberapa device sesuai subscription.

Example:

ABC Photobooth

MacBook
iPad
Windows Laptop

Setiap device memiliki unique identity.

Event configuration dapat disinkronkan ke authorized devices.

Local event package tetap tersedia offline.

---

# 35. RESPONSIVE UI

Web UI harus responsive.

Target:
- Desktop
- Laptop
- iPad
- Tablet
- iPhone
- Android

Desktop:
- Camera preview
- Keyboard
- Mouse
- Hardware status

Tablet:
- Touch
- Large buttons
- Simple workflow
- Full-screen preview

Mobile:
- Gallery
- Download
- Share
- Fast loading

---

# 36. HARDWARE CAPABILITY DETECTION

Jangan mengasumsikan semua device memiliki hardware yang sama.

Device
→ Detect capabilities
→ Enable supported features

Example:

Sony FX3 connected
→ Professional Camera Mode

iPad camera
→ Tablet Camera Mode

No camera
→ Dashboard / Gallery Mode

---

# 37. MVP ROADMAP

## Phase 1 — Core Desktop

1. Electron
2. Desktop app
3. Camera connection
4. Camera status
5. Live preview
6. Capture
7. Countdown
8. PNG template
9. Final photo
10. Local storage
11. Offline mode
12. Event management

## Phase 2 — Cloud

13. Login
14. Supabase
15. Vendor dashboard
16. Event sync
17. Cloud storage
18. QR gallery
19. 30-day expiration
20. Automatic cleanup
21. Sync queue

## Phase 3 — Monetization

22. Plans
23. Subscription
24. Payment link
25. License server
26. Device activation
27. Device management
28. Renewal

## Phase 4 — Advanced

29. GIF
30. Printing
31. Team management
32. Analytics
33. White-label
34. API
35. iPad/tablet optimization
36. Additional camera integrations

---

# 38. ANTIGRAVITY RULES

Antigravity must:

1. Read catatan.md before major implementation.
2. Do not build everything at once.
3. Build phase by phase.
4. Use TypeScript.
5. Use modular architecture.
6. Separate camera layer.
7. Separate photo engine.
8. Separate template engine.
9. Separate GIF engine.
10. Separate sync engine.
11. Separate license system.
12. Separate cloud API.
13. Keep local operation functional offline.
14. Never hardcode secrets.
15. Never require payment during development.
16. Create Admin/Test Account first.
17. Use development mode first.
18. Support desktop/laptop architecture.
19. Keep iPad/tablet support in architecture.
20. Use capability detection.
21. Test camera failure.
22. Test internet failure.
23. Test sync interruption.
24. Test duplicate upload.
25. Test subscription expiration.
26. Test gallery cleanup.
27. Test license expiration.
28. Keep local photos safe.
29. Never delete local photos because cloud cleanup runs.
30. Do not implement production payment before the core photobooth flow is stable.

---

# 39. PRE-LAUNCH CHECKLIST

[ ] Admin login works
[ ] Vendor registration works
[ ] Camera connection works
[ ] Camera reconnect works
[ ] Capture works
[ ] Countdown works
[ ] PNG template works
[ ] Photo processing works
[ ] GIF works
[ ] Local storage works
[ ] Offline mode works
[ ] Offline queue works
[ ] Internet reconnect works
[ ] Sync works
[ ] Duplicate prevention works
[ ] Cloud gallery works
[ ] QR works
[ ] Mobile gallery works
[ ] Gallery expiration works
[ ] Cleanup works
[ ] License works
[ ] Device activation works
[ ] Subscription test works
[ ] Payment sandbox works
[ ] Admin remains unrestricted
[ ] Vendor subscription works
[ ] Expired subscription works
[ ] Local photos remain safe after expiration

---

# 40. FINAL PRODUCT VISION

MINGLEBOOTH adalah professional photobooth operating platform.

MINGLEBOOTH STUDIO
+
MINGLEBOOTH CLOUD
+
MINGLEBOOTH GALLERY
+
ANNUAL LICENSE
+
OFFLINE-FIRST

Final flow:

Vendor
→ Create Account
→ Choose Plan
→ Payment
→ Subscription Active
→ License Active
→ Download Studio
→ Activate Device
→ Create Event
→ Prepare Event Offline
→ Venue
→ Connect Camera
→ Run Mingle/Roaming Booth
→ Capture
→ Process Locally
→ Sync When Online
→ Guest Scans QR
→ Download Photo/GIF
→ 30 Days
→ Automatic Cloud Deletion

CORE MVP GOAL:

Vendor dapat menghubungkan kamera, mengambil foto, menerapkan template, menyimpan hasil secara offline, dan melakukan sinkronisasi ke cloud ketika internet tersedia.

Payment dan subscription production hanya diaktifkan setelah core photobooth flow terbukti stabil.
