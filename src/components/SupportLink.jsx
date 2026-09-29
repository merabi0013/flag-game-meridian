import { SUPPORT_URL, SUPPORT_LABEL, IS_SUPPORT_CONFIGURED } from '../config/appConfig';

/**
 * Renders nothing at all until a real SUPPORT_URL is set in
 * config/appConfig.js, so players are never sent to a placeholder or
 * broken page. Always opens in a new tab (rel="noopener noreferrer" for
 * security) so an in-progress game is never lost or reset by clicking it.
 */
export default function SupportLink({ className = '', children }) {
  if (!IS_SUPPORT_CONFIGURED) return null;

  return (
    <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className={className}>
      {children || SUPPORT_LABEL}
    </a>
  );
}
