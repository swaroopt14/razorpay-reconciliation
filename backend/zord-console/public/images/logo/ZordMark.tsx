type ZordMarkProps = {
  className?: string;
  title?: string;
};

export function ZordMark({ className, title = "Zord" }: ZordMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 265 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <path
        d="M157 10 L133 52 L99 39 L10 200 L247 270 L222 223 L255 199 Z M133 52 L222 223 L65 177 Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
