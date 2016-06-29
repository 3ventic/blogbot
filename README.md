# Blog Bot

Monitor Medium (and other compatible) blog feeds and post new posts on Discord. [Add it to a server](https://discordapp.com/oauth2/authorize?client_id=197560356422418432&scope=bot&permissions=19456)

## Usage

If you have the "Manage Channel" permission, you can enable this on the channel by using !addfeed https://url-to-the/feed/. See !help for other commands.

## Running your own instance

Clone the repo, `npm install`, set environment variables CLIENTID and TOKEN (bot access token), and optionally PREFIX (command prefix, default !) and GAME (for the "playing" text) and run bot.js