//LIBRARIES
const SteamUser = require("steam-user"),
    fs = require("fs"),
    express = require("express"),
    bodyParser = require("body-parser"),
    proc = require("child_process"),
    path = require("path"),
    Zip = require("node-7z"),
    ps = require("ps-node"),
    Openload = require("node-openload"),
    util = require("util");

//DATA
const config = {
    app: {
        host: "piratepowered.ga",
        port: 666,
        running: false,
        backupinterval: 21600000,
        steamcmd_path: __dirname,
        public_path: __dirname + "/www",
        html_path: __dirname + "/www/main.html",
        translation_path: __dirname + "/www/translation.json",
        archive_path: __dirname + "/archives",
        logging_path: __dirname + "/piratepowered.log",
        database_path: __dirname + "/db.json",
        credits_path: __dirname + "/PiratePowered.url",
        archive_options: {
            p: "piratepowered",
			m0: "=lzma2",
            mmt: "=4",
            mx: "=1",
			v: "1g",
        }
    },
    steamcred: {
        accountName : "YOUR_STEAM_USERNAME_HERE",
        password : "YOUR_STEAM_PASSWORD_HERE",
        logonID: Date.now(),
        rememberPassword: true,
        autoRelogin: true
    },
    openload: {
        api_login: "YOUR_OPENLOAD_LOGIN_HERE",
        api_key: "YOUR_OPENLOAD_KEY_HERE",
    }
};
var database = JSON.parse(fs.readFileSync(path.join(config.app.database_path), "utf8"));

//LOG
if (fs.existsSync(path.join(config.app.logging_path))) {
	fs.renameSync(path.join(config.app.logging_path), path.join(__dirname + "/oldlogs/" + Date.now() + ".log"));
}
var logStream = fs.createWriteStream(path.join(config.app.logging_path), {"flags": "a"});
var log = console.log;
console.log = function() {
    var first_parameter = arguments[0];
    var other_parameters = Array.prototype.slice.call(arguments, 1);
    function formatConsoleDate(date) {
        var day = date.getDate();
        var month = date.getMonth() + 1;
        var year = date.getFullYear();
        var hour = date.getHours();
        var minutes = date.getMinutes();
        var seconds = date.getSeconds();
        var milliseconds = date.getMilliseconds();
        return "[" +
        ((day < 10) ? "0" + day : day) +
        "-" +
        ((month < 10) ? "0" + month : month) +
        "-" +
        ((year < 10) ? "0" + year : year) +
        " " +
        ((hour < 10) ? "0" + hour : hour) +
        ":" +
        ((minutes < 10) ? "0" + minutes : minutes) +
        ":" +
        ((seconds < 10) ? "0" + seconds : seconds) +
        "." +
        ("00" + milliseconds).slice(-3) +
        "]";
    }
    var tolog = [formatConsoleDate(new Date()), first_parameter].concat(other_parameters);
    var str = "";
    tolog.forEach(function(arg) {
        str += (typeof arg === "string" ? arg : util.inspect(arg, false, null)) + " ";
    });
    str.slice(0, -1);
    logStream.write(str + "\r\n");
    log.apply(console, [str]);
};

// WORKAROUNDS & MAINTENANCE

// Reset votes
setInterval(function() { 
    for (var appid in database.votes) {
        database.votes[appid].enabled = true;
    }
}, 604800000); // every week

// Cleanup and restart bot 
setInterval(function() {
    deleteFolderSync(config.app.archive_path);
    deleteFolderSync(__dirname + "/steamapps");
    process.exit();
}, 432000000); // every 5 days

//INSTANCES
var client = new SteamUser({
    promptSteamGuardCode: false,
    enablePicsCache: true
}), archive = new Zip(),
    ol = Openload(config.openload), 
    bot = express();

//START
var globalStatus = "Initializing..."
console.log(globalStatus);
client.logOn(config.steamcred);
bot.use(bodyParser.json());
bot.use(express.static(config.app.public_path, { maxAge: 86400000 }));
bot.use(bodyParser.urlencoded({
    extended: true
}));
bot.disable("x-powered-by");

//WEBSITE
bot.use(function(req, res, next) {
    var ip = getIp(req);
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noodp, notranslate, noimageindex");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Strict-Transport-Security", "max-age: 15552000; includeSubDomains");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    if (req.body.action !== "status") {
        console.log("[" + ip + "] " + req.method + " " + req.originalUrl, Object.keys(req.body).length > 0 ? req.body : (Object.keys(req.query).length > 0  ? req.query :  ""));
    }
    if (req.headers.host === config.app.host) {
        res.setHeader("Content-Security-Policy", "script-src 'unsafe-inline' 'self' ajax.googleapis.com cdnjs.cloudflare.com; connect-src 'self'; img-src 'unsafe-inline' 'self' steamcdn-a.akamaihd.net steamstore-a.akamaihd.net; style-src 'unsafe-inline' 'self' steamstore-a.akamaihd.net");
        next();
    } else {
        res.send("FUCK OFF");
    }
}).get("/", function(req, res) {
    var ip = getIp(req);
    var mode = req.query.hasOwnProperty("mode") ? req.query.mode.toLowerCase() : "";
    var count = req.query.hasOwnProperty("count") ? parseInt(req.query.count) : 100;
    var page = req.query.hasOwnProperty("page") ? parseInt(req.query.page) : 1;
    var search = req.query.hasOwnProperty("search") ? req.query.search.toLowerCase() : "";
    var table = "", keys = [];
    if (mode === "download") {
        keys = Object.keys(database.downloads);
    } else {
        if (search === "") {
            keys = Object.keys(database.appinfos);
        } else {
            for (appid in database.appinfos) {
                var bool = false;
                bool = bool || appid.toString().indexOf(search.trim()) > -1;
                bool = bool || (database.appinfos[appid].hasOwnProperty("common") ? JSON.stringify(database.appinfos[appid].common).toLowerCase().indexOf(search) > -1: false);
                bool = bool || (database.appinfos[appid].hasOwnProperty("extended") && database.appinfos[appid].extended.hasOwnProperty("developer") ? JSON.stringify(database.appinfos[appid].extended.developer).toLowerCase().indexOf(search) > -1: false);
                bool = bool || (database.appinfos[appid].hasOwnProperty("extended") && database.appinfos[appid].extended.hasOwnProperty("publisher") ? JSON.stringify(database.appinfos[appid].extended.publisher).toLowerCase().indexOf(search) > -1: false);
                if (bool) {
                    keys.push(appid);
                }
            }
        }
    }
    keys.reverse();
    for (var i = (page - 1) * count; i < (page * count) && i < keys.length; i++) {
        var appid = keys[i];
        if (database.blacklist.indexOf(parseInt(appid)) === -1 && database.appinfos.hasOwnProperty(appid)) {
            var picture = "<img width=\"120\" height=\"45\" data-original=\"//steamcdn-a.akamaihd.net/steam/apps/" + appid + "/capsule_sm_120.jpg\" onerror=\"this.onerror=null;this.src='/applogo.gif';\"></img>";
            var name = database.appinfos[appid].hasOwnProperty("common") && database.appinfos[appid].common.hasOwnProperty("name") ? database.appinfos[appid].common.name : "<i>%%UNKNOWN%%</i>";
            var developer = database.appinfos[appid].hasOwnProperty("extended") && database.appinfos[appid].extended.hasOwnProperty("developer") ? database.appinfos[appid].extended.developer : "";
            var publisher = database.appinfos[appid].hasOwnProperty("extended") && database.appinfos[appid].extended.hasOwnProperty("publisher")? database.appinfos[appid].extended.publisher : "";
            var rating = database.appinfos[appid].hasOwnProperty("common") && database.appinfos[appid].common.hasOwnProperty("metacritic_score") ? "<a target=\"_blank\" href=\"" + database.appinfos[appid].common.metacritic_fullurl + "\">" + database.appinfos[appid].common.metacritic_score + "/100</a>" : "<i>%%UNKNOWN%%</i>";
            var links = "<ul><li><a target=\"_blank\" href=\"//store.steampowered.com/app/" + appid + "/\">%%STEAMSTORE%%</a></li>";
            links += "<li><a target=\"_blank\" href=\"//steamcommunity.com/app/" + appid + "/\">%%STEAMCOMMUNITY%%</a></li>";
            links += "<li><a target=\"_blank\" href=\"https://steamdb.info/app/" + appid + "/\">%%STEAMDB%%</a></li>";
            links += database.appinfos[appid].hasOwnProperty("extended") && database.appinfos[appid].extended.hasOwnProperty("homepage") ? "<li><a target=\"_blank\" href=\"" + database.appinfos[appid].extended.homepage + "\">%%HOMEPAGE%%</a></li>" : "";
            links += database.appinfos[appid].hasOwnProperty("extended") && database.appinfos[appid].extended.hasOwnProperty("developer_url") ? "<li><a target=\"_blank\" href=\"" + database.appinfos[appid].extended.developer_url + "\">%%DEVELOPERPAGE%%</a></li>" : "";
            links += "</ul>";
            var download = "";
            if (database.downloads.hasOwnProperty(appid)) {
                download = `<div class="dselect_container" onclick="$(this).find('ul').toggleClass('dropdownvisible dropdownhidden')">
                        <a class="trigger" style="max-width: 72px;">%%REQUESTLINK%%</a>
                        <div class="dropcontainer" style="position: absolute; width: 600px; margin-left: -490px;">
                            <ul class="dropdownhidden">`;
                var ds = "";
                for (date in database.downloads[appid]) {
                    database.downloads[appid][date].reverse().forEach(function(link, index) {
                        ds = `<li>
                                    <a class="inactive_selection" tabindex="99999" href="javascript:void(0)" onclick="downloadFile(this, ` + index + `, ` + date + `, ` + appid + `)" onmouseover="$(this).toggleClass('highlighted_selection inactive_selection')" onmouseleave="$(this).toggleClass('highlighted_selection inactive_selection')" >` + link.split("/").slice(-1)[0] + `</a>
                                </li>` + ds;
                    });
                }
                download += ds + `</ul></div>`;
            }
            var btn = " <button class=\"btnv6_blue_hoverfade\" title=\"%%VOTEHELP%%\" data-appid=\"" + appid + "\" type=\"button\" name=\"vote\" style=\"cursor: help;\"><h2>+</h2></button>";
            var vote = "<h2 id=\"votes_" + appid + "\">0" + btn;
            if (database.votes.hasOwnProperty(appid) && database.votes[appid].hasOwnProperty("count")) {
                vote = "<h2 id=\"votes_" + appid + "\">" + database.votes[appid].count;
                if ((!database.votes[appid].hasOwnProperty("ips") || !database.votes[appid].ips.includes(ip)) && (!database.votes[appid].hasOwnProperty("enabled") || database.votes[appid].enabled)) {
                    vote += btn;
                }
            }
            vote += "</h2>";
            table += "<tr id=\"row_" + appid + "\">" +
                     "<td>" + picture + "</td>" +
                     "<td style=\"font-size: 10px; color: #717c84; width: 20px;\">" + appid + "</td>" +
                     "<td>" + name + "</td>" +
                     "<td>" + developer + "</td>" +
                     "<td>" + publisher + "</td>" +
                     "<td>" + rating + "</td>" +
                     "<td>" + links + "</td>" +
                     "<td>" + download + "</td>" +
                     "<td nowrap>" + vote + "</td>" +
                     "</tr>";
        }
    }
	var lang = req.query.hasOwnProperty("lang") ? req.query.lang.toLowerCase() : "en";
    if (req.query.hasOwnProperty("format") && req.query.format.toLowerCase() === "json") {
        res.writeHead(200, {
            "Content-Type": "application/json"
        });
        var response = {
            success: false,
            data: null,
            message: null
        };
		fs.readFile(path.join(config.app.translation_path), function(error, data) {
			if (error) {
				console.log(error);
				response.message = "Failed to read translations";
			} else {
				try {
					var translation = JSON.parse(data.toString());
					if (translation.languagecodes.includes(lang)) {
						delete translation.languagecodes;
						for (tag in translation) {
							var rgx = new RegExp("%%" + tag.toUpperCase() + "%%", "g");
							var replacement = translation[tag].hasOwnProperty(lang) ? translation[tag][lang] : (translation[tag].hasOwnProperty("en") ? translation[tag].en : "");
							table = table.replace(rgx, replacement);
						}
						response.success = true;
						response.data = table;
					} else {
						response.message = "Unknown language";
					}
				} catch(error) {
					console.log(error);
					response.message = "Failed to process translations";
				}
			}
			res.end(JSON.stringify(response));
		});
    } else {
        fs.readFile(path.join(config.app.html_path), function(error, data) {
            if (error) console.log(error);
            var html = data.toString().replace("%%TABLE%%", table).replace("%%STATUS%%", globalStatus).replace("%%TOTAL%%", Object.keys(database.appinfos).length).replace("%%DLTOTAL%%", Object.keys(database.downloads).length).replace("%%LANG%%", lang);
            fs.readFile(path.join(config.app.translation_path), function(error, data) {
                if (error) console.log(error);
                try {
                    var translation = JSON.parse(data.toString());
                    if (translation.languagecodes.includes(lang)) {
                        delete translation.languagecodes;
                        for (tag in translation) {
                            var rgx = new RegExp("%%" + tag.toUpperCase() + "%%", "g");
                            var replacement = translation[tag].hasOwnProperty(lang) ? translation[tag][lang] : (translation[tag].hasOwnProperty("en") ? translation[tag].en : "");
                            html = html.replace(rgx, replacement);
                        }
                        res.send(html);
                    } else {
                        res.send("An error has occured and has been logged.");
                    }
                } catch(error) {
                    console.log(error);
                    res.send("An error has occured and has been logged.");
                }
            });
        });
    }
}).post("/", function(req, res) {
    var ip = getIp(req);
    res.writeHead(200, {
        "Content-Type": "application/json"
    });
    var response = {
        success: false,
        data: null,
        message: null
    };
    if (req.body.hasOwnProperty("action")) {  
        if (req.body.hasOwnProperty("appid")) {
            var appid = req.body.appid;
            if (database.votes.hasOwnProperty(appid)) {
                if (req.body.action.toLowerCase() === "vote") {
                    if (!database.votes[appid].hasOwnProperty("enabled") || database.votes[appid].enabled) {
                        if (!database.votes[appid].hasOwnProperty("count")) {
                            database.votes[appid].count = 0;
                        }
                        if (!database.votes[appid].hasOwnProperty("ips")) {
                            database.votes[appid].ips = [];
                        }
                        if (!database.votes[appid].hasOwnProperty("enabled")) {
                            database.votes[appid].enabled = true;
                        }
                        if (database.votes[appid].ips.indexOf(ip) === -1) {
                            database.votes[appid].count++;
                            database.votes[appid].ips.push(ip);
                            updateDatabase();
                            response.success = true;
                            response.message = "Successfully voted";
                        } else {
                            response.message = "Already voted";
                        }
                    } else {
                        response.message = "Voting is not enabled for this game. Please wait for the game to get updated.";
                    }
                } else if (req.body.action.toLowerCase() === "download") {
                    if (req.body.hasOwnProperty("date")) {
                        if (req.body.hasOwnProperty("index")) {
                            var date = req.body.date;
                            var index = parseInt(req.body.index);
                            if (database.downloads.hasOwnProperty(appid) && database.downloads[appid].hasOwnProperty(date) && database.downloads[appid][date].hasOwnProperty(index)) {
                                response.success = true;
                                response.data = database.downloads[appid][date][index];
                            } else {
                                response.message = "Sorry, the download you requested doesn't exist.";
                            }
                        } else {
                            response.message = "Request parameter 'index' missing";
                        }
                    } else {
                        response.message = "Request parameter 'date' missing";
                    }
                }
            } else {
                response.message = "Illegal appid";
            }
        } else if (req.body.action.toLowerCase() === "status") {
            response.success = true;
            response.data = globalStatus;
        } else {
            response.message = "Request parameter 'appid' missing";
        }
    } else {
        response.message = "Request parameter(s) missing";
    }
    if (req.body.action !== "status") {
        console.log(response);
    }
    res.end(JSON.stringify(response));
}).get("/admin", function(req, res) {
    if (req.query.hasOwnProperty("key") && req.query.hasOwnProperty("action") && req.query.key.trim() === "GH8316IBE53CDA78A7E1H3DAGAB049HF5E0ED3E" && req.query.action === "log") {
        res.sendFile(path.join(config.app.logging_path));
    } else {
        res.redirect("/");
    }
}).post("/admin", function(req, res) {
    res.writeHead(200, {
        "Content-Type": "application/json"
    });
    if (req.body.hasOwnProperty("key") && req.body.hasOwnProperty("action") && req.body.key.trim() === "GH8316IBE53CDA78A7E1H3DAGAB049HF5E0ED3E" && req.body.hasOwnProperty("appid")) {
        if (req.body.action === "delblacklist") {
            delete database.blacklist[database.blacklist.indexOf(parseInt(req.body.appid))];
        } else if (req.body.action === "addblacklist") {
            database.blacklist.push(parseInt(req.body.appid));
        }
        updateDatabase();
        res.end("{\"success\":true}");
    } else {
        res.end("{\"success\":false}");
    }
}).listen(config.app.port, function() {
    console.log("Server listening at port " + config.app.port);
});

//STEAM
client.on("loggedOn", function() {
    console.log("Logged into Steam as " + client.steamID.getSteam3RenderedID());
}).on("appOwnershipCached", function() {
    console.log("Cached app ownership. Updating database...");
    var appids = client.getOwnedApps();
    console.log("Our account owns " + appids.length + " app" + (appids.length == 1 ? "" : "s") + ".");
    let total = appids.length;
    console.log("Getting appinfo of " + total + " app" + (total == 1 ? "" : "s") + "...");
    setTimeout(function() {
        client.getProductInfo(appids, [], function(apps) {
            console.log("Got appinfo from " + Object.keys(apps).length + "/" + total + " app" + (total == 1 ? "" : "s") + ".");
            var tokenlessAppids = [];
            console.log(Object.keys(database.appinfos).length + " Apps cached. Processing appinfos...");
            for (appid in apps) {
                if (!database.appinfos.hasOwnProperty(appid) || database.appinfos[appid].changenumber < apps[appid].changenumber) {
                    if (apps[appid].missingToken) {
                        tokenlessAppids.push(parseInt(appid));
                    } else {
                        if (apps[appid].appinfo.common.type.toLowerCase() === "game" &&
                        (apps[appid].appinfo.hasOwnProperty("common") && (!apps[appid].appinfo.common.hasOwnProperty("releasestate") || /^release(d)?$/g.test(apps[appid].appinfo.common.releasestate.toLowerCase())))) {
                            console.log("Processing appinfo " + (Object.keys(apps).indexOf(appid) + 1) + "/" + Object.keys(apps).length + " (" + appid + ")");
                            if (!database.votes.hasOwnProperty(appid)) {
                                database.votes[appid] = { count: 0, ips: [], enabled: (Object.keys(database.downloads).indexOf(appid) === -1) };
                            } else if (apps[appid].appinfo.hasOwnProperty("depots") &&
                            apps[appid].appinfo.depots.hasOwnProperty("branches") &&
                            apps[appid].appinfo.depots.branches.hasOwnProperty("public") &&
                            apps[appid].appinfo.depots.branches.public.hasOwnProperty("buildid") &&
                            parseInt(apps[appid].appinfo.depots.branches.public.buildid) > parseInt(database.appinfos[appid].depots.branches.public.buildid)) {
                                console.log("Depot(s) updated for '" + appid + "'. Enabling voting...");
                                database.votes[appid].enabled = true;
                            }
                            apps[appid].appinfo.changenumber = apps[appid].changenumber;
                            database.appinfos[appid] = apps[appid].appinfo;
                        }
                    }
                }
            }
            updateDatabase();
            console.log("Requesting access token" + (tokenlessAppids.length == 1 ? "" : "s") + " for " + tokenlessAppids.length + " app" + (tokenlessAppids.length == 1 ? "" : "s") + "...");
            if (tokenlessAppids.length > 0) {
                client.getProductAccessToken(tokenlessAppids, [], function(tokens) {
                    var tokenAppids = [];
                    for (appid in tokens) {
                        tokenAppids.push({appid: parseInt(appid), access_token: tokens[appid]})
                    }
                    client.getProductInfo(tokenAppids, [], function(tokenApps) {
                        console.log("Processing appinfos with tokens...");
                        for (appid in tokenApps) {
                            if (tokenApps[appid].appinfo.common.type.toLowerCase() === "game" &&
                            (!database.appinfos.hasOwnProperty(appid) || database.appinfos[appid].changenumber < tokenApps[appid].changenumber) &&
                            (tokenApps[appid].appinfo.hasOwnProperty("common") && (!tokenApps[appid].appinfo.common.hasOwnProperty("releasestate") ||
                            /^release(d)?$/g.test(tokenApps[appid].appinfo.common.releasestate.toLowerCase())))) {
                                console.log("Processing appinfo with token " + (Object.keys(tokenApps).indexOf(appid) + 1) + "/" + Object.keys(tokenApps).length + " (" + appid + ")");
                                if (!database.votes.hasOwnProperty(appid)) {
                                    database.votes[appid] = { count: 0, ips: [], enabled: (Object.keys(database.downloads).indexOf(appid) === -1) };
                                } else if (tokenApps[appid].appinfo.hasOwnProperty("depots") &&
                                tokenApps[appid].appinfo.depots.hasOwnProperty("branches") &&
                                tokenApps[appid].appinfo.depots.branches.hasOwnProperty("public") &&
                                tokenApps[appid].appinfo.depots.branches.public.hasOwnProperty("buildid") &&
                                parseInt(tokenApps[appid].appinfo.depots.branches.public.buildid) > parseInt(database.appinfos[appid].depots.branches.public.buildid)) {
                                    console.log("Depot(s) updated for '" + appid + "'. Enabling voting...");
                                    database.votes[appid].enabled = true;
                                }
                                tokenApps[appid].appinfo.changenumber = tokenApps[appid].changenumber;
                                database.appinfos[appid] = tokenApps[appid].appinfo;
                            }
                        }
                        updateDatabase();
                        console.log("Got appinfo for " + total + " app" + (total == 1 ? "" : "s") + ".");
                        console.log("Database updated.");
                    });
                });
            } else {
                console.log("Got appinfo for " + total + " app" + (total == 1 ? "" : "s") + ".");
                globalStatus = "Database updated. " + prevstatus;
                console.log(globalStatus);
            }
        });
    }, 0);
}).on("error", function(e) {
    console.log(e);
    if (e.EResult == SteamUser.EResult.RateLimitExceeded) {
        globalStatus = "Failed to login into Steam.";
        console.log(globalStatus);
        //Could cause issues?
        config.app.running = true;
        setTimeout(function() {
            config.app.running = false;
        }, 2400000);
    }
});

//APP
//Dirty fix: wait 1 minute before logging into steamcmd to try to avoid auth code mismatch.
config.app.running = true;
setTimeout(function() {
    config.app.running = false;
}, 60000);
var apploop = setInterval(function() {
    //console.log("App running: " + config.app.running);
    if (!config.app.running) app();
}, 5000);

function app() {
    config.app.running = true;
    ps.lookup({ command: "steamcmd", psargs: "ux" }, function(err, resultList) {
        if (err) {
            console.log(err);
            config.app.running = false;
        } else if (resultList.length === 0) {
            var consideredVotes = JSON.parse(JSON.stringify(database.votes));
            for (appid in database.downloads) {
                if (consideredVotes.hasOwnProperty(appid) && ((consideredVotes.hasOwnProperty("enabled") && !consideredVotes.enabled) || (consideredVotes[appid].hasOwnProperty("count") && consideredVotes[appid].count === 0))) {
                    delete consideredVotes[appid];
                }
            }
            var appid = maxVal(consideredVotes, "count");
            var login = config.steamcred.accountName + " \"" + config.steamcred.password + "\"";
            var args = ["+login " + login, "+app_update " + appid + " -language english", "+quit"];
            var steamcmd = proc.spawn(config.app.steamcmd_path + "/steamcmd.exe", args);
            var allData = "";
            steamcmd.stdout.on("data", function (data) {
                allData = allData.concat(data);
                var lines = allData.split("\n");
                if (lines.length > 1) {
                    var status = lines.shift();
                    allData = lines.join("\n");
                    if (status.trim().length > 0) {
                        console.log("AppID " + appid + ": " + status.trim());
                        if (status.toLowerCase().indexOf("update state") > -1 && status.toLowerCase().indexOf("Logging in user") === -1) {
                            globalStatus = "AppID " + appid + ": " + status.trim();
                        }
                    }
                }
            });
            steamcmd.on("exit", function(code) {
                console.log("SteamCMD exited with code " + code);
                if (code === 0) {
                    var acffile = config.app.steamcmd_path + "/steamapps/appmanifest_" + appid + ".acf";
                    fs.readFile(acffile, function(err, data) {
                        if (err) console.log(err);
                        var acf = data.toString().split("\n").filter(function(line) { return line.toLowerCase().indexOf("\"lastowner\"") === -1 && line.toLowerCase().indexOf("\"userid\"") === -1; }).join("\n");
                        fs.writeFile(acffile, acf, function(err) {
                            if (err) return console.log(err);
                        });
                        var manifests = [];
                        try {
                            acf = JSON.parse("{" + acf.replace(/\r|\t/g, "").replace(/""/g, "\":\"").replace(/\n/g, "").replace(/""/g, "\",\"").replace(/}"/g, "},\"").replace(/"{/g, "\":{") + "}");
                            for (id in acf.AppState.MountedDepots) {
                                manifests.push(config.app.steamcmd_path + "/depotcache/" + id + "_" + acf.AppState.MountedDepots[id] + ".manifest")
                            }
                        } catch(e) {
                            console.log(e);
                        }
                        var dir;
                        if (acf.hasOwnProperty("AppState") && acf.AppState.hasOwnProperty("installdir")) {
                            dir = acf.AppState.installdir;
                        } else if (database.appinfos[appid].hasOwnProperty("config") && database.appinfos[appid].config.hasOwnProperty("installdir")) {
                            dir = database.appinfos[appid].config.installdir;
                        } else if (JSON.stringify(acf).replace(/\t|\n|\r/g, "").match(/installdir""[^"]+/g)) {
                            dir = JSON.stringify(acf).replace(/\t|\n|\r/g, "").match(/installdir""[^"]+/g)[0].replace("installdir\"\"", "");
                        } else {
                            dir = "";
                        }
                        dir = dir
                            // .replace(/\%/g, "%%")
                            // .replace(/\^/g, "^^")
                            // .replace(/\&/g, "^&")
                            // .replace(/\</g, "^<")
                            // .replace(/\>/g, "^>")
                            // .replace(/\|/g, "^|")
                            // .replace(/\'/g, "^'")
                            // .replace(/\`/g, "^`")
                            // .replace(/\,/g, "^,")
                            // .replace(/\;/g, "^;")
                            // .replace(/\=/g, "^=")
                            // .replace(/\(/g, "^(")
                            // .replace(/\)/g, "^)")
                            // .replace(/\!/g, "^^!")
                            // .replace(/\"/g, "\"\"")
                            // .replace(/\\/g, "\\\\")
                            // .replace(/\[/g, "\\[")
                            // .replace(/\]/g, "\\]")
                            // .replace(/\"/g, "\\\"")
                            // .replace(/\./g, "\\.")
                            // .replace(/\*/g, "\*")
                            // .replace(/\?/g, "\\?")
                        var installdir = config.app.steamcmd_path + "/steamapps/common/" + dir.trim();
                        var date = dateString(new Date());
                        var name;
                        if (acf.hasOwnProperty("AppState") && acf.AppState.hasOwnProperty("name")) {
                            name = acf.AppState.name;
                        } else if (database.appinfos[appid].hasOwnProperty("config") && database.appinfos[appid].config.hasOwnProperty("name")) {
                            name = database.appinfos[appid].config.name;
                        } else if (JSON.stringify(acf).replace(/\t|\n|\r/g, "").match(/name""[^"]+/g)) {
                            name = JSON.stringify(acf).replace(/\t|\n|\r/g, "").match(/name""[^"]+/g)[0].replace("name\"\"", "");
                        } else {
                            name = dir.trim();
                        }
                        var depotcache = [acffile].concat(manifests);
                        var packs = [{
                            name: "depotcache",
                            contents: depotcache
                        }, {
                            name: "installdir",
                            contents: [installdir]
                        }];
                        var pack = packs.shift();
                        doarchivecheck(pack);
                        function doarchivecheck(pack) {
                            var contents_ok = true;
                            var current = 0;
                            pack.contents.forEach(function(stat) {
                                fs.stat(stat, function(error){
                                    current++;
                                    if (error) {
                                        contents_ok = false;
                                    }
                                    if (current === pack.contents.length) {
                                        if (contents_ok) {
                                            doarchive(pack);
                                        } else {
                                            globalStatus = "Unable to archive AppID " + appid + ". Continuing with next game...";
                                            console.log(globalStatus)
                                            delete database.votes[appid];
                                            delete database.appinfos[appid];
                                            config.app.running = false;
                                        }
                                    }
                                });
                            });
                        }
                        function doarchive(pack) {
                            let zipname = name.replace(/[^a-zA-Z0-9\- ]/g, "").replace(/ |\-/g, ".").replace(/\.(\.)+/g, ".").replace(/\.$|^\./g, "") + ".V" + date;
                            if (pack.name === "installdir") {
                                zipname += ".Steam.RiP";
                            } else if (pack.name === "depotcache") {
                                zipname += ".Depotcache";
                            }
                            zipname += "-PiratePowered.7z";
                            console.log("Creating " + zipname + "...");
                            globalStatus = "Creating " + zipname + "...";
                            archive.add(config.app.archive_path + "/" + zipname, pack.contents.concat([config.app.credits_path]), config.app.archive_options).progress(function(log) {
                                console.log(log);
                            }).then(function() {
                                console.log("Archive " + zipname + " created!");
                                globalStatus = "Archive " + zipname + " created!";
                                if (packs.length === 0) {
                                    var args = ["+app_uninstall -complete " + appid, "+quit"];
                                    var steamcmd = proc.spawn(config.app.steamcmd_path + "/steamcmd.exe", args);
                                    var allData = "";
                                    steamcmd.stdout.on("data", function (data) {
                                        allData = allData.concat(data);
                                        var lines = allData.split("\n");
                                        if (lines.length > 1) {
                                            var status = lines.shift();
                                            allData = lines.join("\n");
                                            if (status.trim().length > 0) {
                                                console.log(status.trim());
                                            }
                                        }
                                    });
                                    steamcmd.on("exit", function(code) {
                                        console.log("SteamCMD exited with code " + code);
                                        if (pack.name === "depotcache") {
                                            depotcache.forEach(function(depotfile) {
                                                fs.unlink(depotfile, function(error) {
                                                    if (error) {
                                                        console.log(error);
                                                    }
                                                });
                                            });
                                        } else if (pack.name === "installdir") {
                                            setTimeout(function() {
                                                deleteFolderSync(installdir);
                                            }, 0);
                                        }
                                    });
                                }
                                fs.readdir(config.app.archive_path, function(error, files) {
                                    if (error) console.log(error);
                                    var toupload = [];
                                    files.sort().forEach(function(file) {
                                        if (file.indexOf(zipname) > -1) toupload.push(file);
                                    });
                                    let file = toupload.shift();
                                    function upload(file) {
                                        globalStatus = "Uploading " + file + "...";
                                        console.log(globalStatus);
                                        ol.upload({
                                            file: config.app.archive_path + "/" + file
                                        }).then(function(res) {
                                            if (res.status === 200) {
                                                globalStatus = "Successfully uploaded '" + file + "'.";
                                                console.log(globalStatus);
                                                var url = res.result.url;
                                                if (database.downloads.hasOwnProperty(appid)) {
                                                    if (database.downloads[appid].hasOwnProperty(date)) {
                                                        database.downloads[appid][date].push(url);
                                                    } else {
                                                        database.downloads[appid][date] = [url];
                                                    }
                                                } else {
                                                    var obj = {};
                                                    obj[date] = [url];
                                                    database.downloads[appid] = obj;
                                                }
                                                updateDatabase();
                                                fs.unlink(config.app.archive_path + "/" + file, function(error) {
                                                    if (error) {
                                                        console.log("Failed to delete '" + file + "': ", error);
                                                    } else {
                                                        console.log("Successfully deleted '" + file + "'.");
                                                    }
                                                    if (toupload.length === 0) {
                                                        if (packs.length === 0) {
                                                            globalStatus = "Successfully uploaded all files. Continuing with next game...";
                                                            console.log(globalStatus);
                                                            database.votes[appid].count = 0;
                                                            database.votes[appid].ips = [];
                                                            database.votes[appid].enabled = false;
                                                            updateDatabase();
                                                            config.app.running = false;
                                                        } else {
                                                            pack = packs.shift();
                                                            doarchivecheck(pack);
                                                        }
                                                    } else {
                                                        upload(toupload.shift());
                                                    }
                                                });
                                            } else {
                                                globalStatus = "Failed to upload '" + file + "'. Waiting 1 minute to retry.";
                                                console.log(globalStatus + ": ", res.error);
                                                setTimeout(function() {
                                                    upload(file);
                                                }, 60000);
                                            }
                                        });
                                    }
                                    upload(file);
                                });
                            }).catch(function(error) {
                                globalStatus = "Failed to create archive '" + zipname + "'. Waiting 1 minute to retry.";
                                console.log(globalStatus + ": ", error);
                                fs.readdir(config.app.archive_path, function(error, files) {
                                    if (error) return console.log(error);
                                    files.forEach(function(file) {
                                        if (file.indexOf(zipname) > -1) {
                                            fs.unlink(config.app.archive_path + "/" + file, function(error) {
                                                if (error) {
                                                    console.log("Failed to delete '" + file + "': ", error);
                                                } else {
                                                    console.log("'" + file + "' deleted successfully.");
                                                }
                                            });
                                        }
                                    });
                                });
                                setTimeout(function() {
                                    doarchivecheck(pack);
                                }, 60000);
                            });
                        }
                    });
                } else if (code === 5) {
                    globalStatus = "Failed to login. Waiting 3 minutes to retry.";
                    console.log(globalStatus);
                    setTimeout(function() {
                        config.app.running = false;
                    }, 180000);
                } else if (code === 8) {
                    globalStatus = "Unable to download AppID " + appid + ". Continuing with next game...";
                    console.log(globalStatus)
                    delete database.votes[appid];
                    delete database.appinfos[appid];
                    config.app.running = false;
                } else {
                    globalStatus = "Unknown error occured. Waiting 5 minutes to retry.";
                    console.log(globalStatus);
                    setTimeout(function() {
                        config.app.running = false;
                    }, 300000);
                }
            });
        } else {
            config.app.running = false;
        }
    });
}

//FUNCTIONS
var backup = setInterval(function() {
    console.log("Backing up database...");
    fs.writeFile(path.join(__dirname + "/olddbs/" + Date.now() + ".json"), JSON.stringify(database, null, 4), "utf8", function(error) {
        if (error) {
            console.log("An error occurred during database backup procedure:", error, "Attempting to copy local database file instead...");
            try {
                fs.createReadStream(path.join(config.app.database_path)).pipe(fs.createWriteStream(path.join(__dirname + "/olddbs/" + Date.now() + ".json")));
            } catch(error) {
                console.log("Database backup failed!", error);
            }
        } else {
            console.log("Database backup success!");
        }
    });
}, config.app.backupinterval);

var updating = false;
function updateDatabase() {
    if (!updating) {
        updating = true;
        fs.writeFile(path.join(config.app.database_path), JSON.stringify(database, null, 4), "utf8", function(error) {
            if (error) console.log(error);
            updating = false;
        });
    }
}

function deleteFolderSync(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file,index){
      var curPath = path + "/" + file;
      if(fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderSync(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};

function getIp(req) {
    var ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
    if (ip.substr(0, 7) == "::ffff:") {
      ip = ip.substr(7)
    }
    return ip;
}

function maxVal(obj, key) {
    return Object.keys(obj).reduce(function(a, b){ return key ? (obj[a][key] > obj[b][key] ? a : b) : (obj[a] > obj[b] ? a : b) });
}

function dateString(date) {
    var month = "0" + (date.getMonth() + 1);
    var day = "0" + date.getDate();
    return date.getFullYear() + month.slice(-2) + day.slice(-2);
}