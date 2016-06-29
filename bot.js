var request = require('request').defaults({
    headers: {
        'User-Agent': 'blogbot/1.0 rss agent'
    }
});
var FeedParser = require('feedparser');
var Discord = require('discord.js');
var sqlite3 = require('sqlite3');
var db = new sqlite3.Database('history.db');

db.serialize(function () {
    db.run("CREATE TABLE IF NOT EXISTS history (url TEXT, post TEXT)");
    db.run("CREATE UNIQUE INDEX IF NOT EXISTS history_idx ON history (url, post)");
    db.run("CREATE TABLE IF NOT EXISTS lookups (channel TEXT, url TEXT)");
    db.run("CREATE UNIQUE INDEX IF NOT EXISTS lookups_idx ON lookups (channel, url)");
});

var invite = 'https://discordapp.com/oauth2/authorize?client_id=' + process.env.CLIENTID + '&scope=bot&permissions=19456';
var commandPrefix = process.env.PREFIX || '!';

var bot = new Discord.Client({
    autoReconnect: true
});

bot.on('ready', function () {
    bot.setStatus('online', process.env.GAME || '3v.fi/l/blogbot');
    checkBlogs();
});

bot.on('message', function (message) {
    // Allow only users with permission to manage the channel to interact with the bot.
    if (message.channel.permissionsOf(message.author).hasPermission('manageChannel')) {
        var words = message.cleanContent.match(/(?:[^\s"]+|"[^"]*")+/g);
        if (words[0].startsWith(commandPrefix)) {
            var command = words[0].substring(commandPrefix.length);
            words.shift();
            switch (command) {
                case 'help':
                    bot.reply(message, "**COMMAND PREFIX**: " + commandPrefix + "\r\n**COMMANDS**: addfeed <url>, removefeed <url>, listfeeds", { tts: false }, function (err) { if (err) errHandler(err) });
                    break;
                case 'addfeed':
                    if (/^https?:\/\/[^\s]+\/?$/.test(words[0])) {
                        db.run("INSERT INTO lookups (channel, url) VALUES (?, ?)", [message.channel.id, words[0].toLowerCase()], function (err) {
                            if (err) {
                                errHandler(err);
                                bot.reply(message, "failed to insert requested URL to the database", { tts: false }, function (err) { if (err) errHandler(err) });
                            } else {
                                bot.reply(message, "added", { tts: false }, function (err) { if (err) errHandler(err) });
                            }
                        });
                    } else {
                        bot.reply(message, "invalid URL", { tts: false }, function (err) { if (err) errHandler(err) });
                    }
                    break;
                case 'removefeed':
                    if (typeof words[0] === "string") {
                        db.run("DELETE FROM lookups WHERE channel = ? AND url = ?", [message.channel.id, words[0].toLowerCase()], function (err) {
                            if (err) {
                                errHandler(err);
                                bot.reply(message, "failed to remove from the DB", { tts: false }, function (err) { if (err) errHandler(err) });
                            } else {
                                bot.reply(message, "removed", { tts: false }, function (err) { if (err) errHandler(err) });
                            }
                        });
                    } else {
                        bot.reply(message, "please specify the feed URL to remove", { tts: false }, function (err) { if (err) errHandler(err) });
                    }
                    break;
                case 'listfeeds':
                    db.all("SELECT url FROM lookups WHERE channel = ?", [message.channel.id], function (err, rows) {
                        if (err) {
                            errHandler(err);
                            bot.reply(message, "an error occurred", { tts: false }, function (err) { if (err) errHandler(err) });
                        } else {
                            var urls = [];
                            rows.forEach(function (row) {
                                urls.push(row.url);
                            });
                            bot.reply(message, "`" + urls.join(", ") + "`", { tts: false }, function (err) { if (err) errHandler(err) });
                        }
                    });
                    break;
            }
        }
    }
});

bot.on('warn', function (warn) {
    console.error('WARN', warn);
});

function errHandler(error) {
    console.error('ERROR', error);
}

bot.on('error', errHandler);

bot.loginWithToken(process.env.TOKEN, function (error) {
    if (error) {
        console.error("Couldn't login: ", error);
        process.exit(15);
    }
});

var isRequesting = false;
var toRequest = [];

function requestBlogs(index) {
    isRequesting = true;
    if (!toRequest[index]) {
        toRequest = [];
        isRequesting = false;
        return;
    }
    db.all("SELECT post FROM history WHERE url = ?", [toRequest[index].url], function (err, rows) {
        if (err) {
            errHandler(err);
            requestBlogs(++index);
        } else {
            var posts = [];
            var posted = false;
            rows.forEach(function (row) {
                posts.push(row.post);
            });
            console.log("Requesting ", toRequest[index].url);
            var rss = new FeedParser();
            var req = request(toRequest[index].url);
            req.on('error', errHandler);
            rss.on('error', errHandler);
            req.on('response', function (res) {
                if (res.statusCode == 200) {
                    this.pipe(rss);
                }
            });
            rss.on('readable', function () {
                var stream = this, item;
                while (item = stream.read()) {
                    if (posted === false && item.link && posts.indexOf(item.link) < 0) {
                        posted = true;
                        db.run("INSERT INTO history (url, post) VALUES (?, ?)", [toRequest[index].url, item.link], function (err) { if (err) errHandler(err); });
                        toRequest[index].channels.forEach(function (channel) {
                            console.log("NEW POST", item.link);
                            bot.sendMessage(channel, "**NEW POST** " + item.link);
                        });
                    }
                }
            });
            rss.on('end', function () {
                requestBlogs(++index);
            });
        }
    });
}

function checkBlogs() {
    if (!isRequesting) {
        var channels = {};
        var url = "";
        db.each("SELECT * FROM lookups ORDER BY url", function (err, row) {
            if (err) {
                errHandler(err);
            } else if (row) {
                if (url != "" && row.url != url) {
                    toRequest.push({
                        channels: channels[url],
                        url: url
                    });
                }
                url = row.url;
                channels[url] = [];
                var channel = bot.channels.get("id", row.channel);
                if (channel) {
                    channels[url].push(channel);
                }
            }
        }, function () {
            if (url !== "") {
                toRequest.push({
                    channels: channels[url],
                    url: url
                });
            }
            console.log(toRequest);
            requestBlogs(0);
        });
    }
}
setInterval(checkBlogs, 30000);

process.on('SIGINT', function () {
    bot.logout(function () {
        process.exit(0);
    });
});