const form = document.querySelector("#loginForm");
const button = document.querySelector("#loginButton");
const errorMessage = document.querySelector("#loginError");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  button.textContent = "Verificando…";
  errorMessage.hidden = true;

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No fue posible iniciar sesión.");
    window.location.replace("/");
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Entrar";
  }
});
