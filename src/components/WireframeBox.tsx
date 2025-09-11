import { useRef } from "react";
import { useWindowSize, useMouse } from "react-use";
import { cn } from "../lib/utils";
import styles from "./WireframeBox.module.css";

export const WireframeBox: React.FC<React.ComponentProps<"div">> = ({
  className,
  style,
  ...props
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useWindowSize();
  const { docX, docY } = useMouse(ref as React.RefObject<Element>);

  return (
    <div
      ref={ref}
      className={cn(
        styles["wf-room"],
        "pointer-events-none absolute inset-0 [--wf-bg:transparent]",
        "dark:[--wf-line:theme(colors.emerald.800)] dark:[--wf-line-strong:theme(colors.emerald.500)]",
        "[--wf-line:theme(colors.sky.500)] [--wf-line-strong:theme(colors.sky.800)]",
        className,
      )}
      style={
        {
          "--wf-rot-x": `${(docY / height) * 5}deg`,
          "--wf-rot-y": `${(docX / width) * 5}deg`,
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      <div className={styles["wf-viewport"]}>
        <div className={styles["wf-scene"]}>
          <div className={cn(styles["wf-plane"], styles["wf-floor"])}></div>
          <div className={cn(styles["wf-plane"], styles["wf-ceiling"])}></div>
          <div
            className={cn(
              styles["wf-plane"],
              styles["wf-wall"],
              styles["wf-wall-back"],
            )}
          ></div>
          <div
            className={cn(
              styles["wf-plane"],
              styles["wf-wall"],
              styles["wf-wall-left"],
            )}
          ></div>
          <div
            className={cn(
              styles["wf-plane"],
              styles["wf-wall"],
              styles["wf-wall-right"],
            )}
          ></div>
        </div>
      </div>
    </div>
  );
};
