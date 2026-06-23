const assert = require("node:assert/strict");
const test = require("node:test");
const b = require("./benchmark.js");

test("区分定義が健全（キー重複なし・ラベルあり）", () => {
  for (const buckets of [b.AGE_BUCKETS, b.HOUSEHOLD_BUCKETS, b.INCOME_BUCKETS, b.GENDER_BUCKETS, b.ASSET_BUCKETS]) {
    assert.ok(buckets.length >= 2);
    const keys = new Set(buckets.map((x) => x.key));
    assert.equal(keys.size, buckets.length, "キー重複あり");
    for (const x of buckets) assert.ok(typeof x.label === "string" && x.label.length > 0);
  }
  for (const x of b.ASSET_BUCKETS) assert.ok(Number.isFinite(x.mid) && x.mid > 0, "ASSET_BUCKETS.mid が不正");
});

test("isValidKey: 既知キーtrue・未知キーfalse（送信値の検証に使う）", () => {
  assert.equal(b.isValidKey(b.AGE_BUCKETS, "30"), true);
  assert.equal(b.isValidKey(b.AGE_BUCKETS, "99"), false);
  assert.equal(b.isValidKey(b.HOUSEHOLD_BUCKETS, "single"), true);
  assert.equal(b.isValidKey(b.HOUSEHOLD_BUCKETS, "__proto__"), false);
});

test("peerStats: 既知の年代×世帯の統計を返す / 未知はnull", () => {
  assert.deepEqual(b.peerStats("multi", "40"), { median: 250, mean: 944 });
  assert.equal(b.peerStats("multi", "99"), null);
  assert.equal(b.peerStats("unknown", "40"), null);
});

test("normalCdf: 既知点（0→0.5, 対称性）", () => {
  assert.ok(Math.abs(b.normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(b.normalCdf(1.2816) - 0.9) < 2e-3); // 90パーセンタイル点
  assert.ok(Math.abs((b.normalCdf(1) + b.normalCdf(-1)) - 1) < 1e-6); // 対称
});

test("estimatePercentile: value==median は約50、単調増加", () => {
  const median = 200, mean = 600;
  const atMedian = b.estimatePercentile(median, median, mean);
  assert.ok(Math.abs(atMedian - 50) < 1.0, `median点が約50でない: ${atMedian}`);
  const low = b.estimatePercentile(50, median, mean);
  const high = b.estimatePercentile(1000, median, mean);
  assert.ok(low < atMedian && atMedian < high, "単調増加でない");
  assert.ok(low >= 0.1 && high <= 99.9, "0.1〜99.9にクランプされる");
});

test("estimatePercentile: 不正入力はnull、0以下は0", () => {
  assert.equal(b.estimatePercentile(100, 0, 500), null); // median<=0
  assert.equal(b.estimatePercentile(100, 200, 200), null); // mean<=median
  assert.equal(b.estimatePercentile(NaN, 200, 600), null);
  assert.equal(b.estimatePercentile(0, 200, 600), 0);
  assert.equal(b.estimatePercentile(-50, 200, 600), 0);
});

test("compareToPeers: 中央値以上はabove、未満はbelow", () => {
  const r = b.compareToPeers({ assetMan: 400, household: "multi", ageKey: "40" });
  assert.equal(r.median, 250);
  assert.equal(r.position, "above");
  assert.ok(r.percentile > 50);
  assert.ok(Math.abs(r.ratioToMedian - 400 / 250) < 1e-9);

  const r2 = b.compareToPeers({ assetMan: 100, household: "multi", ageKey: "40" });
  assert.equal(r2.position, "below");
  assert.ok(r2.percentile < 50);

  assert.equal(b.compareToPeers({ assetMan: 400, household: "x", ageKey: "40" }), null);
  assert.equal(b.compareToPeers({ assetMan: NaN, household: "multi", ageKey: "40" }), null);
});
