/** Shown at "/" and anywhere a screen needs a dining session but none is stored — see
 *  routes/RequireSession.tsx. Not a marketing landing page; DineEasy's customer app has no
 *  entry point other than scanning a table's QR code (spec §4's "no forced signup" extends to
 *  "no browsing the menu without being at a table"). */
export function ScanPrompt({ message }: { message?: string }) {
  return (
    <div className="scan-prompt">
      <div className="scan-prompt__icon" aria-hidden="true">
        📱
      </div>
      <h1>Scan the QR code at your table</h1>
      <p>{message ?? "You'll need to scan the code on your table to see the menu and order."}</p>
    </div>
  );
}
