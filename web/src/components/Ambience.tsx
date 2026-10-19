/** Decorative animated backdrop. Fixed behind everything; no pointer events.
 *  The fog and the bats only show under the haunted skin (index.css). */
export function Ambience() {
  return (
    <div className="ambience" aria-hidden="true">
      <div className="ambience__blob ambience__blob--blue" />
      <div className="ambience__blob ambience__blob--purple" />
      <div className="ambience__blob ambience__blob--cyan" />
      <div className="ambience__grid" />
      <div className="ambience__fog" />
      <div className="ambience__bats" />
      <div className="ambience__grain" />
    </div>
  );
}
