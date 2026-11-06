import { ReactNode, useCallback, useEffect, useRef, useState } from "react";

const PAD = 12;
const GAP = 6;

export function HelpTip({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const hidePop = useCallback(() => {
    const pop = popRef.current;
    if (!pop) return;
    pop.style.display = "none";
    pop.style.visibility = "";
    pop.style.left = "";
    pop.style.top = "";
    pop.style.position = "";
    setOpen(false);
  }, []);

  const alignPop = useCallback(() => {
    const root = rootRef.current;
    const pop = popRef.current;
    const btn = btnRef.current;
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
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent | TouchEvent) => {
      const root = rootRef.current;
      if (root?.contains(event.target as Node)) return;
      hidePop();
      btnRef.current?.blur();
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open, hidePop]);

  const onBtnClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (open) {
      hidePop();
      btnRef.current?.blur();
      return;
    }
    alignPop();
  };

  return (
    <span className="help-tip" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className="help-tip-btn"
        aria-label="怎么看"
        aria-expanded={open}
        onClick={onBtnClick}
        onMouseEnter={alignPop}
        onMouseLeave={hidePop}
        onFocus={alignPop}
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node)) hidePop();
        }}
      >
        ?
      </button>
      <span className="help-tip-pop" ref={popRef} role="tooltip">
        {children}
      </span>
    </span>
  );
}
