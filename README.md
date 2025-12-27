# ember.
---
ember. is a multi-purpose Discord bot, with Music controls, Moderation, LastFM integration, General and Fun commands. Please note some of these have been introduced, some are yet to be.

---
# DOCUMENTATION BELOW:

1. `banner` - `user (o)` `ephemeral (o)` `server (o)`
    - Aliases : N/A
    - Grabs the  banner of the user provided. If no user is provided it grabs the banner of the user executing the command
2. `grouppfp` - N/A
    - Aliases : `groupicon`
    - Grabs the icon of the group it's ran in.
3. `pfp` - `user (o)` `ephemeral (o)` `server (o)`
    - Aliases : `avatar`
    - Grabs the avatar of the user provided. If no user is provided it grabs the avatar of the user executing the command.
4. `serverbanner` - `ephemeral (o)`
    - Aliases : `guildbanner`
    - Grabs the banner of the server it's ran in.
5. `serverpfp` - `ephemeral (o)`
    - Aliases : `guildicon` `guildavatar` `serveravatar` `servericon`
    - Grabs the icon of the server it is ran in.
6. `ping` - N/A
    - Aliases : N/A
    - Sends the latency of the API, the WebSocket Ping, Uptime, its Memory Usage, CPU Load and whether it's being hosted locally or on a server.
7. `say` - `text`
    - Aliases : N/A
    - Repeats the message it is given.
8. `imagetogif` - `image` `ephemeral (o)` `spoiler (o)`
    - Aliases : N/A
    - Turns the image provided into a GIF format.
9. `lastfmsetup` - `mode` `username (o)`
    - Aliases : N/A
    - Depending on what you provide in `mode`, you can link, unlink or replace the LastFM account that is connected  to your Discord account. This is required to use most of the LastFM commands! If you select `link` or `replace` in `mode`, you must provide a username in `username`.
10. `nowplaying` - `user (o)`
    - Aliases : `np` `fm`
    - Shows what you are now playing on LastFM. REQUIRES YOU TO HAVE CONNECTED YOUR ACCOUNT VIA `lastfmsetup`.
11. `discovery` - `mode` `query` `user (o)`
    - Aliases : N/A
    - Shows when you discovered a  certain Artist/Album/Song
