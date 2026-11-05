export default function Template({ children }: { children: React.ReactNode }) {
  // Full height so Chat fills the screen and scrolls its messages, instead of growing past the composer.
  return <div className="route-page-enter h-full">{children}</div>;
}
