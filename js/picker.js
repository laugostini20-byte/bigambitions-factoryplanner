/* Searchable product picker (ARIA combobox + listbox).
 *
 * createPicker(rootEl, {groups: [{label, options: [name]}], value, onChange})
 *   -> {setValue(name)}
 *
 * Typing filters on the product name and its group label, so "food" lists every food.
 */
(function () {
  "use strict";

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function createPicker(root, { groups, value, onChange }) {
    root.classList.add("picker");
    root.innerHTML =
      '<input id="item" type="text" role="combobox" aria-expanded="false" aria-controls="itemList" ' +
      'aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Search products">' +
      '<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>' +
      '<ul id="itemList" role="listbox" aria-label="Products" hidden></ul>';

    const input = root.querySelector("input");
    const list = root.querySelector("ul");
    let current = value;
    let visible = []; // option names currently shown, in display order
    let active = -1;

    input.value = current;

    function render(query) {
      const q = query.trim().toLowerCase();
      visible = [];
      let html = "";
      groups.forEach(group => {
        const groupHit = q && group.label.toLowerCase().includes(q);
        const opts = group.options.filter(name => !q || groupHit || name.toLowerCase().includes(q));
        if (!opts.length) return;
        html += `<li role="presentation" class="grp">${esc(group.label)}</li>`;
        opts.forEach(name => {
          const i = visible.push(name) - 1;
          html += `<li role="option" id="opt-${i}" data-i="${i}" aria-selected="${name === current}">${esc(name)}</li>`;
        });
      });
      list.innerHTML = html || '<li class="none">No products match</li>';
      // Filtering puts the first hit under the cursor; browsing starts on the current product.
      setActive(q ? (visible.length ? 0 : -1) : visible.indexOf(current));
    }

    function setActive(i, scroll = true) {
      list.querySelector(".active")?.classList.remove("active");
      active = i;
      if (i < 0) {
        input.removeAttribute("aria-activedescendant");
        return;
      }
      const el = list.querySelector(`#opt-${i}`);
      el.classList.add("active");
      input.setAttribute("aria-activedescendant", el.id);
      if (scroll) el.scrollIntoView({ block: "nearest" });
    }

    function open() {
      if (!list.hidden) return;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      render("");
    }

    function close() {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      input.value = current;
    }

    function pick(name) {
      current = name;
      close();
      onChange(name);
    }

    input.addEventListener("focus", () => {
      open();
      input.select();
    });
    input.addEventListener("click", open);
    input.addEventListener("input", () => {
      open();
      render(input.value);
    });
    // Delay so a tap on an option lands before the list disappears.
    input.addEventListener("blur", () => setTimeout(() => document.activeElement !== input && close(), 150));

    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (list.hidden) return open();
        if (!visible.length) return;
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive((active + step + visible.length) % visible.length);
      } else if (e.key === "Enter") {
        if (!list.hidden && active >= 0) {
          e.preventDefault();
          pick(visible[active]);
        }
      } else if (e.key === "Escape") {
        if (!list.hidden) {
          e.preventDefault();
          close();
          input.select();
        }
      }
    });

    // mousedown + preventDefault keeps focus in the input so blur doesn't race the pick.
    list.addEventListener("mousedown", e => e.preventDefault());
    list.addEventListener("mousemove", e => {
      const li = e.target.closest("[role=option]");
      if (li && +li.dataset.i !== active) setActive(+li.dataset.i, false);
    });
    list.addEventListener("click", e => {
      const li = e.target.closest("[role=option]");
      if (li) pick(visible[+li.dataset.i]);
    });

    return {
      setValue(name) {
        current = name;
        if (list.hidden) input.value = name;
      },
    };
  }

  window.createPicker = createPicker;
})();
