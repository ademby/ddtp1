import Control from "ol/control/Control.js";
import { CLASS_CONTROL, CLASS_UNSELECTABLE } from "ol/css.js";
import type { AdminNode } from "../domain/AdminNode.js";

export const CLASS_SELECTED = "selected";

export default class LocationDisplay extends Control {
  constructor(className = "ol-location-display") {
    const element = document.createElement("div");
    element.className = `${className} ${CLASS_UNSELECTABLE} ${CLASS_CONTROL}`;
    super({ element });
    element.style.display = "none";
  }

  setPath(path: AdminNode[]): void {
    this.element.replaceChildren();
    path.forEach((node, index) => {
      const isFirst = index == 0;
      const isLast = index == path.length - 1;
      if (!isFirst)
        this.element.append(
      document.createElement("br"),
          document.createTextNode("   ".repeat(index - 1) + "↳ "),
        );
      this.element.appendChild(this.nodeToElement(node, isLast));
    });
    this.element.style.display = "block";
  }

  protected nodeToElement(node: AdminNode, isLast: boolean): HTMLElement {
    const name = document.createElement("span");
    name.textContent = String(node.feature.get("shapeName"));
    name.className += isLast ? ` ${CLASS_SELECTED}` : "";
    return name;
  }

  clear(): void {
    this.element.replaceChildren();
    this.element.style.display = "none";
  }
}
