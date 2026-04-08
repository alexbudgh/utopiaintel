export function IntelSetupCard({
  endpointUrl,
  title = "Utopia Intel Setup",
  compact = false,
}: {
  endpointUrl: string;
  title?: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-lg bg-gray-800/60 p-6 space-y-4 text-sm">
      <p className="text-gray-300 font-medium">{title}</p>
      <p className="text-gray-400">
        Configure your Utopia client to send intel to this site:
      </p>
      <ol className="list-decimal list-inside space-y-2 text-gray-400">
        <li>In-game, go to <span className="text-gray-200">Preferences</span>.</li>
        <li>
          Find <span className="text-gray-200">Send intel to your own Intel site</span> and
          set the URL to <code className="text-gray-100 bg-gray-700 px-1 rounded">{endpointUrl}</code>.
        </li>
        <li>
          Set the <span className="text-gray-200">key</span> to the same value you used to log
          in here. This is how the site knows which intel belongs to your kingdom.{" "}
          <span className="text-yellow-400">Treat this key as a secret and only share it inside your kingdom.</span>
        </li>
        <li>
          Make sure <span className="text-gray-200">Ajax mode</span> is <span className="text-red-400">disabled</span> in
          Bot Prefs, otherwise requests may not send reliably.
        </li>
      </ol>
      {!compact && (
        <p className="text-gray-500">
          Once configured, intel will appear here automatically as your kingdom members browse the game.
        </p>
      )}
    </div>
  );
}
