// A section title with its icon in front, for long pages read by scanning
// (設定). The icon is decoration: the text names the section.
export default function SectionTitle({ icon, children }) {
  const Icon = icon;
  return (
    <span className="section-title">
      <Icon className="section-title-icon" />
      {children}
    </span>
  );
}
