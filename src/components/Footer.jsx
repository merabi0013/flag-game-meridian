import SupportLink from './SupportLink';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <span>Meridian — flags via flagcdn.com.</span>
        <SupportLink className="footer-support-link" />
      </div>
    </footer>
  );
}
