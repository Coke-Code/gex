import { ReactNode, useCallback, useRef } from "react";

const PAD = 12;
const GAP = 6;

export function HelpTip({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);

  const alignPop = useCallback(() => {
    const root = rootRef.current;
    const pop = popRef.current;
    const btn = root?.querySelector<HTMLElement>(".help-tip-btn");
    if (!root || !pop || !btn) return;

    pop.style.display = "block";
    pop.style.position = "fixed";
    pop.style.visibility = "hidden";
    pop.style.left = "0px";
    pop.style.top = "0px";

    const btnR = btn.getBoundingClientRect();
    const popR = pop.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = btnR.left;
    if (left + popR.width > vw - PAD) left = vw - PAD - popR.width;
    if (left < PAD) left = PAD;

    let top = btnR.bottom + GAP;
    if (top + popR.height > vh - PAD) top = btnR.top - GAP - popR.height;
    if (top < PAD) top = PAD;

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.visibility = "visible";
  }, []);

  const hidePop = useCallback(() => {
    const pop = popRef.current;
    if (!pop) return;
    pop.style.display = "none";
    pop.style.visibility = "";
    pop.style.left = "";
    pop.style.top = "";
  }, []);

  const bind = {
    onMouseEnter: alignPop,
    onFocus: alignPop,
    onMouseLeave: hidePop,
    onBlur: hidePop,
  };

  return (
    <span className="help-tip" ref={rootRef}>
      <button type="button" className="help-tip-btn" aria-label="怎么看" {...bind}>
        ?
      </button>
      <span className="help-tip-pop" ref={popRef} role="tooltip">
        {children}
      </span>
    </span>
  );
}
