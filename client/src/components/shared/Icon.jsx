// Font Awesome wrappers. Use Icon for solid (default UI), IconBrand for brand marks
// (whatsapp, instagram, linkedin, …), IconRegular for the lighter-weight variant.

export default function Icon({ name, className = '', style, ...rest }) {
  return <i className={`fa-solid fa-${name} ${className}`} style={style} aria-hidden="true" {...rest} />;
}

export function IconBrand({ name, className = '', style, ...rest }) {
  return <i className={`fa-brands fa-${name} ${className}`} style={style} aria-hidden="true" {...rest} />;
}

export function IconRegular({ name, className = '', style, ...rest }) {
  return <i className={`fa-regular fa-${name} ${className}`} style={style} aria-hidden="true" {...rest} />;
}
