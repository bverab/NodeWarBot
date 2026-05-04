"use client";

import { useState } from "react";
import { getClassIconPath } from "@/lib/bdoClasses";
import styles from "./BdoClassIcon.module.css";

export function BdoClassIcon({ className }: { className?: string | null }) {
  const [failed, setFailed] = useState(false);
  const iconPath = failed ? null : getClassIconPath(className);
  const fallback = className?.slice(0, 2).toUpperCase() || "BD";

  return (
    <span className={styles.icon}>
      {iconPath ? <img alt="" src={iconPath} onError={() => setFailed(true)} /> : fallback}
    </span>
  );
}
