import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import styles from "./TableCard.module.css";

type TableColumn = {
  key: string;
  label: string;
};

type TableCardProps = {
  title: string;
  action?: ReactNode;
  columns: TableColumn[];
  rows: Array<Record<string, ReactNode>>;
};

export function TableCard({ title, action, columns, rows }: TableCardProps) {
  return (
    <Card className={styles.card} padded={false}>
      <div className={styles.heading}>
        <h3>{title}</h3>
        {action}
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.key}>{row[column.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
