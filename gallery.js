const box = document.querySelector("dialog");
const [cap, alt] = box.querySelectorAll("p");

document.querySelectorAll(".grid button").forEach((b) => {
  b.onclick = () => {
    box.querySelector("img").src = b.querySelector("img").src;
    cap.textContent = b.dataset.cap;
    alt.textContent = b.dataset.alt;
    box.showModal();
  };
});

box.onclick = (e) => e.target === box && box.close();

document.querySelectorAll(".tags button").forEach((t, _, all) => {
  t.onclick = () => {
    all.forEach((x) => x.setAttribute("aria-pressed", x === t));
    document.querySelectorAll(".grid button").forEach((b) => {
      b.hidden = t.dataset.tag && b.dataset.tag !== t.dataset.tag;
    });
  };
});
