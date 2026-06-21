const test = require("node:test");
const assert = require("node:assert/strict");
const domain = require("./domain.js");

function months() {
  return Array.from({ length: domain.MONTH_COUNT }, (_, index) => ({
    label: `2026/${String(index + 1).padStart(2, "0")}`,
    card: index === 0 ? 700000 : 0,
    extraIncome: index === 1 ? 1000000 : 0,
    extraExpense: index === 1 ? 200000 : 0
  }));
}

test("parseAmount normalizes invalid, negative, and huge values", () => {
  assert.equal(domain.parseAmount(""), 0);
  assert.equal(domain.parseAmount("-1000"), 0);
  assert.equal(domain.parseAmount("abc"), 0);
  assert.equal(domain.parseAmount("1500"), 1500);
  assert.equal(domain.parseAmount("1,500"), 1500);
  assert.equal(domain.parseAmount("１，５００"), 1500);
  assert.equal(domain.parseAmount("9999999999"), domain.CASH_MAX);
  assert.equal(domain.parseAmount("9999999999", domain.MONTHLY_AMOUNT_MAX), domain.MONTHLY_AMOUNT_MAX);
});

test("calculates emergency fund months", () => {
  const monthsCovered = domain.calculateEmergencyMonths(900000, 430000);
  assert.equal(Number(monthsCovered.toFixed(1)), 2.1);
  assert.ok(Number.isNaN(domain.calculateEmergencyMonths(900000, 0)));
});

test("calculates 3 and 6 month targets", () => {
  const targets = domain.calculateTargets(900000, 430000);
  assert.deepEqual(targets, {
    target3: 1290000,
    target6: 2580000,
    gap3: 390000,
    gap6: 1680000
  });
});

test("calculates 12 month cash projection with card payment and bonus", () => {
  const projection = domain.calculateProjection({
    currentCash: 900000,
    monthlyIncome: 550000,
    monthlyExpense: 430000,
    months: months()
  });

  assert.equal(projection[0].balance, 320000);
  assert.equal(projection[1].balance, 1240000);
  assert.equal(projection[11].balance, 2440000);
});

test("calculates projection from only the three basic inputs", () => {
  const projection = domain.calculateProjection({
    currentCash: 900000,
    monthlyIncome: 550000,
    monthlyExpense: 430000
  });

  assert.equal(projection.length, domain.MONTH_COUNT);
  assert.equal(projection[0].label, "1ヶ月目");
  assert.equal(projection[0].balance, 1020000);
  assert.equal(projection[11].balance, 2340000);
});

test("keeps negative balances visible in projection results", () => {
  const projection = domain.calculateProjection({
    currentCash: 100000,
    monthlyIncome: 0,
    monthlyExpense: 300000
  });

  assert.equal(projection[0].balance, -200000);
  assert.equal(projection[11].balance, -3500000);
  assert.equal(domain.findLowestBalanceMonth(projection).balance, -3500000);
});

test("finds the lowest balance month", () => {
  const projection = domain.calculateProjection({
    currentCash: 900000,
    monthlyIncome: 550000,
    monthlyExpense: 430000,
    months: months()
  });
  const lowest = domain.findLowestBalanceMonth(projection);
  assert.equal(lowest.label, "2026/01");
  assert.equal(lowest.balance, 320000);
});
