"use strict";

// s : function
(function () {
  // goTopBtn
    const goTopBtn = () => {
        const contentArea = document.querySelector("#container");
        if (contentArea) {
            const goTopTag = document.createElement("button");
            goTopTag.className = "page-top-button krds-tooltip";
            goTopTag.type = "button";
            goTopTag.innerHTML = `<i class="svg-icon ico-go-top"></i>`;
            goTopTag.setAttribute("data-tooltip", "페이지 상단으로 이동");
            contentArea.append(goTopTag);

            const home = contentArea.querySelector(".breadcrumb .home a");
            const toggleVisibility = () => {
                // if (document.getElementById("wrap").classList.contains("scroll-up")) {
                //   goTopTag.classList.toggle("active", window.scrollY > window.innerHeight * 1.5);
                // } else {
                //   goTopTag.classList.remove("active");
                // }
                goTopTag.classList.toggle("active", window.scrollY > window.innerHeight * .5);
            };
            const scrollToTop = () => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                home?.focus();
            };
            window.addEventListener("scroll", toggleVisibility);
            goTopTag.addEventListener("click", scrollToTop);
        }
    };

    // run
    goTopBtn();
})();
// e : function