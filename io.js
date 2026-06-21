// ふところ 入出力（手元ファイルへの書き出し／読み込み）
//
// v1境界を守る: 保存も送信もしない。ユーザーが「自分の端末のファイル」へ
// 書き出し、必要なときに読み込んで復元するだけ（履歴は手元ファイルで管理）。
// 外部通信なし・localStorageなし。CSP `script-src 'self'` のため外部JSとして読み込む。
//
// 本ファイルはDOMに依存しない純関数だけを公開する（io.test.js でテスト可能）。
// 実際のファイルDL/読込・フォームへの反映は app.js が本モジュールを使って行う。
(function (root, factory) {
  const api = factory(root.LifeDefenseDomain);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LifeDefenseIO = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (domain) {
  // Nodeテストでは require、ブラウザでは window.LifeDefenseDomain を使う
  const D = domain || (typeof require === "function" ? require("./domain.js") : null);
  if (!D) throw new Error("LifeDefenseDomain が読み込まれていません");

  const { MONTH_COUNT, CASH_MAX, MONTHLY_AMOUNT_MAX, parseAmount } = D;

  const APP_ID = "futokoro";
  const SCHEMA_VERSION = 1;
  // 読み込みファイルのサイズ上限（悪意ある巨大ファイル対策）。JSONとしては十分大きい。
  const MAX_IMPORT_BYTES = 256 * 1024;

  // フォームの生入力（app.readInput が返す形）を、保存用の素直なオブジェクトへ。
  // label は復元時に monthLabel() で必ず再生成するので保存しない（外部値を信用しない）。
  function toExportObject(input, exportedAt) {
    const months = Array.from({ length: MONTH_COUNT }, (_, i) => {
      const m = (input && Array.isArray(input.months) && input.months[i]) || {};
      return {
        card: parseAmount(m.card, MONTHLY_AMOUNT_MAX),
        extraIncome: parseAmount(m.extraIncome, MONTHLY_AMOUNT_MAX),
        extraExpense: parseAmount(m.extraExpense, MONTHLY_AMOUNT_MAX)
      };
    });
    return {
      app: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: typeof exportedAt === "string" ? exportedAt : null,
      input: {
        currentCash: parseAmount(input && input.currentCash, CASH_MAX),
        monthlyIncome: parseAmount(input && input.monthlyIncome, MONTHLY_AMOUNT_MAX),
        monthlyExpense: parseAmount(input && input.monthlyExpense, MONTHLY_AMOUNT_MAX),
        months
      }
    };
  }

  function toJson(input, exportedAt) {
    return JSON.stringify(toExportObject(input, exportedAt), null, 2);
  }

  // 読み込んだ任意オブジェクトを、安全な input へ正規化する。
  // - app/schemaVersion を検証（未知は拒否）
  // - 全金額を parseAmount で無害化（非数値・負・上限超を吸収）
  // - months は長さ MONTH_COUNT にクランプ（不足は0埋め・超過は切り捨て）
  // - label は持ち込ませない（呼び出し側が monthLabel で再生成）
  function sanitizeImport(parsed) {
    if (!parsed || typeof parsed !== "object") {
      throw new Error("ファイルの中身を読み取れませんでした。");
    }
    if (parsed.app !== APP_ID) {
      throw new Error("このアプリ（ふところ）の保存ファイルではありません。");
    }
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      throw new Error("対応していない保存形式です（バージョン違い）。");
    }
    const src = parsed.input && typeof parsed.input === "object" ? parsed.input : {};
    const srcMonths = Array.isArray(src.months) ? src.months : [];
    const months = Array.from({ length: MONTH_COUNT }, (_, i) => {
      const m = srcMonths[i] && typeof srcMonths[i] === "object" ? srcMonths[i] : {};
      return {
        card: parseAmount(m.card, MONTHLY_AMOUNT_MAX),
        extraIncome: parseAmount(m.extraIncome, MONTHLY_AMOUNT_MAX),
        extraExpense: parseAmount(m.extraExpense, MONTHLY_AMOUNT_MAX)
      };
    });
    return {
      currentCash: parseAmount(src.currentCash, CASH_MAX),
      monthlyIncome: parseAmount(src.monthlyIncome, MONTHLY_AMOUNT_MAX),
      monthlyExpense: parseAmount(src.monthlyExpense, MONTHLY_AMOUNT_MAX),
      months
    };
  }

  // 文字列（ファイル本文）→ 安全な input。JSON.parse 失敗や構造不一致は分かりやすい例外に。
  function parseImportText(text) {
    if (typeof text !== "string") {
      throw new Error("ファイルの中身を読み取れませんでした。");
    }
    if (text.length > MAX_IMPORT_BYTES) {
      throw new Error("ファイルが大きすぎます。ふところで書き出したファイルを選んでください。");
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_e) {
      throw new Error("JSONとして読み取れませんでした。ふところで書き出したファイルを選んでください。");
    }
    return sanitizeImport(parsed);
  }

  // ===== CSV（自前フォーマット・WS-4） =====
  // 表計算アプリで開ける素直な縦持ちCSV。1行=1項目。
  // 列: key,label,value（valueは数値のみ。表示用ラベルは参考情報で、読込時は使わない）

  // CSVインジェクション対策: = + - @ で始まるセルはクォート＋先頭にアポストロフィを付けて無害化
  function csvEscape(value) {
    let s = String(value == null ? "" : value);
    const dangerous = /^[=+\-@\t\r]/.test(s);
    if (dangerous) s = "'" + s;
    if (/[",\n\r]/.test(s) || dangerous) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function toCsv(input, monthLabels) {
    const obj = toExportObject(input).input;
    const rows = [["key", "label", "value"]];
    rows.push(["currentCash", "いまの現金", obj.currentCash]);
    rows.push(["monthlyIncome", "毎月の手取り", obj.monthlyIncome]);
    rows.push(["monthlyExpense", "毎月の生活費", obj.monthlyExpense]);
    obj.months.forEach((m, i) => {
      const label = (Array.isArray(monthLabels) && monthLabels[i]) || `${i + 1}ヶ月目`;
      rows.push([`month.${i}.extraExpense`, `${label} 大きな出費`, m.extraExpense]);
      rows.push([`month.${i}.extraIncome`, `${label} 臨時収入`, m.extraIncome]);
    });
    // BOM付きでExcelの文字化けを防ぐ
    return "﻿" + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
  }

  // CSV1行をセル配列へ（ダブルクォート・エスケープ対応の最小パーサ）
  function parseCsvLine(line) {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i += 1; }
          else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  }

  function parseCsv(text) {
    if (typeof text !== "string") {
      throw new Error("ファイルの中身を読み取れませんでした。");
    }
    if (text.length > MAX_IMPORT_BYTES) {
      throw new Error("ファイルが大きすぎます。ふところで書き出したCSVを選んでください。");
    }
    const clean = text.replace(/^﻿/, "");
    const lines = clean.split(/\r\n|\n|\r/).filter((l) => l.length > 0);
    if (!lines.length) {
      throw new Error("CSVが空です。");
    }
    // 先頭のアポストロフィ無害化を取り除き、全角→半角はparseAmountが吸収
    const unquote = (s) => String(s == null ? "" : s).replace(/^'/, "");
    const map = {};
    lines.forEach((line, idx) => {
      const cells = parseCsvLine(line);
      const key = unquote(cells[0]).trim();
      if (idx === 0 && key === "key") return; // ヘッダー行
      if (!key) return;
      map[key] = cells[2] !== undefined ? cells[2] : cells[1];
    });
    const months = Array.from({ length: MONTH_COUNT }, (_, i) => ({
      card: 0,
      extraIncome: parseAmount(unquote(map[`month.${i}.extraIncome`]), MONTHLY_AMOUNT_MAX),
      extraExpense: parseAmount(unquote(map[`month.${i}.extraExpense`]), MONTHLY_AMOUNT_MAX)
    }));
    return {
      currentCash: parseAmount(unquote(map.currentCash), CASH_MAX),
      monthlyIncome: parseAmount(unquote(map.monthlyIncome), MONTHLY_AMOUNT_MAX),
      monthlyExpense: parseAmount(unquote(map.monthlyExpense), MONTHLY_AMOUNT_MAX),
      months
    };
  }

  return {
    APP_ID,
    SCHEMA_VERSION,
    MAX_IMPORT_BYTES,
    toExportObject,
    toJson,
    sanitizeImport,
    parseImportText,
    csvEscape,
    toCsv,
    parseCsv
  };
});
