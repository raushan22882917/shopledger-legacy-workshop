var assert = require('node:assert/strict');
var test = require('node:test');

var config = require('../config');
var invoice = require('../lib/invoice');
var pricing = require('../lib/pricing');
var reports = require('../lib/reports');

function orderFrom(items, coupon) {
  var totals = pricing.computeTotals(items, coupon);

  return {
    id: 9001,
    date: '01/04/2022',
    customer: 'Characterization Customer',
    paymentMode: 'cash',
    status: 'completed',
    items: items,
    coupon: coupon,
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('invoice matches the billed GST breakdown and total for an HSN-priced order', function () {
  var order = orderFrom([{
    id: 1,
    sku: 'RICE-001',
    name: 'Rice',
    hsn: '1006',
    price: 100,
    qty: 1
  }], '');
  var figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    {
      discount: figures.discount,
      tax: figures.tax,
      cgst: figures.cgst,
      sgst: figures.sgst,
      total: figures.total
    },
    {
      discount: order.discount,
      tax: order.tax,
      cgst: 2.5,
      sgst: 2.5,
      total: order.total
    }
  );
});

test('invoice uses an order line HSN when gstRate is absent', function () {
  var items = [{
    id: 1,
    sku: 'RICE-001',
    name: 'Rice',
    hsn: '1006',
    price: 100,
    qty: 1
  }];
  var order = orderFrom(items, '');
  var figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    {
      tax: order.tax,
      cgst: pricing.computeTotals(items, '').cgst,
      sgst: pricing.computeTotals(items, '').sgst,
      total: order.total
    },
    { tax: 5, cgst: 2.5, sgst: 2.5, total: 105 }
  );

  assert.deepEqual(
    {
      gstPercent: figures.rows[0].gstPercent,
      tax: figures.tax,
      cgst: figures.cgst,
      sgst: figures.sgst,
      total: figures.total
    },
    { gstPercent: 5, tax: 5, cgst: 2.5, sgst: 2.5, total: 105 }
  );
});

test('invoice applies SAVE10 before tax and honors its discount cap', function () {
  var items = [{
    id: 1,
    sku: 'RICE-001',
    name: 'Rice',
    hsn: '1006',
    price: 2000,
    qty: 1
  }];
  var order = orderFrom(items, 'SAVE10');
  var figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    {
      discount: order.discount,
      tax: order.tax,
      cgst: pricing.computeTotals(items, 'SAVE10').cgst,
      sgst: pricing.computeTotals(items, 'SAVE10').sgst,
      total: order.total
    },
    { discount: 150, tax: 92.5, cgst: 46.25, sgst: 46.25, total: 1942.5 }
  );

  assert.deepEqual(
    {
      discount: figures.discount,
      tax: figures.tax,
      cgst: figures.cgst,
      sgst: figures.sgst,
      total: figures.total
    },
    { discount: 150, tax: 92.5, cgst: 46.25, sgst: 46.25, total: 1942.5 }
  );
});

test('invoice preserves billed totals when a coupon is later disabled', function () {
  var order = orderFrom([{
    id: 1,
    sku: 'RICE-001',
    name: 'Rice',
    hsn: '1006',
    price: 2000,
    qty: 1
  }], 'SAVE10');
  var wasActive = config.coupons.SAVE10.active;

  config.coupons.SAVE10.active = false;
  try {
    var figures = invoice.computeInvoiceFigures(order);
    assert.deepEqual(
      {
        discount: figures.discount,
        tax: figures.tax,
        total: figures.total
      },
      {
        discount: order.discount,
        tax: order.tax,
        total: order.total
      }
    );
  } finally {
    config.coupons.SAVE10.active = wasActive;
  }
});

test('invoice exposes the discount and taxable value for a couponed line', function () {
  var order = orderFrom([{
    id: 1,
    sku: 'RICE-001',
    name: 'Rice',
    hsn: '1006',
    price: 1000,
    qty: 1
  }], 'SAVE10');
  var figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    {
      gross: figures.rows[0].line,
      discount: figures.rows[0].discount,
      taxable: figures.rows[0].taxable,
      gstPercent: figures.rows[0].gstPercent,
      tax: figures.rows[0].lineTax
    },
    { gross: 1000, discount: 100, taxable: 900, gstPercent: 5, tax: 45 }
  );
});

test('invoice line GST matches its displayed taxable value after coupon rounding', function () {
  var order = orderFrom([
    { id: 1, sku: 'RICE-001', name: 'Rice', hsn: '1006', price: 640, qty: 1 },
    { id: 2, sku: 'DAL-001', name: 'Dal', hsn: '0713', price: 165, qty: 7 },
    { id: 3, sku: 'POHA-001', name: 'Poha', hsn: '1104', price: 48, qty: 1 }
  ], 'FLAT50');
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.rows[1].taxable, 1123.67);
  assert.equal(figures.rows[1].lineTax, 56.18);
  assert.equal(figures.taxRoundingAdjustment, 0.01);
  assert.equal(
    figures.rows.reduce(function (total, row) { return total + row.lineTax; }, 0) + figures.taxRoundingAdjustment,
    figures.tax
  );
});

test('invoice balances the final couponed line before calculating its GST', function () {
  var order = orderFrom([
    { id: 1, sku: 'POHA-001', name: 'Poha', hsn: '1006', price: 48, qty: 1 },
    { id: 2, sku: 'DAL-001', name: 'Dal', hsn: '0713', price: 165, qty: 1 },
    { id: 3, sku: 'TEA-001', name: 'Tea', hsn: '0902', price: 140, qty: 37 }
  ], 'FLAT50');
  var figures = invoice.computeInvoiceFigures(order);
  var last = figures.rows[2];

  assert.deepEqual(
    {
      gross: last.line,
      discount: last.discount,
      taxable: last.taxable,
      tax: last.lineTax
    },
    { gross: 5180, discount: 48.02, taxable: 5131.98, tax: 923.76 }
  );
});

test('reconciliation reports a matching invoice and billed total', function () {
  var order = orderFrom([{
    id: 1,
    sku: 'RICE-001',
    name: 'Rice',
    hsn: '1006',
    price: 100,
    qty: 1
  }], '');
  var reconciliation = reports.getGstReconciliation({ orders: [order] });

  assert.equal(reconciliation.totalChecked, 1);
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(reconciliation.totalDelta, 0);
  assert.deepEqual(reconciliation.rows[0], {
    orderId: 9001,
    date: '01/04/2022',
    customer: 'Characterization Customer',
    coupon: '',
    ledgerSubtotal: 100,
    ledgerDiscount: 0,
    ledgerTax: 5,
    ledgerTotal: 105,
    invoiceDiscount: 0,
    invoiceTax: 5,
    invoiceTotal: 105,
    delta: 0,
    matched: true
  });
});
