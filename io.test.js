const assert = require("node:assert/strict");
const test = require("node:test");
const io = require("./io.js");
const domain = require("./domain.js");

const { MONTH_COUNT, CASH_MAX, MONTHLY_AMOUNT_MAX } = domain;

function sampleInput() {
  return {
    currentCash: 1200000,
    monthlyIncome: 380000,
    monthlyExpense: 280000,
    months: Array.from({ length: MONTH_COUNT }, (_, i) => ({
      card: 0,
      extraIncome: i === 5 ? 200000 : 0,
      extraExpense: i === 0 ? 80000 : 0
    }))
  };
}

test("toExportObject: 正常入力を保存用に正規化する", () => {
  const obj = io.toExportObject(sampleInput(), "2026-06-15T00:00:00.000Z");
  assert.equal(obj.app, "futokoro");
  assert.equal(obj.schemaVersion, 1);
  assert.equal(obj.exportedAt, "2026-06-15T00:00:00.000Z");
  assert.equal(obj.input.currentCash, 1200000);
  assert.equal(obj.input.months.length, MONTH_COUNT);
  assert.equal(obj.input.months[0].extraExpense, 80000);
  assert.equal(obj.input.months[5].extraIncome, 200000);
  // label は保存しない（外部値を信用しない方針）
  assert.equal("label" in obj.input.months[0], false);
});

test("toExportObject: exportedAt が文字列でなければ null", () => {
  const obj = io.toExportObject(sampleInput());
  assert.equal(obj.exportedAt, null);
});

test("sanitizeImport: 正常オブジェクトを input へ", () => {
  const obj = io.toExportObject(sampleInput());
  const input = io.sanitizeImport(obj);
  assert.equal(input.currentCash, 1200000);
  assert.equal(input.monthlyIncome, 380000);
  assert.equal(input.monthlyExpense, 280000);
  assert.equal(input.months.length, MONTH_COUNT);
  assert.equal(input.months[0].extraExpense, 80000);
});

test("sanitizeImport: app 不一致は拒否", () => {
  assert.throws(() => io.sanitizeImport({ app: "other", schemaVersion: 1, input: {} }), /ふところ/);
});

test("sanitizeImport: schemaVersion 不一致は拒否", () => {
  assert.throws(() => io.sanitizeImport({ app: "futokoro", schemaVersion: 99, input: {} }), /形式/);
});

test("sanitizeImport: 非オブジェクトは拒否", () => {
  assert.throws(() => io.sanitizeImport(null), /読み取れません/);
  assert.throws(() => io.sanitizeImport("x"), /読み取れません/);
});

test("sanitizeImport: 負・巨大・非数値の金額をクランプ/無害化", () => {
  const input = io.sanitizeImport({
    app: "futokoro",
    schemaVersion: 1,
    input: {
      currentCash: -500,            // 負 → 0
      monthlyIncome: 9e12,          // 上限超 → MONTHLY_AMOUNT_MAX
      monthlyExpense: "abc",        // 非数値 → 0
      months: [{ extraExpense: "0x10", extraIncome: "1e9" }]
    }
  });
  assert.equal(input.currentCash, 0);
  assert.equal(input.monthlyIncome, MONTHLY_AMOUNT_MAX);
  assert.equal(input.monthlyExpense, 0);
  // "0x10" は Number() が 16 と解釈する（LFS-B047）。importでは有限値にクランプされ無害だが、
  // 数値として受理される点を仕様として固定（範囲内のためそのまま）。
  assert.equal(input.months[0].extraExpense, 16);
  // "1e9" は指数表記で 1e9 だが MONTHLY_AMOUNT_MAX(1e8) でクランプ
  assert.equal(input.months[0].extraIncome, MONTHLY_AMOUNT_MAX);
  // いずれも有限の数値（NaN/Infinityは混入しない）
  assert.equal(Number.isFinite(input.months[0].extraExpense), true);
  assert.equal(Number.isFinite(input.monthlyIncome), true);
});

test("sanitizeImport: months が12未満は0埋め・超過は切り捨て・非配列は全0", () => {
  const few = io.sanitizeImport({ app: "futokoro", schemaVersion: 1, input: { months: [{ extraExpense: 100 }] } });
  assert.equal(few.months.length, MONTH_COUNT);
  assert.equal(few.months[0].extraExpense, 100);
  assert.equal(few.months[11].extraExpense, 0);

  const many = io.sanitizeImport({
    app: "futokoro", schemaVersion: 1,
    input: { months: Array.from({ length: 30 }, () => ({ extraExpense: 1 })) }
  });
  assert.equal(many.months.length, MONTH_COUNT);

  const notArray = io.sanitizeImport({ app: "futokoro", schemaVersion: 1, input: { months: "nope" } });
  assert.equal(notArray.months.length, MONTH_COUNT);
  assert.equal(notArray.months[0].extraExpense, 0);
});

test("parseImportText: 正常JSON文字列 → input", () => {
  const text = io.toJson(sampleInput());
  const input = io.parseImportText(text);
  assert.equal(input.currentCash, 1200000);
  assert.equal(input.months[5].extraIncome, 200000);
});

test("parseImportText: 不正JSONは拒否", () => {
  assert.throws(() => io.parseImportText("{not json"), /JSON/);
});

test("parseImportText: サイズ超過は拒否", () => {
  const huge = "x".repeat(io.MAX_IMPORT_BYTES + 1);
  assert.throws(() => io.parseImportText(huge), /大きすぎ/);
});

test("JSON往復: toJson → parseImportText で値が保たれる", () => {
  const original = sampleInput();
  const restored = io.parseImportText(io.toJson(original));
  assert.equal(restored.currentCash, original.currentCash);
  assert.equal(restored.monthlyIncome, original.monthlyIncome);
  assert.equal(restored.monthlyExpense, original.monthlyExpense);
  assert.deepEqual(restored.months, original.months);
});

test("csvEscape: 数式インジェクション（= + - @）を無害化", () => {
  assert.equal(io.csvEscape("=SUM(A1)"), "\"'=SUM(A1)\"");
  assert.equal(io.csvEscape("+1"), "\"'+1\"");
  assert.equal(io.csvEscape("-1"), "\"'-1\"");
  assert.equal(io.csvEscape("@x"), "\"'@x\"");
  // カンマ/改行/引用符を含む値はクォート
  assert.equal(io.csvEscape("a,b"), '"a,b"');
  assert.equal(io.csvEscape('a"b'), '"a""b"');
  // 普通の数値はそのまま
  assert.equal(io.csvEscape(1200000), "1200000");
});

test("CSV往復: toCsv → parseCsv で値が保たれる", () => {
  const labels = Array.from({ length: MONTH_COUNT }, (_, i) => `2026/${String(i + 1).padStart(2, "0")}`);
  const csv = io.toCsv(sampleInput(), labels);
  assert.match(csv, /^﻿/); // BOM付き
  const restored = io.parseCsv(csv);
  assert.equal(restored.currentCash, 1200000);
  assert.equal(restored.monthlyIncome, 380000);
  assert.equal(restored.monthlyExpense, 280000);
  assert.equal(restored.months[0].extraExpense, 80000);
  assert.equal(restored.months[5].extraIncome, 200000);
});

test("parseCsv: BOM・ヘッダー・全角数字を吸収", () => {
  const csv = "﻿key,label,value\r\ncurrentCash,いまの現金,１２００\r\nmonthlyExpense,生活費,\"1,000\"\r\n";
  const input = io.parseCsv(csv);
  assert.equal(input.currentCash, 1200);  // 全角→半角
  assert.equal(input.monthlyExpense, 1000); // カンマ除去
});

test("parseCsv: 空CSVは拒否", () => {
  assert.throws(() => io.parseCsv("﻿"), /空/);
});
