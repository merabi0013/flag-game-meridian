export default function Button({
  variant = 'default', // 'default' | 'primary' | 'ghost' | 'danger-ghost'
  size, // undefined | 'sm'
  block = false,
  as: Component = 'button',
  className = '',
  children,
  ...rest
}) {
  const classes = ['btn'];
  if (variant === 'primary') classes.push('btn-primary');
  if (variant === 'ghost') classes.push('btn-ghost');
  if (variant === 'danger-ghost') classes.push('btn-danger-ghost');
  if (size === 'sm') classes.push('btn-sm');
  if (block) classes.push('btn-block');
  if (className) classes.push(className);

  return (
    <Component className={classes.join(' ')} {...rest}>
      {children}
    </Component>
  );
}
