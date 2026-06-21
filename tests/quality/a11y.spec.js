// アクセシビリティゲート — axe-core(自動) + form/name + keyboard + ARIA snapshot。
// A11Y_GATE.md の合格条件を検証。axe は必要条件であり、keyboard と ARIA snapshot で補完する。
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { openApp, fillBasics, settleMotion, APP_URL } = require("./helpers/app");

// A11Y_GATE.md に ID 付きで明記した既知の許容のみここで除外する（無条件除外はしない）
const DISABLED_AXE_RULES = [];

test.describe("ふところ アクセシビリティ", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test("axe: serious/critical 違反が無い（空状態）", async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(DISABLED_AXE_RULES)
      .analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      blocking,
      `axe serious/critical 違反:\n${blocking.map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}件)`).join("\n")}`
    ).toEqual([]);
  });

  test("axe: serious/critical 違反が無い（入力後）", async ({ page }) => {
    await fillBasics(page);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(DISABLED_AXE_RULES)
      .analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      blocking,
      `axe serious/critical 違反:\n${blocking.map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}件)`).join("\n")}`
    ).toEqual([]);
  });

  test("form: 全 input/select に label、全 button に accessible name がある", async ({ page }) => {
    const problems = await page.evaluate(() => {
      const out = [];
      const labelFor = (el) => {
        if (el.getAttribute("aria-label")) return true;
        if (el.getAttribute("aria-labelledby")) return true;
        if (el.id && document.querySelector(`label[for="${el.id}"]`)) return true;
        if (el.closest("label")) return true;
        return false;
      };
      document.querySelectorAll("input, select").forEach((el) => {
        if (el.type === "hidden") return;
        if (!labelFor(el)) out.push(`input/select without label: ${el.id || el.outerHTML.slice(0, 60)}`);
      });
      document.querySelectorAll("button").forEach((el) => {
        const name = (el.getAttribute("aria-label") || el.textContent || "").trim();
        if (!name) out.push(`button without accessible name: ${el.id || el.outerHTML.slice(0, 60)}`);
      });
      return out;
    });
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("keyboard: 主要操作にTabで到達でき focus が見える", async ({ page }) => {
    // 最初のインタラクティブ要素へ
    await page.keyboard.press("Tab");
    const firstFocus = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
    expect(firstFocus).toBeTruthy();

    // フォームの主要入力に到達できる（最大40回Tabで currentCash にフォーカスが乗るか）
    let reachedCash = false;
    for (let i = 0; i < 40; i++) {
      const id = await page.evaluate(() => document.activeElement && document.activeElement.id);
      if (id === "currentCash") { reachedCash = true; break; }
      await page.keyboard.press("Tab");
    }
    expect(reachedCash, "Tab操作で #currentCash に到達できない").toBe(true);

    // focus が視覚的に見える（outline か box-shadow が付く）
    const focusVisible = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const cs = getComputedStyle(el);
      const hasOutline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      const hasShadow = cs.boxShadow && cs.boxShadow !== "none";
      return hasOutline || hasShadow;
    });
    expect(focusVisible, "focus が視覚的に見えない（outline/box-shadow なし）").toBe(true);
  });

  test("ARIA: tablist 構造が snapshot と一致", async ({ page }) => {
    // タブは結果表示時に意味を持つ（空状態のモバイルでは結果ごと非表示が正しい挙動）。
    // 構造は「結果が出ている状態」で検証する。
    await fillBasics(page);
    await expect(page.locator(".view-switch")).toMatchAriaSnapshot({ name: "tablist.aria.yml" });
  });
});

// A11Y_GATE.md: "reset の Escape cancel" — キャンセルでデータが保持されることを保証する。
// openApp は全ダイアログを accept するため、フラグで初期化フェーズ(accept)と
// reset フェーズ(dismiss)を切り替える。
test.describe("ふところ reset dialog", () => {
  test("reset キャンセルでデータが保持される", async ({ page }) => {
    let shouldAccept = true;
    await page.clock.install({ time: new Date("2026-06-15T00:00:00") });
    page.on("dialog", (d) => (shouldAccept ? d.accept() : d.dismiss()).catch(() => {}));
    await page.goto(APP_URL);
    await page.waitForSelector("#simulatorForm");
    await fillBasics(page);
    // ここから dismiss モードに切り替え
    shouldAccept = false;
    await page.click("#resetButton");
    await settleMotion(page);
    // dismiss → event.preventDefault() → フォームは reset されない
    // fillBasics が formatAllAmountFields を呼ぶためフィールドはカンマ表記になっている
    await expect(page.locator("#monthsBadge")).not.toHaveText(/^--/);
    await expect(page.locator("#currentCash")).toHaveValue("1,200,000");
  });
});
