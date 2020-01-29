import { Button } from "@material/mwc-button";

export function a() {
  const el = document.createElement("mwc-button");
  el.innerText = "a";
  document.body.appendChild(el);
}

export function b() {
  const el = document.createElement("p");
  el.innerText = "b";
  document.body.appendChild(el);
}

export function c() {
  const el = document.createElement("p");
  el.innerText = "c";
  document.body.appendChild(el);
}
