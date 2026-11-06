import { SummaryModule } from "./gexSummary";

export default function SummaryModuleCard({ module }: { module: SummaryModule | null }) {
  if (!module) {
    return (
      <div className="summary-module-empty panel-empty">数据不足，无法生成摘要</div>
    );
  }

  return (
    <div className="summary-module-card">
      <div className="summary-module-scroll">
        <ul className="summary-module-facts">
          {module.facts.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="summary-module-ideas">
          <h4 className="summary-module-ideas-k">交易建议</h4>
          <ul>
            {module.ideas.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
