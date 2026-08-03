// Оставляет в блоке «Дополнительные фильтры» только тип товара, цвет и материал.
// Блок при загрузке закрыт и открывается по кнопке «+».
(() => {
  "use strict";
  const originalWrite = document.write.bind(document);

  function runtime() {
    const norm = value => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    const wanted = new Set(["тип товара", "цвет", "материал"]);
    const unwanted = new Set(["ширина", "высота", "наличие", "модель или артикул"]);

    function fieldBlock(label) {
      let node = label;
      for (let i = 0; i < 6 && node && node.parentElement; i += 1) {
        const parent = node.parentElement;
        const controls = parent.querySelectorAll("input,select,textarea").length;
        if (controls === 1) return parent;
        node = parent;
      }
      return label.parentElement;
    }

    function apply() {
      const all = [...document.querySelectorAll("body *")];
      const title = all.find(el => norm(el.textContent) === "дополнительные фильтры");
      if (!title) return false;

      const labels = all.filter(el => {
        const text = norm(el.textContent);
        if (![...wanted, ...unwanted].includes(text)) return false;
        return ![...el.children].some(child => norm(child.textContent) === text);
      });

      const keptBlocks = [];
      labels.forEach(label => {
        const text = norm(label.textContent);
        const block = fieldBlock(label);
        if (!block) return;
        if (wanted.has(text)) keptBlocks.push(block);
        if (unwanted.has(text)) block.remove();
      });

      // Удаляем пояснение о наличии, если оно осталось отдельным текстовым узлом.
      [...document.querySelectorAll("p,small,div")].forEach(el => {
        const text = norm(el.textContent);
        if (text.startsWith("в текущем прайсе нет статуса склада")) el.remove();
      });

      const titleRow = title.closest("button") || title.parentElement || title;
      let indicator = [...titleRow.querySelectorAll("span,button,i,b")].find(el => ["−", "-", "+"].includes(norm(el.textContent)));
      if (!indicator) {
        indicator = document.createElement("span");
        indicator.style.marginLeft = "auto";
        titleRow.appendChild(indicator);
      }

      const visibleItems = [...new Set(keptBlocks)];
      const resetButton = [...document.querySelectorAll("button,a")].find(el => norm(el.textContent) === "сбросить все фильтры");
      if (resetButton) visibleItems.push(resetButton.closest("div") || resetButton);

      let expanded = false;
      const setExpanded = value => {
        expanded = value;
        visibleItems.forEach(el => { el.style.display = expanded ? "" : "none"; });
        indicator.textContent = expanded ? "−" : "+";
        titleRow.setAttribute("aria-expanded", String(expanded));
      };

      // Перехватываем старый обработчик, чтобы состояние всегда было предсказуемым.
      const cleanRow = titleRow.cloneNode(true);
      titleRow.replaceWith(cleanRow);
      const cleanTitle = [...cleanRow.querySelectorAll("*")].find(el => norm(el.textContent) === "дополнительные фильтры") || cleanRow;
      indicator = [...cleanRow.querySelectorAll("span,button,i,b")].find(el => ["−", "-", "+"].includes(norm(el.textContent))) || indicator;
      cleanRow.style.cursor = "pointer";
      cleanRow.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        setExpanded(!expanded);
      });
      cleanTitle.setAttribute("role", "button");
      setExpanded(false);
      return true;
    }

    if (!apply()) {
      const observer = new MutationObserver(() => {
        if (apply()) observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 10000);
    }
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${runtime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
