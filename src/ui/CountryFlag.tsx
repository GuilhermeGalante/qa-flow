interface CountryFlagProps {
  country: "BR" | "US" | "ES";
  className?: string;
}

const frameClass = "h-4 w-[1.4rem] overflow-hidden rounded-[3px] ring-1 ring-hairline-strong";

export function CountryFlag({ country, className = "" }: CountryFlagProps) {
  if (country === "BR") {
    return (
      <svg viewBox="0 0 28 20" aria-hidden="true" focusable="false" className={`${frameClass} ${className}`}>
        <rect width="28" height="20" fill="#009739" />
        <path d="M14 2.5 25 10 14 17.5 3 10Z" fill="#FEDD00" />
        <circle cx="14" cy="10" r="4.4" fill="#012169" />
        <path d="M10.2 9.2c2.6-.6 5.3-.1 7.6 1.3" fill="none" stroke="#fff" strokeWidth="1.1" />
      </svg>
    );
  }

  if (country === "US") {
    return (
      <svg viewBox="0 0 28 20" aria-hidden="true" focusable="false" className={`${frameClass} ${className}`}>
        <rect width="28" height="20" fill="#fff" />
        {[0, 4, 8, 12, 16].map((y) => <rect key={y} y={y} width="28" height="2" fill="#B31942" />)}
        <rect width="12" height="10.8" fill="#0A3161" />
        {[2, 6, 10].flatMap((x) => [2, 5.2, 8.4].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.65" fill="#fff" />))}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 28 20" aria-hidden="true" focusable="false" className={`${frameClass} ${className}`}>
      <rect width="28" height="20" fill="#AA151B" />
      <rect y="5" width="28" height="10" fill="#F1BF00" />
      <rect x="8" y="7.2" width="2.4" height="5.6" rx="0.45" fill="#AA151B" />
      <rect x="7.5" y="6.5" width="3.4" height="1" rx="0.4" fill="#AA151B" />
    </svg>
  );
}
