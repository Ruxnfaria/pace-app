interface ProgressBarProps {
    value: number;
    max?: number;
    height?: "sm" | "md" | "lg";
    color?: "purple" | "green" | "yellow" | "blue";
    showPercentage?: boolean;
  }
  
  const heights = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  };
  
  const colors = {
    purple: "bg-[#7c3aed]",
    green: "bg-green-500",
    yellow: "bg-yellow-400",
    blue: "bg-blue-500",
  };
  
  export function ProgressBar({
    value,
    max = 100,
    height = "md",
    color = "purple",
    showPercentage = false,
  }: ProgressBarProps) {
    const percentage = Math.min((value / max) * 100, 100);
  
    return (
      <div className="w-full">
        <div
          className={`overflow-hidden rounded-full bg-zinc-800 ${heights[height]}`}
        >
          <div
            className={`${colors[color]} h-full rounded-full transition-all duration-500`}
            style={{
              width: `${percentage}%`,
            }}
          />
        </div>
  
        {showPercentage && (
          <p className="mt-1 text-right text-xs font-bold text-zinc-500">
            {Math.round(percentage)}%
          </p>
        )}
      </div>
    );
  }