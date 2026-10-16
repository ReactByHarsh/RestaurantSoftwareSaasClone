# BhojPatra 1.3.1 — owner LAN loading fix

Install the ARM64 APK over the existing BhojPatra app; do not uninstall or clear app storage, which would remove phone drafts. The package and release signing key are unchanged. Build number is 5 (split ARM64 Android version code 2005). Keep the existing Desk 0.1.29 open; no counter reinstall is required for these phone fixes.

## Changes

- Fetch and display authenticated LAN data without waiting for the phone's offline cache. Cache failures are reported separately in Account.
- Keep live data when a late empty cache read or an older refresh response arrives.
- Apply full live updates while a refresh or order request is in progress. Reject older timestamped updates and updates for a different restaurant.
- Missing/incomplete LAN data reports an error, not a successful all-zero restaurant.
- Account shows connection address, last refresh, loaded record counts and cache/network errors. LIVE means realtime; POLLING means HTTP fallback refresh is active.

## Check on the phone

1. Open Desk on the counter. Join the same trusted Wi-Fi and use Restaurant/LAN login with the local owner/admin account, not Owner remote.
2. Open Account. Confirm the restaurant and counter IP are correct and the loaded table/order/menu counts match Desk. Tap Reconnect if necessary.
3. Home shows today's settled sales, collections and live table/KOT counts. Reports default to Today: select 7 days, Month or Custom to view historical activity. A date with no paid bills legitimately shows zero sales, but existing tables/menu still load.
4. Make a normal test change on Desk. Verify the phone's Home, Reports and Tables reflect it without logging out; if realtime is blocked, allow up to 10 seconds for polling. Keep the selected Reports date range while switching tabs.

## Verification

27 mobile tests passed; analysis has no issues. Two additional read-only checks logged into the running Desk through its actual LAN address, loaded 74 orders, 18 tables, 645 menu items and 7 paid bills for 2026-10-07, checked nonzero historical sales/collections/products, and opened the authenticated realtime channel. The complete retrieved payload was then rendered through MobileHome with a deliberately failing phone cache: Home, all eight Reports, the 7-day range, Tables and Account passed. No customer payload fixture was saved to the repository. The optional order-writing integration test was not run against the customer database.

No Android device was connected for installation or UI testing. The actual reported phone failure was not captured in device logs; this build fixes confirmed loading/cache/realtime failure paths and needs on-device confirmation. No restaurant records were changed and no GitHub/R2 publication was performed.
