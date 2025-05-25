document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.querySelector('[aria-label="Menu"]');
  const svgIcon = menuBtn?.querySelector("svg");
  const mobileMenu = document.getElementById("mobile-menu");
  const header = document.getElementById("header");

  if (!menuBtn || !svgIcon || !mobileMenu || !header) return;

  menuBtn.addEventListener("click", () => {
    const isExpanded = menuBtn.getAttribute("aria-expanded") === "true";
    const nextState = !isExpanded;

    // accessibility
    menuBtn.setAttribute("aria-expanded", String(nextState));

    // класс на кнопку
    menuBtn.classList.toggle("expanded");

    // анимация SVG
    svgIcon.classList.toggle("styles_active__q5RIh");

    // состояние меню
    mobileMenu.classList.toggle("hidden");
    header.classList.toggle("h-screen");
    header.classList.toggle("bg-page");
    header.classList.toggle("expanded");
    document.body.classList.toggle("overflow-hidden");
  });

  // авто-сброс при ресайзе
  window.matchMedia("(max-width: 767px)").addEventListener("change", () => {
    menuBtn.classList.remove("expanded");
    svgIcon.classList.remove("styles_active__q5RIh");
    menuBtn.setAttribute("aria-expanded", "false");
    mobileMenu.classList.add("hidden");
    header.classList.remove("h-screen", "bg-page", "expanded");
    document.body.classList.remove("overflow-hidden");
  });
});
