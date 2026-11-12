const running = new WeakMap<HTMLElement, Animation>();

/**
 * 高さの開閉を Web Animations で動かす。動かしている間だけ、はみ出しを隠す。
 * 「動きを減らす」設定や未対応の環境では動かさず、onFinish だけをすぐ呼ぶ。
 * hold は終わりの形を保つ（閉じたあとに要素を外す場合。外すまでの1コマで元の高さに戻さない）。
 */
export function animateSize(
  node: HTMLElement,
  keyframes: Keyframe[],
  { duration = 220, hold = false, onFinish }: { duration?: number; hold?: boolean; onFinish?: () => void } = {},
) {
  running.get(node)?.cancel();
  running.delete(node);
  if (typeof node.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    node.style.overflow = "";
    onFinish?.();
    return;
  }
  const easing = getComputedStyle(node).getPropertyValue("--ease-sheet").trim() || "ease-out";
  node.style.overflow = "hidden";
  const animation = node.animate(keyframes, { duration, easing, fill: hold ? "forwards" : "none" });
  running.set(node, animation);
  animation.addEventListener("finish", () => {
    if (running.get(node) !== animation) return;
    if (!hold) {
      running.delete(node);
      node.style.overflow = "";
    }
    onFinish?.();
  });
}
