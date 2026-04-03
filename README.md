# utopiaintel
Sample scripts to parse pages from utopia-game.com.

Users can specify your URL endpoint and a key. The key is optional but I would suggest using it to ensure control on who posts.

Both raw HTML and highlighted/copy-pasted data is sent. What you use depends on how you like parsing data.

# Utopia Setup
After setting this up in some webserver, go to Preferences in Utopia, and set your "Send intel to your own Intel site" to point to your intel server's `/api/intel` endpoint.

NOTE: Contrary to what the UI says, no cookie gets set. Rather, two browser Local Storage keys get set: `custom_kdsite` and `custom_kdsite_key`. You can inspect/modify them in Chrome Dev Tools under the Application tab -> Local Storage -> <utopia domain>.

IMPORTANT: Ensure Ajax mode is disabled in the Bot Prefs in the game UI, otherwise the XHR request doesn't get sent reliably.

You can verify it in Chrome's Network tab in Developer Tools.