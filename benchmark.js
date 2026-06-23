// 同年代ベンチマーク（送信なし・ブラウザ内計算）。
//
// 出典データ: 金融広報中央委員会 / 金融経済教育推進機構(J-FLEC)
//   「家計の金融行動に関する世論調査 2024年」（単身世帯調査・二人以上世帯調査）
//   年代別 金融資産保有額の中央値・平均値（万円, 金融資産非保有を含む）。
//   https://www.j-flec.go.jp/data/kakekin_2024/
//
// 比較の percentile は「公表の中央値と平均から対数正規分布を当てた推計値」。
//   生の分布が非公開のため、median=exp(μ)・mean=exp(μ+σ²/2) の2点から μ,σ を解いて
//   percentile = Φ((ln x − μ)/σ) を返す。あくまで目安であることを UI で明示する。
//
// このモジュールは一切ネットワーク送信しない。任意の匿名送信は別レイヤ（Stage 2）。

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.FutokoroBenchmark = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // 調査年（出典表記・UI明示用）
  const SOURCE_YEAR = 2024;
  const SOURCE_NAME = "金融広報中央委員会「家計の金融行動に関する世論調査2024年」";

  // 金融資産保有額（万円）。household: single=単身 / multi=二人以上、age: 年代区分。
  const ASSET_STATS = {
    single: {
      "20": { median: 15, mean: 161 },
      "30": { median: 90, mean: 459 },
      "40": { median: 85, mean: 883 },
      "50": { median: 30, mean: 1087 },
      "60": { median: 350, mean: 1679 },
      "70": { median: 475, mean: 1634 }
    },
    multi: {
      "20": { median: 84, mean: 382 },
      "30": { median: 180, mean: 677 },
      "40": { median: 250, mean: 944 },
      "50": { median: 250, mean: 1168 },
      "60": { median: 650, mean: 2033 },
      "70": { median: 800, mean: 1923 }
    }
  };

  // UI 表示＆（Stage 2 で）匿名送信する区分。値は区分キーのみ＝生の数値は送らない。
  const AGE_BUCKETS = [
    { key: "20", label: "20代" },
    { key: "30", label: "30代" },
    { key: "40", label: "40代" },
    { key: "50", label: "50代" },
    { key: "60", label: "60代" },
    { key: "70", label: "70代以上" }
  ];
  const HOUSEHOLD_BUCKETS = [
    { key: "single", label: "単身" },
    { key: "multi", label: "二人以上" }
  ];
  const INCOME_BUCKETS = [
    { key: "u300", label: "300万未満" },
    { key: "300_500", label: "300〜500万" },
    { key: "500_700", label: "500〜700万" },
    { key: "700_1000", label: "700〜1000万" },
    { key: "o1000", label: "1000万以上" }
  ];
  const GENDER_BUCKETS = [
    { key: "male", label: "男性" },
    { key: "female", label: "女性" },
    { key: "na", label: "回答しない" }
  ];
  // 金融資産（預貯金＋保険＋有価証券など）の区分。mid=区分の代表値（万円・percentile推計用）。
  const ASSET_BUCKETS = [
    { key: "u100", label: "100万未満", mid: 50 },
    { key: "100_300", label: "100〜300万", mid: 200 },
    { key: "300_500", label: "300〜500万", mid: 400 },
    { key: "500_1000", label: "500〜1000万", mid: 750 },
    { key: "1000_2000", label: "1000〜2000万", mid: 1500 },
    { key: "o2000", label: "2000万以上", mid: 3000 }
  ];

  function isValidKey(buckets, key) {
    return buckets.some((b) => b.key === key);
  }

  // 標準正規分布の累積分布関数（Abramowitz & Stegun 7.1.26 の erf 近似・誤差<1.5e-7）。
  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
    return sign * y;
  }
  function normalCdf(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }

  // 中央値・平均（万円）から対数正規分布を当て、value(万円) の percentile（0〜100）を推計。
  // 分布を当てられない（median<=0 や mean<=median 等）場合は null。
  function estimatePercentile(value, median, mean) {
    if (!Number.isFinite(value)) return null;
    if (!(median > 0) || !(mean > median)) return null;
    if (value <= 0) return 0;
    const mu = Math.log(median);
    const sigma = Math.sqrt(2 * Math.log(mean / median));
    if (!(sigma > 0)) return null;
    const z = (Math.log(value) - mu) / sigma;
    const p = normalCdf(z) * 100;
    return Math.min(99.9, Math.max(0.1, Math.round(p * 10) / 10));
  }

  // household, age 区分の同条件統計（万円）。なければ null。
  function peerStats(household, ageKey) {
    const byAge = ASSET_STATS[household];
    if (!byAge) return null;
    return byAge[ageKey] || null;
  }

  // 同年代・同世帯と比較した結果（送信なし・ローカル計算）。
  //   assetMan: ユーザーの金融資産（万円）。ageKey/household: 区分キー。
  // 返り値: { median, mean, percentile, position, ratioToMedian } または null。
  function compareToPeers({ assetMan, household, ageKey }) {
    const stats = peerStats(household, ageKey);
    if (!stats) return null;
    if (!Number.isFinite(assetMan)) return null;
    const percentile = estimatePercentile(assetMan, stats.median, stats.mean);
    return {
      median: stats.median,
      mean: stats.mean,
      percentile,
      position: assetMan >= stats.median ? "above" : "below",
      ratioToMedian: stats.median > 0 ? assetMan / stats.median : null
    };
  }

  return {
    SOURCE_YEAR,
    SOURCE_NAME,
    ASSET_STATS,
    AGE_BUCKETS,
    HOUSEHOLD_BUCKETS,
    INCOME_BUCKETS,
    GENDER_BUCKETS,
    ASSET_BUCKETS,
    isValidKey,
    normalCdf,
    estimatePercentile,
    peerStats,
    compareToPeers
  };
});
