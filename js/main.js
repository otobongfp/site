document.addEventListener("DOMContentLoaded", () => {
  // Sidebar functionality
  const sidebar = document.querySelector(".sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  const navLinks = document.querySelectorAll(".nav-link");

  // Mobile sidebar toggle
  function toggleSidebar() {
    sidebar.classList.toggle("open");

    // Add overlay for mobile
    let overlay = document.querySelector(".sidebar-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "sidebar-overlay";
      document.body.appendChild(overlay);
    }

    if (sidebar.classList.contains("open")) {
      overlay.classList.add("active");
      overlay.addEventListener("click", closeSidebar);
    } else {
      overlay.classList.remove("active");
    }
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", toggleSidebar);
  }

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener("click", toggleSidebar);
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    const overlay = document.querySelector(".sidebar-overlay");
    if (overlay) {
      overlay.classList.remove("active");
    }
  }

  // Handle navigation links
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");

      // If it's an external link (starts with pages/), let it navigate normally
      if (href.startsWith("pages/")) {
        return;
      }

      // For internal links, prevent default and scroll
      e.preventDefault();
      const targetId = href.substring(1);
      const targetSection = document.getElementById(targetId);

      if (targetSection) {
        targetSection.scrollIntoView({ behavior: "smooth" });

        // Update active link
        navLinks.forEach((l) => l.classList.remove("active"));
        link.classList.add("active");

        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
          closeSidebar();
        }
      }
    });
  });

  // Update active link on scroll
  window.addEventListener("scroll", () => {
    const sections = document.querySelectorAll(
      "section[id], div[id], div[data-section]"
    );
    const scrollPos = window.scrollY + 100;

    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.offsetHeight;
      const sectionId =
        section.getAttribute("id") || section.getAttribute("data-section");

      if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
        navLinks.forEach((link) => {
          link.classList.remove("active");
          if (link.getAttribute("href") === `#${sectionId}`) {
            link.classList.add("active");
          }
        });
      }
    });
  });

  // Grid tile interactions
  const gridTiles = document.querySelectorAll(".grid-tile");
  gridTiles.forEach((tile) => {
    tile.addEventListener("click", (e) => {
      // Don't trigger if clicking on a link
      if (e.target.tagName === "A") {
        return;
      }

      // Find the first link in the tile and click it
      const link = tile.querySelector(".tile-link");
      if (link) {
        link.click();
      }
    });
  });
});
