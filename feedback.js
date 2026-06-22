(function () {
  var form = document.getElementById("fbForm");
  if (!form) return;
  var result = document.getElementById("fbResult");
  var submitBtn = document.getElementById("fbSubmit");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var tokenField = form.querySelector('[name="cf-turnstile-response"]');
    var token = tokenField ? tokenField.value : "";
    if (!token) {
      result.textContent = "「私はロボットではありません」の確認にチェックを入れてください。";
      return;
    }
    if (submitBtn) submitBtn.disabled = true;
    result.textContent = "送信中…";

    fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: form.kind.value,
        message: form.message.value,
        token: token
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.ok) {
          result.textContent = "送信しました。ありがとうございます。";
          form.reset();
          if (window.turnstile) {
            try { window.turnstile.reset(); } catch (err) { /* noop */ }
          }
        } else {
          result.textContent = "送信に失敗しました。時間をおいて、もう一度お試しください。";
          if (submitBtn) submitBtn.disabled = false;
        }
      })
      .catch(function () {
        result.textContent = "送信に失敗しました。通信環境をご確認のうえ、再度お試しください。";
        if (submitBtn) submitBtn.disabled = false;
      });
  });
})();
