import styles from "./ShootingStars.module.css";

type ShootingStarsProps = {
  className?: string;
  count?: number;
};

export function ShootingStars({ className, count = 4 }: ShootingStarsProps) {
  const stars = Array.from({ length: count });
  const rootClassName = className ? `${styles.root} ${className}` : styles.root;

  return (
    <div className={rootClassName} aria-hidden="true">
      {stars.map((_, index) => (
        <span className={styles.star} key={index} />
      ))}
    </div>
  );
}
