export function Header({ tableName, outletName }: { tableName: string; outletName: string }) {
  return (
    <header className="app-header">
      <div className="app-header__mark" aria-hidden="true">
        🍽️
      </div>
      <div>
        <h1>{outletName}</h1>
        <p className="app-header__table">Table {tableName}</p>
      </div>
    </header>
  );
}
