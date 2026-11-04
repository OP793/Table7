interface Props {
  steps: string[];
  current: number;
}

export function Stepper({ steps, current }: Props) {
  return (
    <ol className="stepper">
      {steps.map((label, i) => (
        <li key={label} className={i < current ? "done" : i === current ? "current" : ""}>
          <span className="stepper-dot">{i < current ? "✓" : i + 1}</span>
          <span className="stepper-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}
