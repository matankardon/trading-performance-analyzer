import logoMark from "../assets/logo.svg";

function BrandLogo({ className = "", size = 34, alt = "" }) {
  return (
    <img
      className={className}
      src={logoMark}
      width={size}
      height={size}
      alt={alt}
      aria-hidden={alt ? undefined : "true"}
    />
  );
}

export default BrandLogo;
