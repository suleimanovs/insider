function resetToggleMenuState() {
  const menuBtn = document.querySelector('[aria-label="Menu"]');
  const svgIcon = menuBtn?.querySelector("svg");
  const mobileMenu = document.getElementById("mobile-menu");
  const header = document.getElementById("header");

  if (!menuBtn || !svgIcon || !mobileMenu || !header) return;

  menuBtn.classList.remove("expanded");
  svgIcon.classList.remove("styles_active__q5RIh");
  menuBtn.setAttribute("aria-expanded", "false");
  mobileMenu.classList.add("hidden");
  header.classList.remove("h-screen", "bg-page", "expanded");
  document.body.classList.remove("overflow-hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.querySelector('[aria-label="Menu"]');
  const svgIcon = menuBtn?.querySelector("svg");
  const mobileMenu = document.getElementById("mobile-menu");
  const header = document.getElementById("header");

  if (!menuBtn || !svgIcon || !mobileMenu || !header) return;

  menuBtn.addEventListener("click", () => {
    const isExpanded = menuBtn.getAttribute("aria-expanded") === "true";
    const nextState = !isExpanded;

    menuBtn.setAttribute("aria-expanded", String(nextState));
    menuBtn.classList.toggle("expanded");
    svgIcon.classList.toggle("styles_active__q5RIh");

    mobileMenu.classList.toggle("hidden");
    header.classList.toggle("h-screen");
    header.classList.toggle("bg-page");
    header.classList.toggle("expanded");
    document.body.classList.toggle("overflow-hidden");
  });

  // авто-сброс при ресайзе
  window.matchMedia("(max-width: 767px)").addEventListener("change", () => {
    resetToggleMenuState();
  });

  // сброс при клике на кнопку смены темы
  window.addEventListener("click", (e) => {
    if (e.target.closest('[data-toggle-theme]')) {
      setTimeout(() => resetToggleMenuState(), 100);
    }
  });

  // можно также слушать пользовательский эвент, если хочешь централизованно:
  window.addEventListener("theme-changed", resetToggleMenuState);
});
