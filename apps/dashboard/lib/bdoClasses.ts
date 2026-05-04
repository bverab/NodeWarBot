export function getClassIconPath(className: string | null | undefined) {
  if (!className) {
    return null;
  }

  const safeName = className
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!safeName) {
    return null;
  }

  return `/assets/classes/${safeName}_class_icon_White.png`;
}
