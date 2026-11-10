import { useEffect, useState } from "react";

const TICK_SECONDS = 60;

export default function BoardRefreshButton({
  onBackgroundRefresh,
  onManualRefresh,
  busy,
}: {
  onBackgroundRefresh: () => void;
  onManualRefresh: () => void;
  busy: boolean;
}) {
  const [countdown, setCountdown] = useState(TICK_SECONDS);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          onBackgroundRefresh();
          return TICK_SECONDS;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onBackgroundRefresh]);

  return (
    <button
      type="button"
      className="board-refresh"
      onClick={onManualRefresh}
      disabled={busy}
      aria-live="polite"
      aria-label={busy ? "正在读取数据" : `${countdown} 秒后自动刷新`}
    >
      {busy ? "读取" : `${countdown}s`}
    </button>
  );
}
