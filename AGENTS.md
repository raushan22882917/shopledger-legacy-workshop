# ShopLedger contributor notes

## Stack

ShopLedger is a CommonJS Node.js / Express 4 application. It has a plain HTML, CSS, and browser-JavaScript UI, uses `body-parser` for JSON requests, and persists its application state in `data/db.json`. There is no database, frontend framework, build step, or lockfile. Characterization tests use Node's built-in test runner.

## Module map

- `server.js` serves `public/`, mounts the routers, and serves printable invoices.
- `routes/` holds the HTTP endpoints: `products.js`, `orders.js`, `customers.js`, and `reports.js`.
- `lib/` holds JSON storage plus inventory, order, pricing, coupon, GST, Khata, reporting, invoice, and date logic.
- `public/` holds the POS, order-history, Khata, and audit UI.
- `config.js` holds shop, tax, inventory, and coupon configuration; `data/db.json` is the runtime store.

## Commands

```sh
npm install --no-package-lock  # install declared dependencies without creating the absent lockfile
npm start    # run the Express server on http://localhost:3000 by default
npm test     # run the Node.js characterization tests
```

## Change rules

- Write a characterization test before changing existing behavior.
- Change only the module the ticket is about.
- Tests must never touch `data/db.json`; use in-memory fixtures instead.
- Add no dependencies, including test dependencies.
