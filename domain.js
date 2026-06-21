(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LifeDefenseDomain = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MONTH_COUNT = 12;
  const CASH_MAX = 1000000000;
  const MONTHLY_AMOUNT_MAX = 100000000;

  function defaultMonths() {
    return Array.from({ length: MONTH_COUNT }, (_, index) => ({
      label: `${index + 1}ヶ月目`,
      card: 0,
      extraIncome: 0,
      extraExpense: 0
    }));
  }

  function parseAmount(value, max = CASH_MAX) {
    const normalized = String(value ?? "")
      .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      .replace(/[,\s，]/g, "");
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return Math.min(numeric, max);
  }

  function normalizeMonth(month) {
    return {
      label: month.label,
      card: parseAmount(month.card, MONTHLY_AMOUNT_MAX),
      extraIncome: parseAmount(month.extraIncome, MONTHLY_AMOUNT_MAX),
      extraExpense: parseAmount(month.extraExpense, MONTHLY_AMOUNT_MAX)
    };
  }

  function calculateProjection(input) {
    let balance = parseAmount(input.currentCash, CASH_MAX);
    const monthlyIncome = parseAmount(input.monthlyIncome, MONTHLY_AMOUNT_MAX);
    const monthlyExpense = parseAmount(input.monthlyExpense, MONTHLY_AMOUNT_MAX);
    const months = Array.isArray(input.months) ? input.months : defaultMonths();

    return months.map((rawMonth) => {
      const month = normalizeMonth(rawMonth);
      const income = monthlyIncome + month.extraIncome;
      const expense = monthlyExpense + month.card + month.extraExpense;
      balance = balance + income - expense;
      return {
        ...month,
        income,
        expense,
        balance
      };
    });
  }

  function calculateEmergencyMonths(currentCash, monthlyExpense) {
    const expense = parseAmount(monthlyExpense, MONTHLY_AMOUNT_MAX);
    if (expense <= 0) return Number.NaN;
    return parseAmount(currentCash, CASH_MAX) / expense;
  }

  function calculateTargets(currentCash, monthlyExpense) {
    const cash = parseAmount(currentCash, CASH_MAX);
    const expense = parseAmount(monthlyExpense, MONTHLY_AMOUNT_MAX);
    const target3 = expense * 3;
    const target6 = expense * 6;
    return {
      target3,
      target6,
      gap3: Math.max(0, target3 - cash),
      gap6: Math.max(0, target6 - cash)
    };
  }

  function findLowestBalanceMonth(projection) {
    if (!projection.length) return null;
    return projection.reduce((lowest, month) => month.balance < lowest.balance ? month : lowest, projection[0]);
  }

  return {
    MONTH_COUNT,
    CASH_MAX,
    MONTHLY_AMOUNT_MAX,
    parseAmount,
    defaultMonths,
    calculateProjection,
    calculateEmergencyMonths,
    calculateTargets,
    findLowestBalanceMonth
  };
});
