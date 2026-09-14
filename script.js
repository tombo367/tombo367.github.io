const yearNode = document.querySelector("#year");

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

const menuToggle = document.querySelector(".menu-toggle");
const sidebar = document.querySelector(".site-header");
const sidebarLinks = document.querySelectorAll(".site-nav a");

if (menuToggle && sidebar) {
  const setMenuOpen = (isOpen) => {
    sidebar.classList.toggle("is-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.textContent = isOpen ? "Close" : "Menu";
  };

  menuToggle.addEventListener("click", () => {
    setMenuOpen(!sidebar.classList.contains("is-open"));
  });

  sidebarLinks.forEach((link) => {
    link.addEventListener("click", () => setMenuOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sidebar.classList.contains("is-open")) {
      setMenuOpen(false);
      menuToggle.focus();
    }
  });
}

const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightbox-image");
const lightboxClose = document.querySelector(".lightbox-close");
const galleryTriggers = document.querySelectorAll(".gallery-trigger");

if (lightbox && lightboxImage) {
  let lastFocused = null;

  const openLightbox = (trigger) => {
    const img = trigger.querySelector("img");
    if (!img) return;

    lastFocused = trigger;
    lightboxImage.src = img.src;
    lightboxImage.alt = img.alt;
    lightbox.hidden = false;
    requestAnimationFrame(() => lightbox.classList.add("is-visible"));
    lightboxClose.focus();
    document.body.style.overflow = "hidden";
  };

  const closeLightbox = () => {
    lightbox.classList.remove("is-visible");
    document.body.style.overflow = "";
    setTimeout(() => {
      lightbox.hidden = true;
      lightboxImage.src = "";
    }, 150);
    if (lastFocused) lastFocused.focus();
  };

  galleryTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => openLightbox(trigger));
  });

  lightboxClose.addEventListener("click", closeLightbox);

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !lightbox.hidden) closeLightbox();
  });
}
